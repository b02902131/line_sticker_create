/**
 * gpt-image-2 圖片生成工具
 *
 * text-to-image: POST /v1/images/generations, model: gpt-image-2
 * image input:   POST /v1/images/edits, model: gpt-image-2 (multipart/form-data)
 * 回傳 base64 PNG。
 *
 * 參數說明：
 *   quality: "low" | "medium" | "high"  （預設 "medium"）
 *   size:    gpt-image-2 支援任意 WxH（16 的倍數），宮格 / 單張貼圖用 pickOpenAISize() 取跟目標同比例的尺寸；
 *            被拒時退回最接近的 1024x1024 / 1536x1024 / 1024x1536
 *
 * 錯誤：一律丟 OpenAIImageError（中文訊息），retryable=false 表示 Key 無效 / 額度不足 /
 * 內容政策 / 組織未驗證等「重試也沒用」的錯誤，自動重試迴圈遇到要直接停。
 */

const OPENAI_GENERATIONS_ENDPOINT = 'https://api.openai.com/v1/images/generations'
const OPENAI_EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits'
const OPENAI_MODEL = 'gpt-image-2'
const OPENAI_TIMEOUT_MS = 300000 // high 品質 + 2048 大圖可能要 1~3 分鐘
const STANDARD_SIZES = [
  { w: 1024, h: 1024 },
  { w: 1536, h: 1024 },
  { w: 1024, h: 1536 },
]

/** 可辨識的錯誤：retryable=false 時（Key 無效、額度不足、內容政策、組織未驗證）不應自動重試 */
export class OpenAIImageError extends Error {
  constructor(message, { retryable = true, status = 0, code = '' } = {}) {
    super(message)
    this.name = 'OpenAIImageError'
    this.retryable = retryable
    this.status = status
    this.code = code
  }
}

/** 是否為「重試也沒用」的錯誤（給自動重試迴圈判斷用） */
export function isNonRetryableError(error) {
  return error?.retryable === false
}

/** 最接近目標比例的標準尺寸（1024x1024 / 1536x1024 / 1024x1536） */
export function nearestStandardSize(width, height) {
  const ratio = (width || 1024) / (height || 1024)
  let best = STANDARD_SIZES[0]
  let bestDiff = Infinity
  for (const s of STANDARD_SIZES) {
    const diff = Math.abs(Math.log(s.w / s.h) - Math.log(ratio))
    if (diff < bestDiff) { best = s; bestDiff = diff }
  }
  return `${best.w}x${best.h}`
}

/**
 * 依目標比例選 gpt-image-2 尺寸（任意 WxH、16 的倍數、比例 ≤ 3:1）。
 * 讓輸出比例跟宮格一致，切格時才不會變形。
 * 例：8 宮格 740x1280 → 1184x2048；表情貼 720x1440 → 1024x2048
 */
export function pickOpenAISize(width, height) {
  const w = width || 1024
  const h = height || 1024
  const ratio = w / h
  if (Math.abs(ratio - 1) < 0.02) return '1024x1024'
  const longTarget = Math.max(w, h) >= 1000 ? 2048 : 1536
  const r = Math.min(Math.max(ratio, 1 / 3), 3)
  let ow, oh
  if (r >= 1) {
    ow = longTarget
    oh = Math.round(longTarget / r / 16) * 16
  } else {
    oh = longTarget
    ow = Math.round(longTarget * r / 16) * 16
  }
  return `${ow}x${oh}`
}

