import { useCallback, useEffect, useRef, useState } from 'react'

export default function GridMultiCropAdjustPanel({
  gridSrc,
  rawGridSrc,
  gridIndex,
  startStickerIndex,
  visibleCount,
  cellW,
  cellH,
  cols = 2,
  rows = 4,
  initialAdjustments,
  onApply,
  onCancel,
}) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [cells, setCells] = useState(() => {
    const arr = []
    for (let i = 0; i < visibleCount; i++) {
      const stickerIndex = startStickerIndex + i
      const prev = initialAdjustments?.[stickerIndex] || { x: 0, y: 0, zoom: 1 }
      arr.push({ x: prev.x || 0, y: prev.y || 0, zoom: prev.zoom || 1 })
    }
    return arr
  })
  const [selected, setSelected] = useState(() => new Set(Array.from({ length: Math.max(0, visibleCount) }, (_, i) => i)))
  const dragging = useRef(false)
  const dragStart = useRef(null) // { x, y, cells: [{x,y,zoom}] }
  const zoomStep = 0.05
  const minZoom = 0.5
  const maxZoom = 1.5

  const computeRects = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !img.complete) return []

    const baseCellW = img.width / cols
    const baseCellH = img.height / rows
    const sx = img.width / (cellW * cols)
    const sy = img.height / (cellH * rows)

    const rects = []
    for (let i = 0; i < visibleCount; i++) {
      const row = Math.floor(i / cols)
      const col = i % cols
      const { x, y, zoom } = cells[i] || { x: 0, y: 0, zoom: 1 }
      const cropW = baseCellW * zoom
      const cropH = baseCellH * zoom
      const centerX = col * baseCellW + baseCellW / 2 + x * sx
      const centerY = row * baseCellH + baseCellH / 2 + y * sy
      rects.push({
        i,
        x: centerX - cropW / 2,
        y: centerY - cropH / 2,
        w: cropW,
        h: cropH,
      })
    }
    return rects
  }, [cells, cellW, cellH, cols, rows, visibleCount])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !img.complete) return
    const ctx = canvas.getContext('2d')
    canvas.width = img.width
    canvas.height = img.height
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)

    const rects = computeRects()

    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    rects.forEach(r => {
      ctx.clearRect(r.x, r.y, r.w, r.h)
      ctx.drawImage(img, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h)

      const isSel = selected.has(r.i)
      ctx.strokeStyle = isSel ? '#4CAF50' : 'rgba(255,255,255,0.65)'
      ctx.lineWidth = 3
      ctx.strokeRect(r.x, r.y, r.w, r.h)

      const label = String(r.i + 1)
      ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      const pad = 6
      const tw = ctx.measureText(label).width
      const bx = Math.max(0, Math.min(canvas.width - (tw + pad * 2), r.x + 6))
      const by = Math.max(0, Math.min(canvas.height - 22, r.y + 6))
      ctx.fillStyle = isSel ? '#4CAF50' : 'rgba(0,0,0,0.55)'
      ctx.fillRect(bx, by, tw + pad * 2, 20)
      ctx.fillStyle = '#fff'
      ctx.fillText(label, bx + pad, by + 15)
    })
  }, [computeRects, selected])

  useEffect(() => { redraw() }, [redraw])

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => { imgRef.current = img; redraw() }
    img.src = gridSrc
  }, [gridSrc, redraw])

  const canvasPointToImagePoint = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const hitTest = (pt) => {
    const rects = computeRects()
    for (let k = rects.length - 1; k >= 0; k--) {
      const r = rects[k]
      if (pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h) return r.i
    }
    return null
  }

  const handlePointerDown = (e) => {
    const pt = canvasPointToImagePoint(e)
    if (!pt) return
    const hit = hitTest(pt)
    if (hit === null) return

    setSelected(prev => {
      const next = new Set(prev)
      const isMulti = e.shiftKey || e.metaKey || e.ctrlKey
      if (isMulti) {
        if (next.has(hit)) next.delete(hit)
        else next.add(hit)
        if (next.size === 0) next.add(hit)
        return next
      }
      return new Set([hit])
    })

    dragging.current = true
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      cells: cells.map(c => ({ ...c })),
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e) => {
    if (!dragging.current || !dragStart.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dx = (e.clientX - dragStart.current.x) * (cellW * cols) / rect.width
    const dy = (e.clientY - dragStart.current.y) * (cellH * rows) / rect.height

    setCells(prev => prev.map((c, i) => {
      if (!selected.has(i)) return c
      const base = dragStart.current.cells[i]
      return { ...c, x: Math.round(base.x + dx), y: Math.round(base.y + dy) }
    }))
  }

  const handlePointerUp = () => {
    dragging.current = false
    dragStart.current = null
  }

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -zoomStep : zoomStep
    setCells(prev => prev.map((c, i) => {
      if (!selected.has(i)) return c
      const z = Math.min(maxZoom, Math.max(minZoom, (c.zoom || 1) + delta))
      return { ...c, zoom: Number(z.toFixed(3)) }
    }))
  }, [selected])

  useEffect(() => {
    const handleKey = (e) => {
      const step = 5
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Enter', 'Escape'].includes(e.key)) return
      e.preventDefault()

      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onApply(cells, { gridIndex, rawGridSrc })
      else if (e.key === '+' || e.key === '=') {
        setCells(prev => prev.map((c, i) => selected.has(i)
          ? { ...c, zoom: Math.min(maxZoom, Math.max(minZoom, (c.zoom || 1) + zoomStep)) }
          : c))
      } else if (e.key === '-') {
        setCells(prev => prev.map((c, i) => selected.has(i)
          ? { ...c, zoom: Math.min(maxZoom, Math.max(minZoom, (c.zoom || 1) - zoomStep)) }
          : c))
      } else if (e.key === 'ArrowLeft') setCells(prev => prev.map((c, i) => selected.has(i) ? { ...c, x: c.x - step } : c))
      else if (e.key === 'ArrowRight') setCells(prev => prev.map((c, i) => selected.has(i) ? { ...c, x: c.x + step } : c))
      else if (e.key === 'ArrowUp') setCells(prev => prev.map((c, i) => selected.has(i) ? { ...c, y: c.y - step } : c))
      else if (e.key === 'ArrowDown') setCells(prev => prev.map((c, i) => selected.has(i) ? { ...c, y: c.y + step } : c))
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [cells, gridIndex, onApply, onCancel, rawGridSrc, selected])

  const selectedIdx = selected.values().next().value ?? 0
  const selectedZoom = cells?.[selectedIdx]?.zoom ?? 1

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{
        background: '#fff',
        borderRadius: '12px',
        padding: '14px',
        width: 'min(1100px, 96vw)',
        maxHeight: '92vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px' }}>批次裁切微調（{visibleCount} 個裁切筐）</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              點選裁切筐；Shift/⌘ 可複選；拖曳可移動（多選一起動）；滾輪或 +/- 可縮放；方向鍵微調；Enter 套用
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary btn-inline" onClick={onCancel}>取消</button>
            <button className="btn btn-success btn-inline" onClick={() => onApply(cells, { gridIndex, rawGridSrc })}>套用</button>
          </div>
        </div>

        <div className="multi-crop-body" style={{ display: 'flex', gap: '12px', alignItems: 'stretch', overflow: 'hidden' }}>
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            <canvas
              ref={canvasRef}
              style={{ border: '1px solid #ddd', borderRadius: '8px', width: '100%', cursor: dragging.current ? 'grabbing' : 'grab', touchAction: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
            />
          </div>
          <div className="multi-crop-controls" style={{ width: '260px', flexShrink: 0, borderLeft: '1px solid #eee', paddingLeft: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>縮放（套用到已選筐）</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="btn btn-secondary btn-inline" onClick={() => setCells(prev => prev.map((c, i) => selected.has(i) ? { ...c, zoom: Math.max(minZoom, (c.zoom || 1) - zoomStep) } : c))}>−</button>
              <input
                type="range"
                min={minZoom * 100}
                max={maxZoom * 100}
                value={selectedZoom * 100}
                onChange={(e) => {
                  const z = Number(e.target.value) / 100
                  setCells(prev => prev.map((c, i) => selected.has(i) ? { ...c, zoom: z } : c))
                }}
                style={{ flex: 1, height: '4px' }}
              />
              <button className="btn btn-secondary btn-inline" onClick={() => setCells(prev => prev.map((c, i) => selected.has(i) ? { ...c, zoom: Math.min(maxZoom, (c.zoom || 1) + zoomStep) } : c))}>+</button>
              <span style={{ fontSize: '11px', color: '#999', minWidth: '42px' }}>{Math.round(selectedZoom * 100)}%</span>
            </div>

            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
              已選：{Array.from(selected).sort((a, b) => a - b).map(i => i + 1).join(', ')}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setSelected(new Set(Array.from({ length: visibleCount }, (_, i) => i)))}
              >
                全選
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => {
                  setCells(prev => prev.map((c, i) => selected.has(i) ? { ...c, x: 0, y: 0, zoom: 1 } : c))
                }}
              >
                重置已選
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

