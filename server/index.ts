import { createServer } from "node:http"
import next from "next"
import { WebSocketServer } from "ws"
import { createEngine } from "./engine/engine"
import { createFakeEngine } from "./engine/fake-engine"
import { setEngine } from "./engine/singleton"
import { createChatBridge } from "./ws/chat-bridge"

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? "127.0.0.1"
const dev = process.env.NODE_ENV !== "production"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false
  const name = hostHeader.replace(/:\d+$/, "")
  return LOOPBACK_HOSTS.has(name)
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    return isLoopbackHost(new URL(origin).host)
  } catch {
    return false
  }
}

const app = next({ dev })
const handle = app.getRequestHandler()

await app.prepare()
const upgradeHandler = app.getUpgradeHandler()

const engine =
  process.env.E2E_MOCK_TIKTOK === "1"
    ? createFakeEngine()
    : createEngine({
        dataDir: process.env.DATA_DIR ?? ".data",
        headless: process.env.TIKTOK_HEADLESS !== "0",
      })

const bridge = createChatBridge({
  getSnapshot: engine.chat.snapshot,
  subscribe: engine.chat.subscribe,
})

const server = createServer((req, res) => {
  if (!isLoopbackHost(req.headers.host) || !isAllowedOrigin(req.headers.origin)) {
    res.writeHead(403, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: { code: "FORBIDDEN", message: "Requests are limited to localhost." } }))
    return
  }
  const contentLength = Number(req.headers["content-length"] ?? 0)
  if (req.url?.startsWith("/api/") && contentLength > 256 * 1024) {
    res.writeHead(413, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large." } }))
    return
  }
  void handle(req, res)
})

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

server.on("upgrade", (req, socket, head) => {
  if (!isLoopbackHost(req.headers.host) || !isAllowedOrigin(req.headers.origin)) {
    socket.destroy()
    return
  }

  let pathname = "/"
  try {
    pathname = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`).pathname
  } catch {
    socket.destroy()
    return
  }

  if (pathname !== "/ws/chat") {
    upgradeHandler(req, socket, head)
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req))
})

const alive = new WeakMap<object, boolean>()
const SEND_BUFFER_LIMIT = 1_000_000

wss.on("connection", (ws) => {
  alive.set(ws, true)
  ws.on("pong", () => alive.set(ws, true))
  const conn = bridge.attach({
    send: (data) => {
      if (ws.bufferedAmount > SEND_BUFFER_LIMIT) {
        ws.terminate()
        return
      }
      ws.send(data)
    },
    close: (code, reason) => ws.close(code, reason),
  })
  ws.on("message", (data) => conn.handleMessage(String(data)))
  ws.on("close", () => conn.handleClose())
  ws.on("error", () => conn.handleClose())
})

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (alive.get(ws) === false) {
      ws.terminate()
      continue
    }
    alive.set(ws, false)
    ws.ping()
  }
}, 30_000)
heartbeat.unref()

setEngine(engine)

server.listen(port, host, () => {
  console.log(`> TikTok Live Studio Kit ready on http://${host}:${port}`)
})

const shutdown = () => {
  bridge.dispose()
  clearInterval(heartbeat)
  void engine.dispose().catch(() => undefined)
  wss.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
