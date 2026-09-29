import type { CoachSummaryReportV1 } from '@/types/coachSummaryReport'

export const DEV_COACH_SUMMARY_REPORT_PREVIEW: CoachSummaryReportV1 = {
  schemaVersion: 'coach_summary_report.v1',
  analysisType: 'coach_summary',
  inputHash: 'dev-preview',
  headline: '中期资源团前先稳住站位',
  cardTitle: '近 20 局打野复盘预览',
  shortTitle: '资源团前死亡偏多',
  title: '近 20 局排位电子教练预览',
  summary: '这是一份仅用于开发环境的本地预览报告，用来查看报告详情页、三段式内容和轻量图表效果。',
  overview: {
    totalMatches: 20,
    wins: 11,
    losses: 9,
    winRate: 55,
    summary: '主位置集中在打野，贝蕾亚和凯隐胜率更稳定；纳亚菲利样本偏少但前期节奏较好。',
    primaryRoles: [
      { role: 'JUNGLE', count: 17 },
      { role: 'MID', count: 3 }
    ],
    rpTrend: [
      { matchRef: 'm20', score: 5.7, championId: 233, championDisplayName: '贝蕾亚', result: 'loss' },
      { matchRef: 'm19', score: 6.4, championId: 950, championDisplayName: '纳亚菲利', result: 'win' },
      { matchRef: 'm18', score: 5.9, championId: 141, championDisplayName: '凯隐', result: 'win' },
      { matchRef: 'm17', score: 7.2, championId: 102, championDisplayName: '希瓦娜', result: 'loss' },
      { matchRef: 'm16', score: 6.8, championId: 233, championDisplayName: '贝蕾亚', result: 'win' },
      { matchRef: 'm15', score: 4.9, championId: 233, championDisplayName: '贝蕾亚', result: 'loss' },
      { matchRef: 'm14', score: 6.1, championId: 141, championDisplayName: '凯隐', result: 'win' },
      { matchRef: 'm13', score: 7.6, championId: 141, championDisplayName: '凯隐', result: 'win' },
      { matchRef: 'm12', score: 6.9, championId: 950, championDisplayName: '纳亚菲利', result: 'loss' },
      { matchRef: 'm11', score: 7.1, championId: 233, championDisplayName: '贝蕾亚', result: 'win' },
      { matchRef: 'm10', score: 6.2, championId: 102, championDisplayName: '希瓦娜', result: 'loss' },
      { matchRef: 'm09', score: 5.4, championId: 233, championDisplayName: '贝蕾亚', result: 'loss' },
      { matchRef: 'm08', score: 6.7, championId: 141, championDisplayName: '凯隐', result: 'win' },
      { matchRef: 'm07', score: 7.9, championId: 141, championDisplayName: '凯隐', result: 'win' },
      { matchRef: 'm06', score: 7.4, championId: 950, championDisplayName: '纳亚菲利', result: 'win' },
      { matchRef: 'm05', score: 6.3, championId: 102, championDisplayName: '希瓦娜', result: 'loss' },
      { matchRef: 'm04', score: 7.0, championId: 233, championDisplayName: '贝蕾亚', result: 'win' },
      { matchRef: 'm03', score: 6.6, championId: 141, championDisplayName: '凯隐', result: 'win' },
      { matchRef: 'm02', score: 7.5, championId: 233, championDisplayName: '贝蕾亚', result: 'win' },
      { matchRef: 'm01', score: 8.0, championId: 141, championDisplayName: '凯隐', result: 'win' }
    ],
    heroStats: [
      {
        championId: 233,
        championCanonicalName: 'Briar',
        championDisplayName: '贝蕾亚',
        role: 'JUNGLE',
        games: 6,
        wins: 3,
        losses: 3,
        winRate: 50,
        kda: '7.2 / 6.1 / 8.4',
        averageKda: 2.56,
        summary: '样本最多，团前站位需要更稳。'
      },
      {
        championId: 950,
        championCanonicalName: 'Naafiri',
        championDisplayName: '纳亚菲利',
        role: 'MID',
        games: 4,
        wins: 2,
        losses: 2,
        winRate: 50,
        kda: '6.8 / 4.8 / 7.1',
        averageKda: 2.9,
        summary: '前期击杀参与高，后期收尾需要更快。'
      },
      {
        championId: 141,
        championCanonicalName: 'Kayn',
        championDisplayName: '凯隐',
        role: 'JUNGLE',
        games: 5,
        wins: 4,
        losses: 1,
        winRate: 80,
        kda: '8.0 / 4.4 / 9.2',
        averageKda: 3.91,
        summary: '最稳定的上分选择。'
      },
      {
        championId: 102,
        championCanonicalName: 'Shyvana',
        championDisplayName: '希瓦娜',
        role: 'JUNGLE',
        games: 5,
        wins: 2,
        losses: 3,
        winRate: 40,
        kda: '5.1 / 5.8 / 7.0',
        averageKda: 2.09,
        summary: '刷野稳定，但资源团先手不足。'
      }
    ],
    roleStats: [
      { role: 'JUNGLE', games: 17, wins: 9, losses: 8, winRate: 52.9 },
      { role: 'MID', games: 3, wins: 2, losses: 1, winRate: 66.7 }
    ]
  },
  verdict: {
    label: '优势建立可用，团前风险偏高',
    score: 73,
    confidence: 'medium',
    summary: '你的前 15 分钟能稳定制造节奏，但资源刷新前的单人探视野和追击会放大死亡成本。'
  },
  keyFindings: [
    {
      id: 'objective-death-window',
      priority: 'high',
      category: 'death',
      claim: '资源刷新前 90 秒死亡偏多',
      evidence: '预览样本中多次在小龙或先锋刷新前阵亡。',
      reasoning: '关键时间点少人会让队伍失去视野和河道站位。',
      advice: '资源刷新前先处理边线和视野，再跟辅助一起进河道。',
      confidence: 'medium',
      evidenceRefs: ['preview.objectiveDeathWindow']
    },
    {
      id: 'carry-pool',
      priority: 'medium',
      category: 'champion_pool',
      claim: '凯隐是当前最稳定的上分英雄',
      evidence: '凯隐预览胜率和 KDA 均高于其他主玩英雄。',
      reasoning: '该英雄更适合当前刷野和中期绕后节奏。',
      advice: '短期优先保留凯隐，贝蕾亚用于阵容缺开团时补位。',
      confidence: 'medium',
      evidenceRefs: ['overview.heroStats']
    },
    {
      id: 'closing-speed',
      priority: 'medium',
      category: 'macro',
      claim: '优势局收尾速度偏慢',
      evidence: '预览曲线显示 18 分钟后经济领先没有继续扩大。',
      reasoning: '拿到领先后没有把视野和兵线同时压进野区。',
      advice: '领先时优先控第二条先锋或外塔，避免无目标追击。',
      confidence: 'low',
      evidenceRefs: ['preview.goldTrend']
    }
  ],
  championAdvice: [
    {
      championName: '凯隐',
      role: 'JUNGLE',
      recommendation: 'keep',
      reason: '胜率和 KDA 表现最稳，适合作为当前主力选择。',
      confidence: 'medium'
    },
    {
      championName: '贝蕾亚',
      role: 'JUNGLE',
      recommendation: 'practice',
      reason: '开团能力足够，但团前死亡会抵消前期优势。',
      confidence: 'medium'
    },
    {
      championName: '希瓦娜',
      role: 'JUNGLE',
      recommendation: 'observe_more',
      reason: '刷野稳定但中期主动性不足，需要更多样本确认。',
      confidence: 'low'
    }
  ],
  trainingPlan: [
    {
      focus: '资源刷新前站位',
      why: '减少团前掉点，保住视野主动权。',
      nextGames: 5,
      task: '小龙和先锋刷新前 90 秒只和队友一起进河道。',
      metricToTrack: 'objective_deaths_before_90s',
      target: '5 局内不超过 1 次',
      priority: 'high'
    },
    {
      focus: '优势局收尾',
      why: '把前期领先转成防御塔和野区控制。',
      nextGames: 5,
      task: '拿到击杀后优先标记可交换资源，而不是继续追人。',
      metricToTrack: 'post_kill_objective_conversion',
      target: '每局至少 2 次',
      priority: 'medium'
    },
    {
      focus: '英雄池优先级',
      why: '减少练习成本，把强势英雄打成稳定胜率。',
      nextGames: 8,
      task: '优先选择凯隐和贝蕾亚，希瓦娜只在阵容适合时使用。',
      metricToTrack: 'primary_pool_pick_rate',
      target: '主力英雄占比 70% 以上',
      priority: 'medium'
    }
  ],
  chartBlocks: [
    {
      id: 'preview-hero-winrate',
      title: '主玩英雄胜率',
      kind: 'bar',
      placement: 'overview',
      data: [
        { champion: '贝蕾亚', games: 6, winRate: 50 },
        { champion: '纳亚菲利', games: 4, winRate: 50 },
        { champion: '凯隐', games: 5, winRate: 80 },
        { champion: '希瓦娜', games: 5, winRate: 40 }
      ],
      labelKey: 'champion',
      valueKey: 'winRate',
      intent: '对比近 20 局主玩英雄的胜率表现',
      interpretation: '凯隐表现最稳定，希瓦娜需要继续观察。',
      evidenceRefs: ['overview.heroStats']
    },
    {
      id: 'preview-midgame-kda',
      title: '中期 KDA 趋势',
      kind: 'line',
      placement: 'analysis',
      data: [
        { match: 1, kda: 2.1 },
        { match: 2, kda: 2.4 },
        { match: 3, kda: 3.2 },
        { match: 4, kda: 2.7 },
        { match: 5, kda: 3.8 }
      ],
      xKey: 'match',
      yKeys: ['kda'],
      intent: '展示最近样本中中期表现波动',
      interpretation: '表现峰值来自低死亡对局，优先控制团前风险。',
      evidenceRefs: ['preview.midgameKda']
    },
    {
      id: 'preview-training-table',
      title: '下一阶段训练重点',
      kind: 'table',
      placement: 'summary',
      data: [
        { focus: '资源团前站位', nextGames: 5, target: '团前死亡 <= 1' },
        { focus: '优势局收尾', nextGames: 5, target: '每局 2 次资源转换' },
        { focus: '英雄池优先级', nextGames: 8, target: '主力占比 70%' }
      ],
      intent: '把总结转成可执行训练项',
      interpretation: '先压低死亡，再提高优势局转化。',
      evidenceRefs: ['trainingPlan']
    }
  ],
  warnings: [
    {
      type: 'dev_preview',
      message: '该报告仅用于开发环境预览，不代表真实分析结果。'
    }
  ],
  finalSummary: '中期团战筑造优势。',
  metadata: {
    modelName: 'dev-preview',
    promptVersion: 'coach_summary.preview.v1',
    generatedAt: '2026-05-12T00:00:00.000Z',
    snapshotSchemaVersion: 'coach_summary.preview',
    dataQualityConfidence: 'low'
  }
}
