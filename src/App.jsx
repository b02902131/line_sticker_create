import React, { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'
import { generateImageDescriptionsWithText, generateTextStyle, generateSingleDescription, generateSingleText, generateSingleDescriptionFromText } from './utils/gemini'
import { generateCharacter, generateStickerWithText, generateMainImage, generateGrid8Image } from './utils/characterGenerator'
import { createGrid8, splitGrid8, removeBackgroundSimple, removeBackgroundFromPoint, removeBackgroundByColor, pickColorFromImage, createTabFromCharacter, fileToDataURL } from './utils/imageUtils'
import { downloadAsZip } from './utils/zipDownloader'
import { saveCharacterImages, loadCharacterImages, deleteCharacterImages, hasCharacterImages } from './utils/imageStore'
import { syncSaveCharacters, syncLoadCharacters, syncSaveDescs, syncLoadDescs, syncDeleteDescs } from './utils/localSync'
import { STICKER_SPECS, getSpec, DEFAULT_SPEC_KEY } from './utils/stickerSpecs'

const LS_KEY = 'stampmill_draft'
const LS_CHARACTERS = 'stampmill_characters'

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {} } catch { return {} }
}
function loadCharacters() {
  try { return JSON.parse(localStorage.getItem(LS_CHARACTERS)) || [] } catch { return [] }
}

function loadCharDescs(charId) {
  try { return JSON.parse(localStorage.getItem(`stampmill_descs_${charId}`)) || [] }
  catch { return [] }
}

