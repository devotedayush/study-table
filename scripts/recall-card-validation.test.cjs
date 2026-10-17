/* eslint-disable @typescript-eslint/no-require-imports -- Node.js CommonJS test module. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateCard, promptKey } = require('./recall-card-validation.cjs');
const subjects = [{ id: 'quant', title: 'Quantitative Methods', topics: [{ id: 'quant-rates', title: 'Rates and Returns' }] }];
const sources = new Map([['source', { pages: new Map([[3, 'HPR = (Ending value - Beginning value + Income) / Beginning value']]) }]]);
const card = { subject_id: 'quant', subject: 'Quantitative Methods', topic_id: 'quant-rates', topic: 'Rates and Returns', kind: 'formula', front: 'How is holding period return calculated?', back: 'Divide the price change plus income by the beginning value.', hint: 'Include income.', tags: ['return'], source_id: 'source', source_page: 3, source_quote: 'HPR = (Ending value - Beginning value + Income)' };
test('accepts a source-grounded card and uses a stable identity for corrected answers', () => {
  assert.equal(validateCard(card, subjects, sources), validateCard({ ...card, back: 'An improved answer including the same rule.' }, subjects, sources));
});
test('rejects a plausible quotation on the wrong PDF page', () => {
  assert.throws(() => validateCard({ ...card, source_page: 2 }, subjects, sources), /PDF page/);
  assert.throws(() => validateCard({ ...card, source_quote: 'HPR always excludes income.' }, subjects, sources), /not verbatim/);
});
test('rejects unrelated curriculum mappings', () => {
  assert.throws(() => validateCard({ ...card, topic_id: 'fi-duration' }, subjects, sources), /topic mapping/);
});
test('normalizes prompt formatting for duplicate detection', () => {
  assert.equal(promptKey(card), promptKey({ ...card, front: 'HOW is holding period return calculated ?' }));
});
