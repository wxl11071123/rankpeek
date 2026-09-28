<template>
  <!-- 局内：识别到三选一才出现，选完卡片自动消失（跟参考项目一样） -->
  <div v-if="mode === 'in-game'" class="ingame-root">
    <div v-if="detected" class="ingame-panels">
      <article
        v-for="(info, index) in slotInfos"
        :key="index"
        class="ingame-card"
        :class="[info?.rarity ? 'rarity-' + info.rarity : '', { best: Boolean(info) && bestSlotIndex === index }]"
      >
        <span v-if="info && bestSlotIndex === index" class="ingame-pick">{{ t('hextech.overlayBestPick') }}</span>
        <template v-if="info">
          <div class="ingame-icon-frame">
            <img class="ingame-icon" :src="getAugmentIconUrl(info.augmentId)" :alt="info.name" />
          </div>
          <div class="ingame-body">
            <span class="ingame-name">{{ info.name }}</span>
            <div class="ingame-stats">
              <div class="ingame-stat">
                <small>{{ t('hextech.colPickRate') }}</small>
                <b>{{ formatRate(info.pickRate) }}</b>
              </div>
              <div class="ingame-stat">
                <small>{{ info.scope === 'global' ? t('hextech.overlayGlobalWinRate') : t('hextech.colWinRate') }}</small>
                <b>{{ formatRate(info.winRate) }}</b>
              </div>
            </div>
            <span class="ingame-badge">{{ badgeText(info) }}</span>
          </div>
        </template>
        <span v-else class="ingame-empty">{{ t('hextech.overlayEmpty') }}</span>
        <div v-if="info" class="ingame-bar"><span :style="{ width: rateBarWidth(info) }" /></div>
      </article>
    </div>
    <p v-if="detected && scanMessage" class="ingame-message">{{ scanMessage }}</p>
  </div>

  <!-- 选人阶段：英雄 -> 最适配的四个强化 -> 该英雄强化榜单 -->
  <div v-else class="pick-root">
    <section class="pick-panel">
      <header class="pick-head">
        <div class="champ">
          <img v-if="championId" class="champ-icon" :src="getChampionIconUrl(championId)" :alt="championName" />
          <div class="champ-copy">
            <span class="champ-name">{{ championName || t('hextech.overlayNoChampion') }}</span>
            <span class="champ-meta">
              <template v-if="overlay?.detail?.winRank">
                {{ t('hextech.colRank') }} #{{ overlay.detail.winRank }}
              </template>
              <template v-if="overlay?.detail?.winRate != null">
                · {{ t('hextech.colWinRate') }} <b>{{ formatRate(overlay.detail.winRate) }}</b>
              </template>
              <template v-if="overlay?.detail?.pickRate != null">
                · {{ t('hextech.colPickRate') }} <b>{{ formatRate(overlay.detail.pickRate) }}</b>
              </template>
              <template v-if="!overlay?.championId">{{ t('hextech.overlayNoChampionHint') }}</template>
            </span>
          </div>
        </div>
        <div class="pick-actions">
          <button class="icon-btn" type="button" :disabled="loading" :aria-label="t('hextech.refresh')" @click="load">↻</button>
          <button class="icon-btn" type="button" :aria-label="t('hextech.detailClose')" @click="closeOverlay">×</button>
        </div>
      </header>

      <p class="pick-section">
        <span>{{ t('hextech.overlayBestFour') }}</span>
      </p>
      <div v-if="bestFour.length" class="best-four">
        <article
          v-for="row in bestFour"
          :key="row.augmentId"
          class="best-card"
          :class="getAugmentRarityClass(row.rarity)"
        >
          <span class="best-icon-frame">
            <img class="best-icon" :src="getAugmentIconUrl(row.augmentId)" :alt="row.name || ''" />
          </span>
          <span class="best-copy">
            <span class="best-name">{{ row.name || '#' + row.augmentId }}</span>
            <span class="best-meta">{{ tierLabel(row.tier) }} · {{ t('hextech.colPickRate') }} {{ formatRate(row.pickRate) }}</span>
          </span>
          <span class="best-rate">{{ formatRate(row.winRate) }}</span>
        </article>
      </div>
      <p v-else class="pick-empty">{{ overlay?.championId ? t('hextech.detailEmpty') : t('hextech.overlayNoChampionHint') }}</p>

      <p class="pick-section">
        <span>{{ t('hextech.overlayRanking') }}</span>
        <span class="pick-count">{{ t('hextech.overlaySortByRank') }} · {{ filteredRankingRows.length }} / {{ rankingRows.length }}</span>
      </p>
      <div class="rarity-tabs">
        <button
          v-for="tab in rarityTabs"
          :key="tab.value"
          class="rarity-tab"
          :class="{ active: rarityFilter === tab.value }"
          type="button"
          @click="rarityFilter = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>
      <ol class="pick-list">
        <li v-for="row in filteredRankingRows" :key="row.augmentId" class="pick-row">
          <span class="row-rank">{{ row.rank || '—' }}</span>
          <span class="row-icon-frame" :class="getAugmentRarityClass(row.rarity)">
            <img class="row-icon" :src="getAugmentIconUrl(row.augmentId)" :alt="row.name || ''" loading="lazy" />
          </span>
          <span class="row-name">{{ row.name || '#' + row.augmentId }}</span>
          <span class="row-tier">{{ tierLabel(row.tier) }}</span>
          <span class="row-rate">{{ formatRate(row.winRate) }}</span>
          <span class="row-pick">{{ formatRate(row.pickRate) }}</span>
        </li>
      </ol>

    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { startScreenStream, type ScreenStream, type ScreenStreamBridge } from '@/services/hextechScreenStream'
