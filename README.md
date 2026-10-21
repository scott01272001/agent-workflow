# agent-workflow-v2

個人 Claude Code 工具集。整個 repo 是一個 local marketplace（名稱 `agent-workflow`），`plugins/` 下每個子資料夾是一個獨立安裝的 plugin。

## Plugins

| Plugin | 性質 | 說明 |
|---|---|---|
| [`agent-workflow`](plugins/agent-workflow/) | 工作流專用 | 三層 bug-fix flow runner：controller 持人介入點，maker session 跑 inner loop，checker subagent 每輪新生；{ticket} 命名由 mod 強制。 |
| [`context-usage-bar`](plugins/context-usage-bar/) | 通用（所有 session） | 輸入框上方狀態列：context window 用量、速率限制、prompt cache 命中率＋TTL 倒數；`/cache-report` 統計。 |
| [`cache-keeper`](plugins/cache-keeper/) | 通用（所有 session） | 閒置接近 cache TTL 時自動自 ping 保溫，下一輪真實請求讀 cache 而非重寫；預設關，`/keep-warm` 逐 session 開關。 |

分層原則：通用 plugin 不得含工作流語彙；`agent-workflow` 可依賴通用 plugin，反向不行。

## 安裝

```
claude plugin marketplace add /path/to/agent-workflow-v2
claude plugin install agent-workflow@agent-workflow
claude plugin install context-usage-bar@agent-workflow
```

各 plugin 的功能、指令與用法見各自資料夾的 README／SKILL.md。

## 新增工具

1. 在 `plugins/<name>/` 建立 plugin（`.claude-plugin/plugin.json` 必備）。
2. 在根目錄 `.claude-plugin/marketplace.json` 的 `plugins` 加一個條目（`source` 指向子資料夾）。
3. `claude plugin marketplace update agent-workflow` 後即可安裝。
