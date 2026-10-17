/* Upload private PDF files prepared under ignored data/study-materials.
   Run with a server-only service key. Never commit the PDFs or credentials. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const catalog = require('../src/lib/study-material-catalog.json');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== 'https://sacqjhcvnmnialtizdvz.supabase.co' || !key) throw new Error('Expected the CFA project and a server-only service key.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: bucket, error } = await client.storage.getBucket('study-materials');
  if (error || !bucket || bucket.public) throw new Error('Apply the private study-materials migration first.');
  for (const item of catalog) {
    const bytes = await fs.readFile(path.join(process.cwd(), 'data', 'study-materials', `${item.id}.pdf`));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error(`Source hash mismatch: ${item.title}`);
    const result = await client.storage.from('study-materials').upload(`${item.id}.pdf`, bytes, { upsert: true, contentType: 'application/pdf', cacheControl: '0' });
    if (result.error) throw result.error;
    const verified = await client.storage.from('study-materials').download(`${item.id}.pdf`);
    if (verified.error || !verified.data) throw verified.error || new Error('Verification download failed.');
    const hash = crypto.createHash('sha256').update(Buffer.from(await verified.data.arrayBuffer())).digest('hex');
    if (hash !== item.sha256) throw new Error(`Uploaded hash mismatch: ${item.title}`);
    console.log(`Uploaded and verified: ${item.title}`);
  }
  console.log(`All ${catalog.length} private PDFs verified byte-for-byte.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
