// Context, session-usage and prompt-cache bars above the prompt, plus /cache-report.
//
// context: how full the context window is (green bar, token counts).
// 5h/7d/spend: each rate-limit window's utilization (cyan bars).
// cache: the last request's cache hit rate (inverted thresholds - high is good)
//   and an *estimated* TTL countdown (the API exposes no expiry timestamp; the
//   countdown is last-request time + the configured TTL, refreshed on every
//   request because the cache window slides).
//
// Figures: $.session.usage() (free) for context/limits; turn.step results
// (TurnUsage: input / cache_read / cache_creation) for cache. Cache cliffs -
// a request whose cache read collapses - are recorded with a cause guess:
// gap > TTL means expiry, a small gap means the prefix was rewritten.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheReading, CacheState, Cliff, Reading } from '../types'

const CONTEXT_SEGMENTS = 14
const LIMIT_SEGMENTS = 10
const FULL = '▰'
const EMPTY = '▱'
const WARN_PERCENT = 70
const ALERT_PERCENT = 90
const HISTORY_LIMIT = 200
const MIN_CLIFF_PREFIX = 10_000
const TICK_MS = 30_000
const KIND_LABEL: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'spend',
}

const reading = atom({ plugin: 'context-usage-bar', key: 'reading' } as const, null)
const cache = atom({ plugin: 'context-usage-bar', key: 'cache' } as const, null)
const tick = atom({ plugin: 'context-usage-bar', key: 'tick' } as const, 0)

/** `▰▰▰▱…` over `segments` cells for a 0–100 percentage. */
export function bar(percent: number, segments: number): string {
  const filled = Math.min(segments, Math.max(0, Math.round((percent / 100) * segments)))
  return FULL.repeat(filled) + EMPTY.repeat(segments - filled)
}

/** The bar's color for a percentage. `ok` is the healthy hue: the context bar
 * is green, the session (rate-limit) bars cyan; warning hues are shared. */
export function barColor(percent: number, ok: 'green' | 'cyan' = 'green'): 'green' | 'cyan' | 'yellow' | 'red' {
  if (percent >= ALERT_PERCENT) return 'red'
  if (percent >= WARN_PERCENT) return 'yellow'
  return ok
}

