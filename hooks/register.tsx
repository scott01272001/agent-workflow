import type { Register } from 'claude-code'

// 合約「{ticket} 識別字」規則：英數開頭、其後英數 . _ -、至多 40 字元。
const TICKET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/
const ROLE_SUFFIX = /-(planning|build|ship|controller)$/
// 會觸發 controller 排隊改名的 member spawn：目前只有 maker session。
const MEMBER_SUFFIX = /-(planning|build)$/
// Queue 路徑與 apply_controller_name.py 的 PENDING 相同；兩邊要同步改。
export const CONTROLLER_QUEUE = '.claude/agent-workspace/.controller-names'

const strip = (s: string) => s.replace(/^["']|["']$/g, '')

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 40) || 'ticket'

type Candidate = { value: string; source: string }

// 從 Bash 命令抽出會變成框架資源名的 {ticket} 候選：
// session 名（claude --bg --name <ticket>-<role>）、worktree branch（dev/<ticket>）、
// worktree 路徑、workspace 路徑（.claude/agent-workspace/<ticket>/）。
function candidates(command: string): Candidate[] {
  const found: Candidate[] = []

  if (/\bclaude\b[^\n]*--bg\b/.test(command)) {
    const m = command.match(/--name[=\s]+("[^"]+"|'[^']+'|\S+)/)
    if (m) {
      const name = strip(m[1])
      if (ROLE_SUFFIX.test(name))
        found.push({ value: name.replace(ROLE_SUFFIX, ''), source: `session 名「${name}」` })
    }
  }

  if (/\bgit\s+worktree\s+add\b/.test(command)) {
    const b = command.match(/-b[=\s]+("[^"]+"|'[^']+'|\S+)/)
    if (b) {
      const branch = strip(b[1])
      const dm = branch.match(/^dev\/(.+)$/)
      if (dm) found.push({ value: dm[1], source: `branch「${branch}」` })
    }
    const p = command.match(/\.claude\/worktrees\/([^\s/"']+)/)
    if (p) found.push({ value: p[1], source: 'worktree 路徑' })
  }

  for (const m of command.matchAll(/\.claude\/agent-workspace\/([^\s/"']+)/g))
    found.push({ value: m[1], source: 'workspace 路徑' })

  // 文件裡的佔位符（{ticket}、{主 checkout 絕對路徑} 等）不是真實識別字，放行。
  return found.filter((c) => !c.value.includes('{') && !c.value.includes('}'))
}

// --- Controller 自動改名：排隊 ---
// Member 回報的收件者是 {ticket}-controller，但 session 不能在自己的 turn 中途改名：
// spawn 第一個 member 時把名字排進 queue，apply_controller_name.py 在 user 下一則
// 訊息時以 sessionTitle 套用。排隊與衝突檢查在這裡確定性完成，LLM 不參與。

/** 命令裡被 spawn 的 member session 名的 {ticket}；不是 member spawn 時為 null。 */
export function spawnedMemberTicket(command: string): string | null {
  if (!/\bclaude\b[^\n]*--bg\b/.test(command)) return null
  const m = command.match(/--name[=\s]+("[^"]+"|'[^']+'|\S+)/)
  if (!m) return null
  const name = strip(m[1])
  if (name.includes('{') || name.includes('}')) return null
  const rm = name.match(MEMBER_SUFFIX)
  return rm ? name.replace(MEMBER_SUFFIX, '') : null
}

export type SessionRow = { name?: string; sessionId?: string }

export type QueueDecision =
  | { kind: 'skip' }
  | { kind: 'deny'; message: string }
  | { kind: 'queue'; controller: string }

/** 排隊與衝突的純決策：command 之外只看 sessions 列表、本 session id 與既有 queue 內容。 */
export function controllerQueueDecision(
  command: string,
  sessionId: string,
  sessions: SessionRow[],
  queued: string | undefined,
): QueueDecision {
  const ticket = spawnedMemberTicket(command)
  if (!ticket) return { kind: 'skip' }
  const controller = `${ticket}-controller`

  const holder = sessions.find((s) => s.name === controller && s.sessionId !== sessionId)
  if (holder)
    return {
      kind: 'deny',
      message:
        `「${controller}」已被另一個 live session 持有。換一個 session 開這個 group，` +
        `或先收掉舊 group 再 spawn。`,
    }

  // 本 session 已是（或已排隊成）另一個 ticket 的 controller，而那個 group 還有活的 member：
  // 改名會讓那些 member 的回報撲空。
  const current = sessions.find((s) => s.sessionId === sessionId)?.name ?? ''
  const priorControllers = [current, queued?.trim() ?? '']
    .filter((n) => n.endsWith('-controller'))
    .map((n) => n.slice(0, -'-controller'.length))
    .filter((t) => t && t !== ticket)
  for (const prior of priorControllers) {
    const live = sessions.some((s) => MEMBER_SUFFIX.test(s.name ?? '') && (s.name ?? '').replace(MEMBER_SUFFIX, '') === prior)
    if (live)
      return {
        kind: 'deny',
        message:
          `本 session 是「${prior}-controller」而該 group 還有活的 member；` +
          `改名成「${controller}」會切斷它們的回報。用新 session 開 ${ticket} 的 group。`,
      }
  }

  if (queued?.trim() === controller) return { kind: 'skip' }
  return { kind: 'queue', controller }
}

export const register: Register = (on) => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const found = candidates(e.command)
    if (found.length === 0) return next(e)

    const bad = found.find((c) => !TICKET.test(c.value))
    if (bad)
      return {
        deny:
          `${$.plugin.name}: ticket 識別字「${bad.value}」違規（來源：${bad.source}）。` +
          `規則：英數開頭，其後只允許英數與 . _ -，至多 40 字元，禁空白與 /` +
          `（合約「{ticket} 識別字」條）。建議改用：${slugify(bad.value)}`,
      }

    const first = found[0]
    const other = found.find((c) => c.value !== first.value)
    if (other)
      return {
        deny:
          `${$.plugin.name}: 同一命令裡的 ticket 不一致——${first.source}=「${first.value}」` +
          `vs ${other.source}=「${other.value}」。後續 phase 的 {ticket} 從既有工件回讀，不重新推導。`,
      }

    // 排隊 controller 改名。衝突要擋；排隊本身失敗不擋 spawn（troubleshooting 用 /rename 兜底）。
    if (spawnedMemberTicket(e.command)) {
      let decision: QueueDecision = { kind: 'skip' }
      let dir = ''
      let path = ''
      try {
        const id = await $.session.id()
        const out = await $.process.run(['claude', 'agents', '--json', '--all'], { timeoutMs: 20_000 })
        const sessions = out.exitCode === 0 ? (JSON.parse(out.stdout) as SessionRow[]) : []
        const root = (await $.session.repo())?.root ?? (await $.session.cwd())
        dir = `${root}/${CONTROLLER_QUEUE}`
        path = `${dir}/${id}`
        const queued = await $.fs.read(path).catch(() => undefined)
        decision = controllerQueueDecision(e.command, id, sessions, queued)
        if (decision.kind === 'queue') {
          await $.process.run(['mkdir', '-p', dir], { timeoutMs: 5_000 })
          await $.fs.write(path, decision.controller)
        }
      } catch {
        decision = { kind: 'skip' }
      }
      if (decision.kind === 'deny') return { deny: `${$.plugin.name}: ${decision.message}` }
    }

    return next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `${$.plugin.name}: ticket guard failed; fix the mod before spawning.` },
  )
}
