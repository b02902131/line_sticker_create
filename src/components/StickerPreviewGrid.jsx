import React from 'react'
import CropAdjustPanel from './CropAdjustPanel'
import { fileToDataURL } from '../utils/imageUtils'

/**
 * StickerPreviewGrid
 *
 * Renders the per-sticker preview grid with per-sticker controls:
 *   - Image preview with index badge
 *   - Inline text/description inputs
 *   - Action buttons: regen, removeBg, click-remove, cropAdjust, upload, download
 *   - Per-sticker threshold slider
 *   - Version history thumbnails
 *   - Regen panel (ref picker + extra prompt)
 *   - CropAdjustPanel inline
 */
export function StickerPreviewGrid({
  cutImages,
  rawCutImages,
  setRawCutImages,
  setCutImages,
  descriptions,
  setDescriptions,
  stickerHistory,
  setStickerHistory,
  stickerSpec,
  previewBgColor,
  getStickerThreshold,
  setStickerThresholds,
  removingBgIndex,
  regeneratingIndex,
  loading,
  regenPanel,
  setRegenPanel,
  openRegenPanel,
  toggleRegenRef,
  handleRegenerateSingleSticker,
  handleRemoveBgSingle,
  handleOpenCropAdjust,
  setClickRemoveUndoStack,
  setPickedColor,
  setClickRemoveTarget,
  cropAdjustTarget,
  processedGridImages,
  handleCropAdjustConfirm,
  setCropAdjustTarget,
  handleDownloadSingle,
}) {
  return (
    <div className="preview-group">
      <h3>裁切後的貼圖（{cutImages.length} 張）</h3>
      <div className="sticker-grid">
        {cutImages.map((img, idx) => (
          <div key={idx} className="sticker-item">
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img src={img} alt={`貼圖 ${idx + 1}`} className="preview-image sticker-image" style={{ background: previewBgColor }} />
              <span style={{ position: 'absolute', top: '2px', left: '2px', background: 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: '4px', padding: '1px 5px', fontSize: '11px', fontWeight: 'bold' }}>{idx + 1}</span>
            </div>
            <div className="sticker-info" style={{ fontSize: '0.85em' }}>
              <input
                type="text"
                value={descriptions[idx]?.text || ''}
                onChange={(e) => setDescriptions(prev => {
                  const u = [...prev]
                  u[idx] = { ...u[idx], text: e.target.value }
                  return u
                })}
                placeholder="貼圖文字"
                style={{ width: '100%', fontWeight: 'bold', fontSize: '1em', border: '1px solid #ddd', borderRadius: '4px', padding: '3px 6px', marginBottom: '4px' }}
              />
              <textarea
                value={descriptions[idx]?.description || ''}
                onChange={(e) => setDescriptions(prev => {
                  const u = [...prev]
                  u[idx] = { ...u[idx], description: e.target.value }
                  return u
                })}
                placeholder="圖片描述"
                rows={2}
                style={{ width: '100%', fontSize: '0.9em', border: '1px solid #ddd', borderRadius: '4px', padding: '3px 6px', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', gap: '4px' }}>
              <button
                className="btn btn-regen"
                onClick={() => openRegenPanel(idx)}
                disabled={regeneratingIndex !== null || loading}
                title="重新生成（選參考圖 + 自訂 prompt）"
              >
                {regeneratingIndex === idx ? '...' : '重產'}
              </button>
              <button
                className="btn btn-regen"
                onClick={() => handleRemoveBgSingle(idx)}
                disabled={removingBgIndex !== null || loading}
                title="自動去背"
              >
                {removingBgIndex === idx ? '...' : '去背'}
              </button>
              <button
                className="btn btn-regen"
                onClick={() => { setClickRemoveUndoStack([]); setPickedColor(null); setClickRemoveTarget({ index: idx, type: 'sticker' }) }}
                title="點擊指定區域去背"
              >
                選去
              </button>
              <button
                className="btn btn-regen"
                onClick={() => handleOpenCropAdjust(idx)}
                title="微調裁切位置"
              >
                微調
              </button>
              <label className="btn btn-regen" style={{ cursor: 'pointer', textAlign: 'center' }} title="上傳替換圖片">
                上傳
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const dataUrl = await fileToDataURL(file)
                    setRawCutImages(prev => { const u = [...prev]; u[idx] = dataUrl; return u })
                    setCutImages(prev => { const u = [...prev]; u[idx] = dataUrl; return u })
                    e.target.value = ''
                  }}
                />
              </label>
              <button
                className="btn btn-regen"
                onClick={() => handleDownloadSingle(idx)}
                title={`下載單張（${stickerSpec?.key === 'emoji' ? String(idx + 1).padStart(3, '0') : String(idx + 1).padStart(2, '0')}.png，${stickerSpec?.cell?.w}×${stickerSpec?.cell?.h}）`}
              >
                下載
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', width: '100%' }}>
              <input
                type="range"
                min="0"
                max="255"
                value={getStickerThreshold(idx)}
                onChange={(e) => setStickerThresholds(prev => ({ ...prev, [idx]: Number(e.target.value) }))}
                style={{ flex: 1, height: '4px' }}
              />
              <span style={{ fontSize: '11px', color: '#999', minWidth: '24px' }}>{getStickerThreshold(idx)}</span>
            </div>
            {stickerHistory[idx]?.length > 0 && (
              <div style={{ marginTop: '6px' }}>
                <p style={{ fontSize: '0.75em', color: '#888', margin: '0 0 4px' }}>歷史版本（點擊選用）</p>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {stickerHistory[idx].map((ver, vi) => (
                    <img
                      key={vi}
                      src={ver.processed}
                      alt={`v${vi + 1}`}
                      onClick={() => {
                        // 把目前的存進歷史，換成選中的版本
                        const currentRaw = rawCutImages[idx]
                        const currentProcessed = cutImages[idx]
                        setStickerHistory(prev => {
                          const h = [...prev[idx]]
                          h.splice(vi, 1) // 移除選中的
                          h.push({ raw: currentRaw, processed: currentProcessed }) // 把目前的放回去
                          return { ...prev, [idx]: h }
                        })
                        setRawCutImages(prev => { const u = [...prev]; u[idx] = ver.raw; return u })
                        setCutImages(prev => { const u = [...prev]; u[idx] = ver.processed; return u })
                      }}
                      style={{
                        width: '48px', height: '48px', objectFit: 'contain', borderRadius: '4px',
                        border: '2px solid #ddd', cursor: 'pointer', background: '#f5f5f5'
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
            {regenPanel?.index === idx && (
              <div style={{ marginTop: '8px', border: '2px solid #ff9800', borderRadius: '8px', padding: '10px', background: '#fffbf2' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '0.9em', color: '#e65100' }}>重產 #{idx + 1} · 選參考圖 + 補 prompt</strong>
                  <button className="btn btn-regen" style={{ padding: '2px 8px', fontSize: '0.8em' }} onClick={() => setRegenPanel(null)}>取消</button>
                </div>
                <div style={{ fontSize: '0.75em', color: '#666', marginBottom: '4px' }}>
                  點縮圖加入/移除參考（上限 10，選 {regenPanel.refIndexes.length}）。引用時用 <code>#N</code> = 下方編號。
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: '4px', maxHeight: '180px', overflowY: 'auto', marginBottom: '6px', padding: '4px', background: '#fff', border: '1px solid #eee', borderRadius: '4px' }}>
                  {rawCutImages.map((img, i) => {
                    if (!img || i === idx) return null
                    const selected = regenPanel.refIndexes.includes(i)
                    return (
                      <div
                        key={i}
                        onClick={() => toggleRegenRef(i)}
                        style={{ position: 'relative', cursor: 'pointer', border: selected ? '2px solid #ff9800' : '2px solid #ddd', borderRadius: '4px', overflow: 'hidden', aspectRatio: '1', background: '#fafafa' }}
                        title={`#${i + 1} ${descriptions[i]?.text || ''}`}
                      >
                        <img src={img} alt={`#${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        <span style={{ position: 'absolute', top: '1px', left: '1px', background: selected ? '#ff9800' : 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: '3px', padding: '0 3px', fontSize: '10px', fontWeight: 'bold' }}>{i + 1}</span>
                      </div>
                    )
                  })}
                </div>
                <textarea
                  value={regenPanel.extraPrompt}
                  onChange={(e) => setRegenPanel(prev => prev ? { ...prev, extraPrompt: e.target.value } : prev)}
                  placeholder="補充 prompt（可用 #2 #5 引用上方勾選的貼圖，例：follow #2 text box style, match #5 pose）"
                  rows={3}
                  style={{ width: '100%', fontSize: '0.85em', border: '1px solid #ddd', borderRadius: '4px', padding: '4px 6px', resize: 'vertical', marginBottom: '6px' }}
                />
                <button
                  className="btn btn-regen"
                  style={{ width: '100%', background: '#ff9800', color: '#fff', fontWeight: 'bold' }}
                  disabled={regeneratingIndex !== null || loading}
                  onClick={() => {
                    const opts = { refIndexes: regenPanel.refIndexes, extraPrompt: regenPanel.extraPrompt }
                    setRegenPanel(null)
                    handleRegenerateSingleSticker(idx, opts)
                  }}
                >
                  開始重產
                </button>
              </div>
            )}
            {cropAdjustTarget?.stickerIndex === idx && processedGridImages[cropAdjustTarget.gridIndex] && (
              <div style={{ marginTop: '8px', border: '2px solid #4CAF50', borderRadius: '8px', padding: '8px', background: '#f9f9f9' }}>
                <CropAdjustPanel
                  gridSrc={processedGridImages[cropAdjustTarget.gridIndex]}
                  cellRow={cropAdjustTarget.cellRow}
                  cellCol={cropAdjustTarget.cellCol}
                  cellW={stickerSpec.generateCell.w}
                  cellH={stickerSpec.generateCell.h}
                  initialOffset={cropAdjustTarget.prevOffset ? { x: cropAdjustTarget.prevOffset.x, y: cropAdjustTarget.prevOffset.y } : undefined}
                  initialZoom={cropAdjustTarget.prevOffset?.zoom}
                  onConfirm={(ox, oy, z) => handleCropAdjustConfirm(ox, oy, z)}
                  onCancel={() => setCropAdjustTarget(null)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
