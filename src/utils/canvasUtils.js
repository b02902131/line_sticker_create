/**
 * Canvas / 圖片操作工具函數
 */

import { removeBackgroundSimple } from './bgRemoval.js'

/**
 * 生成 8 宮格圖片（2x4 布局）
 * @param {Array} images - 8 張圖片（Data URL 或 Image 對象）
 * @param {number} cellWidth - 每格寬度
 * @param {number} cellHeight - 每格高度
 * @returns {Promise<string>} 8 宮格圖片的 Data URL
 */
export async function createGrid8(images, cellWidth = 370, cellHeight = 320) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = cellWidth * 2 // 2 列
    canvas.height = cellHeight * 4 // 4 行
    const ctx = canvas.getContext('2d')

    // 填充白色背景
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    let loadedCount = 0
    const totalImages = Math.min(images.length, 8)

    if (totalImages === 0) {
      reject(new Error('沒有圖片可生成'))
      return
    }

    images.forEach((imageData, index) => {
      if (index >= 8) return

      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        // 計算位置：2列4行
        const col = index % 2
        const row = Math.floor(index / 2)
        const x = col * cellWidth
        const y = row * cellHeight

        // 繪製圖片（居中並縮放）
        const scale = Math.min(cellWidth / img.width, cellHeight / img.height)
        const scaledWidth = img.width * scale
        const scaledHeight = img.height * scale
        const offsetX = x + (cellWidth - scaledWidth) / 2
        const offsetY = y + (cellHeight - scaledHeight) / 2

        ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight)

        loadedCount++
        if (loadedCount === totalImages) {
          resolve(canvas.toDataURL('image/png'))
        }
      }

      img.onerror = () => {
        loadedCount++
        if (loadedCount === totalImages) {
          resolve(canvas.toDataURL('image/png'))
        }
      }

      img.src = imageData
    })
  })
}

/**
 * 移除 8 宮格圖片中的間隔線（垂直和水平線）
 * @param {string} gridImageDataUrl - 8 宮格圖片的 Data URL
 * @param {number} cellWidth - 每格寬度
 * @param {number} cellHeight - 每格高度
 * @returns {Promise<string>} 移除間隔線後的圖片 Data URL
 */
