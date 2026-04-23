import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import './App.css'
import { generateImageDescriptionsWithText, generateTextStyle, generateSingleDescription, generateSingleText, generateSingleDescriptionFromText } from './utils/gemini'
import { generateCharacter, generateStickerWithText, generateMainImage, generateGrid8Image } from './utils/characterGenerator'
import { generateCharacterOpenAI, generateStickerWithTextOpenAI, generateMainImageOpenAI, generateGrid8ImageOpenAI } from './utils/openaiImageGenerator'
import { createGrid8, splitGrid8, cropSingleCell, removeBackgroundSimple, removeBackgroundFromPoint, removeBackgroundByColor, pickColorFromImage, createTabFromCharacter, fileToDataURL } from './utils/imageUtils'
import { downloadAsZip, fitToSize } from './utils/zipDownloader'
import { saveCharacterImages, loadCharacterImages, deleteCharacterImages, hasCharacterImages } from './utils/imageStore'
import { syncSaveCharacters, syncLoadCharacters, syncSaveDescs, syncLoadDescs, syncDeleteDescs } from './utils/localSync'
import { STICKER_SPECS, getSpec, DEFAULT_SPEC_KEY } from './utils/stickerSpecs'
import GridMultiCropAdjustPanel from './components/GridMultiCropAdjustPanel'
import CropAdjustPanel from './components/CropAdjustPanel'
import { StickerPreviewGrid } from './components/StickerPreviewGrid'
import TabCropper from './components/TabCropper'
import { useSingleImageEditor } from './hooks/useSingleImageEditor'
import { useGridEditor } from './hooks/useGridEditor'
import { useStickerEditor } from './hooks/useStickerEditor'
import { useDescriptionsEditor } from './hooks/useDescriptionsEditor'
import { useAnimationEditor } from './hooks/useAnimationEditor'

const LS_KEY = 'stampmill_draft'

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {} } catch { return {} }
}

