import { useCallback } from 'react'

const DB_NAME = 'stampmill'
const STORE = 'import_pipeline'
const KEY = 'v1'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE)
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

export function useImportPipelineStorage() {
  const save = useCallback(async (data) => {
    try {
      const db = await openDB()
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
        excludedCells: data.excludedCells,
        mainImage: data.mainImage ?? null,
        tabImage: data.tabImage ?? null,
      }
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const req = tx.objectStore(STORE).put(payload, KEY)
        req.onsuccess = resolve
        req.onerror = () => reject(req.error)
      })
    } catch (err) {
      console.warn('[ImportPipeline] IndexedDB save failed:', err)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const db = await openDB()
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(KEY)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => reject(req.error)
      })
    } catch {
      return null
    }
  }, [])

  const clear = useCallback(async () => {
    try {
      const db = await openDB()
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const req = tx.objectStore(STORE).delete(KEY)
        req.onsuccess = resolve
        req.onerror = () => reject(req.error)
      })
    } catch {
      // ignore
    }
  }, [])

  return { save, load, clear }
}
