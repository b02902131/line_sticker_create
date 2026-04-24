import React, { useState, useRef, useEffect, useCallback } from 'react'

function CropAdjustPanel({ gridSrc, cellRow, cellCol, cellW, cellH, initialOffset, initialZoom, onConfirm, onCancel, cols = 2, rows = 4 }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [offset, setOffset] = useState(initialOffset || { x: 0, y: 0 })
  const [zoom, setZoom] = useState(initialZoom || 1)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)
  const step = 5
  const zoomStep = 0.05
  const minZoom = 0.5
  const maxZoom = 1.5

  // 繪製：顯示整張 grid，在目標 cell 位置畫裁切框
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !img.complete) return
    const ctx = canvas.getContext('2d')

    canvas.width = img.width
    canvas.height = img.height
    ctx.drawImage(img, 0, 0)

    // 計算實際 cell 尺寸（含縮放）
    const baseCellW = img.width / cols
    const baseCellH = img.height / rows
    const sx = img.width / (cellW * cols)
    const sy = img.height / (cellH * rows)
    const cropW = baseCellW * zoom
    const cropH = baseCellH * zoom
    // 保持中心點
    const centerX = cellCol * baseCellW + baseCellW / 2 + offset.x * sx
    const centerY = cellRow * baseCellH + baseCellH / 2 + offset.y * sy
    const cropX = centerX - cropW / 2
    const cropY = centerY - cropH / 2

    // 遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // 清出裁切區
    ctx.clearRect(cropX, cropY, cropW, cropH)
    ctx.drawImage(img, cropX, cropY, cropW, cropH, cropX, cropY, cropW, cropH)

    // 邊框
    ctx.strokeStyle = '#4CAF50'
    ctx.lineWidth = 3
    ctx.strokeRect(cropX, cropY, cropW, cropH)
    // 十字對準線
    ctx.setLineDash([6, 6])
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(centerX, cropY)
    ctx.lineTo(centerX, cropY + cropH)
    ctx.moveTo(cropX, centerY)
    ctx.lineTo(cropX + cropW, centerY)
    ctx.stroke()
    ctx.setLineDash([])
  }, [gridSrc, cellRow, cellCol, cellW, cellH, cols, rows, offset, zoom])

  // 載入圖片
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; setOffset(o => ({ ...o })) }
    img.src = gridSrc
  }, [gridSrc])

  // 拖拉
  const handlePointerDown = (e) => {
    setDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const handlePointerMove = (e) => {
    if (!dragging || !dragStart.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    // 螢幕像素 → logical offset
    const dx = (e.clientX - dragStart.current.x) * (cellW * cols) / rect.width
    const dy = (e.clientY - dragStart.current.y) * (cellH * rows) / rect.height
    setOffset({ x: Math.round(dragStart.current.ox + dx), y: Math.round(dragStart.current.oy + dy) })
  }
  const handlePointerUp = () => { setDragging(false); dragStart.current = null }

  // 鍵盤
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') setOffset(p => ({ ...p, x: p.x - step }))
      else if (e.key === 'ArrowRight') setOffset(p => ({ ...p, x: p.x + step }))
      else if (e.key === 'ArrowUp') setOffset(p => ({ ...p, y: p.y - step }))
      else if (e.key === 'ArrowDown') setOffset(p => ({ ...p, y: p.y + step }))
      else if (e.key === '+' || e.key === '=') setZoom(z => Math.min(maxZoom, z + zoomStep))
      else if (e.key === '-') setZoom(z => Math.max(minZoom, z - zoomStep))
      else if (e.key === 'Enter') onConfirm(offset.x, offset.y, zoom)
      else if (e.key === 'Escape') onCancel()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [offset, zoom, onConfirm, onCancel])

  // 滾輪縮放
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    setZoom(z => {
      const delta = e.deltaY > 0 ? zoomStep : -zoomStep
      return Math.min(maxZoom, Math.max(minZoom, z + delta))
    })
  }, [])

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{ border: '1px solid #ddd', borderRadius: '4px', width: '100%', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
        <button className="btn btn-secondary btn-inline" onClick={() => setZoom(z => Math.max(minZoom, z - zoomStep))}>−</button>
        <input type="range" min={minZoom * 100} max={maxZoom * 100} value={zoom * 100}
          onChange={(e) => setZoom(Number(e.target.value) / 100)} style={{ flex: 1, height: '4px' }} />
        <button className="btn btn-secondary btn-inline" onClick={() => setZoom(z => Math.min(maxZoom, z + zoomStep))}>+</button>
        <span style={{ fontSize: '11px', color: '#999', minWidth: '36px' }}>{Math.round(zoom * 100)}%</span>
      </div>
      <p style={{ textAlign: 'center', fontSize: '0.8em', color: '#888', margin: '4px 0' }}>拖拉移動・滾輪縮放・方向鍵微調（偏移: {offset.x}, {offset.y}）</p>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        <button className="btn btn-success btn-inline" onClick={() => onConfirm(offset.x, offset.y, zoom)}>確認</button>
        <button className="btn btn-secondary btn-inline" onClick={() => { setOffset({ x: 0, y: 0 }); setZoom(1) }}>重置</button>
        <button className="btn btn-secondary btn-inline" onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

export default CropAdjustPanel
