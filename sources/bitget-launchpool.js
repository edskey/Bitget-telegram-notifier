const { timerFromEndTime } = require('./bitget-candybomb');
const { poolValueInUsdt } = require('./coin-gecko');

const SOURCE_NAME = 'bitget-launchpool';
const API_URL = 'https://www.bitget.com/v1/finance/launchpool/product/list/v2';

function productEndTime(product) {
  return product?.farmingEnd || product?.farmingEndTime || product?.endTime || product?.activityEndTime;
}

async function normalizeProduct(product, { fetchImpl, now, force = false }) {
  const id = String(product?.productId || product?.id || '');
  const title = String(product?.productName || product?.projectName || product?.productCoinName || '').trim();
  const endTime = productEndTime(product);
  if (!id || !title || !endTime) throw new Error('Launchpool product is missing id, title, or end time');
  const pools = Array.isArray(product.productSubList) ? product.productSubList : [];
  const rewardAmount = product.totalInterestAmount || product.totalRewardAmount || pools.reduce((sum, pool) => sum + Number(pool.totalInterestAmount || pool.totalRewardAmount || 0), 0);
  const rewardToken = product.productCoinName || product.rewardCoinName || pools[0]?.productCoinName || pools[0]?.rewardCoinName;
  const pool = rewardAmount && rewardToken
    ? await poolValueInUsdt(rewardAmount, rewardToken, { fetchImpl })
    : 'Не указан';
  return {
    source: SOURCE_NAME,
    id: `bitget-launchpool:${id}`,
    dedupeKey: `launchpool:${title.toLowerCase()}`,
    title,
    url: `https://www.bitget.com/ru/events/launchpool/${encodeURIComponent(id)}`,
    fields: [
      ['Тип промо', 'Фиксированные награды'],
      ['Пул', pool],
      ['Заканчивается через', timerFromEndTime(endTime, now)],
    ],
    ...(force ? { force: true } : {}),
  };
}

async function collect({ fetchImpl = fetch, forceLatest = false } = {}) {
  const statuses = [1, 2]; // upcoming and active, as defined by Bitget's public client.
  const responses = [];
  for (const status of statuses) {
    let response = await fetchImpl(API_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', locale: 'ru_RU' },
      body: JSON.stringify({ matchType: 0, sortType: 1, status, pageSize: 50 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      response = await fetchImpl(API_URL, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', locale: 'ru_RU' },
        body: JSON.stringify({ matchType: 0, sortType: 1, status, pageSize: 50 }),
        signal: AbortSignal.timeout(20_000),
      });
    }
    if (!response.ok) throw new Error(`Bitget Launchpool API ${response.status}`);
    const body = await response.json();
    if (String(body?.code) !== '200') throw new Error(`Bitget Launchpool API: ${body?.msg || body?.code || 'unknown error'}`);
    responses.push(body?.data?.data);
  }
  const products = responses.flat();
  if (!products.every(Array.isArray)) throw new Error('Bitget Launchpool API has no data array');
  const unique = [...new Map(products.flat().map((product) => [String(product.productId || product.id), product])).values()];
  const latest = forceLatest && unique.reduce((last, product) => Number(product?.farmingStart || product?.startTime || 0) > Number(last?.farmingStart || last?.startTime || 0) ? product : last, null);
  return Promise.all(unique.map((product) => normalizeProduct(product, {
    fetchImpl, now: Date.now(), force: String(product.productId || product.id) === String(latest?.productId || latest?.id),
  })));
}

module.exports = { name: SOURCE_NAME, collect, normalizeProduct };
