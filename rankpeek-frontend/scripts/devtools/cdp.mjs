#!/usr/bin/env node
/**
 * RankPeek dev helper: drive the Electron dev window over the Chrome DevTools Protocol.
 *
 * The app must be started with a debugging port (see electron-cdp.mjs).
 *
 * Usage:
 *   node scripts/devtools/cdp.mjs targets
 *   node scripts/devtools/cdp.mjs info
 *   node scripts/devtools/cdp.mjs screenshot shot.png [--full]
 *   node scripts/devtools/cdp.mjs eval "document.title"
 *   node scripts/devtools/cdp.mjs html ".match-card"
 *   node scripts/devtools/cdp.mjs click --selector ".refresh-button"
 *   node scripts/devtools/cdp.mjs click 120 340
 *   node scripts/devtools/cdp.mjs type "hello"
 *   node scripts/devtools/cdp.mjs key Enter
 *   node scripts/devtools/cdp.mjs nav "#/settings"
 *   node scripts/devtools/cdp.mjs wait ".match-card" 8000
 *   node scripts/devtools/cdp.mjs logs 5000 [--reload]
 *   node scripts/devtools/cdp.mjs size 1440 900
 *
 * Options: --port <n> (default 9222), --window <substring>, --timeout <ms>
 */

import { writeFileSync } from 'node:fs'

const DEFAULT_PORT = 9222
const DEFAULT_TIMEOUT = 15000

function parseArgs(argv) {
  const options = { port: DEFAULT_PORT, window: null, timeout: DEFAULT_TIMEOUT, full: false, reload: false }
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--port') options.port = Number(argv[++index])
    else if (arg === '--window') options.window = argv[++index]
    else if (arg === '--timeout') options.timeout = Number(argv[++index])
    else if (arg === '--full') options.full = true
    else if (arg === '--reload') options.reload = true
    else if (arg === '--selector') positional.push('--selector', argv[++index])
    else positional.push(arg)
  }
  return { options, positional }
}

const { options, positional } = parseArgs(process.argv.slice(2))
const command = positional[0]
const rest = positional.slice(1)

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * A minimized or fully occluded window never produces compositor frames, which makes
 * Page.captureScreenshot hang forever. Restoring it through user32 is the only reliable fix:
 * Electron does not implement Browser.setWindowBounds / Browser.getWindowForTarget.
 */
async function restoreWindow(match) {
  if (process.platform !== 'win32') throw new Error('window restore is Windows-only')
  const koffi = (await import('koffi')).default
  const user32 = koffi.load('user32.dll')
  const EnumWindowsProc = koffi.proto('bool __stdcall EnumWindowsProc(void *hwnd, intptr_t lParam)')
  const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumWindowsProc *cb, intptr_t lParam)')
  const GetWindowTextW = user32.func('int __stdcall GetWindowTextW(void *h, _Out_ uint16_t *buf, int max)')
  const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(void *h)')
  const IsIconic = user32.func('bool __stdcall IsIconic(void *h)')
  const ShowWindowAsync = user32.func('bool __stdcall ShowWindowAsync(void *h, int cmd)')
  const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(void *h)')

  const found = []
  const callback = koffi.register((hwnd) => {
    if (!IsWindowVisible(hwnd)) return true
    const buffer = Buffer.alloc(1024)
    const length = GetWindowTextW(hwnd, buffer, 512)
    if (length > 0) {
      found.push({ hwnd, title: buffer.toString('utf16le', 0, length * 2), minimized: IsIconic(hwnd) })
    }
    return true
  }, koffi.pointer(EnumWindowsProc))

  EnumWindows(callback, 0)
  koffi.unregister(callback)

  const window = found.find((entry) => entry.title.toLowerCase().includes(match.toLowerCase()))
  if (!window) return null
  if (window.minimized) ShowWindowAsync(window.hwnd, 9) // SW_RESTORE
  // A window that is not on screen produces no frames, so raise it before capturing.
  SetForegroundWindow(window.hwnd)
  return window.title
}

async function fetchTargets() {
  let response
  try {
    response = await fetch('http://127.0.0.1:' + options.port + '/json/list')
  } catch (error) {
    throw new Error(
      'Cannot reach the DevTools endpoint on port ' + options.port + '. Start the app with: npm run electron:cdp'
    )
  }
  if (!response.ok) throw new Error('DevTools endpoint returned HTTP ' + response.status)
  const targets = await response.json()
  return targets.filter((target) => target.type === 'page' && !target.url.startsWith('devtools://'))
}

