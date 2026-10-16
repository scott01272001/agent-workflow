# Plan Template

plan 是單一 ticket 的實作與驗證路徑（HOW）：只寫定義與證據，不寫驗證狀態（文件 Status 欄不在此限）。交付後 plan 功成身退，耐久物是 spec 更新、commit 與 PR。判斷測試——換一種實作這份文件必然要改，才是 plan 的內容；換實作也不用改的，屬於 spec，用引用不要複製。

---

# Plan: <ticket>

> **Status:** draft | in-review | approved
> **Spec:** <對應 spec 路徑；bug fix 無新 spec 時寫「無」>

## 1. Problem / 症狀與最小重現

- bug fix：症狀摘要＋**可執行的最小重現**（腳本或測試的路徑）＋**執行輸出**（reviewer 唯讀，跑不了重現，只能看紀錄）。
- feature：引用 spec 的 Problem/Goal，不複製。

## 2. 根因與證據（bug fix）

根因結論＋證據，並說明證據如何造成觀察到的症狀。feature 寫「N/A」。

## 3. 修法與影響範圍

怎麼修／怎麼做、動哪些模組、受影響的 caller 與資料路徑。

### 3.1 技術決策（Decisions）

每個重大決策一列、帶 D-ID——plan-reviewer 的 Pass 3 以此為錨逐個審前提，輸出用同組編號：

| D-ID | 決策 | 選擇 | 理由與前提 |
|---|---|---|---|
| D1 | <如：persistence> | <選了什麼> | <為什麼；依賴哪些前提（現況事實、版本、量級）> |

- 只列*重大*決策：改分支邏輯、跨模組邊界、斷言型別系統驗不了的性質（執行緒安全、冪等、順序）、不可逆影響（schema、序列化格式、public API）。一般實作細節是 implementer 的裁量，不列。
- 理由裡把依賴的前提寫明——前提是 reviewer 要驗的對象；藏在散文裡的前提會被當成 HIDDEN premise 挖出來。
- 決策寫這裡，不寫進 spec（spec 不裝 HOW）。

## 4. 工作順序與依賴

步驟順序、相依關係、每步的完成條件。單步修正可省略本節。

## 5. 驗證條件（AC／REG）

每條一個 ID、一個可判定結果、一個層級（unit／integration／lab）。只寫定義，不寫狀態或證據。

- **AC**：bug fix＝原 bug 不再重現＋必須成立的新結果；feature＝引用 spec 的 AC-ID 並補層級，不重寫定義。
- **REG**：受影響且必須保住的既有行為，由影響面掃描**物化成列**——「不會壞別的」是列，不是宣稱。feature 時以 spec 第 7 節為來源。
- 測試對應不寫在 plan：每條測試在自己的 doc 註明它守的 AC／REG ID（例：`spec xxx - AC1`），由 code review 檢查每條 AC／REG 都有具名測試守住。
- 驗證狀態不回寫 plan：gate 核准後 plan 凍結，逐列狀態與證據在 verify 報告（綁交付 commit）。

## 6. Spec 更新擬議

本修正是否改變既有行為契約；要的話列出擬議變更（改哪份 spec、哪些節、改成什麼），由人在 gate 裁決後才執行。無則寫「無」。
