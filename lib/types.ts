export type ChatUser = {
  uniqueId: string
  nickname: string
  avatarUrl?: string
}

export type ChatEvent =
  | { type: "status"; state: "connecting" | "connected" | "disconnected" | "error"; detail?: string; at: number }
  | { type: "chat"; user: ChatUser; comment: string; at: number }
  | {
      type: "gift"
      user: ChatUser
      giftId: string
      giftName?: string
      repeatCount: number
      diamonds?: number
      streakEnd: boolean
      at: number
    }
  | { type: "follow"; user: ChatUser; at: number }
  | { type: "share"; user: ChatUser; at: number }
  | { type: "like"; user?: ChatUser; count: number; total?: number; at: number }
  | { type: "member"; user: ChatUser; viewerCount?: number; at: number }
  | { type: "viewerCount"; count: number; total?: number; at: number }
  | { type: "streamEnd"; reason?: string; at: number }

export type LiveRoomResult = {
  rtmpUrl: string
  streamKey: string
  combinedPushUrl?: string
  roomId?: string
  applied: string[]
}

export type SessionState = {
  status: "anonymous" | "authenticated"
  uniqueId?: string
  nickname?: string
}

export type LiveStatus = {
  authenticated: boolean
  live: boolean
  room?: LiveRoomResult
}
