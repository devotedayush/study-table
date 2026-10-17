#!/usr/bin/env python3
"""Transcribe the scanned mock library into source-faithful native question content.

The script is deliberately resumable. It writes only ignored tmp/mock-import/native
cache files until every question has passed both vision stages, then atomically
updates the six imported paper.json files after validating identity and metadata.
"""
from __future__ import annotations

import argparse
import base64
import copy
import concurrent.futures
import hashlib
import json
import mimetypes
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAPERS = ROOT / "data" / "imported-mocks"
CACHE = ROOT / "tmp" / "mock-import" / "native"
MODEL = "gpt-6-luna"
BATCH_SIZE = 6
DEFAULT_CONCURRENCY = 6
MAX_OUTPUT_TOKENS = 18000
LOCK = threading.Lock()

BLOCK_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "type": {"type": "string", "enum": ["paragraph", "table", "math", "list"]},
        "text": {"type": "string"},
        "headers": {"type": "array", "items": {"type": "string"}},
        "rows": {"type": "array", "items": {"type": "array", "items": {"type": "string"}}},
        "items": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["type", "text", "headers", "rows", "items"],
}

TRANSCRIPTION_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "id": {"type": "string"},
            "blocks": {"type": "array", "items": BLOCK_SCHEMA},
            "options": {"type": "array", "items": {"type": "string"}},
            "notes": {"type": "array", "items": {"type": "string"}},
        }, "required": ["id", "blocks", "options", "notes"],
    }}}, "required": ["items"],
}

REVIEW_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {"items": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "id": {"type": "string"},
            "blocks": {"type": "array", "items": BLOCK_SCHEMA},
            "options": {"type": "array", "items": {"type": "string"}},
            "status": {"type": "string", "enum": ["checked", "needs_review"]},
            "notes": {"type": "array", "items": {"type": "string"}},
        }, "required": ["id", "blocks", "options", "status", "notes"],
    }}}, "required": ["items"],
}


def load_env_key() -> str:
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        return key
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("OPENAI_API_KEY="):
                key = line.split("=", 1)[1].strip().strip("'\"")
                if key:
                    return key
    raise RuntimeError("OPENAI_API_KEY was not found in the environment or .env.local")


def load_papers():
    papers = []
    for index in range(1, 7):
        path = PAPERS / f"mock-{index}" / "paper.json"
        data = json.loads(path.read_text())
        papers.append((path, data))
    return papers


def flatten_questions(papers):
    result = []
    for path, paper in papers:
        for question in paper["questions"]:
            result.append((path, paper, question))
    return result


def asset_paths(question):
    urls = question.get("sourceAssetUrls") or ([question["sourceAssetUrl"]] if question.get("sourceAssetUrl") else [])
    paths = []
    for url in urls:
        match = re.fullmatch(r"/api/mocks/(mock-[1-6])/assets/([^/]+)", url)
        if not match:
            raise ValueError(f"Unsupported source asset URL for {question['id']}: {url}")
        path = PAPERS / match.group(1) / "assets" / match.group(2)
        if not path.is_file():
            raise FileNotFoundError(f"Missing source image for {question['id']}: {path}")
        paths.append(path)
    if not paths:
        raise ValueError(f"No source images for {question['id']}")
    return paths


def fingerprint(question):
    digest = hashlib.sha256()
    for path in asset_paths(question):
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    digest.update(question["id"].encode())
    return digest.hexdigest()


def save_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n")
    os.replace(tmp_path, path)


def load_json(path):
    return json.loads(path.read_text()) if path.exists() else None


def cache_path(stage, question_id):
    return CACHE / stage / f"{question_id}.json"


def get_cached(stage, question):
    path = cache_path(stage, question["id"])
    item = load_json(path)
    if item and item.get("source_fingerprint") == fingerprint(question):
        if stage == "review" and item.get("candidate_fingerprint") == hashlib.sha256(
            json.dumps(item.get("candidate"), sort_keys=True, ensure_ascii=False).encode()
        ).hexdigest():
            return item
        if stage == "transcription":
            return item
    return None


