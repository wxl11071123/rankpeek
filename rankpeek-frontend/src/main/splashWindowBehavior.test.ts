import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('backend temp dir is passed by env, never as a -D argv', () => {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')
  const spawnMatch = source.match(/backendProcess = spawn\(exePath,[\s\S]*?\n    \}\)/)

  assert.ok(spawnMatch, 'the backend spawn call should exist')

  // 回归：曾经写成 spawn(exePath, [`-Djava.io.tmpdir=${backendTmpDir}`])。
  // GraalVM 原生 exe 在 Windows 上用 ANSI 代码页解析 argv，路径里有中文就是乱码
  // （用户名是中文必然中招）-> 后端建不了 Tomcat 临时目录 -> 直接退出
  // -> 前端一直等不到后端 -> **永远卡在启动 logo**。
  assert.doesNotMatch(spawnMatch[0], /-Djava\.io\.tmpdir/)
  assert.match(spawnMatch[0], /spawn\(exePath,\s*\[\],\s*\{/)
  assert.match(spawnMatch[0], /TEMP:\s*backendTmpDir/)
  assert.match(spawnMatch[0], /TMP:\s*backendTmpDir/)
})

test('startup splash is only topmost while it is first shown', () => {
  const source = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')
  const createSplashMatch = source.match(/function createSplashWindow\(\) \{[\s\S]*?\n\}/)

  assert.ok(createSplashMatch, 'createSplashWindow should exist')
  assert.doesNotMatch(createSplashMatch[0], /alwaysOnTop:\s*true/)
  assert.match(createSplashMatch[0], /showSplashWindowOnceOnTop\(splashWindow\)/)
  assert.match(source, /function showSplashWindowOnceOnTop\(window: BrowserWindow\) \{[\s\S]*window\.setAlwaysOnTop\(true\)[\s\S]*window\.show\(\)[\s\S]*window\.setAlwaysOnTop\(false\)/)
})
