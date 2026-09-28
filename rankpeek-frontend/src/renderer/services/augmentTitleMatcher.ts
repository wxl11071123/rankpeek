/**
 * 强化标题匹配层 —— OCR 结果的最后一道防线。
 *
 * 方案来源：docs/hextech-data-plan.md §7（参考 aramgg 客户端的三层结构，只借鉴思路）。
 *
 * 裸 OCR 对中文强化名的识别错误率极高（实测：魔鬼之舞 → 台所之舞、无休回复 → 无体回复、
 * 面包和奶酪 → 面包和奶栈），所以必须有三层：
 *   1. 归一化：NFKC + 去标点空白，抹平 OCR 的排版噪声
 *   2. 精确 / 子串 / 编辑距离模糊匹配
 *   3. 黑名单 + 别名表：拒绝把描述文字当标题，修正已知的系统性误识别
 */

export interface AugmentCandidate {
  augmentId: number
  name: string
}

export type MatchStrategy = 'exact' | 'alias' | 'substring' | 'fuzzy'

export interface AugmentMatch {
  augmentId: number
  name: string
  /** 归一化后实际参与匹配的文本。 */
  normalized: string
  strategy: MatchStrategy
  /** 编辑距离（精确/别名/子串匹配为 0）。 */
  distance: number
  /** 0~1，越大越可信。 */
  confidence: number
}

/**
 * 描述性词汇黑名单：强化描述里高频出现，绝不会是标题本身。
 * 命中黑名单且不是精确匹配的文本一律丢弃，避免把描述行当成强化名。
 */
export const DESCRIPTOR_KEYWORDS = [
  '攻击', '防御', '生命', '法术', '伤害', '护甲', '魔抗', '技能', '冷却', '移速', '暴击',
  '吸血', '穿透', '功能', '能力', '效果', '被动', '主动', '额外', '持续', '提供', '增加',
  '获得', '造成', '提升', '降低', '减少', '恢复', '治疗', '护盾', '金币', '经验', '层数',
  '每次', '所有', '你的', '敌方', '友方', '队友', '自身'
]

/**
 * 已知的 OCR 系统性误识别 → 正确名称。
 * 键是归一化后的错误文本，值是正确名称（内部会再归一化一次）。
 */
export const OCR_ALIASES: Record<string, string> = {
  台所之舞: '魔鬼之舞',
  无体回复: '无休回复',
  物法江: '物法皆修',
  大昌闪本: '大地苏醒',
  面包和奶栈: '面包和奶酪',
  zjama: '魄罗爆破手'
}

