#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(currentDir, '..')
const assetRoot = resolve(projectRoot, 'public/game-assets')
const manifestPath = resolve(assetRoot, 'manifest.json')
const metadataPath = resolve(assetRoot, 'metadata.json')
const ddragonCdn = version => `https://ddragon.leagueoflegends.com/cdn/${version}`
const ddragonImageCdn = 'https://ddragon.leagueoflegends.com/cdn/img'
const cdragonRaw = 'https://raw.communitydragon.org/latest'
const cdragonRoot = 'https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default'
const cdragonGameData = `${cdragonRoot}/v1`
const cdragonMinimapIcons = `${cdragonRaw}/game/assets/ux/minimap/icons`
let args = {}
let version = ''
let locale = 'zh_CN'
let manifest = null
let metadata = null
let summonerSpellEntriesCache = null
const itemSource = () => `${ddragonCdn(version)}/data/${locale}/item.json`
const summonerSpellSource = () => `${ddragonCdn(version)}/data/${locale}/summoner.json`
const traitSource = () => `${ddragonCdn(version)}/data/${locale}/runesReforged.json`
const cdragonLocale = () => locale.toLowerCase().replace('-', '_')
const cdragonLocalizedGameData = () =>
  `${cdragonRaw}/plugins/rcp-be-lol-game-data/global/${cdragonLocale()}/v1`
const defaultAugmentSource = () => `${cdragonLocalizedGameData()}/cherry-augments.json`
const defaultAugmentFallbackSource = () => `${cdragonGameData}/cherry-augments.json`
const arenaAugmentDetailsSource = () => `${cdragonRaw}/cdragon/arena/${cdragonLocale()}.json`
const arenaAugmentDetailsFallbackSource = () => `${cdragonRaw}/cdragon/arena/en_us.json`
const defaultKiwiAugmentSource = () => 'https://game.gtimg.cn/images/lol/act/img/js/kiwi/kiwi_augments.json'

const sections = {
  champion: { manifestKey: 'champions', dir: 'champions', url: id => `${cdragonGameData}/champion-icons/${id}.png` },
  item: { manifestKey: 'items', dir: 'items', url: id => `${ddragonCdn(version)}/img/item/${id}.png` },
  spell: { manifestKey: 'summonerSpells', dir: 'summoner-spells', url: getSummonerSpellIconSourceUrl },
  perk: { manifestKey: 'perks', dir: 'perks', url: id => `${cdragonGameData}/perks/${id}.png` },
  profile: { manifestKey: 'profileIcons', dir: 'profile-icons', url: id => `${ddragonCdn(version)}/img/profileicon/${id}.png` }
}

