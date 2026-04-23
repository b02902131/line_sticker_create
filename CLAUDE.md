# StampMill

## Project Overview
LINE 貼圖製作工具（React + Vite），從角色設定→AI 生成貼圖→去背→裁切→打包下載的一站式流程。使用 Gemini API 生成圖片描述與文字風格，Imagen API 生成角色和貼圖圖片（也支援 gpt-image-2）。資料存 localStorage + IndexedDB，並透過 vite-plugin-local-save 同步到本地檔案。Outputs go/nogo sticker images, zip downloads.

## Handoff — 2026-04-24

### Branch: `main`

### What was done (本次重構 session)
- refactor: extract CropAdjustPanel to components/
- refactor: extract TabCropper to components/
- refactor: extract useSingleImageEditor hook for main/tab image logic
- refactor: extract useGridEditor hook for 8-grid image logic
- refactor: extract useStickerEditor hook for single-sticker regen/bg-remove
- refactor: extract useDescriptionsEditor hook + StickerPreviewGrid component
- refactor: extract useAnimationEditor hook
- refactor: extract useClickRemoveEditor hook for click-to-remove-bg logic
- refactor: split imageUtils into focused modules (bgRemoval.js, canvasUtils.js, barrel re-export in imageUtils.js)
- App.jsx: 4225 → 2876 lines (-32%, -1349 lines)
- Maintainability score: 62 → 92

### Current state
- Extracted components: CropAdjustPanel, TabCropper, GridMultiCropAdjustPanel, StickerPreviewGrid
- Extracted hooks: useSingleImageEditor, useGridEditor, useStickerEditor, useDescriptionsEditor, useClickRemoveEditor, useAnimationEditor
- imageUtils split into: bgRemoval.js, canvasUtils.js (barrel re-export in imageUtils.js)
- App.jsx still has: large JSX render sections (not yet split into pages)
- All hooks use `generateFn` injection pattern (same as useSingleImageEditor)
- Backward-compatible aliases kept in App.jsx for all hook state — save/load paths unchanged

### What's next
- **JSX page split** (highest CP remaining): extract StickerProducePage, CharacterCreatePage, HomePage JSX sections from App.jsx into src/pages/. State stays in App(), props passed down. Would bring App.jsx from ~2876 → ~400 lines.
- Props-passing approach (no Context needed — hooks already encapsulate state)
- Strategy: one agent per page section, sequential (all touch App.jsx)

### Key context for next session
- All hooks use `generateFn` injection pattern (same as useSingleImageEditor)
- Backward-compatible aliases kept in App.jsx for all hook state — save/load paths unchanged
- REFACTOR_HANDOFF.md has full scoring history and stop-condition rules
- JSX split approach: move render JSX to src/pages/<PageName>.jsx, keep hooks/state in App(), pass via props
- deploy 指令：`npm run deploy`（先 predeploy build → gh-pages -d dist）
- dev server 需要 Node.js 20+，Vite 7

---

## Handoff — 2026-04-19 (daily-dev auto, night)

### Branch: `main`

### What was done
- `/todos tidy`：local/TODOs.md 已是昨日 tidy 完的兩段結構，無需改動
- `/todos check`：pending 5 項全部 blocked
  - 2 項 `[待驗證]` 等 gh-pages 手機手測（單圖重產優化 / 文字風格一致）
  - 2 項 `[~]` 有 ❓ clarification 等 user 回答（字體配色強制規格 / 樣式提示 UI）
  - 1 項 research-only「LINE creator API 自動上架」→ 以 WebSearch 研究完並勾掉
- `/todos do next`：研究 LINE Creators Market API
  - 結論：**無公開自動上架 API**。creator.line.me 只有手動 web portal（New Submission → 42 張圖）。相關 LINE API (Messaging sticker / LINE Notify / Mission Sticker) 都是消費端不是發布端
  - 自動化邊界：StampMill 只能到「產圖 + 輸出 zip」，上架仍需手動

### Current state
- 主 repo：無 code 變更、無 deploy 需要
- local repo：TODOs.md 勾掉 line creator API 項 + 3 行 research 摘要，commit + push 待辦
- pending 4 項全部 blocked 等 user input / 手測

