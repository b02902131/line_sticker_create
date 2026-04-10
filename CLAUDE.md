# StampMill

## Project Overview
LINE 貼圖製作工具（React + Vite），從角色設定→AI 生成貼圖→去背→裁切→打包下載的一站式流程。使用 Gemini API 生成圖片描述與文字風格，Imagen API 生成角色和貼圖圖片。資料存 localStorage + IndexedDB，並透過 vite-plugin-local-save 同步到本地檔案。

## Handoff — 2026-04-10

### Branch: `feat/four-sticker-features`

### What was done
- 修正表情貼重新編輯時下載按鈕消失（步驟恢復判斷改用 `stickerSpec.hasMain`）
- 新增角色編輯功能 + 草稿儲存（無圖也能存）
- 角色資料從 `data/` 搬到 `local/data/`，圖片用 git LFS
- **完全移除 localStorage 依賴**，改為檔案 API 直接讀寫（解決 5MB quota 問題）
- 角色預覽 UI 整合為單一流程（解決編輯模式上傳圖片存不到的 bug）
- 新增 0410-可愛動物村狗勾圖鑑 listing（40 張）
- `/wrap-up` skill 新增 `--recursive` 參數

### Current state
- 表情貼 + 一般貼圖端到端流程正常
- 角色 CRUD 完整，資料透過 `local/data/` 持久化（無 localStorage）
- `local/` 是獨立 private repo（`stampmill-local`），外層 public repo 排除
- 狗勾圖鑑已開始生成（5 張 grid 已產出）

### What's next
- 0410-可愛動物村狗勾圖鑑：繼續生成 + 去背 + 送審
- 0406-眼淚製造機（一般貼圖版）尚未送審
- TODO：稀有背景色 prompt、未填敘述樣式提示、單張參考圖示意姿勢

### Key context for next session
- **不再用 localStorage**，`localSync.js` 全部走 `/api/characters` 等檔案 API
- dev server 需要 Node.js 20.19+（`nvm use 20.19.0`），Vite 7 需要
- `local/` 是獨立 git repo，`vite-plugin-local-save.js` 的 `DATA_DIR = path.resolve('local/data')`
- 角色編輯用 `editingCharacterId` state，角色預覽區是統一的單一 UI 流程
- 表情貼 `stickerSpec.hasMain = false`，步驟恢復和下載按鈕條件都要用 spec 判斷
- `useState([])` 初始為空，角色靠 `useEffect` → `syncLoadCharacters` 非同步載入
