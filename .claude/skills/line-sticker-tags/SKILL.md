---
name: line-sticker-tags
description: 自動填寫 LINE Creators Market 貼圖標籤。前提：使用者已在 Chrome 開啟該貼圖的項目管理頁面。
argument-hint: [all | 貼圖編號如 03 | 範圍如 03-16]
---

自動為 LINE Creators Market 的貼圖填寫標籤（每張最多 9 個）。透過 osascript 操控 Chrome 分頁，結合 listing 資料智慧選標籤。

## 前提

使用者已在 Chrome 開啟 LINE Creators Market 的貼圖項目管理頁面（URL 類似 `https://creator.line.me/my/.../sticker/...`）。

## 步驟

### 1. 確認 Chrome 分頁

用 osascript 取得 Chrome active tab 的 URL，確認是 `creator.line.me` 的貼圖頁面。

### 2. 讀取 listing 資料

用 Glob 找 `stickers/*/listing.md`，讀取對應的 listing。從中擷取：
- 角色概念/描述
- 貼圖文字清單（每張的文字和情境/說明）
- 風格方向
- 主題

這些資料會在步驟 5b 用來判斷哪些標籤最適合每張貼圖。

如果找不到對應的 listing 或沒有貼圖文字清單，退回純推薦模式（選 LINE 推薦的前 9 個）。

### 3. 進入標籤編輯頁

如果 URL 不含 `#/tag`，嘗試導航到標籤頁面：在目前 URL 後加 `#/tag`。等頁面載入完成。

### 4. 取得貼圖列表與現有標籤

在標籤總覽頁面（`#/tag`），用 JavaScript 讀取所有 `.cm-product-images-taglist-row`，取得每張貼圖的編號和已有標籤數量。回報給使用者。

### 5. 決定要處理的貼圖

根據 `$ARGUMENTS`：
- `all`：處理所有標籤數 < 9 的貼圖
- 單一編號如 `03`：只處理該張
- 範圍如 `03-16`：處理範圍內標籤數 < 9 的
- 無參數：等同 `all`

### 6. 依序處理每張貼圖

對每張要處理的貼圖，按以下流程操作：

#### 6a. 從總覽頁點擊「編輯」按鈕

```javascript
// 找到對應編號的 row，點擊裡面的 a.mdBtn（編輯按鈕）
var rows = document.querySelectorAll('.cm-product-images-taglist-row');
// 找到 key === 目標編號 的 row，click 其 a.mdBtn
```

等待 2.5 秒讓編輯頁載入。

#### 6b. 讀取所有可選標籤（只讀，不選）

用 JavaScript 取回所有 `.cm-product-image-tag` 的文字和 checked 狀態：

```javascript
var tagLabels = document.querySelectorAll('.cm-product-image-tag');
var result = [];
for (var i = 0; i < tagLabels.length; i++) {
  var name = tagLabels[i].querySelector('.cm-product-image-tag-name-text');
  var cb = tagLabels[i].querySelector('input[type=checkbox]');
  if (name) result.push({ text: name.textContent.trim(), checked: cb && cb.checked, index: i });
}
// return JSON.stringify(result)
```

將結果帶回 Claude 分析。

#### 6c. Claude 智慧選標籤

根據以下資訊，從可選標籤中挑出最適合的 9 個（扣除已勾選的）：

**輸入資料：**
- 該張貼圖在 listing 中的文字（如「緩光迎」）
- 該張貼圖的情境/說明（如「鞠躬歡迎入場」）
- 角色概念和風格
- LINE 推薦的標籤列表（排序代表 LINE AI 認為的相關性）

**選擇邏輯：**
1. 優先選與貼圖文字/情境**直接語意相關**的標籤（如「歡迎」對應「鞠躬歡迎入場」）
2. 其次選與貼圖**情緒/動作相關**的標籤（如「開心」「鞠躬」）
3. 再次選 LINE 推薦排序靠前的標籤（LINE AI 根據圖片內容推薦）
4. 避免選明顯不相關的標籤（如季節、動物等與內容無關的分類）
5. 保留已勾選的標籤不動

輸出：要勾選的標籤 index 列表。

#### 6d. 執行勾選

用 osascript 執行 JavaScript，依照 Claude 決定的 index 列表勾選 checkbox：

```javascript
var tagLabels = document.querySelectorAll('.cm-product-image-tag');
var indices = [/* Claude 決定的 index 列表 */];
for (var i = 0; i < indices.length; i++) {
  var cb = tagLabels[indices[i]].querySelector('input[type=checkbox]');
  if (cb && !cb.checked) cb.click();
}
```

#### 6e. 等待自動儲存

等 1.5 秒，頁面會自動儲存（出現「已儲存」訊息）。

#### 6f. 點擊「返回」按鈕回到總覽

```javascript
var links = document.querySelectorAll('a');
for (var i = 0; i < links.length; i++) {
  if (links[i].textContent.trim() === '返回') { links[i].click(); break; }
}
```

等待 2 秒讓總覽頁重新載入。

**重要**：必須透過「返回」按鈕回到總覽頁，再點擊下一張的「編輯」。不能用 URL hash 切換，因為 SPA 的 checkbox 狀態不會重置。

### 7. 完成後回報

回到總覽頁，讀取所有貼圖的最終標籤數量，回報結果。格式：

```
01 (9): 標籤1, 標籤2, ...  ← 新增
02 (8): 標籤1, 標籤2, ...  (原有)
...
```

標出哪些有更動、哪些未滿 9 個。

## 注意事項

- 所有 DOM 操作都透過 `osascript` 執行 Chrome JavaScript
- 每個步驟之間需要 delay 等待頁面渲染（SPA 應用）
- 不要用 `window.location` 切換，要用頁面上的按鈕導航
- 如果某張貼圖已經有 9 個標籤，跳過不處理
- osascript 的 JavaScript 字串中用單引號避免與 osascript 的雙引號衝突
- 標籤列表中有時會有重複名稱的標籤（不同分類下），選一個即可
