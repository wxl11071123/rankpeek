import type { QueueInfo, RecordStatus, SessionData, SessionSummoner } from '@/types/api'
import { formatRankDivisionLabel, normalizeRankDivisionText } from '../utils/rankDisplay.ts'
import { getGamingPlayerKey } from './gamingAiInputSnapshot.ts'

export type GamingAiAnalysisMode = 'teammate' | 'opponent'
export type GamingAiInsightTone = 'carry' | 'stable' | 'risk' | 'weak' | 'unknown'

export interface GamingAiAnalysisPreview {
  mode: GamingAiAnalysisMode
  title: string
  subtitle: string
  opening: string
  players: GamingAiPlayerInsight[]
  bullets: string[]
  laneAdvice?: string
}

export interface GamingAiPlayerInsight {
  key: string
  isSelf: boolean
  name: string
  championId?: number
  profileIconId?: number
  rankText: string
  verdict: string
  tone: GamingAiInsightTone
  kdaText: string
  winRateText: string
  damageRateText: string
  sampleText: string
  reason: string
}

export interface CreateGamingAiAnalysisPreviewInput {
  mode: GamingAiAnalysisMode
  players: SessionSummoner[]
  sessionData: SessionData
  currentSummonerPuuid?: string
}

const MIN_RELIABLE_SAMPLE = 8

const TEAMMATE_CARRY_WIN_RATE = 60
const TEAMMATE_CARRY_KDA = 3
const TEAMMATE_STABLE_WIN_RATE = 52
const TEAMMATE_STABLE_KDA = 2.2
const TEAMMATE_RISK_WIN_RATE = 45
const TEAMMATE_RISK_KDA = 1.8
const LOW_DAMAGE_RATE = 120

const OPPONENT_SMURF_WIN_RATE = 62
const OPPONENT_SMURF_KDA = 3.2
const OPPONENT_THREAT_WIN_RATE = 56
const OPPONENT_THREAT_KDA = 2.5
const OPPONENT_WEAK_WIN_RATE = 45
const OPPONENT_WEAK_KDA = 1.8

const EMPTY_PLAYERS_OPENING = '当前还没有可用玩家数据，请进入英雄选择或加载阶段后再试。'
const DATA_LIMITED_OPENING = '当前样本不足，本报告仅基于已加载的公开数据做占位判断。'

const phaseLabelMap: Record<string, string> = {
  ChampSelect: '英雄选择',
  GameStart: '游戏开始',
  InProgress: '游戏中',
  PreEndOfGame: '即将结束',
  EndOfGame: '游戏结束',
  PostGame: '游戏结束',
  POST_GAME: '游戏结束',
  Lobby: '大厅',
  Matchmaking: '匹配中',
  ReadyCheck: '确认阶段',
  Reconnect: '重新连接'
}

const tierLabelMap: Record<string, string> = {
  UNRANKED: '未定级',
  IRON: '黑铁',
  BRONZE: '青铜',
  SILVER: '白银',
  GOLD: '黄金',
  PLATINUM: '铂金',
  EMERALD: '翡翠',
  DIAMOND: '钻石',
  MASTER: '超凡大师',
  GRANDMASTER: '傲世宗师',
  CHALLENGER: '最强王者'
}

interface PlayerStats {
  sample: number
  winRate: number | null
  kda: number | null
  damageRate: number | null
}

export function createGamingAiAnalysisPreview(input: CreateGamingAiAnalysisPreviewInput): GamingAiAnalysisPreview {
  const players = input.players || []
  const insights = players.map(player => createPlayerInsight(input.mode, player, input.currentSummonerPuuid || input.sessionData.currentSummoner?.puuid))
  const subtitle = `${formatPhase(input.sessionData.phase)} · ${formatQueueName(input.sessionData)}`

  if (!players.length) {
    return {
      mode: input.mode,
      title: getTitle(input.mode),
      subtitle,
      opening: EMPTY_PLAYERS_OPENING,
      players: [],
      bullets: [],
      laneAdvice: input.mode === 'opponent' ? getLaneAdvice(input.sessionData, input.currentSummonerPuuid) : undefined
    }
  }

  return {
    mode: input.mode,
    title: getTitle(input.mode),
    subtitle,
    opening: createOpening(input.mode, insights),
    players: insights,
    bullets: input.mode === 'teammate'
      ? createTeammateBullets(insights)
      : createOpponentBullets(insights),
    laneAdvice: input.mode === 'opponent' ? getLaneAdvice(input.sessionData, input.currentSummonerPuuid) : undefined
  }
}

