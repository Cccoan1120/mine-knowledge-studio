export function fuseRankings(denseCandidates, keywordCandidates, { k = 60 } = {}) {
  const fused = new Map()
  let order = 0

  for (const candidates of [denseCandidates, keywordCandidates]) {
    candidates.forEach((candidate, index) => {
      const id = String(candidate.id)
      const current = fused.get(id) ?? { ...candidate, score: 0, order: order++ }
      current.score += 1 / (k + index + 1)
      fused.set(id, current)
    })
  }

  return Array.from(fused.values())
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map(({ order: _order, ...candidate }) => candidate)
}
