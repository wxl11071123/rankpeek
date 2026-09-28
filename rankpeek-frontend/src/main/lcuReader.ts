import { execFileSync } from 'node:child_process'

export interface LcuAuthInfo {
  port: string
  token: string
  pid: number | null
}

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const TH32CS_SNAPPROCESS = 0x2
const PROCESS_COMMAND_LINE_INFORMATION = 60
const MAX_PATH = 260
const LCU_PROCESS_NAME = 'LeagueClientUx.exe'

let koffi: any = null
let ntdll: any = null
let kernel32: any = null
let _OpenProcess: any = null
let _NtQueryInformationProcess: any = null
let _CloseHandle: any = null
let _CreateToolhelp32Snapshot: any = null
let _Process32First: any = null
let _Process32Next: any = null
let _RtlMoveMemory: any = null
let _PROCESSENTRY32: any = null
let _initialized = false
let _initError: string | null = null

function ensureInitialized(): boolean {
  if (_initialized) return koffi !== null
  _initialized = true
  try {
    koffi = require('koffi')
    ntdll = koffi.load('ntdll.dll')
    kernel32 = koffi.load('kernel32.dll')

    const HANDLE = koffi.pointer('HANDLE', koffi.opaque())

    _OpenProcess = kernel32.func(
      'HANDLE __stdcall OpenProcess(uint32_t access, int32_t inherit, uint32_t pid)'
    )
    _NtQueryInformationProcess = ntdll.func(
      'int32_t __stdcall NtQueryInformationProcess(void *handle, int32_t cls, void *buf, uint32_t len, _Inout_ uint32_t *retLen)'
    )
    _CloseHandle = kernel32.func('int32_t __stdcall CloseHandle(void *h)')
    _CreateToolhelp32Snapshot = kernel32.func(
      'HANDLE __stdcall CreateToolhelp32Snapshot(uint32_t flags, uint32_t pid)'
    )

    _PROCESSENTRY32 = koffi.struct('PROCESSENTRY32', {
      dwSize: 'uint32_t',
      cntUsage: 'uint32_t',
      th32ProcessID: 'uint32_t',
      th32DefaultHeapID: 'uintptr_t',
      th32ModuleID: 'uint32_t',
      cntThreads: 'uint32_t',
      th32ParentProcessID: 'uint32_t',
      pcPriClassBase: 'int32_t',
      dwFlags: 'uint32_t',
      szExeFile: koffi.array('char', MAX_PATH)
    })

    // 注意：这里刻意用 void* + Buffer 手动解析，而不是 koffi 的 struct 绑定。
    // 实测在 Electron 28 自带的 Node 18 上，koffi 的 struct 回写会让 Process32Next 提前失败
    // （枚举到 27 个进程就停），导致找不到 LeagueClientUx；Buffer 方式在 Node 18/24 上都稳定。
    _Process32First = kernel32.func(
      'int32_t __stdcall Process32First(void *h, void *pe)'
    )
    _Process32Next = kernel32.func(
      'int32_t __stdcall Process32Next(void *h, void *pe)'
    )
    _RtlMoveMemory = kernel32.func(
      'void __stdcall RtlMoveMemory(_Out_ void *dest, _In_ const void *src, size_t len)'
    )

    return true
  } catch (e: any) {
    _initError = e?.message || String(e)
    console.error(`[lcuReader] koffi init failed: ${_initError}`)
    return false
  }
}

/** PROCESSENTRY32 的字段偏移（x64，ANSI 版本，sizeof = 304）。 */
const PE32_SIZE = 304
const PE32_PROCESS_ID_OFFSET = 8
const PE32_EXE_NAME_OFFSET = 44
const PE32_EXE_NAME_LENGTH = 260

/**
 * 备用 PID 来源：某些环境下 CreateToolhelp32Snapshot 只能枚举到一小部分进程
 * （实测 Electron 28 自带的 Node 18 上只能看到 27 个，找不到 LeagueClientUx），
 * 这时用 tasklist 拿 PID，再用 koffi 读命令行 —— 读命令行这条路是通的。
 */
