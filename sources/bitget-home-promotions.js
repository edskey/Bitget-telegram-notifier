const { timerFromEndTime } = require('./bitget-candybomb');
const { poolValueInUsdt } = require('./coin-gecko');

// A new name deliberately starts a separate no-spam baseline.  The previous
// adapter watched one discontinued card type only, so its old empty state must
// not make the promotions currently visible on the home page look "new".
const SOURCE_NAME = 'bitget-home-promotions-v2';
const HOME_URL = 'https://www.bitget.com/ru';

function extractBannerList(html) {
  const match = String(html).match(/<script id="__REACT_QUERY_STATE__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Bitget home page has no React Query state');
  const state = JSON.parse(match[1]);
  const query = state?.queries?.find((item) => item?.queryKey?.[0] === 'useBannerList');
  if (!Array.isArray(query?.state?.data?.bannerList)) throw new Error('Bitget home page has no bannerList');
  return query.state.data.bannerList;
}

function russianUrl(jumpUrl) {
  if (!jumpUrl) return null;
  const url = new URL(jumpUrl, HOME_URL);
  if (url.origin !== 'https://www.bitget.com') return null;
  if (!url.pathname.startsWith('/ru/')) url.pathname = `/ru${url.pathname}`;
  return url;
}

function htmlText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function promotionType(text) {
  const normalized = String(text || '').toLowerCase();
  const types = [];
  if (/спот|spot/.test(normalized)) types.push('Спот');
  if (/фьючерс|futures|contract|perpetual/.test(normalized)) types.push('Фьючерсы');
  return types.length ? types.join(', ') : 'Неопределенно';
}

function extractNextData(html) {
  const match = String(html).match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { throw new Error('Bitget promotion has malformed Next data'); }
}

function pageTitle(html) {
  const match = String(html).match(/<title>([\s\S]*?)<\/title>/i);
  return htmlText(match?.[1]).replace(/\s*[|｜]\s*Bitget\s*$/i, '').trim();
}

function parseAmount(value) {
  return Number(String(value || '').replace(/\s/g, '').replace(',', '.'));
}

async function poolFromText(text, fetchImpl, apiKey) {
  const source = htmlText(text);
  const match = source.match(/(?:призов(?:ой|ого) фонд|фонд акции|общий фонд|reward pool|prize pool)[^.]{0,160}?(?:до\s*)?([\d\s.,]+)\s*(USDT|USDC|[A-Z]{2,12})\b/i);
  if (!match) return 'Не указан';
  const amount = parseAmount(match[1]);
  return poolValueInUsdt(amount, match[2], { fetchImpl, apiKey });
}

function pageInfo(html, banner) {
  const next = extractNextData(html);
  const info = next?.props?.pageProps?.pageInitInfo || {};
  const ruleContent = htmlText(info.ruleContent);
  return {
    title: String(info.name || pageTitle(html) || banner.title || banner.secondTitle || '').trim(),
    endTime: Number(info.endTime || banner.unixEndTime || 0),
    text: `${info.name || ''} ${ruleContent}`,
    ruleContent,
  };
}

async function resolveBanner(banner, { fetchImpl, now, force = false }) {
  const url = russianUrl(banner.jumpUrl);
  if (!url || !banner.id) return null;
  const response = await fetchImpl(url, {
    headers: { Accept: 'text/html', 'Accept-Language': 'ru-RU', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Bitget home promotion ${response.status}`);
  const info = pageInfo(await response.text(), banner);
  // Some public Super Pairs cards are rendered client-side and expose neither
  // a page title nor Next data to anonymous requests.  The banner itself is
  // still an authoritative current promotion, so retain it with a clear,
  // non-invented fallback instead of losing the notification entirely.
  const title = info.title || String(banner.title || banner.secondTitle || `Промоакция Bitget #${banner.id}`).trim();
  if (!Number.isFinite(info.endTime) || info.endTime <= 0) throw new Error('Bitget home promotion is missing end time');
  return {
    source: SOURCE_NAME,
    id: `bitget-home-v2:${banner.id}`,
    dedupeKey: `home:${url.pathname.toLowerCase()}`,
    title,
    url: url.toString(),
    fields: [
      ['Тип промо', promotionType(`${banner.title || ''} ${banner.secondTitle || ''} ${info.text} ${url.pathname.includes('/super-pairs/') ? 'futures' : ''}`)],
      ['Пул', await poolFromText(info.ruleContent, fetchImpl)],
      ['Заканчивается через', timerFromEndTime(info.endTime, now)],
    ],
    ...(force ? { force: true } : {}),
  };
}

async function collect({ fetchImpl = fetch, forceLatest = false } = {}) {
  const response = await fetchImpl(HOME_URL, { headers: { Accept: 'text/html', 'Accept-Language': 'ru-RU' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Bitget home page ${response.status}`);
  const banners = extractBannerList(await response.text())
    .filter((banner) => russianUrl(banner.jumpUrl) && String(banner.id || '').trim());
  const latest = forceLatest && banners.reduce((current, banner) =>
    Number(banner.unixStartTime || 0) > Number(current?.unixStartTime || 0) ? banner : current, null);
  const events = [];
  // Public activity pages are comparatively heavy; two concurrent reads keep
  // the GitHub Actions check within its five-minute budget and avoid a burst.
  for (let index = 0; index < banners.length; index += 2) {
    const batch = await Promise.all(banners.slice(index, index + 2).map((banner) => resolveBanner(banner, {
      fetchImpl, now: Date.now(), force: String(banner.id) === String(latest?.id),
    })));
    events.push(...batch.filter(Boolean));
  }
  return events;
}

module.exports = { name: SOURCE_NAME, collect, extractBannerList, russianUrl, promotionType, poolFromText, pageInfo, resolveBanner };