/** 把 OpenAI 錯誤回應轉成中文訊息 + 是否可重試 */
export function toOpenAIError(status, data) {
  const err = data?.error || {}
  const code = err.code || err.type || ''
  const raw = err.message || ''
  const detail = raw ? `\n\n詳細信息：${raw}` : ''
  if (status === 401) {
    return new OpenAIImageError(`OpenAI API Key 無效或已撤銷，請重新貼上 Key。${detail}`, { retryable: false, status, code })
  }
  if (status === 429 && (code === 'insufficient_quota' || /quota|billing/i.test(raw))) {
    return new OpenAIImageError(`OpenAI 額度不足（insufficient_quota）。請到 platform.openai.com 的 Billing 儲值或提高上限。${detail}`, { retryable: false, status, code })
  }
  if (status === 429) {
    return new OpenAIImageError(`OpenAI 請求太頻繁（rate limit），稍等一下再按重試。${detail}`, { retryable: true, status, code })
  }
  if (code === 'moderation_blocked' || code === 'content_policy_violation' || /safety system|content policy|moderation/i.test(raw)) {
    return new OpenAIImageError(`內容被 OpenAI 安全政策擋下。請調整描述文字或參考圖，避免可能敏感的內容。${detail}`, { retryable: false, status, code: code || 'moderation_blocked' })
  }
  if (status === 403 && /verif/i.test(raw)) {
    return new OpenAIImageError(`這個 OpenAI 組織還沒完成驗證，無法使用 gpt-image-2。請到 platform.openai.com → Settings → Organization 完成 Verify（驗證後可能要等幾分鐘生效）。${detail}`, { retryable: false, status, code: code || 'org_not_verified' })
  }
  if (status === 404 || code === 'model_not_found') {
    return new OpenAIImageError(`這個 Key 無法使用 gpt-image-2 模型（帳號權限不足或模型不存在）。${detail}`, { retryable: false, status, code })
  }
  if (status >= 500) {
    return new OpenAIImageError(`OpenAI 伺服器暫時錯誤（${status}），請稍後重試。${detail}`, { retryable: true, status, code })
  }
  return new OpenAIImageError(`OpenAI API 錯誤（${status}）：${raw || '未知錯誤'}`, { retryable: status !== 400, status, code })
}

function isSizeRejected(err) {
  if (err?.status !== 400) return false
  return err.code === 'invalid_size' || /size|dimension|resolution|pixels/i.test(err.message || '')
}

/** Convert data URL to Blob */
function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png'
  const binary = atob(b64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

/** 單次呼叫（images 有值走 /images/edits，否則 /images/generations），回傳 data URL */
async function requestOnce(apiKey, prompt, images, { quality, size }) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)
  let response
  try {
    if (images.length === 0) {
      response = await fetch(OPENAI_GENERATIONS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: OPENAI_MODEL, prompt, n: 1, size, quality, output_format: 'png' }),
        signal: controller.signal,
      })
    } else {
      const form = new FormData()
      form.append('model', OPENAI_MODEL)
      form.append('prompt', prompt)
      form.append('n', '1')
      form.append('size', size)
      form.append('quality', quality)
      form.append('output_format', 'png')
      images.slice(0, 16).forEach((dataUrl, i) => {
        form.append('image[]', dataUrlToBlob(dataUrl), `ref_${i}.png`)
      })
      response = await fetch(OPENAI_EDITS_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      })
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new OpenAIImageError(`gpt-image-2 請求超時（超過 ${OPENAI_TIMEOUT_MS / 1000} 秒），請按重試或稍後再試`, { retryable: true, code: 'timeout' })
    }
    throw new OpenAIImageError(`無法連線到 OpenAI（${err.message}）。請檢查網路，或瀏覽器擴充功能是否擋了 api.openai.com`, { retryable: true, code: 'network' })
  } finally {
    clearTimeout(timeoutId)
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw toOpenAIError(response.status, data)

  const b64 = data?.data?.[0]?.b64_json
  if (!b64) {
    throw new OpenAIImageError('gpt-image-2 回應中未找到圖片數據: ' + JSON.stringify(data).substring(0, 300), { retryable: true, code: 'empty' })
  }
  return `data:image/png;base64,${b64}`
}

/**
 * 呼叫 gpt-image-2，自訂尺寸被拒時退回最接近的標準尺寸再試一次
 * （下游 splitGrid8 會自動縮放回規格尺寸）。
 */
