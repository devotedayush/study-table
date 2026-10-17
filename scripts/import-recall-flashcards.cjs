/* eslint-disable @typescript-eslint/no-require-imports -- Node.js CommonJS import tooling. */
/* Input texts, agent drafts, peer-reviewed cards and audit reports remain ignored.
   --prepare validates only; --import publishes the validated batch with a service key. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');
const { validateCard, promptKey } = require('./recall-card-validation.cjs');
const ROOT = path.join(process.cwd(), 'data/recall-flashcards');
const BATCH = 'ai-recall-2026-10-17-v1';
const groups = ['quant-fsa-corp', 'fi-equity-pm', 'econ-deriv-alt-ethics'];

async function prepare() {
  const subjects = JSON.parse(await fs.readFile(path.join(ROOT, 'syllabus.json'), 'utf8'));
  const sources = new Map();
  for (const file of await fs.readdir(ROOT)) {
    if (!file.endsWith('.txt')) continue;
    const text = await fs.readFile(path.join(ROOT, file), 'utf8');
    const id = text.match(/^SOURCE_ID: (.+)$/m)?.[1];
    if (!id) continue;
    const pages = new Map([...text.matchAll(/=== PDF PAGE (\d+) ===\n([\s\S]*?)(?=\n=== PDF PAGE |$)/g)].map(match => [Number(match[1]), match[2]]));
    sources.set(id, { pages });
  }
  const existing = JSON.parse(await fs.readFile(path.join(ROOT, 'existing-cards.json'), 'utf8'));
  const existingKeys = new Set([
    ...existing.catalogue.map(card => promptKey({ subject_id: card.subjectId, front: card.front })),
    ...existing.formulas.map(card => promptKey({ subject_id: subjects.find(subject => subject.title === card.subject)?.id, front: card.title })),
  ]);
  const rows = [], duplicates = [], errors = [], seen = new Set();
  for (const group of groups) {
    const report = await fs.readFile(path.join(ROOT, 'batches', `${group}-review-report.txt`), 'utf8');
    if (!report.trim()) throw new Error(`Missing peer review report for ${group}`);
    const cards = JSON.parse(await fs.readFile(path.join(ROOT, 'batches', `${group}.reviewed.json`), 'utf8'));
    if (!Array.isArray(cards) || !cards.length) throw new Error(`Empty reviewed batch: ${group}`);
    for (const card of cards) {
      try {
        const hash = validateCard(card, subjects, sources), key = promptKey(card);
        if (seen.has(key) || existingKeys.has(key)) { duplicates.push({ group, subject: card.subject, front: card.front }); continue; }
        seen.add(key);
        rows.push({ id: `recall-${hash.slice(0, 24)}`, level: 'L1', subject_id: card.subject_id, subject: card.subject,
          topic_id: card.topic_id, topic: card.topic, kind: card.kind, front: card.front.trim(), back: card.back.trim(),
          hint: card.hint.trim(), tags: [...new Set(card.tags)], source_id: card.source_id, source_page: card.source_page,
          source_quote: card.source_quote.trim(), content_hash: hash, sort_order: rows.length,
          import_batch: BATCH, generated_model: 'gpt-6-luna', reasoning_effort: 'high', reviewed_model: 'gpt-6-luna', review_status: 'agent_reviewed' });
      } catch (error) { errors.push({ group, front: card.front, reason: error.message }); }
    }
  }
  const counts = Object.fromEntries(subjects.map(subject => [subject.title, rows.filter(card => card.subject_id === subject.id).length]));
  const report = { batch: BATCH, total: rows.length, bySubject: counts, duplicatesSkipped: duplicates, errors };
  await fs.writeFile(path.join(ROOT, 'validation-report.json'), JSON.stringify(report, null, 2));
  if (errors.length) throw new Error(`${errors.length} invalid cards; inspect private validation-report.json before import.`);
  if (subjects.some(subject => !rows.some(card => card.subject_id === subject.id))) throw new Error('A subject has no source-based cards.');
  await fs.writeFile(path.join(ROOT, 'validated-cards.json'), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify({ total: rows.length, bySubject: counts, duplicatesSkipped: duplicates.length }, null, 2));
  return rows;
}
async function main() {
  const rows = await prepare();
  if (!process.argv.includes('--import')) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== 'https://sacqjhcvnmnialtizdvz.supabase.co' || !key) throw new Error('Expected the CFA project and a server-only service key.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  for (let offset = 0; offset < rows.length; offset += 100) {
    const { error } = await client.from('recall_flashcards').upsert(rows.slice(offset, offset + 100).map(row => ({ ...row, review_status: 'draft' })), { onConflict: 'id' });
    if (error) throw error;
  }
  const saved = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('recall_flashcards').select('*').eq('import_batch', BATCH).order('sort_order').range(offset, offset + 499);
    if (error) throw error;
    saved.push(...data);
    if (data.length < 500) break;
  }
  if (saved.length !== rows.length) throw new Error('Database row count differs from the validated batch.');
  const savedById = new Map(saved.map(row => [row.id, row]));
  for (const row of rows) {
    const stored = savedById.get(row.id);
    for (const key of Object.keys(row).filter(key => key !== 'review_status')) {
      if (JSON.stringify(stored?.[key]) !== JSON.stringify(row[key])) throw new Error(`Database mismatch for ${row.id} / ${key}`);
    }
  }
  const { count, error } = await client.from('recall_flashcards').update({ review_status: 'agent_reviewed' }, { count: 'exact' }).eq('import_batch', BATCH);
  if (error || count !== rows.length) throw error || new Error('Publication row count mismatch.');
  console.log(`Published and verified ${count} source-linked flashcards in the CFA database.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
