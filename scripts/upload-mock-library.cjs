/* Import prepared private study papers. Run from the repository root with a server-only
   SUPABASE_SERVICE_ROLE_KEY; source PDFs/extracted content must remain git-ignored. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const root = process.cwd();
const source = path.join(root, 'data', 'imported-mocks');
const statePath = path.join(root, 'tmp', 'mock-import', 'uploaded-hashes.json');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) throw new Error('Set the server-only SUPABASE_SERVICE_ROLE_KEY for this import command.');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (url !== 'https://sacqjhcvnmnialtizdvz.supabase.co') throw new Error('Refusing to upload to a different Supabase project.');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function walk(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)]))).flat();
}
(async () => {
  const bucket = await client.storage.getBucket('study-mocks');
  if (bucket.error || !bucket.data || bucket.data.public) throw new Error('Expected an existing private study-mocks bucket.');
  let hashes = {};
  try { hashes = JSON.parse(await fs.readFile(statePath, 'utf8')); } catch {}
  const files = (await walk(source)).filter(file => /\.(json|pdf|jpg)$/.test(file));
  const objects = files.filter(file => !file.endsWith('paper.json') && !file.endsWith('catalog.json'));
  const manifests = files.filter(file => file.endsWith('paper.json'));
  const catalog = path.join(source, 'catalog.json');
  let uploaded = 0, skipped = 0;
  async function upload(file) {
    const name = path.relative(source, file).split(path.sep).join('/');
    const bytes = await fs.readFile(file); const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (hashes[name] === hash) { skipped++; return; }
    const contentType = file.endsWith('.pdf') ? 'application/pdf' : file.endsWith('.jpg') ? 'image/jpeg' : 'application/json';
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await client.storage.from('study-mocks').upload(name, bytes, { upsert: true, contentType, cacheControl: '0' });
      if (!result.error) { hashes[name] = hash; uploaded++; if (uploaded % 100 === 0) console.log(`Uploaded ${uploaded} private files`); return; }
      if (attempt === 2) throw result.error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  let cursor = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (cursor < objects.length) await upload(objects[cursor++]); }));
  for (const file of manifests) await upload(file);
  await upload(catalog);
  await fs.writeFile(statePath, JSON.stringify(hashes, null, 2));
  console.log(`Private mock library: ${uploaded} uploaded, ${skipped} unchanged; catalog published last.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
