// Drinky sync server: owns the drink schedule and today's progress, pushes
// state to every device over Server-Sent Events. No dependencies.
//   node server.mjs   (PORT=8196, DATA_FILE=./data/state.json, TZ, ALLOW_LOGIN)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadVapid, sendPush } from "./push.mjs";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_FILE ?? path.join(DIR, "data", "state.json");
const PORT = Number(process.env.PORT ?? 8196);
const ALLOW_LOGIN = process.env.ALLOW_LOGIN; // e.g. greeenos@github
const SNOOZE_MS = 5 * 60_000;
const MIN_GAP_MS = 5 * 60_000;

export const defaultState = () => ({
  settings: {
    enabled: true,
    sipMl: 50, // one reminder = one sip
    dailyGoalMl: 2000,
    startMin: 9 * 60,
    endMin: 18 * 60,
    days: [1, 2, 3, 4, 5], // 0 = Sunday
  },
  date: "",
  drankMl: 0,
  history: {}, // date -> ml, last 30 finished days
  nextAt: null, // epoch ms of the next reminder
  active: false, // a reminder is showing on every device
});

const localDate = (now) => new Date(now).toLocaleDateString("sv-SE");

function inHours(s, now) {
  const d = new Date(now);
  const min = d.getHours() * 60 + d.getMinutes();
  return s.days.includes(d.getDay()) && min >= s.startMin && min < s.endMin;
}

// Random gap to the next reminder: spread the sips still needed over the rest
// of the working day, then jitter ±50% so reminders don't feel mechanical.
export function nextDelay(st, now, rand = Math.random) {
  const s = st.settings;
  const sipsLeft = Math.max(
    1,
    Math.ceil((s.dailyGoalMl - st.drankMl) / s.sipMl),
  );
  const d = new Date(now);
  const minLeft = s.endMin - (d.getHours() * 60 + d.getMinutes());
  const avg = Math.max(MIN_GAP_MS, (minLeft * 60_000) / (sipsLeft + 1));
  return Math.round(avg * (0.5 + rand()));
}

// Advance the schedule to `now`. Mutates st.
export function tick(st, now, rand = Math.random) {
  const s = st.settings;
  if (st.date !== localDate(now)) {
    if (st.date) {
      const days = Object.entries({ ...st.history, [st.date]: st.drankMl });
      st.history = Object.fromEntries(days.sort().slice(-30));
    }
    st.date = localDate(now);
    st.drankMl = 0;
  }
  const done = !s.enabled || st.drankMl >= s.dailyGoalMl;
  if (done) st.active = false;
  if (done || !inHours(s, now)) st.nextAt = null;
  else if (st.nextAt === null) st.nextAt = now + nextDelay(st, now, rand);
  else if (!st.active && now >= st.nextAt) st.active = true;
}

function int(v, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error("bad value");
  return n;
}

export function cleanSettings(s) {
  if (!Array.isArray(s.days)) throw new Error("bad days");
  return {
    enabled: Boolean(s.enabled),
    sipMl: int(s.sipMl, 1, 1000),
    dailyGoalMl: int(s.dailyGoalMl, 1, 20000),
    startMin: int(s.startMin, 0, 1440),
    endMin: int(s.endMin, 0, 1440),
    days: [...new Set(s.days.map((d) => int(d, 0, 6)))].sort(),
  };
}

// Apply a user action. Returns false for unknown actions; throws on bad input.
export function act(st, action, now, body = {}, rand = Math.random) {
  const s = st.settings;
  switch (action) {
    case "drink": // a sip by default; {ml} logs a glass or bottle
      st.drankMl += body.ml === undefined ? s.sipMl : int(body.ml, 1, 3000);
      Object.assign(st, {
        active: false,
        nextAt: now + nextDelay(st, now, rand),
      });
      break;
    case "skip":
      Object.assign(st, {
        active: false,
        nextAt: now + nextDelay(st, now, rand),
      });
      break;
    case "snooze":
      Object.assign(st, { active: false, nextAt: now + SNOOZE_MS });
      break;
    case "remind":
      st.active = true;
      break;
    case "settings":
      st.settings = cleanSettings({ ...s, ...body });
      st.nextAt = null;
      break;
    default:
      return false;
  }
  tick(st, now, rand);
  return true;
}

