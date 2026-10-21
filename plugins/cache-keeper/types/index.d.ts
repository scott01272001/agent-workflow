// State contract for cache-keeper.

/** Rolling keep-warm bookkeeping for this session. */
export interface KeeperState {
  /** Timestamp of the last model request (ms); null before the first. */
  lastAt: number | null
  /** Prefix size of the last request: input + cache_read + cache_creation. */
  prefix: number
  /** Pings sent since the last real (non-ping) turn. */
  count: number
  /** A ping was sent and its turn has not completed yet. */
  inFlight: boolean
  /** The turn now running (or queued) was triggered by our ping. */
  isPingTurn: boolean
  /** Per-session override from /keep-warm; null falls back to userConfig. */
  override: 'on' | 'off' | null
  /** Total pings this session (for /keep-warm status). */
  totalPings: number
}

declare module 'claude-code' {
  interface PluginState {
    'cache-keeper': {
      state: KeeperState | null
    }
  }
}
