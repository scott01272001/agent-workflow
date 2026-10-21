---
name: setup
description: Set up the agent-workflow working environment in the current project — create the contract-defined workspace directory and wire up .gitignore; idempotent, reports what already existed. Invoked by the user, or by the orchestration controller when the workspace is missing.
---

# Setup：建立 agent-workflow 工作環境

依 agent-workflow 合約（`../orchestration/reference/contract.md`）建立專案的工作目錄。冪等：已存在的只回報，不覆蓋、不改動既有內容。

## 步驟

1. **確認位置**：在 repo 根目錄執行（有 `.git/`，或 user 指定的專案根）。
2. **建目錄**：`.claude/agent-workspace/`。只建到這層——per-ticket 子目錄（`{ticket}/plan.md`、`lab.md`、review 報告）由 flow 在任務開始時建。
3. **gitignore**：檢查 `.claude/agent-workspace/` 是否已被忽略——包括被上層規則涵蓋（如整個 `.claude/` 已在 ignore 清單）。已被涵蓋：不改任何檔，回報「沿用既有規則」。未被涵蓋：`.gitignore` 追加一行 `.claude/agent-workspace/`；已有該行就不動，不得加出重複行；repo 沒有 `.gitignore` 時新建。不是 git repo：跳過本步，回報中註明。判定用 `git check-ignore .claude/agent-workspace/` 最可靠。
4. **回報**：逐項列 建立／已存在／跳過（附原因），一行一項。

## 不做的事

- 不建 `agent/spec/`：不入版控的空目錄沒有意義，它由第一份 spec 落檔時自然建立（spec 的家仍依合約）。
- 不動既有檔案內容；`.gitignore` 只追加不重排。
