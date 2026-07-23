const { poolInUsdt } = require('./bitget-candybomb');

const STABLECOINS = new Set(['USDT', 'USDC']);

async function poolValueInUsdt(amount, token, { fetchImpl = fetch, apiKey = process.env.COINGECKO_DEMO_API_KEY } = {}) {
  const numericAmount = Number(amount);
  const symbol = String(token || '').trim().toUpperCase();
  if (!Number.isFinite(numericAmount) || !symbol) throw new Error('Promotion pool has invalid amount or token');
  if (STABLECOINS.has(symbol)) return poolInUsdt(numericAmount);
  if (!apiKey) throw new Error(`Missing COINGECKO_DEMO_API_KEY for ${symbol} pool conversion`);

  const headers = { Accept: 'application/json', 'x-cg-demo-api-key': apiKey };
  const search = await fetchImpl(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`, {
    headers, signal: AbortSignal.timeout(10_000),
  });
  if (!search.ok) throw new Error(`CoinGecko search ${search.status}`);
  const matches = (await search.json()).coins || [];
  const coin = matches
    .filter((item) => String(item.symbol || '').toUpperCase() === symbol)
    .sort((left, right) => (left.market_cap_rank || Infinity) - (right.market_cap_rank || Infinity))[0];
  if (!coin?.id) throw new Error(`CoinGecko has no unambiguous match for ${symbol}`);

  const price = await fetchImpl(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin.id)}&vs_currencies=usd`, {
    headers, signal: AbortSignal.timeout(10_000),
  });
  if (!price.ok) throw new Error(`CoinGecko price ${price.status}`);
  const usdPrice = Number((await price.json())?.[coin.id]?.usd);
  if (!Number.isFinite(usdPrice)) throw new Error(`CoinGecko returned no USD price for ${symbol}`);
  return poolInUsdt(numericAmount * usdPrice);
}

module.exports = { poolValueInUsdt };
