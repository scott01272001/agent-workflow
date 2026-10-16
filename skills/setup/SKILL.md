---
name: setup
description: Setup the agent friendly project workspace
disable-model-invocation: true
---

## 建立工作目錄

依 agent-workflow 合約（`../orchestration/reference/contract.md`）建立專案的 agent 工作目錄：

```
repo
  |-.claude
  |     |-agent-workspace    任務執行過程的中途文件
  |-agent
        |-spec               專案功能 SPEC（入版控）
```

1. 在 repo 根目錄 `.claude/` 下建立 `agent-workspace/` 資料夾。
2. 建立 `agent/spec/` 資料夾（專案憲法另有 spec 保存規則時從專案，跳過此步）。
3. `.claude/agent-workspace/` 是中途文件，確認它在 `.gitignore`（或專案慣例的忽略清單）裡；`agent/spec/` 入版控。