const objectiveSources = {
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

export async function main(rawArgs = process.argv.slice(2)) {
  args = parseArgs(rawArgs)
  if (args.help) {
    printHelp()
    return
  }

  version = await resolveDDragonVersion(args.version)
  locale = args.locale || 'zh_CN'
  manifest = await readManifest()
  metadata = await readMetadata()
  summonerSpellEntriesCache = null
  manifest.version = version
  manifest.locale = locale
  metadata.version = version
  metadata.locale = locale
  metadata.items = metadata.items || {}
  metadata.summonerSpells = metadata.summonerSpells || {}
  metadata.perks = metadata.perks || {}
  metadata.augments = metadata.augments || {}
  manifest.objectives = manifest.objectives || {}

  for (const [kind, config] of Object.entries(sections)) {
    for (const id of args[kind] || []) {
      await syncAsset(kind, config, id)
      if (kind === 'spell') {
        await hydrateSummonerSpellMetadataById(id)
      }
    }
  }

  if (args.allItems && !args.metadataOnly) {
    await downloadAllItems()
  }

  if (shouldDownloadItemMetadataOnly(args)) {
    await downloadAllItemMetadata()
  }

  if (args.allSpells) {
    await downloadAllSummonerSpells()
  }

  if (args.allPerks) {
    await downloadAllPerks()
  }

  if (args.allAugments && !args.metadataOnly) {
    await downloadAllAugments(args.augmentSource || defaultAugmentSource())
  }

  if (shouldDownloadAugmentMetadataOnly(args)) {
    await downloadAllAugmentMetadata(args.augmentSource || defaultAugmentSource())
  }

  if (args.allObjectives) {
    await downloadAllObjectives()
  }

  for (const augment of args.augment || []) {
    const [id, url] = String(augment).split('=')
    if (!id || !url) {
      console.warn(`Skipping augment ${augment}; pass --augment <id>=<direct-url> when a reliable source is known.`)
      continue
    }
    await syncAsset('augment', {
      manifestKey: 'augments',
      dir: 'augments',
      url: () => url
    }, id)
  }

  if (shouldEnrichKiwiAugments(args, locale)) {
    await enrichKiwiAugmentMetadata(args.kiwiAugmentSource || defaultKiwiAugmentSource())
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.log(`Updated ${manifestPath}`)

  if (shouldWriteMetadata(args)) {
    await writeMetadata()
  }
}

if (isCliEntrypoint()) {
  await main()
}

function isCliEntrypoint() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
}

async function resolveDDragonVersion(explicitVersion) {
  if (explicitVersion) {
    return explicitVersion
  }

  const versionsUrl = 'https://ddragon.leagueoflegends.com/api/versions.json'
  try {
    const response = await fetch(versionsUrl)
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    const versions = await response.json()
    const latest = Array.isArray(versions) ? versions.find(value => typeof value === 'string' && value.trim()) : ''
    if (latest) {
      return latest
    }
    throw new Error('empty version list')
  } catch (error) {
    console.warn(`Failed to resolve latest DDragon version from ${versionsUrl}: ${error instanceof Error ? error.message : String(error)}`)
    return 'latest'
  }
}

async function syncAsset(kind, config, id) {
  const normalizedId = normalizeId(id)
  if (!normalizedId) {
    console.warn(`Skipping invalid ${kind} id: ${id}`)
    return false
  }

  const relativePath = `${config.dir}/${normalizedId}.png`
  const target = resolve(assetRoot, relativePath)
  await mkdir(dirname(target), { recursive: true })

  try {
    const url = await config.url(normalizedId)
    if (!url) {
      throw new Error('missing source URL')
    }
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(target, buffer)
    manifest[config.manifestKey] = manifest[config.manifestKey] || {}
    manifest[config.manifestKey][String(normalizedId)] = relativePath
    console.log(`Synced ${kind} ${normalizedId} -> ${relativePath}`)
    return true
  } catch (error) {
    console.warn(`Failed to sync ${kind} ${normalizedId}: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

async function downloadAllItems() {
  manifest.items = manifest.items || {}
  const items = await readItemEntries()
  if (!items) {
    return
  }
  let synced = 0
  let failed = 0

  for (const entry of items) {
    const ok = await syncAsset('item', sections.item, entry.id)
    hydrateItemMetadata(entry)
    if (ok) {
      synced += 1
    } else {
      failed += 1
    }
  }

  console.log(`Synced ${synced}/${items.length} DDragon item icons from item.json`)
  if (failed > 0) {
    process.exitCode = 1
  }
}

async function downloadAllItemMetadata() {
  const items = await readItemEntries()
  if (!items) {
    return
  }

  for (const entry of items) {
    hydrateItemMetadata(entry)
  }

  console.log(`Hydrated ${items.length} DDragon item metadata entries from item.json`)
}

async function downloadAllSummonerSpells() {
  manifest.summonerSpells = manifest.summonerSpells || {}
  const spells = await readSummonerSpellEntries()
  if (!spells) {
    return
  }
  let synced = 0
  let failed = 0

  for (const spell of spells) {
    const ok = await syncAsset('spell', sections.spell, spell.id)
    hydrateSummonerSpellMetadata(spell)
    if (ok) {
      synced += 1
    } else {
      failed += 1
    }
  }

  console.log(`Synced ${synced}/${spells.length} DDragon summoner spell icons from summoner.json`)
  if (failed > 0) {
    process.exitCode = 1
  }
}

async function downloadAllPerks() {
  manifest.perks = manifest.perks || {}
  let payload
  try {
    const response = await fetch(traitSource())
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    payload = await response.json()
  } catch (error) {
    process.exitCode = 1
    console.warn(`Failed to read DDragon rune index: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const perks = extractPerks(payload)
  const iconById = new Map(perks.map(perk => [String(perk.id), perk.icon]))
  let synced = 0
  let failed = 0

  for (const perk of perks) {
    const ok = await syncAsset('perk', {
      manifestKey: 'perks',
      dir: 'perks',
      url: id => {
        const icon = iconById.get(String(id))
        return icon ? `${ddragonImageCdn}/${icon}` : ''
      }
    }, perk.id)
    metadata.perks[String(perk.id)] = {
      id: perk.id,
      name: textValue(perk.name),
      description: textValue(perk.description),
      shortDesc: textValue(perk.shortDesc),
      longDesc: textValue(perk.longDesc),
      icon: `perks/${perk.id}.png`
    }
    if (ok) {
      synced += 1
    } else {
      failed += 1
    }
  }

  console.log(`Synced ${synced}/${perks.length} DDragon perk icons from runesReforged.json`)
  if (failed > 0) {
    process.exitCode = 1
  }
}

async function downloadAllAugments(sourceUrl) {
  manifest.augments = manifest.augments || {}
  const augments = await readAugmentEntries(sourceUrl)
  if (!augments) {
    return
  }
  let synced = 0
  let failed = 0

  for (const augment of augments) {
    const ok = await syncAsset('augment', {
      manifestKey: 'augments',
      dir: 'augments',
      url: () => augment.sourceUrl
    }, augment.id)
    hydrateAugmentMetadata(augment)
    if (ok) {
      synced += 1
    } else {
      failed += 1
    }
  }

  console.log(`Synced ${synced}/${augments.length} CommunityDragon augment icons from cherry-augments.json`)
  if (failed > 0) {
    console.warn(`Skipped ${failed} augment icons; item and perk sync results are unaffected.`)
  }
}

async function downloadAllAugmentMetadata(sourceUrl) {
  const augments = await readAugmentEntries(sourceUrl)
  if (!augments) {
    return
  }

  for (const augment of augments) {
    hydrateAugmentMetadata(augment)
  }

  console.log(`Hydrated ${augments.length} CommunityDragon augment metadata entries from cherry-augments.json`)
}

async function enrichKiwiAugmentMetadata(sourceUrl) {
  const payload = await readJsonFromUrl(sourceUrl)
  if (!payload) {
    console.warn(`Skipped GTIMG Kiwi augment enrichment; source unavailable at ${sourceUrl}`)
    return
  }

  const entries = extractKiwiAugmentEntries(payload)
  const changed = mergeKiwiAugmentMetadata(metadata, entries)
  console.log(`Enriched ${changed}/${entries.length} GTIMG Kiwi augment metadata entries from kiwi_augments.json`)
}

async function downloadAllObjectives() {
  manifest.objectives = manifest.objectives || {}
  let synced = 0
  let failed = 0

  for (const [key, fileName] of Object.entries(objectiveSources)) {
    const ok = await syncObjectiveAsset(key, fileName)
    if (ok) {
      synced += 1
    } else {
      failed += 1
    }
  }

  console.log(`Synced ${synced}/${Object.keys(objectiveSources).length} CommunityDragon minimap objective icons`)
  if (failed > 0) {
    process.exitCode = 1
  }
}

async function readItemEntries() {
  let payload
  try {
    const response = await fetch(itemSource())
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    payload = await response.json()
  } catch (error) {
    process.exitCode = 1
    console.warn(`Failed to read DDragon item index: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }

  return Object.entries(payload?.data || {})
    .map(([id, item]) => ({ id: normalizeId(id), item }))
    .filter(entry => entry.id)
    .sort((left, right) => left.id - right.id)
}

async function readSummonerSpellEntries() {
  if (summonerSpellEntriesCache) {
    return summonerSpellEntriesCache
  }

  let payload
  try {
    const response = await fetch(summonerSpellSource())
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    payload = await response.json()
  } catch (error) {
    process.exitCode = 1
    console.warn(`Failed to read DDragon summoner spell index: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }

  summonerSpellEntriesCache = Object.values(payload?.data || {})
    .map(spell => ({
      id: normalizeId(spell?.key ?? spell?.id),
      name: spell?.name,
      description: spell?.description,
      tooltip: spell?.tooltip,
      plaintext: spell?.plaintext,
      image: spell?.image?.full
    }))
    .filter(entry => entry.id)
    .sort((left, right) => left.id - right.id)
  return summonerSpellEntriesCache
}

async function getSummonerSpellIconSourceUrl(rawId) {
  const id = normalizeId(rawId)
  if (!id) {
    return ''
  }

  const spells = await readSummonerSpellEntries()
  const image = spells?.find(entry => entry.id === id)?.image
  return image ? `${ddragonCdn(version)}/img/spell/${image}` : ''
}

async function readAugmentEntries(sourceUrl) {
  const payload = await readAugmentIndexPayload(sourceUrl)
  if (!payload) {
    return null
  }

  const arenaDetails = await readArenaAugmentDetails()
  return extractAugments(payload)
    .map(augment => {
      const exactDetails = arenaDetails.byId.get(String(augment.id))
      const iconDetails = augment.iconPath ? arenaDetails.byIconPath.get(augment.iconPath) : undefined
      const details = exactDetails || iconDetails
      return details
        ? {
            ...augment,
            name: firstText(exactDetails?.name, augment.name, iconDetails?.name),
            nameTRA: firstText(exactDetails?.nameTRA, augment.nameTRA, iconDetails?.nameTRA),
            description: firstText(exactDetails?.description, augment.description, iconDetails?.description),
            descriptionTRA: firstText(exactDetails?.descriptionTRA, augment.descriptionTRA, iconDetails?.descriptionTRA),
            tooltip: firstText(exactDetails?.tooltip, augment.tooltip, iconDetails?.tooltip),
            tooltipTRA: firstText(exactDetails?.tooltipTRA, augment.tooltipTRA, iconDetails?.tooltipTRA),
            shortDesc: firstText(exactDetails?.shortDesc, augment.shortDesc, iconDetails?.shortDesc),
            longDesc: firstText(exactDetails?.longDesc, augment.longDesc, iconDetails?.longDesc),
            rarity: firstText(exactDetails?.rarity, augment.rarity, iconDetails?.rarity)
          }
        : augment
    })
}

async function readAugmentIndexPayload(sourceUrl) {
  const fallbackUrl = sourceUrl === defaultAugmentSource() ? defaultAugmentFallbackSource() : ''
  const payload = await readJsonFromUrl(sourceUrl)
  if (payload) {
    return payload
  }

  if (!fallbackUrl) {
    console.warn(`Skipped all augments; source unavailable at ${sourceUrl}`)
    return null
  }

  console.warn(`Falling back to default CommunityDragon augment index at ${fallbackUrl}`)
  const fallbackPayload = await readJsonFromUrl(fallbackUrl)
  if (!fallbackPayload) {
    console.warn(`Skipped all augments; fallback source unavailable at ${fallbackUrl}`)
  }
  return fallbackPayload
}

async function readArenaAugmentDetails() {
  const detailsPayload = await readJsonFromUrl(arenaAugmentDetailsSource()) ||
    await readJsonFromUrl(arenaAugmentDetailsFallbackSource())
  return extractArenaAugmentDetails(detailsPayload)
}

async function readJsonFromUrl(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    return await response.json()
  } catch (error) {
    console.warn(`Failed to read ${url}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function hydrateItemMetadata(entry) {
  const itemMetadata = {
    id: entry.id,
    name: textValue(entry.item?.name),
    description: textValue(entry.item?.description),
    tooltip: textValue(entry.item?.tooltip),
    plaintext: textValue(entry.item?.plaintext),
    icon: `items/${entry.id}.png`
  }
  const gold = normalizeGold(entry.item?.gold)
  if (gold) {
    itemMetadata.gold = gold
  }
  const from = normalizeIdArray(entry.item?.from)
  const into = normalizeIdArray(entry.item?.into)
  const stats = normalizeStats(entry.item?.stats)
  if (from.length) {
    itemMetadata.from = from
  }
  if (into.length) {
    itemMetadata.into = into
  }
  if (stats) {
    itemMetadata.stats = stats
  }

  metadata.items[String(entry.id)] = itemMetadata
}

async function hydrateSummonerSpellMetadataById(rawId) {
  const id = normalizeId(rawId)
  if (!id) {
    return
  }

  const spells = await readSummonerSpellEntries()
  const spell = spells?.find(entry => entry.id === id)
  if (spell) {
    hydrateSummonerSpellMetadata(spell)
  }
}

function hydrateSummonerSpellMetadata(spell) {
  metadata.summonerSpells[String(spell.id)] = {
    id: spell.id,
    name: textValue(spell.name),
    description: textValue(spell.description),
    tooltip: textValue(spell.tooltip),
    plaintext: textValue(spell.plaintext),
    icon: `summoner-spells/${spell.id}.png`
  }
}

function hydrateAugmentMetadata(augment) {
  metadata.augments[String(augment.id)] = {
    id: augment.id,
    name: textValue(augment.name),
    nameTRA: textValue(augment.nameTRA),
    description: textValue(augment.description),
    descriptionTRA: textValue(augment.descriptionTRA),
    tooltip: textValue(augment.tooltip),
    tooltipTRA: textValue(augment.tooltipTRA),
    shortDesc: textValue(augment.shortDesc),
    longDesc: textValue(augment.longDesc),
    rarity: textValue(augment.rarity),
    icon: `augments/${augment.id}.png`
  }
}

async function syncObjectiveAsset(key, fileName) {
  const relativePath = `objectives/${fileName}`
  const target = resolve(assetRoot, relativePath)
  await mkdir(dirname(target), { recursive: true })

  try {
    const response = await fetch(`${cdragonMinimapIcons}/${fileName}`)
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(target, buffer)
    manifest.objectives[key] = relativePath
    console.log(`Synced objective ${key} -> ${relativePath}`)
    return true
  } catch (error) {
    console.warn(`Failed to sync objective ${key}: ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch {
    return {
      version,
      locale,
      items: {},
      summonerSpells: {},
      perks: {},
      augments: {},
      champions: {},
      profileIcons: {},
      objectives: {}
    }
  }
}

async function readMetadata() {
  try {
    return JSON.parse(await readFile(metadataPath, 'utf8'))
  } catch {
    return {
      version,
      locale,
      items: {},
      summonerSpells: {},
      perks: {},
      augments: {}
    }
  }
}

async function writeMetadata() {
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  console.log(`Updated ${metadataPath}`)
}

function parseArgs(rawArgs) {
  const parsed = {
    champion: [],
    item: [],
    spell: [],
    perk: [],
    profile: [],
    augment: [],
    allItems: false,
    allSpells: false,
    allItemMetadata: false,
    allPerks: false,
    allAugments: false,
    allAugmentMetadata: false,
    allObjectives: false,
    metadataOnly: false,
    withMetadata: false,
    augmentSource: '',
    kiwiAugmentSource: '',
    noKiwiAugmentEnrich: false
  }

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]
    if (arg === '--help' || arg === '-h') {
      parsed.help = true
      continue
    }
    if (arg === '--all-items') {
      parsed.allItems = true
      continue
    }
    if (arg === '--all-spells') {
      parsed.allSpells = true
      continue
    }
    if (arg === '--all-item-metadata') {
      parsed.allItemMetadata = true
      continue
    }
    if (arg === '--all-perks') {
      parsed.allPerks = true
      continue
    }
    if (arg === '--all-augments') {
      parsed.allAugments = true
      continue
    }
    if (arg === '--all-augment-metadata') {
      parsed.allAugmentMetadata = true
      continue
    }
    if (arg === '--all-objectives') {
      parsed.allObjectives = true
      continue
    }
    if (arg === '--metadata-only') {
      parsed.metadataOnly = true
      continue
    }
    if (arg === '--with-metadata') {
      parsed.withMetadata = true
      continue
    }
    if (arg === '--no-kiwi-augment-enrich') {
      parsed.noKiwiAugmentEnrich = true
      continue
    }
    if (arg === '--version' || arg === '--locale' || arg === '--augment-source' || arg === '--kiwi-augment-source') {
      const key = {
        '--augment-source': 'augmentSource',
        '--kiwi-augment-source': 'kiwiAugmentSource'
      }[arg] || arg.slice(2)
      parsed[key] = rawArgs[index + 1]
      index += 1
      continue
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      if (Array.isArray(parsed[key])) {
        parsed[key].push(rawArgs[index + 1])
        index += 1
      }
    }
  }

  return parsed
}

function shouldDownloadItemMetadataOnly(parsed) {
  return parsed.allItemMetadata ||
    (parsed.metadataOnly && (parsed.allItems || (!parsed.allItems && !parsed.allAugments)))
}

function shouldDownloadAugmentMetadataOnly(parsed) {
  return parsed.allAugmentMetadata ||
    (parsed.metadataOnly && (parsed.allAugments || (!parsed.allItems && !parsed.allAugments)))
}

export function shouldEnrichKiwiAugments(parsed, currentLocale) {
  if (parsed.noKiwiAugmentEnrich) {
    return false
  }
  const augmentMetadataRequested = parsed.allAugments || parsed.allAugmentMetadata || parsed.metadataOnly
  return Boolean(augmentMetadataRequested && (parsed.kiwiAugmentSource || isZhCnLocale(currentLocale)))
}

function shouldWriteMetadata(parsed) {
  return parsed.withMetadata ||
    (parsed.spell || []).length > 0 ||
    parsed.allItems ||
    parsed.allSpells ||
    parsed.allPerks ||
    parsed.allAugments ||
    parsed.allItemMetadata ||
    parsed.allAugmentMetadata ||
    parsed.metadataOnly
}

export function isZhCnLocale(value) {
  return typeof value === 'string' && value.trim().toLowerCase().replace('-', '_') === 'zh_cn'
}

function normalizeId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function extractPerks(payload) {
  const unique = new Map()
  for (const style of Array.isArray(payload) ? payload : []) {
    const styleId = normalizeId(style?.id)
    const styleIcon = normalizeIconPath(style?.icon)
    if (styleId && styleIcon) {
      unique.set(String(styleId), {
        id: styleId,
        name: style.name,
        description: style.tooltip,
        icon: styleIcon
      })
    }
    for (const slot of Array.isArray(style?.slots) ? style.slots : []) {
      for (const rune of Array.isArray(slot?.runes) ? slot.runes : []) {
        const id = normalizeId(rune?.id)
        const icon = normalizeIconPath(rune?.icon)
        if (id && icon) {
          unique.set(String(id), {
            id,
            name: rune.name,
            shortDesc: rune.shortDesc,
            longDesc: rune.longDesc,
            icon
          })
        }
      }
    }
  }
  return Array.from(unique.values()).sort((left, right) => left.id - right.id)
}

function extractAugments(payload) {
  const unique = new Map()
  for (const augment of Array.isArray(payload) ? payload : []) {
    const id = normalizeId(augment?.id)
    const iconPath = normalizeCdragonAssetPath(
      augment?.augmentSmallIconPath ||
      augment?.augmentLargeIconPath ||
      augment?.iconPath ||
      augment?.icon
    )
    if (!id || !iconPath) {
      continue
    }
    unique.set(String(id), {
      id,
      name: firstText(augment.name, augment.nameTRA, augment.simpleName, augment.simpleNameTRA),
      nameTRA: textValue(augment.nameTRA),
      description: firstText(augment.description, augment.descriptionTRA, augment.tooltip, augment.tooltipTRA),
      descriptionTRA: textValue(augment.descriptionTRA),
      tooltip: textValue(augment.tooltip),
      tooltipTRA: textValue(augment.tooltipTRA),
      shortDesc: textValue(augment.shortDesc),
      longDesc: textValue(augment.longDesc || augment.longDescription),
      rarity: textValue(augment.rarity),
      iconPath,
      sourceUrl: `${cdragonRoot}/${iconPath}`
    })
  }
  return Array.from(unique.values()).sort((left, right) => left.id - right.id)
}

function extractArenaAugmentDetails(payload) {
  const byId = new Map()
  const byIconPath = new Map()
  for (const augment of Array.isArray(payload?.augments) ? payload.augments : []) {
    const id = normalizeId(augment?.id)
    if (!id) {
      continue
    }
    const details = {
      id,
      name: firstText(augment.name, augment.nameTRA, augment.simpleName, augment.simpleNameTRA),
      nameTRA: textValue(augment.nameTRA),
      description: firstText(augment.desc, augment.description, augment.descriptionTRA, augment.tooltip, augment.tooltipTRA),
      descriptionTRA: textValue(augment.descriptionTRA),
      tooltip: textValue(augment.tooltip),
      tooltipTRA: textValue(augment.tooltipTRA),
      shortDesc: textValue(augment.shortDesc),
      longDesc: textValue(augment.longDesc || augment.longDescription),
      rarity: textValue(augment.rarity)
    }
    byId.set(String(id), details)

    for (const iconPath of [
      normalizeCdragonAssetPath(augment.iconSmall),
      normalizeCdragonAssetPath(augment.iconLarge),
      normalizeCdragonAssetPath(augment.augmentSmallIconPath),
      normalizeCdragonAssetPath(augment.augmentLargeIconPath),
      normalizeCdragonAssetPath(augment.iconPath)
    ]) {
      if (iconPath && !byIconPath.has(iconPath)) {
        byIconPath.set(iconPath, details)
      }
    }
  }
  return { byId, byIconPath }
}

export function extractKiwiAugmentEntries(payload) {
  return getPayloadArray(payload)
    .map(augment => {
      const id = normalizeId(augment?.augmentID ?? augment?.augmentId ?? augment?.id)
      if (!id) {
        return null
      }
      const tooltip = textValue(augment?.tooltip)
      const desc = textValue(augment?.desc)
      return {
        id,
        name: textValue(augment?.name_cn ?? augment?.nameCn ?? augment?.name),
        description: firstText(tooltip, cleanKiwiAugmentText(desc)),
        tooltip,
        desc,
        rarity: textValue(augment?.level ?? augment?.rarity)
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.id - right.id)
}

export function mergeKiwiAugmentMetadata(targetMetadata, kiwiAugments) {
  targetMetadata.augments = targetMetadata.augments || {}
  let changed = 0

  for (const augment of kiwiAugments) {
    const key = String(augment.id)
    const entry = targetMetadata.augments[key] || { id: augment.id }
    let entryChanged = false

    if (!targetMetadata.augments[key]) {
      targetMetadata.augments[key] = entry
      entryChanged = true
    }
    if (!hasMetadataText(entry.name) && hasMetadataText(augment.name)) {
      entry.name = augment.name
      entryChanged = true
    }
    if (!hasMetadataText(entry.rarity) && hasMetadataText(augment.rarity)) {
      entry.rarity = augment.rarity
      entryChanged = true
    }
    if (shouldFillTooltipField(entry.description) && hasMetadataText(augment.description)) {
      entry.description = augment.description
      entryChanged = true
    }
    if (shouldFillTooltipField(entry.tooltip) && hasMetadataText(augment.tooltip)) {
      entry.tooltip = augment.tooltip
      entryChanged = true
    }
    if (shouldFillTooltipField(entry.desc) && hasMetadataText(augment.desc)) {
      entry.desc = augment.desc
      entryChanged = true
    }

    if (entryChanged) {
      changed += 1
    }
  }

  return changed
}

function getPayloadArray(payload) {
  if (Array.isArray(payload)) {
    return payload.filter(isObject)
  }
  if (!isObject(payload)) {
    return []
  }

  for (const key of ['data', 'augments', 'kiwi_augments', 'kiwiAugments', 'list', 'items', 'result']) {
    const value = payload[key]
    if (Array.isArray(value)) {
      return value.filter(isObject)
    }
    if (isObject(value)) {
      const nested = getPayloadArray(value)
      if (nested.length) {
        return nested
      }
    }
  }

  return Object.values(payload).find(value =>
    Array.isArray(value) && value.some(item => isObject(item) && normalizeId(item.augmentID ?? item.augmentId ?? item.id))
  )?.filter(isObject) || []
}

function normalizeIconPath(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().replace(/^\/+/, '')
    : ''
}

function normalizeCdragonAssetPath(value) {
  const path = normalizeIconPath(value)
  if (!path) {
    return ''
  }
  return path
    .replace(/^lol-game-data\/assets\//i, '')
    .toLowerCase()
}

function textValue(value) {
  return typeof value === 'string' ? value : ''
}

function hasMetadataText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function shouldFillTooltipField(value) {
  if (!hasMetadataText(value)) {
    return true
  }

  return /^暂无详细说明$/i.test(value.trim())
}

function cleanKiwiAugmentText(value) {
  if (!hasMetadataText(value)) {
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

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
}

function isObject(value) {
  return typeof value === 'object' && value !== null
}

function normalizeGold(value) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const gold = {}
  for (const key of ['total', 'base', 'sell']) {
    if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] > 0) {
      gold[key] = value[key]
    }
  }

  return Object.keys(gold).length ? gold : null
}

function normalizeIdArray(value) {
  return Array.isArray(value)
    ? value.map(normalizeId).filter(Boolean)
    : []
}

function normalizeStats(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const stats = {}
  for (const [key, statValue] of Object.entries(value)) {
    const numberValue = typeof statValue === 'string' ? Number(statValue) : statValue
    if (typeof numberValue === 'number' && Number.isFinite(numberValue)) {
      stats[key] = numberValue
    }
  }

  return Object.keys(stats).length ? stats : null
}

function firstText(...values) {
  return values.find(value => typeof value === 'string' && value.trim()) || ''
}

function printHelp() {
  console.log(`
Usage:
  node scripts/sync-game-assets.mjs --version 15.24.1 --item 1001 --spell 4 --perk 8005 --champion 103
  node scripts/sync-game-assets.mjs --version 15.24.1 --locale zh_CN --all-items --all-spells --all-perks --all-augments --with-metadata
  node scripts/sync-game-assets.mjs --version 15.24.1 --locale zh_CN --all-items --all-perks --with-metadata
  node scripts/sync-game-assets.mjs --version 15.24.1 --locale zh_CN --all-item-metadata --all-augment-metadata
  node scripts/sync-game-assets.mjs --version 15.24.1 --locale zh_CN --metadata-only
  node scripts/sync-game-assets.mjs --version 15.24.1 --locale zh_CN --all-objectives

Notes:
  - manifest.json maps IDs to local icon paths.
  - metadata.json stores item, summoner spell, perk, and augment text details.
  - DDragon version is used for item/profile icons and item/perk metadata.
  - --all-spells downloads summoner spell icons and writes summoner spell tooltip metadata.
  - --all-perks reads runesReforged.json and downloads style plus rune icons from the small icon CDN.
  - --all-augments reads CommunityDragon cherry-augments.json by default and can be overridden with --augment-source.
  - --kiwi-augment-source overrides the zh_CN GTIMG Kiwi augment enrichment source; use --no-kiwi-augment-enrich to disable it.
  - --all-item-metadata and --all-augment-metadata update metadata.json without downloading item or augment icons.
  - --metadata-only updates item and augment metadata without downloading item or augment icons.
  - --all-objectives downloads the small CommunityDragon minimap objective icons referenced by manifest.objectives.
  - Augment sync failures are skipped so item and perk syncs are not blocked.
  - Do not commit full archive packs.
`)
}
