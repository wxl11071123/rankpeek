import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const forbiddenFiles = [
  'rankpeek-frontend/src/renderer/views/AutomationView.vue',
  'rankpeek-frontend/src/renderer/components/home/QuickActions.vue',
  'rankpeek-frontend/src/renderer/stores/automation.ts',
  'rankpeek-backend/src/main/java/io/rankpeek/controller/AutomationController.java',
  'rankpeek-backend/src/main/java/io/rankpeek/service/AutomationService.java',
  'rankpeek-backend/src/main/java/io/rankpeek/service/BaseAutomationTask.java'
]

const scanRoots = [
  'rankpeek-frontend/src',
  'rankpeek-backend/src/main/java',
  'rankpeek-backend/src/main/resources'
]

const forbiddenPatterns = [
  /useAutomationStore/g,
  /AutomationStatus/g,
  /QuickActions/g,
  /\/automation/g,
  /nav\.automation/g,
  /quickActions\./g,
  /automation\./g,
  /autoAccept/g,
  /autoMatch/g,
  /autoPick/g,
  /autoBan/g,
  /auto_accept/g,
  /auto_match/g,
  /auto_pick/g,
  /auto_ban/g,
  /startMatchSwitch/g,
  /acceptMatchSwitch/g,
  /pickChampionSwitch/g,
  /banChampionSwitch/g,
  /pickChampionSlice/g,
  /banChampionSlice/g,
  /settings\.auto/g,
  /AutomationController/g,
  /AutomationService/g,
  /BaseAutomationTask/g
]

const allowedExtensions = new Set([
  '.css',
  '.html',
  '.java',
  '.json',
  '.ts',
  '.vue',
  '.yml',
  '.yaml'
])

const findings = []

for (const relativeFile of forbiddenFiles) {
  const absoluteFile = path.join(repoRoot, relativeFile)
  if (existsSync(absoluteFile)) {
    findings.push(`${relativeFile}: file should be removed`)
  }
}

function scanDirectory(directory) {
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry)
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      if (['dist', 'node_modules', 'target'].includes(entry)) {
        continue
      }
      scanDirectory(absolutePath)
      continue
    }

    if (!allowedExtensions.has(path.extname(entry))) {
      continue
    }

    const relativePath = path.relative(repoRoot, absolutePath).replaceAll(path.sep, '/')
    const text = readFileSync(absolutePath, 'utf8')
    const lines = text.split(/\r?\n/)

    lines.forEach((line, index) => {
      for (const pattern of forbiddenPatterns) {
        pattern.lastIndex = 0
        if (pattern.test(line)) {
          findings.push(`${relativePath}:${index + 1}: ${line.trim()}`)
          break
        }
      }
    })
  }
}

for (const relativeRoot of scanRoots) {
  scanDirectory(path.join(repoRoot, relativeRoot))
}

if (findings.length > 0) {
  console.error('Old automation feature remnants found:')
  for (const finding of findings) {
    console.error(`- ${finding}`)
  }
  process.exit(1)
}

console.log('No old automation feature remnants found.')
