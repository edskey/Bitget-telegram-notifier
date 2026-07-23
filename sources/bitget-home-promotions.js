const { timerFromEndTime } = require('./bitget-candybomb');
const { poolValueInUsdt } = require('./coin-gecko');

const SOURCE_NAME = 'bitget-home-promotions';
const HOME_URL = 'https://www.bitget.com/ru';
const EARNINGS_PATH = '/ru/launchhub/earnings-prediction';
const BITGET_API = 'https://www.bitget.com/v1';

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
  return url.origin === 'https://www.bitget.com' && url.pathname.startsWith('/ru/') ? url : null;
}

function promotionType(applyLine) {
  if (String(applyLine).toUpperCase() === 'SPOT') return 'Спот';
  if (['FUTURES', 'CONTRACT', 'MIX'].includes(String(applyLine).toUpperCase())) return 'Фьючерсы';
  return 'Неопределенно';
}

async function postJson(path, data, fetchImpl) {
  const response = await fetchImpl(`${BITGET_API}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', locale: 'ru_RU' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Bitget promotion API ${response.status}`);
  const payload = await response.json();
  if (payload?.code !== '00000') throw new Error(`Bitget promotion API: ${payload?.msg || payload?.code || 'unknown error'}`);
  return payload.data;
}

async function resolveEarningsPrediction(banner, { fetchImpl, now, force = false }) {
  const [info, sessionData] = await Promise.all([
    postJson('/act/stock/earnings/vote/info', {}, fetchImpl),
    postJson('/act/stock/earnings/vote/session/list', {}, fetchImpl),
  ]);
  const sessions = (sessionData?.sessions || []).filter((session) => Number(session.status) === 20);
  // Bitget can keep a homepage banner visible briefly after its authoritative
  // sessions list is empty. This is a completed promotion, not a collector
  // failure; skip it so it cannot block independent sources such as CandyBomb.
  if (!sessions.length) return null;

  const values = await Promise.all(sessions.map((session) =>
    poolValueInUsdt(session.totalPool, session.ticketInfo?.token, { fetchImpl })
  ));
  const totalPool = values.reduce((sum, value) => sum + Number(String(value).replace(/[^0-9,.-]/g, '').replace(/\s| /g, '').replace(',', '.')), 0);
  const pool = sessions.length === 1 ? values[0] : `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(totalPool)} USDT`;

  return {
    source: SOURCE_NAME,
    id: `bitget-home:${banner.id}`,
    title: String(banner.title || banner.secondTitle || '').trim(),
    url: new URL(banner.jumpUrl, HOME_URL).toString(),
    fields: [
      ['Тип промо', promotionType(sessions[0].ticketInfo?.applyLine)],
      ['Пул', pool],
      ['Заканчивается через', timerFromEndTime(info?.endTime, now)],
    ],
    ...(force ? { force: true } : {}),
  };
}

async function collect({ fetchImpl = fetch, forceLatest = false } = {}) {
  const response = await fetchImpl(HOME_URL, { headers: { Accept: 'text/html', 'Accept-Language': 'ru-RU' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Bitget home page ${response.status}`);
  const banners = extractBannerList(await response.text());
  const candidates = banners.filter((banner) => {
    const url = russianUrl(banner.jumpUrl);
    return url && String(banner.title || banner.secondTitle || '').trim() && url.pathname === EARNINGS_PATH;
  });
  const latestId = forceLatest && candidates.reduce((latest, banner) =>
    Number(banner.unixStartTime || 0) > Number(latest?.unixStartTime || 0) ? banner : latest, null)?.id;
  const resolved = await Promise.all(candidates.map((banner) => resolveEarningsPrediction(banner, {
    fetchImpl, now: Date.now(), force: String(banner.id) === String(latestId),
  })));
  return resolved.filter(Boolean);
}

module.exports = { name: SOURCE_NAME, collect, extractBannerList, promotionType, resolveEarningsPrediction };
