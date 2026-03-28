const IS_DEV = import.meta.env.DEV

// 角色資料同步：寫入 localStorage + 本地檔案
export async function syncSaveCharacters(characters) {
  localStorage.setItem('stampmill_characters', JSON.stringify(characters))
  if (IS_DEV) {
    try {
      await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(characters)
      })
    } catch (err) {
      console.warn('同步角色到本地檔案失敗:', err)
    }
  }
}

// 角色資料讀取：優先本地檔案，fallback localStorage
export async function syncLoadCharacters() {
  if (IS_DEV) {
    try {
      const res = await fetch('/api/characters')
      if (res.ok) {
        const fileData = await res.json()
        if (fileData.length > 0) {
          // 同時更新 localStorage
          localStorage.setItem('stampmill_characters', JSON.stringify(fileData))
          return fileData
        }
      }
    } catch (err) {
      console.warn('從本地檔案讀取角色失敗:', err)
    }
  }
  try { return JSON.parse(localStorage.getItem('stampmill_characters')) || [] }
  catch { return [] }
}

// 描述同步
export async function syncSaveDescs(charId, descs) {
  localStorage.setItem(`stampmill_descs_${charId}`, JSON.stringify(descs))
  if (IS_DEV) {
    try {
      await fetch(`/api/descriptions?id=${charId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(descs)
      })
    } catch (err) {
      console.warn('同步描述到本地檔案失敗:', err)
    }
  }
}

export async function syncLoadDescs(charId) {
  if (IS_DEV) {
    try {
      const res = await fetch(`/api/descriptions?id=${charId}`)
      if (res.ok) {
        const data = await res.json()
        if (data.length > 0) {
          localStorage.setItem(`stampmill_descs_${charId}`, JSON.stringify(data))
          return data
        }
      }
    } catch (err) {
      console.warn('從本地檔案讀取描述失敗:', err)
    }
  }
  try { return JSON.parse(localStorage.getItem(`stampmill_descs_${charId}`)) || [] }
  catch { return [] }
}

export async function syncDeleteDescs(charId) {
  localStorage.removeItem(`stampmill_descs_${charId}`)
  if (IS_DEV) {
    try {
      await fetch(`/api/descriptions?id=${charId}`, { method: 'DELETE' })
    } catch (err) {
      console.warn('刪除本地描述檔案失敗:', err)
    }
  }
}
