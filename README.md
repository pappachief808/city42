# РАЙОН 42 — Telegram Mini App MVP v2

Готовый каркас первой версии игры под Telegram. Визуальный стиль переработан под референс: яркая иллюстрация, район/двор, крупный персонаж, карточки действий, игровой зал, рейтинг, магазин.

## Запуск

Требуется Node.js 20+.

```bash
npm install
cp .env.example .env
# впиши BOT_TOKEN и HTTPS APP_URL
npm start
```

Без токена можно посмотреть демо-режим на `http://localhost:3000`.

Для реального Telegram Mini App нужен HTTPS. После запуска укажи URL Mini App через @BotFather (Main Mini App или menu button). Telegram передаёт Mini App `initData`; сервер проекта проверяет подпись и срок действия данных перед использованием. См.: https://core.telegram.org/bots/webapps

## Что реализовано

- Telegram bot `/start` и `/game`
- кнопка `🎮 ИГРАТЬ`
- Telegram Mini App
- серверная валидация `initData`
- SQLite
- персонаж
- уровень / XP
- энергия с регенерацией
- деньги
- репутация
- задания и открытие по уровню
- карта района
- инвентарь
- профиль
- рейтинг
- ежедневный бонус
- магазин за внутриигровую валюту
- серверная мини-игра «Игровой зал»
- Telegram Stars: invoice для PREMIUM и энергии
- обработка `pre_checkout_query` и `successful_payment`

## Оплата

Для цифровых товаров внутри Telegram проект использует Telegram Stars (`XTR`). Invoice создаётся через Bot API `createInvoiceLink`, а покупка начисляется только после получения `successful_payment`. Документация: https://core.telegram.org/bots/payments-stars и https://core.telegram.org/bots/api#createinvoicelink

В MVP доступны:

- PREMIUM — 499 Stars
- Энергия +100 — 79 Stars

## База данных

SQLite хранит игроков, задания и платежи. Для пилота этого достаточно. При росте проекта разумно перейти на PostgreSQL.

## Структура

- `server.js` — API + bot polling + Stars
- `public/index.html` — экраны
- `public/styles.css` — визуал
- `public/app.js` — клиентская логика
- `public/assets/design-reference.png` — визуальный референс, с которого начинали дизайн

## Что добавлять после пилота

Админ-панель, полноценные предметы и экипировка, квесты, достижения, друзья/рефералы, кланы, PvP, сюжетные локации и аналитика экономики.
