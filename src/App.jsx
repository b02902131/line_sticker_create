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
import StickerProducePage from './pages/StickerProducePage'
import { useSingleImageEditor } from './hooks/useSingleImageEditor'
import { useGridEditor } from './hooks/useGridEditor'
import { useStickerEditor } from './hooks/useStickerEditor'
import { useDescriptionsEditor } from './hooks/useDescriptionsEditor'
import { useClickRemoveEditor } from './hooks/useClickRemoveEditor'
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
  const ensureArraySize = gridEditor.ensureArraySize
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
  const setGifProgress = animationEditor.setGifProgress
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

  // ===== useClickRemoveEditor hook =====
  const clickRemoveEditor = useClickRemoveEditor({
    cutImages,
    setCutImages,
    processedGridImages,
    setProcessedGridImages,
    mainImage,
    setMainImage,
    tabImage,
    setTabImage,
    gridImages,
  })
  const clickRemoveTarget = clickRemoveEditor.clickRemoveTarget
  const setClickRemoveTarget = clickRemoveEditor.setClickRemoveTarget
  const clickRemoveThreshold = clickRemoveEditor.clickRemoveThreshold
  const setClickRemoveThreshold = clickRemoveEditor.setClickRemoveThreshold
  const clickRemoveMode = clickRemoveEditor.clickRemoveMode
  const setClickRemoveMode = clickRemoveEditor.setClickRemoveMode
  const clickRemoveUndoStack = clickRemoveEditor.clickRemoveUndoStack
  const setClickRemoveUndoStack = clickRemoveEditor.setClickRemoveUndoStack
  const pickedColor = clickRemoveEditor.pickedColor
  const setPickedColor = clickRemoveEditor.setPickedColor
  const colorRectStart = clickRemoveEditor.colorRectStart
  const setColorRectStart = clickRemoveEditor.setColorRectStart
  const colorRectEnd = clickRemoveEditor.colorRectEnd
  const setColorRectEnd = clickRemoveEditor.setColorRectEnd
  const isDraggingRect = clickRemoveEditor.isDraggingRect
  const getClickRemoveSource = clickRemoveEditor.getClickRemoveSource
  const applyResult = clickRemoveEditor.applyResult
  const clickRemoveCanvasRef = clickRemoveEditor.clickRemoveCanvasRef
  const clickRemoveLensRef = clickRemoveEditor.clickRemoveLensRef
  const handleClickRemoveUndo = clickRemoveEditor.handleClickRemoveUndo
  const handleClickRemoveFlood = clickRemoveEditor.handleClickRemoveFlood
  const handleColorPick = clickRemoveEditor.handleColorPick
  const handleColorRectMouseDown = clickRemoveEditor.handleColorRectMouseDown
  const handleColorRectMouseMove = clickRemoveEditor.handleColorRectMouseMove
  const handleColorRectMouseUp = clickRemoveEditor.handleColorRectMouseUp

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

  // clickRemove handlers → from useClickRemoveEditor aliases above

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
          <StickerProducePage
            setPage={setPage}
            selectedCharacter={selectedCharacter}
            count={count} setCount={setCount}
            stickerTypeKey={stickerTypeKey} setStickerTypeKey={setStickerTypeKey}
            stickerSpec={stickerSpec}
            textStyle={textStyle} setTextStyle={setTextStyle}
            theme={theme}
            apiKey={apiKey}
            generatingTextStyle={generatingTextStyle}
            handleGenerateTextStyle={handleGenerateTextStyle}
            descriptions={descriptions} setDescriptions={setDescriptions}
            generatingDescriptions={generatingDescriptions}
            excludedTexts={excludedTexts} setExcludedTexts={setExcludedTexts}
            characterStance={characterStance} setCharacterStance={setCharacterStance}
            bulkText={bulkText} setBulkText={setBulkText}
            handleImportBulkText={handleImportBulkText}
            handleInitDescriptions={handleInitDescriptions}
            handleGenerateDescriptions={handleGenerateDescriptions}
            generatingSingle={generatingSingle}
            generatingText={generatingText} handleGenerateText={handleGenerateText}
            generatingDesc={generatingDesc} handleGenerateDesc={handleGenerateDesc}
            batchGeneratingDesc={batchGeneratingDesc} handleBatchGenerateDesc={handleBatchGenerateDesc}
            handleDeleteDescription={handleDeleteDescription}
            handleUpdateDescription={handleUpdateDescription}
            handleExportDescriptions={handleExportDescriptions}
            dragIdx={dragIdx}
            handleDragStart2={handleDragStart2} handleDragOver2={handleDragOver2} handleDrop2={handleDrop2}
            gridImages={gridImages}
            processedGridImages={processedGridImages} setProcessedGridImages={setProcessedGridImages}
            cutImages={cutImages} setCutImages={setCutImages}
            rawCutImages={rawCutImages} setRawCutImages={setRawCutImages}
            stickerHistory={stickerHistory} setStickerHistory={setStickerHistory}
            stickerThresholds={stickerThresholds} setStickerThresholds={setStickerThresholds}
            regeneratingGrid={regeneratingGrid} removingBgGrid={removingBgGrid}
            recutGridIndex={recutGridIndex} recutting={recutting}
            gridRegenPanel={gridRegenPanel} setGridRegenPanel={setGridRegenPanel}
            openGridRegenPanel={openGridRegenPanel} toggleGridRegenRef={toggleGridRegenRef}
            cropAdjustTarget={cropAdjustTarget} setCropAdjustTarget={setCropAdjustTarget}
            cropAdjustHistory={cropAdjustHistory} setCropAdjustHistory={setCropAdjustHistory}
            multiCropAdjustTarget={multiCropAdjustTarget} setMultiCropAdjustTarget={setMultiCropAdjustTarget}
            preCutGridCellPreviews={preCutGridCellPreviews} setPreCutGridCellPreviews={setPreCutGridCellPreviews}
            preCutPanelOpen={preCutPanelOpen} setPreCutPanelOpen={setPreCutPanelOpen}
            preCutLoadingGridIndex={preCutLoadingGridIndex} setPreCutLoadingGridIndex={setPreCutLoadingGridIndex}
            getTotalStickerCount={getTotalStickerCount} getGridCount={getGridCount} getNextGridIndex={getNextGridIndex}
            getStickerThreshold={getStickerThreshold}
            hasAnyCropAdjustInRange={hasAnyCropAdjustInRange} cropGridCellsWithAdjust={cropGridCellsWithAdjust}
            ensureGridCellsReady={ensureGridCellsReady} ensureStickerReady={ensureStickerReady} ensureArraySize={ensureArraySize}
            handleRegenerateGrid={handleRegenerateGrid} handleRemoveBgGrid={handleRemoveBgGrid}
            handleRecutSingle={handleRecutSingle} handleRecut={handleRecut}
            handleOpenCropAdjust={handleOpenCropAdjust} handleCropAdjustConfirm={handleCropAdjustConfirm}
            handleOpenMultiCropAdjust={handleOpenMultiCropAdjust}
            removingBgIndex={removingBgIndex} handleRemoveBgSingle={handleRemoveBgSingle}
            regeneratingIndex={regeneratingIndex} regenPanel={regenPanel} setRegenPanel={setRegenPanel}
            openRegenPanel={openRegenPanel} toggleRegenRef={toggleRegenRef}
            handleRegenerateSingleSticker={handleRegenerateSingleSticker}
            mainImage={mainImage} rawMainImage={rawMainImage}
            mainThreshold={mainThreshold} setMainThreshold={setMainThreshold}
            regeneratingMain={regeneratingMain} removingMainBg={removingMainBg}
            mainCropSource={mainCropSource} setMainCropSource={setMainCropSource}
            mainEditor={mainEditor}
            tabImage={tabImage} rawTabImage={rawTabImage}
            tabThreshold={tabThreshold} setTabThreshold={setTabThreshold}
            regeneratingTab={regeneratingTab} removingTabBg={removingTabBg}
            tabCropSource={tabCropSource} setTabCropSource={setTabCropSource}
            tabEditor={tabEditor}
            handleRemoveTabBg={handleRemoveTabBg}
            backgroundThreshold={backgroundThreshold} setBackgroundThreshold={setBackgroundThreshold}
            chromaKeyBgColor={chromaKeyBgColor} setChromaKeyBgColor={setChromaKeyBgColor}
            confirmEachGrid={confirmEachGrid} setConfirmEachGrid={setConfirmEachGrid}
            processingBackground={processingBackground} setProcessingBackground={setProcessingBackground}
            previewBackgroundDark={previewBackgroundDark} setPreviewBackgroundDark={setPreviewBackgroundDark}
            previewBgColor={previewBgColor} setPreviewBgColor={setPreviewBgColor}
            PREVIEW_BG_COLORS={PREVIEW_BG_COLORS}
            progress={progress}
            loading={loading}
            currentStep={currentStep}
            handleGenerateStickers={handleGenerateStickers}
            handleGenerateNextGrid={handleGenerateNextGrid}
            handleApplyBackgroundRemoval={handleApplyBackgroundRemoval}
            handleSplitGrids={handleSplitGrids}
            handleReapplyBackground={handleReapplyBackground}
            handleDownload={handleDownload}
            handleDownloadSingle={handleDownloadSingle}
            clickRemoveTarget={clickRemoveTarget} setClickRemoveTarget={setClickRemoveTarget}
            clickRemoveThreshold={clickRemoveThreshold} setClickRemoveThreshold={setClickRemoveThreshold}
            clickRemoveMode={clickRemoveMode} setClickRemoveMode={setClickRemoveMode}
            clickRemoveUndoStack={clickRemoveUndoStack} setClickRemoveUndoStack={setClickRemoveUndoStack}
            pickedColor={pickedColor} setPickedColor={setPickedColor}
            colorRectStart={colorRectStart} setColorRectStart={setColorRectStart}
            colorRectEnd={colorRectEnd} setColorRectEnd={setColorRectEnd}
            isDraggingRect={isDraggingRect}
            clickRemoveCanvasRef={clickRemoveCanvasRef} clickRemoveLensRef={clickRemoveLensRef}
            getClickRemoveSource={getClickRemoveSource} applyResult={applyResult}
            handleClickRemoveUndo={handleClickRemoveUndo} handleClickRemoveFlood={handleClickRemoveFlood}
            handleColorPick={handleColorPick}
            handleColorRectMouseDown={handleColorRectMouseDown} handleColorRectMouseMove={handleColorRectMouseMove} handleColorRectMouseUp={handleColorRectMouseUp}
            handleOpenGifModal={handleOpenGifModal}
            gifModal={gifModal} setGifModal={setGifModal}
            gifSelectedFrames={gifSelectedFrames} setGifSelectedFrames={setGifSelectedFrames}
            gifDelay={gifDelay} setGifDelay={setGifDelay}
            gifGenerating={gifGenerating} gifProgress={gifProgress} setGifProgress={setGifProgress}
            handleToggleGifFrame={handleToggleGifFrame} handleDownloadGif={handleDownloadGif}
          />
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

    </div>
  )
}

export default App
