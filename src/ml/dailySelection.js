/**
 * STEP 6 OF THE PIPELINE — THE DAILY PICK
 *
 * Turns a ranked list into the five movies shown today: one highlight, three
 * diverse alternatives, and one deliberate wildcard.
 */

import { shuffle } from '@/services/movieSampler'

import { diversifyRanking } from './ranking'

export const DAILY_SELECTION_SIZE = 5
export const EXPLORATION_SLOTS = 1

/**
 * Builds the key that makes the daily pick stable: the selection is computed once
 * and stored under today's date, so refreshing the page does not reshuffle it.
 *
 * Note that this reads the LOCAL date, not UTC. Using `toISOString().slice(0, 10)`
 * would be the obvious one-liner and would be wrong: for a user at UTC−3 the movie
 * of the day would change at 9 p.m. rather than at midnight.
 */
export function dateKey(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * EXPLORATION VERSUS EXPLOITATION.
 *
 * Four slots EXPLOIT what the model believes: the diversified top of the ranking.
 * One slot EXPLORES: a movie drawn at random from everything else, regardless of
 * its score, flagged so the UI can label it a wildcard.
 *
 * Why give a slot away to chance? A model trained on ~20 examples is very likely
 * wrong about some whole genre. If the app only ever shows what the model already
 * approves of, that mistake is never tested and the user stays inside a bubble the
 * model built for them. This is ε-greedy, the simplest multi-armed-bandit strategy:
 * usually take the best known bet, occasionally try something new to keep learning.
 *
 * The cost is low, because exploration is never wasted: even a wildcard the user
 * rejects produces a negative training example, and negatives are exactly what the
 * questionnaire is short of.
 */
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

  // At least one exploitation slot always survives, so there is always a genuine
  // "today's movie" even if the caller asks for more exploration than size allows.
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
