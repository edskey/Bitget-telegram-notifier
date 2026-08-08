const assert = require('node:assert/strict');
const test = require('node:test');
const { extractArticles, articleContent, normalizeArticle, dedupeKey, parseAmount, endTimeFromContent } = require('../sources/bitget-support-promotions');

test('extracts only article cards from the Current contests and promotions section', () => {
  const cards = extractArticles([
    '<a href="/ru/support/articles/12560603890046">Объявление POLYX</a>',
    '<a href="/ru/support/articles/12560603890030" data-testid="SupportSectionsArticlesText">CandyBomb x SOL</a>',
  ].join(''));
  assert.deepEqual(cards, [{ id: '12560603890030', title: 'CandyBomb x SOL' }]);
});

test('normalizes a promotion article from the current-promotions section', async () => {
  const html = '<script>window.state={"articleDetails":{"content":"\\u003Cdiv\\u003EПризовой фонд: 500 USDT.\\u003C/div\\u003E"}}</script>';
  assert.match(articleContent(html), /Призовой фонд/);
  const event = await normalizeArticle({ id: '12560603890030', title: 'CandyBomb x SOL: торгуйте фьючерсами' }, {
    fetchImpl: async () => new Response(html),
  });
  assert.deepEqual(event.fields, [
    ['Тип промо', 'Фьючерсы, Фиксированные награды'],
    ['Пул', '500 USDT'],
    ['Заканчивается через', 'Не указан'],
  ]);
});

test('preserves a comma thousands separator in CandyBomb pools', () => {
  assert.equal(parseAmount('20,000'), 20000);
  assert.equal(dedupeKey('CandyBomb x USDT: разделите 20,000 USDT!'), 'candybomb:usdt:20000');
});

test('extracts a pool and Moscow-time end date from the current Bitget article format', async () => {
  const content = 'Период проведения акции:4 Август 2026 года, 16:00 – 14 Август 2026 года, 16:00 (мск) Пул торговли фьючерсами: 20,000 USDT';
  assert.equal(endTimeFromContent(content), Date.UTC(2026, 7, 14, 13, 0));
  const event = await normalizeArticle({ id: '12560603891052', title: 'CandyBomb x USDT: торгуйте фьючерсами и разделите 20,000 USDT!' }, {
    fetchImpl: async () => new Response(`<script>window.state={"articleDetails":{"content":${JSON.stringify(content)}}}</script>`),
  });
  assert.equal(event.fields[1][1], '20 000 USDT');
  assert.notEqual(event.fields[2][1], 'Не указан');
});
