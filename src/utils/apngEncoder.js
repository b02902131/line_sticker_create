/**
 * Animated PNG (APNG) 製作工具
 * 純 JavaScript 實作，符合 LINE Creator 動態貼圖規格：
 *   - 格式：APNG
 *   - 尺寸：320×270 px
 *   - 最多 20 幀，最小幀延遲 0.05s
 *   - 最大檔案大小 300KB
 */

// ─── CRC32 表 ──────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[i] = c
  }
  return t
})()

function crc32(buf, offset = 0, length = buf.length - offset) {
  let crc = 0xFFFFFFFF
  for (let i = offset; i < offset + length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

// ─── Adler-32（DEFLATE チェックサム）──────────────────────────────────────────
function adler32(data) {
  let s1 = 1, s2 = 0
  for (let i = 0; i < data.length; i++) {
    s1 = (s1 + data[i]) % 65521
    s2 = (s2 + s1) % 65521
  }
  return (s2 << 16) | s1
}

// ─── 寫入工具 ─────────────────────────────────────────────────────────────────
function writeU32BE(arr, offset, val) {
  arr[offset]     = (val >>> 24) & 0xFF
  arr[offset + 1] = (val >>> 16) & 0xFF
  arr[offset + 2] = (val >>> 8)  & 0xFF
  arr[offset + 3] =  val         & 0xFF
}

function writeU16BE(arr, offset, val) {
  arr[offset]     = (val >>> 8) & 0xFF
  arr[offset + 1] =  val        & 0xFF
}

// ─── 建構 PNG chunk ────────────────────────────────────────────────────────────
function makeChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type)
  const len = data ? data.length : 0
  const chunk = new Uint8Array(4 + 4 + len + 4)

  writeU32BE(chunk, 0, len)
  chunk.set(typeBytes, 4)
  if (data) chunk.set(data, 8)

  // CRC 覆蓋 type + data
  const crc = crc32(chunk, 4, 4 + len)
  writeU32BE(chunk, 8 + len, crc)

  return chunk
}

// ─── 簡易 DEFLATE（store-only，level 0）──────────────────────────────────────
// 切成不超過 65535 bytes 的非壓縮 block
function deflateStore(data) {
  const BLOCK = 65535
  const blocks = Math.ceil(data.length / BLOCK) || 1
  // zlib header (CM=8, CINFO=7, FCHECK=1 → 0x78 0x01)
  const out = new Uint8Array(2 + blocks * 5 + data.length + 4)
  out[0] = 0x78
  out[1] = 0x01
  let pos = 2, dataPos = 0
  for (let b = 0; b < blocks; b++) {
    const start = dataPos
    const end = Math.min(start + BLOCK, data.length)
    const blen = end - start
    const last = end >= data.length ? 1 : 0
    out[pos++] = last        // BFINAL | BTYPE(00=store)
    out[pos++] =  blen        & 0xFF
    out[pos++] = (blen >> 8)  & 0xFF
    out[pos++] = (~blen)      & 0xFF
    out[pos++] = (~blen >> 8) & 0xFF
    out.set(data.subarray(start, end), pos)
    pos += blen
    dataPos = end
  }
  const a = adler32(data)
  out[pos++] = (a >>> 24) & 0xFF
  out[pos++] = (a >>> 16) & 0xFF
  out[pos++] = (a >>> 8)  & 0xFF
  out[pos++] =  a         & 0xFF
  return out.subarray(0, pos)
}

// ─── 過濾一行像素（使用 None 濾波，filter type 0）─────────────────────────────
function filterNone(imageData, width, height) {
  const src = imageData.data
  // 每行前置 1 byte filter type (0 = None)，後接 width * 4 bytes RGBA
  const out = new Uint8Array(height * (1 + width * 4))
  let pos = 0
  for (let y = 0; y < height; y++) {
    out[pos++] = 0  // filter type: None
    const rowOffset = y * width * 4
    out.set(src.subarray(rowOffset, rowOffset + width * 4), pos)
    pos += width * 4
  }
  return out
}

// ─── 建構 fcTL chunk（幀控制）─────────────────────────────────────────────────
// seq: sequence number (uint32)
// delay_num / delay_den: delay fraction (e.g. 80/100 = 0.8s)
function makeFctl(seq, width, height, delayNum, delayDen, disposeOp = 0, blendOp = 0) {
  const data = new Uint8Array(26)
  writeU32BE(data, 0, seq)           // sequence_number
  writeU32BE(data, 4, width)         // width
  writeU32BE(data, 8, height)        // height
  writeU32BE(data, 12, 0)            // x_offset
  writeU32BE(data, 16, 0)            // y_offset
  writeU16BE(data, 20, delayNum)     // delay_num
  writeU16BE(data, 22, delayDen)     // delay_den
  data[24] = disposeOp               // dispose_op (0=none, 1=background, 2=previous)
  data[25] = blendOp                 // blend_op  (0=source, 1=over)
  return makeChunk('fcTL', data)
}