function TabCropper({ imageDataUrl, onConfirm, onCancel, targetWidth = 96, targetHeight = 74, title = '裁切標籤圖片' }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [crop, setCrop] = useState(null)
  const [dragging, setDragging] = useState(null) // 'move' | 'resize' | null
  const dragStart = useRef(null)

  // 圖片載入後初始化裁切框
  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return
    const img = imgRef.current
    const displayW = img.width
    const displayH = img.height
    const ratio = targetWidth / targetHeight
    // 初始裁切框：佔圖片 60%，居中
    let cropW, cropH
    if (displayW / displayH > ratio) {
      cropH = displayH * 0.6
      cropW = cropH * ratio
    } else {
      cropW = displayW * 0.6
      cropH = cropW / ratio
    }
    setCrop({
      x: (displayW - cropW) / 2,
      y: (displayH - cropH) / 2,
      w: cropW,
      h: cropH
    })
  }, [imgLoaded])

  // 繪製 overlay
  useEffect(() => {
    if (!crop || !canvasRef.current || !imgRef.current) return
    const canvas = canvasRef.current
    const img = imgRef.current
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // 暗色遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // 裁切區域清除遮罩
    ctx.clearRect(crop.x, crop.y, crop.w, crop.h)
    // 裁切框邊框
    ctx.strokeStyle = '#4CAF50'
    ctx.lineWidth = 2
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h)
    // 右下角 resize handle
    ctx.fillStyle = '#4CAF50'
    ctx.fillRect(crop.x + crop.w - 8, crop.y + crop.h - 8, 8, 8)
  }, [crop])

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const handleDown = (e) => {
    e.preventDefault()
    if (!crop) return
    const pos = getPos(e)
    // 判斷是 resize 還是 move
    if (pos.x >= crop.x + crop.w - 16 && pos.y >= crop.y + crop.h - 16 &&
        pos.x <= crop.x + crop.w && pos.y <= crop.y + crop.h) {
      setDragging('resize')
    } else if (pos.x >= crop.x && pos.x <= crop.x + crop.w &&
               pos.y >= crop.y && pos.y <= crop.y + crop.h) {
      setDragging('move')
    }
    dragStart.current = { ...pos, crop: { ...crop } }
  }

  const handleMove = (e) => {
    if (!dragging || !dragStart.current || !imgRef.current) return
    e.preventDefault()
    const pos = getPos(e)
    const dx = pos.x - dragStart.current.x
    const dy = pos.y - dragStart.current.y
    const orig = dragStart.current.crop
    const maxW = imgRef.current.width
    const maxH = imgRef.current.height
    const ratio = targetWidth / targetHeight

    if (dragging === 'move') {
      let nx = orig.x + dx
      let ny = orig.y + dy
      nx = Math.max(0, Math.min(nx, maxW - orig.w))
      ny = Math.max(0, Math.min(ny, maxH - orig.h))
      setCrop({ ...orig, x: nx, y: ny })
    } else if (dragging === 'resize') {
      let nw = Math.max(30, orig.w + dx)
      let nh = nw / ratio
      if (orig.x + nw > maxW) { nw = maxW - orig.x; nh = nw / ratio }
      if (orig.y + nh > maxH) { nh = maxH - orig.y; nw = nh * ratio }
      setCrop({ ...orig, w: nw, h: nh })
    }
  }

  const handleUp = () => {
    setDragging(null)
    dragStart.current = null
  }

  const handleConfirm = () => {
    if (!crop || !imgRef.current) return
    const img = imgRef.current
    // 換算回原圖座標
    const natW = img.naturalWidth
    const natH = img.naturalHeight
    const scaleX = natW / img.width
    const scaleY = natH / img.height
    const sx = crop.x * scaleX
    const sy = crop.y * scaleY
    const sw = crop.w * scaleX
    const sh = crop.h * scaleY

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, targetWidth, targetHeight)

    const origImg = new Image()
    origImg.onload = () => {
      ctx.drawImage(origImg, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)
      onConfirm(canvas.toDataURL('image/png'))
    }
    origImg.src = imageDataUrl
  }

  return (
    <div>
      <h3>{title}</h3>
      <p style={{ fontSize: '0.85em', color: '#888' }}>拖曳移動裁切框，右下角可調整大小（固定 {targetWidth}:{targetHeight} 比例）</p>
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        <img
          ref={imgRef}
          src={imageDataUrl}
          alt="裁切來源"
          onLoad={() => setImgLoaded(true)}
          style={{ maxWidth: '400px', display: 'block' }}
        />
        {imgLoaded && (
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', top: 0, left: 0, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
            onMouseLeave={handleUp}
            onTouchStart={handleDown}
            onTouchMove={handleMove}
            onTouchEnd={handleUp}
          />
        )}
      </div>
      {crop && (
        <div style={{ marginTop: '10px' }}>
          <p style={{ fontSize: '0.85em', color: '#666' }}>預覽：</p>
          <canvas
            ref={(el) => {
              if (!el || !imgRef.current || !crop) return
              el.width = targetWidth; el.height = targetHeight
              const ctx = el.getContext('2d')
              ctx.clearRect(0, 0, targetWidth, targetHeight)
              const img = imgRef.current
              const scaleX = img.naturalWidth / img.width
              const scaleY = img.naturalHeight / img.height
              ctx.drawImage(img, crop.x * scaleX, crop.y * scaleY, crop.w * scaleX, crop.h * scaleY, 0, 0, targetWidth, targetHeight)
            }}
            style={{ border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button className="btn btn-success btn-inline" onClick={handleConfirm}>確認裁切</button>
        <button className="btn btn-secondary btn-inline" onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

function App() {
  const draft = useRef(loadDraft()).current

  // 頁面狀態
  const [characters, setCharacters] = useState(loadCharacters)
  const initChars = loadCharacters()
  const restoredChar = draft.selectedCharacterId ? initChars.find(c => c.id === draft.selectedCharacterId) : null
  const [selectedCharacter, setSelectedCharacter] = useState(restoredChar || null)
  const [page, setPage] = useState(restoredChar ? 'sticker-produce' : 'home')

  // 共用
  const [apiKey, setApiKey] = useState(draft.apiKey || '')

  // 角色設計
  const [characterDescription, setCharacterDescription] = useState(restoredChar?.description || '')
  const [theme, setTheme] = useState(restoredChar?.theme || '')
  const [uploadedCharacterImages, setUploadedCharacterImages] = useState([])
  const [characterImage, setCharacterImage] = useState(restoredChar?.imageDataUrl || null)
  const [characterImageHistory, setCharacterImageHistory] = useState([])
  const [characterConfirmed, setCharacterConfirmed] = useState(!!restoredChar)
  const [generatingCharacter, setGeneratingCharacter] = useState(false)
  const [characterName, setCharacterName] = useState('')

  // 貼圖生產
  const [count, setCount] = useState(draft.count || 8)
  const [textStyle, setTextStyle] = useState(draft.textStyle || '')
  const [generatingTextStyle, setGeneratingTextStyle] = useState(false)
  const [textStyleConfirmed, setTextStyleConfirmed] = useState(false)
  const [descriptions, setDescriptions] = useState(restoredChar ? loadCharDescs(restoredChar.id) : [])
  const [generatingDescriptions, setGeneratingDescriptions] = useState(false)
  const [excludedTexts, setExcludedTexts] = useState(draft.excludedTexts || '')
  const [characterStance, setCharacterStance] = useState(draft.characterStance || '')
  const [stickerTypeKey, setStickerTypeKey] = useState(draft.stickerTypeKey || DEFAULT_SPEC_KEY)
  const stickerSpec = getSpec(stickerTypeKey)

  // 儲存角色到 localStorage + 本地檔案
  const saveCharacters = (chars) => {
    setCharacters(chars)
    syncSaveCharacters(chars)
  }

  // 儲存角色
  const handleSaveCharacter = () => {
    if (!characterImage) { alert('請先生成或上傳角色圖片'); return }
    const name = characterName.trim() || theme.trim() || characterDescription.trim().slice(0, 20) || '未命名角色'
    const newChar = {
      id: crypto.randomUUID(),
      name,
      description: characterDescription,
      theme,
      imageDataUrl: characterImage,
      createdAt: new Date().toISOString()
    }
    saveCharacters([newChar, ...characters])
    // 重置表單
    setCharacterDescription('')
    setTheme('')
    setUploadedCharacterImages([])
    setCharacterImage(null)
    setCharacterImageHistory([])
    setCharacterConfirmed(false)
    setCharacterName('')
    setPage('home')
  }

  // 刪除角色
  const handleDeleteCharacter = (id) => {
    if (!confirm('確定要刪除這個角色嗎？')) return
    saveCharacters(characters.filter(c => c.id !== id))
    syncDeleteDescs(id)
    deleteCharacterImages(id).catch(() => {})
  }

  const saveCharDescs = (charId, descs) => {
    syncSaveDescs(charId, descs)
  }

  // 選角色進入生產
  const handleSelectCharacter = async (char) => {
    setSelectedCharacter(char)
    setCharacterImage(char.imageDataUrl)
    setCharacterDescription(char.description)
    setTheme(char.theme)
    setCharacterConfirmed(true)
    setPage('sticker-produce')

    // 先清除舊狀態
    setDescriptions([])
    setGridImages([])
    setProcessedGridImages([])
    setCutImages([])
    setMainImage(null)
    setTabImage(null)
    setBackgroundThreshold(240)
    setCurrentStep(1)

    // 讀取描述（優先從檔案）
    const descs = await syncLoadDescs(char.id)
    setDescriptions(descs)
    setTextStyleConfirmed(descs.length > 0)

    // 嘗試恢復已保存的圖片
    try {
      const saved = await loadCharacterImages(char.id)
      if (saved) {
        if (saved.gridImages?.length > 0) setGridImages(saved.gridImages)
        if (saved.processedGridImages?.length > 0) setProcessedGridImages(saved.processedGridImages)
        if (saved.cutImages?.length > 0) setCutImages(saved.cutImages)
        if (saved.rawCutImages?.length > 0) setRawCutImages(saved.rawCutImages)
        if (saved.mainImage) setMainImage(saved.mainImage)
        if (saved.tabImage) setTabImage(saved.tabImage)
        if (saved.rawTabImage) setRawTabImage(saved.rawTabImage)
        if (saved.backgroundThreshold) setBackgroundThreshold(saved.backgroundThreshold)
        if (saved.previewBgColor) setPreviewBgColor(saved.previewBgColor)
        // 根據已有數據跳到對應步驟
        if (saved.cutImages?.length > 0 && saved.mainImage && saved.tabImage) {
          setCurrentStep(9)
        } else if (saved.cutImages?.length > 0) {
          setCurrentStep(8)
        } else if (saved.processedGridImages?.length > 0) {
          setCurrentStep(7)
        } else if (saved.gridImages?.length > 0) {
          setCurrentStep(7)
        }
      }
    } catch (err) {
      console.warn('恢復圖片數據失敗:', err)
    }
  }

  // 記錄哪些角色已有貼圖
  const [charactersWithStickers, setCharactersWithStickers] = useState({})

  // 啟動時從本地檔案同步角色資料
  useEffect(() => {
    syncLoadCharacters().then(fileChars => {
      if (fileChars.length > 0) setCharacters(fileChars)
    })
  }, [])

  // 檢查角色是否已有貼圖
  useEffect(() => {
    characters.forEach(char => {
      if (charactersWithStickers[char.id] !== undefined) return
      hasCharacterImages(char.id).then(has => {
        if (has) setCharactersWithStickers(prev => ({ ...prev, [char.id]: true }))
      })
    })
  }, [characters])

  // 自動暫存到 localStorage
  useEffect(() => {
    const data = { apiKey, count, textStyle, excludedTexts, characterStance, stickerTypeKey, selectedCharacterId: selectedCharacter?.id }
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  }, [apiKey, count, textStyle, excludedTexts, characterStance, stickerTypeKey, selectedCharacter])

  // descriptions by character
  useEffect(() => {
    if (selectedCharacter?.id) saveCharDescs(selectedCharacter.id, descriptions)
  }, [descriptions, selectedCharacter])

  // 步驟 6-8: 8宮格生成、去背、裁切
  const [gridImages, setGridImages] = useState([]) // 8宮格圖片陣列
  const [processedGridImages, setProcessedGridImages] = useState([]) // 去背後的8宮格
  const [cutImages, setCutImages] = useState([]) // 裁切後的單張圖片（已去背）
  const [rawCutImages, setRawCutImages] = useState([]) // 裁切後的單張圖片（未去背原圖）
  const [mainImage, setMainImage] = useState(null) // 主要圖片 240x240
  const [tabImage, setTabImage] = useState(null) // 標籤圖片 96x74
  const [backgroundThreshold, setBackgroundThreshold] = useState(240) // 去背閾值
  const [processingBackground, setProcessingBackground] = useState(false) // 正在處理去背
  const [regeneratingMain, setRegeneratingMain] = useState(false)
  const [removingMainBg, setRemovingMainBg] = useState(false)
  const [rawMainImage, setRawMainImage] = useState(null) // 主要圖片未去背原圖
  const [mainThreshold, setMainThreshold] = useState(null) // null = 用全域
  const [rawTabImage, setRawTabImage] = useState(null) // 標籤圖片未去背原圖
  const [tabThreshold, setTabThreshold] = useState(null) // null = 用全域
  const [regeneratingTab, setRegeneratingTab] = useState(false)
  const [tabCropSource, setTabCropSource] = useState(null) // 選擇裁切來源圖片
  const [tabCropRect, setTabCropRect] = useState(null) // { x, y, w, h }
  const [mainCropSource, setMainCropSource] = useState(null) // 主要圖片裁切來源
  const [previewBackgroundDark, setPreviewBackgroundDark] = useState(false) // 預覽背景是否為深色（Step 7 用）
  const PREVIEW_BG_COLORS = [
    { color: '#ffffff', label: '白', border: '#ddd' },
    { color: '#ff00ff', label: '粉', border: '#ff00ff' },
    { color: '#6699cc', label: '藍', border: '#6699cc' },
    { color: '#000000', label: '黑', border: '#333' },
    { color: '#006633', label: '綠', border: '#006633' },
    { color: '#ff9933', label: '橘', border: '#ff9933' },
  ]
  const [previewBgColor, setPreviewBgColor] = useState('#ffffff') // Step 8-9 多色預覽
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState('')

  const [dragging, setDragging] = useState(false)

  // 自動保存圖片到 IndexedDB（防抖 1 秒）
  const saveTimerRef = useRef(null)
  useEffect(() => {
    if (!selectedCharacter?.id) return
    if (gridImages.length === 0 && cutImages.length === 0) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveCharacterImages(selectedCharacter.id, {
        gridImages,
        processedGridImages,
        cutImages,
        rawCutImages,
        mainImage,
        tabImage,
        rawTabImage,
        backgroundThreshold,
        previewBgColor
      }).catch(err => console.warn('保存圖片到 IndexedDB 失敗:', err))
    }, 1000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [gridImages, processedGridImages, cutImages, rawCutImages, mainImage, tabImage, rawTabImage, selectedCharacter, backgroundThreshold, previewBgColor])

  // 共用：處理圖片檔案（支援多張）
  const handleImageFiles = useCallback(async (files) => {
    const newImages = []
    for (const file of files) {
      if (file && file.type.startsWith('image/')) {
        const dataUrl = await fileToDataURL(file)
        newImages.push(dataUrl)
      }
    }
    if (newImages.length > 0) {
      setUploadedCharacterImages(prev => {
        const all = [...prev, ...newImages]
        // 單張直接當角色圖用；多張需要 AI 生成
        if (all.length === 1) setCharacterImage(all[0])
        else setCharacterImage(null)
        return all
      })
      setCharacterConfirmed(false)
    }
  }, [characterImage])

  // 處理角色圖片上傳
  const handleCharacterUpload = async (e) => {
    handleImageFiles(Array.from(e.target.files))
  }

  // 拖拉放
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    handleImageFiles(Array.from(e.dataTransfer.files))
  }, [handleImageFiles])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragging(false)
  }, [])

  // 貼上圖片
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files = []
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          files.push(item.getAsFile())
        }
      }
      if (files.length > 0) handleImageFiles(files)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handleImageFiles])

  // 步驟 4: 生成角色
  const handleGenerateCharacter = async () => {
    if (!apiKey.trim()) {
      alert('請輸入 Gemini API Key')
      return
    }
    if (!characterDescription.trim() && uploadedCharacterImages.length === 0) {
      alert('請輸入角色描述或上傳角色圖片')
      return
    }

    setGeneratingCharacter(true)
    setProgress('正在生成角色圖片...')

    try {
      const character = await generateCharacter(apiKey, characterDescription || theme, uploadedCharacterImages, characterDescription)
      setCharacterImage(character)
      setCharacterImageHistory(prev => [...prev, character])
      setCharacterConfirmed(false) // 需要用戶確認
      setProgress('角色生成完成，請確認是否符合要求')
    } catch (error) {
      console.error('生成角色失敗:', error)
      alert(`生成角色失敗: ${error.message}`)
      setProgress('')
    } finally {
      setGeneratingCharacter(false)
    }
  }

  // 確認角色
  const handleConfirmCharacter = () => {
    setCharacterConfirmed(true)
  }
  
  // 步驟 5: 生成文字風格描述
  const handleGenerateTextStyle = async () => {
    if (!apiKey.trim()) {
      alert('請輸入 Gemini API Key')
      return
    }
    if (!theme.trim()) {
      alert('請輸入主題說明')
      return
    }

    setGeneratingTextStyle(true)
    setProgress('正在生成文字風格描述...')

    try {
      const style = await generateTextStyle(apiKey, theme, characterDescription)
      setTextStyle(style)
      setTextStyleConfirmed(true)
      setProgress('文字風格描述生成完成，可以編輯後繼續')
    } catch (error) {
      console.error('生成文字風格失敗:', error)
      alert(`生成文字風格失敗: ${error.message}`)
      setProgress('')
    } finally {
      setGeneratingTextStyle(false)
    }
  }

  // 重新生成角色
  const handleRegenerateCharacter = () => {
    setCharacterImage(null)
    setCharacterConfirmed(false)
    setCurrentStep(4)
  }

  // 步驟 6: 生成文字描述
  const handleGenerateDescriptions = async () => {
    if (!apiKey.trim()) {
      alert('請輸入 Gemini API Key')
      return
    }
    if (!theme.trim()) {
      alert('請輸入主題說明')
      return
    }

    setGeneratingDescriptions(true)
    
    // 如果沒有文字風格描述，先自動生成
    let finalTextStyle = textStyle
    if (!textStyle.trim()) {
      setProgress('正在自動生成文字風格描述...')
      try {
        finalTextStyle = await generateTextStyle(apiKey, theme, characterDescription)
        setTextStyle(finalTextStyle)
        setProgress('文字風格已自動生成，正在生成文字描述...')
      } catch (error) {
        console.error('自動生成文字風格失敗:', error)
        // 如果自動生成失敗，使用預設值
        finalTextStyle = '可愛簡潔的風格，文字清晰易讀，使用明亮的文字框背景'
        setTextStyle(finalTextStyle)
        setProgress('使用預設文字風格，正在生成文字描述...')
      }
    } else {
      setProgress('正在生成文字描述...')
    }

    try {
      // 處理排除文字：將文字按行分割，過濾空行，去除前後空白
      const excludedTextList = excludedTexts
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
      
      const items = await generateImageDescriptionsWithText(
        apiKey,
        theme,
        finalTextStyle,
        count,
        excludedTextList,
        characterStance.trim(),
        characterDescription
      )
      setDescriptions(items)
      setProgress('文字描述生成完成，可以編輯後繼續')
    } catch (error) {
      console.error('生成描述失敗:', error)
      const errorMessage = error.message || error.toString() || '未知錯誤'
      
      // 檢查是否為 overloaded 錯誤
      if (errorMessage.includes('overloaded') || errorMessage.includes('overload') || errorMessage.includes('503')) {
        alert(`生成描述失敗：API 服務器過載\n\n錯誤信息：${errorMessage}\n\n建議：\n1. 等待幾秒後再試\n2. 如果持續失敗，可能是 API 服務器負載過高，請稍後再試`)
      } else {
        alert(`生成描述失敗: ${errorMessage}`)
      }
      setProgress('')
    } finally {
      setGeneratingDescriptions(false)
    }
  }

  // 初始化空的描述列表
  const handleInitDescriptions = () => {
    if (descriptions.length === count) return
    const items = Array.from({ length: count }, (_, i) => (
      descriptions[i] || { description: '', text: '' }
    ))
    setDescriptions(items)
  }

  // 從文字清單匯入
  const [bulkText, setBulkText] = useState('')
  const handleImportBulkText = () => {
    const lines = bulkText
      .split('\n')
      .map(line => line.replace(/^[-*]\s*\[[ x]?\]\s*/g, '').replace(/^\d+\.\s*/, '').trim()) // 去掉 - [ ] 或編號前綴
      .filter(line => line.length > 0)
    if (lines.length === 0) { alert('沒有偵測到文字'); return }
    const items = lines.map(line => {
      // 支援「文字：描述」或「文字:描述」格式
      const colonIdx = line.search(/[：:]/)
      if (colonIdx !== -1) {
        return {
          text: line.slice(0, colonIdx).trim(),
          description: line.slice(colonIdx + 1).trim()
        }
      }
      return { description: '', text: line }
    })
    // 追加模式：跳過已有相同文字的，只加新的
    const existingTexts = new Set(descriptions.map(d => d.text?.trim()).filter(Boolean))
    const newItems = items.filter(item => !existingTexts.has(item.text?.trim()))
    if (newItems.length === 0) { alert('所有文字都已存在，沒有新增'); return }
    const merged = [...descriptions, ...newItems]
    setDescriptions(merged)
    setCount(merged.length)
    setBulkText('')
  }

  // 單張生成（文字+描述一起）
  const [generatingSingle, setGeneratingSingle] = useState(null)
  const handleGenerateSingle = async (index) => {
    if (!apiKey.trim()) { alert('請輸入 Gemini API Key'); return }
    setGeneratingSingle(index)
    let finalTextStyle = textStyle
    if (!finalTextStyle.trim()) {
      try { finalTextStyle = await generateTextStyle(apiKey, theme, characterDescription); setTextStyle(finalTextStyle) }
      catch { finalTextStyle = '可愛簡潔的風格' }
    }
    try {
      const existingTexts = descriptions.map(d => d.text).filter(Boolean)
      const item = await generateSingleDescription(apiKey, theme, finalTextStyle, characterDescription, existingTexts, characterStance)
      const newDescriptions = [...descriptions]
      newDescriptions[index] = item
      setDescriptions(newDescriptions)
    } catch (error) { alert(`生成失敗: ${error.message}`) }
    finally { setGeneratingSingle(null) }
  }

  // 單張 AI 生成文字
  const [generatingText, setGeneratingText] = useState(null)
  const handleGenerateText = async (index) => {
    if (!apiKey.trim()) { alert('請輸入 Gemini API Key'); return }
    setGeneratingText(index)
    let finalTextStyle = textStyle
    if (!finalTextStyle.trim()) {
      try { finalTextStyle = await generateTextStyle(apiKey, theme, characterDescription); setTextStyle(finalTextStyle) }
      catch { finalTextStyle = '可愛簡潔的風格' }
    }
    try {
      const existingTexts = descriptions.map(d => d.text).filter(Boolean)
      const text = await generateSingleText(apiKey, theme, finalTextStyle, characterDescription, existingTexts, characterStance)
      const newDescriptions = [...descriptions]
      newDescriptions[index] = { ...newDescriptions[index], text }
      setDescriptions(newDescriptions)
    } catch (error) { alert(`生成文字失敗: ${error.message}`) }
    finally { setGeneratingText(null) }
  }

  // 單張 AI 生成描述（根據已有文字）
  const [generatingDesc, setGeneratingDesc] = useState(null)
  const handleGenerateDesc = async (index) => {
    if (!apiKey.trim()) { alert('請輸入 Gemini API Key'); return }
    const stickerText = descriptions[index]?.text
    if (!stickerText?.trim()) { alert('請先填寫文字，AI 會根據文字生成描述'); return }
    setGeneratingDesc(index)
    let finalTextStyle = textStyle
    if (!finalTextStyle.trim()) {
      try { finalTextStyle = await generateTextStyle(apiKey, theme, characterDescription); setTextStyle(finalTextStyle) }
      catch { finalTextStyle = '可愛簡潔的風格' }
    }
    try {
      const desc = await generateSingleDescriptionFromText(apiKey, theme, finalTextStyle, characterDescription, stickerText, characterStance)
      const newDescriptions = [...descriptions]
      newDescriptions[index] = { ...newDescriptions[index], description: desc }
      setDescriptions(newDescriptions)
    } catch (error) { alert(`生成描述失敗: ${error.message}`) }
    finally { setGeneratingDesc(null) }
  }

  // 批次 AI 生成空白描述
  const [batchGeneratingDesc, setBatchGeneratingDesc] = useState(null) // null or '2/5' progress string
  const handleBatchGenerateDesc = async () => {
    if (!apiKey.trim()) { alert('請輸入 Gemini API Key'); return }
    const emptyIndices = descriptions.map((d, i) => (!d.description?.trim() && d.text?.trim()) ? i : -1).filter(i => i !== -1)
    if (emptyIndices.length === 0) { alert('所有有文字的項目都已有描述'); return }
    setBatchGeneratingDesc(`0/${emptyIndices.length}`)
    let finalTextStyle = textStyle
    if (!finalTextStyle.trim()) {
      try { finalTextStyle = await generateTextStyle(apiKey, theme, characterDescription); setTextStyle(finalTextStyle) }
      catch { finalTextStyle = '可愛簡潔的風格' }
    }
    const newDescriptions = [...descriptions]
    for (let i = 0; i < emptyIndices.length; i++) {
      const idx = emptyIndices[i]
      setBatchGeneratingDesc(`${i + 1}/${emptyIndices.length}`)
      setProgress(`正在補齊描述（${i + 1}/${emptyIndices.length}）：第 ${idx + 1} 張「${newDescriptions[idx].text}」...`)
      try {
        const desc = await generateSingleDescriptionFromText(apiKey, theme, finalTextStyle, characterDescription, newDescriptions[idx].text, characterStance)
        newDescriptions[idx] = { ...newDescriptions[idx], description: desc }
        setDescriptions([...newDescriptions])
      } catch (error) { console.warn(`描述 ${idx + 1} 生成失敗:`, error.message) }
    }
    setProgress('')
    setBatchGeneratingDesc(null)
  }

  // 刪除單張
  const handleDeleteDescription = (index) => {
    const newDescriptions = descriptions.filter((_, i) => i !== index)
    setDescriptions(newDescriptions)
    setCount(newDescriptions.length)
  }

  // 拖拉排序
  const [dragIdx, setDragIdx] = useState(null)
  const handleDragStart2 = (index) => { setDragIdx(index) }
  const handleDragOver2 = (e, index) => { e.preventDefault() }
  const handleDrop2 = (index) => {
    if (dragIdx === null || dragIdx === index) return
    const items = [...descriptions]
    const [moved] = items.splice(dragIdx, 1)
    items.splice(index, 0, moved)
    setDescriptions(items)
    setDragIdx(null)
  }

  // 匯出文字清單
  const handleExportDescriptions = () => {
    const text = descriptions.map(d => {
      if (d.description?.trim()) return `${d.text}：${d.description}`
      return d.text || ''
    }).filter(Boolean).join('\n')
    navigator.clipboard.writeText(text).then(() => {
      alert(`已複製 ${descriptions.length} 張貼圖文字到剪貼簿`)
    }).catch(() => {
      // fallback: 顯示在 textarea 讓使用者手動複製
      prompt('複製以下內容：', text)
    })
  }

  // 更新描述
  const handleUpdateDescription = (index, field, value) => {
    const newDescriptions = [...descriptions]
    newDescriptions[index][field] = value
    setDescriptions(newDescriptions)
  }

  // 步驟 6-8: 生成8宮格、去背、裁切
  const handleGenerateStickers = async () => {
    if (!characterImage) {
      alert('請先生成或上傳角色圖片')
      return
    }
    if (descriptions.length === 0) {
      alert('請先生成文字描述')
      return
    }

    // 檢查文字是否重複（只檢查有文字的貼圖）
    const textSet = new Set()
    const duplicateTexts = []
    for (let i = 0; i < descriptions.length; i++) {
      const text = descriptions[i].text?.trim()
      if (!text) continue
      if (textSet.has(text)) {
        duplicateTexts.push({ index: i + 1, text })
      } else {
        textSet.add(text)
      }
    }

    if (duplicateTexts.length > 0) {
      const duplicateList = duplicateTexts.map(d => `第 ${d.index} 張: "${d.text}"`).join('\n')
      alert(`發現重複的文字，請修改後再生成：\n${duplicateList}`)
      return
    }

    setLoading(true)
    setProgress('開始生成貼圖...')

    try {
      const gridCount = Math.ceil(count / 8) // 需要多少張8宮格
      const allGridImages = []
      const allProcessedImages = []
      const allCutImages = []

      // 生成所有8宮格（直接生成包含8宮格的圖片）
      for (let gridIndex = 0; gridIndex < gridCount; gridIndex++) {
        // 在生成每張8宮格之間添加延遲，避免請求過於頻繁
        if (gridIndex > 0) {
          const delay = 3000 // 3秒延遲
          setProgress(`等待 ${delay / 1000} 秒後生成下一張8宮格（避免 API 過載）...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
        
        setProgress(`正在生成第 ${gridIndex + 1}/${gridCount} 張8宮格圖片...`)
        
        // 獲取當前8宮格的8個貼圖描述
        const startIndex = gridIndex * 8
        const endIndex = Math.min(startIndex + 8, count)
        const gridStickers = []
        
        for (let i = startIndex; i < endIndex; i++) {
          gridStickers.push(descriptions[i])
        }
        
        // 如果不足8張，用空白描述填充（最後一張8宮格可能不足8張）
        while (gridStickers.length < 8) {
          gridStickers.push({
            description: '空白貼圖',
            text: ''
          })
        }
        
        // 驗證文字不重複
        const texts = gridStickers.map(s => s.text).filter(Boolean)
        const uniqueTexts = new Set(texts)
        if (texts.length !== uniqueTexts.size) {
          console.warn('警告：當前8宮格中有重複文字，將繼續生成')
        }
        
        // 直接生成包含8宮格的圖片
        let gridImage = null
        let retryCount = 0
        const maxRetries = 5 // 增加重試次數到 5 次
        
        while (!gridImage && retryCount < maxRetries) {
          try {
            const previousGrid = gridIndex > 0 ? allGridImages[gridIndex - 1] : null
            gridImage = await generateGrid8Image(
              apiKey,
              characterImage,
              gridStickers,
              textStyle || '',
              previousGrid,
              stickerSpec
            )
          } catch (error) {
            retryCount++
            if (retryCount < maxRetries) {
              // 檢查是否為 overloaded 錯誤，使用更長的等待時間
              const isOverloaded = error.message && (
                error.message.includes('overloaded') || 
                error.message.includes('overload') ||
                error.message.includes('請稍後再試')
              )
              
              // 使用指數退避策略
              // 對於 overloaded 錯誤：10秒、20秒、40秒、80秒
              // 對於其他錯誤：5秒、10秒、20秒、40秒
              const baseDelay = isOverloaded ? 10000 : 5000
              const delay = baseDelay * Math.pow(2, retryCount - 1)
              
              console.warn(`生成8宮格失敗，重試中 (${retryCount}/${maxRetries})...`, error.message)
              setProgress(`生成8宮格失敗，正在重試 (${retryCount}/${maxRetries})，等待 ${Math.round(delay / 1000)} 秒...`)
              await new Promise(resolve => setTimeout(resolve, delay))
            } else {
              console.error(`生成8宮格失敗，已重試 ${maxRetries} 次:`, error)
              throw new Error(`生成第 ${gridIndex + 1} 張8宮格失敗（已重試 ${maxRetries} 次）: ${error.message}`)
            }
          }
        }
        
        if (gridImage) {
          allGridImages.push(gridImage)
        }
      }

      setGridImages(allGridImages)
      // 自動進行初始去背
      setProgress('正在進行自動去背...')
      const initialProcessed = []
      for (let i = 0; i < allGridImages.length; i++) {
        setProgress(`正在為第 ${i + 1}/${allGridImages.length} 張8宮格去背...`)
        const processed = await removeBackgroundSimple(allGridImages[i], backgroundThreshold, null)
        initialProcessed.push(processed)
      }
      setProcessedGridImages(initialProcessed)
      setCurrentStep(7) // 進入去背調整步驟
      setProgress('去背完成，請調整去背程度後點擊「下一步」進行裁切')
    } catch (error) {
      console.error('生成失敗:', error)
      alert(`生成失敗: ${error.message}`)
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  // 步驟 7: 調整去背並應用
  const handleApplyBackgroundRemoval = async () => {
    setProcessingBackground(true)
    setProgress('正在重新處理去背...')
    
    try {
      const newProcessed = []
      for (let i = 0; i < gridImages.length; i++) {
        setProgress(`正在為第 ${i + 1}/${gridImages.length} 張8宮格重新去背...`)
        const processed = await removeBackgroundSimple(gridImages[i], backgroundThreshold, null)
        newProcessed.push(processed)
      }
      setProcessedGridImages(newProcessed)
      setProgress('去背已更新')
    } catch (error) {
      console.error('去背處理失敗:', error)
      alert(`去背處理失敗: ${error.message}`)
    } finally {
      setProcessingBackground(false)
    }
  }


  // 步驟 8: 裁切8宮格，然後生成主要圖片和標籤圖片
  const handleSplitGrids = async () => {
    if (processedGridImages.length === 0) {
      alert('請先完成去背')
      return
    }

    setLoading(true)
    setProgress('正在裁切8宮格...')

    try {
      const allCutImages = []
      const allRawCutImages = []
      const gridCount = processedGridImages.length

      for (let gridIndex = 0; gridIndex < gridCount; gridIndex++) {
        setProgress(`正在裁切第 ${gridIndex + 1}/${gridCount} 張8宮格...`)
        const cutCells = await splitGrid8(processedGridImages[gridIndex], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
        // 也從原圖裁切保留未去背版本
        const rawCutCells = await splitGrid8(gridImages[gridIndex], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)

        // 計算這個8宮格實際有多少張貼圖
        const startIndex = gridIndex * 8
        const endIndex = Math.min(startIndex + 8, count)
        const actualCutCount = endIndex - startIndex

        allCutImages.push(...cutCells.slice(0, actualCutCount))
        allRawCutImages.push(...rawCutCells.slice(0, actualCutCount))
      }

      setCutImages(allCutImages)
      setRawCutImages(allRawCutImages)
      setProgress('裁切完成！正在生成主要圖片和標籤圖片...')

      // 生成主要圖片（240x240，無文字）— 已有則跳過。表情貼模式不需要主要圖片。
      if (stickerSpec.hasMain && !mainImage) {
        setProgress('正在生成主要圖片（240×240，無文字）...')
        const mainImg = await generateMainImage(apiKey, characterImage, theme)
        setRawMainImage(mainImg)
        const mainImgProcessed = await removeBackgroundSimple(mainImg, backgroundThreshold)
        setMainImage(mainImgProcessed)
      }

      // 從角色圖裁切去背生成標籤圖片（96x74）— 已有則跳過
      if (!tabImage) {
        setProgress('正在生成標籤圖片（96×74）...')
        const tabImg = await createTabFromCharacter(characterImage, backgroundThreshold)
        setTabImage(tabImg)
      }

      setCurrentStep(9)
      setProgress('完成！所有貼圖已生成，可以下載了')
    } catch (error) {
      console.error('處理失敗:', error)
      alert(`處理失敗: ${error.message}`)
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  // 步驟 9: 打包下載
  const handleDownload = async () => {
    if (cutImages.length === 0) {
      alert('請先生成貼圖')
      return
    }

    try {
      // 將裁切後的圖片轉換為下載格式
      const imagesForDownload = cutImages.map((dataUrl, index) => ({
        index: index + 1,
        description: descriptions[index]?.description || `貼圖 ${index + 1}`,
        dataUrl: dataUrl
      }))

      await downloadAsZip(imagesForDownload, mainImage, tabImage, theme, selectedCharacter?.name, stickerSpec)
    } catch (error) {
      console.error('下載失敗:', error)
      alert(`下載失敗: ${error.message}`)
    }
  }

  // 單組八宮格重產
  const [regeneratingGrid, setRegeneratingGrid] = useState(null)
  const handleRegenerateGrid = async (gridIndex) => {
    setRegeneratingGrid(gridIndex)
    setProgress(`正在重新生成第 ${gridIndex + 1} 組八宮格...`)
    try {
      const startIdx = gridIndex * 8
      const endIdx = Math.min(startIdx + 8, descriptions.length)
      let gridStickers = descriptions.slice(startIdx, endIdx)
      while (gridStickers.length < 8) {
        gridStickers.push({ description: '空白', text: '　' })
      }
      // 用相鄰的八宮格作為風格參考
      const previousGrid = gridIndex > 0 ? gridImages[gridIndex - 1]
        : (gridImages.length > 1 ? gridImages[gridIndex + 1] : null)
      const newGridImage = await generateGrid8Image(
        apiKey, characterImage, gridStickers, textStyle || '', previousGrid, stickerSpec
      )
      const newGridImages = [...gridImages]
      newGridImages[gridIndex] = newGridImage
      setGridImages(newGridImages)

      // 重新去背 + 裁切這組
      const processed = await removeBackgroundSimple(newGridImage, backgroundThreshold, null)
      const newProcessed = [...processedGridImages]
      newProcessed[gridIndex] = processed
      setProcessedGridImages(newProcessed)

      const newCuts = await splitGrid8(processed, stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
      const updatedCutImages = [...cutImages]
      const actualCount = endIdx - startIdx
      for (let i = 0; i < actualCount; i++) {
        updatedCutImages[startIdx + i] = newCuts[i]
      }
      setCutImages(updatedCutImages)

      setProgress(`第 ${gridIndex + 1} 組八宮格已重新生成`)
    } catch (error) {
      console.error('重新生成八宮格失敗:', error)
      alert(`重新生成失敗: ${error.message}`)
      setProgress('')
    } finally {
      setRegeneratingGrid(null)
    }
  }

  // 8宮格去背
  const [removingBgGrid, setRemovingBgGrid] = useState(null)
  const handleRemoveBgGrid = async (gridIndex) => {
    setRemovingBgGrid(gridIndex)
    try {
      const processed = await removeBackgroundSimple(gridImages[gridIndex], backgroundThreshold, null)
      setProcessedGridImages(prev => {
        const updated = [...prev]
        updated[gridIndex] = processed
        return updated
      })
      // 重新裁切這組的 stickers
      const cuts = await splitGrid8(processed, stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
      const rawCuts = await splitGrid8(gridImages[gridIndex], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
      setCutImages(prev => {
        const updated = [...prev]
        const startIdx = gridIndex * 8
        cuts.forEach((cut, i) => {
          if (startIdx + i < updated.length) {
            updated[startIdx + i] = cut
          }
        })
        return updated
      })
      setRawCutImages(prev => {
        const updated = [...prev]
        const startIdx = gridIndex * 8
        rawCuts.forEach((cut, i) => {
          if (startIdx + i < updated.length) {
            updated[startIdx + i] = cut
          }
        })
        return updated
      })
    } catch (error) {
      alert(`去背失敗: ${error.message}`)
    } finally {
      setRemovingBgGrid(null)
    }
  }

  // 點擊去背
  const [clickRemoveTarget, setClickRemoveTarget] = useState(null) // { index, type } type: 'sticker' | 'main' | 'tab'
  const [clickRemoveThreshold, setClickRemoveThreshold] = useState(30)
  const [clickRemoveMode, setClickRemoveMode] = useState('flood') // 'flood' | 'color'
  const [clickRemoveUndoStack, setClickRemoveUndoStack] = useState([])
  // 吸色去除狀態
  const [pickedColor, setPickedColor] = useState(null) // { r, g, b }
  const [colorRectStart, setColorRectStart] = useState(null) // { x, y } 圖片座標
  const [colorRectEnd, setColorRectEnd] = useState(null) // { x, y } 圖片座標
  const [isDraggingRect, setIsDraggingRect] = useState(false)
  const clickRemoveCanvasRef = useRef(null)
  const clickRemoveLensRef = useRef(null)

  const getClickRemoveSource = () => {
    if (!clickRemoveTarget) return null
    const { index, type } = clickRemoveTarget
    if (type === 'sticker') return cutImages[index]
    if (type === 'grid') return processedGridImages[index] || gridImages[index]
    if (type === 'main') return mainImage
    if (type === 'tab') return tabImage
    return null
  }

  const handleClickRemoveUndo = () => {
    if (clickRemoveUndoStack.length === 0 || !clickRemoveTarget) return
    const prev = clickRemoveUndoStack[clickRemoveUndoStack.length - 1]
    setClickRemoveUndoStack(stack => stack.slice(0, -1))
    const { index, type } = clickRemoveTarget
    if (type === 'sticker') {
      setCutImages(arr => { const u = [...arr]; u[index] = prev; return u })
    } else if (type === 'grid') {
      setProcessedGridImages(arr => { const u = [...arr]; u[index] = prev; return u })
    } else if (type === 'main') {
      setMainImage(prev)
    } else if (type === 'tab') {
      setTabImage(prev)
    }
  }

  const canvasToImageCoords = (e) => {
    const canvas = clickRemoveCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: Math.floor((e.clientX - rect.left) * scaleX),
      y: Math.floor((e.clientY - rect.top) * scaleY),
    }
  }

  const applyResult = (result) => {
    const { index, type } = clickRemoveTarget
    if (type === 'sticker') {
      setCutImages(prev => { const u = [...prev]; u[index] = result; return u })
    } else if (type === 'grid') {
      setProcessedGridImages(prev => { const u = [...prev]; u[index] = result; return u })
    } else if (type === 'main') {
      setMainImage(result)
    } else if (type === 'tab') {
      setTabImage(result)
    }
  }

  // flood 模式：點擊即去背
  const handleClickRemoveFlood = async (e) => {
    const pt = canvasToImageCoords(e)
    if (!pt || !clickRemoveTarget) return
    const source = getClickRemoveSource()
    if (!source) return
    setClickRemoveUndoStack(stack => [...stack, source])
    try {
      const result = await removeBackgroundFromPoint(source, pt.x, pt.y, clickRemoveThreshold)
      applyResult(result)
    } catch (error) {
      alert(`去背失敗: ${error.message}`)
    }
  }

  // color 模式：第一步吸色
  const handleColorPick = async (e) => {
    const pt = canvasToImageCoords(e)
    if (!pt) return
    const source = getClickRemoveSource()
    if (!source) return
    const color = await pickColorFromImage(source, pt.x, pt.y)
    setPickedColor(color)
    setColorRectStart(null)
    setColorRectEnd(null)
  }

  // color 模式：框選開始
  const handleColorRectMouseDown = (e) => {
    if (!pickedColor) return
    const pt = canvasToImageCoords(e)
    if (!pt) return
    setColorRectStart(pt)
    setColorRectEnd(pt)
    setIsDraggingRect(true)
  }

  // color 模式：框選中
  const handleColorRectMouseMove = (e) => {
    if (!isDraggingRect) return
    const pt = canvasToImageCoords(e)
    if (pt) setColorRectEnd(pt)
  }

  // color 模式：框選結束 → 去除
  const handleColorRectMouseUp = async () => {
    if (!isDraggingRect || !colorRectStart || !colorRectEnd || !pickedColor) {
      setIsDraggingRect(false)
      return
    }
    setIsDraggingRect(false)
    const source = getClickRemoveSource()
    if (!source) return

    const x = Math.min(colorRectStart.x, colorRectEnd.x)
    const y = Math.min(colorRectStart.y, colorRectEnd.y)
    const w = Math.abs(colorRectEnd.x - colorRectStart.x)
    const h = Math.abs(colorRectEnd.y - colorRectStart.y)
    if (w < 2 || h < 2) return

    setClickRemoveUndoStack(stack => [...stack, source])
    try {
      const result = await removeBackgroundByColor(source, pickedColor, clickRemoveThreshold, { x, y, w, h })
      applyResult(result)
    } catch (error) {
      alert(`吸色去除失敗: ${error.message}`)
    }
    setColorRectStart(null)
    setColorRectEnd(null)
  }

  // 單張去背
  const [removingBgIndex, setRemovingBgIndex] = useState(null)
  const [stickerThresholds, setStickerThresholds] = useState({}) // per-sticker 閾值
  const getStickerThreshold = (idx) => stickerThresholds[idx] ?? backgroundThreshold
  const handleRemoveBgSingle = async (stickerIndex) => {
    setRemovingBgIndex(stickerIndex)
    try {
      const threshold = getStickerThreshold(stickerIndex)
      const source = rawCutImages[stickerIndex] || cutImages[stickerIndex]
      const processed = await removeBackgroundSimple(source, threshold, null)
      setCutImages(prev => {
        const updated = [...prev]
        updated[stickerIndex] = processed
        return updated
      })
    } catch (error) {
      alert(`去背失敗: ${error.message}`)
    } finally {
      setRemovingBgIndex(null)
    }
  }

  // 單張重新裁切
  const [recutGridIndex, setRecutGridIndex] = useState(null)
  const handleRecutSingle = async (gridIndex) => {
    setRecutGridIndex(gridIndex)
    try {
      const src = processedGridImages[gridIndex] || gridImages[gridIndex]
      const cuts = await splitGrid8(src, stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
      const rawCuts = await splitGrid8(gridImages[gridIndex], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
      const startIdx = gridIndex * 8
      setCutImages(prev => {
        const u = [...prev]
        cuts.forEach((cut, i) => { if (startIdx + i < u.length) u[startIdx + i] = cut })
        return u
      })
      setRawCutImages(prev => {
        const u = [...prev]
        rawCuts.forEach((raw, i) => { if (startIdx + i < u.length) u[startIdx + i] = raw })
        return u
      })
    } catch (err) {
      alert('重新裁切失敗: ' + err.message)
    } finally {
      setRecutGridIndex(null)
    }
  }

  // 全部重新裁切（從目前的 processedGridImages）
  const [recutting, setRecutting] = useState(false)
  const handleRecut = async () => {
    setRecutting(true)
    try {
      let allCut = []
      let allRaw = []
      for (let i = 0; i < processedGridImages.length; i++) {
        const src = processedGridImages[i] || gridImages[i]
        const cuts = await splitGrid8(src, stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
        const rawCuts = await splitGrid8(gridImages[i], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
        allCut = allCut.concat(cuts)
        allRaw = allRaw.concat(rawCuts)
      }
      const totalNeeded = descriptions.length || count
      setCutImages(allCut.slice(0, totalNeeded))
      setRawCutImages(allRaw.slice(0, totalNeeded))
    } catch (err) {
      alert('重新裁切失敗: ' + err.message)
    } finally {
      setRecutting(false)
    }
  }

  // 批次重新去背（用於調整閾值後）
  const handleReapplyBackground = async () => {
    setProcessingBackground(true)
    try {
      // 重新去背 8 宮格（從原圖）
      const newProcessed = []
      for (let i = 0; i < gridImages.length; i++) {
        const processed = await removeBackgroundSimple(gridImages[i], backgroundThreshold, null)
        newProcessed.push(processed)
      }
      setProcessedGridImages(newProcessed)
      // 重新裁切
      let allCut = []
      let allRaw = []
      for (let i = 0; i < newProcessed.length; i++) {
        const cuts = await splitGrid8(newProcessed[i], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
        const rawCuts = await splitGrid8(gridImages[i], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
        allCut = allCut.concat(cuts)
        allRaw = allRaw.concat(rawCuts)
      }
      const totalNeeded = descriptions.length || count
      setCutImages(allCut.slice(0, totalNeeded))
      setRawCutImages(allRaw.slice(0, totalNeeded))
      setStickerThresholds({}) // 重置個別閾值
      // 重新去背主要圖片和標籤圖片（從原圖）
      if (mainImage && rawMainImage) {
        setMainImage(await removeBackgroundSimple(rawMainImage, backgroundThreshold))
        setMainThreshold(null)
      }
      if (tabImage) {
        setTabImage(await createTabFromCharacter(characterImage, backgroundThreshold))
        setTabThreshold(null)
      }
    } catch (error) {
      alert(`重新去背失敗: ${error.message}`)
    } finally {
      setProcessingBackground(false)
    }
  }

  // 標籤圖片去背
  const [removingTabBg, setRemovingTabBg] = useState(false)
  const handleRemoveTabBg = async () => {
    if (!tabImage) return
    setRemovingTabBg(true)
    try {
      const source = rawTabImage || tabImage
      const t = tabThreshold ?? backgroundThreshold
      const processed = await removeBackgroundSimple(source, t, null)
      setTabImage(processed)
    } catch (error) {
      alert(`標籤圖片去背失敗: ${error.message}`)
    } finally {
      setRemovingTabBg(false)
    }
  }

  // 單張貼圖重產
  const [regeneratingIndex, setRegeneratingIndex] = useState(null)
  const handleRegenerateSingleSticker = async (stickerIndex) => {
    const desc = descriptions[stickerIndex]
    if (!desc) return

    setRegeneratingIndex(stickerIndex)
    setProgress(`正在重新生成第 ${stickerIndex + 1} 張貼圖...`)

    try {
      const newStickerDataUrl = await generateStickerWithText(
        apiKey,
        characterImage,
        desc.description,
        desc.text,
        textStyle || '',
        stickerSpec.cell.w,
        stickerSpec.cell.h
      )

      const processedSticker = await removeBackgroundSimple(newStickerDataUrl, backgroundThreshold, null)

      setRawCutImages(prev => {
        const updated = [...prev]
        updated[stickerIndex] = newStickerDataUrl
        return updated
      })
      setCutImages(prev => {
        const updated = [...prev]
        updated[stickerIndex] = processedSticker
        return updated
      })

      setProgress('')
    } catch (error) {
      console.error('重新生成貼圖失敗:', error)
      alert(`重新生成失敗: ${error.message}`)
      setProgress('')
    } finally {
      setRegeneratingIndex(null)
    }
  }

  return (
    <div className="app">
      <div className="container">
        <h1 className="title" style={{ cursor: 'pointer' }} onClick={() => setPage('home')}>StampMill</h1>

        {/* API Key — 所有頁面共用 */}
        <div className="step-section">
          <div className="form-group">
            <label>Gemini API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="請輸入您的 Gemini API Key"
              className="form-input"
            />
          </div>
        </div>

        {/* ===== 首頁 ===== */}
        {page === 'home' && (
          <>
            <div className="step-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h2 style={{ margin: 0 }}>我的角色</h2>
                <button className="btn btn-primary btn-inline" onClick={() => setPage('character-create')}>
                  + 新增角色
                </button>
              </div>
              {characters.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '30px' }}>還沒有角色，點擊「新增角色」開始</p>
              ) : (
                <div className="character-grid">
                  {characters.map(char => (
                    <div key={char.id} className="character-card">
                      <img src={char.imageDataUrl} alt={char.name} className="character-card-img" />
                      <div className="character-card-info">
                        <h3>{char.name}</h3>
                        {char.theme && <p className="character-card-theme">{char.theme}</p>}
                      </div>
                      <div className="character-card-actions">
                        <button className="btn btn-primary btn-inline" onClick={() => handleSelectCharacter(char)}>
                          {charactersWithStickers[char.id] ? '繼續編輯' : '產貼圖'}
                        </button>
                        <button
                          className="btn btn-secondary btn-inline"
                          onClick={() => handleDeleteCharacter(char.id)}
                          style={{ color: '#e74c3c' }}
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ===== 角色設計頁 ===== */}
        {page === 'character-create' && (
          <>
            <div className="step-section">
              <h2>角色設計</h2>
              <button className="btn btn-secondary btn-inline" onClick={() => setPage('home')} style={{ marginBottom: '15px' }}>
                ← 返回首頁
              </button>
              <div className="form-group">
                <label>角色名稱 <span style={{ fontWeight: 'normal', color: '#888', fontSize: '0.85em' }}>— 存檔用，不影響生成</span></label>
                <input
                  type="text"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  placeholder="為角色取個名字..."
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>角色描述 <span style={{ fontWeight: 'normal', color: '#888', fontSize: '0.85em' }}>— 告訴 AI 角色長怎樣，可搭配參考圖使用</span></label>
                <textarea
                  value={characterDescription}
                  onChange={(e) => setCharacterDescription(e.target.value)}
                  placeholder={"例：戴眼鏡的男生，黑色短髮，穿白色襯衫\n有多張參考圖時可指定：用第 1 張的臉搭配第 2 張的畫風"}
                  rows={3}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>參考圖片 <span style={{ fontWeight: 'normal', color: '#888', fontSize: '0.85em' }}>— 可多張，AI 會依編號辨識</span></label>
                <div
                  className={`drop-zone${dragging ? ' drop-zone--active' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  {uploadedCharacterImages.length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {uploadedCharacterImages.map((img, i) => (
                          <div key={i} style={{ position: 'relative' }}>
                            <img src={img} alt={`參考圖 ${i + 1}`} className="preview-image-small" style={{ width: '100px', height: '100px', objectFit: 'cover' }} />
                            <span style={{ position: 'absolute', bottom: '2px', left: '2px', background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: '4px', padding: '1px 5px', fontSize: '11px' }}>{i + 1}</span>
                            <button
                              style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', lineHeight: '20px', padding: 0 }}
                              onClick={() => {
                                const next = uploadedCharacterImages.filter((_, j) => j !== i)
                                setUploadedCharacterImages(next)
                                if (next.length === 0) { setCharacterImage(null); setCharacterConfirmed(false) }
                              }}
                            >x</button>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                        <p className="success-message" style={{ margin: 0 }}>已上傳 {uploadedCharacterImages.length} 張參考圖</p>
                        <button
                          className="btn btn-secondary btn-inline"
                          onClick={() => { setUploadedCharacterImages([]); setCharacterImage(null); setCharacterConfirmed(false) }}
                        >
                          清除全部
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="drop-zone-hint">拖拉圖片到這裡、Ctrl+V 貼上、或點擊下方選擇檔案（可多選）</p>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleCharacterUpload}
                    className="form-input"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>主題說明 <span style={{ fontWeight: 'normal', color: '#888', fontSize: '0.85em' }}>— 貼圖整體風格與情境，會影響所有貼圖</span></label>
                <textarea
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="例：台灣小吃擬人化、辦公室日常、可愛動物梗圖..."
                  rows={3}
                  className="form-input"
                />
              </div>
            </div>

            {/* 生成 / 確認角色 */}
            <div className="step-section">
              <h2>角色預覽</h2>

              {/* 單張上傳：直接當角色圖 */}
              {uploadedCharacterImages.length === 1 && characterImage && (
                <div className="character-preview">
                  <img src={characterImage} alt="上傳的角色" className="preview-image character-image" />
                  <button className="btn btn-success" onClick={handleSaveCharacter} style={{ marginTop: '10px' }}>
                    儲存角色
                  </button>
                </div>
              )}

              {/* 無上傳 或 多張上傳：需要 AI 生成 */}
              {(uploadedCharacterImages.length === 0 || uploadedCharacterImages.length > 1) && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerateCharacter}
                    disabled={generatingCharacter || !apiKey || (!characterDescription.trim() && !theme.trim() && uploadedCharacterImages.length === 0)}
                  >
                    {generatingCharacter ? '生成中...' : '生成角色'}
                  </button>

                  {characterImage && (
                    <div className="character-preview">
                      <img src={characterImage} alt="生成的角色" className="preview-image character-image" />
                      <div className="character-actions">
                        <button className="btn btn-success" onClick={handleSaveCharacter}>
                          儲存角色
                        </button>
                        <button className="btn btn-secondary" onClick={handleRegenerateCharacter}>
                          重新生成
                        </button>
                      </div>
                      {characterImageHistory.length > 1 && (
                        <div style={{ marginTop: '12px' }}>
                          <p style={{ fontSize: '0.85em', color: '#888', marginBottom: '6px' }}>生成歷史（點擊選用）</p>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {characterImageHistory.map((img, i) => (
                              <img
                                key={i}
                                src={img}
                                alt={`歷史 ${i + 1}`}
                                onClick={() => setCharacterImage(img)}
                                style={{
                                  width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer',
                                  border: img === characterImage ? '3px solid #4CAF50' : '2px solid #ddd'
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* ===== 貼圖生產頁 ===== */}
        {page === 'sticker-produce' && (
          <>
            <div className="step-section">
              <button className="btn btn-secondary btn-inline" onClick={() => setPage('home')} style={{ marginBottom: '15px' }}>
                ← 返回首頁
              </button>
              {selectedCharacter && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                  <img src={selectedCharacter.imageDataUrl} alt={selectedCharacter.name} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
                  <div>
                    <h2 style={{ margin: 0 }}>{selectedCharacter.name}</h2>
                    {selectedCharacter.theme && <p style={{ margin: '4px 0 0', color: '#666', fontSize: '14px' }}>{selectedCharacter.theme}</p>}
                  </div>
                </div>
              )}
            </div>

            {/* 張數選擇 */}
            <div className="step-section">
              <h2>張數選擇</h2>
              <div className="form-group">
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="form-input"
                >
                  <option value={8}>8 張</option>
                  <option value={16}>16 張</option>
                  <option value={24}>24 張</option>
                  <option value={32}>32 張</option>
                  <option value={40}>40 張</option>
                </select>
              </div>
            </div>

            {/* 文字風格描述 */}
            <div className="step-section">
              <h2>字體樣式風格描述</h2>
              <div className="form-group">
                <label>字體樣式風格描述（可選，不填寫則在生成文字描述時自動由 AI 生成）</label>
                <textarea
                  value={textStyle}
                  onChange={(e) => setTextStyle(e.target.value)}
                  placeholder="例如：可愛簡潔的風格，文字清晰易讀，使用粗體字，文字框使用白色或黃色背景..."
                  rows={3}
                  className="form-input"
                  disabled={generatingTextStyle}
                />
                <p className="form-hint">如果不填寫，系統會在生成文字描述時自動生成統一的字體樣式風格</p>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleGenerateTextStyle}
                disabled={generatingTextStyle || !apiKey || !theme.trim()}
              >
                {generatingTextStyle ? '生成中...' : textStyle ? '重新生成字體樣式風格' : '預覽 AI 生成的字體樣式風格'}
              </button>

              {textStyle && (
                <div className="text-style-preview">
                  <h3>字體樣式風格：</h3>
                  <p className="text-style-content">{textStyle}</p>
                </div>
              )}
            </div>

            {/* 文字描述 */}
            <div className="step-section">
              <h2>文字描述（可編輯）</h2>
            
            {/* 貼圖類型 */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                貼圖類型：
              </label>
              <div style={{ display: 'flex', gap: '12px' }}>
                {Object.values(STICKER_SPECS).map(spec => (
                  <label key={spec.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: stickerTypeKey === spec.key ? '2px solid #4a90e2' : '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', background: stickerTypeKey === spec.key ? '#eef5ff' : '#fff' }}>
                    <input
                      type="radio"
                      name="stickerTypeKey"
                      value={spec.key}
                      checked={stickerTypeKey === spec.key}
                      onChange={() => setStickerTypeKey(spec.key)}
                    />
                    <span>{spec.label}</span>
                    <span style={{ color: '#888', fontSize: '12px' }}>({spec.cell.w}×{spec.cell.h})</span>
                  </label>
                ))}
              </div>
              <p style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
                💡 一般貼圖為 370×320 長方形，表情貼為 180×180 正方形（採 2× 超採樣生成以確保品質）。
              </p>
            </div>

            {/* 角色立場描述 */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label htmlFor="characterStance" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                角色立場描述（選填）：
              </label>
              <textarea
                id="characterStance"
                value={characterStance}
                onChange={(e) => setCharacterStance(e.target.value)}
                placeholder="例如：攀岩時非常厭世、語氣消極、愛吐槽"
                className="form-input"
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '10px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
              <p style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
                💡 提示：描述角色立場或語氣（例如厭世、毒舌、溫暖鼓勵），會影響文字生成風格與用詞方向。
              </p>
            </div>

            {/* 排除文字輸入框 */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label htmlFor="excludedTexts" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                排除這些文字（選填，每行一個）：
              </label>
              <textarea
                id="excludedTexts"
                value={excludedTexts}
                onChange={(e) => setExcludedTexts(e.target.value)}
                placeholder="例如：&#10;你好&#10;謝謝&#10;再見&#10;&#10;（每行輸入一個要排除的文字，這樣在延伸同一系列時可以避免文字重複）"
                className="form-input"
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '10px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
              <p style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
                💡 提示：輸入之前已使用的文字，生成時會自動排除這些文字，避免重複。適合延伸同一系列貼圖時使用。
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={() => { handleInitDescriptions(); handleGenerateDescriptions() }}
                disabled={generatingDescriptions || !apiKey}
              >
                {generatingDescriptions ? '生成中...' : `一鍵生成全部 ${count} 張描述`}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleInitDescriptions}
              >
                建立 {count} 張空白欄位（手動填寫）
              </button>
            </div>

            <div className="form-group" style={{ marginTop: '15px' }}>
              <label style={{ fontWeight: 'bold' }}>或貼上文字清單（每行一個，自動偵測張數）</label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"每行一個，支援格式：\n歸心似箭：鮭魚在快速游泳\n同鮭魚盡\n你鮭我管\n\n冒號後為描述（選填），已存在的文字會自動跳過"}
                rows={4}
                className="form-input"
              />
              {bulkText.trim() && (
                <button
                  className="btn btn-primary"
                  onClick={handleImportBulkText}
                  style={{ marginTop: '8px' }}
                >
                  匯入（{bulkText.split('\n').map(l => l.replace(/^[-*]\s*\[[ x]?\]\s*/, '').trim()).filter(l => l).length} 張）
                </button>
              )}
            </div>

            {descriptions.length > 0 && (
              <div className="descriptions-editor">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <h3 style={{ margin: 0 }}>編輯描述和文字（共 {descriptions.length} 張）</h3>
                  <button
                    className="btn btn-secondary btn-inline"
                    onClick={handleBatchGenerateDesc}
                    disabled={batchGeneratingDesc !== null}
                  >
                    {batchGeneratingDesc !== null ? `補齊中 ${batchGeneratingDesc}...` : '補齊空白描述（跳過已填）'}
                  </button>
                  <button
                    className="btn btn-secondary btn-inline"
                    onClick={handleExportDescriptions}
                  >
                    匯出文字清單
                  </button>
                  <button
                    className="btn btn-secondary btn-inline"
                    onClick={() => { if (confirm('確定清空所有描述文字？')) setDescriptions([]) }}
                    style={{ color: '#e74c3c' }}
                  >
                    清空全部
                  </button>
                </div>
                {descriptions.map((item, index) => (
                  <div
                    key={index}
                    className="description-item"
                    style={{ position: 'relative', opacity: dragIdx === index ? 0.5 : 1 }}
                    draggable
                    onDragStart={() => handleDragStart2(index)}
                    onDragOver={(e) => handleDragOver2(e, index)}
                    onDrop={() => handleDrop2(index)}
                    onDragEnd={() => setDragIdx(null)}
                  >
                    <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span style={{ cursor: 'grab', fontSize: '16px', color: '#bbb', userSelect: 'none' }} title="拖拉排序">☰</span>
                      <button
                        onClick={() => handleDeleteDescription(index)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: '18px', color: '#999', padding: '4px 8px'
                        }}
                        title="刪除這張"
                      >
                        &times;
                      </button>
                    </div>
                    <div className="description-field">
                      <label>文字 {index + 1}:</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          value={item.text}
                          onChange={(e) => handleUpdateDescription(index, 'text', e.target.value)}
                          placeholder="貼圖文字..."
                          className="form-input"
                          maxLength={10}
                          style={{ flex: 1, minWidth: 0 }}
                        />
                        <button
                          className="btn btn-secondary btn-inline"
                          onClick={() => handleGenerateText(index)}
                          disabled={generatingText !== null}
                        >
                          {generatingText === index ? '生成中...' : 'AI 生成文字'}
                        </button>
                      </div>
                    </div>
                    <div className="description-field">
                      <label>描述 {index + 1}:</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <textarea
                          value={item.description}
                          onChange={(e) => handleUpdateDescription(index, 'description', e.target.value)}
                          placeholder="圖片場景描述..."
                          className="form-input"
                          rows={2}
                          style={{ flex: 1, minWidth: 0, resize: 'vertical' }}
                        />
                        <button
                          className="btn btn-secondary btn-inline"
                          onClick={() => handleGenerateDesc(index)}
                          disabled={generatingDesc !== null}
                        >
                          {generatingDesc === index ? '生成中...' : 'AI 生成描述'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  className="btn btn-primary"
                  onClick={handleGenerateStickers}
                  disabled={loading}
                >
                  {loading ? '生成中...' : '開始生成8宮格貼圖'}
                </button>
              </div>
            )}
          </div>

        {/* 進度顯示 */}
        {progress && (
          <div className="progress">{progress}</div>
        )}

        {/* 去背調整 */}
        {processedGridImages.length > 0 && currentStep === 7 && (
          <div className="step-section">
            <h2>步驟 7: 調整去背程度</h2>
            <div className="form-group">
              <label>去背閾值（數值越小，去背越強；數值越大，保留越多背景）</label>
              <div className="threshold-control">
                <input
                  type="range"
                  min="0"
                  max="255"
                  value={backgroundThreshold}
                  onChange={async (e) => {
                    const newThreshold = Number(e.target.value)
                    setBackgroundThreshold(newThreshold)
                    // 實時應用去背調整
                    setProcessingBackground(true)
                    try {
                      const newProcessed = []
                      for (let i = 0; i < gridImages.length; i++) {
                        const processed = await removeBackgroundSimple(gridImages[i], newThreshold, null)
                        newProcessed.push(processed)
                      }
                      setProcessedGridImages(newProcessed)
                    } catch (error) {
                      console.error('去背處理失敗:', error)
                    } finally {
                      setProcessingBackground(false)
                    }
                  }}
                  className="threshold-slider"
                />
                <span className="threshold-value">{backgroundThreshold}</span>
              </div>
              <p className="threshold-hint">
                當前值：{backgroundThreshold}（建議範圍：200-255，預設：240）- 調整滑桿會即時預覽效果
              </p>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleApplyBackgroundRemoval}
              disabled={processingBackground}
            >
              {processingBackground ? '處理中...' : '應用去背調整'}
            </button>

            <div className="preview-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0 }}>去背後預覽（{processedGridImages.length} 張8宮格）</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>切換背景：</span>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setPreviewBackgroundDark(!previewBackgroundDark)}
                    style={{ 
                      fontSize: '14px', 
                      padding: '8px 16px',
                      width: 'auto',
                      minWidth: '140px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      backgroundColor: previewBackgroundDark ? '#2d2d2d' : '#f0f0f0',
                      color: previewBackgroundDark ? '#fff' : '#333',
                      border: previewBackgroundDark ? '2px solid #555' : '2px solid #ddd',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '18px' }}>{previewBackgroundDark ? '🌙' : '☀️'}</span>
                    <span>{previewBackgroundDark ? '深色背景' : '淺色背景'}</span>
                  </button>
                  <span style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                    {previewBackgroundDark ? '（模擬 LINE 深色模式）' : '（模擬 LINE 淺色模式）'}
                  </span>
                </div>
              </div>
              <div 
                className="grid-preview" 
                style={{ 
                  backgroundColor: previewBackgroundDark ? '#1a1a1a' : '#ffffff',
                  padding: '20px',
                  borderRadius: '8px',
                  transition: 'background-color 0.3s ease',
                  border: previewBackgroundDark ? '2px solid #333' : '2px solid #e0e0e0'
                }}
              >
                {processedGridImages.map((img, idx) => (
                  <div 
                    key={idx} 
                    className="grid-item"
                    style={{
                      backgroundColor: previewBackgroundDark ? '#1a1a1a' : 'transparent',
                      padding: '10px',
                      borderRadius: '8px',
                      transition: 'background-color 0.3s ease',
                      position: 'relative'
                    }}
                  >
                    <div
                      style={{
                        backgroundColor: previewBackgroundDark ? '#1a1a1a' : '#ffffff',
                        border: previewBackgroundDark ? '1px solid #444' : '2px solid #e0e0e0',
                        borderRadius: '4px',
                        padding: '0',
                        display: 'inline-block',
                        transition: 'all 0.3s ease',
                        overflow: 'hidden'
                      }}
                    >
                      <img 
                        src={img} 
                        alt={`去背後 8宮格 ${idx + 1}`} 
                        className="preview-image grid-image"
                        style={{
                          backgroundColor: previewBackgroundDark ? '#1a1a1a' : 'transparent',
                          display: 'block',
                          maxWidth: '100%',
                          height: 'auto',
                          mixBlendMode: previewBackgroundDark ? 'normal' : 'normal'
                        }}
                      />
                    </div>
                    <p style={{ marginTop: '8px', fontSize: '0.85em', color: previewBackgroundDark ? '#999' : '#6c757d', textAlign: 'center' }}>
                      8宮格 {idx + 1}
                    </p>
                  </div>
                ))}
              </div>
              <p style={{ 
                marginTop: '12px', 
                fontSize: '13px', 
                color: '#666', 
                fontStyle: 'italic',
                textAlign: 'center',
                padding: '10px',
                backgroundColor: '#f8f9fa',
                borderRadius: '6px',
                border: '1px solid #e0e0e0'
              }}>
                💡 提示：切換到深色背景可以更好地檢查去背效果，因為 LINE 貼圖會在深色背景下使用。如果去背不完整，在深色背景下會更容易發現問題。
              </p>
            </div>

            <button
              className="btn btn-success"
              onClick={handleSplitGrids}
              disabled={loading || processingBackground}
            >
              {loading ? '處理中...' : '下一步：進行裁切'}
            </button>
          </div>
        )}

        {/* 步驟 8-9: 預覽結果 */}
        {cutImages.length > 0 && currentStep >= 8 && (
          <div className="step-section">
            <h2>{currentStep === 9 ? '步驟 9: 完成並下載' : '步驟 8: 裁切完成'}</h2>

            {/* 去背閾值 + 背景色預覽 */}
            <div className="preview-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>去背閾值：</span>
                <div className="threshold-control" style={{ flex: 1, minWidth: '200px' }}>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={backgroundThreshold}
                    onChange={(e) => setBackgroundThreshold(Number(e.target.value))}
                    className="threshold-slider"
                  />
                  <span className="threshold-value">{backgroundThreshold}</span>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleReapplyBackground}
                  disabled={processingBackground}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {processingBackground ? '處理中...' : '全部重新去背'}
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', fontWeight: '500', color: '#666' }}>預覽背景：</span>
                {PREVIEW_BG_COLORS.map(bg => (
                  <button
                    key={bg.color}
                    onClick={() => setPreviewBgColor(bg.color)}
                    style={{
                      width: '32px',
                      height: '32px',
                      backgroundColor: bg.color,
                      border: previewBgColor === bg.color ? '3px solid #4CAF50' : `2px solid ${bg.border}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    title={bg.label}
                  />
                ))}
              </div>
            </div>

            {/* 主要圖片和標籤圖片 */}
            {(mainImage || tabImage) && (
              <div className="preview-group">
                <h3>主要圖片和標籤圖片</h3>
                <div className="main-tab-preview">
                  {mainImage && (
                    <div className="preview-item">
                      <h4>主要圖片 (240×240)</h4>
                      <img src={mainImage} alt="主要圖片" className="preview-image main-image" style={{ background: previewBgColor }} />
                      <button
                        className="btn btn-secondary btn-inline"
                        style={{ marginTop: '6px' }}
                        disabled={loading || regeneratingMain}
                        onClick={async () => {
                          setRegeneratingMain(true)
                          try {
                            const mainImg = await generateMainImage(apiKey, characterImage, theme)
                            setRawMainImage(mainImg)
                            const processed = await removeBackgroundSimple(mainImg, backgroundThreshold)
                            setMainImage(processed)
                          } catch (err) { alert('重產主要圖片失敗: ' + err.message) }
                          finally { setRegeneratingMain(false) }
                        }}
                      >{regeneratingMain ? '生成中...' : '重產'}</button>
                      <button
                        className="btn btn-secondary btn-inline"
                        style={{ marginTop: '6px' }}
                        disabled={loading || removingMainBg}
                        onClick={async () => {
                          setRemovingMainBg(true)
                          try {
                            const source = rawMainImage || mainImage
                            const t = mainThreshold ?? backgroundThreshold
                            const processed = await removeBackgroundSimple(source, t)
                            setMainImage(processed)
                          } catch (err) { alert('主要圖片去背失敗: ' + err.message) }
                          finally { setRemovingMainBg(false) }
                        }}
                      >{removingMainBg ? '處理中...' : '去背'}</button>
                      <button
                        className="btn btn-secondary btn-inline"
                        style={{ marginTop: '6px' }}
                        onClick={() => setMainCropSource('pick')}
                      >從圖片選擇</button>
                      <label
                        className="btn btn-secondary btn-inline"
                        style={{ marginTop: '6px', cursor: 'pointer', textAlign: 'center' }}
                      >
                        上傳
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const dataUrl = await fileToDataURL(file)
                            setRawMainImage(dataUrl)
                            setMainImage(dataUrl)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', width: '100%' }}>
                        <input
                          type="range"
                          min="0"
                          max="255"
                          value={mainThreshold ?? backgroundThreshold}
                          onChange={(e) => setMainThreshold(Number(e.target.value))}
                          style={{ flex: 1, height: '4px' }}
                        />
                        <span style={{ fontSize: '11px', color: '#999', minWidth: '24px' }}>{mainThreshold ?? backgroundThreshold}</span>
                      </div>
                    </div>
                  )}
                  {tabImage && (
                    <div className="preview-item">
                      <h4>標籤圖片 (96×74)</h4>
                      <img src={tabImage} alt="標籤圖片" className="preview-image tab-image" style={{ background: previewBgColor }} />
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        <button
                          className="btn btn-secondary btn-inline"
                          disabled={loading || regeneratingTab}
                          onClick={async () => {
                            setRegeneratingTab(true)
                            try {
                              const tab = await createTabFromCharacter(characterImage, backgroundThreshold)
                              setTabImage(tab)
                            } catch (err) { alert('重產標籤圖片失敗: ' + err.message) }
                            finally { setRegeneratingTab(false) }
                          }}
                        >{regeneratingTab ? '生成中...' : '重產'}</button>
                        <button
                          className="btn btn-secondary btn-inline"
                          onClick={() => setTabCropSource('pick')}
                        >從圖片選擇</button>
                        <button
                          className="btn btn-secondary btn-inline"
                          disabled={removingTabBg}
                          onClick={handleRemoveTabBg}
                        >{removingTabBg ? '處理中...' : '去背'}</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', width: '100%' }}>
                        <input
                          type="range"
                          min="0"
                          max="255"
                          value={tabThreshold ?? backgroundThreshold}
                          onChange={(e) => setTabThreshold(Number(e.target.value))}
                          style={{ flex: 1, height: '4px' }}
                        />
                        <span style={{ fontSize: '11px', color: '#999', minWidth: '24px' }}>{tabThreshold ?? backgroundThreshold}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* 標籤圖片裁切 */}
            {/* 主要圖片裁切 */}
            {mainCropSource && (
              <div className="preview-group" style={{ border: '2px solid #2196F3', padding: '15px', borderRadius: '8px' }}>
                {mainCropSource === 'pick' ? (
                  <>
                    <h3>選擇圖片來源（主要圖片）</h3>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {characterImage && (
                        <div style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => setMainCropSource(characterImage)}>
                          <img src={characterImage} alt="角色圖" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                          <p style={{ fontSize: '12px', margin: '4px 0 0' }}>角色圖</p>
                        </div>
                      )}
                      {gridImages.map((img, i) => (
                        <div key={i} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => setMainCropSource(img)}>
                          <img src={img} alt={`八宮格 ${i + 1}`} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                          <p style={{ fontSize: '12px', margin: '4px 0 0' }}>八宮格 {i + 1}</p>
                        </div>
                      ))}
                      {cutImages.map((img, i) => (
                        <div key={`cut-${i}`} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => setMainCropSource(img)}>
                          <img src={img} alt={`貼圖 ${i + 1}`} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                          <p style={{ fontSize: '12px', margin: '4px 0 0' }}>貼圖 {i + 1}</p>
                        </div>
                      ))}
                    </div>
                    <button className="btn btn-secondary btn-inline" style={{ marginTop: '10px' }} onClick={() => setMainCropSource(null)}>取消</button>
                  </>
                ) : (
                  <TabCropper
                    imageDataUrl={mainCropSource}
                    targetWidth={240}
                    targetHeight={240}
                    title="裁切主要圖片"
                    onConfirm={(result) => { setRawMainImage(result); setMainImage(result); setMainCropSource(null) }}
                    onCancel={() => setMainCropSource(null)}
                  />
                )}
              </div>
            )}

            {tabCropSource && (
              <div className="preview-group" style={{ border: '2px solid #4CAF50', padding: '15px', borderRadius: '8px' }}>
                {tabCropSource === 'pick' ? (
                  <>
                    <h3>選擇圖片來源</h3>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {characterImage && (
                        <div style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => { setTabCropSource(characterImage); setTabCropRect(null) }}>
                          <img src={characterImage} alt="角色圖" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                          <p style={{ fontSize: '12px', margin: '4px 0 0' }}>角色圖</p>
                        </div>
                      )}
                      {mainImage && (
                        <div style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => { setTabCropSource(mainImage); setTabCropRect(null) }}>
                          <img src={mainImage} alt="主要圖片" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                          <p style={{ fontSize: '12px', margin: '4px 0 0' }}>主要圖片</p>
                        </div>
                      )}
                      {gridImages.map((img, i) => (
                        <div key={i} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => { setTabCropSource(img); setTabCropRect(null) }}>
                          <img src={img} alt={`八宮格 ${i + 1}`} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                          <p style={{ fontSize: '12px', margin: '4px 0 0' }}>八宮格 {i + 1}</p>
                        </div>
                      ))}
                    </div>
                    <button className="btn btn-secondary btn-inline" style={{ marginTop: '10px' }} onClick={() => setTabCropSource(null)}>取消</button>
                  </>
                ) : (
                  <TabCropper
                    imageDataUrl={tabCropSource}
                    onConfirm={(result) => { setTabImage(result); setTabCropSource(null) }}
                    onCancel={() => setTabCropSource(null)}
                  />
                )}
              </div>
            )}

            {/* 8宮格預覽 */}
            {gridImages.length > 0 && (
              <div className="preview-group">
                <h3>8宮格圖片（{gridImages.length} 張）</h3>
                <div className="grid-preview">
                  {gridImages.map((img, idx) => (
                    <div key={idx} className="grid-item">
                      <img src={processedGridImages[idx] || img} alt={`8宮格 ${idx + 1}`} className="preview-image grid-image" style={{ background: previewBgColor }} />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px' }}>
                        <button
                          className="btn btn-regen"
                          onClick={() => handleRegenerateGrid(idx)}
                          disabled={regeneratingGrid !== null || loading}
                        >
                          {regeneratingGrid === idx ? '...' : '重產'}
                        </button>
                        <button
                          className="btn btn-regen"
                          onClick={() => handleRemoveBgGrid(idx)}
                          disabled={removingBgGrid !== null || loading}
                        >
                          {removingBgGrid === idx ? '...' : '去背'}
                        </button>
                        <button
                          className="btn btn-regen"
                          onClick={() => { setClickRemoveUndoStack([]); setPickedColor(null); setClickRemoveTarget({ index: idx, type: 'grid' }) }}
                        >
                          選去
                        </button>
                        <button
                          className="btn btn-regen"
                          onClick={() => handleRecutSingle(idx)}
                          disabled={recutGridIndex !== null || cutImages.length === 0}
                        >
                          {recutGridIndex === idx ? '...' : '裁切'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {cutImages.length > 0 && (
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: '10px', width: '100%' }}
                    disabled={recutting}
                    onClick={handleRecut}
                  >{recutting ? '裁切中...' : '重新裁切'}</button>
                )}
              </div>
            )}

            {/* 裁切後的單張預覽 */}
            <div className="preview-group">
              <h3>裁切後的貼圖（{cutImages.length} 張）</h3>
              <div className="sticker-grid">
                {cutImages.map((img, idx) => (
                  <div key={idx} className="sticker-item">
                    <img src={img} alt={`貼圖 ${idx + 1}`} className="preview-image sticker-image" style={{ background: previewBgColor }} />
                    <p className="sticker-info">
                      {descriptions[idx]?.description || `貼圖 ${idx + 1}`}
                      <br />
                      <strong>{descriptions[idx]?.text || ''}</strong>
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px' }}>
                      <button
                        className="btn btn-regen"
                        onClick={() => handleRegenerateSingleSticker(idx)}
                        disabled={regeneratingIndex !== null || loading}
                        title="重新生成"
                      >
                        {regeneratingIndex === idx ? '...' : '重產'}
                      </button>
                      <button
                        className="btn btn-regen"
                        onClick={() => handleRemoveBgSingle(idx)}
                        disabled={removingBgIndex !== null || loading}
                        title="自動去背"
                      >
                        {removingBgIndex === idx ? '...' : '去背'}
                      </button>
                      <button
                        className="btn btn-regen"
                        onClick={() => { setClickRemoveUndoStack([]); setPickedColor(null); setClickRemoveTarget({ index: idx, type: 'sticker' }) }}
                        title="點擊指定區域去背"
                      >
                        選去
                      </button>
                      <label className="btn btn-regen" style={{ cursor: 'pointer', textAlign: 'center' }} title="上傳替換圖片">
                        上傳
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const dataUrl = await fileToDataURL(file)
                            setRawCutImages(prev => { const u = [...prev]; u[idx] = dataUrl; return u })
                            setCutImages(prev => { const u = [...prev]; u[idx] = dataUrl; return u })
                            e.target.value = ''
                          }}
                        />
                      </label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', width: '100%' }}>
                      <input
                        type="range"
                        min="0"
                        max="255"
                        value={getStickerThreshold(idx)}
                        onChange={(e) => setStickerThresholds(prev => ({ ...prev, [idx]: Number(e.target.value) }))}
                        style={{ flex: 1, height: '4px' }}
                      />
                      <span style={{ fontSize: '11px', color: '#999', minWidth: '24px' }}>{getStickerThreshold(idx)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 下載按鈕 - 只在步驟 9 顯示 */}
            {currentStep === 9 && (stickerSpec.hasMain ? mainImage : true) && (stickerSpec.hasTab ? tabImage : true) && (
              <div className="download-section">
                <button
                  className="btn btn-download"
                  onClick={handleDownload}
                  disabled={loading}
                >
                  {loading ? '打包中...' : '打包下載 ZIP'}
                </button>
                <p className="download-hint">
                  將下載包含 {cutImages.length} 張貼圖、1 張主要圖片和 1 張標籤圖片的 ZIP 檔案
                </p>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* 點擊去背 Modal */}
      {clickRemoveTarget && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setClickRemoveTarget(null) }}
        >
          <div style={{
            background: '#fff', borderRadius: '12px', padding: '20px',
            maxWidth: '95vw', maxHeight: '90vh', width: '95vw',
            display: 'flex', gap: '16px', overflow: 'hidden',
          }}>
            {/* 左側控制面板 */}
            <div style={{
              width: '280px', minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '10px',
              overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>選去</h3>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                    disabled={clickRemoveUndoStack.length === 0}
                    onClick={handleClickRemoveUndo}
                  >復原</button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '4px 8px' }}
                    onClick={() => setClickRemoveTarget(null)}
                  >關閉</button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  className={`btn ${clickRemoveMode === 'flood' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '12px', padding: '4px 10px', flex: 1 }}
                  onClick={() => { setClickRemoveMode('flood'); setPickedColor(null) }}
                >區域擴散</button>
                <button
                  className={`btn ${clickRemoveMode === 'color' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '12px', padding: '4px 10px', flex: 1 }}
                  onClick={() => { setClickRemoveMode('color'); setPickedColor(null) }}
                >吸色去除</button>
              </div>

              <div>
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>容差：{clickRemoveThreshold}</div>
                <input
                  type="range" min="1" max="120"
                  value={clickRemoveThreshold}
                  onChange={(e) => setClickRemoveThreshold(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#666' }}>去背閾值：
                    {clickRemoveTarget?.type === 'sticker' ? getStickerThreshold(clickRemoveTarget.index)
                      : clickRemoveTarget?.type === 'grid' ? backgroundThreshold
                      : clickRemoveTarget?.type === 'main' ? (mainThreshold ?? backgroundThreshold)
                      : (tabThreshold ?? backgroundThreshold)}
                  </span>
                </div>
                <input
                  type="range" min="0" max="255"
                  value={clickRemoveTarget?.type === 'sticker' ? getStickerThreshold(clickRemoveTarget.index)
                    : clickRemoveTarget?.type === 'grid' ? backgroundThreshold
                    : clickRemoveTarget?.type === 'main' ? (mainThreshold ?? backgroundThreshold)
                    : (tabThreshold ?? backgroundThreshold)}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    if (clickRemoveTarget?.type === 'sticker') {
                      setStickerThresholds(prev => ({ ...prev, [clickRemoveTarget.index]: val }))
                    } else if (clickRemoveTarget?.type === 'grid') {
                      setBackgroundThreshold(val)
                    } else if (clickRemoveTarget?.type === 'main') {
                      setMainThreshold(val)
                    } else {
                      setTabThreshold(val)
                    }
                  }}
                  style={{ width: '100%' }}
                />
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '4px 10px', marginTop: '6px', width: '100%' }}
                  onClick={async () => {
                    const t = clickRemoveTarget.type
                    const source = t === 'sticker' ? (rawCutImages[clickRemoveTarget.index] || cutImages[clickRemoveTarget.index])
                      : t === 'grid' ? gridImages[clickRemoveTarget.index]
                      : t === 'main' ? (rawMainImage || mainImage)
                      : (rawTabImage || tabImage)
                    const threshold = t === 'sticker' ? getStickerThreshold(clickRemoveTarget.index)
                      : t === 'grid' ? backgroundThreshold
                      : t === 'main' ? (mainThreshold ?? backgroundThreshold)
                      : (tabThreshold ?? backgroundThreshold)
                    try {
                      const result = await removeBackgroundSimple(source, threshold, null)
                      applyResult(result)
                    } catch (err) { alert('去背失敗: ' + err.message) }
                  }}
                >全圖去背</button>
              </div>

              <div>
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>背景：</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {PREVIEW_BG_COLORS.map(bg => (
                    <button
                      key={bg.color}
                      onClick={() => setPreviewBgColor(bg.color)}
                      style={{
                        width: '28px', height: '28px',
                        backgroundColor: bg.color,
                        border: previewBgColor === bg.color ? '3px solid #4CAF50' : `2px solid ${bg.border}`,
                        borderRadius: '4px', cursor: 'pointer', padding: 0,
                      }}
                      title={bg.label}
                    />
                  ))}
                </div>
              </div>

              <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
                {clickRemoveMode === 'flood'
                  ? '點擊圖片，從該處往外擴散移除相近色。'
                  : !pickedColor
                    ? '步驟 1：點擊圖片吸取顏色。'
                    : '步驟 2：拖曳框選去除範圍。'}
              </p>

              {clickRemoveMode === 'color' && pickedColor && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '4px',
                    backgroundColor: `rgb(${pickedColor.r},${pickedColor.g},${pickedColor.b})`,
                    border: '2px solid #333',
                  }} />
                  <span style={{ fontSize: '12px', color: '#999' }}>
                    rgb({pickedColor.r}, {pickedColor.g}, {pickedColor.b})
                  </span>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '12px', padding: '3px 8px' }}
                    onClick={() => { setPickedColor(null); setColorRectStart(null); setColorRectEnd(null) }}
                  >重新吸色</button>
                </div>
              )}
            </div>

            {/* 右側圖片區域 */}
            <div
              style={{
                flex: 1, position: 'relative', overflow: 'hidden', cursor: 'crosshair',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseMove={(e) => {
                if (clickRemoveMode === 'flood' || (clickRemoveMode === 'color' && !pickedColor)) {
                  const lens = clickRemoveLensRef.current
                  const canvas = clickRemoveCanvasRef.current
                  const container = e.currentTarget
                  if (!lens || !canvas) return
                  const canvasRect = canvas.getBoundingClientRect()
                  const containerRect = container.getBoundingClientRect()
                  const x = e.clientX - canvasRect.left
                  const y = e.clientY - canvasRect.top
                  if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) {
                    lens.style.display = 'none'
                    return
                  }
                  lens.style.display = 'block'
                  const lensSize = 120
                  const zoom = 4
                  // lens 相對於 container 定位
                  const offsetX = canvasRect.left - containerRect.left
                  const offsetY = canvasRect.top - containerRect.top
                  lens.style.left = `${x + offsetX - lensSize / 2}px`
                  lens.style.top = `${y + offsetY - lensSize / 2}px`
                  lens.style.width = `${lensSize}px`
                  lens.style.height = `${lensSize}px`
                  // 放大鏡背景：用 canvas 的顯示尺寸計算
                  const bgW = canvasRect.width * zoom
                  const bgH = canvasRect.height * zoom
                  lens.style.backgroundSize = `${bgW}px ${bgH}px`
                  lens.style.backgroundPosition = `-${x * zoom - lensSize / 2}px -${y * zoom - lensSize / 2}px`
                } else {
                  if (clickRemoveLensRef.current) clickRemoveLensRef.current.style.display = 'none'
                }
                if (clickRemoveMode === 'color' && pickedColor) {
                  handleColorRectMouseMove(e)
                }
              }}
              onMouseLeave={() => {
                if (clickRemoveLensRef.current) clickRemoveLensRef.current.style.display = 'none'
              }}
              onMouseDown={(e) => {
                if (clickRemoveMode === 'color' && pickedColor) handleColorRectMouseDown(e)
              }}
              onMouseUp={() => {
                if (clickRemoveMode === 'color' && pickedColor) handleColorRectMouseUp()
              }}
            >
              <ClickRemoveCanvas
                canvasRef={clickRemoveCanvasRef}
                src={getClickRemoveSource()}
                bgColor={previewBgColor}
                onClick={clickRemoveMode === 'flood' ? handleClickRemoveFlood
                  : (!pickedColor ? handleColorPick : undefined)}
              />
              <div
                ref={clickRemoveLensRef}
                style={{
                  display: 'none', position: 'absolute', pointerEvents: 'none',
                  border: '2px solid #4CAF50', borderRadius: '50%',
                  backgroundImage: `url(${getClickRemoveSource()})`,
                  backgroundRepeat: 'no-repeat',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                }}
              />
              {colorRectStart && colorRectEnd && isDraggingRect && (() => {
                const canvas = clickRemoveCanvasRef.current
                const container = canvas?.parentElement
                if (!canvas || !container) return null
                const canvasRect = canvas.getBoundingClientRect()
                const containerRect = container.getBoundingClientRect()
                const sx = canvas.width / canvasRect.width
                const sy = canvas.height / canvasRect.height
                const offsetX = canvasRect.left - containerRect.left
                const offsetY = canvasRect.top - containerRect.top
                const left = Math.min(colorRectStart.x, colorRectEnd.x) / sx + offsetX
                const top = Math.min(colorRectStart.y, colorRectEnd.y) / sy + offsetY
                const width = Math.abs(colorRectEnd.x - colorRectStart.x) / sx
                const height = Math.abs(colorRectEnd.y - colorRectStart.y) / sy
                return (
                  <div style={{
                    position: 'absolute', left, top, width, height,
                    border: '2px dashed #4CAF50', backgroundColor: 'rgba(76,175,80,0.15)',
                    pointerEvents: 'none',
                  }} />
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClickRemoveCanvas({ canvasRef, src, bgColor, onClick }) {
  useEffect(() => {
    if (!src || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height
      ctx.fillStyle = bgColor || '#ffffff'
      ctx.fillRect(0, 0, img.width, img.height)
      ctx.drawImage(img, 0, 0)
    }
    img.src = src
  }, [src, bgColor, canvasRef])

  return (
    <canvas
      ref={canvasRef}
      onClick={onClick}
      style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block' }}
    />
  )
}

export default App
