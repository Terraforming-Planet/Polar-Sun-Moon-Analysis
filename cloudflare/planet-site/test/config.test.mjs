import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))

test('base planet worker serves the root Vite build on workers.dev without custom routes', async () => {
  const config = await readJson('../wrangler.jsonc')
  assert.equal(config.name, 'terra-observation-planet')
  assert.equal(config.workers_dev, true)
  assert.equal(config.assets.directory, '../../web/dist')
  assert.equal(config.assets.not_found_handling, 'single-page-application')
  assert.equal(config.routes, undefined)
})

test('Vite keeps GitHub Pages default while allowing a Cloudflare root build', async () => {
  const viteConfig = await readFile(new URL('../../../web/vite.config.ts', import.meta.url), 'utf8')
  assert.match(viteConfig, /process\.env\.TERRA_PUBLIC_BASE/)
  assert.match(viteConfig, /\/Polar-Sun-Moon-Analysis\//)
  assert.match(viteConfig, /base:\s*publicBase/)
})
