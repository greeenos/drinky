// Drinky sync server: owns the drink schedule and today's progress, pushes
// state to every device over Server-Sent Events. No dependencies.
//   node server.mjs   (PORT=8196, DATA_FILE=./data/state.json, TZ, ALLOW_LOGIN)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_FILE ?? path.join(DIR, "data", "state.json");
const PORT = Number(process.env.PORT ?? 8196);
const ALLOW_LOGIN = process.env.ALLOW_LOGIN; // e.g. greeenos@github
const SNOOZE_MS = 5 * 60_000;

export const defaultState = () => ({
  settings: {
    enabled: true,
    glassMl: 400,
    dailyGoalMl: 2000,
    intervalMin: 105,
    startMin: 9 * 60,
    endMin: 18 * 60,
    days: [1, 2, 3, 4, 5], // 0 = Sunday
  },
  date: "",
  drankMl: 0,
  nextAt: null, // epoch ms of the next reminder
  active: false, // a reminder is showing on every device
});

const localDate = (now) => new Date(now).toLocaleDateString("sv-SE");

function inHours(s, now) {
  const d = new Date(now);
  const min = d.getHours() * 60 + d.getMinutes();
  return s.days.includes(d.getDay()) && min >= s.startMin && min < s.endMin;
}

// Advance the schedule to `now`. Mutates st.
export function tick(st, now) {
  const s = st.settings;
  if (st.date !== localDate(now)) {
    st.date = localDate(now);
    st.drankMl = 0;
  }
  const done = !s.enabled || st.drankMl >= s.dailyGoalMl;
  if (done) st.active = false;
  if (done || !inHours(s, now)) st.nextAt = null;
  else if (st.nextAt === null) st.nextAt = now + s.intervalMin * 60_000;
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
    glassMl: int(s.glassMl, 1, 5000),
    dailyGoalMl: int(s.dailyGoalMl, 1, 20000),
    intervalMin: int(s.intervalMin, 1, 1440),
    startMin: int(s.startMin, 0, 1440),
    endMin: int(s.endMin, 0, 1440),
    days: [...new Set(s.days.map((d) => int(d, 0, 6)))].sort(),
  };
}

// Apply a user action. Returns false for unknown actions; throws on bad input.
export function act(st, action, now, body = {}) {
  const s = st.settings;
  const next = now + s.intervalMin * 60_000;
  switch (action) {
    case "drink":
      st.drankMl += s.glassMl;
      Object.assign(st, { active: false, nextAt: next });
      break;
    case "skip":
      Object.assign(st, { active: false, nextAt: next });
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
  tick(st, now);
  return true;
}

function serve() {
  let st = defaultState();
  try {
    st = { ...st, ...JSON.parse(fs.readFileSync(DATA, "utf8")) };
  } catch {
    // first run
  }
  const clients = new Set();

  const publish = () => {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    fs.writeFileSync(`${DATA}.tmp`, JSON.stringify(st));
    fs.renameSync(`${DATA}.tmp`, DATA);
    const msg = `data: ${JSON.stringify(st)}\n\n`;
    for (const res of clients) res.write(msg);
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
          try {
            const body = raw ? JSON.parse(raw) : {};
            if (!act(st, url.pathname.slice(5), Date.now(), body)) {
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
