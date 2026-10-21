import { test, expect } from 'claude-code/testing'

import { MIN_PREFIX, PING_MARKER, buildStatus, shouldPing } from './register'
import type { KeeperState } from '../types'

const TTL = 60 * 60_000
const base: KeeperState = {
  lastAt: 0,
  prefix: 50_000,
  count: 0,
  inFlight: false,
  isPingTurn: false,
  override: null,
  totalPings: 0,
}
const atIdle = (min: number) => min * 60_000

test('shouldPing：閒置落在 TTL 的 [75%, 100%) 窗口才開火', async () => {
  expect(shouldPing(base, 'on', TTL, 3, atIdle(45))).toBe(true)
  expect(shouldPing(base, 'on', TTL, 3, atIdle(59))).toBe(true)
  expect(shouldPing(base, 'on', TTL, 3, atIdle(44))).toBe(false)
})

test('shouldPing：超過 TTL 即放棄——cache 已沒了，不預付重寫', async () => {
  expect(shouldPing(base, 'on', TTL, 3, atIdle(60))).toBe(false)
  expect(shouldPing(base, 'on', TTL, 3, atIdle(600))).toBe(false)
})

test('shouldPing：off 不 ping；本 session 覆寫雙向皆贏過 userConfig', async () => {
  expect(shouldPing(base, 'off', TTL, 3, atIdle(48))).toBe(false)
  expect(shouldPing({ ...base, override: 'on' }, 'off', TTL, 3, atIdle(48))).toBe(true)
  expect(shouldPing({ ...base, override: 'off' }, 'on', TTL, 3, atIdle(48))).toBe(false)
})

test('shouldPing：前綴低於門檻不保溫', async () => {
  expect(shouldPing({ ...base, prefix: MIN_PREFIX - 1 }, 'on', TTL, 3, atIdle(48))).toBe(false)
  expect(shouldPing({ ...base, prefix: MIN_PREFIX }, 'on', TTL, 3, atIdle(48))).toBe(true)
})

test('shouldPing：連續 ping 上限與 in-flight 鎖', async () => {
  expect(shouldPing({ ...base, count: 3 }, 'on', TTL, 3, atIdle(48))).toBe(false)
  expect(shouldPing({ ...base, count: 2 }, 'on', TTL, 3, atIdle(48))).toBe(true)
  expect(shouldPing({ ...base, inFlight: true }, 'on', TTL, 3, atIdle(48))).toBe(false)
})

test('shouldPing：尚無任何請求紀錄時不 ping', async () => {
  expect(shouldPing(null, 'on', TTL, 3, atIdle(48))).toBe(false)
  expect(shouldPing({ ...base, lastAt: null }, 'on', TTL, 3, atIdle(48))).toBe(false)
})

test('buildStatus：回報生效模式、閒置時長、前綴與計數', async () => {
  const s = { ...base, lastAt: 0, count: 1, totalPings: 4 }
  const text = buildStatus(s, 'on', TTL, atIdle(10))
  expect(text).toContain('keep-warm：開')
  expect(text).toContain('10 分鐘前')
  expect(text).toContain('50k tokens')
  expect(text).toContain('連續 ping 1 次')
  expect(text).toContain('累計 4 次')
})

test('buildStatus：覆寫標示為本 session', async () => {
  const text = buildStatus({ ...base, override: 'off' }, 'on', TTL, 0)
  expect(text).toContain('keep-warm：關')
  expect(text).toContain('本 session 覆寫')
})

test('ping marker 穩定——receive 端比對依賴它', async () => {
  expect(PING_MARKER).toBe('【cache-keeper ping】')
})
