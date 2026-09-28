/**
 * OCR 自检：不需要进游戏，用合成图验证「模型下载 -> 推理 -> 文本」整条链路。
 *
 *   cd rankpeek-frontend && node scripts/devtools/ocr-selftest.mjs
 *
 * 首次运行会下载约 20 MB 模型到 %LOCALAPPDATA%\RankPeek\hextech\ocr-models。
 * 想换目录：设置环境变量 RANKPEEK_OCR_MODEL_DIR。
 */
import sharp from 'sharp'
import { matchAugmentTitles } from '../../src/renderer/services/augmentTitleMatcher.ts'
import { recognizeAugmentTitles } from '../../src/main/hextechOcr.ts'

const NAMES = ['魔鬼之舞', '无休回复', '物法皆修', '面包和奶酪', '魄罗爆破手', '坦克引擎']

function titleSvg(name, width = 336, height = 56, fontSize = 28) {
  return '<svg width="' + width + '" height="' + height + '" xmlns="http://www.w3.org/2000/svg">' +
    '<rect width="' + width + '" height="' + height + '" fill="#101418"/>' +
    '<text x="14" y="' + Math.round(height * 0.68) + '" font-family="Microsoft YaHei, SimHei, sans-serif" ' +
    'font-size="' + fontSize + '" fill="#ffffff">' + name + '</text></svg>'
}

async function imageFor(name) {
  const { data, info } = await sharp(Buffer.from(titleSvg(name))).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, data }
}

const images = []
for (const name of NAMES) {
  images.push(await imageFor(name))
}

const started = Date.now()
const outcome = await recognizeAugmentTitles(images)
console.log('available =', outcome.available, '| elapsed =', Date.now() - started, 'ms', outcome.message ? '| ' + outcome.message : '')
console.log('texts =', JSON.stringify(outcome.texts))

const candidates = NAMES.map((name, index) => ({ augmentId: index + 1, name }))
const matches = matchAugmentTitles(outcome.texts, candidates)
console.log('matches =', JSON.stringify(matches.map((m) => ({ id: m.augmentId, name: m.name, strategy: m.strategy, from: m.normalized }))))

const expected = new Set(NAMES)
const ok = matches.length === NAMES.length && matches.every((m) => expected.has(m.name))
console.log(ok ? 'SELFTEST PASS' : 'SELFTEST FAIL')
process.exit(ok ? 0 : 1)
