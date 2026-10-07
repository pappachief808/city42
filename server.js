import express from "express";
import Database from "better-sqlite3";
import crypto from "crypto";
import "dotenv/config";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;

app.use(express.json({ limit: "64kb" }));
app.use(express.static("public"));

const db = new Database("rayon42.db");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  username TEXT DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  money INTEGER NOT NULL DEFAULT 500,
  energy REAL NOT NULL DEFAULT 100,
  energy_updated_at INTEGER NOT NULL,
  reputation INTEGER NOT NULL DEFAULT 0,
  daily_claim_at INTEGER DEFAULT NULL,
  premium INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  reward_money INTEGER NOT NULL,
  reward_xp INTEGER NOT NULL,
  energy_cost INTEGER NOT NULL,
  min_level INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT NOT NULL,
  payload TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,
  stars INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  telegram_charge_id TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  paid_at INTEGER DEFAULT NULL
);
`);

// Upgrade old MVP databases safely.
for (const statement of [
  "ALTER TABLE users ADD COLUMN premium INTEGER NOT NULL DEFAULT 0"
]) {
  try { db.exec(statement); } catch (_) { /* column already exists */ }
}

const seedTasks = [
  [1, "Убраться во дворе", 80, 15, 5, 1],
  [2, "Помочь в гараже", 250, 40, 12, 1],
  [3, "Подработать таксистом", 600, 100, 25, 3],
  [4, "Договориться на рынке", 900, 140, 30, 5],
  [5, "Решить вопрос в баре", 1400, 220, 40, 8],
  [6, "Ночная подработка", 2200, 350, 55, 12],
  [7, "Большой заказ", 5000, 700, 75, 18]
];
const insertTask = db.prepare(`
  INSERT OR IGNORE INTO tasks (id,title,reward_money,reward_xp,energy_cost,min_level)
  VALUES (?,?,?,?,?,?)