export async function removeGridLines(gridImageDataUrl, cellWidth = 370, cellHeight = 320) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      const expectedWidth = cellWidth * 2  // 740
      const expectedHeight = cellHeight * 4 // 1280

      // 如果尺寸不準確，先調整
      let sourceImg = img
      let sourceCanvas = null

      if (img.width !== expectedWidth || img.height !== expectedHeight) {
        sourceCanvas = document.createElement('canvas')
        sourceCanvas.width = expectedWidth
        sourceCanvas.height = expectedHeight
        const sourceCtx = sourceCanvas.getContext('2d')
        sourceCtx.drawImage(img, 0, 0, expectedWidth, expectedHeight)
        sourceImg = sourceCanvas
      }

      const canvas = document.createElement('canvas')
      canvas.width = expectedWidth
      canvas.height = expectedHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(sourceImg, 0, 0)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data
      const width = canvas.width
      const height = canvas.height

      // 定義間隔線位置
      const verticalLineX = cellWidth // 370 (兩列之間)
      const horizontalLinesY = [
        cellHeight,    // 320 (第1-2行之間)
        cellHeight * 2, // 640 (第2-3行之間)
        cellHeight * 3  // 960 (第3-4行之間)
      ]

      // 獲取背景色估計值（取四個角落的平均值）
      // 假設背景是純色且佔據角落
      const corners = [
        0,
        (width - 1) * 4,
        ((height - 1) * width) * 4,
        (height * width - 1) * 4
      ];
      let bgR = 0, bgG = 0, bgB = 0;
      corners.forEach(idx => {
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
      });
      bgR = Math.round(bgR / 4);
      bgG = Math.round(bgG / 4);
      bgB = Math.round(bgB / 4);

      // 判斷是否為淺色背景（通常是白色）
      const isLightBg = (bgR + bgG + bgB) / 3 > 200;

      // 處理兩次以確保完全移除間隔線
      for (let pass = 0; pass < 2; pass++) {
        // 檢測並移除垂直線（在 x=370 附近，擴大檢測範圍）
        const verticalLineWidth = 11 // 擴大檢測範圍：x=365 到 x=375 (±5 像素)
        for (let y = 0; y < height; y++) {
          for (let offset = -Math.floor(verticalLineWidth / 2); offset <= Math.floor(verticalLineWidth / 2); offset++) {
            const x = verticalLineX + offset
            if (x >= 0 && x < width) {
              const idx = (y * width + x) * 4

              // 策略 1: 激進去除明顯的深色線條（僅在淺色背景下且位於中心區域）
              if (isLightBg && Math.abs(offset) <= 3) {
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                // 如果像素明顯比背景暗（例如黑色線條）
                if ((r + g + b) / 3 < 200) {
                   // 強制替換為背景色
                   data[idx] = bgR;
                   data[idx + 1] = bgG;
                   data[idx + 2] = bgB;
                   continue; // 已處理，跳過後續邏輯
                }
              }

              // 策略 2: 檢查並平滑邊緣（原有的邏輯，針對顏色差異）
              const leftX = Math.max(0, x - 5)
              const rightX = Math.min(width - 1, x + 5)
              const leftIdx = (y * width + leftX) * 4
              const rightIdx = (y * width + rightX) * 4

              const currentAvg = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
              const leftAvg = (data[leftIdx] + data[leftIdx + 1] + data[leftIdx + 2]) / 3
              const rightAvg = (data[rightIdx] + data[rightIdx + 1] + data[rightIdx + 2]) / 3

              // 如果當前像素與左右差異大
              if (Math.abs(currentAvg - leftAvg) > 15 || Math.abs(currentAvg - rightAvg) > 15) {
                // 使用左右像素的加權平均值
                const leftDist = Math.abs(x - leftX)
                const rightDist = Math.abs(x - rightX)
                const totalDist = leftDist + rightDist
                const leftWeight = totalDist > 0 ? rightDist / totalDist : 0.5
                const rightWeight = totalDist > 0 ? leftDist / totalDist : 0.5

                const avgR = data[leftIdx] * leftWeight + data[rightIdx] * rightWeight
                const avgG = data[leftIdx + 1] * leftWeight + data[rightIdx + 1] * rightWeight
                const avgB = data[leftIdx + 2] * leftWeight + data[rightIdx + 2] * rightWeight

                data[idx] = Math.round(avgR)
                data[idx + 1] = Math.round(avgG)
                data[idx + 2] = Math.round(avgB)
              }
            }
          }
        }

        // 檢測並移除水平線（在 y=320, 640, 960 附近，擴大檢測範圍）
        const horizontalLineHeight = 11 // 擴大檢測範圍：±5 像素
        for (const lineY of horizontalLinesY) {
          for (let offset = -Math.floor(horizontalLineHeight / 2); offset <= Math.floor(horizontalLineHeight / 2); offset++) {
            const y = lineY + offset
            if (y >= 0 && y < height) {
              for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4

                // 策略 1: 激進去除明顯的深色線條（僅在淺色背景下且位於中心區域）
                if (isLightBg && Math.abs(offset) <= 3) {
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    if ((r + g + b) / 3 < 200) {
                       data[idx] = bgR;
                       data[idx + 1] = bgG;
                       data[idx + 2] = bgB;
                       continue;
                    }
                }

                // 策略 2: 平滑處理
                const topY = Math.max(0, y - 5)
                const bottomY = Math.min(height - 1, y + 5)
                const topIdx = (topY * width + x) * 4
                const bottomIdx = (bottomY * width + x) * 4

                const currentAvg = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
                const topAvg = (data[topIdx] + data[topIdx + 1] + data[topIdx + 2]) / 3
                const bottomAvg = (data[bottomIdx] + data[bottomIdx + 1] + data[bottomIdx + 2]) / 3

                if (Math.abs(currentAvg - topAvg) > 15 || Math.abs(currentAvg - bottomAvg) > 15) {
                  const topDist = Math.abs(y - topY)
                  const bottomDist = Math.abs(y - bottomY)
                  const totalDist = topDist + bottomDist
                  const topWeight = totalDist > 0 ? bottomDist / totalDist : 0.5
                  const bottomWeight = totalDist > 0 ? topDist / totalDist : 0.5

                  const avgR = data[topIdx] * topWeight + data[bottomIdx] * bottomWeight
                  const avgG = data[topIdx + 1] * topWeight + data[bottomIdx + 1] * bottomWeight
                  const avgB = data[topIdx + 2] * topWeight + data[bottomIdx + 2] * bottomWeight

                  data[idx] = Math.round(avgR)
                  data[idx + 1] = Math.round(avgG)
                  data[idx + 2] = Math.round(avgB)
                }
              }
            }
          }
        }

        // 更新 imageData 以便第二次處理
        if (pass === 0) {
          ctx.putImageData(imageData, 0, 0)
          const newImageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          // 更新 data 引用
          for (let i = 0; i < data.length; i++) {
            data[i] = newImageData.data[i]
          }
        }
      }

      ctx.putImageData(imageData, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }

    img.onerror = reject
    img.src = gridImageDataUrl
  })
}

