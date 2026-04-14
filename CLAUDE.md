# StampMill

## Project Overview
LINE 貼圖製作工具（React + Vite），從角色設定→AI 生成貼圖→去背→裁切→打包下載的一站式流程。使用 Gemini API 生成圖片描述與文字風格，Imagen API 生成角色和貼圖圖片。資料存 localStorage + IndexedDB，並透過 vite-plugin-local-save 同步到本地檔案。

## Handoff — 2026-04-15

### Branch: `main`

### What was done (today)
- 新增 `local/stickers/0415-醜馬第三彈/listing.md`，從 `local/NOTE.md` 搬入 9 個醜馬 idea（騎馬要多久、馬不停蹄、斑馬搬馬、馬卡龍、駟馬難追、天馬行空、天馬流星拳、騎驢找馬、指鹿為馬），全部列入貼圖文字清單
- Discord 透過 nekoroni multi-session inbox/outbox 處理了 git log / local git log / push 狀態 / deploy URL / 醜馬第三彈搬運 等多則訊息

### Current state
- `local/stickers/0415-醜馬第三彈/listing.md` 已建好，狀態追蹤為「內容規劃 進行中」
- `local/NOTE.md` 原始醜馬第三彈 section 未動（未標記已搬移）
- `local/` working tree：有新增的 listing.md 尚未 commit；主 repo working tree 乾淨（僅 handoff 更新待處理）
- Deploy URL：https://b02902131.github.io/line_sticker_create/

### What's next
- **醜馬第三彈 角色 asset 確認**：`local/data/characters.json` 看不到「醜馬」角色，需要確認前一/二彈的角色圖在哪、第三彈是否沿用同一隻醜馬造型
- **第一/二彈 listing**：目前只有第三彈 listing，若要送審需補建前兩彈（或整併為一個 pack）
- 若確定沿用前彈角色 → 可跑 `/line-sticker-text` 產 StampMill 匯入 JSON，直接接進 web app 生成貼圖
- NOTE.md 的醜馬 section 是否標記「已搬到 0415-醜馬第三彈」也等使用者決定
- 承接上次 handoff 未完成項：狗勾圖鑑繼續生成、0406-眼淚製造機送審、tab/main 反覆去背 bug

### Key context for next session
- 醜馬第三彈 listing 路徑：`local/stickers/0415-醜馬第三彈/listing.md`
- 文字清單已 key 好 9 筆，情境說明直接用 NOTE.md 原文
- （保留上次 2026-04-10 的 key context：綠幕去背、裁切微調、localStorage 移除、local/ 獨立 repo、表情貼 hasMain 判斷）

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
