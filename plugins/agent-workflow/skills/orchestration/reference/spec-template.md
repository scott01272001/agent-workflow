# Spec Template

寫作指引：模糊需求先改寫成可量測的成功條件並向人確認目標（「做快一點」→「LCP < 2.5s、首批資料 < 500ms →這些目標對嗎？」），再落成 R-ID。spec 是行為契約：只寫系統承諾什麼（WHAT），不寫怎麼做（HOW）。判斷測試——換一種實作這節要不要改？要改的內容不屬於 spec，移去 plan。

---

# Spec: <Feature Name>

> **Status:** draft | in-review | approved
> **Ticket:** <KEY-123>（無則省略）
> **Module(s):** <受影響模組>
> **Reviewed by:** —

## 1. Problem / Goal

一到兩句：解決什麼問題、為什麼現在重要、成功長什麼樣。

## 2. Scope / Non-goals

本次涵蓋什麼；明確**不做**什麼（防止過度實作）。

## 3. Requirements

每條一個 R-ID：觸發條件、預期結果、相關狀態與副作用。複雜行為用下列手段具體化到可判定：

- Happy path 編號步驟
- Inputs / Outputs 表（欄位、型別、必填、限制）
- Error handling 表（條件 → 行為語意，不只 HTTP code）

## 4. Constraints / Compatibility

效能、資源、順序、相依版本等硬限制；必須維持的相容性（API、資料格式、既有 caller）。不發明 CONTRACT 沒有的限制。

## 5. Failure / recovery behavior

error 表蓋不到的失敗語意：部分失敗、重試與冪等、逾時、恢復、資料一致性。只定義允許／禁止的結果，不指定機制。

## 6. Acceptance criteria（定義）

每條一個 AC-ID，Given / When / Then，綁對應的 R-ID。只寫可客觀判定的結果：不寫測試方法或層級、不用 checkbox（狀態不進 spec）、不寫「既有測試通過」這類測試宣告。

## 7. Existing behavior that must be preserved（brownfield）

受影響且必須保住的既有行為，逐條點名——這是 plan 物化 REG 列的來源。

## 8. Risks / affected callers or components

受影響的 caller、模組、資料路徑與依據。

## 9. Open Questions

未決事項與需要人決策的點——**草稿期章節**：draft／in-review 時記錄輪與輪之間的未決帳（含 reviewer 的 CONTRACT-GAPS）；存在阻塞性未決問題時，Status 不得進 approved；**approved 時清空或整節移除**，耐久的 spec 不帶過程資訊。
