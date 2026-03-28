import React, { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'
import { generateImageDescriptionsWithText, generateTextStyle, generateSingleDescription, generateSingleText, generateSingleDescriptionFromText } from './utils/gemini'
import { generateCharacter, generateStickerWithText, generateMainImage, generateTabImage, generateGrid8Image } from './utils/characterGenerator'
import { createGrid8, splitGrid8, removeBackgroundSimple, fileToDataURL } from './utils/imageUtils'
import { downloadAsZip } from './utils/zipDownloader'
import { saveCharacterImages, loadCharacterImages, deleteCharacterImages } from './utils/imageStore'
import { syncSaveCharacters, syncLoadCharacters, syncSaveDescs, syncLoadDescs, syncDeleteDescs } from './utils/localSync'

const LS_KEY = 'stampmill_draft'
const LS_CHARACTERS = 'stampmill_characters'

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {} } catch { return {} }
}
function loadCharacters() {
  try { return JSON.parse(localStorage.getItem(LS_CHARACTERS)) || [] } catch { return [] }
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
  const [uploadedCharacterImage, setUploadedCharacterImage] = useState(null)
  const [characterImage, setCharacterImage] = useState(restoredChar?.imageDataUrl || null)
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
    setUploadedCharacterImage(null)
    setCharacterImage(null)
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

  // 讀取角色的 descriptions
  const loadCharDescs = (charId) => {
    try { return JSON.parse(localStorage.getItem(`stampmill_descs_${charId}`)) || [] }
    catch { return [] }
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
    setTextStyleConfirmed(false)
    setDescriptions(loadCharDescs(char.id))
    setPage('sticker-produce')

    // 嘗試從 IndexedDB 恢復已保存的圖片
    try {
      const saved = await loadCharacterImages(char.id)
      if (saved) {
        if (saved.gridImages?.length > 0) setGridImages(saved.gridImages)
        if (saved.processedGridImages?.length > 0) setProcessedGridImages(saved.processedGridImages)
        if (saved.cutImages?.length > 0) setCutImages(saved.cutImages)
        if (saved.mainImage) setMainImage(saved.mainImage)
        if (saved.tabImage) setTabImage(saved.tabImage)
        if (saved.backgroundThreshold) setBackgroundThreshold(saved.backgroundThreshold)
        // 根據已有數據跳到對應步驟
        if (saved.cutImages?.length > 0 && saved.mainImage && saved.tabImage) {
          setCurrentStep(9)
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

  // 啟動時從本地檔案同步角色資料
  useEffect(() => {
    syncLoadCharacters().then(fileChars => {
      if (fileChars.length > 0) setCharacters(fileChars)
    })
  }, [])

  // 自動暫存到 localStorage
  useEffect(() => {
    const data = { apiKey, count, textStyle, excludedTexts, characterStance, selectedCharacterId: selectedCharacter?.id }
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  }, [apiKey, count, textStyle, excludedTexts, characterStance, selectedCharacter])

  // descriptions by character
  useEffect(() => {
    if (selectedCharacter?.id) saveCharDescs(selectedCharacter.id, descriptions)
  }, [descriptions, selectedCharacter])

  // 步驟 6-8: 8宮格生成、去背、裁切
  const [gridImages, setGridImages] = useState([]) // 8宮格圖片陣列
  const [processedGridImages, setProcessedGridImages] = useState([]) // 去背後的8宮格
  const [cutImages, setCutImages] = useState([]) // 裁切後的單張圖片
  const [mainImage, setMainImage] = useState(null) // 主要圖片 240x240
  const [tabImage, setTabImage] = useState(null) // 標籤圖片 96x74
  const [backgroundThreshold, setBackgroundThreshold] = useState(240) // 去背閾值
  const [processingBackground, setProcessingBackground] = useState(false) // 正在處理去背
  const [previewBackgroundDark, setPreviewBackgroundDark] = useState(false) // 預覽背景是否為深色
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
        mainImage,
        tabImage,
        backgroundThreshold
      }).catch(err => console.warn('保存圖片到 IndexedDB 失敗:', err))
    }, 1000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [gridImages, processedGridImages, cutImages, mainImage, tabImage, selectedCharacter, backgroundThreshold])

  // 共用：處理圖片檔案
  const handleImageFile = useCallback(async (file) => {
    if (file && file.type.startsWith('image/')) {
      const dataUrl = await fileToDataURL(file)
      setUploadedCharacterImage(dataUrl)
      setCharacterImage(dataUrl)
      setCharacterConfirmed(false)
    }
  }, [])

  // 處理角色圖片上傳
  const handleCharacterUpload = async (e) => {
    handleImageFile(e.target.files[0])
  }

  // 拖拉放
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    handleImageFile(file)
  }, [handleImageFile])

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
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          handleImageFile(item.getAsFile())
          break
        }
      }
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handleImageFile])

  // 步驟 4: 生成角色
  const handleGenerateCharacter = async () => {
    if (!apiKey.trim()) {
      alert('請輸入 Gemini API Key')
      return
    }
    if (!characterDescription.trim() && !uploadedCharacterImage) {
      alert('請輸入角色描述或上傳角色圖片')
      return
    }

    setGeneratingCharacter(true)
    setProgress('正在生成角色圖片...')

    try {
      const character = await generateCharacter(apiKey, characterDescription || theme, uploadedCharacterImage, characterDescription)
      setCharacterImage(character)
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

    // 檢查文字是否重複
    const textSet = new Set()
    const duplicateTexts = []
    for (let i = 0; i < descriptions.length; i++) {
      const text = descriptions[i].text?.trim()
      if (!text) {
        alert(`第 ${i + 1} 張貼圖的文字為空，請填寫`)
        return
      }
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
              previousGrid
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
      const gridCount = processedGridImages.length

      for (let gridIndex = 0; gridIndex < gridCount; gridIndex++) {
        setProgress(`正在裁切第 ${gridIndex + 1}/${gridCount} 張8宮格...`)
        const cutCells = await splitGrid8(processedGridImages[gridIndex], 370, 320)
        
        // 計算這個8宮格實際有多少張貼圖
        const startIndex = gridIndex * 8
        const endIndex = Math.min(startIndex + 8, count)
        const actualCutCount = endIndex - startIndex
        
        allCutImages.push(...cutCells.slice(0, actualCutCount))
      }

      setCutImages(allCutImages)
      setProgress('裁切完成！正在生成主要圖片和標籤圖片...')

      // 生成主要圖片（240x240，無文字）
      setProgress('正在生成主要圖片（240×240，無文字）...')
      const mainImg = await generateMainImage(apiKey, characterImage, theme)
      const mainImgProcessed = await removeBackgroundSimple(mainImg, backgroundThreshold)
      setMainImage(mainImgProcessed)

      // 生成標籤圖片（96x74，無文字，角色為主）
      setProgress('正在生成標籤圖片（96×74，無文字）...')
      const tabImg = await generateTabImage(apiKey, characterImage, theme)
      const tabImgProcessed = await removeBackgroundSimple(tabImg, backgroundThreshold)
      setTabImage(tabImgProcessed)

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

      await downloadAsZip(imagesForDownload, mainImage, tabImage, theme, selectedCharacter?.name)
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
        apiKey, characterImage, gridStickers, textStyle || '', previousGrid
      )
      const newGridImages = [...gridImages]
      newGridImages[gridIndex] = newGridImage
      setGridImages(newGridImages)

      // 重新去背 + 裁切這組
      const processed = await removeBackgroundSimple(newGridImage, backgroundThreshold, null)
      const newProcessed = [...processedGridImages]
      newProcessed[gridIndex] = processed
      setProcessedGridImages(newProcessed)

      const newCuts = await splitGrid8(processed)
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
        370,
        320
      )

      const processedSticker = await removeBackgroundSimple(newStickerDataUrl, backgroundThreshold, null)

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
                          產貼圖
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
                <label>角色名稱</label>
                <input
                  type="text"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  placeholder="為角色取個名字..."
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>角色描述（可搭配上傳圖片一起使用）</label>
                <textarea
                  value={characterDescription}
                  onChange={(e) => setCharacterDescription(e.target.value)}
                  placeholder="請描述角色的外觀、特徵、風格等..."
                  rows={3}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>上傳角色參考圖片（可搭配文字描述一起使用）</label>
                <div
                  className={`drop-zone${dragging ? ' drop-zone--active' : ''}`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  {uploadedCharacterImage ? (
                    <div>
                      <img src={uploadedCharacterImage} alt="上傳的角色" className="preview-image-small" />
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                        <p className="success-message" style={{ margin: 0 }}>✓ 已上傳角色圖片</p>
                        <button
                          className="btn btn-secondary btn-inline"
                          onClick={() => { setUploadedCharacterImage(null); setCharacterImage(null); setCharacterConfirmed(false) }}
                        >
                          清除圖片
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="drop-zone-hint">拖拉圖片到這裡、Ctrl+V 貼上、或點擊下方選擇檔案</p>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCharacterUpload}
                    className="form-input"
                  />
                </div>
              </div>
              <div className="form-group">
                <label>主題說明</label>
                <textarea
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  placeholder="請描述貼圖的主題、情境、用途等..."
                  rows={3}
                  className="form-input"
                />
              </div>
            </div>

            {/* 生成 / 確認角色 */}
            <div className="step-section">
              <h2>角色預覽</h2>

              {uploadedCharacterImage && characterImage && (
                <div className="character-preview">
                  <img src={characterImage} alt="上傳的角色" className="preview-image character-image" />
                  <button className="btn btn-success" onClick={handleSaveCharacter} style={{ marginTop: '10px' }}>
                    儲存角色
                  </button>
                </div>
              )}

              {!uploadedCharacterImage && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleGenerateCharacter}
                    disabled={generatingCharacter || !apiKey || (!characterDescription.trim() && !theme.trim())}
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
                  min="200"
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
            
            {/* 主要圖片和標籤圖片 */}
            {(mainImage || tabImage) && (
              <div className="preview-group">
                <h3>主要圖片和標籤圖片</h3>
                <div className="main-tab-preview">
                  {mainImage && (
                    <div className="preview-item">
                      <h4>主要圖片 (240×240)</h4>
                      <img src={mainImage} alt="主要圖片" className="preview-image main-image" />
                    </div>
                  )}
                  {tabImage && (
                    <div className="preview-item">
                      <h4>標籤圖片 (96×74)</h4>
                      <img src={tabImage} alt="標籤圖片" className="preview-image tab-image" />
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* 8宮格預覽 */}
            {gridImages.length > 0 && (
              <div className="preview-group">
                <h3>8宮格圖片（{gridImages.length} 張）</h3>
                <div className="grid-preview">
                  {gridImages.map((img, idx) => (
                    <div key={idx} className="grid-item">
                      <img src={img} alt={`8宮�� ${idx + 1}`} className="preview-image grid-image" />
                      <button
                        className="btn btn-regen"
                        onClick={() => handleRegenerateGrid(idx)}
                        disabled={regeneratingGrid !== null || loading}
                      >
                        {regeneratingGrid === idx ? '生成中...' : '重產這組'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 裁切後的單張預覽 */}
            <div className="preview-group">
              <h3>裁切後的貼圖（{cutImages.length} 張）</h3>
              <div className="sticker-grid">
                {cutImages.map((img, idx) => (
                  <div key={idx} className="sticker-item">
                    <img src={img} alt={`貼圖 ${idx + 1}`} className="preview-image sticker-image" />
                    <p className="sticker-info">
                      {descriptions[idx]?.description || `貼圖 ${idx + 1}`}
                      <br />
                      <strong>{descriptions[idx]?.text || ''}</strong>
                    </p>
                    <button
                      className="btn btn-regen"
                      onClick={() => handleRegenerateSingleSticker(idx)}
                      disabled={regeneratingIndex !== null || loading}
                    >
                      {regeneratingIndex === idx ? '生成中...' : '重產'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 下載按鈕 - 只在步驟 9 顯示 */}
            {currentStep === 9 && mainImage && tabImage && (
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
    </div>
  )
}

export default App
