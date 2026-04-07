# StampMill

## Project Overview
LINE 貼圖製作工具（React + Vite），從角色設定→AI 生成貼圖→去背→裁切→打包下載的一站式流程。使用 Gemini API 生成圖片描述與文字風格，Imagen API 生成角色和貼圖圖片。資料存 localStorage + IndexedDB，並透過 vite-plugin-local-save 同步到本地檔案。

## Handoff — 2026-04-07

### Branch: `feat/four-sticker-features`

### What was done
- 新增 `src/utils/stickerSpecs.js` 集中規格常數（一般貼圖 vs 表情貼）
- 表情貼支援：180×180 單張，採 2× 超採樣（生成 360×360 → 縮回 180×180）
- 8 宮格從寫死 740×1280 改為動態，依 spec 換算（表情貼為 720×1440）
- App.jsx 加「貼圖類型」radio selector，所有寫死的 370/320/740/1280 全部替換
- 表情貼模式跳過主要圖片生成，下載檔名改為 `001.png ~ 040.png`（3 位數）
- 完成 0407-愛哭雲朵表情貼 listing 規劃 + 送審
- gemini.js / characterGenerator.js 加 Gemini debug logger

### Current state
- 表情貼端到端流程已可運作，剛完成第一組（愛哭雲朵表情貼）送審
- 4 月 API 用量 NT$141.39 / NT$200，明細在 `local/finances/costs.md`
- `src/App.jsx` 已 ~1500 行，仍未拆分

### What's next
- 04/08 後從 Gemini Spend 確認 04/07 表情貼實際成本（目前推估 NT$17.09）
- 還沒做的 TODO：稀有背景色 prompt、未填敘述樣式提示、單張參考圖示意姿勢
- 0406-眼淚製造機（一般貼圖）尚未送審

### Key context for next session
- `stickerSpec.generateCell.{w,h}` = Gemini 生成尺寸；`stickerSpec.cell.{w,h}` = 最終單張尺寸
- `splitGrid8(src, srcCellW, srcCellH, outW, outH)` 第 4-5 參數做 downscale
- 表情貼登錄頁（emoji/register）跟一般貼圖頁結構不同：無風格/角色 select、Vue 框架，新增日中欄位需手動操作（v-model 不接 DOM 觸發）
- LINE 表情貼檔名規範是 3 位數補零；一般貼圖維持 2 位數
- 貼圖資料夾命名規則：`MMDD-名稱` 用**完成日期**而非送審截止日
