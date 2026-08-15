const adapters = require('../sources');

const MAX_EVENTS = 500;

function validateEvent(event, sourceName) {
  if (!event || event.source !== sourceName || !event.id || !event.title || !event.url) {
    throw new Error(`Invalid event returned by ${sourceName}`);
  }
  return {
    source: String(event.source).slice(0, 100),
    id: String(event.id).slice(0, 1000),
    dedupeKey: event.dedupeKey ? String(event.dedupeKey).slice(0, 300) : '',
    title: String(event.title).slice(0, 300),
    url: String(event.url).slice(0, 2000),
    force: event.force === true,
    fields: Array.isArray(event.fields)
      ? event.fields.slice(0, 30).map(([label, value]) => [String(label).slice(0, 100), String(value).slice(0, 500)])
      : [],
  };
}

function reconcileCandyBombDuplicates(events) {
  const byToken = new Map();
  for (const event of events) {
    if (event.source !== 'bitget-candybomb-current') continue;
    const token = String(event.title || '').trim().toLowerCase();
    if (!token) continue;
    byToken.set(token, [...(byToken.get(token) || []), event]);
  }
  return events.map((event) => {
    if (event.source !== 'bitget-current-promotions') return event;
    const match = String(event.title || '').match(/candybomb\s*(?:x|×)?\s*([A-Z0-9]{2,12})/i);
    const candidates = match ? byToken.get(match[1].toLowerCase()) || [] : [];
    // Do not guess when several campaigns use the same token.  A matching
    // stablecoin pool already has its own key; otherwise only one candidate is
    // an unambiguous cross-source duplicate.
    if (candidates.length === 1 && candidates[0].dedupeKey) return { ...event, dedupeKey: candidates[0].dedupeKey };
    return event;
  });
}

function selectAdapters(adapterList, enabledSources = 'all') {
  const enabled = String(enabledSources || 'all').trim();
  if (enabled === 'all') return adapterList;
  const names = new Set(enabled.split(',').map((name) => name.trim()).filter(Boolean));
  const selected = adapterList.filter((adapter) => names.has(adapter.name));
  if (!selected.length || selected.length !== names.size) throw new Error(`Unknown or empty ENABLED_SOURCES: ${enabled}`);
  return selected;
}

async function main({ adapterList = adapters, enabledSources = process.env.ENABLED_SOURCES || 'all' } = {}) {
  const testSource = process.env.TEST_SOURCE || '';
  const selectedAdapters = selectAdapters(adapterList, enabledSources);
  const results = await Promise.all(selectedAdapters.map(async (adapter) => {
    if (!adapter?.name || typeof adapter.collect !== 'function') throw new Error('Invalid source adapter');
    const events = await adapter.collect({
      forceLatest: testSource === adapter.name,
    });
    if (!Array.isArray(events)) throw new Error(`${adapter.name} did not return an array`);
    return events.map((event) => validateEvent(event, adapter.name));
  }));
  const events = reconcileCandyBombDuplicates(results.flat()).slice(0, MAX_EVENTS);
  process.stderr.write(`Collected ${events.length} events from ${selectedAdapters.length} sources\n`);
  process.stdout.write(JSON.stringify({ sources: selectedAdapters.map((adapter) => adapter.name), events }));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { main, reconcileCandyBombDuplicates, validateEvent, selectAdapters };
