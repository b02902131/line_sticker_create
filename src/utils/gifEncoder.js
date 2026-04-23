/**
 * Animated GIF 製作工具
 * 使用純 JavaScript 將多張 PNG 幀合成動圖
 *
 * GIF 規格實作（LZW 壓縮 + 256 色量化）
 */

// ─── 顏色量化（median-cut 簡化版：取 256 個最常見色）─────────────────────────
function quantize(imageData, numColors = 256) {
  const data = imageData.data
  const colorMap = new Map()

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 128) continue // 忽略透明像素
    // 量化到 6-bit（每通道 64 個色階）以減少色彩空間
    const r = data[i] >> 2
    const g = data[i + 1] >> 2
    const b = data[i + 2] >> 2
    const key = (r << 12) | (g << 6) | b
    colorMap.set(key, (colorMap.get(key) || 0) + 1)
  }

  // 依頻率排序，取前 numColors-1 個（最後一個留給透明色）
  const sorted = [...colorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, numColors - 1)

  // 還原為 [r, g, b] 陣列
  const palette = sorted.map(([key]) => [
    ((key >> 12) & 0x3F) << 2,
    ((key >> 6) & 0x3F) << 2,
    (key & 0x3F) << 2
  ])

  // 補足到 numColors（透明色用黑色佔位，index 0）
  while (palette.length < numColors) palette.push([0, 0, 0])

  return palette
}

// ─── 最近色查找（歐式距離）─────────────────────────────────────────────────────
function nearestColor(r, g, b, palette) {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < palette.length; i++) {
    const pr = palette[i][0], pg = palette[i][1], pb = palette[i][2]
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = i
      if (dist === 0) break
    }
  }
  return best
}

// ─── 像素到調色板索引 ─────────────────────────────────────────────────────────
function mapPixels(imageData, palette, transparentIndex) {
  const data = imageData.data
  const width = imageData.width
  const height = imageData.height
  const indices = new Uint8Array(width * height)

  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]
    const g = data[i * 4 + 1]
    const b = data[i * 4 + 2]
    const a = data[i * 4 + 3]
    if (a < 128) {
      indices[i] = transparentIndex
    } else {
      indices[i] = nearestColor(r, g, b, palette)
    }
  }
  return indices
}

// ─── LZW 壓縮 ─────────────────────────────────────────────────────────────────
function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize
  const eofCode = clearCode + 1
  let nextCode = eofCode + 1
  let codeSize = minCodeSize + 1
  let maxCode = 1 << codeSize

  // 字典用 Map<string, number>
  const dict = new Map()
  const initDict = () => {
    dict.clear()
    for (let i = 0; i < clearCode; i++) dict.set(String(i), i)
    nextCode = eofCode + 1
    codeSize = minCodeSize + 1
    maxCode = 1 << codeSize
  }
  initDict()

  // 位元包裝輸出
  const output = []
  let bitBuf = 0
  let bitLen = 0
  const writeBits = (code) => {
    bitBuf |= code << bitLen
    bitLen += codeSize
    while (bitLen >= 8) {
      output.push(bitBuf & 0xFF)
      bitBuf >>= 8
      bitLen -= 8
    }
  }
  const flush = () => {
    if (bitLen > 0) {
      output.push(bitBuf & 0xFF)
      bitBuf = 0
      bitLen = 0
    }
  }

  writeBits(clearCode)
  let buf = String(indices[0])

  for (let i = 1; i < indices.length; i++) {
    const c = String(indices[i])
    const bc = buf + ',' + c
    if (dict.has(bc)) {
      buf = bc
    } else {
      writeBits(dict.get(buf))
      if (nextCode < 4096) {
        dict.set(bc, nextCode++)
        if (nextCode > maxCode && codeSize < 12) {
          codeSize++
          maxCode = 1 << codeSize
        }
      } else {
        writeBits(clearCode)
        initDict()
      }
      buf = c
    }
  }
  writeBits(dict.get(buf))
  writeBits(eofCode)
  flush()
  return output
}

// ─── GIF 位元組建構工具 ────────────────────────────────────────────────────────
function byte(n) { return [n & 0xFF] }
function word(n) { return [n & 0xFF, (n >> 8) & 0xFF] }

