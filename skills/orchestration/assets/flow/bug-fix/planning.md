---
session: "{ticket}-planning"
model: opus
effort: xhigh
---

# Planning Prompt（phase 1）

你是 `{ticket}-planning` session，phase 1 的執行者。目標：產出一份人可以審核的修正計畫。plan 是契約：只寫定義與證據，不寫驗證狀態（文件 Status 欄不在此限）。**agent-workflow 合約已隨 system prompt 注入，是你的憲法；與本檔衝突時以合約為準。**

輸入（由 controller 填）：

- ticket：{ticket 路徑或敘述}
- 症狀：{phase 0 的症狀敘述}
- 既有線索：{重現腳本／步驟路徑；無則寫「無」}
- plan 路徑：`.claude/agent-workspace/{ticket}/plan.md`
- 回報對象：{controller 的 session 名}

所有「回報 controller」＝用 SendMessage 送到回報對象。找不到收件者時等 60 秒重試、最多 5 次；重試用盡仍失敗就停在原地，controller 之後會來讀。

## step 1 — reproduce issue

- 方法：invoke `agent-skills:debugging-and-error-recovery`，**只做 Step 1–3（reproduce／localize／minimize），不往修正走**。
- 產出：
  - 可執行的最小重現（腳本或測試），存進 `.claude/agent-workspace/{ticket}/`。**執行它，把執行輸出記錄在 plan**——這是「重現可機器判定」的證據；reviewer 是唯讀的，跑不了它，只能看你的紀錄。
  - 根因與證據（說明證據如何造成觀察到的症狀），寫進 plan 草稿。
- **無法重現**：走 skill 的決策樹（timing／environment／state／random）；用盡後回報 controller `BLOCKED`＋已嘗試條件，即停。出口（document & monitor、接受低信心修法）由人決定，不自行選擇。

## step 2 — define fix plan

- 方法：invoke `agent-skills:spec-driven-development`，**只訂計畫，不實做**。格式與位置以本檔為準（plan 路徑見上），不用 SPEC.md。
- plan 必含：
  1. 最小重現：路徑＋執行輸出
  2. 根因與證據
  3. 修法與影響範圍
  4. 驗證條件：AC（原 bug 不再重現＋必須成立的新結果）與 REG（必須保住的既有行為），每條一個 ID、一個可判定結果、一個層級（unit／integration／lab）。只寫定義，不寫狀態或證據。**列的單位是失效模式，不是受影響路徑**：影響面掃描產出候選，由同一機制保證、一條測試失效能同時暴露的候選併為一列。歸併規則——(a) 合併必附前提（共用機制＋file:line，review 會查核；前提不成立的部分拆回獨立列）；(b) 變體寫成列內參數（「跑兩組：…」），不開新列；(c) 驗寫入的列規定初值 ≠ 預期值；(d) 守 D-ID 設計決策的檢查歸 code review，不佔列；(e) 附一行歸併說明（成因 × 寫入點 × 對外承諾 → N 列）；(f) 每列先找既有測試當守衛——判準是「該列失效時它會不會紅」，攔得住就在其 doc 補 AC／REG ID 註記，不新寫。
  5. spec 更新：對照合約的 spec 位置（`agent/spec/`，專案另有規定時從專案），檢查現有 spec 是否因本修正要更新；要的話把擬議變更寫成本節。擬議由人在 gate 裁決；核准後由 build session 在 worktree 執行、隨修正一起 commit——**你不執行 spec 更新**。

## step 3 — review plan（inner loop，上限三輪）

1. 用 Agent tool 以 `agents/plan-reviewer.md` 開 subagent（**每輪新生，不得用 fork**——fork 會帶入你的 context，違反 fresh review），prompt 照下列填：

   ```
   TARGET: .claude/agent-workspace/{ticket}/plan.md
   TYPE: PLAN
   CONTRACT: {ticket 路徑或需求敘述}。另加本 flow 的擋件條件：
     重現存在且附執行輸出；每條 AC/REG 可客觀判定且標層級；
     根因有證據支撐；影響面已物化成 REG 列。
   CONSTITUTION: <貼上 agent-workflow 合約全文——subagent 讀不到 plugin 路徑>；
     另附專案 AGENTS.md／constitution 路徑（無則寫「無」）
   ```

2. 把 reviewer 的完整輸出存到 `.claude/agent-workspace/{ticket}/plan-review-r<N>.md`，依 RECOMMENDATION 走：
   - **APPROVE** → 回報 controller：第一行 `APPROVED`，附 plan 路徑、本輪 review 報告路徑、MUST-RECORD 清單（由人在 gate 追蹤）。
   - **REVISE** → 修正**全部** BLOCKER，不得自行略過任何一項；不同意某項 finding 時把理由記進回覆，留給 gate 的人裁決。修完回到 1，計一輪。
   - **ESCALATE** → 需求級缺口，改 plan 解決不了：原文回報 controller，即停。
   - **BLOCKED** → 缺輸入能補就補齊再送；補不了原文回報 controller，即停。

3. 三輪 REVISE 仍未 APPROVE：回報 controller——最新 RECOMMENDATION、未解 findings、plan 與各輪報告路徑，即停，不跑第四輪。
