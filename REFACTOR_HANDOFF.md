# Refactor Handoff
iteration: 3
done: useSingleImageEditor hook extracted to src/hooks/useSingleImageEditor.js
next: Consider extending useSingleImageEditor for single sticker (array-indexed), or extract useGridEditor for 8-grid regenerate/crop/bgRemove logic (gridImages, processedGridImages, cutImages, rawCutImages, cropAdjust).

---
## What was done (iter 3)
- Created `src/hooks/useSingleImageEditor.js` (130 lines)
  - Encapsulates: rawImage + processedImage state pair, threshold override, regenerating/removingBg flags, cropSource state
  - Handlers: regenerate (calls generateFn prop), removeBg, handleUpload, handleCropConfirm, handleCropCancel, reset, setInitialImage
  - `generateFn` is injected as a dependency — makes the hook reusable for any image type
- Refactored App.jsx to use `mainEditor = useSingleImageEditor(...)` and `tabEditor = useSingleImageEditor(...)`
- Removed inline async handlers for main/tab regenerate + removeBg from JSX
- Removed standalone `handleRemoveTabBg` function + `removingTabBg` useState
- Kept backward-compatible aliases (setMainImage, setRawMainImage, etc.) so the many save/load paths didn't need changes
- Build passes: `npm run build` clean

---
## Scoring (iter 3)

### CP 值: 10
- useSingleImageEditor covers main image + tab image = 2 shared uses
- Hook is 130 lines, self-contained, high-value logic
- Pattern identical in both: rawImage + processedImage pair, threshold, regenerate, removeBg, cropSource
- Single sticker editor (future iter) would be the 3rd use → already qualifies as "shared 2+ places"

### 可維護性分數: ~68
計算：
- 基礎 50
- App.jsx 行數: 3886 → (4225-3886)/100*2 = +6.78
- Components 數: 2 × 3 = +6
- 共用 hooks: 1 × 5 = +5
- Total: **~68**

### 狀態
- App.jsx 行數: 3886（iter 2 後 3900，減少 14 行；實際邏輯移出 ~130 行但新增 aliases ~40 行）
- 抽出 components 數: 2（CropAdjustPanel, TabCropper）
- 共用 hooks: 1（useSingleImageEditor，2 instances）
- 可維護性: 62 → **~68**（未超過 75 停止線）

---
## 下一輪評估

### 候選：useGridEditor
- gridImages, processedGridImages, cutImages, rawCutImages
- generateOneGridAt, handleRegenerateGrid, handleRemoveBgGrid, handleRecut, handleRecutSingle
- cropAdjust helpers (getCropAdjust, hasAnyCropAdjustInRange, cropGridCellsWithAdjust)
- 估計 ~300-400 行可抽出
- CP: 7-8（大型自成一體，只有一個實例但行數大）

### 候選：extend useSingleImageEditor for single sticker
- rawCutImages[idx] + cutImages[idx] pair
- handleRemoveBgSingle, handleRegenerateSingleSticker
- Would bring useSingleImageEditor to 3 uses → CP 10
- But indexing model is different (array + index vs single value)

### 停止條件評估
- 可維護性 68 < 75 → 繼續
- 下一個候選 CP ≥ 7 → 繼續
- STOP: false

---
## Discord Final Report 格式（當停止時）
```
[stampmill] 重構結報（共 N 輪）
抽出：CropAdjustPanel, TabCropper, useSingleImageEditor
App.jsx：4225→X 行
可維護性：62→Y 分
停止原因：CP值/分數達標/時間到
```
