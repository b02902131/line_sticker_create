/**
 * 背景移除工具函數
 */

/**
 * 將 Blob 轉換為 Data URL（內部使用）
 */
async function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * 使用 remove.bg API 進行去背（需要 API Key）
 * 注意：這是示例，實際使用需要替換為真實的 API
 * 或者使用其他去背服務
 */
export async function removeBackground(imageDataUrl, apiKey) {
  // 如果沒有 API Key，返回原圖
  if (!apiKey) {
    console.warn('沒有提供去背 API Key，跳過去背步驟')
    return imageDataUrl
  }

  try {
    // 將 Data URL 轉換為 Blob
    const response = await fetch(imageDataUrl)
    const blob = await response.blob()

    // 創建 FormData
    const formData = new FormData()
    formData.append('image_file', blob)

    // 調用 remove.bg API
    const removeBgResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey
      },
      body: formData
    })

    if (!removeBgResponse.ok) {
      throw new Error(`去背 API 錯誤: ${removeBgResponse.status}`)
    }

    const resultBlob = await removeBgResponse.blob()
    return await blobToDataURL(resultBlob)
  } catch (error) {
    console.error('去背失敗:', error)
    // 如果去背失敗，返回原圖
    return imageDataUrl
  }
}

/**
 * 使用 Canvas 進行智能去背（基於顏色閾值 + 邊緣檢測）
 * 優先從外圍開始去背，避免影響內部內容
 */
export async function removeBackgroundSimple(imageDataUrl, threshold = 240, maskData = null, opts = undefined) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')

      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const width = canvas.width
      const height = canvas.height

      const parseHexColor = (hex) => {
        if (!hex || typeof hex !== 'string') return null
        const s = hex.trim()
        const m = /^#([0-9a-fA-F]{6})$/.exec(s)
        if (!m) return null
        const v = m[1]
        return {
          r: parseInt(v.slice(0, 2), 16),
          g: parseInt(v.slice(2, 4), 16),
          b: parseInt(v.slice(4, 6), 16)
        }
      }

      // 背景色來源：
      // - 若提供 opts.bgColor（#RRGGBB）→ 強制使用該色作為 chroma-key 目標
      // - 否則自動偵測：取四個角落像素的平均色
      const forcedBg = parseHexColor(opts?.bgColor)
      let bgR = 0, bgG = 0, bgB = 0
      if (forcedBg) {
        bgR = forcedBg.r; bgG = forcedBg.g; bgB = forcedBg.b
      } else {
        const corners = [
          0, // top-left
          (width - 1) * 4, // top-right
          ((height - 1) * width) * 4, // bottom-left
          ((height - 1) * width + (width - 1)) * 4 // bottom-right
        ]
        for (const ci of corners) {
          bgR += data[ci]; bgG += data[ci + 1]; bgB += data[ci + 2]
        }
        bgR = Math.round(bgR / 4); bgG = Math.round(bgG / 4); bgB = Math.round(bgB / 4)
      }

      const bgAvg = (bgR + bgG + bgB) / 3

      // 判斷背景類型：
      // - 強制背景色 → 一律走色差模式（chroma-key）
      // - 否則：亮色（白色系）用亮度閾值，彩色（綠幕等）用色差閾值
      const isChromaKey = forcedBg ? true : (bgAvg < 200)
      const colorDistThreshold = threshold < 200 ? threshold : 80 // 色差容忍度

      const isBackground = (r, g, b) => {
        if (isChromaKey) {
          // 色差模式：與偵測到的背景色比較歐式距離
          const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2)
          return dist < colorDistThreshold
        } else {
          // 亮度模式（原始白色去背邏輯）
          return (r + g + b) / 3 > threshold
        }
      }

      // 創建標記陣列
      const toRemove = new Uint8Array(width * height)
      const visited = new Uint8Array(width * height)

      // 從邊緣開始檢測背景
      const queue = []

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
            const idx = (y * width + x) * 4
            if (isBackground(data[idx], data[idx + 1], data[idx + 2])) {
              queue.push({ x, y })
              toRemove[y * width + x] = 1
              visited[y * width + x] = 1
            }
          }
        }
      }

      // 從邊緣開始擴散，移除連通的背景區域
      while (queue.length > 0) {
        const { x, y } = queue.shift()

        const directions = [
          { dx: -1, dy: 0 },
          { dx: 1, dy: 0 },
          { dx: 0, dy: -1 },
          { dx: 0, dy: 1 }
        ]

        for (const { dx, dy } of directions) {
          const nx = x + dx
          const ny = y + dy

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = ny * width + nx

            if (!visited[idx]) {
              visited[idx] = 1

              const pixelIdx = (ny * width + nx) * 4
              if (isBackground(data[pixelIdx], data[pixelIdx + 1], data[pixelIdx + 2])) {
                toRemove[idx] = 1
                queue.push({ x: nx, y: ny })
              }
            }
          }
        }
      }

      // 應用顏色閾值去背結果
      for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % width
        const y = Math.floor((i / 4) / width)
        const idx = y * width + x

        if (toRemove[idx]) {
          data[i + 3] = 0 // 設為透明
        }
      }

      // 如果有遮罩數據，再應用遮罩（遮罩優先於顏色閾值）
      if (maskData) {
        for (let i = 0; i < data.length; i += 4) {
          const x = (i / 4) % width
          const y = Math.floor((i / 4) / width)
          const maskIndex = (y * width + x) * 4

          // 遮罩值：0 = 保護（保留，恢復不透明），128 = 未標記（使用顏色閾值結果），255 = 刪除（設為透明）
          const maskValue = maskData[maskIndex]

          if (maskValue === 255) {
            // 刪除模式：設為透明
            data[i + 3] = 0
          } else if (maskValue === 0) {
            // 保護模式：恢復為原始像素值（即使原本被顏色閾值去背）
            data[i] = originalData[i]         // R
            data[i + 1] = originalData[i + 1] // G
            data[i + 2] = originalData[i + 2] // B
            data[i + 3] = originalData[i + 3] // A（恢復原始透明度）
          }
          // maskValue === 128 時，保持顏色閾值的結果，不做改變
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }

    img.onerror = reject
    img.src = imageDataUrl
  })
}

