backlogs

## 待辦

### 0424

- [] 1. 宮格圖要可以像之前一樣全部裁切一起編輯

### 0423
- [] 2. 驗收 gpt-image-2 串接：測試 OpenAI engine 生圖流程完整可用
- [] 3. 驗收動圖功能：測試 GIF 製作 modal、幀選擇、速度調整、下載

---

## done

### 0424
- [x] 實作 Import Pipeline：`splitGridNxM` 泛化 + `ImportPipelinePage` + App 路由接上
  - `canvasUtils.js`：新增 `splitGridNxM(url, cols, rows, cellW, cellH)` 通用版；`splitGrid8` 保持不變；`cropSingleCell` 加 `cols`/`rows` 參數（預設 2/4 向後相容）
  - `CropAdjustPanel`：加 `cols`/`rows` props（預設 2/4）供 NxM grid 使用
  - 新建 `src/hooks/useImportedGridEditor.js`：管理上傳宮格圖分割/去背/裁切微調/排除格子狀態
  - 新建 `src/pages/ImportPipelinePage.jsx`：完整匯入產線 UI（5 個 section：上傳/去背設定/格子選擇/主tab圖/預覽下載）
  - `App.jsx`：加 `import-pipeline` 路由 + HomePage 新增「匯入產線」按鈕
- [x] 規劃新製作產線：外部 app 產 16 宮圖 → web tool 去背/分割 → 主圖/tab 圖（匯入或生成）→ 單圖微調 → zip
  - 規劃寫入 local/PIPELINE_PLAN.md；Import Pipeline 與 AI Full Pipeline 分開 page，大量共用 utils/hooks/components
  - 解耦優先順序：Priority 1 完成 JSX page split（CharacterCreatePage + HomePage），Priority 2 抽 splitGridNxM，Priority 3 新建 ImportPipelinePage + useImportedGridEditor
  - Token 成本：現行 full pipeline 40 張 ~$0.30–0.45 USD；Import pipeline 可降至 $0（不用 AI 生主圖/tab）

### 0423
- [x] 研究評估串接 gpt-image-2，研究 api 跟訂閱是否分開，評估費用
- [x] 5月初 研究串接 gpt-image-2 api

### 0422
- [x] 增加製作動圖功能

### 0416
- [x] 檢查：單張重產好像都沒有在 prompt 裡面吃文字樣式敘述
- [x] 單張圖下載，要跟 zip 內的檔名尺寸格式都符合
