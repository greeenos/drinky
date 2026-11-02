# Drinky 💧

Drinky reminds you to drink water on all your devices at the same time. Each reminder asks for one small sip, at a random time, and the sips are spread over your day. The default goal is 2 L a day in 50 ml sips.

You run one small server. Each desktop app and phone stays in sync with it, so when a reminder is due it appears everywhere, and tapping **Done** on one device clears it on all of them.

## Features

- **Fullscreen reminder on every monitor** (Windows, macOS, Linux). You can mark it done, snooze it for 5 minutes or skip it.
- **Phone notifications** through a PWA with Web Push. On iPhone this needs iOS 16.4 or later.
- **Notifies the device you're using.** While you're at a computer, only the overlay shows there and your phone stays quiet. When you step away, the phone gets the push.
- **Random sip schedule.** The next reminder comes after the time left in your day divided by the sips left, multiplied by a random factor between 0.5 and 1.5, and never sooner than 5 minutes.
- **Quick logs** for a whole glass (+250 ml) or bottle (+500 ml). The rest of the schedule adjusts to them.
- **Last 7 days chart.** The server keeps 30 days of history.
- **Settings shared by all devices:** goal, sip size, active hours and active weekdays.
- **Small:** the desktop app is a ~2 MB installer and uses ~25 MB of RAM. The server is plain Node with no dependencies.

## Download

Grab the latest build from [Releases](../../releases/latest):

| Platform | File |
|---|---|
| Windows: installer | `Drinky_x.y.z_x64-setup.exe` |
| Windows: portable | `drinky_windows_x64.exe` (run it, no install) |
| macOS (Intel + Apple Silicon) | `Drinky_x.y.z_universal.dmg` |
| Linux | `Drinky_x.y.z_amd64.AppImage` or `.deb` |
| iPhone / Android | No download. Open your server's URL and add it to the home screen (see [Phone](#phone-pwa)). |

The builds are unsigned:
- **macOS:** after copying the app to Applications, run `xattr -cr /Applications/Drinky.app` once.
- **Windows:** SmartScreen may warn you. Click *More info → Run anyway*.
- **Linux:** the tray icon needs `libayatana-appindicator3`.

## How it works

```
             ┌──────────── server (Node, one JSON file) ────────────┐
             │ settings · today's progress · next reminder · history │
             └──────┬───────────────────┬────────────────────┬──────┘
        SSE /api/events          SSE /api/events         Web Push
                    │                   │                    │
           desktop app (tray)    desktop app (tray)     phone PWA
         overlay on every screen       ...           notification → page
```

The server is the only source of truth. It picks the next reminder time, flips `active` when the reminder is due, and broadcasts its whole state to every device over Server-Sent Events. Desktop apps open the server's own page (`/?overlay=1`) as a borderless fullscreen window on every monitor and close it again when `active` becomes false. The server sends a phone push only if no desktop has reported activity in the last 90 seconds.

## Server

The page has to be served over HTTPS for the PWA and push notifications to work. The simplest way is [Tailscale](https://tailscale.com/), which also gives you HTTPS and login for free:

```bash
cd server && docker build -t drinky-server .
docker run -d --name drinky-server --restart unless-stopped \
  -p 127.0.0.1:8196:8196 -v drinky-data:/data \
  -e TZ=Europe/Prague -e ALLOW_LOGIN=you@github drinky-server
tailscale serve --bg --https=10454 http://127.0.0.1:8196
```

Your server is then at `https://<machine>.<tailnet>.ts.net:10454`.

Without Docker, use `node server/server.mjs` (Node 20+).

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8196` | HTTP port |
| `DATA_FILE` | `server/data/state.json` (`/data/state.json` in Docker) | State file. VAPID keys and push subscriptions are kept next to it. |
| `TZ` | system | Time zone for active hours and the "new day" reset |
| `ALLOW_LOGIN` | unset | Only this Tailscale user is let in (checks the `Tailscale-User-Login` header that `tailscale serve` sets). |

> ⚠️ If `ALLOW_LOGIN` is unset there is **no authentication**. Don't expose the server to the internet that way. Put it behind Tailscale or another reverse proxy that handles auth.

## Desktop app

On first launch a setup window asks for the server URL, daily goal, sip size, hours and days. These settings are stored on the server and shared by all devices. The app starts at login (you can turn that off in the tray menu) and lives in the tray:

- *I took a sip*, *+250 ml glass*, *+500 ml bottle*
- *Remind everywhere now*
- *Open Drinky*: the full page with settings and the 7-day chart

The server URL is stored in `server.txt` in the app's config directory (`%APPDATA%\com.adamgreen.drinky\` on Windows).

Detecting whether you're at the computer works on Windows (`GetLastInputInfo`) and macOS (CoreGraphics). On Linux the app never reports activity, so your phone always gets the push.

## Phone (PWA)

1. Open the server URL in Safari (iPhone) or Chrome (Android).
2. *Share → Add to Home Screen*, then open Drinky from the home screen.
3. Tap **🔔 Turn on notifications on this device**.

Tapping a notification opens the page, where you can mark the sip as done.

## API

All endpoints are on the server and take/return JSON. POST bodies are optional.

| Method & path | Body | Does |
|---|---|---|
| `GET /api/state` | | Current state: `settings`, `date`, `drankMl`, `history`, `nextAt`, `active` |
| `GET /api/events` | | SSE stream; sends the full state on every change |
| `POST /api/drink` | `{ "ml": 250 }` | Log a sip (or `ml`, 1–3000) and schedule the next reminder |
| `POST /api/snooze` | | Hide the reminder for 5 minutes |
| `POST /api/skip` | | Dismiss without drinking |
| `POST /api/remind` | | Show a reminder everywhere now |
| `POST /api/settings` | `{ "dailyGoalMl", "sipMl", "startMin", "endMin", "days", "enabled" }` | Update settings (partial is fine) |
| `POST /api/presence` | | "Someone is using this computer" (desktop apps send this every 30 s) |
| `GET /api/vapid`, `POST /api/subscribe`, `POST /api/unsubscribe` | | Web Push setup |

## Development

```
server/        sync server, web page/PWA, push (no npm dependencies)
src-tauri/     desktop app: Tauri 2, Rust, a single main.rs
ui/            the desktop setup window
```

```bash
# server tests
TZ=Europe/Prague node --test server/server.test.mjs server/push.test.mjs

# desktop app (needs Rust; Linux also needs libwebkit2gtk-4.1-dev, libayatana-appindicator3-dev, librsvg2-dev)
npx @tauri-apps/cli@2 dev
npx @tauri-apps/cli@2 build
```

To release, bump `version` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, then push a `vX.Y.Z` tag. GitHub Actions builds every platform and publishes the release.

## License

GPL-3.0-or-later, see [LICENSE.md](LICENSE.md). Drinky started as a fork of [BreakTimer](https://github.com/tom-james-watson/breaktimer-app) by Tom Watson.
