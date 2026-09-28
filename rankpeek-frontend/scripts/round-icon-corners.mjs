import sharp from 'sharp'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '../public')
const sourcePath = resolve(publicDir, 'real_icon.png')

const SIZE = 256
const CORNER_RADIUS = 48

function isInsideRoundedRect(x, y, w, h, r) {
  if (x < 0 || x >= w || y < 0 || y >= h) return false
  if (x >= r && x < w - r) return true
  if (y >= r && y < h - r) return true
  const cx = x < r ? r : w - 1 - r
  const cy = y < r ? r : h - 1 - r
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r
}

async function roundImage(inputBuffer, size, radius) {
  const { data } = await sharp(inputBuffer)
    .resize(size, size, { fit: 'cover', position: 'center' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const out = Buffer.alloc(data.length)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const inside = isInsideRoundedRect(x, y, size, size, radius)
      out[idx] = data[idx]
      out[idx + 1] = data[idx + 1]
      out[idx + 2] = data[idx + 2]
      out[idx + 3] = inside ? data[idx + 3] : 0
    }
  }
  return sharp(out, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer()
}

async function roundIcon(outputName) {
  const outputPath = resolve(publicDir, outputName)
  const buf = await roundImage(sourcePath, SIZE, CORNER_RADIUS)
  await sharp(buf).png().toFile(outputPath)
  console.log(`Created ${outputName} with rounded corners`)
}

async function buildIco(outputName, pngName) {
  const icoPath = resolve(publicDir, outputName)
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const icoHeader = Buffer.alloc(6)
  icoHeader.writeUInt16LE(0, 0)
  icoHeader.writeUInt16LE(1, 2)
  icoHeader.writeUInt16LE(sizes.length, 4)

  let imageData = Buffer.alloc(0)
  const entries = []

  for (const size of sizes) {
    const radius = Math.round(CORNER_RADIUS * size / SIZE)
    const rounded = await roundImage(sourcePath, size, radius)
    const offset = 6 + sizes.length * 16 + imageData.length
    entries.push({ size, offset, data: rounded })
    imageData = Buffer.concat([imageData, rounded])
  }

  const dirBuffer = Buffer.alloc(sizes.length * 16)
  let offset = 6 + sizes.length * 16

  for (let i = 0; i < sizes.length; i++) {
    const entry = entries[i]
    const entryOffset = i * 16
    dirBuffer.writeUInt8(entry.size === 256 ? 0 : entry.size, entryOffset)
    dirBuffer.writeUInt8(entry.size === 256 ? 0 : entry.size, entryOffset + 1)
    dirBuffer.writeUInt32LE(entry.data.length, entryOffset + 8)
    dirBuffer.writeUInt32LE(offset, entryOffset + 12)
    offset += entry.data.length
  }

  writeFileSync(icoPath, Buffer.concat([icoHeader, dirBuffer, imageData]))
  console.log(`Created ${outputName} with sizes: ${sizes.join(', ')}`)
}

async function main() {
  await roundIcon('icon.png')
  await roundIcon('tray-icon.png')
  await buildIco('icon.ico', 'icon.png')
  await buildIco('tray-icon.ico', 'tray-icon.png')
  console.log('Done. All icons regenerated with rounded corners.')
}

main().catch(err => { console.error(err); process.exit(1) })
