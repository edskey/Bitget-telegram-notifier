const assert = require('node:assert/strict');
const test = require('node:test');
const { poolValueInUsdt } = require('../sources/coin-gecko');

test('does not call CoinGecko for USDT or USDC pools', async () => {
  const fetchImpl = async () => { throw new Error('must not fetch'); };
  assert.equal(await poolValueInUsdt(2500, 'USDC', { fetchImpl }), '2 500 USDT');
});

test('converts a non-stablecoin pool through authenticated CoinGecko calls', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    if (String(url).includes('/search?')) return new Response(JSON.stringify({ coins: [{ id: 'solana', symbol: 'sol', market_cap_rank: 6 }] }));
    return new Response(JSON.stringify({ solana: { usd: 150 } }));
  };
  assert.equal(await poolValueInUsdt(10, 'SOL', { fetchImpl, apiKey: 'demo-key' }), '1 500 USDT');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['x-cg-demo-api-key'], 'demo-key');
});
