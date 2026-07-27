const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeProduct, collect } = require('../sources/bitget-launchpool');

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

test('accepts the current Bitget Launchpool totalRewards response shape', async () => {
  let status = 0;
  const fetchImpl = async (url, options) => {
    assert.match(String(url), /launchpool\/product\/list/);
    status = JSON.parse(options.body).status;
    return new Response(JSON.stringify({
      code: '200', data: { data: status === 1 ? [] : [{
        id: 'aeon-1', productName: 'AEON', productCoinName: 'USDT', totalRewards: '1166666', endTime: '3600000', startTime: '1',
        productSubList: [{ totalRewards: '1000000' }, { totalRewards: '166666' }],
      }] },
    }));
  };
  const events = await collect({ fetchImpl });
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'bitget-launchpool:aeon-1');
  assert.equal(events[0].fields[1][1], '1 166 666 USDT');
});
