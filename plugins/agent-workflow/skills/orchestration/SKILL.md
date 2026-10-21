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
- flow 檔本文填好輸入欄後作為第一則訊息注入。佔位符分兩種：`{...}` 由你（controller）注入前填好，不得殘留；`<...>` 是 maker 執行期自填的變數（如 `<N>`、`<SHA>`），原樣保留。範本不足時回報 user，禁止即興創作角色指令。
- **前綴 cache 紀律**：cache 以「組織＋模型＋位元組前綴」為鍵，第一個不同的 byte 之後全部作廢。所以——assignment 欄位序照範本的「穩定 → 波動」排列，不得重排；合約逐字貼原文（不摘錄、不加語境句），flow 進行中不改 contract.md；範本與 assignment 不得含日期、時間等每次必變的內容；maker 的 system prompt 注入 spawn 後永不改動。守住這些，同一 checker 的各輪只付波動尾巴的錢。
- 目標 repo 還沒有 `.claude/agent-workspace/` 時，先跑 `setup` skill。
- **controller 的回報地址＝本 session 的實名**：spawn 任何 member 前，用 ListAgents 確認本 session 當下可定址的名字，填進 flow 檔的「回報對象」欄。建議（非必要）請 user 在開 flow 前先 `/rename {ticket}-controller`，名字即語意；**flow 進行中不改名**——改名會讓已派出 member 的回報撲空。
- member 的 tools 不得排除 SendMessage／ListAgents（目前 frontmatter 未限 tools，預設即有——此句防未來加 tools 限制時砍掉回報通道）。
- session 閒置約一小時會停；要再聯絡直接 SendMessage（訊息會讓它醒來處理；CLI 沒有 wake 命令）。checker 是 subagent（`agents/`，frontmatter 管 model／tools），由 maker session 自己召，每輪新生、不得 fork。

## Workflow

1. 問 user 要走哪個 flow：Bug-fix（可用）／New-Feature（未實作；選了就說明並停）。

2. **Bug-fix — phase 0（背景，不進 loop）**
   - 向 user 要：ticket／bug 描述／症狀資訊；已有重現腳本或步驟記下路徑，作為 phase 1 輸入，不重做。
   - 依合約「{ticket} 識別字」規則定 `{ticket}`：有編號原樣用；無編號提議 kebab-case slug 並向 user 確認一次（違規命名會被 plugin 的 mod 擋下）。
   - 只有工件（ticket、重現線索）進入 phase 1，敘述不進 loop。

3. **Bug-fix — phase 1（planning）**
   - 照 `assets/flow/bug-fix/planning.md` frontmatter 開 `{ticket}-planning`，注入填好的本文（ticket、症狀、既有線索、plan 路徑 `.claude/agent-workspace/{ticket}/plan.md`、回報對象＝本 session 實名）。
   - planning session 自己跑 inner loop（reproduce → planning → plan review，上限三輪），你只等回報。
   - 回報路由：`APPROVED` → gate 1；`ESCALATE`／`BLOCKED`／三輪未過 → 原文呈給 user，等 user 決定。

   **【gate 1】審核 plan**，呈現（短句、verdict 先行、不改寫報告原編號）：根因＋證據、修法摘要與影響範圍、AC／REG 逐條（ID、可判定結果、層級）、MUST-RECORD 清單、plan 與最後一輪 review 報告路徑。
   - user 核准 → 核准的 spec 更新擬議成為 phase 2 的輸入之一；收掉 planning session，進 phase 2。
   - user 退回 → 意見作 findings 重派同一個 planning session。

4. **Bug-fix — phase 2（build）**
   - **先查 trunk 漂移**：比對 plan 的基準 commit（phase 1 重現與根因所本）與當前 trunk；trunk 已前進時列出新增 commit 的範圍（`git log --oneline <基準>..<trunk>`）交 user 裁決——照新 trunk 建（plan 的重現與影響面可能要重驗）或照基準建。
   - 在主 checkout 建 worktree：`git worktree add .claude/worktrees/{ticket} -b dev/{ticket} <trunk>`（trunk＝origin/HEAD 指向的分支；定不出來問 user）。
   - 照 `assets/flow/bug-fix/build.md` frontmatter 開 `{ticket}-build`，**工作目錄設在 worktree**，注入填好的本文（plan 路徑、worktree／branch／base、lab.md、spec 更新擬議（gate 1 核准版）、findings、回報對象＝本 session 實名）。
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
- **member 回報撲空**（找不到回報對象）：用 ListAgents 核對本 session 名與 flow 檔裡填的回報對象是否一致；不一致（如 session 被改名或背景化後換名）→ 重派時更新回報對象欄。
- **讀 member 的對話**不要用 `claude logs`（輸出是 TUI 控制碼）；讀 `~/.claude/projects/<專案 slug>/<sessionId>.jsonl`，取最後的 assistant 文字即其回報。
- 你不生產、不裁決內容。證據過手不過腦：呈給 user 的是報告原文與路徑，不是你的轉述。
