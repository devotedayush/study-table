# Intuitive mock explanations

The six private imported mocks have a separate shared explanation record for each available question. Explanations are authored using GPT-6.1 Terra with medium reasoning and contain an intuition, worked reasoning, one explanation for each option in source order, a learning aid where useful, and a caution when the source or key is uncertain. They are AI-authored study material, separate from the printed answer key.

## Serving and saved attempts

`readImportedPaper` authenticates access to the original private paper, then attaches validated rows from `mock_question_explanations`. The table permits signed-in reads only; application users cannot publish or edit explanations. An unavailable explanation database does not prevent taking a mock.

Every row includes a SHA-256 digest of the exact prompt, ordered options, answer-key index, scoring verification state, and structured question content. A source mismatch leaves the original rationale available. Existing saved attempts use the existing paper-refresh path to acquire commentary only when their source and key match. The refresh preserves submitted choices, score, timing, and answer-key indexes. Source text may receive the pre-existing native-transcription refresh.

The answer-review panel uses the existing safe text/KaTeX renderer. The transcript PDF includes the intuition, reasoning, every option explanation, memory aid and cautions, with vector-rendered math. Cautioned questions label the recorded key as a source-key answer; commentary does not silently change historical scoring.

## Preparing and publishing private content

Author files live in ignored `data/mock-explanations/mock-{1..6}.json`; source papers remain unchanged in ignored `data/imported-mocks`. Run:

```sh
node scripts/prepare-mock-explanations.cjs
```

This requires full coverage of all available question IDs, no duplicates or unknown IDs, every option explained in order, substantive text, and explicit cautions for unscored or source-review questions. It writes a private `prepared.json` for local preview and a `cautions.json` review list. Minimum length is a completeness screen, not proof of financial correctness. Review calculations and apparent key conflicts separately.

`--partial` is for unfinished local previews only. Never describe a partial run as complete. `--sql-batch=N` emits an escaped, idempotent batch of at most 20 records for execution through the authenticated Supabase MCP connection. The command uses the same validator and source-signature implementation as the application. Publish all validated batches, then verify counts by mock, option coverage, hashes, and RLS privileges. Do not commit private explanation content or SQL containing it.

## Verification

```sh
node --test src/lib/mock-explanation.test.mjs src/lib/exam-transcript.test.mjs
node scripts/verify-native-mock-library.cjs
```

Tests cover source/key mismatch rejection, saved-attempt enrichment without scoring changes, missing/duplicate option rejection, unscored cautions, safe formula rendering, and inclusion of all explanation sections in PDFs. Browser verification should open a saved attempt without embedded explanations, verify the refreshed panel, download the PDF, and confirm the saved answers and score remain unchanged. Use a synthetic or local-only attempt to avoid modifying a learner's real history.
