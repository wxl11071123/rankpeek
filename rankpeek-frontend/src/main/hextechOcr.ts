/**
 * 强化候选 OCR（PaddleOCR PP-OCRv5 + ONNX Runtime Web）。
 *
 * 方案见 docs/hextech-data-plan.md §7：不依赖 Python，模型是 ONNX，推理跑在 Electron 主进程里。
 * 这个模块只做「图片像素 -> 文本」，不导入 electron，方便用 Node 直接跑自检
 * （scripts/devtools/ocr-selftest.mjs）。
 *
 * 匹配成强化由渲染层的 augmentTitleMatcher 负责：OCR 只吐文本，错了也能靠模糊匹配救回来。
 */
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, stat, unlink } from 'node:fs/promises'
import { get as httpsGet } from 'node:https'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ImageInput {
  width: number
  height: number
  /** RGBA 或灰度像素。 */
  data: Uint8Array
}

export interface OcrOutcome {
  available: boolean
  texts: string[]
  /** 按卡位（左/中/右）分组的文本，顺序与传入的区域一致。 */
  textsBySlot: string[][]
  message?: string
  elapsedMs: number
}

/**
 * PP-OCRv5 mobile：det 4.6 MB + rec 15.8 MB + 字典 0.07 MB，够小且中文识别够用。
 *
 * <p>模型<b>随安装包一起发</b>（`public/ocr-models` -> `resources/public/ocr-models`），
 * 正常情况一个字节都不用下载。下面这份 sha256 是钉死的：万一哪天走到下载分支
 * （bundled 副本丢了），也必须逐字节对得上才认。
 *
 * <p>为什么这么严：原来的实现只比大小、还留了 10% 容差，而上游 URL 指向 `main` 分支 ——
 * 上游换了模型我们这边会悄悄跟着变，OCR 行为就不可复现了。实测当前上游内容
 * 已经和代码里写的期望大小不一致（det 差 3464 字节、rec 差 1623 字节）。
 */
const MODEL_FILES = [
  {
    name: 'PP-OCRv5_mobile_det_infer.onnx',
    bytes: 4819576,
    sha256: '4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae'
  },
  {
    name: 'PP-OCRv5_mobile_rec_infer.onnx',
    bytes: 16533929,
    sha256: '86b1f8bffa31748e0d6364a98af983bbd33b92523141d4a02fa587b4b66b54af'
  },
  {
    name: 'ppocrv5_dict.txt',
    bytes: 74013,
    sha256: '7680a8a77c6617aba27bc9c52d320f451ae7871613a43b5358ac4a68c88d87c0'
  }
]

/**
 * 随包分发的模型目录。
 *
 * <p>三个来源都试：安装版在 `resources/public` 下；开发/自检模式下用**相对本文件的位置**
 * 往上找（`src/main` -> 仓库的 `public/ocr-models`），最后才退到 `process.cwd()`。
 * 只靠 cwd 是不够的 —— 从别的目录启动时它会找不到，然后悄悄退回网络下载。
 */
function bundledModelDirs(): string[] {
  const dirs: string[] = []
  if (process.resourcesPath) {
    dirs.push(join(process.resourcesPath, 'public', 'ocr-models'))
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url))
    // 源码: <repo>/rankpeek-frontend/src/main  -> ../../public/ocr-models
    dirs.push(join(here, '..', '..', 'public', 'ocr-models'))
    // 打包后: <app>/resources/app.asar/dist/main -> ../../public/ocr-models
    dirs.push(join(here, '..', '..', '..', 'public', 'ocr-models'))
  } catch {
    // import.meta.url 不可用时忽略，继续试 cwd
  }
  dirs.push(join(process.cwd(), 'public', 'ocr-models'))
  return dirs
}
const MODEL_HOSTS = [
  'https://huggingface.co/x3zvawq/paddleocr-js-onnx/resolve/main/ppocr_v5_mobile',
  'https://hf-mirror.com/x3zvawq/paddleocr-js-onnx/resolve/main/ppocr_v5_mobile'
]
const MODEL_PRESET = 'PP-OCRv5_mobile'

let servicePromise: Promise<{ recognize: (image: ImageInput) => Promise<string[]> } | null> | null = null
let engineError: string | null = null

export function defaultModelDir(): string {
  return process.env.RANKPEEK_OCR_MODEL_DIR
    || join(process.env.LOCALAPPDATA || process.env.TMPDIR || '.', 'RankPeek', 'hextech', 'ocr-models')
}

async function fileLooksComplete(path: string, expectedBytes: number): Promise<boolean> {
  try {
    const info = await stat(path)
    return info.size >= expectedBytes * 0.9
  } catch {
    return false
  }
}

function download(url: string, target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, { headers: { 'User-Agent': 'RankPeek/1.1.1' } }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        // 重定向可能是相对地址，要基于当前 URL 解析
        const nextUrl = new URL(response.headers.location, url).toString()
        download(nextUrl, target).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error('HTTP ' + response.statusCode + ' for ' + url))
        return
      }
      const stream = createWriteStream(target)
      response.pipe(stream)
      stream.on('finish', () => stream.close(() => resolve()))
      stream.on('error', reject)
    })
    request.on('error', reject)
    request.setTimeout(120000, () => request.destroy(new Error('timeout')))
  })
}

async function sha256File(path: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await readFile(path)).digest('hex')
  } catch {
    return null
  }
}

