// LINE 貼圖 / 表情貼 規格
// - sticker: 一般貼圖（370×320 長方形）
// - emoji: 表情貼（180×180 正方形，採 2× 超採樣生成）

export const STICKER_SPECS = {
  sticker: {
    key: 'sticker',
    label: '一般貼圖',
    main: { w: 240, h: 240 },
    tab: { w: 96, h: 74 },
    cell: { w: 370, h: 320 },         // 最終單張尺寸
    generateCell: { w: 370, h: 320 }, // Gemini 生成時的單格（同尺寸）
    grid: { w: 740, h: 1280 },         // Gemini 生成的 8 宮格整張
    counts: [8, 16, 24, 32, 40],
    hasTab: true,
    hasMain: true,
  },
  emoji: {
    key: 'emoji',
    label: '表情貼',
    main: null,                         // 表情貼不需要主要圖片
    tab: { w: 96, h: 74 },              // 表情貼仍需要 tab 圖
    cell: { w: 180, h: 180 },           // 最終單張尺寸（LINE 表情貼規格）
    generateCell: { w: 360, h: 360 },   // 2× 超採樣
    grid: { w: 720, h: 1440 },           // 2 列 × 4 行 × 360
    counts: [8, 16, 24, 32, 40],
    hasTab: true,
    hasMain: false,
  },

}

export const DEFAULT_SPEC_KEY = 'sticker'

export function getSpec(key) {
  return STICKER_SPECS[key] || STICKER_SPECS[DEFAULT_SPEC_KEY]
}