function selectTarget(targets) {
  const match = options.window
  if (match) {
    const found = targets.filter((target) => (target.url + ' ' + target.title).toLowerCase().includes(match.toLowerCase()))
    if (found.length === 0) throw new Error('No window matching "' + match + '". Open windows: ' + describe(targets))
    return found[0]
  }
  const main = targets.find((target) => target.url.includes('localhost:5173'))
  return main || targets[0]
}

function describe(targets) {
  return targets.map((target) => target.title + ' <' + target.url + '>').join(' | ') || '(none)'
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    const listeners = new Map()
    let nextId = 0

    socket.addEventListener('open', () => {
      resolve({
        send(method, params, timeoutMs) {
          return new Promise((res, rej) => {
            const id = ++nextId
            pending.set(id, { res, rej })
            socket.send(JSON.stringify({ id, method, params: params || {} }))
            if (timeoutMs) {
              setTimeout(() => {
                if (pending.has(id)) {
                  pending.delete(id)
                  rej(new Error('timeout after ' + timeoutMs + 'ms: ' + method))
                }
              }, timeoutMs)
            }
          })
        },
        on(event, handler) {
          if (!listeners.has(event)) listeners.set(event, [])
          listeners.get(event).push(handler)
        },
        close() {
          socket.close()
        }
      })
    })
    socket.addEventListener('error', () => reject(new Error('DevTools websocket error')))
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id && pending.has(message.id)) {
        const { res, rej } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) rej(new Error(message.error.message || JSON.stringify(message.error)))
        else res(message.result)
        return
      }
      if (message.method && listeners.has(message.method)) {
        for (const handler of listeners.get(message.method)) handler(message.params)
      }
    })
  })
}

const browserKeys = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }
}