import { apiClient } from '@/api/httpClient'
import { useI18n } from '@/i18n'
import type {
  ChampionOption,
  HextechAugmentBoardRow,
  HextechAugmentDefinition,
  HextechChampionAugmentRow,
  HextechOverlayData
} from '@/types/api'
import { getAugmentIconUrl, getAugmentRarityClass, getChampionIconUrl } from '@/utils/gameAssetUrls'
import { matchAugmentTitle, type AugmentCandidate } from '@/services/augmentTitleMatcher.ts'
import { applyOverlayGate, createOverlayGateState, type OverlayGateState } from '@/services/augmentOverlayGate'
import { isInGamePhase } from '@/services/hextechOverlayAutoOpen'

const { t } = useI18n()

const overlay = ref<HextechOverlayData | null>(null)
const championOptions = ref<ChampionOption[]>([])
const augmentDefinitions = ref<HextechAugmentDefinition[]>([])
const augmentBoard = ref<HextechAugmentBoardRow[]>([])
const manualChampionId = ref<number | null>(null)
const loading = ref(false)
const scanning = ref(false)
const scanMessage = ref('')
const slots = reactive<Array<{ augmentId: number | null }>>([
  { augmentId: null },
  { augmentId: null },
  { augmentId: null }
])

let refreshTimer: ReturnType<typeof setInterval> | null = null
let rescanTimer: number | null = null
let messageTimer: number | null = null

/** 提示文字自动消失，别一直压在卡片上。 */
function flashMessage(text: string): void {
  scanMessage.value = text
  if (messageTimer) {
    window.clearTimeout(messageTimer)
  }
  messageTimer = window.setTimeout(() => {
    scanMessage.value = ''
    messageTimer = null
  }, 6000)
}

/**
 * 选人阶段用普通窗口（不置顶），局内用置顶窄条。
 *
 * 调试：地址栏加 `?mode=in-game` / `?mode=champ-select` 可以强制预览某一种形态
 * （不用真的进游戏）。
 */
function readModeOverride(): 'champ-select' | 'in-game' | null {
  const query = window.location.hash.split('?')[1] || ''
  const value = new URLSearchParams(query).get('mode')
  return value === 'in-game' || value === 'champ-select' ? value : null
}

/**
 * 调试：地址栏加 `?slots=2128,2132,2131` 直接把三格填上，
 * 不用真的进游戏截图就能调三块面板的样式（配合 `?mode=in-game`）。
 */
function readSlotOverride(): number[] {
  const query = window.location.hash.split('?')[1] || ''
  const value = new URLSearchParams(query).get('slots')
  if (!value) {
    return []
  }
  return value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((id) => Number.isFinite(id))
    .slice(0, 3)
}

const mode = computed<'champ-select' | 'in-game'>(() => {
  const override = readModeOverride()
  if (override) {
    return override
  }
  const phase = overlay.value?.phase || ''
  return phase === 'InProgress' || phase === 'GameStart' || phase === 'Reconnect' ? 'in-game' : 'champ-select'
})

const championId = computed(() => overlay.value?.championId ?? null)
const championName = computed(() => {
  const id = championId.value
  if (!id) {
    return ''
  }
  return championOptions.value.find((option) => Number(option.value) === id)?.label ?? '#' + id
})

/**
 * 该英雄强化榜单：**保持后端给的顺序**（aramgg 排名，就是海斗页「英雄榜」里那套 T 级排序），
 * 不在这里另排一套 —— 两处顺序必须一致，否则玩家会以为哪里算错了。
 */
const rankingRows = computed<HextechChampionAugmentRow[]>(() => overlay.value?.detail?.augments ?? [])

/** 榜单稀有度筛选（aramgg 那排小药丸）。 */
const rarityFilter = ref<string>('all')
const rarityTabs = computed(() => [
  { value: 'all', label: t('hextech.overlayRarityAll') },
  { value: 'kSilver', label: t('hextech.raritySilver') },
  { value: 'kGold', label: t('hextech.rarityGold') },
  { value: 'kPrismatic', label: t('hextech.rarityPrismatic') }
])
const filteredRankingRows = computed<HextechChampionAugmentRow[]>(() =>
  rarityFilter.value === 'all'
    ? rankingRows.value
    : rankingRows.value.filter((row) => (row.rarity || '') === rarityFilter.value)
)

