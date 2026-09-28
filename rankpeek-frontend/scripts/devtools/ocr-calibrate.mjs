/**
 * OCR 区域校准 / 回归：用真实游戏截图验证「裁剪 -> OCR -> 匹配」整条链路。
 *
 *   cd rankpeek-frontend && node scripts/devtools/ocr-calibrate.mjs
 *
 * 截图来自 aramgg_client 的测试集（tests/fixtures/augment-ocr），带期望结果。
 * 改了 augmentRegionPolicy.ts 的坐标后跑一下，确认三张卡都能认出来。
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { recognizeAugmentTitles } from '../../src/main/hextechOcr.ts'
import { matchAugmentTitles } from '../../src/renderer/services/augmentTitleMatcher.ts'
import { toPixelRegions } from '../../src/renderer/services/augmentRegionPolicy.ts'

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures', 'augment-ocr')

async function loadCandidates() {
  // 用全量强化定义当候选集：101 榜单只有被统计到的 211 个，像「裁决使」这种没进榜单的会漏识别
  const response = await fetch('http://127.0.0.1:8080/api/v1/hextech/augment-definitions')
  const payload = await response.json()
  return payload.data.map((row) => ({ augmentId: row.augmentId, name: row.name || '' }))
}

async function cropRegion(image, region) {
  const { data, info } = await sharp(image)
    .extract({ left: region.x, top: region.y, width: region.width, height: region.height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, data }
}

const candidates = await loadCandidates()
console.log('candidates:', candidates.length)

const manifest = JSON.parse(await readFile(path.join(FIXTURES, 'manifest.json'), 'utf-8'))
let failures = 0

for (const entry of manifest) {
  const filePath = path.join(FIXTURES, entry.file)
  let image
  try {
    image = await readFile(filePath)
  } catch {
    console.log('[skip]', entry.file, '(not downloaded)')
    continue
  }
  const meta = await sharp(image).metadata()
  const regions = toPixelRegions(meta.width, meta.height)
  const crops = []
  for (const region of regions) {
    crops.push(await cropRegion(image, region))
  }
  const outcome = await recognizeAugmentTitles(crops)
  const matches = matchAugmentTitles(outcome.texts, candidates)
  const gotNames = matches.map((m) => m.name)
  const expected = entry.expectedNames
  const ok = gotNames.length === expected.length && expected.every((name) => gotNames.includes(name))
  if (!ok) failures += 1
  console.log((ok ? '[PASS] ' : '[FAIL] ') + entry.file)
  console.log('   expected:', JSON.stringify(expected))
  console.log('   got     :', JSON.stringify(gotNames))
  console.log('   raw ocr :', JSON.stringify(outcome.texts))
  console.log('   regions :', JSON.stringify(regions.map((r) => r.x + ',' + r.y + ' ' + r.width + 'x' + r.height)))
}

console.log(failures === 0 ? 'CALIBRATION PASS' : 'CALIBRATION FAIL (' + failures + ')')
process.exit(failures === 0 ? 0 : 1)
