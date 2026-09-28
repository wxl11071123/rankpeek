<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import {
  parsePartialPostgameAiStructuredResult,
  parsePostgameAiPraiseResult,
  parsePostgameAiStructuredResult,
  type PostgameAiReviewRosterPlayer,
  type PostgameAiStructuredPlayer
} from '@/services/postgameAiStructuredResult'
import {
  downloadPostgameReviewImage,
  resolvePostgameReviewPlayerIconUrl
} from '@/services/postgameAiShareImage'
import { getChampionIconUrl } from '@/utils/gameAssetUrls'

type PostgameAiAnalysisMode = 'review' | 'praise'
type PostgameAiStreamState = 'idle' | 'preparing' | 'streaming' | 'completed' | 'failed'

const props = withDefaults(defineProps<{
  open: boolean
  mode?: PostgameAiAnalysisMode
  streamState?: PostgameAiStreamState
  streamText?: string
  streamError?: string
  rosterPlayers?: PostgameAiReviewRosterPlayer[]
  championIdByName?: Record<string, number>
  showStartButton?: boolean
}>(), {
  mode: 'review',
  streamState: 'idle',
  streamText: '',
  streamError: '',
  rosterPlayers: () => [],
  championIdByName: () => ({}),
  showStartButton: true
})

const emit = defineEmits<{
  (event: 'start-analysis'): void
  (event: 'cancel-analysis'): void
  (event: 'close'): void
}>()

const isBusy = computed(() => props.streamState === 'preparing' || props.streamState === 'streaming')
const hasStreamOutput = computed(() => props.streamState === 'streaming' || props.streamState === 'completed')
const hasFailed = computed(() => props.streamState === 'failed')
const parsedPostgameReview = computed(() => props.mode === 'review'
  ? parsePostgameAiStructuredResult(props.streamText)
  : { ok: false as const, error: '不是赛后复盘模式' })
const structuredPostgameReview = computed(() => parsedPostgameReview.value.ok ? parsedPostgameReview.value.result : null)
const partialPostgameReview = computed(() => props.mode === 'review' && !structuredPostgameReview.value
  ? parsePartialPostgameAiStructuredResult(props.streamText)
  : { ok: false as const, error: '不是部分赛后复盘结果' })
const displayedPostgameReview = computed(() => structuredPostgameReview.value
  ?? (partialPostgameReview.value.ok ? partialPostgameReview.value.result : null))
const postgameReviewRows = computed(() => displayedPostgameReview.value?.levels ?? [])
const parsedPostgamePraise = computed(() => props.mode === 'praise'
  ? parsePostgameAiPraiseResult(props.streamText)
  : { ok: false as const, error: '不是夸夸机模式' })
const displayedPostgamePraise = computed(() => parsedPostgamePraise.value.ok ? parsedPostgamePraise.value.result : null)
const completedReviewParseError = computed(() => props.mode === 'review' &&
  props.streamState === 'completed' &&
  props.streamText.trim().length > 0 &&
  !displayedPostgameReview.value
    ? parsedPostgameReview.value.error || partialPostgameReview.value.error || '结构化复盘结果解析失败'
    : '')
const modalTitle = computed(() => props.mode === 'praise' ? '夸夸机' : '赛后复盘')
const modalDescription = computed(() => props.mode === 'praise'
  ? '只负责把你这局说舒服，不做教学复盘。'
  : '从夯到拉排位表会按 5 档展示 10 个玩家，并把客观总结一起放进可分享图片。')
const primaryButtonText = computed(() => {
  if (props.streamState === 'preparing') {
    return '准备中'
  }
  if (props.streamState === 'streaming') {
    return '分析中'
  }
  if (props.streamState === 'completed') {
    return props.mode === 'praise' ? '重新夸夸' : '重新复盘'
  }
  if (props.streamState === 'failed') {
    return '重试'
  }
  return props.mode === 'praise' ? '开始夸夸' : '开始复盘'
})

