import { useCallback } from 'react'

const STORAGE_KEY = 'stampmill_import_pipeline_v1'

/**
 * useImportPipelineStorage
 *
 * Handles localStorage persistence for ImportPipelinePage.
 * processedCells are intentionally NOT stored (too large, ~8MB).
 * On restore they are recomputed from uploadedGridImage + settings.
 */
export function useImportPipelineStorage() {
  const save = useCallback((data) => {
    try {
      const payload = {
        uploadedGridImage: data.uploadedGridImage ?? null,
        gridCols: data.gridCols,
        gridRows: data.gridRows,
        cellW: data.cellW,
        cellH: data.cellH,
        stickerTypeKey: data.stickerTypeKey,
        bgStrategy: data.bgStrategy,
        chromaKeyBgColor: data.chromaKeyBgColor,
        manualBgColor: data.manualBgColor,
        backgroundThreshold: data.backgroundThreshold,
        excludedCells: data.excludedCells,   // number[]
        mainImage: data.mainImage ?? null,
        tabImage: data.tabImage ?? null,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (err) {
      // Silently ignore — quota exceeded or private mode
      console.warn('[ImportPipeline] localStorage save failed:', err)
    }
  }, [])

  const load = useCallback(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }, [])

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  }, [])

  return { save, load, clear }
}
