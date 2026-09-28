import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isGamingAiAnalysisEnabledQueue,
  normalizeGamingQueueLabel
} from './gamingAiQueue.ts'

test('normalizes ranked queue ids and enables AI analysis only for ranked queues', () => {
  assert.equal(normalizeGamingQueueLabel({ queueId: 420, typeCn: '极地大乱斗' }), '单双排位')
  assert.equal(isGamingAiAnalysisEnabledQueue({ queueId: 420, typeCn: '极地大乱斗' }), true)

  assert.equal(normalizeGamingQueueLabel({ queueId: 440, typeCn: '匹配' }), '灵活排位')
  assert.equal(isGamingAiAnalysisEnabledQueue({ queueId: 440, typeCn: '匹配' }), true)
})

test('normalizes ranked Chinese queue names without phase prefixes', () => {
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '单排/双排' }), '单双排位')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '单双排' }), '单双排位')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '单双排位' }), '单双排位')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '灵活组排' }), '灵活排位')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '灵活排位' }), '灵活排位')
})

test('shows non-ranked queue labels while keeping AI analysis unsupported', () => {
  assert.equal(normalizeGamingQueueLabel({ queueId: 450, typeCn: '极地大乱斗' }), '海克斯大乱斗')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '海克斯大乱斗' }), '海克斯大乱斗')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '匹配' }), '匹配')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '竞技场' }), '竞技场')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '无限火力' }), '无限火力')

  for (const typeCn of ['极地大乱斗', '海克斯大乱斗', '匹配', '竞技场', '无限火力', '']) {
    assert.equal(isGamingAiAnalysisEnabledQueue({ queueId: 450, typeCn }), false)
  }

  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: '' }), '未知模式')
  assert.equal(normalizeGamingQueueLabel({ queueId: 0, typeCn: undefined }), '未知模式')
  assert.equal(isGamingAiAnalysisEnabledQueue({ queueId: 0, typeCn: undefined }), false)
})
