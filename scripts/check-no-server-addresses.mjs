// 开源闸门：仓库里不允许出现任何真实服务器地址。
//
// 为什么用「IPv4 字面量」而不是「某个具体 IP」：闸门自己也不能把地址写出来。
// 自建服务端的地址只存在于 rankpeek-backend/src/main/resources/endpoints.properties
// （已被 .gitignore 忽略）和部署脚本里，永远不会出现在扫描范围内。
//
// 用法：node scripts/check-no-server-addresses.mjs
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const scanRoots = [
  'rankpeek-frontend/src',
  'rankpeek-backend/src',
  'docs',
  'README.md',
  'README.zh-CN.md',
  'PRIVACY.md'
]

const textExtensions = new Set([
  '.css', '.html', '.java', '.js', '.json', '.md', '.mjs', '.mts',
  '.properties', '.ts', '.tsx', '.vue', '.xml', '.yaml', '.yml'
])

const ignoredDirectories = new Set(['dist', 'node_modules', 'release', 'target', 'fixtures', '.git'])
const skippedFiles = new Set(['endpoints.properties'])

// 只放行本机回环地址；其余任何 IPv4 字面量都算泄露。
const allowedAddresses = new Set(['127.0.0.1', '0.0.0.0'])
const ipv4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g

// 每段都必须 <= 255。游戏版本号长得像 IP（例如 16.9.810.100），靠这一条排除掉。
function isIpv4Literal(candidate) {
  return candidate.split('.').every((octet) => Number(octet) <= 255)
}

const findings = []

function scanPath(absolutePath) {
  if (!existsSync(absolutePath)) return
  if (statSync(absolutePath).isDirectory()) {
    for (const entry of readdirSync(absolutePath)) {
      if (ignoredDirectories.has(entry)) continue
      scanPath(path.join(absolutePath, entry))
    }
    return
  }
  scanFile(absolutePath)
}

function scanFile(absolutePath) {
  if (!textExtensions.has(path.extname(absolutePath))) return
  if (skippedFiles.has(path.basename(absolutePath))) return

  const relativePath = path.relative(repoRoot, absolutePath).replaceAll(path.sep, '/')
  const lines = readFileSync(absolutePath, 'utf8').split(/\r?\n/)

  lines.forEach((line, index) => {
    for (const match of line.matchAll(ipv4)) {
      if (allowedAddresses.has(match[0])) continue
      if (!isIpv4Literal(match[0])) continue
      findings.push(`${relativePath}:${index + 1}: ${match[0]}`)
    }
  })
}

for (const relativeRoot of scanRoots) {
  scanPath(path.join(repoRoot, relativeRoot))
}

if (findings.length > 0) {
  console.error('Server address found in files that go into the public repository:')
  for (const finding of findings) {
    console.error(`- ${finding}`)
  }
  console.error('')
  console.error('Move the value into rankpeek-backend/src/main/resources/endpoints.properties (git-ignored)')
  console.error('or an environment variable / Spring property, and leave a placeholder in the source.')
  process.exit(1)
}

console.log('No server addresses found in public-repository files.')
