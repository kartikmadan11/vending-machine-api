// Every colour comes from a --vend-* token in the :root block of styles.css, so restyling is
// one block. Node rather than a grep one-liner, so that npm run check also runs on Windows.
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('../src/', import.meta.url).pathname
const STYLESHEET = 'styles.css'

/** A hex literal or a colour function. Named colours are rare enough to leave to review. */
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/

const entries = await readdir(ROOT, { recursive: true, withFileTypes: true })
const offences = []

for (const entry of entries) {
  if (!entry.isFile()) continue
  const isScript = /\.tsx?$/.test(entry.name)
  const isStylesheet = entry.name === STYLESHEET
  if (!isScript && !isStylesheet) continue

  const path = join(entry.parentPath, entry.name)
  const lines = (await readFile(path, 'utf8')).split('\n')
  // In the stylesheet, the token block is the one place a literal belongs.
  let inTokens = false

  for (const [index, line] of lines.entries()) {
    if (isStylesheet && line.startsWith(':root {')) inTokens = true
    if (!inTokens && RAW_COLOUR.test(line)) offences.push(`${path}:${index + 1}: ${line.trim()}`)
    if (inTokens && line.startsWith('}')) inTokens = false
  }
}

if (offences.length > 0) {
  console.error(offences.join('\n'))
  console.error('palette: use a --vend-* token, not a raw colour')
  process.exit(1)
}
