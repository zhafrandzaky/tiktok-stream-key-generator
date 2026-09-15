# TikTok Live Stream Key Extractor & Real-Time Chat Reader — Design

**Date:** 2026-09-15
**Status:** Approved
**Category:** Architectural (new project)

## 1. Overview

A local web application (Next.js App Router + TypeScript + Tailwind CSS) that:

1. Logs the user into TikTok via QR code shown directly in the UI (Playwright-driven).
2. Creates a live room from the web UI (title, category, age restriction) and extracts the
   RTMP server URL + stream key, ready to paste into OBS Studio.
3. Reads live chat/events in real time over WebSocket (comments, gifts, follows, shares,
   likes, viewers) for the authenticated user's own stream or any public streamer.
4. Exposes `/overlay/chat` — a transparent-background route usable directly as an OBS
   Browser Source or Custom Browser Dock.

### Goals

- One-command local run (`npm run dev`), single process, same-origin REST + WebSocket.
- Strict separation of concerns: API route handlers, WebSocket bridge, Playwright engine,
  cookie/session manager, pure parsers, UI components.
- Apple Liquid Glass visual language: precise, native-feeling, no decorative AI-slop.
- Testable: pure parsers unit-tested; E2E flows run against a deterministic fake engine.

### Non-Goals

- No cloud deployment, multi-user auth, or database.
- No official TikTok API integration (none exists for stream key creation).
- No video ingestion/restreaming — OBS does that; this app only extracts credentials.

## 2. Risks and Disclaimer

TikTok has **no public official API** for live-room creation or stream-key retrieval.
Everything here is unofficial browser automation and may violate TikTok's Terms of Service.
Account restrictions are possible; the user accepts this risk. The app must display this
disclaimer in the README and in the UI footer of the auth card.

Known risks and mitigations:

| Risk | Mitigation |
|---|---|
| TikTok DOM/API changes break extraction | Keep extraction (`server/engine`) separate from parsing (`lib/parsers`, pure + tested). Capture screenshot artifacts on failure under `.data/artifacts/`. Typed `ExtractionError` with category. |
| Captcha / bot checks during login or room creation | Headless-first; on captcha detection relaunch headed Chromium and ask the user to complete verification in the opened window. |
| Account not eligible for web live | Surface a clear, typed error in the UI; do not retry blindly. |
| Euler Stream free-tier rate limits for chat signing | `SIGN_API_KEY` env var (optional) for higher limits; chat errors surfaced as toast + panel status. |
| `tiktok-live-connector` is AGPL-3.0 | Fine for local/personal use; distributing derivatives requires AGPL compliance. Noted in README. |
| Secrets in logs | Stream keys and cookies are never logged; session file is `chmod 600`. |

## 3. Tech Stack

| Concern | Choice | Version (verified 2026-09-15) |
|---|---|---|
| Framework | Next.js App Router, TypeScript | 16.3.5 |
| Styling | Tailwind CSS v4 | 4.3.3 |
| Components | shadcn/ui + selected Magic UI components (copy-in registry) | latest CLI |
| Fonts/icons | Geist (Next default), lucide-react | — |
| Theme | next-themes (default dark) | latest |
| Toasts | sonner | latest |
| Animation | `motion` (Magic UI dependency) | latest |
| WebSocket server | `ws` (`noServer: true` + HTTP upgrade routing) | 8.x |
| Stream key/login automation | Playwright (Chromium, persistent context) | 1.5x |
| Chat events | `tiktok-live-connector` (ESM-only, AGPL-3.0) | 2.4.4 |
| Unit tests | Vitest + @vitest/coverage-v8 | latest |
| E2E tests | @playwright/test | latest |
| Custom server runner | tsx (dev) / tsx (start); `"type": "module"` | latest |

Package manager: npm. Node >= 20.9 required (Next 16 + connector constraint: >= 20).

## 4. Architecture

### 4.1 Single-process custom server (Approach A)

Next.js route handlers cannot host WebSockets, so the app runs a Node custom server
(`server/index.ts` via `tsx`) that:

- creates one `node:http` server on `PORT` (default 3000);
- routes HTTP to the Next request handler;
- routes WebSocket upgrades whose path is `/ws/chat` to the chat bridge
  (`WebSocketServer({ noServer: true })`), leaving all other upgrades (e.g. Next dev HMR)
  untouched;
