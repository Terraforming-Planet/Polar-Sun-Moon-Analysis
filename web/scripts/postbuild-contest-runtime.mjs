import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const distDir = path.resolve('dist')
const rawBase = (process.env.TERRA_PUBLIC_BASE || '/Polar-Sun-Moon-Analysis/').trim() || '/'
const publicBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`
const workerUrl = (process.env.VITE_EVIDENCE_API_URL || '').trim().replace(/\/+$/, '')
const runtimeSrc = `${publicBase}contest-runtime.js`.replace(/\/+/g, '/')

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

async function listHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await listHtmlFiles(target))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) files.push(target)
  }
  return files
}

function ensureEnglishHtml(source) {
  if (/<html\b[^>]*\blang=["'][^"']*["']/i.test(source)) {
    return source.replace(/(<html\b[^>]*\blang=)["'][^"']*["']/i, '$1"en"')
  }
  return source.replace(/<html\b/i, '<html lang="en"')
}

function ensureEvidenceMeta(source) {
  if (!workerUrl || /name=["']terra-evidence-api["']/i.test(source)) return source
  const meta = `    <meta name="terra-evidence-api" content="${escapeAttribute(workerUrl)}" />\n`
  return /<\/head>/i.test(source) ? source.replace(/<\/head>/i, `${meta}</head>`) : source
}

function ensureRuntimeScript(source) {
  if (/contest-runtime\.js/i.test(source)) return source
  const script = `    <script src="${runtimeSrc}" defer></script>\n`
  if (/<\/body>/i.test(source)) return source.replace(/<\/body>/i, `${script}</body>`)
  return `${source}\n${script}`
}

const htmlFiles = await listHtmlFiles(distDir)
let changed = 0
for (const file of htmlFiles) {
  const original = await readFile(file, 'utf8')
  let updated = ensureEnglishHtml(original)
  updated = ensureEvidenceMeta(updated)
  updated = ensureRuntimeScript(updated)
  if (updated === original) continue
  await writeFile(file, updated, 'utf8')
  changed += 1
}

console.log(`Contest runtime post-build: ${changed}/${htmlFiles.length} HTML files updated; base=${publicBase}; worker=${workerUrl ? 'configured' : 'not-configured'}.`)
