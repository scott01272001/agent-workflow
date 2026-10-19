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
- **controller 自動改名**：spawn 第一個 member 時，mod（`hooks/register.tsx`）自動把改名排入 queue——user 的下一則訊息後，本 session 改名為 `{ticket}-controller`（member 回報的收件者；套用由 `hooks/apply_controller_name.py` 完成）。你唯一要做的是 spawn 完向 user 加一行：「下一則訊息後，本 session 改名為 `{ticket}-controller`」。名字衝突時 mod 會直接擋下 spawn 並說明。
- member 的 tools 不得排除 SendMessage／ListAgents（目前 frontmatter 未限 tools，預設即有——此句防未來加 tools 限制時砍掉回報通道）。
- session 閒置約一小時會停；要再聯絡先 wake。checker 是 subagent（`agents/`，frontmatter 管 model／tools），由 maker session 自己召，每輪新生、不得 fork。

## Workflow

1. 問 user 要走哪個 flow：Bug-fix（可用）／New-Feature（未實作；選了就說明並停）。

2. **Bug-fix — phase 0（背景，不進 loop）**
   - 向 user 要：ticket／bug 描述／症狀資訊；已有重現腳本或步驟記下路徑，作為 phase 1 輸入，不重做。
   - 依合約「{ticket} 識別字」規則定 `{ticket}`：有編號原樣用；無編號提議 kebab-case slug 並向 user 確認一次（違規命名會被 plugin 的 mod 擋下）。
   - 只有工件（ticket、重現線索）進入 phase 1，敘述不進 loop。

3. **Bug-fix — phase 1（planning）**
   - 照 `assets/flow/bug-fix/planning.md` frontmatter 開 `{ticket}-planning`，注入填好的本文（ticket、症狀、既有線索、plan 路徑 `.claude/agent-workspace/{ticket}/plan.md`、回報對象 `{ticket}-controller`）。
   - planning session 自己跑 inner loop（reproduce → planning → plan review，上限三輪），你只等回報。
   - 回報路由：`APPROVED` → gate 1；`ESCALATE`／`BLOCKED`／三輪未過 → 原文呈給 user，等 user 決定。

   **【gate 1】審核 plan**，呈現（短句、verdict 先行、不改寫報告原編號）：根因＋證據、修法摘要與影響範圍、AC／REG 逐條（ID、可判定結果、層級）、MUST-RECORD 清單、plan 與最後一輪 review 報告路徑。
   - user 核准 → 核准的 spec 更新擬議成為 phase 2 的輸入之一；收掉 planning session，進 phase 2。
   - user 退回 → 意見作 findings 重派同一個 planning session。

4. **Bug-fix — phase 2（build）**
   - 在主 checkout 建 worktree：`git worktree add .claude/worktrees/{ticket} -b dev/{ticket} <trunk>`（trunk＝origin/HEAD 指向的分支；定不出來問 user）。
   - 照 `assets/flow/bug-fix/build.md` frontmatter 開 `{ticket}-build`，**工作目錄設在 worktree**，注入填好的本文（plan 路徑、worktree／branch／base、lab.md、spec 更新擬議（gate 1 核准版）、findings、回報對象 `{ticket}-controller`）。
   - 填 build.md 輸入欄的所有 workspace 路徑（plan、lab.md、報告路徑）一律用**主 checkout 的絕對路徑**：build session 在 worktree 工作，相對路徑解析不到主 checkout 的 gitignored workspace，還會造成 workspace 分裂。
   - build session 自己跑 inner loop（回歸測試 → implement → 自驗 → code review → verify，上限三輪），checker 用 `agents/code-reviewer.md` 與 `agents/verifier.md`。
   - 回報路由：`APPROVED` → gate 2；`ESCALATE`／`BLOCKED`／三輪未過 → 原文呈給 user。

   **【gate 2】驗收**，呈現：verify 報告的 AC／REG 逐列表格（原樣，含證據來源與對應 commit）、守根因的回歸測試位置與它攔什麼、交付 commit、code-review 與 verify 報告路徑、MUST-RECORD 清單。
   - user 核准 → phase 2 完成。phase 3（ship）未實作：告知 user 到此為止，問是否收掉 build session（worktree 與 commit 保留）。
   - user 退回 → 意見作 findings 重派同一個 build session。

## 規則（outer loop）

- merge 等對外動作永遠是人的；本 skill 的任何一層都不得代決。
- **跨 phase 退回**：需要修 plan 而 planning session 已收掉時（build 回報 ESCALATE、或 gate 2 的人要求改 plan），照 planning.md frontmatter 重開 `{ticket}-planning`，輸入含原 plan 路徑、要答覆的 findings（ESCALATE 原文或人的意見）；plan 修訂後重走 plan review 與 gate 1，再回到 phase 2（build session 保留，worktree 不動）。
- BLOCKED／ESCALATE = 缺證據或缺人的決策；任何成員任何時候回報，直接到你這裡找人，你不替人選出口。
- **改名沒落地**（member 回報撲空、ListAgents 看不到 `{ticket}-controller`）：請 user 執行 `/rename {ticket}-controller`。已知坑：排隊後本 session 被背景化會換 session id，queue 落空（v1 issue 21 同款），同樣用 `/rename` 兜底。
- 你不生產、不裁決內容。證據過手不過腦：呈給 user 的是報告原文與路徑，不是你的轉述。
