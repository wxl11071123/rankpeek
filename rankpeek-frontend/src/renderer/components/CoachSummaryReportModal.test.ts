import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const modalUrl = new URL('./CoachSummaryReportModal.vue', import.meta.url)

test('coach summary report modal exposes accessible dialog structure and close controls', () => {
  assert.equal(existsSync(modalUrl), true)
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /import CoachSummaryReportContent from '@\/components\/CoachSummaryReportContent\.vue'/)
  assert.match(source, /getCoachReportHeadline/)
  assert.doesNotMatch(source, /getCoachReportFinalSentence/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /aria-label="关闭/)
  assert.match(source, /emit\('close'\)/)
  assert.match(source, /@click\.self="emitClose"/)
  assert.match(source, /keydown/)
  assert.match(source, /Escape/)
  assert.match(source, /CoachSummaryReportContent/)
})

test('coach summary report modal exposes previous and next report navigation', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /canNavigate/)
  assert.match(source, /activeIndex/)
  assert.match(source, /reportCount/)
  assert.match(source, /\(event: 'previous'\): void/)
  assert.match(source, /\(event: 'next'\): void/)
  assert.match(source, /emit\('previous'\)/)
  assert.match(source, /emit\('next'\)/)
  assert.match(source, /aria-label="上一份报告"/)
  assert.match(source, /aria-label="下一份报告"/)
  assert.match(source, /coach-report-modal-nav/)
  assert.match(source, /coach-report-modal-nav-previous/)
  assert.match(source, /coach-report-modal-nav-next/)
  assert.match(source, /@click="emitPrevious"/)
  assert.match(source, /@click="emitNext"/)
})

test('coach summary report modal supports arrow keys without replacing escape close', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.key === 'ArrowLeft'/)
  assert.match(source, /event\.key === 'ArrowRight'/)
  assert.match(source, /emitPrevious\(\)/)
  assert.match(source, /emitNext\(\)/)
})

test('coach summary report modal header uses the report headline instead of final negative summary', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.doesNotMatch(source, /AI 复盘报告/)
  assert.doesNotMatch(source, /DEV 预览/)
  assert.doesNotMatch(source, /这是一份仅用于开发环境/)
  assert.match(source, /coach-report-modal-final-sentence/)
  assert.match(source, /class="coach-report-modal-final-sentence ai-report-prose"/)
  assert.match(source, /<h2 id="coach-report-modal-title" class="coach-report-modal-final-sentence ai-report-prose">\{\{ finalSentence \}\}<\/h2>/)
  assert.match(source, /getCoachReportHeadline\(\{ report: props\.report \}\)/)
  assert.match(source, /\.coach-report-modal-final-sentence\.ai-report-prose\s*\{[\s\S]*font-family:\s*"Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif/)
  assert.match(source, /\.coach-report-modal-title h2\s*\{[\s\S]*font-size:\s*30px/)
  assert.match(source, /\.ai-report-prose\s*\{[\s\S]*"Noto Serif SC"/)
  assert.match(source, /\.ai-report-prose\s*\{[\s\S]*"Source Han Serif SC"/)
  assert.match(source, /\.ai-report-prose\s*\{[\s\S]*"Songti SC"/)
  assert.match(source, /\.ai-report-prose\s*\{[\s\S]*"SimSun"/)
  assert.match(source, /\.ai-report-prose\s*\{[\s\S]*serif/)
  assert.match(source, /id="coach-report-modal-title"[\s\S]*\{\{ finalSentence \}\}/)
  assert.doesNotMatch(source, /<p>\{\{ isPreview/)
  assert.doesNotMatch(source, /<span>\{\{ subtitle \}\}<\/span>/)
  assert.match(source, /class="coach-report-modal-close"/)
  assert.match(source, /type="button"/)
})

test('coach summary report modal uses a fixed overlay and scrollable content area without third-party UI', () => {
  const source = readFileSync(modalUrl, 'utf8')

  assert.match(source, /\.coach-report-modal-overlay[\s\S]*position:\s*fixed/)
  assert.match(source, /width:\s*min\(1180px, calc\(100vw - 96px\)\)/)
  assert.match(source, /max-height:\s*calc\(100vh - 72px\)/)
  assert.match(source, /\.coach-report-modal-body[\s\S]*overflow-y:\s*auto/)
  assert.match(source, /width:\s*calc\(100vw - 32px\)/)
  assert.doesNotMatch(source, /element-plus|ant-design|naive-ui|vuetify|headlessui/i)
})
