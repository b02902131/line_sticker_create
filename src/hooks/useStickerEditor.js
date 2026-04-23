import { useState } from 'react'
import { removeBackgroundSimple } from '../utils/imageUtils'

/**
 * useStickerEditor
 *
 * Encapsulates single-sticker editing logic:
 *   - removeBg for individual sticker (removingBgIndex)
 *   - regen panel UI state (regenPanel, openRegenPanel, toggleRegenRef)
 *   - regenerate single sticker (regeneratingIndex, handleRegenerateSingleSticker)
 *
 * @param {object} opts
 * @param {Function} opts.generateFn         - genStickerWithText dispatch wrapper (provider-aware)
 * @param {string}   opts.activeApiKey
 * @param {string}   opts.characterImage
 * @param {string}   opts.textStyle
 * @param {number}   opts.backgroundThreshold
 * @param {object}   opts.stickerSpec         - { generateCell: { w, h }, cell: { w, h } }
 * @param {Array}    opts.descriptions        - [{ description, text }]
 * @param {Array}    opts.cutImages           - from gridEditor
 * @param {Function} opts.setCutImages        - from gridEditor
 * @param {Array}    opts.rawCutImages        - from gridEditor
 * @param {Function} opts.setRawCutImages     - from gridEditor
 * @param {Function} opts.getStickerThreshold - (idx) => number, from gridEditor
 * @param {Function} opts.setStickerHistory   - from gridEditor
 * @param {Function} opts.setProgress         - (msg) => void
 */
export function useStickerEditor({
  generateFn,
  activeApiKey,
  characterImage,
  textStyle,
  backgroundThreshold,
  stickerSpec,
  descriptions,
  cutImages,
  setCutImages,
  rawCutImages,
  setRawCutImages,
  getStickerThreshold,
  setStickerHistory,
  setProgress,
} = {}) {
  // ---- Single-sticker bg removal ----
  const [removingBgIndex, setRemovingBgIndex] = useState(null)

  const handleRemoveBgSingle = async (stickerIndex) => {
    setRemovingBgIndex(stickerIndex)
    try {
      const threshold = getStickerThreshold(stickerIndex)
      const source = rawCutImages[stickerIndex] || cutImages[stickerIndex]
      const processed = await removeBackgroundSimple(source, threshold, null)
      setCutImages(prev => {
        const updated = [...prev]
        updated[stickerIndex] = processed
        return updated
      })
    } catch (error) {
      alert(`去背失敗: ${error.message}`)
    } finally {
      setRemovingBgIndex(null)
    }
  }

  // ---- Single-sticker regenerate ----
  const [regeneratingIndex, setRegeneratingIndex] = useState(null)
  const [regenPanel, setRegenPanel] = useState(null) // { index, extraPrompt, refIndexes: [] }

  const openRegenPanel = (idx) => {
    // 預設均勻抽樣作為 starting point，使用者可調
    const candidates = rawCutImages
      .map((img, i) => ({ img, i }))
      .filter(({ img, i }) => i !== idx && img)
    const maxRef = 10
    const step = Math.max(1, Math.floor(candidates.length / maxRef))
    const defaultRefs = candidates
      .filter((_, i) => i % step === 0)
      .slice(0, maxRef)
      .map(c => c.i)
    setRegenPanel({ index: idx, extraPrompt: '', refIndexes: defaultRefs })
  }

  const toggleRegenRef = (i) => {
    setRegenPanel(prev => {
      if (!prev) return prev
      const has = prev.refIndexes.includes(i)
      if (has) return { ...prev, refIndexes: prev.refIndexes.filter(x => x !== i) }
      if (prev.refIndexes.length >= 10) return prev // 上限
      return { ...prev, refIndexes: [...prev.refIndexes, i] }
    })
  }

  const handleRegenerateSingleSticker = async (stickerIndex, opts = {}) => {
    const desc = descriptions[stickerIndex]
    if (!desc) return

    setRegeneratingIndex(stickerIndex)
    setProgress(`正在重新生成第 ${stickerIndex + 1} 張貼圖...`)

    try {
      // 參考圖：優先用 opts.refIndexes（使用者選），否則 fallback 均勻抽樣
      let refStickers = []
      let refLabels = []
      if (opts.refIndexes && opts.refIndexes.length > 0) {
        for (const i of opts.refIndexes.slice(0, 10)) {
          const img = rawCutImages[i]
          if (img && i !== stickerIndex) {
            refStickers.push(img)
            refLabels.push(i + 1) // 編號對應原貼圖編號
          }
        }
      } else {
        const candidates = rawCutImages
          .map((img, i) => ({ img, i }))
          .filter(({ img, i }) => i !== stickerIndex && img)
        const maxRef = 10
        const step = Math.max(1, Math.floor(candidates.length / maxRef))
        const picked = candidates
          .filter((_, i) => i % step === 0)
          .slice(0, maxRef)
        refStickers = picked.map(c => c.img)
        refLabels = picked.map(c => c.i + 1)
      }

      // 用 generateCell 尺寸生成（表情貼有 2× 超採樣），再縮回 cell 尺寸
      const genW = stickerSpec.generateCell.w
      const genH = stickerSpec.generateCell.h
      const outW = stickerSpec.cell.w
      const outH = stickerSpec.cell.h

      let newStickerDataUrl = await generateFn(
        activeApiKey,
        characterImage,
        desc.description,
        desc.text,
        textStyle || '',
        genW,
        genH,
        refStickers,
        { extraPrompt: opts.extraPrompt || '', refLabels }
      )

      // 如果 generateCell 跟 cell 尺寸不同（表情貼超採樣），縮放到最終尺寸
      if (genW !== outW || genH !== outH) {
        const img = new Image()
        img.src = newStickerDataUrl
        await new Promise(r => { img.onload = r })
        const canvas = document.createElement('canvas')
        canvas.width = outW; canvas.height = outH
        canvas.getContext('2d').drawImage(img, 0, 0, outW, outH)
        newStickerDataUrl = canvas.toDataURL('image/png')
      }

      const processedSticker = await removeBackgroundSimple(newStickerDataUrl, backgroundThreshold, null)

      // 存版本歷史（把目前的版本存起來）
      const currentRaw = rawCutImages[stickerIndex]
      const currentProcessed = cutImages[stickerIndex]
      if (currentRaw) {
        setStickerHistory(prev => {
          const history = prev[stickerIndex] || []
          return { ...prev, [stickerIndex]: [...history, { raw: currentRaw, processed: currentProcessed }] }
        })
      }

      setRawCutImages(prev => {
        const updated = [...prev]
        updated[stickerIndex] = newStickerDataUrl
        return updated
      })
      setCutImages(prev => {
        const updated = [...prev]
        updated[stickerIndex] = processedSticker
        return updated
      })

      setProgress('')
    } catch (error) {
      console.error('重新生成貼圖失敗:', error)
      alert(`重新生成失敗: ${error.message}`)
      setProgress('')
    } finally {
      setRegeneratingIndex(null)
    }
  }

  return {
    removingBgIndex,
    handleRemoveBgSingle,
    regeneratingIndex,
    regenPanel,
    setRegenPanel,
    openRegenPanel,
    toggleRegenRef,
    handleRegenerateSingleSticker,
  }
}
