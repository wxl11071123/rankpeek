import bundledMetadataJson from '../data/metadata.json' with { type: 'json' }

const COMMUNITY_DRAGON_RAW = 'https://raw.communitydragon.org/latest'
const COMMUNITY_DRAGON_GAME_DATA = `${COMMUNITY_DRAGON_RAW}/plugins/rcp-be-lol-game-data/global/default/v1`
const COMMUNITY_DRAGON_MINIMAP_ICONS = `${COMMUNITY_DRAGON_RAW}/game/assets/ux/minimap/icons`
const BACKEND_ASSET_BASE = 'http://127.0.0.1:8080/api/v1/asset'
const PUBLIC_GAME_ASSET_BASE = `${getViteBaseUrl()}game-assets`
const ASSET_PLACEHOLDER_URL = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#2f3744"/><path d="M20 42h24L36 28l-6 8-4-5z" fill="#6f7b8d"/><circle cx="25" cy="23" r="4" fill="#8994a5"/></svg>'
)}`

export type GameAssetKind = 'champion' | 'item' | 'spell' | 'perk' | 'augment' | 'profile'
export type ObjectiveIconKind =
  | 'turret'
  | 'turretPlate'
  | 'inhibitor'
  | 'baron'
  | 'dragon'
  | 'infernal'
  | 'mountain'
  | 'ocean'
  | 'cloud'
  | 'hextech'
  | 'chemtech'
  | 'elder'
  | 'herald'
  | 'voidgrub'
  | 'soul-infernal'
  | 'soul-mountain'
  | 'soul-ocean'
  | 'soul-cloud'
  | 'soul-hextech'
  | 'soul-chemtech'
  | 'unknownDragon'
export type GameAssetFallbackState = 'empty' | 'failed'
type GameAssetManifestSection = Record<string, string>
type GameAssetStats = Record<string, number>

const VERIFIED_OBJECTIVE_MINIMAP_FILES: Partial<Record<ObjectiveIconKind, string>> = {
  turret: 'tower.png',
  turretPlate: 'turret_1plate.png',
  inhibitor: 'inhibitor.png',
  baron: 'baron.png',
  dragon: 'dragon.png',
  infernal: 'dragon_infernal.png',
  mountain: 'dragon_mountain.png',
  ocean: 'dragon_ocean.png',
  cloud: 'dragon_cloud.png',
  hextech: 'dragon_hextech.png',
  chemtech: 'dragon_chemtech.png',
  elder: 'dragon_elder.png',
  herald: 'riftherald.png',
  voidgrub: 'grub.png',
  unknownDragon: 'dragon.png',
  'soul-infernal': 'dragon_infernal.png',
  'soul-mountain': 'dragon_mountain.png',
  'soul-ocean': 'dragon_ocean.png',
  'soul-cloud': 'dragon_cloud.png',
  'soul-hextech': 'dragon_hextech.png',
  'soul-chemtech': 'dragon_chemtech.png'
}

export interface GameAssetManifest {
  version: string
  locale: string
  items: GameAssetManifestSection
  summonerSpells: GameAssetManifestSection
  perks: GameAssetManifestSection
  augments: GameAssetManifestSection
  champions: GameAssetManifestSection
  profileIcons?: GameAssetManifestSection
  objectives?: GameAssetManifestSection
}

export interface GameAssetMetadataEntry {
  id: number
  name?: string
  nameTRA?: string
  description?: string
  tooltip?: string
  plaintext?: string
  desc?: string
  shortDesc?: string
  longDesc?: string
  descriptionTra?: string
  descriptionTRA?: string
  tooltipTra?: string
  tooltipTRA?: string
  endOfGameStatDescs?: string[]
  endOfGameStatDesc?: string
  rarity?: string
  icon?: string
  gold?: GameAssetGold
  total?: number
  price?: number | GameAssetGold
  from?: number[]
  into?: number[]
  stats?: GameAssetStats
}

export interface GameAssetGold {
  total?: number
  base?: number
  sell?: number
}

export interface GameAssetMetadata {
  version: string
  locale: string
  items: Record<string, GameAssetMetadataEntry>
  summonerSpells: Record<string, GameAssetMetadataEntry>
  perks: Record<string, GameAssetMetadataEntry>
  augments: Record<string, GameAssetMetadataEntry>
}

export type GameAssetTooltipSection = {
  label?: string
  text: string
  tone?: 'stat' | 'passive' | 'active' | 'body'
}

type RiotItemSectionTone = 'passive' | 'active' | 'rules'
type AugmentRarityTone = 'silver' | 'gold' | 'prismatic' | 'bronze' | 'default'

type RiotItemSectionMarker = {
  tone: RiotItemSectionTone
  label: string
  start: number
  end: number
}

export interface GameAssetTooltipDetails {
  kind: 'item' | 'perk' | 'augment' | 'spell'
  id: number
  name: string
  subtitle: string
  description: string
  iconUrl: string
  priceText?: string
  recipeIconUrls?: string[]
  statLines?: string[]
  sections?: GameAssetTooltipSection[]
  rarityLabel?: string
  rarityTone?: string
}

export interface ItemIconSlot {
  index: number
  itemId: number | null
  url: string
  empty: boolean
}

const EMPTY_MANIFEST: GameAssetManifest = {
  version: 'seed',
  locale: 'zh_CN',
  items: {},
  summonerSpells: {},
  perks: {},
  augments: {},
  champions: {},
  profileIcons: {},
  objectives: {}
}

const EMPTY_METADATA: GameAssetMetadata = {
  version: 'seed',
  locale: 'zh_CN',
  items: {},
  summonerSpells: {},
  perks: {},
  augments: {}
}

let manifest: GameAssetManifest = normalizeManifest(EMPTY_MANIFEST)
let bundledMetadata: GameAssetMetadata = normalizeMetadata(EMPTY_METADATA)
let metadataOverlay: GameAssetMetadata = normalizeMetadata(EMPTY_METADATA)
let metadata: GameAssetMetadata = normalizeMetadata(EMPTY_METADATA)
const failedAssetUrls = new Set<string>()
const fallbackChains = new Map<string, string[]>()

setGameAssetMetadata(bundledMetadataJson as Partial<GameAssetMetadata>)

export function getChampionIconUrl(championId?: number | null): string {
  return resolveAssetUrl('champion', championId)
}

export function getItemIconUrl(itemId?: number | null): string {
  return resolveAssetUrl('item', itemId)
}

export function getSummonerSpellIconUrl(spellId?: number | null): string {
  return resolveAssetUrl('spell', spellId)
}

export function getPerkIconUrl(perkId?: number | null): string {
  return resolveAssetUrl('perk', perkId)
}

export function getAugmentIconUrl(augmentId?: number | null): string {
  return resolveAssetUrl('augment', augmentId)
}

export function getProfileIconUrl(profileIconId?: number | null): string {
  return resolveAssetUrl('profile', profileIconId)
}

export function getObjectiveIconUrl(kind: ObjectiveIconKind): string {
  return getManifestObjectiveIconUrl(kind) || getCommunityDragonObjectiveIconUrl(kind)
}

export function getItemAssetDetails(itemId?: number | null): GameAssetMetadataEntry | null {
  return getAssetDetails('item', itemId)
}

export function getPerkAssetDetails(perkId?: number | null): GameAssetMetadataEntry | null {
  return getAssetDetails('perk', perkId)
}

export function getAugmentAssetDetails(augmentId?: number | null): GameAssetMetadataEntry | null {
  return getAssetDetails('augment', augmentId)
}

export function getAugmentRarityClass(value: unknown): string {
  return `augment-rarity-${getAugmentRarityTone(value)}`
}

export function getSummonerSpellAssetDetails(spellId?: number | null): GameAssetMetadataEntry | null {
  const id = normalizeAssetId(spellId)
  if (id === null) {
    return null
  }

  return metadata.summonerSpells[String(id)] || null
}

export function getItemTooltipDetails(itemId?: number | null): GameAssetTooltipDetails | null {
  return getAssetTooltipDetails('item', itemId, getItemIconUrl)
}

export function getPerkTooltipDetails(perkId?: number | null): GameAssetTooltipDetails | null {
  return getAssetTooltipDetails('perk', perkId, getPerkIconUrl)
}

export function getAugmentTooltipDetails(augmentId?: number | null): GameAssetTooltipDetails | null {
  return getAssetTooltipDetails('augment', augmentId, getAugmentIconUrl)
}

export function getSummonerSpellTooltipDetails(spellId?: number | null): GameAssetTooltipDetails | null {
  const id = normalizeAssetId(spellId)
  if (id === null) {
    return null
  }

  const label = getTooltipKindLabel('spell')
  const details = getSummonerSpellAssetDetails(id)
  const fallbackName = `${label} ${id}`
  return {
    kind: 'spell',
    id,
    name: normalizeRiotTooltipText(details?.name) || fallbackName,
    subtitle: details ? '' : fallbackName,
    description: getTooltipDescription(details, 'spell'),
    iconUrl: getSummonerSpellIconUrl(id)
  }
}

export function getItemIconSlots(stats: unknown): ItemIconSlot[] {
  const record = isRecord(stats) ? stats : {}
  return Array.from({ length: 7 }, (_, index) => {
    const itemId = normalizeAssetId(record[`item${index}`])
    const url = itemId === null ? '' : getItemIconUrl(itemId)
    return {
      index,
      itemId,
      url,
      empty: itemId === null
    }
  })
}

export function getAssetFallbackClass(kind: GameAssetKind, state: GameAssetFallbackState): string {
  return `asset-slot asset-slot-${kind} asset-slot-${state}`
}

export function getAssetPlaceholderUrl(): string {
  return ASSET_PLACEHOLDER_URL
}

export function setGameAssetManifest(nextManifest: Partial<GameAssetManifest>): void {
  manifest = normalizeManifest({
    ...EMPTY_MANIFEST,
    ...nextManifest
  })
  fallbackChains.clear()
}

export async function loadGameAssetManifest(url = `${PUBLIC_GAME_ASSET_BASE}/manifest.json`): Promise<void> {
  if (typeof fetch !== 'function') {
    return
  }

  try {
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) {
      return
    }
    setGameAssetManifest(await response.json() as Partial<GameAssetManifest>)
  } catch {
    // Local asset metadata is an optimization. A missing or unreadable manifest must not block app startup.
  }
}

export async function loadGameAssetMetadata(url = `${PUBLIC_GAME_ASSET_BASE}/metadata.json`): Promise<void> {
  if (typeof fetch !== 'function') {
    return
  }

  try {
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) {
      return
    }
    setGameAssetMetadata(await response.json() as Partial<GameAssetMetadata>)
  } catch {
    // Local text metadata is optional. Missing metadata must not block app startup.
  }
}

export async function loadLcuGameAssetMetadataOverlay(url = `${BACKEND_ASSET_BASE}/metadata`): Promise<void> {
  if (typeof fetch !== 'function') {
    return
  }

  try {
    const response = await fetch(url, { cache: 'no-cache' })
    if (!response.ok) {
      return
    }
    mergeGameAssetMetadataOverlay(await response.json() as Partial<GameAssetMetadata>)
  } catch {
    // LCU metadata is a freshness overlay. Static local metadata must remain enough for startup and match pages.
  }
}

export function recordAssetLoadFailure(url: string): void {
  const normalized = normalizeFailureUrl(url)
  if (normalized) {
    failedAssetUrls.add(normalized)
  }
}

export function markAssetLoadFailed(event: Event): void {
  const image = event.currentTarget
  if (!isHtmlImageElement(image)) {
    return
  }

  const failedUrl = image.currentSrc || image.src || image.getAttribute('src') || ''
  recordAssetLoadFailure(failedUrl)

  const nextUrl = getNextAssetFallbackUrl(failedUrl)
  if (nextUrl) {
    delete image.dataset.assetFailed
    image.removeAttribute('aria-hidden')
    image.src = nextUrl
    return
  }

  markImageAsUnavailable(image)
}

export function resetGameAssetResolverForTest(): void {
  manifest = normalizeManifest(EMPTY_MANIFEST)
  bundledMetadata = normalizeMetadata(EMPTY_METADATA)
  metadataOverlay = normalizeMetadata(EMPTY_METADATA)
  metadata = normalizeMetadata(EMPTY_METADATA)
  failedAssetUrls.clear()
  fallbackChains.clear()
}

export function setGameAssetManifestForTest(nextManifest: Partial<GameAssetManifest>): void {
  setGameAssetManifest(nextManifest)
}

export function setGameAssetMetadataForTest(nextMetadata: Partial<GameAssetMetadata>): void {
  setGameAssetMetadata(nextMetadata)
}

function resolveAssetUrl(kind: GameAssetKind, rawId?: number | null): string {
  const id = normalizeAssetId(rawId)
  if (id === null) {
    return ''
  }

  const candidates = buildAssetCandidates(kind, id)
  registerFallbackChain(candidates)

  return candidates.find(candidate => !isAssetUrlFailed(candidate)) || ASSET_PLACEHOLDER_URL
}

function setGameAssetMetadata(nextMetadata: Partial<GameAssetMetadata>): void {
  bundledMetadata = normalizeMetadata({
    ...EMPTY_METADATA,
    ...nextMetadata
  })
  rebuildGameAssetMetadata()
}

function mergeGameAssetMetadataOverlay(nextMetadata: Partial<GameAssetMetadata>): void {
  const overlay = normalizeMetadata({
    ...EMPTY_METADATA,
    ...nextMetadata
  })

  metadataOverlay = mergeMetadata(metadataOverlay, overlay)
  rebuildGameAssetMetadata()
}

function rebuildGameAssetMetadata(): void {
  metadata = mergeMetadata(bundledMetadata, metadataOverlay)
}

function getAssetDetails(kind: 'item' | 'perk' | 'augment', rawId?: number | null): GameAssetMetadataEntry | null {
  const id = normalizeAssetId(rawId)
  if (id === null) {
    return null
  }

  const section = getMetadataSection(kind)
  return section[String(id)] || null
}

function getAssetTooltipDetails(
  kind: 'item' | 'perk' | 'augment',
  rawId: number | null | undefined,
  getIconUrl: (id: number) => string
): GameAssetTooltipDetails | null {
  const id = normalizeAssetId(rawId)
  if (id === null) {
    return null
  }

  const label = getTooltipKindLabel(kind)
  const details = getAssetDetails(kind, id)
  const fallbackName = `${label} ${id}`
  const description = getTooltipDescription(details, kind)
  const tooltipDetails: GameAssetTooltipDetails = {
    kind,
    id,
    name: getTooltipTitle(details, fallbackName),
    subtitle: getTooltipSubtitle(kind, details),
    description,
    iconUrl: getIconUrl(id)
  }

  if (kind === 'item' && details) {
    const priceText = formatItemPriceText(details)
    const recipeIconUrls = getItemRecipeIconUrls(details)
    const statLines = getItemStatLines(details)
    const sections = getItemTooltipSections(details)
    if (priceText) {
      tooltipDetails.priceText = priceText
    }
    if (recipeIconUrls.length) {
      tooltipDetails.recipeIconUrls = recipeIconUrls
    }
    if (statLines.length) {
      tooltipDetails.statLines = statLines
    }
    if (sections.length) {
      tooltipDetails.sections = sections
    }
  }

  if (kind === 'augment' && details) {
    const rarity = getAugmentRarityDetails(details.rarity)
    if (rarity.label) {
      tooltipDetails.rarityLabel = rarity.label
      tooltipDetails.rarityTone = rarity.tone
    }
  }

  return tooltipDetails
}

function getTooltipSubtitle(kind: 'item' | 'perk' | 'augment', details: GameAssetMetadataEntry | null): string {
  if (!details) {
    return ''
  }

  return ''
}

function getMetadataSection(kind: 'item' | 'perk' | 'augment'): Record<string, GameAssetMetadataEntry> {
  switch (kind) {
    case 'item':
      return metadata.items
    case 'perk':
      return metadata.perks
    case 'augment':
      return metadata.augments
  }
}

function getTooltipKindLabel(kind: GameAssetTooltipDetails['kind']): string {
  switch (kind) {
    case 'item':
      return '装备'
    case 'perk':
      return '符文'
    case 'augment':
      return '海克斯强化'
    case 'spell':
      return '召唤师技能'
  }
}

function getTooltipTitle(details: GameAssetMetadataEntry | null, fallbackName: string): string {
  const name = normalizeRiotTooltipText(details?.name) || normalizeRiotTooltipText(details?.nameTRA) || fallbackName
  return name
}

function getTooltipDescription(details: GameAssetMetadataEntry | null, kind: GameAssetTooltipDetails['kind']): string {
  if (!details) {
    return '暂无详细说明'
  }

  return pickBestTooltipText(details, kind).text || '暂无详细说明'
}

function pickBestTooltipText(
  details: GameAssetMetadataEntry,
  kind: GameAssetTooltipDetails['kind']
): { text: string, raw: string, key: string } {
  const candidates = getTooltipTextCandidates(details, kind)
    .map(candidate => {
      const text = normalizeRiotTooltipText(candidate.value)
      return {
        ...candidate,
        text,
        score: scoreTooltipTextCandidate(candidate.key, candidate.value, text, kind)
      }
    })
    .filter(candidate => candidate.text && !hasRawTooltipTrace(candidate.text))
    .sort((left, right) => right.score - left.score)

  const best = candidates[0]
  return best ? { text: best.text, raw: best.value, key: best.key } : { text: '', raw: '', key: '' }
}

function getTooltipTextCandidates(
  details: GameAssetMetadataEntry,
  kind: GameAssetTooltipDetails['kind']
): Array<{ key: string, value: string }> {
  const keys = kind === 'augment'
    ? [
        'tooltipTRA',
        'tooltipTra',
        'tooltip',
        'descriptionTRA',
        'descriptionTra',
        'description',
        'desc',
        'longDesc',
        'shortDesc',
        'plaintext'
      ] as const
    : [
        'description',
        'tooltip',
        'desc',
        'longDesc',
        'shortDesc',
        'plaintext',
        'descriptionTRA',
        'descriptionTra',
        'tooltipTRA',
        'tooltipTra'
      ] as const

  return keys.flatMap(key => {
    const value = details[key]
    return typeof value === 'string' && value.trim() ? [{ key, value }] : []
  })
}

function scoreTooltipTextCandidate(
  key: string,
  rawValue: string,
  text: string,
  kind: GameAssetTooltipDetails['kind']
): number {
  if (!text) {
    return Number.NEGATIVE_INFINITY
  }

  const fieldWeights: Record<string, number> = {
    tooltipTRA: kind === 'augment' ? 45 : 35,
    tooltipTra: kind === 'augment' ? 45 : 35,
    tooltip: kind === 'augment' ? 44 : 30,
    desc: kind === 'augment' ? 32 : 34,
    longDesc: kind === 'perk' ? 25 : 32,
    descriptionTRA: 28,
    descriptionTra: 28,
    description: kind === 'spell' ? 36 : 24,
    shortDesc: kind === 'perk' ? 50 : kind === 'augment' ? 4 : 18,
    plaintext: -16
  }
  const markerBonus = kind === 'item' && /<(?:stats|passive|active|rules)\b/i.test(rawValue) ? 35 : 0
  const augmentCompletenessBonus = kind === 'augment' ? Math.min(text.length, 140) : Math.min(text.length, 90)
  const rawTracePenalty = hasUnresolvedTemplateTrace(rawValue) ? 28 : 0
  const shortPenalty = kind === 'augment' && text.length < 12 ? 20 : 0

  return (fieldWeights[key] || 0) + markerBonus + augmentCompletenessBonus - rawTracePenalty - shortPenalty
}

function getItemTotalPrice(details: GameAssetMetadataEntry): number | null {
  const priceCandidates = [
    details.gold?.total,
    details.total,
    typeof details.price === 'number' ? details.price : details.price?.total
  ]

  return priceCandidates.map(normalizePositiveNumber).find(value => value !== null) || null
}

function formatItemPriceText(details: GameAssetMetadataEntry): string {
  const totalPrice = getItemTotalPrice(details)
  if (totalPrice === null) {
    return ''
  }

  const basePrice = getItemBasePrice(details)
  return basePrice === null ? `${totalPrice} G` : `${totalPrice} G (合成 ${basePrice} G)`
}

function getItemBasePrice(details: GameAssetMetadataEntry): number | null {
  const priceCandidates = [
    details.gold?.base,
    typeof details.price === 'number' ? null : details.price?.base
  ]

  return priceCandidates.map(normalizePositiveNumber).find(value => value !== null) || null
}

function getItemRecipeIconUrls(details: GameAssetMetadataEntry): string[] {
  return (details.from || [])
    .map(itemId => getItemIconUrl(itemId))
    .filter(Boolean)
}

function getItemStatLines(details: GameAssetMetadataEntry): string[] {
  const stats = getItemStatLinesFromStats(details.stats)
  return stats.length ? stats : getItemStatLinesFromTooltip(details)
}

function getItemStatLinesFromStats(stats: GameAssetStats | undefined): string[] {
  if (!stats) {
    return []
  }

  const statOrder = [
    'FlatHPPoolMod',
    'FlatMPPoolMod',
    'FlatPhysicalDamageMod',
    'FlatMagicDamageMod',
    'FlatArmorMod',
    'FlatSpellBlockMod',
    'PercentAttackSpeedMod',
    'FlatCritChanceMod',
    'FlatMovementSpeedMod'
  ]
  const lines = statOrder
    .map(key => formatItemStatLine(key, stats[key]))
    .filter(Boolean)

  const orderedKeys = new Set(statOrder)
  const extraLines = Object.entries(stats)
    .filter(([key]) => !orderedKeys.has(key))
    .map(([key, value]) => formatItemStatLine(key, value))
    .filter(Boolean)

  return [...lines, ...extraLines]
}

function formatItemStatLine(key: string, rawValue: unknown): string {
  const value = normalizeFiniteNumber(rawValue)
  if (value === null || value === 0) {
    return ''
  }

  const labels: Record<string, { label: string, percent?: boolean }> = {
    FlatHPPoolMod: { label: '生命值' },
    FlatMPPoolMod: { label: '法力' },
    FlatPhysicalDamageMod: { label: '攻击力' },
    FlatMagicDamageMod: { label: '法术强度' },
    FlatArmorMod: { label: '护甲' },
    FlatSpellBlockMod: { label: '魔法抗性' },
    PercentAttackSpeedMod: { label: '攻击速度', percent: true },
    FlatCritChanceMod: { label: '暴击几率', percent: true },
    FlatMovementSpeedMod: { label: '移动速度' }
  }
  const stat = labels[key]
  if (!stat) {
    return `${formatNumberForTooltip(value)} ${key}`
  }

  const displayValue = stat.percent
    ? `${formatNumberForTooltip(Math.abs(value) <= 1 ? value * 100 : value)}%`
    : formatNumberForTooltip(value)
  return `${displayValue} ${stat.label}`
}

function getItemStatLinesFromTooltip(details: GameAssetMetadataEntry): string[] {
  const raw = pickBestTooltipText(details, 'item').raw
  return parseRiotItemSections(raw).statLines
}

function getItemTooltipSections(details: GameAssetMetadataEntry): GameAssetTooltipSection[] {
  const raw = pickBestTooltipText(details, 'item').raw
  return parseRiotItemSections(raw).sections
}

function parseRiotItemSections(raw: string): { statLines: string[], sections: GameAssetTooltipSection[] } {
  if (!raw) {
    return { statLines: [], sections: [] }
  }

  const statLines = extractRiotTagBlocks(raw, 'stats')
    .flatMap(block => normalizeRiotTooltipText(block).split('\n'))
    .map(line => line.trim())
    .filter(Boolean)
  const markers = getRiotItemSectionMarkers(raw)
  const sections = markers.flatMap((marker, index): GameAssetTooltipSection[] => {
    const nextMarkerIndex = markers[index + 1]?.start ?? raw.length
    const body = normalizeRiotTooltipText(raw.slice(marker.end, nextMarkerIndex))
    const text = body || (marker.tone === 'rules' ? marker.label : '')
    if (!text) {
      return []
    }

    return [{
      label: marker.tone === 'rules' ? undefined : marker.label,
      text,
      tone: marker.tone === 'active' ? 'active' : marker.tone === 'passive' ? 'passive' : 'body'
    }]
  })

  return { statLines, sections }
}

function getRiotItemSectionMarkers(raw: string): RiotItemSectionMarker[] {
  const markerPattern = /<(passive|active|rules)\b[^>]*>([\s\S]*?)<\/\1>/gi
  return Array.from(raw.matchAll(markerPattern))
    .filter(marker => isRiotItemSectionMarker(raw, marker))
    .map(marker => {
      const tone = marker[1].toLowerCase() as RiotItemSectionTone
      const start = marker.index === undefined ? 0 : marker.index
      return {
        tone,
        label: normalizeRiotTooltipText(marker[2]),
        start,
        end: start + marker[0].length
      }
    })
}

function isRiotItemSectionMarker(raw: string, marker: RegExpMatchArray): boolean {
  const tone = marker[1].toLowerCase() as RiotItemSectionTone
  const start = marker.index === undefined ? 0 : marker.index
  const end = start + marker[0].length
  return hasSectionBoundaryBefore(raw, start) || (tone !== 'rules' && hasSectionBoundaryAfter(raw, end))
}

function hasSectionBoundaryBefore(raw: string, index: number): boolean {
  const prefix = raw.slice(Math.max(0, index - 120), index).trimEnd()
  return !prefix || /(?:<maintext\b[^>]*>|<br\s*\/?>|<li(?:\s[^>]*)?>|<\/stats>|<\/rules>)\s*$/i.test(prefix)
}

function hasSectionBoundaryAfter(raw: string, index: number): boolean {
  return /^\s*(?:<br\s*\/?>|<\/li>|<li(?:\s[^>]*)?>)/i.test(raw.slice(index, index + 80))
}

function extractRiotTagBlocks(raw: string, tagName: string): string[] {
  if (!raw) {
    return []
  }

  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi')
  return Array.from(raw.matchAll(pattern), match => match[1] || '')
}

function getAugmentRarityDetails(value: unknown): { label: string, tone?: string } {
  const tone = getAugmentRarityTone(value)
  const labels: Partial<Record<AugmentRarityTone, { label: string, tone: string }>> = {
    silver: { label: '银色', tone: 'silver' },
    gold: { label: '黄金阶', tone: 'gold' },
    prismatic: { label: '棱彩', tone: 'prismatic' }
  }

  return labels[tone] || { label: '' }
}

function getAugmentRarityTone(value: unknown): AugmentRarityTone {
  if (typeof value !== 'string') {
    return 'default'
  }

  const normalized = value.trim().toLowerCase().replace(/^k/, '')
  const tones: Record<string, AugmentRarityTone> = {
    silver: 'silver',
    gold: 'gold',
    golden: 'gold',
    prismatic: 'prismatic',
    bronze: 'bronze'
  }

  return tones[normalized] || 'default'
}

export function normalizeRiotTooltipText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }

  return decodeHtmlEntities(value)
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|ul|ol|tr|table|maintext|stats|rules)>/gi, '\n')
    .replace(/<li(?:\s[^>]*)?>/gi, '\n')
    .replace(/\{\{[\s\S]*?\}\}/g, '')
    .replace(/@[^@\s]+@/g, '')
    .replace(/%i:[^%\s]+%?/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function hasRawTooltipTrace(value: string): boolean {
  return /<[^>]+>|\{\{|\}\}|@[^@\s]+@|%i:/i.test(value)
}

function hasUnresolvedTemplateTrace(value: string): boolean {
  return /\{\{|\}\}|@[^@\s]+@|%i:/i.test(value)
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
}

function buildAssetCandidates(kind: GameAssetKind, id: number): string[] {
  return uniqueNonEmpty([
    getManifestAssetUrl(kind, id),
    getBackendAssetUrl(kind, id),
    ...getRemoteAssetUrls(kind, id)
  ])
}

function getManifestAssetUrl(kind: GameAssetKind, id: number): string {
  const section = getManifestSection(kind)
  const value = section[String(id)]
  if (!value) {
    return ''
  }

  return normalizeManifestAssetPath(value)
}

function getManifestSection(kind: GameAssetKind): GameAssetManifestSection {
  switch (kind) {
    case 'champion':
      return manifest.champions
    case 'item':
      return manifest.items
    case 'spell':
      return manifest.summonerSpells
    case 'perk':
      return manifest.perks
    case 'augment':
      return manifest.augments
    case 'profile':
      return manifest.profileIcons || {}
  }
}

function getManifestObjectiveIconUrl(kind: ObjectiveIconKind): string {
  const value = manifest.objectives?.[kind]
  return value ? normalizeManifestAssetPath(value) : ''
}

function normalizeManifestAssetPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) {
    return ''
  }
  if (/^(?:https?:|data:|file:)/i.test(trimmed)) {
    return trimmed
  }
  if (trimmed.startsWith('/game-assets/')) {
    return `${PUBLIC_GAME_ASSET_BASE}/${trimmed.slice('/game-assets/'.length)}`
  }
  if (trimmed.startsWith('game-assets/')) {
    return `${getViteBaseUrl()}${trimmed}`
  }
  if (trimmed.startsWith('./game-assets/')) {
    return `${getViteBaseUrl()}${trimmed.slice(2)}`
  }
  return `${PUBLIC_GAME_ASSET_BASE}/${trimmed.replace(/^\/+/, '')}`
}

function getCommunityDragonObjectiveIconUrl(kind: ObjectiveIconKind): string {
  const minimapFileName = VERIFIED_OBJECTIVE_MINIMAP_FILES[kind]
  return minimapFileName ? `${COMMUNITY_DRAGON_MINIMAP_ICONS}/${minimapFileName}` : ''
}

function getBackendAssetUrl(kind: GameAssetKind, id: number): string {
  switch (kind) {
    case 'champion':
      return `${BACKEND_ASSET_BASE}/champion/${id}`
    case 'item':
      return `${BACKEND_ASSET_BASE}/item/${id}`
    case 'spell':
      return `${BACKEND_ASSET_BASE}/spell/${id}`
    case 'augment':
      return `${BACKEND_ASSET_BASE}/augment/${id}`
    case 'profile':
      return `${BACKEND_ASSET_BASE}/profile/${id}`
    case 'perk':
      return `${BACKEND_ASSET_BASE}/perk/${id}`
  }
}

function getRemoteAssetUrls(kind: GameAssetKind, id: number): string[] {
  const dataDragonCdn = getDataDragonCdn()
  switch (kind) {
    case 'champion':
      return [`${COMMUNITY_DRAGON_GAME_DATA}/champion-icons/${id}.png`]
    case 'item':
      return [`${dataDragonCdn}/img/item/${id}.png`]
    case 'spell':
      return [`${COMMUNITY_DRAGON_GAME_DATA}/summoner-spells/${id}.png`]
    case 'perk':
      return []
    case 'profile':
      return [`${dataDragonCdn}/img/profileicon/${id}.png`]
    case 'augment':
      return []
  }
}

function getDataDragonCdn(): string {
  return `https://ddragon.leagueoflegends.com/cdn/${getDataDragonVersion()}`
}

