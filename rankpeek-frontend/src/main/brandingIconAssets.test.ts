import test from 'node:test'
import assert from 'node:assert/strict'
import { inflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft
  const leftDistance = Math.abs(estimate - left)
  const upDistance = Math.abs(estimate - up)
  const upLeftDistance = Math.abs(estimate - upLeft)

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left
  }

  if (upDistance <= upLeftDistance) {
    return up
  }

  return upLeft
}

function readPng(buffer: Buffer) {
  assert.equal(buffer.subarray(0, 8).equals(pngSignature), true, 'PNG signature should be present')

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatChunks: Buffer[] = []

  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    }

    if (type === 'IDAT') {
      idatChunks.push(data)
    }

    offset += length + 12
  }

  assert.equal(bitDepth, 8)
  assert.ok(colorType === 2 || colorType === 6, 'PNG should be RGB or RGBA')

  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const inflated = inflateSync(Buffer.concat(idatChunks))
  const pixels = Buffer.alloc(height * width * 4)
  const scanlines = Buffer.alloc(height * stride)
  let sourceOffset = 0

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset]
    sourceOffset += 1

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x]
      const left = x >= channels ? scanlines[y * stride + x - channels] : 0
      const up = y > 0 ? scanlines[(y - 1) * stride + x] : 0
      const upLeft = y > 0 && x >= channels ? scanlines[(y - 1) * stride + x - channels] : 0
      let value = raw

      if (filter === 1) {
        value = raw + left
      } else if (filter === 2) {
        value = raw + up
      } else if (filter === 3) {
        value = raw + Math.floor((left + up) / 2)
      } else if (filter === 4) {
        value = raw + paeth(left, up, upLeft)
      } else {
        assert.equal(filter, 0)
      }

      scanlines[y * stride + x] = value & 0xff
    }

    sourceOffset += stride
  }

  for (let index = 0; index < width * height; index += 1) {
    const source = index * channels
    const target = index * 4

    pixels[target] = scanlines[source]
    pixels[target + 1] = scanlines[source + 1]
    pixels[target + 2] = scanlines[source + 2]
    pixels[target + 3] = colorType === 6 ? scanlines[source + 3] : 255
  }

  return {
    width,
    height,
    colorType,
    pixel(x: number, y: number) {
      const offset = (y * width + x) * 4

      return {
        r: pixels[offset],
        g: pixels[offset + 1],
        b: pixels[offset + 2],
        a: pixels[offset + 3]
      }
    }
  }
}

function readPngFile(path: string) {
  return readPng(readFileSync(new URL(path, import.meta.url)))
}

function sample(image: ReturnType<typeof readPng>, xRatio: number, yRatio: number) {
  return image.pixel(
    Math.round((image.width - 1) * xRatio),
    Math.round((image.height - 1) * yRatio)
  )
}

function isBright(pixel: ReturnType<ReturnType<typeof readPng>['pixel']>) {
  return pixel.a > 240 && pixel.r > 225 && pixel.g > 225 && pixel.b > 225
}

function isDarkNavy(pixel: ReturnType<ReturnType<typeof readPng>['pixel']>) {
  return pixel.a > 240 && pixel.r < 35 && pixel.g < 45 && pixel.b < 70
}

function countPixels(
  image: ReturnType<typeof readPng>,
  bounds: { left: number; top: number; right: number; bottom: number },
  predicate: (pixel: ReturnType<ReturnType<typeof readPng>['pixel']>) => boolean
) {
  let count = 0

  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) {
      if (predicate(image.pixel(x, y))) {
        count += 1
      }
    }
  }

  return count
}

function assertMatchesUploadedLogo(image: ReturnType<typeof readPng>, source: ReturnType<typeof readPng>) {
  assert.equal(image.width, image.height)
  assert.ok(source.width === source.height && source.width >= 512, 'uploaded source logo should be a large square')
  assert.ok(isDarkNavy(sample(image, 0.15, 0.5)), 'app logo should keep the uploaded dark background')
  assert.ok(isBright(sample(image, 0.5, 0.62)), 'app logo should keep the bright center mark')
  assert.ok(isBright(sample(image, 0.13, 0.62)), 'app logo should keep the left eye edge')
  assert.ok(isBright(sample(image, 0.87, 0.62)), 'app logo should keep the right eye edge')

  if (image.width >= 24) {
    assert.ok(isDarkNavy(sample(image, 0.5, 0.47)), 'app logo should keep dark negative space inside the eye')
    assert.ok(isBright(sample(image, 0.5, 0.18)), 'app logo should keep the bright top ray')
  }

  const brightPixels = countPixels(
    image,
    {
      left: Math.round(image.width * 0.12),
      top: Math.round(image.height * 0.08),
      right: Math.round(image.width * 0.88),
      bottom: Math.round(image.height * 0.86)
    },
    isBright
  )

  const minimumBrightRatio = image.width < 24 ? 0.1 : 0.16
  assert.ok(
    brightPixels > image.width * image.height * minimumBrightRatio,
    'app logo should contain the uploaded bright eye artwork'
  )
}

function readIcoEntries(path: string) {
  const ico = readFileSync(new URL(path, import.meta.url))

  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)

  const count = ico.readUInt16LE(4)
  const entries = []

  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16
    const width = ico[offset] === 0 ? 256 : ico[offset]
    const height = ico[offset + 1] === 0 ? 256 : ico[offset + 1]
    const byteLength = ico.readUInt32LE(offset + 8)
    const imageOffset = ico.readUInt32LE(offset + 12)
    const payload = ico.subarray(imageOffset, imageOffset + byteLength)

    entries.push({ width, height, payload })
  }

  return entries
}

test('app logo png assets are derived from the uploaded real icon', () => {
  const sourceLogo = readPngFile('../../public/real_icon.png')

  for (const path of [
    '../../public/icon.png',
    '../../public/tray-icon.png',
    '../renderer/assets/branding/sidebar-logo.png'
  ]) {
    const logo = readPngFile(path)

    assert.equal(logo.width, 256)
    assert.equal(logo.height, 256)
    assert.equal(logo.colorType, 6)
    assertMatchesUploadedLogo(logo, sourceLogo)
  }
})

test('ico app logo assets include uploaded artwork at common Windows sizes', () => {
  const sourceLogo = readPngFile('../../public/real_icon.png')

  for (const path of ['../../public/icon.ico', '../../public/tray-icon.ico']) {
    const entries = readIcoEntries(path)
    const sizes = entries.map((entry) => entry.width)

    assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256])

    for (const entry of entries) {
      assert.equal(entry.height, entry.width)

      const png = readPng(entry.payload)
      assert.equal(png.width, entry.width)
      assert.equal(png.height, entry.height)
      assert.equal(png.colorType, 6)
      if (entry.width === 256) {
        assertMatchesUploadedLogo(png, sourceLogo)
      }
    }
  }
})
