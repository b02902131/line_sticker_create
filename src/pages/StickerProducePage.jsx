import React, { useEffect } from 'react'
import { STICKER_SPECS } from '../utils/stickerSpecs'
import { removeBackgroundSimple } from '../utils/imageUtils'
import { StickerPreviewGrid } from '../components/StickerPreviewGrid'
import TabCropper from '../components/TabCropper'
import { fileToDataURL } from '../utils/imageUtils'

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

export default function StickerProducePage({
  // navigation
  setPage,
  // character
  selectedCharacter,
  // count + sticker type
  count, setCount,
  stickerTypeKey, setStickerTypeKey,
  stickerSpec,
  // text style
  textStyle, setTextStyle,
  theme,
  apiKey,
  generatingTextStyle,
  handleGenerateTextStyle,
  // descriptions
  descriptions, setDescriptions,
  generatingDescriptions,
  excludedTexts, setExcludedTexts,
  characterStance, setCharacterStance,
  bulkText, setBulkText,
  handleImportBulkText,
  handleInitDescriptions,
  handleGenerateDescriptions,
  generatingSingle,
  generatingText, handleGenerateText,
  generatingDesc, handleGenerateDesc,
  batchGeneratingDesc, handleBatchGenerateDesc,
  handleDeleteDescription,
  handleUpdateDescription,
  handleExportDescriptions,
  dragIdx,
  handleDragStart2, handleDragOver2, handleDrop2,
  // grid state
  gridImages,
  processedGridImages, setProcessedGridImages,
  cutImages, setCutImages,
  rawCutImages, setRawCutImages,
  stickerHistory, setStickerHistory,
  stickerThresholds, setStickerThresholds,
  regeneratingGrid, removingBgGrid,
  recutGridIndex, recutting,
  gridRegenPanel, setGridRegenPanel,
  openGridRegenPanel, toggleGridRegenRef,
  cropAdjustTarget, setCropAdjustTarget,
  cropAdjustHistory, setCropAdjustHistory,
  multiCropAdjustTarget, setMultiCropAdjustTarget,
  preCutGridCellPreviews, setPreCutGridCellPreviews,
  preCutPanelOpen, setPreCutPanelOpen,
  preCutLoadingGridIndex, setPreCutLoadingGridIndex,
  getTotalStickerCount, getGridCount, getNextGridIndex,
  getStickerThreshold,
  hasAnyCropAdjustInRange, cropGridCellsWithAdjust,
  ensureGridCellsReady, ensureStickerReady, ensureArraySize,
  handleRegenerateGrid, handleRemoveBgGrid,
  handleRecutSingle, handleRecut,
  handleOpenCropAdjust, handleCropAdjustConfirm,
  handleOpenMultiCropAdjust,
  // sticker editor
  removingBgIndex, handleRemoveBgSingle,
  regeneratingIndex, regenPanel, setRegenPanel,
  openRegenPanel, toggleRegenRef,
  handleRegenerateSingleSticker,
  // single image editors (main + tab)
  mainImage, rawMainImage,
  mainThreshold, setMainThreshold,
  regeneratingMain, removingMainBg,
  mainCropSource, setMainCropSource,
  mainEditor,
  tabImage,
  tabThreshold, setTabThreshold,
  regeneratingTab, removingTabBg,
  tabCropSource, setTabCropSource,
  tabEditor,
  handleRemoveTabBg,
  // background
  backgroundThreshold, setBackgroundThreshold,
  chromaKeyBgColor, setChromaKeyBgColor,
  confirmEachGrid, setConfirmEachGrid,
  processingBackground, setProcessingBackground,
  previewBackgroundDark, setPreviewBackgroundDark,
  previewBgColor, setPreviewBgColor,
  PREVIEW_BG_COLORS,
  // progress / loading
  progress,
  loading,
  currentStep,
  // step handlers
  handleGenerateStickers,
  handleGenerateNextGrid,
  handleApplyBackgroundRemoval,
  handleSplitGrids,
  handleReapplyBackground,
  handleDownload,
  handleDownloadSingle,
  // click-remove
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
  // animation
  handleOpenGifModal,
  gifModal, setGifModal,
  gifSelectedFrames, setGifSelectedFrames,
  gifDelay, setGifDelay,
  gifGenerating, gifProgress, setGifProgress,
  handleToggleGifFrame, handleDownloadGif,
}) {
  return (
    <>
      <div className="step-section">
        <button className="btn btn-secondary btn-inline" onClick={() => setPage('home')} style={{ marginBottom: '15px' }}>
          ← 返回首頁
        </button>
        {selectedCharacter && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
            <img src={selectedCharacter.imageDataUrl} alt={selectedCharacter.name} style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
            <div>
              <h2 style={{ margin: 0 }}>{selectedCharacter.name}</h2>
              {selectedCharacter.theme && <p style={{ margin: '4px 0 0', color: '#666', fontSize: '14px' }}>{selectedCharacter.theme}</p>}
            </div>
          </div>
        )}
      </div>

      {/* 張數選擇 */}
      <div className="step-section">
        <h2>張數選擇</h2>
        <div className="form-group">
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="form-input"
          >
            <option value={8}>8 張</option>
            <option value={16}>16 張</option>
            <option value={24}>24 張</option>
            <option value={32}>32 張</option>
            <option value={40}>40 張</option>
          </select>
        </div>
      </div>

      {/* 文字風格描述 */}
      <div className="step-section">
        <h2>字體樣式風格描述</h2>
        <div className="form-group">
          <label>字體樣式風格描述（可選，不填寫則在生成文字描述時自動由 AI 生成）</label>
          <textarea
            value={textStyle}
            onChange={(e) => setTextStyle(e.target.value)}
            placeholder="例如：可愛簡潔的風格，文字清晰易讀，使用粗體字，文字框使用白色或黃色背景..."
            rows={3}
            className="form-input"
            disabled={generatingTextStyle}
          />
          <p className="form-hint">如果不填寫，系統會在生成文字描述時自動生成統一的字體樣式風格</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleGenerateTextStyle}
          disabled={generatingTextStyle || !apiKey || !theme.trim()}
        >
          {generatingTextStyle ? '生成中...' : textStyle ? '重新生成字體樣式風格' : '預覽 AI 生成的字體樣式風格'}
        </button>

        {textStyle && (
          <div className="text-style-preview">
            <h3>字體樣式風格：</h3>
            <p className="text-style-content">{textStyle}</p>
          </div>
        )}
      </div>

      {/* 文字描述 */}
      <div className="step-section">
        <h2>文字描述（可編輯）</h2>

      {/* 貼圖類型 */}
      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          貼圖類型：
        </label>
        <div style={{ display: 'flex', gap: '12px' }}>
          {Object.values(STICKER_SPECS).map(spec => (
            <label key={spec.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: stickerTypeKey === spec.key ? '2px solid #4a90e2' : '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', background: stickerTypeKey === spec.key ? '#eef5ff' : '#fff' }}>
              <input
                type="radio"
                name="stickerTypeKey"
                value={spec.key}
                checked={stickerTypeKey === spec.key}
                onChange={() => setStickerTypeKey(spec.key)}
              />
              <span>{spec.label}</span>
              <span style={{ color: '#888', fontSize: '12px' }}>({spec.cell.w}×{spec.cell.h})</span>
            </label>
          ))}
        </div>
        <p style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
          💡 一般貼圖為 370×320 長方形，表情貼為 180×180 正方形（採 2× 超採樣生成以確保品質）。
        </p>
      </div>

      {/* 角色立場描述 */}
      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label htmlFor="characterStance" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          角色立場描述（選填）：
        </label>
        <textarea
          id="characterStance"
          value={characterStance}
          onChange={(e) => setCharacterStance(e.target.value)}
          placeholder="例如：攀岩時非常厭世、語氣消極、愛吐槽"
          className="form-input"
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '10px',
            fontSize: '14px',
            fontFamily: 'inherit',
            border: '1px solid #ddd',
            borderRadius: '4px',
            resize: 'vertical'
          }}
        />
        <p style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
          💡 提示：描述角色立場或語氣（例如厭世、毒舌、溫暖鼓勵），會影響文字生成風格與用詞方向。
        </p>
      </div>

      {/* 排除文字輸入框 */}
      <div className="form-group" style={{ marginBottom: '20px' }}>
        <label htmlFor="excludedTexts" style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
          排除這些文字（選填，每行一個）：
        </label>
        <textarea
          id="excludedTexts"
          value={excludedTexts}
          onChange={(e) => setExcludedTexts(e.target.value)}
          placeholder={"每行一個，支援格式：\n歸心似箭：鮭魚在快速游泳\n同鮭魚盡\n你鮭我管\n\n冒號後為描述（選填），已存在的文字會自動跳過"}
          className="form-input"
          style={{
            width: '100%',
            minHeight: '100px',
            padding: '10px',
            fontSize: '14px',
            fontFamily: 'inherit',
            border: '1px solid #ddd',
            borderRadius: '4px',
            resize: 'vertical'
          }}
        />
        <p style={{ marginTop: '5px', fontSize: '12px', color: '#666' }}>
          💡 提示：輸入之前已使用的文字，生成時會自動排除這些文字，避免重複。適合延伸同一系列貼圖時使用。
        </p>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button
          className="btn btn-primary"
          onClick={() => { handleInitDescriptions(); handleGenerateDescriptions() }}
          disabled={generatingDescriptions || !apiKey}
        >
          {generatingDescriptions ? '生成中...' : `一鍵生成全部 ${count} 張描述`}
        </button>
        <button
          className="btn btn-secondary"
          onClick={handleInitDescriptions}
        >
          建立 {count} 張空白欄位（手動填寫）
        </button>
      </div>

      <div className="form-group" style={{ marginTop: '15px' }}>
        <label style={{ fontWeight: 'bold' }}>或貼上文字清單（每行一個，自動偵測張數）</label>
        <textarea
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={"每行一個，支援格式：\n歸心似箭：鮭魚在快速游泳\n同鮭魚盡\n你鮭我管\n\n冒號後為描述（選填），已存在的文字會自動跳過"}
          rows={4}
          className="form-input"
        />
        {bulkText.trim() && (
          <button
            className="btn btn-primary"
            onClick={handleImportBulkText}
            style={{ marginTop: '8px' }}
          >
            匯入（{bulkText.split('\n').map(l => l.replace(/^[-*]\s*\[[ x]?\]\s*/, '').trim()).filter(l => l).length} 張）
          </button>
        )}
      </div>

      {descriptions.length > 0 && (
        <div className="descriptions-editor">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>編輯描述和文字（共 {descriptions.length} 張）</h3>
            <button
              className="btn btn-secondary btn-inline"
              onClick={handleBatchGenerateDesc}
              disabled={batchGeneratingDesc !== null}
            >
              {batchGeneratingDesc !== null ? `補齊中 ${batchGeneratingDesc}...` : '補齊空白描述（跳過已填）'}
            </button>
            <button
              className="btn btn-secondary btn-inline"
              onClick={handleExportDescriptions}
            >
              匯出文字清單
            </button>
            <button
              className="btn btn-secondary btn-inline"
              onClick={() => { if (confirm('確定清空所有描述文字？')) setDescriptions([]) }}
              style={{ color: '#e74c3c' }}
            >
              清空全部
            </button>
          </div>
          {descriptions.map((item, index) => (
            <div
              key={index}
              className="description-item"
              style={{ position: 'relative', opacity: dragIdx === index ? 0.5 : 1 }}
              draggable
              onDragStart={() => handleDragStart2(index)}
              onDragOver={(e) => handleDragOver2(e, index)}
              onDrop={() => handleDrop2(index)}
              onDragEnd={() => { /* dragIdx managed by hook */ }}
            >
              <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ cursor: 'grab', fontSize: '16px', color: '#bbb', userSelect: 'none' }} title="拖拉排序">☰</span>
                <button
                  onClick={() => handleDeleteDescription(index)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '18px', color: '#999', padding: '4px 8px'
                  }}
                  title="刪除這張"
                >
                  &times;
                </button>
              </div>
              <div className="description-field">
                <label>文字 {index + 1}:</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={item.text}
                    onChange={(e) => handleUpdateDescription(index, 'text', e.target.value)}
                    placeholder="貼圖文字..."
                    className="form-input"
                    maxLength={10}
                    style={{ flex: 1, minWidth: 0 }}
                  />
                  <button
                    className="btn btn-secondary btn-inline"
                    onClick={() => handleGenerateText(index)}
                    disabled={generatingText !== null}
                  >
                    {generatingText === index ? '生成中...' : 'AI 生成文字'}
                  </button>
                </div>
              </div>
              <div className="description-field">
                <label>描述 {index + 1}:</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <textarea
                    value={item.description}
                    onChange={(e) => handleUpdateDescription(index, 'description', e.target.value)}
                    placeholder="圖片場景描述..."
                    className="form-input"
                    rows={2}
                    style={{ flex: 1, minWidth: 0, resize: 'vertical' }}
                  />
                  <button
                    className="btn btn-secondary btn-inline"
                    onClick={() => handleGenerateDesc(index)}
                    disabled={generatingDesc !== null}
                  >
                    {generatingDesc === index ? '生成中...' : 'AI 生成描述'}
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div className="form-group" style={{ marginTop: '6px' }}>
            <label>8 宮格背景色（chroma-key，會影響生成 + 去背）</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <input
                type="color"
                value={chromaKeyBgColor}
                onChange={(e) => setChromaKeyBgColor(e.target.value)}
                style={{ width: '44px', height: '36px', padding: 0, border: '1px solid #ddd', borderRadius: '6px' }}
                title="選擇 8 宮格底色（生成前先選好）"
              />
              <input
                type="text"
                value={chromaKeyBgColor.toUpperCase()}
                onChange={() => {}}
                readOnly
                className="form-input"
                style={{ width: '110px', fontFamily: 'monospace' }}
              />
              <span style={{ fontSize: '12px', color: '#999' }}>
                建議避開角色/文字常用色（例如純白、膚色、常見衣服色）
              </span>
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={handleGenerateStickers}
            disabled={loading}
          >
            {loading ? '生成中...' : (confirmEachGrid ? '逐組生成：先產一組' : '開始生成8宮格貼圖')}
          </button>
          <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={confirmEachGrid}
                onChange={(e) => setConfirmEachGrid(e.target.checked)}
              />
              <span style={{ fontSize: '14px', color: '#555' }}>逐組生成/確認（不要一次全產）</span>
            </label>
            <span style={{ fontSize: '12px', color: '#999' }}>
              開啟後每次只會生成 1 組八宮格，確認 OK 再生成下一組
            </span>
          </div>
        </div>
      )}
    </div>

    {/* 進度顯示 */}
    {progress && (
      <div className="progress">{progress}</div>
    )}

    {/* 去背調整 */}
    {processedGridImages.length > 0 && currentStep === 7 && (
      <div className="step-section">
        <h2>步驟 7: 調整去背程度</h2>
        <div className="form-group">
          <label>去背閾值（數值越小，去背越強；數值越大，保留越多背景）</label>
          <div className="threshold-control">
            <input
              type="range"
              min="0"
              max="255"
              value={backgroundThreshold}
              onChange={async (e) => {
                const newThreshold = Number(e.target.value)
                setBackgroundThreshold(newThreshold)
                setProcessingBackground(true)
                try {
                  const newProcessed = []
                  for (let i = 0; i < gridImages.length; i++) {
                    const processed = await removeBackgroundSimple(gridImages[i], newThreshold, null, { bgColor: chromaKeyBgColor })
                    newProcessed.push(processed)
                  }
                  setProcessedGridImages(newProcessed)
                } catch (error) {
                  console.error('去背處理失敗:', error)
                } finally {
                  setProcessingBackground(false)
                }
              }}
              className="threshold-slider"
            />
            <span className="threshold-value">{backgroundThreshold}</span>
          </div>
          <p className="threshold-hint">
            當前值：{backgroundThreshold}（建議範圍：200-255，預設：240）- 調整滑桿會即時預覽效果
          </p>
        </div>

        <div className="form-group">
          <label>8 宮格背景色（chroma-key）</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <input
              type="color"
              value={chromaKeyBgColor}
              onChange={async (e) => {
                const newColor = e.target.value
                setChromaKeyBgColor(newColor)
                setProcessingBackground(true)
                try {
                  const newProcessed = []
                  for (let i = 0; i < gridImages.length; i++) {
                    const processed = await removeBackgroundSimple(gridImages[i], backgroundThreshold, null, { bgColor: newColor })
                    newProcessed.push(processed)
                  }
                  setProcessedGridImages(newProcessed)
                } catch (error) {
                  console.error('去背處理失敗:', error)
                } finally {
                  setProcessingBackground(false)
                }
              }}
              style={{ width: '44px', height: '36px', padding: 0, border: '1px solid #ddd', borderRadius: '6px' }}
              title="選擇 8 宮格底色（需與生成時一致）"
            />
            <input
              type="text"
              value={chromaKeyBgColor.toUpperCase()}
              onChange={() => {}}
              readOnly
              className="form-input"
              style={{ width: '110px', fontFamily: 'monospace' }}
            />
            <span style={{ fontSize: '12px', color: '#999' }}>
              會影響「8 宮格」去背與後續單張補去背；主要圖/標籤圖不受影響
            </span>
          </div>
        </div>

        <button
          className="btn btn-primary"
          onClick={handleApplyBackgroundRemoval}
          disabled={processingBackground}
        >
          {processingBackground ? '處理中...' : '應用去背調整'}
        </button>

        {confirmEachGrid && (
          <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              onClick={handleGenerateNextGrid}
              disabled={loading || processingBackground || getNextGridIndex() >= getGridCount()}
              style={{ width: 'auto' }}
            >
              {gridImages.length >= getGridCount() ? '已生成完全部八宮格' : `生成下一組（目前 ${gridImages.length}/${getGridCount()}）`}
            </button>
            <span style={{ fontSize: '12px', color: '#999' }}>
              若這組不滿意，可用下方「單組重產」先調到滿意再繼續
            </span>
          </div>
        )}

        <div className="preview-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>去背後預覽（{processedGridImages.length} 張8宮格）</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', color: '#666', fontWeight: '500' }}>切換背景：</span>
              <button
                className="btn btn-secondary"
                onClick={() => setPreviewBackgroundDark(!previewBackgroundDark)}
                style={{
                  fontSize: '14px',
                  padding: '8px 16px',
                  width: 'auto',
                  minWidth: '140px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  backgroundColor: previewBackgroundDark ? '#2d2d2d' : '#f0f0f0',
                  color: previewBackgroundDark ? '#fff' : '#333',
                  border: previewBackgroundDark ? '2px solid #555' : '2px solid #ddd',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: '18px' }}>{previewBackgroundDark ? '🌙' : '☀️'}</span>
                <span>{previewBackgroundDark ? '深色背景' : '淺色背景'}</span>
              </button>
              <span style={{ fontSize: '12px', color: '#999', fontStyle: 'italic' }}>
                {previewBackgroundDark ? '（模擬 LINE 深色模式）' : '（模擬 LINE 淺色模式）'}
              </span>
            </div>
          </div>
          <div
            className="grid-preview"
            style={{
              backgroundColor: previewBackgroundDark ? '#1a1a1a' : '#ffffff',
              padding: '20px',
              borderRadius: '8px',
              transition: 'background-color 0.3s ease',
              border: previewBackgroundDark ? '2px solid #333' : '2px solid #e0e0e0'
            }}
          >
            {processedGridImages.map((img, idx) => (
              <div
                key={idx}
                className="grid-item"
                style={{
                  backgroundColor: previewBackgroundDark ? '#1a1a1a' : 'transparent',
                  padding: '10px',
                  borderRadius: '8px',
                  transition: 'background-color 0.3s ease',
                  position: 'relative'
                }}
              >
                <div
                  style={{
                    backgroundColor: previewBackgroundDark ? '#1a1a1a' : '#ffffff',
                    border: previewBackgroundDark ? '1px solid #444' : '2px solid #e0e0e0',
                    borderRadius: '4px',
                    padding: '0',
                    display: 'inline-block',
                    transition: 'all 0.3s ease',
                    overflow: 'hidden'
                  }}
                >
                  <img
                    src={img}
                    alt={`去背後 8宮格 ${idx + 1}`}
                    className="preview-image grid-image"
                    style={{
                      backgroundColor: previewBackgroundDark ? '#1a1a1a' : 'transparent',
                      display: 'block',
                      maxWidth: '100%',
                      height: 'auto',
                      mixBlendMode: previewBackgroundDark ? 'normal' : 'normal'
                    }}
                  />
                </div>
                <p style={{ marginTop: '8px', fontSize: '0.85em', color: previewBackgroundDark ? '#999' : '#6c757d', textAlign: 'center' }}>
                  8宮格 {idx + 1}
                </p>
              </div>
            ))}
          </div>
          <p style={{
            marginTop: '12px',
            fontSize: '13px',
            color: '#666',
            fontStyle: 'italic',
            textAlign: 'center',
            padding: '10px',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            💡 提示：切換到深色背景可以更好地檢查去背效果，因為 LINE 貼圖會在深色背景下使用。如果去背不完整，在深色背景下會更容易發現問題。
          </p>
        </div>

        {/* 裁切前單格工具（在八宮格階段就能對某一格做重產/去背/選去/微調/上傳） */}
        <div className="preview-group" style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>裁切前單張工具（{processedGridImages.length} 張8宮格）</h3>
            <div style={{ fontSize: '12px', color: '#777' }}>
              點「展開」後，每格會出現：重產 / 去背 / 選去 / 微調 / 上傳
            </div>
          </div>
          <div className="grid-preview" style={{ marginTop: '10px' }}>
            {processedGridImages.map((img, gridIdx) => {
              const open = !!preCutPanelOpen[gridIdx]
              const cellPreviews = preCutGridCellPreviews[gridIdx] || null
              const totalNeeded = descriptions.length || count
              const startIdx = gridIdx * 8
              const visibleCount = Math.max(0, Math.min(8, totalNeeded - startIdx))
              return (
                <div key={`precut-${gridIdx}`} className="grid-item" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={img} alt={`裁切前單格 8宮格 ${gridIdx + 1}`} className="preview-image grid-image" style={{ background: previewBgColor }} />
                      <div>
                        <div style={{ fontWeight: 'bold' }}>8宮格 {gridIdx + 1}</div>
                        <div style={{ fontSize: '12px', color: '#777' }}>單張範圍：#{startIdx + 1} - #{startIdx + visibleCount}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        className="btn btn-secondary btn-inline"
                        disabled={preCutLoadingGridIndex !== null || visibleCount === 0}
                        onClick={async () => {
                          setPreCutPanelOpen(prev => ({ ...prev, [gridIdx]: !open }))
                          if (open) return
                          if (preCutGridCellPreviews[gridIdx]) return
                          setPreCutLoadingGridIndex(gridIdx)
                          try {
                            await ensureGridCellsReady(gridIdx, { alsoCachePreviews: true })
                          } catch (e) {
                            alert('載入單格預覽失敗: ' + e.message)
                          } finally {
                            setPreCutLoadingGridIndex(null)
                          }
                        }}
                      >
                        {preCutLoadingGridIndex === gridIdx ? '載入中...' : (open ? '收合' : '展開')}
                      </button>
                      <button
                        className="btn btn-secondary btn-inline"
                        disabled={preCutLoadingGridIndex !== null || visibleCount === 0}
                        title="在八宮格上一次調整 8 個裁切筐（可複選移動/縮放）"
                        onClick={() => handleOpenMultiCropAdjust(gridIdx)}
                      >
                        批次微調
                      </button>
                    </div>
                  </div>

                  {open && (
                    <div style={{ marginTop: '10px', border: '1px solid #eee', borderRadius: '8px', padding: '10px', background: '#fff' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: '10px' }}>
                        {Array.from({ length: visibleCount }).map((_, cellIdx) => {
                          const stickerIndex = startIdx + cellIdx
                          const thumb = cellPreviews?.[cellIdx] || null
                          return (
                            <div key={`precut-cell-${stickerIndex}`} style={{ border: '1px solid #f0f0f0', borderRadius: '8px', padding: '8px', background: '#fafafa' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <strong style={{ fontSize: '12px' }}>#{stickerIndex + 1}</strong>
                                <span style={{ fontSize: '11px', color: '#888' }}>{descriptions[stickerIndex]?.text || ''}</span>
                              </div>
                              <div style={{ width: '100%', aspectRatio: '1', background: '#fff', borderRadius: '6px', border: '1px solid #eee', overflow: 'hidden', marginBottom: '6px' }}>
                                {thumb ? (
                                  <img src={thumb} alt={`#${stickerIndex + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain', background: previewBgColor }} />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#999' }}>預覽準備中</div>
                                )}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                                <button
                                  className="btn btn-regen"
                                  disabled={regeneratingIndex !== null || loading}
                                  title="重新生成（選參考圖 + 自訂 prompt）"
                                  onClick={async () => {
                                    try {
                                      await ensureGridCellsReady(gridIdx)
                                      openRegenPanel(stickerIndex)
                                    } catch (e) {
                                      alert('準備單張資料失敗: ' + e.message)
                                    }
                                  }}
                                >重產</button>
                                <button
                                  className="btn btn-regen"
                                  disabled={removingBgIndex !== null || loading}
                                  title="自動去背（單張）"
                                  onClick={async () => {
                                    try {
                                      await ensureStickerReady(stickerIndex)
                                      await handleRemoveBgSingle(stickerIndex)
                                    } catch (e) {
                                      alert('單張去背失敗: ' + e.message)
                                    }
                                  }}
                                >去背</button>
                                <button
                                  className="btn btn-regen"
                                  title="點擊指定區域去背（單張）"
                                  onClick={async () => {
                                    try {
                                      await ensureStickerReady(stickerIndex)
                                      setClickRemoveUndoStack([])
                                      setPickedColor(null)
                                      setClickRemoveTarget({ index: stickerIndex, type: 'sticker' })
                                    } catch (e) {
                                      alert('準備選去失敗: ' + e.message)
                                    }
                                  }}
                                >選去</button>
                                <button
                                  className="btn btn-regen"
                                  title="微調裁切位置"
                                  onClick={async () => {
                                    try {
                                      await ensureGridCellsReady(gridIdx)
                                      handleOpenCropAdjust(stickerIndex)
                                    } catch (e) {
                                      alert('開啟微調失敗: ' + e.message)
                                    }
                                  }}
                                >微調</button>
                                <label className="btn btn-regen" style={{ cursor: 'pointer', textAlign: 'center' }} title="上傳替換圖片">
                                  上傳
                                  <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                      try {
                                        const file = e.target.files?.[0]
                                        if (!file) return
                                        const dataUrl = await fileToDataURL(file)
                                        const totalNeeded2 = descriptions.length || count
                                        setRawCutImages(prev => {
                                          const u = ensureArraySize(prev, totalNeeded2)
                                          u[stickerIndex] = dataUrl
                                          return u
                                        })
                                        setCutImages(prev => {
                                          const u = ensureArraySize(prev, totalNeeded2)
                                          u[stickerIndex] = dataUrl
                                          return u
                                        })
                                      } finally {
                                        e.target.value = ''
                                      }
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <button
          className="btn btn-success"
          onClick={handleSplitGrids}
          disabled={loading || processingBackground}
        >
          {loading ? '處理中...' : '下一步：進行裁切'}
        </button>
      </div>
    )}

    {/* 步驟 8-9: 預覽結果 */}
    {cutImages.length > 0 && currentStep >= 8 && (
      <div className="step-section">
        <h2>{currentStep === 9 ? '步驟 9: 完成並下載' : '步驟 8: 裁切完成'}</h2>

        {/* 去背閾值 + 背景色預覽 */}
        <div className="preview-group">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '10px' }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#666', whiteSpace: 'nowrap' }}>去背閾值：</span>
            <div className="threshold-control" style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="range"
                min="0"
                max="255"
                value={backgroundThreshold}
                onChange={(e) => setBackgroundThreshold(Number(e.target.value))}
                className="threshold-slider"
              />
              <span className="threshold-value">{backgroundThreshold}</span>
            </div>
            <button
              className="btn btn-primary"
              onClick={handleReapplyBackground}
              disabled={processingBackground}
              style={{ whiteSpace: 'nowrap' }}
            >
              {processingBackground ? '處理中...' : '全部重新去背'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#666' }}>預覽背景：</span>
            {PREVIEW_BG_COLORS.map(bg => (
              <button
                key={bg.color}
                onClick={() => setPreviewBgColor(bg.color)}
                style={{
                  width: '32px',
                  height: '32px',
                  backgroundColor: bg.color,
                  border: previewBgColor === bg.color ? '3px solid #4CAF50' : `2px solid ${bg.border}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  padding: 0,
                }}
                title={bg.label}
              />
            ))}
          </div>
        </div>

        {/* 主要圖片和標籤圖片 */}
        {(mainImage || tabImage) && (
          <div className="preview-group">
            <h3>主要圖片和標籤圖片</h3>
            <div className="main-tab-preview">
              {mainImage && (
                <div className="preview-item">
                  <h4>主要圖片 (240×240)</h4>
                  <img src={mainImage} alt="主要圖片" className="preview-image main-image" style={{ background: previewBgColor }} />
                  <button
                    className="btn btn-secondary btn-inline"
                    style={{ marginTop: '6px' }}
                    disabled={loading || regeneratingMain}
                    onClick={mainEditor.regenerate}
                  >{regeneratingMain ? '生成中...' : '重產'}</button>
                  <button
                    className="btn btn-secondary btn-inline"
                    style={{ marginTop: '6px' }}
                    disabled={loading || removingMainBg}
                    onClick={mainEditor.removeBg}
                  >{removingMainBg ? '處理中...' : '去背'}</button>
                  <button
                    className="btn btn-secondary btn-inline"
                    style={{ marginTop: '6px' }}
                    onClick={() => setMainCropSource('pick')}
                  >從圖片選擇</button>
                  <label
                    className="btn btn-secondary btn-inline"
                    style={{ marginTop: '6px', cursor: 'pointer', textAlign: 'center' }}
                  >
                    上傳
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={mainEditor.handleUpload}
                    />
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', width: '100%' }}>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={mainThreshold ?? backgroundThreshold}
                      onChange={(e) => setMainThreshold(Number(e.target.value))}
                      style={{ flex: 1, height: '4px' }}
                    />
                    <span style={{ fontSize: '11px', color: '#999', minWidth: '24px' }}>{mainThreshold ?? backgroundThreshold}</span>
                  </div>
                </div>
              )}
              {tabImage && (
                <div className="preview-item">
                  <h4>標籤圖片 (96×74)</h4>
                  <img src={tabImage} alt="標籤圖片" className="preview-image tab-image" style={{ background: previewBgColor }} />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <button
                      className="btn btn-secondary btn-inline"
                      disabled={loading || regeneratingTab}
                      onClick={tabEditor.regenerate}
                    >{regeneratingTab ? '生成中...' : '重產'}</button>
                    <button
                      className="btn btn-secondary btn-inline"
                      onClick={() => setTabCropSource('pick')}
                    >從圖片選擇</button>
                    <button
                      className="btn btn-secondary btn-inline"
                      disabled={removingTabBg}
                      onClick={handleRemoveTabBg}
                    >{removingTabBg ? '處理中...' : '去背'}</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', width: '100%' }}>
                    <input
                      type="range"
                      min="0"
                      max="255"
                      value={tabThreshold ?? backgroundThreshold}
                      onChange={(e) => setTabThreshold(Number(e.target.value))}
                      style={{ flex: 1, height: '4px' }}
                    />
                    <span style={{ fontSize: '11px', color: '#999', minWidth: '24px' }}>{tabThreshold ?? backgroundThreshold}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 主要圖片裁切 */}
        {mainCropSource && (
          <div className="preview-group" style={{ border: '2px solid #2196F3', padding: '15px', borderRadius: '8px' }}>
            {mainCropSource === 'pick' ? (
              <>
                <h3>選擇圖片來源（主要圖片）</h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {selectedCharacter?.imageDataUrl && (
                    <div style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => setMainCropSource(selectedCharacter.imageDataUrl)}>
                      <img src={selectedCharacter.imageDataUrl} alt="角色圖" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                      <p style={{ fontSize: '12px', margin: '4px 0 0' }}>角色圖</p>
                    </div>
                  )}
                  {gridImages.map((img, i) => (
                    <div key={i} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => setMainCropSource(img)}>
                      <img src={img} alt={`八宮格 ${i + 1}`} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                      <p style={{ fontSize: '12px', margin: '4px 0 0' }}>八宮格 {i + 1}</p>
                    </div>
                  ))}
                  {cutImages.map((img, i) => (
                    <div key={`cut-${i}`} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => setMainCropSource(img)}>
                      <img src={img} alt={`貼圖 ${i + 1}`} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                      <p style={{ fontSize: '12px', margin: '4px 0 0' }}>貼圖 {i + 1}</p>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary btn-inline" style={{ marginTop: '10px' }} onClick={() => setMainCropSource(null)}>取消</button>
              </>
            ) : (
              <TabCropper
                imageDataUrl={mainCropSource}
                targetWidth={240}
                targetHeight={240}
                title="裁切主要圖片"
                onConfirm={mainEditor.handleCropConfirm}
                onCancel={mainEditor.handleCropCancel}
              />
            )}
          </div>
        )}

        {tabCropSource && (
          <div className="preview-group" style={{ border: '2px solid #4CAF50', padding: '15px', borderRadius: '8px' }}>
            {tabCropSource === 'pick' ? (
              <>
                <h3>選擇圖片來源</h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {selectedCharacter?.imageDataUrl && (
                    <div style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => { setTabCropSource(selectedCharacter.imageDataUrl); }}>
                      <img src={selectedCharacter.imageDataUrl} alt="角色圖" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                      <p style={{ fontSize: '12px', margin: '4px 0 0' }}>角色圖</p>
                    </div>
                  )}
                  {mainImage && (
                    <div style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => { setTabCropSource(mainImage); }}>
                      <img src={mainImage} alt="主要圖片" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                      <p style={{ fontSize: '12px', margin: '4px 0 0' }}>主要圖片</p>
                    </div>
                  )}
                  {gridImages.map((img, i) => (
                    <div key={i} style={{ cursor: 'pointer', textAlign: 'center' }} onClick={() => { setTabCropSource(img); }}>
                      <img src={img} alt={`八宮格 ${i + 1}`} style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '6px', border: '2px solid #ddd' }} />
                      <p style={{ fontSize: '12px', margin: '4px 0 0' }}>八宮格 {i + 1}</p>
                    </div>
                  ))}
                </div>
                <button className="btn btn-secondary btn-inline" style={{ marginTop: '10px' }} onClick={() => setTabCropSource(null)}>取消</button>
              </>
            ) : (
              <TabCropper
                imageDataUrl={tabCropSource}
                onConfirm={tabEditor.handleCropConfirm}
                onCancel={tabEditor.handleCropCancel}
              />
            )}
          </div>
        )}

        {/* 8宮格預覽 */}
        {gridImages.length > 0 && (
          <div className="preview-group">
            <h3>8宮格圖片（{gridImages.length} 張）</h3>
            <div className="grid-preview">
              {gridImages.map((img, idx) => (
                <div key={idx} className="grid-item">
                  <img src={processedGridImages[idx] || img} alt={`8宮格 ${idx + 1}`} className="preview-image grid-image" style={{ background: previewBgColor }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: '4px' }}>
                    <button
                      className="btn btn-regen"
                      onClick={() => openGridRegenPanel(idx)}
                      disabled={regeneratingGrid !== null || loading}
                      title="重新生成（選參考八宮格）"
                    >
                      {regeneratingGrid === idx ? '...' : '重產'}
                    </button>
                    <button
                      className="btn btn-regen"
                      onClick={() => handleRemoveBgGrid(idx)}
                      disabled={removingBgGrid !== null || loading}
                    >
                      {removingBgGrid === idx ? '...' : '去背'}
                    </button>
                    <button
                      className="btn btn-regen"
                      onClick={() => { setClickRemoveUndoStack([]); setPickedColor(null); setClickRemoveTarget({ index: idx, type: 'grid' }) }}
                    >
                      選去
                    </button>
                    <button
                      className="btn btn-regen"
                      onClick={() => handleOpenMultiCropAdjust(idx)}
                      disabled={preCutLoadingGridIndex !== null}
                      title="在八宮格上一次調整 8 個裁切筐（可複選移動/縮放）"
                    >
                      批次微調
                    </button>
                    <button
                      className="btn btn-regen"
                      onClick={() => handleRecutSingle(idx)}
                      disabled={recutGridIndex !== null || cutImages.length === 0}
                    >
                      {recutGridIndex === idx ? '...' : '裁切'}
                    </button>
                  </div>
                  {gridRegenPanel?.gridIndex === idx && (
                    <div style={{ marginTop: '8px', border: '2px solid #ff9800', borderRadius: '8px', padding: '10px', background: '#fffbf2' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <strong style={{ fontSize: '0.9em', color: '#e65100' }}>重產 八宮格 {idx + 1} · 選參考八宮格</strong>
                        <button className="btn btn-regen" style={{ padding: '2px 8px', fontSize: '0.8em' }} onClick={() => setGridRegenPanel(null)}>取消</button>
                      </div>
                      <div style={{ fontSize: '0.75em', color: '#666', marginBottom: '4px' }}>
                        點縮圖加入/移除參考（上限 10，選 {gridRegenPanel.refGridIndexes.length}）。
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: '4px', maxHeight: '220px', overflowY: 'auto', marginBottom: '6px', padding: '4px', background: '#fff', border: '1px solid #eee', borderRadius: '4px' }}>
                        {gridImages.map((g, gi) => {
                          if (!g || gi === idx) return null
                          const selected = gridRegenPanel.refGridIndexes.includes(gi)
                          const thumb = processedGridImages[gi] || g
                          return (
                            <div
                              key={gi}
                              onClick={() => toggleGridRegenRef(gi)}
                              style={{ position: 'relative', cursor: 'pointer', border: selected ? '2px solid #ff9800' : '2px solid #ddd', borderRadius: '6px', overflow: 'hidden', background: '#fafafa' }}
                              title={`八宮格 ${gi + 1}`}
                            >
                              <img src={thumb} alt={`八宮格 ${gi + 1}`} style={{ width: '100%', height: '72px', objectFit: 'cover' }} />
                              <span style={{ position: 'absolute', top: '1px', left: '1px', background: selected ? '#ff9800' : 'rgba(0,0,0,0.55)', color: '#fff', borderRadius: '3px', padding: '0 4px', fontSize: '10px', fontWeight: 'bold' }}>{gi + 1}</span>
                            </div>
                          )
                        })}
                      </div>
                      <button
                        className="btn btn-regen"
                        style={{ width: '100%', background: '#ff9800', color: '#fff', fontWeight: 'bold' }}
                        disabled={regeneratingGrid !== null || loading}
                        onClick={() => {
                          const opts = { refGridIndexes: gridRegenPanel.refGridIndexes }
                          setGridRegenPanel(null)
                          handleRegenerateGrid(idx, opts)
                        }}
                      >
                        開始重產
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {cutImages.length > 0 && (
              <button
                className="btn btn-primary"
                style={{ marginTop: '10px', width: '100%' }}
                disabled={recutting}
                onClick={handleRecut}
              >{recutting ? '裁切中...' : '重新裁切'}</button>
            )}
          </div>
        )}

        {/* 裁切後的單張預覽 */}
        <StickerPreviewGrid
          cutImages={cutImages}
          rawCutImages={rawCutImages}
          setRawCutImages={setRawCutImages}
          setCutImages={setCutImages}
          descriptions={descriptions}
          setDescriptions={setDescriptions}
          stickerHistory={stickerHistory}
          setStickerHistory={setStickerHistory}
          stickerSpec={stickerSpec}
          previewBgColor={previewBgColor}
          getStickerThreshold={getStickerThreshold}
          setStickerThresholds={setStickerThresholds}
          removingBgIndex={removingBgIndex}
          regeneratingIndex={regeneratingIndex}
          loading={loading}
          regenPanel={regenPanel}
          setRegenPanel={setRegenPanel}
          openRegenPanel={openRegenPanel}
          toggleRegenRef={toggleRegenRef}
          handleRegenerateSingleSticker={handleRegenerateSingleSticker}
          handleRemoveBgSingle={handleRemoveBgSingle}
          handleOpenCropAdjust={handleOpenCropAdjust}
          setClickRemoveUndoStack={setClickRemoveUndoStack}
          setPickedColor={setPickedColor}
          setClickRemoveTarget={setClickRemoveTarget}
          cropAdjustTarget={cropAdjustTarget}
          processedGridImages={processedGridImages}
          handleCropAdjustConfirm={handleCropAdjustConfirm}
          setCropAdjustTarget={setCropAdjustTarget}
          handleDownloadSingle={handleDownloadSingle}
        />

        {/* 下載按鈕 - 只在步驟 9 顯示 */}
        {currentStep === 9 && (stickerSpec.hasMain ? mainImage : true) && (stickerSpec.hasTab ? tabImage : true) && (
          <div className="download-section">
            <button
              className="btn btn-download"
              onClick={handleDownload}
              disabled={loading}
            >
              {loading ? '打包中...' : '打包下載 ZIP'}
            </button>
            <p className="download-hint">
              將下載包含 {cutImages.length} 張貼圖、1 張主要圖片和 1 張標籤圖片的 ZIP 檔案
            </p>
            {cutImages.filter(Boolean).length >= 2 && (
              <button
                className="btn"
                style={{ marginTop: '10px', background: '#7c4dff', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '1em', fontWeight: 'bold' }}
                onClick={handleOpenGifModal}
                disabled={loading}
              >
                製作動圖 (APNG)
              </button>
            )}
          </div>
        )}

        {/* 動圖製作 Modal */}
        {gifModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 12px', color: '#333' }}>製作動圖 (APNG)</h3>
              <p style={{ fontSize: '0.85em', color: '#666', margin: '0 0 12px' }}>
                選擇要加入動圖的貼圖幀，設定播放速度後下載。輸出為 APNG（320×270px），符合 LINE 動態貼圖規格，最多 20 幀。
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: '6px', marginBottom: '16px', maxHeight: '240px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px', padding: '8px' }}>
                {cutImages.map((img, i) => {
                  if (!img) return null
                  const selected = gifSelectedFrames.includes(i)
                  const order = gifSelectedFrames.indexOf(i)
                  return (
                    <div
                      key={i}
                      onClick={() => handleToggleGifFrame(i)}
                      style={{ position: 'relative', cursor: 'pointer', borderRadius: '6px', overflow: 'hidden', border: selected ? '2px solid #7c4dff' : '2px solid #ddd', aspectRatio: '1', background: '#f5f5f5' }}
                      title={`幀 ${i + 1}`}
                    >
                      <img src={img} alt={`幀${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      {selected ? (
                        <span style={{ position: 'absolute', top: '2px', left: '2px', background: '#7c4dff', color: '#fff', borderRadius: '10px', padding: '0 4px', fontSize: '10px', fontWeight: 'bold', lineHeight: '16px' }}>{order + 1}</span>
                      ) : (
                        <span style={{ position: 'absolute', top: '2px', left: '2px', background: 'rgba(0,0,0,0.4)', color: '#fff', borderRadius: '10px', padding: '0 4px', fontSize: '10px', lineHeight: '16px' }}>{i + 1}</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <p style={{ fontSize: '0.8em', color: '#999', margin: '-8px 0 14px' }}>已選 {gifSelectedFrames.length} 幀，點擊縮圖選取/取消，數字為播放順序</p>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button style={{ fontSize: '0.85em', padding: '4px 12px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }} onClick={() => setGifSelectedFrames(cutImages.map((img, i) => img ? i : null).filter(i => i !== null))}>全選</button>
                <button style={{ fontSize: '0.85em', padding: '4px 12px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '6px', cursor: 'pointer' }} onClick={() => setGifSelectedFrames([])}>清空</button>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.9em', color: '#555', display: 'block', marginBottom: '6px' }}>
                  每幀時間：{(gifDelay / 100).toFixed(2)} 秒
                </label>
                <input type="range" min="10" max="300" step="10" value={gifDelay} onChange={e => setGifDelay(Number(e.target.value))} style={{ width: '100%' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', color: '#999' }}>
                  <span>快（0.1s）</span><span>慢（3s）</span>
                </div>
              </div>
              {gifProgress && (
                <p style={{ fontSize: '0.85em', color: '#7c4dff', margin: '0 0 10px', textAlign: 'center' }}>{gifProgress}</p>
              )}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  style={{ flex: 1, background: '#7c4dff', color: '#fff', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontSize: '1em', fontWeight: 'bold', opacity: gifGenerating ? 0.6 : 1 }}
                  onClick={handleDownloadGif}
                  disabled={gifGenerating || gifSelectedFrames.length === 0}
                >{gifGenerating ? '製作中...' : '下載 APNG'}</button>
                <button
                  style={{ padding: '10px 18px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '8px', cursor: 'pointer', fontSize: '1em' }}
                  onClick={() => { setGifModal(false); setGifProgress('') }}
                  disabled={gifGenerating}
                >取消</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )}

    {/* 點擊去背 Modal */}
    {clickRemoveTarget && (
      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}
        onClick={(e) => { if (e.target === e.currentTarget) setClickRemoveTarget(null) }}
      >
        <div style={{
          background: '#fff', borderRadius: '12px', padding: '20px',
          maxWidth: '95vw', maxHeight: '90vh', width: '95vw',
          display: 'flex', gap: '16px', overflow: 'hidden',
        }}>
          {/* 左側控制面板 */}
          <div style={{
            width: '280px', minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '10px',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>選去</h3>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  disabled={clickRemoveUndoStack.length === 0}
                  onClick={handleClickRemoveUndo}
                >復原</button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                  onClick={() => setClickRemoveTarget(null)}
                >關閉</button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                className={`btn ${clickRemoveMode === 'flood' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '12px', padding: '4px 10px', flex: 1 }}
                onClick={() => { setClickRemoveMode('flood'); setPickedColor(null) }}
              >區域擴散</button>
              <button
                className={`btn ${clickRemoveMode === 'color' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '12px', padding: '4px 10px', flex: 1 }}
                onClick={() => { setClickRemoveMode('color'); setPickedColor(null) }}
              >吸色去除</button>
            </div>

            <div>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>容差：{clickRemoveThreshold}</div>
              <input
                type="range" min="1" max="120"
                value={clickRemoveThreshold}
                onChange={(e) => setClickRemoveThreshold(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', color: '#666' }}>去背閾值：
                  {clickRemoveTarget?.type === 'sticker' ? getStickerThreshold(clickRemoveTarget.index)
                    : clickRemoveTarget?.type === 'grid' ? backgroundThreshold
                    : clickRemoveTarget?.type === 'main' ? (mainThreshold ?? backgroundThreshold)
                    : (tabThreshold ?? backgroundThreshold)}
                </span>
              </div>
              <input
                type="range" min="0" max="255"
                value={clickRemoveTarget?.type === 'sticker' ? getStickerThreshold(clickRemoveTarget.index)
                  : clickRemoveTarget?.type === 'grid' ? backgroundThreshold
                  : clickRemoveTarget?.type === 'main' ? (mainThreshold ?? backgroundThreshold)
                  : (tabThreshold ?? backgroundThreshold)}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  if (clickRemoveTarget?.type === 'sticker') {
                    setStickerThresholds(prev => ({ ...prev, [clickRemoveTarget.index]: val }))
                  } else if (clickRemoveTarget?.type === 'grid') {
                    setBackgroundThreshold(val)
                  } else if (clickRemoveTarget?.type === 'main') {
                    setMainThreshold(val)
                  } else {
                    setTabThreshold(val)
                  }
                }}
                style={{ width: '100%' }}
              />
              <button
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '4px 10px', marginTop: '6px', width: '100%' }}
                onClick={async () => {
                  const t = clickRemoveTarget.type
                  const source = t === 'sticker' ? (rawCutImages[clickRemoveTarget.index] || cutImages[clickRemoveTarget.index])
                    : t === 'grid' ? gridImages[clickRemoveTarget.index]
                    : t === 'main' ? (rawMainImage || mainImage)
                    : (rawTabImage || tabImage)
                  const threshold = t === 'sticker' ? getStickerThreshold(clickRemoveTarget.index)
                    : t === 'grid' ? backgroundThreshold
                    : t === 'main' ? (mainThreshold ?? backgroundThreshold)
                    : (tabThreshold ?? backgroundThreshold)
                  try {
                    const result = await removeBackgroundSimple(source, threshold, null)
                    applyResult(result)
                  } catch (err) { alert('去背失敗: ' + err.message) }
                }}
              >全圖去背</button>
            </div>

            <div>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>背景：</div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {PREVIEW_BG_COLORS.map(bg => (
                  <button
                    key={bg.color}
                    onClick={() => setPreviewBgColor(bg.color)}
                    style={{
                      width: '28px', height: '28px',
                      backgroundColor: bg.color,
                      border: previewBgColor === bg.color ? '3px solid #4CAF50' : `2px solid ${bg.border}`,
                      borderRadius: '4px', cursor: 'pointer', padding: 0,
                    }}
                    title={bg.label}
                  />
                ))}
              </div>
            </div>

            <p style={{ fontSize: '12px', color: '#888', margin: 0 }}>
              {clickRemoveMode === 'flood'
                ? '點擊圖片，從該處往外擴散移除相近色。'
                : !pickedColor
                  ? '步驟 1：點擊圖片吸取顏色。'
                  : '步驟 2：拖曳框選去除範圍。'}
            </p>

            {clickRemoveMode === 'color' && pickedColor && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '4px',
                  backgroundColor: `rgb(${pickedColor.r},${pickedColor.g},${pickedColor.b})`,
                  border: '2px solid #333',
                }} />
                <span style={{ fontSize: '12px', color: '#999' }}>
                  rgb({pickedColor.r}, {pickedColor.g}, {pickedColor.b})
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '3px 8px' }}
                  onClick={() => { setPickedColor(null); setColorRectStart(null); setColorRectEnd(null) }}
                >重新吸色</button>
              </div>
            )}
          </div>

          {/* 右側圖片區域 */}
          <div
            style={{
              flex: 1, position: 'relative', overflow: 'hidden', cursor: 'crosshair',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseMove={(e) => {
              if (clickRemoveMode === 'flood' || (clickRemoveMode === 'color' && !pickedColor)) {
                const lens = clickRemoveLensRef.current
                const canvas = clickRemoveCanvasRef.current
                const container = e.currentTarget
                if (!lens || !canvas) return
                const canvasRect = canvas.getBoundingClientRect()
                const containerRect = container.getBoundingClientRect()
                const x = e.clientX - canvasRect.left
                const y = e.clientY - canvasRect.top
                if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) {
                  lens.style.display = 'none'
                  return
                }
                lens.style.display = 'block'
                const lensSize = 120
                const zoom = 4
                const offsetX = canvasRect.left - containerRect.left
                const offsetY = canvasRect.top - containerRect.top
                lens.style.left = `${x + offsetX - lensSize / 2}px`
                lens.style.top = `${y + offsetY - lensSize / 2}px`
                lens.style.width = `${lensSize}px`
                lens.style.height = `${lensSize}px`
                const bgW = canvasRect.width * zoom
                const bgH = canvasRect.height * zoom
                lens.style.backgroundSize = `${bgW}px ${bgH}px`
                lens.style.backgroundPosition = `-${x * zoom - lensSize / 2}px -${y * zoom - lensSize / 2}px`
              } else {
                if (clickRemoveLensRef.current) clickRemoveLensRef.current.style.display = 'none'
              }
              if (clickRemoveMode === 'color' && pickedColor) {
                handleColorRectMouseMove(e)
              }
            }}
            onMouseLeave={() => {
              if (clickRemoveLensRef.current) clickRemoveLensRef.current.style.display = 'none'
            }}
            onMouseDown={(e) => {
              if (clickRemoveMode === 'color' && pickedColor) handleColorRectMouseDown(e)
            }}
            onMouseUp={() => {
              if (clickRemoveMode === 'color' && pickedColor) handleColorRectMouseUp()
            }}
          >
            <ClickRemoveCanvas
              canvasRef={clickRemoveCanvasRef}
              src={getClickRemoveSource()}
              bgColor={previewBgColor}
              onClick={clickRemoveMode === 'flood' ? handleClickRemoveFlood
                : (!pickedColor ? handleColorPick : undefined)}
            />
            <div
              ref={clickRemoveLensRef}
              style={{
                display: 'none', position: 'absolute', pointerEvents: 'none',
                border: '2px solid #4CAF50', borderRadius: '50%',
                backgroundImage: `url(${getClickRemoveSource()})`,
                backgroundRepeat: 'no-repeat',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            />
            {colorRectStart && colorRectEnd && isDraggingRect && (() => {
              const canvas = clickRemoveCanvasRef.current
              const container = canvas?.parentElement
              if (!canvas || !container) return null
              const canvasRect = canvas.getBoundingClientRect()
              const containerRect = container.getBoundingClientRect()
              const sx = canvas.width / canvasRect.width
              const sy = canvas.height / canvasRect.height
              const offsetX = canvasRect.left - containerRect.left
              const offsetY = canvasRect.top - containerRect.top
              const left = Math.min(colorRectStart.x, colorRectEnd.x) / sx + offsetX
              const top = Math.min(colorRectStart.y, colorRectEnd.y) / sy + offsetY
              const width = Math.abs(colorRectEnd.x - colorRectStart.x) / sx
              const height = Math.abs(colorRectEnd.y - colorRectStart.y) / sy
              return (
                <div style={{
                  position: 'absolute', left, top, width, height,
                  border: '2px dashed #4CAF50', backgroundColor: 'rgba(76,175,80,0.15)',
                  pointerEvents: 'none',
                }} />
              )
            })()}
          </div>
        </div>
      </div>
    )}
    </>
  )
}
