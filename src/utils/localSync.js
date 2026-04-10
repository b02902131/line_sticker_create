const IS_DEV = import.meta.env.DEV

// 角色資料儲存：直接寫檔案
export async function syncSaveCharacters(characters) {
  if (!IS_DEV) return
  try {
    await fetch('/api/characters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(characters)
    })
  } catch (err) {
    console.warn('儲存角色失敗:', err)
  }
}

// 角色資料讀取：從檔案讀
export async function syncLoadCharacters() {
  if (!IS_DEV) return []
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

// 描述儲存
export async function syncSaveDescs(charId, descs) {
  if (!IS_DEV) return
  try {
    await fetch(`/api/descriptions?id=${charId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(descs)
    })
  } catch (err) {
    console.warn('儲存描述失敗:', err)
  }
}

// 描述讀取
export async function syncLoadDescs(charId) {
  if (!IS_DEV) return []
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

// 描述刪除
export async function syncDeleteDescs(charId) {
  if (!IS_DEV) return
  try {
    await fetch(`/api/descriptions?id=${charId}`, { method: 'DELETE' })
  } catch (err) {
    console.warn('刪除描述失敗:', err)
  }
}