function createPlayerInsight(mode: GamingAiAnalysisMode, player: SessionSummoner, currentSummonerPuuid?: string): GamingAiPlayerInsight {
  const recordStatus = player.userTag?.recordStatus || 'NORMAL'
  const stats = getPlayerStats(player)
  const statusInsight = getRecordStatusInsight(recordStatus)
  const lowSample = recordStatus === 'NORMAL' && stats.sample < MIN_RELIABLE_SAMPLE

  const base = {
    key: getPlayerKey(player),
    isSelf: isCurrentPlayer(player, currentSummonerPuuid),
    name: formatPlayerName(player),
    championId: player.championId > 0 ? player.championId : undefined,
    profileIconId: player.summoner?.profileIconId || undefined,
    rankText: formatGamingAiRankText(player),
    kdaText: formatNumber(stats.kda, 1),
    winRateText: stats.winRate == null ? '--' : `${stats.winRate.toFixed(1)}%`,
    damageRateText: stats.damageRate == null ? '--' : `${stats.damageRate.toFixed(1)}%`,
    sampleText: stats.sample > 0 ? `${stats.sample} 场` : '不足'
  }

  if (statusInsight) {
    return {
      ...base,
      ...statusInsight
    }
  }

  if (lowSample) {
    return {
      ...base,
      verdict: '样本不足',
      tone: 'unknown',
      reason: '近期样本较少，暂时不要过度依赖。'
    }
  }

  const evaluated = mode === 'teammate'
    ? evaluateTeammate(stats)
    : evaluateOpponent(stats)

  return {
    ...base,
    ...evaluated
  }
}

function isCurrentPlayer(player: SessionSummoner, currentSummonerPuuid?: string): boolean {
  return Boolean(currentSummonerPuuid && player.summoner?.puuid === currentSummonerPuuid)
}

function getRecordStatusInsight(recordStatus: RecordStatus): Pick<GamingAiPlayerInsight, 'verdict' | 'tone' | 'reason'> | null {
  if (recordStatus === 'PRIVATE') {
    return {
      verdict: '战绩隐藏',
      tone: 'unknown',
      reason: '该玩家近期战绩不可见，暂不做强判断。'
    }
  }

  if (recordStatus === 'EMPTY') {
    return {
      verdict: '样本不足',
      tone: 'unknown',
      reason: '近期样本过少，当前判断可信度较低。'
    }
  }

  if (recordStatus === 'ERROR') {
    return {
      verdict: '数据异常',
      tone: 'unknown',
      reason: '标签数据加载失败，暂不做强判断。'
    }
  }

  return null
}

function evaluateTeammate(stats: PlayerStats): Pick<GamingAiPlayerInsight, 'verdict' | 'tone' | 'reason'> {
  const winRate = stats.winRate ?? 0
  const kda = stats.kda ?? 0
  const damageRate = stats.damageRate ?? Number.POSITIVE_INFINITY

  if (stats.sample >= MIN_RELIABLE_SAMPLE && winRate >= TEAMMATE_CARRY_WIN_RATE && kda >= TEAMMATE_CARRY_KDA) {
    return {
      verdict: '疑似大腿',
      tone: 'carry',
      reason: '近期胜率和 KDA 都明显偏高，可以作为本局主要节奏点。'
    }
  }

  if (stats.sample >= MIN_RELIABLE_SAMPLE && winRate >= TEAMMATE_STABLE_WIN_RATE && kda >= TEAMMATE_STABLE_KDA) {
    return {
      verdict: '稳定队友',
      tone: 'stable',
      reason: '近期表现相对稳定，适合作为协同对象。'
    }
  }

  if (stats.sample >= MIN_RELIABLE_SAMPLE && winRate <= TEAMMATE_RISK_WIN_RATE && kda <= TEAMMATE_RISK_KDA) {
    return {
      verdict: '风险队友',
      tone: 'risk',
      reason: '近期胜率和 KDA 都偏低，前期不宜过度绑定。'
    }
  }

  if (stats.sample >= MIN_RELIABLE_SAMPLE && damageRate < LOW_DAMAGE_RATE) {
    return {
      verdict: '偏混',
      tone: 'risk',
      reason: '伤转率偏低，可能更依赖队友创造输出环境。'
    }
  }

  return {
    verdict: '正常波动',
    tone: 'stable',
    reason: '近期数据没有明显极端信号，按常规队友处理。'
  }
}

