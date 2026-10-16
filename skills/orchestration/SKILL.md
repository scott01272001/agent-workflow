---
name: orchestration
description: v2 flow runner — 依任務種類載入 assets/flow/<type>/，開 maker session 跑各 phase 的 inner loop，在人介入點停下交人裁決。Use when the user kicks off a ticket with the v2 flow（「用 v2 修 #NN」「開 v2」「走 bug-fix flow」）, provides a bug ticket to plan or build, asks about a running v2 session, or confirms/redirects a phase gate. 目前實作 bug-fix 的 phase 1（planning）與 phase 2（build）；phase 3（ship）與 new-feature flow 未實作。
disable-model-invocation: true
---

# Orchestration v2

本 session 是 {ticket} 的 **controller**，持有 outer loop 與人介入點。**對 user 一律用中文。**

先讀本 skill 目錄的 `reference/contract.md`（agent-workflow 合約）：它是所有 session 的憲法，verdict 詞彙、迴圈上限、merge 歸人、證據規則、工作目錄都以它為準。

## 開 session 的共同機制

- flow 檔（`assets/flow/<type>/*.md`）的 frontmatter 是 spawn 清單：session 名、model、effort。**spawn 時照 frontmatter 的值帶 flags**——模型路由的策略在 flow 檔，不在本檔。
- `claude --bg`，`--append-system-prompt` 帶 `reference/contract.md` 全文（session 在目標 repo 工作，讀不到 plugin 路徑，憲法必須注入）。
- flow 檔本文填好輸入欄後作為第一則訊息注入。注入前自查：不得殘留未填的 `{...}` 佔位符；範本不足時回報 user，禁止即興創作角色指令。
- 目標 repo 還沒有 `.claude/agent-workspace/` 時，先跑 `setup` skill。
- session 閒置約一小時會停；要再聯絡先 wake。checker 是 subagent（`agents/`，frontmatter 管 model／tools），由 maker session 自己召，每輪新生、不得 fork。

## Workflow

1. 問 user 要走哪個 flow：Bug-fix（可用）／New-Feature（未實作；選了就說明並停）。

2. **Bug-fix — phase 0（背景，不進 loop）**
   - 向 user 要：ticket／bug 描述／症狀資訊；已有重現腳本或步驟記下路徑，作為 phase 1 輸入，不重做。
   - 只有工件（ticket、重現線索）進入 phase 1，敘述不進 loop。

3. **Bug-fix — phase 1（planning）**
   - 照 `assets/flow/bug-fix/planning.md` frontmatter 開 `{ticket}-planning`，注入填好的本文（ticket、症狀、既有線索、plan 路徑 `.claude/agent-workspace/{ticket}/plan.md`）。
   - planning session 自己跑 inner loop（reproduce → planning → plan review，上限三輪），你只等回報。
   - 回報路由：`APPROVED` → gate 1；`ESCALATE`／`BLOCKED`／三輪未過 → 原文呈給 user，等 user 決定。

   **【gate 1】審核 plan**，呈現（短句、verdict 先行、不改寫報告原編號）：根因＋證據、修法摘要與影響範圍、AC／REG 逐條（ID、可判定結果、層級）、MUST-RECORD 清單、plan 與最後一輪 review 報告路徑。
   - user 核准 → plan 含 spec 更新擬議且一併核准時，先叫 planning session 執行 spec 更新（一行回報）；收掉 planning session，進 phase 2。
   - user 退回 → 意見作 findings 重派同一個 planning session。

4. **Bug-fix — phase 2（build）**
   - 在主 checkout 建 worktree：`git worktree add .claude/worktrees/{ticket} -b dev/{ticket} <trunk>`（trunk＝origin/HEAD 指向的分支；定不出來問 user）。
   - 照 `assets/flow/bug-fix/build.md` frontmatter 開 `{ticket}-build`，**工作目錄設在 worktree**，注入填好的本文（plan 路徑、worktree／branch／base、lab.md、CI 入口、findings）。
   - build session 自己跑 inner loop（回歸測試 → implement → 自驗 → code review → verify，上限三輪），checker 用 `agents/code-reviewer.md` 與 `agents/verifier.md`。
   - 回報路由：`APPROVED` → gate 2；`ESCALATE`／`BLOCKED`／三輪未過 → 原文呈給 user。

   **【gate 2】驗收**，呈現：verify 報告的 AC／REG 逐列表格（原樣，含證據來源與對應 commit）、守根因的回歸測試位置與它攔什麼、交付 commit、code-review 與 verify 報告路徑、MUST-RECORD 清單。
   - user 核准 → phase 2 完成。phase 3（ship）未實作：告知 user 到此為止，問是否收掉 build session（worktree 與 commit 保留）。
   - user 退回 → 意見作 findings 重派同一個 build session。

## 規則（outer loop）

- merge 等對外動作永遠是人的；本 skill 的任何一層都不得代決。
- BLOCKED／ESCALATE = 缺證據或缺人的決策；任何成員任何時候回報，直接到你這裡找人，你不替人選出口。
- 你不生產、不裁決內容。證據過手不過腦：呈給 user 的是報告原文與路徑，不是你的轉述。