- instantiates the Playwright/TikTok engine once and stores it on `globalThis`.

Rejected alternatives:

- **B. Separate engine/WS process** — two terminals, CORS/proxy complexity, no benefit for a
  local app.
- **C. Polling/SSE without WebSocket** — violates the real-time requirement.

### 4.2 Engine access pattern (why globalThis)

`server/index.ts` is not bundled by Next. Next route handlers are bundled separately, so a
module-level singleton imported by both would exist twice in dev. The accessor
`server/engine/singleton.ts` therefore stores the instance on `globalThis.__tiktokEngine`
and exposes `getEngine()` / `setEngine()`. It imports nothing heavy, so route handlers can
import it safely. Heavy dependencies (`playwright`, `tiktok-live-connector`) live only in
`server/engine/*` modules loaded by `server/index.ts`, and are listed in
`serverExternalPackages` to prevent bundling if ever referenced.

If the app is started without the custom server (`next dev`), `getEngine()` throws a typed
`EngineUnavailableError` and APIs return 503 with a clear message.

### 4.3 Directory layout

```
server/
  index.ts                 # custom server: next() + http + WS upgrade routing + engine boot
  engine/
    singleton.ts           # globalThis accessor (no heavy imports)
    engine.ts              # Engine facade: auth, live, chat sub-managers + event bus
    browser.ts             # Playwright lifecycle: persistent context, headed fallback
    auth-manager.ts        # QR login polling, sessionid detection, captcha, logout
    live-room.ts           # create/end room, network interception + DOM fallback
    chat-connection.ts     # tiktok-live-connector wrapper + normalization + reconnect
    session-store.ts       # storageState read/write, atomic writes, chmod 600
    events.ts              # typed EventEmitter (ChatEvent union)
    errors.ts              # EngineError taxonomy (AuthRequired, Captcha, NotEligible, ...)
    fake-engine.ts         # deterministic fake for E2E and offline dev (E2E_MOCK_TIKTOK=1)
  ws/
    chat-bridge.ts         # WS protocol handler (pure-ish, injectable socket for tests)
    protocol.ts            # message types + (de)serialization
app/
  layout.tsx, page.tsx     # dashboard
  overlay/chat/page.tsx    # transparent OBS overlay
  api/auth/login/start/route.ts
  api/auth/login/status/route.ts
  api/auth/logout/route.ts
  api/auth/session/route.ts
  api/live/create/route.ts
  api/live/end/route.ts
  api/live/status/route.ts
  api/chat/connect/route.ts
  api/chat/disconnect/route.ts
components/
  ui/*                     # shadcn/ui
  magicui/*                # border-beam, ripple, number-ticker, blur-fade (hand-audited)
  dashboard/*              # AuthCard, BroadcastForm, StreamKeyCard, ChatPanel, StatusBar, EventRow
  overlay/*                # ChatOverlay renderer
  theme-provider.tsx
lib/
  types.ts                 # ChatEvent union, LiveRoomResult, SessionState, etc.
  parsers/rtmp.ts          # PURE payload normalization
  parsers/chat.ts          # PURE webcast message normalization
  parsers/qr.ts            # PURE QR-expiry/screenshot-hash comparison helpers
  api-client.ts            # typed fetch helpers for the UI
  utils.ts                 # cn() and small utilities
tests/
  unit/*.test.ts           # Vitest
  e2e/*.spec.ts            # @playwright/test
docs/superpowers/specs/    # this spec
docs/plans/                # implementation plan
```

## 5. Flows

### 5.1 QR login

1. `POST /api/auth/login/start`
   - Engine reuses a persisted storage state if present and valid; otherwise:
   - Launches Chromium persistent context (`userDataDir = .data/browser-profile`),
     navigates to the TikTok login page, selects the QR-code tab, waits for the QR element,
     screenshots it, returns `{ qrDataUrl, expiresAt }`.
   - Starts a background poller: every 2s check for the `sessionid` cookie.
   - QR rotation: compares element screenshot hash; when it changes, pushes the new QR
     (status endpoint exposes a `version` counter; UI re-fetches image on change).
