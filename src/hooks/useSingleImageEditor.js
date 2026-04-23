import { useState, useCallback } from 'react'
import { removeBackgroundSimple } from '../utils/imageUtils'
import { fileToDataURL } from '../utils/imageUtils'

/**
 * useSingleImageEditor
 *
 * Encapsulates the raw+processed image state pair, bg removal, threshold,
 * crop source, and re-generate logic that is shared by:
 *   - main image (240×240)
 *   - tab image  (96×74)
 *   - single sticker editor (future)
 *
 * @param {object} opts
 * @param {number}   opts.globalThreshold   - the global backgroundThreshold from App state
 * @param {Function} opts.generateFn        - async () => rawDataUrl
 *                                            Called when the user clicks "重產"
 *                                            e.g. () => genMainImage(key, charImg, theme)
 *                                            e.g. () => createTabFromCharacter(charImg, threshold)
 * @param {boolean}  opts.applyBgOnGenerate - if true, bg-remove right after generate (default true)
 */
export function useSingleImageEditor({
  globalThreshold,
  generateFn,
  applyBgOnGenerate = true,
} = {}) {
  const [image, setImage] = useState(null)         // processed (bg-removed)
  const [rawImage, setRawImage] = useState(null)   // original (no bg removal)
  const [threshold, setThreshold] = useState(null) // null = use globalThreshold
  const [regenerating, setRegenerating] = useState(false)
  const [removingBg, setRemovingBg] = useState(false)
  const [cropSource, setCropSource] = useState(null) // null | 'pick' | dataUrl

  const effectiveThreshold = threshold ?? globalThreshold

  // --- setters for external sync (e.g. loading from IndexedDB) ---
  const setInitialImage = useCallback((processed, raw) => {
    if (processed) setImage(processed)
    if (raw) setRawImage(raw)
  }, [])

  const reset = useCallback(() => {
    setImage(null)
    setRawImage(null)
    setThreshold(null)
    setRegenerating(false)
    setRemovingBg(false)
    setCropSource(null)
  }, [])

  // --- regenerate ---
  const regenerate = useCallback(async () => {
    if (!generateFn) return
    setRegenerating(true)
    try {
      const raw = await generateFn()
      setRawImage(raw)
      if (applyBgOnGenerate) {
        const processed = await removeBackgroundSimple(raw, effectiveThreshold)
        setImage(processed)
      } else {
        setImage(raw)
      }
    } catch (err) {
      alert('重產失敗：' + err.message)
    } finally {
      setRegenerating(false)
    }
  }, [generateFn, applyBgOnGenerate, effectiveThreshold])

  // --- bg removal ---
  const removeBg = useCallback(async () => {
    const source = rawImage || image
    if (!source) return
    setRemovingBg(true)
    try {
      const processed = await removeBackgroundSimple(source, effectiveThreshold)
      setImage(processed)
    } catch (err) {
      alert('去背失敗：' + err.message)
    } finally {
      setRemovingBg(false)
    }
  }, [rawImage, image, effectiveThreshold])

  // --- upload ---
  const handleUpload = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await fileToDataURL(file)
    setRawImage(dataUrl)
    setImage(dataUrl)
    e.target.value = ''
  }, [])

  // --- crop confirm ---
  const handleCropConfirm = useCallback((result) => {
    setRawImage(result)
    setImage(result)
    setCropSource(null)
  }, [])

  const handleCropCancel = useCallback(() => {
    setCropSource(null)
  }, [])

  return {
    // state
    image,
    rawImage,
    threshold,
    effectiveThreshold,
    regenerating,
    removingBg,
    cropSource,
    // state setters (for external sync)
    setImage,
    setRawImage,
    setThreshold,
    setCropSource,
    setInitialImage,
    reset,
    // handlers
    regenerate,
    removeBg,
    handleUpload,
    handleCropConfirm,
    handleCropCancel,
  }
}
