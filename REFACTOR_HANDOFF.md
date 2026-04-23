# Refactor Handoff
> **規則更新**：不依分數提前終止，繼續跑到時間到或沒有高CP工作為止。CP 值與可維護性分數逐輪計算但僅供參考。
> **⚠️ 收尾指令**：完成當前這輪後設 `STOP: true`，確認 `npm run build` 通過，更新 CLAUDE.md handoff，然後停止。不要繼續下一輪。
> **用戶建議（架構師請參考）**：App.jsx JSX render section 可以各自抽成 component（MainImageSection, TabImageSection, StickerProducePage），state 先留在 App()，props 傳下去。這樣 App.jsx 可從 ~2876 行進一步暴減到 ~400 行。架構師自行判斷是否執行及執行方式。

iteration: 9 (sprint session)
done: |
  Wave 4: StickerProducePage JSX extracted to src/pages/StickerProducePage.jsx (~1155 lines JSX).
  App.jsx 2876→1557 (−1319 lines). Build passes.
  Also fixed pre-existing bugs: setColorRectStart/setColorRectEnd/getClickRemoveSource/applyResult/ensureArraySize/setGifProgress now exported from hooks.
next: CharacterCreatePage (~300 lines JSX) + HomePage (~100 lines JSX) — would bring App.jsx to ~400 lines.
scores: CP 値 10, 可維護性 ~95
STOP: false (more work possible — CharacterCreatePage + HomePage remaining)

---
## What was done (iter 4)
- Created `src/hooks/useGridEditor.js` (672 lines)
  - Encapsulates all 8-grid state: gridImages, processedGridImages, cutImages, rawCutImages
  - Encapsulates crop adjust state: cropAdjustHistory, cropAdjustTarget, multiCropAdjustTarget
  - Encapsulates per-grid loading indicators: regeneratingGrid, removingBgGrid, recutGridIndex, recutting
  - Encapsulates pre-cut preview cache: preCutGridCellPreviews, preCutPanelOpen, preCutLoadingGridIndex
  - Encapsulates per-sticker thresholds: stickerThresholds
  - Helpers: getTotalStickerCount, getGridCount, getNextGridIndex, getStickerThreshold, getCropAdjust, hasAnyCropAdjustInRange, cropGridCellsWithAdjust, ensureGridCellsReady, ensureStickerReady
  - Handlers: generateOneGridAt, handleRegenerateGrid, handleRemoveBgGrid, handleRecutSingle, handleRecut, handleOpenCropAdjust, handleCropAdjustConfirm, handleOpenMultiCropAdjust, handleApplyMultiCropAdjust
  - openGridRegenPanel, toggleGridRegenRef, gridRegenPanel state/setter
  - `generateFn` injected as dependency (same pattern as useSingleImageEditor)
- Refactored App.jsx: added `const gridEditor = useGridEditor(...)` after tabEditor aliases
- Added ~60 backward-compatible aliases so all save/load/render paths keep working unchanged
- Removed ~460 lines of duplicate state and handlers from App.jsx
- Build passes: `npm run build` clean

## What was done (iter 5)
- Created `src/hooks/useAnimationEditor.js`
  - gifModal, gifSelectedFrames, gifDelay, gifGenerating, gifProgress state
  - handleOpenGifModal, handleToggleGifFrame, handleDownloadGif handlers
- App.jsx 3182 → 2974 (−208 lines)

## What was done (architect session waves 1-3)
- Wave 1: Created `src/hooks/useStickerEditor.js`
  - removingBgIndex, handleRemoveBgSingle
  - regeneratingIndex, regenPanel, openRegenPanel, toggleRegenRef, handleRegenerateSingleSticker
  - App.jsx 3426 → 3310 (−116 lines)
- Wave 2: Created `src/hooks/useDescriptionsEditor.js`
  - bulkText import, per-sticker AI text/desc generation, batch fill, drag-sort, CRUD helpers (~170 lines)
  - Created `src/components/StickerPreviewGrid.jsx`
  - Per-sticker preview grid with all per-sticker controls, regen panel, CropAdjustPanel (~200 lines)
  - App.jsx 3310 → 3017 (−293 lines)
- Wave 3: Created `src/hooks/useClickRemoveEditor.js`
  - flood/color click-remove state + handlers + undo stack (~134 lines)
  - App.jsx 3017 → 2876 (−141 lines)
- All builds clean. Total this session: −550 lines.

---
## Scoring (architect session)

### CP 值: avg 8
- useStickerEditor: CP 8 (large self-contained, 116 lines)
- useDescriptionsEditor + StickerPreviewGrid: CP 9 (293 lines, high cohesion)
- useClickRemoveEditor: CP 7 (134 lines, self-contained)

### 可維護性分數: ~92
計算：
- 基礎 50
- App.jsx 行數: 2876 → (4225-2876)/100*2 = +26.98 ≈ +27
- Components 數: 4 (CropAdjustPanel, TabCropper, GridMultiCropAdjustPanel, StickerPreviewGrid) × 3 = +12
- 共用 hooks: 1 (useSingleImageEditor×2) × 5 = +5
- Other hooks (6): useGridEditor, useStickerEditor, useDescriptionsEditor, useClickRemoveEditor, useAnimationEditor, (+ useSingleImageEditor) × 2 each = +12
- Total: **~92**

### 狀態
- App.jsx 行數: 2876（down from 4225 start）
- 抽出 components 數: 4（CropAdjustPanel, TabCropper, GridMultiCropAdjustPanel, StickerPreviewGrid）
- hooks 數: 7（useSingleImageEditor, useGridEditor, useStickerEditor, useDescriptionsEditor, useClickRemoveEditor, useAnimationEditor + 1 more）
- 可維護性: 62 → **~92**

---
## 停止條件評估
- 可維護性 92 > 75 → 停止線早過，但繼續策略不以分數停止
- STOP: false（時間到或沒有高CP工作）

---
## 下一輪建議（最高CP剩餘工作）

### JSX render section split (超高CP)
App.jsx 目前還有 ~2876 行，其中 JSX section 約 2200 行。
建議拆法：
- `src/pages/StickerProducePage.jsx` — sticker-produce page JSX (~1200 lines)
- `src/pages/CharacterCreatePage.jsx` — character-create page JSX (~300 lines)  
- `src/pages/HomePage.jsx` — home page JSX (~100 lines)
- App.jsx 只保留：state declarations + hook instantiations + page routing (~400-500 lines)

這是目前剩餘最大的 CP 工作。props 量大但直接傳下去，不需要 context。

---
## 所有 agent 的 handoff 規則（包括架構師）
**每個 agent（含架構師）在每個 wave/iteration 結束後都必須更新此檔案**，格式：
- `iteration:` 或 `wave:` 編號
- `done:` 本輪做了什麼
- `next:` 下一個目標
- `scores:` CP 值 + 可維護性分數
- `STOP: true/false`

---

## Discord Final Report 格式（當停止時）
```
[stampmill] 重構結報（共 N 輪）
抽出：CropAdjustPanel, TabCropper, useSingleImageEditor, useGridEditor, useAnimationEditor, useStickerEditor, useDescriptionsEditor, StickerPreviewGrid, useClickRemoveEditor
App.jsx：4225→2876 行
可維護性：62→92 分
停止原因：時間到
```
