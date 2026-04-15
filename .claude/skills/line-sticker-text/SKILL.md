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

輸出為多行文字（可直接貼到文字清單匯入處），每行一筆：

```txt
{{name}}:{{description}}
```

## Script (recommended)

直接用 repo 內腳本輸出（stdout）：

```bash
npm run -s line-sticker-text -- "<listing-path>"
```

## Steps

1. **解析 listing.md**：找到 `## 貼圖文字清單` section 的 markdown table
   - Table header 通常是 `| # | 文字 | 情境/說明 | 符合特輯 |`
   - 每一 row：`| 1 | 騎馬要多久 | 醜馬指手錶給對方看 | |`
   - 取 col 2（文字）→ `name`
   - 取 col 3（情境/說明）→ `description`
   - **跳過** 表頭分隔線（`|--|---|---|`）和空 row
   - 文字內若有 markdown escape（`\|`）要還原

2. **驗證**：
   - 條目數應 ≥ 8（LINE 貼圖最少 8 張）
   - 每筆 `name` 與 `description` 都不能空
   - 條目數要對到 listing.md `## 貼圖詳細內容` 的「貼圖張數」欄位（如不符提示 user）

3. **輸出**：
   - 預設 print 到 stdout 一份純文字（每行 `name:description`，行尾換行）
   - 不再寫入 `local/data/descriptions/<charId>.json`（格式已改）

4. **不要 commit 不要 push**，交給 user 決定

## Notes

- 舊 JSON 範例（已不適用於本 skill 的輸出格式）：`local/data/descriptions/37d443de-9786-422a-9519-4dac5c92f071.json`（鮭魚系列）
- listing.md 例子：`local/stickers/0415-醜馬第三彈/listing.md`
- 完整匯入流程（依新格式調整）：StampMill web app 角色卡片 → import → 貼上多行 `name:description`
