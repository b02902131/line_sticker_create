---
name: line-sticker-deploy
description: 開啟 LINE Creators Market 送審頁面，並顯示該 listing 的送審 checklist。
argument-hint: [listing資料夾名稱]
---

LINE Creators Market 沒有公開 API，送審只能手動。這個 skill 幫助準備送審流程。

## 步驟

1. 解析 `$ARGUMENTS` 作為 `stickers/` 下的資料夾名稱。如果沒給，用 Glob 找 `stickers/*/listing.md` 列出可用的 listing 讓使用者選。
2. 讀取 `stickers/<資料夾>/listing.md`，擷取送審需要的資訊。
3. 用 `open` 指令打開 LINE Creators Market：`https://creator.line.me/my/sticker/new/sticker/`
4. 顯示送審 checklist：

### 送審 Checklist

從 listing.md 擷取並顯示：
- 貼圖類型 & 張數
- 標題（中/英）
- 說明（中/英）
- 創意人名稱
- 版權
- 定價
- 販售地區
- 特輯參加狀態
- 是否使用 AI
- 其他設定（拼貼樂、免費試用等）

### 提醒事項
- 確認 ZIP 已下載（main + tab + stickers）
- 確認圖片規格：main 240x240、tab 96x74、stickers 370x320
- 確認去背品質
- 確認截止日期

5. 更新 listing.md 的狀態追蹤，將「送審上架」標記為進行中並記錄日期。
