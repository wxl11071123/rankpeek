import test from 'node:test'
import assert from 'node:assert/strict'
import { isRenderableMatchForPuuid } from './matchQuality.ts'

const SELF_PUUID = 'self-puuid'

function createMatch(overrides: Record<string, unknown> = {}) {
  return {
    gameId: 1,
    queueId: 420,
    gameCreation: 1710000000000,
    gameDuration: 1800,
    participants: [
      {
        participantId: 1,
        teamId: 100,
        championId: 103,
        stats: {
          win: true,
          kills: 10,
          deaths: 2,
          assists: 8
        }
      }
    ],
    participantIdentities: [
      {
        participantId: 1,
        player: {
          puuid: SELF_PUUID
        }
      }
    ],
    ...overrides
  }
}

test('requires current player, champion, KDA, and win to render match history', () => {
  assert.equal(isRenderableMatchForPuuid(createMatch(), SELF_PUUID), true)
  assert.equal(isRenderableMatchForPuuid(createMatch({ participantIdentities: [] }), SELF_PUUID), false)
  assert.equal(isRenderableMatchForPuuid(createMatch({
    participants: [{ participantId: 1, teamId: 100, championId: 0, stats: { win: true, kills: 1, deaths: 2, assists: 3 } }]
  }), SELF_PUUID), false)
  assert.equal(isRenderableMatchForPuuid(createMatch({
    participants: [{ participantId: 1, teamId: 100, championId: 103, stats: { kills: 1, deaths: 2, assists: 3 } }]
  }), SELF_PUUID), false)
  assert.equal(isRenderableMatchForPuuid(createMatch({
    participants: [{ participantId: 1, teamId: 100, championId: 103, stats: { win: false, kills: 0, deaths: 0 } }]
  }), SELF_PUUID), false)
})
