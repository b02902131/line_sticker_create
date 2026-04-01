---
name: line-sticker-text
description: 從 listing.md 的貼圖文字清單表格，生成可直接貼進 StampMill app 的匯入格式。
argument-hint: [listing資料夾名稱]
---

從指定 listing 的 `listing.md` 讀取貼圖文字清單表格，轉換成 StampMill app 可匯入的格式。

## 格式

每行一張貼圖，格式為 `文字：描述`（全形冒號）。如果該張沒有描述，則只輸出文字。

範例輸出：
```
緩光迎：鞠躬歡迎入場
醬就好
```

## 步驟

1. 解析 `$ARGUMENTS`，作為 `stickers/` 下的資料夾名稱。如果沒給，用 Glob 找 `stickers/*/listing.md` 列出可用的 listing 讓使用者選。
2. 讀取 `stickers/<資料夾>/listing.md`。
3. 找到「貼圖文字清單」表格，解析每行的「文字」和「情境/說明」欄位。
4. 輸出轉換後的純文字，用 code block 包起來方便複製。
