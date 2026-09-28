/**
 * 下载 OCR 校准用的真实游戏截图（来自 aramgg_client 的测试集）。
 *
 * 这些截图是第三方资源（该仓库未声明 LICENSE），所以**不纳入本仓库**，
 * 需要时跑一次这个脚本即可；ocr-calibrate.mjs 在缺少截图时会自动跳过。
 *
 *   cd rankpeek-frontend && node scripts/devtools/fetch-ocr-fixtures.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://raw.githubusercontent.com/valkia/aramgg_client/master/tests/fixtures/augment-ocr'
const FILES = ['manifest.json', 'full-three-cards.png', 'partial-one-card.png', 'no-match-title-activity.png']
const TARGET = path.join(process.cwd(), 'tests', 'fixtures', 'augment-ocr')

await mkdir(TARGET, { recursive: true })
for (const file of FILES) {
  try {
    const response = await fetch(BASE + '/' + file)
    if (!response.ok) {
      console.log('[skip]', file, 'HTTP', response.status)
      continue
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(path.join(TARGET, file), buffer)
    console.log('[ok]  ', file, buffer.length, 'bytes')
  } catch (error) {
    console.log('[fail]', file, String(error))
  }
}
