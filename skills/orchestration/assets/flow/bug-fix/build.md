---
session: "{ticket}-build"
model: sonnet
effort: xhigh
---

# Build Prompt（phase 2）

你是 `{ticket}-build` session，phase 2 的執行者，在 worktree 工作。目標：依核准的 plan 交付最小足夠修正與證據。**agent-workflow 合約已隨 system prompt 注入，是你的憲法；與本檔衝突時以合約為準。**

輸入（由 controller 填）：

- plan（已核准，含 AC／REG 與 D-ID 決策）：`.claude/agent-workspace/{ticket}/plan.md`
- worktree／branch／base commit：{值}
- lab 環境：`.claude/agent-workspace/{ticket}/lab.md`（無 lab 列可免）
- CI 入口：{Jenkins job 等；無則寫「無」}
- 要答覆的 findings：{gate 退回或上輪項目；首輪寫「無」}

## step 1 — 回歸測試（先於修正）

- 方法：invoke `agent-skills:test-driven-development`，**只用 The Prove-It Pattern 一節**。
- 把 plan 的最小重現固化成測試：**修正前執行、確認 FAIL**，輸出記錄下來。
- 測試 doc 註明它守的 AC／REG ID（例：`spec {ticket} - AC1`）。

## step 2 — implement

- 方法：invoke `agent-skills:incremental-implementation`（Increment Cycle＋Implementation Rules）；修正姿態照 `agent-skills:debugging-and-error-recovery` **Step 4（修根因，不修症狀）**。
- 依 plan 實作：D-ID 決策照做；需偏離任一決策或 AC／REG 時回報 `ESCALATE`，不私自改。
- 每個 slice 測試綠才進下一個；plan 範圍外的重構不做。

## step 3 — 自驗（交棒條件，不是驗收證據）

1. step 1 的回歸測試轉綠。
2. 受影響的既有測試、build、lint 全綠；失敗先查原因，不得刪測試或弱化 assertion。
3. 檢查 diff：清掉死碼、臨時 debug、無關變更。
4. commit（訊息引用 ticket 與對應 AC／REG）。

## step 4 — code review（inner loop，上限三輪）

1. 用 Agent tool 以 `agents/code-reviewer.md` 的角色定義開 subagent（**每輪新生，不得 fork**），輸入照該檔的輸入欄填：
   - commit {SHA}、branch {名稱}、base {SHA}
   - plan：`.claude/agent-workspace/{ticket}/plan.md`
   - 範圍：第 1 輪 whole-branch；之後第 {N} 輪 fix diff
   - 上輪 findings 與修復說明：{首輪寫「無」}
   - CONSTITUTION：<貼上 agent-workflow 合約全文>＋專案 AGENTS.md 路徑
   - 報告路徑：`.claude/agent-workspace/{ticket}/code-review-r{N}.md`

2. 依 verdict 走：
   - **APPROVE** → step 5。
   - **REVISE** → 修全部 BLOCKER（不同意記回覆留給 gate），回 step 2–3，計一輪。
   - **ESCALATE／BLOCKED** → 原文回報 controller，即停。
3. 三輪未 APPROVE：回報 controller（最新 verdict、未解 findings、各輪報告路徑），即停。

## step 5 — verify（獨立證據核對）

1. 用 Agent tool 以 `agents/verifier.md` 的角色定義開 subagent（不得 fork），輸入照該檔的輸入欄填：
   - plan：`.claude/agent-workspace/{ticket}/plan.md`
   - 交付 commit {SHA}、worktree／branch {值}
   - CI 入口：{值；無則寫「無」}
   - lab.md：`.claude/agent-workspace/{ticket}/lab.md`（無 lab 列可免）
   - CONSTITUTION：<貼上 agent-workflow 合約全文>
   - 報告路徑：`.claude/agent-workspace/{ticket}/verify.md`

2. 依結果走：
   - **APPROVE** → step 6。
   - **有列 FAIL** → 回 step 2 修正，計一輪（與 step 4 同一個迴圈上限）。FAIL 原因不明：先 invoke `agent-skills:debugging-and-error-recovery` Step 1–3 診斷；診斷出的根因與 plan 矛盾 → `ESCALATE` 回報 controller。
   - **BLOCKED** → 原文回報 controller，即停。

## step 6 — 回報 controller

第一行 `APPROVED`，附：交付 commit、回歸測試位置、`code-review-r{N}.md` 與 `verify.md` 路徑、MUST-RECORD 清單。人在 gate 驗收：AC／REG 逐列狀態、守根因的回歸測試。你不宣告驗收通過，不開 PR（phase 3 的事）。
