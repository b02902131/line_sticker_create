# StampMill

## 簡介
基於現有的 LINE 貼圖生成工具（line_sticker_create）改造，目標是打造一個能**量產 AI 貼圖並盡可能自動化上架流程**的個人工具。目標使用者是自己，重點在效率與自動化。

## 現有功能（繼承自 line_sticker_create）
- Gemini API 生成角色設計與貼圖圖片（2×4 grid）
- AI 生成貼圖描述與文字
- 自動去背（Canvas API，色彩閾值演算法）
- 自動切圖並調整至 LINE 規格尺寸（main 240×240、tab 96×74、stickers 370×320）
- ZIP 打包下載
- React + Vite Web App，可部署至 GitHub Pages

## 核心改進目標
- 量產流程優化：減少人工介入，支援批次產出多組貼圖
- 自動化上架：研究 LINE Creators Market API 或自動化方案（Puppeteer/Playwright）
- 品質控管：增加預覽、篩選、重新生成機制

## 技術棧
- **前端**：React 18 + Vite（沿用現有）
- **AI**：Google Gemini API（gemini-3-pro-preview / gemini-3-pro-image-preview）
- **圖片處理**：Canvas API（沿用現有）
- **打包**：JSZip（沿用現有）
- **上架自動化**：Puppeteer 或 Playwright（待研究）

## 資料結構（草案）

```typescript
interface StickerSet {
  id: string
  theme: string
  characterImage: string // base64
  stickers: Sticker[]
  status: 'draft' | 'generated' | 'reviewed' | 'uploaded'
  createdAt: string
}

interface Sticker {
  index: number
  description: string
  text: string
  imageData: string // base64
  approved: boolean
}

interface UploadConfig {
  title: string
  titleEn: string
  author: string
  authorEn: string
  description: string
  category: string
  stickerSet: StickerSet
}
```

## 實作階段

### Phase 1 — 熟悉與穩定化
- 跑起來，了解現有程式碼
- 修 bug 或改善 UX 痛點
- 確認 Gemini API 的 quota 與限制

### Phase 2 — 量產流程優化
- 支援批次模式：一次定義多個主題，排隊產出
- 減少每步人工確認，增加「全自動模式」
- 貼圖品質篩選：AI 自動評分或人工快速審核介面

### Phase 3 — 上架自動化（研究）
- 調查 LINE Creators Market 是否有公開 API
- 若無 API，研究 Puppeteer/Playwright 自動化填表上傳
- 實作自動填寫貼圖資訊（標題、作者、描述、分類）
- 實作自動上傳圖片檔案

### Phase 4 — 完整工作流
- 整合 Phase 2 + Phase 3，從主題輸入到送審一鍵完成
- 上架狀態追蹤
- 歷史紀錄管理

## 待確認事項
- LINE Creators Market 是否有官方 API？（目前看來沒有）
- Gemini API 的 rate limit 與費用，量產時是否需要排隊機制？
- 是否需要支援其他 AI 模型（如 DALL-E、Midjourney）作為備案？
- 自動化上架的法律/ToS 風險？