function getDataDragonVersion(): string {
  return getConcreteAssetVersion(manifest.version) ||
    getConcreteAssetVersion(metadata.version) ||
    'latest'
}

function getConcreteAssetVersion(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  return trimmed && !['seed', 'lcu'].includes(trimmed.toLowerCase()) ? trimmed : ''
}

function registerFallbackChain(candidates: string[]): void {
  if (!candidates.length) {
    return
  }
  for (const candidate of candidates) {
    fallbackChains.set(normalizeFailureUrl(candidate), candidates)
    fallbackChains.set(candidate, candidates)
  }
}

function getNextAssetFallbackUrl(failedUrl: string): string {
  const normalizedFailedUrl = normalizeFailureUrl(failedUrl)
  const chain = fallbackChains.get(normalizedFailedUrl) || fallbackChains.get(failedUrl)
  if (!chain?.length) {
    return ''
  }

  const failedIndex = chain.findIndex(candidate => normalizeFailureUrl(candidate) === normalizedFailedUrl)
  const candidates = failedIndex >= 0 ? chain.slice(failedIndex + 1) : chain
  return candidates.find(candidate => !isAssetUrlFailed(candidate)) || ASSET_PLACEHOLDER_URL
}

function isAssetUrlFailed(url: string): boolean {
  return failedAssetUrls.has(normalizeFailureUrl(url))
}

