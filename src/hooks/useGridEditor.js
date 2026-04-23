import { useState, useCallback } from 'react'
import { removeBackgroundSimple } from '../utils/imageUtils'
import { splitGrid8, cropSingleCell } from '../utils/imageUtils'

/**
 * useGridEditor
 *
 * Encapsulates all 8-grid image state and logic:
 *   - State: gridImages, processedGridImages, cutImages, rawCutImages
 *   - Crop adjust: cropAdjustHistory, cropAdjustTarget, multiCropAdjustTarget
 *   - Per-grid regen, bg removal, recut helpers
 *   - Pre-cut cell preview cache
 *
 * @param {object} opts
 * @param {Function} opts.generateFn         - async (apiKey, charImg, stickers, textStyle, refGrids, spec, opts) => dataUrl
 * @param {string}   opts.activeApiKey
 * @param {string}   opts.characterImage
 * @param {string}   opts.textStyle
 * @param {number}   opts.backgroundThreshold
 * @param {string}   opts.chromaKeyBgColor
 * @param {object}   opts.stickerSpec         - current spec (has generateCell, cell)
 * @param {Array}    opts.descriptions        - sticker descriptions array
 * @param {number}   opts.count               - total desired sticker count
 * @param {boolean}  opts.confirmEachGrid
 * @param {Function} opts.setProgress         - (msg) => void
 * @param {Function} opts.setCurrentStep      - (step) => void
 */
