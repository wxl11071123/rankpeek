import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('standalone routes hide the sidebar and skip main-window auto navigation', () => {
  const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /import AppAnnouncements from '@\/components\/AppAnnouncements\.vue'/)
  assert.match(source, /const isStandaloneRoute = computed\(\(\) => isStandaloneRuntimeRoute\(\)\)/)
  // 先看窗口自己的 hash：挂载时路由还没解析完，只看 currentRoute 会让悬浮窗被当成普通窗口
  assert.match(
    source,
    /function isStandaloneRuntimeRoute\(\) \{[\s\S]*hash\.startsWith\('#\/overlay'\)[\s\S]*hash\.startsWith\('#\/opgg'\)[\s\S]*meta\.standalone === true/
  )
  assert.match(source, /if \(!isStandaloneRuntimeRoute\(\)\) \{[\s\S]*void gameStore\.initConnection\(\)/)
  assert.match(source, /if \(isStandaloneRoute\.value\) \{[\s\S]*void gameStore\.checkConnection\(\)[\s\S]*standaloneConnectionTimer = setInterval/)
  assert.match(source, /if \(!isStandaloneRoute\.value\) \{[\s\S]*createGameflowAutoNavigator\(router\)/)
  assert.match(source, /clearInterval\(standaloneConnectionTimer\)/)
  assert.match(source, /<TitleBar v-if="!isOverlayWindow" \/>/)
  assert.match(source, /<Sidebar v-if="!isStandaloneRoute" \/>/)
  assert.doesNotMatch(source, /<AppAnnouncements v-if="!isStandaloneRoute" \/>/)
  assert.match(
    source,
    /:class="\{ 'main-content-standalone': isStandaloneRoute, 'main-content-overlay': isOverlayWindow \}"/
  )
})

test('the overlay window drops the title bar and paints a transparent shell', () => {
  const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')

  // 悬浮窗是贴在游戏画面上的透明贴片：带标题栏或有底色都会变成一条挡视线的横条
  assert.match(source, /const isOverlayWindow = computed\([\s\S]*window\.location\.hash\.startsWith\('#\/overlay'\)[\s\S]*\)/)
  assert.match(source, /document\.documentElement\.classList\.toggle\('overlay-window', active\)/)
  assert.match(source, /document\.body\.classList\.toggle\('overlay-window', active\)/)
})

test('standalone routes keep zero page padding even at narrow widths', () => {
  const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')

  assert.match(source, /\.main-content-standalone \{[\s\S]*padding:\s*0/)
  assert.match(source, /@media \(max-width: 760px\) \{[\s\S]*\.main-content:not\(\.main-content-standalone\) \{[\s\S]*padding:\s*14px/)
  assert.doesNotMatch(source, /@media \(max-width: 760px\) \{[\s\S]*\.main-content \{[\s\S]*padding:\s*14px/)
})
