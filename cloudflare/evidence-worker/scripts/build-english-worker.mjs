import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const workerDir = path.resolve(scriptDir, '..')
const sourceDir = path.join(workerDir, 'src')
const outputDir = path.join(workerDir, '.build')

// The public judge experience is English. Source adapters still retain Polish
// place-name recognition and historical test fixtures; only user-facing copy
// and model response-language directives are changed in the deploy bundle.
const replacements = [
  ['Respond in Polish.', 'Respond in English.'],
  ['Respond in clear Polish.', 'Respond in clear English.'],
  ['Write the answer in Polish.', 'Write the answer in English.'],
  ['Odpowiedz po polsku.', 'Respond in English.'],
  ['Brak obrazów, które przeszły kontrolę przed analizą AI.', 'No images passed validation for AI analysis.'],
  ['Brak obrazów do analizy.', 'No images are available for analysis.'],
  ['Brak danych do analizy.', 'No data is available for analysis.'],
  ['Brak wystarczających danych.', 'Insufficient data.'],
  ['Obszar:', 'Area:'],
  ['wybrany punkt', 'selected point'],
  ['Źródła:', 'Sources:'],
  ['Obserwacje:', 'Observations:'],
  ['Ograniczenia:', 'Limitations:'],
  ['Nie ustalono przyczyny na podstawie samych obrazów.', 'The cause was not established from imagery alone.'],
  ['Wymagana jest weryfikacja terenowa.', 'Field verification is required.'],
]

async function copyTranslatedDirectory(source, target) {
  await mkdir(target, { recursive: true })
  const entries = await readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)
    if (entry.isDirectory()) {
      await copyTranslatedDirectory(sourcePath, targetPath)
      continue
    }
    if (!entry.isFile()) continue

    let content = await readFile(sourcePath, 'utf8')
    if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      for (const [polish, english] of replacements) {
        content = content.split(polish).join(english)
      }
    }
    await writeFile(targetPath, content, 'utf8')
  }
}

await rm(outputDir, { recursive: true, force: true })
await copyTranslatedDirectory(sourceDir, outputDir)

const translatedFiles = []
async function audit(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await audit(target)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue
    const content = await readFile(target, 'utf8')
    if (/Respond in Polish\.|Odpowiedz po polsku\./i.test(content)) {
      throw new Error(`English Worker build still contains a Polish response directive: ${target}`)
    }
    translatedFiles.push(path.relative(workerDir, target))
  }
}
await audit(outputDir)

console.log(`English Evidence Worker build prepared: ${translatedFiles.length} JavaScript modules in ${path.relative(workerDir, outputDir)}.`)