export function useGridEditor({
  generateFn,
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
} = {}) {
  // ---- Core image state ----
  const [gridImages, setGridImages] = useState([])
  const [processedGridImages, setProcessedGridImages] = useState([])
  const [cutImages, setCutImages] = useState([])
  const [rawCutImages, setRawCutImages] = useState([])

  // ---- Per-grid loading indicators ----
  const [regeneratingGrid, setRegeneratingGrid] = useState(null) // gridIndex | null
  const [removingBgGrid, setRemovingBgGrid] = useState(null)     // gridIndex | null
  const [recutGridIndex, setRecutGridIndex] = useState(null)
  const [recutting, setRecutting] = useState(false)

  // ---- Regen panel (UI state) ----
  const [gridRegenPanel, setGridRegenPanel] = useState(null) // { gridIndex, refGridIndexes: [] }

  // ---- Crop adjust ----
  const [cropAdjustTarget, setCropAdjustTarget] = useState(null)
  const [cropAdjustHistory, setCropAdjustHistory] = useState({})
  const [stickerHistory, setStickerHistory] = useState({})
  const [multiCropAdjustTarget, setMultiCropAdjustTarget] = useState(null)
  const [preCutGridCellPreviews, setPreCutGridCellPreviews] = useState({})
  const [preCutPanelOpen, setPreCutPanelOpen] = useState({})
  const [preCutLoadingGridIndex, setPreCutLoadingGridIndex] = useState(null)

  // ---- Per-sticker thresholds ----
  const [stickerThresholds, setStickerThresholds] = useState({})

  // ---- Helpers ----
  const getTotalStickerCount = useCallback(() => {
    return descriptions?.length || count || 0
  }, [descriptions, count])

  const getGridCount = useCallback(() => {
    return Math.ceil(getTotalStickerCount() / 8)
  }, [getTotalStickerCount])

  const getNextGridIndex = useCallback(() => {
    const gridCount = getGridCount()
    for (let i = 0; i < gridCount; i++) {
      if (!gridImages?.[i]) return i
    }
    return gridCount
  }, [getGridCount, gridImages])

  const getStickerThreshold = useCallback((idx) => {
    return stickerThresholds[idx] ?? backgroundThreshold
  }, [stickerThresholds, backgroundThreshold])

  const ensureArraySize = (arr, n) => {
    const u = Array.isArray(arr) ? [...arr] : []
    while (u.length < n) u.push(null)
    return u
  }

  // ---- Crop adjust helpers ----
  const getCropAdjust = useCallback((stickerIndex) => {
    const v = cropAdjustHistory?.[stickerIndex]
    return v ? { x: v.x || 0, y: v.y || 0, zoom: v.zoom || 1 } : { x: 0, y: 0, zoom: 1 }
  }, [cropAdjustHistory])

  const hasAnyCropAdjustInRange = useCallback((startIdx, cellCount) => {
    for (let i = 0; i < cellCount; i++) {
      const v = cropAdjustHistory?.[startIdx + i]
      if (v && ((v.x || 0) !== 0 || (v.y || 0) !== 0 || (v.zoom || 1) !== 1)) return true
    }
    return false
  }, [cropAdjustHistory])

  const cropGridCellsWithAdjust = useCallback(async (gridIndex, { useProcessed = true } = {}) => {
    const src = useProcessed
      ? (processedGridImages[gridIndex] || gridImages[gridIndex])
      : gridImages[gridIndex]
    if (!src) throw new Error('找不到對應的八宮格圖片')
    const { generateCell, cell } = stickerSpec
    const startIdx = gridIndex * 8
    const out = []
    for (let i = 0; i < 8; i++) {
      const cellRow = Math.floor(i / 2)
      const cellCol = i % 2
      const adj = getCropAdjust(startIdx + i)
      out.push(await cropSingleCell(
        src,
        cellRow, cellCol,
        generateCell.w, generateCell.h,
        cell.w, cell.h,
        adj.x, adj.y, adj.zoom
      ))
    }
    return out
  }, [getCropAdjust, gridImages, processedGridImages, stickerSpec])

  // ---- Grid cell preview (pre-cut) ----
  const ensureGridCellsReady = useCallback(async (gridIndex, { alsoCachePreviews = false } = {}) => {
    if (!gridImages[gridIndex]) throw new Error('找不到對應的八宮格圖片')
    const totalNeeded = descriptions?.length || count
    const startIdx = gridIndex * 8
    const endIdx = Math.min(startIdx + 8, totalNeeded)
    const visibleCount = endIdx - startIdx
    const useAdjust = visibleCount > 0 && hasAnyCropAdjustInRange(startIdx, visibleCount)

    let rawCuts = null
    let processedCuts = null
    if (useAdjust) {
      rawCuts = await cropGridCellsWithAdjust(gridIndex, { useProcessed: false })
      if (processedGridImages[gridIndex]) {
        processedCuts = await cropGridCellsWithAdjust(gridIndex, { useProcessed: true })
      } else {
        processedCuts = []
        for (let i = 0; i < 8; i++) {
          if (!rawCuts[i]) { processedCuts[i] = null; continue }
          processedCuts[i] = await removeBackgroundSimple(rawCuts[i], getStickerThreshold(startIdx + i), null, { bgColor: chromaKeyBgColor })
        }
      }
    } else {
      rawCuts = await splitGrid8(
        gridImages[gridIndex],
        stickerSpec.generateCell.w,
        stickerSpec.generateCell.h,
        stickerSpec.cell.w,
        stickerSpec.cell.h
      )
      if (processedGridImages[gridIndex]) {
        processedCuts = await splitGrid8(
          processedGridImages[gridIndex],
          stickerSpec.generateCell.w,
          stickerSpec.generateCell.h,
          stickerSpec.cell.w,
          stickerSpec.cell.h
        )
      } else {
        processedCuts = []
        for (let i = 0; i < 8; i++) {
          if (!rawCuts[i]) { processedCuts[i] = null; continue }
          processedCuts[i] = await removeBackgroundSimple(rawCuts[i], getStickerThreshold(startIdx + i), null, { bgColor: chromaKeyBgColor })
        }
      }
    }

    setRawCutImages(prev => {
      const u = ensureArraySize(prev, totalNeeded)
      for (let i = 0; i < endIdx - startIdx; i++) u[startIdx + i] = rawCuts[i]
      return u
    })
    setCutImages(prev => {
      const u = ensureArraySize(prev, totalNeeded)
      for (let i = 0; i < endIdx - startIdx; i++) u[startIdx + i] = processedCuts[i]
      return u
    })

    if (alsoCachePreviews) {
      setPreCutGridCellPreviews(prev => ({ ...prev, [gridIndex]: processedCuts }))
    }
  }, [gridImages, processedGridImages, descriptions, count, hasAnyCropAdjustInRange, cropGridCellsWithAdjust, getStickerThreshold, stickerSpec, chromaKeyBgColor])

  const ensureStickerReady = useCallback(async (stickerIndex) => {
    const totalNeeded = descriptions?.length || count
    if (stickerIndex < 0 || stickerIndex >= totalNeeded) return
    const hasRaw = !!rawCutImages[stickerIndex]
    const hasCut = !!cutImages[stickerIndex]
    if (hasRaw && hasCut) return
    const gridIndex = Math.floor(stickerIndex / 8)
    await ensureGridCellsReady(gridIndex)
  }, [rawCutImages, cutImages, descriptions, count, ensureGridCellsReady])

  // ---- generateOneGridAt ----
  const generateOneGridAt = useCallback(async (gridIndex, { skipDelay = false } = {}) => {
    const gridCount = getGridCount()
    if (gridIndex < 0 || gridIndex >= gridCount) throw new Error('gridIndex 超出範圍')

    if (!skipDelay && gridIndex > 0) {
      const delay = 3000
      setProgress(`等待 ${delay / 1000} 秒後生成下一張8宮格（避免 API 過載）...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    setProgress(`正在生成第 ${gridIndex + 1}/${gridCount} 張8宮格圖片...`)

    const totalCount = getTotalStickerCount()
    const startIndex = gridIndex * 8
    const endIndex = Math.min(startIndex + 8, totalCount)
    const gridStickers = []
    for (let i = startIndex; i < endIndex; i++) {
      gridStickers.push(descriptions[i])
    }
    while (gridStickers.length < 8) {
      gridStickers.push({ description: '空白貼圖', text: '' })
    }

    let gridImage = null
    let retryCount = 0
    const maxRetries = 5
    while (!gridImage && retryCount < maxRetries) {
      try {
        gridImage = await generateFn(
          activeApiKey,
          characterImage,
          gridStickers,
          textStyle || '',
          gridIndex > 0 ? (gridImages.length > 0 ? gridImages : null) : null,
          stickerSpec,
          { bgColor: chromaKeyBgColor }
        )
      } catch (error) {
        retryCount++
        if (retryCount < maxRetries) {
          const isOverloaded = error.message && (
            error.message.includes('overloaded') ||
            error.message.includes('overload') ||
            error.message.includes('請稍後再試')
          )
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

    if (!gridImage) throw new Error('生成8宮格失敗：未取得圖片')

    setProgress(`正在為第 ${gridIndex + 1}/${gridCount} 張8宮格去背...`)
    const processed = await removeBackgroundSimple(gridImage, backgroundThreshold, null, { bgColor: chromaKeyBgColor })

    setGridImages(prev => {
      const u = [...prev]
      u[gridIndex] = gridImage
      return u
    })
    setProcessedGridImages(prev => {
      const u = [...prev]
      u[gridIndex] = processed
      return u
    })

    setCurrentStep(7)
    if (confirmEachGrid) {
      setProgress(`已生成第 ${gridIndex + 1}/${gridCount} 組八宮格。確認 OK 後可按「生成下一組」。`)
    } else {
      setProgress('去背完成，請調整去背程度後點擊「下一步」進行裁切')
    }
  }, [
    generateFn, activeApiKey, characterImage, textStyle, gridImages,
    backgroundThreshold, chromaKeyBgColor, stickerSpec, descriptions,
    confirmEachGrid, getGridCount, getTotalStickerCount, setProgress, setCurrentStep,
  ])

  // ---- handleRegenerateGrid ----
  const openGridRegenPanel = useCallback((gridIndex) => {
    const candidates = gridImages
      .map((img, i) => ({ img, i }))
      .filter(({ img, i }) => i !== gridIndex && img)
    const maxRef = 10
    let defaultRefs = []
    if (candidates.length <= maxRef) {
      defaultRefs = candidates.map(c => c.i)
    } else {
      const step = Math.max(1, Math.floor(candidates.length / maxRef))
      defaultRefs = candidates.filter((_, i) => i % step === 0).slice(0, maxRef).map(c => c.i)
    }
    setGridRegenPanel({ gridIndex, refGridIndexes: defaultRefs })
  }, [gridImages])

  const toggleGridRegenRef = useCallback((i) => {
    setGridRegenPanel(prev => {
      if (!prev) return prev
      const has = prev.refGridIndexes.includes(i)
      if (has) return { ...prev, refGridIndexes: prev.refGridIndexes.filter(x => x !== i) }
      if (prev.refGridIndexes.length >= 10) return prev
      return { ...prev, refGridIndexes: [...prev.refGridIndexes, i] }
    })
  }, [])

  const handleRegenerateGrid = useCallback(async (gridIndex, opts = {}) => {
    setRegeneratingGrid(gridIndex)
    setProgress(`正在重新生成第 ${gridIndex + 1} 組八宮格...`)
    try {
      const startIdx = gridIndex * 8
      const endIdx = Math.min(startIdx + 8, descriptions?.length || 0)
      let gridStickers = (descriptions || []).slice(startIdx, endIdx)
      while (gridStickers.length < 8) {
        gridStickers.push({ description: '空白', text: '　' })
      }
      const refGridImages = (opts.refGridIndexes && opts.refGridIndexes.length > 0)
        ? opts.refGridIndexes.map(i => gridImages[i]).filter(Boolean)
        : gridImages.filter((_, i) => i !== gridIndex)
      const newGridImage = await generateFn(
        activeApiKey,
        characterImage,
        gridStickers,
        textStyle || '',
        refGridImages,
        stickerSpec,
        { bgColor: chromaKeyBgColor }
      )
      const newGridImages = [...gridImages]
      newGridImages[gridIndex] = newGridImage
      setGridImages(newGridImages)

      const processed = await removeBackgroundSimple(newGridImage, backgroundThreshold, null, { bgColor: chromaKeyBgColor })
      const newProcessed = [...processedGridImages]
      newProcessed[gridIndex] = processed
      setProcessedGridImages(newProcessed)

      const actualCount = endIdx - startIdx
      let newCuts = null
      if (actualCount > 0 && hasAnyCropAdjustInRange(startIdx, actualCount)) {
        const { generateCell, cell } = stickerSpec
        newCuts = []
        for (let i = 0; i < 8; i++) {
          const row = Math.floor(i / 2)
          const col = i % 2
          const adj = getCropAdjust(startIdx + i)
          newCuts.push(await cropSingleCell(processed, row, col, generateCell.w, generateCell.h, cell.w, cell.h, adj.x, adj.y, adj.zoom))
        }
      } else {
        newCuts = await splitGrid8(processed, stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
      }
      const updatedCutImages = [...cutImages]
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
  }, [
    generateFn, activeApiKey, characterImage, textStyle, gridImages, processedGridImages,
    cutImages, descriptions, backgroundThreshold, chromaKeyBgColor, stickerSpec,
    hasAnyCropAdjustInRange, getCropAdjust, setProgress,
  ])

  // ---- handleRemoveBgGrid ----
  const handleRemoveBgGrid = useCallback(async (gridIndex) => {
    setRemovingBgGrid(gridIndex)
    try {
      const processed = await removeBackgroundSimple(gridImages[gridIndex], backgroundThreshold, null, { bgColor: chromaKeyBgColor })
      setProcessedGridImages(prev => {
        const updated = [...prev]
        updated[gridIndex] = processed
        return updated
      })
      const startIdx = gridIndex * 8
      const totalNeeded = descriptions?.length || count
      const actualCount = Math.max(0, Math.min(8, totalNeeded - startIdx))
      let cuts = null
      let rawCuts = null
      if (actualCount > 0 && hasAnyCropAdjustInRange(startIdx, actualCount)) {
        cuts = await cropGridCellsWithAdjust(gridIndex, { useProcessed: true })
        rawCuts = await cropGridCellsWithAdjust(gridIndex, { useProcessed: false })
      } else {
        cuts = await splitGrid8(processed, stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
        rawCuts = await splitGrid8(gridImages[gridIndex], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
      }
      setCutImages(prev => {
        const updated = [...prev]
        cuts.forEach((cut, i) => {
          if (startIdx + i < updated.length) updated[startIdx + i] = cut
        })
        return updated
      })
      setRawCutImages(prev => {
        const updated = [...prev]
        rawCuts.forEach((cut, i) => {
          if (startIdx + i < updated.length) updated[startIdx + i] = cut
        })
        return updated
      })
    } catch (error) {
      alert(`去背失敗: ${error.message}`)
    } finally {
      setRemovingBgGrid(null)
    }
  }, [gridImages, processedGridImages, backgroundThreshold, chromaKeyBgColor, descriptions, count, hasAnyCropAdjustInRange, cropGridCellsWithAdjust, stickerSpec])

  // ---- handleRecutSingle ----
  const handleRecutSingle = useCallback(async (gridIndex) => {
    setRecutGridIndex(gridIndex)
    try {
      const startIdx = gridIndex * 8
      const totalNeeded = descriptions?.length || count
      const actualCount = Math.max(0, Math.min(8, totalNeeded - startIdx))
      let cuts = null
      let rawCuts = null
      if (actualCount > 0 && hasAnyCropAdjustInRange(startIdx, actualCount)) {
        cuts = await cropGridCellsWithAdjust(gridIndex, { useProcessed: true })
        rawCuts = await cropGridCellsWithAdjust(gridIndex, { useProcessed: false })
      } else {
        const src = processedGridImages[gridIndex] || gridImages[gridIndex]
        cuts = await splitGrid8(src, stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
        rawCuts = await splitGrid8(gridImages[gridIndex], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
      }
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
  }, [gridImages, processedGridImages, descriptions, count, hasAnyCropAdjustInRange, cropGridCellsWithAdjust, stickerSpec])

  // ---- handleRecut (全部重新裁切) ----
  const handleRecut = useCallback(async () => {
    setRecutting(true)
    try {
      let allCut = []
      let allRaw = []
      for (let i = 0; i < processedGridImages.length; i++) {
        const startIdx = i * 8
        const totalNeeded = descriptions?.length || count
        const actualCount = Math.max(0, Math.min(8, totalNeeded - startIdx))
        if (actualCount > 0 && hasAnyCropAdjustInRange(startIdx, actualCount)) {
          const cuts = await cropGridCellsWithAdjust(i, { useProcessed: true })
          const rawCuts = await cropGridCellsWithAdjust(i, { useProcessed: false })
          allCut = allCut.concat(cuts)
          allRaw = allRaw.concat(rawCuts)
        } else {
          const src = processedGridImages[i] || gridImages[i]
          const cuts = await splitGrid8(src, stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
          const rawCuts = await splitGrid8(gridImages[i], stickerSpec.generateCell.w, stickerSpec.generateCell.h, stickerSpec.cell.w, stickerSpec.cell.h)
          allCut = allCut.concat(cuts)
          allRaw = allRaw.concat(rawCuts)
        }
      }
      const totalNeeded = descriptions?.length || count
      setCutImages(allCut.slice(0, totalNeeded))
      setRawCutImages(allRaw.slice(0, totalNeeded))
    } catch (err) {
      alert('重新裁切失敗: ' + err.message)
    } finally {
      setRecutting(false)
    }
  }, [processedGridImages, gridImages, descriptions, count, hasAnyCropAdjustInRange, cropGridCellsWithAdjust, stickerSpec])

  // ---- Crop adjust open/confirm ----
  const handleOpenCropAdjust = useCallback((stickerIdx) => {
    const gridIndex = Math.floor(stickerIdx / 8)
    const cellIndex = stickerIdx % 8
    const cellRow = Math.floor(cellIndex / 2)
    const cellCol = cellIndex % 2
    const prev = cropAdjustHistory[stickerIdx] || { x: 0, y: 0, zoom: 1 }
    setCropAdjustTarget({ stickerIndex: stickerIdx, gridIndex, cellRow, cellCol, prevOffset: prev })
  }, [cropAdjustHistory])

  const handleCropAdjustConfirm = useCallback(async (offsetX, offsetY, zoom = 1) => {
    if (!cropAdjustTarget) return
    const { stickerIndex, gridIndex, cellRow, cellCol } = cropAdjustTarget
    const { generateCell, cell } = stickerSpec

    setCropAdjustHistory(prev => ({ ...prev, [stickerIndex]: { x: offsetX, y: offsetY, zoom } }))

    const newCut = await cropSingleCell(
      processedGridImages[gridIndex], cellRow, cellCol,
      generateCell.w, generateCell.h, cell.w, cell.h, offsetX, offsetY, zoom
    )
    const newRaw = await cropSingleCell(
      gridImages[gridIndex], cellRow, cellCol,
      generateCell.w, generateCell.h, cell.w, cell.h, offsetX, offsetY, zoom
    )
    setCutImages(prev => { const u = [...prev]; u[stickerIndex] = newCut; return u })
    setRawCutImages(prev => { const u = [...prev]; u[stickerIndex] = newRaw; return u })
    setCropAdjustTarget(null)
  }, [cropAdjustTarget, processedGridImages, gridImages, stickerSpec])

  // ---- Multi crop adjust ----
  const handleOpenMultiCropAdjust = useCallback(async (gridIdx) => {
    const totalNeeded = descriptions?.length || count
    const startIdx = gridIdx * 8
    const visibleCount = Math.max(0, Math.min(8, totalNeeded - startIdx))
    if (visibleCount === 0) return
    try {
      await ensureGridCellsReady(gridIdx, { alsoCachePreviews: true })
      setMultiCropAdjustTarget({ gridIndex: gridIdx })
    } catch (e) {
      alert('開啟批次微調失敗: ' + e.message)
    }
  }, [descriptions, count, ensureGridCellsReady])

  const handleApplyMultiCropAdjust = useCallback(async (gridIdx, cellsForGrid) => {
    const totalNeeded = descriptions?.length || count
    const startIdx = gridIdx * 8
    const visibleCount = Math.max(0, Math.min(8, totalNeeded - startIdx))
    if (visibleCount === 0) { setMultiCropAdjustTarget(null); return }

    const { generateCell, cell } = stickerSpec
    const processedSrc = processedGridImages[gridIdx] || gridImages[gridIdx]
    const rawSrc = gridImages[gridIdx]

    setCropAdjustHistory(prev => {
      const u = { ...(prev || {}) }
      for (let i = 0; i < visibleCount; i++) {
        const stickerIndex = startIdx + i
        const v = cellsForGrid[i] || { x: 0, y: 0, zoom: 1 }
        u[stickerIndex] = { x: v.x || 0, y: v.y || 0, zoom: v.zoom || 1 }
      }
      return u
    })

    try {
      const newCuts = []
      const newRaws = []
      for (let i = 0; i < visibleCount; i++) {
        const row = Math.floor(i / 2)
        const col = i % 2
        const v = cellsForGrid[i] || { x: 0, y: 0, zoom: 1 }
        newCuts.push(await cropSingleCell(processedSrc, row, col, generateCell.w, generateCell.h, cell.w, cell.h, v.x || 0, v.y || 0, v.zoom || 1))
        newRaws.push(await cropSingleCell(rawSrc, row, col, generateCell.w, generateCell.h, cell.w, cell.h, v.x || 0, v.y || 0, v.zoom || 1))
      }
      setCutImages(prev => {
        const u = ensureArraySize(prev, totalNeeded)
        for (let i = 0; i < visibleCount; i++) u[startIdx + i] = newCuts[i]
        return u
      })
      setRawCutImages(prev => {
        const u = ensureArraySize(prev, totalNeeded)
        for (let i = 0; i < visibleCount; i++) u[startIdx + i] = newRaws[i]
        return u
      })
      setPreCutGridCellPreviews(prev => ({ ...prev, [gridIdx]: newCuts }))
    } catch (e) {
      alert('套用批次微調後裁切失敗: ' + e.message)
    } finally {
      setMultiCropAdjustTarget(null)
    }
  }, [descriptions, count, stickerSpec, processedGridImages, gridImages])

  // ---- reset ----
  const reset = useCallback(() => {
    setGridImages([])
    setProcessedGridImages([])
    setCutImages([])
    setRawCutImages([])
    setCropAdjustHistory({})
    setCropAdjustTarget(null)
    setMultiCropAdjustTarget(null)
    setStickerHistory({})
    setPreCutGridCellPreviews({})
    setPreCutPanelOpen({})
    setStickerThresholds({})
    setGridRegenPanel(null)
    setRegeneratingGrid(null)
    setRemovingBgGrid(null)
    setRecutGridIndex(null)
    setRecutting(false)
    setPreCutLoadingGridIndex(null)
  }, [])

  return {
    // --- state ---
    gridImages,
    setGridImages,
    processedGridImages,
    setProcessedGridImages,
    cutImages,
    setCutImages,
    rawCutImages,
    setRawCutImages,
    stickerHistory,
    setStickerHistory,
    stickerThresholds,
    setStickerThresholds,

    // --- loading indicators ---
    regeneratingGrid,
    removingBgGrid,
    recutGridIndex,
    recutting,

    // --- grid regen panel ---
    gridRegenPanel,
    setGridRegenPanel,
    openGridRegenPanel,
    toggleGridRegenRef,

    // --- crop adjust ---
    cropAdjustTarget,
    setCropAdjustTarget,
    cropAdjustHistory,
    setCropAdjustHistory,
    multiCropAdjustTarget,
    setMultiCropAdjustTarget,

    // --- pre-cut previews ---
    preCutGridCellPreviews,
    setPreCutGridCellPreviews,
    preCutPanelOpen,
    setPreCutPanelOpen,
    preCutLoadingGridIndex,
    setPreCutLoadingGridIndex,

    // --- helpers ---
    getTotalStickerCount,
    getGridCount,
    getNextGridIndex,
    getStickerThreshold,
    getCropAdjust,
    hasAnyCropAdjustInRange,
    cropGridCellsWithAdjust,
    ensureGridCellsReady,
    ensureStickerReady,
    ensureArraySize,
    reset,

    // --- handlers ---
    generateOneGridAt,
    handleRegenerateGrid,
    handleRemoveBgGrid,
    handleRecutSingle,
    handleRecut,
    handleOpenCropAdjust,
    handleCropAdjustConfirm,
    handleOpenMultiCropAdjust,
    handleApplyMultiCropAdjust,
  }
}