function findLcuProcessIdsViaTasklist(): number[] {
  try {
    const output = execFileSync(
      'tasklist',
      ['/FI', 'IMAGENAME eq ' + LCU_PROCESS_NAME, '/FO', 'CSV', '/NH'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }
    )
    const pids: number[] = []
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/^"LeagueClientUx\.exe","(\d+)"/i)
      if (match) {
        pids.push(Number(match[1]))
      }
    }
    return pids
  } catch {
    return []
  }
}

function findLcuProcessIds(): number[] {
  const viaSnapshot = findLcuProcessIdsViaSnapshot()
  if (viaSnapshot.length > 0) {
    return viaSnapshot
  }
  return findLcuProcessIdsViaTasklist()
}

function findLcuProcessIdsViaSnapshot(): number[] {
  if (!ensureInitialized()) return []
  const pids: number[] = []
  const snapshot = _CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
  if (!snapshot) return pids

  try {
    const buffer = Buffer.alloc(PE32_SIZE)
    buffer.writeUInt32LE(PE32_SIZE, 0)

    if (_Process32First(snapshot, buffer) !== 0) {
      do {
        const processId = buffer.readUInt32LE(PE32_PROCESS_ID_OFFSET)
        const exeName = readFixedCString(buffer, PE32_EXE_NAME_OFFSET, PE32_EXE_NAME_LENGTH)
        if (exeName && exeName.toLowerCase() === LCU_PROCESS_NAME.toLowerCase()) {
          pids.push(processId)
        }
        buffer.writeUInt32LE(PE32_SIZE, 0)
      } while (_Process32Next(snapshot, buffer) !== 0)
    }
  } finally {
    _CloseHandle(snapshot)
  }
  return pids
}

/** 从定长 char 数组里读 C 字符串。 */
function readFixedCString(buffer: Buffer, offset: number, maxLength: number): string {
  const end = Math.min(offset + maxLength, buffer.length)
  let zero = -1
  for (let index = offset; index < end; index += 1) {
    if (buffer[index] === 0) {
      zero = index
      break
    }
  }
  return buffer.toString('latin1', offset, zero === -1 ? end : zero)
}

function readCString(arr: any): string {
  if (typeof arr === 'string') return arr
  if (Buffer.isBuffer(arr)) {
    const zero = arr.indexOf(0)
    return arr.toString('latin1', 0, zero === -1 ? arr.length : zero)
  }
  if (Array.isArray(arr)) {
    let s = ''
    for (const b of arr) {
      if (b === 0) break
      s += String.fromCharCode(b)
    }
    return s
  }
  return ''
}

function getProcessCommandLine(pid: number): string | null {
  if (!ensureInitialized()) return null

  const handle = _OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
  if (!handle) return null

  try {
    let buf = Buffer.alloc(8192)
    const retLen = [0]
    let status = _NtQueryInformationProcess(
      handle,
      PROCESS_COMMAND_LINE_INFORMATION,
      buf,
      buf.length,
      retLen
    )

    if (status !== 0 && status !== 0x80000005) {
      return null
    }

    if (retLen[0] > buf.length) {
      buf = Buffer.alloc(retLen[0])
      status = _NtQueryInformationProcess(
        handle,
        PROCESS_COMMAND_LINE_INFORMATION,
        buf,
        buf.length,
        retLen
      )
      if (status !== 0) return null
    }

    const length = buf.readUInt16LE(0)
    if (length === 0) return null

    const bufferPtr = buf.readBigUInt64LE(8)
    if (bufferPtr === 0n) {
      const end = Math.min(16 + length, buf.length)
      return buf.toString('utf16le', 16, end)
    }

    const dst = Buffer.alloc(length)
    try {
      _RtlMoveMemory(dst, bufferPtr, length)
    } catch {
      const end = Math.min(16 + length, buf.length)
      return buf.toString('utf16le', 16, end)
    }
    return dst.toString('utf16le')
  } finally {
    _CloseHandle(handle)
  }
}