def load_question_images(question):
    parts = []
    for n, path in enumerate(asset_paths(question), start=1):
        mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        parts.append({"type": "input_text", "text": f"Source image {n} for {question['id']} (inspect the entire crop):"})
        parts.append({"type": "input_image", "image_url": f"data:{mime};base64,{encoded}", "detail": "high"})
    return parts


def response_text(response):
    if response.get("status") != "completed":
        raise RuntimeError(f"Responses API returned status {response.get('status')!r}")
    for output in response.get("output", []):
        if output.get("type") == "message":
            for part in output.get("content", []):
                if part.get("type") == "refusal":
                    raise RuntimeError("Model refused a transcription batch")
                if part.get("type") == "output_text":
                    return part["text"]
    raise RuntimeError("Responses API returned no output text")


def call_responses(api_key, stage, batch, candidates=None):
    if stage == "transcription":
        instructions = (
            "Transcribe CFA exam question images faithfully into native text blocks and answer options. "
            "The images are the source of truth. Any supplied OCR text is noisy and is only a search hint. "
            "Read every visible line; ignore page borders, watermarks, neighboring-page bleed, and printed headings like Question 63. "
            "Do not solve, explain, modernize, paraphrase, correct, or improve anything. Preserve wording, capitalization, punctuation, "
            "numbers, units, symbols, labels, and printed order. Put prose in paragraph blocks, actual grids in table blocks with "
            "every row and column preserved, standalone equations in math blocks with raw LaTeX, and real enumerations in list blocks. "
            "For each block, populate only fields used by its type: paragraph and math use text only; table uses text, headers and rows; "
            "list uses items only. Every unused field must be an empty string or empty array. "
            "Use inline LaTeX delimiters \\( ... \\) for formulas inside prose/options/table cells. Include captions only when printed. "
            "Options must reproduce visible option text without A./B./C. prefixes and in order. Do not put options in blocks. "
            "If any text, symbol, table cell, or option cannot be read confidently, preserve readable content and add a concise note; "
            "never guess. Return one item per supplied id in that order."
        )
    else:
        instructions = (
            "Independently compare each candidate transcription with its supplied source image(s). The image is authoritative; "
            "the candidate is only a check target. Correct any omitted or misread source wording, symbol, number, formula, table "
            "structure, option, or ordering, while preserving source-faithful content. Never solve or improve a question. Keep option "
            "labels out of option text. If you cannot confidently verify any content, return the best readable transcription and "
            "status needs_review with a precise note. Populate only fields used by each block type; all unused fields must be empty. "
            "Return checked only if the complete image transcription can be verified. "
            "Do not flag ordinary neighboring-page bleed or page decoration. Return one item per supplied id in order."
        )

    content = [{"type": "input_text", "text": "Process these source question crops. Use the ids exactly as provided."}]
    for _, _, question in batch:
        content.append({"type": "input_text", "text": f"\n=== QUESTION {question['id']} ===\nNoisy OCR hint (do not trust over the image):\n{question.get('prompt','')}\nExisting option hint: {json.dumps(question.get('options', []), ensure_ascii=False)}"})
        if stage == "review":
            candidate = candidates[question["id"]]
            content.append({"type": "input_text", "text": "Candidate to independently verify against the image:\n" + json.dumps({"blocks": candidate["blocks"], "options": candidate["options"]}, ensure_ascii=False)})
        content.extend(load_question_images(question))

    schema = TRANSCRIPTION_SCHEMA if stage == "transcription" else REVIEW_SCHEMA
    body = {
        "model": MODEL,
        "reasoning": {"effort": "high"},
        "max_output_tokens": MAX_OUTPUT_TOKENS,
        "store": False,
        "instructions": instructions,
        "input": [{"role": "user", "content": content}],
        "text": {"format": {"type": "json_schema", "name": "mock_question_transcription", "strict": True, "schema": schema}},
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses", data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + api_key}, method="POST",
    )
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                raw = response.read()
            parsed = json.loads(raw)
            output = json.loads(response_text(parsed))
            usage = parsed.get("usage") or {}
            return output, {key: usage.get(key, 0) for key in ("input_tokens", "output_tokens", "total_tokens")}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")
            if exc.code in (408, 409, 429, 500, 502, 503, 504) and attempt < 5:
                time.sleep(min(60, 2 ** attempt))
                continue
            raise RuntimeError(f"Responses API HTTP {exc.code}: {detail[:1200]}") from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, RuntimeError) as exc:
            if attempt < 5:
                time.sleep(min(60, 2 ** attempt))
                continue
            raise RuntimeError(f"Responses API failed after retries: {exc}") from exc


