/**
 * gpt-image-2 圖片生成工具
 *
 * 使用 OpenAI /v1/images/generations endpoint，model: gpt-image-2。
 * 注意：gpt-image-2 是純 text-to-image，不支援 image input（參考圖）。
 * 回傳 base64 PNG。
 *
 * 參數說明：
 *   quality: "low" | "medium" | "high"  （預設 "medium"）
 *   size:    "1024x1024" | "1024x1536" | "1536x1024" | "auto"（預設 "1024x1024"）
 */

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/images/generations'

/**
 * 呼叫 gpt-image-2 API，回傳 data URL（image/png base64）
 * @param {string} apiKey - OpenAI API Key
 * @param {string} prompt - 圖片描述 prompt
 * @param {object} opts
 * @param {string} [opts.quality] - "low" | "medium" | "high"
 * @param {string} [opts.size]    - "1024x1024" | "1024x1536" | "1536x1024" | "auto"
 * @returns {Promise<string>} Data URL（data:image/png;base64,...）
 */
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
  const timeoutId = setTimeout(() => controller.abort(), 120000) // 120s timeout

  let response
  try {
    response = await fetch(OPENAI_ENDPOINT, {
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
 * 生成角色圖片（對應 characterGenerator.generateCharacter）
 */
export async function generateCharacterOpenAI(apiKey, theme, _uploadedImages, characterDescription = '') {
  const desc = characterDescription?.trim() || theme?.trim() || ''
  const prompt = `Create a cute and friendly character design for messaging stickers.
Theme: ${theme}
${desc ? `Character description: ${desc}` : ''}
Design Requirements:
- NO TEXT: Do not include any text, words, or letters in the image. Just the character.
- Clean background: solid white or high-contrast color to facilitate background removal.
- Character focus: full body or upper body, centered and well-positioned.
- Cute and simple character design (adorable, friendly, kawaii style).
- High quality digital illustration. Safe, family-friendly content.`

  return callGptImage2(apiKey, prompt, { quality: 'high', size: '1024x1024' })
}

/**
 * 生成主要圖片 240x240（對應 characterGenerator.generateMainImage）
 */
export async function generateMainImageOpenAI(apiKey, _characterImageDataUrl, theme) {
  const prompt = `Create a main image for a LINE messaging sticker pack.
Theme: ${theme}
Requirements:
- Cute and friendly character (kawaii sticker style).
- NO TEXT - this is a main image without any text or words.
- Clean white background (solid, high-contrast).
- Character centered, 1:1 square composition.
- High quality digital illustration. Safe, family-friendly content.`

  return callGptImage2(apiKey, prompt, { quality: 'high', size: '1024x1024' })
}

/**
 * 生成標籤圖片 96x74（對應 characterGenerator.generateTabImage）
 */
export async function generateTabImageOpenAI(apiKey, _characterImageDataUrl, theme) {
  const prompt = `Create a small tab/thumbnail image for a LINE messaging sticker pack.
Theme: ${theme}
Requirements:
- Cute and friendly character (kawaii sticker style), character as the main focus.
- NO TEXT - no text or words.
- Clean and simple background.
- Character well-centered and recognizable even at small size.
- High quality digital illustration. Safe, family-friendly content.`

  return callGptImage2(apiKey, prompt, { quality: 'medium', size: '1024x1024' })
}

/**
 * 生成 8 宮格圖片（對應 characterGenerator.generateGrid8Image）
 * gpt-image-2 不支援 image input，所以只依 prompt 生成。
 */
export async function generateGrid8ImageOpenAI(
  apiKey,
  _characterImageDataUrl,
  stickers,
  textStyleDescription = '',
  _referenceGridImages = null,
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

  // 選擇接近比例的 size
  const isPortrait = gridH > gridW
  const size = isPortrait ? '1024x1536' : gridW === gridH ? '1024x1024' : '1536x1024'

  return callGptImage2(apiKey, prompt, { quality: 'high', size })
}

/**
 * 生成帶文字的單張貼圖（對應 characterGenerator.generateStickerWithText）
 */
export async function generateStickerWithTextOpenAI(
  apiKey,
  _characterImageDataUrl,
  description,
  text,
  textStyleDescription = '',
  width = 370,
  height = 320,
  _referenceStickers = [],
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

  return callGptImage2(apiKey, prompt, { quality: 'high', size })
}