/** 最适配的四个：按胜率从高到低取（没有胜率样本的不参与）。 */
/** 最适配的四个：直接取榜单前四（跟海斗页看到的同一个顺序）。 */
const bestFour = computed<HextechChampionAugmentRow[]>(() => rankingRows.value.slice(0, 4))

const bestSlotIndex = computed(() => {
  let bestIndex = -1
  let bestRate = -1
  slots.forEach((slot, index) => {
    const row = slotRow(slot.augmentId)
    if (!row) {
      return
    }
    const rate = rateValue(row.winRate)
    if (rate > bestRate) {
      bestRate = rate
      bestIndex = index
    }
  })
  return bestIndex
})

/**
 * 浮窗显隐门控（照参考项目 ARAMGG 的规则）：
 * 只有完整识别到三张卡才打开；部分识别只更新已开着的浮窗；
 * 连续几次扫空才收起，避免换卡动画把浮窗闪没。
 */
const gate = ref<OverlayGateState>(createOverlayGateState())
const detected = computed(() => gate.value.visible)

interface HextechOverlayStripBridge {
  setHextechOverlayStripActive?: (active: boolean) => Promise<boolean>
  hextechOverlayDebugLog?: (message: string) => Promise<boolean>
  captureOverlayProof?: () => Promise<boolean>
}

function stripBridge(): HextechOverlayStripBridge | undefined {
  return (window as unknown as { electronAPI?: HextechOverlayStripBridge }).electronAPI
}

function setStripActive(active: boolean): void {
  void stripBridge()?.setHextechOverlayStripActive?.(active)
}

/** 把检测过程写进主进程日志（排查"为什么没弹"用）。 */
function stripLog(message: string): void {
  void stripBridge()?.hextechOverlayDebugLog?.(message)
}

/** 三格当前要展示的数据（OCR 结果 -> 展示字段）。 */
const slotInfos = computed<Array<SlotInfo | null>>(() => slots.map((slot) => slotRow(slot.augmentId)))

/** 卡片底部那根进度条：优先胜率，没胜率就用选取率（都按 0~1 当百分比）。 */
function rateBarWidth(info: SlotInfo): string {
  const win = rateValue(info.winRate)
  const pick = rateValue(info.pickRate)
  const ratio = win > 0 ? win : pick
  if (!(ratio > 0)) {
    return '0%'
  }
  return Math.round(Math.min(ratio, 1) * 100) + '%'
}

function rateValue(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') {
    return Number.NEGATIVE_INFINITY
  }
  const numeric = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(numeric) ? numeric : Number.NEGATIVE_INFINITY
}

/** 局内面板里展示一条强化需要的最小字段（英雄矩阵和全局榜单都能映射过来）。 */
interface SlotInfo {
  augmentId: number
  name: string
  /** kSilver / kGold / kPrismatic —— 卡片描边按稀有度上色（跟参考项目一样）。 */
  rarity: string | null
  tier: string | null
  rank: string | null
  winRate: number | string | null
  pickRate: number | string | null
  /** aramgg 口径的样本局数（面板上的「规模」）。 */
  numGames: string | null
  /**
   * 这张卡的数据口径。
   *
   * 本英雄矩阵没有胜率时只能退回 101 的全局榜 —— 那是**所有英雄**的胜率，
   * 跟本英雄的口径不是一回事，所以要在卡面上写清楚，别让人以为是同一个东西。
   */
  scope: 'champion' | 'global' | 'none'
}

/**
 * 查一个强化的展示数据。
 *
 * 优先用当前英雄的矩阵（有 tier/国服数据）；查不到就退回全局强化榜
 * —— 局内 OCR 认出候选时，英雄可能还没识别出来，这时也要能显示数据。
 */