function extractAuthInfo(commandLine: string): LcuAuthInfo | null {
  if (!commandLine) return null
  const portMatch = commandLine.match(/--app-port=(\d+)/)
  const tokenMatch = commandLine.match(/--remoting-auth-token=([^\s"']+)/)
  if (!portMatch || !tokenMatch) return null
  return {
    port: portMatch[1],
    token: tokenMatch[1],
    pid: null
  }
}

/** 已找到的 LCU 进程（同一次客户端会话内 pid 不变，缓存起来避免反复扫描）。 */
let cachedLcuPid: number | null = null

/** PID 扫描上限：覆盖 Windows 常见 PID 范围。 */
const MAX_SCAN_PID = 65536

/**
 * 兜底方案：逐个 PID 直接读命令行。
 *
 * <p>腾讯的反作弊（ACE）会把游戏进程从进程列表里隐藏 —— tasklist、Toolhelp 快照都看不到
 * LeagueClientUx（实测 Electron 里只能枚举到 27 个进程），但按已知 PID 直接
 * OpenProcess + NtQueryInformationProcess 仍然可读。实测扫一遍约 2 毫秒。
 */
function findAuthByPidScan(): LcuAuthInfo | null {
  for (let pid = 4; pid < MAX_SCAN_PID; pid += 1) {
    const commandLine = getProcessCommandLine(pid)
    if (!commandLine || !commandLine.includes('--remoting-auth-token')) {
      continue
    }
    const auth = extractAuthInfo(commandLine)
    if (auth) {
      auth.pid = pid
      return auth
    }
  }
  return null
}

export function getLcuAuthInfo(): LcuAuthInfo | null {
  if (!ensureInitialized()) return null

  // 1) 先试缓存里的 pid
  if (cachedLcuPid !== null) {
    const cached = extractAuthInfo(getProcessCommandLine(cachedLcuPid) ?? '')
    if (cached) {
      cached.pid = cachedLcuPid
      return cached
    }
    cachedLcuPid = null
  }

  // 2) 常规枚举（快照 / tasklist）
  for (const pid of findLcuProcessIds()) {
    const auth = extractAuthInfo(getProcessCommandLine(pid) ?? '')
    if (auth) {
      auth.pid = pid
      cachedLcuPid = pid
      return auth
    }
  }

  // 3) 兜底：反作弊隐藏进程列表时，逐个 PID 试
  const scanned = findAuthByPidScan()
  if (scanned) {
    cachedLcuPid = scanned.pid
  }
  return scanned
}

export function isLcuReaderAvailable(): boolean {
  return ensureInitialized()
}

/** 诊断信息：LCU 凭据读不到时，用这个看卡在哪一步。 */
export interface LcuReaderDiagnostics {
  available: boolean
  initError: string | null
  pids: number[]
  commandLineLength: number
  commandLineError: string | null
  authFound: boolean
}

export function diagnoseLcuReader(): LcuReaderDiagnostics {
  const available = ensureInitialized()
  const diagnostics: LcuReaderDiagnostics = {
    available,
    initError: _initError,
    pids: [],
    commandLineLength: -1,
    commandLineError: null,
    authFound: false
  }
  if (!available) {
    return diagnostics
  }
  diagnostics.pids = findLcuProcessIds()
  if (diagnostics.pids.length === 0) {
    const scanned = findAuthByPidScan()
    diagnostics.commandLineError = scanned
      ? '进程列表被隐藏，PID 扫描成功（pid=' + scanned.pid + '）'
      : '进程列表被隐藏，PID 扫描也没找到'
    diagnostics.authFound = scanned !== null
    return diagnostics
  }
  for (const pid of diagnostics.pids) {
    const commandLine = getProcessCommandLine(pid)
    if (!commandLine) {
      diagnostics.commandLineError = 'OpenProcess 或 NtQueryInformationProcess 失败（进程受保护/权限不足）'
      continue
    }
    diagnostics.commandLineLength = commandLine.length
    diagnostics.commandLineError = null
    if (extractAuthInfo(commandLine)) {
      diagnostics.authFound = true
      break
    }
  }
  return diagnostics
}
