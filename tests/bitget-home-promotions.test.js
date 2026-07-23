const assert = require('node:assert/strict');
const test = require('node:test');
const { extractBannerList, promotionType, resolveEarningsPrediction } = require('../sources/bitget-home-promotions');

test('extracts Bitget home-page banners from its public React Query state', () => {
  const html = '<script id="__REACT_QUERY_STATE__" type="application/json">{"queries":[{"queryKey":["useBannerList","/ru"],"state":{"data":{"bannerList":[{"id":"42"}]}}}]}</script>';
  assert.deepEqual(extractBannerList(html), [{ id: '42' }]);
});

test('normalizes the active Guess the Trend promotion pool and timer', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/vote/info')) return new Response(JSON.stringify({ code: '00000', data: { endTime: '7200000' } }));
    if (String(url).includes('/session/list')) return new Response(JSON.stringify({ code: '00000', data: { sessions: [{ status: 20, totalPool: 10000, ticketInfo: { token: 'USDT', applyLine: 'SPOT' } }] } }));
    throw new Error(`Unexpected URL ${url}`);
  };
  const event = await resolveEarningsPrediction({ id: '650645', title: 'Угадай тренд: Вверх или вниз!', jumpUrl: '/ru/launchhub/earnings-prediction' }, { fetchImpl, now: 0 });
  assert.deepEqual(event.fields, [['Тип промо', 'Спот'], ['Пул', '10 000 USDT'], ['Заканчивается через', '0д 2ч 0м']]);
});

test('marks only the requested latest home promotion as a manual test', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/vote/info')) return new Response(JSON.stringify({ code: '00000', data: { endTime: '7200000' } }));
    if (String(url).includes('/session/list')) return new Response(JSON.stringify({ code: '00000', data: { sessions: [{ status: 20, totalPool: 10000, ticketInfo: { token: 'USDT', applyLine: 'SPOT' } }] } }));
    if (String(url) === 'https://www.bitget.com/ru') return new Response('<script id="__REACT_QUERY_STATE__" type="application/json">{"queries":[{"queryKey":["useBannerList"],"state":{"data":{"bannerList":[{"id":"old","title":"Old","jumpUrl":"/ru/launchhub/earnings-prediction","unixStartTime":"1"},{"id":"new","title":"New","jumpUrl":"/ru/launchhub/earnings-prediction","unixStartTime":"2"}]}}}]}</script>');
    throw new Error(`Unexpected URL ${url}`);
  };
  const events = await require('../sources/bitget-home-promotions').collect({ fetchImpl, forceLatest: true });
  assert.equal(events.filter((event) => event.force).length, 1);
  assert.equal(events.find((event) => event.force).id, 'bitget-home:new');
});

test('uses only requested public promotion types', () => {
  assert.equal(promotionType('MIX'), 'Фьючерсы');
  assert.equal(promotionType('other'), 'Неопределенно');
});