async function requestImage(apiKey, prompt, imageDataUrls, opts = {}) {
  const key = (apiKey || '').trim()
  if (!key) {
    throw new OpenAIImageError('尚未輸入 OpenAI API Key（或切回 Gemini）', { retryable: false, code: 'no_key' })
  }
  const { quality = 'medium', size = '1024x1024', targetW, targetH } = opts
  const images = (imageDataUrls || []).filter(Boolean)
  // 不 log key；只記錄尺寸、參考圖數
  console.log(`[OpenAI Images] model=${OPENAI_MODEL} size=${size} quality=${quality} refs=${images.length} promptChars=${prompt.length}`)
  try {
    return await requestOnce(key, prompt, images, { quality, size })
  } catch (err) {
    const fallback = nearestStandardSize(targetW || Number(size.split('x')[0]), targetH || Number(size.split('x')[1]))
    if (isSizeRejected(err) && size !== fallback) {
      console.warn(`[OpenAI Images] size ${size} 被拒，改用 ${fallback}`)
      return await requestOnce(key, prompt, images, { quality, size: fallback })
    }
    throw err
  }
}

function callGptImage2(apiKey, prompt, opts = {}) {
  return requestImage(apiKey, prompt, [], opts)
}

/**
 * Image edit — uses /v1/images/edits with reference image(s) as input
 * （沒有有效參考圖時自動改走 generations）
 */
function callGptImage2Edit(apiKey, prompt, imageDataUrls, opts = {}) {
  return requestImage(apiKey, prompt, imageDataUrls, opts)
}

/**
 * 生成角色圖片（對應 characterGenerator.generateCharacter）
 */
export async function generateCharacterOpenAI(apiKey, theme, uploadedImages, characterDescription = '') {
  const desc = characterDescription?.trim() || theme?.trim() || ''
  const refNote = uploadedImages?.length
    ? 'Use the provided reference image(s) as visual style and character reference.'
    : ''

  const prompt = `Create a cute and friendly character design for messaging stickers.
Theme: ${theme}
${desc ? `Character description: ${desc}` : ''}
${refNote}
Design Requirements:
- NO TEXT: Do not include any text, words, or letters in the image. Just the character.
- Clean background: solid white or high-contrast color to facilitate background removal.
- Character focus: full body or upper body, centered and well-positioned.
- Cute and simple character design (adorable, friendly, kawaii style).
- High quality digital illustration. Safe, family-friendly content.`

  const validRefs = (uploadedImages || []).filter(Boolean)
  if (validRefs.length > 0) {
    return callGptImage2Edit(apiKey, prompt, validRefs, { quality: 'high', size: '1024x1024' })
  }
  return callGptImage2(apiKey, prompt, { quality: 'high', size: '1024x1024' })
}

/**
 * 生成主要圖片 240x240（對應 characterGenerator.generateMainImage）
 */
export async function generateMainImageOpenAI(apiKey, characterImageDataUrl, theme) {
  const refNote = characterImageDataUrl
    ? 'Use the provided character reference image to maintain consistent character appearance.'
    : ''

  const prompt = `Create a main image for a LINE messaging sticker pack.
Theme: ${theme}
${refNote}
Requirements:
- Cute and friendly character (kawaii sticker style).
- NO TEXT - this is a main image without any text or words.
- Clean white background (solid, high-contrast).
- Character centered, 1:1 square composition.
- High quality digital illustration. Safe, family-friendly content.`

  if (characterImageDataUrl) {
    return callGptImage2Edit(apiKey, prompt, [characterImageDataUrl], { quality: 'high', size: '1024x1024' })
  }
  return callGptImage2(apiKey, prompt, { quality: 'high', size: '1024x1024' })
}

/**
 * 生成標籤圖片 96x74（對應 characterGenerator.generateTabImage）
 */
export async function generateTabImageOpenAI(apiKey, characterImageDataUrl, theme) {
  const refNote = characterImageDataUrl
    ? 'Use the provided character reference image to maintain consistent character appearance.'
    : ''

  const prompt = `Create a small tab/thumbnail image for a LINE messaging sticker pack.
Theme: ${theme}
${refNote}
Requirements:
- Cute and friendly character (kawaii sticker style), character as the main focus.
- NO TEXT - no text or words.
- Clean and simple background.
- Character well-centered and recognizable even at small size.
- High quality digital illustration. Safe, family-friendly content.`

  if (characterImageDataUrl) {
    return callGptImage2Edit(apiKey, prompt, [characterImageDataUrl], { quality: 'medium', size: '1024x1024' })
  }
  return callGptImage2(apiKey, prompt, { quality: 'medium', size: '1024x1024' })
}

