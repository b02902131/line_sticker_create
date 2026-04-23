/**
 * 圖片處理工具函數 — re-export barrel
 * 保持向後相容：App.jsx 從這裡 import 不需要改動
 */

export * from './bgRemoval.js'
export * from './canvasUtils.js'

/**
 * 將文件轉換為 Data URL
 */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
