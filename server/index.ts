import { createServer } from "node:http"
import next from "next"
import { WebSocketServer } from "ws"
import { createEngine } from "./engine/engine"
import { createFakeEngine } from "./engine/fake-engine"
import { setEngine } from "./engine/singleton"
import { createChatBridge } from "./ws/chat-bridge"

const port = Number(process.env.PORT ?? 3000)
const dev = process.env.NODE_ENV !== "production"
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
  void handle(req, res)
})

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })

server.on("upgrade", (req, socket, head) => {
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

wss.on("connection", (ws) => {
  const conn = bridge.attach({
    send: (data) => ws.send(data),
    close: (code, reason) => ws.close(code, reason),
  })
  ws.on("message", (data) => conn.handleMessage(String(data)))
  ws.on("close", () => conn.handleClose())
  ws.on("error", () => conn.handleClose())
})

setEngine(engine)

server.listen(port, () => {
  console.log(`> TikTok Live Studio Kit ready on http://localhost:${port}`)
})

const shutdown = () => {
  bridge.dispose()
  wss.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 3000).unref()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
