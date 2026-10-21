# context-usage-bar

Claude Code plugin：在輸入框上方顯示一列即時狀態列——context window 用量、session 速率限制、prompt cache 命中率與 TTL 倒數——並提供 `/cache-report` 指令做 cache 使用統計。

通用 plugin，適用所有 session，不含任何工作流專用語彙。

## 顯示內容

狀態列一行，依序三組（沒有資料的組自動省略）：

```
context ▰▰▰▱▱▱▱▱▱▱▱▱▱▱ 23% (84k/400k)  5h ▰▰▱▱▱▱▱▱▱▱ 18%  7d ▰▰▰▰▱▱▱▱▱▱ 42%  cache 99% ~41m
```

| 區段 | 內容 | 顏色 |
|---|---|---|
| `context` | context window 已用百分比＋token 數（已用/總量），14 格進度條 | 綠（<70%）→ 黃（70–89%）→ 紅（≥90%） |
| `5h` / `7d` / `spend` | 各速率限制窗口的用量百分比，10 格進度條，有幾個窗口顯示幾條 | 青（<70%）→ 黃 → 紅（門檻同上） |
| `cache` | 最近一次請求的 prompt cache 命中率＋TTL 倒數估計（如 `~41m`）；超過 TTL 未發請求時顯示紅字「可能已過期」 | 命中率門檻**反轉**（高是好事）：綠（≥80%）→ 黃（50–79%）→ 紅（<50%） |

- 命中率 = `cache_read ÷ (input + cache_read + cache_creation)`。
- TTL 倒數是**估計值**：API 不提供過期時間戳，倒數＝最後一次請求時間＋設定的 TTL；cache 窗口是滑動的，每次請求都會重算。
- 數值來源：context／速率限制取自 `$.session.usage()`，每回合結束與每 30 秒刷新；cache 數字從每次模型請求的 usage 逐筆記帳（`turn.step` 串流 hook）。

## 指令

### `/cache-report`

本 session 的 prompt cache 統計：

```
cache-report（TTL 假設 60m；統計自 mod 載入起）
請求數 42｜平均命中率 87%｜最近 99%
請求間隔：中位 226s｜最大 4120s
cache 斷裂 1 次：
  - 18 分鐘前｜間隔 4120s｜過期（閒置超過 TTL）｜估損 120k tokens
```

- **cache 斷裂（cliff）**：前一筆請求的前綴 ≥10k tokens、這一筆的 cache 讀取卻掉到不足其 10%。歸因二分：間隔超過 TTL →「過期（閒置超過 TTL）」；間隔很短 →「前綴被改」（system prompt、工具清單、模型／effort 切換、mod 熱載都會改寫前綴）。
- 統計只涵蓋 **mod 載入之後**的請求：API 沒有查詢 cache 歷史的端點，載入前的請求補不回來。歷史保留最近 200 筆請求、50 筆斷裂。

## 安裝

本 repo 自帶 marketplace manifest，可直接當 local marketplace 裝：

```
claude plugin marketplace add /path/to/context-usage-bar
claude plugin install context-usage-bar@context-usage-bar
```

裝在 user scope 後，**新開的每個 session** 都會有狀態列與 `/cache-report`。

## 設定

`/config` → plugin 設定，或 marketplace 的 userConfig：

| 選項 | 值 | 預設 | 說明 |
|---|---|---|---|
| `Prompt cache TTL` | `5m` / `1h` | `1h` | 倒數與斷裂歸因假設的 TTL。API 不回報實際 TTL；Claude Code session 通常是 1h。 |

## 已知限制

- cache 倒數與斷裂歸因都建立在設定的 TTL 假設上，不是 API 事實。
- 統計存於 session state，session 結束即清空，不跨 session 累積。
- 狀態列是裝飾性的：任何讀值失敗都靜默保留上一筆，不影響對話。

## 開發

```
claude plugin validate .   # manifest 與 hooks 檢查
claude plugin test .       # hooks/register.test.ts（純函數測試）
tsc -p .                   # 型別檢查（需先讓 engine 產出 .claude-plugin/types/）
```

結構：

```
.claude-plugin/plugin.json   # manifest、userConfig（ttl）
hooks/hooks.json             # modules 入口
hooks/register.tsx           # 全部邏輯：記帳、統計、繪製
hooks/register.test.ts       # 純函數測試
types/index.d.ts             # $.state 合約（Reading / CacheState / tick）
```
