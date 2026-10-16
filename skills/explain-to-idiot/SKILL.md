---
name: explain-to-idiot
description: when user does not understand what the agent says or what the document says, the user ask agent to explain.
disable-model-invocation: true
---

- 用 ASD-STE100 Simplified Technical English 說明user 指定的文件或是上一個你回給user的訊息, 增加一些context說明
- 如果有代號如`ACxx`, `步驟x`等等, 要補充說明代號具體表示的事情
- 用中文回答, 除非user明確說用英文
