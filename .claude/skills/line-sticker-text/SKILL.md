---
name: line-sticker-text
description: 從 listing.md 的「文字清單」table 產生 StampMill app 匯入用的 descriptions JSON。觸發詞：line-sticker-text、產生匯入 JSON、生成 descriptions JSON。
---

從一份 listing.md（StampMill 貼圖清單格式）讀「貼圖文字清單」table，輸出 descriptions JSON 給 StampMill web app 匯入使用。

## Arguments

`<listing-path>`：listing.md 絕對路徑或相對 `local/stickers/` 路徑。例如：
- `/Users/kafka1125/Documents/project/StampMill/local/stickers/0415-醜馬第三彈/listing.md`
- `0415-醜馬第三彈`（會自動補成 `local/stickers/0415-醜馬第三彈/listing.md`）

如果沒給路徑，問使用者要哪個 listing。

## Output Format

StampMill `local/data/descriptions/<charId>.json` 格式：

```json
[
  { "text": "<文字>", "description": "<情境/說明>" },
  ...
]
```

## Steps

1. **解析 listing.md**：找到 `## 貼圖文字清單` section 的 markdown table
   - Table header 通常是 `| # | 文字 | 情境/說明 | 符合特輯 |`
   - 每一 row：`| 1 | 騎馬要多久 | 醜馬指手錶給對方看 | |`
   - 取 col 2（文字）→ JSON `text`
   - 取 col 3（情境/說明）→ JSON `description`
   - **跳過** 表頭分隔線（`|--|---|---|`）和空 row
   - 文字內若有 markdown escape（`\|`）要還原

2. **驗證**：
   - 條目數應 ≥ 8（LINE 貼圖最少 8 張）
   - 每筆 `text` 與 `description` 都不能空
   - 條目數要對到 listing.md `## 貼圖詳細內容` 的「貼圖張數」欄位（如不符提示 user）

3. **輸出**：
   - 預設 print 到 stdout 一份 valid JSON
   - 詢問 user：「要直接寫到 `local/data/descriptions/<charId>.json` 嗎？」
     - 若要 → 列出 `local/data/characters.json` 找對應角色 id（match 角色名稱），找不到就請 user 指定 charId 或新增角色
     - 寫檔前先 cat 既有檔（如有）給 user 確認會覆蓋

4. **不要 commit 不要 push**，交給 user 決定

## Notes

- 舊範例參考：`local/data/descriptions/37d443de-9786-422a-9519-4dac5c92f071.json`（鮭魚系列）
- listing.md 例子：`local/stickers/0415-醜馬第三彈/listing.md`
- 完整匯入流程：StampMill web app 角色卡片 → import → 貼上 JSON
