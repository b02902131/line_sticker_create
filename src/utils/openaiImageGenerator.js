/**
 * gpt-image-2 圖片生成工具
 *
 * text-to-image: POST /v1/images/generations, model: gpt-image-2
 * image input:   POST /v1/images/edits, model: gpt-image-2 (multipart/form-data)
 * 回傳 base64 PNG。
 *
 * 參數說明：
 *   quality: "low" | "medium" | "high"  （預設 "medium"）
 *   size:    "1024x1024" | "1024x1536" | "1536x1024" | "auto"（預設 "1024x1024"）
 */

const OPENAI_GENERATIONS_ENDPOINT = 'https://api.openai.com/v1/images/generations'
const OPENAI_EDITS_ENDPOINT = 'https://api.openai.com/v1/images/edits'

/**
 * 呼叫 gpt-image-2 API，回傳 data URL（image/png base64）
 * @param {string} apiKey - OpenAI API Key
 * @param {string} prompt - 圖片描述 prompt
 * @param {object} opts
 * @param {string} [opts.quality] - "low" | "medium" | "high"
 * @param {string} [opts.size]    - "1024x1024" | "1024x1536" | "1536x1024" | "auto"
 * @returns {Promise<string>} Data URL（data:image/png;base64,...）
 */
/** Convert data URL to Blob */
function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const binary = atob(b64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

async function callGptImage2(apiKey, prompt, opts = {}) {
  const { quality = 'medium', size = '1024x1024' } = opts

  const body = {
    model: 'gpt-image-2',
    prompt,
    n: 1,
    size,
    quality,
    output_format: 'png',
    response_format: 'b64_json',
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000)

  let response
  try {
    response = await fetch(OPENAI_GENERATIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error('gpt-image-2 請求超時（超過120秒），請稍後再試')
    }
    throw err
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    const msg = errData?.error?.message || response.statusText
    throw new Error(`OpenAI API 錯誤 (${response.status}): ${msg}`)
  }

  const data = await response.json()
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) {
    throw new Error('gpt-image-2 回應中未找到圖片數據: ' + JSON.stringify(data).substring(0, 300))
  }
  return `data:image/png;base64,${b64}`
}

/**
 * Image edit — uses /v1/images/edits with reference image(s) as input
 * @param {string} apiKey
 * @param {string} prompt
 * @param {string[]} imageDataUrls - reference images (data URLs)
 * @param {object} opts
 */
async function callGptImage2Edit(apiKey, prompt, imageDataUrls, opts = {}) {
  const { quality = 'medium', size = '1024x1024' } = opts

  const form = new FormData()
  form.append('model', 'gpt-image-2')
  form.append('prompt', prompt)
  form.append('n', '1')
  form.append('size', size)
  form.append('quality', quality)
  form.append('response_format', 'b64_json')

  const validImages = (imageDataUrls || []).filter(Boolean)
  if (validImages.length === 0) {
    return callGptImage2(apiKey, prompt, opts)
  }

  validImages.forEach((dataUrl, i) => {
    const blob = dataUrlToBlob(dataUrl)
    form.append('image[]', blob, `ref_${i}.png`)
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120000)

  let response
  try {
    response = await fetch(OPENAI_EDITS_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      throw new Error('gpt-image-2 請求超時（超過120秒），請稍後再試')
    }
    throw err
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    const msg = errData?.error?.message || response.statusText
    throw new Error(`OpenAI API 錯誤 (${response.status}): ${msg}`)
  }

  const data = await response.json()
  const b64 = data?.data?.[0]?.b64_json
  if (!b64) {
    throw new Error('gpt-image-2 edit 回應中未找到圖片數據: ' + JSON.stringify(data).substring(0, 300))
  }
  return `data:image/png;base64,${b64}`
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

  const isPortrait = gridH > gridW
  const size = isPortrait ? '1024x1536' : gridW === gridH ? '1024x1024' : '1536x1024'

  const refImages = [characterImageDataUrl, ...(referenceGridImages || [])].filter(Boolean)
  if (refImages.length > 0) {
    return callGptImage2Edit(apiKey, prompt, refImages, { quality: 'high', size })
  }
  return callGptImage2(apiKey, prompt, { quality: 'high', size })
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

  const isPortrait = height > width
  const size = isPortrait ? '1024x1536' : width === height ? '1024x1024' : '1536x1024'

  const refImages = [characterImageDataUrl, ...(referenceStickers || [])].filter(Boolean)
  if (refImages.length > 0) {
    return callGptImage2Edit(apiKey, prompt, refImages, { quality: 'high', size })
  }
  return callGptImage2(apiKey, prompt, { quality: 'high', size })
}