def validate_block(block, question_id):
    if block["type"] == "paragraph":
        if block["headers"] or block["rows"] or block["items"]:
            raise ValueError(f"{question_id}: unused paragraph fields must be empty")
    elif block["type"] == "math":
        if block["headers"] or block["rows"] or block["items"] or not block["text"].strip():
            raise ValueError(f"{question_id}: malformed math block")
    elif block["type"] == "table":
        if block["items"] or not block["rows"]:
            raise ValueError(f"{question_id}: malformed table block")
        width = len(block["headers"]) or len(block["rows"][0])
        if width == 0 or any(len(row) != width for row in block["rows"]):
            raise ValueError(f"{question_id}: table rows do not match header width")
        if block["text"] and block["text"].strip() == "":
            raise ValueError(f"{question_id}: table caption must be empty or meaningful")
    elif block["type"] == "list":
        if block["headers"] or block["rows"] or block["text"] or not block["items"]:
            raise ValueError(f"{question_id}: malformed list block")


def validate_transcription(item, question_id):
    if item.get("id") != question_id:
        raise ValueError(f"Expected id {question_id}, received {item.get('id')}")
    if not item["blocks"]:
        raise ValueError(f"{question_id}: no content blocks returned")
    for block in item["blocks"]:
        validate_block(block, question_id)
    validate_options(item["options"], question_id)
    return item


def validate_options(options, question_id):
    if len(options) != 3:
        raise ValueError(f"{question_id}: expected three source choices, received {len(options)}")
    for option in options:
        if re.match(r"^\s*[A-Z][.)]\s+", option):
            raise ValueError(f"{question_id}: option includes a printed choice prefix: {option[:60]!r}")


def enforce_known_source_gap(item, question):
    reason = question.get("unscoredReason", "").lower()
    source_options = question.get("options", [])
    has_missing_choice_placeholder = (
        question.get("answerVerified") is False
        and "option" in reason
        and "missing" in reason
        and len(source_options) == 3
        and source_options[-1].lower().startswith("option ")
    )
    if has_missing_choice_placeholder:
        # Reuse the source record's explicit placeholder; never recreate its text here.
        item["options"] = copy.deepcopy(source_options)
        item["status"] = "needs_review"
        note = "A source option is missing; retained the existing unavailable-option placeholder."
        item["notes"] = list(dict.fromkeys([*item.get("notes", []), note]))
    validate_options(item["options"], question["id"])
    return item


def load_source_review_overrides():
    path = CACHE / "source-review-overrides.json"
    if not path.exists():
        return {}
    document = load_json(path)
    if document.get("version") != 1 or not isinstance(document.get("overrides"), dict):
        raise ValueError(f"Invalid source review override file: {path}")
    return document["overrides"]