async function main() {
  if (!command || command === 'help' || command === '--help') {
    console.log(readUsage())
    return
  }
  if (typeof WebSocket !== 'function') {
    throw new Error('This script needs Node.js 22+ (global WebSocket). Current: ' + process.version)
  }

  if (command === 'restore') {
    const match = rest.join(' ') || options.window || 'RankPeek'
    const restored = await restoreWindow(match)
    console.log(restored ? 'restored "' + restored + '"' : 'no visible window matching "' + match + '"')
    return
  }

  const targets = await fetchTargets()
  if (command === 'targets') {
    for (const target of targets) console.log(target.title + '  ' + target.url)
    return
  }

  const target = selectTarget(targets)
  const client = await connect(target.webSocketDebuggerUrl)

  async function evaluate(expression) {
    const result = await client.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'evaluate failed')
    }
    return result.result.value
  }

  switch (command) {
    case 'info': {
      const info = await evaluate(
        'JSON.stringify({title: document.title, hash: location.hash, width: innerWidth, height: innerHeight, bridge: typeof window.electronAPI, nodes: document.querySelectorAll("*").length})'
      )
      console.log(info)
      break
    }
    case 'eval': {
      const value = await evaluate(rest.join(' '))
      console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
      break
    }
    case 'screenshot': {
      const output = rest[0] || 'cdp-screenshot.png'
      const params = { format: 'png' }
      if (options.full) {
        const metrics = await client.send('Page.getLayoutMetrics')
        const size = metrics.cssContentSize || metrics.contentSize
        params.captureBeyondViewport = true
        params.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 }
      }
      let shot
      try {
        shot = await client.send('Page.captureScreenshot', params, 12000)
      } catch (error) {
        const restored = await restoreWindow(options.window || 'RankPeek').catch(() => null)
        if (!restored) throw error
        console.log('capture timed out (window was minimized) - restored "' + restored + '", retrying')
        await sleep(2500)
        shot = await client.send('Page.captureScreenshot', params, 12000)
      }
      writeFileSync(output, Buffer.from(shot.data, 'base64'))
      console.log('saved ' + output)
      break
    }
    case 'html': {
      const selector = rest.join(' ')
      const html = await evaluate(
        '(() => { const el = document.querySelector(' + JSON.stringify(selector) + '); return el ? el.outerHTML.slice(0, 4000) : null })()'
      )
      console.log(html === null ? 'no element matches ' + selector : html)
      break
    }
    case 'text': {
      const selector = rest.join(' ')
      const text = await evaluate(
        '(() => { const el = document.querySelector(' + JSON.stringify(selector) + '); return el ? el.innerText : null })()'
      )
      console.log(text === null ? 'no element matches ' + selector : text)
      break
    }
    case 'click': {
      let x
      let y
      if (rest[0] === '--selector') {
        const selector = rest[1]
        const box = await evaluate(
          '(() => { const el = document.querySelector(' + JSON.stringify(selector) + '); if (!el) return null; el.scrollIntoView({block: "center"}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()'
        )
        if (!box) throw new Error('no element matches ' + selector)
        x = box.x
        y = box.y
      } else {
        x = Number(rest[0])
        y = Number(rest[1])
      }
      await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
      await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
      await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
      console.log('clicked ' + x + ',' + y)
      break
    }
    case 'type': {
      await client.send('Input.insertText', { text: rest.join(' ') })
      console.log('typed')
      break
    }
    case 'key': {
      const name = rest[0]
      const descriptor = browserKeys[name]
      if (!descriptor) throw new Error('unsupported key: ' + name + ' (add it to browserKeys)')
      await client.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: descriptor.key, code: descriptor.code, windowsVirtualKeyCode: descriptor.windowsVirtualKeyCode })
      await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: descriptor.key, code: descriptor.code, windowsVirtualKeyCode: descriptor.windowsVirtualKeyCode })
      console.log('key ' + name)
      break
    }
    case 'wheel': {
      // 真滚轮事件（合成事件不会触发原生滚动）：wheel <x> <y> <deltaY>
      const x = Number(rest[0])
      const y = Number(rest[1])
      const deltaY = Number(rest[2])
      if (![x, y, deltaY].every(Number.isFinite)) throw new Error('usage: wheel <x> <y> <deltaY>')
      await client.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY, button: 'none', pointerType: 'mouse' })
      console.log('wheel ' + deltaY + ' at ' + x + ',' + y)
      break
    }
    case 'nav': {
      const hash = rest[0].startsWith('#') ? rest[0] : '#/' + rest[0].replace(/^\//, '')
      await evaluate('location.hash = ' + JSON.stringify(hash) + '; true')
      await sleep(1200)
      console.log('navigated to ' + hash)
      break
    }
    case 'wait': {
      const selector = rest[0]
      const timeout = Number(rest[1]) || options.timeout
      const deadline = Date.now() + timeout
      for (;;) {
        const found = await evaluate('!!document.querySelector(' + JSON.stringify(selector) + ')')
        if (found) {
          console.log('found ' + selector)
          break
        }
        if (Date.now() > deadline) throw new Error('timeout waiting for ' + selector)
        await sleep(200)
      }
      break
    }
    case 'logs': {
      const duration = Number(rest[0]) || 5000
      const entries = []
      client.on('Runtime.consoleAPICalled', (params) => {
        entries.push({
          kind: 'console',
          level: params.type,
          text: params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ')
        })
      })
      client.on('Runtime.exceptionThrown', (params) => {
        entries.push({
          kind: 'exception',
          text: params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'unknown'
        })
      })
      client.on('Log.entryAdded', (params) => {
        entries.push({ kind: 'log', level: params.entry.level, text: params.entry.text, url: params.entry.url })
      })
      await client.send('Runtime.enable')
      await client.send('Log.enable')
      if (options.reload) {
        await client.send('Page.enable')
        await client.send('Page.reload', { ignoreCache: false })
      }
      await sleep(duration)
      if (entries.length === 0) console.log('(no console output)')
      for (const entry of entries) {
        console.log('[' + entry.kind + (entry.level ? '/' + entry.level : '') + '] ' + entry.text)
      }
      break
    }
    case 'size': {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: Number(rest[0]),
        height: Number(rest[1]),
        deviceScaleFactor: 1,
        mobile: false
      })
      console.log('viewport ' + rest[0] + 'x' + rest[1])
      break
    }
    default:
      throw new Error('unknown command: ' + command + '\n\n' + readUsage())
  }

  client.close()
}

function readUsage() {
  return [
    'RankPeek CDP driver',
    '  targets | info | screenshot <file> [--full] | eval <expr> | html <selector> | text <selector>',
    '  click <x> <y> | click --selector <css> | type <text> | key <name> | nav <hash>',
    '  wait <selector> [ms] | logs [ms] [--reload] | size <w> <h> | restore [title]',
    '  options: --port 9222 --window <substring> --timeout 15000'
  ].join('\n')
}

main().catch((error) => {
  console.error(String(error.message || error))
  process.exit(1)
})
