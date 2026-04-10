/**
 * 圖片處理工具函數
 */

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
export async function removeBackgroundSimple(imageDataUrl, threshold = 240, maskData = null) {
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

      // 自動偵測背景色：取四個角落像素的平均色
      const corners = [
        0, // top-left
        (width - 1) * 4, // top-right
        ((height - 1) * width) * 4, // bottom-left
        ((height - 1) * width + (width - 1)) * 4 // bottom-right
      ]
      let bgR = 0, bgG = 0, bgB = 0
      for (const ci of corners) {
        bgR += data[ci]; bgG += data[ci + 1]; bgB += data[ci + 2]
      }
      bgR = Math.round(bgR / 4); bgG = Math.round(bgG / 4); bgB = Math.round(bgB / 4)
      const bgAvg = (bgR + bgG + bgB) / 3

      // 判斷背景類型：亮色（白色系）用亮度閾值，彩色（綠幕等）用色差閾值
      const isChromaKey = bgAvg < 200 // 非白色背景 → 用色差模式
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
      
      // 舊的邏輯（已移除）
      if (false) {
        // 沒有遮罩時，使用邊緣檢測 + 顏色閾值
        // 創建一個標記陣列，標記哪些像素應該被移除
        const toRemove = new Uint8Array(width * height)
        const visited = new Uint8Array(width * height)
        
        // 從邊緣開始檢測白色背景
        const queue = []
        
        // 將邊緣的白色像素加入隊列
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
              const idx = (y * width + x) * 4
              const r = data[idx]
              const g = data[idx + 1]
              const b = data[idx + 2]
              const avg = (r + g + b) / 3
              
              if (avg > threshold) {
                queue.push({ x, y })
                toRemove[y * width + x] = 1
                visited[y * width + x] = 1
              }
            }
          }
        }
        
        // 從邊緣開始擴散，移除連通的白色區域
        while (queue.length > 0) {
          const { x, y } = queue.shift()
          
          // 檢查四個方向的鄰居
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
                const r = data[pixelIdx]
                const g = data[pixelIdx + 1]
                const b = data[pixelIdx + 2]
                const avg = (r + g + b) / 3
                
                if (avg > threshold) {
                  toRemove[idx] = 1
                  queue.push({ x: nx, y: ny })
                }
              }
            }
          }
        }
        
        // 應用移除標記
        for (let i = 0; i < data.length; i += 4) {
          const x = (i / 4) % width
          const y = Math.floor((i / 4) / width)
          const idx = y * width + x
          
          if (toRemove[idx]) {
            data[i + 3] = 0 // 設為透明
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

/**
 * 將 Blob 轉換為 Data URL
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

/**
 * 調整圖片尺寸
 * @param {string} dataUrl - 圖片 Data URL
 * @param {number} targetWidth - 目標寬度
 * @param {number} targetHeight - 目標高度
 * @returns {Promise<string>} 調整後的圖片 Data URL
 */
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
