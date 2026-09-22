/**
 * STEP 5 OF THE PIPELINE — RANKING
 *
 * The model returns a probability per movie. Turning those probabilities into a
 * list a person actually wants to read takes two corrections:
 *
 *   1. tie-breaking, because a confident model saturates and produces ties;
 *   2. diversity, because the five best-scored movies are usually five versions of
 *      the same movie.
 */

import { shuffle } from '@/services/movieSampler'

// Score differences below this are treated as a tie. A gap of 0.9998 vs 0.9997 is
// numerical noise, not an opinion, and pretending otherwise gives it meaning.
export const TIE_TOLERANCE = 0.005

/**
 * Sorts candidates by score, highest first, breaking ties at random.
 *
 * Why the shuffle before the sort: a well-fitted model SATURATES its sigmoid, so
 * the top candidates all come back as 0.999x and are effectively tied. Sorting
 * them directly would fall back to array order, and the "movie of the day" would
 * be the same title forever.
 *
 * JavaScript's `sort` has been stable since ES2019 — items the comparator calls
 * equal keep their relative order — so shuffling first makes tied items come out
 * in random order while genuinely different scores still sort correctly.
 */
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

/**
 * Jaccard index: the size of the intersection over the size of the union.
 *
 *     {Sci-Fi, Action} vs {Sci-Fi, Action}  →  2/2 = 1.00
 *     {Sci-Fi, Action} vs {Sci-Fi}          →  1/2 = 0.50
 *     {Sci-Fi, Action} vs {Horror}          →  0/3 = 0.00
 *
 * It is the right measure for comparing sets of different sizes, which is exactly
 * the case here: one movie can have three genres and another only one.
 */
function jaccardSimilarity(first = [], second = []) {
  if (first.length === 0 && second.length === 0) return 0

  const left = new Set(first)
  const right = new Set(second)
  const shared = [...left].filter((item) => right.has(item)).length
  const union = new Set([...left, ...right]).size

  return union === 0 ? 0 : shared / union
}

const decadeOf = (year) => (Number.isFinite(year) ? Math.floor(year / 10) * 10 : null)

// How interchangeable two movies feel to a viewer. The weights are a judgement
// call: genre dominates, shared cast or director matters, era is a nudge.
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

/**
 * MAXIMAL MARGINAL RELEVANCE — picks a list that is both relevant and varied.
 *
 * The problem it solves is the same one object detectors solve with non-maximum
 * suppression: the naive answer returns the same thing five times. Here, a model
 * that has learned "this user likes sci-fi" ranks five sci-fi movies at the top,
 * and if the user is not in the mood for sci-fi today the whole screen is useless.
 *
 *     value(movie) = λ · score − (1 − λ) · (highest similarity to what is already picked)
 *                      ↑                        ↑
 *                how much you           how much it repeats
 *                 should like it
 *
 * Movies are chosen one at a time, always the highest `value`. With λ = 0.72 a
 * movie has to be clearly better scored to justify being a near-duplicate.
 *
 * Note the first pick: nothing has been chosen yet, so the similarity penalty is 0
 * and it is simply the highest-scored movie. The daily highlight is never
 * penalised for diversity — only the alternatives are.
 */
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
