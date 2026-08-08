const assert = require('node:assert/strict');
const test = require('node:test');
const { reconcileCandyBombDuplicates } = require('../scripts/collect');

test('matches a support CandyBomb article to its one active CandyBomb campaign', () => {
  const events = reconcileCandyBombDuplicates([
    { source: 'bitget-candybomb-current', title: 'QUID', dedupeKey: 'candybomb:quid:5000' },
    { source: 'bitget-current-promotions', title: 'CandyBomb x QUID: разделите награды', dedupeKey: '' },
  ]);
  assert.equal(events[1].dedupeKey, 'candybomb:quid:5000');
});

test('does not merge two concurrent CandyBomb campaigns for the same token', () => {
  const events = reconcileCandyBombDuplicates([
    { source: 'bitget-candybomb-current', title: 'USDT', dedupeKey: 'candybomb:usdt:20000' },
    { source: 'bitget-candybomb-current', title: 'USDT', dedupeKey: 'candybomb:usdt:120000' },
    { source: 'bitget-current-promotions', title: 'CandyBomb x USDT: разделите 20,000 USDT', dedupeKey: 'candybomb:usdt:20000' },
  ]);
  assert.equal(events[2].dedupeKey, 'candybomb:usdt:20000');
});
