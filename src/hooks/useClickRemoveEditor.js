import { useState, useRef } from 'react'
import { removeBackgroundFromPoint, removeBackgroundByColor, pickColorFromImage } from '../utils/imageUtils'

/**
 * useClickRemoveEditor
 *
 * Encapsulates click-to-remove-background logic:
 *   - flood mode: click a point → flood-fill remove
 *   - color mode: pick a color, then drag a rect → remove by color
 *   - Undo stack
 *
 * @param {object} opts
 * @param {Array}    opts.cutImages
 * @param {Function} opts.setCutImages
 * @param {Array}    opts.processedGridImages
 * @param {Function} opts.setProcessedGridImages
 * @param {string}   opts.mainImage
 * @param {Function} opts.setMainImage
 * @param {string}   opts.tabImage
 * @param {Function} opts.setTabImage
 * @param {Array}    opts.gridImages
 */
export function useClickRemoveEditor({
  cutImages,
  setCutImages,
  processedGridImages,
  setProcessedGridImages,
  mainImage,
  setMainImage,
  tabImage,
  setTabImage,
  gridImages,
} = {}) {
  // ---- Click-remove state ----
  const [clickRemoveTarget, setClickRemoveTarget] = useState(null) // { index, type } type: 'sticker' | 'main' | 'tab' | 'grid'
  const [clickRemoveThreshold, setClickRemoveThreshold] = useState(30)
  const [clickRemoveMode, setClickRemoveMode] = useState('flood') // 'flood' | 'color'
  const [clickRemoveUndoStack, setClickRemoveUndoStack] = useState([])
  // 吸色去除狀態
  const [pickedColor, setPickedColor] = useState(null) // { r, g, b }
  const [colorRectStart, setColorRectStart] = useState(null) // { x, y } 圖片座標
  const [colorRectEnd, setColorRectEnd] = useState(null) // { x, y } 圖片座標
  const [isDraggingRect, setIsDraggingRect] = useState(false)
  const clickRemoveCanvasRef = useRef(null)
  const clickRemoveLensRef = useRef(null)

  const getClickRemoveSource = () => {
    if (!clickRemoveTarget) return null
    const { index, type } = clickRemoveTarget
    if (type === 'sticker') return cutImages[index]
    if (type === 'grid') return processedGridImages[index] || gridImages[index]
    if (type === 'main') return mainImage
    if (type === 'tab') return tabImage
    return null
  }

  const handleClickRemoveUndo = () => {
    if (clickRemoveUndoStack.length === 0 || !clickRemoveTarget) return
    const prev = clickRemoveUndoStack[clickRemoveUndoStack.length - 1]
    setClickRemoveUndoStack(stack => stack.slice(0, -1))
    const { index, type } = clickRemoveTarget
    if (type === 'sticker') {
      setCutImages(arr => { const u = [...arr]; u[index] = prev; return u })
    } else if (type === 'grid') {
      setProcessedGridImages(arr => { const u = [...arr]; u[index] = prev; return u })
    } else if (type === 'main') {
      setMainImage(prev)
    } else if (type === 'tab') {
      setTabImage(prev)
    }
  }

  const canvasToImageCoords = (e) => {
    const canvas = clickRemoveCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: Math.floor((e.clientX - rect.left) * scaleX),
      y: Math.floor((e.clientY - rect.top) * scaleY),
    }
  }

  const applyResult = (result) => {
    const { index, type } = clickRemoveTarget
    if (type === 'sticker') {
      setCutImages(prev => { const u = [...prev]; u[index] = result; return u })
    } else if (type === 'grid') {
      setProcessedGridImages(prev => { const u = [...prev]; u[index] = result; return u })
    } else if (type === 'main') {
      setMainImage(result)
    } else if (type === 'tab') {
      setTabImage(result)
    }
  }

  // flood 模式：點擊即去背
  const handleClickRemoveFlood = async (e) => {
    const pt = canvasToImageCoords(e)
    if (!pt || !clickRemoveTarget) return
    const source = getClickRemoveSource()
    if (!source) return
    setClickRemoveUndoStack(stack => [...stack, source])
    try {
      const result = await removeBackgroundFromPoint(source, pt.x, pt.y, clickRemoveThreshold)
      applyResult(result)
    } catch (error) {
      alert(`去背失敗: ${error.message}`)
    }
  }

  // color 模式：第一步吸色
  const handleColorPick = async (e) => {
    const pt = canvasToImageCoords(e)
    if (!pt) return
    const source = getClickRemoveSource()
    if (!source) return
    const color = await pickColorFromImage(source, pt.x, pt.y)
    setPickedColor(color)
    setColorRectStart(null)
    setColorRectEnd(null)
  }

  // color 模式：框選開始
  const handleColorRectMouseDown = (e) => {
    if (!pickedColor) return
    const pt = canvasToImageCoords(e)
    if (!pt) return
    setColorRectStart(pt)
    setColorRectEnd(pt)
    setIsDraggingRect(true)
  }

  // color 模式：框選中
  const handleColorRectMouseMove = (e) => {
    if (!isDraggingRect) return
    const pt = canvasToImageCoords(e)
    if (pt) setColorRectEnd(pt)
  }

  // color 模式：框選結束 → 去除
  const handleColorRectMouseUp = async () => {
    if (!isDraggingRect || !colorRectStart || !colorRectEnd || !pickedColor) {
      setIsDraggingRect(false)
      return
    }
    setIsDraggingRect(false)
    const source = getClickRemoveSource()
    if (!source) return

    const x = Math.min(colorRectStart.x, colorRectEnd.x)
    const y = Math.min(colorRectStart.y, colorRectEnd.y)
    const w = Math.abs(colorRectEnd.x - colorRectStart.x)
    const h = Math.abs(colorRectEnd.y - colorRectStart.y)
    if (w < 2 || h < 2) return

    setClickRemoveUndoStack(stack => [...stack, source])
    try {
      const result = await removeBackgroundByColor(source, pickedColor, clickRemoveThreshold, { x, y, w, h })
      applyResult(result)
    } catch (error) {
      alert(`吸色去除失敗: ${error.message}`)
    }
    setColorRectStart(null)
    setColorRectEnd(null)
  }

  return {
    clickRemoveTarget,
    setClickRemoveTarget,
    clickRemoveThreshold,
    setClickRemoveThreshold,
    clickRemoveMode,
    setClickRemoveMode,
    clickRemoveUndoStack,
    setClickRemoveUndoStack,
    pickedColor,
    setPickedColor,
    colorRectStart,
    setColorRectStart,
    colorRectEnd,
    setColorRectEnd,
    isDraggingRect,
    clickRemoveCanvasRef,
    clickRemoveLensRef,
    getClickRemoveSource,
    applyResult,
    handleClickRemoveUndo,
    handleClickRemoveFlood,
    handleColorPick,
    handleColorRectMouseDown,
    handleColorRectMouseMove,
    handleColorRectMouseUp,
  }
}