function slotRow(augmentId: number | null): SlotInfo | null {
  if (augmentId === null) {
    return null
  }
  const fromChampion = rankingRows.value.find((row) => row.augmentId === augmentId)
  const fromBoard = augmentBoard.value.find((row) => row.augmentId === augmentId)
  const fromDefinitions = augmentDefinitions.value.find((row) => row.augmentId === augmentId)
  if (!fromChampion && !fromBoard && !fromDefinitions) {
    return null
  }
  // 英雄矩阵的胜率在样本不足时是 null。这时候整张卡改成用 101 的全局榜
  // （胜率+选取率+全局排名一起换），不混着来 —— 混着显示口径不一致，谁也说不清
  // 那个百分比到底是"小炮的"还是"所有英雄的"。
  const championWin = fromChampion?.winRate
  const hasChampionWin = championWin !== null && championWin !== undefined && championWin !== ''
  const useChampion = Boolean(fromChampion) && (hasChampionWin || !fromBoard)
  return {
    augmentId,
    name: fromChampion?.name || fromBoard?.name || fromDefinitions?.name || '#' + augmentId,
    rarity: fromChampion?.rarity ?? fromBoard?.rarity ?? fromDefinitions?.rarity ?? null,
    tier: useChampion ? fromChampion?.tier ?? null : null,
    rank: useChampion
      ? fromChampion?.rank ?? null
      : (fromBoard?.winRank == null ? null : String(fromBoard.winRank)),
    winRate: useChampion ? championWin ?? null : fromBoard?.winRate ?? null,
    pickRate: useChampion ? fromChampion?.pickRate ?? null : fromBoard?.pickRate ?? null,
    numGames: useChampion ? fromChampion?.numGames ?? null : null,
    scope: useChampion ? 'champion' : fromBoard ? 'global' : 'none'
  }
}

function tierLabel(tier: string | null): string {
  if (!tier) {
    return '—'
  }
  return tier.startsWith('T') ? tier : 'T' + tier
}

function formatRate(value: number | string | null | undefined): string {
  const numeric = rateValue(value)
  if (!Number.isFinite(numeric)) {
    return '—'
  }
  return (numeric <= 1 ? numeric * 100 : numeric).toFixed(2) + '%'
}

/** 「规模 · 9.2万」——样本局数，超过一万按万显示。 */
function formatGames(value: string | null): string | null {
  if (!value) {
    return null
  }
  const numeric = Number.parseInt(String(value).replace(/[^0-9]/g, ''), 10)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null
  }
  if (numeric >= 10000) {
    return (numeric / 10000).toFixed(1) + '万'
  }
  return String(numeric)
}

/**
 * 面板底部的小徽标：这个强化在该英雄上攒了多少样本局。
 *
 * 之前这里对胜率最高的那张写「推荐」、其余写「规模」，但数字是同一个东西
 * （样本局数），看着像两种指标。现在统一写「样本 · N 局」，
 * 「推荐」由卡片上角那枚金色「最优先」徽标负责。
 */
function badgeText(info: SlotInfo): string {
  const games = formatGames(info.numGames)
  // 本英雄口径直接写「样本 · N 场」；全局口径必须写清"全局"，否则又是混口径
  if (info.scope !== 'global' && games) {
    return t('hextech.overlaySample') + ' · ' + games + t('hextech.overlayGamesUnit')
  }
  if (info.rank) {
    const scope = info.scope === 'global' ? t('hextech.overlayScopeGlobal') + ' · ' : ''
    return scope + t('hextech.colRank') + ' #' + info.rank
  }
  return tierLabel(info.tier)
}

async function load(): Promise<void> {
  loading.value = true
  try {
    overlay.value = await apiClient.getHextechOverlay(manualChampionId.value)
    if (!championOptions.value.length) {
      try {
        championOptions.value = await apiClient.getChampionOptions()
      } catch {
        // 英雄名加载失败不影响强化数据
      }
    }
    if (!augmentDefinitions.value.length) {
      try {
        augmentDefinitions.value = await apiClient.getHextechAugmentDefinitions()
      } catch {
        // 拿不到定义时退回用英雄排行当候选
      }
    }
    if (!augmentBoard.value.length) {
      try {
        augmentBoard.value = await apiClient.getHextechAugments()
      } catch {
        // 全局榜单拿不到时，窄条只显示名字
      }
    }
  } catch {
    // 单次失败不影响下一次轮询
  } finally {
    loading.value = false
  }
}

/**
 * 截取三个强化标题区域 -> OCR -> 匹配 -> 填进三块面板。
 *
 * 静默模式（轮询用）不弹提示；扫不到就累计 missStreak，连续两次空就收起面板。
 */
