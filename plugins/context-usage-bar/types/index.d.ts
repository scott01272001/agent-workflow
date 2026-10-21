export type ContextReading = { percent: number; tokens: number; window: number }
export type LimitReading = { kind: string; percentUsed: number }
export type Reading = { context: ContextReading | null; limits: LimitReading[] }

export type CacheReading = {
  at: number
  input: number
  cacheRead: number
  cacheCreation: number
  output: number
}
export type Cliff = {
  at: number
  gapMs: number
  cause: 'expired' | 'invalidated'
  lostTokens: number
}
export type CacheState = { last: CacheReading | null; history: CacheReading[]; cliffs: Cliff[] }

declare module 'claude-code' {
  interface PluginState {
    'context-usage-bar': {
      reading: Reading | null
      cache: CacheState | null
      tick: number
    }
  }
}
