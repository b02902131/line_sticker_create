import { GoogleGenerativeAI } from '@google/generative-ai'

const IMAGE_VISIBILITY_RULES = `
Visibility & Background-Removal Rules:
- Keep strong contrast between the subject/text box and the background.
- Avoid background colors that are similar to any text outline or border.
- Do NOT use background color that matches text box fill or its outline.
- Ensure clear separation at all edges of the character and the text box.
- The design must remain readable on both light and dark preview backgrounds.
`

const STRICT_CONSISTENCY_RULES = `
⚠️⚠️⚠️ STRICT CHARACTER CONSISTENCY REQUIRED ⚠️⚠️⚠️
- IDENTITY LOCK: The character MUST be the EXACT SAME PERSON as in the reference image.
- HAIR COLOR: Must match the reference EXACTLY. Do NOT change hair color.
- CLOTHING COLOR: Must match the reference EXACTLY. Do NOT change clothing color.
- SKIN TONE: Must match the reference EXACTLY.
- NO RANDOM COLORS: Do not introduce new colors for hair or clothing that are not in the reference.
- Verify against reference: If the reference has blonde hair, the output MUST have blonde hair.
`

/**
 * 生成角色圖片（白色背景）
 * @param {string} apiKey - Gemini API Key
 * @param {string} theme - 主題描述
 * @param {string|string[]} uploadedImages - 上傳的參考圖片（可選，支援單張或多張）
 * @returns {Promise<string>} 角色圖片的 Data URL
 */
export async function generateCharacter(apiKey, theme, uploadedImages = null, characterDescription = '') {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' })

  // 正規化為陣列
  const images = !uploadedImages ? [] : Array.isArray(uploadedImages) ? uploadedImages : [uploadedImages]
  const hasImages = images.length > 0

  // 清理主題，避免觸發安全過濾
  const cleanTheme = theme.trim()

  let prompt = `Create a cute and friendly character design for messaging stickers.

Theme: ${cleanTheme}

Design Requirements:
- **NO TEXT**: Do not include any text, words, or letters in the image. Just the character.
- **Clean Background**: Solid, high-contrast background color (e.g., white or a color distinct from the character) to facilitate easy background removal.
- **Character Focus**: Full body or upper body character view, centered and well-positioned.
- **Consistency Base**: This image will be used as a strict reference for generating multiple sticker variations, so make the features clear and recognizable.
- Cute and simple character design (adorable, friendly style).
- High quality digital illustration.
- Safe, appropriate, and family-friendly content.
${IMAGE_VISIBILITY_RULES}`

  // 如果有上傳的參考圖片，在 prompt 中提及
  if (hasImages && characterDescription.trim()) {
    prompt += images.length > 1
      ? `\n- ${images.length} reference images are provided below, labeled [Reference image 1], [Reference image 2], etc. Use them as bases for the character design. The user's description may refer to specific images by number.
- User's character description: ${characterDescription.trim()}`
      : `\n- Use the uploaded reference image as a base for the character design
- Additionally, incorporate the following character description: ${characterDescription.trim()}`
  } else if (hasImages) {
    prompt += images.length > 1
      ? `\n- ${images.length} reference images are provided below, labeled [Reference image 1], [Reference image 2], etc. Use them together as bases for the character design.`
      : `\n- Use the uploaded reference image as a base for the character design`
  }

  try {
    // 構建請求內容
    const contents = [{
      parts: [{
        text: prompt
      }]
    }]

    // 如果有上傳的圖片，帶編號添加到 parts 中
    for (let i = 0; i < images.length; i++) {
      if (images.length > 1) {
        contents[0].parts.push({ text: `[Reference image ${i + 1}]:` })
      }
      const base64Data = images[i].split(',')[1]
      contents[0].parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: base64Data
        }
      })
    }

    // 使用 REST API 調用，添加超時控制（60秒）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.8,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 2048,
            }
          }),
          signal: controller.signal
        }
      )
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('請求超時（超過60秒），請稍後再試')
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 錯誤詳情:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      const errorMessage = errorData.error?.message || errorData.message || response.statusText
      throw new Error(`API 錯誤: ${errorMessage}`)
    }

    const data = await response.json()
    console.log('API 完整回應:', JSON.stringify(data, null, 2))
    
    // 檢查是否有錯誤
    if (data.error) {
      throw new Error(`API 錯誤: ${data.error.message || JSON.stringify(data.error)}`)
    }
    
    // 檢查 promptFeedback 中的 blockReason（PROHIBITED_CONTENT 等）
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      const blockReason = data.promptFeedback.blockReason
      const blockMessage = data.promptFeedback.blockMessage || ''
      
      let errorMessage = `內容被 Google 安全過濾器阻止 (${blockReason})`
      
      if (blockReason === 'PROHIBITED_CONTENT') {
        errorMessage = `生成的內容被 Google 安全過濾器判定為違規內容。\n\n可能的原因：\n1. 輸入的圖片內容觸發了安全策略\n2. 描述文字中包含可能敏感的詞彙\n3. 生成的內容被誤判為不當內容\n\n建議：\n1. 檢查輸入的角色圖片是否包含可能敏感的內容\n2. 嘗試調整描述文字，使用更中性的詞彙\n3. 如果認為這是誤判，可以稍後再試或向 Google 反饋\n\n詳細信息：${blockMessage || '無額外說明'}`
      } else if (blockReason === 'SAFETY') {
        errorMessage = `內容被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${blockMessage || '無額外說明'}`
      }
      
      throw new Error(errorMessage)
    }
    
    // 檢查 finishReason
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0]
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Finish reason:', candidate.finishReason)
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
          const finishMessage = candidate.finishMessage || ''
          const errorMsg = finishMessage || '生成的圖片被 Google 安全過濾器阻止。這可能是因為 prompt 中的某些內容觸發了安全策略。'
          throw new Error(`圖片生成被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${errorMsg}`)
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('內容可能包含受版權保護的內容')
        }
      }
      
      // 檢查 content.parts
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // 檢查內聯圖片數據
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          }
          // 檢查圖片 URL
          if (part.image && part.image.url) {
            const imageResponse = await fetch(part.image.url)
            const blob = await imageResponse.blob()
            return await blobToDataURL(blob)
          }
          // 檢查是否有 base64 數據
          if (part.image && part.image.data) {
            return `data:image/png;base64,${part.image.data}`
          }
        }
      }
      
      // 檢查是否有直接的圖片數據
      if (candidate.imageData) {
        return `data:image/png;base64,${candidate.imageData}`
      }
      
      // 如果只有文本回應，記錄並拋出錯誤
      if (candidate.content && candidate.content.parts) {
        const textParts = candidate.content.parts.filter(p => p.text)
        if (textParts.length > 0) {
          console.error('API 返回了文本而不是圖片:', textParts.map(p => p.text).join('\n'))
          throw new Error(`API 返回了文本回應而不是圖片。回應內容: ${textParts[0].text.substring(0, 200)}`)
        }
      }
    }

    // 如果標準格式沒有圖片，嘗試其他可能的格式
    if (data.images && data.images.length > 0) {
      const imageData = data.images[0]
      if (imageData.base64) {
        return `data:image/png;base64,${imageData.base64}`
      }
      if (imageData.url) {
        const imageResponse = await fetch(imageData.url)
        const blob = await imageResponse.blob()
        return await blobToDataURL(blob)
      }
    }

    // 詳細的錯誤信息
    console.error('無法找到圖片數據，完整回應:', data)
    throw new Error(`API 回應中沒有找到圖片數據。回應格式: ${JSON.stringify(data).substring(0, 500)}`)
  } catch (error) {
    console.error('生成角色失敗:', error)
    throw error
  }
}

