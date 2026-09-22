import { describe, expect, it } from 'vitest'

import { diversifyRanking, movieSimilarity, rankByScore, splitTopAndAlternatives } from './ranking'

function seededRandom(seed = 5) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const MOVIES = [
  { imdbId: 'a', title: 'A' },
  { imdbId: 'b', title: 'B' },
  { imdbId: 'c', title: 'C' },
  { imdbId: 'd', title: 'D' },
]

describe('rankByScore', () => {
  it('puts the highest score first', () => {
    const ranked = rankByScore(MOVIES, [0.1, 0.9, 0.5, 0.3], { random: seededRandom() })

    expect(ranked.map((movie) => movie.imdbId)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('attaches the score to each movie', () => {
    const ranked = rankByScore(MOVIES, [0.1, 0.9, 0.5, 0.3], { random: seededRandom() })

    expect(ranked[0]).toMatchObject({ imdbId: 'b', title: 'B', score: 0.9 })
  })

  it('treats a missing score as zero instead of breaking the sort', () => {
    const ranked = rankByScore(MOVIES, [0.5], { random: seededRandom() })

    expect(ranked[0].imdbId).toBe('a')
    expect(ranked.every((movie) => Number.isFinite(movie.score))).toBe(true)
  })

  it('does not always pick the same winner when the model is saturated', () => {
    const saturated = [0.9998, 0.9997, 0.9999, 0.9996]
    const winners = new Set()

    for (let seed = 1; seed <= 40; seed += 1) {
      winners.add(rankByScore(MOVIES, saturated, { random: seededRandom(seed) })[0].imdbId)
    }

    expect(winners.size).toBeGreaterThan(1)
  })

  it('still respects a real gap between scores', () => {
    const winners = new Set()

    for (let seed = 1; seed <= 40; seed += 1) {
      winners.add(rankByScore(MOVIES, [0.2, 0.95, 0.3, 0.1], { random: seededRandom(seed) })[0].imdbId)
    }

    expect([...winners]).toEqual(['b'])
  })

  it('leaves the original arrays untouched', () => {
    const scores = [0.1, 0.9, 0.5, 0.3]
    rankByScore(MOVIES, scores, { random: seededRandom() })

    expect(MOVIES[0].imdbId).toBe('a')
    expect(scores).toEqual([0.1, 0.9, 0.5, 0.3])
  })
})

describe('splitTopAndAlternatives', () => {
  it('separates the highlight from the runners-up', () => {
    const ranked = rankByScore(MOVIES, [0.1, 0.9, 0.5, 0.3], { random: seededRandom() })
    const { top, alternatives } = splitTopAndAlternatives(ranked, 2)

    expect(top.imdbId).toBe('b')
    expect(alternatives.map((movie) => movie.imdbId)).toEqual(['c', 'd'])
  })

  it('copes with an empty ranking', () => {
    const { top, alternatives } = splitTopAndAlternatives([])

    expect(top).toBeNull()
    expect(alternatives).toEqual([])
  })
})

const SCIFI_A = { imdbId: 's1', genres: ['Sci-Fi', 'Action'], year: 2014, directors: ['Nolan'], actors: ['X'], score: 0.98 }
const SCIFI_B = { imdbId: 's2', genres: ['Sci-Fi', 'Action'], year: 2016, directors: ['Nolan'], actors: ['X'], score: 0.97 }
const SCIFI_C = { imdbId: 's3', genres: ['Sci-Fi'], year: 2013, directors: ['Other'], actors: ['Y'], score: 0.96 }
const COMEDY = { imdbId: 'c1', genres: ['Comedy', 'Romance'], year: 1995, directors: ['Z'], actors: ['W'], score: 0.80 }
const HORROR = { imdbId: 'h1', genres: ['Horror'], year: 1980, directors: ['Q'], actors: ['V'], score: 0.72 }

describe('movieSimilarity', () => {
  it('scores two near-identical movies close to 1', () => {
    expect(movieSimilarity(SCIFI_A, SCIFI_B)).toBeGreaterThan(0.7)
  })

  it('scores two unrelated movies close to 0', () => {
    expect(movieSimilarity(SCIFI_A, HORROR)).toBeLessThan(0.15)
  })

  it('is symmetric', () => {
    expect(movieSimilarity(SCIFI_A, COMEDY)).toBeCloseTo(movieSimilarity(COMEDY, SCIFI_A), 10)
  })

  it('survives movies without cast information', () => {
    const bare = { imdbId: 'x', genres: ['Sci-Fi'], year: 2014 }
    expect(movieSimilarity(bare, SCIFI_A)).toBeGreaterThan(0)
  })
})

describe('diversifyRanking', () => {
  const ranked = [SCIFI_A, SCIFI_B, SCIFI_C, COMEDY, HORROR]

  it('keeps the best-scored movie as the highlight', () => {
    expect(diversifyRanking(ranked, { count: 3 })[0].imdbId).toBe('s1')
  })

  it('avoids filling the list with near-duplicates', () => {
    const picked = diversifyRanking(ranked, { count: 3 }).map((movie) => movie.imdbId)

    expect(picked[0]).toBe('s1')
    expect(picked).not.toContain('s2')
    expect(picked).toContain('c1')
  })

  it('falls back to pure score when diversity is switched off', () => {
    const picked = diversifyRanking(ranked, { count: 3, lambda: 1 })

    expect(picked.map((movie) => movie.imdbId)).toEqual(['s1', 's2', 's3'])
  })

  it('never returns more movies than the pool holds', () => {
    expect(diversifyRanking([SCIFI_A], { count: 5 })).toHaveLength(1)
  })

  it('leaves the incoming ranking untouched', () => {
    diversifyRanking(ranked, { count: 3 })

    expect(ranked.map((movie) => movie.imdbId)).toEqual(['s1', 's2', 's3', 'c1', 'h1'])
  })
})
