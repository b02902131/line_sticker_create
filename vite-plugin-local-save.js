import fs from 'fs'
import path from 'path'

const DATA_DIR = path.resolve('local/data')
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json')
const DESCS_DIR = path.join(DATA_DIR, 'descriptions')
const IMAGES_DIR = path.join(DATA_DIR, 'images')

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DESCS_DIR)) fs.mkdirSync(DESCS_DIR, { recursive: true })
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true })
}

function dataUrlToBuffer(dataUrl) {
  if (!dataUrl) return null
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return Buffer.from(match[2], 'base64')
}

function bufferToDataUrl(buffer, mime = 'image/png') {
  return `data:${mime};base64,${buffer.toString('base64')}`
}

function saveImageArray(dir, prefix, images) {
  if (!images || images.length === 0) return
  for (let i = 0; i < images.length; i++) {
    const buf = dataUrlToBuffer(images[i])
    if (buf) fs.writeFileSync(path.join(dir, `${prefix}-${i}.png`), buf)
  }
}

function loadImageArray(dir, prefix) {
  const result = []
  let i = 0
  while (true) {
    const filePath = path.join(dir, `${prefix}-${i}.png`)
    if (!fs.existsSync(filePath)) break
    result.push(bufferToDataUrl(fs.readFileSync(filePath)))
    i++
  }
  return result
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => { chunks.push(chunk) })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())) } catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

export default function localSavePlugin() {
  return {
    name: 'local-save',
    configureServer(server) {
      // 讀取角色
      server.middlewares.use('/api/characters', async (req, res, next) => {
        if (req.method === 'GET') {
          ensureDirs()
          try {
            if (fs.existsSync(CHARACTERS_FILE)) {
              const data = fs.readFileSync(CHARACTERS_FILE, 'utf-8')
              res.setHeader('Content-Type', 'application/json')
              res.end(data)
            } else {
              res.setHeader('Content-Type', 'application/json')
              res.end('[]')
            }
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }
        if (req.method === 'POST') {
          ensureDirs()
          try {
            const body = await readBody(req)
            fs.writeFileSync(CHARACTERS_FILE, JSON.stringify(body, null, 2), 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }
        next()
      })

      // 讀取/儲存描述（per character）
      server.middlewares.use('/api/descriptions', async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        const charId = url.searchParams.get('id')
        if (!charId) { next(); return }
        const filePath = path.join(DESCS_DIR, `${charId}.json`)

        if (req.method === 'GET') {
          ensureDirs()
          try {
            if (fs.existsSync(filePath)) {
              res.setHeader('Content-Type', 'application/json')
              res.end(fs.readFileSync(filePath, 'utf-8'))
            } else {
              res.setHeader('Content-Type', 'application/json')
              res.end('[]')
            }
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }
        if (req.method === 'POST') {
          ensureDirs()
          try {
            const body = await readBody(req)
            fs.writeFileSync(filePath, JSON.stringify(body, null, 2), 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }
        if (req.method === 'DELETE') {
          ensureDirs()
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }
        next()
      })

      // 讀取/儲存/刪除角色圖片
      server.middlewares.use('/api/images', async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        const charId = url.searchParams.get('id')
        if (!charId) { next(); return }
        const charDir = path.join(IMAGES_DIR, charId)

        if (req.method === 'GET') {
          ensureDirs()
          try {
            if (!fs.existsSync(charDir)) {
              res.setHeader('Content-Type', 'application/json')
              res.end('null')
              return
            }
            const data = { characterId: charId }
            data.gridImages = loadImageArray(charDir, 'grid')
            data.processedGridImages = loadImageArray(charDir, 'processed')
            data.cutImages = loadImageArray(charDir, 'cut')
            const mainPath = path.join(charDir, 'main.png')
            if (fs.existsSync(mainPath)) data.mainImage = bufferToDataUrl(fs.readFileSync(mainPath))
            const tabPath = path.join(charDir, 'tab.png')
            if (fs.existsSync(tabPath)) data.tabImage = bufferToDataUrl(fs.readFileSync(tabPath))
            const metaPath = path.join(charDir, 'meta.json')
            if (fs.existsSync(metaPath)) {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
              Object.assign(data, meta)
            }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(data))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }

        if (req.method === 'POST') {
          ensureDirs()
          try {
            const body = await readBody(req)
            if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true })
            // 清除舊檔案
            const existing = fs.readdirSync(charDir)
            for (const f of existing) fs.unlinkSync(path.join(charDir, f))
            // 儲存圖片
            saveImageArray(charDir, 'grid', body.gridImages)
            saveImageArray(charDir, 'processed', body.processedGridImages)
            saveImageArray(charDir, 'cut', body.cutImages)
            if (body.mainImage) {
              const buf = dataUrlToBuffer(body.mainImage)
              if (buf) fs.writeFileSync(path.join(charDir, 'main.png'), buf)
            }
            if (body.tabImage) {
              const buf = dataUrlToBuffer(body.tabImage)
              if (buf) fs.writeFileSync(path.join(charDir, 'tab.png'), buf)
            }
            // 儲存非圖片的 meta 資料
            const meta = {}
            if (body.backgroundThreshold != null) meta.backgroundThreshold = body.backgroundThreshold
            if (body.updatedAt != null) meta.updatedAt = body.updatedAt
            fs.writeFileSync(path.join(charDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8')
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }

        if (req.method === 'DELETE') {
          ensureDirs()
          try {
            if (fs.existsSync(charDir)) {
              const files = fs.readdirSync(charDir)
              for (const f of files) fs.unlinkSync(path.join(charDir, f))
              fs.rmdirSync(charDir)
            }
            res.setHeader('Content-Type', 'application/json')
            res.end('{"ok":true}')
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }
        next()
      })
    }
  }
}