/**
 * 生成主要圖片（無文字，240x240）
 * @param {string} apiKey - Gemini API Key
 * @param {string} characterImageDataUrl - 角色圖片（Data URL）
 * @param {string} theme - 主題說明
 * @returns {Promise<string>} 生成的圖片 Data URL
 */
export async function generateMainImage(apiKey, characterImageDataUrl, theme) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' })

  // 清理主題
  const cleanTheme = theme.trim()
  
  const prompt = `Create a main image for a messaging sticker pack based on the character reference image.

Character Reference: Use the provided character image as reference
${STRICT_CONSISTENCY_RULES}
Theme: ${cleanTheme}

Technical Requirements:
1. Use the character design from the reference image
2. Maintain visual consistency with the reference character
3. **DO NOT add any text** - this is a main image without text or words
4. Clean white background (solid, high-contrast, distinct from character)
${IMAGE_VISIBILITY_RULES}
5. **EXACT dimensions: 240px width × 240px height** (must be exactly 240×240 pixels)
6. Target Aspect Ratio: 1:1 (Square) - COMPOSITION MUST FIT SQUARE RATIO
7. Cute, expressive, and friendly sticker illustration style
8. High quality digital illustration
8. Character should be centered and well-positioned in the frame
9. Clean, simple, and appropriate design suitable as a sticker pack main image
10. Safe, family-friendly content`

  try {
    // 檢查並提取 base64 數據
    if (!characterImageDataUrl) {
      throw new Error('角色圖片數據為空')
    }
    
    let base64Data
    if (characterImageDataUrl.includes(',')) {
      base64Data = characterImageDataUrl.split(',')[1]
    } else {
      base64Data = characterImageDataUrl
    }
    
    if (!base64Data || base64Data.length === 0) {
      throw new Error('無法提取圖片 base64 數據')
    }
    
    // 清理 base64 數據（移除可能的空白字符）
    base64Data = base64Data.trim().replace(/\s/g, '')
    
    // 驗證 base64 格式
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new Error('base64 數據格式無效，包含非法字符')
    }
    
    // 檢查 base64 長度（圖片應該有一定大小）
    if (base64Data.length < 100) {
      throw new Error('base64 數據長度不足，可能不是有效的圖片數據')
    }

    // 構建請求體
    // 注意：根據最初可用的版本，應該包含 maxOutputTokens
    const requestBody = {
      contents: [{
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    }
    
    console.log('發送圖片生成請求:', {
      promptLength: prompt.length,
      base64Length: base64Data.length,
      model: 'gemini-3-pro-image-preview'
    })

    // 添加超時控制（60秒）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      )
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('請求超時（超過60秒），請稍後再試或減少同時生成的數量')
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 錯誤詳情:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      const errorMessage = errorData.error?.message || errorData.message || response.statusText
      throw new Error(`API 錯誤: ${errorMessage}`)
    }

    const data = await response.json()
    console.log('生成主要圖片 - API 完整回應:', JSON.stringify(data, null, 2))
    
    // 檢查是否有錯誤
    if (data.error) {
      throw new Error(`API 錯誤: ${data.error.message || JSON.stringify(data.error)}`)
    }
    
    // 檢查 promptFeedback 中的 blockReason（PROHIBITED_CONTENT 等）
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      const blockReason = data.promptFeedback.blockReason
      const blockMessage = data.promptFeedback.blockMessage || ''
      
      let errorMessage = `內容被 Google 安全過濾器阻止 (${blockReason})`
      
      if (blockReason === 'PROHIBITED_CONTENT') {
        errorMessage = `生成的內容被 Google 安全過濾器判定為違規內容。\n\n可能的原因：\n1. 輸入的圖片內容觸發了安全策略\n2. 描述文字中包含可能敏感的詞彙\n3. 生成的內容被誤判為不當內容\n\n建議：\n1. 檢查輸入的角色圖片是否包含可能敏感的內容\n2. 嘗試調整描述文字，使用更中性的詞彙\n3. 如果認為這是誤判，可以稍後再試或向 Google 反饋\n\n詳細信息：${blockMessage || '無額外說明'}`
      } else if (blockReason === 'SAFETY') {
        errorMessage = `內容被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${blockMessage || '無額外說明'}`
      }
      
      throw new Error(errorMessage)
    }
    
    // 檢查 finishReason
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0]
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Finish reason:', candidate.finishReason)
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
          const finishMessage = candidate.finishMessage || ''
          const errorMsg = finishMessage || '生成的圖片被 Google 安全過濾器阻止。這可能是因為 prompt 中的某些內容觸發了安全策略。'
          throw new Error(`圖片生成被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${errorMsg}`)
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('內容可能包含受版權保護的內容')
        }
      }
      
      // 檢查 content.parts
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // 檢查內聯圖片數據
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          }
          // 檢查圖片 URL
          if (part.image && part.image.url) {
            const imageResponse = await fetch(part.image.url)
            const blob = await imageResponse.blob()
            return await blobToDataURL(blob)
          }
          // 檢查是否有 base64 數據
          if (part.image && part.image.data) {
            return `data:image/png;base64,${part.image.data}`
          }
        }
      }
      
      // 檢查是否有直接的圖片數據
      if (candidate.imageData) {
        return `data:image/png;base64,${candidate.imageData}`
      }
      
      // 如果只有文本回應，記錄並拋出錯誤
      if (candidate.content && candidate.content.parts) {
        const textParts = candidate.content.parts.filter(p => p.text)
        if (textParts.length > 0) {
          console.error('API 返回了文本而不是圖片:', textParts.map(p => p.text).join('\n'))
          throw new Error(`API 返回了文本回應而不是圖片。回應內容: ${textParts[0].text.substring(0, 200)}`)
        }
      }
    }

    // 如果標準格式沒有圖片，嘗試其他可能的格式
    if (data.images && data.images.length > 0) {
      const imageData = data.images[0]
      if (imageData.base64) {
        return `data:image/png;base64,${imageData.base64}`
      }
      if (imageData.url) {
        const imageResponse = await fetch(imageData.url)
        const blob = await imageResponse.blob()
        return await blobToDataURL(blob)
      }
    }

    // 詳細的錯誤信息
    console.error('無法找到圖片數據，完整回應:', data)
    throw new Error(`API 回應中沒有找到圖片數據。回應格式: ${JSON.stringify(data).substring(0, 500)}`)
  } catch (error) {
    console.error('生成主要圖片失敗:', error)
    throw error
  }
}