2. `GET /api/auth/login/status` → `{ status: 'waiting'|'scanned'|'confirmed'|'expired'|'captcha'|'error', version, detail? }`
   - `scanned` detection is best-effort; `confirmed` (sessionid present) is authoritative.
3. Captcha detected → browser relaunched headed; status `captcha` with instruction copy.
4. `confirmed` → persist storage state to `.data/session/storageState.json` atomically
   (write temp + rename, chmod 600), return profile info if scrapeable.
5. `POST /api/auth/logout` → close context, delete storage state + profile cookies,
   reset engine state, broadcast `status` event to WS clients.

Route handlers are thin: validate input, call engine, map typed errors to HTTP codes.

#### QR source, rate limiting, and fallback (added 2026-09-15 after live testing)

- The QR image is read from TikTok's own `GET /passport/web/get_qrcode/` JSON response
  (`data.qrcode` base64 PNG + `data.expire_time`) by intercepting the login page's network
  traffic. Periodic element screenshots are only a last-resort fallback (with
  `animations: 'disabled'`), which removes the UI flicker and eliminates the risk of showing
  a stale QR while TikTok rotates the code.
- The page's `GET /passport/web/check_qrconnect/` responses are parsed to classify
  `waiting | scanned | confirmed | expired | rate_limited | error`. `scanned` surfaces
  "confirm on your phone" guidance.
- TikTok enforces an attempt budget on `check_qrconnect` and returns
  `error_code 7 — "Maximum number of attempts reached"`. When detected, the manager:
  parks the login page (`about:blank`) so TikTok's ~2×/s polling stops burning the budget,
  persists a cooldown to `<DATA_DIR>/session/rate-limit.json` (0600) that **survives app
  restarts** and escalates on repeated hits (5 → 15 → 60 minutes), and reports
  `rateLimited` + `retryAfter` through `status()`. QR traffic is fully suppressed until the
  cooldown expires; a successful `check_qrconnect` clears the stored state.
- The same attempt budget applies to password login (`Maximum number of attempts reached`
  after submitting credentials). The manager inspects every `/passport/` and `/api/` JSON
  response for that message and, in window mode, also polls the page text for it. On
  detection it records the persisted cooldown and surfaces actionable guidance on the
  dashboard instead of leaving the user guessing inside TikTok's own window.
- `POST /api/auth/login/start` accepts `{ mode: 'qr' | 'window' }`. In `window` mode the
  engine opens a headed Chromium directly on
  `https://www.tiktok.com/login/phone-or-email/email` (verified: zero `check_qrconnect`
  requests) and only polls for the `sessionid` cookie, so the user logs in with email and
  password while QR is rate-limited. Window mode bypasses the QR cooldown.
  `POST /api/auth/login/start` answers `429` with the flat payload
  `{ error: "LOGIN_RATE_LIMITED", message, retryAfter }` (seconds remaining) while the
  cooldown is active.
- Engine errors cross a module boundary (the engine is loaded by `tsx`, route handlers are
  bundled by Next), so error mapping never relies on `instanceof` alone: `EngineError`
  carries an `isEngineError` marker that route handlers detect structurally. Regression
  tests simulate duplicated class copies.
- `POST /api/auth/login/start` accepts `{ mode: 'qr' | 'window' }`. In `window` mode the
  engine opens a headed Chromium at the TikTok login page and only polls for the
  `sessionid` cookie, so the user can complete login with password or QR inside the window —
  a reliable path when QR checks are rate-limited.
- Session detection remains cookie-authoritative (`sessionid` present → persist
  `storageState` atomically to `.data/session/storageState.json`), polled every second.
- **Firefox session import (added after live testing).** TikTok's risk engine rejects the
  bundled Chromium for login (QR *and* password) while the operator's normal Firefox logs in
  fine. `POST /api/auth/import/firefox` reads the Firefox profile's `cookies.sqlite` (via
  `node:sqlite`, Node 22.5+, with `-wal`/`-shm` copied for a consistent snapshot), maps
  `moz_cookies` rows to Chromium cookie parameters (Firefox stores millisecond expiry;
  Playwright expects seconds), clears stale cookies in the app browser, injects the imported
  set, verifies `sessionid`, and persists a fresh `storageState`. The live-studio URL was
  corrected to `https://www.tiktok.com/tiktokstudio/live` (`/live/create` returns 404;
  `/creator-center/live` redirects to tiktokstudio).

