import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const workerDir = path.resolve(testDir, '..')

test('deployment build forces English model output without changing source fixtures', async () => {
  execFileSync(process.execPath, ['scripts/build-english-worker.mjs'], {
    cwd: workerDir,
    encoding: 'utf8',
  })

  const areaAnalysis = await readFile(path.join(workerDir, '.build', 'areaAnalysis.js'), 'utf8')
  const terrainStudy = await readFile(path.join(workerDir, '.build', 'terrainStudy.js'), 'utf8')
  const scaleLocked = await readFile(path.join(workerDir, '.build', 'scaleLockedTerrainStudy.js'), 'utf8')

  for (const source of [areaAnalysis, terrainStudy, scaleLocked]) {
    assert.doesNotMatch(source, /Respond in Polish\./)
    assert.match(source, /Respond in English\./)
  }
  assert.match(terrainStudy, /No images passed validation for AI analysis\./)
})
