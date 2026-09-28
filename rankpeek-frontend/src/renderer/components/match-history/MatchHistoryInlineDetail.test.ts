import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import * as ts from 'typescript'
import {
  getAugmentRarityClass,
  getAugmentTooltipDetails,
  getItemTooltipDetails,
  getObjectiveIconUrl,
  resetGameAssetResolverForTest,
  setGameAssetMetadataForTest
} from '../../utils/gameAssetUrls.ts'

function readInlineDetailSource(): string {
  return readFileSync(new URL('./MatchHistoryInlineDetail.vue', import.meta.url), 'utf8')
}

function readApiSource(): string {
  return readFileSync(new URL('../../types/api.ts', import.meta.url), 'utf8')
}

function readFunctionBlock(source: string, signature: string): string {
  const start = source.indexOf(signature)
  assert.notEqual(start, -1, `missing function signature: ${signature}`)
  const firstBrace = source.indexOf('{', start)
  assert.notEqual(firstBrace, -1, `missing function body: ${signature}`)

  let depth = 0
  for (let index = firstBrace; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(start, index + 1)
      }
    }
  }

  assert.fail(`unterminated function body: ${signature}`)
}

function assertOrdered(source: string, snippets: string[]): void {
  const indexes = snippets.map(snippet => source.indexOf(snippet))
  assert.ok(
    indexes.every(index => index >= 0),
    `missing ordered snippet index: ${indexes.join(', ')}`
  )
  assert.deepEqual([...indexes].sort((left, right) => left - right), indexes)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractRule(source: string, selector: string): string {
  const normalizedSource = source.replace(/\r\n/g, '\n')
  const normalizedSelector = selector.replace(/\r\n/g, '\n')
  const match = new RegExp(`(^|\\n)${escapeRegex(normalizedSelector)}\\s*\\{`).exec(normalizedSource)
  assert.ok(match, `missing selector: ${selector}`)
  const index = match.index + (match[1] ? match[1].length : 0)
  const start = normalizedSource.indexOf('{', index)
  assert.notEqual(start, -1, `missing rule start: ${selector}`)
  const end = normalizedSource.indexOf('\n}', start)
  assert.notEqual(end, -1, `missing rule end: ${selector}`)
  return normalizedSource.slice(index, end + 2)
}

interface ObjectiveCountHarness {
  readStructureObjectiveCount: (teamId: number, summary: Record<string, unknown>, sourceKey: string) => number | null
  formatObjectiveTitle: (label: string, count: number | null) => string
  getObjectiveCountText: (item: { count: number | null }) => string
}

interface TimelineAxisClusterHarness {
  clusterTimelineAxisMarkers: (
    clusters: Array<Record<string, unknown>>,
    teamId: number,
    options?: { windowMs?: number }
  ) => Array<{
    count: number
    markerSize: number
    teamId: number | null
    items: Array<{ teamId: number; timestamp: number }>
  }>
}

interface TimelineLaneRelevanceHarness {
  getTimelineClusterRelevanceClass: (cluster: { items: Array<Record<string, unknown>> }) => string
  isTimelineClusterRelatedToSelectedLane: (cluster: { items: Array<Record<string, unknown>> }) => boolean
  isTimelineEventMarkerRelatedToParticipantIds: (
    marker: Record<string, unknown>,
    participantIds: Set<number>
  ) => boolean
}

interface ChartTooltipHarness {
  formatChartTooltipMetricLine: (label: string, point: { diff: number | null }) => string
}

interface RuneToggleHarness {
  expandedRuneParticipantKey: { value: string }
  getRuneParticipantKey: (player: { participantId: number }) => string
  isRuneParticipantExpanded: (player: { participantId: number }) => boolean
  toggleRuneParticipant: (player: { participantId: number }) => void
}

interface PostgameAiHarness {
  postgameAiModalOpen: { value: boolean }
  postgameAiModalMode: { value: 'review' | 'praise' }
  postgameAiStreamState: { value: 'idle' | 'preparing' | 'streaming' | 'completed' | 'failed' }
  postgameAiStreamText: { value: string }
  postgameAiStreamError: { value: string }
  postgameAiStreamUsage: { value: unknown }
  openPostgameAiModal: (mode: 'review' | 'praise') => void
  closePostgameAiModal: () => void
}

function createPostgameAiHarness(): PostgameAiHarness {
  const source = readInlineDetailSource()
  const script = `
    const postgameAiModalOpen = { value: false }
    const postgameAiModalMode = { value: 'review' }
    const postgameAiStreamState = { value: 'idle' }
    const postgameAiStreamText = { value: '' }
    const postgameAiStreamError = { value: '' }
    const postgameAiStreamUsage = { value: null }
    const postgameAiStreamAbortController = { value: null }
    ${readFunctionBlock(source, 'function openPostgameAiModal(mode: PostgameAiAnalysisMode): void')}
    ${readFunctionBlock(source, 'function closePostgameAiModal(): void')}
    globalThis.__postgameAiHarness = {
      postgameAiModalOpen,
      postgameAiModalMode,
      postgameAiStreamState,
      postgameAiStreamText,
      postgameAiStreamError,
      postgameAiStreamUsage,
      openPostgameAiModal,
      closePostgameAiModal
    }
  `
  const compiled = ts.transpileModule(script, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const context = createContext({})
  runInContext(compiled, context)
  return (context as { __postgameAiHarness: PostgameAiHarness }).__postgameAiHarness
}

function createRuneToggleHarness(gameId = 2468): RuneToggleHarness {
  const source = readInlineDetailSource()
  const script = `
    const props = { matchHistory: { gameId: ${gameId} } }
    const expandedRuneParticipantKey = { value: '' }
    ${readFunctionBlock(source, 'function getRuneParticipantKey(player: MatchDetailParticipant): string')}
    ${readFunctionBlock(source, 'function isRuneParticipantExpanded(player: MatchDetailParticipant): boolean')}
    ${readFunctionBlock(source, 'function toggleRuneParticipant(player: MatchDetailParticipant): void')}
    globalThis.__runeToggleHarness = {
      expandedRuneParticipantKey,
      getRuneParticipantKey,
      isRuneParticipantExpanded,
      toggleRuneParticipant
    }
  `
  const compiled = ts.transpileModule(script, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const context = createContext({})
  runInContext(compiled, context)
  return (context as { __runeToggleHarness: RuneToggleHarness }).__runeToggleHarness
}

function createChartTooltipHarness(): ChartTooltipHarness {
  const source = readInlineDetailSource()
  const script = `
    ${readFunctionBlock(source, 'function formatChartTooltipMetricLine')}
    ${readFunctionBlock(source, 'function formatGoldDiffMagnitude')}
    globalThis.__chartTooltipHarness = {
      formatChartTooltipMetricLine
    }
  `
  const compiled = ts.transpileModule(script, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const context = createContext({})
  runInContext(compiled, context)
  return (context as { __chartTooltipHarness: ChartTooltipHarness }).__chartTooltipHarness
}

function createTimelineAxisClusterHarness(): TimelineAxisClusterHarness {
  const source = readInlineDetailSource()
  const script = `
    const TIMELINE_AXIS_CLUSTER_WINDOW_MS = 60000
    ${readFunctionBlock(source, 'function clusterTimelineAxisMarkers(')}
    ${readFunctionBlock(source, 'function createTimelineAxisCluster(')}
    ${readFunctionBlock(source, 'function getTimelineAxisClusterCount(')}
    ${readFunctionBlock(source, 'function getTimelineAxisClusterTimestamp(')}
    ${readFunctionBlock(source, 'function getTimelineAxisClusterMarkerSize(')}
    ${readFunctionBlock(source, 'function createTimelineAxisClusterKey(')}
    globalThis.__timelineAxisClusterHarness = {
      clusterTimelineAxisMarkers
    }
  `
  const compiled = ts.transpileModule(script, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const context = createContext({})
  runInContext(compiled, context)
  return (context as { __timelineAxisClusterHarness: TimelineAxisClusterHarness }).__timelineAxisClusterHarness
}

function createTimelineLaneRelevanceHarness(
  metric = 'top',
  participantIds: number[] = [1, 6]
): TimelineLaneRelevanceHarness {
  const source = readInlineDetailSource()
  const script = `
    const selectedGoldDiffMetric = { value: '${metric}' }
    const selectedLaneParticipantIds = { value: new Set(${JSON.stringify(participantIds)}) }
    ${readFunctionBlock(source, 'function getTimelineClusterRelevanceClass(')}
    ${readFunctionBlock(source, 'function shouldHighlightSelectedLaneTimelineEvents(')}
    ${readFunctionBlock(source, 'function isTimelineClusterRelatedToSelectedLane(')}
    ${readFunctionBlock(source, 'function isTimelineEventMarkerRelatedToSelectedLane(')}
    ${readFunctionBlock(source, 'function isTimelineEventMarkerRelatedToParticipantIds(')}
    globalThis.__timelineLaneRelevanceHarness = {
      getTimelineClusterRelevanceClass,
      isTimelineClusterRelatedToSelectedLane,
      isTimelineEventMarkerRelatedToParticipantIds
    }
  `
  const compiled = ts.transpileModule(script, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const context = createContext({ Set })
  runInContext(compiled, context)
  return (context as { __timelineLaneRelevanceHarness: TimelineLaneRelevanceHarness }).__timelineLaneRelevanceHarness
}

function createObjectiveCountHarness(gameDetail: Record<string, unknown>): ObjectiveCountHarness {
  const source = readInlineDetailSource()
  const script = `
    const STRUCTURE_OBJECTIVE_SOURCES = {
      turret: {
        summaryKey: 'turretKills',
        eventKind: 'turret',
        directStatKeys: ['turretKills'],
        lastFallbackStatKeys: ['turretTakedowns']
      },
      inhibitor: {
        summaryKey: 'inhibitorKills',
        eventKind: 'inhibitor',
        directStatKeys: ['inhibitorKills'],
        lastFallbackStatKeys: ['inhibitorTakedowns']
      },
      turretPlate: {
        summaryKey: 'turretPlateKills',
        summaryKeys: ['turretPlateKills', 'turretPlatesTaken'],
        eventKind: 'turretPlate',
        directStatKeys: ['turretPlatesTaken'],
        lastFallbackStatKeys: []
      }
    }
    const displayGameDetail = { value: gameDetail }
    const allPlayers = { value: gameDetail.participants || [] }
    ${readFunctionBlock(source, 'function readStructureObjectiveCount(teamId: number, summary: TeamObjectiveSummary, sourceKey: StructureObjectiveSourceKey): number | null')}
    ${readFunctionBlock(source, 'function readStructureSummaryObjectiveCount(summary: TeamObjectiveSummary, source: StructureObjectiveSource): number | null')}
    ${readFunctionBlock(source, "function countObjectiveEvents(summary: TeamObjectiveSummary, teamId: number, kind: TeamObjectiveEvent['kind']): number | null")}
    ${readFunctionBlock(source, 'function sumTeamParticipantObjectiveStats(teamId: number, fieldKeys: string[]): number | null')}
    ${readFunctionBlock(source, 'function readParticipantObjectiveStat(player: MatchDetailParticipant, fieldKeys: string[]): number | null')}
    ${readFunctionBlock(source, 'function readParticipantObjectiveField(player: MatchDetailParticipant, key: string): number | null')}
    ${readFunctionBlock(source, 'function matchesObjectiveEvent(')}
    ${readFunctionBlock(source, 'function getObjectiveEventOwnerTeamId(event: TeamObjectiveEvent): number | null')}
    ${readFunctionBlock(source, 'function getObjectiveCountText(item: ObjectiveDisplayItem): string')}
    ${readFunctionBlock(source, 'function formatObjectiveTitle(label: string, count: number | null): string')}
    ${readFunctionBlock(source, 'function readNullableObjectiveCount(value: unknown): number | null')}
    ${readFunctionBlock(source, 'function readStatNumber(player: MatchDetailParticipant, key: string): number | null')}
    ${readFunctionBlock(source, 'function normalizePositiveInteger(value: unknown): number | null')}
    ${readFunctionBlock(source, 'function normalizeTeamId(value: unknown): number | null')}
    ${readFunctionBlock(source, 'function normalizeFiniteNumber(value: unknown): number | null')}
    globalThis.__objectiveCountHarness = {
      readStructureObjectiveCount,
      formatObjectiveTitle,
      getObjectiveCountText
    }
  `
  const compiled = ts.transpileModule(script, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const context = createContext({ gameDetail })
  runInContext(compiled, context)
  return (context as { __objectiveCountHarness: ObjectiveCountHarness }).__objectiveCountHarness
}

test('inline match detail exposes compact overview, RP, rune, and chart tabs', () => {
  const source = readInlineDetailSource()
  const zh = readFileSync(new URL('../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
  const en = readFileSync(new URL('../../i18n/locales/en-US.ts', import.meta.url), 'utf8')

  assert.match(source, /type InlineDetailTabKey = 'overview' \| 'rp' \| 'runes' \| 'chart'/)
  assert.match(source, /class="inline-match-detail"/)
  assert.match(source, /class="inline-detail-tabs"/)
  assertOrdered(source, [
    "key: 'overview'",
    "key: 'rp'",
    "key: 'runes'",
    "key: 'chart'"
  ])
  assert.match(source, /key: 'overview'[\s\S]*t\('matchDetail\.overviewTab'\)/)
  assert.match(source, /key: 'rp'[\s\S]*t\('matchDetail\.rpTab'\)/)
  assert.match(source, /key: 'runes'[\s\S]*t\('matchDetail\.runesTab'\)/)
  assert.match(source, /key: 'chart'[\s\S]*t\('matchDetail\.chartTab'\)/)
  assert.match(source, /detailTabs[\s\S]*isChartRankedMode\.value[\s\S]*return baseTabs/)
  assert.match(zh, /'matchDetail\.rpTab': 'RP指数'/)
  assert.match(en, /'matchDetail\.rpTab': 'RP Index'/)
  assert.match(zh, /'matchDetail\.runesTab': '符文'/)
  assert.match(zh, /'matchDetail\.chartTab': '线图'/)
  assert.match(en, /'matchDetail\.runesTab': 'Runes'/)
  assert.match(en, /'matchDetail\.chartTab': 'Chart'/)
})

test('inline match detail exposes postgame AI buttons near tabs and wires modal modes', () => {
  const source = readInlineDetailSource()
  const actionBlock = source.match(/<div class="postgame-ai-actions"[\s\S]*?<\/div>/)?.[0] || ''
  const tabsIndex = source.indexOf('class="inline-detail-tabs"')
  const actionIndex = source.indexOf('class="postgame-ai-actions"')
  const bodyIndex = source.indexOf('class="inline-detail-body"')

  assert.match(source, /import PostgameAiAnalysisModal from '@\/components\/match-history\/PostgameAiAnalysisModal\.vue'/)
  assert.match(source, /buildPostgameAiInputSnapshot/)
  assert.match(source, /createPostgameAiStreamRequest/)
  assert.match(source, /streamPostgameAiAnalysis/)
  assert.match(source, /savePostgameAiRunResultToLocal/)
  assert.match(source, /type PostgameAiAnalysisMode = 'review' \| 'praise'/)
  assert.match(source, /const postgameAiModalOpen = ref\(false\)/)
  assert.match(source, /const postgameAiModalMode = ref<PostgameAiAnalysisMode>\('review'\)/)
  assert.match(source, /const postgameAiStreamState = ref<PostgameAiStreamState>\('idle'\)/)
  assert.match(source, /const postgameAiStreamText = ref\(''\)/)
  assert.match(source, /const postgameAiStreamError = ref\(''\)/)
  assert.match(source, /const postgameAiStreamUsage = ref<PostgameAiTokenUsage \| null>\(null\)/)
  assert.match(source, /const postgameAiStreamAbortController = ref<AbortController \| null>\(null\)/)
  assert.match(source, /const postgameAiChampionNamesById = ref<Record<number, string>>\(\{\}\)/)
  assert.match(source, /const postgameAiReviewRosterPlayers = computed<PostgameAiReviewRosterPlayer\[\]>/)
  assert.match(source, /function openPostgameAiModal\(mode: PostgameAiAnalysisMode\): void/)
  assert.match(source, /function closePostgameAiModal\(\): void/)
  assert.ok(tabsIndex >= 0 && actionIndex > tabsIndex && actionIndex < bodyIndex)
  assert.match(actionBlock, /@click="openPostgameAiModal\('review'\)"[\s\S]*赛后复盘/)
  assert.match(actionBlock, /@click="openPostgameAiModal\('praise'\)"[\s\S]*夸夸机/)
  assert.match(source, /<PostgameAiAnalysisModal[\s\S]*:open="postgameAiModalOpen"[\s\S]*:mode="postgameAiModalMode"[\s\S]*:stream-state="postgameAiStreamState"[\s\S]*:stream-text="postgameAiStreamText"[\s\S]*:stream-error="postgameAiStreamError"[\s\S]*:roster-players="postgameAiReviewRosterPlayers"[\s\S]*@start-analysis="startPostgameAiAnalysis"[\s\S]*@cancel-analysis="cancelPostgameAiAnalysis"[\s\S]*@close="closePostgameAiModal"/)
  assert.doesNotMatch(source, /:stream-usage="postgameAiStreamUsage"/)
})

test('inline match detail postgame AI handlers open review and praise modes then close', () => {
  const harness = createPostgameAiHarness()

  harness.openPostgameAiModal('review')
  assert.equal(harness.postgameAiModalOpen.value, true)
  assert.equal(harness.postgameAiModalMode.value, 'review')

  harness.closePostgameAiModal()
  assert.equal(harness.postgameAiModalOpen.value, false)

  harness.openPostgameAiModal('praise')
  assert.equal(harness.postgameAiModalOpen.value, true)
  assert.equal(harness.postgameAiModalMode.value, 'praise')
})

test('opening postgame AI modal does not build snapshots, fetch timelines, or call server stream', () => {
  const source = readInlineDetailSource()
  const openBlock = readFunctionBlock(source, 'function openPostgameAiModal(mode: PostgameAiAnalysisMode): void')

  assert.match(openBlock, /postgameAiModalMode\.value = mode/)
  assert.match(openBlock, /postgameAiModalOpen\.value = true/)
  assert.doesNotMatch(openBlock, /buildPostgameAiInputSnapshot|createPostgameAiStreamRequest|streamPostgameAiAnalysis|apiClient\.getGameTimeline|fetch\(/)
})

test('postgame AI start handler builds and streams only after the modal start action', () => {
  const source = readInlineDetailSource()
  const startBlock = readFunctionBlock(source, 'async function startPostgameAiAnalysis()')
  const timelineBlock = readFunctionBlock(source, 'async function resolvePostgameTimelineForSnapshot()')

  assert.match(startBlock, /postgameAiStreamState\.value === 'preparing' \|\| postgameAiStreamState\.value === 'streaming'/)
  assert.match(startBlock, /const mode = postgameAiModalMode\.value/)
  assert.match(startBlock, /const championNamesById = await resolvePostgameChampionNamesById\(\)/)
  assert.match(startBlock, /postgameAiChampionNamesById\.value = championNamesById/)
  assert.match(startBlock, /const accountPuuid = resolvePostgameAiAccountPuuid\(\)/)
  assert.match(startBlock, /buildPostgameAiInputSnapshot\(\{[\s\S]*matchHistory: props\.matchHistory[\s\S]*gameDetail: displayGameDetail\.value[\s\S]*timeline[\s\S]*currentPuuid: accountPuuid[\s\S]*currentSummonerName: props\.currentSummonerName[\s\S]*championNamesById/)
  assert.doesNotMatch(startBlock, /buildPostgameAiInputSnapshot\(\{[\s\S]*mode: postgameAiModalMode\.value/)
  assert.match(startBlock, /createPostgameAiStreamRequest\(snapshot,\s*mode\)/)
  assert.match(startBlock, /streamPostgameAiAnalysis\(/)
  assert.doesNotMatch(startBlock, /onSection:\s*title => appendPostgameAiStreamText/)
  assert.match(startBlock, /onUsage: usage => \{[\s\S]*postgameAiStreamUsage\.value = usage[\s\S]*\}/)
  assert.match(startBlock, /let postgameAiSaveStarted = false/)
  assert.match(startBlock, /const saveCompletedStreamOnce = \(\): Promise<void> =>/)
  assert.match(startBlock, /onDone: \(\) => \{[\s\S]*void saveCompletedStreamOnce\(\)/)
  assert.match(startBlock, /saveCompletedPostgameAiAnalysis\(\{[\s\S]*snapshot[\s\S]*mode[\s\S]*championNamesById/)
  assert.match(source, /async function resolvePostgameChampionNamesById\(\): Promise<Record<number, string>>/)
  assert.match(source, /apiClient\.getChampionOptions\(\)/)
  assert.match(timelineBlock, /if \(timelineData\.value\) \{[\s\S]*return timelineData\.value/)
  assert.match(timelineBlock, /isChartRankedMode\.value/)
  assert.match(timelineBlock, /apiClient\.getGameTimeline\(gameId,[\s\S]*source: 'auto'/)
})

test('postgame AI completion saves raw output and usage without persisting snapshot contents', () => {
  const source = readInlineDetailSource()
  const saveBlock = readFunctionBlock(source, 'async function saveCompletedPostgameAiAnalysis(')

  assert.match(saveBlock, /const rawOutputText = postgameAiStreamText\.value\.trim\(\)/)
  assert.match(saveBlock, /if \(!rawOutputText\) \{[\s\S]*return/)
  assert.match(saveBlock, /isPostgameAiStructuredOutputValid\(mode,\s*rawOutputText\)/)
  assert.match(saveBlock, /savePostgameAiRunResultToLocal\(\{[\s\S]*accountPuuid: resolvePostgameAiAccountPuuid\(\)[\s\S]*mode[\s\S]*rawOutputText[\s\S]*usage: postgameAiStreamUsage\.value[\s\S]*snapshot[\s\S]*matchHistory: props\.matchHistory[\s\S]*championNamesById[\s\S]*rosterPlayers: postgameAiReviewRosterPlayers\.value/)
  assert.match(saveBlock, /if \(!saveResult\.success\) \{[\s\S]*console\.warn/)
  assert.doesNotMatch(saveBlock, /analysisBrief|snapshot\.analysisBrief|JSON\.stringify\(snapshot/)
})

test('postgame AI close cancels active work and clears stream state', () => {
  const source = readInlineDetailSource()
  const closeBlock = readFunctionBlock(source, 'function closePostgameAiModal(): void')

  assert.match(closeBlock, /postgameAiStreamAbortController\.value\?\.abort\(\)/)
  assert.match(closeBlock, /postgameAiStreamState\.value = 'idle'/)
  assert.match(closeBlock, /postgameAiStreamText\.value = ''/)
  assert.match(closeBlock, /postgameAiStreamError\.value = ''/)
  assert.match(closeBlock, /postgameAiStreamUsage\.value = null/)
  assert.match(closeBlock, /postgameAiModalOpen\.value = false/)
})

test('chart tab renders timeline chart UI instead of a placeholder', () => {
  const source = readInlineDetailSource()
  const chartBlock = source.match(/<div v-else-if="activeTabValue === 'chart'"[\s\S]*?<\/div>\s*<\/section>/)?.[0] || ''

  assert.doesNotMatch(source, /const hasTimelineData = computed\(\(\) => false\)/)
  assert.match(source, /import \{ apiClient \} from '@\/api\/httpClient'/)
  assert.match(source, /createTimelineChartModel/)
  assert.match(chartBlock, /class="timeline-chart-shell"/)
  assert.match(chartBlock, /class="timeline-chart-panel"/)
  assert.match(chartBlock, /class="timeline-chart-heading"/)
  assert.match(chartBlock, /class="timeline-chart-svg"/)
  assert.match(chartBlock, /class="timeline-event-track"/)
})

test('non-ranked detail hides RP and chart tabs and does not request timeline', () => {
  const source = readInlineDetailSource()

  assert.match(source, /const isChartRankedMode = computed\(\(\) => isRankedMode\(props\.matchHistory\) \|\| isRankedMode\(displayGameDetail\.value\)\)/)
  assert.match(source, /return baseTabs\.filter\(tab => tab\.key !== 'rp' && tab\.key !== 'chart'\)/)
  assert.match(source, /if \(!isChartRankedMode\.value\) \{[\s\S]*return[\s\S]*\}/)
})

test('chart and RP tabs lazy-load timeline only after either timeline-backed tab is selected', () => {
  const source = readInlineDetailSource()
  const loaderBlock = readFunctionBlock(source, 'async function loadTimelineForCurrentGame()')
  const timelineWatcherBlock = source.match(/watch\(\s*\(\) => \[activeTabValue\.value, currentTimelineGameId\.value, isChartRankedMode\.value\][\s\S]*?\{ immediate: true \}\s*\)/)?.[0] || ''

  assert.match(source, /watch\([\s\S]*activeTabValue\.value[\s\S]*loadTimelineForCurrentGame/)
  assert.match(timelineWatcherBlock, /activeTabValue\.value === 'chart' \|\| activeTabValue\.value === 'rp'/)
  assert.match(loaderBlock, /activeTabValue\.value !== 'chart' && activeTabValue\.value !== 'rp'/)
  assert.match(loaderBlock, /apiClient\.getGameTimeline\(gameId,[\s\S]*source: 'auto'/)
  assert.match(loaderBlock, /timelineRequestedGameId\.value === gameId/)
})

test('RP tab renders score cards, multi-line chart, empty selection, and input explainer', () => {
  const source = readInlineDetailSource()
  const zh = readFileSync(new URL('../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
  const en = readFileSync(new URL('../../i18n/locales/en-US.ts', import.meta.url), 'utf8')
  const rpBlock = source.match(/<div v-else-if="activeTabValue === 'rp'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''

  assert.match(source, /createMatchRpIndexModel/)
  assert.match(source, /formatRpScore/)
  assert.match(source, /selectedRpParticipantIds/)
  assert.match(source, /rpSelectedSeries/)
  assert.match(source, /rpTrendBadges/)
  assert.match(rpBlock, /class="rp-index-shell"/)
  assert.match(rpBlock, /class="rp-trend-badges"/)
  assert.match(rpBlock, /v-for="group in rpScoreGroups"/)
  assert.match(rpBlock, /class="rp-score-card"/)
  assert.match(rpBlock, /@click="toggleRpParticipant/)
  const rpScoreCardClassIndex = rpBlock.indexOf('class="rp-score-card"')
  const rpScoreCardStart = rpBlock.lastIndexOf('<button', rpScoreCardClassIndex)
  const rpScoreCardEnd = rpBlock.indexOf('</button>', rpScoreCardClassIndex)
  const rpScoreCardBlock = rpScoreCardStart >= 0 && rpScoreCardEnd >= 0
    ? rpBlock.slice(rpScoreCardStart, rpScoreCardEnd + '</button>'.length)
    : ''
  const selectedCardRule = source.match(/\.rp-score-card\.selected \{[\s\S]*?\n\}/)?.[0] || ''
  assert.doesNotMatch(rpScoreCardBlock, /:title=|title=/)
  assert.doesNotMatch(source, /function getRpScoreCardTitle/)
  assert.match(selectedCardRule, /box-shadow:\s*var\(--rp-score-card-selected-shadow\)/)
  assert.match(source, /--rp-score-card-selected-shadow:\s*inset 0 0 0 4px/)
  assert.match(rpBlock, /class="rp-chart-svg"/)
  assert.match(rpBlock, /v-for="series in rpSelectedSeries"/)
  assert.match(rpBlock, /class="rp-chart-hover-line"/)
  assert.match(rpBlock, /class="rp-chart-hover-point"/)
  assert.match(rpBlock, /v-for="row in rpTooltipRows"/)
  assert.match(rpBlock, /class="[^"]*rp-chart-tooltip[^"]*"/)
  assert.match(rpBlock, /matchDetail\.rpEmptySelection/)
  assert.match(rpBlock, /matchDetail\.rpInputSummary/)
  assert.doesNotMatch(rpBlock, /hoveredRpPoint\.series\.playerLabel/)
  assert.doesNotMatch(rpBlock, /timeline-axis-marker|timeline-event-track/)
  const rpHeadingBlock = source.match(/<header class="rp-chart-heading"[\s\S]*?<\/header>/)?.[0] || ''
  assert.match(rpHeadingBlock, /class="rp-chart-title-row"/)
  assert.match(rpHeadingBlock, /class="rp-trend-badges"/)
  assert.match(rpHeadingBlock, /rpTrendBadges\.length/)
  assert.match(zh, /'matchDetail\.rpEmptySelection': '选择玩家查看 RP 曲线'/)
  assert.match(en, /'matchDetail\.rpEmptySelection': 'Select players to view RP curves'/)
})

test('light theme gives RP index cards and chart readable surface colors', () => {
  const source = readInlineDetailSource()
  const rootRule = extractRule(source, '.inline-match-detail')
  const lightRule = extractRule(source, ':global([data-theme="light"] .inline-match-detail)')
  const scoreCardRule = extractRule(source, '.rp-score-card')
  const trendBadgeRule = extractRule(source, '.rp-trend-badge')
  const infoButtonRule = extractRule(source, '.rp-info-button')
  const tooltipRule = extractRule(source, '.rp-chart-tooltip')
  const gridRule = extractRule(source, '.rp-chart-grid line,\n.rp-chart-time-axis line')

  assert.match(rootRule, /--rp-score-card-bg:/)
  assert.match(rootRule, /--rp-chart-tooltip-bg:/)
  assert.match(lightRule, /--rp-score-card-bg:\s*rgba\(255,\s*255,\s*255,\s*0\.92\)/)
  assert.match(lightRule, /--rp-trend-badge-bg:\s*rgba\(232,\s*240,\s*255,\s*0\.92\)/)
  assert.match(lightRule, /--rp-info-button-bg:\s*rgba\(255,\s*255,\s*255,\s*0\.86\)/)
  assert.match(lightRule, /--rp-chart-tooltip-bg:\s*rgba\(255,\s*255,\s*255,\s*0\.98\)/)
  assert.match(lightRule, /--rp-chart-hover-point-stroke:\s*#ffffff/)
  assert.match(scoreCardRule, /background:\s*var\(--rp-score-card-bg\)/)
  assert.match(scoreCardRule, /border:\s*1px solid var\(--rp-score-card-border\)/)
  assert.match(trendBadgeRule, /background:\s*var\(--rp-trend-badge-bg\)/)
  assert.match(infoButtonRule, /background:\s*var\(--rp-info-button-bg\)/)
  assert.match(tooltipRule, /background:\s*var\(--rp-chart-tooltip-bg\)/)
  assert.match(gridRule, /stroke:\s*var\(--rp-chart-grid-line\)/)
})

test('RP chart uses a high-contrast fixed ten-color palette', () => {
  const source = readInlineDetailSource()
  const colorBlock = source.match(/const RP_CHART_COLORS = \[([\s\S]*?)\]/)?.[1] || ''
  const colors = [...colorBlock.matchAll(/'(#(?:[0-9a-fA-F]{6}))'/g)].map(match => match[1])

  assert.deepEqual(colors, [
    '#ff4d6d',
    '#ffd166',
    '#4cc9f0',
    '#7ae582',
    '#c77dff',
    '#3a86ff',
    '#f72585',
    '#ff8c42',
    '#ff3dcb',
    '#d6ff4d'
  ])
  assert.equal(new Set(colors).size, 10)
})

test('chart tab renders gold diff filters, svg line chart, and event markers with timeline data', () => {
  const source = readInlineDetailSource()
  const zh = readFileSync(new URL('../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
  const en = readFileSync(new URL('../../i18n/locales/en-US.ts', import.meta.url), 'utf8')
  const chartBlock = source.match(/<div v-else-if="activeTabValue === 'chart'"[\s\S]*?<\/div>\s*<\/section>/)?.[0] || ''
  const chartStageBlock = source.match(/<div v-if="selectedGoldDiffSeries\.points\.length" class="timeline-chart-stage"[\s\S]*?<div v-else class="timeline-chart-metric-empty">/)?.[0] || ''
  const markerButtonBlock = source.match(/class="timeline-axis-marker[\s\S]*?<\/button>/)?.[0] || ''
  const axisPanelBlock = source.match(/<div class="timeline-axis-panel">[\s\S]*?<div v-else class="timeline-empty">/)?.[0] || ''
  const eventTooltipRule = source.match(/\.timeline-event-tooltip \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /type GoldDiffMetricKey/)
  assert.match(source, /selectedGoldDiffMetric/)
  assert.match(chartBlock, /v-for="option in goldDiffMetricOptions"/)
  assert.match(source, /matchDetail\.timelineMetricTeamAverage/)
  assert.match(source, /matchDetail\.timelineMetricTop/)
  assert.match(source, /matchDetail\.timelineMetricJungle/)
  assert.match(source, /matchDetail\.timelineMetricMiddle/)
  assert.match(source, /matchDetail\.timelineMetricBottom/)
  assert.match(source, /matchDetail\.timelineMetricSupport/)
  assert.match(zh, /'matchDetail\.timelineMetricTeamAverage': '团队总经济差'/)
  assert.doesNotMatch(zh, /团队平均经济差/)
  assert.match(en, /'matchDetail\.timelineMetricTeamAverage': 'Team Gold Diff'/)
  assert.doesNotMatch(en, /Team Avg Gold Diff/)
  assert.match(chartBlock, /class="timeline-chart-hit-area"/)
  assert.match(chartBlock, /fill="transparent"/)
  assert.match(chartBlock, /opacity="0"/)
  assert.doesNotMatch(chartBlock, /class="timeline-gold-point"|class="timeline-chart-point"/)
  assert.match(chartBlock, /v-for="track in timelineEventTracks"/)
  assert.match(chartBlock, /v-for="cluster in track\.clusters"/)
  assert.doesNotMatch(chartBlock, /class="timeline-event-cluster-count"/)
  assert.match(chartStageBlock, /class="lane-matchup-watermark"/)
  assert.match(chartStageBlock, /selectedGoldDiffMetric !== 'teamAverage' && laneMatchupWatermarks\.length/)
  assert.match(chartStageBlock, /selectedGoldDiffMetric === 'teamAverage' && teamAverageWatermarkGroups\.length/)
  assert.match(chartStageBlock, /class="team-average-watermarks"/)
  assert.match(chartStageBlock, /team-average-watermark-row--blue/)
  assert.match(chartStageBlock, /team-average-watermark-row--red/)
  assert.match(chartStageBlock, /class="team-watermark"/)
  assert.match(chartStageBlock, /class="team-champion-watermark"/)
  assert.match(chartStageBlock, /class="lane-matchup-watermarks lane-matchup-watermark--vertical"/)
  assert.match(chartStageBlock, /lane-matchup-watermark-avatar--blue/)
  assert.match(chartStageBlock, /lane-matchup-watermark-avatar--red/)
  assert.match(chartStageBlock, /pointer-events="none"/)
  assert.match(source, /getChampionIconUrl\(watermark\.championId\)/)
  assert.match(chartBlock, /class="timeline-chart-crosshair"/)
  assert.match(chartBlock, /class="timeline-event-tooltip timeline-axis-tooltip--bubble"/)
  assert.match(chartBlock, /class="timeline-chart-tooltip timeline-chart-tooltip--bubble"/)
  assert.match(chartBlock, /class="timeline-event-tooltip-row"/)
  assert.match(chartBlock, /v-for="row in getTimelineClusterTooltipRows\(hoveredEventCluster\)"/)
  assert.match(markerButtonBlock, /class="timeline-axis-marker/)
  assert.doesNotMatch(markerButtonBlock, /<img|champion|Champion|getChampionIconUrl/)
  assert.doesNotMatch(markerButtonBlock, /:title|title=/)
  assert.doesNotMatch(axisPanelBlock, /AssetHoverTooltip/)
  assert.match(source, /formatGoldDiffTick\(value\)/)
  assert.doesNotMatch(source, /label: formatGoldDiff\(value\)/)
  assert.match(eventTooltipRule, /z-index:\s*(?:[1-9]\d{2,}|999)/)
  assert.doesNotMatch(source, /formatGoldDiffTick[\s\S]*千|formatGoldDiffTick[\s\S]*万/)
})

test('chart line tooltip uses a pointerless bubble with an arrow', () => {
  const source = readInlineDetailSource()
  const chartStageBlock = source.match(/<div v-if="selectedGoldDiffSeries\.points\.length" class="timeline-chart-stage"[\s\S]*?<div v-else class="timeline-chart-metric-empty">/)?.[0] || ''
  const hitAreaBlock = source.match(/class="timeline-chart-hit-area"[\s\S]*?\/>/)?.[0] || ''
  const tooltipRule = source.match(/\.timeline-chart-tooltip \{[\s\S]*?\n\}/)?.[0] || ''
  const bubbleRule = source.match(/\.timeline-chart-tooltip--bubble \{[\s\S]*?\n\}/)?.[0] || ''
  const arrowRule = source.match(/\.timeline-chart-tooltip-arrow \{[\s\S]*?\n\}/)?.[0] || ''
  const tooltipStyleFunction = readFunctionBlock(source, 'function getChartTooltipStyle')
  const showTooltipFunction = readFunctionBlock(source, 'function showGoldDiffTooltip')

  assert.match(chartStageBlock, /class="timeline-chart-tooltip timeline-chart-tooltip--bubble"/)
  assert.match(chartStageBlock, /class="timeline-chart-tooltip-arrow"/)
  assert.match(hitAreaBlock, /@pointerenter="showGoldDiffTooltip\(\$event, point\)"/)
  assert.match(hitAreaBlock, /@pointermove="moveGoldDiffTooltip\(\$event, point\)"/)
  assert.match(hitAreaBlock, /@pointerleave="hideGoldDiffTooltip"/)
  assert.match(tooltipRule, /pointer-events:\s*none/)
  assert.match(bubbleRule, /transform:\s*translate\(-50%,\s*calc\(-100% - var\(--timeline-chart-tooltip-gap/)
  assert.match(arrowRule, /left:\s*var\(--timeline-chart-tooltip-arrow-left/)
  assert.match(arrowRule, /rotate\(45deg\)/)
  assert.match(arrowRule, /background:\s*var\(--timeline-chart-tooltip-bg/)
  assert.match(tooltipStyleFunction, /'--timeline-chart-tooltip-arrow-left'/)
  assert.match(tooltipStyleFunction, /hoveredGoldDiffTooltipAnchor\.value/)
  assert.match(showTooltipFunction, /getChartPointerAnchor\(event,\s*point\)/)
})

test('chart line tooltip renders time and absolute metric diff only', () => {
  const source = readInlineDetailSource()
  const harness = createChartTooltipHarness()
  const chartStageBlock = source.match(/<div v-if="selectedGoldDiffSeries\.points\.length" class="timeline-chart-stage"[\s\S]*?<div v-else class="timeline-chart-metric-empty">/)?.[0] || ''
  const chartTooltipBlock = chartStageBlock.match(/<div[\s\S]*class="timeline-chart-tooltip timeline-chart-tooltip--bubble"[\s\S]*?<\/div>/)?.[0] || ''

  assert.match(chartTooltipBlock, /formatTimelineTime\(hoveredGoldDiffPoint\.timestamp\)/)
  assert.match(chartTooltipBlock, /formatChartTooltipMetricLine\(selectedGoldDiffMetricLabel,\s*hoveredGoldDiffPoint\)/)
  assert.doesNotMatch(chartTooltipBlock, /timelineBlueValue|timelineRedValue|timelineDiffValue|formatGoldValue|formatGoldDiff/)
  assert.equal(harness.formatChartTooltipMetricLine('团队总经济差', { diff: -598 }), '团队总经济差(598)')
  assert.equal(harness.formatChartTooltipMetricLine('上路经济差', { diff: 1245 }), '上路经济差(1,245)')
  assert.equal(harness.formatChartTooltipMetricLine('团队总经济差', { diff: null }), '团队总经济差(--)')
  assert.doesNotMatch(harness.formatChartTooltipMetricLine('团队总经济差', { diff: -598 }), /[+-]/)
})

test('timeline axis hover synchronizes chart crosshair without showing chart tooltip', () => {
  const source = readInlineDetailSource()
  const chartStageBlock = source.match(/<div v-if="selectedGoldDiffSeries\.points\.length" class="timeline-chart-stage"[\s\S]*?<div v-else class="timeline-chart-metric-empty">/)?.[0] || ''
  const crosshairBlock = chartStageBlock.match(/<line[\s\S]*class="timeline-chart-crosshair"[\s\S]*?\/>/)?.[0] || ''
  const chartTooltipBlock = chartStageBlock.match(/<div[\s\S]*class="timeline-chart-tooltip timeline-chart-tooltip--bubble"[\s\S]*?<\/div>/)?.[0] || ''
  const activeTimestampComputed = source.match(/const activeChartCrosshairTimestamp = computed[\s\S]*?\)\r?\n/)?.[0] || ''
  const showAxisFunction = readFunctionBlock(source, 'function showTimelineEventTooltip')
  const hideAxisFunction = readFunctionBlock(source, 'function hideTimelineEventTooltip')

  assert.match(source, /type ChartHoverSource = 'chart' \| 'axis'/)
  assert.match(activeTimestampComputed, /chartHoverSource\.value === 'axis'/)
  assert.match(activeTimestampComputed, /hoveredEventCluster\.value\?\.timestamp/)
  assert.match(activeTimestampComputed, /chartHoverSource\.value === 'chart'/)
  assert.match(crosshairBlock, /v-if="activeChartCrosshairTimestamp !== null"/)
  assert.match(crosshairBlock, /getChartX\(activeChartCrosshairTimestamp\)/)
  assert.match(showAxisFunction, /chartHoverSource\.value = 'axis'/)
  assert.match(showAxisFunction, /hoveredGoldDiffPoint\.value = null/)
  assert.match(hideAxisFunction, /chartHoverSource\.value === 'axis'/)
  assert.match(hideAxisFunction, /chartHoverSource\.value = null/)
  assert.match(chartTooltipBlock, /v-if="chartHoverSource === 'chart' && hoveredGoldDiffPoint"/)
})

test('chart timeline axis omits team labels and keeps time ticks aligned', () => {
  const source = readInlineDetailSource()
  const chartBlock = source.match(/<div v-else-if="activeTabValue === 'chart'"[\s\S]*?<\/div>\s*<\/section>/)?.[0] || ''
  const chartStageBlock = source.match(/<div v-if="selectedGoldDiffSeries\.points\.length" class="timeline-chart-stage"[\s\S]*?<div v-else class="timeline-chart-metric-empty">/)?.[0] || ''
  const tracksFunction = readFunctionBlock(source, 'function createTimelineEventTracks')
  const clusterStyleFunction = readFunctionBlock(source, 'function getTimelineClusterStyle')
  const axisXFunction = readFunctionBlock(source, 'function getTimelineAxisX')
  const chartStageRule = source.match(/\.timeline-chart-stage \{[\s\S]*?\n\}/)?.[0] || ''
  const axisLayerRule = source.match(/\.timeline-chart-axis-layer \{[\s\S]*?\n\}/)?.[0] || ''
  const blueTrackRule = source.match(/\.timeline-event-track\.track-blue \{[\s\S]*?\n\}/)?.[0] || ''
  const redTrackRule = source.match(/\.timeline-event-track\.track-red \{[\s\S]*?\n\}/)?.[0] || ''
  const trackRule = source.match(/\.timeline-event-track \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(chartStageBlock, /class="timeline-chart-time-axis"/)
  assert.match(chartStageBlock, /v-for="tick in chartTimeTicks"/)
  assert.match(chartStageBlock, /class="timeline-chart-axis-layer/)
  assertOrdered(chartStageBlock, [
    'class="timeline-chart-svg"',
    'class="timeline-chart-time-axis"',
    'class="timeline-chart-axis-layer'
  ])
  assert.match(chartStageRule, /--timeline-chart-event-axis-height:/)
  assert.match(chartStageRule, /padding-bottom:\s*var\(--timeline-chart-event-axis-height\)/)
  assert.match(axisLayerRule, /bottom:\s*0/)
  assert.match(axisLayerRule, /height:\s*var\(--timeline-chart-event-axis-height\)/)
  assert.match(blueTrackRule, /bottom:\s*var\(--timeline-chart-event-axis-blue-bottom\)/)
  assert.match(redTrackRule, /bottom:\s*var\(--timeline-chart-event-axis-red-bottom\)/)
  assert.doesNotMatch(chartBlock, /<\/div>\s*<\/div>\s*<div class="timeline-axis-panel">/)
  assert.doesNotMatch(chartStageBlock, /timeline-event-track-label|\{\{\s*track\.label\s*\}\}/)
  assert.doesNotMatch(tracksFunction, /label:\s*t\('common\.(?:blueTeam|redTeam)'\)|neutral/)
  assert.match(clusterStyleFunction, /getTimelineAxisX\(cluster\.timestamp\)/)
  assert.match(axisXFunction, /getChartX\(/)
  assert.match(axisXFunction, /timelineMaxTimestamp\.value/)
  assert.doesNotMatch(clusterStyleFunction, /Math\.max\(0\.8,\s*Math\.min\(99\.2/)
  assert.doesNotMatch(trackRule, /grid-template-columns|gap:/)
})

test('chart timeline axis renders team-isolated blue and red dot markers', () => {
  const source = readInlineDetailSource()
  const tracksFunction = readFunctionBlock(source, 'function createTimelineEventTracks')
  const markerButtonBlock = source.match(/class="timeline-axis-marker[\s\S]*?<\/button>/)?.[0] || ''

  assert.match(tracksFunction, /clusterTimelineAxisMarkers\(clusters,\s*100\)/)
  assert.match(tracksFunction, /clusterTimelineAxisMarkers\(clusters,\s*200\)/)
  assert.match(tracksFunction, /\{ key: 'blue', clusters: blueClusters \}/)
  assert.match(tracksFunction, /\{ key: 'red', clusters: redClusters \}/)
  assert.doesNotMatch(tracksFunction, /teamId !== 100 && cluster\.teamId !== 200|neutral/)
  assert.match(markerButtonBlock, /track\.key === 'blue'\s*\?\s*'timeline-axis-marker--blue'\s*:\s*'timeline-axis-marker--red'/)
  assert.doesNotMatch(markerButtonBlock, /`event-\$\{cluster\.type\}`|`team-\$\{track\.key\}`/)
})

test('chart timeline axis emphasizes markers related to the selected lane matchup', () => {
  const source = readInlineDetailSource()
  const markerButtonBlock = source.match(/class="timeline-axis-marker[\s\S]*?<\/button>/)?.[0] || ''
  const relatedRule = source.match(/\.timeline-axis-marker--related \{[\s\S]*?\n\}/)?.[0] || ''
  const dimmedRule = source.match(/\.timeline-axis-marker--dimmed \{[\s\S]*?\n\}/)?.[0] || ''
  const harness = createTimelineLaneRelevanceHarness('top', [1, 6])

  assert.match(source, /createGoldDiffDomain\(selectedGoldDiffSeries\.value\.points,\s*\{\s*maxTickCount:\s*MAX_CHART_Y_TICK_COUNT\s*\}\)/)
  assert.match(markerButtonBlock, /getTimelineClusterRelevanceClass\(cluster\)/)
  assert.match(relatedRule, /opacity:\s*1/)
  assert.match(dimmedRule, /opacity:\s*0\.\d+/)
  assert.equal(harness.getTimelineClusterRelevanceClass({ items: [{ killerId: 1 }] }), 'timeline-axis-marker--related')
  assert.equal(harness.getTimelineClusterRelevanceClass({ items: [{ victimId: 6 }] }), 'timeline-axis-marker--related')
  assert.equal(harness.getTimelineClusterRelevanceClass({ items: [{ participantId: 1 }] }), 'timeline-axis-marker--related')
  assert.equal(
    harness.getTimelineClusterRelevanceClass({ items: [{ killerId: 4, assistingParticipantIds: [5, 6] }] }),
    'timeline-axis-marker--related'
  )
  assert.equal(harness.getTimelineClusterRelevanceClass({ items: [{ killerId: 4, victimId: 9 }] }), 'timeline-axis-marker--dimmed')
})

test('team-average timeline axis does not dim unrelated markers', () => {
  const harness = createTimelineLaneRelevanceHarness('teamAverage', [1, 6])

  assert.equal(harness.getTimelineClusterRelevanceClass({ items: [{ killerId: 4, victimId: 9 }] }), '')
  assert.equal(harness.isTimelineClusterRelatedToSelectedLane({ items: [{ killerId: 4, victimId: 9 }] }), false)
  assert.equal(
    harness.isTimelineEventMarkerRelatedToParticipantIds({ assistingParticipantIds: [6] }, new Set([1, 6])),
    true
  )
})

test('chart timeline axis aggregates nearby same-team markers with a bottom-axis window', () => {
  const source = readInlineDetailSource()
  const harness = createTimelineAxisClusterHarness()
  const createCluster = (teamId: number, timestamp: number, key: string) => ({
    key,
    timestamp,
    endTimestamp: timestamp,
    teamId,
    type: 'kill',
    items: [{ key: `${key}-item`, timestamp, teamId }],
    count: 1,
    markerSize: 11
  })

  const clusters = [
    createCluster(100, 60_000, 'blue-1'),
    createCluster(200, 75_000, 'red-1'),
    createCluster(100, 120_000, 'blue-2'),
    createCluster(100, 195_000, 'blue-outside-60s'),
    createCluster(100, 310_000, 'blue-far')
  ]
  const blueClusters = harness.clusterTimelineAxisMarkers(clusters, 100)

  assert.match(source, /const TIMELINE_AXIS_CLUSTER_WINDOW_MS = 60_000/)
  assert.doesNotMatch(source, /TIMELINE_AXIS_CLUSTER_WINDOW_MS = 90000|TIMELINE_AXIS_CLUSTER_WINDOW_MS = 90_000/)
  assert.equal(blueClusters.length, 3)
  assert.equal(blueClusters[0]?.count, 2)
  assert.equal(JSON.stringify(blueClusters[0]?.items.map(item => item.teamId)), '[100,100]')
  assert.ok(blueClusters[0]?.markerSize > blueClusters[1]?.markerSize)
})

test('chart timeline axis aggregation never mixes blue and red teams', () => {
  const harness = createTimelineAxisClusterHarness()
  const createCluster = (teamId: number, timestamp: number, key: string) => ({
    key,
    timestamp,
    endTimestamp: timestamp,
    teamId,
    type: 'kill',
    items: [{ key: `${key}-item`, timestamp, teamId }],
    count: 1,
    markerSize: 11
  })

  const clusters = [
    createCluster(100, 100_000, 'blue-1'),
    createCluster(200, 105_000, 'red-1'),
    createCluster(100, 130_000, 'blue-2'),
    createCluster(200, 140_000, 'red-2')
  ]
  const blueClusters = harness.clusterTimelineAxisMarkers(clusters, 100)
  const redClusters = harness.clusterTimelineAxisMarkers(clusters, 200)

  assert.equal(blueClusters.length, 1)
  assert.equal(redClusters.length, 1)
  assert.equal(JSON.stringify(blueClusters[0]?.items.map(item => item.teamId)), '[100,100]')
  assert.equal(JSON.stringify(redClusters[0]?.items.map(item => item.teamId)), '[200,200]')
})

test('chart timeline axis markers are plain dots without icons or numeric badges', () => {
  const source = readInlineDetailSource()
  const markerButtonBlock = source.match(/class="timeline-axis-marker[\s\S]*?<\/button>/)?.[0] || ''
  const axisMarkerStyles = source.match(/\.timeline-axis-marker \{[\s\S]*?\.timeline-event-tooltip \{/)?.[0] || ''

  assert.doesNotMatch(markerButtonBlock, /<img|<svg|avatar|icon|Icon|getChampionIconUrl|data-label|timeline-event-cluster-count|\{\{\s*cluster\.count\s*\}\}/i)
  assert.doesNotMatch(axisMarkerStyles, /timeline-event-marker-core|timeline-event-cluster-count|event-dragon|event-baron|event-herald|event-voidgrub|event-turret|rotate\(45deg\)|border-radius:\s*3px/)
})

test('chart timeline axis clusters render as larger same-color dots via stable classes', () => {
  const source = readInlineDetailSource()
  const markerButtonBlock = source.match(/class="timeline-axis-marker[\s\S]*?<\/button>/)?.[0] || ''
  const styleFunction = readFunctionBlock(source, 'function getTimelineClusterStyle')
  const markerRule = source.match(/\.timeline-axis-marker \{[\s\S]*?\n\}/)?.[0] || ''
  const blueRule = source.match(/\.timeline-axis-marker--blue \{[\s\S]*?\n\}/)?.[0] || ''
  const redRule = source.match(/\.timeline-axis-marker--red \{[\s\S]*?\n\}/)?.[0] || ''
  const clusterBlueRule = source.match(/\.timeline-axis-marker--cluster\.timeline-axis-marker--blue \{[\s\S]*?\n\}/)?.[0] || ''
  const clusterRedRule = source.match(/\.timeline-axis-marker--cluster\.timeline-axis-marker--red \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(markerButtonBlock, /cluster\.count > 1\s*\?\s*'timeline-axis-marker--cluster'\s*:\s*'timeline-axis-marker--single'/)
  assert.match(styleFunction, /'--timeline-axis-marker-size': `\$\{cluster\.markerSize\}px`/)
  assert.match(markerRule, /width:\s*var\(--timeline-axis-marker-size/)
  assert.match(markerRule, /height:\s*var\(--timeline-axis-marker-size/)
  assert.match(markerRule, /border-radius:\s*(?:50%|999px)/)
  assert.match(blueRule, /color:/)
  assert.match(redRule, /color:/)
  assert.match(clusterBlueRule, /box-shadow:/)
  assert.match(clusterRedRule, /box-shadow:/)
})

test('chart timeline axis tooltip renders as a pointerless bubble with an arrow', () => {
  const source = readInlineDetailSource()
  const chartStageBlock = source.match(/<div v-if="selectedGoldDiffSeries\.points\.length" class="timeline-chart-stage"[\s\S]*?<div v-else class="timeline-chart-metric-empty">/)?.[0] || ''
  const markerButtonBlock = source.match(/class="timeline-axis-marker[\s\S]*?<\/button>/)?.[0] || ''
  const tooltipRule = source.match(/\.timeline-event-tooltip \{[\s\S]*?\n\}/)?.[0] || ''
  const bubbleRule = source.match(/\.timeline-axis-tooltip--bubble \{[\s\S]*?\n\}/)?.[0] || ''
  const arrowRule = source.match(/\.timeline-axis-tooltip-arrow \{[\s\S]*?\n\}/)?.[0] || ''
  const tooltipStyleFunction = readFunctionBlock(source, 'function getTimelineEventTooltipStyle')
  const showTooltipFunction = readFunctionBlock(source, 'function showTimelineEventTooltip')

  assert.match(chartStageBlock, /class="timeline-event-tooltip timeline-axis-tooltip--bubble"/)
  assert.match(chartStageBlock, /class="timeline-axis-tooltip-arrow"/)
  assert.match(markerButtonBlock, /@pointerenter="showTimelineEventTooltip\(\$event, cluster\)"/)
  assert.match(markerButtonBlock, /@pointermove="moveTimelineEventTooltip\(\$event\)"/)
  assert.match(markerButtonBlock, /@pointerleave="hideTimelineEventTooltip"/)
  assert.match(tooltipRule, /pointer-events:\s*none/)
  assert.match(bubbleRule, /border-radius:\s*(?:8|9|10|12)px/)
  assert.match(bubbleRule, /transform:\s*translate\(-50%,\s*calc\(-100% - var\(--timeline-axis-tooltip-gap/)
  assert.match(arrowRule, /rotate\(45deg\)/)
  assert.match(arrowRule, /background:/)
  assert.match(arrowRule, /left:\s*var\(--timeline-axis-tooltip-arrow-left/)
  assert.match(tooltipStyleFunction, /'--timeline-axis-tooltip-arrow-left'/)
  assert.match(tooltipStyleFunction, /hoveredEventTooltipAnchor\.value/)
  assert.match(showTooltipFunction, /getTimelinePointerAnchor\(event\)/)
})

test('chart watermarks are centered soft squares and line paths have no translucent glow layer', () => {
  const source = readInlineDetailSource()
  const chartStageBlock = source.match(/<div v-if="selectedGoldDiffSeries\.points\.length" class="timeline-chart-stage"[\s\S]*?<div v-else class="timeline-chart-metric-empty">/)?.[0] || ''
  const teamWatermarkBlock = chartStageBlock.match(/class="team-average-watermarks"[\s\S]*?<\/g>\s*<g/)?.[0] || ''
  const laneWatermarkBlock = chartStageBlock.match(/class="lane-matchup-watermarks lane-matchup-watermark--vertical"[\s\S]*?<\/g>\s*<g class="timeline-chart-grid">/)?.[0] || ''
  const laneWatermarkFunction = readFunctionBlock(source, 'function createLaneMatchupWatermarks')
  const teamAverageFunction = readFunctionBlock(source, 'function createTeamAverageWatermarkGroups')
  const teamWatermarkFunction = readFunctionBlock(source, 'function createTeamChampionWatermarks')
  const watermarkStyles = source.match(/\.lane-matchup-watermarks,[\s\S]*?\.timeline-gold-line \{/)?.[0] || ''
  const timelineGoldLineRule = source.match(/\.timeline-gold-line \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(teamWatermarkBlock, /pointer-events="none"/)
  assert.match(laneWatermarkBlock, /pointer-events="none"/)
  assert.match(teamWatermarkBlock, /:href="watermark\.iconUrl"/)
  assert.match(teamWatermarkFunction, /getChampionIconUrl\(player\.championId\)/)
  assert.match(teamWatermarkFunction, /if \(!iconUrl\)/)
  assert.match(teamAverageFunction, /CHART_PADDING\.left \+ CHART_PLOT_WIDTH \/ 2/)
  assert.match(teamAverageFunction, /zeroAxisY\.value - TEAM_WATERMARK_SIZE - TEAM_WATERMARK_AXIS_GAP/)
  assert.match(teamAverageFunction, /zeroAxisY\.value \+ TEAM_WATERMARK_AXIS_GAP/)
  assert.match(teamAverageFunction, /group\.tone === 'blue'/)
  assert.match(teamWatermarkFunction, /players\.slice\(0, 5\)/)
  assert.match(chartStageBlock, /team-average-watermark-row--blue/)
  assert.match(chartStageBlock, /team-average-watermark-row--red/)
  assert.match(chartStageBlock, /v-for="group in teamAverageWatermarkGroups"[\s\S]*v-for="watermark in group\.watermarks"/)
  assert.match(laneWatermarkFunction, /CHART_PADDING\.left \+ CHART_PLOT_WIDTH \/ 2/)
  assert.match(laneWatermarkFunction, /zeroAxisY\.value - LANE_WATERMARK_SIZE \/ 2 - LANE_WATERMARK_AXIS_GAP/)
  assert.match(laneWatermarkFunction, /zeroAxisY\.value \+ LANE_WATERMARK_SIZE \/ 2 \+ LANE_WATERMARK_AXIS_GAP/)
  assert.match(chartStageBlock, /lane-matchup-watermark-avatar--blue/)
  assert.match(chartStageBlock, /lane-matchup-watermark-avatar--red/)
  assert.doesNotMatch(teamAverageFunction, /centerY|totalCount|TEAM_WATERMARK_TEAM_GAP|stagger|CHART_HEIGHT - CHART_PADDING\.bottom|CHART_PADDING\.top \+ 42/)
  assert.doesNotMatch(laneWatermarkFunction, /spacing|blueX|redX|centerY|offset/)
  assert.match(chartStageBlock, /:x="-WATERMARK_IMAGE_CROP_OUTSET"/)
  assert.match(chartStageBlock, /:width="watermark\.size \+ WATERMARK_IMAGE_CROP_OUTSET \* 2"/)
  assert.match(watermarkStyles, /border-radius:\s*14px/)
  assert.match(watermarkStyles, /clip-path:\s*inset\(3px round 14px\)/)
  assert.match(watermarkStyles, /object-fit:\s*cover/)
  assert.match(watermarkStyles, /fill:\s*transparent/)
  assert.match(watermarkStyles, /stroke-width:\s*0\.5/)
  assert.doesNotMatch(watermarkStyles, /box-shadow|drop-shadow|filter|blur|clip-path:\s*circle|circle\(50%|border-radius:\s*50%|black|rgba\(0,\s*0,\s*0|rgba\(3,\s*10,\s*18|watermark-halo/)
  assert.doesNotMatch(chartStageBlock, /watermark-halo|<circle[\s\S]*watermark/)
  assertOrdered(chartStageBlock, [
    'class="team-average-watermarks"',
    'class="lane-matchup-watermarks lane-matchup-watermark--vertical"',
    'class="timeline-chart-grid"',
    'class="timeline-gold-line"'
  ])
  assert.doesNotMatch(chartStageBlock, /timeline-gold-line-(?:glow|shadow)/)
  assert.doesNotMatch(source, /\.timeline-gold-line-(?:glow|shadow)/)
  assert.doesNotMatch(timelineGoldLineRule, /filter|drop-shadow|blur|stroke-opacity|opacity/)
})

test('timeline API types and client method are defined without touching game-detail API', () => {
  const apiSource = readApiSource()
  const clientSource = readFileSync(new URL('../../api/httpClient.ts', import.meta.url), 'utf8')

  assert.match(apiSource, /export interface MatchTimeline/)
  assert.match(apiSource, /export interface TimelineFrame/)
  assert.match(apiSource, /export interface ParticipantFrame/)
  assert.match(apiSource, /export interface TimelineEvent/)
  assert.match(apiSource, /export interface MatchTimelineFetchResult/)
  assert.match(clientSource, /async getGameTimeline\(/)
  assert.match(clientSource, /\/summoner\/game-timeline\/\$\{gameId\}/)
  assert.match(clientSource, /async getGameDetail\(/)
})

test('timeline chart UI work stays out of HomeChart and home chart entries', () => {
  const homeChart = readFileSync(new URL('../HomeChart.vue', import.meta.url), 'utf8')
  const homeChartEntries = readFileSync(new URL('../../services/homeChartEntries.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(homeChart, /timelineRankedOnly|timeline-chart-shell|timeline-chart-stage|timeline-event-track/)
  assert.doesNotMatch(homeChartEntries, /getGameTimeline|MatchTimeline|timelineRankedOnly|timeline-chart-shell/)
})

test('inline overview renders two compact team tables without changing detail loading', () => {
  const source = readInlineDetailSource()

  assert.match(source, /const fallbackGameDetail = computed<GameDetail \| null>\(\(\) => toGameDetailFromMatchHistory\(props\.matchHistory\)\)/)
  assert.match(source, /mergeGameDetailWithSummary\(detail, fallbackGameDetail\.value\)/)
  assert.match(source, /const blueTeamPlayers = computed/)
  assert.match(source, /const redTeamPlayers = computed/)
  assert.match(source, /const teamSections = computed/)
  assert.match(source, /v-for="team in teamSections"/)
  assert.match(source, /class="team-detail-table"/)
  assert.match(source, /class="participant-row"/)
  assert.match(source, /class="metric-bar damage-bar"/)
  assert.match(source, /class="metric-bar taken-bar"/)
  assert.match(source, /getKillParticipation/)
  assert.match(source, /getPlayerItemSlots/)
  assert.match(source, /getItemIconSlots/)
  assert.match(source, /@click="handlePlayerClick\(player\)"/)
  assert.match(source, /emit\('navigateToPlayer', player\.gameName, player\.tagLine\)/)
})

test('runes tab renders LCU-style primary and secondary rune columns', () => {
  const source = readInlineDetailSource()
  const runesBlock = source.match(/<div v-else-if="activeTabValue === 'runes'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''

  assert.match(source, /activeTabValue === 'runes'/)
  assert.match(source, /interface RuneStyleColumn/)
  assert.match(source, /function getPlayerRuneColumns/)
  assert.match(source, /function getPrimaryRuneSlots/)
  assert.match(source, /function getSecondaryRuneSlots/)
  assert.match(source, /function getRuneStyleSlot/)
  assert.match(source, /function getPlayerTraitSlots/)
  assert.match(source, /function getPerkTraitSlots/)
  assert.match(source, /function getAugmentTraitSlots/)
  assert.match(source, /playerAugment1/)
  assert.match(source, /playerAugment6/)
  assert.match(source, /getPerkAssetDetails/)
  assert.match(source, /getAugmentAssetDetails/)
  assert.match(source, /:aria-label="slot\.label"/)
  assert.match(source, /\{ empty: slot\.empty \}/)
  assert.match(runesBlock, /class="rune-columns"/)
  assert.match(runesBlock, /class="rune-column"/)
  assert.match(runesBlock, /class="rune-column-header"/)
  assert.match(runesBlock, /v-if="!hasValidAugment\(player\)"/)
  assert.match(runesBlock, /v-else[\s\S]*getRuneDetailSlots\(player\)/)
  assert.match(source, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)/)
})

test('runes tab renders blue and red teams as separate overview-style modules without divider', () => {
  const source = readInlineDetailSource()
  const overviewBlock = source.match(/<div v-if="activeTabValue === 'overview'"[\s\S]*?<div v-else-if="activeTabValue === 'runes'"/)?.[0] || ''
  const runesBlock = source.match(/<div v-else-if="activeTabValue === 'runes'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''
  const chartBlock = source.match(/<div v-else-if="activeTabValue === 'chart'"[\s\S]*?<\/div>\s*<\/section>/)?.[0] || ''
  const runesTabRule = source.match(/\.runes-tab \{[\s\S]*?\n\}/)?.[0] || ''
  const runeTeamCardRule = source.match(/\.rune-team-card \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /interface RuneTeamSection \{/)
  assert.match(source, /const runeTeamSections = computed<RuneTeamSection\[\]>/)
  assert.match(source, /key: 'blue'[\s\S]*teamId: 100[\s\S]*players: blueTeamPlayers\.value/)
  assert.match(source, /key: 'red'[\s\S]*teamId: 200[\s\S]*players: redTeamPlayers\.value/)
  assert.match(source, /\.filter\(section => section\.players\.length > 0\)/)
  assert.match(runesBlock, /v-for="\(\s*team,\s*teamIndex\s*\) in runeTeamSections"/)
  assert.match(runesBlock, /class="rune-team-card"/)
  assert.match(runesBlock, /class="rune-team-header"/)
  assert.match(runesBlock, /class="rune-team-players"/)
  assert.match(runesBlock, /v-for="\(\s*player,\s*playerIndex\s*\) in team\.players"/)
  assertOrdered(runesBlock, [
    'class="rune-team-card"',
    'class="rune-team-header"',
    'class="rune-team-players"',
    'v-for="(player, playerIndex) in team.players"'
  ])
  assert.doesNotMatch(runesBlock, /v-for="player in allPlayers"/)
  assert.doesNotMatch(overviewBlock, /rune-team-divider/)
  assert.doesNotMatch(chartBlock, /rune-team-divider/)
  assert.doesNotMatch(runesBlock, /rune-team-divider/)
  assert.doesNotMatch(source, /\.rune-team-divider/)
  assert.doesNotMatch(source, /rune-player-row--team-end/)
  assert.match(runesTabRule, /gap:\s*8px/)
  assert.match(runeTeamCardRule, /border:\s*1px solid rgba\(124, 139, 164, 0\.14\)/)
  assert.match(runeTeamCardRule, /border-radius:\s*7px/)
  assert.match(runeTeamCardRule, /overflow:\s*hidden/)
})

test('rune columns use perks.styles selections instead of rendering style ids as rune cards', () => {
  const source = readInlineDetailSource()
  const perkSlotsBlock = readFunctionBlock(
    source,
    'function getPerkTraitSlots(player: MatchDetailParticipant): TraitSlot[]'
  )
  const primarySlotsBlock = readFunctionBlock(
    source,
    'function getPrimaryRuneSlots(player: MatchDetailParticipant): TraitSlot[]'
  )
  const secondarySlotsBlock = readFunctionBlock(
    source,
    'function getSecondaryRuneSlots(player: MatchDetailParticipant): TraitSlot[]'
  )
  const styleSlotBlock = readFunctionBlock(
    source,
    'function getRuneStyleSlot(player: MatchDetailParticipant, styleIndex: number): TraitSlot | null'
  )

  assert.match(source, /readPerkStyles\(player\)/)
  assert.match(source, /styles\[0\]/)
  assert.match(source, /selections/)
  assert.match(source, /perkPrimaryStyle/)
  assert.match(source, /perkSubStyle/)
  assert.match(source, /perk0/)
  assert.match(source, /perk1/)
  assert.match(source, /perk2/)
  assert.match(source, /perk3/)
  assert.match(source, /perk4/)
  assert.match(source, /perk5/)
  assert.doesNotMatch(perkSlotsBlock, /perkPrimaryStyle|perkSubStyle/)
  assert.doesNotMatch(primarySlotsBlock, /perkPrimaryStyle|perkSubStyle/)
  assert.doesNotMatch(secondarySlotsBlock, /perkPrimaryStyle|perkSubStyle/)
  assert.match(styleSlotBlock, /perkPrimaryStyle/)
  assert.match(styleSlotBlock, /perkSubStyle/)
})

test('runes tab auto-expands current player and lets another player card expand', () => {
  const source = readInlineDetailSource()
  const runesBlock = source.match(/<div v-else-if="activeTabValue === 'runes'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''

  assert.match(source, /expandedRuneParticipantKey/)
  assert.match(source, /function getRuneParticipantKey/)
  assert.match(source, /function ensureCurrentRuneParticipantExpanded/)
  assert.match(source, /function isRuneParticipantExpanded/)
  assert.match(source, /function toggleRuneParticipant/)
  assert.match(source, /activeTabValue\.value === 'runes'/)
  assert.match(source, /props\.currentPuuid/)
  assert.match(runesBlock, /@click="toggleRuneParticipant\(player\)"/)
  assert.match(runesBlock, /@keydown\.enter\.prevent="toggleRuneParticipant\(player\)"/)
  assert.match(runesBlock, /@keydown\.space\.prevent="toggleRuneParticipant\(player\)"/)
  assert.match(runesBlock, /isRuneParticipantExpanded\(player\)/)
})

test('rune detail panel toggles open and closed for blue and red participants', () => {
  const harness = createRuneToggleHarness(9876)
  const bluePlayer = { participantId: 5 }
  const redPlayer = { participantId: 8 }

  assert.equal(harness.isRuneParticipantExpanded(bluePlayer), false)

  harness.toggleRuneParticipant(bluePlayer)
  assert.equal(harness.expandedRuneParticipantKey.value, '9876-5')
  assert.equal(harness.isRuneParticipantExpanded(bluePlayer), true)

  harness.toggleRuneParticipant(bluePlayer)
  assert.equal(harness.expandedRuneParticipantKey.value, '')
  assert.equal(harness.isRuneParticipantExpanded(bluePlayer), false)

  harness.toggleRuneParticipant(redPlayer)
  assert.equal(harness.expandedRuneParticipantKey.value, '9876-8')
  assert.equal(harness.isRuneParticipantExpanded(redPlayer), true)

  harness.toggleRuneParticipant(redPlayer)
  assert.equal(harness.expandedRuneParticipantKey.value, '')
  assert.equal(harness.isRuneParticipantExpanded(redPlayer), false)

  harness.toggleRuneParticipant(bluePlayer)
  harness.toggleRuneParticipant(redPlayer)
  assert.equal(harness.isRuneParticipantExpanded(bluePlayer), false)
  assert.equal(harness.isRuneParticipantExpanded(redPlayer), true)

  harness.toggleRuneParticipant(redPlayer)
  assert.equal(harness.expandedRuneParticipantKey.value, '')
  assert.equal(harness.isRuneParticipantExpanded(redPlayer), false)
})

test('rune detail panel visibility is DOM-driven and panel clicks do not bubble to the row toggle', () => {
  const source = readInlineDetailSource()
  const runesBlock = source.match(/<div v-else-if="activeTabValue === 'runes'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''

  assert.match(runesBlock, /v-if="isRuneParticipantExpanded\(player\)"[\s\S]*class="rune-detail-panel"[\s\S]*@click\.stop/)
  assert.match(runesBlock, /@click="toggleRuneParticipant\(player\)"/)
  assert.match(runesBlock, /class="trait-detail-slot"/)
  assert.match(runesBlock, /<AssetHoverTooltip/)
})

test('rune detail items render icon left and text right', () => {
  const source = readInlineDetailSource()
  const runesBlock = source.match(/<div v-else-if="activeTabValue === 'runes'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''
  const itemRule = source.match(/\.rune-detail-item \{[\s\S]*?\n\}/)?.[0] || ''
  const contentRule = source.match(/\.rune-detail-content \{[\s\S]*?\n\}/)?.[0] || ''
  const iconWrapRule = source.match(/\.rune-detail-icon-wrap \{[\s\S]*?\n\}/)?.[0] || ''
  const textRule = source.match(/\.rune-detail-text \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(runesBlock, /class="rune-detail-panel"/)
  assert.match(runesBlock, /class="rune-detail-item"/)
  assert.match(runesBlock, /class="rune-detail-content"/)
  assert.match(runesBlock, /class="rune-detail-icon-wrap/)
  assert.match(runesBlock, /class="rune-detail-icon"/)
  assert.match(runesBlock, /class="rune-detail-text"/)
  assert.match(runesBlock, /class="rune-detail-name"/)
  assert.match(contentRule, /display:\s*flex/)
  assert.match(contentRule, /align-items:\s*flex-start/)
  assert.match(iconWrapRule, /flex:\s*0 0 28px/)
  assert.doesNotMatch(itemRule, /text-align:\s*center/)
  assert.doesNotMatch(contentRule, /justify-content:\s*center/)
  assert.doesNotMatch(textRule, /align-items:\s*center/)
})

test('rune descriptions only appear through tooltip', () => {
  const source = readInlineDetailSource()
  const runesBlock = source.match(/<div v-else-if="activeTabValue === 'runes'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''
  const runeItemBlock = runesBlock.match(/class="rune-detail-item"[\s\S]*?<\/article>/)?.[0] || ''

  assert.match(runesBlock, /AssetHoverTooltip/)
  assert.match(runesBlock, /getTraitTooltipDetails\(slot\)/)
  assert.match(source, /function getRuneDisplayName\(slot: TraitSlot\): string/)
  assert.match(runesBlock, /class="rune-detail-content"/)
  assert.doesNotMatch(runesBlock, /class="rune-description"|class="rune-detail-desc"|class="rune-detail-description"/)
  assert.doesNotMatch(runeItemBlock, /details\.description|tooltip\.description|longDesc|shortDesc/)
  assert.doesNotMatch(runeItemBlock, /getTraitSlotLabel\(slot\.kind, slot\.id\)|getTraitDetailDescription\(slot\)/)
})

test('rune stat definitions support candidate var keys and hide zero by default', () => {
  const source = readInlineDetailSource()

  assert.match(source, /interface RuneStatDefinition/)
  assert.match(source, /valueKeys/)
  assert.match(source, /showZero/)
  assert.match(source, /function readRuneStatDefinitionValue/)
  assert.match(source, /value > 0/)
  assert.match(source, /definition\.showZero/)
  assert.match(source, /return null/)
})

test('conqueror stat uses positive value and does not render zero healing', () => {
  const source = readInlineDetailSource()
  const conquerorBlock = source.match(/8010:\s*\[[\s\S]*?\n {2}\]/)?.[0] || ''

  assert.match(conquerorBlock, /8010/)
  assert.match(conquerorBlock, /valueKeys: \['var1', 'var2', 'var3'\]/)
  assert.match(conquerorBlock, /已回复/)
  assert.match(conquerorBlock, /生命值/)
  assert.doesNotMatch(conquerorBlock, /var2:\s*value\s*=>/)
})

test('cash back and bone plating have stat mappings', () => {
  const source = readInlineDetailSource()

  assert.match(source, /8321/)
  assert.match(source, /已返还/)
  assert.match(source, /金币/)
  assert.match(source, /8473/)
  assert.match(source, /已减免/)
  assert.match(source, /伤害/)
})

test('rune stat rows prefer metadata end-of-game descriptions', () => {
  const source = readInlineDetailSource()
  const statRowsBlock = readFunctionBlock(
    source,
    'function getRuneStatDisplayRows('
  )

  assert.match(source, /function getMetadataRuneStatRows/)
  assert.match(source, /function getPerkEndOfGameStatDescriptions/)
  assert.match(source, /endOfGameStatDescs/)
  assert.match(source, /endOfGameStatDesc/)
  assert.match(source, /getPerkAssetDetails/)
  assert.match(source, /@eogvar1@/)
  assert.match(source, /@eogvar2@/)
  assert.match(source, /@eogvar3@/)
  assert.match(source, /function getDefinedRuneStatRows/)
  assert.match(statRowsBlock, /metadataRows\.length/)
  assertOrdered(statRowsBlock, [
    'const metadataRows = getMetadataRuneStatRows(slot.id, selection)',
    'if (metadataRows.length) {',
    'return getDefinedRuneStatRows(slot.id, selection)'
  ])
})

test('metadata rune stat descriptions replace eog vars and reject unresolved placeholders', () => {
  const source = readInlineDetailSource()

  assert.match(source, /function formatPerkEndOfGameStatDescription/)
  assert.match(source, /\{\{\s*var1\s*\}\}/)
  assert.match(source, /\{var1\}/)
  assert.match(source, /function normalizeRuneStatDescriptionText/)
  assert.match(source, /@eogvar/)
  assert.match(source, /return ''/)
})

test('zero-only metadata rune stats are hidden', () => {
  const source = readInlineDetailSource()

  assert.match(source, /function hasPositiveRuneStatValue/)
  assert.match(source, /value > 0/)
  assert.match(source, /return \[\]/)
  assert.match(source, /selection\.var1/)
  assert.match(source, /selection\.var2/)
  assert.match(source, /selection\.var3/)
})

test('generic and empty stat labels are not rendered', () => {
  const source = readInlineDetailSource()
  const runesBlock = source.match(/<div v-else-if="activeTabValue === 'runes'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''

  assert.match(source, /RUNE_STAT_DEFINITIONS/)
  assert.match(source, /function getRuneStatDisplayRows/)
  assert.match(source, /function getRuneSelectionRecord/)
  assert.match(runesBlock, /v-if="getRuneStatDisplayRows\(player, slot\)\.length"/)
  assert.match(runesBlock, /class="rune-stat-line"/)
  assert.doesNotMatch(source, /收益 1|收益1|收益 2|收益2|收益 3|收益3/)
  assert.doesNotMatch(source, /暂无符文统计|暂无收益数据|RUNE_STATS_EMPTY_TEXT/)
  assert.doesNotMatch(runesBlock, /class="rune-stat-empty"|matchDetail\.runeStatsEmpty/)
  assert.doesNotMatch(runesBlock, />\s*var1\s*<|>\s*var2\s*<|>\s*var3\s*</)
  assert.doesNotMatch(source, /label:\s*['"`]var[123]['"`]|text:\s*['"`]var[123]['"`]/)
})

test('common rune stat definitions use sentence text', () => {
  const source = readInlineDetailSource()

  assert.match(source, /RUNE_STAT_DEFINITIONS/)
  assert.match(source, /9111/)
  assert.match(source, /8010/)
  assert.match(source, /8014/)
  assert.match(source, /已回复/)
  assert.match(source, /已获得/)
  assert.match(source, /已造成/)
  assert.match(source, /生命值/)
  assert.match(source, /金币/)
  assert.match(source, /额外伤害/)
})

test('inline detail uses rich asset tooltips for overview items and trait icons', () => {
  const source = readInlineDetailSource()
  const overviewBlock = source.match(/<div v-if="activeTabValue === 'overview'"[\s\S]*?<div v-else-if="activeTabValue === 'runes'"/)?.[0] || ''
  const runesBlock = source.match(/<div v-else-if="activeTabValue === 'runes'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''

  assert.match(source, /import AssetHoverTooltip from '@\/components\/common\/AssetHoverTooltip\.vue'/)
  assert.match(source, /getItemTooltipDetails/)
  assert.match(source, /getPerkTooltipDetails/)
  assert.match(source, /getAugmentTooltipDetails/)
  assert.match(source, /getSummonerSpellTooltipDetails/)
  assert.match(source, /type GameAssetTooltipDetails/)
  assert.match(source, /function getTraitTooltipDetails\(slot: TraitSlot\): GameAssetTooltipDetails \| null \{[\s\S]*slot\.kind === 'augment'[\s\S]*getAugmentTooltipDetails\(slot\.id\)[\s\S]*getPerkTooltipDetails\(slot\.id\)/)

  assert.match(overviewBlock, /class="spell-stack"[\s\S]*<AssetHoverTooltip[\s\S]*v-if="slot\.url && !slot\.empty && getSummonerSpellTooltipDetails\(slot\.id\)"[\s\S]*:details="getSummonerSpellTooltipDetails\(slot\.id\)!"/)
  assert.match(overviewBlock, /class="trait-pair"[\s\S]*<AssetHoverTooltip[\s\S]*v-if="slot\.url && !slot\.empty && getTraitTooltipDetails\(slot\)"[\s\S]*:details="getTraitTooltipDetails\(slot\)!"/)
  assert.match(overviewBlock, /class="item-row compact" aria-label="items"[\s\S]*v-for="slot in getPlayerItemSlots\(player\)"[\s\S]*<AssetHoverTooltip[\s\S]*v-if="slot\.url && !slot\.empty && slot\.itemId !== null"[\s\S]*:details="getItemTooltipDetails\(slot\.itemId\)!"/)
  assert.match(runesBlock, /class="spell-stack"[\s\S]*<AssetHoverTooltip[\s\S]*v-if="slot\.url && !slot\.empty && getSummonerSpellTooltipDetails\(slot\.id\)"[\s\S]*:details="getSummonerSpellTooltipDetails\(slot\.id\)!"/)
  assert.match(runesBlock, /class="trait-list"[\s\S]*<AssetHoverTooltip[\s\S]*v-if="slot\.url && !slot\.empty && getTraitTooltipDetails\(slot\)"[\s\S]*:details="getTraitTooltipDetails\(slot\)!"/)
  assert.doesNotMatch(source, /:title="getItemSlotLabel\(slot\)"/)
  assert.doesNotMatch(source, /:title="slot\.label"/)
  assert.match(overviewBlock, /class="item-row compact" aria-label="items"/)
  assert.match(overviewBlock, /:class="\{ empty: slot\.empty \}"/)
})

test('inline detail applies the same augment rarity classes in overview and runes tabs', () => {
  const source = readInlineDetailSource()
  const overviewBlock = source.match(/<div v-if="activeTabValue === 'overview'"[\s\S]*?<div v-else-if="activeTabValue === 'runes'"/)?.[0] || ''
  const runesBlock = source.match(/<div v-else-if="activeTabValue === 'runes'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''

  assert.equal(getAugmentRarityClass('kGold'), 'augment-rarity-gold')
  assert.equal(getAugmentRarityClass('kSilver'), 'augment-rarity-silver')
  assert.equal(getAugmentRarityClass('kPrismatic'), 'augment-rarity-prismatic')
  assert.match(source, /getAugmentRarityClass/)
  assert.match(source, /rarityClass\?: string/)
  assert.match(source, /rarityClass: getTraitRarityClass\(kind, id\)/)
  assert.match(source, /function getTraitRarityClass\(kind: TraitKind, id: number \| null\): string/)
  assert.match(source, /getAugmentRarityClass\(getAugmentAssetDetails\(id\)\?\.rarity\)/)
  assert.match(overviewBlock, /:class="\[`trait-\$\{slot\.kind\}`, slot\.rarityClass, \{ empty: slot\.empty \}\]"/)
  assert.match(runesBlock, /:class="\[`trait-\$\{slot\.kind\}`, slot\.rarityClass, \{ empty: slot\.empty \}\]"/)
  assert.match(overviewBlock, /<AssetHoverTooltip[\s\S]*v-if="slot\.url && !slot\.empty && getTraitTooltipDetails\(slot\)"[\s\S]*:details="getTraitTooltipDetails\(slot\)!"/)
  assert.match(runesBlock, /<AssetHoverTooltip[\s\S]*v-if="slot\.url && !slot\.empty && getTraitTooltipDetails\(slot\)"[\s\S]*:details="getTraitTooltipDetails\(slot\)!"/)
})

test('overview shows owned augments as a compact horizontal strip next to player identity', () => {
  const source = readInlineDetailSource()
  const overviewBlock = source.match(/<div v-if="activeTabValue === 'overview'"[\s\S]*?<div v-else-if="activeTabValue === 'runes'"/)?.[0] || ''
  const overviewAugmentBlock = source.match(/class="overview-augment-strip"[\s\S]*?<\/span>\s*<\/span>/)?.[0] || ''
  const augmentSlotsBlock = readFunctionBlock(
    source,
    'function getPlayerOverviewAugmentSlots(player: MatchDetailParticipant): TraitSlot[]'
  )

  assert.match(augmentSlotsBlock, /return getAugmentTraitSlots\(player\)\.filter\(slot => !slot\.empty && slot\.id !== null\)/)
  assert.match(overviewBlock, /class="player-copy player-name-wrap"[\s\S]*class="overview-augment-strip"/)
  assert.match(overviewBlock, /class="trait-pair"[\s\S]*v-if="!hasValidAugment\(player\)"[\s\S]*v-for="slot in getPlayerTraitSlots\(player\)\.slice\(0, 2\)"/)
  assert.match(overviewBlock, /class="overview-augment-strip"[\s\S]*v-if="getPlayerOverviewAugmentSlots\(player\)\.length"/)
  assert.match(overviewBlock, /v-for="slot in getPlayerOverviewAugmentSlots\(player\)"/)
  assert.match(overviewAugmentBlock, /class="overview-augment-slot"/)
  assert.match(overviewAugmentBlock, /:class="slot\.rarityClass"/)
  assert.match(overviewAugmentBlock, /<AssetHoverTooltip[\s\S]*v-if="slot\.url && !slot\.empty && getTraitTooltipDetails\(slot\)"[\s\S]*:details="getTraitTooltipDetails\(slot\)!"/)
  assert.doesNotMatch(overviewAugmentBlock, /slice\(0, 2\)|Array\.from\(\{ length: 6 \}/)
  assert.match(overviewBlock, /class="kda-cell"/)
  assert.match(overviewBlock, /class="metric-cell"/)
  assert.match(overviewBlock, /class="item-row compact" aria-label="items"/)
})

test('overview fixes augment strip column and truncates player names before augments', () => {
  const source = readInlineDetailSource()
  const overviewBlock = source.match(/<div v-if="activeTabValue === 'overview'"[\s\S]*?<div v-else-if="activeTabValue === 'runes'"/)?.[0] || ''
  const identityRule = source.match(/\.player-identity-main \{[\s\S]*?\n\}/)?.[0] || ''
  const identityAugmentRule = source.match(/\.player-identity-main\.with-augments \{[\s\S]*?\n\}/)?.[0] || ''
  const nameRule = source.match(/\.player-name-wrap \{[\s\S]*?\n\}/)?.[0] || ''
  const augmentStripRule = source.match(/\.overview-augment-strip \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(overviewBlock, /class="player-identity-main"[\s\S]*'with-augments': getPlayerOverviewAugmentSlots\(player\)\.length/)
  assert.match(overviewBlock, /class="player-copy player-name-wrap"/)
  assert.match(identityRule, /display:\s*grid/)
  assert.match(identityRule, /min-width:\s*0/)
  assert.match(identityAugmentRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--overview-augment-strip-width\)/)
  assert.match(nameRule, /overflow:\s*hidden/)
  assert.match(nameRule, /text-overflow:\s*ellipsis/)
  assert.match(nameRule, /white-space:\s*nowrap/)
  assert.match(augmentStripRule, /width:\s*var\(--overview-augment-strip-width\)/)
  assert.match(augmentStripRule, /flex:\s*0 0 var\(--overview-augment-strip-width\)/)
  assert.match(augmentStripRule, /z-index:\s*2/)
})

test('overview damage and taken metric tracks use a shared shortened width', () => {
  const source = readInlineDetailSource()
  const metricTrackRule = source.match(/\.metric-track \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /--metric-bar-width:\s*7[0-9]%/)
  assert.match(metricTrackRule, /width:\s*var\(--metric-bar-width\)/)
  assert.match(source, /\.damage-bar \{[\s\S]*background:/)
  assert.match(source, /\.taken-bar \{[\s\S]*background:/)
  assert.doesNotMatch(source, /(?:ARAM|CHERRY)[\s\S]{0,120}--metric-bar-width|--metric-bar-width[\s\S]{0,120}(?:ARAM|CHERRY)/)
})

test('inline detail overview and rune tooltip details share structured price and non-id rarity rules', () => {
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
    perks: {
      8005: {
        id: 8005,
        name: '强攻',
        shortDesc: '连续命中。'
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

  const source = readInlineDetailSource()
  const overviewBlock = source.match(/<div v-if="activeTabValue === 'overview'"[\s\S]*?<div v-else-if="activeTabValue === 'runes'"/)?.[0] || ''
  const runesBlock = source.match(/<div v-else-if="activeTabValue === 'runes'"[\s\S]*?<div v-else-if="activeTabValue === 'chart'"/)?.[0] || ''

  assert.match(overviewBlock, /:details="getItemTooltipDetails\(slot\.itemId\)!"/)
  assert.match(overviewBlock, /:details="getTraitTooltipDetails\(slot\)!"/)
  assert.match(runesBlock, /:details="getTraitTooltipDetails\(slot\)!"/)
  assert.equal(getItemTooltipDetails(6610)?.priceText, '3100 G')
  assert.doesNotMatch(getItemTooltipDetails(6610)?.priceText || '', /装备 6610/)
  assert.notEqual(getAugmentTooltipDetails(2005)?.rarityLabel || getAugmentTooltipDetails(2005)?.subtitle, '海克斯强化 2005')
})

test('chart tab uses an honest empty state when timeline frames are unavailable', () => {
  const source = readInlineDetailSource()

  assert.match(source, /activeTabValue === 'chart'/)
  assert.doesNotMatch(source, /const hasTimelineData = computed\(\(\) => false\)/)
  assert.match(source, /matchDetail\.timelineUnavailable/)
  assert.match(source, /matchDetail\.timelineLoading/)
  assert.match(source, /matchDetail\.timelineRankedOnly/)
  assert.match(source, /staticTeamGoldDiff/)
  assert.doesNotMatch(source, /polyline|fakeTimeline|mockTimeline|sampleTimeline/)
})

test('inline detail only renders lane positions for lane-based Summoner Rift modes', () => {
  const source = readInlineDetailSource()

  assert.match(source, /function isLaneBasedMode\(match: MatchHistory \| GameDetail \| null \| undefined\): boolean/)
  assert.match(source, /queueId/)
  assert.match(source, /gameMode/)
  assert.match(source, /queueName/)
  assert.match(source, /450/)
  assert.match(source, /ARAM/)
  assert.match(source, /CHERRY/)
  assert.match(source, /大乱斗/)
  assert.match(source, /海克斯大乱斗/)
  assert.match(source, /斗魂/)
  assert.match(source, /竞技场/)
  assert.match(source, /无限火力/)
  assert.match(source, /克隆/)
  assert.match(source, /RANKED_SOLO_5x5/)
  assert.match(source, /RANKED_FLEX_SR/)
  assert.match(source, /CLASSIC/)
  assert.match(source, /召唤师峡谷/)
  assert.match(source, /function getDisplayPosition\(player: MatchDetailParticipant\): string/)
  assert.match(source, /if \(!isLaneBasedMode\(displayGameDetail\.value \|\| props\.matchHistory\)\) \{[\s\S]*return ''/)
  assert.match(source, /v-if="getDisplayPosition\(player\)"/)
  assert.doesNotMatch(source, /\{\{ getPositionLabel\(player\) \}\}/)
})

test('inline detail does not render history player tags or empty-match badges', () => {
  const source = readInlineDetailSource()

  assert.doesNotMatch(source, /UserTagBadgeList/)
  assert.doesNotMatch(source, /userTagSummaries/)
  assert.doesNotMatch(source, /getPlayerSummary/)
  assert.doesNotMatch(source, /record-status/)
  assert.doesNotMatch(source, /badge\.empty|暂无对局|No Matches/)
})

test('kill participation label is localized and guards zero team kills', () => {
  const source = readInlineDetailSource()
  const zh = readFileSync(new URL('../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
  const en = readFileSync(new URL('../../i18n/locales/en-US.ts', import.meta.url), 'utf8')

  assert.match(source, /t\('matchDetail\.killParticipation'\) \}\} \{\{ getKillParticipation\(player, team\) \}\}/)
  assert.doesNotMatch(source, />KP\s*\{\{ getKillParticipation/)
  assert.match(source, /if \(!team\.totals\.kills\) \{[\s\S]*return '--'/)
  assert.doesNotMatch(source, /NaN|Infinity/)
  assert.match(zh, /'matchDetail\.killParticipation': '参团'/)
  assert.match(en, /'matchDetail\.killParticipation': '(KP|Kill Participation)'/)
})

test('inline detail keeps a compact gap below the match card', () => {
  const source = readInlineDetailSource()
  const inlineStyleBlock = source.match(/\.inline-match-detail \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /class="inline-match-detail"/)
  assert.match(inlineStyleBlock, /margin-top:\s*8px/)
  assert.doesNotMatch(inlineStyleBlock, /margin-top:\s*-/)
})

test('player rows show segmented raw KDA score and localized participation without ratio suffix', () => {
  const source = readInlineDetailSource()
  const kdaCellBlock = source.match(/<div class="kda-cell">[\s\S]*?<\/div>/)?.[0] || ''

  assert.match(source, /function getPlayerKills\(player: MatchDetailParticipant\): number/)
  assert.match(source, /function getPlayerDeaths\(player: MatchDetailParticipant\): number/)
  assert.match(source, /function getPlayerAssists\(player: MatchDetailParticipant\): number/)
  assert.match(kdaCellBlock, /class="player-kda-score"/)
  assert.match(kdaCellBlock, /class="kda-kills"[\s\S]*getPlayerKills\(player\)/)
  assert.match(kdaCellBlock, /class="kda-deaths"[\s\S]*getPlayerDeaths\(player\)/)
  assert.match(kdaCellBlock, /class="kda-assists"[\s\S]*getPlayerAssists\(player\)/)
  assert.match(kdaCellBlock, /class="kda-separator">\/<\/span>/)
  assert.match(kdaCellBlock, /t\('matchDetail\.killParticipation'\)[\s\S]*getKillParticipation\(player, team\)/)
  assert.doesNotMatch(kdaCellBlock, /\(\d+(?:\.\d+)?\)/)
  assert.doesNotMatch(kdaCellBlock, /\{\{ getKdaScoreText\(player\) \}\}/)
  assert.doesNotMatch(source, /\$\{kills\}\/\$\{deaths\}\/\$\{assists\} \(\$\{kda\}\)/)
})

test('team headers show compact team KDA and objective icon strip without team gold', () => {
  const source = readInlineDetailSource()
  const headerBlock = source.match(/<header class="team-detail-header">[\s\S]*?<\/header>/)?.[0] || ''

  assert.doesNotMatch(headerBlock, /KDA/)
  assert.doesNotMatch(headerBlock, /goldEarned|common\.gold|金币/)
  assert.doesNotMatch(headerBlock, /65\.8k|team-gold-summary|getTeamGold|aria-label="team gold"/)
  assert.match(headerBlock, /class="team-kda-summary"/)
  assert.match(headerBlock, /\{\{ getTeamKda\(team\.totals\) \}\}/)
  assert.match(headerBlock, /class="team-header-resources"/)
  assert.match(headerBlock, /v-for="item in getTeamObjectiveItems\(team\.teamId\)"/)
  assert.match(headerBlock, /class="objective-pill compact-objective-pill"/)
  assert.match(headerBlock, /class="objective-icon objective-icon-img"[\s\S]*:src="icon\.iconUrl"/)
  assert.doesNotMatch(headerBlock, /team-structure-stats|team-structure-chip|getTeamStructureItems/)
  assert.doesNotMatch(headerBlock, /\{\{ item\.label \}\}/)
  assert.match(headerBlock, /\{\{ getObjectiveCountText\(item\) \}\}/)
  assert.match(source, /function getTeamKda\(totals: TeamStatsSummary\): string \{[\s\S]*return `\$\{totals\.kills\}\/\$\{totals\.deaths\}\/\$\{totals\.assists\}`/)
  assert.doesNotMatch(source, /function getTeamGold\(totals: TeamStatsSummary\)/)
  assert.doesNotMatch(source, /interface TeamStructureItem|function getTeamStructureItems/)
  assert.doesNotMatch(headerBlock, /team-kills|team-deaths|team-assists|team-kda-separator/)
  assert.doesNotMatch(source, /\.team-kills|\.team-deaths|\.team-assists|\.team-kda-separator/)
  assert.match(source, /class="number-cell gold-cell"/)
})

test('ranked overview team header renders draft bans and objective resources in the title row', () => {
  const source = readInlineDetailSource()
  const headerBlock = source.match(/<header class="team-detail-header">[\s\S]*?<\/header>/)?.[0] || ''

  assert.match(source, /const showDraftAndObjectiveSummary = computed\(\(\) => isRankedMode\(props\.matchHistory\) \|\| isRankedMode\(displayGameDetail\.value\)\)/)
  assert.match(source, /interface TeamSection \{[\s\S]*teamId: number/)
  assert.match(source, /createTeamSection\('blue', 100/)
  assert.match(source, /createTeamSection\('red', 200/)
  assert.match(headerBlock, /class="team-header-main"[\s\S]*<strong>[\s\S]*\{\{ team\.result \}\}[\s\S]*\{\{ team\.label \}\}[\s\S]*<\/strong>/)
  assert.match(headerBlock, /class="team-header-summary"[\s\S]*class="team-kda-summary"[\s\S]*\{\{ getTeamKda\(team\.totals\) \}\}[\s\S]*class="team-header-resources"[\s\S]*getTeamObjectiveItems\(team\.teamId\)/)
  assert.match(headerBlock, /v-if="showDraftAndObjectiveSummary && getTeamObjectiveItems\(team\.teamId\)\.length"[\s\S]*class="team-header-resources"[\s\S]*class="team-objective-icons"/)
  assert.match(headerBlock, /v-if="showDraftAndObjectiveSummary && getTeamBans\(team\.teamId\)\.length"[\s\S]*class="team-draft-row"/)
  assert.match(headerBlock, /class="draft-objective-label"[\s\S]*禁用/)
  assert.match(headerBlock, /v-if="getTeamBans\(team\.teamId\)\.length"[\s\S]*class="team-ban-icons"/)
  assert.match(headerBlock, /v-for="championId in getTeamBans\(team\.teamId\)"[\s\S]*class="ban-champion-icon"[\s\S]*:src="getChampionIconUrl\(championId\)"/)
  assert.match(source, /function getTeamBans\(teamId: number\): number\[\] \{[\s\S]*normalizePositiveInteger[\s\S]*slice\(0, 5\)/)
  assert.match(source, /\.ban-champion-icon::after \{[\s\S]*transform:\s*rotate\(-45deg\)/)
})

test('team header keeps title, KDA, objectives, and bans in one left-start flow', () => {
  const source = readInlineDetailSource()
  const headerBlock = source.match(/<header class="team-detail-header">[\s\S]*?<\/header>/)?.[0] || ''
  const mainRule = source.match(/\.team-header-main \{[\s\S]*?\n\}/)?.[0] || ''
  const summaryRule = source.match(/\.team-header-summary \{[\s\S]*?\n\}/)?.[0] || ''
  const draftRule = source.match(/\.team-draft-row,\s*\n\.team-draft-objective-row \{[\s\S]*?\n\}/)?.[0] || ''
  const iconRule = source.match(/\.team-ban-icons,\s*\n\.team-objective-icons \{[\s\S]*?\n\}/)?.[0] || ''
  const orderedSelectors = [
    '<strong>{{ team.result }}',
    'class="team-kda-summary"',
    'class="team-header-resources"',
    'class="team-draft-row"'
  ]
  const orderedIndexes = orderedSelectors.map(selector => headerBlock.indexOf(selector))

  assert.ok(orderedIndexes.every(index => index >= 0), `missing selector order: ${orderedIndexes.join(',')}`)
  assert.deepEqual([...orderedIndexes].sort((left, right) => left - right), orderedIndexes)
  assert.match(headerBlock, /class="team-header-summary"[\s\S]*class="team-kda-summary"[\s\S]*class="team-header-resources"[\s\S]*class="team-draft-row"/)
  assert.doesNotMatch(headerBlock, /team-gold-summary|getTeamGold/)
  assert.doesNotMatch(headerBlock, /team-structure-stats|team-structure-chip/)
  assert.doesNotMatch(headerBlock, /team-header-side|header-actions/)
  assert.match(mainRule, /justify-content:\s*flex-start/)
  assert.doesNotMatch(mainRule, /justify-content:\s*space-between/)
  assert.match(summaryRule, /justify-content:\s*flex-start/)
  assert.doesNotMatch(summaryRule, /margin-left:\s*auto|justify-content:\s*flex-end|text-align:\s*right/)
  assert.match(draftRule, /justify-content:\s*flex-start/)
  assert.match(iconRule, /justify-content:\s*flex-start/)
})

test('objective header icons use non-empty distinct URLs for non-generic objectives', () => {
  resetGameAssetResolverForTest()

  const dragonUrl = getObjectiveIconUrl('dragon')
  const baronUrl = getObjectiveIconUrl('baron')
  const heraldUrl = getObjectiveIconUrl('herald')
  const voidgrubUrl = getObjectiveIconUrl('voidgrub')
  const infernalUrl = getObjectiveIconUrl('infernal')
  const mountainUrl = getObjectiveIconUrl('mountain')
  const oceanUrl = getObjectiveIconUrl('ocean')
  const cloudUrl = getObjectiveIconUrl('cloud')
  const hextechUrl = getObjectiveIconUrl('hextech')
  const chemtechUrl = getObjectiveIconUrl('chemtech')
  const turretUrl = getObjectiveIconUrl('turret')
  const inhibitorUrl = getObjectiveIconUrl('inhibitor')
  const turretPlateUrl = getObjectiveIconUrl('turretPlate')
  const soulHextechUrl = getObjectiveIconUrl('soul-hextech')
  const soulChemtechUrl = getObjectiveIconUrl('soul-chemtech')

  for (const url of [
    heraldUrl,
    voidgrubUrl,
    infernalUrl,
    mountainUrl,
    oceanUrl,
    cloudUrl,
    hextechUrl,
    chemtechUrl,
    turretUrl,
    inhibitorUrl,
    turretPlateUrl,
    soulHextechUrl,
    soulChemtechUrl
  ]) {
    assert.ok(url)
    assert.doesNotMatch(url, /plugins\/rcp-fe-lol-match-history\/global\/default/i)
  }
  for (const url of [infernalUrl, mountainUrl, oceanUrl, cloudUrl, hextechUrl, chemtechUrl, soulHextechUrl, soulChemtechUrl]) {
    assert.doesNotMatch(url, /dragon_square_(?:hextech|chemtech)/i)
    assert.doesNotMatch(url, /(?:fire|earth|water|air)-100\.png/i)
  }
  assert.doesNotMatch(voidgrubUrl, /right_icons_grub/i)
  assert.notEqual(hextechUrl, dragonUrl)
  assert.notEqual(chemtechUrl, dragonUrl)
  assert.notEqual(voidgrubUrl, heraldUrl)
  assert.notEqual(voidgrubUrl, baronUrl)
})

test('draft and objective summary matches numeric and string team ids', () => {
  const source = readInlineDetailSource()
  const objectiveSummaryBlock = source.match(/function getTeamObjectiveSummary\(teamId: number\): TeamObjectiveSummary \| null \{[\s\S]*?\n\}/)?.[0] || ''
  const banSummaryBlock = source.match(/function getTeamBanSummary\(teamId: number\): TeamBanSummary \| null \{[\s\S]*?\n\}/)?.[0] || ''
  const normalizeNumberBlock = source.match(/function normalizeFiniteNumber\(value: unknown\): number \| null \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(source, /function normalizeTeamId\(value: unknown\): number \| null/)
  assert.match(normalizeNumberBlock, /typeof value === 'string'[\s\S]*Number\(value\.trim\(\)\)/)
  assert.match(objectiveSummaryBlock, /normalizeTeamId\(summary\?\.teamId\) === teamId/)
  assert.match(banSummaryBlock, /normalizeTeamId\(summary\?\.teamId\) === teamId/)
})

test('objective display builder keeps required header order and bans after objectives', () => {
  const source = readInlineDetailSource()
  const headerBlock = source.match(/<header class="team-detail-header">[\s\S]*?<\/header>/)?.[0] || ''
  const objectiveBuilderBlock = readFunctionBlock(
    source,
    'function buildObjectiveDisplayItems(teamId: number, summary: TeamObjectiveSummary): ObjectiveDisplayItem[]'
  )

  assertOrdered(objectiveBuilderBlock, [
    "addStructureObjectiveItem(items, teamId, 'turret', 'turret', '塔', readStructureObjectiveCount(teamId, summary, 'turret'))",
    "addStructureObjectiveItem(items, teamId, 'inhibitor', 'inhibitor', '水晶', readStructureObjectiveCount(teamId, summary, 'inhibitor'))",
    "addStructureObjectiveItem(items, teamId, 'turret-plate', 'turretPlate', '镀层', readStructureObjectiveCount(teamId, summary, 'turretPlate'))",
    "addObjectiveItem(items, teamId, 'baron', 'baron', '男爵', readObjectiveCount(summary.baronKills))",
    "addObjectiveItem(items, teamId, 'elder', 'elder', '远古龙', readObjectiveCount(summary.elderDragonKills))",
    'addDragonObjectiveItems(items, teamId, summary)',
    "addObjectiveItem(items, teamId, 'herald', 'herald', '先锋', readObjectiveCount(summary.heraldKills))",
    "addObjectiveItem(items, teamId, 'voidgrub', 'voidgrub', '虚空巢虫', readObjectiveCount(summary.voidGrubKills))"
  ])
  assertOrdered(headerBlock, [
    'class="team-header-resources"',
    'class="team-draft-row"'
  ])
})

test('structure objective counts fall back from summary to objective events and participant stats', () => {
  const source = readInlineDetailSource()
  const countBlock = readFunctionBlock(
    source,
    "function readStructureObjectiveCount(teamId: number, summary: TeamObjectiveSummary, sourceKey: StructureObjectiveSourceKey): number | null"
  )
  const eventCountBlock = readFunctionBlock(
    source,
    'function countObjectiveEvents(summary: TeamObjectiveSummary, teamId: number, kind: TeamObjectiveEvent[\'kind\']): number | null'
  )
  const participantFallbackBlock = readFunctionBlock(
    source,
    'function sumTeamParticipantObjectiveStats(teamId: number, fieldKeys: string[]): number | null'
  )

  assert.match(countBlock, /readStructureSummaryObjectiveCount\(summary, source\)/)
  assert.match(countBlock, /countObjectiveEvents\(summary, teamId, source\.eventKind\)/)
  assert.match(countBlock, /sumTeamParticipantObjectiveStats\(teamId, source\.directStatKeys\)/)
  assert.match(countBlock, /sumTeamParticipantObjectiveStats\(teamId, source\.lastFallbackStatKeys\)/)
  assert.match(eventCountBlock, /matchesObjectiveEvent\(event, \{ kind \}, teamId\)/)
  assert.match(participantFallbackBlock, /for \(const player of allPlayers\.value\)[\s\S]*normalizeTeamId\(player\.teamId\) !== teamId/)
  assert.match(participantFallbackBlock, /readParticipantObjectiveStat\(player, fieldKeys\)/)
  assert.match(source, /turret:[\s\S]*summaryKey: 'turretKills'[\s\S]*eventKind: 'turret'[\s\S]*directStatKeys: \['turretKills'\][\s\S]*lastFallbackStatKeys: \['turretTakedowns'\]/)
  assert.match(source, /inhibitor:[\s\S]*summaryKey: 'inhibitorKills'[\s\S]*eventKind: 'inhibitor'[\s\S]*directStatKeys: \['inhibitorKills'\][\s\S]*lastFallbackStatKeys: \['inhibitorTakedowns'\]/)
  assert.match(source, /turretPlate:[\s\S]*summaryKey: 'turretPlateKills'[\s\S]*summaryKeys: \['turretPlateKills', 'turretPlatesTaken'\][\s\S]*eventKind: 'turretPlate'[\s\S]*directStatKeys: \['turretPlatesTaken'\][\s\S]*lastFallbackStatKeys: \[\]/)
  assert.match(source, /function readParticipantObjectiveField\(player: MatchDetailParticipant, key: string\): number \| null[\s\S]*readStatNumber\(player, key\)[\s\S]*player\.stats\?\.challenges/)
})

test('turret plate counts read summary aliases before falling back to participant stats and events', () => {
  const source = readInlineDetailSource()
  const apiSource = readApiSource()
  const countBlock = readFunctionBlock(
    source,
    "function readStructureObjectiveCount(teamId: number, summary: TeamObjectiveSummary, sourceKey: StructureObjectiveSourceKey): number | null"
  )
  const summaryBlock = readFunctionBlock(
    source,
    'function readStructureSummaryObjectiveCount(summary: TeamObjectiveSummary, source: StructureObjectiveSource): number | null'
  )
  const participantFieldBlock = readFunctionBlock(
    source,
    'function readParticipantObjectiveField(player: MatchDetailParticipant, key: string): number | null'
  )
  const countTextBlock = readFunctionBlock(
    source,
    'function getObjectiveCountText(item: ObjectiveDisplayItem): string'
  )

  assert.match(apiSource, /export interface TeamObjectiveSummary \{[\s\S]*turretPlateKills\?: number[\s\S]*turretPlatesTaken\?: number/)
  assert.match(source, /type StructureObjectiveSummaryKey = 'turretKills' \| 'inhibitorKills' \| 'turretPlateKills' \| 'turretPlatesTaken'/)
  assert.match(source, /summaryKeys\?: StructureObjectiveSummaryKey\[\]/)
  assert.match(source, /turretPlate:[\s\S]*summaryKey: 'turretPlateKills'[\s\S]*summaryKeys: \['turretPlateKills', 'turretPlatesTaken'\]/)
  assert.match(summaryBlock, /const keys = source\.summaryKeys \?\? \[source\.summaryKey\]/)
  assert.match(summaryBlock, /let knownZeroCount: number \| null = null/)
  assert.match(summaryBlock, /readNullableObjectiveCount\(summary\[key\]\)/)
  assert.match(summaryBlock, /if \(count !== null && count > 0\) \{[\s\S]*return count/)
  assert.match(summaryBlock, /return knownZeroCount/)
  assert.match(countBlock, /const summaryCount = readStructureSummaryObjectiveCount\(summary, source\)/)
  assert.match(countBlock, /if \(sourceKey === 'turretPlate'\) \{[\s\S]*summaryCount !== null && summaryCount > 0[\s\S]*return summaryCount/)
  assert.doesNotMatch(countBlock, /sourceKey === 'turretPlate' && summaryCount !== null\) \{[\s\S]*return summaryCount/)
  assert.match(countBlock, /const directStatCount = sumTeamParticipantObjectiveStats\(teamId, source\.directStatKeys\)/)
  assert.match(participantFieldBlock, /const statsValue = readStatNumber\(player, key\)/)
  assert.match(participantFieldBlock, /const challengeValue = normalizeFiniteNumber\(challenges\?\.\[key\]\)/)
  assert.match(countBlock, /directStatCount !== null && directStatCount > 0[\s\S]*return directStatCount/)
  assert.match(countBlock, /eventCount !== null && eventCount > 0[\s\S]*return eventCount/)
  assert.match(countTextBlock, /return item\.count === null \? '--' : String\(item\.count\)/)
})

test('missing turret plate fields stay unknown instead of rendering a synthetic zero', () => {
  const source = readInlineDetailSource()
  const headerBlock = source.match(/<header class="team-detail-header">[\s\S]*?<\/header>/)?.[0] || ''
  const countBlock = readFunctionBlock(
    source,
    "function readStructureObjectiveCount(teamId: number, summary: TeamObjectiveSummary, sourceKey: StructureObjectiveSourceKey): number | null"
  )
  const structureItemBlock = readFunctionBlock(
    source,
    'function addStructureObjectiveItem('
  )

  assert.match(countBlock, /readStructureSummaryObjectiveCount\(summary, source\)/)
  assert.match(countBlock, /return null/)
  assert.doesNotMatch(countBlock, /return sumTeamParticipantObjectiveStats\(teamId, source\.lastFallbackStatKeys\)/)
  assert.match(structureItemBlock, /count: number \| null/)
  assert.match(structureItemBlock, /formatObjectiveTitle/)
  assert.match(headerBlock, /\{\{ getObjectiveCountText\(item\) \}\}/)
  assert.doesNotMatch(headerBlock, /\{\{ item\.count \}\}/)
  assert.match(source, /function readNullableObjectiveCount\(value: unknown\): number \| null/)
  assert.match(source, /turretPlate:[\s\S]*summaryKeys: \['turretPlateKills', 'turretPlatesTaken'\][\s\S]*directStatKeys: \['turretPlatesTaken'\][\s\S]*lastFallbackStatKeys: \[\]/)
})

test('turret plate display uses participant stat total when summary zero is less trustworthy', () => {
  const gameDetail = {
    participants: [
      { participantId: 1, teamId: 100, stats: { turretPlatesTaken: 2 } },
      { participantId: 2, teamId: 100, stats: { turretPlatesTaken: 1 } },
      { participantId: 3, teamId: 100, stats: { turretPlatesTaken: 3 } },
      { participantId: 6, teamId: 200, stats: { turretPlatesTaken: 4 } }
    ],
    teamObjectives: [
      {
        teamId: 100,
        turretPlateKills: 0
      }
    ]
  }
  const summary = (gameDetail.teamObjectives[0] as unknown) as Record<string, unknown>
  const harness = createObjectiveCountHarness(gameDetail)

  const count = harness.readStructureObjectiveCount(100, summary, 'turretPlate')

  assert.equal(count, 6)
  assert.equal(harness.formatObjectiveTitle('plate', count), 'plate x6')
})

test('turret plate display uses a positive summary alias before treating another alias zero as final', () => {
  const gameDetail = {
    participants: [
      { participantId: 1, teamId: 100, stats: {} }
    ],
    teamObjectives: [
      {
        teamId: 100,
        turretPlateKills: 0,
        turretPlatesTaken: 6
      }
    ]
  }
  const summary = (gameDetail.teamObjectives[0] as unknown) as Record<string, unknown>
  const harness = createObjectiveCountHarness(gameDetail)

  const count = harness.readStructureObjectiveCount(100, summary, 'turretPlate')

  assert.equal(count, 6)
  assert.equal(harness.formatObjectiveTitle('plate', count), 'plate x6')
})

test('turret plate display prefers positive timeline events over a known zero summary', () => {
  const gameDetail = {
    participants: [
      { participantId: 1, teamId: 100, stats: {} }
    ],
    teamObjectives: [
      {
        teamId: 100,
        turretPlateKills: 0,
        objectiveEvents: [
          { kind: 'turretPlate', teamId: 100 },
          { kind: 'turretPlate', teamId: 100 },
          { kind: 'turretPlate', teamId: 100 }
        ]
      }
    ]
  }
  const summary = (gameDetail.teamObjectives[0] as unknown) as Record<string, unknown>
  const harness = createObjectiveCountHarness(gameDetail)

  const count = harness.readStructureObjectiveCount(100, summary, 'turretPlate')

  assert.equal(count, 3)
  assert.equal(harness.formatObjectiveTitle('plate', count), 'plate x3')
})

test('turret plate display falls back to objective events when summary and participant stats are unknown', () => {
  const gameDetail = {
    participants: [
      { participantId: 1, teamId: 100, stats: {} },
      { participantId: 2, teamId: 100, stats: {} },
      { participantId: 3, teamId: 100, stats: {} }
    ],
    teamObjectives: [
      {
        teamId: 100,
        turretPlateKills: null,
        objectiveEvents: [
          { kind: 'turretPlate', teamId: 100 },
          { kind: 'turretPlate', teamId: 100 },
          { kind: 'turretPlate', teamId: 100 }
        ]
      }
    ]
  }
  const summary = (gameDetail.teamObjectives[0] as unknown) as Record<string, unknown>
  const harness = createObjectiveCountHarness(gameDetail)

  const count = harness.readStructureObjectiveCount(100, summary, 'turretPlate')

  assert.equal(count, 3)
  assert.equal(harness.formatObjectiveTitle('plate', count), 'plate x3')
})

test('turret plate display keeps all unknown sources as an unknown count', () => {
  const gameDetail = {
    participants: [
      { participantId: 1, teamId: 100, stats: {} },
      { participantId: 2, teamId: 100, stats: {} }
    ],
    teamObjectives: [
      {
        teamId: 100
      }
    ]
  }
  const summary = (gameDetail.teamObjectives[0] as unknown) as Record<string, unknown>
  const harness = createObjectiveCountHarness(gameDetail)

  const count = harness.readStructureObjectiveCount(100, summary, 'turretPlate')

  assert.equal(count, null)
  assert.equal(harness.getObjectiveCountText({ count }), '--')
})

test('turret plate display ignores unrelated objective events instead of rendering zero', () => {
  const gameDetail = {
    participants: [
      { participantId: 1, teamId: 100, stats: {} },
      { participantId: 2, teamId: 100, stats: {} }
    ],
    teamObjectives: [
      {
        teamId: 100,
        objectiveEvents: [
          { kind: 'dragon', teamId: 100 },
          { kind: 'voidGrub', teamId: 100 }
        ]
      }
    ]
  }
  const summary = (gameDetail.teamObjectives[0] as unknown) as Record<string, unknown>
  const harness = createObjectiveCountHarness(gameDetail)

  const count = harness.readStructureObjectiveCount(100, summary, 'turretPlate')

  assert.equal(count, null)
  assert.equal(harness.getObjectiveCountText({ count }), '--')
})

test('structure objective tooltips use actor ownership before event team id and fall back to participant stats', () => {
  const source = readInlineDetailSource()
  const tooltipBlock = readFunctionBlock(
    source,
    'function getObjectiveTooltipGroups(teamId: number, itemKey: string, itemLabel: string): ObjectiveTooltipGroup[]'
  )
  const matchesBlock = readFunctionBlock(
    source,
    'function matchesObjectiveEvent('
  )
  const ownerBlock = readFunctionBlock(
    source,
    'function getObjectiveEventOwnerTeamId(event: TeamObjectiveEvent): number | null'
  )
  const participantGroupsBlock = readFunctionBlock(
    source,
    'function getParticipantObjectiveTooltipGroups(teamId: number, itemKey: string, itemLabel: string): ObjectiveTooltipGroup[]'
  )

  assert.match(tooltipBlock, /getParticipantObjectiveTooltipGroups\(teamId, itemKey, itemLabel\)/)
  assert.match(matchesBlock, /getObjectiveEventOwnerTeamId\(event\)/)
  assert.doesNotMatch(matchesBlock, /eventTeamId !== null && eventTeamId !== teamId/)
  assert.match(ownerBlock, /event\.participantId/)
  assert.match(ownerBlock, /participant\?\.teamId/)
  assert.match(ownerBlock, /event\.teamId/)
  assert.match(participantGroupsBlock, /getObjectiveParticipantStatKeys\(itemKey\)/)
  assert.match(participantGroupsBlock, /readParticipantObjectiveStat\(player, fieldKeys\)/)
  assert.match(source, /turret:[\s\S]*directStatKeys: \['turretKills'\]/)
  assert.match(source, /inhibitor:[\s\S]*directStatKeys: \['inhibitorKills'\]/)
  assert.match(source, /turretPlate:[\s\S]*directStatKeys: \['turretPlatesTaken'\]/)
})

test('ranked overview objective pills render structure icon counts and keep an inline svg fallback', () => {
  const source = readInlineDetailSource()
  const headerBlock = source.match(/<header class="team-detail-header">[\s\S]*?<\/header>/)?.[0] || ''
  const objectiveBuilderBlock = readFunctionBlock(
    source,
    'function buildObjectiveDisplayItems(teamId: number, summary: TeamObjectiveSummary): ObjectiveDisplayItem[]'
  )
  const tooltipActorsRule = source.match(/\.objective-tooltip-actors \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(headerBlock, /v-if="showDraftAndObjectiveSummary && getTeamObjectiveItems\(team\.teamId\)\.length"[\s\S]*class="team-header-resources"[\s\S]*class="team-objective-icons"/)
  assert.match(headerBlock, /v-for="item in getTeamObjectiveItems\(team\.teamId\)"[\s\S]*class="objective-pill compact-objective-pill"/)
  assert.doesNotMatch(headerBlock, /:title="item\.title"|title=/)
  assert.match(headerBlock, /:aria-label="item\.title"/)
  assert.match(headerBlock, /tabindex="0"/)
  assert.match(headerBlock, /v-for="icon in getObjectiveItemIcons\(item\)"[\s\S]*v-if="shouldUseObjectiveIconImage\(icon\)"[\s\S]*class="objective-icon objective-icon-img"[\s\S]*:src="icon\.iconUrl"/)
  assert.match(headerBlock, /@error="handleObjectiveIconLoadFailed\(\$event, icon\.key\)"/)
  assert.match(headerBlock, /v-else[\s\S]*class="objective-icon objective-fallback-icon"/)
  assert.match(headerBlock, /<svg[\s\S]*viewBox="0 0 16 16"[\s\S]*aria-hidden="true"[\s\S]*focusable="false"/)
  assert.match(headerBlock, /<strong[\s\S]*v-if="item\.showCount"[\s\S]*class="objective-count"[\s\S]*\{\{ getObjectiveCountText\(item\) \}\}/)
  assert.match(headerBlock, /class="objective-tooltip"[\s\S]*role="tooltip"[\s\S]*v-for="group in item\.tooltipGroups"/)
  assert.match(headerBlock, /class="objective-tooltip-title"[\s\S]*\{\{ item\.title \}\}/)
  assert.match(headerBlock, /class="objective-tooltip-avatar"[\s\S]*:src="getChampionIconUrl\(group\.championId\)"/)
  assert.match(headerBlock, /class="objective-tooltip-count"[\s\S]*group\.count/)
  assert.match(tooltipActorsRule, /flex-direction:\s*column/)
  assert.match(tooltipActorsRule, /align-items:\s*flex-start/)
  assert.doesNotMatch(headerBlock, /<AssetHoverTooltip/)
  assert.doesNotMatch(headerBlock, /class="objective-pill compact-objective-pill"[\s\S]*\{\{ item\.label \}\}/)
  assert.doesNotMatch(headerBlock, /class="team-structure-chip"[\s\S]*\{\{ item\.label \}\}[\s\S]*\{\{ item\.count \}\}/)
  assert.doesNotMatch(headerBlock, /x\{\{ item\.count \}\}|男爵x|小龙x/)
  assert.match(source, /import \{[\s\S]*getObjectiveIconUrl/)
  assert.match(source, /type ObjectiveIconKind/)
  assert.match(source, /turretKills/)
  assert.match(source, /turretPlateKills/)
  assert.match(source, /inhibitorKills/)
  assert.match(source, /objectiveEvents/)
  assert.match(source, /baronKills/)
  assert.match(source, /heraldKills/)
  assert.match(source, /voidGrubKills/)
  assert.match(source, /dragonKills/)
  assert.match(source, /dragonKillsByType/)
  assert.match(source, /elderDragonKills/)
  assert.match(source, /interface ObjectiveDisplayItem \{[\s\S]*count: number \| null[\s\S]*showCount: boolean[\s\S]*title: string[\s\S]*tooltipGroups: ObjectiveTooltipGroup\[\]/)
  assert.match(source, /interface ObjectiveTooltipGroup \{[\s\S]*championId: number[\s\S]*count: number/)
  assert.match(source, /function getTeamObjectiveItems\(teamId: number\): ObjectiveDisplayItem\[\] \{[\s\S]*buildObjectiveDisplayItems\(teamId, summary\)/)
  assert.match(source, /function addStructureObjectiveItem\(/)
  assert.match(objectiveBuilderBlock, /addStructureObjectiveItem\(items, teamId, 'turret', 'turret', '塔', readStructureObjectiveCount\(teamId, summary, 'turret'\)\)/)
  assert.match(objectiveBuilderBlock, /addStructureObjectiveItem\(items, teamId, 'inhibitor', 'inhibitor', '水晶', readStructureObjectiveCount\(teamId, summary, 'inhibitor'\)\)/)
  assert.match(objectiveBuilderBlock, /addStructureObjectiveItem\(items, teamId, 'turret-plate', 'turretPlate', '镀层', readStructureObjectiveCount\(teamId, summary, 'turretPlate'\)\)/)
  assert.match(source, /iconUrl: getObjectiveIconUrl\(kind\)/)
  assert.match(source, /addObjectiveItem\(items, teamId, 'baron', 'baron', '男爵', readObjectiveCount\(summary\.baronKills\)\)/)
  assert.match(source, /addObjectiveItem\(items, teamId, 'herald', 'herald', '先锋', readObjectiveCount\(summary\.heraldKills\)\)/)
  assert.match(source, /addObjectiveItem\(items, teamId, 'voidgrub', 'voidgrub', '虚空巢虫', readObjectiveCount\(summary\.voidGrubKills\)\)/)
  assert.match(source, /addObjectiveItem\(items, teamId, 'elder', 'elder', '远古龙', readObjectiveCount\(summary\.elderDragonKills\)\)/)
  assert.doesNotMatch(objectiveBuilderBlock, /addDragonSoulItem/)
  assert.match(source, /function getObjectiveTooltipGroups\(/)
  assert.match(source, /kind === 'dragon'[\s\S]*normalizeDragonTypeKey\(event\.subType\)/)
  assert.match(source, /showCount: true/)
  assert.match(source, /showCount: false/)
  assert.match(source, /function formatObjectiveTitle\(label: string, count: number \| null\): string/)
  assert.doesNotMatch(headerBlock, /🐉|🐲|🔥|🌊|⛰|🌪|⚡|🧪/)
})

test('dragon objective renders as one pill with icons ordered by event timestamp and aggregate fallback', () => {
  const source = readInlineDetailSource()
  const headerBlock = source.match(/<header class="team-detail-header">[\s\S]*?<\/header>/)?.[0] || ''
  const dragonBuilderBlock = readFunctionBlock(
    source,
    'function addDragonObjectiveItems(items: ObjectiveDisplayItem[], teamId: number, summary: TeamObjectiveSummary): void'
  )
  const timelineIconsBlock = readFunctionBlock(
    source,
    'function getDragonTimelineObjectiveIcons(teamId: number, summary: TeamObjectiveSummary): ObjectiveDisplayIcon[]'
  )
  const fallbackIconsBlock = readFunctionBlock(
    source,
    'function getFallbackDragonObjectiveIcons(teamId: number, summary: TeamObjectiveSummary): ObjectiveDisplayIcon[]'
  )
  const sortedEventsBlock = readFunctionBlock(
    source,
    'function getSortedTimestampedDragonEvents(summary: TeamObjectiveSummary, teamId: number): TimestampedDragonObjectiveEvent[]'
  )

  assert.match(source, /interface ObjectiveDisplayIcon \{[\s\S]*timestamp: number \| null/)
  assert.match(source, /interface ObjectiveDisplayItem \{[\s\S]*icons\?: ObjectiveDisplayIcon\[\]/)
  assert.match(headerBlock, /v-for="icon in getObjectiveItemIcons\(item\)"/)
  assert.match(headerBlock, /:key="icon\.key"/)
  assert.match(headerBlock, /:src="icon\.iconUrl"/)
  assert.match(dragonBuilderBlock, /const icons = getDragonTimelineObjectiveIcons\(teamId, summary\)/)
  assert.match(dragonBuilderBlock, /icons\.length \? icons : getFallbackDragonObjectiveIcons\(teamId, summary\)/)
  assert.match(dragonBuilderBlock, /addDragonObjectiveItem\(items, teamId, dragonIcons\)/)
  assert.doesNotMatch(dragonBuilderBlock, /items\.push\(\.\.\.dragonTimelineItems\)/)
  assert.match(timelineIconsBlock, /getSortedTimestampedDragonEvents\(summary, teamId\)/)
  assert.match(sortedEventsBlock, /\.sort\(\(left, right\) => left\.timestamp - right\.timestamp \|\| left\.index - right\.index\)/)
  assert.match(fallbackIconsBlock, /normalizeDragonKillsByType\(summary\.dragonKillsByType\)/)
  assert.match(fallbackIconsBlock, /DRAGON_TYPE_ORDER/)
  assert.match(fallbackIconsBlock, /DRAGON_GROUP_LABEL,[\s\S]*null/)
})

test('objective item builder uses dragon event timestamps before falling back to aggregate dragon counts', () => {
  const source = readInlineDetailSource()
  const dragonBuilderBlock = readFunctionBlock(
    source,
    'function addDragonObjectiveItems(items: ObjectiveDisplayItem[], teamId: number, summary: TeamObjectiveSummary): void'
  )
  const timelineIconsBlock = readFunctionBlock(
    source,
    'function getDragonTimelineObjectiveIcons(teamId: number, summary: TeamObjectiveSummary): ObjectiveDisplayIcon[]'
  )
  const fallbackIconsBlock = readFunctionBlock(
    source,
    'function getFallbackDragonObjectiveIcons(teamId: number, summary: TeamObjectiveSummary): ObjectiveDisplayIcon[]'
  )
  const sortedEventsBlock = readFunctionBlock(
    source,
    'function getSortedTimestampedDragonEvents(summary: TeamObjectiveSummary, teamId: number): TimestampedDragonObjectiveEvent[]'
  )
  const dragonTypeLabelsBlock = source.match(/const DRAGON_TYPE_LABELS: Record<DragonType, string> = \{[\s\S]*?\n\}/)?.[0] || ''

  assert.match(dragonTypeLabelsBlock, /infernal: '炼狱龙'/)
  assert.match(dragonTypeLabelsBlock, /mountain: '山脉龙'/)
  assert.match(dragonTypeLabelsBlock, /ocean: '海洋龙'/)
  assert.match(dragonTypeLabelsBlock, /cloud: '云端龙'/)
  assert.match(dragonTypeLabelsBlock, /hextech: '海克斯龙'/)
  assert.match(dragonTypeLabelsBlock, /chemtech: '炼金龙'/)
  assert.match(dragonTypeLabelsBlock, /unknown: '小龙'/)
  assert.match(dragonBuilderBlock, /const dragonIcons = icons\.length \? icons : getFallbackDragonObjectiveIcons\(teamId, summary\)/)
  assert.match(dragonBuilderBlock, /const icons = getDragonTimelineObjectiveIcons\(teamId, summary\)/)
  assert.match(dragonBuilderBlock, /addDragonObjectiveItem\(items, teamId, dragonIcons\)/)
  assert.match(fallbackIconsBlock, /normalizeDragonKillsByType\(summary\.dragonKillsByType\)/)
  assert.match(timelineIconsBlock, /getSortedTimestampedDragonEvents\(summary, teamId\)/)
  assert.match(timelineIconsBlock, /totalDragonKills > 0 && events\.length < totalDragonKills/)
  assert.match(timelineIconsBlock, /createObjectiveDisplayIcon/)
  assert.match(source, /function addDragonObjectiveItem\(items: ObjectiveDisplayItem\[\], teamId: number, icons: ObjectiveDisplayIcon\[\]\): void/)
  assert.match(source, /iconUrl: getObjectiveIconUrl\(kind\)/)
  assert.match(sortedEventsBlock, /summary\.objectiveEvents/)
  assert.match(sortedEventsBlock, /event\.kind !== 'dragon'/)
  assert.match(sortedEventsBlock, /normalizeFiniteNumber\(event\.timestamp\)/)
  assert.match(sortedEventsBlock, /\.sort\(\(left, right\) => left\.timestamp - right\.timestamp \|\| left\.index - right\.index\)/)
  assert.doesNotMatch(dragonBuilderBlock, /dragon-remaining|unknownDragon[\s\S]*totalDragonKills - typedDragonTotal/)
  assert.doesNotMatch(dragonBuilderBlock, /typedDragonTotal > 0[\s\S]*addObjectiveItem\(items, teamId, 'dragon'/)
  assert.match(source, /function addObjectiveItem\([\s\S]*if \(count <= 0\) \{[\s\S]*return/)
  assert.doesNotMatch(source, /addDragonSoulItem\(items/)
})

test('objective pills normalize dragon type aliases before building tooltip titles', () => {
  const source = readInlineDetailSource()
  const normalizeKeyBlock = source.match(/function normalizeDragonTypeKey\(value: unknown\): DragonType \| 'unknown' \{[\s\S]*?\n\}/)?.[0] || ''
  const normalizeKillsBlock = source.match(/function normalizeDragonKillsByType\([\s\S]*?\n\}/)?.[0] || ''
  const headerBlock = source.match(/<header class="team-detail-header">[\s\S]*?<\/header>/)?.[0] || ''

  assert.match(source, /const DRAGON_TYPE_ALIASES: Record<Exclude<DragonType, 'unknown'>, string\[\]>/)
  for (const alias of [
    'infernal',
    'fire',
    'fire_dragon',
    'FIRE_DRAGON',
    'INFERNAL_DRAGON',
    'ocean',
    'water',
    'water_dragon',
    'WATER_DRAGON',
    'mountain',
    'earth',
    'EARTH_DRAGON',
    'MOUNTAIN_DRAGON',
    'cloud',
    'air',
    'AIR_DRAGON',
    'CLOUD_DRAGON',
    'hextech',
    'HEXTECH_DRAGON',
    'chemtech',
    'CHEMTECH_DRAGON'
  ]) {
    assert.match(source, new RegExp(`['"]${alias}['"]`))
  }
  assert.match(normalizeKeyBlock, /return 'unknown'/)
  assert.match(normalizeKillsBlock, /Object\.entries\(source/)
  assert.match(normalizeKillsBlock, /const dragonType = normalizeDragonTypeKey\(rawType\)/)
  assert.match(normalizeKillsBlock, /result\[dragonType\] = \(result\[dragonType\] \|\| 0\) \+ count/)
  assert.doesNotMatch(normalizeKillsBlock, /source\[type\]/)
  assert.match(headerBlock, /class="objective-icon objective-icon-img"[\s\S]*:src="icon\.iconUrl"[\s\S]*alt=""/)
  assert.match(headerBlock, /class="objective-icon objective-fallback-icon"[\s\S]*:class="`objective-fallback-\$\{icon\.kind\}`"/)
  assert.doesNotMatch(headerBlock, /:title="item\.title"|title=/)
  assert.match(headerBlock, /:aria-label="item\.title"/)
})

test('draft and objective summary is hidden for ARAM and CHERRY even when data exists', () => {
  const source = readInlineDetailSource()
  const rankedHelperBlock = source.match(/function isRankedMode\(match: MatchHistory \| GameDetail \| null \| undefined\): boolean \{[\s\S]*?\n\}/)?.[0] || ''
  const headerBlock = source.match(/<header class="team-detail-header">[\s\S]*?<\/header>/)?.[0] || ''

  assert.match(source, /const NON_LANE_BASED_QUEUE_IDS = new Set\(\[450, 900, 1020, 1700, 1710\]\)/)
  assert.match(source, /const NON_LANE_BASED_GAME_MODES = new Set\(\['ARAM', 'CHERRY'\]\)/)
  assert.match(source, /'大乱斗'/)
  assert.match(source, /'斗魂'/)
  assert.match(source, /'竞技场'/)
  assert.match(source, /const showDraftAndObjectiveSummary = computed\(\(\) => isRankedMode\(props\.matchHistory\) \|\| isRankedMode\(displayGameDetail\.value\)\)/)
  assert.match(headerBlock, /v-if="showDraftAndObjectiveSummary && getTeamObjectiveItems\(team\.teamId\)\.length"/)
  assert.doesNotMatch(rankedHelperBlock, /450|ARAM|CHERRY|大乱斗|斗魂|竞技场/)
  assert.doesNotMatch(source, /hasDraftOrObjectives\(team\.teamId\)/)
})

test('overview localizes items header and shows vision score only for ranked modes', () => {
  const source = readInlineDetailSource()
  const zh = readFileSync(new URL('../../i18n/locales/zh-CN.ts', import.meta.url), 'utf8')
  const en = readFileSync(new URL('../../i18n/locales/en-US.ts', import.meta.url), 'utf8')
  const headerBlock = source.match(/<div class="team-row-labels"[\s\S]*?<\/div>/)?.[0] || ''
  const overviewBlock = source.match(/<div v-if="activeTabValue === 'overview'"[\s\S]*?<div v-else-if="activeTabValue === 'runes'"/)?.[0] || ''
  const baseGridBlock = source.match(/\.team-row-labels,\s*\n\.participant-row \{[\s\S]*?\n\}/)?.[0] || ''
  const rankedGridBlock = source.match(/\.team-detail-table\.with-vision-score \.team-row-labels,[\s\S]*?\n\}/)?.[0] || ''
  const rankedHelperBlock = source.match(/function isRankedMode\(match: MatchHistory \| GameDetail \| null \| undefined\): boolean \{[\s\S]*?\n\}/)?.[0] || ''

  assert.doesNotMatch(headerBlock, />Items<\/span>|>ITEMS<\/span>/)
  assert.match(headerBlock, /v-if="showVisionScoreColumn"[\s\S]*class="vision-score-head"[\s\S]*t\('matchDetail\.visionScore'\)[\s\S]*class="items-head"[\s\S]*t\('matchDetail\.itemsTab'\)/)
  assert.match(zh, /'matchDetail\.itemsTab': '装备'/)
  assert.match(en, /'matchDetail\.itemsTab': 'Items'/)
  assert.match(zh, /'matchDetail\.visionScore': '视野得分'/)
  assert.match(en, /'matchDetail\.visionScore': 'Vision'/)
  assert.match(source, /const RANKED_QUEUE_IDS = new Set\(\[420, 440\]\)/)
  assert.match(source, /const RANKED_QUEUE_KEYWORDS = \[[\s\S]*'排位'[\s\S]*'单排'[\s\S]*'双排'[\s\S]*'灵活'[\s\S]*'RANKED'[\s\S]*'SOLO'[\s\S]*'FLEX'[\s\S]*\]/)
  assert.match(rankedHelperBlock, /RANKED_QUEUE_IDS\.has\(queueId\)/)
  assert.match(rankedHelperBlock, /containsModeKeyword\(queueName, RANKED_QUEUE_KEYWORDS\)/)
  assert.match(rankedHelperBlock, /return false/)
  assert.doesNotMatch(rankedHelperBlock, /ARAM|CHERRY|匹配|大乱斗|斗魂|竞技场/)
  assert.match(source, /const showVisionScoreColumn = computed\(\(\) => isRankedMode\(props\.matchHistory\) \|\| isRankedMode\(displayGameDetail\.value\)\)/)
  assert.match(source, /function getVisionScoreText\(player: MatchDetailParticipant\): string \{[\s\S]*const value = readStatNumber\(player, 'visionScore'\)[\s\S]*return value === null \? '--' : formatNumber\(value\)/)
  assert.match(overviewBlock, /'with-vision-score': showVisionScoreColumn/)
  assert.match(overviewBlock, /class="number-cell gold-cell"[\s\S]*v-if="showVisionScoreColumn"[\s\S]*class="number-cell vision-score-cell"[\s\S]*class="item-row compact"/)
  assert.match(source, /<span\s+v-if="showVisionScoreColumn"\s+class="number-cell vision-score-cell">\s*\{\{ getVisionScoreText\(player\) \}\}\s*<\/span>/)
  assert.match(source, /\.items-head,[\s\S]*\.vision-score-head \{[\s\S]*text-transform:\s*none/)
  assert.match(baseGridBlock, /minmax\(52px, 0\.38fr\)[\s\S]*minmax\(154px, 0\.9fr\)/)
  assert.doesNotMatch(baseGridBlock, /minmax\(58px, 0\.38fr\)/)
  assert.match(rankedGridBlock, /minmax\(52px, 0\.38fr\)[\s\S]*minmax\(58px, 0\.38fr\)[\s\S]*minmax\(154px, 0\.9fr\)/)
  assert.match(overviewBlock, /<div class="item-row compact" aria-label="items">[\s\S]*v-for="slot in getPlayerItemSlots\(player\)"[\s\S]*class="item-slot"[\s\S]*<img v-if="slot\.url"/)
})

test('overview highlights top kills, deaths, and assists separately instead of top KDA ratio', () => {
  const source = readInlineDetailSource()
  const kdaCellBlock = source.match(/<div class="kda-cell">[\s\S]*?<\/div>/)?.[0] || ''

  assert.match(source, /const topKillValue = computed\(\(\) => getTopMetricValue\(allPlayers\.value, player => readStatNumber\(player, 'kills'\)\)\)/)
  assert.match(source, /const topDeathValue = computed\(\(\) => getTopMetricValue\(allPlayers\.value, player => readStatNumber\(player, 'deaths'\)\)\)/)
  assert.match(source, /const topAssistValue = computed\(\(\) => getTopMetricValue\(allPlayers\.value, player => readStatNumber\(player, 'assists'\)\)\)/)
  assert.match(source, /function getTopMetricValue\([\s\S]*value > 0[\s\S]*Math\.max\(\.\.\.values\)/)
  assert.match(source, /function isTopKillPlayer\(player: MatchDetailParticipant\): boolean \{[\s\S]*return isTopMetricPlayer\(player, topKillValue\.value, target => readStatNumber\(target, 'kills'\)\)/)
  assert.match(source, /function isTopDeathPlayer\(player: MatchDetailParticipant\): boolean \{[\s\S]*return isTopMetricPlayer\(player, topDeathValue\.value, target => readStatNumber\(target, 'deaths'\)\)/)
  assert.match(source, /function isTopAssistPlayer\(player: MatchDetailParticipant\): boolean \{[\s\S]*return isTopMetricPlayer\(player, topAssistValue\.value, target => readStatNumber\(target, 'assists'\)\)/)
  assert.match(kdaCellBlock, /class="kda-kills"[\s\S]*'top-kills': isTopKillPlayer\(player\)[\s\S]*getPlayerKills\(player\)/)
  assert.match(kdaCellBlock, /class="kda-deaths"[\s\S]*'top-deaths': isTopDeathPlayer\(player\)[\s\S]*getPlayerDeaths\(player\)/)
  assert.match(kdaCellBlock, /class="kda-assists"[\s\S]*'top-assists': isTopAssistPlayer\(player\)[\s\S]*getPlayerAssists\(player\)/)
  assert.match(kdaCellBlock, /t\('matchDetail\.killParticipation'\)[\s\S]*getKillParticipation\(player, team\)/)
  assert.doesNotMatch(kdaCellBlock, /killParticipation[\s\S]*top-kills|killParticipation[\s\S]*top-deaths|killParticipation[\s\S]*top-assists/)
  assert.doesNotMatch(source, /topKdaValue|top-kda-value|isTopKdaPlayer|getPlayerKdaRatio|calculateKda/)
  assert.match(source, /\.top-kills \{[\s\S]*#ef6f7a/)
  assert.match(source, /\.top-deaths \{[\s\S]*#f0c05a/)
  assert.match(source, /\.top-assists \{[\s\S]*#62d49e/)
})

test('overview marks only positive top damage, taken, and gold values with inline svg icons', () => {
  const source = readInlineDetailSource()
  const overviewBlock = source.match(/<div v-if="activeTabValue === 'overview'"[\s\S]*?<div v-else-if="activeTabValue === 'runes'"/)?.[0] || ''

  assert.match(source, /function getTopMetricValue\([\s\S]*value > 0[\s\S]*Math\.max\(\.\.\.values\)/)
  assert.match(source, /const topDamageValue = computed\(\(\) => getTopMetricValue\(allPlayers\.value, player => readStatNumber\(player, 'totalDamageDealtToChampions'\)\)\)/)
  assert.match(source, /const topTakenValue = computed\(\(\) => getTopMetricValue\(allPlayers\.value, player => readStatNumber\(player, 'totalDamageTaken'\)\)\)/)
  assert.match(source, /const topGoldValue = computed\(\(\) => getTopMetricValue\(allPlayers\.value, player => readStatNumber\(player, 'goldEarned'\)\)\)/)
  assert.match(source, /function isTopDamagePlayer\(player: MatchDetailParticipant\): boolean/)
  assert.match(source, /function isTopTakenPlayer\(player: MatchDetailParticipant\): boolean/)
  assert.match(source, /function isTopGoldPlayer\(player: MatchDetailParticipant\): boolean/)
  assert.match(overviewBlock, /class="top-metric-icon top-damage-icon"[\s\S]*v-if="isTopDamagePlayer\(player\)"[\s\S]*title="全场最高伤害"[\s\S]*aria-label="全场最高伤害"[\s\S]*<svg[\s\S]*viewBox="0 0 16 16"[\s\S]*<path/)
  assert.match(overviewBlock, /class="top-metric-icon top-taken-icon"[\s\S]*v-if="isTopTakenPlayer\(player\)"[\s\S]*title="全场最高承伤"[\s\S]*aria-label="全场最高承伤"[\s\S]*<svg[\s\S]*viewBox="0 0 16 16"[\s\S]*<path/)
  assert.match(overviewBlock, /class="top-metric-icon top-gold-icon"[\s\S]*v-if="isTopGoldPlayer\(player\)"[\s\S]*title="全场最高金币"[\s\S]*aria-label="全场最高金币"[\s\S]*<svg[\s\S]*viewBox="0 0 16 16"[\s\S]*<circle[\s\S]*<path/)
  assert.doesNotMatch(overviewBlock, /🔥|🛡|🪙/)
  assert.match(source, /\.metric-value-with-icon \{[\s\S]*inline-flex/)
  assert.match(source, /\.top-metric-icon \{[\s\S]*width:\s*12px[\s\S]*height:\s*12px/)
  assert.match(source, /\.top-metric-icon svg \{[\s\S]*fill:\s*currentColor/)
  assert.match(source, /\.top-damage-icon \{[\s\S]*#ff7a45/)
  assert.match(source, /\.top-taken-icon \{[\s\S]*#7bb7ff/)
  assert.match(source, /\.top-gold-icon \{[\s\S]*#f0c05a/)
})