function normalizeFailureUrl(url: string): string {
  if (!url) {
    return ''
  }
  if (typeof window === 'undefined' || !window.location?.href) {
    return url
  }
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}

function markImageAsUnavailable(image: HTMLImageElement): void {
  image.dataset.assetFailed = 'true'
  image.removeAttribute('src')
  image.setAttribute('aria-hidden', 'true')
}

function isHtmlImageElement(value: unknown): value is HTMLImageElement {
  return typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement
}

function normalizeAssetId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

function normalizeManifest(nextManifest: Partial<GameAssetManifest>): GameAssetManifest {
  return {
    version: nextManifest.version || EMPTY_MANIFEST.version,
    locale: nextManifest.locale || EMPTY_MANIFEST.locale,
    items: normalizeManifestSection(nextManifest.items),
    summonerSpells: normalizeManifestSection(nextManifest.summonerSpells),
    perks: normalizeManifestSection(nextManifest.perks),
    augments: normalizeManifestSection(nextManifest.augments),
    champions: normalizeManifestSection(nextManifest.champions),
    profileIcons: normalizeManifestSection(nextManifest.profileIcons),
    objectives: normalizeManifestSection(nextManifest.objectives)
  }
}

function normalizeMetadata(nextMetadata: Partial<GameAssetMetadata>): GameAssetMetadata {
  return {
    version: nextMetadata.version || EMPTY_METADATA.version,
    locale: nextMetadata.locale || EMPTY_METADATA.locale,
    items: normalizeMetadataSection(nextMetadata.items),
    summonerSpells: normalizeMetadataSection(nextMetadata.summonerSpells),
    perks: normalizeMetadataSection(nextMetadata.perks),
    augments: normalizeMetadataSection(nextMetadata.augments)
  }
}