function evaluateOpponent(stats: PlayerStats): Pick<GamingAiPlayerInsight, 'verdict' | 'tone' | 'reason'> {
  const winRate = stats.winRate ?? 0
  const kda = stats.kda ?? 0

  if (stats.sample >= MIN_RELIABLE_SAMPLE && winRate >= OPPONENT_SMURF_WIN_RATE && kda >= OPPONENT_SMURF_KDA) {
    return {
      verdict: '疑似小代',
      tone: 'carry',
      reason: '近期胜率和 KDA 同时偏高，需要重点关注其前期节奏。'
    }
  }

  if (stats.sample >= MIN_RELIABLE_SAMPLE && winRate >= OPPONENT_THREAT_WIN_RATE && kda >= OPPONENT_THREAT_KDA) {
    return {
      verdict: '高威胁',
      tone: 'carry',
      reason: '近期表现稳定偏强，是对手中更可能接管比赛的位置。'
    }
  }

  if (stats.sample >= MIN_RELIABLE_SAMPLE && winRate <= OPPONENT_WEAK_WIN_RATE && kda <= OPPONENT_WEAK_KDA) {
    return {
      verdict: '可突破',
      tone: 'weak',
      reason: '近期数据偏弱，可以作为前期试探和滚雪球对象。'
    }
  }

  return {
    verdict: '常规对手',
    tone: 'stable',
    reason: '当前数据没有明显极端信号。'
  }
}

function createOpening(mode: GamingAiAnalysisMode, insights: GamingAiPlayerInsight[]): string {
  const knownInsights = insights.filter(player => player.tone !== 'unknown')
  if (!knownInsights.length) {
    return DATA_LIMITED_OPENING
  }

  if (mode === 'teammate') {
    const carries = knownInsights.filter(player => player.tone === 'carry').length
    const risks = knownInsights.filter(player => player.tone === 'risk' || player.tone === 'weak').length

    if (carries > 0 && risks > 0) {
      return '本局队友强弱分布较明显，建议围绕稳定强点建立节奏，同时降低对波动点的绑定。'
    }
    if (carries > 0) {
      return '本局队友整体偏稳，可以优先围绕高胜率 / 高 KDA 玩家建立节奏。'
    }
    if (risks > 0) {
      return '本局队友存在一定波动，前期需要观察低胜率 / 低 KDA 玩家是否被持续针对。'
    }
    return '本局队友整体没有极端信号，按常规节奏处理即可。'
  }

  const threats = knownInsights.filter(player => player.tone === 'carry').length
  const weakTargets = knownInsights.filter(player => player.tone === 'weak').length

  if (threats > 0 && weakTargets > 0) {
    return '对手同时存在高威胁点和可突破位置，前期先确认强点动向，再找弱侧建立优势。'
  }
  if (threats > 0) {
    return '对手威胁点较明确，优先观察高胜率 / 高 KDA 玩家前期节奏。'
  }
  if (weakTargets > 0) {
    return '对手存在可试探突破口，前期可以围绕近期数据偏弱位置建立优势。'
  }
  return '对手当前没有明显极端信号，先以视野和对线状态确认真实强度。'
}

function createTeammateBullets(insights: GamingAiPlayerInsight[]): string[] {
  const bullets: string[] = []
  const carries = insights.filter(player => player.tone === 'carry').slice(0, 2)
  const risks = insights.filter(player => player.tone === 'risk' || player.tone === 'weak').slice(0, 2)
  const unknownCount = insights.filter(player => player.tone === 'unknown').length

  if (carries.length) {
    bullets.push(`优先围绕 ${joinPlayerNames(carries)} 建立节奏。`)
  } else {
    bullets.push('先观察前几波对线和野区动向，再决定资源倾斜。')
  }

  if (risks.length) {
    bullets.push(`${joinPlayerNames(risks)} 近期数据偏弱，前期不宜过度绑定。`)
  }

  if (unknownCount > 0) {
    bullets.push('低样本、战绩隐藏或加载失败玩家不做强判断。')
  } else {
    bullets.push('若出现连送或团前死亡，及时转向更稳定的一侧。')
  }

  return bullets.slice(0, 3)
}