async function scanCandidates(options: { silent?: boolean } = {}): Promise<void> {
  if (scanning.value) {
    return
  }
  scanning.value = true
  scanMessage.value = ''
  try {
    const api = (window as unknown as {
      electronAPI?: {
        recognizeAugmentTitles?: () => Promise<{
          available: boolean
          texts: string[]
          textsBySlot?: string[][]
          message?: string
        }>
        recognizeAugmentCrops?: (payload: {
          crops: Array<{ width: number; height: number; data: Uint8Array }>
          screenWidth: number
          screenHeight: number
        }) => Promise<{
          available: boolean
          texts: string[]
          textsBySlot?: string[][]
          message?: string
        }>
      }
    }).electronAPI
    if (!api?.recognizeAugmentTitles && !api?.recognizeAugmentCrops) {
      if (!options.silent) {
        flashMessage(t('hextech.overlayScanUnavailable'))
      }
      return
    }
    // 常驻抓屏流就绪就走快路径（几毫秒抓三块），否则回退到主进程整屏抓图
    const stream = await ensureScreenStream()
    if (stream?.ready) {
      const frames = stream.frameCount()
      const now = Date.now()
      if (frames !== streamLastFrameCount) {
        streamLastFrameCount = frames
        streamLastFrameAt = now
      } else if (streamLastFrameAt > 0 && now - streamLastFrameAt > STREAM_FROZEN_MS) {
        // 抓屏冻住了（独占全屏时 DXGI 会断，日志里那些 0x887A0026）：
        // 这时候 OCR 读到的是**上一波三选一的旧画面**，面板就会在不该出现的时候冒出来。
        // 按"什么都没看到"处理，让门控该收就收。
        const frozen = applyOverlayGate(gate.value, [null, null, null])
        gate.value = frozen.state
        slots.forEach((slot, index) => {
          slot.augmentId = frozen.state.slots[index]
        })
        if (frozen.cleared) {
          setStripActive(false)
        }
        return
      }
    }
    const outcome = stream?.ready && api?.recognizeAugmentCrops
      ? await api.recognizeAugmentCrops({
          crops: stream.grab(),
          screenWidth: stream.screenWidth,
          screenHeight: stream.screenHeight
        })
      : await api.recognizeAugmentTitles!()
    if (!outcome.available) {
      if (!options.silent) {
        flashMessage(t('hextech.overlayScanUnavailable'))
      }
      return
    }
    // 同一个名字可能挂着好几个 id（例：回归基本功 = 4 / 1004）。匹配到没数据的那个，
    // 卡片就只能显示「—」。按名字去重时优先留**有数据**的 id（英雄矩阵或全局榜单里有的）。
    const withData = new Set<number>([
      ...rankingRows.value.map((row) => row.augmentId),
      ...augmentBoard.value.map((row) => row.augmentId)
    ])
    const byName = new Map<string, AugmentCandidate>()
    for (const row of augmentDefinitions.value.length ? augmentDefinitions.value : rankingRows.value) {
      const name = row.name || ''
      if (!name) {
        continue
      }
      const current = byName.get(name)
      if (!current || (!withData.has(current.augmentId) && withData.has(row.augmentId))) {
        byName.set(name, { augmentId: row.augmentId, name })
      }
    }
    const candidates: AugmentCandidate[] = [...byName.values()]
    // 按卡位（左/中/右）各自匹配：顺序不能乱，参考项目也是按卡位写结果
    const perSlot: Array<number | null> = [0, 1, 2].map((index) => {
      const texts = outcome.textsBySlot?.[index] ?? []
      let best: { augmentId: number; confidence: number } | null = null
      for (const text of texts) {
        const match = matchAugmentTitle(text, candidates)
        if (match && (!best || match.confidence > best.confidence)) {
          best = { augmentId: match.augmentId, confidence: match.confidence }
        }
      }
      return best ? best.augmentId : null
    })

    const decision = applyOverlayGate(gate.value, perSlot)
    gate.value = decision.state
    slots.forEach((slot, index) => {
      slot.augmentId = decision.state.slots[index]
    })
    if (decision.opened) {
      setStripActive(true)
      // 亮起来 900ms 后再抓一张整屏：这一张能证明面板有没有真的画到屏幕上
      window.setTimeout(() => {
        void stripBridge()?.captureOverlayProof?.()
      }, 900)
    }
    if (decision.cleared) {
      setStripActive(false)
    }
    // 每次"状态有变化"才写一行日志，别刷屏
    const signature = perSlot.join(',')
    if (signature !== lastLoggedSignature) {
      lastLoggedSignature = signature
      stripLog(
        'ocr slots=[' + signature + '] texts=' + JSON.stringify(outcome.textsBySlot ?? []) +
          ' visible=' + String(decision.state.visible) +
          ' opened=' + String(decision.opened) +
          ' candidates=' + String(candidates.length)
      )
    }
    if (!options.silent) {
      const found = perSlot.filter((id) => id != null).length
      flashMessage(
        found
          ? t('hextech.overlayScanDone', { count: found })
          : t('hextech.overlayScanNoMatch')
      )
    }
  } catch (caught) {
    if (!options.silent) {
      flashMessage(caught instanceof Error ? caught.message : String(caught))
    }
  } finally {
    scanning.value = false
  }
}

let lastLoggedSignature = ''

