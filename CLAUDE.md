# StampMill

## Project Overview
LINE 貼圖製作工具（React + Vite），從角色設定→AI 生成貼圖→去背→裁切→打包下載的一站式流程。使用 Gemini API 生成圖片描述與文字風格，Imagen API 生成角色和貼圖圖片。資料存 localStorage + IndexedDB，並透過 vite-plugin-local-save 同步到本地檔案。

## Handoff — 2026-04-15

### Branch: `main`

### What was done
- **8 宮格底色可自選（生成 + 去背一致）**：新增 `chromaKeyBgColor`（預設 `#333333`），並把 prompt 的背景色從寫死改為參數（`generateGrid8Image(..., opts.bgColor)`）。
- **去背支援指定背景色**：`removeBackgroundSimple(imageDataUrl, threshold, maskData, opts.bgColor)` 可強制用指定色做色差去背（不靠角落偵測）。
- **8 宮格逐組生成/確認**：新增 `confirmEachGrid` 模式，可先產 1 組 → 檢查/重產/調去背 → 再按「生成下一組」。
- **UI 調整**：背景色選取器放在 Step 6（生成前先選），Step 7 保留一份用於「改色後重跑去背」。

### Current state
- build OK（`npm run build`）
- 8 宮格可用深灰或任意色當底，避免綠幕難去背/誤判；逐組生成適合人工逐頁確認品質

### What's next
- 驗證「單圖重產」：勾 ref + `#N` 引用 + extraPrompt，確認風格對齊效果
- 若逐組生成要更穩：補上「跳到指定組」/「自動偵測缺的組」的 UX（目前以 nextIndex 為主）

### Key context for next session
- `src/utils/characterGenerator.js`：`generateGrid8Image` 多了 `opts`（目前用 `opts.bgColor`）
- `src/utils/imageUtils.js`：`removeBackgroundSimple` 多第 4 參數 `opts`（`{ bgColor: '#RRGGBB' }`）
- `src/App.jsx`：Step 6 有底色選取器；Step 7 有「生成下一組」按鈕（逐組模式）

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