/** 大小对得上、并且哈希也和钉死的值一致。 */
async function fileIsPinned(
  path: string,
  expected: { bytes: number; sha256: string }
): Promise<boolean> {
  if (!(await fileLooksComplete(path, expected.bytes))) {
    return false
  }
  return (await sha256File(path)) === expected.sha256
}

async function dirHasAllPinnedModels(dir: string): Promise<boolean> {
  for (const file of MODEL_FILES) {
    if (!(await fileIsPinned(join(dir, file.name), file))) {
      return false
    }
  }
  return true
}

/**
 * 返回可用的模型目录。
 *
 * <p>顺序：**随包发的副本** -> 本地缓存目录（缺失时才下载，且下载后必须通过 sha256 校验）。
 * 正常安装的客户端永远走第一条 —— 不发网络请求、离线可用、上游改动影响不到我们。
 *
 * <p>下载到临时文件再改名，中途断网不会留下一个半截的模型让下次误判成"已有"。
 */
export async function ensureOcrModels(modelDir = defaultModelDir()): Promise<string> {
  for (const bundled of bundledModelDirs()) {
    if (await dirHasAllPinnedModels(bundled)) {
      return bundled
    }
  }

  await mkdir(modelDir, { recursive: true })
  for (const file of MODEL_FILES) {
    const target = join(modelDir, file.name)
    if (await fileIsPinned(target, file)) {
      continue
    }
    let lastError: unknown = null
    for (const host of MODEL_HOSTS) {
      const staged = target + '.download'
      try {
        await download(host + '/' + file.name, staged)
        if (!(await fileIsPinned(staged, file))) {
          throw new Error('内容与钉死的 sha256 不一致（上游可能改过）')
        }
        await rename(staged, target)
        lastError = null
        break
      } catch (error) {
        lastError = error
        await unlink(staged).catch(() => undefined)
      }
    }
    if (lastError) {
      throw new Error('模型下载失败：' + file.name + '（' + String(lastError) + '）')
    }
  }
  return modelDir
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

async function createService(modelDir: string) {
  const [ort, paddle, detModel, recModel, dictText] = await Promise.all([
    import('onnxruntime-web'),
    import('paddleocr'),
    readFile(join(modelDir, 'PP-OCRv5_mobile_det_infer.onnx')),
    readFile(join(modelDir, 'PP-OCRv5_mobile_rec_infer.onnx')),
    readFile(join(modelDir, 'ppocrv5_dict.txt'), 'utf-8')
  ])
  // 字典不含 CTC blank，模型输出类比字典多一个，补一个空词条
  const charactersDictionary = [...dictText.trimEnd().split(/\r?\n/), ' ']
  const ocr = await (paddle as { PaddleOcrService: { createInstance: (options: unknown) => Promise<unknown> } })
    .PaddleOcrService.createInstance({
      ort,
      modelPreset: MODEL_PRESET,
      detection: { modelBuffer: toArrayBuffer(detModel) },
      recognition: { modelBuffer: toArrayBuffer(recModel), charactersDictionary }
    })
  const typed = ocr as {
    recognize: (image: ImageInput) => Promise<unknown>
    processRecognition: (result: unknown) => { text?: string }
  }
  return {
    recognize: async (image: ImageInput): Promise<string[]> => {
      const result = await typed.recognize(image)
      const text = typed.processRecognition(result).text || ''
      return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    }
  }
}

function serviceOrNull(modelDir: string) {
  if (!servicePromise) {
    servicePromise = (async () => {
      try {
        // 一定要用 ensureOcrModels 返回的目录：它可能是随包发的那份，而不是本地缓存目录
        const resolvedModelDir = await ensureOcrModels(modelDir)
        return await createService(resolvedModelDir)
      } catch (error) {
        engineError = error instanceof Error ? (error.stack || error.message) : String(error)
        console.error('[hextech-ocr] engine unavailable:', engineError)
        return null
      }
    })()
  }
  return servicePromise
}

/**
 * 识别三张卡的标题区域。
 *
 * @param images 三个标题区域的像素（顺序与 augmentRegionPolicy 一致）
 */
export async function recognizeAugmentTitles(
  images: ImageInput[],
  modelDir = defaultModelDir()
): Promise<OcrOutcome> {
  const started = Date.now()
  if (!images.length) {
    return { available: false, texts: [], textsBySlot: [], message: '没有截图区域', elapsedMs: 0 }
  }
  const service = await serviceOrNull(modelDir)
  if (!service) {
    return {
      available: false,
      texts: [],
      textsBySlot: [],
      message: 'OCR 引擎不可用：' + (engineError ? engineError.split('\n')[0] : '依赖或模型缺失'),
      elapsedMs: Date.now() - started
    }
  }
  // 一张一张按卡位识别：顺序必须是左/中/右，后面的门控要按卡位写结果
  const textsBySlot: string[][] = []
  for (const image of images) {
    try {
      textsBySlot.push(await service.recognize(image))
    } catch (error) {
      console.warn('[hextech-ocr] recognize failed:', String(error))
      textsBySlot.push([])
    }
  }
  return {
    available: true,
    texts: textsBySlot.flat(),
    textsBySlot,
    elapsedMs: Date.now() - started
  }
}

/** 悬浮窗显示用：引擎是否已经能跑（不触发下载）。 */
export async function isOcrEngineReady(modelDir = defaultModelDir()): Promise<boolean> {
  for (const file of MODEL_FILES) {
    if (!(await fileLooksComplete(join(modelDir, file.name), file.bytes))) {
      return false
    }
  }
  return true
}
