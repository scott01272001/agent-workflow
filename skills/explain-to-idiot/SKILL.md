---
name: explain-to-idiot
description: Re-explain the previous reply or a named document in plain language.
disable-model-invocation: true
---

- 用白話重新解釋 user 指定的文件或你上一則訊息：先一句話說整體在講什麼，再逐段展開；允許例子與類比，一句話一個概念。
- 代號（AC-xx、REG-xx、D-x、步驟 x、verdict）逐個展開：定義去 `.claude/agent-workspace/{ticket}/plan.md` 或對應 spec 查，查不到就明說查不到，不要猜。
- 只解釋，不重新裁決：verdict、狀態、數字照原文引，不軟化、不改寫結論。
- 用中文回答，除非 user 明確說用英文。