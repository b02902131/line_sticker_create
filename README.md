# StampMill — LINE 貼圖製作工具（fork 強化版）

> **Forked from [scorpioliu0953/line_sticker_create](https://github.com/scorpioliu0953/line_sticker_create)**
> 原始作者的 README、示範影片與基礎介紹保留在上游 repo，這份 README 只列我這個 fork 新增 / 改動的部分。
>
> 感謝原作者提供完整的基礎工具，讓我能在這之上做客製化擴充。

## 🌐 線上版本（這個 fork）

**[https://b02902131.github.io/line_sticker_create/](https://b02902131.github.io/line_sticker_create/)**

直接在瀏覽器使用，無需安裝。手機 Safari / Chrome 也可開。

> 原版線上頁面：[scorpioliu0953.github.io/line_sticker_create/](https://scorpioliu0953.github.io/line_sticker_create/)

## 🆕 這個 fork 新增的功能

### 角色與貼圖管理
- **角色設計兩階段流程拆分**：階段 A 設計角色 → 階段 B 生產貼圖（先存角色再批量產，可重複使用）
- **角色草稿存檔**：還沒生成圖片就可以先存草稿
- **角色編輯**：名稱、描述、主題、角色圖都可以後續修改
- **角色刪除**：連同 IndexedDB 圖片一起清乾淨
- **🆕 角色匯出**：把單一角色（含 meta + descriptions + 八宮格 / 主圖 / 標籤圖等所有圖片）打包成 JSON 檔下載
- **🆕 角色匯入**：從 JSON 檔上傳還原角色，方便跨裝置（電腦 ↔ 手機）同步

### 持久化
- **🆕 localStorage fallback**：production 部署版本也會把角色 / 描述 / API key 存在瀏覽器 localStorage，refresh 不會消失
- **IndexedDB 圖片儲存**：八宮格、單張貼圖、主圖、標籤圖都存在 IndexedDB，避免 localStorage 配額爆掉
- **本地檔案同步**（dev mode 限定）：開發時所有資料同步寫到 `local/data/`，方便用 Git LFS 備份角色與圖片

### 貼圖生成強化
- **支援表情貼尺寸**：除了一般貼圖，也支援表情貼（不同 8 宮格 + 單圖規格）
- **單張貼圖重產**：不用整批重來，可以針對某一張不滿意的單獨重生
- **八宮格單張重產**：八宮格內任一格也可單獨重產，保留其他格不變
- **八宮格風格參考**：產第二張八宮格時自動參考第一張，維持風格一致（類似 RNN 概念）
- **文字批次匯入**：貼上文字清單會自動分配到 N 張貼圖，跳過已有的、追加新的
- **文字匯出**：匯出格式直接支援再次匯入
- **重複文字偵測**：產圖前自動檢查避免重複，與排除清單整合
- **AI 補齊空描述**：批次補齊時跳過已填入的，per-item 進度顯示
- **貼圖順序拖拉編輯**

### 圖片處理
- **強化去背演算法**：色差偵測 + 邊緣擴散，比單純白色閾值準確
- **稀有背景色**：八宮格自動用 `#00FF00` 亮綠當背景，從源頭降低去背難度
- **去背格線去除**：八宮格內的格線額外做清理 pass，避免殘影
- **主圖 / 標籤圖去背**：除了八宮格，主圖跟標籤圖也支援去背 + 反覆嘗試
- **標籤圖從圖片選擇**：可以從主圖、八宮格、角色圖任一張裁切出來當標籤圖
- **Crop 十字輔助線**：裁切框中央有白色虛線十字，方便置中對齊
- **綠幕去背 + 裁切微調面板**：單獨的編輯面板可以後製去背參數

### Prompt 強化
- **角色一致性強化**：每次圖片生成都明確要求保持角色外觀一致（髮色、特徵）
- **可選的 character stance 輸入**：產文字描述時可以指定角色姿勢方向
- **PROHIBITED_CONTENT 處理**：偵測 Gemini 阻擋並給友善錯誤訊息
- **timeout / retry 強化**：八宮格生成 timeout 拉到 150s，overloaded error 用 exponential backoff 重試 5 次
- **文字描述 retry 機制**：API overload 自動重試
- **excluded texts 功能**：擴充系列貼圖時排除已用過的文字

### UI / UX
- **重做流程銜接**：產圖過程中可隨時回到先前階段繼續
- **流程恢復**：關掉重開能接回最後狀態
- **暗背景預覽**：避免透明棋盤背景干擾觀感
- **下載 zip 檔名用角色名命名**

## 🛠️ 技術棧

跟原版一樣（React 18 + Vite + Gemini API + Canvas API + JSZip），加上：
- **IndexedDB**：圖片儲存（避開 localStorage 5MB 配額）
- **localStorage**：production 持久化 fallback
- **gh-pages**：自動部署到 GitHub Pages

## 📁 多出來的檔案 / 結構

```
src/utils/
├── imageStore.js          # 🆕 IndexedDB 圖片儲存 + 本地檔案同步
├── localSync.js           # 🆕 localStorage / 本地 API server 雙模式同步
└── stickerSpecs.js        # 🆕 不同貼圖類型（一般 / 表情貼）規格定義

vite-plugin-local-save.js  # 🆕 dev mode 用的本地檔案同步 API server

local/                     # 🆕 dev mode 資料目錄（gitignore，nested git repo）
├── data/                  # 角色、描述、圖片
├── finances/              # 成本追蹤
├── plan.md
├── schedule.md
└── TODOs.md
```

## 📦 部署

```bash
npm install
npm run deploy   # 自動 build + push to gh-pages branch
```

## 📝 授權

MIT License（沿用原作者授權）

## 🙏 致謝

完整的基礎工具來自 [scorpioliu0953/line_sticker_create](https://github.com/scorpioliu0953/line_sticker_create)。這個 fork 保留原作者的所有功能，僅在其上做客製化擴充。
