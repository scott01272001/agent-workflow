# agent-workflow 合約

所有 session（controller、maker、reviewer subagent）在本合約框架下做事。專案自己的憲法（AGENTS.md／constitution）規定同一件事時，以專案規則優先。

## 工作目錄合約

```
repo
  |-.claude
  |     |-agent-workspace    任務執行過程的中途文件（plan、review 報告、重現腳本）
  |         |-{ticket}
  |              |-plan.md
  |              |-lab.md    可讓 agent 做實機驗證的環境資訊
  |-agent
        |-spec               專案功能 SPEC（入版控）
```

- 中途文件一律放 `.claude/agent-workspace/{ticket}/`；agent 執行任務時優先到此查詢相關文件。
- 專案憲法有自己的 spec 保存規則時，以專案規則優先。
- 注意：專案的 `agent/`（文件目錄）與 plugin 的 `agents/`（subagent 定義）是兩回事，引用時寫全路徑。
- **{ticket} 識別字**：有 ticket 編號用編號原樣（如 `VAID-123`）；無編號時 controller 提議 kebab-case slug 並向 user 確認一次。格式：英數開頭，其後只允許英數與 `.` `_` `-`，至多 40 字元，禁空白與 `/`。phase 0 定案後全程不變——目錄、session 名、controller 名 `{ticket}-controller`、branch `dev/{ticket}` 皆由它衍生，後續 phase 從既有工件（gate 1 報告的 plan 路徑）回讀，不重新推導。此規則由 plugin 的 mod（`hooks/register.tsx`）在 tool.call 層強制：違規或不一致的命令會被擋下。

## 文件種類

- `spec.md`：功能 spec，契約（WHAT）。只寫目前有效的定義，不寫驗證狀態或證據（文件生命週期的 Status 欄不在此限），會進 git 保存。模板：`reference/spec-template.md`。Open Questions 是草稿期章節：draft／in-review 時記錄未決事項，approved 時必須清空或整節移除；有阻塞未決不得 approved。
- `plan.md`：單一 ticket 的實作與驗證路徑（HOW），含驗證條件（AC／REG：每條一個 ID、一個可判定結果、一個層級 unit／integration／lab）。只寫定義與證據，不寫驗證狀態（文件 Status 欄不在此限）；gate 核准後凍結，AC／REG 的驗證狀態在 verify 報告（綁交付 commit），不回寫 plan。不進 git。模板：`reference/plan-template.md`。
- `lab.md`：可讓 agent 做實機驗證的環境資訊。
- **AC 的歸屬**：feature 的 AC 定義在 spec（第 6 節），plan 引用其 ID 並補層級與 REG 物化，不重寫定義；bug fix 無新 spec 時，AC／REG 直接定義在 plan。

## 判定規則（跨 flow、跨 session）

- **Verdict 詞彙全 plugin 統一**：APPROVE／REVISE／ESCALATE／BLOCKED；嚴重度 BLOCKER／MUST-RECORD。
- **迴圈上限**：每個 inner loop 上限三輪；第三輪仍不過，帶最新結果與未解項出去找人，不跑第四輪。BLOCKED（缺證據或缺人的決策）與 ESCALATE（需求級缺口，改產出解決不了）任何時候直接出 loop 找人，不進修正迴圈；agent 不替人選出口。
- **gate 退回**：人在任一 gate 退回時，user 的意見作為 findings 回到該段 inner loop 的 maker 步驟，同一個 session 繼續（context 還在），輪數重新起算。該 session 已收掉時（跨 phase 退回），重開同名 session 並以工件（plan、報告）補 context——工件自足是這個架構的交接前提。
- **merge 歸人**：merge、正式部署、破壞性資料操作永遠是人的動作，不在任何 inner loop 裡。agent 交出的是證據，不是既成事實。
- **證據規則**：證據必須對應交付 commit；maker 自驗是交棒條件，不是驗收證據；同一組 AC／REG ID 走完整條 flow，任何階段不得重新發明。目前流程未接 CI：unit／integration 列一律由 verify 自跑補證據。
- **報告保存**：checker subagent 的完整輸出由呼叫方（maker session）存檔到 workspace 的指定報告路徑；checker 本身不寫檔。
- **測試對應**：plan 的 AC／REG 只標層級，不指定測試名或方法。每條測試在自己的 doc 註明它守的 AC／REG ID（例：`spec xxx - AC1`）；code review 的擋件條件之一是每條 AC／REG 都有具名測試守住。AC-ID 是契約連結，不是歷史紀錄。

## Workflow

每個【human】是一個人介入點：inner loop 的出口證據呈給人，人裁決後才進下一段；退回走「gate 退回」規則。每個 inner loop 都受三輪上限約束；BLOCKED／ESCALATE 從任何一步直接出去找人，圖中不重複畫。

**bug fix**

```
phase 1 — planning（inner loop）
    reproduce ──無法重現、決策樹用盡──► BLOCKED → 人
        │
        ▼
    define fix plan ◄───────────────────┐
        │                               │
        ▼                               │
    plan review ────REVISE（修全部 BLOCKER）
        │ APPROVE
        ▼
  【human】審核 plan：根因／修法／AC-REG；一併裁決 spec 更新擬議
        │ 核准（退回 → define fix plan）
        ▼
    update spec if need（執行時機屬 phase 2：build session 在 worktree 執行）

phase 2 — build（inner loop）
    implement ◄────────────────────┬──────────────┐
        │ 自驗綠才交棒              │              │
        ▼                          │              │
    code review ──REVISE───────────┘              │
        │ APPROVE                                 │
        ▼                                         │
    verify ──FAIL─────────────────────────────────┘
        │ APPROVE        （FAIL 原因不明 → 回 reproduce）
        ▼
  【human】驗收：AC／REG 逐列、守根因的回歸測試（退回 → implement）

phase 3 — ship（inner loop）
    create PR／update PR ◄─────────┐
        │                          │
        ▼                          │
    fresh review ──REVISE──────────┘
        │ APPROVE
        ▼
  【human】讀 PR，裁決：merge／退回／關掉（merge 永遠是人的動作）
```

**new feature**

```
phase 1 — spec（inner loop）
    SPEC ◄── REVISE ── spec review
        │ APPROVE
        ▼
  【human】審核 spec（退回 → SPEC）
        ▼
phase 2 — plan（inner loop）
    breakdown to plan ◄── REVISE ── plan review
        │ APPROVE
        ▼
  【human】審核 plan（退回 → breakdown to plan）
        ▼
phase 3 — build（inner loop）
    implement ──自驗綠──► code review ──APPROVE──► verify
        ▲                     │ REVISE               │ FAIL
        └─────────────────────┴──────────────────────┘
        │ verify APPROVE
        ▼
  【human】驗收（退回 → implement）
        ▼
phase 4 — ship（inner loop）
    create PR／update PR ◄── REVISE ── fresh review
        │ APPROVE
        ▼
  【human】讀 PR，裁決 merge（merge 永遠是人的動作）
```

- bug fix 的 `update spec if need`：plan 內含「spec 更新擬議」節，由人在 plan review 的 gate 一併裁決；核准後由 build session 在 phase 2 於 worktree 執行、隨修正一起 commit，spec 變更由 code review 覆蓋。
- fresh review：不帶前面任何 phase 歷史的全新 context，對整個 branch 審——組內 reviewer 共享意圖，過期宣稱看不出來，fresh context 是交付前最後的安全網。
