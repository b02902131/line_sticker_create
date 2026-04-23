import { useState } from 'react'
import { generateTextStyle, generateSingleDescription, generateSingleText, generateSingleDescriptionFromText } from '../utils/gemini'

/**
 * useDescriptionsEditor
 *
 * Encapsulates sticker text/description list editing logic:
 *   - Bulk text import (bulkText, handleImportBulkText)
 *   - Per-sticker AI text/desc generation (generatingSingle, generatingText, generatingDesc)
 *   - Batch description fill (batchGeneratingDesc, handleBatchGenerateDesc)
 *   - Drag-to-sort (dragIdx, handleDragStart2, handleDragOver2, handleDrop2)
 *   - CRUD helpers (handleInitDescriptions, handleDeleteDescription,
 *                   handleUpdateDescription, handleExportDescriptions)
 *
 * @param {object} opts
 * @param {string}   opts.apiKey
 * @param {string}   opts.theme
 * @param {string}   opts.characterDescription
 * @param {string}   opts.characterStance
 * @param {string}   opts.textStyle
 * @param {Function} opts.setTextStyle
 * @param {Array}    opts.descriptions        - [{ description, text }]
 * @param {Function} opts.setDescriptions
 * @param {number}   opts.count
 * @param {Function} opts.setCount
 * @param {Function} opts.setProgress         - (msg) => void
 */
export function useDescriptionsEditor({
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
} = {}) {
  // ---- Init ----
  const handleInitDescriptions = () => {
    if (descriptions.length === count) return
    const items = Array.from({ length: count }, (_, i) => (
      descriptions[i] || { description: '', text: '' }
    ))
    setDescriptions(items)
  }

  // ---- Bulk text import ----
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

  // ---- Single generate (text+desc together) ----
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

  // ---- Single AI text generation ----
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

  // ---- Single AI description generation (from text) ----
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

  // ---- Batch AI description fill ----
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

  // ---- Delete ----
  const handleDeleteDescription = (index) => {
    const newDescriptions = descriptions.filter((_, i) => i !== index)
    setDescriptions(newDescriptions)
    setCount(newDescriptions.length)
  }

  // ---- Drag-to-sort ----
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

  // ---- Export ----
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

  // ---- Update ----
  const handleUpdateDescription = (index, field, value) => {
    const newDescriptions = [...descriptions]
    newDescriptions[index][field] = value
    setDescriptions(newDescriptions)
  }

  return {
    // Bulk import
    bulkText,
    setBulkText,
    handleImportBulkText,
    // Init
    handleInitDescriptions,
    // Single AI generate
    generatingSingle,
    handleGenerateSingle,
    generatingText,
    handleGenerateText,
    generatingDesc,
    handleGenerateDesc,
    // Batch generate
    batchGeneratingDesc,
    handleBatchGenerateDesc,
    // CRUD
    handleDeleteDescription,
    handleUpdateDescription,
    handleExportDescriptions,
    // Drag sort
    dragIdx,
    handleDragStart2,
    handleDragOver2,
    handleDrop2,
  }
}