### What's next
- User 回答 TODOs 2 項 ❓：字體配色是否升級強制規格 / 「樣式提示」具體 UI
- 手機手測驗證 0415 單圖重產 + 風格一致兩個 [待驗證] 項目
- `campaign.md`（local 未追蹤）若要版控，下次處理

### Key context for next session
- 手機測試 URL：`https://b02902131.github.io/StampMill/`（gh-pages 0419 deploy）
- LINE Creators Market：自動上架 **不可行**，自動化終點止於本地 zip 輸出
- deploy 指令：`npm run deploy`（先 predeploy build → gh-pages -d dist）

---

## Handoff — 2026-04-19 (daily-dev auto, evening)

### Branch: `main`

### What was done
- `/todos tidy`（local/TODOs.md）：原本 checked/unchecked 混雜無結構，改整成「## 待辦（未排期） / --- / ## done（MMDD 分組）」標準格式
- `/todos check`：比對 pending 與 codebase
  - 勾掉「單張貼圖可以丟參考圖作為補充」— `src/App.jsx` L2097 `regenPanel` state 已支援 refIndexes + extraPrompt（0415 實裝）
  - 勾掉「部署到 GitHub Pages」— gh-pages branch 存在、`npm run deploy` script 設定好
- `/todos do next`：執行 `npm run deploy` — 距上次 deploy（0415）已有 7 個 commit 未上線，deploy 完成

---

## Handoff — 2026-04-19 (pm, Discord-triggered)

### Branch: `main`

### What was done
- **角色建立頁單張上傳 ref 可生成** (closes TODO ❓)
  - bug：`src/App.jsx` L2413 原本有 `{(uploadedCharacterImages.length !== 1) && ...生成按鈕...}` — 單張上傳時生成按鈕消失
  - 同時 L675 單張上傳會 `setCharacterImage(all[0])` 讓 `characterImage` 為真，即便按鈕顯示也會變成「重新生成」而非「生成」
  - fix：新增 `isRawUpload = (uploadedCharacterImages.length === 1 && characterImageHistory.length === 0)` 判定；`isGenerated = characterImage && !isRawUpload` 控制按鈕 label 與 onClick；移除 `length !== 1` gate
  - 結果：單張上傳時「儲存角色」+「生成角色」兩顆按鈕並存；按生成會把上傳圖當 ref 丟給 `generateCharacter`

### Current state
- `npm run build` 通過，406.52 kB bundle，main push 完
- local repo：TODOs.md 項目勾 `[x]` + 三行摘要、commit push
- 無 [待驗證] 新增；原 0415 [待驗證] 兩項仍等 deploy

### What's next
- deploy 驗證 0415 單圖重產 ref / prompt 一致風格兩項
- `campaign.md` (local 未追蹤) 若要版控，下次處理

### Key context for next session
- 角色建立頁 state：`uploadedCharacterImages`（raw 上傳） / `characterImage`（目前預覽）/ `characterImageHistory`（生成過的）
- 判 raw vs generated：看 `characterImageHistory.length === 0` + 有 upload → raw；反之 generated
- 生成按鈕在 `App.jsx` character-create page 的「角色預覽」區 (~L2412–2434)

---

## Handoff — 2026-04-19 (am, daily-dev auto)

### Branch: `main`

### What was done (daily-dev auto)
- /todos check：比對 local/TODOs.md pending 與 codebase
  - 勾掉「8 宮格分割單張顯示 8 裁切筐 (支援複選/拖曳/縮放)」— 已在 `src/components/GridMultiCropAdjustPanel.jsx` 實作
  - 「一張圖也要可以當參考圖生成」語意模糊，加 ❓ clarification 問使用者要哪個場景 (a) 角色建立 ref 上傳 (b) 單張重產勾 ref (c) 初始批次外部 ref → 下午 Discord 回覆 (a)，已實裝
- root repo 無 code 變更；local repo commit + push `todos: 勾 8 宮格 multi-crop 完成 + 一張圖 ref 生成問 clarification`

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
