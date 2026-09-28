import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('retired standalone tag routes redirect to active pages', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

  assert.match(source, /path:\s*'\/user-tag'[\s\S]*redirect:\s*'\/summoner'/)
  assert.match(source, /path:\s*'\/tag-config'[\s\S]*redirect:\s*'\/settings'/)
  assert.doesNotMatch(source, /import\('@\/views\/UserTagView\.vue'\)/)
  assert.doesNotMatch(source, /import\('@\/views\/TagConfigView\.vue'\)/)
  assert.doesNotMatch(source, /titleKey:\s*'nav\.userTag'/)
  assert.doesNotMatch(source, /titleKey:\s*'nav\.tagConfig'/)
})

test('OP.GG route uses standalone window layout metadata', () => {
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')

  assert.match(source, /path:\s*'\/opgg'/)
  assert.match(source, /name:\s*'OpggWindow'/)
  assert.match(source, /import\('@\/views\/OpggWindowView\.vue'\)/)
  assert.match(source, /meta:\s*\{[\s\S]*standalone:\s*true[\s\S]*\}/)
})
