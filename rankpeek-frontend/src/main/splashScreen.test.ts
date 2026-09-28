import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildSplashHtml, getSplashPalette } from './splashScreen.ts'

const currentDir = dirname(fileURLToPath(import.meta.url))
const loadingHtmlPath = resolve(currentDir, '../../public/loading.html')

test('dark-mode splash uses the black eye logo on a light surface', () => {
  assert.deepEqual(getSplashPalette(true), {
    logoFile: 'rankpeek-eye-black.png',
    surfaceColor: '#f5f5f0',
    glowColor: 'rgba(10, 16, 30, 0.16)',
    labelColor: '#111827'
  })
})

test('light-mode splash uses the white eye logo on a dark surface', () => {
  assert.deepEqual(getSplashPalette(false), {
    logoFile: 'rankpeek-eye-white.png',
    surfaceColor: '#04060d',
    glowColor: 'rgba(255, 255, 255, 0.18)',
    labelColor: '#f8fafc'
  })
})

test('splash markup centers the logo and applies a blinking animation', () => {
  const html = buildSplashHtml({
    logoUrl: 'file:///branding/rankpeek-eye-black.png',
    surfaceColor: '#f5f5f0',
    glowColor: 'rgba(10, 16, 30, 0.16)',
    labelColor: '#111827'
  })

  assert.match(html, /class="splash-logo"/)
  assert.match(html, /justify-content:\s*center/)
  assert.match(html, /@keyframes blink/)
  assert.match(html, /animation:\s*blink 1\.6s ease-in-out infinite/)
  assert.match(html, /等待 RankPeek 启动中/)
})

test('loading page uses the modern optical three-layer splash system', () => {
  const html = readFileSync(loadingHtmlPath, 'utf-8')

  assert.match(html, /--ease-rack-focus:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/)
  assert.match(html, /background:\s*#000000;/)
  assert.match(html, /class="ambient-glow"/)
  assert.match(html, /class="focus-glass"/)
  assert.match(html, /class="splash-content"/)
  assert.match(html, /@keyframes\s+rackFocusIn/)
  assert.match(html, /@keyframes\s+ambientMorph/)
  assert.match(html, /@keyframes\s+auraBurst/)
  assert.match(html, /@keyframes\s+focusOut/)
  assert.match(html, /body\.is-loaded\s+\.splash-content[\s\S]*filter:\s*blur\(0\)/)
  assert.match(html, /body\.is-loaded\s+\.splash-content[\s\S]*transform:\s*scale\(0\.98\)/)
  assert.match(html, /body\.is-missing\s+\.splash-content[\s\S]*filter:\s*blur\(10px\)/)
  assert.match(html, /body\.is-missing\s+\.splash-content[\s\S]*transform:\s*scale\(0\.95\)/)
  assert.doesNotMatch(html, /ripple|reflection|caustic/i)
})
