# TikTok Live Stream Key Extractor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Next.js web app that logs into TikTok via in-UI QR code, creates a live room and extracts the RTMP URL + stream key for OBS, and streams live chat/events over WebSocket with a transparent `/overlay/chat` route for OBS Browser Sources.

**Architecture:** Single-process custom Node server (`server/index.ts` via `tsx`) hosts the Next.js request handler and a `ws` chat bridge on one port. A Playwright-driven engine (auth, live-room extraction, chat connection) lives outside the Next bundle and is reached by route handlers through a `globalThis` singleton accessor. Pure parsers in `lib/` normalize all external payloads and are unit-tested; E2E runs against a deterministic fake engine.

**Tech Stack:** Next.js 16.3.5 (App Router, TypeScript), Tailwind CSS v4, shadcn/ui + selected Magic UI components, next-themes, sonner, motion, `ws` 8.x, Playwright, `tiktok-live-connector` 2.4.4, Vitest (+coverage-v8), @playwright/test, tsx, npm.

**Spec:** `docs/superpowers/specs/2026-09-15-tiktok-stream-key-extractor-design.md`

## Global Constraints

- Node >= 20.9.0 (Next 16 requirement; connector requires >= 20). npm as package manager.
- `package.json` must have `"type": "module"` (dependencies are ESM-only: `tiktok-live-connector`, `got`).
- Heavy server deps (`playwright`, `tiktok-live-connector`) may only be imported from `server/engine/**` loaded by `server/index.ts`; never statically imported by `app/api/**` or client components. Add them to `serverExternalPackages` in `next.config.ts`.
- `server/engine/singleton.ts` must not statically import heavy dependencies (it is imported by route handlers).
- WebSocket upgrades are handled with `WebSocketServer({ noServer: true })` and only for pathname `/ws/chat`; all other upgrades must be left to Next (dev HMR).
- Secrets (stream keys, cookies, sessionids) must never be logged, never included in error payloads, and `.data/` must be gitignored with session file permissions `0600`.
- UI copy is **English**. Conversational responses to the user are in Indonesian.
- Do not run `git commit` unless the user has explicitly approved git usage at execution handoff. When approved, use conventional commit messages (`feat:`, `test:`, `chore:`, `docs:`).
- Every task ends with `npm run lint` and `npm run typecheck` passing before its final commit/verification step.
- Test file conventions: unit tests in `tests/unit/*.test.ts`; E2E in `tests/e2e/*.spec.ts`. Vitest `environment: 'node'`, alias `@/*` -> project root.

---

### Task 1: Scaffold Next.js app, design system base, and project scripts