function buildGIF(frames, { width, height, delay = 10, loop = 0 }) {
  // delay 單位：1/100 秒
  const bytes = []
  const push = (arr) => arr.forEach(b => bytes.push(b))

  // ── Header ──
  push([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]) // "GIF89a"

  // ── Logical Screen Descriptor ──
  push(word(width))
  push(word(height))
  push([0x70]) // Global Color Table Flag=0（我們用 Local Color Table）
  push([0x00]) // Background Color Index
  push([0x00]) // Pixel Aspect Ratio

  // ── 假全域調色板（最小 2 色黑白，因為 Global Color Table Flag bit = 0 這裡實際不需要）──
  // 沒帶全域調色板（bit 7 of packed = 0）

  // ── Application Extension（Netscape looping）──
  push([0x21, 0xFF, 0x0B]) // Extension + App Label size
  push([0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30]) // "NETSCAPE2.0"
  push([0x03, 0x01]) // sub-block size, sub-block id
  push(word(loop))   // loop count (0 = forever)
  push([0x00])       // block terminator

  for (const frame of frames) {
    const { palette, indices, transparentIndex } = frame

    // ── Graphic Control Extension ──
    push([0x21, 0xF9, 0x04])
    const hasTransp = transparentIndex !== null && transparentIndex !== undefined
    const disposalMethod = hasTransp ? 2 : 0 // 2 = restore to background
    const packed = (disposalMethod << 2) | (hasTransp ? 0x01 : 0x00)
    push([packed])
    push(word(delay))
    push([hasTransp ? transparentIndex : 0]) // transparent color index
    push([0x00]) // block terminator

    // ── Image Descriptor ──
    push([0x2C])
    push(word(0)) // left
    push(word(0)) // top
    push(word(width))
    push(word(height))
    // Local Color Table Flag=1, size = log2(256)-1 = 7
    push([0x80 | 0x07])

    // ── Local Color Table ──
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = palette[i] || [0, 0, 0]
      push([r, g, b])
    }

    // ── Image Data ──
    const minCodeSize = 8
    push([minCodeSize])
    const lzwData = lzwEncode(indices, minCodeSize)
    // 分成 255 位元組的子塊
    let offset = 0
    while (offset < lzwData.length) {
      const subLen = Math.min(255, lzwData.length - offset)
      push([subLen])
      for (let i = 0; i < subLen; i++) push([lzwData[offset + i]])
      offset += subLen
    }
    push([0x00]) // block terminator
  }

  // ── GIF Trailer ──
  push([0x3B])

  return new Uint8Array(bytes)
}

// ─── Canvas ImageData 轉幀 ─────────────────────────────────────────────────────
function imageDataToFrame(imageData, transparentBg = true) {
  const palette = quantize(imageData, 255) // 255 色 + 1 透明佔位
  const transparentIndex = transparentBg ? 255 : null
  if (transparentBg) palette[255] = [0, 0, 0] // 透明色的 RGB 佔位

  const indices = mapPixels(imageData, palette, transparentIndex)
  return { palette, indices, transparentIndex }
}

// ─── 主要 API：多張 data URL → animated GIF Blob ───────────────────────────────
/**
 * 將多張貼圖 DataURL 合成為動圖 GIF
 * @param {string[]} dataUrls - 各幀 PNG DataURL
 * @param {object} opts
 * @param {number} [opts.width=370] - 輸出寬度（px）
 * @param {number} [opts.height=320] - 輸出高度（px）
 * @param {number} [opts.delay=80] - 每幀延遲（1/100 秒，預設 80 = 0.8 秒）
 * @param {number} [opts.loop=0] - 循環次數（0 = 無限循環）
 * @param {boolean} [opts.transparentBg=true] - 是否保留透明背景
 * @param {Function} [opts.onProgress] - 進度回呼 (done, total)
 * @returns {Promise<Blob>} 動圖 GIF Blob
 */
export async function createAnimatedGif(dataUrls, opts = {}) {
  const {
    width = 370,
    height = 320,
    delay = 80,
    loop = 0,
    transparentBg = true,
    onProgress = null
  } = opts

  if (!dataUrls || dataUrls.length === 0) {
    throw new Error('至少需要一張圖片才能製作動圖')
  }

  const frames = []
  for (let i = 0; i < dataUrls.length; i++) {
    const imageData = await loadImageData(dataUrls[i], width, height)
    frames.push(imageDataToFrame(imageData, transparentBg))
    if (onProgress) onProgress(i + 1, dataUrls.length)
  }

  const gifBytes = buildGIF(frames, { width, height, delay, loop })
  return new Blob([gifBytes], { type: 'image/gif' })
}

// ─── 輔助：DataURL → Canvas ImageData ─────────────────────────────────────────
function loadImageData(dataUrl, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, width, height)
      // 縮放置中
      const scale = Math.min(width / img.width, height / img.height)
      const sw = img.width * scale
      const sh = img.height * scale
      const sx = (width - sw) / 2
      const sy = (height - sh) / 2
      ctx.drawImage(img, sx, sy, sw, sh)
      resolve(ctx.getImageData(0, 0, width, height))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}