/**
 * 生成標籤圖片（無文字，角色為主，乾淨背景，96x74）
 * @param {string} apiKey - Gemini API Key
 * @param {string} characterImageDataUrl - 角色圖片（Data URL）
 * @param {string} theme - 主題說明
 * @returns {Promise<string>} 生成的圖片 Data URL
 */
export async function generateTabImage(apiKey, characterImageDataUrl, theme) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: 'gemini-3-pro-image-preview' })

  // 清理主題
  const cleanTheme = theme.trim()
  
  const prompt = `Create a tab image for a messaging sticker pack based on the character reference image.

Character Reference: Use the provided character image as reference
${STRICT_CONSISTENCY_RULES}
Theme: ${cleanTheme}

Technical Requirements:
1. Use the character design from the reference image as the main focus
2. Maintain visual consistency with the reference character
3. **DO NOT add any text** - this is a tab image without text or words
4. Clean and simple background (solid, high-contrast, distinct from character)
${IMAGE_VISIBILITY_RULES}
5. **EXACT dimensions: 96px width × 74px height** (must be exactly 96×74 pixels)
6. Target Aspect Ratio: 4:3 (Landscape) - COMPOSITION MUST FIT LANDSCAPE RATIO
7. Character should be the main and central element, clearly visible
8. Simple and clean design suitable for chat room thumbnail
8. High quality digital illustration despite small size
9. Character should be well-centered and recognizable even at this small size
10. Minimalist design - keep it simple and clean since it's a small thumbnail image
11. Safe, family-friendly content`

  try {
    // 檢查並提取 base64 數據
    if (!characterImageDataUrl) {
      throw new Error('角色圖片數據為空')
    }
    
    let base64Data
    if (characterImageDataUrl.includes(',')) {
      base64Data = characterImageDataUrl.split(',')[1]
    } else {
      base64Data = characterImageDataUrl
    }
    
    if (!base64Data || base64Data.length === 0) {
      throw new Error('無法提取圖片 base64 數據')
    }
    
    // 清理 base64 數據（移除可能的空白字符）
    base64Data = base64Data.trim().replace(/\s/g, '')
    
    // 驗證 base64 格式
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new Error('base64 數據格式無效，包含非法字符')
    }
    
    // 檢查 base64 長度（圖片應該有一定大小）
    if (base64Data.length < 100) {
      throw new Error('base64 數據長度不足，可能不是有效的圖片數據')
    }

    // 構建請求體
    // 注意：根據最初可用的版本，應該包含 maxOutputTokens
    const requestBody = {
      contents: [{
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    }
    
    console.log('發送圖片生成請求:', {
      promptLength: prompt.length,
      base64Length: base64Data.length,
      model: 'gemini-3-pro-image-preview'
    })

    // 添加超時控制（60秒）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      )
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('請求超時（超過60秒），請稍後再試或減少同時生成的數量')
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 錯誤詳情:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      const errorMessage = errorData.error?.message || errorData.message || response.statusText
      throw new Error(`API 錯誤: ${errorMessage}`)
    }

    const data = await response.json()
    console.log('生成標籤圖片 - API 完整回應:', JSON.stringify(data, null, 2))
    
    // 檢查是否有錯誤
    if (data.error) {
      throw new Error(`API 錯誤: ${data.error.message || JSON.stringify(data.error)}`)
    }
    
    // 檢查 promptFeedback 中的 blockReason（PROHIBITED_CONTENT 等）
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      const blockReason = data.promptFeedback.blockReason
      const blockMessage = data.promptFeedback.blockMessage || ''
      
      let errorMessage = `內容被 Google 安全過濾器阻止 (${blockReason})`
      
      if (blockReason === 'PROHIBITED_CONTENT') {
        errorMessage = `生成的內容被 Google 安全過濾器判定為違規內容。\n\n可能的原因：\n1. 輸入的圖片內容觸發了安全策略\n2. 描述文字中包含可能敏感的詞彙\n3. 生成的內容被誤判為不當內容\n\n建議：\n1. 檢查輸入的角色圖片是否包含可能敏感的內容\n2. 嘗試調整描述文字，使用更中性的詞彙\n3. 如果認為這是誤判，可以稍後再試或向 Google 反饋\n\n詳細信息：${blockMessage || '無額外說明'}`
      } else if (blockReason === 'SAFETY') {
        errorMessage = `內容被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${blockMessage || '無額外說明'}`
      }
      
      throw new Error(errorMessage)
    }
    
    // 檢查 finishReason
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0]
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Finish reason:', candidate.finishReason)
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
          const finishMessage = candidate.finishMessage || ''
          const errorMsg = finishMessage || '生成的圖片被 Google 安全過濾器阻止。這可能是因為 prompt 中的某些內容觸發了安全策略。'
          throw new Error(`圖片生成被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${errorMsg}`)
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('內容可能包含受版權保護的內容')
        }
      }
      
      // 檢查 content.parts
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // 檢查內聯圖片數據
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          }
          // 檢查圖片 URL
          if (part.image && part.image.url) {
            const imageResponse = await fetch(part.image.url)
            const blob = await imageResponse.blob()
            return await blobToDataURL(blob)
          }
          // 檢查是否有 base64 數據
          if (part.image && part.image.data) {
            return `data:image/png;base64,${part.image.data}`
          }
        }
      }
      
      // 檢查是否有直接的圖片數據
      if (candidate.imageData) {
        return `data:image/png;base64,${candidate.imageData}`
      }
      
      // 如果只有文本回應，記錄並拋出錯誤
      if (candidate.content && candidate.content.parts) {
        const textParts = candidate.content.parts.filter(p => p.text)
        if (textParts.length > 0) {
          console.error('API 返回了文本而不是圖片:', textParts.map(p => p.text).join('\n'))
          throw new Error(`API 返回了文本回應而不是圖片。回應內容: ${textParts[0].text.substring(0, 200)}`)
        }
      }
    }

    // 如果標準格式沒有圖片，嘗試其他可能的格式
    if (data.images && data.images.length > 0) {
      const imageData = data.images[0]
      if (imageData.base64) {
        return `data:image/png;base64,${imageData.base64}`
      }
      if (imageData.url) {
        const imageResponse = await fetch(imageData.url)
        const blob = await imageResponse.blob()
        return await blobToDataURL(blob)
      }
    }

    // 詳細的錯誤信息
    console.error('無法找到圖片數據，完整回應:', data)
    throw new Error(`API 回應中沒有找到圖片數據。回應格式: ${JSON.stringify(data).substring(0, 500)}`)
  } catch (error) {
    console.error('生成標籤圖片失敗:', error)
    throw error
  }
}

