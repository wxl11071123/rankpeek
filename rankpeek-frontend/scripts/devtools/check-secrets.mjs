#!/usr/bin/env node
/**
 * 打包前的密钥闸门：任何看起来像密钥的东西出现在「会被打进安装包」的范围里，就构建失败。
 *
 * 范围（= electron-builder 真正会收进包里的东西）：
 *   - rankpeek-frontend/dist          （渲染进程/主进程/预加载构建产物）
 *   - rankpeek-frontend/public        （extraResources，除了 game-assets）
 *   - rankpeek-frontend/package.json
 *   - rankpeek-frontend/src           （源码，防患于未然）
 *   - rankpeek-backend/src/main/resources （application.yml 会被编译进 rankpeek-native.exe）
 *
 * 想放行某一行，在那一行加注释 `// secret-guard:allow`。
 *
 * 用法：npm run check:secrets
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.resolve(HERE, '..', '..')
const ROOT = path.resolve(FRONTEND, '..')

const ROOTS = [
  path.join(FRONTEND, 'dist'),
  path.join(FRONTEND, 'public'),
  path.join(FRONTEND, 'package.json'),
  path.join(FRONTEND, 'src'),
  path.join(ROOT, 'rankpeek-backend', 'src', 'main', 'resources')
]

const SKIP_DIRS = new Set(['node_modules', '.git', 'game-assets'])
const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|jsx|vue|json|yml|yaml|properties|xml|html|css|txt|md)$/i
const MAX_BYTES = 8 * 1024 * 1024

const RULES = [
  ['DeepSeek / OpenAI 风格的 sk- 密钥', /sk-[A-Za-z0-9_-]{20,}/g],
  ['aramgg API Key', /hx_live_[A-Za-z0-9]{8,}/g],
  ['私有密钥块', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['硬编码的 key/secret 字面量', /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|bearer[_-]?token)\s*[:=]\s*['"`][A-Za-z0-9_\-.]{20,}['"`]/gi],
  ['硬编码的 Bearer 令牌', /Bearer\s+[A-Za-z0-9._-]{24,}/g],
  ['AWS Access Key', /AKIA[0-9A-Z]{16}/g],
  ['GitHub Token', /(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/g],
  ['Slack Token', /xox[baprs]-[A-Za-z0-9-]{10,}/g]
]

/** 允许出现的已知安全字面量（不是密钥，只是名字里带 key/token）。 */
const ALLOWED = [
  /DEEPSEEK_MAINLAND_PRICING_CNY_PER_MILLION/,
  /postgameAutoOpenLatestMatchToken/,
  /hx_live_\.\.\./, // 文档里的占位符
  /secret-guard:allow/
]

const findings = []
let scanned = 0

function walk(target) {
  let stat
  try {
    stat = fs.statSync(target)
  } catch {
    return
  }
  if (stat.isFile()) {
    scanFile(target)
    return
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      walk(path.join(target, entry.name))
    } else if (entry.isFile()) {
      scanFile(path.join(target, entry.name))
    }
  }
}

function scanFile(file) {
  if (!TEXT_EXT.test(file)) return
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return
  }
  if (stat.size > MAX_BYTES) return
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return
  }
  scanned += 1
  const lines = text.split(/\r?\n/)
  for (const [label, pattern] of RULES) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text)) !== null) {
      const lineNo = text.slice(0, match.index).split(/\r?\n/).length
      const line = lines[lineNo - 1] || ''
      if (ALLOWED.some((allowed) => allowed.test(line) || allowed.test(match[0]))) continue
      findings.push({
        label,
        file: path.relative(ROOT, file),
        line: lineNo,
        sample: match[0].slice(0, 24) + (match[0].length > 24 ? '…' : '')
      })
      if (findings.length > 60) return
    }
  }
}

/** .env 之类会带真值的文件绝不允许进包（.env.example 只是占位说明）。 */
function checkEnvFiles() {
  for (const dir of [FRONTEND, path.join(FRONTEND, 'public'), path.join(FRONTEND, 'dist')]) {
    let entries = []
    try {
      entries = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (/^\.env/.test(name) && name !== '.env.example') {
        findings.push({ label: '会被打包的 .env 文件', file: path.relative(ROOT, path.join(dir, name)), line: 0, sample: name })
      }
    }
  }
}

for (const root of ROOTS) walk(root)
checkEnvFiles()

if (findings.length > 0) {
  console.error('SECRET CHECK FAILED —— 这些东西会被打进安装包：')
  for (const f of findings) {
    console.error(`  [${f.label}] ${f.file}:${f.line}  ${f.sample}`)
  }
  console.error('\n处理：删掉硬编码的密钥，改成从环境变量 / 用户设置里读；确认安全的那一行加 // secret-guard:allow。')
  process.exit(1)
}

console.log(`SECRET CHECK PASS（扫了 ${scanned} 个文件，没发现密钥）`)
