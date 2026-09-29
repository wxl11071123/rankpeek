<template>
  <button
    ref="buttonRef"
    class="refresh-icon-btn"
    :class="{ loading: isAnimating }"
    :style="animationCycleStyle"
    type="button"
    :disabled="isDisabled"
    :aria-label="accessibleLabel"
    :title="buttonTitle"
    :aria-busy="isAnimating ? 'true' : undefined"
    :aria-disabled="isDisabled ? 'true' : undefined"
    @pointermove="updateGlow"
    @pointerleave="updateNearbyGlow"
    @blur="resetGlow"
    @click="handleClick"
  >
    <svg
      ref="spinnerRef"
      class="refresh-icon"
      :class="{ 'is-spinning': isAnimating }"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19.2 9.2A7.6 7.6 0 1 0 20 13.4"
        stroke="currentColor"
        stroke-width="2.25"
        stroke-linecap="round"
      />
      <path
        d="M19.2 4.8v4.4h-4.4"
        stroke="currentColor"
        stroke-width="2.25"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'

interface Props {
  ariaLabel?: string
  label?: string
  loading?: boolean
  busy?: boolean
  disabled?: boolean
  title?: string
}

const REFRESH_ANIMATION_CYCLE_MS = 800
const REDUCED_MOTION_ANIMATION_CYCLE_MS = 1100
const REFRESH_EDGE_GLOW_RANGE = 96
const REFRESH_EDGE_GLOW_MIN = 0.03
const REFRESH_EDGE_GLOW_FALLOFF = 1.72

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  busy: false,
  disabled: false
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const isAnimating = ref(false)
const animationCycleMs = ref(REFRESH_ANIMATION_CYCLE_MS)
const buttonRef = ref<HTMLButtonElement | null>(null)
const spinnerRef = ref<SVGSVGElement | null>(null)
const externalLoading = computed(() => props.loading || props.busy)
const accessibleLabel = computed(() => props.ariaLabel || props.label || '')
const isDisabled = computed(() => props.disabled || externalLoading.value || isAnimating.value)
const buttonTitle = computed(() => props.title || accessibleLabel.value)
const animationCycleStyle = computed(() => ({
  '--refresh-action-cycle': `${animationCycleMs.value}ms`
}))

let animationStartedAt = 0
let stopTimer: number | null = null
let activeSpinnerAnimation: Animation | null = null
let prefersReducedMotionQuery: MediaQueryList | null = null
let pointerListenerAttached = false

