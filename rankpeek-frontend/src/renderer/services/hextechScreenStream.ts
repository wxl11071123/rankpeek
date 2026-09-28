import { toPixelRegions } from './augmentRegionPolicy.ts'

/**
 * 常驻抓屏流（局内 OCR 的快路径）。
 *
 * 为什么不用主进程的 `desktopCapturer.getSources`：它每调一次都要重开一次桌面
 * 抓屏会话，实测 ~450ms；降分辨率也没用（贵在会话本身）。这里开一条
 * `getUserMedia` 的桌面流，之后每轮只要把视频帧里的三小块 drawImage 出来，
 * 几毫秒就够，OCR 轮询才敢跑到 400ms 一次。
 */

/** 抓屏缩放与帧率：见 startScreenStream 里的说明。 */
const STREAM_SCALE = 0.667
const STREAM_FPS = 2

export interface ScreenCrop {
  width: number
  height: number
  data: Uint8Array
}

export interface ScreenStreamBridge {
  getHextechCaptureSource?: () => Promise<{ id: string; screenWidth: number; screenHeight: number } | null>
}

export interface ScreenStream {
  ready: boolean
  screenWidth: number
  screenHeight: number
  /** 抓三块标题区域（RGBA）。没就绪时返回空数组。 */
  grab: () => ScreenCrop[]
  /**
   * 已经送到的帧数。
   *
   * 独占全屏时 DXGI 抓屏会失败（日志里那些 0x887A0026），流会**冻在最后一帧**；
   * 这时候再 OCR 就是把上一局/上一波三选一的画面当成现在的画面 —— 面板会在
   * 不该出现的时候冒出来。调用方靠这个计数判断"画面有没有在动"。
   */
  frameCount: () => number
  stop: () => void
}

/** 开一条抓屏流；失败时返回 ready=false 的空壳，调用方回退到整屏抓图。 */
export async function startScreenStream(bridge: ScreenStreamBridge | undefined): Promise<ScreenStream> {
  const empty: ScreenStream = {
    ready: false,
    screenWidth: 0,
    screenHeight: 0,
    grab: () => [],
    frameCount: () => 0,
    stop: () => undefined
  }
  try {
    const source = await bridge?.getHextechCaptureSource?.()
    if (!source?.id) {
      console.warn('[hextech-stream] 拿不到抓屏源: ' + JSON.stringify(source ?? null))
      return empty
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // Electron 的桌面抓屏走这套老约束
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          // 抓屏是常驻的，成本几乎全在这两行上：1080p/5fps 实测要吃掉一个 CPU 核
          // （软件渲染下更狠），整台机器都会卡。降到 2/3 分辨率 + 2fps 够用：
          // OCR 区域是相对坐标会自动跟着缩放，真实截图在 0.667 档验证过认得出来。
          maxWidth: Math.round(source.screenWidth * STREAM_SCALE),
          maxHeight: Math.round(source.screenHeight * STREAM_SCALE),
          maxFrameRate: STREAM_FPS
        }
      } as unknown as MediaTrackConstraints
    })
    const video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    // 必须挂在文档里（离屏 video 可能不出帧），缩到 2px、几乎全透明，视觉上不可见
    video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1'
    document.body.appendChild(video)
    video.srcObject = stream
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('抓屏流超时')), 8000)
      video.onloadedmetadata = () => {
        window.clearTimeout(timer)
        resolve()
      }
      video.onerror = () => {
        window.clearTimeout(timer)
        reject(new Error('抓屏流打不开'))
      }
    })
    await video.play().catch(() => undefined)

    const width = video.videoWidth || source.screenWidth
    const height = video.videoHeight || source.screenHeight
    const regions = toPixelRegions(width, height)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      stream.getTracks().forEach((track) => track.stop())
      return empty
    }

    // 数帧：只有真的在出新帧，才值得去 OCR
    let frames = 0
    const videoWithCallback = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number
    }
    if (typeof videoWithCallback.requestVideoFrameCallback === 'function') {
      const onFrame = () => {
        frames += 1
        videoWithCallback.requestVideoFrameCallback?.(onFrame)
      }
      videoWithCallback.requestVideoFrameCallback(onFrame)
    }

    return {
      ready: true,
      screenWidth: width,
      screenHeight: height,
      frameCount: () => frames,
      grab: () => {
        const crops: ScreenCrop[] = []
        for (const region of regions) {
          const cropWidth = Math.max(1, Math.round(region.width))
          const cropHeight = Math.max(1, Math.round(region.height))
          canvas.width = cropWidth
          canvas.height = cropHeight
          context.drawImage(
            video,
            Math.round(region.x),
            Math.round(region.y),
            cropWidth,
            cropHeight,
            0,
            0,
            cropWidth,
            cropHeight
          )
          const image = context.getImageData(0, 0, cropWidth, cropHeight)
          crops.push({ width: cropWidth, height: cropHeight, data: new Uint8Array(image.data.buffer.slice(0)) })
        }
        return crops
      },
      stop: () => {
        stream.getTracks().forEach((track) => track.stop())
        video.srcObject = null
        video.remove()
      }
    }
  } catch (error) {
    console.warn('[hextech-stream] 起流失败: ' + String(error))
    return empty
  }
}
