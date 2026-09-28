import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Missing ${label}: ${needle}`)
  }
}

function assertMatches(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`Missing ${label}: ${pattern}`)
  }
}

function assertNotIncludes(source, needle, label) {
  if (source.includes(needle)) {
    throw new Error(`Unexpected ${label}: ${needle}`)
  }
}

const home = read('rankpeek-frontend/src/renderer/views/HomeView.vue')
const insights = read('rankpeek-frontend/src/renderer/utils/homeInsights.ts')
const zhCN = read('rankpeek-frontend/src/renderer/i18n/locales/zh-CN.ts')
const enUS = read('rankpeek-frontend/src/renderer/i18n/locales/en-US.ts')

assertNotIncludes(home, 'StatusCard', 'legacy status card')
assertIncludes(home, 'account-panel', 'current account panel')
assertIncludes(home, 'disconnected-panel', 'disconnected account replacement')
assertIncludes(home, 'ai-analysis-card', 'AI analysis panel')
assertIncludes(home, 'auto-analysis-toggle', 'manual auto-analysis toggle')
assertIncludes(home, 'analysis-role-select', 'role select')
assertIncludes(home, 'analysis-metric-select', 'metric select')
assertIncludes(home, 'growth-chart', 'growth chart')
assertIncludes(home, 'fortune-card', 'cyber fortune panel')
assertIncludes(home, 'slot-reel', 'slot-machine rolling effect')
assertIncludes(home, 'drawFortune', 'fortune draw action')
assertIncludes(home, 'runAnalysis', 'AI analysis action')

assertIncludes(insights, 'MIN_ANALYSIS_MATCHES = 10', 'minimum analysis match rule')
assertIncludes(insights, 'MAX_ANALYSIS_MATCHES = 20', 'maximum analysis match rule')
assertMatches(insights, /AUTO_ANALYSIS_INTERVALS\s*=\s*\[10,\s*20\]/, '10/20 auto analysis intervals')
assertNotIncludes(insights, '30', 'removed 30-game auto analysis interval')
assertIncludes(insights, 'FORTUNE_POOL', 'fortune pool')
assertIncludes(insights, 'recentIds', 'weekly non-repeat rule')
assertIncludes(insights, 'rankpeek.home.fortune', 'fortune local persistence key')
assertIncludes(insights, 'rankpeek.home.analysis', 'analysis local persistence key')

for (const messages of [zhCN, enUS]) {
  assertIncludes(messages, "'home.currentAccount'", 'localized current account title')
  assertIncludes(messages, "'home.aiAnalysis'", 'localized AI analysis title')
  assertIncludes(messages, "'home.cyberFortune'", 'localized cyber fortune title')
  assertIncludes(messages, "'home.fortuneDisclaimer'", 'localized fortune disclaimer')
}

console.log('Home AI shell checks passed.')
