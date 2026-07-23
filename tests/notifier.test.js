const assert = require('node:assert/strict');
const test = require('node:test');
const handler = require('../api/check');

function responseCapture() {
  let status;
  let body;
  return {
    res: {
      status(value) { status = value; return this; },
      setHeader() {},
      end(value) { body = JSON.parse(value); },
    },
    result: () => ({ status, body }),
  };
}

test('rejects an invalid secret before external calls', async (context) => {
  process.env.CHECK_SECRET = 'correct';
  context.mock.method(global, 'fetch', async () => { throw new Error('must not fetch'); });
  const capture = responseCapture();
  await handler({ method: 'POST', headers: { authorization: 'Bearer wrong' }, body: {} }, capture.res);
  assert.deepEqual(capture.result(), { status: 401, body: { error: 'unauthorized' } });
});

test('baselines a source, sends later events separately, and deduplicates them', async (context) => {
  Object.assign(process.env, {
    CHECK_SECRET: 'secret',
    UPSTASH_REDIS_REST_URL: 'https://redis.test',
    UPSTASH_REDIS_REST_TOKEN: 'redis-token',
    TELEGRAM_BOT_TOKEN: 'bot-token',
    TELEGRAM_CHAT_ID: '@channel',
  });
  let state = null;
  const telegram = [];
  context.mock.method(global, 'fetch', async (url, options = {}) => {
    if (String(url) === 'https://redis.test') {
      const command = JSON.parse(options.body);
      if (command[0] === 'SET' && command.includes('NX')) return new Response(JSON.stringify({ result: 'OK' }));
      if (command[0] === 'GET') return new Response(JSON.stringify({ result: state && JSON.stringify(state) }));
      if (command[0] === 'SET') state = JSON.parse(command[2]);
      return new Response(JSON.stringify({ result: null }));
    }
    if (String(url).includes('/sendMessage')) {
      telegram.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ ok: true, result: { message_id: telegram.length, chat: { username: 'channel' } } }));
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  const invoke = async (events) => {
    const capture = responseCapture();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
      body: { sources: ['offers'], events },
    }, capture.res);
    return capture.result();
  };

  const event = (id) => ({
    source: 'offers', id, title: `Offer ${id}`, url: `https://example.com/${id}`,
    fields: [['Timer', '01:00:00']],
  });
  assert.equal((await invoke([event('old')])).body.sent, 0);
  const delivered = await invoke([event('old'), event('one'), event('two')]);
  assert.equal(delivered.body.sent, 2);
  assert.deepEqual(delivered.body.deliveries, [
    { source: 'offers', id: 'two', telegram: { messageId: 1, chat: '@channel' } },
    { source: 'offers', id: 'one', telegram: { messageId: 2, chat: '@channel' } },
  ]);
  assert.equal(telegram.length, 2);
  assert(telegram.every((message) => message.parse_mode === 'HTML'));
  assert.match(telegram[0].text, /^🔥 <b>Новая промоакция Bitget<\/b>/);
  assert.match(telegram[0].text, /🔵 <b>Название:<\/b> Offer two/);
  assert.equal((await invoke([event('old'), event('one'), event('two')])).body.sent, 0);
  assert.equal(telegram.length, 2);
});

