import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const scanRoots = [
  'rankpeek-frontend/src',
  'rankpeek-frontend/package.json'
]

const allowedExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx',
  '.vue'
])

const forbiddenPatterns = [
  { label: 'legacy cloud server base URL symbol', pattern: /RANKPEEK_SERVER_BASE_URL/g },
  { label: 'legacy auth client', pattern: /rankpeekAuthClient/g },
  { label: 'legacy credits client', pattern: /rankpeekCreditsClient/g }
]

const ignoredDirectories = new Set(['dist', 'node_modules', 'release', 'target'])
const findings = []

function scanPath(absolutePath) {
  if (!existsSync(absolutePath)) {
    return
  }

  const stats = statSync(absolutePath)
  if (stats.isDirectory()) {
    scanDirectory(absolutePath)
    return
  }

  scanFile(absolutePath)
}

function scanDirectory(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue
    }

    scanPath(path.join(directory, entry))
  }
}

function scanFile(absolutePath) {
  if (!allowedExtensions.has(path.extname(absolutePath))) {
    return
  }

  const relativePath = path.relative(repoRoot, absolutePath).replaceAll(path.sep, '/')
  const lines = readFileSync(absolutePath, 'utf8').split(/\r?\n/)

  lines.forEach((line, index) => {
    for (const { label, pattern } of forbiddenPatterns) {
      pattern.lastIndex = 0
      if (pattern.test(line)) {
        findings.push(`${relativePath}:${index + 1}: ${label}: ${line.trim()}`)
        break
      }
    }
  })
}

for (const relativeRoot of scanRoots) {
  scanPath(path.join(repoRoot, relativeRoot))
}

if (findings.length > 0) {
  console.error('Legacy RankPeek cloud server references found in shipping frontend code:')
  for (const finding of findings) {
    console.error(`- ${finding}`)
  }
  process.exit(1)
}

console.log('No legacy RankPeek cloud server references found in shipping frontend code.')
