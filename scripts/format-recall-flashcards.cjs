/* eslint-disable @typescript-eslint/no-require-imports -- Node.js CommonJS import tooling. */
/* Publish reviewed LaTeX formatting without replacing card identities or study progress. */
const fs = require('node:fs/promises');
const path = require('node:path');
const katex = require('katex');
const { createClient } = require('@supabase/supabase-js');
const { validateCard } = require('./recall-card-validation.cjs');
const ROOT = path.join(process.cwd(), 'data/recall-flashcards');
const groups = ['quant-fsa-corp', 'fi-equity-pm', 'econ-deriv-alt-ethics'];
const MATH = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;

async function main() {
  const baseline = JSON.parse(await fs.readFile(path.join(ROOT, 'validated-cards.json'), 'utf8'));
  const subjects = JSON.parse(await fs.readFile(path.join(ROOT, 'syllabus.json'), 'utf8'));
  const sources = new Map();
  for (const file of await fs.readdir(ROOT)) {
    if (!file.endsWith('.txt')) continue;
    const text = await fs.readFile(path.join(ROOT, file), 'utf8'), id = text.match(/^SOURCE_ID: (.+)$/m)?.[1];
    if (id) sources.set(id, { pages: new Map([...text.matchAll(/=== PDF PAGE (\d+) ===\n([\s\S]*?)(?=\n=== PDF PAGE |$)/g)].map(match => [Number(match[1]), match[2]])) });
  }
  const rows = [], changes = [];
  let fragments = 0;
  for (const group of groups) {
    const original = JSON.parse(await fs.readFile(path.join(ROOT, 'batches', `${group}.reviewed.json`), 'utf8'));
    const formatted = JSON.parse(await fs.readFile(path.join(ROOT, 'batches', `${group}.latex.json`), 'utf8'));
    const report = await fs.readFile(path.join(ROOT, 'batches', `${group}-latex-report.txt`), 'utf8');
    if (!report.trim() || formatted.length !== original.length) throw new Error(`Formatting review/count missing for ${group}`);
    for (let index = 0; index < original.length; index++) {
      const before = original[index], after = formatted[index];
      for (const key of Object.keys(before).filter(key => key !== 'back' && key !== 'hint')) {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) throw new Error(`Formatting changed protected field ${group}/${index}/${key}`);
      }
      validateCard(after, subjects, sources);
      for (const field of ['back', 'hint']) {
        const text = after[field];
        for (const match of text.matchAll(MATH)) {
          katex.renderToString(match[1] ?? match[2], { displayMode: match[2] !== undefined, strict: 'error', throwOnError: true, trust: false, output: 'htmlAndMathml' });
          fragments++;
        }
        const prose = text.replace(MATH, '');
        if (/\\[a-zA-Z([\])]/.test(prose) || /\$\$/.test(text)) throw new Error(`Unwrapped LaTeX in ${group}/${index}/${field}`);
      }
      const stored = baseline.find(row => row.subject_id === before.subject_id && row.front === before.front);
      if (!stored) throw new Error('Formatting card has no published identity');
      rows.push({ ...stored, back: after.back, hint: after.hint });
      if (before.back !== after.back || before.hint !== after.hint) changes.push(stored.id);
    }
  }
  if (rows.length !== baseline.length || new Set(rows.map(row => row.id)).size !== baseline.length) throw new Error('Formatting set differs from the published library');
  rows.sort((left, right) => left.sort_order - right.sort_order);
  await fs.writeFile(path.join(ROOT, 'latex-validated-cards.json'), JSON.stringify(rows, null, 2));
  console.log(`LaTeX validated: ${changes.length} formatted cards, ${fragments} math fragments; ${rows.length} identities preserved.`);
  if (!process.argv.includes('--import')) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== 'https://sacqjhcvnmnialtizdvz.supabase.co' || !key) throw new Error('Expected the CFA project and a server-only service key');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // One PostgREST request publishes all formatting in a single database transaction.
  const result = await client.from('recall_flashcards').upsert(rows, { onConflict: 'id' });
  if (result.error) throw result.error;
  const saved = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('recall_flashcards').select('id,front,back,hint,content_hash,review_status').eq('import_batch', rows[0].import_batch).order('sort_order').range(offset, offset + 499);
    if (error) throw error;
    saved.push(...data);
    if (data.length < 500) break;
  }
  if (saved.length !== rows.length) throw new Error('Formatted database count mismatch');
  const byId = new Map(saved.map(row => [row.id, row]));
  for (const row of rows) for (const key of ['front','back','hint','content_hash','review_status']) {
    if (byId.get(row.id)?.[key] !== row[key]) throw new Error(`Formatted database value mismatch: ${row.id}/${key}`);
  }
  await fs.writeFile(path.join(ROOT, 'validated-cards.json'), JSON.stringify(rows, null, 2));
  console.log(`Published and read-back verified ${changes.length} LaTeX-formatted cards. All ${rows.length} card identities are unchanged.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