/** 自适应轮询：扫完这一轮再决定下一轮隔多久（有卡片就快，没卡片就慢）。 */
function scheduleRescan(delay: number): void {
  if (rescanTimer !== null) {
    window.clearTimeout(rescanTimer)
  }
  rescanTimer = window.setTimeout(() => {
    rescanTimer = null
    if (mode.value !== 'in-game') {
      scheduleRescan(IN_GAME_IDLE_MS)
      return
    }
    // 抓屏流只在真打对局时开着：它是"常驻抓桌面"，实测持续吃掉半个 CPU 核，
    // 不打游戏时纯属白烧（整台机器都会感觉卡）。进对局那一轮再起流也来得及。
    if (isInGamePhase(overlay.value?.phase)) {
      if (!screenStream?.ready) {
        void ensureScreenStream()
      }
    } else if (screenStream?.ready) {
      stopScreenStream()
    }
    // 只有真正在打海斗才扫：贴片窗口会一直活着，不然 OCR 会没完没了地跑
    if (!isInGamePhase(overlay.value?.phase)) {
      scheduleRescan(IN_GAME_IDLE_MS)
      return
    }
    void scanCandidates({ silent: true }).finally(() => {
      scheduleRescan(gate.value.visible ? IN_GAME_ACTIVE_MS : IN_GAME_IDLE_MS)
    })
  }, delay)
}

function closeOverlay(): void {
  const api = (window as unknown as { electronAPI?: { closeWindow?: () => Promise<void> } }).electronAPI
  if (api?.closeWindow) {
    void api.closeWindow()
    return
  }
  window.close()
}

function applyMode(next: 'champ-select' | 'in-game'): void {
  const api = (window as unknown as { electronAPI?: { setHextechOverlayMode?: (mode: string) => Promise<boolean> } }).electronAPI
  void api?.setHextechOverlayMode?.(next)
}

/**
 * 局内 OCR 轮询节奏。
 *
 * 比参考项目再快一档（它 1.5s/500ms）：抓屏本身现在只要一两百毫秒
 * （PNG 编码挪到"真要落盘"时才做），所以空转 1 秒、出卡后 400ms 也扛得住。
 * 帧没变时主进程直接复用上一轮 OCR 结果，不会真的重复识别。
 */
const IN_GAME_IDLE_MS = 1000
const IN_GAME_ACTIVE_MS = 400

/** 常驻抓屏流：只在对局形态下开着，切走就关。 */
let screenStream: ScreenStream | null = null
let screenStreamStarting = false
/** 抓屏流最近一次"有新帧"的时间：冻帧时不能拿旧画面当现在的画面。 */
let streamLastFrameCount = -1
let streamLastFrameAt = 0
const STREAM_FROZEN_MS = 1500

async function ensureScreenStream(): Promise<ScreenStream | null> {
  if (screenStream?.ready) {
    return screenStream
  }
  if (screenStreamStarting) {
    return screenStream
  }
  screenStreamStarting = true
  try {
    const bridge = (window as unknown as {
      electronAPI?: { getHextechCaptureSource?: ScreenStreamBridge['getHextechCaptureSource'] }
    }).electronAPI
    screenStream = await startScreenStream(bridge)
    return screenStream
  } finally {
    screenStreamStarting = false
  }
}

function stopScreenStream(): void {
  screenStream?.stop()
  screenStream = null
}

watch(
  mode,
  (next) => {
    applyMode(next)
    if (next === 'in-game') {
      // 等窗口切完形态、卡片画出来再截图识别；没卡片就一直空着
      setStripActive(false)
      void ensureScreenStream()
      window.setTimeout(() => void scanCandidates({ silent: true }), 1200)
      return
    }
    stopScreenStream()
  },
  { immediate: true }
)

onMounted(() => {
  const preset = readSlotOverride()
  // 调试预置了卡片就不再跑 OCR 轮询，否则几秒后会被"扫空"清掉
  if (!preset.length) {
    scheduleRescan(IN_GAME_IDLE_MS)
  }
  if (preset.length) {
    // 调试用：直接把三格填上（同时把门控打开，否则面板不显示）
    gate.value = {
      visible: true,
      missStreak: 0,
      slots: [0, 1, 2].map((index) => preset[index] ?? null),
      signature: 'debug'
    }
    preset.forEach((augmentId, index) => {
      slots[index].augmentId = augmentId
    })
  }
  void load()
  refreshTimer = setInterval(() => {
    void load()
  }, 8000)
})

onUnmounted(() => {
  stopScreenStream()
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  if (rescanTimer !== null) {
    window.clearTimeout(rescanTimer)
    rescanTimer = null
  }
  if (messageTimer) {
    window.clearTimeout(messageTimer)
    messageTimer = null
  }
})
</script>

<style scoped>
/* ---------- 局内：三张强化卡上方的数据面板（配色照参考项目：暗金 + 象牙白） ---------- */
/* 外壳永远透明：没识别到三选一时，屏幕上不该挂一条空面板（读条界面就会露馅）。 */
.ingame-root {
  position: relative;
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  background: transparent;
  -webkit-app-region: drag;
  overflow: hidden;
}

