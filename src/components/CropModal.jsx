import { useCallback, useEffect, useRef, useState } from 'react'

export default function CropModal({ image, targetW, targetH, onApply, onCancel }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const stateRef = useRef({ cx: 0, cy: 0, zoom: 1 })
  const pointersRef = useRef(new Map())
  const dragRef = useRef(null)
  const pinchRef = useRef(null)
  const [state, setState] = useState({ cx: 0, cy: 0, zoom: 1 })

  // Keep stateRef in sync for event handlers that need latest values without stale closure
  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const fitZoom = Math.min(targetW / img.width, targetH / img.height)
      setState({ cx: img.width / 2, cy: img.height / 2, zoom: fitZoom })
    }
    img.src = image
  }, [image, targetW, targetH])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    canvas.width = targetW
    canvas.height = targetH
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, targetW, targetH)
    const { cx, cy, zoom } = state
    const srcW = targetW / zoom
    const srcH = targetH / zoom
    ctx.drawImage(img, cx - srcW / 2, cy - srcH / 2, srcW, srcH, 0, 0, targetW, targetH)
  }, [state, targetW, targetH])

  useEffect(() => { draw() }, [draw])

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 1) {
      const s = stateRef.current
      dragRef.current = { x: e.clientX, y: e.clientY, cx: s.cx, cy: s.cy, zoom: s.zoom }
      pinchRef.current = null
    } else if (pointersRef.current.size === 2) {
      dragRef.current = null
      const pts = Array.from(pointersRef.current.values())
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      pinchRef.current = { initialDist: dist, initialZoom: stateRef.current.zoom }
    }
  }

  const handlePointerMove = (e) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 1 && dragRef.current) {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const dx = (e.clientX - dragRef.current.x) * (targetW / rect.width) / dragRef.current.zoom
      const dy = (e.clientY - dragRef.current.y) * (targetH / rect.height) / dragRef.current.zoom
      setState(prev => ({ ...prev, cx: dragRef.current.cx - dx, cy: dragRef.current.cy - dy }))
    } else if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values())
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)
      const newZoom = Math.min(20, Math.max(0.05, pinchRef.current.initialZoom * (dist / pinchRef.current.initialDist)))
      setState(prev => ({ ...prev, zoom: newZoom }))
    }
  }

  const handlePointerUp = (e) => {
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size === 0) {
      dragRef.current = null
      pinchRef.current = null
    } else if (pointersRef.current.size === 1) {
      pinchRef.current = null
      const [ptr] = pointersRef.current.values()
      const s = stateRef.current
      dragRef.current = { x: ptr.x, y: ptr.y, cx: s.cx, cy: s.cy, zoom: s.zoom }
    }
  }

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    setState(prev => ({ ...prev, zoom: Math.min(20, Math.max(0.05, prev.zoom * (e.deltaY > 0 ? 0.9 : 1.1))) }))
  }, [])

  const handleApply = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    onApply(canvas.toDataURL('image/png'))
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', width: 'min(500px, 96vw)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>裁切（{targetW}×{targetH}）</div>
          <div style={{ fontSize: '12px', color: '#888' }}>拖曳移動・雙指縮放・滾輪縮放</div>
        </div>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', cursor: 'grab', border: '1px solid #ddd', borderRadius: '6px', touchAction: 'none', background: '#f0f0f0' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        />
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-inline" onClick={onCancel}>取消</button>
          <button className="btn btn-success btn-inline" onClick={handleApply}>套用</button>
        </div>
      </div>
    </div>
  )
}
