import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('startup splash is only topmost while it is first shown', () => {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')
  const createSplashMatch = source.match(/function createSplashWindow\(\) \{[\s\S]*?\n\}/)

  assert.ok(createSplashMatch, 'createSplashWindow should exist')
  assert.doesNotMatch(createSplashMatch[0], /alwaysOnTop:\s*true/)
  assert.match(createSplashMatch[0], /showSplashWindowOnceOnTop\(splashWindow\)/)
  assert.match(source, /function showSplashWindowOnceOnTop\(window: BrowserWindow\) \{[\s\S]*window\.setAlwaysOnTop\(true\)[\s\S]*window\.show\(\)[\s\S]*window\.setAlwaysOnTop\(false\)/)
})