const PUNCTUATION_PATTERN = /[\s\u3000·・:：;；,，.。!！?？"“”'‘’()（）\[\]【】<>《》+\-_/\\|~^&*#$%@=]/g

/** 归一化：NFKC（全角转半角）→ 去空白 → 去标点 → 小写。 */
export function normalizeAugmentTitle(raw: string): string {
  if (!raw) {
    return ''
  }
  return raw.normalize('NFKC').replace(PUNCTUATION_PATTERN, '').toLowerCase()
}

/** 名字越短越严格：≤2 字不模糊，3 字允许 1 错，更长允许 floor(len/3) 错。 */
export function allowedEditDistance(nameLength: number): number {
  if (nameLength <= 2) {
    return 0
  }
  if (nameLength === 3) {
    return 1
  }
  return Math.floor(nameLength / 3)
}

/** 标准 Levenshtein 距离（按字符，中文即按字）。 */
export function levenshtein(left: string, right: string): number {
  if (left === right) {
    return 0
  }
  if (!left.length) {
    return right.length
  }
  if (!right.length) {
    return left.length
  }
  let previous = Array.from({ length: right.length + 1 }, (_unused, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[right.length]
}

function looksLikeDescriptor(normalized: string): boolean {
  return DESCRIPTOR_KEYWORDS.some((keyword) => normalized.includes(keyword))
}

/** 标题文本最多比强化名多这么多字符（超出就说明这行是描述，不是标题）。 */
export const MAX_EXTRA_TITLE_CHARS = 8

/**
 * 长度守卫：判断一段 OCR 文本是否「像标题」。
 *
 * <p>借鉴 aramgg 的 isLikelyTitleSlotText —— 描述行里常常包含强化名，
 * 光靠匹配会误判，先看长度是不是和名字一个量级。
 */
export function isLikelyTitleSlotText(rawText: string, augmentName: string): boolean {
  const normalizedText = normalizeAugmentTitle(rawText)
  const normalizedName = normalizeAugmentTitle(augmentName)
  if (!normalizedText || !normalizedName) {
    return false
  }
  return normalizedText.length <= normalizedName.length + MAX_EXTRA_TITLE_CHARS
}

/**
 * 把一段 OCR 文本匹配到强化。
 *
 * @param rawText OCR 原始文本（可能带标点/空白/换行）
 * @param candidates 全部强化（augmentId + 名称）
 */
export function matchAugmentTitle(rawText: string, candidates: AugmentCandidate[]): AugmentMatch | null {
  const normalized = normalizeAugmentTitle(rawText)
  if (normalized.length < 2 || !candidates.length) {
    return null
  }

  const prepared = candidates
    .map((candidate) => ({ candidate, key: normalizeAugmentTitle(candidate.name) }))
    .filter((entry) => entry.key.length > 0)

  // 1) 精确匹配
  const exact = prepared.find((entry) => entry.key === normalized)
  if (exact) {
    return build(exact.candidate, normalized, 'exact', 0, 1)
  }

  // 2) 别名表（修正已知的系统性误识别）
  const aliasTarget = OCR_ALIASES[normalized]
  if (aliasTarget) {
    const aliasKey = normalizeAugmentTitle(aliasTarget)
    const aliased = prepared.find((entry) => entry.key === aliasKey)
    if (aliased) {
      return build(aliased.candidate, normalized, 'alias', 0, 0.92)
    }
  }

  // 3) 描述文字直接丢弃，别让它糊到某个强化上
  if (looksLikeDescriptor(normalized)) {
    return null
  }

  // 4) 子串匹配（OCR 常吞掉或带出相邻字符）
  const substringMatches = prepared
    .filter((entry) => {
      const shorter = Math.min(entry.key.length, normalized.length)
      const longer = Math.max(entry.key.length, normalized.length)
      return (entry.key.includes(normalized) || normalized.includes(entry.key)) && shorter / longer >= 0.6
    })
    .sort((left, right) => right.key.length - left.key.length)
  if (substringMatches.length) {
    return build(substringMatches[0].candidate, normalized, 'substring', 0, 0.78)
  }

  // 5) 编辑距离模糊匹配
  //
  // 两种比法都要试（借鉴 aramgg 的做法）：
  //   a) 整体比对 —— 处理 OCR 少字/多字（"裁决使" vs "裁决使者"）
  //   b) 滑动窗口 —— 处理 OCR 把标题和相邻文字连在一起（"3 循环往复"）
  let bestMatch: { candidate: AugmentCandidate; distance: number; length: number } | null = null
  for (const entry of prepared) {
    const nameLength = entry.key.length
    const allowed = allowedEditDistance(nameLength)

    const wholeDistance = levenshtein(normalized, entry.key)
    if (wholeDistance <= allowed && (!bestMatch || wholeDistance < bestMatch.distance)) {
      bestMatch = { candidate: entry.candidate, distance: wholeDistance, length: nameLength }
    }

    if (nameLength > 2 && normalized.length >= nameLength) {
      for (let start = 0; start + nameLength <= normalized.length; start += 1) {
        const windowDistance = levenshtein(normalized.slice(start, start + nameLength), entry.key)
        if (windowDistance <= allowed && (!bestMatch || windowDistance < bestMatch.distance)) {
          bestMatch = { candidate: entry.candidate, distance: windowDistance, length: nameLength }
        }
      }
    }
  }
  if (bestMatch) {
    const confidence = Math.max(0.5, 1 - bestMatch.distance / Math.max(2, bestMatch.length))
    return build(bestMatch.candidate, normalized, 'fuzzy', bestMatch.distance, confidence)
  }

  return null
}

function build(
  candidate: AugmentCandidate,
  normalized: string,
  strategy: MatchStrategy,
  distance: number,
  confidence: number
): AugmentMatch {
  return {
    augmentId: candidate.augmentId,
    name: candidate.name,
    normalized,
    strategy,
    distance,
    confidence
  }
}

/**
 * 批量匹配三张卡的 OCR 结果：过滤空文本、按强化 ID 去重、保留置信度最高的一条。
 */
export function matchAugmentTitles(rawTexts: string[], candidates: AugmentCandidate[]): AugmentMatch[] {
  const best = new Map<number, AugmentMatch>()
  for (const rawText of rawTexts) {
    const match = matchAugmentTitle(rawText, candidates)
    if (!match) {
      continue
    }
    const existing = best.get(match.augmentId)
    if (!existing || match.confidence > existing.confidence) {
      best.set(match.augmentId, match)
    }
  }
  return [...best.values()].sort((left, right) => right.confidence - left.confidence)
}
