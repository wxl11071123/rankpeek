import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  getAugmentRarityClass,
  getAugmentTooltipDetails,
  getItemTooltipDetails,
  resetGameAssetResolverForTest,
  setGameAssetMetadataForTest
} from '../../utils/gameAssetUrls.ts'

test('match history card renders spell loadout, mode-aware traits, and performance tags', () => {
  const source = readFileSync(new URL('./MatchHistoryCard.vue', import.meta.url), 'utf8')
  const apiTypes = readFileSync(new URL('../../types/api.ts', import.meta.url), 'utf8')

  assert.match(source, /getSummonerSpellIconUrl/)
  assert.match(source, /getPerkIconUrl/)
  assert.match(source, /getAugmentIconUrl/)
  assert.match(source, /getItemAssetDetails/)
  assert.match(source, /getItemTooltipDetails/)
  assert.match(source, /getPerkAssetDetails/)
  assert.match(source, /getPerkTooltipDetails/)
  assert.match(source, /getAugmentAssetDetails/)
  assert.match(source, /getAugmentTooltipDetails/)
  assert.match(source, /getSummonerSpellTooltipDetails/)
  assert.match(source, /AssetHoverTooltip/)
  assert.match(source, /getMatchPerformanceTags/)
  assert.match(source, /const currentSpellSlots = computed/)
  assert.match(source, /const currentTraitMode = computed<MatchTraitMode>/)
  assert.match(source, /hasValidAugment\(currentPlayer\.value\) \? 'augment' : 'perk'/)
  assert.match(source, /const currentTraitSlots = computed\(\(\) => getTraitSlots\(currentPlayer\.value\)\)/)
  assert.match(source, /spell1Id/)
  assert.match(source, /spell2Id/)
  assert.doesNotMatch(source, /getPerkSlots\(currentPlayer\.value, 1\)/)
  assert.doesNotMatch(source, /getAugmentSlots\(currentPlayer\.value, 2\)/)
  assert.doesNotMatch(source, /'perk0', 'perk1', 'perk2', 'perk3', 'perk4', 'perk5'/)
  assert.match(source, /function getTraitSlots/)
  assert.match(source, /function buildPerkTraitSlots/)
  assert.match(source, /function buildAugmentTraitSlots/)
  assert.match(source, /createTraitSlot\('perk', 0, primaryId\)/)
  assert.match(source, /createTraitSlot\('perk', 1, secondaryId\)/)
  assert.match(source, /kind === 'augment'\s*\?\s*getAugmentIconUrl\(id\)\s*:\s*getPerkIconUrl\(id\)/)
  assert.match(source, /readTraitId\(statsRecord, participantRecord, 'perk0'\)/)
  assert.match(source, /readTraitId\(statsRecord, participantRecord, 'perkSubStyle'\)/)
  assert.match(source, /readTraitId\(statsRecord, participantRecord, 'perkPrimaryStyle'\)/)
  assert.match(source, /readTraitId\(statsRecord, participantRecord, 'perk5'\)/)
  assert.match(source, /Array\.from\(\{ length: 6 \}/)
  assert.match(source, /playerAugment1/)
  assert.match(source, /playerAugment6/)
  assert.match(source, /extraFields/)
  assert.match(source, /participant\?\.stats/)
  assert.match(source, /v-for="slot in currentSpellSlots"/)
  assert.match(source, /currentTraitMode === 'augment' \? 'trait-grid' : 'trait-column'/)
  assert.match(source, /v-for="slot in currentTraitSlots"/)
  assert.match(source, /class="loadout-slot trait-slot"/)
  assert.match(source, /\{ empty: slot\.empty \}/)
  assert.match(source, /:aria-label="slot\.label"/)
  assert.match(source, /<AssetHoverTooltip\s+v-if="slot\.url && !slot\.empty && getTraitTooltipDetails\(slot\)"/)
  assert.match(source, /:details="getTraitTooltipDetails\(slot\)!"/)
  assert.match(source, /class="loadout-column spell-column"[\s\S]*<AssetHoverTooltip\s+v-if="slot\.url && getSummonerSpellTooltipDetails\(slot\.id\)"[\s\S]*:details="getSummonerSpellTooltipDetails\(slot\.id\)!"/)
  assert.match(source, /\.trait-grid/)
  assert.match(source, /--loadout-slot-size: 19px/)
  assert.match(source, /grid-template-columns: repeat\(3, var\(--loadout-slot-size\)\)/)
  assert.match(source, /\.trait-slot\.loadout-slot-perk/)
  assert.match(source, /--loadout-slot-size: 17px/)
  assert.match(source, /class="performance-tags"/)
  assert.match(source, /v-for="tag in performanceTags"/)
  assert.match(source, /\{\{ tag\.label \}\}/)
  assert.match(source, /@error="markAssetLoadFailed"/)
  assert.match(source, /<AssetHoverTooltip\s+v-if="slot\.url && !slot\.empty && slot\.itemId !== null"/)
  assert.match(source, /:details="getItemTooltipDetails\(slot\.itemId\)!"/)
  assert.match(source, /<img v-if="slot\.url" :src="slot\.url" alt="" @error="markAssetLoadFailed" \/>/)
  assert.match(apiTypes, /^\s*playerAugment1\?: number/m)
  assert.match(apiTypes, /^\s*playerAugment5\?: number/m)
  assert.match(apiTypes, /^\s*playerAugment6\?: number/m)
})

test('match history card exposes inline detail expanded state and chevron affordance', () => {
  const source = readFileSync(new URL('./MatchHistoryCard.vue', import.meta.url), 'utf8')

  assert.match(source, /expanded\?: boolean/)
  assert.match(source, /expanded: false/)
  assert.match(source, /:class="\{\s*remake: isRemake,\s*win: !isRemake && isWin,\s*loss: !isRemake && !isWin,\s*expanded\s*\}"/)
  assert.doesNotMatch(source, /:class="\{ win: isWin, loss: !isWin, expanded \}"/)
  assert.match(source, /function handleCardClick\(event: MouseEvent\): void \{/)
  assert.match(source, /isInteractiveCardClickTarget\(event\.target\)/)
  assert.match(source, /function isInteractiveCardClickTarget\(target: EventTarget \| null\): boolean \{/)
  assert.match(source, /target\.closest\('button, a, input, select, textarea, \[role="button"\], \[data-card-click-ignore\], \.asset-tooltip-trigger'\)/)
  assert.match(source, /@click="handleCardClick"/)
  assert.doesNotMatch(source, /@click="emit\('open-detail', match\)"/)
  assert.match(source, /class="detail-chevron"/)
  assert.match(source, /:class="\{ expanded \}"/)
  assert.match(source, /:aria-expanded="expanded"/)
  assert.match(source, /@click\.stop="emit\('open-detail', match\)"/)
  assert.match(source, /class="chevron-icon"/)
})

test('match history card renders saved AI report buttons without toggling the card', () => {
  const source = readFileSync(new URL('./MatchHistoryCard.vue', import.meta.url), 'utf8')
  const templateBlock = source.match(/<template>[\s\S]*?<\/template>/)?.[0] || ''

  assert.match(source, /savedAiReports\?: SavedAiReports/)
  assert.match(source, /const hasSavedAiReports = computed/)
  assert.match(source, /'open-saved-ai-report': \[match: MatchHistory, mode: SavedAiReportMode\]/)
  assert.match(source, /class="saved-ai-actions"/)
  assert.doesNotMatch(source, /<div v-if="hasSavedAiReports" class="saved-ai-actions"/)
  assert.match(source, /--saved-ai-actions-width:/)
  assert.match(source, /grid-template-columns:\s*minmax\(0, 86px\) minmax\(0, 1fr\) var\(--saved-ai-actions-width\) auto auto/)
  assert.match(source, /width:\s*var\(--saved-ai-actions-width\)/)
  assert.match(source, /v-if="savedAiReports\.review"[\s\S]*@click\.stop="openSavedAiReport\('review'\)"[\s\S]*复盘报告/)
  assert.match(source, /v-if="savedAiReports\.praise"[\s\S]*@click\.stop="openSavedAiReport\('praise'\)"[\s\S]*夸夸报告/)
  assert.doesNotMatch(source, /v-if="savedAiReports\.review"[\s\S]*@click\.stop="openSavedAiReport\('review'\)"[\s\S]*赛后复盘/)
  assert.doesNotMatch(source, /v-if="savedAiReports\.praise"[\s\S]*@click\.stop="openSavedAiReport\('praise'\)"[\s\S]*夸夸机/)
  assert.match(source, /\.saved-ai-action/)
  assert.ok(templateBlock.indexOf('class="saved-ai-actions"') < templateBlock.indexOf('class="teams-strip"'))
})

test('match history card shows KDA ratio and keeps kill participation in a fixed aligned column', () => {
  const source = readFileSync(new URL('./MatchHistoryCard.vue', import.meta.url), 'utf8')
  const templateBlock = source.match(/<template>[\s\S]*?<\/template>/)?.[0] || ''

  assert.match(source, /const kdaRatioText = computed\(\(\) => formatKdaRatio\(currentStats\.value\)\)/)
  assert.match(source, /const killParticipationText = computed\(\(\) => formatKillParticipation\(currentPlayer\.value, props\.match\.participants \|\| \[\]\)\)/)
  assert.match(source, /function formatKdaRatio\(stats\?: Stats\): string/)
  assert.match(source, /const kda = deaths === 0\s*\?\s*kills \+ assists\s*:\s*\(kills \+ assists\) \/ deaths/)
  assert.match(source, /function formatKillParticipation\(participant: Participant \| null \| undefined, participants: Participant\[\]\): string/)
  assert.match(source, /filter\(player => player\.teamId === participant\.teamId\)/)
  assert.match(source, /reduce\(\(total, player\) => total \+ \(player\.stats\?\.kills \|\| 0\), 0\)/)
  assert.match(source, /Math\.round\(\(\(kills \+ assists\) \/ teamKills\) \* 100\)/)
  assert.match(templateBlock, /class="combat-block"[\s\S]*class="kda-line"[\s\S]*class="kda-ratio-line"[\s\S]*KDA \{\{ kdaRatioText \}\}/)
  assert.match(templateBlock, /class="participation-block"[\s\S]*<span>参团率<\/span>[\s\S]*\{\{ killParticipationText \}\}/)
  assert.match(source, /--trait-column-width:\s*calc\(\(var\(--loadout-slot-size\) \* 3\) \+ \(var\(--trait-grid-gap\) \* 2\)\)/)
  assert.match(source, /--combat-column-width:\s*98px/)
  assert.match(source, /--participation-column-width:\s*54px/)
  assert.match(source, /\.identity-row\s*\{[\s\S]*display:\s*grid/)
  assert.match(source, /\.identity-row\s*\{[\s\S]*grid-template-columns:\s*42px var\(--spell-column-width\) var\(--trait-column-width\) var\(--combat-column-width\) var\(--participation-column-width\)/)
  assert.match(source, /\.champion-block\s*\{[\s\S]*grid-column:\s*1/)
  assert.match(source, /\.spell-column\s*\{[\s\S]*grid-column:\s*2/)
  assert.match(source, /\.trait-column,\s*\.trait-grid\s*\{[\s\S]*grid-column:\s*3/)
  assert.match(source, /\.combat-block\s*\{[\s\S]*grid-column:\s*4/)
  assert.match(source, /\.combat-block\s*\{[\s\S]*width:\s*var\(--combat-column-width\)/)
  assert.match(source, /\.participation-block\s*\{[\s\S]*grid-column:\s*5/)
  assert.match(source, /\.participation-block\s*\{[\s\S]*width:\s*var\(--participation-column-width\)/)
  assert.match(source, /\.participation-block\s*\{[\s\S]*align-items:\s*center/)
  assert.match(source, /\.participation-block\s*\{[\s\S]*text-align:\s*center/)
  assert.doesNotMatch(source, /\.participation-block\s*\{[\s\S]*margin-left:\s*auto/)
})

test('match history card renders remake result state without win or loss coloring', () => {
  const source = readFileSync(new URL('./MatchHistoryCard.vue', import.meta.url), 'utf8')

  assert.match(source, /import \{ isRemakeMatch \} from '@\/utils\/matchHistorySampling'/)
  assert.match(source, /const isRemake = computed\(\(\) => isRemakeMatch\(props\.match\)\)/)
  assert.match(source, /const resultText = computed\(\(\) =>\s*isRemake\.value\s*\?\s*'重开'\s*:\s*isWin\.value\s*\?\s*t\('common\.win'\)\s*:\s*t\('common\.loss'\)\s*\)/)
  assert.match(source, /:class="\{\s*remake: isRemake,\s*win: !isRemake && isWin,\s*loss: !isRemake && !isWin,\s*expanded\s*\}"/)
  // 左侧装饰竖条已移除：胜负改用整块色面表达
  assert.doesNotMatch(source, /result-rail/)
  assert.match(source, /\.match-history-card\.win\s*\{\s*background: var\(--card-bg-win\);\s*\}/)
  assert.match(source, /\.match-history-card\.loss\s*\{\s*background: var\(--card-bg-loss\);\s*\}/)
  assert.match(source, /\{\{ resultText \}\}/)
  assert.match(source, /--remake-color:/)
  assert.match(source, /formatStartTime\(match\.gameCreation\)/)
  assert.match(source, /\.match-history-card\.remake \.result-text\s*\{\s*color: var\(--remake-color\);\s*\}/)
})

test('match history card rich asset tooltips are not only browser title text', () => {
  const source = readFileSync(new URL('./MatchHistoryCard.vue', import.meta.url), 'utf8')

  assert.match(source, /<AssetHoverTooltip\s+v-if="slot\.url && getSummonerSpellTooltipDetails\(slot\.id\)"/)
  assert.match(source, /<AssetHoverTooltip\s+v-if="slot\.url && !slot\.empty && getTraitTooltipDetails\(slot\)"/)
  assert.match(source, /<AssetHoverTooltip\s+v-if="slot\.url && !slot\.empty && slot\.itemId !== null"/)
  assert.match(source, /:details="getSummonerSpellTooltipDetails\(slot\.id\)!"/)
  assert.match(source, /:details="getTraitTooltipDetails\(slot\)!"/)
  assert.match(source, /:details="getItemTooltipDetails\(slot\.itemId\)!"/)
  assert.doesNotMatch(source, /:title="getItemSlotLabel\(slot\)"/)
  assert.doesNotMatch(source, /:title="slot\.label"/)
})

test('match history card applies augment rarity classes without changing tooltip wrapping', () => {
  const source = readFileSync(new URL('./MatchHistoryCard.vue', import.meta.url), 'utf8')

  assert.equal(getAugmentRarityClass('kGold'), 'augment-rarity-gold')
  assert.equal(getAugmentRarityClass('kSilver'), 'augment-rarity-silver')
  assert.equal(getAugmentRarityClass('kPrismatic'), 'augment-rarity-prismatic')
  assert.match(source, /getAugmentRarityClass/)
  assert.match(source, /rarityClass\?: string/)
  assert.match(source, /rarityClass: getTraitRarityClass\(kind, id\)/)
  assert.match(source, /function getTraitRarityClass\(kind: MatchTraitMode, id: number \| null\): string/)
  assert.match(source, /getAugmentRarityClass\(getAugmentAssetDetails\(id\)\?\.rarity\)/)
  assert.match(source, /:class="\[\s*`loadout-slot-\$\{slot\.kind\}`,\s*slot\.rarityClass,\s*\{ empty: slot\.empty \}\s*\]"/)
  assert.match(source, /<AssetHoverTooltip\s+v-if="slot\.url && !slot\.empty && getTraitTooltipDetails\(slot\)"[\s\S]*:details="getTraitTooltipDetails\(slot\)!"/)
})

test('match history card item and augment tooltip details use structured price and rarity instead of id subtitles', () => {
  resetGameAssetResolverForTest()
  setGameAssetMetadataForTest({
    version: 'test',
    locale: 'zh_CN',
    items: {
      6610: {
        id: 6610,
        name: '焚天',
        description: '40攻击力',
        gold: { total: 3100 }
      }
    },
    augments: {
      2005: {
        id: 2005,
        name: '扳机炼狱',
        description: '每回合，你要么变大。'
      }
    }
  })

  const source = readFileSync(new URL('./MatchHistoryCard.vue', import.meta.url), 'utf8')
  const item = getItemTooltipDetails(6610)
  const augment = getAugmentTooltipDetails(2005)

  assert.match(source, /<AssetHoverTooltip\s+v-if="slot\.url && !slot\.empty && getTraitTooltipDetails\(slot\)"/)
  assert.match(source, /<AssetHoverTooltip\s+v-if="slot\.url && !slot\.empty && slot\.itemId !== null"/)
  assert.match(source, /:details="getTraitTooltipDetails\(slot\)!"/)
  assert.match(source, /:details="getItemTooltipDetails\(slot\.itemId\)!"/)
  assert.equal(item?.priceText, '3100 G')
  assert.doesNotMatch(item?.priceText || '', /装备 6610/)
  assert.notEqual(augment?.rarityLabel || augment?.subtitle, '海克斯强化 2005')
})

test('match history card falls back to nested rune styles for compact perk slots', () => {
  const source = readFileSync(new URL('./MatchHistoryCard.vue', import.meta.url), 'utf8')

  assert.match(source, /function readNestedPerkStyleId/)
  assert.match(source, /function readNestedPerkSelectionId/)
  assert.match(source, /const primaryId =\s*readTraitId\(statsRecord, participantRecord, 'perk0'\)\s*\|\|\s*readNestedPerkSelectionId\(statsRecord, participantRecord, 0\)/)
  assert.match(source, /readTraitId\(statsRecord, participantRecord, 'perkSubStyle'\)\s*\|\|\s*readNestedPerkPropertyId\(statsRecord, participantRecord,[\s\S]*readNestedPerkStyleId\(statsRecord, participantRecord, 1\)[\s\S]*readTraitId\(statsRecord, participantRecord, 'perk5'\)/)
  assert.match(source, /typeof value === 'string'[\s\S]*trim\(\)[\s\S]*\/\^\\d\+\$\/[\s\S]*Number\(/)
  assert.match(source, /function readNestedPerkPropertyId/)
  assert.match(source, /'perkSubStyle'[\s\S]*'subStyle'[\s\S]*'secondaryStyle'[\s\S]*'secondaryStyleId'/)
  assert.match(source, /'perkStyle'[\s\S]*'primaryStyle'[\s\S]*'primaryStyleId'/)
  assert.match(source, /function readNestedPerkId/)
  assert.match(source, /perkIds/)
})
