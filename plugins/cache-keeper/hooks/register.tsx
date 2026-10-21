// cache-keeper: keeps this session's prompt cache warm across idle gaps.
//
// The prompt cache's TTL is a sliding window refreshed by every request. A
// session idling past the TTL (waiting on a human, a long external job) loses
// its whole prefix and pays the 1.25x rewrite on the next real turn. When idle
// time reaches 75% of the TTL, this mod submits ONE inert prompt to its own
// session via $.prompt.submit — a tiny "ok" turn whose request re-reads the
// prefix at 0.1x, sliding the TTL window forward. ($.session.send cannot
// address the mod's own session; prompt.submit is the self-turn primitive.)
//
// Guardrails (pings cost real tokens):
// - off by default; userConfig `mode` or a per-session /keep-warm override
// - no ping below MIN_PREFIX tokens (rewriting a small prefix is cheaper
//   than pinging forever)
// - at most `maxPings` consecutive pings since the last real turn: an
//   abandoned session is not kept warm forever; any real turn resets the count
// - past 100% of the TTL the cache is already gone — give up, don't pre-pay
//   a rewrite nothing may ever use
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { KeeperState } from '../types'

export const PING_MARKER = '【cache-keeper ping】'
const PING_TEXT =
  `${PING_MARKER}自動保溫訊息：本 session 閒置接近 prompt cache TTL，這則訊息只為刷新 cache 窗口。` +
  `無需採取任何行動，請只回覆「ok」。`
export const MIN_PREFIX = 20_000
const TICK_MS = 60_000
const FIRE_AT = 0.75

const keeper = atom({ plugin: 'cache-keeper', key: 'state' } as const, null)

const EMPTY: KeeperState = {
  lastAt: null,
  prefix: 0,
  count: 0,
  inFlight: false,
  isPingTurn: false,
  override: null,
  totalPings: 0,
}

/** Whether a ping should fire now. Pure: all policy in one testable place. */
export function shouldPing(
  s: KeeperState | null,
  mode: 'on' | 'off',
  ttlMs: number,
  maxPings: number,
  now: number,
): boolean {
  const effective = s?.override ?? mode
  if (effective !== 'on') return false
  if (!s || s.lastAt === null) return false
  if (s.prefix < MIN_PREFIX) return false
  if (s.inFlight) return false
  if (s.count >= maxPings) return false
  const idle = now - s.lastAt
  return idle >= ttlMs * FIRE_AT && idle < ttlMs
}

export function buildStatus(s: KeeperState | null, mode: 'on' | 'off', ttlMs: number, now: number): string {
  const effective = s?.override ?? mode
  const lines = [
    `keep-warm：${effective === 'on' ? '開' : '關'}` +
      `（${s?.override ? '本 session 覆寫' : 'userConfig 預設'}；TTL 假設 ${Math.round(ttlMs / 60_000)}m，閒置達 80% 時 ping）`,
  ]
  if (s?.lastAt !== null && s?.lastAt !== undefined) {
    lines.push(
      `最後請求 ${Math.round((now - s.lastAt) / 60_000)} 分鐘前｜前綴 ${Math.round(s.prefix / 1000)}k tokens` +
        `（門檻 ${MIN_PREFIX / 1000}k）`,
    )
  }
  lines.push(`本輪連續 ping ${s?.count ?? 0} 次｜本 session 累計 ${s?.totalPings ?? 0} 次`)
  lines.push('用法：/keep-warm on｜off｜status（on/off 只影響本 session）')
  return lines.join('\n')
}

/** Seeds lastAt/prefix when no turn.step has recorded yet — a plugin can load
 * after the session's first turn (background spawns race the load), and a
 * session idle since birth would otherwise never be kept warm. Context tokens
 * from $.session.usage() stand in for the prefix size. */
async function seedIfEmpty($: EngineInterface): Promise<void> {
  const s = await read($, keeper)
  if (s?.lastAt != null) return
  const now = await $.clock.now()
  let ctxTokens = 0
  try {
    ctxTokens = (await $.session.usage()).context.tokens ?? 0
  } catch {
    // usage unavailable: seed the clock alone; prefix 0 stays below MIN_PREFIX.
  }
  await update($, keeper, (prev): KeeperState => {
    if (prev?.lastAt != null) return prev
    return { ...(prev ?? EMPTY), lastAt: now, prefix: Math.max(prev?.prefix ?? 0, ctxTokens) }
  })
}

async function sendPing($: EngineInterface): Promise<void> {
  await update($, keeper, (s): KeeperState => ({
    ...(s ?? EMPTY),
    inFlight: true,
    count: (s?.count ?? 0) + 1,
    totalPings: (s?.totalPings ?? 0) + 1,
  }))
  // Not awaited to completion: prompt.submit runs a whole turn of its own;
  // turn.complete clears the in-flight mark. A refusal undoes it (the counted
  // attempt stays so a permanently failing submit still hits maxPings).
  Promise.resolve($.prompt.submit({ text: PING_TEXT })).catch(async () => {
    await update($, keeper, (s): KeeperState => ({ ...(s ?? EMPTY), inFlight: false }))
  })
}

export const register: Register = (on, options) => {
  const o = options as { mode?: string; ttl?: string; maxPings?: string } | undefined
  const mode: 'on' | 'off' = o?.mode === 'on' ? 'on' : 'off'
  const ttlMs = o?.ttl === '5m' ? 5 * 60_000 : 60 * 60_000
  const maxPings = Number(o?.maxPings ?? '3') || 3

  on('session.start', async ($, e, next) => {
    $.command.register({ name: 'keep-warm', description: '保持 prompt cache 不過期：on｜off｜status' })
    await seedIfEmpty($)
    $.clock.every(TICK_MS, async () => {
      await seedIfEmpty($)
      const s = await read($, keeper)
      const now = await $.clock.now()
      if (shouldPing(s, mode, ttlMs, maxPings, now)) await sendPing($)
    })
    return next(e)
  })

  on('command.run', { command: 'keep-warm' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'on' || arg === 'off') {
      await update($, keeper, (s): KeeperState => ({ ...(s ?? EMPTY), override: arg }))
      return { text: `keep-warm：本 session 已切為「${arg === 'on' ? '開' : '關'}」。` }
    }
    const s = await read($, keeper)
    return { text: buildStatus(s, mode, ttlMs, await $.clock.now()) }
  })

  // Our own ping prompt coming through: mark the turn so it does not reset
  // the consecutive-ping count. Never blocked — the turn must run, the model
  // request it fires IS the cache refresh.
  on('prompt.submit', async ($, e, next) => {
    if (e.text.includes(PING_MARKER)) {
      await update($, keeper, (s): KeeperState => ({ ...(s ?? EMPTY), isPingTurn: true }))
    }
    return next(e)
  })

  // Every model request slides the cache window: record its time and prefix.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    try {
      const u = result?.usage
      if (u) {
        const at = await $.clock.now()
        const prefix =
          (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
        await update($, keeper, (s): KeeperState => ({ ...(s ?? EMPTY), lastAt: at, prefix }))
      }
    } catch {
      // Bookkeeping only — never disturb the stream's result.
    }
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await update($, keeper, (s): KeeperState => {
      if (!s) return s
      // A ping turn clears its own flags; a real turn also resets the count.
      return s.isPingTurn
        ? { ...s, isPingTurn: false, inFlight: false }
        : { ...s, isPingTurn: false, inFlight: false, count: 0 }
    })
    return result
  })
}
