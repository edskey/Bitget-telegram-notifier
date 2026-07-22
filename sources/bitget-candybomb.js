const SOURCE_NAME = 'bitget-candybomb-current';
const API_URL = 'https://www.bitget.com/v1/act/candyBombNew/current/list';
const DETAIL_BASE_URL = 'https://www.bitget.com/ru/events/candy-bomb/detail/';

const TYPE_LABELS = { 1: 'Спот', 2: 'Фьючерсы', 3: 'Фиксированные награды' };

function timerFromEndTime(endTime, now = Date.now()) {
  const milliseconds = Number(endTime) - now;
  if (!Number.isFinite(milliseconds)) throw new Error('Bitget activity has invalid endTime');
  if (milliseconds <= 0) return 'Завершено';
  const totalMinutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  return `${days}д ${hours}ч ${minutes}м`;
}

function activityTypes(airDropTypeList) {
  if (!Array.isArray(airDropTypeList) || airDropTypeList.length === 0) throw new Error('Bitget activity has no airDropTypeList');
  const types = [...new Set(airDropTypeList.map((type) => TYPE_LABELS[type]).filter(Boolean))];
  if (types.length === 0) throw new Error('Bitget activity has unsupported reward types');
  return types.join(', ');
}

function parseActivities(data, now = Date.now()) {
  const activities = data?.data?.processingActivities;
  if (!Array.isArray(activities)) throw new Error('Bitget response has no processingActivities array');
  return activities.map((activity) => {
    const id = String(activity?.id || '');
    const title = String(activity?.name || '').trim();
    if (!id || !title) throw new Error('Bitget activity is missing id or name');
    return {
      source: SOURCE_NAME,
      id: `bitget-candybomb:${id}`,
      title,
      url: `${DETAIL_BASE_URL}${encodeURIComponent(id)}`,
      fields: [['Тип', activityTypes(activity.airDropTypeList)], ['Таймер', timerFromEndTime(activity.endTime, now)]],
    };
  });
}

async function collect() {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', locale: 'ru_RU' },
    body: JSON.stringify({ airDropType: 0, myActivity: 0, bl: 'all' }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Bitget CandyBomb API ${response.status}`);
  const data = await response.json();
  if (data?.code !== '00000') throw new Error(`Bitget CandyBomb API: ${data?.msg || data?.code || 'unknown error'}`);
  return parseActivities(data);
}

module.exports = { name: SOURCE_NAME, collect, parseActivities, timerFromEndTime };