def apply_source_review_override(item, question, overrides):
    """Apply an ignored, fingerprint-bound human review result when one exists."""
    override = overrides.get(question["id"])
    if override is None:
        return item
    if override.get("source_fingerprint") != fingerprint(question):
        raise ValueError(f"Stale source review override for {question['id']}")
    final_content = {key: override[key] for key in ("blocks", "options", "status", "notes")}
    return {**item, **copy.deepcopy(final_content), "id": question["id"]}


def batch_key(batch):
    return "batch-" + batch[0][2]["id"] + "--" + batch[-1][2]["id"]


def make_batches(records, batch_size):
    return [records[i:i + batch_size] for i in range(0, len(records), batch_size)]


def process_batch(api_key, stage, batch, candidates=None, source_overrides=None):
    expected_ids = [q["id"] for _, _, q in batch]
    try:
        result, usage = call_responses(api_key, stage, batch, candidates)
        items = result.get("items", [])
        if [item.get("id") for item in items] != expected_ids:
            raise ValueError(f"Returned ids/order differ in {batch_key(batch)}")
        for item, (_, _, question) in zip(items, batch):
            if stage == "transcription":
                enforce_known_source_gap(item, question)
                validate_transcription(item, question["id"])
            else:
                candidate = candidates[question["id"]]
                if item["id"] != question["id"]:
                    raise ValueError(f"Unexpected id in review for {question['id']}")
                if not item["blocks"]:
                    raise ValueError(f"{question['id']}: review produced no content blocks")
                for block in item["blocks"]:
                    validate_block(block, question["id"])
                enforce_known_source_gap(item, question)
                item = apply_source_review_override(item, question, source_overrides or {})
                validate_transcription({"id": item["id"], "blocks": item["blocks"], "options": item["options"]}, question["id"])
            cache = {"id": question["id"], "source_fingerprint": fingerprint(question), "item": item}
            if stage == "review":
                cache["candidate"] = candidates[question["id"]]
                cache["candidate_fingerprint"] = hashlib.sha256(json.dumps(cache["candidate"], sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            save_json(cache_path(stage, question["id"]), cache)
        return len(items), usage
    except Exception as exc:
        return exc


def run_stage(api_key, stage, records, batch_size, concurrency, candidate_map=None, source_overrides=None):
    cached = {}
    pending = []
    for batch in make_batches(records, batch_size):
        to_run = []
        for record in batch:
            question = record[2]
            found = get_cached(stage, question)
            if stage == "review" and found:
                expected = candidate_map[question["id"]]
                fp = hashlib.sha256(json.dumps(expected, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
                if found.get("candidate_fingerprint") == fp:
                    cached[question["id"]] = found["item"]
                    continue
                found = None
            if stage == "transcription" and found:
                cached[question["id"]] = found["item"]
                continue
            to_run.append(record)
        if to_run:
            pending.append(to_run)

    print(f"{stage}: {len(cached)} cached; {sum(len(b) for b in pending)} to process", flush=True)
    errors = []
    complete = len(cached)
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = {pool.submit(process_batch, api_key, stage, batch, candidate_map, source_overrides): batch for batch in pending}
        for future in concurrent.futures.as_completed(futures):
            batch = futures[future]
            result = future.result()
            if isinstance(result, Exception):
                errors.append((batch_key(batch), str(result)))
                print(f"ERROR {batch_key(batch)}: {result}", flush=True)
                continue
            count, usage = result
            complete += count
            with LOCK:
                totals = load_json(CACHE / "usage.json") or {"model": MODEL, "reasoning_effort": "high", "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "responses": 0}
                for key, value in usage.items():
                    totals[key] = totals.get(key, 0) + value
                totals["responses"] += 1
                save_json(CACHE / "usage.json", totals)
                log = load_json(CACHE / "progress.json") or {"model": MODEL, "transcription": {}, "review": {}}
                log[stage] = {"completed": complete, "total": len(records), "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
                save_json(CACHE / "progress.json", log)
            print(f"{stage}: {complete}/{len(records)}", flush=True)
    if errors:
        raise RuntimeError(f"{stage} had {len(errors)} failed batches; rerun to retry cached work. First: {errors[0]}")
    items = {}
    for _, _, question in records:
        saved = get_cached(stage, question)
        if not saved:
            raise RuntimeError(f"Missing {stage} cache for {question['id']}")
        if stage == "review":
            expected = candidate_map[question["id"]]
            fp = hashlib.sha256(json.dumps(expected, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            if saved.get("candidate_fingerprint") != fp:
                raise RuntimeError(f"Stale review cache for {question['id']}")
            # Cached responses receive the same validation and source-gap handling
            # as fresh responses, so resuming never bypasses the final contract.
            validate_transcription({"id": saved["item"]["id"], "blocks": saved["item"]["blocks"], "options": saved["item"]["options"]}, question["id"])
            saved["item"] = enforce_known_source_gap(saved["item"], question)
            saved["item"] = apply_source_review_override(saved["item"], question, source_overrides or {})
            validate_transcription({"id": saved["item"]["id"], "blocks": saved["item"]["blocks"], "options": saved["item"]["options"]}, question["id"])
            save_json(cache_path(stage, question["id"]), saved)
        else:
            saved["item"] = enforce_known_source_gap(saved["item"], question)
            validate_transcription(saved["item"], question["id"])
            save_json(cache_path(stage, question["id"]), saved)
        items[question["id"]] = saved["item"]
    return items


def serialize_prompt(blocks):
    parts = []
    for block in blocks:
        kind = block["type"]
        if kind == "paragraph":
            parts.append(block["text"])
        elif kind == "math":
            parts.append("$$\n" + block["text"] + "\n$$")
        elif kind == "table":
            if block["text"]:
                parts.append(block["text"])
            rows = [block["headers"], *block["rows"]] if block["headers"] else block["rows"]
            if rows and block["headers"]:
                width = max(len(row) for row in rows)
                normalized = [row + [""] * (width - len(row)) for row in rows]
                parts.append("| " + " | ".join(normalized[0]) + " |\n" + "| " + " | ".join(["---"] * width) + " |\n" + "\n".join("| " + " | ".join(row) + " |" for row in normalized[1:]))
            elif rows:
                parts.append("\n".join("\t".join(row) for row in rows))
        elif kind == "list":
            parts.extend(f"- {item}" for item in block["items"])
    return "\n\n".join(part for part in parts if part.strip()).strip()


def verify_apply_ready(papers, records, reviews):
    expected = [q["id"] for _, _, q in records]
    actual = [q["id"] for _, paper in papers for q in paper["questions"]]
    if actual != expected or len(actual) != 1071:
        raise RuntimeError(f"Question id/order/count drift: expected {len(expected)} ids, found {len(actual)}")
    for path, paper in papers:
        before = json.loads(path.read_text())
        if [q["id"] for q in before["questions"]] != [q["id"] for q in paper["questions"]]:
            raise RuntimeError(f"Question order changed while running: {path}")
    for _, _, q in records:
        review = reviews[q["id"]]
        if review["status"] == "needs_review" and not review["notes"]:
            raise RuntimeError(f"{q['id']}: needs_review must include an explanation")
        if review["status"] not in ("checked", "needs_review"):
            raise RuntimeError(f"{q['id']}: invalid review status")


def apply_results(papers, records, reviews):
    verify_apply_ready(papers, records, reviews)
    backup_root = CACHE / "original-paper-json"
    backup_root.mkdir(parents=True, exist_ok=True)
    for path, _ in papers:
        backup = backup_root / path.parent.name / "paper.json"
        backup.parent.mkdir(parents=True, exist_ok=True)
        if not backup.exists():
            backup.write_bytes(path.read_bytes())
    for path, paper in papers:
        updated = json.loads(path.read_text())
        for question in updated["questions"]:
            review = reviews[question["id"]]
            status_notes = list(dict.fromkeys(review["notes"]))
            question["prompt"] = serialize_prompt(review["blocks"])
            question["options"] = review["options"]
            question["content"] = review["blocks"]
            question["nativeTranscription"] = {"version": 1, "status": review["status"], "notes": status_notes}
        path.with_suffix(".json.tmp").write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n")
    # Validate all staged files before replacing any source paper.
    staged = []
    for path, _ in papers:
        stage_path = path.with_suffix(".json.tmp")
        data = json.loads(stage_path.read_text())
        original = json.loads((backup_root / path.parent.name / "paper.json").read_text())
        if {key: value for key, value in data.items() if key != "questions"} != {key: value for key, value in original.items() if key != "questions"}:
            raise RuntimeError(f"Paper-level metadata changed for {path}")
        if [q["id"] for q in data["questions"]] != [q["id"] for q in original["questions"]]:
            raise RuntimeError(f"Staged question order mismatch for {path}")
        for before, after in zip(original["questions"], data["questions"]):
            mutable = {"prompt", "options", "content", "nativeTranscription"}
            before_protected = {key: value for key, value in before.items() if key not in mutable}
            after_protected = {key: value for key, value in after.items() if key not in mutable}
            if before_protected != after_protected:
                raise RuntimeError(f"Protected metadata changed for {before['id']}")
        staged.append((stage_path, path))
    for stage_path, path in staged:
        os.replace(stage_path, path)
    print(f"Applied native text to {len(records)} questions across {len(papers)} papers.", flush=True)


def selected_records(records, args):
    if args.pilot:
        picked = []
        ids = ["mock-1-s1-q063", "mock-1-s1-q001", "mock-1-s1-q047", "mock-4-s2-q068"]
        by_id = {q["id"]: row for row in records for q in [row[2]]}
        for question_id in ids:
            if question_id in by_id:
                picked.append(by_id[question_id])
        return picked
    if args.limit:
        return records[:args.limit]
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pilot", action="store_true", help="run a small pilot including Mock 1 Session 1 Question 63")
    parser.add_argument("--limit", type=int, default=0, help="process the first N questions without applying papers")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--no-apply", action="store_true", help="leave results in the ignored cache")
    args = parser.parse_args()
    if args.pilot and args.limit:
        parser.error("choose either --pilot or --limit")
    papers = load_papers()
    all_records = flatten_questions(papers)
    if len(all_records) != 1071:
        raise RuntimeError(f"Expected 1,071 available questions, found {len(all_records)}")
    records = selected_records(all_records, args)
    CACHE.mkdir(parents=True, exist_ok=True)
    api_key = load_env_key()

    print(f"Selected {len(records)} questions; model={MODEL}; reasoning=high; batch={args.batch_size}; concurrency={args.concurrency}", flush=True)
    source_overrides = load_source_review_overrides()
    candidates = run_stage(api_key, "transcription", records, args.batch_size, args.concurrency)
    reviews = run_stage(api_key, "review", records, args.batch_size, args.concurrency, candidates, source_overrides)
    summary = {
        "model": MODEL, "reasoning_effort": "high", "question_count": len(records),
        "status_counts": {status: sum(1 for value in reviews.values() if value["status"] == status) for status in ("checked", "needs_review")},
        "needs_review": [{"id": q["id"], "notes": reviews[q["id"]]["notes"]} for _, _, q in records if reviews[q["id"]]["status"] == "needs_review"],
    }
    save_json(CACHE / "summary.json", summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
    full_run = len(records) == len(all_records)
    if full_run and not args.no_apply:
        apply_results(papers, all_records, reviews)
    elif not full_run:
        print("Partial run complete; paper.json files were not modified.", flush=True)
    else:
        print("Full transcription is cached; paper.json files were not modified (--no-apply).", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Interrupted; completed cache entries will be reused on the next run.", file=sys.stderr)
        sys.exit(130)
