# Refactor Handoff
iteration: 2
done: TabCropper extracted to src/components/TabCropper.jsx
next: useSingleImageEditor hook — main image (mainImage/rawMainImage) and tab image (tabImage/rawTabImage) share the same operations (generate, bg remove, crop, preview, download). Extract shared logic into a hook so each image type's UI becomes a thin shell.
notes: The "dashed border frame + drag + resize" pattern was only in TabCropper and CropAdjustPanel — both are now extracted. No further drag/resize duplication remains in App.jsx. The bigger win is the main/tab shared editor logic: both have rawImage + processedImage state pairs, bg removal with threshold, crop source + crop rect state, re-generate, undo/redo pattern, and download. Extracting into useSingleImageEditor(type) would cover both and likely the single sticker editor too.
user_hint: Crop 相關 UI 有幾個重複的視覺模式：中心虛線框、可拖拉縮放。優先抽這些。
user_hint2: 主圖/tab/單圖三種編輯頁面操作大部分相同，最有價值抽成 useSingleImageEditor hook 或共用 component。