**Files:**
- Create: whole scaffold (`package.json`, `app/`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`)
- Create: `components.json` (shadcn), `components/theme-provider.tsx`, `.env.example`, `.gitignore` additions
- Modify: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `next.config.ts`, `package.json`
- Create: `lib/utils.ts` (shadcn generates it)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: runnable Next 16 app with Tailwind v4, shadcn/ui, Magic UI components, `cn()` helper, glass CSS utilities, theme toggle provider, and npm scripts used by every later task.

- [ ] **Step 1: Scaffold in the current empty directory**

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm --turbopack --disable-git
```

If `--disable-git` is rejected by the CLI, run without it and immediately `rm -rf .git`. Do not commit.

- [ ] **Step 2: Install dependencies**

```bash
npm install ws tiktok-live-connector playwright next-themes sonner motion clsx tailwind-merge lucide-react class-variance-authority
npm install -D tsx @types/ws vitest @vitest/coverage-v8 @playwright/test
npx playwright install chromium
```

- [ ] **Step 3: Configure ESM + external packages + scripts**

Set `"type": "module"` in `package.json`. Replace `scripts` with:

```json
{
  "dev": "NODE_ENV=development tsx server/index.ts",
  "build": "next build",
  "start": "NODE_ENV=production tsx server/index.ts",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "setup:browser": "playwright install chromium"
}
```

`next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['playwright', 'tiktok-live-connector'],
}

export default nextConfig
```

- [ ] **Step 4: Initialize shadcn/ui and add components**

```bash
npx shadcn@latest init -y -b neutral
npx shadcn@latest add button card input label switch select tooltip skeleton separator badge sonner dialog tabs scroll-area dropdown-menu
```

- [ ] **Step 5: Add the four Magic UI components via the shadcn registry**

```bash
npx shadcn@latest add "https://magicui.design/r/border-beam.json" "https://magicui.design/r/ripple.json" "https://magicui.design/r/number-ticker.json" "https://magicui.design/r/blur-fade.json"
```

If any registry URL 404s, copy the component source manually from magicui.design into `components/magicui/<name>.tsx`, adjust imports to `@/lib/utils` and `motion/react`. Components are local copies and may be patched.

- [ ] **Step 6: Add Liquid Glass tokens and base theme to `app/globals.css`**

Append after the Tailwind import and shadcn tokens:

```css
@custom-variant dark (&:is(.dark *));

:root {
  --base-background: 245 245 247;
}
.dark {
  --base-background: 11 15 20;
}

body {
  background-color: rgb(var(--base-background));
  min-height: 100vh;
}

@utility glass {
  background-color: color-mix(in oklab, var(--card) 60%, transparent);
  backdrop-filter: blur(24px) saturate(140%);
  border: 1px solid color-mix(in oklab, white 15%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 8px 24px -8px rgba(0, 0, 0, 0.25);
}

@utility glass-strong {
  background-color: color-mix(in oklab, var(--card) 78%, transparent);
  backdrop-filter: blur(40px) saturate(150%);
  border: 1px solid color-mix(in oklab, white 18%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 2px 4px rgba(0, 0, 0, 0.08),
    0 16px 40px -12px rgba(0, 0, 0, 0.35);
}

@utility focus-glass {
  outline: none;
}
.focus-glass:focus-visible {
  box-shadow: 0 0 0 2px var(--background), 0 0 0 4px color-mix(in oklab, white 40%, transparent);
}
```

Exact TW4 `@utility` syntax may vary by installed version; verify with a `npm run dev` render and adjust (the verifiable outcome is: `.glass` class applies blur, translucent background, hairline border, layered shadow in both themes).

- [ ] **Step 7: Wire layout**

`app/layout.tsx`: import `next/font/google` Geist, wrap children in `<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>` from `components/theme-provider.tsx` (standard shadcn next-themes wrapper), render `<Toaster richColors position="top-center" />` from `@/components/ui/sonner`, and set `body` to `min-h-screen antialiased text-foreground`.

`app/page.tsx`: replace with a temporary glass panel:

```tsx
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center p-6">
      <div className="glass rounded-3xl p-10">
        <h1 className="text-xl font-semibold tracking-tight">TikTok Live Studio Kit</h1>
        <p className="mt-2 text-sm text-muted-foreground">Scaffold ready.</p>
      </div>
    </main>
  )
}
```

- [ ] **Step 8: Add `.env.example` and gitignore entries**

`.env.example`:

```
PORT=3000
DATA_DIR=.data
SIGN_API_KEY=
TIKTOK_HEADLESS=1
E2E_MOCK_TIKTOK=
```

Append to `.gitignore`: `.data/`, `test-results/`, `playwright-report/`, `coverage/`.

- [ ] **Step 9: Verify**

```bash
npm run typecheck && npm run lint && npm run build
```

Expected: all pass. Then `timeout 20 npm run dev` is NOT run yet (custom server does not exist; do not break dev — `server/index.ts` comes in Task 2; if `npm run dev` is verified now it is expected to fail, note it and move on).

- [ ] **Step 10: Commit (only if git approved)**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with liquid glass design base"
```

---

### Task 2: Custom server, engine singleton, health route, and WebSocket echo

**Files:**
- Create: `server/index.ts`, `server/engine/singleton.ts`, `server/engine/errors.ts`, `server/ws/protocol.ts`, `server/ws/chat-bridge.ts`
- Create: `app/api/health/route.ts`
- Test: `tests/unit/protocol.test.ts`, `tests/unit/chat-bridge.test.ts`
- Modify: `vitest.config.ts` (create), `tsconfig.json` (exclude `.next` already default; ensure `server/**` included)

**Interfaces:**
- Consumes: Task 1 project scripts and deps.
- Produces:
  - `server/engine/singleton.ts`: `interface EngineHandle { getStatus(): Promise<EngineStatus> }`, `type EngineStatus = { ok: boolean; mode: 'real' | 'fake'; auth: 'anonymous' | 'authenticated'; live: boolean }`, `getEngine(): EngineHandle` (throws `EngineUnavailableError`), `setEngine(engine: EngineHandle | null): void`.
  - `server/engine/errors.ts`: `class EngineError extends Error { code: string }`, `class EngineUnavailableError extends EngineError`, `class AuthRequiredError extends EngineError`, `class CaptchaError extends EngineError`, `class NotEligibleError extends EngineError`, `class ExtractionFailedError extends EngineError`.
  - `server/ws/protocol.ts`: `ClientMessage`, `ServerMessage` types; `parseClientMessage(raw: string): ClientMessage | null`; `encodeServerMessage(msg: ServerMessage): string`.
  - `server/ws/chat-bridge.ts`: `interface BridgeSocket { send(data: string): void; close(code?: number, reason?: string): void; onMessage?: never }`, `createChatBridge(deps: { getSnapshot: () => ChatEvent[]; subscribe: (listener: (event: ChatEvent) => void) => () => void; queueLimit?: number; now?: () => number }): { attach(socket: BridgeSocket): ChatSocket; broadcast(event: ChatEvent): void; size(): number }`, `interface ChatSocket { handleMessage(raw: string): void; handleClose(): void; queueSize(): number }`.
  - `app/api/health/route.ts`: `GET` -> `{ status: 'ok' | 'engine_unavailable', engine?: EngineStatus }` with 200/503.

- [ ] **Step 1: Write failing protocol tests**

`tests/unit/protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { encodeServerMessage, parseClientMessage } from '@/server/ws/protocol'

describe('parseClientMessage', () => {
  it('parses subscribe', () => {
    expect(parseClientMessage('{"op":"subscribe"}')).toEqual({ op: 'subscribe' })
  })
  it('parses ping', () => {
    expect(parseClientMessage('{"op":"ping"}')).toEqual({ op: 'ping' })
  })
  it('rejects unknown ops', () => {
    expect(parseClientMessage('{"op":"nope"}')).toBeNull()
  })
  it('rejects invalid json', () => {
    expect(parseClientMessage('not-json')).toBeNull()
  })
})

describe('encodeServerMessage', () => {
  it('round-trips an event message', () => {
    const msg = { op: 'event', event: { type: 'viewerCount', count: 12, at: 1 } } as const
    expect(JSON.parse(encodeServerMessage(msg))).toEqual(msg)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/protocol.test.ts`
Expected: FAIL — module `@/server/ws/protocol` not found.

- [ ] **Step 3: Implement `server/ws/protocol.ts`**

```ts
import type { ChatEvent } from '@/lib/types'

export type ClientMessage = { op: 'subscribe' } | { op: 'ping' }

export type ServerMessage =
  | { op: 'hello'; snapshot: ChatEvent[] }
  | { op: 'event'; event: ChatEvent }
  | { op: 'pong' }
  | { op: 'error'; code: string; message: string }

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return null
    const op = (data as { op?: unknown }).op
    if (op === 'subscribe' || op === 'ping') return { op }
    return null
  } catch {
    return null
  }
}

export function encodeServerMessage(msg: ServerMessage): string {
  return JSON.stringify(msg)
}
```

`lib/types.ts` is created in Task 3; for now add the minimal `ChatEvent` union there exactly as specified in Task 3 Step 3 so this task compiles (Task 3 will extend tests only, not the type).

- [ ] **Step 4: Write failing chat-bridge tests**

`tests/unit/chat-bridge.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createChatBridge } from '@/server/ws/chat-bridge'
import type { ChatEvent } from '@/lib/types'

function fakeSocket() {
  const sent: string[] = []
  let closed = false
  return {
    socket: { send: (d: string) => sent.push(d), close: () => { closed = true } },
    sent,
    isClosed: () => closed,
  }
}

const chat: ChatEvent = { type: 'chat', user: { uniqueId: 'u', nickname: 'U' }, comment: 'hi', at: 1 }

describe('createChatBridge', () => {
  it('sends hello snapshot on attach and events on broadcast', () => {
    const bridge = createChatBridge({ getSnapshot: () => [chat], subscribe: () => () => {} })
    const { socket, sent } = fakeSocket()
    bridge.attach(socket)
    expect(JSON.parse(sent[0])).toEqual({ op: 'hello', snapshot: [chat] })
    bridge.broadcast({ ...chat, at: 2 })
    expect(JSON.parse(sent[1]).op).toBe('event')
  })

  it('answers ping with pong', () => {
    const bridge = createChatBridge({ getSnapshot: () => [], subscribe: () => () => {} })
    const { socket, sent } = fakeSocket()
    const conn = bridge.attach(socket)
    conn.handleMessage('{"op":"ping"}')
    expect(JSON.parse(sent[1])).toEqual({ op: 'pong' })
  })

  it('drops oldest events beyond queueLimit for slow consumers', () => {
    const bridge = createChatBridge({ getSnapshot: () => [], subscribe: () => () => {}, queueLimit: 2 })
    let deliver: (e: ChatEvent) => void = () => {}
    const unsub = vi.fn()
    const bridge2 = createChatBridge({
      getSnapshot: () => [],
      subscribe: (l) => { deliver = l; return unsub },
      queueLimit: 2,
    })
    const { socket, sent } = fakeSocket()
    bridge2.attach(socket)
    // simulate slow socket by intercepting sends: fill queue via direct internals is not exposed,
    // so broadcast 3 events and expect only the last 2 stored; queue flush happens on next tick
    sent.length = 0
    deliver(chat)
    deliver({ ...chat, at: 2 })
    deliver({ ...chat, at: 3 })
    // flush is scheduled; await microtask
    return Promise.resolve().then(() => {
      const events = sent.map((s) => JSON.parse(s).event?.at).filter(Boolean)
      expect(events).toEqual([2, 3])
    })
  })

  it('unsubscribes on close', () => {
    const unsubscribe = vi.fn()
    const bridge = createChatBridge({ getSnapshot: () => [], subscribe: () => unsubscribe })
    const { socket } = fakeSocket()
    const conn = bridge.attach(socket)
    conn.handleClose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
```

Note: the third test is intentionally awkward — implement the bridge so each attached socket owns a queue and flushes on a microtask (`queueMicrotask`). If the microtask flush makes the test nondeterministic, replace flush scheduling with a synchronous flush guarded by a `flushing` flag and update the test accordingly (test must assert drop-oldest semantics: only the newest `queueLimit` events are sent).

- [ ] **Step 5: Implement `server/ws/chat-bridge.ts`**

```ts
import type { ChatEvent } from '@/lib/types'
import { encodeServerMessage, parseClientMessage } from './protocol'

export interface BridgeSocket {
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface ChatSocket {
  handleMessage(raw: string): void
  handleClose(): void
  queueSize(): number
}

export function createChatBridge(deps: {
  getSnapshot: () => ChatEvent[]
  subscribe: (listener: (event: ChatEvent) => void) => () => void
  queueLimit?: number
  now?: () => number
}) {
  const queueLimit = deps.queueLimit ?? 500
  const sockets = new Set<{ socket: BridgeSocket; queue: ChatEvent[]; unsubscribe: () => void; closed: boolean }>()

  const flush = (entry: { socket: BridgeSocket; queue: ChatEvent[]; closed: boolean }) => {
    if (entry.closed) return
    while (entry.queue.length > 0) {
      const event = entry.queue.shift()!
      try {
        entry.socket.send(encodeServerMessage({ op: 'event', event }))
      } catch {
        entry.closed = true
        entry.unsubscribe()
      }
    }
  }

  const broadcast = (event: ChatEvent) => {
    for (const entry of sockets) {
      entry.queue.push(event)
      if (entry.queue.length > queueLimit) entry.queue.splice(0, entry.queue.length - queueLimit)
      queueMicrotask(() => flush(entry))
    }
  }

  const attach = (socket: BridgeSocket): ChatSocket => {
    const entry = { socket, queue: [] as ChatEvent[], unsubscribe: () => {}, closed: false }
    entry.unsubscribe = deps.subscribe(broadcast)
    sockets.add(entry)
    socket.send(encodeServerMessage({ op: 'hello', snapshot: deps.getSnapshot() }))
    return {
      handleMessage: (raw) => {
        const msg = parseClientMessage(raw)
        if (!msg) {
          socket.send(encodeServerMessage({ op: 'error', code: 'BAD_MESSAGE', message: 'Unsupported message' }))
          return
        }
        if (msg.op === 'ping') socket.send(encodeServerMessage({ op: 'pong' }))
      },
      handleClose: () => {
        entry.closed = true
        entry.unsubscribe()
        sockets.delete(entry)
      },
      queueSize: () => entry.queue.length,
    }
  }

  return { attach, broadcast: (event: ChatEvent) => { for (const entry of sockets) broadcast(event) }, size: () => sockets.size }
}
```

(Careful: `broadcast` above broadcasts to all sockets; `deps.subscribe(broadcast)` must call the local fan-out, not re-subscribe. Restructure as needed so each socket pushes into its own queue exactly once per event; the tests are the contract.)

- [ ] **Step 6: Run bridge tests to green**

Run: `npx vitest run tests/unit/chat-bridge.test.ts tests/unit/protocol.test.ts`
Expected: PASS.

- [ ] **Step 7: Implement engine singleton + error taxonomy**

`server/engine/errors.ts` — classes exactly as in Interfaces. `server/engine/singleton.ts`:

```ts
import { EngineUnavailableError } from './errors'

export type EngineStatus = {
  ok: boolean
  mode: 'real' | 'fake'
  auth: 'anonymous' | 'authenticated'
  live: boolean
}

export interface EngineHandle {
  getStatus(): Promise<EngineStatus>
}

const KEY = '__tiktokEngine'

export function setEngine(engine: EngineHandle | null): void {
  ;(globalThis as Record<string, unknown>)[KEY] = engine ?? undefined
}

export function getEngine(): EngineHandle {
  const engine = (globalThis as Record<string, unknown>)[KEY] as EngineHandle | undefined
  if (!engine) throw new EngineUnavailableError('Engine is not running. Start the app with `npm run dev`.')
  return engine
}
```

- [ ] **Step 8: Implement custom server `server/index.ts` with WS echo wiring**

```ts
import { createServer } from 'node:http'
import next from 'next'
import { WebSocketServer } from 'ws'
import { createChatBridge } from './ws/chat-bridge'
import { setEngine } from './engine/singleton'

const port = Number(process.env.PORT ?? 3000)
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

await app.prepare()

const bridge = createChatBridge({
  getSnapshot: () => [],
  subscribe: () => () => {},
})

const server = createServer((req, res) => {
  void handle(req, res)
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  if (pathname !== '/ws/chat') return // let Next handle its own upgrades
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
})

wss.on('connection', (ws) => {
  const conn = bridge.attach({ send: (d) => ws.send(d), close: () => ws.close() })
  ws.on('message', (data) => conn.handleMessage(String(data)))
  ws.on('close', () => conn.handleClose())
  ws.on('error', () => conn.handleClose())
})

// minimal engine handle until real engine lands in Task 6
setEngine({
  getStatus: async () => ({ ok: true, mode: 'real', auth: 'anonymous', live: false }),
})

server.listen(port, () => {
  console.log(`> Ready on http://localhost:${port}`)
})
```

- [ ] **Step 9: Implement health route**

`app/api/health/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { EngineUnavailableError, getEngine } from '@/server/engine/singleton'
```

Note: import `getEngine` from `@/server/engine/singleton`, not from `errors` — fix the import line to:

```ts
import { NextResponse } from 'next/server'
import { getEngine } from '@/server/engine/singleton'
import { EngineUnavailableError } from '@/server/engine/errors'

export async function GET() {
  try {
    const engine = await getEngine().getStatus()
    return NextResponse.json({ status: 'ok', engine })
  } catch (error) {
    if (error instanceof EngineUnavailableError) {
      return NextResponse.json({ status: 'engine_unavailable' }, { status: 503 })
    }
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
```

- [ ] **Step 10: Create vitest config**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname) } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'server/engine/session-store.ts', 'server/ws/**'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 70 },
    },
  },
})
```

- [ ] **Step 11: Verify server boots and WS echo works**

```bash
npm run typecheck && npm run lint
timeout 25 npm run dev & sleep 12
curl -s http://localhost:3000/api/health
node -e "const ws=new WebSocket('ws://localhost:3000/ws/chat');ws.onmessage=(e)=>{console.log(e.data);process.exit(0)}"
```

Expected: health JSON `{"status":"ok","engine":{...}}`; WS prints `{"op":"hello","snapshot":[]}`. Kill dev afterwards.

- [ ] **Step 12: Run full unit suite + commit (only if git approved)**

Run: `npm run test`
Expected: PASS.
Commit: `chore: add custom server, ws bridge, engine singleton, health route`

---

### Task 3: Types and RTMP payload parser (TDD)

**Files:**
- Create: `lib/types.ts` (finalize)
- Create: `lib/parsers/rtmp.ts`
- Test: `tests/unit/rtmp.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `lib/types.ts`: `ChatUser`, `ChatEvent` (union exactly as in spec §5.3), `LiveRoomResult = { rtmpUrl: string; streamKey: string; combinedPushUrl?: string; roomId?: string; applied: string[] }`, `SessionState = { status: 'anonymous' | 'authenticated'; uniqueId?: string; nickname?: string }`, `LiveStatus = { authenticated: boolean; live: boolean; room?: LiveRoomResult }`.
  - `lib/parsers/rtmp.ts`: `extractRtmp(input: string): { rtmpUrl: string; streamKey: string; combinedPushUrl: string }` (throws `RtmpParseError`), `findRtmpPayload(value: unknown): RtmpFields | null`, `class RtmpParseError extends Error`, `type RtmpFields = { streamUrl?: string; streamKey?: string; pushUrl?: string }`.

- [ ] **Step 1: Write failing parser tests**

`tests/unit/rtmp.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { extractRtmp, findRtmpPayload, RtmpParseError } from '@/lib/parsers/rtmp'

describe('findRtmpPayload', () => {
  it('finds split stream_url + stream_key at top level', () => {
    expect(findRtmpPayload({ stream_url: 'rtmp://push.example.com/live', stream_key: 'sk-123' }))
      .toEqual({ streamUrl: 'rtmp://push.example.com/live', streamKey: 'sk-123' })
  })

  it('finds camelCase rtmpPushUrl + streamKey', () => {
    expect(findRtmpPayload({ rtmpPushUrl: 'rtmp://push.example.com/live', streamKey: 'sk-9' }))
      .toEqual({ streamUrl: 'rtmp://push.example.com/live', streamKey: 'sk-9' })
  })

  it('finds nested payloads', () => {
    const payload = { data: { room: { push_url: 'rtmp://cdn/app', stream_key: 'nested-1' } } }
    expect(findRtmpPayload(payload)).toEqual({ streamUrl: 'rtmp://cdn/app', streamKey: 'nested-1' })
  })

  it('returns null when no rtmp fields exist', () => {
    expect(findRtmpPayload({ status_code: 400, message: 'nope' })).toBeNull()
  })

  it('stops at depth bound without throwing', () => {
    let deep: Record<string, unknown> = { stream_key: 'too-deep' }
    for (let i = 0; i < 12; i++) deep = { child: deep }
    expect(findRtmpPayload(deep)).toBeNull()
  })
})

describe('extractRtmp', () => {
  it('extracts a split pair', () => {
    expect(extractRtmp(JSON.stringify({ stream_url: 'rtmp://push.example.com/live', stream_key: 'sk-1' })))
      .toEqual({ rtmpUrl: 'rtmp://push.example.com/live', streamKey: 'sk-1', combinedPushUrl: 'rtmp://push.example.com/live/sk-1' })
  })

  it('splits a combined push URL of form rtmp://host/app/key', () => {
    expect(extractRtmp(JSON.stringify({ push_url: 'rtmp://push.example.com/live/stream-key-abc' })))
      .toEqual({ rtmpUrl: 'rtmp://push.example.com/live', streamKey: 'stream-key-abc', combinedPushUrl: 'rtmp://push.example.com/live/stream-key-abc' })
  })

  it('parses query-style combined URLs', () => {
    expect(extractRtmp(JSON.stringify({ push_url: 'rtmp://push.example.com/live?key=abc123' })))
      .toEqual({ rtmpUrl: 'rtmp://push.example.com/live', streamKey: 'abc123', combinedPushUrl: 'rtmp://push.example.com/live?key=abc123' })
  })

  it('ignores non-rtmp strings', () => {
    expect(() => extractRtmp(JSON.stringify({ push_url: 'https://example.com/not-rtmp' }))).toThrow(RtmpParseError)
  })

  it('throws on invalid json', () => {
    expect(() => extractRtmp('not json')).toThrow(RtmpParseError)
  })

  it('throws when nothing matches', () => {
    expect(() => extractRtmp(JSON.stringify({ message: 'no rtmp here' }))).toThrow(RtmpParseError)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/rtmp.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/types.ts` (final) and `lib/parsers/rtmp.ts`**

`lib/types.ts` — final union from spec §5.3 exactly. `lib/parsers/rtmp.ts` implementation requirements:

- `findRtmpPayload(value, depth = 0)`: returns null past depth 10; scans objects for keys matching `/^(stream_url|rtmp_url|rtmp_push_url|push_url|streamUrl|rtmpUrl|rtmpPushUrl|pushUrl)$/i` (value string starting with `rtmp://` or `rtmps://`) and `/^(stream_key|streamKey)$/i`; recurses into plain objects and arrays; returns first match per field with earliest-found values.
- `extractRtmp(input)`: `JSON.parse` (throw `RtmpParseError` on syntax error), `findRtmpPayload`; if `streamUrl` and `streamKey` -> combine with `/`; if only `pushUrl` -> parse: if query has `key`/`stream_key` param, `rtmpUrl` = URL without that param, `streamKey` = param value; else split last path segment (`rtmpUrl` = without last segment, `streamKey` = last segment), reject non-`rtmp(s)://` and empty key; if only split pair missing either component -> throw.
- Never include the key value in thrown error messages.

- [ ] **Step 4: Run to green**

Run: `npx vitest run tests/unit/rtmp.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit (only if git approved)**

Run: `npm run typecheck`
Commit: `feat: add rtmp payload parser with tests`

---

### Task 4: Chat event parser (TDD)

**Files:**
- Create: `lib/parsers/chat.ts`
- Test: `tests/unit/chat.test.ts`

**Interfaces:**
- Consumes: `ChatEvent`, `ChatUser` from Task 3.
- Produces: `normalizeWebcastEvent(eventName: string, data: unknown, at?: number): ChatEvent | null`. `eventName` values are the `tiktok-live-connector` event strings (`chat`, `gift`, `follow`, `share`, `like`, `member`, `roomUser`, `streamEnd`, `connected`, `disconnected`, `error`); unknown names return null.

- [ ] **Step 1: Write failing tests with realistic fixtures**

`tests/unit/chat.test.ts` — cover:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeWebcastEvent } from '@/lib/parsers/chat'

const at = 1000

describe('normalizeWebcastEvent', () => {
  it('normalizes chat', () => {
    const data = { user: { uniqueId: 'alice', nickname: 'Alice', profilePictureUrl: 'https://img/a.jpg' }, comment: 'hello' }
    expect(normalizeWebcastEvent('chat', data, at)).toEqual({
      type: 'chat', user: { uniqueId: 'alice', nickname: 'Alice', avatarUrl: 'https://img/a.jpg' }, comment: 'hello', at,
    })
  })

  it('drops chat without uniqueId', () => {
    expect(normalizeWebcastEvent('chat', { comment: 'hi' }, at)).toBeNull()
  })

  it('marks gift streak end', () => {
    const data = {
      user: { uniqueId: 'bob', nickname: 'Bob' },
      giftId: 5655, repeatCount: 3, repeatEnd: true,
      giftDetails: { giftName: 'Rose', giftType: 1, diamondCount: 2 },
    }
    expect(normalizeWebcastEvent('gift', data, at)).toMatchObject({
      type: 'gift', giftName: 'Rose', repeatCount: 3, diamonds: 6, streakEnd: true,
    })
  })

  it('marks gift streak in progress', () => {
    const data = { user: { uniqueId: 'bob', nickname: 'Bob' }, giftId: 1, repeatCount: 1, repeatEnd: false, giftDetails: { giftType: 1, diamondCount: 5 } }
    expect(normalizeWebcastEvent('gift', data, at)).toMatchObject({ streakEnd: false, diamonds: 5 })
  })

  it('normalizes follow from social action', () => {
    expect(normalizeWebcastEvent('follow', { user: { uniqueId: 'c', nickname: 'C' } }, at))
      .toMatchObject({ type: 'follow', user: { uniqueId: 'c' } })
  })

  it('normalizes like counts', () => {
    expect(normalizeWebcastEvent('like', { user: { uniqueId: 'd', nickname: 'D' }, likeCount: 5, totalLikeCount: 99 }, at))
      .toMatchObject({ type: 'like', count: 5, total: 99 })
  })

  it('normalizes member join with viewer count', () => {
    expect(normalizeWebcastEvent('member', { user: { uniqueId: 'e', nickname: 'E' }, memberCount: 42 }, at))
      .toMatchObject({ type: 'member', viewerCount: 42 })
  })

  it('normalizes roomUser viewer count', () => {
    expect(normalizeWebcastEvent('roomUser', { viewerCount: 123 }, at))
      .toEqual({ type: 'viewerCount', count: 123, at })
  })

  it('normalizes streamEnd', () => {
    expect(normalizeWebcastEvent('streamEnd', { action: 3 }, at)).toEqual({ type: 'streamEnd', reason: 'action:3', at })
  })

  it('normalizes control events to status', () => {
    expect(normalizeWebcastEvent('connected', { roomId: 'r1' }, at)).toEqual({ type: 'status', state: 'connected', detail: 'r1', at })
    expect(normalizeWebcastEvent('disconnected', { code: 1000 }, at)).toEqual({ type: 'status', state: 'disconnected', detail: '1000', at })
  })

  it('returns null for unknown events', () => {
    expect(normalizeWebcastEvent('emote', {}, at)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/chat.test.ts` — expected FAIL.

- [ ] **Step 3: Implement**

Requirements: defensive field access (`asRecord`, `asString`, `asNumber` helpers); `follow`/`share` map from the connector's `social` event or its own `follow`/`share` events identically; gift `diamonds = diamondCount * repeatCount` when both numbers; `avatarUrl` only when string; `streamEnd.reason` = `action:${action}` when action is a number else `'ended'`; control events map as tested. Never throw — return null on malformed input.

- [ ] **Step 4: Run to green + full suite**

Run: `npm run test` — expected PASS.

- [ ] **Step 5: Commit (only if git approved)**

Commit: `feat: add chat event parser with tests`

---

### Task 5: Session store (TDD)

**Files:**
- Create: `server/engine/session-store.ts`
- Test: `tests/unit/session-store.test.ts`

**Interfaces:**
- Consumes: `DATA_DIR` env.
- Produces: `createSessionStore(baseDir: string): SessionStore` where `SessionStore = { readState(): Promise<unknown | null>; writeState(state: unknown): Promise<void>; clear(): Promise<void>; storageStatePath(): string }`. Used by Task 7. Atomic write: temp file + rename; `chmod 0600` on POSIX.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, stat, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSessionStore } from '@/server/engine/session-store'

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'sess-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('createSessionStore', () => {
  it('returns null when no state exists', async () => {
    expect(await createSessionStore(dir).readState()).toBeNull()
  })

  it('round-trips JSON state', async () => {
    const store = createSessionStore(dir)
    await store.writeState({ cookies: [{ name: 'sessionid', value: 'x' }] })
    expect(await store.readState()).toEqual({ cookies: [{ name: 'sessionid', value: 'x' }] })
  })

  it('sets file permissions to 0600', async () => {
    const store = createSessionStore(dir)
    await store.writeState({ a: 1 })
    const mode = (await stat(store.storageStatePath())).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('clear removes the file and tolerates missing file', async () => {
    const store = createSessionStore(dir)
    await store.writeState({ a: 1 })
    await store.clear()
    expect(await store.readState()).toBeNull()
    await expect(store.clear()).resolves.toBeUndefined()
  })

  it('returns null on corrupt json instead of throwing', async () => {
    const store = createSessionStore(dir)
    await mkdir(path.dirname(store.storageStatePath()), { recursive: true })
    await (await import('node:fs/promises')).writeFile(store.storageStatePath(), '{oops')
    expect(await store.readState()).toBeNull()
  })
})
```

- [ ] **Step 2: Verify failure**, then **Step 3: implement**

Implementation notes: `storageStatePath()` = `<baseDir>/session/storageState.json`; `writeState` creates dirs (`recursive: true`), writes `<path>.tmp` with mode `0o600`, then `rename`; `clear` uses `rm(path, { force: true })`.

- [ ] **Step 4: Green + commit** (`feat: add atomic session store with tests`)

---

### Task 6: Engine facade, fake engine, and route contract test harness

**Files:**
- Create: `server/engine/engine.ts`, `server/engine/events.ts`, `server/engine/fake-engine.ts`
- Modify: `server/engine/singleton.ts` (no shape change), `server/index.ts` (boot real/fake engine based on `E2E_MOCK_TIKTOK`)
- Test: `tests/unit/engine-contract.test.ts` (fake engine emits the full event sequence)

**Interfaces:**
- Consumes: Tasks 2–5.
- Produces:
  - `server/engine/events.ts`: `createEventBus(): EventBus` with `publish(event: ChatEvent): void`, `subscribe(listener: (event: ChatEvent) => void): () => void`, `snapshot(): ChatEvent[]` (ring buffer 50).
  - `server/engine/engine.ts`: `createEngine(opts: { dataDir: string }): EngineHandle` extended with `auth: AuthController`, `live: LiveController`, `chat: ChatController` where:
    - `AuthController = { start(): Promise<{ qrDataUrl: string; expiresAt: number; version: number }>; status(): Promise<AuthStatus>; logout(): Promise<void>; session(): Promise<SessionState> }`, `AuthStatus = SessionState & { qr?: { qrDataUrl: string; version: number; expiresAt: number }; detail?: string }`
    - `LiveController = { create(input: { title: string; category?: string; ageRestricted?: boolean }): Promise<LiveRoomResult>; end(): Promise<void>; status(): Promise<LiveStatus> }`
    - `ChatController = { connect(username: string): Promise<void>; disconnect(): Promise<void>; subscribe: EventBus['subscribe']; snapshot: EventBus['snapshot'] }`
  - `fake-engine.ts`: `createFakeEngine(): EngineHandle` — deterministic: `start()` returns a 1px PNG data URL with `version: 1`; `status()` transitions `waiting` -> `confirmed` after 3 s (timer-based, test-overridable via `createFakeEngine({ loginDelayMs })`); `live.create` resolves after 500 ms with fixed values `{ rtmpUrl: 'rtmp://fake.push.example.com/live', streamKey: 'sk_fake_1234567890', combinedPushUrl: 'rtmp://fake.push.example.com/live/sk_fake_1234567890', roomId: 'fake-room', applied: ['title'] }`; chat `connect('demo')` emits a scripted sequence every 300 ms: status connecting, status connected, chat, gift, follow, viewerCount, chat, streamEnd.

- [ ] **Step 1: Write contract test for the fake engine sequence**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createFakeEngine } from '@/server/engine/fake-engine'

describe('fake engine contract', () => {
  it('emits the scripted chat sequence', async () => {
    vi.useFakeTimers()
    const engine = createFakeEngine()
    const seen: string[] = []
    engine.chat.subscribe((e) => seen.push(e.type))
    await engine.chat.connect('demo')
    await vi.advanceTimersByTimeAsync(3000)
    expect(seen.slice(0, 4)).toEqual(['status', 'status', 'chat', 'gift'])
    expect(seen).toContain('viewerCount')
    vi.useRealTimers()
  })

  it('returns deterministic room credentials', async () => {
    const engine = createFakeEngine()
    const room = await engine.live.create({ title: 'Test' })
    expect(room.streamKey).toBe('sk_fake_1234567890')
  })
})
```

- [ ] **Step 2: Verify failure**, **Step 3: implement** the three files per Interfaces (fake engine uses `setInterval` stored on the instance and cleared on `disconnect`; make timers injectable only if tests need it — fake timers should suffice).
- [ ] **Step 4: Wire `server/index.ts`**: `const engine = process.env.E2E_MOCK_TIKTOK === '1' ? createFakeEngine() : createEngine({ dataDir: process.env.DATA_DIR ?? '.data' })` (real engine initially implements only `getStatus` + throws `EngineUnavailableError` for controllers; real implementations land in Tasks 7–12), pass `engine.chat.subscribe/snapshot` into the chat bridge, then `setEngine(engine)`.
- [ ] **Step 5: Run full suite + boot check** (`curl /api/health` with `E2E_MOCK_TIKTOK=1` shows `mode: 'fake'`).
- [ ] **Step 6: Commit** (`feat: add engine facade and deterministic fake engine`)

---

### Task 7: Playwright browser lifecycle + AuthManager (real)

**Files:**
- Create: `server/engine/browser.ts`, `server/engine/auth-manager.ts`
- Modify: `server/engine/engine.ts` (wire real auth), `server/index.ts` (unchanged shape)
- Test: `tests/unit/auth-manager.test.ts` (pure decision logic only: QR version bumping, captcha classification, session detection from cookie snapshots)

**Interfaces:**
- Consumes: Tasks 5–6, Playwright.
- Produces:
  - `browser.ts`: `createBrowserManager(opts: { dataDir: string; headless: boolean }): BrowserManager` with `getContext(): Promise<BrowserContext>` (lazy launch of persistent context at `<dataDir>/browser-profile`, viewport 1280x800, locale `en-US`), `relaunchHeaded(): Promise<BrowserContext>`, `dispose(): Promise<void>`, `isHeaded(): boolean`.
  - `auth-manager.ts`: `createAuthManager(deps: { browsers: BrowserManager; store: SessionStore; loginUrls?: string[] }): AuthController` with internal pure helpers exported for tests: `hasSessionCookie(cookies: { name: string; value: string }[]): boolean` (any `sessionid` with non-empty value), `classifyPageState(input: { hasQr: boolean; hasCaptcha: boolean; url: string }): 'qr' | 'captcha' | 'logged-in' | 'unknown'`, `nextQrVersion(prev: string | null, current: string): number` (hash-compare bump).

- [ ] **Step 1: Write failing tests for the pure helpers**

Cover: `hasSessionCookie` true/false; `classifyPageState` for captcha URL patterns (`/captcha`, `/verify`), logged-in (URL no longer contains `/login`), qr present; `nextQrVersion` bumps only when hash changes.

- [ ] **Step 2: Implement helpers + real manager**

Real flow: try candidate login URLs in order (`https://www.tiktok.com/login/qrcode`, then `https://www.tiktok.com/login` with QR tab click selector candidates), screenshot QR via the first matching of a selector candidate list (update list during live testing), poll `context.cookies()` every 2 s for `sessionid`, re-screenshot on QR hash change, detect captcha elements, on captcha relaunch headed and set status `captcha`, on success `context.storageState({ path: store.storageStatePath() })` then `chmod 0600`. If storage state exists at boot, launch with `storageState` and validate by loading the creator page; on failure fall back to login. All selector/URL candidates live in a single `SELECTORS` object to make updates one-line changes.

- [ ] **Step 3: Manual live smoke (no TikTok account data in tests)**

`E2E_MOCK_TIKTOK=0 npm run dev`, open dashboard later; for now verify via curl: `POST /api/auth/login/start` (route lands in Task 8) — if not yet implemented, verify manager via a temporary script `scripts/smoke-auth.ts` run with `tsx` that starts login and prints QR version/status for 30 s. Delete or keep the script under `scripts/` (documented in README).

- [ ] **Step 4: Run full suite + commit** (`feat: add playwright browser lifecycle and qr auth manager`)

---

### Task 8: Auth API routes + AuthCard UI

**Files:**
- Create: `app/api/auth/login/start/route.ts`, `app/api/auth/login/status/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/session/route.ts`, `components/dashboard/auth-card.tsx`, `lib/api-client.ts`, `components/theme-toggle.tsx`
- Modify: `app/page.tsx` (dashboard shell: header + left column with AuthCard)
- Test: `tests/unit/auth-routes.test.ts` (fake engine injected via `setEngine`)

**Interfaces:**
- Consumes: engine controllers (Task 6–7), `api-client.ts` helpers.
- Produces:
  - `lib/api-client.ts`: `apiGet<T>(path: string): Promise<T>`, `apiPost<T>(path: string, body?: unknown): Promise<T>` throwing `ApiError { code, message }` mapped from JSON `{ error: { code, message } }`.
  - Routes: `POST /api/auth/login/start` -> 200 `{ qrDataUrl, expiresAt, version }`, 409 if already authenticated; `GET /api/auth/login/status` -> 200 `AuthStatus`; `POST /api/auth/logout` -> 204; `GET /api/auth/session` -> 200 `SessionState`.
  - `AuthCard`: shows QR panel (image + "Waiting for scan" + refresh button + expiry countdown), captcha instruction state, or signed-in state (uniqueId/nickname + "Switch account" / "Log out"); polls `GET /api/auth/login/status` every 2 s only while a QR is displayed; sonner toasts on transitions.

- [ ] **Step 1: Write failing route tests**

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { setEngine, type EngineHandle } from '@/server/engine/singleton'
import { POST } from '@/app/api/auth/login/start/route'

afterEach(() => setEngine(null))

function engine(partial: Partial<EngineHandle>): EngineHandle {
  return { getStatus: async () => ({ ok: true, mode: 'fake', auth: 'anonymous', live: false }), ...partial } as EngineHandle
}

it('returns qr payload', async () => {
  setEngine(engine({ auth: { start: async () => ({ qrDataUrl: 'data:image/png;base64,AA', expiresAt: 123, version: 1 }) } } as never))
  const res = await POST()
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ qrDataUrl: 'data:image/png;base64,AA', expiresAt: 123, version: 1 })
})

it('maps AuthRequiredError to 401', async () => {
  const { AuthRequiredError } = await import('@/server/engine/errors')
  setEngine(engine({ live: { create: async () => { throw new AuthRequiredError('Login first') } } } as never))
  const res = await (await import('@/app/api/live/create/route')).POST(
    new Request('http://localhost/api/live/create', { method: 'POST', body: JSON.stringify({ title: 'T' }) }) as never,
  )
  expect(res.status).toBe(401)
  expect((await res.json()).error.code).toBe('AUTH_REQUIRED')
})

it('maps CaptchaError to 409 with code CAPTCHA', async () => {
  const { CaptchaError } = await import('@/server/engine/errors')
  setEngine(engine({ auth: { start: async () => { throw new CaptchaError('Captcha detected') } } } as never))
  const res = await POST()
  expect(res.status).toBe(409)
  expect((await res.json()).error.code).toBe('CAPTCHA')
})
```

- [ ] **Step 2: Implement routes** with a shared `server/http.ts` helper: `route(handler)` that maps `EngineError` subclasses to `{ error: { code, message } }` + status (400 `EXTRACTION_FAILED`, 401 `AUTH_REQUIRED`, 409 `CAPTCHA`/`NOT_ELIGIBLE`/`ALREADY_AUTHENTICATED`, 503 `ENGINE_UNAVAILABLE`, 500 `INTERNAL`).
- [ ] **Step 3: Implement `lib/api-client.ts` and `AuthCard`** per Interfaces; add `ThemeToggle` (dropdown or simple button toggling `next-themes`).
- [ ] **Step 4: Verify UI manually with fake engine**

```bash
E2E_MOCK_TIKTOK=1 npm run dev
```

Expected: QR image appears; after ~3 s status flips to authenticated and card shows the account; switch/logout resets. (E2E assertions land in Task 16.)
- [ ] **Step 5: Run typecheck/lint/tests + commit** (`feat: add auth routes and qr login card`)

---

### Task 9: Live-room extraction engine + routes

**Files:**
- Create: `server/engine/live-room.ts`
- Modify: `server/engine/engine.ts` (wire real `live`)
- Create: `app/api/live/create/route.ts`, `app/api/live/end/route.ts`, `app/api/live/status/route.ts`
- Test: `tests/unit/live-room.test.ts` (interceptor matcher pure helper), `tests/unit/live-routes.test.ts` (route mapping with fake engine)

**Interfaces:**
- Consumes: Tasks 3, 7–8 (`extractRtmp`, browser manager, session guard).
- Produces:
  - `live-room.ts` exported pure helper: `couldContainRtmp(contentType: string | null, body: string): boolean` — true for JSON/text bodies whose lowercased body contains any of `stream_url`, `stream_key`, `push_url`, `rtmp`; false for non-json content types, bodies > 512 KB, or empty.
  - `createLiveRoom(deps: { browsers: BrowserManager; auth: AuthController }): LiveController` with the flow from spec §5.2: `LIVE_URL_CANDIDATES` (`https://www.tiktok.com/live/create`, `https://www.tiktok.com/creator-center/live` — extendable list), response interception using `couldContainRtmp` + `extractRtmp`, DOM fallback selector candidate list, form fill of title/category/age-restricted when controls exist, 45 s timeout, on failure screenshot to `<DATA_DIR>/artifacts/live-create-<timestamp>.png` and throw `ExtractionFailedError` (message includes artifact path, never key/cookie values), cache successful room in memory, `applied: string[]` reflects which form fields were actually set. `end()` clicks the end-live control candidates; `status()` returns `{ authenticated, live, room? }`.

- [ ] **Step 1: Write failing matcher tests** (JSON with rtmp key true; `image/png` false; > 512 KB false; HTML with `stream_url` false).
- [ ] **Step 2: Implement matcher + engine**, wire into `engine.ts` real path.
- [ ] **Step 3: Route tests with fake engine** for 200/401/409/500 mappings.
- [ ] **Step 4: Manual headed verification (requires user account — flag as user-assisted step)**

`TIKTOK_HEADLESS=0 E2E_MOCK_TIKTOK=0 npm run dev`; after QR login, click "Create Live Room" with a real account and confirm:
1. Response contains a valid `rtmpUrl` + `streamKey` (paste into OBS and confirm "Connected" is out of scope; format check only).
2. Failure path preserves an artifact screenshot.
Record the working URL/selector candidates back into `SELECTORS`/`LIVE_URL_CANDIDATES`. **If the user is unavailable, leave defaults and mark this checklist item as "requires user verification" in README.**
- [ ] **Step 5: Run suite + commit** (`feat: add live room extraction engine and routes`)

---

### Task 10: BroadcastForm + StreamKeyCard UI

**Files:**
- Create: `components/dashboard/broadcast-form.tsx`, `components/dashboard/stream-key-card.tsx`, `components/copy-button.tsx`, `components/dashboard/status-bar.tsx`
- Modify: `app/page.tsx` (right column layout), `lib/api-client.ts` (typed calls: `createLive`, `endLive`, `liveStatus`)
- Test: covered by E2E Task 16 (no unit test for presentational components)

**Interfaces:**
- Consumes: `LiveRoomResult`, Magic UI `BorderBeam`/`Ripple`, shadcn Card/Input/Label/Switch/Select/Tooltip.
- Produces:
  - `BroadcastForm`: title (required, max 100), category select (static candidate list, `category?: string`), age-restriction switch; submit button with Ripple + spinner + disabled while pending; inline error surface.
  - `StreamKeyCard`: if no room — empty state; if room — server URL row (copy), stream key row masked as `sk_••••••••••1234` (last 4 visible), eye toggle with 60 s auto-hide countdown, copy buttons for URL/key/combined with checkmark morph + toast, `BorderBeam` active only while live, actions: "End Stream" (confirm dialog) and disabled states.
  - `CopyButton`: clipboard write with `navigator.clipboard.writeText`, fallback to hidden textarea + `document.execCommand('copy')` for non-secure contexts, success state resets after 1.5 s.

- [ ] **Step 1: Implement components** per Interfaces (no gradients; glass utility; `focus-glass` on controls).
- [ ] **Step 2: Verify with fake engine** — create room shows fixed fake credentials; copy buttons write to clipboard (check in browser console `navigator.clipboard.readText()`); key masks/reveals and auto-hides after 60 s (temporarily lower the constant via query param `?reveal=5` for manual verification if needed).
- [ ] **Step 3: typecheck/lint + commit** (`feat: add broadcast form and stream key card`)

---

### Task 11: Chat connection engine + routes

**Files:**
- Create: `server/engine/chat-connection.ts`
- Modify: `server/engine/engine.ts` (wire real chat), `server/index.ts` (pass engine bus into bridge)
- Create: `app/api/chat/connect/route.ts`, `app/api/chat/disconnect/route.ts`
- Test: `tests/unit/chat-routes.test.ts` (fake engine), `tests/unit/chat-connection.test.ts` (reconnect policy pure helper)

**Interfaces:**
- Consumes: `normalizeWebcastEvent` (Task 4), EventBus (Task 6), `tiktok-live-connector`.
- Produces:
  - `chat-connection.ts`: exported pure helper `nextBackoff(attempt: number): number` (1000 * 2^attempt capped 30000, jitter omitted for determinism); `createChatConnection(deps: { bus: EventBus; createConnector?: (username: string) => ConnectorLike; getSignApiKey?: () => string | undefined }): ChatController`; `ConnectorLike` (minimal surface so tests can inject a fake): `{ connect(): Promise<unknown>; disconnect(): Promise<void>; on(event: string, cb: (...args: unknown[]) => void): void }`.
  - Real implementation maps connector events (`chat`, `gift`, `follow`, `share`, `like`, `member`, `roomUser`, `streamEnd`, `connected`, `disconnected`, `error`) through `normalizeWebcastEvent` and publishes to the bus; auto-reconnect on unexpected disconnect with `nextBackoff` (max 5 attempts, publishes `status: error` after exhaustion); `connect()` while connected replaces the previous connection; `connect()` on a username that is offline rejects with `ExtractionFailedError` mapped to 409 `NOT_LIVE` (message from connector error, sanitized).
  - Routes: `POST /api/chat/connect { username }` (validated: `/^[A-Za-z0-9_.]{1,24}$/`, strip leading `@`) -> 204; `POST /api/chat/disconnect` -> 204.

- [ ] **Step 1: Write failing tests** — backoff sequence `[1000, 2000, 4000, 8000, 16000, 30000, 30000...]`; fake connector emits `chat` -> bus snapshot contains normalized chat; reconnect scheduled on disconnect (fake timers); disconnect stops timers.
- [ ] **Step 2: Implement engine + routes; wire bridge in `server/index.ts`** to use `engine.chat.subscribe`/`snapshot`.
- [ ] **Step 3: Manual verification against a live public stream (optional, network-dependent)**

```bash
E2E_MOCK_TIKTOK=0 npm run dev
curl -X POST localhost:3000/api/chat/connect -H 'content-type: application/json' -d '{"username":"<any live streamer>"}'
node -e "const ws=new WebSocket('ws://localhost:3000/ws/chat');ws.onmessage=e=>console.log(e.data)"
```

Expected: hello snapshot then live events. If no streamer available, rely on fake-engine E2E and note manual verification pending.
- [ ] **Step 4: Suite + commit** (`feat: add chat connection engine and routes`)

---

### Task 12: ChatPanel + overlay route

**Files:**
- Create: `hooks/use-chat-socket.ts`, `components/dashboard/chat-panel.tsx`, `components/dashboard/event-row.tsx`, `app/overlay/chat/page.tsx`, `components/overlay/chat-overlay.tsx`, `lib/overlay-config.ts`
- Modify: `app/page.tsx` (mount ChatPanel with viewer count in StatusBar)
- Test: `tests/unit/overlay-config.test.ts` (pure query-param parsing)

**Interfaces:**
- Consumes: WS protocol (Task 2), `ChatEvent` (Task 3).
- Produces:
  - `use-chat-socket(opts?: { maxEvents?: number }): { events: ChatEvent[]; connected: boolean }` — connects to `ws://${location.host}/ws/chat`, handles `hello`/`event`/`pong`/`error`, appends to bounded array (`maxEvents` default 100 for panel, 200 overlay), reconnects with backoff (1s→15s), heartbeat `ping` every 25 s.
  - `lib/overlay-config.ts`: `parseOverlayConfig(search: string): OverlayConfig` with defaults `{ theme: 'dark', fontSize: 28, max: 12, showGifts: true, showLikes: false, showFollows: true, showViewers: true, showStatus: true, chip: true }`; boolean params accept `1|0|true|false`.
  - `chat-overlay.tsx`: transparent root (`bg-transparent`), renders last `max` events oldest→newest with BlurFade entry, per-type rows (gift with coin icon + count, follow with heart icon), optional viewer chip, disconnected dot when `showStatus`.
  - `app/overlay/chat/page.tsx`: client component reading `useSearchParams`, sets `document.documentElement.classList` per theme, no dashboard chrome.
  - `ChatPanel`: tabs "Chat" / "Events"; connect form (username input prefilled with session uniqueId when authenticated); pause-on-scroll (only autoscroll when near bottom); viewer count badge with NumberTicker.

- [ ] **Step 1: Implement `parseOverlayConfig` + tests** (cover defaults, invalid numbers fall back, boolean parsing, `max` clamped 1–50).
- [ ] **Step 2: Implement socket hook, panel, and overlay** per Interfaces.
- [ ] **Step 3: Manual verify with fake engine**

`E2E_MOCK_TIKTOK=1 npm run dev` then `POST /api/chat/connect {username:"demo"}`; watch dashboard panel fill; open `http://localhost:3000/overlay/chat?theme=dark&max=5&showViewers=1` — transparency check via browser devtools (computed background transparent).
- [ ] **Step 4: Suite + commit** (`feat: add chat panel and obs overlay route`)

---

### Task 13: Liquid Glass polish pass

**Files:**
- Modify: `app/globals.css`, `components/dashboard/*`, `app/page.tsx`, `components/overlay/chat-overlay.tsx`
- Create: `components/ripple-button.tsx` (if Magic UI ripple needs a wrapper)

**Interfaces:**
- Consumes: everything prior.
- Produces: final visual system — no new behavior.

- [ ] **Step 1: Audit and apply glass layers** to every surface (cards `glass`, modals/toasts `glass-strong`), hairline borders, radii consistency, focus rings, restrained BorderBeam (only live CTA + live key card), reduced-motion fallbacks.
- [ ] **Step 2: Responsive pass** — dashboard `grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]`, mobile stacks; overlay font sizes scale via `clamp`.
- [ ] **Step 3: Dark/light pass** — verify both themes on dashboard and overlay; contrast check for overlay text over video backgrounds (chip on by default).
- [ ] **Step 4: Verify no AI-slop** — no purple/pink gradients, no mesh backgrounds, no decorative orbs; a single subtle radial sheen allowed on the base layer only.
- [ ] **Step 5: Screenshot review** — capture dashboard (dark + light) and overlay with Playwright CLI, compare against the spec's design principles, fix findings; commit (`feat: polish liquid glass design system`).

---

### Task 14: E2E suite, coverage gates, README

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/dashboard.spec.ts`, `tests/e2e/overlay.spec.ts`, `tests/e2e/auth.spec.ts`, `README.md`
- Modify: `vitest.config.ts` (coverage thresholds), `.gitignore`

**Interfaces:**
- Consumes: `E2E_MOCK_TIKTOK=1`, fake engine timings (login after 3 s, events every 300 ms).
- Produces: deterministic E2E suite that never touches TikTok.

- [ ] **Step 1: Configure Playwright** — `webServer: { command: 'E2E_MOCK_TIKTOK=1 PORT=3100 npm run dev', url: 'http://localhost:3100/api/health', reuseExistingServer: !process.env.CI }`, `use: { baseURL: 'http://localhost:3100', permissions: ['clipboard-read', 'clipboard-write'] }`, chromium project only.
- [ ] **Step 2: Write specs**
  - `auth.spec.ts`: QR image visible; status flips to authenticated within 6 s; logout returns to QR.
  - `dashboard.spec.ts`: create room shows fake RTMP + masked key (`sk_fake••••••••` prefix visible, full key hidden); eye toggle reveals; copy key writes fake key to clipboard (read via `navigator.clipboard.readText()`); End Stream restores empty state; end-to-end error toast when engine not authenticated (navigate with a route that 401s — use `page.route` to force a 401 response).
  - `overlay.spec.ts`: `/overlay/chat?max=5` starts chat via API then asserts a chat row appears within 5 s; `document.body` background computed transparent; viewer chip shows NumberTicker value; `showStatus=0` hides the status dot.
- [ ] **Step 3: Coverage** — run `npm run test:coverage`; ensure thresholds from `vitest.config.ts` pass; if below, add missing unit tests (do not lower thresholds below spec 80%).
- [ ] **Step 4: README** — sections: Requirements, Install (`npm install` + `npm run setup:browser`), Run (`npm run dev`), Using with OBS (Server URL/Key paste, Browser Source URL examples with query params, Custom Browser Dock note), Architecture (one-paragraph), Testing, Configuration env table, **Risks & Disclaimer** (unofficial API/ToS, account restriction, AGPL note for `tiktok-live-connector`), Troubleshooting (captcha flow, engine unavailable, offline streamer, sign API key).
- [ ] **Step 5: Full verification**

```bash
npm run lint && npm run typecheck && npm run test && npm run test:e2e
```

Expected: all green. Commit (`test: add e2e suite and coverage gates` + `docs: add readme`).

---

### Task 15: Final review and hardening

**Files:**
- Modify: any files flagged by review.

- [ ] **Step 1: Run security review agent** on `server/engine/**`, `server/ws/**`, `app/api/**` (secrets never logged; input validation on all routes; WS message size limits — add `WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })` if missing; artifact directory permissions).
- [ ] **Step 2: Run code review agent** on the whole diff; address CRITICAL/HIGH findings.
- [ ] **Step 3: Manual acceptance checklist (user-assisted)**
  - Real QR login works.
  - Real live creation works or documented blockers captured in README troubleshooting.
  - Chat reads a real public stream.
  - OBS Browser Source shows overlay with transparency.
- [ ] **Step 4: Final verification suite** (`lint`, `typecheck`, `test`, `test:e2e`) and commit (`chore: address review findings`).

---

## Self-Review Notes

- **Spec coverage:** §5.1 auth -> Tasks 7–8; §5.2 extraction -> Tasks 9–10; §5.3 chat -> Task 11; §5.4 WS protocol -> Tasks 2, 6, 11, 12; §5.5 overlay -> Task 12; §6 design -> Tasks 1, 10, 12, 13; §7 config -> Tasks 1, 2; §8 testing -> Tasks 3–5, 8, 9, 11, 12, 14; §9 phases -> Tasks 1–15.
- **Discovery items** (TikTok URLs/selectors, connector field names) are explicitly isolated in Task 7/9/11 with candidate lists and user-assisted verification steps, per spec §10.
- **Git commits** are gated on explicit user approval at execution handoff (Global Constraints).