`);
for (const t of seedTasks) insertTask.run(...t);

function validateInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  const pairs = [];
  for (const [key, value] of params.entries()) if (key !== "hash") pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  try { return JSON.parse(params.get("user") || "{}"); }
  catch { return null; }
}

function currentEnergy(user) {
  const elapsedSeconds = Math.max(0, Math.floor(Date.now() / 1000) - user.energy_updated_at);
  const regen = Math.floor(elapsedSeconds / 60) * (user.premium ? 2 : 1);
  return Math.min(100, user.energy + regen);
}

function syncEnergy(user) {
  const energy = currentEnergy(user);
  if (energy !== user.energy) {
    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE users SET energy=?, energy_updated_at=? WHERE telegram_id=?")
      .run(energy, now, user.telegram_id);
    user.energy = energy;
    user.energy_updated_at = now;
  }
  return user;
}

function getUserFromRequest(req) {
  if (req.headers["x-demo-user"] === "1") {
    let user = db.prepare("SELECT * FROM users WHERE telegram_id='demo'").get();
    if (!user) {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`INSERT INTO users
        (telegram_id, first_name, username, energy_updated_at, created_at)
        VALUES ('demo','Влад','demo',?,?)`).run(now, now);
      user = db.prepare("SELECT * FROM users WHERE telegram_id='demo'").get();
    }
    return syncEnergy(user);
  }

  const tg = validateInitData(req.headers["x-tg-init-data"]);
  if (!tg?.id) return null;
  const telegramId = String(tg.id);
  const now = Math.floor(Date.now() / 1000);

  let user = db.prepare("SELECT * FROM users WHERE telegram_id=?").get(telegramId);
  if (!user) {
    db.prepare(`INSERT INTO users
      (telegram_id, first_name, username, energy_updated_at, created_at)
      VALUES (?,?,?,?,?)`)
      .run(telegramId, tg.first_name || "Игрок", tg.username || "", now, now);
  } else {
    db.prepare("UPDATE users SET first_name=?, username=? WHERE telegram_id=?")
      .run(tg.first_name || user.first_name, tg.username || user.username, telegramId);
  }
  user = db.prepare("SELECT * FROM users WHERE telegram_id=?").get(telegramId);
  return syncEnergy(user);
}

function publicUser(user) {
  return {
    telegramId: user.telegram_id,
    firstName: user.first_name,
    username: user.username,
    level: user.level,
    xp: user.xp,
    xpToNext: user.level * 500,
    money: user.money,
    energy: Math.floor(user.energy),
    reputation: user.reputation,
    premium: Boolean(user.premium)
  };
}

function leaderboard() {
  return db.prepare(`SELECT first_name AS firstName, username, level, money, reputation, premium
    FROM users WHERE telegram_id != 'demo'
    ORDER BY level DESC, xp DESC, money DESC LIMIT 50`).all();
}

app.get("/health", (_req, res) => res.json({ ok: true, app: "rayon42", version: "2.0.0" }));

app.post("/api/auth", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Telegram authorization failed" });
  res.json({
    user: publicUser(user),
    tasks: db.prepare("SELECT * FROM tasks ORDER BY id").all(),
    leaderboard: leaderboard()
  });
});

app.post("/api/action", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const task = db.prepare("SELECT * FROM tasks WHERE id=?").get(Number(req.body?.taskId));
  if (!task) return res.status(404).json({ error: "Task not found" });
  if (user.level < task.min_level) return res.status(400).json({ error: `Нужен ${task.min_level} уровень` });
  if (user.energy < task.energy_cost) return res.status(400).json({ error: "Не хватает энергии" });

  const now = Math.floor(Date.now() / 1000);
  const result = db.transaction(() => {
    let xp = user.xp + task.reward_xp;
    let level = user.level;
    let money = user.money + task.reward_money;
    let reputation = user.reputation + Math.max(1, Math.floor(task.reward_xp / 25));
    while (xp >= level * 500 && level < 100) { xp -= level * 500; level += 1; }
    const energy = Math.max(0, user.energy - task.energy_cost);
    db.prepare(`UPDATE users SET level=?, xp=?, money=?, energy=?, reputation=?, energy_updated_at=? WHERE telegram_id=?`)
      .run(level, xp, money, energy, reputation, now, user.telegram_id);
    return { level, xp, money, energy, reputation };
  })();
  res.json({ ok: true, reward: task, user: result });
});

app.post("/api/daily", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const now = Math.floor(Date.now() / 1000);
  const today = new Date().toISOString().slice(0, 10);
  const claimed = user.daily_claim_at ? new Date(user.daily_claim_at * 1000).toISOString().slice(0, 10) : "";
  if (claimed === today) return res.status(400).json({ error: "Бонус уже получен сегодня" });
  const reward = 500 + user.level * 100;
  db.prepare("UPDATE users SET money=money+?, daily_claim_at=? WHERE telegram_id=?").run(reward, now, user.telegram_id);
  const fresh = db.prepare("SELECT * FROM users WHERE telegram_id=?").get(user.telegram_id);
  res.json({ ok: true, reward, user: publicUser(fresh) });
});

app.post("/api/spin", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const cost = 100;
  if (user.money < cost) return res.status(400).json({ error: "Не хватает денег" });
  const symbols = ["🍒", "🍋", "🔔", "⭐", "7️⃣", "🍉"];
  const a = symbols[crypto.randomInt(symbols.length)];
  const b = symbols[crypto.randomInt(symbols.length)];
  const c = symbols[crypto.randomInt(symbols.length)];
  let win = 0;
  if (a === b && b === c) win = 1000;
  else if (a === b || b === c || a === c) win = 200;
  const tx = db.transaction(() => {
    db.prepare("UPDATE users SET money=money-?+? WHERE telegram_id=?").run(cost, win, user.telegram_id);
    return db.prepare("SELECT * FROM users WHERE telegram_id=?").get(user.telegram_id);
  })();
  res.json({ ok: true, symbols: [a,b,c], win, cost, user: publicUser(tx) });
});

app.post("/api/buy", (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const kind = String(req.body?.kind || "");
  const prices = { energy50: 250, glasses: 2000 };
  if (!prices[kind]) return res.status(400).json({ error: "Unknown item" });
  const price = prices[kind];
  if (user.money < price) return res.status(400).json({ error: "Не хватает денег" });
  let reward = {};
  if (kind === "energy50") reward = { energy: Math.min(100, user.energy + 50) };
  if (kind === "glasses") reward = { reputation: user.reputation + 5 };
  db.prepare("UPDATE users SET money=money-?, energy=?, reputation=? WHERE telegram_id=?")
    .run(price, reward.energy ?? user.energy, reward.reputation ?? user.reputation, user.telegram_id);
  const fresh = db.prepare("SELECT * FROM users WHERE telegram_id=?").get(user.telegram_id);
  res.json({ ok: true, item: kind, user: publicUser(fresh) });
});

app.post("/api/stars/invoice", async (req, res) => {
  const user = getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!BOT_TOKEN) return res.status(400).json({ error: "BOT_TOKEN не настроен" });
  const kind = String(req.body?.kind || "");
  const products = {
    premium: { stars: 499, title: "Район 42 PREMIUM", description: "VIP-рамка, ускоренное восстановление энергии и премиум-статус" },
    energy100: { stars: 79, title: "Энергия +100", description: "Набор энергии для игры" }
  };
  const product = products[kind];
  if (!product) return res.status(400).json({ error: "Unknown product" });
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `rayon42:${user.telegram_id}:${kind}:${nonce}`;
  db.prepare(`INSERT INTO payments (telegram_id,payload,kind,stars,created_at) VALUES (?,?,?,?,?)`)
    .run(user.telegram_id, payload, kind, product.stars, Math.floor(Date.now() / 1000));

  try {
    const response = await tg("createInvoiceLink", {
      title: product.title,
      description: product.description,
      payload,
      provider_token: "",
      currency: "XTR",
      prices: [{ label: product.title, amount: product.stars }]
    });
    if (!response.ok) throw new Error(response.description || "Telegram invoice error");
    res.json({ ok: true, invoice: response.result, stars: product.stars });
  } catch (e) {
    db.prepare("UPDATE payments SET status='failed' WHERE payload=?").run(payload);
    res.status(502).json({ error: e.message });
  }
});

app.get("/api/leaderboard", (_req, res) => res.json({ leaderboard: leaderboard() }));

async function tg(method, body = {}) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
  return r.json();
}

async function startBot() {
  if (!BOT_TOKEN) {
    console.log("BOT_TOKEN is empty — browser demo is available at", APP_URL);
    return;
  }
  try {
    await tg("deleteWebhook", { drop_pending_updates: false });
    await tg("setMyCommands", { commands: [
      { command: "start", description: "Запустить РАЙОН 42" },
      { command: "game", description: "Открыть игру" }
    ]});
    await tg("setChatMenuButton", { menu_button: { type: "web_app", text: "🎮 Играть", web_app: { url: APP_URL } } });
  } catch (e) { console.error("Bot setup error:", e); }

  let offset = 0;
  console.log(`Telegram bot polling active. Mini App: ${APP_URL}`);
  while (true) {
    try {
      const data = await tg("getUpdates", { timeout: 30, offset, allowed_updates: ["message", "pre_checkout_query"] });
      if (!data.ok) { await new Promise(r => setTimeout(r, 2000)); continue; }
      for (const update of data.result) {
        offset = update.update_id + 1;

        if (update.pre_checkout_query) {
          await tg("answerPreCheckoutQuery", { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
          continue;
        }

        const msg = update.message;
        if (!msg?.chat?.id) continue;

        if (msg.successful_payment) {
          const sp = msg.successful_payment;
          const payment = db.prepare("SELECT * FROM payments WHERE payload=?").get(sp.invoice_payload);
          if (payment && payment.status !== "paid") {
            const telegramId = String(msg.from?.id || payment.telegram_id);
            if (telegramId === payment.telegram_id) {
              const user = db.prepare("SELECT * FROM users WHERE telegram_id=?").get(telegramId);
              if (user) {
                if (payment.kind === "premium") {
                  db.prepare("UPDATE users SET premium=1, energy=MIN(100, energy+100) WHERE telegram_id=?").run(telegramId);
                } else if (payment.kind === "energy100") {
                  db.prepare("UPDATE users SET energy=MIN(100, energy+100) WHERE telegram_id=?").run(telegramId);
                }
              }
              db.prepare("UPDATE payments SET status='paid', telegram_charge_id=?, paid_at=? WHERE payload=?")
                .run(sp.telegram_payment_charge_id || "", Math.floor(Date.now()/1000), payment.payload);
              await tg("sendMessage", { chat_id: msg.chat.id, text: "✅ Покупка зачислена в РАЙОН 42." });
            }
          }
          continue;
        }

        const text = msg.text || "";
        if (text === "/start" || text === "/game") {
          await tg("sendMessage", {
            chat_id: msg.chat.id,
            text: `🔥 РАЙОН 42\n\nДобро пожаловать в свой район.\nПрокачивай уровень, зарабатывай игровую валюту и открывай новые места.\n\nЖми кнопку и заходи в игру 👇`,
            reply_markup: { inline_keyboard: [[{ text: "🎮 ИГРАТЬ", web_app: { url: APP_URL } }]] }
          });
        }
      }
    } catch (e) {
      console.error("Polling error:", e);
      await new Promise(r => setTimeout(r, 2500));
    }
  }
}

app.listen(PORT, () => { console.log(`Server listening on ${PORT}`); startBot(); });