/**
 * 裁切 8 宮格圖片為單獨的圖片
 * @param {string} gridImageDataUrl - 8 宮格圖片的 Data URL
 * @param {number} cellWidth - 每格寬度
 * @param {number} cellHeight - 每格高度
 * @returns {Promise<Array<string>>} 裁切後的圖片陣列（Data URL）
 */
export async function splitGrid8(gridImageDataUrl, cellWidth = 370, cellHeight = 320, outputCellWidth = null, outputCellHeight = null) {
  // outputCell* 為空時，產出尺寸 = 來源 cell 尺寸（無 downscale）
  // 若有指定，會把每格從 cellWidth×cellHeight 縮放成 outputCellWidth×outputCellHeight（用於表情貼 2× 超採樣）
  const outW = outputCellWidth || cellWidth
  const outH = outputCellHeight || cellHeight
  return new Promise(async (resolve, reject) => {
    try {
      // 先移除間隔線
      const cleanedImageDataUrl = await removeGridLines(gridImageDataUrl, cellWidth, cellHeight)

      const img = new Image()
      img.crossOrigin = 'anonymous'

      img.onload = () => {
        const expectedWidth = cellWidth * 2
        const expectedHeight = cellHeight * 4

        let sourceImg = img
        let sourceCanvas = null

        if (img.width !== expectedWidth || img.height !== expectedHeight) {
          console.warn(`8宮格圖片尺寸不準確: ${img.width}×${img.height}, 預期: ${expectedWidth}×${expectedHeight}, 將調整為標準尺寸`)
          sourceCanvas = document.createElement('canvas')
          sourceCanvas.width = expectedWidth
          sourceCanvas.height = expectedHeight
          const sourceCtx = sourceCanvas.getContext('2d')
          sourceCtx.drawImage(img, 0, 0, expectedWidth, expectedHeight)
          sourceImg = sourceCanvas
        }

      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')

      const cells = []

      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 2; col++) {
          const x = col * cellWidth
          const y = row * cellHeight

          ctx.clearRect(0, 0, outW, outH)

          // 從來源 cellWidth×cellHeight 縮放繪製到 outW×outH
          ctx.drawImage(
            sourceImg,
            x, y, cellWidth, cellHeight,
            0, 0, outW, outH
          )

          cells.push(canvas.toDataURL('image/png'))
        }
      }

      resolve(cells)
      }

      img.onerror = reject
      img.src = cleanedImageDataUrl
    } catch (error) {
      reject(error)
    }
  })
}

