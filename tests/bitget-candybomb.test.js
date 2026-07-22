const assert = require('node:assert/strict');
const test = require('node:test');
const { parseActivities, timerFromEndTime } = require('../sources/bitget-candybomb');

test('normalizes an active CandyBomb card with all requested types', () => {
  const now = Date.UTC(2026, 6, 23, 12, 0, 0);
  const events = parseActivities({ code: '00000', data: { processingActivities: [{ id: '12345', name: 'Тестовая акция', endTime: String(now + 90 * 60_000), airDropTypeList: [1, 2, 3], countDownTime: '123456' }] } }, now);
  assert.deepEqual(events, [{ source: 'bitget-candybomb-current', id: 'bitget-candybomb:12345', title: 'Тестовая акция', url: 'https://www.bitget.com/ru/events/candy-bomb/detail/12345', fields: [['Тип', 'Спот, Фьючерсы, Фиксированные награды'], ['Таймер', '0д 1ч 30м']] }]);
});

test('timer changes do not affect the stable event id', () => {
  assert.equal(timerFromEndTime(90 * 60_000, 0), '0д 1ч 30м');
  assert.equal(timerFromEndTime(89 * 60_000, 0), '0д 1ч 29м');
});

test('rejects malformed Bitget payloads instead of treating them as empty', () => {
  assert.throws(() => parseActivities({ code: '00000', data: {} }), /processingActivities/);
});
