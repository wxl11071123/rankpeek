<script lang="ts">
let tooltipSeed = 0
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type { GameAssetTooltipDetails } from '@/utils/gameAssetUrls'

const props = withDefaults(defineProps<{
  details: GameAssetTooltipDetails
  showDelay?: number
}>(), {
  showDelay: 100
})

const triggerRef = ref<HTMLElement | null>(null)
const tooltipRef = ref<HTMLElement | null>(null)
const visible = ref(false)
const position = ref({ top: 0, left: 0 })
const tooltipId = `asset-tooltip-${++tooltipSeed}`

let showTimer: number | undefined
let hideTimer: number | undefined

const tooltipStyle = computed(() => ({
  top: `${position.value.top}px`,
  left: `${position.value.left}px`
}))
const rarityClass = computed(() => detailsToneClass('rarity', props.details.rarityTone))
const visibleSubtitle = computed(() => {
  const subtitle = props.details.subtitle?.trim()
  return subtitle && subtitle === props.details.rarityLabel ? '' : subtitle || ''
})
const sections = computed(() => props.details.sections?.filter(section => section.label || section.text) || [])
const statLines = computed(() => props.details.statLines?.filter(Boolean) || [])
const recipeIconUrls = computed(() => props.details.recipeIconUrls?.filter(Boolean) || [])

function scheduleShow(): void {
  clearTimer('hide')
  clearTimer('show')
  showTimer = window.setTimeout(() => {
    void showTooltip()
  }, props.showDelay)
}

function scheduleHide(): void {
  clearTimer('show')
  clearTimer('hide')
  hideTimer = window.setTimeout(() => {
    hideTooltip()
  }, 80)
}

async function showTooltip(): Promise<void> {
  if (typeof window === 'undefined') {
    return
  }

  visible.value = true
  await nextTick()
  updatePosition()
  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)
}

function hideTooltip(): void {
  visible.value = false
  if (typeof window === 'undefined') {
    return
  }
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
}

function updatePosition(): void {
  if (typeof window === 'undefined' || !triggerRef.value || !tooltipRef.value) {
    return
  }

  const triggerRect = triggerRef.value.getBoundingClientRect()
  const tooltipRect = tooltipRef.value.getBoundingClientRect()
  const viewportMargin = 12
  const triggerGap = 8
  const maxLeft = Math.max(viewportMargin, window.innerWidth - tooltipRect.width - viewportMargin)
  const belowTop = triggerRect.bottom + triggerGap
  const aboveTop = triggerRect.top - tooltipRect.height - triggerGap
  const wouldOverflowBottom = belowTop + tooltipRect.height > window.innerHeight - viewportMargin

  position.value = {
    left: clamp(triggerRect.left, viewportMargin, maxLeft),
    top: wouldOverflowBottom
      ? Math.max(viewportMargin, aboveTop)
      : Math.max(viewportMargin, belowTop)
  }
}

