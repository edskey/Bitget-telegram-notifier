const assert = require('node:assert/strict');
const test = require('node:test');
const { extractArticles, articleContent, normalizeArticle } = require('../sources/bitget-support-promotions');

test('extracts public support-hub article cards', () => {
  const cards = extractArticles('<a href="/ru/support/articles/12560603890046">Объявление POLYX</a>');
  assert.deepEqual(cards, [{ id: '12560603890046', title: 'Объявление POLYX' }]);
});

test('prepares the real POLYX maintenance announcement without inventing a pool or timer', async () => {
  const html = '<script>window.state={"articleDetails":{"content":"\\u003Cdiv\\u003EВремя восстановления будет сообщено дополнительно.\\u003C/div\\u003E"}}</script>';
  assert.match(articleContent(html), /Время восстановления/);
  const event = await normalizeArticle({ id: '12560603890046', title: 'Объявление Bitget о приостановке сервиса пополнения и вывода POLYX - Polymesh' }, {
    fetchImpl: async () => new Response(html),
  });
  assert.deepEqual(event.fields, [
    ['Тип промо', 'Неопределенно'],
    ['Пул', 'Не указан'],
    ['Заканчивается через', 'Не указан'],
  ]);
});
