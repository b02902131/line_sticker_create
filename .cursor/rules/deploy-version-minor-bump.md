## Deploy 前版本號規範（必讀）

### Rule
- **每次 deploy 前，必須至少推進一個「小版號（minor）」**。
  - 版本號採 SemVer：`MAJOR.MINOR.PATCH`
  - 這條規則代表：deploy 不能只 bump patch（`x.y.(z+1)`），最少要 bump minor（`x.(y+1).0`）

### Scope（何時算 deploy）
- 任何會把成果發到可供外部使用的環境/連結的動作都算 deploy（例如 `npm run deploy`、release、production publish）。

### Where（版本號在哪裡）
- 以 `package.json` 的 `"version"` 為準。

### 操作建議
- **推薦**：`npm version minor`（會更新 `package.json` + 建 tag；若你不想要 tag，請改用你既有的版本流程，但仍需符合 minor bump）。

### Enforcement
- 若準備 deploy 時發現版本號沒有 minor bump，**停止 deploy**，先完成版本號推進再繼續。

