import fs from 'node:fs'
import path from 'node:path'

function usageAndExit(code = 1) {
  const msg = `
Usage:
  node scripts/line-sticker-text.mjs <listing-path>

Output:
  Prints lines in the format:
    {{name}}:{{description}}\\n

Examples:
  node scripts/line-sticker-text.mjs local/stickers/0410-喵喵圖鑑/listing.md
  node scripts/line-sticker-text.mjs /abs/path/to/listing.md
`.trim()
  console.error(msg)
  process.exit(code)
}

function normalizeListingPath(p) {
  if (!p) return null
  if (path.isAbsolute(p)) return p
  // convenience: allow passing a sticker folder name like "0410-喵喵圖鑑"
  if (!p.endsWith('.md') && !p.includes('/')) {
    return path.join(process.cwd(), 'local', 'stickers', p, 'listing.md')
  }
  return path.join(process.cwd(), p)
}

function unescapePipes(s) {
  return s.replace(/\\\|/g, '|')
}

function splitMdRow(line) {
  // Ex: "| 1 | name | desc |" -> ["1","name","desc"]
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return null
  const cells = trimmed
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(c => unescapePipes(c.trim()))
  return cells
}

function isSeparatorRow(cells) {
  // header separator like ["---","---","---"] (allow colons/spaces)
  return cells.every(c => /^:?-{3,}:?$/.test(c.replace(/\s/g, '')))
}

function parseStickerCount(md) {
  // from the "貼圖詳細內容" table: "| 貼圖張數 | 40 |"
  const m = md.match(/^\|\s*貼圖張數\s*\|\s*(\d+)\s*\|\s*$/m)
  return m ? Number(m[1]) : null
}

function extractTextTableLines(md) {
  const startIdx = md.indexOf('## 貼圖文字清單')
  if (startIdx === -1) throw new Error('找不到 section: "## 貼圖文字清單"')
  const after = md.slice(startIdx)
  const lines = after.split(/\r?\n/)

  const tableLines = []
  let inTable = false
  for (const line of lines) {
    if (!inTable) {
      if (line.trim().startsWith('|')) {
        inTable = true
        tableLines.push(line)
      }
      continue
    }
    if (!line.trim().startsWith('|')) break
    tableLines.push(line)
  }
  if (tableLines.length < 2) throw new Error('貼圖文字清單 table 看起來是空的或格式不對')
  return tableLines
}

function parseEntriesFromTableLines(tableLines) {
  const rows = tableLines
    .map(splitMdRow)
    .filter(Boolean)

  // Drop header + separator if present
  const dataRows = []
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i]
    if (i === 0) continue
    if (i === 1 && isSeparatorRow(cells)) continue
    if (cells.every(c => !c)) continue
    dataRows.push(cells)
  }

  const entries = dataRows.map((cells, idx) => {
    const name = (cells[1] ?? '').trim()
    const description = (cells[2] ?? '').trim()
    return { idx: idx + 1, name, description }
  })

  return entries
}

function validateEntries(entries, expectedCount) {
  if (entries.length < 8) {
    throw new Error(`條目數不足：${entries.length}（LINE 最少 8 張）`)
  }
  const empty = entries.filter(e => !e.name || !e.description)
  if (empty.length > 0) {
    const sample = empty.slice(0, 5).map(e => `#${e.idx}`).join(', ')
    throw new Error(`有空欄位（name/description）：${empty.length} 筆（例：${sample}）`)
  }
  if (typeof expectedCount === 'number' && Number.isFinite(expectedCount)) {
    if (entries.length !== expectedCount) {
      throw new Error(`條目數不符：table=${entries.length}，貼圖張數=${expectedCount}`)
    }
  }
}

function main() {
  const arg = process.argv[2]
  if (!arg || arg === '-h' || arg === '--help') usageAndExit(0)

  const listingPath = normalizeListingPath(arg)
  if (!listingPath) usageAndExit(1)

  if (!fs.existsSync(listingPath)) {
    throw new Error(`找不到檔案: ${listingPath}`)
  }

  const md = fs.readFileSync(listingPath, 'utf8')
  const expectedCount = parseStickerCount(md)
  const tableLines = extractTextTableLines(md)
  const entries = parseEntriesFromTableLines(tableLines)
  validateEntries(entries, expectedCount)

  // Print as name:description\n
  const out = entries.map(e => `${e.name}:${e.description}`).join('\n') + '\n'
  process.stdout.write(out)
}

try {
  main()
} catch (err) {
  console.error(`[line-sticker-text] ${err?.message || String(err)}`)
  process.exit(1)
}

