/**
 * 局内浮窗的显隐门控（照参考项目 ARAMGG 的规则实现）。
 *
 * 规则（来自 aramgg 的 `docs/USER_GUIDE_AUTO_AUGMENT.md`）：
 * - **只有识别到完整 3 张卡才打开浮窗**；1~2 张只用来更新「已经开着」的浮窗，
 *   绝不因为部分识别就弹出来。
 * - 识别到 0 张时累计 miss，**连续多次缺失超过宽限**才清空，避免换卡动画
 *   （卡片短暂消失）导致浮窗闪一下就没。
 * - 组合没变就不重复通知（同一个组合只算一次「新识别」）。
 */

/** 连续空几次才清空浮窗（轮询 500ms 时约等于 1.5 秒宽限）。 */
export const MISS_GRACE = 3

export interface OverlayGateState {
  /** 浮窗是不是应该显示。 */
  visible: boolean
  /** 连续没识别到卡片的次数。 */
  missStreak: number
  /** 当前展示的三张卡（按左/中/右卡位）。 */
  slots: Array<number | null>
  /** 上次「完整三卡」的组合指纹，用来避免同一组合重复通知。 */
  signature: string
}

export function createOverlayGateState(): OverlayGateState {
  return { visible: false, missStreak: 0, slots: [null, null, null], signature: '' }
}

export function slotSignature(ids: Array<number | null>): string {
  return ids.map((id) => (id == null ? '-' : String(id))).join(',')
}

export interface OverlayGateDecision {
  state: OverlayGateState
  /** 这一轮是不是「新识别到完整三卡」（需要通知/弹窗）。 */
  opened: boolean
  /** 这一轮要不要清空浮窗。 */
  cleared: boolean
}

/**
 * 吃一轮 OCR 结果，吐出新的门控状态。
 *
 * @param matched 本轮识别到的卡位结果（长度最多 3，未识别的卡位为 null）
 */
export function applyOverlayGate(
  previous: OverlayGateState,
  matched: Array<number | null>,
  options: { missGrace?: number } = {}
): OverlayGateDecision {
  const grace = options.missGrace ?? MISS_GRACE
  const normalized: Array<number | null> = [0, 1, 2].map((index) => matched[index] ?? null)
  const found = normalized.filter((id) => id != null).length

  if (found === 0) {
    const missStreak = previous.missStreak + 1
    const cleared = previous.visible && missStreak >= grace
    return {
      state: {
        visible: cleared ? false : previous.visible,
        missStreak,
        // 清空之前保留上一轮结果，动画帧不至于闪
        slots: cleared ? [null, null, null] : previous.slots,
        signature: cleared ? '' : previous.signature
      },
      opened: false,
      cleared
    }
  }

  if (found < 3) {
    // 部分识别：只更新已经开着的浮窗，不打开新的
    const slots = previous.visible
      ? previous.slots.map((id, index) => normalized[index] ?? id)
      : previous.slots
    return {
      state: { ...previous, missStreak: 0, slots },
      opened: false,
      cleared: false
    }
  }

  const signature = slotSignature(normalized)
  const opened = !previous.visible || signature !== previous.signature
  return {
    state: { visible: true, missStreak: 0, slots: normalized, signature },
    opened,
    cleared: false
  }
}