/**
 * 從 8 宮格圖片裁切單一格，支援自訂偏移量
 * @param {string} gridImageDataUrl - 8 宮格圖片 Data URL
 * @param {number} cellRow - 第幾行（0-3）
 * @param {number} cellCol - 第幾列（0-1）
 * @param {number} cellWidth - 來源格子寬
 * @param {number} cellHeight - 來源格子高
 * @param {number} outputWidth - 輸出寬
 * @param {number} outputHeight - 輸出高
 * @param {number} offsetX - X 偏移（像素）
 * @param {number} offsetY - Y 偏移（像素）
 * @returns {Promise<string>} 裁切後的圖片 Data URL
 */
export async function cropSingleCell(gridImageDataUrl, cellRow, cellCol, cellWidth, cellHeight, outputWidth, outputHeight, offsetX = 0, offsetY = 0, zoom = 1) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const expectedW = cellWidth * 2
      const expectedH = cellHeight * 4
      const scaleX = img.width / expectedW
      const scaleY = img.height / expectedH
      const baseCellW = cellWidth * scaleX
      const baseCellH = cellHeight * scaleY
      // zoom: 裁切區域大小 = baseCellW * zoom
      const cropW = baseCellW * zoom
      const cropH = baseCellH * zoom
      // 中心點
      const centerX = cellCol * baseCellW + baseCellW / 2 + offsetX * scaleX
      const centerY = cellRow * baseCellH + baseCellH / 2 + offsetY * scaleY
      const srcX = centerX - cropW / 2
      const srcY = centerY - cropH / 2

      const canvas = document.createElement('canvas')
      canvas.width = outputWidth
      canvas.height = outputHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, srcX, srcY, cropW, cropH, 0, 0, outputWidth, outputHeight)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = gridImageDataUrl
  })
}

/**
 * 從角色圖裁切去背生成 tab 圖片（96x74）
 * 居中裁切為 4:3 橫向比例，去背後縮放至 96x74
 */
export async function createTabFromCharacter(characterDataUrl, threshold = 240) {
  // 先去背
  const removed = await removeBackgroundSimple(characterDataUrl, threshold)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const { width, height } = img
      // 找出非透明的 bounding box
      const tmpCanvas = document.createElement('canvas')
      tmpCanvas.width = width
      tmpCanvas.height = height
      const tmpCtx = tmpCanvas.getContext('2d')
      tmpCtx.drawImage(img, 0, 0)
      const imageData = tmpCtx.getImageData(0, 0, width, height)
      const { data } = imageData

      let minX = width, minY = height, maxX = 0, maxY = 0
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] > 10) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }

      if (maxX <= minX || maxY <= minY) {
        minX = 0; minY = 0; maxX = width - 1; maxY = height - 1
      }

      // 裁切出內容區域
      const contentW = maxX - minX + 1
      const contentH = maxY - minY + 1

      // 等比縮放到 96x74 框內（contain），不變形
      const scale = Math.min(96 / contentW, 74 / contentH)
      const drawW = Math.round(contentW * scale)
      const drawH = Math.round(contentH * scale)
      const drawX = Math.round((96 - drawW) / 2)
      const drawY = Math.round((74 - drawH) / 2)

      const canvas = document.createElement('canvas')
      canvas.width = 96
      canvas.height = 74
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, 96, 74)
      ctx.drawImage(img, minX, minY, contentW, contentH, drawX, drawY, drawW, drawH)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = removed
  })
}

/**
 * 調整圖片尺寸
 * @param {string} dataUrl - 圖片 Data URL
 * @param {number} targetWidth - 目標寬度
 * @param {number} targetHeight - 目標高度
 * @returns {Promise<string>} 調整後的圖片 Data URL
 */
export async function resizeImage(dataUrl, targetWidth, targetHeight) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // 如果尺寸已經符合，直接返回
      if (img.width === targetWidth && img.height === targetHeight) {
        resolve(dataUrl)
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')

      // 清空畫布
      ctx.clearRect(0, 0, targetWidth, targetHeight)

      // 繪製並縮放圖片
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}