function getCurrentTimeMs() {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function getAnimationCycleMs() {
  return animationCycleMs.value
}

function updateMotionPreference() {
  animationCycleMs.value = prefersReducedMotionQuery?.matches
    ? REDUCED_MOTION_ANIMATION_CYCLE_MS
    : REFRESH_ANIMATION_CYCLE_MS
}

function restartSpinnerAnimation() {
  cancelSpinnerAnimation()
  void nextTick(playSpinnerAnimation)
}

function handleReducedMotionChange() {
  updateMotionPreference()
  if (isAnimating.value) {
    restartSpinnerAnimation()
  }
}

function clearStopTimer() {
  if (!stopTimer) {
    return
  }
  window.clearTimeout(stopTimer)
  stopTimer = null
}

function playSpinnerAnimation() {
  if (!isAnimating.value || activeSpinnerAnimation || !spinnerRef.value) {
    return
  }

  activeSpinnerAnimation = spinnerRef.value.animate([
    { transform: 'rotate(0deg)' },
    { transform: 'rotate(360deg)' }
  ], {
    duration: getAnimationCycleMs(),
    easing: 'linear',
    iterations: Infinity
  })
}

function cancelSpinnerAnimation() {
  if (!activeSpinnerAnimation) {
    return
  }
  activeSpinnerAnimation.cancel()
  activeSpinnerAnimation = null
}

function setEdgeGlow(target: HTMLElement, top = 0, right = 0, bottom = 0, left = 0) {
  const maxStrength = Math.max(top, right, bottom, left)
  target.style.setProperty('--refresh-edge-top-alpha', top.toFixed(3))
  target.style.setProperty('--refresh-edge-right-alpha', right.toFixed(3))
  target.style.setProperty('--refresh-edge-bottom-alpha', bottom.toFixed(3))
  target.style.setProperty('--refresh-edge-left-alpha', left.toFixed(3))
  target.style.setProperty('--refresh-glow-opacity', maxStrength.toFixed(3))

  if (maxStrength > REFRESH_EDGE_GLOW_MIN) {
    target.dataset.nearGlow = 'true'
  } else {
    delete target.dataset.nearGlow
  }
}

function resetGlowElement(target: HTMLElement) {
  target.style.setProperty('--refresh-glow-x', '50%')
  target.style.setProperty('--refresh-glow-y', '50%')
  setEdgeGlow(target)
  delete target.dataset.nearGlow
}

function applyGlowElement(target: HTMLElement, clientX: number, clientY: number) {
  const rect = target.getBoundingClientRect()
  if (!rect.width || !rect.height) {
    resetGlowElement(target)
    return false
  }

  const x = clientX - rect.left
  const y = clientY - rect.top
  const clampedX = Math.min(Math.max(x, 0), rect.width)
  const clampedY = Math.min(Math.max(y, 0), rect.height)
  const inRange = x >= -REFRESH_EDGE_GLOW_RANGE
    && x <= rect.width + REFRESH_EDGE_GLOW_RANGE
    && y >= -REFRESH_EDGE_GLOW_RANGE
    && y <= rect.height + REFRESH_EDGE_GLOW_RANGE

  target.style.setProperty('--refresh-glow-x', `${clampedX}px`)
  target.style.setProperty('--refresh-glow-y', `${clampedY}px`)

  if (!inRange) {
    setEdgeGlow(target)
    return false
  }

  const strength = (distance: number) => {
    const raw = Math.max(0, 1 - Math.min(Math.abs(distance), REFRESH_EDGE_GLOW_RANGE) / REFRESH_EDGE_GLOW_RANGE)
    return Math.pow(raw, REFRESH_EDGE_GLOW_FALLOFF)
  }

  const top = strength(y)
  const right = strength(rect.width - x)
  const bottom = strength(rect.height - y)
  const left = strength(x)
  const maxStrength = Math.max(top, right, bottom, left)

  setEdgeGlow(target, top, right, bottom, left)
  return maxStrength > REFRESH_EDGE_GLOW_MIN
}

function updateGlow(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement | null
  if (!target) {
    return
  }

  if (isDisabled.value) {
    resetGlowElement(target)
    return
  }

  applyGlowElement(target, event.clientX, event.clientY)
}

function updateNearbyGlow(event: PointerEvent) {
  const target = buttonRef.value
  if (!target) {
    return
  }

  if (isDisabled.value) {
    resetGlowElement(target)
    return
  }

  applyGlowElement(target, event.clientX, event.clientY)
}

function resetGlow(event: PointerEvent | FocusEvent) {
  const target = event.currentTarget as HTMLElement | null
  if (!target) {
    return
  }
  resetGlowElement(target)
}

function attachPointerListener() {
  if (pointerListenerAttached) {
    return
  }
  document.addEventListener('pointermove', updateNearbyGlow, { capture: true, passive: true })
  pointerListenerAttached = true
}

function detachPointerListener() {
  if (!pointerListenerAttached) {
    return
  }
  document.removeEventListener('pointermove', updateNearbyGlow, true)
  pointerListenerAttached = false
}

function startAnimation() {
  clearStopTimer()
  if (isAnimating.value) {
    playSpinnerAnimation()
    return
  }
  animationStartedAt = getCurrentTimeMs()
  isAnimating.value = true
  void nextTick(playSpinnerAnimation)
}

function scheduleStopAfterCurrentCycle() {
  clearStopTimer()
  if (!isAnimating.value) {
    return
  }

  const elapsedMs = Math.max(0, getCurrentTimeMs() - animationStartedAt)
  const elapsedInCurrentCycle = elapsedMs % getAnimationCycleMs()
  const remainingCycleMs = getAnimationCycleMs() - elapsedInCurrentCycle

  stopTimer = window.setTimeout(() => {
    stopTimer = null
    if (externalLoading.value) {
      return
    }
    cancelSpinnerAnimation()
    isAnimating.value = false
  }, Math.max(16, remainingCycleMs))
}

function handleClick(event: MouseEvent) {
  if (isDisabled.value) return
  startAnimation()
  emit('click', event)
  scheduleStopAfterCurrentCycle()
}

watch(externalLoading, busy => {
  if (busy) {
    startAnimation()
    return
  }
  scheduleStopAfterCurrentCycle()
}, { immediate: true, flush: 'sync' })

onMounted(() => {
  prefersReducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null
  updateMotionPreference()
  prefersReducedMotionQuery?.addEventListener('change', handleReducedMotionChange)
  attachPointerListener()
  playSpinnerAnimation()
})

onActivated(attachPointerListener)

onDeactivated(() => {
  detachPointerListener()
  buttonRef.value && resetGlowElement(buttonRef.value)
})

onBeforeUnmount(() => {
  clearStopTimer()
  cancelSpinnerAnimation()
  detachPointerListener()
  prefersReducedMotionQuery?.removeEventListener('change', handleReducedMotionChange)
  prefersReducedMotionQuery = null
})
</script>

<style scoped>
.refresh-icon-btn {
  --refresh-glow-x: 50%;
  --refresh-glow-y: 50%;
  --refresh-glow-opacity: 0;
  --refresh-edge-size: 86px;
  --refresh-edge-width: 1px;
  --refresh-edge-offset: -1px;
  --refresh-bg: transparent;
  --refresh-bg-hover: rgba(41, 151, 255, 0.08);
  --refresh-bg-active: rgba(41, 151, 255, 0.12);
  --refresh-border: rgba(255, 255, 255, 0.12);
  --refresh-border-hover: rgba(92, 181, 255, 0.62);
  --refresh-border-focus: rgba(92, 181, 255, 0.78);
  --refresh-border-active: rgba(92, 181, 255, 0.86);
  --refresh-local-core: rgba(78, 215, 255, 0.98);
  --refresh-local-fade: rgba(41, 151, 255, 0.48);
  --refresh-edge-rgb: 78, 215, 255;
  --refresh-edge-top-alpha: 0;
  --refresh-edge-right-alpha: 0;
  --refresh-edge-bottom-alpha: 0;
  --refresh-edge-left-alpha: 0;
  --refresh-edge-shadow:
    inset 0 1px 0 rgba(var(--refresh-edge-rgb), var(--refresh-edge-top-alpha)),
    inset -1px 0 0 rgba(var(--refresh-edge-rgb), var(--refresh-edge-right-alpha)),
    inset 0 -1px 0 rgba(var(--refresh-edge-rgb), var(--refresh-edge-bottom-alpha)),
    inset 1px 0 0 rgba(var(--refresh-edge-rgb), var(--refresh-edge-left-alpha)),
    0 -3px 12px -6px rgba(var(--refresh-edge-rgb), calc(var(--refresh-edge-top-alpha) * 0.56)),
    3px 0 12px -6px rgba(var(--refresh-edge-rgb), calc(var(--refresh-edge-right-alpha) * 0.56)),
    0 3px 12px -6px rgba(var(--refresh-edge-rgb), calc(var(--refresh-edge-bottom-alpha) * 0.56)),
    -3px 0 12px -6px rgba(var(--refresh-edge-rgb), calc(var(--refresh-edge-left-alpha) * 0.56));
  --refresh-hover-shadow:
    0 0 0 1px rgba(41, 151, 255, 0.12),
    0 0 14px rgba(41, 151, 255, 0.2);
  --refresh-focus-shadow:
    0 0 0 2px rgba(41, 151, 255, 0.2),
    0 0 18px rgba(41, 151, 255, 0.26);
  --refresh-active-shadow:
    0 0 0 1px rgba(41, 151, 255, 0.16),
    0 0 18px rgba(41, 151, 255, 0.28);
  box-sizing: border-box;
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 0;
  position: relative;
  isolation: isolate;
  overflow: visible;
  border: 1px solid var(--refresh-border);
  border-radius: 999px;
  background: var(--refresh-bg);
  color: #fff;
  box-shadow: none;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    box-shadow 0.24s ease,
    color 0.18s ease,
    opacity 0.18s ease;
}

.refresh-icon-btn::before {
  content: '';
  position: absolute;
  inset: var(--refresh-edge-offset);
  border-radius: inherit;
  background: radial-gradient(
    circle var(--refresh-edge-size) at calc(var(--refresh-glow-x) + 1px) calc(var(--refresh-glow-y) + 1px),
    var(--refresh-local-core) 0%,
    var(--refresh-local-fade) 42%,
    transparent 78%
  );
  padding: var(--refresh-edge-width);
  opacity: 0;
  pointer-events: none;
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  transition: opacity 0.14s ease;
  z-index: 0;
}

.refresh-icon-btn:hover:not(:disabled)::before,
.refresh-icon-btn[data-near-glow='true']:not(:disabled)::before {
  opacity: var(--refresh-glow-opacity);
}

.refresh-icon-btn:focus-visible::before {
  opacity: 1;
}

.refresh-icon-btn:active:not(:disabled)::before {
  opacity: 0.55;
}

.refresh-icon-btn:hover:not(:disabled) {
  border-color: var(--refresh-border-hover);
  background: var(--refresh-bg-hover);
  box-shadow:
    var(--refresh-hover-shadow),
    var(--refresh-edge-shadow);
  color: #fff;
  outline: none;
}

.refresh-icon-btn[data-near-glow='true']:not(:hover):not(:focus-visible):not(:disabled) {
  border-color: var(--refresh-border);
  box-shadow: var(--refresh-edge-shadow);
  color: #fff;
  outline: none;
}

.refresh-icon-btn:focus-visible {
  border-color: var(--refresh-border-focus);
  box-shadow:
    var(--refresh-focus-shadow),
    var(--refresh-edge-shadow);
  color: #fff;
  outline: none;
}

.refresh-icon-btn:active:not(:disabled) {
  border-color: var(--refresh-border-active);
  background: var(--refresh-bg-active);
  box-shadow:
    var(--refresh-active-shadow),
    var(--refresh-edge-shadow);
}

.refresh-icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.refresh-icon-btn.loading:disabled {
  opacity: 1;
}

.refresh-icon {
  position: relative;
  z-index: 1;
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.35;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform-origin: 50% 50%;
  transform-box: view-box;
  will-change: transform;
}

.refresh-icon.is-spinning {
  animation: rankpeek-refresh-spin var(--refresh-action-cycle) linear infinite;
  filter: drop-shadow(0 0 6px rgba(92, 163, 234, 0.34));
}

@keyframes rankpeek-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .refresh-icon.is-spinning {
    filter: drop-shadow(0 0 5px rgba(92, 163, 234, 0.28));
  }
}