export async function generateGrid8ImageOpenAI(
  apiKey,
  characterImageDataUrl,
  stickers,
  textStyleDescription = '',
  referenceGridImages = null,
  spec = null,
  opts = {}
) {
  const cellW = spec?.generateCell?.w || 370
  const cellH = spec?.generateCell?.h || 320
  const gridW = spec?.grid?.w || cellW * 2
  const gridH = spec?.grid?.h || cellH * 4
  const bgColor = (opts?.bgColor || '#333333').toUpperCase()

  const safeTextStyle =
    textStyleDescription?.trim() || 'Cute and clear style with visible text box'
  const hasAnyText = stickers.some((s) => s.text?.trim())

  const stickersDescription = stickers
    .map((s, i) => {
      const row = Math.floor(i / 2) + 1
      const col = (i % 2) + 1
      const textPart = s.text?.trim() ? `, text: "${s.text}"` : ''
      return `Cell ${row}-${col} (#${i + 1}): ${s.description}${textPart}`
    })
    .join('\n')

  const prompt = `Create a single image containing 8 LINE stickers in a 2-column by 4-row grid layout.
Background: solid ${bgColor} chroma-key background for the entire ${gridW}x${gridH} canvas.
DO NOT draw any grid lines, borders, or frames between cells.
Each sticker is cute and friendly kawaii style character illustration.
${hasAnyText ? `Text style: ${safeTextStyle}` : 'NO TEXT in any sticker — image-only stickers.'}
Target image size: ${gridW}x${gridH} pixels.
Cell layout (DO NOT draw dividers):
${stickersDescription}
Requirements:
- Each sticker centered in its ${cellW}x${cellH} virtual cell, 10% padding.
- Seamless solid ${bgColor} background across the whole image.
- High quality digital illustration. Safe, family-friendly content.`

  // 比例跟宮格一致（例：740x1280 → 1184x2048），切格才不會變形
  const size = pickOpenAISize(gridW, gridH)

  const refImages = [characterImageDataUrl, ...(referenceGridImages || [])].filter(Boolean)
  if (refImages.length > 0) {
    return callGptImage2Edit(apiKey, prompt, refImages, { quality: 'high', size, targetW: gridW, targetH: gridH })
  }
  return callGptImage2(apiKey, prompt, { quality: 'high', size, targetW: gridW, targetH: gridH })
}

/**
 * 生成帶文字的單張貼圖（對應 characterGenerator.generateStickerWithText）
 */
export async function generateStickerWithTextOpenAI(
  apiKey,
  characterImageDataUrl,
  description,
  text,
  textStyleDescription = '',
  width = 370,
  height = 320,
  referenceStickers = [],
  opts = {}
) {
  const { extraPrompt = '' } = opts
  const safeTextStyle =
    textStyleDescription?.trim() || 'Cute and clear style with visible text box'
  const hasText = text?.trim()

  const userDirective = extraPrompt?.trim()
    ? `\nUser directive: ${extraPrompt.trim()}`
    : ''

  const prompt = hasText
    ? `Create a cute and friendly LINE sticker style illustration.
Scene: ${description}
Text to display (exactly once): "${text.trim()}"
Text style: ${safeTextStyle}
${userDirective}
Requirements:
- Display the text "${text.trim()}" exactly ONE time with a solid, brightly-colored background box for visibility.
- White background (solid, not transparent).
- ${width}x${height} proportioned composition.
- Cute, expressive kawaii sticker illustration style. High quality. Safe, family-friendly content.`
    : `Create a cute and friendly LINE sticker style illustration.
Scene: ${description}
${userDirective}
Requirements:
- NO TEXT — image only sticker.
- White background (solid, not transparent).
- ${width}x${height} proportioned composition.
- Cute, expressive kawaii sticker illustration style. High quality. Safe, family-friendly content.`

  const size = pickOpenAISize(width, height)

  const refImages = [characterImageDataUrl, ...(referenceStickers || [])].filter(Boolean)
  if (refImages.length > 0) {
    return callGptImage2Edit(apiKey, prompt, refImages, { quality: 'high', size, targetW: width, targetH: height })
  }
  return callGptImage2(apiKey, prompt, { quality: 'high', size, targetW: width, targetH: height })
}