### 5.2 Create live room / extract stream key

`POST /api/live/create { title, category?, ageRestricted? }`

**Primary path (API-first, added after live testing):** with the authenticated browser
context, call TikTok's own `POST https://webcast.tiktok.com/webcast/room/create/`
(`aid=8311&device_platform=web_pc…`, form body `title=…`, same-origin headers). A
`status_code: 0` response contains `data.id_str` (room id) and
`data.stream_url.rtmp_push_url` — a signed RTMP URL whose query string (`amun`, `expire`,
`sign`, …) is **part of the stream key**. `parseRoomCreateResponse` (pure, tested) extracts
it; the RTMP splitter keeps the signed query inside the key so OBS receives valid
credentials. Verified live against a real account whose UI only offered the LIVE Studio
download. Each successful call returns a fresh (new) room/key pair.

**Fallback path (UI automation):** if the API refuses, drive the web studio:

1. Require authenticated session; otherwise 401 `AUTH_REQUIRED`.
2. Navigate to the TikTok LIVE creator page (exact URL is a Phase 3 discovery item; the
   engine keeps a candidate list and records which one worked).
3. Attach `page.on('response')` interceptors matching JSON bodies containing keys
   `push_url | stream_url | rtmp | stream_key | rtmp_push_url` (case-insensitive scan,
   bounded depth). Also attach a DOM fallback that reads stream-key input fields.
   TikTok Studio (`/tiktokstudio/live`) is a slow SPA: the engine waits for the body to
   render and for the *Go LIVE* control to become visible (up to 25s) before acting — an
   immediate lookup finds a blank page (observed ~6–10s render time). If credentials do not
   arrive within ~12s of opening the setup, the engine clicks the last visible Go LIVE
   control once as the confirmation step.
   The *Go LIVE* entry may open a **new tab** (observed: it redirects accounts without web
   RTMP access to `tiktok.com/studio/download`). The engine therefore instruments every page
   in the context, follows new tabs, and raises `NotEligibleError` when the download page
   appears instead of waiting for credentials that will never arrive.
4. Fill title / category / age restriction when the controls exist; ignore absent controls
   and report which options were applied in the response (`applied: string[]`).
5. Submit; wait for the intercepted payload (timeout 45s).
6. Normalize via `lib/parsers/rtmp.ts` → `{ rtmpUrl, streamKey, combinedPushUrl? }`.
   On failure: save screenshot + captured payload keys (never values) to `.data/artifacts/`
   and throw `ExtractionFailed`.
7. Response: `LiveRoomResult`. Engine caches the active room in memory only.

`POST /api/live/end` → click end-live control (or call the intercepted end endpoint),
verify state, clear cache. `POST /api/live/end` finalizes the room: it reads `webcast/room/create_info` to learn the
anchor's room id and `live_status` (enum verified from TikTok's own bundle: 1 PREPARE,
2 ONLINE, 3 PAUSE count as live; 4 OFFLINE, -1 SUSPENDED, -2 LIVE_AND_LEAVE do not), calls
`webcast/room/finish_abnormal` with the room id (works without request signing — the older
`room/stop` route does not exist and is answered with `10013 Url does not match`), then
re-reads `create_info` to confirm. `status()` uses the same check to reconcile the live badge
so it cannot stay stale after the broadcast ends. Ending an RTMP live still requires stopping
OBS; the app surfaces a clear message when TikTok refuses to finalize.

`GET /api/live/status` → `{ authenticated, live, room? }`.

### 5.3 Chat engine

`POST /api/chat/connect { username }` (optional auth: reading public chats requires none)

- Creates `TikTokLiveConnection(username, { signApiKey?, ... })`.
- Normalizes every event via `lib/parsers/chat.ts` into the `ChatEvent` union:
  - `{ type: 'status', state: 'connecting'|'connected'|'disconnected'|'error', detail? }`
  - `{ type: 'chat', user, comment, at }`
  - `{ type: 'gift', user, giftName?, giftId, repeatCount, diamonds?, streakEnd, at }`
  - `{ type: 'follow' | 'share' | 'like' | 'member', user?, count?, at }`
  - `{ type: 'viewerCount', count, at }`
  - `{ type: 'streamEnd', reason?, at }`
