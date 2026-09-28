const koffi = require('koffi')
const https = require('https')
const http = require('http')

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const TH32CS_SNAPPROCESS = 0x2
const PROCESS_COMMAND_LINE_INFORMATION = 60
const MAX_PATH = 260
const kernel32 = koffi.load('kernel32.dll')
const ntdll = koffi.load('ntdll.dll')
const HANDLE = koffi.pointer('HANDLE', koffi.opaque())
const PROCESSENTRY32 = koffi.struct('PROCESSENTRY32', {
  dwSize: 'uint32_t', cntUsage: 'uint32_t', th32ProcessID: 'uint32_t', th32DefaultHeapID: 'uintptr_t',
  th32ModuleID: 'uint32_t', cntThreads: 'uint32_t', th32ParentProcessID: 'uint32_t',
  pcPriClassBase: 'int32_t', dwFlags: 'uint32_t', szExeFile: koffi.array('char', MAX_PATH)
})
const OpenProcess = kernel32.func('HANDLE __stdcall OpenProcess(uint32_t access, int32_t inherit, uint32_t pid)')
const NtQueryInformationProcess = ntdll.func('int32_t __stdcall NtQueryInformationProcess(void *handle, int32_t cls, void *buf, uint32_t len, _Inout_ uint32_t *retLen)')
const CloseHandle = kernel32.func('int32_t __stdcall CloseHandle(void *h)')
const CreateToolhelp32Snapshot = kernel32.func('HANDLE __stdcall CreateToolhelp32Snapshot(uint32_t flags, uint32_t pid)')
const Process32First = kernel32.func('int32_t __stdcall Process32First(void *h, _Inout_ PROCESSENTRY32 *pe)')
const Process32Next = kernel32.func('int32_t __stdcall Process32Next(void *h, _Inout_ PROCESSENTRY32 *pe)')
const RtlMoveMemory = kernel32.func('void __stdcall RtlMoveMemory(_Out_ void *dest, _In_ const void *src, size_t len)')

function readCString(arr) {
  if (typeof arr === 'string') return arr
  if (Buffer.isBuffer(arr)) { const z = arr.indexOf(0); return arr.toString('latin1', 0, z === -1 ? arr.length : z) }
  if (Array.isArray(arr)) { let s = ''; for (const b of arr) { if (b === 0) break; s += String.fromCharCode(b) } return s }
  return ''
}
function findPids(name) {
  const pids = []
  const snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
  if (!snapshot) return pids
  try {
    const entry = { dwSize: 0 }
    const size = koffi.sizeof(PROCESSENTRY32)
    entry.dwSize = size
    if (Process32First(snapshot, entry) !== 0) {
      do {
        const exeName = readCString(entry.szExeFile)
        if (exeName && exeName.toLowerCase() === name.toLowerCase()) pids.push(entry.th32ProcessID)
        entry.dwSize = size
      } while (Process32Next(snapshot, entry) !== 0)
    }
  } finally { CloseHandle(snapshot) }
  return pids
}
function commandLine(pid) {
  const handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
  if (!handle) return null
  try {
    let buf = Buffer.alloc(8192)
    const retLen = [0]
    const status = NtQueryInformationProcess(handle, PROCESS_COMMAND_LINE_INFORMATION, buf, buf.length, retLen)
    if (status !== 0 && status !== 0x80000005) return null
    const length = buf.readUInt16LE(0)
    if (length === 0) return null
    const ptr = buf.readBigUInt64LE(8)
    if (ptr === 0n) return buf.toString('utf16le', 16, Math.min(16 + length, buf.length))
    const dst = Buffer.alloc(length)
    RtlMoveMemory(dst, ptr, length)
    return dst.toString('utf16le')
  } finally { CloseHandle(handle) }
}
function lcuGet(port, token, apiPath) {
  return new Promise((resolve) => {
    const req = https.request({ host: '127.0.0.1', port, path: apiPath, method: 'GET', rejectUnauthorized: false,
      headers: { Authorization: 'Basic ' + Buffer.from('riot:' + token).toString('base64') } }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', (error) => resolve({ status: 0, body: String(error) }))
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
    req.end()
  })
}
function postJson(port, apiPath, payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload)
    const req = http.request({ host: '127.0.0.1', port, path: apiPath, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let body = ''
      res.on('data', (c) => { body += c })
      res.on('end', () => resolve({ status: res.statusCode, body }))
    })
    req.on('error', (e) => resolve({ status: 0, body: String(e) }))
    req.write(data)
    req.end()
  })
}

async function main() {
  const pids = findPids('LeagueClientUx.exe')
  let auth = null
  for (const pid of pids) {
    const cmd = commandLine(pid)
    if (!cmd) continue
    const port = (cmd.match(/--app-port=(\d+)/) || [])[1]
    const token = (cmd.match(/--remoting-auth-token=([^\s"']+)/) || [])[1]
    if (port && token) { auth = { port, token, pid }; break }
  }
  if (!auth) { console.log('NO AUTH FOUND'); process.exit(1) }
  console.log('LCU auth: port=' + auth.port + ' pid=' + auth.pid)

  const summoner = await lcuGet(auth.port, auth.token, '/lol-summoner/v1/current-summoner')
  console.log('LCU summoner: status=' + summoner.status + ' body=' + summoner.body.slice(0, 100))

  const push = await postJson(8080, '/api/v1/system/lcu-auth', auth)
  console.log('push to backend: status=' + push.status + ' body=' + push.body.slice(0, 160))
}

main().catch((error) => { console.error(String(error)); process.exit(1) })
