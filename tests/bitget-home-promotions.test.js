const assert = require('node:assert/strict');
const test = require('node:test');
const { extractBannerList, russianUrl, promotionType, poolFromText, resolveBanner } = require('../sources/bitget-home-promotions');

const detail = (info) => `<title>Fallback title | Bitget</title><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { pageInitInfo: info } } })}</script>`;

test('extracts Bitget home-page banners from its public React Query state', () => {
  const html = '<script id="__REACT_QUERY_STATE__" type="application/json">{"queries":[{"queryKey":["useBannerList","/ru"],"state":{"data":{"bannerList":[{"id":"42"}]}}}]}</script>';
  assert.deepEqual(extractBannerList(html), [{ id: '42' }]);
});

test('turns a non-localized Bitget banner URL into a direct Russian URL', () => {
  assert.equal(russianUrl('/events/activities/new/demo?languageType=6').toString(), 'https://www.bitget.com/ru/events/activities/new/demo?languageType=6');
});

test('normalizes a generic homepage promotion with its authoritative pool and timer', async () => {
  const fetchImpl = async () => new Response(detail({
    name: 'Спрогнозируйте цену ETH', endTime: 7_200_000,
    ruleContent: '<p>Фонд акции в размере до 10 USDT.</p><p>Торгуйте фьючерсами.</p>',
  }));
  const event = await resolveBanner({ id: '650645', title: 'Угадай тренд', jumpUrl: '/ru/events/activities/new/demo' }, { fetchImpl, now: 0 });
  assert.deepEqual(event.fields, [['Тип промо', 'Фьючерсы'], ['Пул', '10 USDT'], ['Заканчивается через', '0д 2ч 0м']]);
  assert.equal(event.id, 'bitget-home-v2:650645');
});

test('converts a token-denominated homepage pool through CoinGecko', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/search?')) return new Response(JSON.stringify({ coins: [{ id: 'ethereum', symbol: 'eth', market_cap_rank: 2 }] }));
    return new Response(JSON.stringify({ ethereum: { usd: 2000 } }));
  };
  assert.equal(await poolFromText('Фонд акции в размере до 55 ETH.', fetchImpl, 'demo-key'), '110 000 USDT');
});

test('keeps a client-rendered card when Bitget does not expose its title in HTML', async () => {
  const event = await resolveBanner({ id: '233620', jumpUrl: '/ru/events/super-pairs/task/233620', unixEndTime: '7200000' }, {
    fetchImpl: async () => new Response('<title> | Bitget</title>'), now: 0,
  });
  assert.equal(event.title, 'Промоакция Bitget #233620');
  assert.deepEqual(event.fields, [['Тип промо', 'Фьючерсы'], ['Пул', 'Не указан'], ['Заканчивается через', '0д 2ч 0м']]);
});

test('uses all requested public promotion types', () => {
  assert.equal(promotionType('спот и futures'), 'Спот, Фьючерсы');
  assert.equal(promotionType('other'), 'Неопределенно');
});
