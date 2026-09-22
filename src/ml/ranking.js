import { shuffle } from '@/services/movieSampler'

export const TIE_TOLERANCE = 0.005

export function rankByScore(movies, scores, { random = Math.random } = {}) {
  const entries = movies.map((movie, index) => ({ ...movie, score: scores[index] ?? 0 }))

  return shuffle(entries, random).sort((first, second) => {
    const gap = second.score - first.score
    return Math.abs(gap) < TIE_TOLERANCE ? 0 : gap
  })
}

export function splitTopAndAlternatives(ranked, alternativeCount = 4) {
  return {
    top: ranked[0] ?? null,
    alternatives: ranked.slice(1, alternativeCount + 1),
  }
}

function jaccardSimilarity(first = [], second = []) {
  if (first.length === 0 && second.length === 0) return 0

  const left = new Set(first)
  const right = new Set(second)
  const shared = [...left].filter((item) => right.has(item)).length
  const union = new Set([...left, ...right]).size

  return union === 0 ? 0 : shared / union
}

const decadeOf = (year) => (Number.isFinite(year) ? Math.floor(year / 10) * 10 : null)

export function movieSimilarity(first, second) {
  const genres = jaccardSimilarity(first.genres, second.genres)

  const people = jaccardSimilarity(
    [...(first.directors ?? []), ...(first.actors ?? [])],
    [...(second.directors ?? []), ...(second.actors ?? [])],
  )

  const firstDecade = decadeOf(first.year)
  const sameDecade = firstDecade !== null && firstDecade === decadeOf(second.year) ? 1 : 0

  return 0.6 * genres + 0.25 * people + 0.15 * sameDecade
}

export function diversifyRanking(
  ranked,
  { count = 5, lambda = 0.72, similarity = movieSimilarity } = {},
) {
  const pool = [...ranked]
  const picked = []

  while (picked.length < count && pool.length > 0) {
    let bestIndex = 0
    let bestValue = Number.NEGATIVE_INFINITY

    pool.forEach((movie, index) => {
      const closest = picked.reduce(
        (highest, chosen) => Math.max(highest, similarity(movie, chosen)),
        0,
      )

      const value = lambda * movie.score - (1 - lambda) * closest
      if (value > bestValue) {
        bestValue = value
        bestIndex = index
      }
    })

    picked.push(pool.splice(bestIndex, 1)[0])
  }

  return picked
}