/**
 * 從指定像素點開始 flood fill 去背
 * @param {string} imageDataUrl - 圖片 data URL
 * @param {number} startX - 起始 X 座標（原圖像素）
 * @param {number} startY - 起始 Y 座標（原圖像素）
 * @param {number} threshold - 顏色容差（與起始像素的 RGB 距離）
 * @returns {Promise<string>} 去背後的 data URL
 */
export async function removeBackgroundFromPoint(imageDataUrl, startX, startY, threshold = 30) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const width = canvas.width
      const height = canvas.height

      // 取得起始像素的顏色
      const sIdx = (startY * width + startX) * 4
      const sR = data[sIdx]
      const sG = data[sIdx + 1]
      const sB = data[sIdx + 2]

      const toRemove = new Uint8Array(width * height)
      const visited = new Uint8Array(width * height)

      const queue = [{ x: startX, y: startY }]
      toRemove[startY * width + startX] = 1
      visited[startY * width + startX] = 1

      while (queue.length > 0) {
        const { x, y } = queue.shift()
        const directions = [
          { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
          { dx: 0, dy: -1 }, { dx: 0, dy: 1 }
        ]
        for (const { dx, dy } of directions) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const idx = ny * width + nx
            if (!visited[idx]) {
              visited[idx] = 1
              const pIdx = idx * 4
              const r = data[pIdx]
              const g = data[pIdx + 1]
              const b = data[pIdx + 2]
              // 與起始像素的 RGB 距離
              const dist = Math.sqrt((r - sR) ** 2 + (g - sG) ** 2 + (b - sB) ** 2)
              if (dist <= threshold) {
                toRemove[idx] = 1
                queue.push({ x: nx, y: ny })
              }
            }
          }
        }
      }

      for (let i = 0; i < width * height; i++) {
        if (toRemove[i]) {
          data[i * 4 + 3] = 0
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }

    img.onerror = reject
    img.src = imageDataUrl
  })
}

/**
 * 在指定矩形範圍內，移除與指定顏色接近的所有像素
 * @param {string} imageDataUrl - 圖片 data URL
 * @param {{r: number, g: number, b: number}} color - 目標顏色
 * @param {number} threshold - 顏色容差（RGB 距離）
 * @param {{x: number, y: number, w: number, h: number}} rect - 範圍矩形
 * @returns {Promise<string>} 去背後的 data URL
 */
export async function removeBackgroundByColor(imageDataUrl, color, threshold, rect) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const width = canvas.width

      const x0 = Math.max(0, rect.x)
      const y0 = Math.max(0, rect.y)
      const x1 = Math.min(canvas.width, rect.x + rect.w)
      const y1 = Math.min(canvas.height, rect.y + rect.h)

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4
          const dist = Math.sqrt((data[i] - color.r) ** 2 + (data[i + 1] - color.g) ** 2 + (data[i + 2] - color.b) ** 2)
          if (dist <= threshold) {
            data[i + 3] = 0
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }

    img.onerror = reject
    img.src = imageDataUrl
  })
}

/**
 * 從圖片取得指定像素的 RGB 顏色
 */
export async function pickColorFromImage(imageDataUrl, x, y) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(x, y, 1, 1).data
      resolve({ r: data[0], g: data[1], b: data[2] })
    }
    img.onerror = reject
    img.src = imageDataUrl
  })
}

/**
 * 創建遮罩數據（用於塗抹工具）
 * @param {number} width - 圖片寬度
 * @param {number} height - 圖片高度
 * @returns {Uint8ClampedArray} 遮罩數據（RGBA格式，只使用alpha通道）
 */
export function createMaskData(width, height) {
  return new Uint8ClampedArray(width * height * 4)
}

/**
 * 在遮罩上繪製圓形（用於塗抹工具）
 * @param {Uint8ClampedArray} maskData - 遮罩數據
 * @param {number} width - 圖片寬度
 * @param {number} height - 圖片高度
 * @param {number} x - 圓心x座標
 * @param {number} y - 圓心y座標
 * @param {number} radius - 圓半徑
 * @param {number} value - 遮罩值（0=保護，255=刪除）
 */
export function drawCircleOnMask(maskData, width, height, x, y, radius, value) {
  const radiusSq = radius * radius

  for (let py = Math.max(0, y - radius); py <= Math.min(height - 1, y + radius); py++) {
    for (let px = Math.max(0, x - radius); px <= Math.min(width - 1, x + radius); px++) {
      const dx = px - x
      const dy = py - y
      const distSq = dx * dx + dy * dy

      if (distSq <= radiusSq) {
        const idx = (py * width + px) * 4
        maskData[idx] = value // R
        maskData[idx + 1] = value // G
        maskData[idx + 2] = value // B
        maskData[idx + 3] = 255 // A（完全不透明）
      }
    }
  }
}
