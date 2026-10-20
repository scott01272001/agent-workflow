import type { Register } from 'claude-code'

// 合約「{ticket} 識別字」規則：英數開頭、其後英數 . _ -、至多 40 字元。
const TICKET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/
const ROLE_SUFFIX = /-(planning|build|ship|controller)$/

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

  // 放行三類非真實識別字：文件佔位符（{ticket}、{主 checkout 絕對路徑}）、
  // 執行期佔位符（<N>、<SHA>）、shell glob（ls .../\*/lab.md 的 *？[]）。
  return found.filter((c) => !/[{}<>*?[\]]/.test(c.value))
}

export const register: Register = (on) => {
  on('tool.call', { tool: 'Bash' }, ($, e, next) => {
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

    return next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `${$.plugin.name}: ticket guard failed; fix the mod before spawning.` },
  )
}
