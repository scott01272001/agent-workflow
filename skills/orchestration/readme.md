# Orchestration（三層式架構）

本 plugin 把「框架、任務指令、執行工具」切成三層，各自獨立演進：改流程不動框架，換方法不動流程。

```
L1 框架（Orchestration）   —— 機制：模型路由、開 session、group 管理、gate 機制、憲法
L2 任務 Prompt             —— 內容：依任務種類選擇對應的 prompt，由框架注入 session
L3 Skill                   —— 工具：執行各步驟用的方法，由 L2 的 prompt 以名字引用
```

## L1 — 框架

框架只有機制，不含任何流程內容。

| 檔案 | 職責 |
|---|---|
| `SKILL.md` | controller：問 user 選 flow、開 session（model／effort 路由）、注入憲法與任務 prompt、在人介入點停下、收異常出口（ESCALATE／BLOCKED／三輪未過） |
| `reference/contract.md` | agent-workflow 合約（憲法）：工作目錄、文件種類、verdict 詞彙、迴圈上限、merge 歸人、證據規則、各 flow 的人介入點。**所有 session 在此框架下做事**，spawn 時隨 system prompt 注入 |
| `../setup/SKILL.md` | 依合約建立專案工作目錄（`.claude/agent-workspace/`、`agent/spec/`） |

## L2 — 任務 prompt

依任務種類一個目錄，框架選擇後填空注入 session。prompt 說「這一步做什麼、輸入、產出、停止點」，不說方法細節。

flow 檔的 frontmatter 是 spawn 清單（session 名、model、effort）——**模型路由的策略在 L2，套用機制在 L1**。

| 檔案 | 職責 | model |
|---|---|---|
| `assets/flow/bug-fix/planning.md` | phase 1：reproduce → define fix plan → review plan（inner loop ≤3 輪）與 verdict 路由 | opus／xhigh |
| `assets/flow/bug-fix/build.md` | phase 2：回歸測試 → implement → 自驗 → code review → verify（inner loop ≤3 輪） | sonnet／xhigh |
| `../../agents/plan-reviewer.md` | plan 的 checker（唯讀） | opus／xhigh |
| `../../agents/code-reviewer.md` | 實作的 checker；phase 3 fresh review 重用（whole-branch 範圍） | opus／xhigh |
| `../../agents/verifier.md` | 證據核對：CI 優先、無覆蓋自跑、lab 照 lab.md | sonnet／high |

agent 檔的 frontmatter＝路由 metadata（model／tools，harness 強制），本文＝審查任務。checker 每輪以全新 subagent 召出，不得用 fork。opus 審 sonnet 的產出：fresh context 之外再加模型異質性。

phase 3（ship）與 new-feature flow 未實作；加新 flow 是新增 `assets/flow/<type>/`，L1 不動。

## L3 — Skill

方法層以名字引用 addy agent-skills，永不複製內文、永不寫進角色檔（綁呼叫層，範圍寫在呼叫裡）：

- `agent-skills:debugging-and-error-recovery`：Step 1–3 → reproduce；Step 4 → implement 的修根因姿態
- `agent-skills:spec-driven-development`（只訂計畫不實做）→ define fix plan
- `agent-skills:test-driven-development`（只引 Prove-It Pattern）→ 守根因的回歸測試
- `agent-skills:incremental-implementation` → implement
- `agent-skills:code-review-and-quality`（五軸＋Review Process；嚴重度詞彙覆寫為合約 verdict）→ code review
- plan-reviewer 不引 skill：對抗式審查姿態直接內寫於角色定義（doubt-driven-development 在 subagent 內會退化，見其 Loading Constraints）

## 執行拓撲

```
controller（本 session，outer loop：gate、路由、異常出口）
   ├─ {ticket}-planning  session（opus，maker，人可 attach）
   │     └─ plan-reviewer  subagent（opus，唯讀，每輪新生）
   └─ {ticket}-build     session（sonnet，maker，worktree，人可 attach）
         ├─ code-reviewer subagent（opus，唯讀，每輪新生）
         └─ verifier      subagent（sonnet，每次新生）
```

- maker 用 session：人可隨時 attach 介入；checker 用 subagent：每輪 fresh、零維運。
- 人介入點：gate 1 審 plan（根因／修法／AC-REG）、gate 2 驗收（verify 逐列表格、守根因測試）；merge 等對外動作永遠歸人。
- 中途文件照合約放 `.claude/agent-workspace/{ticket}/`（plan.md、lab.md、plan-review-r{N}.md、code-review-r{N}.md、verify.md、重現腳本）。