function clearTimer(kind: 'show' | 'hide'): void {
  const timer = kind === 'show' ? showTimer : hideTimer
  if (timer === undefined || typeof window === 'undefined') {
    return
  }

  window.clearTimeout(timer)
  if (kind === 'show') {
    showTimer = undefined
  } else {
    hideTimer = undefined
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function detailsToneClass(prefix: string, tone?: string): string {
  return tone ? `asset-hover-tooltip-${prefix}-${tone}` : ''
}

onBeforeUnmount(() => {
  clearTimer('show')
  clearTimer('hide')
  hideTooltip()
})
</script>

<template>
  <span
    ref="triggerRef"
    class="asset-tooltip-trigger"
    tabindex="0"
    :aria-describedby="visible ? tooltipId : undefined"
    @mouseenter="scheduleShow"
    @focusin="scheduleShow"
    @mouseleave="scheduleHide"
    @focusout="scheduleHide"
  >
    <slot />
  </span>

  <Teleport to="body">
    <div
      v-if="visible"
      :id="tooltipId"
      ref="tooltipRef"
      class="asset-hover-tooltip"
      role="tooltip"
      :style="tooltipStyle"
    >
      <img
        class="asset-hover-tooltip-icon"
        :src="details.iconUrl"
        alt=""
      >
      <div class="asset-hover-tooltip-copy">
        <div class="asset-hover-tooltip-title">
          {{ details.name }}
        </div>
        <div
          v-if="visibleSubtitle"
          class="asset-hover-tooltip-subtitle"
        >
          {{ visibleSubtitle }}
        </div>
        <div
          v-if="details.rarityLabel"
          class="asset-hover-tooltip-rarity"
          :class="rarityClass"
        >
          {{ details.rarityLabel }}
        </div>
        <div
          v-if="details.priceText"
          class="asset-hover-tooltip-price"
        >
          {{ details.priceText }}
        </div>
        <div
          v-if="recipeIconUrls.length"
          class="asset-hover-tooltip-recipe"
          aria-hidden="true"
        >
          <img
            v-for="iconUrl in recipeIconUrls"
            :key="iconUrl"
            class="asset-hover-tooltip-recipe-icon"
            :src="iconUrl"
            alt=""
          >
        </div>
        <div
          v-if="statLines.length"
          class="asset-hover-tooltip-stats"
        >
          <div
            v-for="line in statLines"
            :key="line"
            class="asset-hover-tooltip-stat"
          >
            {{ line }}
          </div>
        </div>
        <div
          v-if="sections.length"
          class="asset-hover-tooltip-sections"
        >
          <section
            v-for="section in sections"
            :key="`${section.tone || 'body'}-${section.label || section.text}`"
            class="asset-hover-tooltip-section"
            :class="detailsToneClass('section', section.tone)"
          >
            <div
              v-if="section.label"
              class="asset-hover-tooltip-section-label"
            >
              {{ section.label }}
            </div>
            <p class="asset-hover-tooltip-section-body">
              {{ section.text }}
            </p>
          </section>
        </div>
        <p
          v-else
          class="asset-hover-tooltip-description"
        >
          {{ details.description || '暂无详细说明' }}
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.asset-tooltip-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  outline: none;
}

.asset-tooltip-trigger:focus-visible {
  box-shadow: 0 0 0 2px rgba(201, 170, 113, 0.72);
}

.asset-hover-tooltip {
  position: fixed;
  z-index: 10000;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 10px;
  max-width: min(280px, calc(100vw - 24px));
  box-sizing: border-box;
  padding: 10px;
  border: 1px solid rgba(201, 170, 113, 0.48);
  border-radius: 4px;
  background: rgba(9, 13, 21, 0.94);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.38);
  color: #edf1f7;
  pointer-events: none;
}

.asset-hover-tooltip-icon {
  width: 42px;
  height: 42px;
  border: 1px solid rgba(201, 170, 113, 0.34);
  border-radius: 4px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.08);
}

.asset-hover-tooltip-copy {
  min-width: 0;
}

.asset-hover-tooltip-title {
  color: #f5d99a;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
}

.asset-hover-tooltip-subtitle {
  margin-top: 2px;
  color: rgba(218, 226, 239, 0.68);
  font-size: 11px;
  line-height: 1.25;
}

.asset-hover-tooltip-description {
  margin: 7px 0 0;
  color: rgba(237, 241, 247, 0.92);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-line;
}

.asset-hover-tooltip-rarity,
.asset-hover-tooltip-price {
  margin-top: 5px;
  color: rgba(218, 226, 239, 0.76);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
}

.asset-hover-tooltip-rarity-gold {
  color: #e2bd68;
}

.asset-hover-tooltip-rarity-silver {
  color: #c8d4e4;
}

.asset-hover-tooltip-rarity-prismatic {
  color: #d9a7ff;
}

.asset-hover-tooltip-recipe {
  display: flex;
  gap: 4px;
  margin-top: 7px;
}

.asset-hover-tooltip-recipe-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  border: 1px solid rgba(201, 170, 113, 0.26);
  border-radius: 3px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.08);
}

.asset-hover-tooltip-stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 7px;
}

.asset-hover-tooltip-stat {
  color: #8fd6bd;
  font-size: 12px;
  line-height: 1.35;
}

.asset-hover-tooltip-sections {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 8px;
}

.asset-hover-tooltip-section {
  min-width: 0;
}

.asset-hover-tooltip-section-label {
  color: #f5d99a;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
}

.asset-hover-tooltip-section-active .asset-hover-tooltip-section-label {
  color: #8fd6ff;
}

.asset-hover-tooltip-section-body {
  margin: 1px 0 0;
  color: rgba(237, 241, 247, 0.92);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-line;
}
</style>