function emitStartAnalysis(): void {
  if (isBusy.value) {
    return
  }
  emit('start-analysis')
}

function getPostgameReviewPlayerIconUrl(player: PostgameAiStructuredPlayer): string {
  return resolvePostgameReviewPlayerIconUrl(player, props.rosterPlayers, getChampionIconUrl, props.championIdByName)
}

function downloadPostgameAiShareImage(): void {
  if (!structuredPostgameReview.value) {
    return
  }

  void downloadPostgameReviewImage(structuredPostgameReview.value, {
    title: modalTitle.value,
    rosterPlayers: props.rosterPlayers,
    championIdByName: props.championIdByName,
    getChampionIconUrl
  }).catch(() => undefined)
}

function requestClose(): void {
  if (isBusy.value) {
    emit('cancel-analysis')
  }
  emit('close')
}

function handleKeydown(event: KeyboardEvent): void {
  if (!props.open) {
    return
  }

  if (event.key === 'Escape') {
    requestClose()
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      document.addEventListener('keydown', handleKeydown)
      return
    }
    document.removeEventListener('keydown', handleKeydown)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="postgame-ai-analysis-overlay"
      @click.self="requestClose"
    >
      <section
        class="postgame-ai-analysis-panel"
        :class="`postgame-ai-analysis-${mode}`"
        role="dialog"
        aria-modal="true"
        aria-labelledby="postgame-ai-analysis-title"
      >
        <header class="postgame-ai-analysis-header">
          <div class="postgame-ai-analysis-heading">
            <h2 id="postgame-ai-analysis-title">{{ modalTitle }}</h2>
            <p>{{ modalDescription }}</p>
          </div>
          <button
            class="postgame-ai-analysis-close"
            type="button"
            aria-label="关闭赛后 AI 弹窗"
            @click="requestClose"
          >
            ×
          </button>
        </header>

        <div class="postgame-ai-analysis-body">
          <section
            v-if="displayedPostgameReview"
            class="postgame-ai-analysis-result postgame-ai-analysis-structured"
          >
            <div class="postgame-ladu-chart" aria-label="从夯到拉赛后复盘表">
              <div
                v-for="row in postgameReviewRows"
                :key="row.label"
                class="postgame-ladu-row"
              >
                <div class="postgame-ladu-label">{{ row.label }}</div>
                <div class="postgame-ladu-players">
                  <article
                    v-for="player in row.players"
                    :key="`${row.label}:${player.playerRef}`"
                    class="postgame-ladu-player"
                    :title="player.phrase"
                  >
                    <img
                      v-if="getPostgameReviewPlayerIconUrl(player)"
                      class="postgame-ladu-avatar"
                      :src="getPostgameReviewPlayerIconUrl(player)"
                      :alt="player.championName"
                    >
                    <span
                      v-else
                      class="postgame-ladu-avatar postgame-ladu-avatar-fallback"
                    >
                      {{ player.championName.slice(0, 2) }}
                    </span>
                    <strong>{{ player.championName }}</strong>
                    <span>{{ player.phrase }}</span>
                  </article>
                </div>
              </div>
              <div class="postgame-ladu-summary">
                <strong>客观总结</strong>
                <p>{{ displayedPostgameReview.summary || '正在生成客观总结...' }}</p>
              </div>
            </div>

            <button
              v-if="structuredPostgameReview"
              class="postgame-ai-analysis-share"
              type="button"
              @click="downloadPostgameAiShareImage"
            >
              生成图片
            </button>
          </section>

          <section
            v-else-if="completedReviewParseError"
            class="postgame-ai-analysis-error"
            role="alert"
          >
            <p>{{ completedReviewParseError }}</p>
            <pre
              v-if="streamText"
              class="postgame-ai-analysis-stream-text"
            >{{ streamText }}</pre>
          </section>

          <section
            v-else-if="hasStreamOutput && mode === 'review'"
            class="postgame-ai-analysis-result"
          >
            <p class="postgame-ai-analysis-streaming-note">正在解析结构化复盘结果，玩家排位会在字段完整后逐步上表。</p>
          </section>

          <section
            v-else-if="displayedPostgamePraise"
            class="postgame-ai-analysis-result postgame-praise-card"
          >
            <h3 class="postgame-praise-headline">
              {{ displayedPostgamePraise.headline }}
            </h3>
            <div class="postgame-praise-copy">
              <p
                v-for="(paragraph, index) in displayedPostgamePraise.paragraphs"
                :key="`praise-paragraph:${index}`"
                class="postgame-praise-paragraph"
              >
                {{ paragraph }}
              </p>
            </div>
          </section>

          <section
            v-else-if="hasStreamOutput && mode === 'praise'"
            class="postgame-ai-analysis-result"
          >
            <p class="postgame-ai-analysis-streaming-note">正在组织夸夸内容，正文出来后会自动显示。</p>
          </section>

          <section
            v-else-if="hasStreamOutput && streamText && mode !== 'review' && mode !== 'praise'"
            class="postgame-ai-analysis-result"
          >
            <pre class="postgame-ai-analysis-stream-text">{{ streamText }}</pre>
          </section>

          <section
            v-else-if="hasFailed"
            class="postgame-ai-analysis-error"
            role="alert"
          >
            {{ streamError || '本地 AI 暂不可用' }}
          </section>

          <section
            v-else
            class="postgame-ai-analysis-placeholder"
          >
            <span class="postgame-ai-analysis-eyebrow">AI 数据闭环</span>
            <p>点击开始后才会构建本局 snapshot 并发送到本地 AI。</p>
          </section>

          <button
            v-if="showStartButton"
            class="postgame-ai-analysis-start"
            type="button"
            :disabled="isBusy"
            @click="emitStartAnalysis"
          >
            {{ primaryButtonText }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.postgame-ai-analysis-overlay {
  position: fixed;
  inset: 0;
  z-index: 1120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  background: rgba(0, 0, 0, 0.5);
}

.postgame-ai-analysis-panel {
  --postgame-review-reading-font: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", "PMingLiU", "Times New Roman", serif;
  --postgame-praise-reading-font: YouYuan, "You Yuan", "Microsoft YaHei UI", "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif;
  --postgame-praise-card-bg:
    linear-gradient(135deg, rgba(236, 198, 96, 0.12), rgba(var(--accent-rgb), 0.07) 54%, rgba(255, 255, 255, 0.025)),
    #111820;
  --postgame-praise-card-border: rgba(236, 198, 96, 0.38);
  --postgame-praise-card-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.045),
    0 16px 34px rgba(0, 0, 0, 0.2);
  --postgame-praise-topline: linear-gradient(90deg, #ecc660, rgba(98, 212, 158, 0.74), rgba(var(--accent-rgb), 0.58));
  --postgame-praise-title-color: #fff3d8;
  --postgame-praise-body-color: rgba(248, 243, 231, 0.92);
  width: min(760px, calc(100vw - 64px));
  max-height: calc(100vh - 64px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(var(--accent-rgb), 0.07), transparent 170px),
    var(--bg-secondary);
  color: var(--text-primary);
  box-shadow:
    0 28px 76px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(var(--accent-rgb), 0.04);
}

.postgame-ai-analysis-header {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--border-color);
}

.postgame-ai-analysis-heading {
  min-width: 0;
}

.postgame-ai-analysis-heading h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 850;
  line-height: 1.25;
  letter-spacing: 0;
}

