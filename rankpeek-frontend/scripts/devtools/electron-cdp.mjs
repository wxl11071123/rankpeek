#!/usr/bin/env node
/**
 * Launch the RankPeek Electron dev shell with the Chrome DevTools Protocol enabled,
 * so scripts/devtools/cdp.mjs can screenshot, click and inspect the live window.
 *
 * Preconditions (already running elsewhere):
 *   - backend on http://127.0.0.1:8080    (scripts/dev-backend.bat)
 *   - vite dev server on http://localhost:5173   (npm run dev)
 *
 * Usage:
 *   npm run electron:cdp                  # reuse dist/main + dist/preload
 *   npm run electron:cdp -- --build       # rebuild main/preload first
 *   npm run electron:cdp -- --software    # GPU/sandbox-hostile environments
 *   npm run electron:cdp -- --port 9333   # custom debugging port
 */

import { spawn, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..', '..')

const argv = process.argv.slice(2)
const options = { port: 9222, build: false, software: false, extra: [] }
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index]
  if (arg === '--port') options.port = Number(argv[++index])
  else if (arg === '--build') options.build = true
  else if (arg === '--software') options.software = true
  else options.extra.push(arg)
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function probe(url) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    return response.ok ? 'ok' : 'HTTP ' + response.status
  } catch {
    return 'down'
  }
}

const viteStatus = await probe('http://localhost:5173')
const backendStatus = await probe('http://127.0.0.1:8080/actuator/health')
console.log('vite    http://localhost:5173        ' + viteStatus)
console.log('backend http://127.0.0.1:8080        ' + backendStatus)
if (viteStatus !== 'ok') console.warn('  ! renderer dev server is down - start it with "npm run dev"')
if (backendStatus !== 'ok') console.warn('  ! backend is down - start it with scripts/dev-backend.bat')

if (options.build) {
  for (const script of ['build:main', 'build:preload']) {
    const result = spawnSync('npm', ['run', script], { cwd: projectRoot, stdio: 'inherit', shell: true })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
}

const devtoolsUrl = 'http://127.0.0.1:' + options.port + '/json/version'
if ((await probe(devtoolsUrl)) === 'ok') {
  console.error('port ' + options.port + ' already serves DevTools - a dev instance is still running.')
  console.error('stop it first:   taskkill /IM electron.exe /F')
  console.error('or attach to it: npm run cdp -- info --port ' + options.port)
  process.exit(1)
}

const env = { ...process.env, NODE_ENV: 'development' }
// Inherited from an embedded Node runtime; it would make require('electron') return a path.
delete env.ELECTRON_RUN_AS_NODE
delete env.NODE_OPTIONS

const args = ['.', '--remote-debugging-port=' + options.port]
if (options.software) {
  args.push('--disable-gpu', '--no-sandbox', '--disable-gpu-compositing', '--disable-software-rasterizer', '--in-process-gpu')
}
args.push(...options.extra)

console.log('electron ' + electronPath + ' ' + args.join(' '))
const child = spawn(electronPath, args, { cwd: projectRoot, stdio: 'inherit', env })

const childExit = { done: false, code: null, signal: null }
child.on('exit', (code, signal) => {
  childExit.done = true
  childExit.code = code
  childExit.signal = signal
})

const deadline = Date.now() + 40000
let ready = false
while (Date.now() < deadline) {
  if (childExit.done) break
  if ((await probe(devtoolsUrl)) === 'ok') {
    ready = true
    break
  }
  await sleep(500)
}

if (ready) {
  const targets = await (await fetch('http://127.0.0.1:' + options.port + '/json/list')).json()
  const pages = targets.filter((target) => target.type === 'page' && !target.url.startsWith('devtools://'))
  console.log('devtools ready on ' + options.port + ' - windows:')
  for (const page of pages) console.log('  ' + page.title + '  ' + page.url)
  console.log('drive it with: npm run cdp -- info')
} else if (childExit.done) {
  console.error('electron exited before DevTools became ready (code=' + childExit.code + ')')
  process.exit(childExit.code ?? 1)
} else {
  console.warn('devtools port ' + options.port + ' never became ready - check the log above')
}

if (childExit.done) {
  console.log('electron exited (code=' + childExit.code + ', signal=' + childExit.signal + ')')
  process.exit(childExit.code ?? 0)
}

child.on('exit', (code, signal) => {
  console.log('electron exited (code=' + code + ', signal=' + signal + ')')
  process.exit(code ?? 0)
})