function serve() {
  let st = defaultState();
  try {
    const saved = JSON.parse(fs.readFileSync(DATA, "utf8"));
    st = { ...st, ...saved, settings: { ...st.settings, ...saved.settings } };
    st.settings = cleanSettings(st.settings); // drop fields of older versions
  } catch {
    // first run
  }
  const clients = new Set();

  // Web Push subscriptions (PWA on phones), keyed by endpoint.
  const dataDir = path.dirname(DATA);
  fs.mkdirSync(dataDir, { recursive: true });
  const vapid = loadVapid(path.join(dataDir, "vapid.json"));
  const subsFile = path.join(dataDir, "subs.json");
  const subs = new Map();
  try {
    for (const sub of JSON.parse(fs.readFileSync(subsFile, "utf8")))
      subs.set(sub.endpoint, sub);
  } catch {
    // no subscriptions yet
  }
  const saveSubs = () =>
    fs.writeFileSync(subsFile, JSON.stringify([...subs.values()]));

  // Desktop apps report while you're using the computer. Then the overlay
  // there is enough and phones stay quiet; away from it, phones get a push.
  let desktopActiveAt = 0;
  const atDesktop = () => Date.now() - desktopActiveAt < 90_000;

  const notifyAll = () => {
    const L = (ml) => (ml / 1000).toFixed(2);
    const payload = JSON.stringify({
      title: "Take a sip 💧",
      body: `~${st.settings.sipMl} ml · ${L(st.drankMl)} / ${L(st.settings.dailyGoalMl)} L today`,
    });
    for (const sub of subs.values()) {
      sendPush(vapid, sub, payload)
        .then((status) => {
          if (status === 404 || status === 410) {
            subs.delete(sub.endpoint); // unsubscribed or expired
            saveSubs();
          } else if (status >= 400) console.warn(`push ${status}`);
        })
        .catch((e) => console.warn(`push failed: ${e.message}`));
    }
  };

  let wasActive = st.active;
  const publish = () => {
    fs.writeFileSync(`${DATA}.tmp`, JSON.stringify(st));
    fs.renameSync(`${DATA}.tmp`, DATA);
    const msg = `data: ${JSON.stringify(st)}\n\n`;
    for (const res of clients) res.write(msg);
    if (st.active && !wasActive && !atDesktop()) notifyAll();
    wasActive = st.active;
  };

  setInterval(() => {
    const before = JSON.stringify(st);
    tick(st, Date.now());
    if (JSON.stringify(st) !== before) publish();
  }, 5000);
  setInterval(() => {
    for (const res of clients) res.write(": ping\n\n");
  }, 25_000);

  const page = (file, type) => (res) =>
    fs
      .createReadStream(path.join(DIR, "public", file))
      .on("error", () => res.writeHead(404).end())
      .once("open", () => res.writeHead(200, { "content-type": type }))
      .pipe(res);
  const pages = {
    "/": page("index.html", "text/html; charset=utf-8"),
    "/manifest.json": page("manifest.json", "application/manifest+json"),
    "/icon.png": page("icon.png", "image/png"),
    "/sw.js": page("sw.js", "text/javascript"),
  };

  http
    .createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      const json = (code, body) =>
        res
          .writeHead(code, { "content-type": "application/json" })
          .end(JSON.stringify(body));

      // Behind `tailscale serve`: only let in the configured tailnet user.
      if (ALLOW_LOGIN && req.headers["tailscale-user-login"] !== ALLOW_LOGIN) {
        return json(403, { error: "forbidden" });
      }

      if (req.method === "GET" && pages[url.pathname]) {
        return pages[url.pathname](res);
      }
      if (req.method === "GET" && url.pathname === "/api/vapid") {
        return json(200, { key: vapid.publicKey });
      }
      if (req.method === "GET" && url.pathname === "/api/state") {
        return json(200, st);
      }
      if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "x-accel-buffering": "no",
        });
        res.write(`data: ${JSON.stringify(st)}\n\n`);
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (req.method === "POST" && url.pathname.startsWith("/api/")) {
        let raw = "";
        req.on("data", (c) => {
          raw += c;
          if (raw.length > 10_000) req.destroy();
        });
        req.on("end", () => {
          const action = url.pathname.slice(5);
          try {
            const body = raw ? JSON.parse(raw) : {};
            if (action === "presence") {
              desktopActiveAt = Date.now();
              return json(200, { ok: true });
            }
            if (action === "subscribe" || action === "unsubscribe") {
              const { endpoint, keys } = body;
              if (!/^https:\/\//.test(endpoint))
                throw new Error("bad endpoint");
              if (action === "unsubscribe") subs.delete(endpoint);
              else if (
                typeof keys?.p256dh !== "string" ||
                typeof keys?.auth !== "string"
              )
                throw new Error("bad keys");
              else
                subs.set(endpoint, {
                  endpoint,
                  keys: { p256dh: keys.p256dh, auth: keys.auth },
                });
              saveSubs();
              return json(200, { ok: true });
            }
            if (!act(st, action, Date.now(), body)) {
              return json(404, { error: "unknown action" });
            }
          } catch (e) {
            return json(400, { error: String(e.message) });
          }
          publish();
          json(200, st);
        });
        return;
      }
      json(404, { error: "not found" });
    })
    .listen(PORT, () => console.log(`Drinky server on :${PORT}`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) serve();
