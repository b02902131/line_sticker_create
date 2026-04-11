const IS_DEV = import.meta.env.DEV

// localStorage fallback keys (production 沒有 dev API server，存在瀏覽器本地)
const LS_CHARACTERS_KEY = 'stampmill_characters'
const LS_DESCS_PREFIX = 'stampmill_descs_'

// 角色資料儲存：dev mode 寫檔案，production 寫 localStorage
export async function syncSaveCharacters(characters) {
  if (IS_DEV) {
    try {
      await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(characters)
      })
    } catch (err) {
      console.warn('儲存角色失敗:', err)
    }
    return
  }
  // Production fallback: localStorage
  try {
    localStorage.setItem(LS_CHARACTERS_KEY, JSON.stringify(characters))
  } catch (err) {
    console.warn('localStorage 儲存角色失敗（可能配額已滿）:', err)
  }
}

// 角色資料讀取：dev mode 讀檔案，production 讀 localStorage
export async function syncLoadCharacters() {
  if (IS_DEV) {
    try {
      const res = await fetch('/api/characters')
      if (res.ok) {
        const data = await res.json()
        return data.length > 0 ? data : []
      }
    } catch (err) {
      console.warn('讀取角色失敗:', err)
    }
    return []
  }
  // Production fallback: localStorage
  try {
    const raw = localStorage.getItem(LS_CHARACTERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.warn('localStorage 讀取角色失敗:', err)
    return []
  }
}

// 描述儲存
export async function syncSaveDescs(charId, descs) {
  if (IS_DEV) {
    try {
      await fetch(`/api/descriptions?id=${charId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(descs)
      })
    } catch (err) {
      console.warn('儲存描述失敗:', err)
    }
    return
  }
  try {
    localStorage.setItem(LS_DESCS_PREFIX + charId, JSON.stringify(descs))
  } catch (err) {
    console.warn('localStorage 儲存描述失敗:', err)
  }
}

// 描述讀取
export async function syncLoadDescs(charId) {
  if (IS_DEV) {
    try {
      const res = await fetch(`/api/descriptions?id=${charId}`)
      if (res.ok) {
        const data = await res.json()
        return data.length > 0 ? data : []
      }
    } catch (err) {
      console.warn('讀取描述失敗:', err)
    }
    return []
  }
  try {
    const raw = localStorage.getItem(LS_DESCS_PREFIX + charId)
    return raw ? JSON.parse(raw) : []
  } catch (err) {
    console.warn('localStorage 讀取描述失敗:', err)
    return []
  }
}

// 描述刪除
export async function syncDeleteDescs(charId) {
  if (IS_DEV) {
    try {
      await fetch(`/api/descriptions?id=${charId}`, { method: 'DELETE' })
    } catch (err) {
      console.warn('刪除描述失敗:', err)
    }
    return
  }
  try {
    localStorage.removeItem(LS_DESCS_PREFIX + charId)
  } catch (err) {
    console.warn('localStorage 刪除描述失敗:', err)
  }
}