/* 面板的外观挂在「有内容才渲染」的这一层上 */
.ingame-panels {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  height: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  background:
    radial-gradient(circle at top right, rgba(194, 156, 109, 0.16), transparent 46%),
    linear-gradient(145deg, rgba(17, 25, 35, 0.95), rgba(9, 14, 19, 0.97));
  border: 1px solid rgba(200, 169, 106, 0.24);
  border-radius: 6px;
  box-shadow: inset 0 0 20px rgba(194, 156, 109, 0.08), 0 18px 50px rgba(0, 0, 0, 0.42);
}

.ingame-card {
  position: relative;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px 14px;
  border: 1px solid rgba(244, 236, 220, 0.09);
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(244, 236, 220, 0.035), transparent), rgba(12, 18, 25, 0.78);
  color: #f4ecdc;
  overflow: hidden;
}

/* 稀有度描边：跟参考项目同一套色 */
.ingame-card.rarity-kGold {
  border-color: rgba(200, 169, 106, 0.42);
  background: linear-gradient(135deg, rgba(200, 169, 106, 0.16), transparent 48%), rgba(12, 18, 25, 0.84);
}

.ingame-card.rarity-kSilver {
  border-color: rgba(166, 177, 184, 0.32);
  background: linear-gradient(135deg, rgba(166, 177, 184, 0.12), transparent 48%), rgba(12, 18, 25, 0.84);
}

.ingame-card.rarity-kPrismatic {
  border-color: rgba(194, 156, 109, 0.4);
  background: linear-gradient(135deg, rgba(194, 156, 109, 0.14), transparent 48%), rgba(12, 18, 25, 0.84);
}

.ingame-card.best {
  border: 2px solid #e2c384;
  background: rgba(17, 29, 38, 0.92);
  box-shadow: inset 0 0 15px rgba(226, 195, 132, 0.18), 0 0 22px rgba(226, 195, 132, 0.14);
}

.ingame-pick {
  position: absolute;
  top: 0;
  right: 0;
  padding: 1px 8px 2px;
  border-radius: 0 0 0 4px;
  background: #e2c384;
  color: #402d00;
  font-size: 10px;
  font-weight: 900;
  line-height: 1.4;
}

.ingame-icon-frame {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(226, 192, 143, 0.34);
  border-radius: 4px;
  background: rgba(8, 21, 30, 0.9);
  box-shadow: inset 0 0 10px rgba(194, 156, 109, 0.12);
  overflow: hidden;
}

.ingame-card.best .ingame-icon-frame {
  border-color: rgba(226, 195, 132, 0.62);
  box-shadow: inset 0 0 15px rgba(226, 195, 132, 0.16), 0 0 12px rgba(226, 195, 132, 0.24);
}

.ingame-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ingame-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ingame-name {
  font-size: 14px;
  font-weight: 900;
  line-height: 1.2;
  color: #f4ecdc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ingame-card.best .ingame-name {
  color: #e2c384;
  text-shadow: 0 0 7px rgba(226, 195, 132, 0.28);
}

.ingame-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.ingame-stat {
  padding: 3px 7px;
  border: 1px solid rgba(244, 236, 220, 0.1);
  border-radius: 4px;
  background: rgba(7, 10, 13, 0.34);
  white-space: nowrap;
}

.ingame-stat small {
  display: block;
  color: #6f7a82;
  font-size: 9px;
  font-weight: 700;
}

.ingame-stat b {
  color: #f4ecdc;
  font-size: 12px;
  font-weight: 900;
}

.ingame-badge {
  align-self: flex-start;
  padding: 1px 6px;
  border: 1px solid rgba(200, 169, 106, 0.28);
  border-radius: 4px;
  background: rgba(194, 156, 109, 0.1);
  color: #c29c6d;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
}

.ingame-card.best .ingame-badge {
  border-color: rgba(226, 195, 132, 0.42);
  background: rgba(226, 195, 132, 0.12);
  color: #e2c384;
}

.ingame-bar {
  position: absolute;
  left: 10px;
  right: 10px;
  bottom: 5px;
  height: 3px;
  border-radius: 2px;
  background: rgba(244, 236, 220, 0.08);
  overflow: hidden;
}

.ingame-bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #c29c6d, #e2c27a);
}

.ingame-empty {
  grid-column: 1 / -1;
  margin: auto;
  color: #6f7a82;
  font-size: 11px;
}

.ingame-message {
  position: absolute;
  left: 50%;
  top: 2px;
  transform: translateX(-50%);
  z-index: 3;
  margin: 0;
  padding: 1px 8px;
  border: 1px solid rgba(200, 169, 106, 0.28);
  border-radius: 4px;
  background: rgba(7, 10, 13, 0.86);
  color: #e2c27a;
  font-size: 10px;
  white-space: nowrap;
  pointer-events: none;
}

/* ---------- 选人阶段：贴客户端旁边的窄侧栏（观感对齐参考项目 + WeGame 侧栏） ---------- */
.pick-root {
  width: 100vw;
  height: 100vh;
  padding: 6px;
  box-sizing: border-box;
  background: transparent;
}

