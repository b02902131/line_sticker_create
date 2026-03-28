import fs from 'fs'
import path from 'path'

const DATA_DIR = path.resolve('data')
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json')
const DESCS_DIR = path.join(DATA_DIR, 'descriptions')

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DESCS_DIR)) fs.mkdirSync(DESCS_DIR, { recursive: true })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
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
    }
  }
}