function createOpponentBullets(insights: GamingAiPlayerInsight[]): string[] {
  const bullets: string[] = []
  const threats = insights.filter(player => player.tone === 'carry').slice(0, 2)
  const weakTargets = insights.filter(player => player.tone === 'weak').slice(0, 2)
  const unknownCount = insights.filter(player => player.tone === 'unknown').length

  if (weakTargets.length) {
    bullets.push(`优先观察敌方 ${joinPlayerNames(weakTargets)}，近期数据偏弱，可能是前期突破口。`)
  } else {
    bullets.push('暂未找到明确突破口，先用视野、换血和第一轮资源团确认真实状态。')
  }

  if (threats.length) {
    bullets.push(`对手高威胁点为 ${joinPlayerNames(threats)}，避免无信息硬碰。`)
  }

  if (unknownCount > 0) {
    bullets.push('低样本、战绩隐藏或加载失败的对手暂不做强判断。')
  }

  return bullets.slice(0, 3)
}

function getPlayerStats(player: SessionSummoner): PlayerStats {
  const recentData = player.userTag?.recentData
  const wins = toFiniteNumber(recentData?.selectWins) ?? 0
  const losses = toFiniteNumber(recentData?.selectLosses) ?? 0
  const sample = Math.max(0, wins + losses)
  const winRate = sample > 0 ? (wins / sample) * 100 : null
  const kda = toFiniteNumber(recentData?.kda)
  const damage = toFiniteNumber(recentData?.averageDamageDealtToChampions)
  const gold = toFiniteNumber(recentData?.averageGold)
  const damageRate = damage != null && gold != null && damage > 0 && gold > 0
    ? (damage / gold) * 100
    : null

  return {
    sample,
    winRate,
    kda,
    damageRate
  }
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatNumber(value: number | null, digits: number): string {
  return value == null ? '--' : value.toFixed(digits)
}

function formatPlayerName(player: SessionSummoner): string {
  const gameName = player.summoner?.gameName?.trim()
  if (!gameName) {
    return '未知玩家'
  }
  const tagLine = player.summoner?.tagLine?.trim()
  return tagLine ? `${gameName}#${tagLine}` : gameName
}

function getPlayerKey(player: SessionSummoner): string {
  return getGamingPlayerKey(player)
}

export function formatGamingAiRankText(player: SessionSummoner): string {
  const queueMap = player.rank?.queueMap as Partial<Record<'RANKED_SOLO_5x5' | 'RANKED_FLEX_SR', QueueInfo | null>> | undefined
  const queueInfo = queueMap?.RANKED_SOLO_5x5 || queueMap?.RANKED_FLEX_SR || null
  if (!queueInfo) {
    return '未定级'
  }

  if (queueInfo.displayRank?.trim()) {
    return normalizeRankDivisionText(queueInfo.displayRank)
  }

  if (queueInfo.isProvisional) {
    const games = getQueueTotalGames(queueInfo)
    return games > 0 ? `定级中 · ${games} 场` : '定级中'
  }

  const tier = queueInfo.tier?.toUpperCase() || 'UNRANKED'
  if (!tier || tier === 'UNRANKED') {
    return '未定级'
  }

  const tierLabel = queueInfo.tierCn || tierLabelMap[tier] || queueInfo.tier
  if (['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier)) {
    return `${tierLabel} ${queueInfo.leaguePoints ?? 0} LP`
  }

  const divisionLabel = formatRankDivisionLabel(queueInfo.division)
  return divisionLabel
    ? `${tierLabel} ${divisionLabel} ${queueInfo.leaguePoints ?? 0} LP`
    : `${tierLabel} ${queueInfo.leaguePoints ?? 0} LP`
}

function getQueueTotalGames(queueInfo: QueueInfo): number {
  if (typeof queueInfo.totalGames === 'number' && Number.isFinite(queueInfo.totalGames)) {
    return queueInfo.totalGames
  }
  if (typeof queueInfo.games === 'number' && Number.isFinite(queueInfo.games)) {
    return queueInfo.games
  }
  return (queueInfo.wins || 0) + (queueInfo.losses || 0)
}

function getTitle(mode: GamingAiAnalysisMode): string {
  return mode === 'teammate' ? '队友成分分析' : '赛前对手分析'
}

function formatPhase(phase: string): string {
  if (!phase || phase === 'None') {
    return '等待对局'
  }
  return phaseLabelMap[phase] || '未进入对局'
}

function formatQueueName(sessionData: SessionData): string {
  if (sessionData.typeCn?.trim()) {
    return sessionData.typeCn.trim()
  }
  if (sessionData.queueId === 420) {
    return '单双排'
  }
  if (sessionData.queueId === 440) {
    return '灵活排位'
  }
  return '未知模式'
}

function joinPlayerNames(players: Pick<GamingAiPlayerInsight, 'name'>[]): string {
  return players.map(player => player.name).join(' / ')
}

function getLaneAdvice(sessionData: SessionData, currentSummonerPuuid?: string): string {
  const currentPlayer = findCurrentPlayer(sessionData, currentSummonerPuuid)
  const role = normalizeRole(readPlayerRole(currentPlayer))

  if (role === 'JUNGLE') {
    return '前 6 分钟优先确认敌方高威胁点动向，避免无信息入侵。'
  }
  if (role === 'MIDDLE') {
    return '先保证线权和河道视野，避免被高 KDA 打野抓住第一波游走。'
  }
  if (role === 'TOP') {
    return '若敌方上路是突破口，可以请求打野早期试探。'
  }
  if (role === 'BOTTOM') {
    return '若敌方下路组合数据强，前期以控线和防 gank 为主。'
  }
  if (role === 'SUPPORT') {
    return '优先保护弱侧视野，别为了无收益游走暴露 AD。'
  }
  return '前期先围绕己方数据最稳定的队友建立节奏。'
}

function findCurrentPlayer(sessionData: SessionData, currentSummonerPuuid?: string): SessionSummoner | null {
  const candidates = [
    ...(sessionData.teamOne || []),
    ...(sessionData.teamTwo || []),
    ...(sessionData.teammates || []),
    ...(sessionData.opponents || [])
  ]
  const targetPuuid = currentSummonerPuuid || sessionData.currentSummoner?.puuid

  if (targetPuuid) {
    const player = candidates.find(candidate => candidate.summoner?.puuid === targetPuuid)
    if (player) {
      return player
    }
  }

  const currentSummoner = sessionData.currentSummoner
  if (!currentSummoner) {
    return null
  }

  return candidates.find(candidate => (
    candidate.summoner?.summonerId === currentSummoner.summonerId ||
    (
      Boolean(candidate.summoner?.gameName) &&
      candidate.summoner.gameName === currentSummoner.gameName &&
      candidate.summoner.tagLine === currentSummoner.tagLine
    )
  )) || null
}

function readPlayerRole(player: SessionSummoner | null): string {
  if (!player) {
    return ''
  }

  const loosePlayer = player as SessionSummoner & Record<string, unknown>
  const roleFields = [
    loosePlayer.teamPosition,
    loosePlayer.individualPosition,
    loosePlayer.selectedPosition,
    loosePlayer.lane,
    loosePlayer.role,
    loosePlayer.position,
    loosePlayer.assignedPosition
  ]

  for (const value of roleFields) {
    if (typeof value === 'string' && value.trim()) {
      return value
    }
  }

  return ''
}

function normalizeRole(value: string): 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'SUPPORT' | 'UNKNOWN' {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'TOP') {
    return 'TOP'
  }
  if (normalized === 'JUNGLE') {
    return 'JUNGLE'
  }
  if (normalized === 'MID' || normalized === 'MIDDLE') {
    return 'MIDDLE'
  }
  if (normalized === 'ADC' || normalized === 'BOTTOM' || normalized === 'BOT') {
    return 'BOTTOM'
  }
  if (normalized === 'SUPPORT' || normalized === 'UTILITY') {
    return 'SUPPORT'
  }
  return 'UNKNOWN'
}
