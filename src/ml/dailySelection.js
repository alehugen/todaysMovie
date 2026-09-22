import { shuffle } from '@/services/movieSampler'

import { diversifyRanking } from './ranking'

export const DAILY_SELECTION_SIZE = 5
export const EXPLORATION_SLOTS = 1

export function dateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function buildDailySelection(
  ranked,
  {
    size = DAILY_SELECTION_SIZE,
    explorationSlots = EXPLORATION_SLOTS,
    random = Math.random,
    ...diversityOptions
  } = {},
) {
  if (ranked.length === 0) return []

  const exploitCount = Math.max(1, size - explorationSlots)
  const exploited = diversifyRanking(ranked, {
    ...diversityOptions,
    count: Math.min(exploitCount, ranked.length),
  }).map((movie) => ({ ...movie, isExploration: false }))

  const chosenIds = new Set(exploited.map((movie) => movie.imdbId))
  const remaining = ranked.filter((movie) => !chosenIds.has(movie.imdbId))

  const explored = shuffle(remaining, random)
    .slice(0, Math.max(0, size - exploited.length))
    .map((movie) => ({ ...movie, isExploration: true }))

  return [...exploited, ...explored]
}
