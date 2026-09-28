import {
  POSTGAME_LADU_LEVELS,
  type PostgameAiReviewRosterPlayer,
  type PostgameAiStructuredPlayer,
  type PostgameAiStructuredResult,
  type PostgameLaduLevel
} from './postgameAiStructuredResult.ts'

const CHART_WIDTH = 1080
const CHART_PADDING = 40
const CHART_TITLE_HEIGHT = 88
const CHART_ROW_HEIGHT = 132
const CHART_LABEL_WIDTH = 132
const CHART_SUMMARY_BODY_TOP = 78
const CHART_SUMMARY_LINE_HEIGHT = 25
const CHART_SUMMARY_MIN_LINES = 4
const CHART_SUMMARY_MAX_LINES = 8
const CHART_SUMMARY_ESTIMATED_CHARS_PER_LINE = 42
const CHART_FOOTER_HEIGHT = 44

const LEVEL_COLORS: Record<PostgameLaduLevel, string> = {
  夯: '#f04b3e',
  顶级: '#f47a3e',
  人上人: '#f6c85f',
  NPC: '#fff1a8',
  拉完了: '#f7f0d0'
}

const LEVEL_TEXT_COLORS: Record<PostgameLaduLevel, string> = {
  夯: '#190706',
  顶级: '#1c0b04',
  人上人: '#211604',
  NPC: '#1f1a0c',
  拉完了: '#1f1a0c'
}

export interface PostgameLaduChartSharePlayer {
  playerRef: string
  championName: string
  championId: number | null
  iconUrl: string
  phrase: string
}

export interface PostgameLaduChartShareRow {
  label: PostgameLaduLevel
  color: string
  textColor: string
  players: PostgameLaduChartSharePlayer[]
}

export interface PostgameLaduChartShareModel {
  width: number
  height: number
  title: string
  rows: PostgameLaduChartShareRow[]
  summary: string
  summaryHeight: number
  summaryMaxLines: number
}

export interface PostgameLaduChartShareOptions {
  title?: string
  rosterPlayers?: PostgameAiReviewRosterPlayer[]
  championIdByName?: Record<string, number>
  getChampionIconUrl?: (championId: number) => string
}

export function buildPostgameLaduChartShareModel(
  result: PostgameAiStructuredResult,
  options: PostgameLaduChartShareOptions = {}
): PostgameLaduChartShareModel {
  const rows = POSTGAME_LADU_LEVELS.map(label => {
    const level = result.levels.find(item => item.label === label)
    const players = (level?.players ?? []).map(player => toSharePlayer(player, options))
    return {
      label,
      color: LEVEL_COLORS[label],
      textColor: LEVEL_TEXT_COLORS[label],
      players
    }
  })

  const summaryMaxLines = estimateSummaryLineCount(result.summary)
  const summaryHeight = calculateSummaryHeight(summaryMaxLines)

  return {
    width: CHART_WIDTH,
    height: CHART_TITLE_HEIGHT + CHART_ROW_HEIGHT * POSTGAME_LADU_LEVELS.length + summaryHeight + CHART_FOOTER_HEIGHT,
    title: options.title || '赛后复盘',
    rows,
    summary: result.summary,
    summaryHeight,
    summaryMaxLines
  }
}

export function resolvePostgameReviewPlayerIconUrl(
  player: PostgameAiStructuredPlayer,
  rosterPlayers: PostgameAiReviewRosterPlayer[] = [],
  getChampionIconUrl?: (championId: number) => string,
  championIdByName: Record<string, number> = {}
): string {
  const rosterPlayer = findPostgameReviewRosterPlayer(player, rosterPlayers)
  const championId = resolvePostgameReviewChampionId(player, rosterPlayer, championIdByName)
  if (championId !== null && getChampionIconUrl) {
    return getChampionIconUrl(championId)
  }
  return rosterPlayer?.iconUrl || ''
}

export async function renderPostgameReviewImage(
  result: PostgameAiStructuredResult,
  options: PostgameLaduChartShareOptions = {}
): Promise<HTMLCanvasElement> {
  const model = buildPostgameLaduChartShareModel(result, options)
  const scale = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
  const canvas = document.createElement('canvas')
  canvas.width = model.width * scale
  canvas.height = model.height * scale
  canvas.style.width = `${model.width}px`
  canvas.style.height = `${model.height}px`

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建图片画布')
  }

  context.scale(scale, scale)
  await drawPostgameReviewImage(context, model)
  return canvas
}

