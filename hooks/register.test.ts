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

// --- Controller 自動改名 ---
import { spawnedMemberTicket, controllerQueueDecision, CONTROLLER_QUEUE } from './register'

const SPAWN_CMD = 'claude --bg --name VAID-123-planning "start"'

test('member spawn 解析出 ticket；非 member 與佔位符回 null', async () => {
  expect(spawnedMemberTicket(SPAWN_CMD)).toBe('VAID-123')
  expect(spawnedMemberTicket('claude --bg --name VAID-123-build go')).toBe('VAID-123')
  expect(spawnedMemberTicket('claude --bg --name helper "x"')).toBe(null)
  expect(spawnedMemberTicket('claude --bg --name {ticket}-planning "x"')).toBe(null)
  expect(spawnedMemberTicket('ls -la')).toBe(null)
})

test('無衝突時排隊 controller 名', async () => {
  const d = controllerQueueDecision(SPAWN_CMD, 'sid-1', [], undefined)
  expect(d.kind).toBe('queue')
  if (d.kind === 'queue') expect(d.controller).toBe('VAID-123-controller')
})

test('名字被其他 live session 持有時 deny', async () => {
  const d = controllerQueueDecision(SPAWN_CMD, 'sid-1',
    [{ name: 'VAID-123-controller', sessionId: 'sid-other' }], undefined)
  expect(d.kind).toBe('deny')
})

test('本 session 已名為該 controller 時不重排也不擋', async () => {
  const d = controllerQueueDecision(SPAWN_CMD, 'sid-1',
    [{ name: 'VAID-123-controller', sessionId: 'sid-1' }], 'VAID-123-controller')
  expect(d.kind).toBe('skip')
})

test('冪等：queue 已有同名就 skip', async () => {
  const d = controllerQueueDecision(SPAWN_CMD, 'sid-1', [], 'VAID-123-controller')
  expect(d.kind).toBe('skip')
})

test('本 session 是另一個活 group 的 controller 時 deny', async () => {
  const d = controllerQueueDecision(SPAWN_CMD, 'sid-1',
    [{ name: 'OLD-9-controller', sessionId: 'sid-1' },
     { name: 'OLD-9-build', sessionId: 'sid-m' }], undefined)
  expect(d.kind).toBe('deny')
})

test('舊 group 無活 member 時換 ticket 可重排', async () => {
  const d = controllerQueueDecision(SPAWN_CMD, 'sid-1',
    [{ name: 'OLD-9-controller', sessionId: 'sid-1' }], 'OLD-9-controller')
  expect(d.kind).toBe('queue')
})

test('queue 路徑與 .py hook 一致', async () => {
  // apply_controller_name.py 的 PENDING = .claude/agent-workspace/.controller-names
  expect(CONTROLLER_QUEUE).toBe('.claude/agent-workspace/.controller-names')
})

test('controller 後綴的 session 名也受 ticket 格式檢查', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { text: 'ran' } }))
  const bad = await $.tool.call({
    tool: 'Bash',
    command: 'claude --bg --name "bad ticket-controller" "start"',
  })
  expect(bad.deny).toContain('違規')
})