/**
 * 生成一張包含8宮格的圖片（2列4行布局）
 * @param {string} apiKey - Gemini API Key
 * @param {string} characterImageDataUrl - 角色圖片（Data URL）
 * @param {Array<{description: string, text: string}>} stickers - 8個貼圖的描述和文字
 * @param {string} textStyleDescription - 文字樣式描述
 * @returns {Promise<string>} 生成的8宮格圖片 Data URL（740x1280）
 */
export async function generateGrid8Image(
  apiKey,
  characterImageDataUrl,
  stickers,
  textStyleDescription = '',
  previousGridImageDataUrl = null
) {
  const safeTextStyle = textStyleDescription && textStyleDescription.trim() 
    ? textStyleDescription.trim() 
    : 'Cute and clear style with visible text box'

  // 構建包含8個貼圖描述的prompt
  const stickersDescription = stickers.map((sticker, index) => {
    const row = Math.floor(index / 2) + 1
    const col = (index % 2) + 1
    return `位置 ${row}-${col} (第${index + 1}個): ${sticker.description}, 文字: "${sticker.text}"`
  }).join('\n')

  const prompt = `Create a single image containing 8 LINE stickers arranged in a 2-column by 4-row layout on a CLEAN WHITE CANVAS.
  
🚫🚫🚫 CRITICAL INSTRUCTION - INVISIBLE BOUNDARIES 🚫🚫🚫
**DO NOT DRAW ANY GRID LINES, BORDERS, OR FRAMES.**
The 8 stickers must float on a single, continuous white background.
Imagine 8 stickers placed on a white sheet of paper. NO lines between them.

Character Reference: **STRICTLY FOLLOW the provided character image.** The stickers MUST look exactly like the same character in different poses. Maintain the same facial features, clothing, colors, and proportions.
${STRICT_CONSISTENCY_RULES}
${previousGridImageDataUrl ? `
🎨 STYLE CONSISTENCY WITH PREVIOUS GRID 🎨
A previous grid image is provided as a second reference image. You MUST match its style exactly:
- The exact same art style, line thickness, and coloring technique
- The same text box style, font style, and text placement approach
- The same level of detail, shading, and proportions
- The same background treatment within each sticker cell
This new grid must look like it belongs to the SAME sticker pack as the previous grid.
` : ''}
Background Requirement: **High contrast solid white background** in each area to facilitate automatic background removal.
${IMAGE_VISIBILITY_RULES}
Target Aspect Ratio: 9:16 (Vertical Portrait)
Text Style Guidelines: ${safeTextStyle}

⚠️⚠️⚠️ ABSOLUTE SIZE REQUIREMENT - CRITICAL ⚠️⚠️⚠️
The image must be EXACTLY 740 pixels wide × 1280 pixels high.
Virtual Cell Size: 370px × 320px (for positioning only - DO NOT DRAW OUTLINES).

🚫🚫🚫 FORBIDDEN ELEMENTS - NO VISIBLE GRID 🚫🚫🚫
- ❌ NO black lines, gray lines, or any colored lines between stickers.
- ❌ NO vertical divider at x=370.
- ❌ NO horizontal dividers at y=320, 640, 960.
- ❌ NO frames around the stickers.
- ❌ NO "window pane" effects.
- ❌ The background must be pure, uninterrupted white pixels between the character graphics.

**Layout Guide (Mental Model only - DO NOT DRAW):**
- Column 1: Left half (x=0-369)
- Column 2: Right half (x=370-739)
- Row 1: Top (y=0-319)
- Row 2: Upper Middle (y=320-639)
- Row 3: Lower Middle (y=640-959)
- Row 4: Bottom (y=960-1279)

${stickersDescription}

MANDATORY REQUIREMENTS:
1. **Content Boundary**: Keep all graphics well within the virtual cell boundaries (370x320) to avoid cropping.
2. **Seamless Background**: The white background must flow continuously across the entire 740x1280 image.
3. **No Separators**: If you feel the urge to draw a line to separate stickers, STOP. Leave it empty white space.

VERIFICATION CHECKLIST:
✓ Image size 740x1280
✓ 8 distinct stickers
✓ **ZERO VISIBLE DIVIDING LINES**
✓ **Continuous white background**
✓ Characters centered in their virtual cells

FINAL INSTRUCTION - READ CAREFULLY:
Generate the complete 8-sticker sheet with STRICT adherence to the "Invisible Boundaries" rule.
Each sticker occupies its own virtual 370x320 space, but there are NO VISIBLE LINES separating them.
**The final image must be clean, white, and continuous.**`

  try {
    if (!characterImageDataUrl) {
      throw new Error('角色圖片數據為空')
    }
    
    // 先壓縮角色圖片以減少數據量（8宮格生成時需要較小的參考圖片）
    let processedImageDataUrl = characterImageDataUrl
    try {
      // 將圖片壓縮到最大 512x512，減少 base64 數據大小
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = characterImageDataUrl
      await new Promise((resolve, reject) => {
        img.onload = () => {
          const maxSize = 512
          if (img.width > maxSize || img.height > maxSize) {
            const canvas = document.createElement('canvas')
            const scale = Math.min(maxSize / img.width, maxSize / img.height)
            canvas.width = img.width * scale
            canvas.height = img.height * scale
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            // 使用 JPEG 格式可以更好地壓縮（質量 0.85）
            processedImageDataUrl = canvas.toDataURL('image/jpeg', 0.85)
            console.log(`角色圖片已壓縮: ${img.width}x${img.height} -> ${canvas.width}x${canvas.height} (JPEG 85%)`)
          }
          resolve()
        }
        img.onerror = () => {
          console.warn('圖片載入失敗，使用原圖')
          resolve() // 不拋出錯誤，繼續使用原圖
        }
        // 設置超時，避免無限等待
        setTimeout(() => {
          if (!img.complete) {
            console.warn('圖片載入超時，使用原圖')
            resolve()
          }
        }, 5000)
      })
    } catch (compressError) {
      console.warn('圖片壓縮失敗，使用原圖:', compressError)
      // 如果壓縮失敗，繼續使用原圖
    }
    
    let base64Data
    if (processedImageDataUrl.includes(',')) {
      base64Data = processedImageDataUrl.split(',')[1]
    } else {
      base64Data = processedImageDataUrl
    }
    
    if (!base64Data || base64Data.length === 0) {
      throw new Error('無法提取圖片 base64 數據')
    }
    
    base64Data = base64Data.trim().replace(/\s/g, '')
    
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new Error('base64 數據格式無效')
    }
    
    if (base64Data.length < 100) {
      throw new Error('base64 數據長度不足')
    }
    
    // 檢查 base64 數據大小（約 4MB 限制，base64 比原始數據大約 33%）
    const base64SizeMB = (base64Data.length * 3 / 4) / (1024 * 1024)
    if (base64SizeMB > 3) {
      console.warn(`警告：圖片數據較大 (${base64SizeMB.toFixed(2)}MB)，可能導致 API 請求失敗`)
    }

    // 壓縮前一張八宮格圖片作為風格參考
    let previousGridBase64 = null
    if (previousGridImageDataUrl) {
      try {
        const prevImg = new Image()
        prevImg.crossOrigin = 'anonymous'
        prevImg.src = previousGridImageDataUrl
        await new Promise((resolve) => {
          prevImg.onload = () => {
            const maxSize = 512
            const canvas = document.createElement('canvas')
            const scale = Math.min(maxSize / prevImg.width, maxSize / prevImg.height)
            canvas.width = prevImg.width * scale
            canvas.height = prevImg.height * scale
            const ctx = canvas.getContext('2d')
            ctx.drawImage(prevImg, 0, 0, canvas.width, canvas.height)
            const compressed = canvas.toDataURL('image/jpeg', 0.85)
            previousGridBase64 = compressed.split(',')[1]
            console.log(`前一張八宮格已壓縮: ${prevImg.width}x${prevImg.height} -> ${canvas.width}x${canvas.height}`)
            resolve()
          }
          prevImg.onerror = () => { console.warn('前一張八宮格載入失敗，跳過風格參考'); resolve() }
          setTimeout(() => { if (!prevImg.complete) resolve() }, 5000)
        })
      } catch (err) {
        console.warn('前一張八宮格壓縮失敗:', err)
      }
    }

    const parts = [
      { text: prompt },
      { inlineData: { mimeType: 'image/png', data: base64Data } }
    ]
    if (previousGridBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: previousGridBase64 } })
    }

    const requestBody = {
      contents: [{
        parts
      }],
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    }
    
    console.log('發送8宮格圖片生成請求:', {
      promptLength: prompt.length,
      base64Length: base64Data.length,
      stickersCount: stickers.length
    })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 150000) // 8宮格需要更長時間，150秒（2.5分鐘）

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      )
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('請求超時（超過150秒），請稍後再試')
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 錯誤詳情:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      const errorMessage = errorData.error?.message || errorData.message || response.statusText
      throw new Error(`API 錯誤: ${errorMessage}`)
    }

    const data = await response.json()
    console.log('生成8宮格 - API 完整回應:', JSON.stringify(data, null, 2))
    
    if (data.error) {
      throw new Error(`API 錯誤: ${data.error.message || JSON.stringify(data.error)}`)
    }
    
    // 檢查 promptFeedback 中的 blockReason（PROHIBITED_CONTENT 等）
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      const blockReason = data.promptFeedback.blockReason
      const blockMessage = data.promptFeedback.blockMessage || ''
      
      let errorMessage = `內容被 Google 安全過濾器阻止 (${blockReason})`
      
      if (blockReason === 'PROHIBITED_CONTENT') {
        errorMessage = `生成的內容被 Google 安全過濾器判定為違規內容。\n\n可能的原因：\n1. 輸入的圖片內容觸發了安全策略\n2. 描述文字中包含可能敏感的詞彙\n3. 生成的內容被誤判為不當內容\n\n建議：\n1. 檢查輸入的角色圖片是否包含可能敏感的內容\n2. 嘗試調整貼圖描述，使用更中性的詞彙\n3. 簡化或修改某些貼圖的文字內容\n4. 如果認為這是誤判，可以稍後再試或向 Google 反饋\n\n詳細信息：${blockMessage || '無額外說明'}`
      } else if (blockReason === 'SAFETY') {
        errorMessage = `內容被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${blockMessage || '無額外說明'}`
      }
      
      throw new Error(errorMessage)
    }
    
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0]
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Finish reason:', candidate.finishReason)
        const finishMessage = candidate.finishMessage || ''
        
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
          const errorMsg = finishMessage || '生成的圖片被 Google 安全過濾器阻止。'
          throw new Error(`圖片生成被安全過濾器阻止。\n\n詳細信息：${errorMsg}`)
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('內容可能包含受版權保護的內容，請調整描述')
        }
      }
      
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          }
          if (part.image && part.image.url) {
            const imageResponse = await fetch(part.image.url)
            const blob = await imageResponse.blob()
            return await blobToDataURL(blob)
          }
          if (part.image && part.image.data) {
            return `data:image/png;base64,${part.image.data}`
          }
        }
      }
      
      if (candidate.imageData) {
        return `data:image/png;base64,${candidate.imageData}`
      }
    }

    if (data.images && data.images.length > 0) {
      const imageData = data.images[0]
      if (imageData.base64) {
        return `data:image/png;base64,${imageData.base64}`
      }
      if (imageData.url) {
        const imageResponse = await fetch(imageData.url)
        const blob = await imageResponse.blob()
        return await blobToDataURL(blob)
      }
    }

    console.error('無法找到圖片數據，完整回應:', data)
    throw new Error(`API 回應中沒有找到圖片數據。回應格式: ${JSON.stringify(data).substring(0, 500)}`)
  } catch (error) {
    console.error('生成8宮格失敗:', error)
    throw error
  }
}