.postgame-ai-analysis-review .postgame-ai-analysis-heading h2 {
  font-family: var(--postgame-review-reading-font);
  font-weight: 700;
}

.postgame-ai-analysis-praise .postgame-ai-analysis-heading h2 {
  font-family: var(--postgame-praise-reading-font);
  font-synthesis-weight: none;
  font-weight: 400;
}

.postgame-ai-analysis-heading p {
  margin: 7px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.45;
}

.postgame-ai-analysis-close {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.postgame-ai-analysis-close:hover,
.postgame-ai-analysis-close:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.44);
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--text-primary);
  outline: none;
}

.postgame-ai-analysis-body {
  min-height: 0;
  display: grid;
  gap: 14px;
  padding: 18px 20px 20px;
  overflow-y: auto;
}

.postgame-ai-analysis-placeholder,
.postgame-ai-analysis-result,
.postgame-ai-analysis-error {
  display: grid;
  gap: 6px;
  padding: 14px;
  border: 1px dashed rgba(var(--accent-rgb), 0.22);
  border-radius: 8px;
  background: rgba(var(--accent-rgb), 0.055);
}

.postgame-ai-analysis-structured {
  gap: 12px;
  padding: 0;
  border: 0;
  background: transparent;
}

.postgame-ai-analysis-error {
  border-color: rgba(239, 111, 122, 0.32);
  background: rgba(239, 111, 122, 0.08);
  color: #ef6f7a;
  font-size: 13px;
  font-weight: 750;
}

