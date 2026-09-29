<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import CoachSummaryReportContent from '@/components/CoachSummaryReportContent.vue'
import { getCoachReportHeadline } from '@/services/localAiAnalysis'
import type { CoachSummaryReportV1 } from '@/types/coachSummaryReport'

type ReportLoadState = 'loading' | 'ready' | 'missing' | 'unsupported' | 'invalid' | 'error'

const props = withDefaults(defineProps<{
  open: boolean
  report: CoachSummaryReportV1 | null
  reportLoadState?: ReportLoadState
  errorMessage?: string
  createdAt?: string | null
  isPreview?: boolean
  canNavigate?: boolean
  activeIndex?: number
  reportCount?: number
}>(), {
  reportLoadState: 'ready',
  errorMessage: '',
  createdAt: null,
  isPreview: false,
  canNavigate: false,
  activeIndex: -1,
  reportCount: 0
})

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'previous'): void
  (event: 'next'): void
}>()

const finalSentence = computed(() => (
  props.report ? getCoachReportHeadline({ report: props.report }) : '近期排位复盘'
))

const navigationStatus = computed(() => {
  if (props.reportCount <= 0) {
    return '0 / 0'
  }
  const displayIndex = props.activeIndex >= 0 ? props.activeIndex + 1 : 0
  return `${displayIndex} / ${props.reportCount}`
})

function emitClose() {
  emit('close')
}

function emitPrevious() {
  if (props.canNavigate) {
    emit('previous')
  }
}

function emitNext() {
  if (props.canNavigate) {
    emit('next')
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) {
    return
  }

  if (event.key === 'Escape') {
    emitClose()
    return
  }

  if (event.key === 'ArrowLeft' && props.canNavigate) {
    event.preventDefault()
    emitPrevious()
    return
  }

  if (event.key === 'ArrowRight' && props.canNavigate) {
    event.preventDefault()
    emitNext()
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
      class="coach-report-modal-overlay"
      :class="{ 'has-navigation': canNavigate }"
      @click.self="emitClose"
    >
      <button
        v-if="canNavigate"
        class="coach-report-modal-nav coach-report-modal-nav-previous"
        type="button"
        aria-label="上一份报告"
        :title="`上一份报告（${navigationStatus}）`"
        @click="emitPrevious"
      >
        ‹
      </button>

      <section
        class="coach-report-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-report-modal-title"
      >
        <header class="coach-report-modal-header">
          <div class="coach-report-modal-title">
            <h2 id="coach-report-modal-title" class="coach-report-modal-final-sentence ai-report-prose">{{ finalSentence }}</h2>
          </div>
          <button
            class="coach-report-modal-close"
            type="button"
            aria-label="关闭报告"
            @click="emitClose"
          >
            ×
          </button>
        </header>

        <div class="coach-report-modal-body">
          <CoachSummaryReportContent
            :report="report"
            :report-load-state="reportLoadState"
            :error-message="errorMessage"
            :created-at="createdAt"
            mode="modal"
          />
        </div>
      </section>

      <button
        v-if="canNavigate"
        class="coach-report-modal-nav coach-report-modal-nav-next"
        type="button"
        aria-label="下一份报告"
        :title="`下一份报告（${navigationStatus}）`"
        @click="emitNext"
      >
        ›
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.coach-report-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 36px 48px;
  background: rgba(0, 0, 0, 0.52);
}

.coach-report-modal-panel {
  width: min(1180px, calc(100vw - 96px));
  max-height: calc(100vh - 72px);
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 16% 0%, rgba(var(--accent-rgb), 0.1), transparent 34%),
    var(--bg-secondary);
  box-shadow:
    0 28px 80px rgba(0, 0, 0, 0.42),
    0 0 0 1px rgba(var(--accent-rgb), 0.06);
}

.coach-report-modal-overlay.has-navigation .coach-report-modal-panel {
  width: min(1180px, calc(100vw - 184px));
}

.coach-report-modal-nav {
  position: absolute;
  top: 50%;
  width: 46px;
  height: 62px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%);
  border: 1px solid rgba(var(--accent-rgb), 0.22);
  border-radius: var(--radius-md);
  background: rgba(18, 22, 30, 0.74);
  color: var(--text-primary);
  font-size: 42px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.coach-report-modal-nav:hover,
.coach-report-modal-nav:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.44);
  background: rgba(var(--accent-rgb), 0.16);
  outline: none;
}

.coach-report-modal-nav:active {
  transform: translateY(-50%) scale(0.97);
}

.coach-report-modal-nav-previous {
  left: 24px;
}

.coach-report-modal-nav-next {
  right: 24px;
}

.coach-report-modal-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.coach-report-modal-title {
  min-width: 0;
}

.coach-report-modal-title h2 {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0;
}

.ai-report-prose {
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif;
  font-weight: 700;
  line-height: 1.35;
}

.coach-report-modal-final-sentence.ai-report-prose {
  font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", "SimSun", serif;
  font-weight: 700;
}

.coach-report-modal-close {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.coach-report-modal-close:hover,
.coach-report-modal-close:focus-visible {
  border-color: rgba(var(--accent-rgb), 0.36);
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--text-primary);
  outline: none;
}

.coach-report-modal-body {
  min-height: 0;
  padding: 18px 22px 22px;
  overflow-y: auto;
}

@media (max-width: 720px) {
  .coach-report-modal-overlay {
    padding: 16px;
  }

  .coach-report-modal-panel {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }

  .coach-report-modal-overlay.has-navigation .coach-report-modal-panel {
    width: calc(100vw - 112px);
  }

  .coach-report-modal-nav {
    width: 38px;
    height: 52px;
    font-size: 34px;
  }

  .coach-report-modal-nav-previous {
    left: 10px;
  }

  .coach-report-modal-nav-next {
    right: 10px;
  }

  .coach-report-modal-header {
    padding: 14px;
  }

  .coach-report-modal-title h2 {
    font-size: 24px;
  }

  .coach-report-modal-body {
    padding: 14px;
  }
}
</style>
