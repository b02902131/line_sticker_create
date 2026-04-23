import { useState } from 'react'
import { createAnimatedApng } from '../utils/apngEncoder'

/**
 * useAnimationEditor
 *
 * Encapsulates APNG/GIF animation modal state and logic:
 *   - gifModal open/close
 *   - gifSelectedFrames selection / toggle
 *   - gifDelay speed control
 *   - gifGenerating / gifProgress status
 *   - handleOpenGifModal, handleToggleGifFrame, handleDownloadGif
 *
 * @param {object} opts
 * @param {Array}  opts.cutImages - from gridEditor
 */
export function useAnimationEditor({ cutImages }) {
  const [gifModal, setGifModal] = useState(false)
  const [gifSelectedFrames, setGifSelectedFrames] = useState([])
  const [gifDelay, setGifDelay] = useState(80) // 每幀延遲（1/100 秒），預設 80 = 0.8s
  const [gifGenerating, setGifGenerating] = useState(false)
  const [gifProgress, setGifProgress] = useState('')

  const handleOpenGifModal = () => {
    const allIndexes = cutImages.map((img, i) => img ? i : null).filter(i => i !== null)
    setGifSelectedFrames(allIndexes)
    setGifModal(true)
    setGifProgress('')
  }

  const handleToggleGifFrame = (idx) => {
    setGifSelectedFrames(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx].sort((a, b) => a - b)
    )
  }

  const handleDownloadGif = async () => {
    if (gifSelectedFrames.length === 0) {
      alert('請至少選擇一張圖片')
      return
    }
    setGifGenerating(true)
    setGifProgress('準備中...')
    try {
      const frames = gifSelectedFrames.map(i => cutImages[i]).filter(Boolean)
      // LINE 動態貼圖規格：320×270 px，最多 20 幀，最小延遲 0.05s
      const blob = await createAnimatedApng(frames, {
        width: 320,
        height: 270,
        delay: gifDelay,
        loop: 0,
        onProgress: (done, total) => setGifProgress(`處理幀 ${done}/${total}...`)
      })
      setGifProgress('下載中...')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'sticker-animation.png'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      setGifModal(false)
      setGifProgress('')
    } catch (err) {
      console.error('動圖製作失敗', err)
      alert(`動圖製作失敗: ${err.message}`)
      setGifProgress('')
    } finally {
      setGifGenerating(false)
    }
  }

  return {
    // state
    gifModal,
    setGifModal,
    gifSelectedFrames,
    setGifSelectedFrames,
    gifDelay,
    setGifDelay,
    gifGenerating,
    gifProgress,
    // handlers
    handleOpenGifModal,
    handleToggleGifFrame,
    handleDownloadGif,
  }
}
