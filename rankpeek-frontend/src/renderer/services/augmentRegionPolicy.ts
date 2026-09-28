/**
 * 强化候选的截图区域策略。
 *
 * 只截三个固定区域（写死相对坐标，随分辨率缩放），不做全屏 OCR —— 噪声少、速度快，
 * 这是 docs/hextech-data-plan.md §7.2 的第一层。
 *
 * ⚠️ 下面的坐标是**相对比例**（0~1），需要按实际游戏画面校准一次：
 *    1. 进入海斗并等到强化选择界面
 *    2. 按 Ctrl+Shift+A 打开悬浮窗，点「校准」（待实现）或直接用截图工具量出三个标题框
 *    3. 把量到的像素除以屏幕宽高，替换下面的数字
 * 校准后请把数值写回本文件并提交。
 */

export interface NormalizedRegion {
  x: number
  y: number
  width: number
  height: number
}

export interface PixelRegion {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 三张卡片的标题区域（相对比例）。
 *
 * 已用真实 1920x1080 游戏截图校准（tests/fixtures/augment-ocr/full-three-cards.png）：
 * 三张卡标题文字都落在 y≈0.37~0.43、卡片中心 x≈0.311 / 0.503 / 0.690。
 * 改完请跑 `node scripts/devtools/ocr-calibrate.mjs` 验证。
 */
export const AUGMENT_TITLE_REGIONS: NormalizedRegion[] = [
  { x: 0.246, y: 0.370, width: 0.130, height: 0.060 },
  { x: 0.438, y: 0.370, width: 0.130, height: 0.060 },
  { x: 0.625, y: 0.370, width: 0.130, height: 0.060 }
]

/** 16:9 分辨率白名单：其他比例（带鱼屏/窗口化）需要重新校准。 */
export function isSupportedAspectRatio(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) {
    return false
  }
  const ratio = width / height
  return Math.abs(ratio - 16 / 9) < 0.02
}

/** 相对区域 → 像素区域，结果取整并夹在屏幕范围内。 */
export function toPixelRegion(region: NormalizedRegion, screenWidth: number, screenHeight: number): PixelRegion {
  const x = clamp(Math.round(region.x * screenWidth), 0, Math.max(0, screenWidth - 1))
  const y = clamp(Math.round(region.y * screenHeight), 0, Math.max(0, screenHeight - 1))
  const width = clamp(Math.round(region.width * screenWidth), 1, screenWidth - x)
  const height = clamp(Math.round(region.height * screenHeight), 1, screenHeight - y)
  return { x, y, width, height }
}

export function toPixelRegions(screenWidth: number, screenHeight: number): PixelRegion[] {
  return AUGMENT_TITLE_REGIONS.map((region) => toPixelRegion(region, screenWidth, screenHeight))
}

function clamp(value: number, low: number, high: number): number {
  if (Number.isNaN(value)) {
    return low
  }
  return Math.min(Math.max(value, low), high)
}
