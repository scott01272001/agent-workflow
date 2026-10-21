# cache-keeper

Claude Code plugin：防止 session 的 prompt cache 因閒置過期。閒置接近 TTL 時，mod 用 `$.prompt.submit` 向**自己的 session** 提交一則 inert 保溫 prompt——session 醒來回一句「ok」（極小的 turn），這次請求以 0.1x 讀回前綴並把滑動 TTL 窗口往前推；相比之下過期後的下一輪要付 1.25x 重寫。（實測：54k 前綴的 ping 讀回 41k、重建 13k、輸出 4 tokens，約等效 20k tokens，對照過期重寫的 67k。）

通用 plugin，適用所有 session；**預設關閉**（ping 是付費請求）。

## 運作邏輯

1. `turn.step` hook 逐請求記下時間與前綴大小（input + cache_read + cache_creation）。
2. 每 60 秒檢查：閒置時長落在 **TTL × 0.75 ～ TTL** 的窗口、前綴 ≥ 20k tokens、連續 ping 次數未達上限、無 ping 在途——全部成立才發 ping。plugin 若晚於首個 turn 載入（背景 spawn 會發生），以 `$.session.usage()` 的 context tokens 補種前綴。
3. ping 經 `prompt.submit` hook 以 marker 標記，其 turn 不重置連續計數；任何**真實 turn** 歸零計數。
4. 閒置一旦**超過 TTL** 即放棄：cache 已沒了，ping 只是預付一次可能沒人用的重寫。

成本邊界：每次 ping ≈ 前綴 × 0.1（讀）＋小額重建與輸出；上限 `maxPings` 次後停手，被棄置的 session 不會被無限保溫。

## 指令

- `/keep-warm` 或 `/keep-warm status`——目前模式、閒置時長、前綴大小、ping 計數。
- `/keep-warm on`／`/keep-warm off`——只切換**本 session**，覆寫 userConfig 預設。

## 設定（userConfig）

| 選項 | 值 | 預設 | 說明 |
|---|---|---|---|
| `Keep-warm mode` | `off` / `on` | `off` | `on`＝所有 session 自動保溫；`off`＝只有跑過 `/keep-warm on` 的 session 保溫 |
| `Prompt cache TTL` | `5m` / `1h` | `1h` | 假設的 TTL（API 不回報實際值），與 context-usage-bar 的設定語意一致 |
| `Max consecutive pings` | `1` / `3` / `5` | `3` | 距上次真實活動的連續 ping 上限 |

## 典型用法

等人裁決、等外部長任務的背景 session（例如 flow 的 maker session 停在 gate）：開場跑一次 `/keep-warm on`，之後閒置 45 分鐘（1h TTL）會自動保溫，最多三次（覆蓋約 3 小時的等待），期間任何真實訊息都會歸零重算。

## 已知限制

- TTL 是假設值；真實 TTL 更短時 ping 可能落在過期後（白付一次重寫費）。
- ping 會在對話裡留下一則訊息與一句「ok」回覆。
- 不保活程序本身以外的事：session 程序若被停掉，mod 的計時器也跟著消失。

## 開發

```
claude plugin validate .
claude plugin test .      # hooks/register.test.ts，策略純函數 shouldPing/buildStatus
```