export async function downloadPostgameReviewImage(
  result: PostgameAiStructuredResult,
  options: PostgameLaduChartShareOptions = {}
): Promise<void> {
  const canvas = await renderPostgameReviewImage(result, options)
  const link = document.createElement('a')
  link.download = `rankpeek-postgame-${Date.now()}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

function toSharePlayer(
  player: PostgameAiStructuredPlayer,
  options: PostgameLaduChartShareOptions
): PostgameLaduChartSharePlayer {
  const rosterPlayer = findPostgameReviewRosterPlayer(player, options.rosterPlayers ?? [])
  const championId = resolvePostgameReviewChampionId(player, rosterPlayer, options.championIdByName ?? {})
  const iconUrl = championId !== null && options.getChampionIconUrl
    ? options.getChampionIconUrl(championId)
    : rosterPlayer?.iconUrl || ''

  return {
    playerRef: player.playerRef,
    championName: player.championName || rosterPlayer?.championName || '未知英雄',
    championId,
    iconUrl,
    phrase: player.phrase
  }
}

function findPostgameReviewRosterPlayer(
  player: PostgameAiStructuredPlayer,
  rosterPlayers: PostgameAiReviewRosterPlayer[]
): PostgameAiReviewRosterPlayer | undefined {
  const playerRef = normalizeMatchText(player.playerRef)
  const championName = normalizeMatchText(player.championName)
  return rosterPlayers.find(rosterPlayer => normalizeMatchText(rosterPlayer.playerRef) === playerRef)
    ?? rosterPlayers.find(rosterPlayer => (
      normalizeMatchText(rosterPlayer.championName) === championName
      && (!player.role || normalizeMatchText(rosterPlayer.role) === normalizeMatchText(player.role))
      && (!player.side || normalizeMatchText(rosterPlayer.side) === normalizeMatchText(player.side))
    ))
    ?? rosterPlayers.find(rosterPlayer => normalizeMatchText(rosterPlayer.championName) === championName)
}

function resolvePostgameReviewChampionId(
  player: PostgameAiStructuredPlayer,
  rosterPlayer: PostgameAiReviewRosterPlayer | undefined,
  championIdByName: Record<string, number>
): number | null {
  return player.championId
    ?? rosterPlayer?.championId
    ?? readChampionIdByName(player.championName, championIdByName)
    ?? readChampionIdByName(readChampionNameFromPlayerRef(player.playerRef), championIdByName)
}

function readChampionIdByName(name: string | undefined, championIdByName: Record<string, number>): number | null {
  const trimmed = name?.trim()
  if (!trimmed) {
    return null
  }

  const direct = normalizePositiveInteger(championIdByName[trimmed])
  if (direct !== null) {
    return direct
  }

  return normalizePositiveInteger(championIdByName[normalizeMatchText(trimmed)])
}

function readChampionNameFromPlayerRef(playerRef: string): string {
  const parts = playerRef.split('｜').map(part => part.trim()).filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

async function drawPostgameReviewImage(
  context: CanvasRenderingContext2D,
  model: PostgameLaduChartShareModel
): Promise<void> {
  context.fillStyle = '#101318'
  context.fillRect(0, 0, model.width, model.height)

  context.fillStyle = '#f4f0df'
  context.font = '800 34px "Microsoft YaHei", "PingFang SC", sans-serif'
  context.fillText(model.title, CHART_PADDING, 54)

  context.fillStyle = '#8e96a6'
  context.font = '600 16px "Microsoft YaHei", "PingFang SC", sans-serif'
  context.fillText('RankPeek 从夯到拉赛后表', CHART_PADDING, 78)

  const tableX = CHART_PADDING
  const tableY = CHART_TITLE_HEIGHT
  const tableWidth = model.width - CHART_PADDING * 2
  const playerAreaWidth = tableWidth - CHART_LABEL_WIDTH

  for (let rowIndex = 0; rowIndex < model.rows.length; rowIndex += 1) {
    const row = model.rows[rowIndex]
    const y = tableY + rowIndex * CHART_ROW_HEIGHT
    drawRowBackground(context, tableX, y, tableWidth, CHART_ROW_HEIGHT, row)
    await drawRowPlayers(context, row, tableX + CHART_LABEL_WIDTH, y, playerAreaWidth)
  }

  const summaryY = tableY + model.rows.length * CHART_ROW_HEIGHT
  drawSummary(context, tableX, summaryY, tableWidth, model.summary, model.summaryHeight, model.summaryMaxLines)

  context.fillStyle = '#596172'
  context.font = '700 14px "Microsoft YaHei", "PingFang SC", sans-serif'
  context.fillText('rankpeek.ai', CHART_PADDING, model.height - 22)
}

function drawRowBackground(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  row: PostgameLaduChartShareRow
): void {
  context.fillStyle = row.color
  context.fillRect(x, y, CHART_LABEL_WIDTH, height)
  context.fillStyle = '#f6f6f2'
  context.fillRect(x + CHART_LABEL_WIDTH, y, width - CHART_LABEL_WIDTH, height)
  context.strokeStyle = '#1b1e24'
  context.lineWidth = 2
  context.strokeRect(x, y, width, height)
  context.beginPath()
  context.moveTo(x + CHART_LABEL_WIDTH, y)
  context.lineTo(x + CHART_LABEL_WIDTH, y + height)
  context.stroke()

  context.fillStyle = row.textColor
  context.font = '900 24px "Microsoft YaHei", "PingFang SC", sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(row.label, x + CHART_LABEL_WIDTH / 2, y + height / 2)
  context.textAlign = 'start'
  context.textBaseline = 'alphabetic'
}

async function drawRowPlayers(
  context: CanvasRenderingContext2D,
  row: PostgameLaduChartShareRow,
  x: number,
  y: number,
  width: number
): Promise<void> {
  const tileWidth = Math.max(112, Math.floor(width / Math.max(1, row.players.length)))
  for (let index = 0; index < row.players.length; index += 1) {
    const player = row.players[index]
    const tileX = x + index * tileWidth + 14
    const iconX = tileX
    const iconY = y + 14
    await drawChampionIcon(context, player, iconX, iconY, 58)

    context.fillStyle = '#111318'
    context.font = '800 14px "Microsoft YaHei", "PingFang SC", sans-serif'
    context.fillText(player.championName, tileX, y + 88)

    context.fillStyle = '#414650'
    context.font = '600 12px "Microsoft YaHei", "PingFang SC", sans-serif'
    const phraseLines = wrapCanvasText(context, player.phrase, Math.max(78, tileWidth - 24), 2)
    for (let lineIndex = 0; lineIndex < phraseLines.length; lineIndex += 1) {
      context.fillText(phraseLines[lineIndex] ?? '', tileX, y + 107 + lineIndex * 15)
    }
  }
}

async function drawChampionIcon(
  context: CanvasRenderingContext2D,
  player: PostgameLaduChartSharePlayer,
  x: number,
  y: number,
  size: number
): Promise<void> {
  const image = await loadImage(player.iconUrl)
  if (image) {
    context.drawImage(image, x, y, size, size)
    return
  }

  context.fillStyle = '#28313d'
  context.fillRect(x, y, size, size)
  context.fillStyle = '#d8dfeb'
  context.font = '800 16px "Microsoft YaHei", "PingFang SC", sans-serif'
  context.fillText(player.championName.slice(0, 2), x + 10, y + 35)
}

function drawSummary(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  summary: string,
  height: number,
  maxLines: number
): void {
  context.fillStyle = '#f6f6f2'
  context.fillRect(x, y, width, height)
  context.strokeStyle = '#1b1e24'
  context.lineWidth = 2
  context.strokeRect(x, y, width, height)

  context.fillStyle = '#111318'
  context.font = '900 22px "Microsoft YaHei", "PingFang SC", sans-serif'
  context.fillText('客观总结', x + 24, y + 42)

  context.fillStyle = '#303642'
  context.font = '700 18px "Microsoft YaHei", "PingFang SC", sans-serif'
  const lines = wrapCanvasText(context, summary, width - 48, maxLines, true)
  for (let index = 0; index < lines.length; index += 1) {
    context.fillText(lines[index] ?? '', x + 24, y + CHART_SUMMARY_BODY_TOP + index * CHART_SUMMARY_LINE_HEIGHT)
  }
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  ellipsisOnTruncate = false
): string[] {
  const lines: string[] = []
  let line = ''
  for (const char of text) {
    const nextLine = line + char
    if (line && context.measureText(nextLine).width > maxWidth) {
      lines.push(line)
      line = char
      if (lines.length >= maxLines) {
        if (ellipsisOnTruncate) {
          lines[lines.length - 1] = fitTextWithEllipsis(context, lines[lines.length - 1] ?? '', maxWidth)
        }
        return lines
      }
    } else {
      line = nextLine
    }
  }
  if (line && lines.length < maxLines) {
    lines.push(line)
  }
  return lines
}

function estimateSummaryLineCount(summary: string): number {
  const compact = summary.replace(/\s+/g, '').trim()
  if (!compact) {
    return CHART_SUMMARY_MIN_LINES
  }

  return Math.max(
    CHART_SUMMARY_MIN_LINES,
    Math.min(CHART_SUMMARY_MAX_LINES, Math.ceil(compact.length / CHART_SUMMARY_ESTIMATED_CHARS_PER_LINE))
  )
}

function calculateSummaryHeight(maxLines: number): number {
  return CHART_SUMMARY_BODY_TOP - 14 + maxLines * CHART_SUMMARY_LINE_HEIGHT
}

function fitTextWithEllipsis(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const suffix = '…'
  let candidate = text.trimEnd()
  while (candidate && context.measureText(`${candidate}${suffix}`).width > maxWidth) {
    candidate = candidate.slice(0, -1)
  }
  return candidate ? `${candidate}${suffix}` : suffix
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) {
    return Promise.resolve(null)
  }

  return new Promise(resolve => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

function normalizePositiveInteger(value: unknown): number | null {
  const numberValue = typeof value === 'number'
    ? value
    : (typeof value === 'string' && value.trim() ? Number(value) : Number.NaN)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function normalizeMatchText(value: string | undefined): string {
  return (value || '').replace(/[【】\s]/g, '').toLowerCase()
}
