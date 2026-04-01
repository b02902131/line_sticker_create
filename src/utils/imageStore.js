const DB_NAME = 'stampmill_images'
const DB_VERSION = 1
const STORE_NAME = 'character_images'
const IS_DEV = import.meta.env.DEV

function openImageDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'characterId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// 同步圖片到本地檔案（dev mode）
async function syncSaveToFile(characterId, data) {
  if (!IS_DEV) return
  try {
    await fetch(`/api/images?id=${characterId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
  } catch (err) {
    console.warn('同步圖片到本地檔案失敗:', err)
  }
}

async function syncLoadFromFile(characterId) {
  if (!IS_DEV) return null
  try {
    const res = await fetch(`/api/images?id=${characterId}`)
    if (res.ok) {
      const data = await res.json()
      return data
    }
  } catch (err) {
    console.warn('從本地檔案讀取圖片失敗:', err)
  }
  return null
}

async function syncDeleteFromFile(characterId) {
  if (!IS_DEV) return
  try {
    await fetch(`/api/images?id=${characterId}`, { method: 'DELETE' })
  } catch (err) {
    console.warn('刪除本地圖片檔案失敗:', err)
  }
}

export async function saveCharacterImages(characterId, data) {
  const db = await openImageDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({ characterId, ...data, updatedAt: Date.now() })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  // 同步到本地檔案
  syncSaveToFile(characterId, data)
}

export async function loadCharacterImages(characterId) {
  // 優先從本地檔案讀取
  const fileData = await syncLoadFromFile(characterId)
  if (fileData && (fileData.gridImages?.length > 0 || fileData.cutImages?.length > 0)) {
    // 同時回寫 IndexedDB
    const db = await openImageDB()
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put({ characterId, ...fileData, updatedAt: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }).catch(() => {})
    return fileData
  }
  // fallback IndexedDB
  const db = await openImageDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(characterId)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

export async function deleteCharacterImages(characterId) {
  const db = await openImageDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(characterId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  syncDeleteFromFile(characterId)
}

export async function hasCharacterImages(characterId) {
  const data = await loadCharacterImages(characterId)
  return data !== null && (data.gridImages?.length > 0 || data.cutImages?.length > 0)
}
