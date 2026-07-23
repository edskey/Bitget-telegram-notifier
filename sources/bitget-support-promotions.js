const { timerFromEndTime } = require('./bitget-candybomb');
const { poolValueInUsdt } = require('./coin-gecko');

const SOURCE_NAME = 'bitget-support-promotions';
const HUB_URL = 'https://www.bitget.com/ru/support/categories/4413083952537';
const ARTICLE_BASE_URL = 'https://www.bitget.com/ru/support/articles/';

function decodeHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function extractArticles(html) {
  const found = new Map();
  const pattern = /<a\b[^>]*href="([^"?#]*\/ru\/support\/articles\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of String(html).matchAll(pattern)) {
    const title = decodeHtml(match[3]);
    if (title) found.set(match[2], { id: match[2], title });
  }
  return [...found.values()];
}

function articleContent(html) {
  const match = String(html).match(/"articleDetails":\{[\s\S]*?"content":"((?:\\.|[^"\\])*)"/);
  if (!match) return '';
  try { return decodeHtml(JSON.parse(`"${match[1]}"`)); } catch { throw new Error('Bitget support article content is malformed'); }
}

function promotionType(title, content) {
  const text = `${title} ${content}`.toLowerCase();
  const types = [];
  if (/спот|spot/.test(text)) types.push('Спот');
  if (/фьючерс|futures|perpetual/.test(text)) types.push('Фьючерсы');
  if (/фиксированн(ые|ая) наград|launchpool|призов(ой|ого) фонд/.test(text)) types.push('Фиксированные награды');
  return types.length ? types.join(', ') : 'Неопределенно';
}

async function poolFromContent(content, fetchImpl) {
  const match = content.match(/(?:призов(?:ой|ого) фонд|общ(?:ий|его) пул|пул(?: наград)?|reward pool)[^\d]{0,60}([\d\s.,]+)\s*([A-Z]{2,12})/i);
  if (!match) return 'Не указан';
  const amount = Number(match[1].replace(/\s/g, '').replace(',', '.'));
  return poolValueInUsdt(amount, match[2], { fetchImpl });
}

function endTimeFromContent(content) {
  const match = content.match(/акци[яи][^.!]{0,100}(?:заканчивается|до)[^\d]{0,30}(\d{13})/i);
  return match ? Number(match[1]) : null;
}

function dedupeKey(title) {
  const candy = String(title).match(/candybomb\s*(?:x|×)?\s*([A-Z0-9]{2,12})/i);
  if (candy) return `candybomb:${candy[1].toLowerCase()}`;
  const launchpool = String(title).match(/(?:launchpool).*?\(?([A-Z0-9]{2,12})\)?/i);
  return launchpool ? `launchpool:${launchpool[1].toLowerCase()}` : '';
}

async function normalizeArticle(article, { fetchImpl, force = false }) {
  const url = `${ARTICLE_BASE_URL}${encodeURIComponent(article.id)}`;
  const response = await fetchImpl(url, { headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Bitget support article ${response.status}`);
  const content = articleContent(await response.text());
  const endTime = endTimeFromContent(content);
  return {
    source: SOURCE_NAME,
    id: `bitget-support:${article.id}`,
    ...(dedupeKey(article.title) ? { dedupeKey: dedupeKey(article.title) } : {}),
    title: article.title,
    url,
    fields: [
      ['Тип промо', promotionType(article.title, content)],
      ['Пул', await poolFromContent(content, fetchImpl)],
      ['Заканчивается через', endTime ? timerFromEndTime(endTime) : 'Не указан'],
    ],
    ...(force ? { force: true } : {}),
  };
}

async function collect({ fetchImpl = fetch, forceLatest = false, forceArticleId = '' } = {}) {
  const response = await fetchImpl(HUB_URL, { headers: { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Bitget support hub ${response.status}`);
  const articles = extractArticles(await response.text());
  if (!articles.length) throw new Error('Bitget support hub has no article cards');
  const events = [];
  // A pair of reads stays under Bitget's rate limit while keeping the full
  // scheduler run comfortably below GitHub Actions' five-minute timeout.
  for (let index = 0; index < articles.length; index += 2) {
    const batch = await Promise.all(articles.slice(index, index + 2).map((article, offset) => normalizeArticle(article, {
      fetchImpl,
      force: String(article.id) === String(forceArticleId) || (forceLatest && index + offset === 0),
    })));
    events.push(...batch);
  }
  return events;
}

module.exports = { name: SOURCE_NAME, collect, extractArticles, articleContent, normalizeArticle, promotionType, dedupeKey };
