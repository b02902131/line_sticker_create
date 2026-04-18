# StampMill

## Project Overview
LINE 貼圖製作工具（React + Vite），從角色設定→AI 生成貼圖→去背→裁切→打包下載的一站式流程。使用 Gemini API 生成圖片描述與文字風格，Imagen API 生成角色和貼圖圖片。資料存 localStorage + IndexedDB，並透過 vite-plugin-local-save 同步到本地檔案。

## Handoff — 2026-04-19

### Branch: `main`

### What was done (daily-dev auto)
- /todos check：比對 local/TODOs.md pending 與 codebase
  - 勾掉「8 宮格分割單張顯示 8 裁切筐 (支援複選/拖曳/縮放)」— 已在 `src/components/GridMultiCropAdjustPanel.jsx` 實作
  - 「一張圖也要可以當參考圖生成」語意模糊，加 ❓ clarification 問使用者要哪個場景 (a) 角色建立 ref 上傳 (b) 單張重產勾 ref (c) 初始批次外部 ref
- root repo 無 code 變更；local repo commit + push `todos: 勾 8 宮格 multi-crop 完成 + 一張圖 ref 生成問 clarification`

### Current state
- root TODOs.md 全空，main 乾淨
- local/TODOs.md 剩 1 項 pending 卡 ❓、2 項 `[待驗證]` 等 deploy 驗證、Next version section 有 `部署 GitHub Pages` / `研究 line creator API`（daily-dev 不 deploy，跳過）
- `GridMultiCropAdjustPanel` 支援點選 / Shift+⌘ 複選 / 拖曳 / 滾輪或方向鍵微調 / +− 縮放

### What's next
- 等使用者回覆「一張圖也要可以當參考圖生成」的 clarification 後再實作
- 驗證 `[待驗證]` 兩項（單圖重產 style ref）
- Line creator API 研究（情報室任務，非 StampMill 本體）

## Handoff — 2026-04-18

### Branch: `main`

### What was done
- **單張圖下載**：每張貼圖新增「下載」按鈕，下載的檔名（`01.png`/`001.png`）與尺寸（`spec.cell.w × spec.cell.h`）與 ZIP 內容一致
- `fitToSize` 從 `zipDownloader.js` 改為 export，`App.jsx` 直接 import 使用
- 貼圖格子按鈕列由 5 欄擴為 6 欄

### Current state
- build OK，main 已 push
- TODOs 全空（0416 兩項皆 done）
- 端到端流程完整：角色設定 → AI 生成 → 去背 → 裁切微調 → 單張下載 / ZIP 打包

### What's next
- 無待辦。可考慮：
  - 驗證「單圖重產」風格對齊效果（勾 ref + `#N` + extraPrompt）
  - 8 宮格分割 UI 改善：在八宮格上直接顯示 8 個裁切框，各自可縮放/移動
  - 統一可愛動物村名稱與中英對照（40 狗勾 + 喵喵圖鑑 listing）

### Key context for next session
- `src/utils/zipDownloader.js`：`fitToSize` 已 export，`downloadAsZip` + `fitToSize` 都可直接 import
- `src/App.jsx`：`handleDownloadSingle(idx)` — 單張下載 handler，在 `handleDownload` 下方
- 貼圖格子按鈕：重產 / 去背 / 選去 / 微調 / 上傳 / 下載（6 欄）
- dev server 需要 Node.js 20+（`node --version` 確認），Vite 7
- `local/` 是獨立 git repo（`stampmill-local`），外層 public repo 排除

---

## Handoff — 2026-04-10

### Branch: `feat/four-sticker-features`

### What was done
- 8 宮格改用亮綠 (#00FF00) chroma-key 背景，取代白色背景去背
- 新增 `CropAdjustPanel` 元件：方向鍵/拖拉微調裁切位置 + 縮放控制
- `cropSingleCell()` 支援偏移量與 zoom 參數
- `removeBackgroundSimple()` 新增色差模式（歐式距離比對背景色）
- cell boundary prompt 強化：居中、10% padding、不跨格
- 角色 CRUD、localStorage 移除、角色預覽 UI 整合（前次 session）

### Current state
- 表情貼 + 一般貼圖端到端流程正常
- 去背流程：綠幕 chroma-key → 色差模式自動去背，品質大幅提升
- 裁切支援手動微調（偏移 + 縮放），解決 AI 構圖偏移問題
- `local/` 是獨立 private repo（`stampmill-local`），外層 public repo 排除

### What's next
- 0410-可愛動物村狗勾圖鑑：繼續生成 + 去背 + 送審
- 0406-眼淚製造機（一般貼圖版）尚未送審
- TODO：未填敘述樣式提示、單張參考圖示意姿勢、tab/main 反覆去背 bug

### Key context for next session
- **綠幕去背**：`characterGenerator.js` 的 grid prompt 用 `#00FF00` 背景，`removeBackgroundSimple()` 用 `isChromaKey` + `colorDistThreshold` 參數
- **裁切微調**：`CropAdjustPanel` 在 `App.jsx`，`cropSingleCell()` 在 `imageUtils.js`，支援 offset + zoom
- **不再用 localStorage**，`localSync.js` 全部走 `/api/characters` 等檔案 API
- dev server 需要 Node.js 20.19+（`nvm use 20.19.0`），Vite 7 需要
- `local/` 是獨立 git repo，`vite-plugin-local-save.js` 的 `DATA_DIR = path.resolve('local/data')`
- 表情貼 `stickerSpec.hasMain = false`，步驟恢復和下載按鈕條件都要用 spec 判斷

---

# Discord Multi-Session 通訊規範

你是透過 Discord 多 session 架構接收任務的 Claude Code agent。

## 收到通知時

當你的終端機出現「有新訊息，請讀 discord-inbox.md」時：

1. **讀取** `discord-inbox.md`
2. 找到所有 `status: pending` 的訊息
3. **依序處理**每則訊息
4. 處理完一則後，把該則的 `status: pending` 改成 `status: done`
5. 把回覆寫到 `discord-outbox.md`
6. **寫完 outbox 後必 call**：`/Users/kafka1125/Documents/project/nekoroni/discord-multi-session/notify-main.sh stampmill "<簡短原因>"`
   - 不 call 的話主 session 不知道你寫了，outbox 會積著沒 relay

## discord-inbox.md 格式

```markdown
---
id: msg_XXXXX
channel: CHANNEL_ID
user: USERNAME
ts: ISO_TIMESTAMP
status: pending
---
訊息內容
```

- 只處理 `status: pending` 的訊息
- 處理完改成 `status: done`
- 不要刪除任何訊息紀錄

## discord-outbox.md 格式

把你的回覆 **append** 到檔案最後面：

```markdown
---
reply_to: msg_XXXXX
channel: CHANNEL_ID
ts: ISO_TIMESTAMP
status: pending
---
你的回覆內容（markdown，會被發到 Discord）
```

- `reply_to` 對應 inbox 的 `id`
- `status: pending` 表示等待主 session 發送
- 主 session 發送後會改成 `status: sent`
- 回覆請簡潔（Discord 有 2000 字元限制）

## 注意事項

- 你的回覆不會直接到 Discord，會由主 session 轉發
- 如果任務需要很長時間，先寫一則「處理中...」到 outbox，完成後再寫完整回覆
- 如果不確定怎麼做，寫一則問題到 outbox 請使用者確認
- 每次處理完所有 pending 訊息後，簡單說一聲「inbox 處理完畢」