function normalizeManifestSection(section?: GameAssetManifestSection): GameAssetManifestSection {
  return section ? { ...section } : {}
}

function normalizeMetadataSection(section?: Record<string, GameAssetMetadataEntry>): Record<string, GameAssetMetadataEntry> {
  if (!section) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(section)
      .map(([key, entry]): [string, GameAssetMetadataEntry | null] => [key, normalizeMetadataEntry(entry)])
      .filter((entry): entry is [string, GameAssetMetadataEntry] => Boolean(entry[1]))
  )
}

function normalizeMetadataEntry(entry: GameAssetMetadataEntry | undefined): GameAssetMetadataEntry | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const id = normalizeAssetId(entry.id)
  if (id === null) {
    return null
  }

  const normalized: GameAssetMetadataEntry = { id }
  for (const key of [
    'name',
    'nameTRA',
    'description',
    'tooltip',
    'plaintext',
    'desc',
    'shortDesc',
    'longDesc',
    'descriptionTra',
    'descriptionTRA',
    'tooltipTra',
    'tooltipTRA',
    'endOfGameStatDesc',
    'rarity',
    'icon'
  ] as const) {
    const value = entry[key]
    if (typeof value === 'string' && value.trim()) {
      normalized[key] = value
    }
  }

  const endOfGameStatDescs = normalizeStringArray(entry.endOfGameStatDescs)
  if (endOfGameStatDescs.length) {
    normalized.endOfGameStatDescs = endOfGameStatDescs
  }

  const gold = normalizeGold(entry.gold)
  const price = typeof entry.price === 'number' ? normalizePositiveNumber(entry.price) : normalizeGold(entry.price)
  const total = normalizePositiveNumber(entry.total)
  if (gold) {
    normalized.gold = gold
  }
  if (price) {
    normalized.price = price
  }
  if (total !== null) {
    normalized.total = total
  }

  const from = normalizeAssetIdArray(entry.from)
  const into = normalizeAssetIdArray(entry.into)
  const stats = normalizeStats(entry.stats)
  if (from.length) {
    normalized.from = from
  }
  if (into.length) {
    normalized.into = into
  }
  if (stats) {
    normalized.stats = stats
  }
  return normalized
}

function normalizeAssetIdArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(item => normalizeAssetId(typeof item === 'string' ? Number(item) : item)).filter((item): item is number => item !== null)
    : []
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean)
    : []
}

function normalizeStats(value: unknown): GameAssetStats | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const stats = Object.fromEntries(
    Object.entries(value)
      .map(([key, rawValue]): [string, number | null] => [key, normalizeFiniteNumber(rawValue)])
      .filter((entry): entry is [string, number] => entry[1] !== null)
  )

  return Object.keys(stats).length ? stats : undefined
}

function normalizeGold(value: unknown): GameAssetGold | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const gold: GameAssetGold = {}
  const total = normalizePositiveNumber(value.total)
  const base = normalizePositiveNumber(value.base)
  const sell = normalizePositiveNumber(value.sell)
  if (total !== null) {
    gold.total = total
  }
  if (base !== null) {
    gold.base = base
  }
  if (sell !== null) {
    gold.sell = sell
  }

  return Object.keys(gold).length ? gold : undefined
}

function mergeMetadataSection(
  base: Record<string, GameAssetMetadataEntry>,
  overlay: Record<string, GameAssetMetadataEntry>
): Record<string, GameAssetMetadataEntry> {
  const merged: Record<string, GameAssetMetadataEntry> = { ...base }
  for (const [key, entry] of Object.entries(overlay)) {
    merged[key] = mergeMetadataEntry(merged[key], entry)
  }

  return merged
}