:global([data-theme="light"] .refresh-icon-btn) {
  --refresh-bg: rgba(255, 255, 255, 0);
  --refresh-bg-hover: rgba(41, 151, 255, 0.06);
  --refresh-bg-active: rgba(41, 151, 255, 0.1);
  --refresh-border: rgba(15, 23, 42, 0.12);
  --refresh-border-hover: rgba(41, 151, 255, 0.5);
  --refresh-border-focus: rgba(41, 151, 255, 0.64);
  --refresh-border-active: rgba(41, 151, 255, 0.72);
  --refresh-local-core: rgba(78, 215, 255, 0.98);
  --refresh-local-fade: rgba(41, 151, 255, 0.48);
  --refresh-edge-rgb: 78, 215, 255;
  --refresh-hover-shadow:
    0 0 0 1px rgba(41, 151, 255, 0.08),
    0 0 12px rgba(41, 151, 255, 0.16);
  --refresh-focus-shadow:
    0 0 0 2px rgba(41, 151, 255, 0.18),
    0 0 16px rgba(41, 151, 255, 0.18);
  --refresh-active-shadow:
    0 0 0 1px rgba(41, 151, 255, 0.12),
    0 0 16px rgba(41, 151, 255, 0.2);
  color: #000 !important;
}

:global([data-theme="light"] .refresh-icon-btn:hover) {
  border-color: var(--refresh-border-hover);
  box-shadow:
    var(--refresh-hover-shadow),
    var(--refresh-edge-shadow);
  color: #000 !important;
}

:global([data-theme="light"] .refresh-icon-btn[data-near-glow='true']:not(:hover):not(:focus-visible)) {
  border-color: var(--refresh-border);
  box-shadow: var(--refresh-edge-shadow);
  color: #000 !important;
}

:global([data-theme="light"] .refresh-icon-btn:focus-visible) {
  border-color: var(--refresh-border-focus);
  box-shadow:
    var(--refresh-focus-shadow),
    var(--refresh-edge-shadow);
  color: #000 !important;
}

:global([data-theme="light"] .refresh-icon-btn .refresh-icon),
:global([data-theme="light"] .refresh-icon-btn .refresh-icon path) {
  color: #000 !important;
  stroke: #000 !important;
}
</style>
