import { computed, ref, type Ref } from 'vue'
import {
  calculateSidebarWidth,
  loadSidebarWidth,
  saveSidebarWidth,
  type SidebarWidthStorage
} from '../utils/sidebarWidth.ts'

type ResizeListenerTarget = {
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
}

type ResizeDocumentTarget = ResizeListenerTarget & {
  body?: {
    classList: Pick<DOMTokenList, 'add' | 'remove'>
  } | null
}

export interface ResizableSidebarOptions {
  storage?: SidebarWidthStorage
  windowTarget?: ResizeListenerTarget
  documentTarget?: ResizeDocumentTarget
}

export function useResizableSidebar(
  sidebarElement: Ref<HTMLElement | null>,
  options: ResizableSidebarOptions = {}
) {
  const sidebarWidth = ref(loadSidebarWidth(options.storage))
  const isResizing = ref(false)
  const sidebarStyle = computed(() => ({
    '--sidebar-width': `${sidebarWidth.value}px`
  }))

  let listenersAttached = false

  function startResize(event: MouseEvent) {
    event.preventDefault()
    isResizing.value = true
    updateSidebarWidth(event.clientX)
    setBodyResizing(true)
    attachResizeListeners()
  }

  function finishResize(event?: MouseEvent) {
    if (!isResizing.value) {
      return
    }

    event?.preventDefault()
    isResizing.value = false
    detachResizeListeners()
    setBodyResizing(false)
    sidebarWidth.value = saveSidebarWidth(sidebarWidth.value, options.storage)
  }

  function cleanupSidebarResize() {
    if (isResizing.value) {
      sidebarWidth.value = saveSidebarWidth(sidebarWidth.value, options.storage)
    }

    isResizing.value = false
    detachResizeListeners()
    setBodyResizing(false)
  }

  function handleResizeMove(event: Event) {
    if (!isResizing.value) {
      return
    }

    const mouseEvent = event as MouseEvent
    mouseEvent.preventDefault()
    updateSidebarWidth(mouseEvent.clientX)
  }

  function handleResizeUp(event: Event) {
    finishResize(event as MouseEvent)
  }

  function handleWindowBlur() {
    finishResize()
  }

  function handleDocumentMouseLeave(event: Event) {
    const mouseEvent = event as MouseEvent
    if (mouseEvent.relatedTarget === null) {
      finishResize()
    }
  }

  function updateSidebarWidth(clientX: number) {
    const sidebarLeft = sidebarElement.value?.getBoundingClientRect().left ?? 0
    sidebarWidth.value = calculateSidebarWidth(clientX, sidebarLeft)
  }

  function attachResizeListeners() {
    if (listenersAttached) {
      return
    }

    getWindowTarget()?.addEventListener('mousemove', handleResizeMove)
    getWindowTarget()?.addEventListener('mouseup', handleResizeUp)
    getWindowTarget()?.addEventListener('blur', handleWindowBlur)
    getDocumentTarget()?.addEventListener('mouseleave', handleDocumentMouseLeave)
    listenersAttached = true
  }

  function detachResizeListeners() {
    if (!listenersAttached) {
      return
    }

    getWindowTarget()?.removeEventListener('mousemove', handleResizeMove)
    getWindowTarget()?.removeEventListener('mouseup', handleResizeUp)
    getWindowTarget()?.removeEventListener('blur', handleWindowBlur)
    getDocumentTarget()?.removeEventListener('mouseleave', handleDocumentMouseLeave)
    listenersAttached = false
  }

  function setBodyResizing(enabled: boolean) {
    const classList = getDocumentTarget()?.body?.classList
    if (enabled) {
      classList?.add('sidebar-resizing')
    } else {
      classList?.remove('sidebar-resizing')
    }
  }

  function getWindowTarget() {
    if (options.windowTarget) {
      return options.windowTarget
    }

    if (typeof window === 'undefined') {
      return null
    }

    return window as unknown as ResizeListenerTarget
  }

  function getDocumentTarget() {
    if (options.documentTarget) {
      return options.documentTarget
    }

    if (typeof document === 'undefined') {
      return null
    }

    return document as unknown as ResizeDocumentTarget
  }

  return {
    sidebarWidth,
    sidebarStyle,
    isResizing,
    startResize,
    finishResize,
    cleanupSidebarResize
  }
}