- Publishes to the typed event bus; reconnection with exponential backoff (1s→30s cap),
  `disconnect()` on user request or account switch.
- Only one active chat connection at a time (room switching replaces it) — YAGNI on
  multi-room fan-out.

### 5.4 WebSocket protocol (`/ws/chat`)

JSON text frames, versioned by `op`:

- Client → server: `{ op: 'subscribe' }` (subscribes to the active room feed),
  `{ op: 'ping' }`.
- Server → client: `{ op: 'hello', snapshot: ChatEvent[] (last 50) }`,
  `{ op: 'event', event: ChatEvent }`, `{ op: 'pong' }`, `{ op: 'error', code, message }`.

Bridge specifics: per-socket bounded queue (drop-oldest beyond 500 events to protect the
server), heartbeat every 30s with dead-socket termination, ring buffer of the last 50
events for late joiners. The protocol handler is separated from the `ws` transport so unit
tests can drive it with a fake socket.

### 5.5 Overlay `/overlay/chat`

Query params: `username` (optional; follows the dashboard's active connection when empty),
`theme=light|dark`, `fontSize` (px), `max` (max visible messages), `showGifts`, `showLikes`,
`showViewers`, `showFollows` (booleans). Behavior:

- `background: transparent` on `html/body`, no scrollbars, no chrome.
- Message list with blur-fade entry; gift/follow rows visually distinct via icon + color.
- Connects directly to `/ws/chat`; reconnects with backoff; shows a tiny disconnected dot
  (toggleable with `showStatus=0`) so OBS users can diagnose.
- Text contrast: near-white text with soft shadow on dark, near-black on light, plus a thin
  translucent chip behind each row (configurable `chip=0|1`).

### 5.6 Chat payload mapping (verified against live streams)

`tiktok-live-connector` 2.4.4 emits payloads whose decoded field names differ from the
protobuf typings, so `lib/parsers/chat.ts` reads the live shapes with fallbacks:

| Event | Live field | Fallback kept |
|---|---|---|
| chat | `content` | `comment` |
| user handle | `displayId` | `idStr`, `userId`, `id` (there is **no** `uniqueId`) |
| user avatar | `avatarThumb.urlList[0]` | `avatarMedium/Large`, `profilePictureUrl` |
| like | `count`, `total` (string) | `likeCount`, `totalLikeCount` |
| room users | `total` (current viewers, fluctuates) + `totalUser` (cumulative entered, grows) | `viewerCount`, `total` |
| gift streak | `repeatEnd` numeric 0/1 | boolean/string forms |
| social | `followCount` / `shareCount` | `action` text |

Without these fallbacks, user-bearing events (chat/gift/member/follow) were dropped while
likes and control events still rendered — the exact symptom reported during testing. The chat
panel UI is a two-column layout (chat left without tabs, events right with per-category
toggles); gift rows are rendered only when a streak ends to avoid duplicate entries.

## 6. UI Design — Apple Liquid Glass

### 6.1 Principles

- Precision over decoration: solid base background, one subtle radial sheen maximum, no
  neon/random gradients, no non-functional ornaments.
- Layered translucency: glass surfaces over a calm base; blur increases with elevation.
- Native micro-interactions: everything interactive gives immediate, restrained feedback.

### 6.2 Tokens (`globals.css`)

- Base: light `#f5f5f7`, dark `#0b0f14`; text uses shadcn foreground tokens.
- `.glass` utility: `bg-white/60 dark:bg-slate-900/50`, `backdrop-blur-xl`,
  `border border-white/15 dark:border-white/10`, inner highlight
  `inset 0 1px 0 rgba(255,255,255,0.12)`, layered shadow
  `0 1px 2px rgba(0,0,0,.06), 0 8px 24px -8px rgba(0,0,0,.25)`.
- `.glass-strong` (modals/toasts): same with `backdrop-blur-2xl` and higher opacity.
- Radii: `rounded-2xl` cards, `rounded-3xl` hero cards, `rounded-xl` controls.
- Focus: `focus-visible:ring-2 ring-white/40 dark:ring-white/25 ring-offset-2` (scoped).
- Motion: 150–250ms ease-out; respect `prefers-reduced-motion`.

### 6.3 Components

- shadcn/ui: button, card, input, label, switch, select, tooltip, skeleton, separator, badge,
  sonner, dialog, tabs, scroll-area, dropdown-menu.
- Magic UI (audited for Tailwind v4 compatibility, hand-port if needed): `border-beam`
  (thin, only on the primary CTA while live), `ripple` (copy/create buttons),
  `number-ticker` (viewer count), `blur-fade` (chat entries). Nothing else.

### 6.4 Dashboard composition

- Header: app title, connection status dot, theme toggle.
- Left column: `AuthCard` (QR panel + status, or signed-in profile + logout/switch) and
  `BroadcastForm` (title, category, age restriction) → "Create Live Room" CTA.
- Right column: `StreamKeyCard` (masked key with eye toggle + reveal auto-hide 60s, copy
  buttons for URL/key/combined, BorderBeam when live, "End Stream") and `ChatPanel`
  (tabs: Chat / Events; viewer count; connect form for arbitrary username).
- Toasts via sonner for copy success, auth transitions, extraction errors.

## 7. Configuration

| Env | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | HTTP/WS port |
| `DATA_DIR` | `.data` | Session, browser profile, artifacts |
| `SIGN_API_KEY` | — | Optional Euler Stream key for chat signing reliability |
| `TIKTOK_HEADLESS` | `1` | Force headed (`0`) for debugging |
| `E2E_MOCK_TIKTOK` | — | `1` swaps in fake engine |

Scripts: `dev` (`tsx server/index.ts` with `NODE_ENV=development`), `build` (`next build`),
`start` (`NODE_ENV=production tsx server/index.ts`), `test` (vitest), `test:e2e`
(playwright), `test:coverage`, `lint`, `typecheck`, `setup:browser`
(`playwright install chromium`). `.gitignore` includes `.data/`, artifacts, traces.

## 8. Testing Strategy

- **Unit (Vitest, TDD for parsers):** `lib/parsers/rtmp.ts` (split keys, combined push URL,
  nested envelopes, error payloads), `lib/parsers/chat.ts` (chat/gift streak/social/
  roomUser/streamEnd, missing fields), `session-store` (atomic write, permissions),
  `ws/protocol` + `ws/chat-bridge` (subscribe, snapshot, slow-consumer drop, heartbeat).
- **Route contract tests (Vitest):** route handlers with a fake engine injected via
  `setEngine()` — verifies status codes and payload shapes without Playwright.
- **E2E (@playwright/test, `E2E_MOCK_TIKTOK=1`):** dashboard render, QR flow state
  transitions (fake), show/hide + copy stream key with clipboard permission, chat events
  appearing live in the panel, `/overlay/chat` transparency + rendering, reconnect banner,
  logout. Never calls TikTok.
- Coverage gate: 80% for `lib/**`, `server/engine/session-store.ts`, and `server/ws/**`;
  Playwright automation modules and UI are excluded from the numeric gate.

## 9. Build Phases

| Phase | Deliverable |
|---|---|
| 0 | Scaffold (Next 16 + TS + TW4), shadcn + Magic UI, deps, custom server + `/ws/chat` echo, health endpoint, scripts |
| 1 | Types + pure parsers + session-store, TDD with unit tests |
| 2 | Auth engine (QR + captcha fallback + persistence) + auth routes + AuthCard UI |
| 3 | Live room extraction (discovery spike → interceptor + DOM fallback) + live routes + StreamKeyCard |
| 4 | Chat engine + WS bridge + ChatPanel + `/overlay/chat` |
| 5 | Liquid Glass polish, micro-interactions, dark/light, responsive |
| 6 | E2E suite, coverage report, README (setup, OBS, risks), lint/typecheck, review agents |

## 10. Open Items Resolved During Implementation

- Exact TikTok login/creator URLs and response payload shapes: proven in Phase 2/3 with
  headed Playwright + network capture; the engine keeps candidate URLs and prefers
  interception over DOM selectors.
- Magic UI component Tailwind v4 compatibility: audited at install; components are copied
  into the repo so they can be patched locally.
- `tiktok-live-connector` event field names verified against the installed version's types
  during Phase 4 (types are the source of truth, not the README).
