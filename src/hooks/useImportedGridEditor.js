import { useState, useCallback } from 'react'
import { removeBackgroundSimple, removeBackgroundByColor } from '../utils/imageUtils'
import { splitGridNxM, cropSingleCell } from '../utils/imageUtils'

/**
 * useImportedGridEditor
 *
 * Manages state for the Import Pipeline: user uploads a NxM grid image,
 * we split it, optionally remove background, allow per-cell adjustments.
 *
 * No AI generation — cells come from the uploaded grid.
 *
 * @param {object} opts
 * @param {number}   [opts.defaultCols=4]
 * @param {number}   [opts.defaultRows=4]
 * @param {number}   [opts.defaultCellW=370]  - expected cell width in the source grid
 * @param {number}   [opts.defaultCellH=320]  - expected cell height in the source grid
 * @param {number}   [opts.backgroundThreshold=240]
 * @param {string}   [opts.chromaKeyBgColor='#ffffff']
 */
export function useImportedGridEditor({
  defaultCols = 4,
  defaultRows = 4,
  defaultCellW = 370,
  defaultCellH = 320,
  backgroundThreshold: initBgThreshold = 240,
  chromaKeyBgColor: initChromaColor = '#ffffff',
} = {}) {
  // ---- Grid settings ----
  const [gridCols, setGridCols] = useState(defaultCols)
  const [gridRows, setGridRows] = useState(defaultRows)
  const [cellW, setCellW] = useState(defaultCellW)
  const [cellH, setCellH] = useState(defaultCellH)

  // ---- Source image ----
  const [uploadedGridImage, setUploadedGridImage] = useState(null) // raw data URL
  const [processedGridImage, setProcessedGridImage] = useState(null) // bg-removed grid

  // ---- Split results ----
  const [rawCells, setRawCells] = useState([])        // raw cut (no bg removal)
  const [processedCells, setProcessedCells] = useState([]) // bg-removed cells
  const [excludedCells, setExcludedCells] = useState(new Set()) // excluded cell indices

  // ---- Per-cell crop adjustments ----
  const [cropAdjustHistory, setCropAdjustHistory] = useState({}) // { [cellIdx]: {x, y, zoom} }
  const [cropAdjustTarget, setCropAdjustTarget] = useState(null)  // { cellIndex, cellRow, cellCol }

  // ---- Background removal settings ----
  const [backgroundThreshold, setBackgroundThreshold] = useState(initBgThreshold)
  const [chromaKeyBgColor, setChromaKeyBgColor] = useState(initChromaColor)
  const [bgStrategy, setBgStrategy] = useState('auto') // 'auto' | 'color' | 'none'
  const [manualBgColor, setManualBgColor] = useState('#ffffff')

  // ---- Loading state ----
  const [splitting, setSplitting] = useState(false)
  const [removingBgAll, setRemovingBgAll] = useState(false)
  const [removingBgCell, setRemovingBgCell] = useState(null) // cellIndex | null
  const [progress, setProgress] = useState('')

  // ---- Main / Tab image (optional, for zip) ----
  const [mainImage, setMainImage] = useState(null)
  const [tabImage, setTabImage] = useState(null)

  // ---- Helpers ----
  const getCropAdjust = useCallback((idx) => {
    const v = cropAdjustHistory[idx]
    return v ? { x: v.x || 0, y: v.y || 0, zoom: v.zoom || 1 } : { x: 0, y: 0, zoom: 1 }
  }, [cropAdjustHistory])

  const totalCells = gridCols * gridRows

  // ---- Split ----
  const handleSplit = useCallback(async ({ bgStrategyOverride } = {}) => {
    if (!uploadedGridImage) return
    setSplitting(true)
    setProgress('切割中...')
    try {
      const cells = await splitGridNxM(uploadedGridImage, gridCols, gridRows, cellW, cellH)
      setRawCells(cells)
      setExcludedCells(new Set())
      setCropAdjustHistory({})

      const effectiveBgStrategy = bgStrategyOverride ?? bgStrategy
      if (effectiveBgStrategy === 'none') {
        setProcessedCells(cells)
      } else {
        setProgress('去背中...')
        const bgColor = effectiveBgStrategy === 'color' ? manualBgColor : chromaKeyBgColor
        const processed = []
        for (let i = 0; i < cells.length; i++) {
          processed.push(
            await removeBackgroundSimple(cells[i], backgroundThreshold, null, { bgColor })
          )
        }
        setProcessedCells(processed)
      }
      setProgress('')
    } catch (err) {
      console.error('切割失敗:', err)
      setProgress('切割失敗: ' + err.message)
    } finally {
      setSplitting(false)
    }
  }, [uploadedGridImage, gridCols, gridRows, cellW, cellH, bgStrategy, manualBgColor, chromaKeyBgColor, backgroundThreshold])

  // ---- Remove BG for all processed cells (re-apply) ----
  const handleRemoveBgAll = useCallback(async () => {
    if (rawCells.length === 0) return
    setRemovingBgAll(true)
    setProgress('去背中...')
    try {
      const bgColor = bgStrategy === 'color' ? manualBgColor : chromaKeyBgColor
      const processed = []
      for (let i = 0; i < rawCells.length; i++) {
        const adj = getCropAdjust(i)
        // If there's a crop adjustment, apply it first then remove bg
        if (adj.x !== 0 || adj.y !== 0 || adj.zoom !== 1) {
          const cellRow = Math.floor(i / gridCols)
          const cellCol = i % gridCols
          const cropped = await cropSingleCell(
            uploadedGridImage, cellRow, cellCol,
            cellW, cellH, cellW, cellH,
            adj.x, adj.y, adj.zoom, gridCols, gridRows
          )
          processed.push(
            bgStrategy === 'none'
              ? cropped
              : await removeBackgroundSimple(cropped, backgroundThreshold, null, { bgColor })
          )
        } else {
          processed.push(
            bgStrategy === 'none'
              ? rawCells[i]
              : await removeBackgroundSimple(rawCells[i], backgroundThreshold, null, { bgColor })
          )
        }
      }
      setProcessedCells(processed)
      setProgress('')
    } catch (err) {
      console.error('去背失敗:', err)
      setProgress('去背失敗: ' + err.message)
    } finally {
      setRemovingBgAll(false)
    }
  }, [rawCells, uploadedGridImage, gridCols, cellW, cellH, bgStrategy, manualBgColor, chromaKeyBgColor, backgroundThreshold, getCropAdjust])

  // ---- Remove BG for single cell ----
  const handleRemoveBgSingleCell = useCallback(async (cellIndex) => {
    if (!rawCells[cellIndex]) return
    setRemovingBgCell(cellIndex)
    try {
      const bgColor = bgStrategy === 'color' ? manualBgColor : chromaKeyBgColor
      const source = rawCells[cellIndex]
      const result = bgStrategy === 'none'
        ? source
        : await removeBackgroundSimple(source, backgroundThreshold, null, { bgColor })
      setProcessedCells(prev => {
        const u = [...prev]
        u[cellIndex] = result
        return u
      })
    } catch (err) {
      alert('去背失敗: ' + err.message)
    } finally {
      setRemovingBgCell(null)
    }
  }, [rawCells, bgStrategy, manualBgColor, chromaKeyBgColor, backgroundThreshold])

  // ---- Crop adjust ----
  const handleOpenCropAdjust = useCallback((cellIndex) => {
    const cellRow = Math.floor(cellIndex / gridCols)
    const cellCol = cellIndex % gridCols
    const prev = cropAdjustHistory[cellIndex] || { x: 0, y: 0, zoom: 1 }
    setCropAdjustTarget({ cellIndex, cellRow, cellCol, prevOffset: prev })
  }, [cropAdjustHistory, gridCols])

  const handleCropAdjustConfirm = useCallback(async (offsetX, offsetY, zoom = 1) => {
    if (!cropAdjustTarget) return
    const { cellIndex, cellRow, cellCol } = cropAdjustTarget
    setCropAdjustHistory(prev => ({ ...prev, [cellIndex]: { x: offsetX, y: offsetY, zoom } }))

    try {
      const newRaw = await cropSingleCell(
        uploadedGridImage, cellRow, cellCol,
        cellW, cellH, cellW, cellH,
        offsetX, offsetY, zoom, gridCols, gridRows
      )
      setRawCells(prev => {
        const u = [...prev]
        u[cellIndex] = newRaw
        return u
      })

      const bgColor = bgStrategy === 'color' ? manualBgColor : chromaKeyBgColor
      const newProcessed = bgStrategy === 'none'
        ? newRaw
        : await removeBackgroundSimple(newRaw, backgroundThreshold, null, { bgColor })
      setProcessedCells(prev => {
        const u = [...prev]
        u[cellIndex] = newProcessed
        return u
      })
    } catch (err) {
      alert('裁切調整失敗: ' + err.message)
    }

    setCropAdjustTarget(null)
  }, [cropAdjustTarget, uploadedGridImage, cellW, cellH, bgStrategy, manualBgColor, chromaKeyBgColor, backgroundThreshold])

  // ---- Multi-cell crop adjust (GridMultiCropAdjustPanel) ----
  // cells: array of {x, y, zoom} indexed by cell position in the visible count
  // startIndex: first cell index (for ImportPipeline always 0 since all cells shown at once)
  const handleMultiCropAdjustConfirm = useCallback(async (cells, { startIndex = 0 } = {}) => {
    try {
      const bgColor = bgStrategy === 'color' ? manualBgColor : chromaKeyBgColor
      const newRaws = [...rawCells]
      const newProcessed = [...processedCells]
      const newHistory = { ...cropAdjustHistory }

      for (let i = 0; i < cells.length; i++) {
        const cellIndex = startIndex + i
        const { x, y, zoom } = cells[i]
        newHistory[cellIndex] = { x, y, zoom }
        const cellRow = Math.floor(cellIndex / gridCols)
        const cellCol = cellIndex % gridCols
        const newRaw = await cropSingleCell(
          uploadedGridImage, cellRow, cellCol,
          cellW, cellH, cellW, cellH,
          x, y, zoom, gridCols, gridRows
        )
        newRaws[cellIndex] = newRaw
        newProcessed[cellIndex] = bgStrategy === 'none'
          ? newRaw
          : await removeBackgroundSimple(newRaw, backgroundThreshold, null, { bgColor })
      }

      setCropAdjustHistory(newHistory)
      setRawCells(newRaws)
      setProcessedCells(newProcessed)
    } catch (err) {
      alert('批次裁切調整失敗: ' + err.message)
    }
  }, [rawCells, processedCells, cropAdjustHistory, uploadedGridImage, gridCols, gridRows, cellW, cellH, bgStrategy, manualBgColor, chromaKeyBgColor, backgroundThreshold])

  // ---- Excluded cells ----
  const toggleExcluded = useCallback((cellIndex) => {
    setExcludedCells(prev => {
      const s = new Set(prev)
      if (s.has(cellIndex)) s.delete(cellIndex)
      else s.add(cellIndex)
      return s
    })
  }, [])

  // ---- Computed: active (non-excluded) processed cells for zip ----
  const activeCells = processedCells.filter((_, i) => !excludedCells.has(i))

  // ---- Reset ----
  const reset = useCallback(() => {
    setUploadedGridImage(null)
    setProcessedGridImage(null)
    setRawCells([])
    setProcessedCells([])
    setExcludedCells(new Set())
    setCropAdjustHistory({})
    setCropAdjustTarget(null)
    setMainImage(null)
    setTabImage(null)
    setProgress('')
  }, [])

  return {
    // settings
    gridCols, setGridCols,
    gridRows, setGridRows,
    cellW, setCellW,
    cellH, setCellH,
    backgroundThreshold, setBackgroundThreshold,
    chromaKeyBgColor, setChromaKeyBgColor,
    bgStrategy, setBgStrategy,
    manualBgColor, setManualBgColor,

    // images
    uploadedGridImage, setUploadedGridImage,
    processedGridImage, setProcessedGridImage,
    rawCells, setRawCells,
    processedCells, setProcessedCells,
    excludedCells,
    activeCells,
    totalCells,

    // crop adjust
    cropAdjustTarget, setCropAdjustTarget,
    cropAdjustHistory, setCropAdjustHistory,
    getCropAdjust,

    // main/tab
    mainImage, setMainImage,
    tabImage, setTabImage,

    // loading
    splitting, removingBgAll, removingBgCell,
    progress,

    // handlers
    handleSplit,
    handleRemoveBgAll,
    handleRemoveBgSingleCell,
    handleOpenCropAdjust,
    handleCropAdjustConfirm,
    handleMultiCropAdjustConfirm,
    toggleExcluded,
    reset,
  }
}
