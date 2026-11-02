# Drinky 💧

Drink-water reminders on every device at once: one small sip per reminder, at random times spread over your day. Default: 2 L a day in 50 ml sips.

- **`server/`** – dependency-free Node. Owns the settings, the random schedule and today's progress, pushes state over SSE, and serves the web page. Add the page to the iPhone home screen and tap 🔔 to get push notifications (Web Push, iOS 16.4+).
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

`ALLOW_LOGIN` only admits that Tailscale user (header set by `tailscale serve`). Tests: `TZ=Europe/Prague node --test server/server.test.mjs server/push.test.mjs`.

## Desktop app

Download from [Releases](../../releases). On first launch the setup window asks for the server address, daily goal, sip size and hours; these are shared by all devices.
macOS builds are unsigned: after copying to Applications run `xattr -cr /Applications/Drinky.app` once.

Develop: `npx @tauri-apps/cli@2 dev`. Release: push a `vX.Y.Z` tag.
