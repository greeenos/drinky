# Drinky 💧

Drink-water reminders on every device at once. Default: 5 × 400 ml = 2 L a day.

- **`server/`** – one dependency-free Node file. Owns the schedule and today's progress, pushes state over SSE, and serves the web page (settings + overlay; add it to the iPhone home screen as a PWA).
- **`src-tauri/`** – the desktop app (Windows, macOS, ~2 MB). Lives in the tray, follows the server, and covers every monitor with the server's overlay while a reminder is due.

Based on [BreakTimer](https://github.com/tom-james-watson/breaktimer-app) by Tom Watson (GPL-3.0-or-later).

## Server

```bash
cd server && docker build -t drinky-server .
docker run -d --name drinky-server --restart unless-stopped \
  -p 127.0.0.1:8196:8196 -v drinky-data:/data \
  -e TZ=Europe/Prague -e ALLOW_LOGIN=you@github drinky-server
tailscale serve --bg --https=10454 http://127.0.0.1:8196
```

`ALLOW_LOGIN` only admits that Tailscale user (header set by `tailscale serve`). Tests: `node --test server/server.test.mjs`.

## Desktop app

Download from [Releases](../../releases), then enter the server address on first launch.
macOS builds are unsigned: after copying to Applications run `xattr -cr /Applications/Drinky.app` once.

Develop: `npx @tauri-apps/cli@2 dev`. Release: push a `vX.Y.Z` tag.
