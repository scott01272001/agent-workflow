import { test, expect } from 'claude-code/testing'

import { bar, barColor, compact, kindLabel } from './register'

test('bar 依百分比填格，邊界夾住', async () => {
  expect(bar(0, 20)).toBe('▱'.repeat(20))
  expect(bar(100, 20)).toBe('▰'.repeat(20))
  expect(bar(50, 20)).toBe('▰'.repeat(10) + '▱'.repeat(10))
  expect(bar(-5, 20)).toBe('▱'.repeat(20))
  expect(bar(130, 10)).toBe('▰'.repeat(10))
  expect(bar(50, 10)).toBe('▰'.repeat(5) + '▱'.repeat(5))
})

test('顏色門檻：<70 綠、70–89 黃、>=90 紅', async () => {
  expect(barColor(0)).toBe('green')
  expect(barColor(69)).toBe('green')
  expect(barColor(70)).toBe('yellow')
  expect(barColor(89)).toBe('yellow')
  expect(barColor(90)).toBe('red')
  expect(barColor(100)).toBe('red')
})

test('session 條健康色為 cyan，警戒色共用', async () => {
  expect(barColor(30, 'cyan')).toBe('cyan')
  expect(barColor(69, 'cyan')).toBe('cyan')
  expect(barColor(70, 'cyan')).toBe('yellow')
  expect(barColor(95, 'cyan')).toBe('red')
})

test('token 數字縮寫', async () => {
  expect(compact(950)).toBe('950')
  expect(compact(84_200)).toBe('84k')
  expect(compact(200_000)).toBe('200k')
  expect(compact(1_200_000)).toBe('1.2M')
  expect(compact(1_000_000)).toBe('1M')
})

test('rate-limit 視窗標籤', async () => {
  expect(kindLabel('five_hour')).toBe('5h')
  expect(kindLabel('seven_day')).toBe('7d')
  expect(kindLabel('spend_limit')).toBe('spend')
  expect(kindLabel('mystery')).toBe('mystery')
})

// --- cache 監測 ---
import { hitRate, hitColor, classifyCliff, fmtRemaining, buildReport } from './register'

const R = (at: number, input: number, read: number, create: number) =>
  ({ at, input, cacheRead: read, cacheCreation: create, output: 100 })

test('hitRate：讀取佔整個前綴的比例', async () => {
  expect(hitRate(R(0, 1000, 9000, 0))).toBe(90)
  expect(hitRate(R(0, 10000, 0, 0))).toBe(0)
  expect(hitRate(R(0, 0, 0, 0))).toBe(null)
})

test('hitColor：高是好事，門檻反轉', async () => {
  expect(hitColor(95)).toBe('green')
  expect(hitColor(80)).toBe('green')
  expect(hitColor(79)).toBe('yellow')
  expect(hitColor(50)).toBe('yellow')
  expect(hitColor(49)).toBe('red')
})

test('classifyCliff：讀取崩落才算 cliff，依間隔歸因', async () => {
  const ttl = 60 * 60_000
  const prev = R(0, 1000, 90_000, 9_000) // 前綴 100k
  // 間隔超過 TTL → 過期
  const expired = classifyCliff(prev, R(ttl + 60_000, 100_000, 0, 100_000), ttl)
  expect(expired?.cause).toBe('expired')
  // 間隔很短 → 前綴被改
  const invalidated = classifyCliff(prev, R(30_000, 100_000, 500, 100_000), ttl)
  expect(invalidated?.cause).toBe('invalidated')
  // 讀取仍高 → 不是 cliff
  expect(classifyCliff(prev, R(30_000, 1_000, 95_000, 0), ttl)).toBe(null)
  // 前綴太小不計
  expect(classifyCliff(R(0, 500, 500, 0), R(30_000, 5_000, 0, 5_000), ttl)).toBe(null)
})

test('fmtRemaining：分鐘/秒/過期', async () => {
  expect(fmtRemaining(41 * 60_000)).toBe('~41m')
  expect(fmtRemaining(90_000)).toBe('~90s')
  expect(fmtRemaining(0)).toBe(null)
  expect(fmtRemaining(-5)).toBe(null)
})

test('buildReport：空態與基本統計', async () => {
  expect(buildReport(null, 60 * 60_000, 0)).toContain('尚無')
  const state = {
    last: R(60_000, 1000, 9000, 0),
    history: [R(0, 10_000, 0, 10_000), R(60_000, 1000, 9000, 0)],
    cliffs: [{ at: 60_000, gapMs: 60_000, cause: 'invalidated' as const, lostTokens: 20_000 }],
  }
  const text = buildReport(state, 60 * 60_000, 120_000)
  expect(text).toContain('請求數 2')
  expect(text).toContain('cache 斷裂 1 次')
  expect(text).toContain('前綴被改')
})