function mergeMetadata(base: GameAssetMetadata, overlay: GameAssetMetadata): GameAssetMetadata {
  const overlayVersion = getConcreteAssetVersion(overlay.version)
  return {
    version: overlayVersion || base.version,
    locale: overlay.locale !== EMPTY_METADATA.locale ? overlay.locale : base.locale,
    items: mergeMetadataSection(base.items, overlay.items),
    summonerSpells: mergeMetadataSection(base.summonerSpells, overlay.summonerSpells),
    perks: mergeMetadataSection(base.perks, overlay.perks),
    augments: mergeMetadataSection(base.augments, overlay.augments)
  }
}

function mergeMetadataEntry(
  base: GameAssetMetadataEntry | undefined,
  overlay: GameAssetMetadataEntry
): GameAssetMetadataEntry {
  if (!base) {
    return { ...overlay }
  }

  const merged: GameAssetMetadataEntry = {
    ...base,
    ...overlay
  }
  if (base.gold || overlay.gold) {
    merged.gold = {
      ...(base.gold || {}),
      ...(overlay.gold || {})
    }
  }
  if ((base.price && typeof base.price !== 'number') || (overlay.price && typeof overlay.price !== 'number')) {
    merged.price = {
      ...(typeof base.price === 'number' ? { total: base.price } : base.price || {}),
      ...(typeof overlay.price === 'number' ? { total: overlay.price } : overlay.price || {})
    }
  }

  return merged
}

function normalizePositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : null
  }
  return null
}

function formatNumberForTooltip(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)))
}

function getViteBaseUrl(): string {
  const baseUrl = import.meta.env?.BASE_URL || './'
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
