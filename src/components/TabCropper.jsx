import React, { useState, useRef, useEffect } from 'react'

function TabCropper({ imageDataUrl, onConfirm, onCancel, targetWidth = 96, targetHeight = 74, title = '裁切標籤圖片' }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [crop, setCrop] = useState(null)
  const [dragging, setDragging] = useState(null) // 'move' | 'resize' | null
  const dragStart = useRef(null)

  // 圖片載入後初始化裁切框
  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return
    const img = imgRef.current
    const displayW = img.width
    const displayH = img.height
    const ratio = targetWidth / targetHeight
    // 初始裁切框：佔圖片 60%，居中
    let cropW, cropH
    if (displayW / displayH > ratio) {
      cropH = displayH * 0.6
      cropW = cropH * ratio
    } else {
      cropW = displayW * 0.6
      cropH = cropW / ratio
    }
    setCrop({
      x: (displayW - cropW) / 2,
      y: (displayH - cropH) / 2,
      w: cropW,
      h: cropH
    })
  }, [imgLoaded])

  // 繪製 overlay
  useEffect(() => {
    if (!crop || !canvasRef.current || !imgRef.current) return
    const canvas = canvasRef.current
    const img = imgRef.current
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // 暗色遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // 裁切區域清除遮罩
    ctx.clearRect(crop.x, crop.y, crop.w, crop.h)
    // 裁切框邊框
    ctx.strokeStyle = '#4CAF50'
    ctx.lineWidth = 2
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h)
    // 右下角 resize handle
    ctx.fillStyle = '#4CAF50'
    ctx.fillRect(crop.x + crop.w - 8, crop.y + crop.h - 8, 8, 8)
  }, [crop])

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const handleDown = (e) => {
    e.preventDefault()
    if (!crop) return
    const pos = getPos(e)
    // 判斷是 resize 還是 move
    if (pos.x >= crop.x + crop.w - 16 && pos.y >= crop.y + crop.h - 16 &&
        pos.x <= crop.x + crop.w && pos.y <= crop.y + crop.h) {
      setDragging('resize')
    } else if (pos.x >= crop.x && pos.x <= crop.x + crop.w &&
               pos.y >= crop.y && pos.y <= crop.y + crop.h) {
      setDragging('move')
    }
    dragStart.current = { ...pos, crop: { ...crop } }
  }

  const handleMove = (e) => {
    if (!dragging || !dragStart.current || !imgRef.current) return
    e.preventDefault()
    const pos = getPos(e)
    const dx = pos.x - dragStart.current.x
    const dy = pos.y - dragStart.current.y
    const orig = dragStart.current.crop
    const maxW = imgRef.current.width
    const maxH = imgRef.current.height
    const ratio = targetWidth / targetHeight

    if (dragging === 'move') {
      let nx = orig.x + dx
      let ny = orig.y + dy
      nx = Math.max(0, Math.min(nx, maxW - orig.w))
      ny = Math.max(0, Math.min(ny, maxH - orig.h))
      setCrop({ ...orig, x: nx, y: ny })
    } else if (dragging === 'resize') {
      let nw = Math.max(30, orig.w + dx)
      let nh = nw / ratio
      if (orig.x + nw > maxW) { nw = maxW - orig.x; nh = nw / ratio }
      if (orig.y + nh > maxH) { nh = maxH - orig.y; nw = nh * ratio }
      setCrop({ ...orig, w: nw, h: nh })
    }
  }

  const handleUp = () => {
    setDragging(null)
    dragStart.current = null
  }

  const handleConfirm = () => {
    if (!crop || !imgRef.current) return
    const img = imgRef.current
    // 換算回原圖座標
    const natW = img.naturalWidth
    const natH = img.naturalHeight
    const scaleX = natW / img.width
    const scaleY = natH / img.height
    const sx = crop.x * scaleX
    const sy = crop.y * scaleY
    const sw = crop.w * scaleX
    const sh = crop.h * scaleY

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, targetWidth, targetHeight)

    const origImg = new Image()
    origImg.onload = () => {
      ctx.drawImage(origImg, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)
      onConfirm(canvas.toDataURL('image/png'))
    }
    origImg.src = imageDataUrl
  }

  return (
    <div>
      <h3>{title}</h3>
      <p style={{ fontSize: '0.85em', color: '#888' }}>拖曳移動裁切框，右下角可調整大小（固定 {targetWidth}:{targetHeight} 比例）</p>
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        <img
          ref={imgRef}
          src={imageDataUrl}
          alt="裁切來源"
          onLoad={() => setImgLoaded(true)}
          style={{ maxWidth: '400px', display: 'block' }}
        />
        {imgLoaded && (
          <canvas
            ref={canvasRef}
            style={{ position: 'absolute', top: 0, left: 0, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
            onMouseDown={handleDown}
            onMouseMove={handleMove}
            onMouseUp={handleUp}
            onMouseLeave={handleUp}
            onTouchStart={handleDown}
            onTouchMove={handleMove}
            onTouchEnd={handleUp}
          />
        )}
      </div>
      {crop && (
        <div style={{ marginTop: '10px' }}>
          <p style={{ fontSize: '0.85em', color: '#666' }}>預覽：</p>
          <canvas
            ref={(el) => {
              if (!el || !imgRef.current || !crop) return
              el.width = targetWidth; el.height = targetHeight
              const ctx = el.getContext('2d')
              ctx.clearRect(0, 0, targetWidth, targetHeight)
              const img = imgRef.current
              const scaleX = img.naturalWidth / img.width
              const scaleY = img.naturalHeight / img.height
              ctx.drawImage(img, crop.x * scaleX, crop.y * scaleY, crop.w * scaleX, crop.h * scaleY, 0, 0, targetWidth, targetHeight)
            }}
            style={{ border: '1px solid #ddd', borderRadius: '4px' }}
          />
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button className="btn btn-success btn-inline" onClick={handleConfirm}>確認裁切</button>
        <button className="btn btn-secondary btn-inline" onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

export default TabCropper