.postgame-ai-analysis-eyebrow {
  color: rgba(var(--accent-rgb), 0.9);
  font-size: 12px;
  font-weight: 850;
  line-height: 1;
}

.postgame-ai-analysis-placeholder p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
}

.postgame-ai-analysis-stream-text {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--postgame-review-reading-font);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.85;
  white-space: pre-wrap;
}

.postgame-ai-analysis-praise .postgame-ai-analysis-stream-text {
  font-family: var(--postgame-praise-reading-font);
  font-synthesis-weight: none;
  font-size: 16px;
  font-weight: 400;
  line-height: 1.92;
}

.postgame-ai-analysis-streaming-note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.45;
}

.postgame-praise-card {
  position: relative;
  gap: 13px;
  padding: 22px 24px 24px;
  overflow: hidden;
  border-style: solid;
  border-color: var(--postgame-praise-card-border);
  background: var(--postgame-praise-card-bg);
  box-shadow: var(--postgame-praise-card-shadow);
  font-synthesis-weight: none;
}

.postgame-praise-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: var(--postgame-praise-topline);
  pointer-events: none;
}

.postgame-praise-headline {
  margin: 0;
  color: var(--postgame-praise-title-color);
  font-family: var(--postgame-praise-reading-font);
  font-size: 24px;
  font-weight: 400;
  line-height: 1.24;
  letter-spacing: 0;
}

.postgame-praise-copy {
  display: grid;
  gap: 12px;
}

.postgame-praise-paragraph {
  margin: 0;
  color: var(--postgame-praise-body-color);
  font-family: var(--postgame-praise-reading-font);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.92;
}

:global([data-theme="light"] .postgame-ai-analysis-panel) {
  --postgame-praise-card-bg:
    linear-gradient(135deg, rgba(255, 246, 222, 0.98), rgba(255, 250, 240, 0.96) 58%, rgba(244, 250, 255, 0.82)),
    #fffaf0;
  --postgame-praise-card-border: rgba(174, 128, 26, 0.34);
  --postgame-praise-card-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.88),
    0 18px 36px rgba(111, 78, 18, 0.12);
  --postgame-praise-topline: linear-gradient(90deg, rgba(190, 142, 32, 0.72), rgba(81, 158, 132, 0.52), rgba(var(--accent-rgb), 0.38));
  --postgame-praise-title-color: #2b2110;
  --postgame-praise-body-color: #3d3220;
}

.postgame-ladu-chart {
  overflow: hidden;
  border: 1px solid rgba(17, 24, 32, 0.36);
  border-radius: 8px;
  background: #f6f6f2;
  color: #111318;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.22);
}

