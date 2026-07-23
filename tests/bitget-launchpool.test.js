const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeProduct } = require('../sources/bitget-launchpool');

test('normalizes a Launchpool project with a USDT reward pool', async () => {
  const event = await normalizeProduct({
    productId: 'lp-42', productCoinName: 'USDT', totalInterestAmount: '12500', farmingEnd: 90 * 60_000,
  }, { now: 0, fetchImpl: async () => { throw new Error('not needed'); } });
  assert.deepEqual(event, {
    source: 'bitget-launchpool', id: 'bitget-launchpool:lp-42', dedupeKey: 'launchpool:usdt', title: 'USDT',
    url: 'https://www.bitget.com/ru/events/launchpool/lp-42',
    fields: [['Тип промо', 'Фиксированные награды'], ['Пул', '12 500 USDT'], ['Заканчивается через', '0д 1ч 30м']],
  });
});
