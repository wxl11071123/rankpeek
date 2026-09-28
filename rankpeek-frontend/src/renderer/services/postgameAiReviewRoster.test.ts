import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPostgameAiReviewRosterPlayers } from './postgameAiReviewRoster.ts'

test('builds postgame review roster refs and icon urls from the live match player list', () => {
  const roster = buildPostgameAiReviewRosterPlayers({
    currentPuuid: 'self-puuid',
    championNamesById: {
      910: '百裂冥犬',
      145: '卡莎'
    },
    getChampionIconUrl: id => `/champion/${id}.png`,
    players: [
      {
        participantId: 1,
        teamId: 100,
        championId: 910,
        puuid: 'self-puuid',
        teamPosition: 'JUNGLE'
      },
      {
        participantId: 6,
        teamId: 200,
        championId: 145,
        puuid: 'enemy-puuid',
        teamPosition: 'BOTTOM'
      }
    ]
  })

  assert.deepEqual(roster, [
    {
      playerRef: '你｜我方打野｜百裂冥犬',
      championName: '百裂冥犬',
      championId: 910,
      side: '我方',
      role: '打野',
      isSelf: true,
      iconUrl: '/champion/910.png'
    },
    {
      playerRef: '敌方下路｜卡莎',
      championName: '卡莎',
      championId: 145,
      side: '敌方',
      role: '下路',
      isSelf: false,
      iconUrl: '/champion/145.png'
    }
  ])
})
