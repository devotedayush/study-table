/* eslint-disable @typescript-eslint/no-require-imports -- Shared by CommonJS import tooling and tests. */
const crypto = require('node:crypto');

function normalize(value) {
  return value.normalize('NFKC').replace(/\u00ad/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}
function promptKey(card) { return `${card.subject_id}:${normalize(card.front).replace(/[^a-z0-9]+/g, ' ')}`.trim(); }
function validateCard(card, subjects, sources) {
  const subject = subjects.find(item => item.id === card.subject_id);
  if (!subject || subject.title !== card.subject) throw new Error('Invalid subject mapping');
  const topic = subject.topics.find(item => item.id === card.topic_id);
  if (!topic || topic.title !== card.topic) throw new Error('Invalid topic mapping');
  if (!['concept', 'formula', 'process', 'warning', 'application'].includes(card.kind)) throw new Error('Invalid card kind');
  for (const [field, min, max] of [['front', 15, 600], ['back', 10, 2400], ['hint', 0, 500], ['source_quote', 8, 250]]) {
    if (typeof card[field] !== 'string' || card[field].trim().length < min || card[field].length > max) throw new Error(`Invalid ${field} length`);
  }
  if (!Array.isArray(card.tags) || card.tags.length > 12 || card.tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 80)) throw new Error('Invalid tags');
  const source = sources.get(card.source_id);
  if (!source || !Number.isInteger(card.source_page) || !source.pages.has(card.source_page)) throw new Error('Invalid source or PDF page');
  if (!normalize(source.pages.get(card.source_page)).includes(normalize(card.source_quote))) throw new Error('Source quote is not verbatim on the cited page');
  if (/\b(as an ai|insert answer|todo|tbd)\b/i.test(card.front + ' ' + card.back)) throw new Error('Placeholder content');
  if (normalize(card.front) === normalize(card.back)) throw new Error('Question repeats answer');
  return crypto.createHash('sha256').update(promptKey(card)).digest('hex');
}
module.exports = { normalize, promptKey, validateCard };