test('sends an explicitly forced real-card test even during first initialization', async (context) => {
  Object.assign(process.env, { CHECK_SECRET: 'secret', UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'redis-token', TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: '@channel' });
  let state = null;
  let telegramCalls = 0;
  context.mock.method(global, 'fetch', async (url, options = {}) => {
    if (String(url) === 'https://redis.test') {
      const command = JSON.parse(options.body);
      if (command[0] === 'SET' && command.includes('NX')) return new Response(JSON.stringify({ result: 'OK' }));
      if (command[0] === 'GET') return new Response(JSON.stringify({ result: state && JSON.stringify(state) }));
      if (command[0] === 'SET') state = JSON.parse(command[2]);
      return new Response(JSON.stringify({ result: null }));
    }
    if (String(url).includes('/sendMessage')) { telegramCalls += 1; return new Response(JSON.stringify({ ok: true, result: { message_id: telegramCalls, chat: { username: 'channel' } } })); }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const capture = responseCapture();
  await handler({ method: 'POST', headers: { authorization: 'Bearer secret' }, body: { sources: ['offers'], events: [{ source: 'offers', id: 'real-card', title: 'Real card', url: 'https://example.com', force: true, fields: [] }] } }, capture.res);
  assert.equal(capture.result().body.sent, 1);
  assert.equal(telegramCalls, 1);
});

test('suppresses a confidently matching promotion reported by a second source', async (context) => {
  Object.assign(process.env, { CHECK_SECRET: 'secret', UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'redis-token', TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: '@channel' });
  let state = { sources: { candy: { sentIds: ['old'] }, support: { sentIds: ['old'] } }, dedupeKeys: ['candybomb:sol'] };
  let calls = 0;
  context.mock.method(global, 'fetch', async (url, options = {}) => {
    if (String(url) === 'https://redis.test') {
      const command = JSON.parse(options.body);
      if (command[0] === 'SET' && command.includes('NX')) return new Response(JSON.stringify({ result: 'OK' }));
      if (command[0] === 'GET') return new Response(JSON.stringify({ result: JSON.stringify(state) }));
      if (command[0] === 'SET') state = JSON.parse(command[2]);
      return new Response(JSON.stringify({ result: null }));
    }
    if (String(url).includes('/sendMessage')) { calls += 1; return new Response(JSON.stringify({ ok: true, result: { message_id: calls, chat: { username: 'channel' } } })); }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const capture = responseCapture();
  await handler({ method: 'POST', headers: { authorization: 'Bearer secret' }, body: {
    sources: ['candy', 'support'],
    events: [
      { source: 'candy', id: 'new-candy', dedupeKey: 'candybomb:sol', title: 'SOL', url: 'https://example.com/candy', fields: [] },
      { source: 'support', id: 'new-support', dedupeKey: 'candybomb:sol', title: 'CandyBomb x SOL', url: 'https://example.com/support', fields: [] },
    ],
  } }, capture.res);
  assert.equal(capture.result().body.sent, 0);
  assert.equal(calls, 0);
});

test('checkpoints each message so a later Telegram failure is retried alone', async (context) => {
  Object.assign(process.env, { CHECK_SECRET: 'secret', UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'redis-token', TELEGRAM_BOT_TOKEN: 'bot-token', TELEGRAM_CHAT_ID: '@channel' });
  let state = null;
  let telegramCalls = 0;
  context.mock.method(global, 'fetch', async (url, options = {}) => {
    if (String(url) === 'https://redis.test') {
      const command = JSON.parse(options.body);
      if (command[0] === 'SET' && command.includes('NX')) return new Response(JSON.stringify({ result: 'OK' }));
      if (command[0] === 'GET') return new Response(JSON.stringify({ result: state && JSON.stringify(state) }));
      if (command[0] === 'SET') state = JSON.parse(command[2]);
      return new Response(JSON.stringify({ result: null }));
    }
    if (String(url).includes('/sendMessage')) {
      telegramCalls += 1;
      return telegramCalls === 2 ? new Response(JSON.stringify({ ok: false, description: 'temporary failure' }), { status: 500 }) : new Response(JSON.stringify({ ok: true, result: { message_id: telegramCalls, chat: { username: 'channel' } } }));
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const event = (id) => ({ source: 'offers', id, title: id, url: `https://example.com/${id}`, fields: [] });
  const invoke = async (events) => {
    const capture = responseCapture();
    await handler({ method: 'POST', headers: { authorization: 'Bearer secret' }, body: { sources: ['offers'], events } }, capture.res);
    return capture.result();
  };
  await invoke([event('old')]);
  assert.equal((await invoke([event('old'), event('one'), event('two')])).status, 500);
  assert.equal((await invoke([event('old'), event('one'), event('two')])).body.sent, 1);
  assert.equal(telegramCalls, 3);
});