// ─── 建構 fdAT chunk（後續幀資料）────────────────────────────────────────────
function makeFdat(seq, compressedData) {
  const data = new Uint8Array(4 + compressedData.length)
  writeU32BE(data, 0, seq)
  data.set(compressedData, 4)
  return makeChunk('fdAT', data)
}

// ─── 主要 API：多張 data URL → APNG Blob ─────────────────────────────────────
/**
 * 將多張貼圖 DataURL 合成為動態 APNG
 * @param {string[]} dataUrls - 各幀 PNG DataURL
 * @param {object} opts
 * @param {number} [opts.width=320]  - 輸出寬度（px）
 * @param {number} [opts.height=270] - 輸出高度（px）
 * @param {number} [opts.delay=80]   - 每幀延遲（1/100 秒，預設 80 = 0.8 秒）
 * @param {number} [opts.loop=0]     - 循環次數（0 = 無限循環）
 * @param {Function} [opts.onProgress] - 進度回呼 (done, total)
 * @returns {Promise<Blob>} APNG Blob（image/png）
 */
export async function createAnimatedApng(dataUrls, opts = {}) {
  const {
    width = 320,
    height = 270,
    delay = 80,
    loop = 0,
    onProgress = null
  } = opts

  if (!dataUrls || dataUrls.length === 0) {
    throw new Error('至少需要一張圖片才能製作動圖')
  }

  // LINE 規格：最多 20 幀
  const urls = dataUrls.slice(0, 20)
  const numFrames = urls.length

  // delay 單位 1/100 秒 → 分子/分母 (delay/100)
  // 最小延遲 0.05s → 最少 5/100
  const rawDelay = Math.max(delay, 5) // 確保 >= 5 (0.05s)
  const delayNum = rawDelay
  const delayDen = 100

  // ── 收集所有幀的 ImageData ──
  const framesImageData = []
  for (let i = 0; i < urls.length; i++) {
    const imgData = await loadImageData(urls[i], width, height)
    framesImageData.push(imgData)
    if (onProgress) onProgress(i + 1, urls.length)
  }

  // ── 開始建構 APNG 位元組 ──
  const parts = []

  // PNG Signature
  parts.push(new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))

  // IHDR
  const ihdrData = new Uint8Array(13)
  writeU32BE(ihdrData, 0, width)
  writeU32BE(ihdrData, 4, height)
  ihdrData[8] = 8   // bit depth
  ihdrData[9] = 6   // color type: RGBA
  ihdrData[10] = 0  // compression method
  ihdrData[11] = 0  // filter method
  ihdrData[12] = 0  // interlace method
  parts.push(makeChunk('IHDR', ihdrData))

  // acTL（Animation Control Chunk）
  const actlData = new Uint8Array(8)
  writeU32BE(actlData, 0, numFrames)
  writeU32BE(actlData, 4, loop)
  parts.push(makeChunk('acTL', actlData))

  // 幀序號計數器（fcTL 和 fdAT 共用）
  let seq = 0

  for (let i = 0; i < numFrames; i++) {
    const filtered = filterNone(framesImageData[i], width, height)
    const compressed = deflateStore(filtered)

    // fcTL
    // dispose_op=1 (APNG_DISPOSE_OP_BACKGROUND) 清空背景，保留透明
    // blend_op=0   (APNG_BLEND_OP_SOURCE) 直接替換
    parts.push(makeFctl(seq++, width, height, delayNum, delayDen, 1, 0))

    // 第一幀用 IDAT，後續用 fdAT
    if (i === 0) {
      parts.push(makeChunk('IDAT', compressed))
    } else {
      parts.push(makeFdat(seq++, compressed))
    }
  }

  // IEND
  parts.push(makeChunk('IEND', null))

  // 合併所有部分
  const totalLen = parts.reduce((s, p) => s + p.length, 0)
  const result = new Uint8Array(totalLen)
  let pos = 0
  for (const p of parts) {
    result.set(p, pos)
    pos += p.length
  }

  return new Blob([result], { type: 'image/png' })
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
