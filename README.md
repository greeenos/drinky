# Drinky 💧

Tray app that reminds you to drink water: fullscreen popup every glass, daily goal tracking (default 5 × 400 ml = 2 L). Glass size and daily goal are set in Settings → Drinks.

Based on [BreakTimer](https://github.com/tom-james-watson/breaktimer-app) by Tom Watson (GPL-3.0-or-later).

## Install

Download from [Releases](../../releases):

- **Windows:** `Drinky.exe`
- **macOS:** `Drinky.dmg`. The build is unsigned, so after copying to Applications run once:
  `xattr -cr /Applications/Drinky.app`

## Develop

```bash
npm ci
npm run dev
```

Release: `git tag v0.1.0 && git push --tags` builds both installers via GitHub Actions.
