const assert = require('node:assert/strict');
const test = require('node:test');
const { extractArticles, articleContent, normalizeArticle } = require('../sources/bitget-support-promotions');

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
