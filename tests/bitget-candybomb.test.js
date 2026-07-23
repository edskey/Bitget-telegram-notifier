const assert = require('node:assert/strict');
const test = require('node:test');
const { parseActivities, timerFromEndTime } = require('../sources/bitget-candybomb');

test('normalizes an active CandyBomb card with pool, timer, and promo type', () => {
  const now = Date.UTC(2026, 6, 23, 12, 0, 0);
  const events = parseActivities({ code: '00000', data: { processingActivities: [{ id: '12345', name: 'Тестовая акция', endTime: String(now + 90 * 60_000), airDropTypeList: [1, 3], ieoTotalUsdt: 12500.5, countDownTime: '123456' }] } }, now);
  assert.deepEqual(events, [{ source: 'bitget-candybomb-current', id: 'bitget-candybomb:12345', dedupeKey: 'candybomb:тестовая акция', title: 'Тестовая акция', url: 'https://www.bitget.com/ru/events/candy-bomb/detail/12345', fields: [['Тип промо', 'Спот'], ['Пул', '12 500,5 USDT'], ['Заканчивается через', '0д 1ч 30м']] }]);
});

test('uses Неопределенно when Bitget has no spot or futures type', () => {
  const events = parseActivities({ code: '00000', data: { processingActivities: [{ id: '1', name: 'X', endTime: '1', airDropTypeList: [3], ieoTotalUsdt: 1 }] } }, 0);
  assert.equal(events[0].fields[0][1], 'Неопределенно');
});

test('timer changes do not affect the stable event id', () => {
  assert.equal(timerFromEndTime(90 * 60_000, 0), '0д 1ч 30м');
  assert.equal(timerFromEndTime(89 * 60_000, 0), '0д 1ч 29м');
});

test('rejects malformed Bitget payloads instead of treating them as empty', () => {
  assert.throws(() => parseActivities({ code: '00000', data: {} }), /processingActivities/);
});
