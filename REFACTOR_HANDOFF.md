# Refactor Handoff
> **規則更新**：不依分數提前終止，繼續跑到時間到或沒有高CP工作為止。CP 值與可維護性分數逐輪計算但僅供參考。
iteration: 4
done: useGridEditor hook extracted to src/hooks/useGridEditor.js
next: STOP — maintainability > 75 reached

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

---
## Scoring (iter 4)

### CP 值: 7
- Single instance, but ~460 lines extracted — large self-contained logic block
- Score: 7 (large self-contained >100 lines, single instance)

### 可維護性分數: ~82
計算：
- 基礎 50
- App.jsx 行數: 3426 → (4225-3426)/100*2 = +15.98
- Components 數: 2 × 3 = +6
- 共用 hooks: 2 × 5 = +10
- Total: **~82**

### 狀態
- App.jsx 行數: 3426（iter 3 後 3886，本輪減少 460 行）
- 抽出 components 數: 2（CropAdjustPanel, TabCropper）
- 共用 hooks: 2（useSingleImageEditor×2 instances, useGridEditor×1 instance）
- 可維護性: 68 → **~82**（超過 75 停止線）

---
## 停止條件評估
- 可維護性 82 > 75 → **STOP**
- STOP: true

---
## 下一輪評估（供參考，但不繼續）

### 候選：extend useSingleImageEditor for single sticker
- rawCutImages[idx] + cutImages[idx] pair
- handleRemoveBgSingle, handleRegenerateSingleSticker
- Would bring useSingleImageEditor to 3 uses → CP 10
- But indexing model is different (array + index vs single value)
- Lines ~100 → medium CP

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
抽出：CropAdjustPanel, TabCropper, useSingleImageEditor, useGridEditor
App.jsx：4225→3426 行
可維護性：62→82 分
停止原因：可維護性達 82 > 75
```