.pick-panel {
  /* 窄窗和宽窗共用一套 DOM，靠容器查询换布局 */
  container-type: inline-size;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(200, 169, 106, 0.24);
  border-radius: 6px;
  background: linear-gradient(145deg, rgba(17, 25, 35, 0.97), rgba(9, 14, 19, 0.98));
  box-shadow: inset 0 0 24px rgba(194, 156, 109, 0.08), 0 18px 50px rgba(0, 0, 0, 0.42);
  color: #f4ecdc;
  overflow: hidden;
  /* 拖拽区只留标题栏：整块都是 drag 会把滚轮事件吃掉，榜单就滚不动了 */
  -webkit-app-region: no-drag;
}

.pick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(244, 236, 220, 0.08);
  -webkit-app-region: drag;
}

.champ {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.champ-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid rgba(200, 169, 106, 0.28);
  flex-shrink: 0;
}

.champ-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.champ-name {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.champ-meta {
  font-size: 11px;
  color: #a99f8c;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.champ-meta b {
  color: #f4ecdc;
  font-weight: 600;
}

.pick-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.icon-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(200, 169, 106, 0.28);
  border-radius: 4px;
  background: rgba(7, 10, 13, 0.5);
  color: #c29c6d;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.icon-btn:hover {
  border-color: rgba(226, 194, 122, 0.6);
  color: #e2c27a;
}

.pick-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 8px 10px 6px;
  color: #a99f8c;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.pick-count {
  color: #6f7a82;
  font-weight: 600;
}

.pick-empty {
  margin: 0;
  padding: 8px 10px 12px;
  color: #6f7a82;
  font-size: 12px;
}

/* 最适配的四个：宽窗横排、窄窗自动落成一列 */
.best-four {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  gap: 6px;
  padding: 0 10px;
}

.best-card {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid rgba(244, 236, 220, 0.09);
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(244, 236, 220, 0.035), transparent), rgba(12, 18, 25, 0.78);
}

.best-icon-frame {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--augment-rarity-border, rgba(226, 192, 143, 0.34));
  border-radius: 4px;
  background: var(--augment-rarity-bg, rgba(8, 21, 30, 0.9));
  box-shadow: inset 0 0 0 1px var(--augment-rarity-inner, transparent);
  overflow: hidden;
}

.best-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.best-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.best-name {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.best-meta {
  color: #6f7a82;
  font-size: 10px;
  white-space: nowrap;
}

.best-rate {
  color: #e2c27a;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.rarity-tabs {
  display: flex;
  gap: 4px;
  padding: 0 10px 6px;
}

.rarity-tab {
  flex: 1;
  padding: 3px 6px;
  border: 1px solid rgba(200, 169, 106, 0.24);
  border-radius: 4px;
  background: rgba(7, 10, 13, 0.4);
  color: #a99f8c;
  font-size: 11px;
  cursor: pointer;
}

.rarity-tab:hover {
  border-color: rgba(226, 194, 122, 0.5);
  color: #e2c27a;
}

.rarity-tab.active {
  border-color: #e2c27a;
  background: #e2c27a;
  color: #402d00;
  font-weight: 700;
}

.pick-list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 6px 6px;
  list-style: none;
  overflow-y: auto;
  -webkit-app-region: no-drag;
  scrollbar-width: thin;
}

.pick-row {
  display: grid;
  grid-template-columns: 22px 24px minmax(0, 1fr) 26px 46px 46px;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  border-radius: 3px;
  font-size: 12px;
}

.pick-row:nth-child(odd) {
  background: rgba(244, 236, 220, 0.03);
}

.pick-row:hover {
  background: rgba(194, 156, 109, 0.12);
}

.row-rank {
  color: #6f7a82;
  font-size: 11px;
  text-align: right;
}

.row-icon-frame {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--augment-rarity-border, rgba(244, 236, 220, 0.12));
  border-radius: 3px;
  background: var(--augment-rarity-bg, rgba(8, 21, 30, 0.8));
  box-shadow: inset 0 0 0 1px var(--augment-rarity-inner, transparent);
  overflow: hidden;
}

.row-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.row-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-tier {
  color: #a99f8c;
  font-size: 11px;
}

.row-rate {
  color: #e2c27a;
  font-weight: 700;
  text-align: right;
}

.row-pick {
  color: #6f7a82;
  font-size: 11px;
  text-align: right;
}

/* 窄侧栏：挤掉次要列，别让字挤成一团 */
@container (max-width: 430px) {
  .champ-meta {
    font-size: 10px;
  }

  /* 窄窗只收起"选取率"：T 级要留着（玩家看的就是这套排名） */
  .pick-row {
    grid-template-columns: 20px 24px minmax(0, 1fr) 24px 44px;
  }

  .row-pick {
    display: none;
  }
}
</style>