/** `84k`, `1.2M`: tokens as the status line abbreviates them. */
export function compact(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`
  return `${tokens}`
}

/** `five_hour` → `5h`; an unknown kind keeps its own name. */
export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind
}

/** Hit rate 0–100: cache reads over the whole prefix. null when nothing was sent. */
export function hitRate(r: CacheReading): number | null {
  const prefix = r.input + r.cacheRead + r.cacheCreation
  if (prefix <= 0) return null
  return Math.round((r.cacheRead / prefix) * 100)
}

/** Cache 命中率的顏色：高是好事，門檻反轉。 */
export function hitColor(percent: number): 'green' | 'yellow' | 'red' {
  if (percent >= 80) return 'green'
  if (percent >= 50) return 'yellow'
  return 'red'
}

/** A cliff: the previous request had a sizable prefix, this one read almost
 * none of it back. Cause by gap: past the TTL it expired; otherwise the
 * prefix bytes changed (system prompt, tool list, a mod reload, model/effort). */
export function classifyCliff(prev: CacheReading, cur: CacheReading, ttlMs: number): Cliff | null {
  const prevPrefix = prev.input + prev.cacheRead + prev.cacheCreation
  if (prevPrefix < MIN_CLIFF_PREFIX) return null
  if (cur.cacheRead >= prevPrefix * 0.1) return null
  const gapMs = cur.at - prev.at
  return {
    at: cur.at,
    gapMs,
    cause: gapMs > ttlMs ? 'expired' : 'invalidated',
    lostTokens: prevPrefix - cur.cacheRead,
  }
}

/** `~41m`, `~90s`; null when already past. */
export function fmtRemaining(ms: number): string | null {
  if (ms <= 0) return null
  if (ms < 120_000) return `~${Math.round(ms / 1000)}s`
  return `~${Math.round(ms / 60_000)}m`
}

export function buildReport(state: CacheState | null, ttlMs: number, now: number): string {
  if (!state || state.history.length === 0) return 'cache-report：本 session 尚無模型請求紀錄。'
  const h = state.history
  const rates = h.map(hitRate).filter((x): x is number => x !== null)
  const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0
  const gaps = h.slice(1).map((r, i) => r.at - h[i].at).sort((a, b) => a - b)
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0
  const lines = [
    `cache-report（TTL 假設 ${Math.round(ttlMs / 60_000)}m；統計自 mod 載入起）`,
    `請求數 ${h.length}｜平均命中率 ${avg}%｜最近 ${rates.at(-1) ?? '–'}%`,
    `請求間隔：中位 ${Math.round(median / 1000)}s｜最大 ${Math.round((gaps.at(-1) ?? 0) / 1000)}s`,
    `cache 斷裂 ${state.cliffs.length} 次${state.cliffs.length ? '：' : ''}`,
    ...state.cliffs.slice(-10).map((c) =>
      `  - ${Math.round((now - c.at) / 60_000)} 分鐘前｜間隔 ${Math.round(c.gapMs / 1000)}s｜` +
      `${c.cause === 'expired' ? '過期（閒置超過 TTL）' : '前綴被改（system/工具/模型/effort/mod 重載）'}｜` +
      `估損 ${compact(c.lostTokens)} tokens`),
  ]
  return lines.join('\n')
}

async function refresh($: EngineInterface): Promise<void> {
  try {
    const { context, rateLimits } = await $.session.usage()
    const next: Reading = {
      context:
        typeof context.percent === 'number'
          ? { percent: context.percent, tokens: context.tokens ?? 0, window: context.window }
          : null,
      limits: (rateLimits ?? []).map((l) => ({ kind: l.kind, percentUsed: l.percentUsed })),
    }
    if (next.context === null && next.limits.length === 0) return
    await update($, reading, () => next)
  } catch {
    // Decoration: a failed reading keeps the last one, never the turn.
  }
}

export const register: Register = (on, options) => {
  const ttlMs = (options as { ttl?: string } | undefined)?.ttl === '5m' ? 5 * 60_000 : 60 * 60_000

  on('session.start', async ($, e, next) => {
    await refresh($)
    $.command.register({ name: 'cache-report', description: 'Prompt cache 命中率、斷裂與閒置統計' })
    $.clock.every(TICK_MS, () => {
      void update($, tick, (n) => (n + 1) % 1_000_000)
    })
    return next(e)
  })

  on('command.run', { command: 'cache-report' }, async ($) => {
    const state = await read($, cache)
    return { text: buildReport(state, ttlMs, await $.clock.now()) }
  })

  // 每個 model request 的 usage 從 turn.step 的 result 取（串流 hook：轉傳 chunk、只讀結果）。
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    try {
      const u = result?.usage
      if (u) {
        const at = await $.clock.now()
        const r: CacheReading = {
          at,
          input: u.input_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          cacheCreation: u.cache_creation_input_tokens ?? 0,
          output: u.output_tokens ?? 0,
        }
        await update($, cache, (s): CacheState => {
          const prev = s?.last ?? null
          const cliff = prev ? classifyCliff(prev, r, ttlMs) : null
          return {
            last: r,
            history: [...(s?.history ?? []), r].slice(-HISTORY_LIMIT),
            cliffs: cliff ? [...(s?.cliffs ?? []), cliff].slice(-50) : (s?.cliffs ?? []),
          }
        })
      }
    } catch {
      // Bookkeeping only - never disturb the stream's result.
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const r = await read($, reading)
    const c = await read($, cache)
    await read($, tick) // subscribe: the 30s timer redraws the countdown
    if ((r === null && c === null) || e.props.hasSurvey) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const parts: ReturnType<typeof Text>[] = []

    if (r?.context) {
      const col = barColor(r.context.percent)
      parts.push(
        <Text dimColor>context </Text>,
        <Text color={col}>{bar(r.context.percent, CONTEXT_SEGMENTS)}</Text>,
        <Text color={col}> {r.context.percent}%</Text>,
        <Text dimColor> ({compact(r.context.tokens)}/{compact(r.context.window)})</Text>,
      )
    }
    for (const l of r?.limits ?? []) {
      const col = barColor(l.percentUsed, 'cyan')
      parts.push(
        <Text dimColor>{'  '}{kindLabel(l.kind)} </Text>,
        <Text color={col}>{bar(l.percentUsed, LIMIT_SEGMENTS)}</Text>,
        <Text color={col}> {l.percentUsed}%</Text>,
      )
    }
    if (c?.last) {
      const rate = hitRate(c.last)
      const left = fmtRemaining(c.last.at + ttlMs - (await $.clock.now()))
      parts.push(<Text dimColor>{'  '}cache </Text>)
      if (rate !== null) parts.push(<Text color={hitColor(rate)}>{rate}%</Text>)
      parts.push(left ? <Text dimColor> {left}</Text> : <Text color="red"> 可能已過期</Text>)
    }

    return <Box>{parts}</Box>
  })
}