/**
 * 生成帶文字的貼圖圖片（用於 8 宮格）
 * @param {string} apiKey - Gemini API Key
 * @param {string} characterImageDataUrl - 角色圖片（Data URL）
 * @param {string} description - 圖片描述
 * @param {string} text - 要添加的文字
 * @param {string} textStyleDescription - 文字樣式描述
 * @param {number} width - 圖片寬度
 * @param {number} height - 圖片高度
 * @returns {Promise<string>} 生成的圖片 Data URL
 */
export async function generateStickerWithText(
  apiKey,
  characterImageDataUrl,
  description,
  text,
  textStyleDescription = '',
  width = 370,
  height = 320
) {
  // 確保 textStyleDescription 不是 undefined 或空
  const safeTextStyle = textStyleDescription && textStyleDescription.trim() 
    ? textStyleDescription.trim() 
    : 'Cute and clear style with visible text box'

  // 構建更嚴格的 prompt，確保文字只出現一次
  const textInstruction = `⚠️ ABSOLUTE REQUIREMENT - NO EXCEPTIONS ⚠️
The text "${text}" MUST appear EXACTLY ONE TIME in the image.
- Write "${text}" ONCE, not twice, not three times
- DO NOT repeat "${text}" anywhere in the image
- DO NOT duplicate "${text}" in any form
- Place "${text}" in ONE single location
- Before finalizing, verify "${text}" appears only 1 time (count it: must be 1, not 2 or more)`

  const textStyleInstruction = `🎨 TEXT STYLE REQUIREMENT - CRITICAL 🎨
The text "${text}" must have a CLEAR and VISIBLE text box/background:
- Add a solid color background box behind the text "${text}"
- Use bright, contrasting colors (white, yellow, light blue, pink, etc.)
- The text box should have clear borders or shadows
- Ensure the text "${text}" is highly visible against dark LINE backgrounds
- The text box color should contrast strongly with the text color
- Recommended: White or light colored text box with dark text, OR dark text box with white/light text
- The text box should be clearly defined, not transparent or faint
- Make sure the text "${text}" stands out clearly and is easily readable`

  // 清理描述和文字，避免觸發安全過濾
  const cleanDescription = description.trim()
  const cleanText = text.trim()
  
  const prompt = `Create a cute and friendly LINE sticker style illustration.

Character Reference: Use the provided character image as reference for style and appearance.
${STRICT_CONSISTENCY_RULES}
Scene Description: ${cleanDescription}
Text Content: "${cleanText}"
Text Style Guidelines: ${safeTextStyle}

${textInstruction}

${textStyleInstruction}

IMPORTANT: Follow the text style description "${safeTextStyle}" consistently. All text in this image must use the same style.

Technical Requirements:
1. Use the character design from the reference image
2. Maintain visual consistency with the reference character
3. Display the text "${cleanText}" exactly once in a single, clear location
4. Add a solid, brightly colored background box behind the text "${cleanText}" for visibility
5. Use bright, contrasting colors (white, yellow, light blue, pink) for the text box
6. White background (solid white color, not transparent)
${IMAGE_VISIBILITY_RULES}
7. Exact image dimensions: ${width}px width × ${height}px height
8. Cute, expressive, and friendly illustration style suitable for messaging stickers
9. High quality, professional digital illustration
10. Safe, appropriate, and family-friendly content

Final Verification: 
- Ensure the text "${cleanText}" appears exactly 1 time (count: must be 1)
- Verify the text "${cleanText}" has a clear, visible background box
- Confirm the text is readable on both light and dark backgrounds`

  try {
    // 檢查並提取 base64 數據
    if (!characterImageDataUrl) {
      throw new Error('角色圖片數據為空')
    }
    
    let base64Data
    if (characterImageDataUrl.includes(',')) {
      base64Data = characterImageDataUrl.split(',')[1]
    } else {
      base64Data = characterImageDataUrl
    }
    
    if (!base64Data || base64Data.length === 0) {
      throw new Error('無法提取圖片 base64 數據')
    }
    
    // 清理 base64 數據（移除可能的空白字符）
    base64Data = base64Data.trim().replace(/\s/g, '')
    
    // 驗證 base64 格式
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new Error('base64 數據格式無效，包含非法字符')
    }
    
    // 檢查 base64 長度（圖片應該有一定大小）
    if (base64Data.length < 100) {
      throw new Error('base64 數據長度不足，可能不是有效的圖片數據')
    }

    // 構建請求體
    // 注意：根據最初可用的版本，應該包含 maxOutputTokens
    const requestBody = {
      contents: [{
        parts: [
          {
            text: prompt
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Data
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 0.8,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 2048,
      }
    }
    
    console.log('發送圖片生成請求:', {
      promptLength: prompt.length,
      base64Length: base64Data.length,
      model: 'gemini-3-pro-image-preview'
    })

    // 添加超時控制（60秒）
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    let response
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        }
      )
      clearTimeout(timeoutId)
    } catch (fetchError) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        throw new Error('請求超時（超過60秒），請稍後再試或減少同時生成的數量')
      }
      throw fetchError
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('API 錯誤詳情:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      })
      const errorMessage = errorData.error?.message || errorData.message || response.statusText
      throw new Error(`API 錯誤: ${errorMessage}`)
    }

    const data = await response.json()
    console.log('生成貼圖 - API 完整回應:', JSON.stringify(data, null, 2))
    
    // 檢查是否有錯誤
    if (data.error) {
      throw new Error(`API 錯誤: ${data.error.message || JSON.stringify(data.error)}`)
    }
    
    // 檢查 promptFeedback 中的 blockReason（PROHIBITED_CONTENT 等）
    if (data.promptFeedback && data.promptFeedback.blockReason) {
      const blockReason = data.promptFeedback.blockReason
      const blockMessage = data.promptFeedback.blockMessage || ''
      
      let errorMessage = `內容被 Google 安全過濾器阻止 (${blockReason})`
      
      if (blockReason === 'PROHIBITED_CONTENT') {
        errorMessage = `生成的內容被 Google 安全過濾器判定為違規內容。\n\n可能的原因：\n1. 輸入的圖片內容觸發了安全策略\n2. 描述文字中包含可能敏感的詞彙\n3. 生成的內容被誤判為不當內容\n\n建議：\n1. 檢查輸入的角色圖片是否包含可能敏感的內容\n2. 嘗試調整描述文字，使用更中性的詞彙\n3. 如果認為這是誤判，可以稍後再試或向 Google 反饋\n\n詳細信息：${blockMessage || '無額外說明'}`
      } else if (blockReason === 'SAFETY') {
        errorMessage = `內容被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${blockMessage || '無額外說明'}`
      }
      
      throw new Error(errorMessage)
    }
    
    // 檢查 finishReason
    if (data.candidates && data.candidates[0]) {
      const candidate = data.candidates[0]
      
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn('Finish reason:', candidate.finishReason)
        if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'IMAGE_SAFETY') {
          const finishMessage = candidate.finishMessage || ''
          const errorMsg = finishMessage || '生成的圖片被 Google 安全過濾器阻止。這可能是因為 prompt 中的某些內容觸發了安全策略。'
          throw new Error(`圖片生成被安全過濾器阻止。\n\n建議：\n1. 嘗試調整描述文字，避免可能敏感的內容\n2. 簡化 prompt，使用更中性的描述\n3. 如果認為這是誤判，可以向 Google 反饋\n\n詳細信息：${errorMsg}`)
        }
        if (candidate.finishReason === 'RECITATION') {
          throw new Error('內容可能包含受版權保護的內容')
        }
      }
      
      // 檢查 content.parts
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          // 檢查內聯圖片數據
          if (part.inlineData) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          }
          // 檢查圖片 URL
          if (part.image && part.image.url) {
            const imageResponse = await fetch(part.image.url)
            const blob = await imageResponse.blob()
            return await blobToDataURL(blob)
          }
          // 檢查是否有 base64 數據
          if (part.image && part.image.data) {
            return `data:image/png;base64,${part.image.data}`
          }
        }
      }
      
      // 檢查是否有直接的圖片數據
      if (candidate.imageData) {
        return `data:image/png;base64,${candidate.imageData}`
      }
      
      // 如果只有文本回應，記錄並拋出錯誤
      if (candidate.content && candidate.content.parts) {
        const textParts = candidate.content.parts.filter(p => p.text)
        if (textParts.length > 0) {
          console.error('API 返回了文本而不是圖片:', textParts.map(p => p.text).join('\n'))
          throw new Error(`API 返回了文本回應而不是圖片。回應內容: ${textParts[0].text.substring(0, 200)}`)
        }
      }
    }

    // 如果標準格式沒有圖片，嘗試其他可能的格式
    if (data.images && data.images.length > 0) {
      const imageData = data.images[0]
      if (imageData.base64) {
        return `data:image/png;base64,${imageData.base64}`
      }
      if (imageData.url) {
        const imageResponse = await fetch(imageData.url)
        const blob = await imageResponse.blob()
        return await blobToDataURL(blob)
      }
    }

    // 詳細的錯誤信息
    console.error('無法找到圖片數據，完整回應:', data)
    throw new Error(`API 回應中沒有找到圖片數據。回應格式: ${JSON.stringify(data).substring(0, 500)}`)
  } catch (error) {
    console.error('生成貼圖失敗:', error)
    throw error
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
