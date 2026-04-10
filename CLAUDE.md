# StampMill

## Project Overview
LINE 貼圖製作工具（React + Vite），從角色設定→AI 生成貼圖→去背→裁切→打包下載的一站式流程。使用 Gemini API 生成圖片描述與文字風格，Imagen API 生成角色和貼圖圖片。資料存 localStorage + IndexedDB，並透過 vite-plugin-local-save 同步到本地檔案。

## Handoff — 2026-04-10

### Branch: `feat/four-sticker-features`

### What was done
- 修正表情貼重新編輯時下載按鈕消失：恢復步驟判斷改用 `stickerSpec.hasMain` / `hasTab`
- 新增角色編輯功能：首頁角色卡片可編輯名稱、描述、主題、角色圖（`editingCharacterId` state）
- 角色資料路徑從 `data/` 搬到 `local/data/`，圖片用 git LFS 追蹤於 private repo
- `vite-plugin-local-save.js` 路徑更新為 `local/data`
- 新增狗勾圖鑑 listing（`local/stickers/0410-可愛動物村狗勾圖鑑/`，40 張）
- `/wrap-up` skill 新增 `--recursive` 參數支援 nested repo commit & push

### Current state
- 表情貼 + 一般貼圖端到端流程正常
- 角色可新建、編輯、刪除，資料透過 `local/data/` 持久化
- `local/` 是獨立 private repo（`stampmill-local`），外層 public repo 透過 `.gitignore` 排除
- `src/App.jsx` 已 ~1600 行，仍未拆分

### What's next
- TODO：稀有背景色 prompt、未填敘述樣式提示、單張參考圖示意姿勢
- 0406-眼淚製造機（一般貼圖版）尚未送審
- 0410-可愛動物村狗勾圖鑑：角色設計 → 生成

### Key context for next session
- `local/` 是獨立 git repo，角色資料存在 `local/data/`（characters.json、descriptions/、images/）
- `vite-plugin-local-save.js` 的 `DATA_DIR = path.resolve('local/data')` 是關鍵路徑
- dev server 需要 Node.js 20.19+（nvm use 20.19.0），否則 Vite 7 啟動會失敗
- 表情貼 `stickerSpec.hasMain = false`，恢復步驟和下載按鈕的條件都要用 spec 判斷
- 角色編輯用 `editingCharacterId` 區分新建/更新，儲存按鈕文字和頁面標題會隨之切換
