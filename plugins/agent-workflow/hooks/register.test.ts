import { test, expect } from 'claude-code/testing'

test('合法 ticket 放行到底層', async ($, on) => {
  let reached = false
  on('tool.call', { tool: 'Bash' }, () => {
    reached = true
    return { result: { text: 'ran' } }
  })
  const r = await $.tool.call({
    tool: 'Bash',
    command: 'git worktree add .claude/worktrees/VAID-123 -b dev/VAID-123 main',
  })
  expect(r.deny).toBe(undefined)
  expect(reached).toBe(true)
})

test('違規字元被擋且給出建議', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { text: 'ran' } }))
  const r = await $.tool.call({
    tool: 'Bash',
    command: 'git worktree add ".claude/worktrees/x" -b "dev/Login 很慢"',
  })
  expect(r.deny).toContain('違規')
  expect(r.deny).toContain('建議改用')
})

test('同一命令 ticket 不一致被擋', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { text: 'ran' } }))
  const r = await $.tool.call({
    tool: 'Bash',
    command: 'git worktree add .claude/worktrees/VAID-999 -b dev/VAID-123 main',
  })
  expect(r.deny).toContain('不一致')
})

test('session 名的 role 後綴正確剝除', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { text: 'ran' } }))
  const ok = await $.tool.call({
    tool: 'Bash',
    command: 'claude --bg --name VAID-123-planning "start"',
  })
  expect(ok.deny).toBe(undefined)
  const bad = await $.tool.call({
    tool: 'Bash',
    command: 'claude --bg --name "bad ticket-build" "start"',
  })
  expect(bad.deny).toContain('違規')
})

test('controller 後綴的 session 名也受 ticket 格式檢查', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { text: 'ran' } }))
  const bad = await $.tool.call({
    tool: 'Bash',
    command: 'claude --bg --name "bad ticket-controller" "start"',
  })
  expect(bad.deny).toContain('違規')
})

test('文件佔位符與無關命令放行', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { text: 'ran' } }))
  const placeholder = await $.tool.call({
    tool: 'Bash',
    command: "grep -n 'agent-workspace/{ticket}/plan.md' skills/orchestration/SKILL.md",
  })
  expect(placeholder.deny).toBe(undefined)
  const unrelated = await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect(unrelated.deny).toBe(undefined)
})

test('shell glob 與執行期佔位符放行', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { text: 'ran' } }))
  const glob = await $.tool.call({
    tool: 'Bash',
    command: 'ls .claude/agent-workspace/*/lab.md',
  })
  expect(glob.deny).toBe(undefined)
  const question = await $.tool.call({
    tool: 'Bash',
    command: 'ls .claude/agent-workspace/VAID-12?/plan.md',
  })
  expect(question.deny).toBe(undefined)
  const runtime = await $.tool.call({
    tool: 'Bash',
    command: "grep 'code-review-r<N>.md' .claude/agent-workspace/<ticket>/notes.md",
  })
  expect(runtime.deny).toBe(undefined)
})