.postgame-ladu-row {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  min-height: 104px;
  border-bottom: 1px solid rgba(17, 24, 32, 0.26);
}

.postgame-ladu-row:nth-child(1) .postgame-ladu-label {
  background: #f04b3e;
}

.postgame-ladu-row:nth-child(2) .postgame-ladu-label {
  background: #f47a3e;
}

.postgame-ladu-row:nth-child(3) .postgame-ladu-label {
  background: #f6c85f;
}

.postgame-ladu-row:nth-child(4) .postgame-ladu-label {
  background: #fff1a8;
}

.postgame-ladu-row:nth-child(5) .postgame-ladu-label {
  background: #f7f0d0;
}

.postgame-ladu-label {
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid rgba(17, 24, 32, 0.28);
  color: #1a1209;
  font-size: 15px;
  font-weight: 900;
  line-height: 1;
}

.postgame-ladu-players {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
  gap: 8px;
  align-content: center;
  align-items: center;
  padding: 10px;
  background: #f6f6f2;
}

.postgame-ladu-player {
  min-width: 0;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 1px 7px;
  align-content: center;
  align-items: center;
}

.postgame-ladu-avatar {
  grid-row: 1 / span 2;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(17, 24, 32, 0.22);
  border-radius: 5px;
  object-fit: cover;
  background: #28313d;
}

.postgame-ladu-avatar-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #d8dfeb;
  font-size: 12px;
  font-weight: 900;
}

.postgame-ladu-player strong,
.postgame-ladu-player span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.postgame-ladu-player strong {
  color: #111318;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.2;
  white-space: nowrap;
}

.postgame-ladu-player span:last-child {
  display: block;
  color: #404855;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.5;
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
}

.postgame-ladu-summary {
  display: grid;
  gap: 6px;
  padding: 13px 15px 15px;
  background: #f6f6f2;
}

.postgame-ladu-summary strong {
  color: #111318;
  font-family: var(--postgame-review-reading-font);
  font-size: 15px;
  font-weight: 700;
}

.postgame-ladu-summary p {
  margin: 0;
  color: #303642;
  font-family: var(--postgame-review-reading-font);
  font-size: 15px;
  font-weight: 500;
  line-height: 1.8;
}

.postgame-ai-analysis-share {
  min-height: 34px;
  justify-self: start;
  padding: 0 14px;
  border: 1px solid rgba(98, 212, 158, 0.28);
  border-radius: 8px;
  background: rgba(98, 212, 158, 0.12);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 850;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.postgame-ai-analysis-share:hover,
.postgame-ai-analysis-share:focus-visible {
  border-color: rgba(98, 212, 158, 0.5);
  background: rgba(98, 212, 158, 0.18);
  outline: none;
}

.postgame-ai-analysis-start {
  min-height: 36px;
  justify-self: start;
  padding: 0 15px;
  border: 1px solid rgba(var(--accent-rgb), 0.28);
  border-radius: 8px;
  background: rgba(var(--accent-rgb), 0.11);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 850;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, opacity 0.16s ease;
}

.postgame-ai-analysis-start:hover,
.postgame-ai-analysis-start:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.48);
  background: rgba(var(--accent-rgb), 0.17);
  outline: none;
}

.postgame-ai-analysis-start:disabled {
  opacity: 0.62;
  cursor: wait;
}

@media (max-width: 720px) {
  .postgame-ai-analysis-overlay {
    padding: 16px;
  }

  .postgame-ai-analysis-panel {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }

  .postgame-ai-analysis-header,
  .postgame-ai-analysis-body {
    padding-left: 14px;
    padding-right: 14px;
  }

  .postgame-praise-card {
    padding: 18px 16px 20px;
  }

  .postgame-praise-headline {
    font-size: 21px;
  }

  .postgame-praise-paragraph {
    font-size: 14px;
    line-height: 1.8;
  }
}
</style>
