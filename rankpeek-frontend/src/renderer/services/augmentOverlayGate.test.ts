import test from 'node:test'
import assert from 'node:assert/strict'
import { applyOverlayGate, createOverlayGateState, slotSignature } from './augmentOverlayGate.ts'

test('partial detection never opens the overlay', () => {
  let state = createOverlayGateState()
  // 只识别到 1 张 / 2 张：浮窗必须保持关闭
  let decision = applyOverlayGate(state, [2128, null, null])
  assert.equal(decision.state.visible, false)
  state = decision.state
  decision = applyOverlayGate(state, [2128, 2132, null])
  assert.equal(decision.state.visible, false)
})

test('three cards open the overlay once per combination', () => {
  let state = createOverlayGateState()
  let decision = applyOverlayGate(state, [2128, 2132, 2131])
  assert.equal(decision.state.visible, true)
  assert.equal(decision.opened, true)
  assert.deepEqual(decision.state.slots, [2128, 2132, 2131])

  // 同一个组合再来一轮：不重复通知
  decision = applyOverlayGate(decision.state, [2128, 2132, 2131])
  assert.equal(decision.opened, false)

  // 换了组合：算新的一次
  decision = applyOverlayGate(decision.state, [2128, 2132, 1044])
  assert.equal(decision.opened, true)
})

test('a few empty frames keep the overlay, too many clear it', () => {
  let state = applyOverlayGate(createOverlayGateState(), [2128, 2132, 2131]).state
  // 换卡动画：空一两帧还留着
  state = applyOverlayGate(state, [null, null, null]).state
  assert.equal(state.visible, true)
  state = applyOverlayGate(state, [null, null, null]).state
  assert.equal(state.visible, true)
  // 连续第三次空：清空
  const decision = applyOverlayGate(state, [null, null, null])
  assert.equal(decision.cleared, true)
  assert.equal(decision.state.visible, false)
  assert.deepEqual(decision.state.slots, [null, null, null])
})

test('partial detection updates an already visible overlay', () => {
  let state = applyOverlayGate(createOverlayGateState(), [2128, 2132, 2131]).state
  // 中间那张读不出来：保留旧值，其余更新
  state = applyOverlayGate(state, [2128, null, 1044]).state
  assert.equal(state.visible, true)
  assert.deepEqual(state.slots, [2128, 2132, 1044])
})

test('slot signature is stable', () => {
  assert.equal(slotSignature([1, 2, 3]), '1,2,3')
  assert.equal(slotSignature([1, null, 3]), '1,-,3')
})
