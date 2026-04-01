# StampMill

## Project Overview
LINE 貼圖製作工具（React + Vite），從角色設定→AI 生成貼圖→去背→裁切→打包下載的一站式流程。使用 Gemini API 生成圖片描述與文字風格，Imagen API 生成角色和貼圖圖片。資料存 localStorage + IndexedDB，並透過 vite-plugin-local-save 同步到本地檔案。

## Handoff — 2026-04-01

### Branch: `feat/four-sticker-features`

### What was done
- 實作進階去背工具：flood fill 點擊去背、吸色+矩形範圍去背
- 保留未去背原圖（raw images），讓每張貼圖/主圖/標籤圖可個別重做去背
- 多色預覽背景（白/粉/藍/黑/綠/橘）方便檢查去背品質
- 8宮格個別重新去背、主要圖/標籤圖獨立閾值控制
- 點擊去背支援 undo stack

### Current state
- 功能已實作完成，尚未經完整測試
- `src/App.jsx` 已超過 1400 行，未來可考慮拆分元件
- 主要圖/標籤圖若已存在，裁切步驟不會重新生成（避免浪費 API call）

### What's next
- 測試所有去背流程（flood fill、吸色、閾值調整）
- 台味大出巡貼圖組 04/02 送審 deadline
- 考慮將 App.jsx 拆分為多個元件（Step 元件化）

### Key context for next session
- `imageUtils.js` 的 `removeBackgroundFromPoint` 用 BFS flood fill，大圖可能較慢
- 點擊去背的座標需要從 display 座標轉換成原圖像素座標，注意 canvas 縮放比例
- IndexedDB 自動存檔有 1 秒 debounce（saveTimerRef）
