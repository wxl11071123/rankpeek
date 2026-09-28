<template>
  <div class="summoner-view">
    <SummonerMatchHistoryPanel
      :summoner="resolvedSearchResult"
      variant="lookup"
      :connected="gameStore.connected"
      :local-cache-enabled="lookupUsesLocalCache"
      :lookup-query="searchName"
      :lookup-loading="loading"
      :lookup-error="error"
      :recent-lookup-summoners="recentLookupSummoners"
      :active-lookup-name="activeLookupName"
      @update:lookup-query="searchName = $event"
      @lookup="searchSummoner()"
      @select-recent-lookup="searchSummoner($event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import SummonerMatchHistoryPanel from '@/components/summoner/SummonerMatchHistoryPanel.vue'
import { useGameStore } from '@/stores/game'
import { useI18n } from '@/i18n'
import type { Summoner } from '@/types/api'

const gameStore = useGameStore()
const route = useRoute()
const { t } = useI18n()

const RECENT_LOOKUP_STORAGE_KEY = 'rankpeek:summoner:recent-lookups'
const RECENT_LOOKUP_LIMIT = 7

interface PersistedRecentLookupState {
  lastLookupName: string
  summoners: Summoner[]
}

const searchName = ref('')
const searchResult = ref<Summoner | null>(null)
const loading = ref(false)
const error = ref('')
const recentLookupSummoners = ref<Summoner[]>([])
const lastLookupName = ref('')
let searchRequestId = 0

const resolvedSearchResult = computed(() => searchResult.value)
const activeLookupName = computed(() => searchResult.value ? formatSummonerName(searchResult.value) : searchName.value)
const lookupUsesLocalCache = computed(() =>
  Boolean(
    gameStore.currentSummoner?.puuid &&
    searchResult.value?.puuid &&
    gameStore.currentSummoner.puuid === searchResult.value.puuid
  )
)

function formatSummonerName(summoner: Summoner | null | undefined): string {
  if (!summoner) {
    return ''
  }
  return summoner.tagLine ? `${summoner.gameName}#${summoner.tagLine}` : summoner.gameName
}

function normalizeLookupName(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toPersistedSummonerIdentity(summoner: Summoner): Summoner {
  return {
    gameName: summoner.gameName,
    tagLine: summoner.tagLine,
    puuid: summoner.puuid,
    profileIconId: summoner.profileIconId,
    summonerLevel: summoner.summonerLevel,
    summonerId: summoner.summonerId
  }
}

function readPersistedSummonerIdentity(value: unknown): Summoner | null {
  if (!isRecord(value)) {
    return null
  }

  const gameName = readString(value.gameName).trim()
  if (!gameName) {
    return null
  }

  return {
    gameName,
    tagLine: readString(value.tagLine).trim(),
    puuid: readString(value.puuid).trim(),
    profileIconId: readNumber(value.profileIconId),
    summonerLevel: readNumber(value.summonerLevel),
    summonerId: readNumber(value.summonerId)
  }
}

function getSummonerLookupKey(summoner: Summoner): string {
  return summoner.puuid
    ? `puuid:${summoner.puuid}`
    : `name:${normalizeLookupName(formatSummonerName(summoner))}`
}

function persistRecentLookupState() {
  try {
    localStorage.setItem(RECENT_LOOKUP_STORAGE_KEY, JSON.stringify({
      lastLookupName: lastLookupName.value,
      summoners: recentLookupSummoners.value.map(toPersistedSummonerIdentity)
    }))
  } catch {
    // Lookup history is a convenience cache; storage failures should not block search.
  }
}

function loadRecentLookupState() {
  let parsed: unknown
  try {
    const raw = localStorage.getItem(RECENT_LOOKUP_STORAGE_KEY)
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    return
  }

  if (!isRecord(parsed)) {
    return
  }

  const nextSummoners = Array.isArray(parsed.summoners)
    ? parsed.summoners
      .map(readPersistedSummonerIdentity)
      .filter((summoner): summoner is Summoner => summoner !== null)
      .slice(0, RECENT_LOOKUP_LIMIT)
    : []

  recentLookupSummoners.value = nextSummoners
  lastLookupName.value = readString(parsed.lastLookupName).trim() || formatSummonerName(nextSummoners[0] || null)
}

function rememberLookupSummoner(summoner: Summoner) {
  const key = getSummonerLookupKey(summoner)
  const next = recentLookupSummoners.value.filter(item => getSummonerLookupKey(item) !== key)

  lastLookupName.value = formatSummonerName(summoner)
  recentLookupSummoners.value = [summoner, ...next].slice(0, RECENT_LOOKUP_LIMIT)
  persistRecentLookupState()
}

function summonerMatchesLookup(summoner: Summoner, keyword: string): boolean {
  const normalizedKeyword = normalizeLookupName(keyword)
  if (!normalizedKeyword) {
    return false
  }

  return normalizedKeyword === normalizeLookupName(formatSummonerName(summoner)) ||
    normalizedKeyword === normalizeLookupName(summoner.gameName)
}

function resolveCurrentSummonerLookup(keyword: string): Summoner | null {
  const currentSummoner = gameStore.currentSummoner
  if (!currentSummoner?.puuid || !summonerMatchesLookup(currentSummoner, keyword)) {
    return null
  }
  return currentSummoner
}

async function searchSummoner(nameOverride?: string) {
  const keyword = (nameOverride ?? searchName.value).trim()
  if (!keyword) {
    return
  }

  const requestId = ++searchRequestId
  searchName.value = keyword
  error.value = ''
  searchResult.value = null

  const currentSummoner = resolveCurrentSummonerLookup(keyword)
  if (currentSummoner) {
    searchResult.value = currentSummoner
    rememberLookupSummoner(currentSummoner)
    loading.value = false
    return
  }

  loading.value = true

  try {
    const summoner = await gameStore.fetchSummonerByName(keyword)
    if (requestId !== searchRequestId) {
      return
    }

    if (!summoner) {
      error.value = t('summoner.notFound')
      return
    }

    searchResult.value = summoner
    rememberLookupSummoner(summoner)
  } catch (err) {
    if (requestId !== searchRequestId) {
      return
    }

    console.error('Failed to search summoner', err)
    searchResult.value = null
    error.value = t('summoner.searchFailed')
  } finally {
    if (requestId === searchRequestId) {
      loading.value = false
    }
  }
}

async function applyRouteQueryName(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return
  }
  if (value === searchName.value && searchResult.value) {
    return
  }
  await searchSummoner(value)
}

async function restoreLastLookupIfNeeded() {
  if (typeof route.query.name === 'string' && route.query.name.trim()) {
    return
  }
  if (!lastLookupName.value) {
    return
  }

  await searchSummoner(lastLookupName.value)
}

onMounted(async () => {
  loadRecentLookupState()
  if (typeof route.query.name === 'string' && route.query.name.trim()) {
    await applyRouteQueryName(route.query.name)
    return
  }
  await restoreLastLookupIfNeeded()
})

watch(
  () => route.query.name,
  async value => {
    if (typeof value !== 'string' || !value.trim()) {
      await restoreLastLookupIfNeeded()
      return
    }
    await applyRouteQueryName(value)
  }
)

watch(
  () => gameStore.currentSummoner,
  currentSummoner => {
    if (!currentSummoner || !searchName.value || !summonerMatchesLookup(currentSummoner, searchName.value)) {
      return
    }
    searchRequestId += 1
    searchResult.value = currentSummoner
    rememberLookupSummoner(currentSummoner)
    error.value = ''
    loading.value = false
  }
)
</script>

<style scoped>
.summoner-view {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
</style>
