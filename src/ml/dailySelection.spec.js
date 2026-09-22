import { describe, expect, it } from 'vitest'

import { buildDailySelection, dateKey } from './dailySelection'

function seededRandom(seed = 3) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const RANKED = [
  { imdbId: 'a', genres: ['Sci-Fi'], year: 2014, score: 0.95 },
  { imdbId: 'b', genres: ['Sci-Fi'], year: 2016, score: 0.94 },
  { imdbId: 'c', genres: ['Comedy'], year: 1995, score: 0.8 },
  { imdbId: 'd', genres: ['Horror'], year: 1980, score: 0.7 },
  { imdbId: 'e', genres: ['Drama'], year: 2001, score: 0.6 },
  { imdbId: 'f', genres: ['Western'], year: 1969, score: 0.2 },
  { imdbId: 'g', genres: ['Musical'], year: 1952, score: 0.1 },
]

describe('dateKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(dateKey(new Date(2026, 8, 21))).toBe('2026-09-21')
  })

  it('pads single digit months and days', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('uses the local day, not UTC', () => {
    const lateNight = new Date(2026, 8, 21, 23, 30)
    expect(dateKey(lateNight)).toBe('2026-09-21')
  })
})

describe('buildDailySelection', () => {
  it('returns the requested amount', () => {
    const selection = buildDailySelection(RANKED, { random: seededRandom() })

    expect(selection).toHaveLength(5)
  })

  it('keeps the best-scored movie as the highlight', () => {
    const selection = buildDailySelection(RANKED, { random: seededRandom() })

    expect(selection[0].imdbId).toBe('a')
    expect(selection[0].isExploration).toBe(false)
  })

  it('marks the exploration picks so the UI can label them', () => {
    const selection = buildDailySelection(RANKED, { explorationSlots: 2, random: seededRandom() })

    expect(selection.filter((movie) => movie.isExploration)).toHaveLength(2)
  })

  it('takes the exploration pick from outside the top scores', () => {
    const selection = buildDailySelection(RANKED, { random: seededRandom() })
    const exploration = selection.find((movie) => movie.isExploration)

    expect(exploration).toBeDefined()
    expect(selection.filter((movie) => movie.isExploration)).toHaveLength(1)
  })

  it('never repeats a movie', () => {
    const selection = buildDailySelection(RANKED, { random: seededRandom() })

    expect(new Set(selection.map((movie) => movie.imdbId)).size).toBe(selection.length)
  })

  it('varies the exploration pick from day to day', () => {
    const picks = new Set()

    for (let seed = 1; seed <= 30; seed += 1) {
      const selection = buildDailySelection(RANKED, { random: seededRandom(seed) })
      picks.add(selection.find((movie) => movie.isExploration)?.imdbId)
    }

    expect(picks.size).toBeGreaterThan(1)
  })

  it('still fills the list when the pool is smaller than requested', () => {
    const selection = buildDailySelection(RANKED.slice(0, 3), { random: seededRandom() })

    expect(selection).toHaveLength(3)
  })

  it('copes with an empty pool', () => {
    expect(buildDailySelection([], { random: seededRandom() })).toEqual([])
  })

  it('always keeps at least one exploitation slot', () => {
    const selection = buildDailySelection(RANKED, { size: 1, explorationSlots: 5, random: seededRandom() })

    expect(selection).toHaveLength(1)
    expect(selection[0].isExploration).toBe(false)
  })
})
