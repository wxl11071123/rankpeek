import test from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY
} from '../utils/sidebarWidth.ts'
import { useResizableSidebar } from './useResizableSidebar.ts'

class MemoryStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<EventListener>>()

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type: string, event: MouseEvent) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event)
    }
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0
  }
}

function createDocumentTarget() {
  const classes = new Set<string>()
  const target = Object.assign(new FakeEventTarget(), {
    body: {
      classList: {
        add: (className: string) => classes.add(className),
        remove: (className: string) => classes.delete(className)
      }
    }
  })

  return {
    target,
    classes
  }
}

function createMouseEvent(clientX: number, relatedTarget: EventTarget | null = null) {
  return {
    clientX,
    relatedTarget,
    prevented: false,
    preventDefault() {
      this.prevented = true
    }
  } as MouseEvent & { prevented: boolean }
}

function createSidebarElement(left = 0) {
  return {
    getBoundingClientRect: () => ({ left })
  } as HTMLElement
}

test('uses the default sidebar width when no persisted value exists', () => {
  const storage = new MemoryStorage()
  const sidebarElement = ref<HTMLElement | null>(null)
  const { sidebarWidth, sidebarStyle } = useResizableSidebar(sidebarElement, { storage })

  assert.equal(sidebarWidth.value, DEFAULT_SIDEBAR_WIDTH)
  assert.equal(sidebarStyle.value['--sidebar-width'], `${DEFAULT_SIDEBAR_WIDTH}px`)
})

test('reads and applies a persisted sidebar width', () => {
  const storage = new MemoryStorage()
  storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '318')

  const sidebarElement = ref<HTMLElement | null>(null)
  const { sidebarWidth, sidebarStyle } = useResizableSidebar(sidebarElement, { storage })

  assert.equal(sidebarWidth.value, 318)
  assert.equal(sidebarStyle.value['--sidebar-width'], '318px')
})

test('falls back when the persisted sidebar width is invalid', () => {
  for (const storedWidth of ['wide', '199', '341', 'Infinity', '']) {
    const storage = new MemoryStorage()
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, storedWidth)

    const sidebarElement = ref<HTMLElement | null>(null)
    const { sidebarWidth } = useResizableSidebar(sidebarElement, { storage })

    assert.equal(sidebarWidth.value, DEFAULT_SIDEBAR_WIDTH, `${storedWidth} should fall back`)
  }
})

test('dragging the divider updates the sidebar width in real time', () => {
  const storage = new MemoryStorage()
  const windowTarget = new FakeEventTarget()
  const { target: documentTarget } = createDocumentTarget()
  const sidebarElement = ref(createSidebarElement(12))
  const { sidebarWidth, startResize } = useResizableSidebar(sidebarElement, {
    storage,
    windowTarget,
    documentTarget
  })

  startResize(createMouseEvent(264))
  windowTarget.dispatch('mousemove', createMouseEvent(312))
  assert.equal(sidebarWidth.value, 300)

  windowTarget.dispatch('mousemove', createMouseEvent(120))
  assert.equal(sidebarWidth.value, MIN_SIDEBAR_WIDTH)

  windowTarget.dispatch('mousemove', createMouseEvent(380))
  assert.equal(sidebarWidth.value, MAX_SIDEBAR_WIDTH)
})

test('mouseup ends resizing and saves the final sidebar width', () => {
  const storage = new MemoryStorage()
  const windowTarget = new FakeEventTarget()
  const { target: documentTarget, classes } = createDocumentTarget()
  const sidebarElement = ref(createSidebarElement(10))
  const { isResizing, startResize } = useResizableSidebar(sidebarElement, {
    storage,
    windowTarget,
    documentTarget
  })

  startResize(createMouseEvent(262))
  windowTarget.dispatch('mousemove', createMouseEvent(308))
  windowTarget.dispatch('mouseup', createMouseEvent(308))

  assert.equal(isResizing.value, false)
  assert.equal(storage.getItem(SIDEBAR_WIDTH_STORAGE_KEY), '298')
  assert.equal(classes.has('sidebar-resizing'), false)
})

test('cleanup removes global resize listeners and the resizing body class', () => {
  const storage = new MemoryStorage()
  const windowTarget = new FakeEventTarget()
  const { target: documentTarget, classes } = createDocumentTarget()
  const sidebarElement = ref(createSidebarElement())
  const { cleanupSidebarResize, startResize } = useResizableSidebar(sidebarElement, {
    storage,
    windowTarget,
    documentTarget
  })

  startResize(createMouseEvent(DEFAULT_SIDEBAR_WIDTH))

  assert.equal(windowTarget.listenerCount('mousemove'), 1)
  assert.equal(windowTarget.listenerCount('mouseup'), 1)
  assert.equal(windowTarget.listenerCount('blur'), 1)
  assert.equal(documentTarget.listenerCount('mouseleave'), 1)
  assert.equal(classes.has('sidebar-resizing'), true)

  cleanupSidebarResize()

  assert.equal(windowTarget.listenerCount('mousemove'), 0)
  assert.equal(windowTarget.listenerCount('mouseup'), 0)
  assert.equal(windowTarget.listenerCount('blur'), 0)
  assert.equal(documentTarget.listenerCount('mouseleave'), 0)
  assert.equal(classes.has('sidebar-resizing'), false)
})
