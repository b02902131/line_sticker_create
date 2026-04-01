# 上架內容規劃

此資料夾管理所有待上架的 LINE 貼圖組內容。

## 資料夾結構

每組貼圖一個資料夾，資料夾名稱為貼圖組代號（英文或拼音），內含：

```
stickers/
├── README.md                  # 本檔案
├── template.md                # 上架資訊模板
└── {sticker-set-name}/
    └── listing.md             # 該組貼圖的上架資訊
```

## 上架流程

1. 複製 `template.md` 到新資料夾，改名為 `listing.md`
2. 填寫貼圖組資訊
3. 用 StampMill 工具生成圖片
4. 上傳至 LINE Creators Market