function App() {
  const draft = useRef(loadDraft()).current

  // 頁面狀態
  const [characters, setCharacters] = useState([])
  const restoredChar = null // 角色從 API 非同步載入
  const [selectedCharacter, setSelectedCharacter] = useState(restoredChar || null)
  const [page, setPage] = useState(restoredChar ? 'sticker-produce' : 'home')

  // 共用
  const [apiKey, setApiKey] = useState(draft.apiKey || '')
  const [openaiKey, setOpenaiKey] = useState(draft.openaiKey || '')
  // imageProvider: 'gemini' | 'openai'
  const [imageProvider, setImageProvider] = useState(draft.imageProvider || 'gemini')

  // 角色設計
  const [characterDescription, setCharacterDescription] = useState(restoredChar?.description || '')
  const [theme, setTheme] = useState(restoredChar?.theme || '')
  const [uploadedCharacterImages, setUploadedCharacterImages] = useState([])
  const [characterImage, setCharacterImage] = useState(restoredChar?.imageDataUrl || null)
  const [characterImageHistory, setCharacterImageHistory] = useState([])
  const [characterConfirmed, setCharacterConfirmed] = useState(!!restoredChar)
  const [generatingCharacter, setGeneratingCharacter] = useState(false)
  const [characterName, setCharacterName] = useState('')
  const [editingCharacterId, setEditingCharacterId] = useState(null)

  // 貼圖生產
  const [count, setCount] = useState(draft.count || 8)
  const [textStyle, setTextStyle] = useState(draft.textStyle || '')
  const [generatingTextStyle, setGeneratingTextStyle] = useState(false)
  const [textStyleConfirmed, setTextStyleConfirmed] = useState(false)
  const [descriptions, setDescriptions] = useState([])
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

  // 儲存角色（新建或更新）
  const handleSaveCharacter = () => {
    if (!characterImage && !editingCharacterId && !characterName.trim() && !characterDescription.trim() && !theme.trim()) { alert('請至少填寫角色名稱、描述或主題'); return }
    const name = characterName.trim() || theme.trim() || characterDescription.trim().slice(0, 20) || '未命名角色'
    if (editingCharacterId) {
      // 更新既有角色
      const updated = characters.map(c => c.id === editingCharacterId ? {
        ...c, name, description: characterDescription, theme, imageDataUrl: characterImage || c.imageDataUrl
      } : c)
      const updatedChar = updated.find(c => c.id === editingCharacterId)
      console.log('[SaveCharacter] editing', editingCharacterId)
      console.log('[SaveCharacter] characterImage:', characterImage ? `有值(${characterImage.length})` : 'null')
      console.log('[SaveCharacter] saved imageDataUrl:', updatedChar?.imageDataUrl ? `有值(${updatedChar.imageDataUrl.length})` : 'null')
      saveCharacters(updated)
    } else {
      // 新建角色
      const newChar = {
        id: crypto.randomUUID(),
        name,
        description: characterDescription,
        theme,
        imageDataUrl: characterImage,
        createdAt: new Date().toISOString()
      }
      saveCharacters([newChar, ...characters])
    }
    // 重置表單
    setCharacterDescription('')
    setTheme('')
    setUploadedCharacterImages([])
    setCharacterImage(null)
    setCharacterImageHistory([])
    setCharacterConfirmed(false)
    setCharacterName('')
    setEditingCharacterId(null)
    setPage('home')
  }

  // 編輯角色
  const handleEditCharacter = (id) => {
    const char = characters.find(c => c.id === id)
    if (!char) return
    setEditingCharacterId(id)
    setCharacterName(char.name)
    setCharacterDescription(char.description || '')
    setTheme(char.theme || '')
    setCharacterImage(char.imageDataUrl || null)
    setUploadedCharacterImages([])
    setCharacterImageHistory([])
    setCharacterConfirmed(false)
    setPage('character-create')
  }

  // 刪除角色
  const handleDeleteCharacter = (id) => {
    if (!confirm('確定要刪除這個角色嗎？')) return
    saveCharacters(characters.filter(c => c.id !== id))
    syncDeleteDescs(id)
    deleteCharacterImages(id).catch(() => {})
  }

  // 匯出角色（含 meta + descriptions + 圖片資料）為 JSON 檔
  const handleExportCharacter = async (id) => {
    const char = characters.find(c => c.id === id)
    if (!char) return
    try {
      const descs = await syncLoadDescs(id)
      const images = await loadCharacterImages(id).catch(() => null)
      const exportData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        character: char,
        descriptions: descs || [],
        images: images || null,
      }
      const json = JSON.stringify(exportData, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safeName = (char.name || 'character').replace(/[/\\?%*:|"<>]/g, '_')
      a.download = `stampmill-${safeName}-${id.slice(0, 8)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('匯出失敗：' + err.message)
    }
  }

  // 匯入角色（從 JSON 檔讀回來）
  const handleImportCharacter = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result)
        if (!data.version || !data.character) {
          alert('檔案格式不正確：缺少 version 或 character 欄位')
          return
        }
        const imported = data.character
        // 給匯入的角色一個新 id 避免衝突
        const newId = crypto.randomUUID()
        const newChar = { ...imported, id: newId, importedAt: new Date().toISOString() }
        saveCharacters([newChar, ...characters])
        if (data.descriptions && data.descriptions.length > 0) {
          await syncSaveDescs(newId, data.descriptions)
        }
        if (data.images) {
          await saveCharacterImages(newId, data.images).catch(() => {})
        }
        alert(`已匯入角色：${newChar.name || '未命名'}`)
      } catch (err) {
        alert('匯入失敗：' + err.message)
      }
    }
    reader.readAsText(file)
    // reset input so same file can be re-imported
    e.target.value = ''
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
    mainEditor.reset()
    tabEditor.reset()
    setBackgroundThreshold(240)
    setChromaKeyBgColor('#333333')
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
        if (saved.chromaKeyBgColor) setChromaKeyBgColor(saved.chromaKeyBgColor)
        if (saved.previewBgColor) setPreviewBgColor(saved.previewBgColor)
        // 根據已有數據跳到對應步驟
        const mainReady = stickerSpec.hasMain ? !!saved.mainImage : true
        const tabReady = stickerSpec.hasTab ? !!saved.tabImage : true
        if (saved.cutImages?.length > 0 && mainReady && tabReady) {
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
    const data = { apiKey, openaiKey, imageProvider, count, textStyle, excludedTexts, characterStance, stickerTypeKey, selectedCharacterId: selectedCharacter?.id }
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  }, [apiKey, openaiKey, imageProvider, count, textStyle, excludedTexts, characterStance, stickerTypeKey, selectedCharacter])

  // descriptions by character
  useEffect(() => {
    if (selectedCharacter?.id) saveCharDescs(selectedCharacter.id, descriptions)
  }, [descriptions, selectedCharacter])

  // 步驟 6-8: 8宮格生成、去背、裁切
  const [backgroundThreshold, setBackgroundThreshold] = useState(240) // 去背閾值
  const [chromaKeyBgColor, setChromaKeyBgColor] = useState('#333333') // 8宮格 chroma-key 背景色（#RRGGBB）
  const [confirmEachGrid, setConfirmEachGrid] = useState(true) // 8宮格逐組生成/確認
  const [processingBackground, setProcessingBackground] = useState(false) // 正在處理去背

  const [tabCropRect, setTabCropRect] = useState(null) // { x, y, w, h }
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
        chromaKeyBgColor,
        previewBgColor
      }).catch(err => console.warn('保存圖片到 IndexedDB 失敗:', err))
    }, 1000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [gridImages, processedGridImages, cutImages, rawCutImages, mainImage, tabImage, rawTabImage, selectedCharacter, backgroundThreshold, chromaKeyBgColor, previewBgColor])

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

  // ===== Image provider dispatch helpers =====
  const activeApiKey = imageProvider === 'openai' ? openaiKey : apiKey
  const genCharacter = (...args) =>
    imageProvider === 'openai' ? generateCharacterOpenAI(...args) : generateCharacter(...args)
  const genMainImage = (...args) =>
    imageProvider === 'openai' ? generateMainImageOpenAI(...args) : generateMainImage(...args)
  const genGrid8Image = (...args) =>
    imageProvider === 'openai' ? generateGrid8ImageOpenAI(...args) : generateGrid8Image(...args)
  const genStickerWithText = (...args) =>
    imageProvider === 'openai' ? generateStickerWithTextOpenAI(...args) : generateStickerWithText(...args)

  // ===== useSingleImageEditor hook instances =====
  const mainEditor = useSingleImageEditor({
    globalThreshold: backgroundThreshold,
    generateFn: useCallback(
      () => genMainImage(activeApiKey, characterImage, theme),
      [activeApiKey, characterImage, theme, imageProvider] // eslint-disable-line react-hooks/exhaustive-deps
    ),
    applyBgOnGenerate: true,
  })

  const tabEditor = useSingleImageEditor({
    globalThreshold: backgroundThreshold,
    generateFn: useCallback(
      () => createTabFromCharacter(characterImage, backgroundThreshold),
      [characterImage, backgroundThreshold]
    ),
    applyBgOnGenerate: false, // createTabFromCharacter already handles bg removal
  })

  // Convenience aliases (keep original names where used in the many save/load paths)
  const mainImage = mainEditor.image
  const setMainImage = mainEditor.setImage
  const rawMainImage = mainEditor.rawImage
  const setRawMainImage = mainEditor.setRawImage
  const mainThreshold = mainEditor.threshold
  const setMainThreshold = mainEditor.setThreshold
  const regeneratingMain = mainEditor.regenerating
  const removingMainBg = mainEditor.removingBg
  const mainCropSource = mainEditor.cropSource
  const setMainCropSource = mainEditor.setCropSource

  const tabImage = tabEditor.image
  const setTabImage = tabEditor.setImage
  const rawTabImage = tabEditor.rawImage
  const setRawTabImage = tabEditor.setRawImage
  const tabThreshold = tabEditor.threshold
  const setTabThreshold = tabEditor.setThreshold
  const regeneratingTab = tabEditor.regenerating
  const removingTabBg = tabEditor.removingBg
  const tabCropSource = tabEditor.cropSource
  const setTabCropSource = tabEditor.setCropSource

  // ===== useGridEditor hook =====
  const gridEditor = useGridEditor({
    generateFn: genGrid8Image,
    activeApiKey,
    characterImage,
    textStyle,
    backgroundThreshold,
    chromaKeyBgColor,
    stickerSpec,
    descriptions,
    count,
    confirmEachGrid,
    setProgress,
    setCurrentStep,
  })

  // Backward-compatible aliases — kept so all save/load/render paths keep working unchanged
  const gridImages = gridEditor.gridImages
  const setGridImages = gridEditor.setGridImages
  const processedGridImages = gridEditor.processedGridImages
  const setProcessedGridImages = gridEditor.setProcessedGridImages
  const cutImages = gridEditor.cutImages
  const setCutImages = gridEditor.setCutImages
  const rawCutImages = gridEditor.rawCutImages
  const setRawCutImages = gridEditor.setRawCutImages
  const stickerHistory = gridEditor.stickerHistory
  const setStickerHistory = gridEditor.setStickerHistory
  const stickerThresholds = gridEditor.stickerThresholds
  const setStickerThresholds = gridEditor.setStickerThresholds
  const regeneratingGrid = gridEditor.regeneratingGrid
  const removingBgGrid = gridEditor.removingBgGrid
  const recutGridIndex = gridEditor.recutGridIndex
  const recutting = gridEditor.recutting
  const gridRegenPanel = gridEditor.gridRegenPanel
  const setGridRegenPanel = gridEditor.setGridRegenPanel
  const openGridRegenPanel = gridEditor.openGridRegenPanel
  const toggleGridRegenRef = gridEditor.toggleGridRegenRef
  const cropAdjustTarget = gridEditor.cropAdjustTarget
  const setCropAdjustTarget = gridEditor.setCropAdjustTarget
  const cropAdjustHistory = gridEditor.cropAdjustHistory
  const setCropAdjustHistory = gridEditor.setCropAdjustHistory
  const multiCropAdjustTarget = gridEditor.multiCropAdjustTarget
  const setMultiCropAdjustTarget = gridEditor.setMultiCropAdjustTarget
  const preCutGridCellPreviews = gridEditor.preCutGridCellPreviews
  const setPreCutGridCellPreviews = gridEditor.setPreCutGridCellPreviews
  const preCutPanelOpen = gridEditor.preCutPanelOpen
  const setPreCutPanelOpen = gridEditor.setPreCutPanelOpen
  const preCutLoadingGridIndex = gridEditor.preCutLoadingGridIndex
  const setPreCutLoadingGridIndex = gridEditor.setPreCutLoadingGridIndex
  const getTotalStickerCount = gridEditor.getTotalStickerCount
  const getGridCount = gridEditor.getGridCount
  const getNextGridIndex = gridEditor.getNextGridIndex
  const getStickerThreshold = gridEditor.getStickerThreshold
  const getCropAdjust = gridEditor.getCropAdjust
  const hasAnyCropAdjustInRange = gridEditor.hasAnyCropAdjustInRange
  const cropGridCellsWithAdjust = gridEditor.cropGridCellsWithAdjust
  const ensureGridCellsReady = gridEditor.ensureGridCellsReady
  const ensureStickerReady = gridEditor.ensureStickerReady
  const generateOneGridAt = gridEditor.generateOneGridAt
  const handleRegenerateGrid = gridEditor.handleRegenerateGrid
  const handleRemoveBgGrid = gridEditor.handleRemoveBgGrid
  const handleRecutSingle = gridEditor.handleRecutSingle
  const handleRecut = gridEditor.handleRecut
  const handleOpenCropAdjust = gridEditor.handleOpenCropAdjust
  const handleCropAdjustConfirm = gridEditor.handleCropAdjustConfirm
  const handleOpenMultiCropAdjust = gridEditor.handleOpenMultiCropAdjust
  const handleApplyMultiCropAdjust = gridEditor.handleApplyMultiCropAdjust

  // ===== useStickerEditor hook =====
  const stickerEditor = useStickerEditor({
    generateFn: genStickerWithText,
    activeApiKey,
    characterImage,
    textStyle,
    backgroundThreshold,
    stickerSpec,
    descriptions,
    cutImages,
    setCutImages,
    rawCutImages,
    setRawCutImages,
    getStickerThreshold,
    setStickerHistory: gridEditor.setStickerHistory,
    setProgress,
  })
  const removingBgIndex = stickerEditor.removingBgIndex
  const handleRemoveBgSingle = stickerEditor.handleRemoveBgSingle
  const regeneratingIndex = stickerEditor.regeneratingIndex
  const regenPanel = stickerEditor.regenPanel
  const setRegenPanel = stickerEditor.setRegenPanel
  const openRegenPanel = stickerEditor.openRegenPanel
  const toggleRegenRef = stickerEditor.toggleRegenRef
  const handleRegenerateSingleSticker = stickerEditor.handleRegenerateSingleSticker

  // ===== useAnimationEditor hook =====
  const animationEditor = useAnimationEditor({ cutImages })
  const gifModal = animationEditor.gifModal
  const setGifModal = animationEditor.setGifModal
  const gifSelectedFrames = animationEditor.gifSelectedFrames
  const setGifSelectedFrames = animationEditor.setGifSelectedFrames
  const gifDelay = animationEditor.gifDelay
  const setGifDelay = animationEditor.setGifDelay
  const gifGenerating = animationEditor.gifGenerating
  const gifProgress = animationEditor.gifProgress
  const handleOpenGifModal = animationEditor.handleOpenGifModal
  const handleToggleGifFrame = animationEditor.handleToggleGifFrame
  const handleDownloadGif = animationEditor.handleDownloadGif

  // ===== useDescriptionsEditor hook =====
  const descriptionsEditor = useDescriptionsEditor({
    apiKey,
    theme,
    characterDescription,
    characterStance,
    textStyle,
    setTextStyle,
    descriptions,
    setDescriptions,
    count,
    setCount,
    setProgress,
  })
  const bulkText = descriptionsEditor.bulkText
  const setBulkText = descriptionsEditor.setBulkText
  const handleImportBulkText = descriptionsEditor.handleImportBulkText
  const handleInitDescriptions = descriptionsEditor.handleInitDescriptions
  const generatingSingle = descriptionsEditor.generatingSingle
  const handleGenerateSingle = descriptionsEditor.handleGenerateSingle
  const generatingText = descriptionsEditor.generatingText
  const handleGenerateText = descriptionsEditor.handleGenerateText
  const generatingDesc = descriptionsEditor.generatingDesc
  const handleGenerateDesc = descriptionsEditor.handleGenerateDesc
  const batchGeneratingDesc = descriptionsEditor.batchGeneratingDesc
  const handleBatchGenerateDesc = descriptionsEditor.handleBatchGenerateDesc
  const handleDeleteDescription = descriptionsEditor.handleDeleteDescription
  const handleUpdateDescription = descriptionsEditor.handleUpdateDescription
  const handleExportDescriptions = descriptionsEditor.handleExportDescriptions
  const dragIdx = descriptionsEditor.dragIdx
  const handleDragStart2 = descriptionsEditor.handleDragStart2
  const handleDragOver2 = descriptionsEditor.handleDragOver2
  const handleDrop2 = descriptionsEditor.handleDrop2

  // 步驟 4: 生成角色
  const handleGenerateCharacter = async () => {
    if (!activeApiKey.trim()) {
      alert(imageProvider === 'openai' ? '請輸入 OpenAI API Key' : '請輸入 Gemini API Key')
      return
    }
    if (!characterDescription.trim() && uploadedCharacterImages.length === 0) {
      alert('請輸入角色描述或上傳角色圖片')
      return
    }

    setGeneratingCharacter(true)
    setProgress('正在生成角色圖片...')

    try {
      const character = await genCharacter(activeApiKey, characterDescription || theme, uploadedCharacterImages, characterDescription)
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

  // descriptions handlers → from useDescriptionsEditor aliases above

  // 步驟 6-8: 生成8宮格、去背、裁切 — logic now in useGridEditor, aliases above

  const handleGenerateNextGrid = async () => {
    if (!characterImage) {
      alert('請先生成或上傳角色圖片')
      return
    }
    if (descriptions.length === 0) {
      alert('請先生成文字描述')
      return
    }
    const gridCount = getGridCount()
    const nextIndex = getNextGridIndex()
    if (nextIndex >= gridCount) {
      alert('已經生成完所有八宮格了')
      return
    }
    setLoading(true)
    try {
      await generateOneGridAt(nextIndex)
    } catch (error) {
      console.error('生成失敗:', error)
      alert(`生成失敗: ${error.message}`)
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

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
      if (confirmEachGrid) {
        // 逐組生成：一次只產一組（從「下一組」開始）
        const nextIndex = getNextGridIndex()
        await generateOneGridAt(nextIndex, { skipDelay: true })
        return
      }

      const gridCount = getGridCount() // 需要多少張8宮格
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
        const endIndex = Math.min(startIndex + 8, getTotalStickerCount())
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
            gridImage = await genGrid8Image(
              activeApiKey,
              characterImage,
              gridStickers,
              textStyle || '',
              // 用「前面全部」八宮格作為風格參考（在 utils 內會做上限保護避免 payload 過大）
              gridIndex > 0 ? allGridImages.slice(0, gridIndex) : null,
              stickerSpec,
              { bgColor: chromaKeyBgColor }
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
        const processed = await removeBackgroundSimple(allGridImages[i], backgroundThreshold, null, { bgColor: chromaKeyBgColor })
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
        const processed = await removeBackgroundSimple(gridImages[i], backgroundThreshold, null, { bgColor: chromaKeyBgColor })
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
        const startIndex = gridIndex * 8
        const endIndex = Math.min(startIndex + 8, getTotalStickerCount())
        const actualCutCount = endIndex - startIndex

        let cutCells = null
        let rawCutCells = null
        if (actualCutCount > 0 && hasAnyCropAdjustInRange(startIndex, actualCutCount)) {
          cutCells = await cropGridCellsWithAdjust(gridIndex, { useProcessed: true })
          rawCutCells = await cropGridCellsWithAdjust(gridIndex, { useProcessed: false })
        } else {
          cutCells = await splitGrid8(processedGridImages[gridIndex], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
          // 也從原圖裁切保留未去背版本
          rawCutCells = await splitGrid8(gridImages[gridIndex], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
        }

        allCutImages.push(...cutCells.slice(0, actualCutCount))
        allRawCutImages.push(...rawCutCells.slice(0, actualCutCount))
      }

      setCutImages(allCutImages)
      setRawCutImages(allRawCutImages)
      setProgress('裁切完成！正在生成主要圖片和標籤圖片...')

      // 生成主要圖片（240x240，無文字）— 已有則跳過。表情貼模式不需要主要圖片。
      if (stickerSpec.hasMain && !mainImage) {
        setProgress('正在生成主要圖片（240×240，無文字）...')
        const mainImg = await genMainImage(activeApiKey, characterImage, theme)
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

  // 單張下載（檔名/尺寸與 zip 內一致）
  const handleDownloadSingle = async (idx) => {
    const dataUrl = cutImages[idx]
    if (!dataUrl) return
    const isEmoji = stickerSpec?.key === 'emoji'
    const padLen = isEmoji ? 3 : 2
    const filename = `${String(idx + 1).padStart(padLen, '0')}.png`
    const targetW = stickerSpec?.cell?.w
    const targetH = stickerSpec?.cell?.h
    try {
      const fitted = (targetW && targetH) ? await fitToSize(dataUrl, targetW, targetH) : dataUrl
      const link = document.createElement('a')
      link.href = fitted
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('單張下載失敗', err)
      alert(`下載失敗: ${err.message}`)
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

  // 批次重新去背（用於調整閾值後）
  const handleReapplyBackground = async () => {
    setProcessingBackground(true)
    try {
      // 重新去背 8 宮格（從原圖）
      const newProcessed = []
      for (let i = 0; i < gridImages.length; i++) {
        const processed = await removeBackgroundSimple(gridImages[i], backgroundThreshold, null, { bgColor: chromaKeyBgColor })
        newProcessed.push(processed)
      }
      setProcessedGridImages(newProcessed)
      // 重新裁切
      let allCut = []
      let allRaw = []
      for (let i = 0; i < newProcessed.length; i++) {
        const startIdx = i * 8
        const totalNeeded = descriptions.length || count
        const actualCount = Math.max(0, Math.min(8, totalNeeded - startIdx))
        if (actualCount > 0 && hasAnyCropAdjustInRange(startIdx, actualCount)) {
          const { generateCell, cell } = stickerSpec
          const cuts = []
          const rawCuts = []
          for (let c = 0; c < 8; c++) {
            const row = Math.floor(c / 2)
            const col = c % 2
            const adj = getCropAdjust(startIdx + c)
            cuts.push(await cropSingleCell(newProcessed[i], row, col, generateCell.w, generateCell.h, cell.w, cell.h, adj.x, adj.y, adj.zoom))
            rawCuts.push(await cropSingleCell(gridImages[i], row, col, generateCell.w, generateCell.h, cell.w, cell.h, adj.x, adj.y, adj.zoom))
          }
          allCut = allCut.concat(cuts)
          allRaw = allRaw.concat(rawCuts)
        } else {
          const cuts = await splitGrid8(newProcessed[i], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
          const rawCuts = await splitGrid8(gridImages[i], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
          allCut = allCut.concat(cuts)
          allRaw = allRaw.concat(rawCuts)
        }
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

  // 標籤圖片去背 — delegated to tabEditor.removeBg
  const handleRemoveTabBg = tabEditor.removeBg

  return (
    <div className="app">
      <div className="container">
        <h1 className="title" style={{ cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: '8px' }} onClick={() => setPage('home')}>
          StampMill
          <span style={{ fontSize: '0.5em', color: '#888', fontWeight: 'normal' }}>
            v{__APP_VERSION__} · {__GIT_HASH__} · {__BUILD_DATE__}
          </span>
        </h1>

        {/* API Key — 所有頁面共用 */}
        <div className="step-section">
          <div className="form-group">
            <label>Gemini API Key <span style={{ color: '#888', fontWeight: 'normal', fontSize: '0.85em' }}>(文字生成 / 角色描述必填)</span></label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="請輸入您的 Gemini API Key"
              className="form-input"
            />
          </div>
          <div className="form-group" style={{ marginTop: '10px' }}>
            <label>圖像生成引擎</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 'normal' }}>
                <input
                  type="radio"
                  name="imageProvider"
                  value="gemini"
                  checked={imageProvider === 'gemini'}
                  onChange={() => setImageProvider('gemini')}
                />
                Gemini (gemini-3-pro-image-preview)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontWeight: 'normal' }}>
                <input
                  type="radio"
                  name="imageProvider"
                  value="openai"
                  checked={imageProvider === 'openai'}
                  onChange={() => setImageProvider('openai')}
                />
                gpt-image-2 (OpenAI)
              </label>
            </div>
          </div>
          {imageProvider === 'openai' && (
            <div className="form-group" style={{ marginTop: '10px' }}>
              <label>OpenAI API Key</label>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="請輸入您的 OpenAI API Key (sk-...)"
                className="form-input"
              />
              <div style={{ fontSize: '0.8em', color: '#888', marginTop: '4px' }}>
                注意：gpt-image-2 為純 text-to-image，不支援參考圖輸入，角色一致性依賴 prompt。
              </div>
            </div>
          )}
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
                <label className="btn btn-secondary btn-inline" style={{ marginLeft: '8px', cursor: 'pointer' }}>
                  匯入角色
                  <input
                    type="file"
                    accept="application/json"
                    onChange={handleImportCharacter}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              {characters.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: '30px' }}>還沒有角色，點擊「新增角色」開始</p>
              ) : (
                <div className="character-grid">
                  {characters.map(char => (
                    <div key={char.id} className="character-card">
                      {char.imageDataUrl ? (
                        <img src={char.imageDataUrl} alt={char.name} className="character-card-img" />
                      ) : (
                        <div className="character-card-img" style={{ background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '0.85em' }}>草稿</div>
                      )}
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
                          onClick={() => handleEditCharacter(char.id)}
                        >
                          編輯
                        </button>
                        <button
                          className="btn btn-secondary btn-inline"
                          onClick={() => handleExportCharacter(char.id)}
                        >
                          匯出
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
              <h2>{editingCharacterId ? '編輯角色' : '角色設計'}</h2>
              <button className="btn btn-secondary btn-inline" onClick={() => { setEditingCharacterId(null); setPage('home') }} style={{ marginBottom: '15px' }}>
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

              {/* 角色圖預覽 */}
              {characterImage && (
                <div className="character-preview">
                  <img src={characterImage} alt="角色圖" className="preview-image character-image" />
                </div>
              )}

              {/* 操作按鈕 */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
                {/* 儲存 */}
                {(characterImage || characterName.trim() || characterDescription.trim() || theme.trim()) && (
                  <button className="btn btn-success" onClick={handleSaveCharacter}>
                    {editingCharacterId ? '儲存變更' : (characterImage ? '儲存角色' : '先存草稿（無圖）')}
                  </button>
                )}

                {/* 生成 / 重新生成
                    單張上傳且未生成過（history 空）時：characterImage 是 raw 上傳，按鈕當「生成角色」用（把上傳當 ref 丟 generate），不走 Regenerate（會清圖）。
                    這樣單張上傳的使用者可「直接儲存」(右側按鈕) 或「生成」(此按鈕)。 */}
                {(() => {
                  const isRawUpload = uploadedCharacterImages.length === 1 && characterImageHistory.length === 0
                  const isGenerated = !!characterImage && !isRawUpload
                  return (
                    <button
                      className="btn btn-primary"
                      onClick={isGenerated ? handleRegenerateCharacter : handleGenerateCharacter}
                      disabled={
                        generatingCharacter ||
                        (!isGenerated && (
                          !activeApiKey ||
                          (!characterDescription.trim() && !theme.trim() && uploadedCharacterImages.length === 0)
                        ))
                      }
                    >
                      {generatingCharacter ? '生成中...' : (isGenerated ? '重新生成' : '生成角色')}
                    </button>
                  )
                })()}
              </div>

              {/* 生成歷史 */}
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
                <div className="form-group" style={{ marginTop: '6px' }}>
                  <label>8 宮格背景色（chroma-key，會影響生成 + 去背）</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <input
                      type="color"
                      value={chromaKeyBgColor}
                      onChange={(e) => setChromaKeyBgColor(e.target.value)}
                      style={{ width: '44px', height: '36px', padding: 0, border: '1px solid #ddd', borderRadius: '6px' }}
                      title="選擇 8 宮格底色（生成前先選好）"
                    />
                    <input
                      type="text"
                      value={chromaKeyBgColor.toUpperCase()}
                      onChange={() => {}}
                      readOnly
                      className="form-input"
                      style={{ width: '110px', fontFamily: 'monospace' }}
                    />
                    <span style={{ fontSize: '12px', color: '#999' }}>
                      建議避開角色/文字常用色（例如純白、膚色、常見衣服色）
                    </span>
                  </div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleGenerateStickers}
                  disabled={loading}
                >
                  {loading ? '生成中...' : (confirmEachGrid ? '逐組生成：先產一組' : '開始生成8宮格貼圖')}
                </button>
                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={confirmEachGrid}
                      onChange={(e) => setConfirmEachGrid(e.target.checked)}
                    />
                    <span style={{ fontSize: '14px', color: '#555' }}>逐組生成/確認（不要一次全產）</span>
                  </label>
                  <span style={{ fontSize: '12px', color: '#999' }}>
                    開啟後每次只會生成 1 組八宮格，確認 OK 再生成下一組
                  </span>
                </div>
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
                        const processed = await removeBackgroundSimple(gridImages[i], newThreshold, null, { bgColor: chromaKeyBgColor })
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

            <div className="form-group">
              <label>8 宮格背景色（chroma-key）</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <input
                  type="color"
                  value={chromaKeyBgColor}
                  onChange={async (e) => {
                    const newColor = e.target.value
                    setChromaKeyBgColor(newColor)
                    // 實時重跑去背（用新背景色）
                    setProcessingBackground(true)
                    try {
                      const newProcessed = []
                      for (let i = 0; i < gridImages.length; i++) {
                        const processed = await removeBackgroundSimple(gridImages[i], backgroundThreshold, null, { bgColor: newColor })
                        newProcessed.push(processed)
                      }
                      setProcessedGridImages(newProcessed)
                    } catch (error) {
                      console.error('去背處理失敗:', error)
                    } finally {
                      setProcessingBackground(false)
                    }
                  }}
                  style={{ width: '44px', height: '36px', padding: 0, border: '1px solid #ddd', borderRadius: '6px' }}
                  title="選擇 8 宮格底色（需與生成時一致）"
                />
                <input
                  type="text"
                  value={chromaKeyBgColor.toUpperCase()}
                  onChange={() => {}}
                  readOnly
                  className="form-input"
                  style={{ width: '110px', fontFamily: 'monospace' }}
                />
                <span style={{ fontSize: '12px', color: '#999' }}>
                  會影響「8 宮格」去背與後續單張補去背；主要圖/標籤圖不受影響
                </span>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleApplyBackgroundRemoval}
              disabled={processingBackground}
            >
              {processingBackground ? '處理中...' : '應用去背調整'}
            </button>

            {confirmEachGrid && (
              <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleGenerateNextGrid}
                  disabled={loading || processingBackground || getNextGridIndex() >= getGridCount()}
                  style={{ width: 'auto' }}
                >
                  {gridImages.length >= getGridCount() ? '已生成完全部八宮格' : `生成下一組（目前 ${gridImages.length}/${getGridCount()}）`}
                </button>
                <span style={{ fontSize: '12px', color: '#999' }}>
                  若這組不滿意，可用下方「單組重產」先調到滿意再繼續
                </span>
              </div>
            )}

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

            {/* 裁切前單格工具（在八宮格階段就能對某一格做重產/去背/選去/微調/上傳） */}
            <div className="preview-group" style={{ marginTop: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0 }}>裁切前單張工具（{processedGridImages.length} 張8宮格）</h3>
                <div style={{ fontSize: '12px', color: '#777' }}>
                  點「展開」後，每格會出現：重產 / 去背 / 選去 / 微調 / 上傳
                </div>
              </div>
              <div className="grid-preview" style={{ marginTop: '10px' }}>
                {processedGridImages.map((img, gridIdx) => {
                  const open = !!preCutPanelOpen[gridIdx]
                  const cellPreviews = preCutGridCellPreviews[gridIdx] || null
                  const totalNeeded = descriptions.length || count
                  const startIdx = gridIdx * 8
                  const visibleCount = Math.max(0, Math.min(8, totalNeeded - startIdx))
                  return (
                    <div key={`precut-${gridIdx}`} className="grid-item" style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <img src={img} alt={`裁切前單格 8宮格 ${gridIdx + 1}`} className="preview-image grid-image" style={{ background: previewBgColor }} />
                          <div>
                            <div style={{ fontWeight: 'bold' }}>8宮格 {gridIdx + 1}</div>
                            <div style={{ fontSize: '12px', color: '#777' }}>單張範圍：#{startIdx + 1} - #{startIdx + visibleCount}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button
                            className="btn btn-secondary btn-inline"
                            disabled={preCutLoadingGridIndex !== null || visibleCount === 0}
                            onClick={async () => {
                              setPreCutPanelOpen(prev => ({ ...prev, [gridIdx]: !open }))
                              if (open) return
                              if (preCutGridCellPreviews[gridIdx]) return
                              setPreCutLoadingGridIndex(gridIdx)
                              try {
                                await ensureGridCellsReady(gridIdx, { alsoCachePreviews: true })
                              } catch (e) {
                                alert('載入單格預覽失敗: ' + e.message)
                              } finally {
                                setPreCutLoadingGridIndex(null)
                              }
                            }}
                          >
                            {preCutLoadingGridIndex === gridIdx ? '載入中...' : (open ? '收合' : '展開')}
                          </button>
                          <button
                            className="btn btn-secondary btn-inline"
                            disabled={preCutLoadingGridIndex !== null || visibleCount === 0}
                            title="在八宮格上一次調整 8 個裁切筐（可複選移動/縮放）"
                            onClick={() => handleOpenMultiCropAdjust(gridIdx)}
                          >
                            批次微調
                          </button>
                        </div>
                      </div>

                      {open && (
                        <div style={{ marginTop: '10px', border: '1px solid #eee', borderRadius: '8px', padding: '10px', background: '#fff' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: '10px' }}>
                            {Array.from({ length: visibleCount }).map((_, cellIdx) => {
                              const stickerIndex = startIdx + cellIdx
                              const thumb = cellPreviews?.[cellIdx] || null
                              return (
                                <div key={`precut-cell-${stickerIndex}`} style={{ border: '1px solid #f0f0f0', borderRadius: '8px', padding: '8px', background: '#fafafa' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <strong style={{ fontSize: '12px' }}>#{stickerIndex + 1}</strong>
                                    <span style={{ fontSize: '11px', color: '#888' }}>{descriptions[stickerIndex]?.text || ''}</span>
                                  </div>
                                  <div style={{ width: '100%', aspectRatio: '1', background: '#fff', borderRadius: '6px', border: '1px solid #eee', overflow: 'hidden', marginBottom: '6px' }}>
                                    {thumb ? (
                                      <img src={thumb} alt={`#${stickerIndex + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain', background: previewBgColor }} />
                                    ) : (
                                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#999' }}>預覽準備中</div>
                                    )}
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                                    <button
                                      className="btn btn-regen"
                                      disabled={regeneratingIndex !== null || loading}
                                      title="重新生成（選參考圖 + 自訂 prompt）"
                                      onClick={async () => {
                                        try {
                                          // 先確保這組 8 格都裁出來，才有參考圖可選
                                          await ensureGridCellsReady(gridIdx)
                                          openRegenPanel(stickerIndex)
                                        } catch (e) {
                                          alert('準備單張資料失敗: ' + e.message)
                                        }
                                      }}
                                    >重產</button>
                                    <button
                                      className="btn btn-regen"
                                      disabled={removingBgIndex !== null || loading}
                                      title="自動去背（單張）"
                                      onClick={async () => {
                                        try {
                                          await ensureStickerReady(stickerIndex)
                                          await handleRemoveBgSingle(stickerIndex)
                                        } catch (e) {
                                          alert('單張去背失敗: ' + e.message)
                                        }
                                      }}
                                    >去背</button>
                                    <button
                                      className="btn btn-regen"
                                      title="點擊指定區域去背（單張）"
                                      onClick={async () => {
                                        try {
                                          await ensureStickerReady(stickerIndex)
                                          setClickRemoveUndoStack([])
                                          setPickedColor(null)
                                          setClickRemoveTarget({ index: stickerIndex, type: 'sticker' })
                                        } catch (e) {
                                          alert('準備選去失敗: ' + e.message)
                                        }
                                      }}
                                    >選去</button>
                                    <button
                                      className="btn btn-regen"
                                      title="微調裁切位置"
                                      onClick={async () => {
                                        try {
                                          await ensureGridCellsReady(gridIdx)
                                          handleOpenCropAdjust(stickerIndex)
                                        } catch (e) {
                                          alert('開啟微調失敗: ' + e.message)
                                        }
                                      }}
                                    >微調</button>
                                    <label className="btn btn-regen" style={{ cursor: 'pointer', textAlign: 'center' }} title="上傳替換圖片">
                                      上傳
                                      <input
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={async (e) => {
                                          try {
                                            const file = e.target.files?.[0]
                                            if (!file) return
                                            const dataUrl = await fileToDataURL(file)
                                            const totalNeeded2 = descriptions.length || count
                                            setRawCutImages(prev => {
                                              const u = ensureArraySize(prev, totalNeeded2)
                                              u[stickerIndex] = dataUrl
                                              return u
                                            })
                                            setCutImages(prev => {
                                              const u = ensureArraySize(prev, totalNeeded2)
                                              u[stickerIndex] = dataUrl
                                              return u
                                            })
                                          } finally {
                                            e.target.value = ''
                                          }
                                        }}
                                      />
                                    </label>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
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
                        onClick={mainEditor.regenerate}
                      >{regeneratingMain ? '生成中...' : '重產'}</button>
                      <button
                        className="btn btn-secondary btn-inline"
                        style={{ marginTop: '6px' }}
                        disabled={loading || removingMainBg}
                        onClick={mainEditor.removeBg}
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
                          onChange={mainEditor.handleUpload}
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
                          onClick={tabEditor.regenerate}
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
                    onConfirm={mainEditor.handleCropConfirm}
                    onCancel={mainEditor.handleCropCancel}
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
                    onConfirm={tabEditor.handleCropConfirm}
                    onCancel={tabEditor.handleCropCancel}
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
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '4px' }}>
                        <button
                          className="btn btn-regen"
                          onClick={() => openGridRegenPanel(idx)}
                          disabled={regeneratingGrid !== null || loading}
                          title="重新生成（選參考八宮格）"
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
                          onClick={() => handleOpenMultiCropAdjust(idx)}
                          disabled={preCutLoadingGridIndex !== null}
                          title="在八宮格上一次調整 8 個裁切筐（可複選移動/縮放）"
                        >
                          批次微調
                        </button>
                        <button
                          className="btn btn-regen"
                          onClick={() => handleRecutSingle(idx)}
                          disabled={recutGridIndex !== null || cutImages.length === 0}
                        >
                          {recutGridIndex === idx ? '...' : '裁切'}
                        </button>
                      </div>
                      {gridRegenPanel?.gridIndex === idx && (
                        <div style={{ marginTop: '8px', border: '2px solid #ff9800', borderRadius: '8px', padding: '10px', background: '#fffbf2' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <strong style={{ fontSize: '0.9em', color: '#e65100' }}>重產 八宮格 {idx + 1} · 選參考八宮格</strong>
                            <button className="btn btn-regen" style={{ padding: '2px 8px', fontSize: '0.8em' }} onClick={() => setGridRegenPanel(null)}>取消</button>
                          </div>
                          <div style={{ fontSize: '0.75em', color: '#666', marginBottom: '4px' }}>
                            點縮圖加入/移除參考（上限 10，選 {gridRegenPanel.refGridIndexes.length}）。
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: '4px', maxHeight: '220px', overflowY: 'auto', marginBottom: '6px', padding: '4px', background: '#fff', border: '1px solid #eee', borderRadius: '4px' }}>
                            {gridImages.map((g, gi) => {
                              if (!g || gi === idx) return null
                              const selected = gridRegenPanel.refGridIndexes.includes(gi)
                              const thumb = processedGridImages[gi] || g
                              return (
                                <div
                                  key={gi}
                                  onClick={() => toggleGridRegenRef(gi)}
                                  style={{ position: 'relative', cursor: 'pointer', border: selected ? '2px solid #ff9800' : '2px solid #ddd', borderRadius: '6px', overflow: 'hidden', background: '#fafafa' }}
                                  title={`八宮格 ${gi + 1}`}
                                >
                                  <img src={thumb} alt={`八宮格 ${gi + 1}`} style={{ width: '100%', height: '72px', objectFit: 'cover' }} />
                                  <span style={{ position: 'absolute', top: '1px', left: '1px', background: selected ? '#ff9800' : 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: '3px', padding: '0 4px', fontSize: '10px', fontWeight: 'bold' }}>{gi + 1}</span>
                                </div>
                              )
                            })}
                          </div>
                          <button
                            className="btn btn-regen"
                            style={{ width: '100%', background: '#ff9800', color: '#fff', fontWeight: 'bold' }}
                            disabled={regeneratingGrid !== null || loading}
                            onClick={() => {
                              const opts = { refGridIndexes: gridRegenPanel.refGridIndexes }
                              setGridRegenPanel(null)
                              handleRegenerateGrid(idx, opts)
                            }}
                          >
                            開始重產
                          </button>
                        </div>
                      )}
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
            <StickerPreviewGrid
              cutImages={cutImages}
              rawCutImages={rawCutImages}
              setRawCutImages={setRawCutImages}
              setCutImages={setCutImages}
              descriptions={descriptions}
              setDescriptions={setDescriptions}
              stickerHistory={stickerHistory}
              setStickerHistory={setStickerHistory}
              stickerSpec={stickerSpec}
              previewBgColor={previewBgColor}
              getStickerThreshold={getStickerThreshold}
              setStickerThresholds={setStickerThresholds}
              removingBgIndex={removingBgIndex}
              regeneratingIndex={regeneratingIndex}
              loading={loading}
              regenPanel={regenPanel}
              setRegenPanel={setRegenPanel}
              openRegenPanel={openRegenPanel}
              toggleRegenRef={toggleRegenRef}
              handleRegenerateSingleSticker={handleRegenerateSingleSticker}
              handleRemoveBgSingle={handleRemoveBgSingle}
              handleOpenCropAdjust={handleOpenCropAdjust}
              setClickRemoveUndoStack={setClickRemoveUndoStack}
              setPickedColor={setPickedColor}
              setClickRemoveTarget={setClickRemoveTarget}
              cropAdjustTarget={cropAdjustTarget}
              processedGridImages={processedGridImages}
              handleCropAdjustConfirm={handleCropAdjustConfirm}
              setCropAdjustTarget={setCropAdjustTarget}
              handleDownloadSingle={handleDownloadSingle}
            />

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
                {cutImages.filter(Boolean).length >= 2 && (
                  <button
                    className="btn"
                    style={{ marginTop: '10px', background: '#7c4dff', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '1em', fontWeight: 'bold' }}
                    onClick={handleOpenGifModal}
                    disabled={loading}
                  >
                    製作動圖 (APNG)
                  </button>
                )}
              </div>
            )}

            {/* 動圖製作 Modal */}
            {gifModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
                  <h3 style={{ margin: '0 0 12px', color: '#333' }}>製作動圖 (APNG)</h3>
                  <p style={{ fontSize: '0.85em', color: '#666', margin: '0 0 12px' }}>
                    選擇要加入動圖的貼圖幀，設定播放速度後下載。輸出為 APNG（320×270px），符合 LINE 動態貼圖規格，最多 20 幀。
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '6px', marginBottom: '16px', maxHeight: '240px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '8px' }}>
                    {cutImages.map((img, i) => {
                      if (!img) return null
                      const selected = gifSelectedFrames.includes(i)
                      const order = gifSelectedFrames.indexOf(i)
                      return (
                        <div
                          key={i}
                          onClick={() => handleToggleGifFrame(i)}
                          style={{ position: 'relative', cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', border: selected ? '2px solid #7c4dff' : '2px solid #ddd', aspectRatio: '1', background: '#f5f5f5' }}
                          title={`幀 ${i + 1}`}
                        >
                          <img src={img} alt={`幀${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          {selected ? (
                            <span style={{ position: 'absolute', top: '2px', left: '2px', background: '#7c4dff', color: '#fff', borderRadius: '10px', padding: '0 4px', fontSize: '10px', fontWeight: 'bold', lineHeight: '16px' }}>{order + 1}</span>
                          ) : (
                            <span style={{ position: 'absolute', top: '2px', left: '2px', background: 'rgba(0,0,0,0.4)', color: '#fff', borderRadius: '10px', padding: '0 4px', fontSize: '10px', lineHeight: '16px' }}>{i + 1}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p style={{ fontSize: '0.8em', color: '#999', margin: '-8px 0 14px' }}>已選 {gifSelectedFrames.length} 幀，點擊縮圖選取/取消，數字為播放順序</p>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <button style={{ fontSize: '0.85em', padding: '4px 12px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }} onClick={() => setGifSelectedFrames(cutImages.map((img, i) => img ? i : null).filter(i => i !== null))}>全選</button>
                    <button style={{ fontSize: '0.85em', padding: '4px 12px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }} onClick={() => setGifSelectedFrames([])}>清空</button>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.9em', color: '#555', display: 'block', marginBottom: '6px' }}>
                      每幀時間：{(gifDelay / 100).toFixed(2)} 秒
                    </label>
                    <input type="range" min="10" max="300" step="10" value={gifDelay} onChange={e => setGifDelay(Number(e.target.value))} style={{ width: '100%' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', color: '#999' }}>
                      <span>快（0.1s）</span><span>慢（3s）</span>
                    </div>
                  </div>
                  {gifProgress && (
                    <p style={{ fontSize: '0.85em', color: '#7c4dff', margin: '0 0 10px', textAlign: 'center' }}>{gifProgress}</p>
                  )}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      style={{ flex: 1, background: '#7c4dff', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '1em', fontWeight: 'bold', opacity: gifGenerating ? 0.6 : 1 }}
                      onClick={handleDownloadGif}
                      disabled={gifGenerating || gifSelectedFrames.length === 0}
                    >{gifGenerating ? '製作中...' : '下載 APNG'}</button>
                    <button
                      style={{ padding: '10px 18px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '1em' }}
                      onClick={() => { setGifModal(false); setGifProgress('') }}
                      disabled={gifGenerating}
                    >取消</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* 八宮格批次微調 Modal */}
      {multiCropAdjustTarget && (
        <GridMultiCropAdjustPanel
          gridSrc={(processedGridImages[multiCropAdjustTarget.gridIndex] || gridImages[multiCropAdjustTarget.gridIndex])}
          rawGridSrc={gridImages[multiCropAdjustTarget.gridIndex]}
          gridIndex={multiCropAdjustTarget.gridIndex}
          startStickerIndex={multiCropAdjustTarget.gridIndex * 8}
          visibleCount={Math.max(0, Math.min(8, (descriptions.length || count) - multiCropAdjustTarget.gridIndex * 8))}
          cellW={stickerSpec.generateCell.w}
          cellH={stickerSpec.generateCell.h}
          initialAdjustments={cropAdjustHistory}
          onApply={(cellsForGrid) => handleApplyMultiCropAdjust(multiCropAdjustTarget.gridIndex, cellsForGrid)}
          onCancel={() => setMultiCropAdjustTarget(null)}
        />
      )}

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
