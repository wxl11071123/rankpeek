import { desktopCapturer, screen } from 'electron'
import { toPixelRegions } from '../renderer/services/augmentRegionPolicy'
import type { ImageInput } from './hextechOcr'

/**
 * 抓取三个强化标题区域的像素。
 *
 * 只截固定区域（不做全屏 OCR）：噪声少、速度快，这是 docs/hextech-data-plan.md §7.2 的第一层。
 * 区域是相对坐标（augmentRegionPolicy），所以换分辨率不用改代码 —— 但首次需要按实际画面校准一次。
 */
export interface CaptureOutcome {
  images: ImageInput[]
  screenWidth: number
  screenHeight: number
  /**
   * 三个标题区域的 PNG（排查/校准时直接落盘用）。
   *
   * 编码整屏 PNG 一次要几百毫秒，轮询时绝不能顺手做掉 —— 所以这两个都是
   * 「真要落盘才调用」的惰性函数。轮询只做裁剪 + 取像素。
   */
  encodeSlotPngs: () => Buffer[]
  /** 整屏 PNG：识别到强化时自动存一份，玩家不用自己截图。 */
  encodeFullFramePng: () => Buffer
}

/**
 * 抓屏缩放系数。
 *
 * 1080p 全尺寸抓一次要 400~600ms（Chromium 的桌面抓屏本身就这个价），
 * 降到 2/3 只要一百多毫秒 —— 用真实对局截图跑过 OCR 对比：三张卡标题
 * 在 1.0 / 0.667 / 0.533 三档下都认得出来，噪声反而更少。
 * 区域是相对坐标（augmentRegionPolicy），缩放后自动跟着变，不用改校准。
 */
const CAPTURE_SCALE = 0.667

export async function captureAugmentTitleImages(): Promise<CaptureOutcome> {
  const display = screen.getPrimaryDisplay()
  const width = Math.round(display.size.width * display.scaleFactor * CAPTURE_SCALE)
  const height = Math.round(display.size.height * display.scaleFactor * CAPTURE_SCALE)

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  })
  const source = sources[0]
  if (!source) {
    throw new Error('没有可用的屏幕画面')
  }

  const screenshot = source.thumbnail
  const size = screenshot.getSize()
  if (size.width <= 0 || size.height <= 0) {
    throw new Error('截图为空（可能被系统限制）')
  }

  const images: ImageInput[] = []
  const crops: Electron.NativeImage[] = []
  for (const region of toPixelRegions(size.width, size.height)) {
    const cropped = screenshot.crop(region)
    const croppedSize = cropped.getSize()
    images.push({
      width: croppedSize.width,
      height: croppedSize.height,
      data: bgraToRgba(cropped.toBitmap())
    })
    crops.push(cropped)
  }
  return {
    images,
    screenWidth: size.width,
    screenHeight: size.height,
    encodeSlotPngs: () => crops.map((cropped) => cropped.toPNG()),
    encodeFullFramePng: () => screenshot.toPNG()
  }
}

/** Electron 的 toBitmap() 是 BGRA，OCR 期望 RGBA，交换 R/B 通道。 */
function bgraToRgba(bitmap: Buffer): Uint8Array {
  const out = new Uint8Array(bitmap.length)
  for (let index = 0; index + 3 < bitmap.length; index += 4) {
    out[index] = bitmap[index + 2]
    out[index + 1] = bitmap[index + 1]
    out[index + 2] = bitmap[index]
    out[index + 3] = 255
  }
  return out
}
