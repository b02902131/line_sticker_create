import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useImportedGridEditor } from '../hooks/useImportedGridEditor'
import { useClickRemoveEditor } from '../hooks/useClickRemoveEditor'
import { useImportPipelineStorage } from '../hooks/useImportPipelineStorage'
import CropAdjustPanel from '../components/CropAdjustPanel'
import GridMultiCropAdjustPanel from '../components/GridMultiCropAdjustPanel'
import { downloadAsZip, fitToSize } from '../utils/zipDownloader'
import { fileToDataURL, removeBackgroundSimple } from '../utils/imageUtils'
import { STICKER_SPECS, getSpec, DEFAULT_SPEC_KEY } from '../utils/stickerSpecs'

const PREVIEW_BG_COLORS = ['#ffffff', '#f0f0f0', '#333333', '#000000', '#ffccdd', '#cce5ff']

// Local canvas component for click-remove UI (mirrors the one in StickerProducePage)
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

function ClickRemoveModal({
  title, target, onClose,
  mode, setMode,
  threshold, setThreshold,
  undoStack, onUndo,
  pickedColor, setPickedColor, colorRectStart, colorRectEnd, isDraggingRect,
  canvasRef, lensRef,
  getSource, onFloodClick, onColorPick,
  onColorRectMouseDown, onColorRectMouseMove, onColorRectMouseUp,
  previewBgColor, setPreviewBgColor,
  extraControls,
}) {
  if (!target) return null
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="click-remove-modal-inner" style={{
        background: '#fff', borderRadius: '12px', padding: '20px',
        maxWidth: '95vw', maxHeight: '90vh', width: '95vw',
        display: 'flex', gap: '16px', overflow: 'hidden',
      }}>
        {/* Left control panel */}
        <div className="click-remove-modal-controls" style={{ width: '280px', minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>{title}</h3>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 8px' }}
                disabled={undoStack.length === 0} onClick={onUndo}>復原</button>
              <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '4px 8px' }}
                onClick={onClose}>關閉</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button className={`btn ${mode === 'flood' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px', padding: '4px 10px', flex: 1 }}
              onClick={() => { setMode('flood'); setPickedColor(null) }}>區域擴散</button>
            <button className={`btn ${mode === 'color' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '12px', padding: '4px 10px', flex: 1 }}
              onClick={() => { setMode('color'); setPickedColor(null) }}>吸色去除</button>
          </div>
          <div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>容差：{threshold}</div>
            <input type="range" min="1" max="120" value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: '100%' }} />
          </div>
          {extraControls}
          <div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>背景：</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {PREVIEW_BG_COLORS.map(c => (
                <div key={c} onClick={() => setPreviewBgColor(c)} style={{
                  width: '28px', height: '28px', backgroundColor: c, cursor: 'pointer',
                  border: previewBgColor === c ? '3px solid #4CAF50' : '2px solid #ccc',
                  borderRadius: '4px', boxSizing: 'border-box',
                }} />
              ))}
            </div>
          </div>
          <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
            {mode === 'flood' ? '點擊圖片，從該處往外擴散移除相近色。'
              : !pickedColor ? '步驟 1：點擊圖片吸取顏色。'
              : '步驟 2：拖曳框選去除範圍。'}
          </p>
          {mode === 'color' && pickedColor && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '4px',
                backgroundColor: `rgb(${pickedColor.r},${pickedColor.g},${pickedColor.b})`,
                border: '2px solid #333',
              }} />
              <span style={{ fontSize: '12px', color: '#999' }}>
                rgb({pickedColor.r}, {pickedColor.g}, {pickedColor.b})
              </span>
              <button className="btn btn-secondary" style={{ fontSize: '12px', padding: '3px 8px' }}
                onClick={() => setPickedColor(null)}>重新吸色</button>
            </div>
          )}
        </div>
        {/* Right image area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: 'crosshair', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseMove={(e) => {
            if (mode === 'flood' || (mode === 'color' && !pickedColor)) {
              const lens = lensRef.current; const canvas = canvasRef.current
              if (!lens || !canvas) return
              const canvasRect = canvas.getBoundingClientRect()
              const containerRect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - canvasRect.left; const y = e.clientY - canvasRect.top
              if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) { lens.style.display = 'none'; return }
              const lensSize = 120; const zoom = 4
              lens.style.display = 'block'
              lens.style.left = `${x + (canvasRect.left - containerRect.left) - lensSize / 2}px`
              lens.style.top = `${y + (canvasRect.top - containerRect.top) - lensSize / 2}px`
              lens.style.width = `${lensSize}px`; lens.style.height = `${lensSize}px`
              lens.style.backgroundSize = `${canvasRect.width * zoom}px ${canvasRect.height * zoom}px`
              lens.style.backgroundPosition = `-${x * zoom - lensSize / 2}px -${y * zoom - lensSize / 2}px`
            } else { if (lensRef.current) lensRef.current.style.display = 'none' }
            if (mode === 'color' && pickedColor) onColorRectMouseMove(e)
          }}
          onMouseLeave={() => { if (lensRef.current) lensRef.current.style.display = 'none' }}
          onMouseDown={(e) => { if (mode === 'color' && pickedColor) onColorRectMouseDown(e) }}
          onMouseUp={() => { if (mode === 'color' && pickedColor) onColorRectMouseUp() }}
        >
          <ClickRemoveCanvas canvasRef={canvasRef} src={getSource()} bgColor={previewBgColor}
            onClick={mode === 'flood' ? onFloodClick : (!pickedColor ? onColorPick : undefined)} />
          <div ref={lensRef} style={{
            display: 'none', position: 'absolute', pointerEvents: 'none',
            border: '2px solid #4CAF50', borderRadius: '50%',
            backgroundImage: `url(${getSource()})`, backgroundRepeat: 'no-repeat',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }} />
          {colorRectStart && colorRectEnd && isDraggingRect && (() => {
            const canvas = canvasRef.current; const container = canvas?.parentElement
            if (!canvas || !container) return null
            const cr = canvas.getBoundingClientRect(); const co = container.getBoundingClientRect()
            const sx = canvas.width / cr.width; const sy = canvas.height / cr.height
            return (
              <div style={{
                position: 'absolute', pointerEvents: 'none',
                left: Math.min(colorRectStart.x, colorRectEnd.x) / sx + (cr.left - co.left),
                top: Math.min(colorRectStart.y, colorRectEnd.y) / sy + (cr.top - co.top),
                width: Math.abs(colorRectEnd.x - colorRectStart.x) / sx,
                height: Math.abs(colorRectEnd.y - colorRectStart.y) / sy,
                border: '2px dashed #4CAF50', backgroundColor: 'rgba(76,175,80,0.15)',
              }} />
            )
          })()}
        </div>
      </div>
    </div>
  )
}

export default function ImportPipelinePage({ setPage }) {
  // ---- Sticker spec ----
  const [stickerTypeKey, setStickerTypeKey] = useState(DEFAULT_SPEC_KEY)
  const stickerSpec = getSpec(stickerTypeKey)

  // ---- Import pipeline hook ----
  const {
    gridCols, setGridCols,
    gridRows, setGridRows,
    cellW, setCellW,
    cellH, setCellH,
    backgroundThreshold, setBackgroundThreshold,
    chromaKeyBgColor, setChromaKeyBgColor,
    bgStrategy, setBgStrategy,
    manualBgColor, setManualBgColor,
    uploadedGridImage, setUploadedGridImage,
    rawCells, processedCells, setProcessedCells,
    excludedCells, activeCells,
    cropAdjustTarget, setCropAdjustTarget,
    cropAdjustHistory,
    mainImage, setMainImage,
    tabImage, setTabImage,
    splitting, removingBgAll, removingBgCell,
    progress,
    handleSplit,
    handleRemoveBgAll,
    handleRemoveBgSingleCell,
    handleOpenCropAdjust,
    handleCropAdjustConfirm,
    handleMultiCropAdjustConfirm,
    toggleExcluded,
    reset,
  } = useImportedGridEditor({
    defaultCols: 4,
    defaultRows: 4,
    defaultCellW: stickerSpec.cell.w,
    defaultCellH: stickerSpec.cell.h,
    backgroundThreshold: 240,
    chromaKeyBgColor: '#ffffff',
  })

  // ---- Click-remove editor hook (for individual cells) ----
  // Maps processedCells as cutImages so type:'sticker' targets processedCells[index]
  const {
    clickRemoveTarget, setClickRemoveTarget,
    clickRemoveThreshold, setClickRemoveThreshold,
    clickRemoveMode, setClickRemoveMode,
    clickRemoveUndoStack, setClickRemoveUndoStack,
    pickedColor, setPickedColor,
    colorRectStart, setColorRectStart,
    colorRectEnd, setColorRectEnd,
    isDraggingRect,
    clickRemoveCanvasRef, clickRemoveLensRef,
    getClickRemoveSource, applyResult,
    handleClickRemoveUndo, handleClickRemoveFlood,
    handleColorPick,
    handleColorRectMouseDown, handleColorRectMouseMove, handleColorRectMouseUp,
  } = useClickRemoveEditor({
    cutImages: processedCells,
    setCutImages: setProcessedCells,
    processedGridImages: [],
    setProcessedGridImages: () => {},
    mainImage,
    setMainImage,
    tabImage,
    setTabImage,
    gridImages: [],
  })

  // ---- Click-remove editor hook (for whole grid image pre-split) ----
  const {
    clickRemoveTarget: gridClickRemoveTarget, setClickRemoveTarget: setGridClickRemoveTarget,
    clickRemoveThreshold: gridClickRemoveThreshold, setClickRemoveThreshold: setGridClickRemoveThreshold,
    clickRemoveMode: gridClickRemoveMode, setClickRemoveMode: setGridClickRemoveMode,
    clickRemoveUndoStack: gridClickRemoveUndoStack, setClickRemoveUndoStack: setGridClickRemoveUndoStack,
    pickedColor: gridPickedColor, setPickedColor: setGridPickedColor,
    colorRectStart: gridColorRectStart, setColorRectStart: setGridColorRectStart,
    colorRectEnd: gridColorRectEnd, setColorRectEnd: setGridColorRectEnd,
    isDraggingRect: gridIsDraggingRect,
    clickRemoveCanvasRef: gridClickRemoveCanvasRef, clickRemoveLensRef: gridClickRemoveLensRef,
    getClickRemoveSource: getGridClickRemoveSource, applyResult: applyGridResult,
    handleClickRemoveUndo: handleGridClickRemoveUndo, handleClickRemoveFlood: handleGridClickRemoveFlood,
    handleColorPick: handleGridColorPick,
    handleColorRectMouseDown: handleGridColorRectMouseDown,
    handleColorRectMouseMove: handleGridColorRectMouseMove,
    handleColorRectMouseUp: handleGridColorRectMouseUp,
  } = useClickRemoveEditor({
    cutImages: [],
    setCutImages: () => {},
    processedGridImages: [],
    setProcessedGridImages: () => {},
    mainImage: uploadedGridImage,
    setMainImage: setUploadedGridImage,
    tabImage: null,
    setTabImage: () => {},
    gridImages: [],
  })

  // ---- localStorage persistence ----
  const { save, load, clear } = useImportPipelineStorage()
  const [restoring, setRestoring] = useState(false)

  // Save to localStorage whenever relevant state changes
  useEffect(() => {
    save({
      uploadedGridImage,
      gridCols,
      gridRows,
      cellW,
      cellH,
      stickerTypeKey,
      bgStrategy,
      chromaKeyBgColor,
      manualBgColor,
      backgroundThreshold,
      excludedCells: [...excludedCells],
      mainImage,
      tabImage,
    })
  }, [
    uploadedGridImage, gridCols, gridRows, cellW, cellH, stickerTypeKey,
    bgStrategy, chromaKeyBgColor, manualBgColor, backgroundThreshold,
    excludedCells, mainImage, tabImage, save,
  ])

  // Restore from localStorage on first mount
  useEffect(() => {
    const saved = load()
    if (!saved || !saved.uploadedGridImage) return

    setRestoring(true)

    // Restore all settings first
    if (saved.stickerTypeKey) setStickerTypeKey(saved.stickerTypeKey)
    if (saved.gridCols) setGridCols(saved.gridCols)
    if (saved.gridRows) setGridRows(saved.gridRows)
    if (saved.cellW) setCellW(saved.cellW)
    if (saved.cellH) setCellH(saved.cellH)
    if (saved.bgStrategy) setBgStrategy(saved.bgStrategy)
    if (saved.chromaKeyBgColor) setChromaKeyBgColor(saved.chromaKeyBgColor)
    if (saved.manualBgColor) setManualBgColor(saved.manualBgColor)
    if (saved.backgroundThreshold != null) setBackgroundThreshold(saved.backgroundThreshold)
    if (saved.mainImage) setMainImage(saved.mainImage)
    if (saved.tabImage) setTabImage(saved.tabImage)

    // Restore grid image — handleSplit will be triggered via the ref below
    setUploadedGridImage(saved.uploadedGridImage)

    // Store excluded cells for after split completes
    pendingRestoreRef.current = {
      excludedCells: saved.excludedCells || [],
      cols: saved.gridCols,
      rows: saved.gridRows,
      cellW: saved.cellW,
      cellH: saved.cellH,
      bgStrategy: saved.bgStrategy,
      chromaKeyBgColor: saved.chromaKeyBgColor,
      manualBgColor: saved.manualBgColor,
      backgroundThreshold: saved.backgroundThreshold,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount only

  const pendingRestoreRef = useRef(null)
  const hasRestoredSplitRef = useRef(false)

  // Once uploadedGridImage is populated from restore, trigger split
  useEffect(() => {
    if (!pendingRestoreRef.current || !uploadedGridImage || hasRestoredSplitRef.current) return
    hasRestoredSplitRef.current = true
    const pending = pendingRestoreRef.current
    pendingRestoreRef.current = null

    // Run split with restored settings (they are already set in state above)
    handleSplit().then(() => {
      // After split, restore excludedCells
      if (pending.excludedCells && pending.excludedCells.length > 0) {
        // toggleExcluded is per-cell; restore by setting directly via setExcludedCells if exposed
        // We use the toggleExcluded approach since setExcludedCells is not exposed
        pending.excludedCells.forEach(i => toggleExcluded(i))
      }
      setRestoring(false)
    }).catch(() => setRestoring(false))
  }, [uploadedGridImage, handleSplit, toggleExcluded])

  const handleClearStorage = useCallback(() => {
    clear()
    setUploadedGridImage(null)
    reset()
    hasRestoredSplitRef.current = false
    pendingRestoreRef.current = null
  }, [clear, setUploadedGridImage, reset])

  // ---- Drag-drop state ----
  const [dragging, setDragging] = useState(false)

  // ---- Preview background ----
  const [previewBgColor, setPreviewBgColor] = useState('#ffffff')

  // ---- Download state ----
  const [downloading, setDownloading] = useState(false)

  // ---- Multi-crop panel ----
  const [showMultiCrop, setShowMultiCrop] = useState(false)

  // ---- Main / Tab upload refs ----
  const mainUploadRef = useRef(null)
  const tabUploadRef = useRef(null)
  const gridUploadRef = useRef(null)

  // ---- Drag/drop handlers ----
  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragging(false)
  }, [])

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) return
    const dataUrl = await fileToDataURL(file)
    setUploadedGridImage(dataUrl)
  }, [setUploadedGridImage])

  const handleGridFileChange = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await fileToDataURL(file)
    setUploadedGridImage(dataUrl)
    e.target.value = ''
  }, [setUploadedGridImage])

  // ---- Main / Tab upload handlers ----
  const handleMainUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await fileToDataURL(file)
    setMainImage(dataUrl)
    e.target.value = ''
  }, [setMainImage])

  const handleTabUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await fileToDataURL(file)
    setTabImage(dataUrl)
    e.target.value = ''
  }, [setTabImage])

  // ---- Select a cell as main image ----
  const handleSelectCellAsMain = useCallback((cellIndex) => {
    if (processedCells[cellIndex]) setMainImage(processedCells[cellIndex])
  }, [processedCells, setMainImage])

  // ---- Select a cell as tab image ----
  const handleSelectCellAsTab = useCallback((cellIndex) => {
    if (processedCells[cellIndex]) setTabImage(processedCells[cellIndex])
  }, [processedCells, setTabImage])

  // ---- Download ZIP ----
  const handleDownload = useCallback(async () => {
    if (activeCells.length === 0) {
      alert('沒有可下載的貼圖格子')
      return
    }
    setDownloading(true)
    try {
      // Build images array in format expected by downloadAsZip
      const images = activeCells.map((dataUrl, i) => ({
        index: i + 1,
        description: '',
        dataUrl,
      }))
      await downloadAsZip(images, mainImage, tabImage, 'import', null, stickerSpec)
    } catch (err) {
      alert('下載失敗: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }, [activeCells, mainImage, tabImage, stickerSpec])

  const cellCount = gridCols * gridRows
  const hasCells = processedCells.length > 0

  return (
    <div className="step-section" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <button
          className="btn btn-secondary btn-inline"
          onClick={() => setPage('home')}
        >
          ← 返回首頁
        </button>
        <h2 style={{ margin: 0 }}>宮格圖匯入</h2>
        <span style={{ color: '#888', fontSize: '0.85em' }}>
          上傳外部製作的宮格圖 → 去背分割 → 微調 → zip 下載
        </span>
        <button
          className="btn btn-secondary btn-inline"
          style={{ marginLeft: 'auto', fontSize: '0.8em', color: '#e74c3c' }}
          onClick={handleClearStorage}
          title="清除 localStorage 儲存的進度，重新開始"
        >
          清除記錄
        </button>
      </div>

      {/* Restoring banner */}
      {restoring && (
        <div style={{
          background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px',
          padding: '10px 14px', marginBottom: '12px',
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9em',
        }}>
          <span style={{ fontSize: '1.2em' }}>⏳</span>
          <span>找到上次進度，自動還原中... 正在重新分割去背，請稍候</span>
        </div>
      )}

      {/* Section 1: Upload grid + settings */}
      <div className="step-section" style={{ background: '#fafafa', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <h3 style={{ marginTop: 0 }}>1. 上傳宮格圖</h3>

        {/* Sticker type selector */}
        <div className="form-group" style={{ marginBottom: '12px' }}>
          <label>貼圖類型</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            {Object.values(STICKER_SPECS).map(spec => (
              <button
                key={spec.key}
                className={`btn ${stickerTypeKey === spec.key ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 14px', fontSize: '0.9em' }}
                onClick={() => setStickerTypeKey(spec.key)}
              >
                {spec.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid dimensions */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.9em' }}>列數 (cols)</label>
            <input
              type="number"
              min={1} max={10}
              value={gridCols}
              onChange={e => setGridCols(Math.max(1, parseInt(e.target.value) || 1))}
              className="form-input"
              style={{ width: '70px' }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.9em' }}>行數 (rows)</label>
            <input
              type="number"
              min={1} max={10}
              value={gridRows}
              onChange={e => setGridRows(Math.max(1, parseInt(e.target.value) || 1))}
              className="form-input"
              style={{ width: '70px' }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.9em' }}>格子寬 (px)</label>
            <input
              type="number"
              min={50} max={1000}
              value={cellW}
              onChange={e => setCellW(Math.max(50, parseInt(e.target.value) || stickerSpec.cell.w))}
              className="form-input"
              style={{ width: '80px' }}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.9em' }}>格子高 (px)</label>
            <input
              type="number"
              min={50} max={1000}
              value={cellH}
              onChange={e => setCellH(Math.max(50, parseInt(e.target.value) || stickerSpec.cell.h))}
              className="form-input"
              style={{ width: '80px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <span style={{ color: '#888', fontSize: '0.85em', paddingBottom: '4px' }}>
              預期圖片尺寸：{cellW * gridCols} × {cellH * gridRows} px ({cellCount} 格)
            </span>
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={`drop-zone${dragging ? ' drop-zone--active' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{ minHeight: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          {uploadedGridImage ? (
            <div style={{ textAlign: 'center' }}>
              <img
                src={uploadedGridImage}
                alt="已上傳宮格圖"
                style={{ maxWidth: '100%', maxHeight: 'min(300px, 40vw)', objectFit: 'contain', borderRadius: '4px' }}
              />
              <div style={{ marginTop: '8px', color: '#555' }}>
                已上傳宮格圖 — 可重新拖曳/選檔覆蓋
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '2em', color: '#ccc' }}>+</div>
              <div style={{ color: '#888' }}>拖曳宮格圖到此，或點選下方按鈕選檔</div>
            </>
          )}
        </div>

        <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label className="btn btn-secondary btn-inline" style={{ cursor: 'pointer' }}>
            選擇宮格圖
            <input
              ref={gridUploadRef}
              type="file"
              accept="image/*"
              onChange={handleGridFileChange}
              style={{ display: 'none' }}
            />
          </label>
          {uploadedGridImage && (
            <>
              <button
                className="btn btn-secondary btn-inline"
                style={{ color: '#e74c3c' }}
                onClick={() => {
                  setUploadedGridImage(null)
                  reset()
                }}
              >
                清除
              </button>
              <span style={{ color: '#888', fontSize: '0.82em' }}>↓ 往下設定去背策略</span>
            </>
          )}
        </div>
      </div>

      {/* Section 2: Background removal strategy */}
      <div className="step-section" style={{ background: '#fafafa', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
        <h3 style={{ marginTop: 0 }}>2. 去背策略</h3>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {[
            { key: 'auto', label: '自動偵測背景色' },
            { key: 'color', label: '手動指定背景色' },
            { key: 'none', label: '不去背（已透明）' },
          ].map(opt => (
            <button
              key={opt.key}
              className={`btn ${bgStrategy === opt.key ? 'btn-primary' : 'btn-secondary'}`}
              style={{ fontSize: '0.9em' }}
              onClick={() => setBgStrategy(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {bgStrategy === 'auto' && (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.9em' }}>chroma-key 背景色</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                <input
                  type="color"
                  value={chromaKeyBgColor}
                  onChange={e => setChromaKeyBgColor(e.target.value)}
                  style={{ width: '40px', height: '32px', padding: '2px', cursor: 'pointer' }}
                />
                <span style={{ color: '#666', fontSize: '0.9em' }}>{chromaKeyBgColor}</span>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.9em' }}>容差 (0–255)</label>
              <input
                type="number"
                min={0} max={255}
                value={backgroundThreshold}
                onChange={e => setBackgroundThreshold(Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
                className="form-input"
                style={{ width: '70px' }}
              />
            </div>
          </div>
        )}

        {bgStrategy === 'color' && (
          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.9em' }}>手動背景色</label>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                <input
                  type="color"
                  value={manualBgColor}
                  onChange={e => setManualBgColor(e.target.value)}
                  style={{ width: '40px', height: '32px', padding: '2px', cursor: 'pointer' }}
                />
                <span style={{ color: '#666', fontSize: '0.9em' }}>{manualBgColor}</span>
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '0.9em' }}>容差 (0–255)</label>
              <input
                type="number"
                min={0} max={255}
                value={backgroundThreshold}
                onChange={e => setBackgroundThreshold(Math.max(0, Math.min(255, parseInt(e.target.value) || 0)))}
                className="form-input"
                style={{ width: '70px' }}
              />
            </div>
          </div>
        )}

        {bgStrategy === 'none' && (
          <div style={{ color: '#888', fontSize: '0.9em' }}>圖片已包含透明背景，直接分割使用。</div>
        )}

        {uploadedGridImage && (
          <div style={{ marginTop: '12px', marginBottom: '8px' }}>
            <button
              className="btn btn-secondary btn-inline"
              onClick={() => {
                setGridClickRemoveUndoStack([])
                setGridPickedColor(null)
                setGridColorRectStart(null)
                setGridColorRectEnd(null)
                setGridClickRemoveTarget({ type: 'main' })
              }}
            >
              對宮格圖去背
            </button>
            <span style={{ marginLeft: '8px', color: '#888', fontSize: '0.85em' }}>
              分割前先用 flood 點擊或框選去背整張宮格圖
            </span>
          </div>
        )}

        <div style={{ marginTop: '12px' }}>
          <button
            className="btn btn-primary"
            onClick={handleSplit}
            disabled={!uploadedGridImage || splitting}
            style={{ marginRight: '8px' }}
          >
            {splitting ? '分割中...' : '分割 + 去背'}
          </button>
          {hasCells && (
            <button
              className="btn btn-secondary btn-inline"
              onClick={handleRemoveBgAll}
              disabled={removingBgAll}
            >
              {removingBgAll ? '去背中...' : '重新去背（全部）'}
            </button>
          )}
          {progress && (
            <span style={{ marginLeft: '10px', color: '#888', fontSize: '0.9em' }}>{progress}</span>
          )}
        </div>
      </div>

      {/* Section 3: Cell selection */}
      {hasCells && (
        <div className="step-section" style={{ background: '#fafafa', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <h3 style={{ marginTop: 0 }}>
            3. 格子選擇
            <span style={{ fontWeight: 'normal', color: '#888', fontSize: '0.8em', marginLeft: '8px' }}>
              共 {processedCells.length} 格，已選 {processedCells.length - excludedCells.size} 格（點格子可排除/恢復）
            </span>
          </h3>

          {/* Preview background selector */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.85em', color: '#666' }}>預覽底色：</span>
            {PREVIEW_BG_COLORS.map(c => (
              <div
                key={c}
                onClick={() => setPreviewBgColor(c)}
                style={{
                  width: '22px', height: '22px', borderRadius: '50%',
                  background: c,
                  border: previewBgColor === c ? '2px solid #333' : '1px solid #ccc',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              />
            ))}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: '8px',
          }}>
            {processedCells.map((cell, i) => {
              const excluded = excludedCells.has(i)
              return (
                <div
                  key={i}
                  style={{
                    position: 'relative',
                    border: excluded ? '2px dashed #e74c3c' : '2px solid #4CAF50',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    background: previewBgColor,
                    cursor: 'pointer',
                    opacity: excluded ? 0.5 : 1,
                  }}
                  title={excluded ? '已排除 — 點選恢復' : '點選排除此格'}
                  onClick={() => toggleExcluded(i)}
                >
                  <img
                    src={cell}
                    alt={`格子 ${i + 1}`}
                    style={{ width: '100%', height: '100px', objectFit: 'contain', display: 'block' }}
                  />
                  <div style={{
                    position: 'absolute', top: '2px', left: '2px',
                    background: 'rgba(0,0,0,0.55)', color: '#fff',
                    borderRadius: '3px', padding: '1px 5px', fontSize: '11px',
                  }}>
                    {i + 1}
                  </div>
                  {excluded && (
                    <div style={{
                      position: 'absolute', top: '50%', left: '50%',
                      transform: 'translate(-50%, -50%)',
                      background: 'rgba(231,76,60,0.85)', color: '#fff',
                      borderRadius: '4px', padding: '2px 8px', fontSize: '12px', fontWeight: 'bold',
                    }}>
                      排除
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Multi-crop button */}
          <div style={{ marginTop: '12px', marginBottom: '8px' }}>
            <button
              className="btn btn-primary btn-inline"
              onClick={() => setShowMultiCrop(true)}
              title="在原始宮格圖上同時顯示所有格子的裁切框，一起調整"
            >
              全格裁切編輯
            </button>
            <span style={{ marginLeft: '8px', color: '#888', fontSize: '0.85em' }}>
              在宮格圖上同時顯示所有裁切框，可拖移 / 縮放
            </span>
          </div>

          {/* Per-cell actions */}
          <div style={{ marginTop: '4px' }}>
            <div style={{ fontSize: '0.85em', color: '#666', marginBottom: '8px' }}>
              每格微調（去背 / 裁切）：
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gap: '4px',
            }}>
              {processedCells.map((cell, i) => (
                <div key={i} style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-secondary btn-inline"
                    style={{ fontSize: '0.75em', padding: '3px 6px' }}
                    disabled={removingBgCell === i}
                    onClick={() => handleRemoveBgSingleCell(i)}
                    title="重新去背此格"
                  >
                    {removingBgCell === i ? '...' : '去背'}
                  </button>
                  <button
                    className="btn btn-secondary btn-inline"
                    style={{ fontSize: '0.75em', padding: '3px 6px' }}
                    onClick={() => {
                      setClickRemoveUndoStack([])
                      setPickedColor(null)
                      setClickRemoveTarget({ index: i, type: 'sticker' })
                    }}
                    title="點擊/框選去背"
                  >
                    選去
                  </button>
                  <button
                    className="btn btn-secondary btn-inline"
                    style={{ fontSize: '0.75em', padding: '3px 6px' }}
                    onClick={() => handleOpenCropAdjust(i)}
                    title="裁切微調"
                  >
                    微調
                  </button>
                  <button
                    className="btn btn-secondary btn-inline"
                    style={{ fontSize: '0.75em', padding: '3px 6px', whiteSpace: 'nowrap' }}
                    onClick={() => handleSelectCellAsMain(i)}
                    title="設為主圖"
                  >
                    主圖
                  </button>
                  <button
                    className="btn btn-secondary btn-inline"
                    style={{ fontSize: '0.75em', padding: '3px 6px', whiteSpace: 'nowrap' }}
                    onClick={() => handleSelectCellAsTab(i)}
                    title="設為 tab 圖"
                  >
                    tab
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Section 4: Main / Tab image */}
      {hasCells && (
        <div className="step-section" style={{ background: '#fafafa', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <h3 style={{ marginTop: 0 }}>4. 主圖 / Tab 圖（可選）</h3>
          <p style={{ color: '#888', fontSize: '0.9em', marginTop: 0 }}>
            可上傳自訂主圖（240×240）和 tab 圖（96×74），或直接從上方格子選取。若不設定，zip 中將不含主圖/tab 圖。
          </p>

          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            {/* Main image */}
            {stickerSpec.hasMain && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '6px', fontWeight: '500', fontSize: '0.9em' }}>
                  主圖 (240×240)
                </div>
                {mainImage ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                      src={mainImage}
                      alt="主圖"
                      style={{ width: '80px', height: '80px', objectFit: 'contain', background: previewBgColor, border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                    <button
                      style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', border: 'none', background: '#e74c3c', color: '#fff', cursor: 'pointer', fontSize: '10px', lineHeight: '18px', padding: 0 }}
                      onClick={() => setMainImage(null)}
                    >
                      x
                    </button>
                  </div>
                ) : (
                  <div style={{ width: '80px', height: '80px', background: '#f0f0f0', border: '1px dashed #ccc', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: '0.75em' }}>
                    未設定
                  </div>
                )}
                <div style={{ marginTop: '6px' }}>
                  <label className="btn btn-secondary btn-inline" style={{ fontSize: '0.8em', cursor: 'pointer' }}>
                    上傳主圖
                    <input
                      ref={mainUploadRef}
                      type="file"
                      accept="image/*"
                      onChange={handleMainUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Tab image */}
            {stickerSpec.hasTab && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ marginBottom: '6px', fontWeight: '500', fontSize: '0.9em' }}>
                  Tab 圖 (96×74)
                </div>
                {tabImage ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                      src={tabImage}
                      alt="Tab 圖"
                      style={{ width: '80px', height: '62px', objectFit: 'contain', background: previewBgColor, border: '1px solid #ddd', borderRadius: '4px' }}
                    />
                    <button
                      style={{ position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', border: 'none', background: '#e74c3c', color: '#fff', cursor: 'pointer', fontSize: '10px', lineHeight: '18px', padding: 0 }}
                      onClick={() => setTabImage(null)}
                    >
                      x
                    </button>
                  </div>
                ) : (
                  <div style={{ width: '80px', height: '62px', background: '#f0f0f0', border: '1px dashed #ccc', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: '0.75em' }}>
                    未設定
                  </div>
                )}
                <div style={{ marginTop: '6px' }}>
                  <label className="btn btn-secondary btn-inline" style={{ fontSize: '0.8em', cursor: 'pointer' }}>
                    上傳 Tab 圖
                    <input
                      ref={tabUploadRef}
                      type="file"
                      accept="image/*"
                      onChange={handleTabUpload}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section 5: Preview + Download */}
      {hasCells && (
        <div className="step-section" style={{ background: '#fafafa', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <h3 style={{ marginTop: 0 }}>5. 預覽 + 下載</h3>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
            <button
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading || activeCells.length === 0}
            >
              {downloading ? '打包中...' : `下載 ZIP（${activeCells.length} 張）`}
            </button>
            <span style={{ color: '#888', fontSize: '0.9em' }}>
              預覽底色：
              {PREVIEW_BG_COLORS.map(c => (
                <span
                  key={c}
                  onClick={() => setPreviewBgColor(c)}
                  style={{
                    display: 'inline-block',
                    width: '16px', height: '16px',
                    borderRadius: '50%',
                    background: c,
                    border: previewBgColor === c ? '2px solid #333' : '1px solid #ccc',
                    cursor: 'pointer',
                    marginLeft: '4px',
                    verticalAlign: 'middle',
                    boxSizing: 'border-box',
                  }}
                />
              ))}
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.min(gridCols, 4)}, 1fr)`,
            gap: '8px',
          }}>
            {processedCells.map((cell, i) => {
              const excluded = excludedCells.has(i)
              return (
                <div
                  key={i}
                  style={{
                    background: previewBgColor,
                    border: excluded ? '1px dashed #e74c3c' : '1px solid #ddd',
                    borderRadius: '6px',
                    padding: '6px',
                    textAlign: 'center',
                    opacity: excluded ? 0.4 : 1,
                  }}
                >
                  <img
                    src={cell}
                    alt={`格子 ${i + 1}`}
                    style={{ maxWidth: '100%', maxHeight: '120px', objectFit: 'contain' }}
                  />
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                    {excluded ? '(排除)' : `#${i + 1}`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CropAdjustPanel modal */}
      {cropAdjustTarget && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <CropAdjustPanel
            gridSrc={uploadedGridImage}
            cellRow={cropAdjustTarget.cellRow}
            cellCol={cropAdjustTarget.cellCol}
            cellW={cellW}
            cellH={cellH}
            initialOffset={cropAdjustTarget.prevOffset}
            initialZoom={cropAdjustTarget.prevOffset?.zoom || 1}
            onConfirm={handleCropAdjustConfirm}
            onCancel={() => setCropAdjustTarget(null)}
            cols={gridCols}
            rows={gridRows}
          />
        </div>
      )}

      {/* GridMultiCropAdjustPanel modal */}
      {showMultiCrop && uploadedGridImage && (
        <GridMultiCropAdjustPanel
          gridSrc={uploadedGridImage}
          rawGridSrc={uploadedGridImage}
          gridIndex={0}
          startStickerIndex={0}
          visibleCount={processedCells.length}
          cellW={cellW}
          cellH={cellH}
          cols={gridCols}
          rows={gridRows}
          initialAdjustments={cropAdjustHistory}
          onApply={async (cells) => {
            setShowMultiCrop(false)
            await handleMultiCropAdjustConfirm(cells, { startIndex: 0 })
          }}
          onCancel={() => setShowMultiCrop(false)}
        />
      )}

      <ClickRemoveModal
        title={clickRemoveTarget ? `選去 #${clickRemoveTarget.index + 1}` : ''}
        target={clickRemoveTarget}
        onClose={() => setClickRemoveTarget(null)}
        mode={clickRemoveMode} setMode={setClickRemoveMode}
        threshold={clickRemoveThreshold} setThreshold={setClickRemoveThreshold}
        undoStack={clickRemoveUndoStack} onUndo={handleClickRemoveUndo}
        pickedColor={pickedColor} setPickedColor={setPickedColor}
        colorRectStart={colorRectStart} colorRectEnd={colorRectEnd} isDraggingRect={isDraggingRect}
        canvasRef={clickRemoveCanvasRef} lensRef={clickRemoveLensRef}
        getSource={getClickRemoveSource}
        onFloodClick={handleClickRemoveFlood}
        onColorPick={handleColorPick}
        onColorRectMouseDown={handleColorRectMouseDown}
        onColorRectMouseMove={handleColorRectMouseMove}
        onColorRectMouseUp={handleColorRectMouseUp}
        previewBgColor={previewBgColor} setPreviewBgColor={setPreviewBgColor}
        extraControls={
          <div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>去背閾值：{backgroundThreshold}</div>
            <input type="range" min="0" max="255" value={backgroundThreshold}
              onChange={(e) => setBackgroundThreshold(Number(e.target.value))} style={{ width: '100%' }} />
            <button className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px', marginTop: '6px', width: '100%' }}
              onClick={async () => {
                if (!clickRemoveTarget) return
                const source = processedCells[clickRemoveTarget.index]
                if (!source) return
                try {
                  const bgColor = bgStrategy === 'color' ? manualBgColor : chromaKeyBgColor
                  const result = await removeBackgroundSimple(source, backgroundThreshold, null, { bgColor })
                  applyResult(result)
                } catch (err) { alert('去背失敗: ' + err.message) }
              }}
            >全圖去背</button>
          </div>
        }
      />

      <ClickRemoveModal
        title="宮格圖去背"
        target={gridClickRemoveTarget}
        onClose={() => setGridClickRemoveTarget(null)}
        mode={gridClickRemoveMode} setMode={setGridClickRemoveMode}
        threshold={gridClickRemoveThreshold} setThreshold={setGridClickRemoveThreshold}
        undoStack={gridClickRemoveUndoStack} onUndo={handleGridClickRemoveUndo}
        pickedColor={gridPickedColor} setPickedColor={setGridPickedColor}
        colorRectStart={gridColorRectStart} colorRectEnd={gridColorRectEnd} isDraggingRect={gridIsDraggingRect}
        canvasRef={gridClickRemoveCanvasRef} lensRef={gridClickRemoveLensRef}
        getSource={getGridClickRemoveSource}
        onFloodClick={handleGridClickRemoveFlood}
        onColorPick={handleGridColorPick}
        onColorRectMouseDown={handleGridColorRectMouseDown}
        onColorRectMouseMove={handleGridColorRectMouseMove}
        onColorRectMouseUp={handleGridColorRectMouseUp}
        previewBgColor={previewBgColor} setPreviewBgColor={setPreviewBgColor}
      />
    </div>
  )
}
