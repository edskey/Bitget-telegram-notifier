# Bitget CandyBomb Telegram monitor

Проверяет раздел «Все → Проходит сейчас» на [Bitget CandyBomb](https://www.bitget.com/ru/events/candy-bomb) каждые 5 минут. Используется публичный JSON-метод Bitget без авторизации, cookies и браузерного парсинга.

Новая карточка отправляется отдельным русскоязычным сообщением:

```text
👇 <название>

🔵 Тип: Спот, Фьючерсы
🔵 Таймер: 2д 4ч 15м

🔵 Ссылка: Открыть
```

`id` Bitget — единственный идентификатор события: изменение обратного отсчёта не создаёт уведомление.

## Первый запуск

Первый успешный запуск сохраняет все текущие карточки как базу и не отправляет сообщений. В том числе пустой список сохраняется как база. Уведомления начинаются только для карточек, появившихся позднее.

## Настройка секретов

Добавьте только в Vercel Environment Variables и GitHub Actions Secrets (не в репозиторий):

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID` — `@channel_name` или ID группы/канала
- `CHECK_SECRET` — одинаковое случайное значение в Vercel и GitHub
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `VERCEL_CHECK_URL` — только в GitHub Actions, полный адрес `/api/check`

Для канала бот должен быть администратором. Vercel хранит состояние и выполняет защищённый endpoint; GitHub Actions запускает сбор каждые пять минут.

## Локальная проверка без Telegram

```bash
npm test
node scripts/collect.js
```

`scripts/collect.js` лишь печатает найденные события и не вызывает Telegram или Redis.
