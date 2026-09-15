# TikTok Live Studio Kit

Local web app for TikTok LIVE creators: sign in with an in-page QR code, create a live room and
copy the RTMP server URL + stream key straight into OBS Studio, and read live chat, gifts,
follows and viewer counts in real time over WebSocket — including a transparent overlay route
made for OBS Browser Sources.

> **Disclaimer — unofficial tool.** TikTok has no public API for live-room creation or
> stream-key retrieval. This project automates TikTok's own web pages with a local Chromium
> instance and reads the public chat feed with an unofficial library. It may violate TikTok's
> Terms of Service and your account could be restricted. Use it on an account you can afford to
> lose, at your own risk. No credentials ever leave your machine.

## Features

- **QR login in the web UI.** A Playwright-driven Chromium loads TikTok's login page, the QR
  code is captured and rendered in the dashboard, and login state is polled automatically.
  If TikTok asks for human verification, a headed browser window opens so you can solve it.
- **Stream key extraction.** Fill in the live title, category and age restriction, click
  *Create live room*, and the app intercepts TikTok's own response to return the RTMP server
  URL and stream key. Sessions persist under `.data/` so you do not log in every time.
- **Real-time chat & events.** Comments, gifts (streak-aware), follows, shares, likes, member
  joins, viewer counts and stream-end events stream over WebSocket.
- **OBS overlay.** `/overlay/chat` renders transparent, high-contrast rows ready for a Browser
  Source or Custom Browser Dock.
- **Apple-style liquid glass UI.** Layered translucency, hairline borders and restrained
  micro-interactions on top of shadcn/ui + Magic UI. Dark and light themes.

## Requirements

- Node.js >= 20.9
- npm
- Chromium for Playwright (`npm run setup:browser` — one-time download)

## Install

```bash
npm install
npm run setup:browser
```

## Run

```bash
npm run dev          # development, http://localhost:3000
npm run build        # production build
npm start            # production server
```

Open `http://localhost:3000`, sign in with the QR code, then create a live room.

## Using with OBS Studio

1. Copy **Server URL** and **Stream key** from the *OBS credentials* card
   (Settings → Stream → Service: Custom…).
2. Add the chat overlay: Add → Browser → URL:

   ```
   http://localhost:3000/overlay/chat
   ```

   or use it as a **Custom Browser Dock** (View → Docks → Custom Browser Docks).

Overlay query parameters:

| Param | Default | Description |
|---|---|---|
| `theme` | `dark` | `dark` or `light` text/chip colors |
| `fontSize` | `28` | Font size in px (12–64) |
| `max` | `12` | Max visible rows (1–50) |
| `showGifts` | `1` | Show gift rows |
| `showLikes` | `0` | Show like rows |
| `showFollows` | `1` | Show follow/share rows |
| `showViewers` | `1` | Show the viewer-count chip |
| `showStatus` | `1` | Show connection/status rows |
| `chip` | `1` | Draw translucent chips behind rows |

Example: `http://localhost:3000/overlay/chat?theme=dark&fontSize=32&max=8&showLikes=1`

## Configuration

Copy `.env.example` to `.env` if you want to override defaults:

| Env | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP + WebSocket port |
| `DATA_DIR` | `.data` | Session state, Chromium profile, debug artifacts |
| `SIGN_API_KEY` | — | Optional [Euler Stream](https://www.eulerstream.com) key for the chat connector (higher rate limits) |
| `TIKTOK_HEADLESS` | `1` | Set to `0` to always open a visible browser window |
| `E2E_MOCK_TIKTOK` | — | `1` runs the deterministic fake engine (used by tests) |

## Architecture

One Node process (`server/index.ts`, run with `tsx`) hosts the Next.js request handler and a
`ws` chat bridge on the same port; `/ws/chat` upgrades go to the bridge, everything else to
Next. A Playwright-driven engine (auth, live-room extraction, chat connection) lives outside
the Next bundle and is reached from route handlers through a `globalThis` singleton, so no
heavy dependency is ever bundled into the app. All external payloads are normalized by pure
parsers in `lib/parsers/`, which is where the unit tests concentrate.

Debug artifacts from failed extractions are written to `.data/artifacts/` (directory mode `0700`,
files `0600`). The screenshot is a full-page capture of TikTok's creator page, so it may itself
contain the stream key — treat the folder as sensitive, and it is gitignored along with the rest
of `.data/`.

## Testing

```bash
npm test             # unit + contract tests (Vitest)
npm run test:coverage
npm run test:e2e     # Playwright, runs against the fake engine
```

E2E tests never touch TikTok: `E2E_MOCK_TIKTOK=1` swaps in a deterministic fake engine whose
QR/login and chat events are scripted. For manual visual checks, start the dev server with
`E2E_MOCK_TIKTOK=1` and run `BASE=http://localhost:3000 node scripts/smoke-auth.mjs`
(override the screenshot folder with `OUT_DIR`).

## Troubleshooting

- **"TikTok requires human verification"** — solve the check in the browser window that just
  opened; the app keeps polling and continues automatically.
- **`ENGINE_UNAVAILABLE` / "Engine is not running"** — start the app with `npm run dev`
  (a plain `next dev` has no engine process).
- **"The TikTok session expired"** — click *Switch account* and scan a fresh QR code.
- **"Not eligible to go live from the web"** — TikTok only exposes web live creation to some
  accounts/regions; use the TikTok LIVE Studio app for those accounts.
- **Chat says "not live"** — the connector only reads streams that are currently live.
- **Chat disconnects repeatedly** — the free signing tier of the connector is rate-limited;
  create an Euler Stream key and set `SIGN_API_KEY`.
- **Browser download missing** — run `npm run setup:browser`.
- **Extraction fails after a TikTok redesign** — check `.data/artifacts/` and update the URL
  candidates/selectors in `server/engine/live-room.ts` and `server/engine/auth-manager.ts`.

## License notes

`tiktok-live-connector` is AGPL-3.0. Personal/local use is fine; redistributing a derivative
work requires AGPL compliance. This project is provided for personal use with no warranty.
