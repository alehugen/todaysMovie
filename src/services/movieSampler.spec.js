import { describe, expect, it } from 'vitest'

import { decadesForBirthYear, sampleMoviesForProfile, shuffle } from './movieSampler'

function seededRandom(seed = 42) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const GENRE_CYCLE = [['Action'], ['Comedy'], ['Horror'], ['Drama'], ['Action', 'Comedy']]

const CATALOG = []
for (const decade of [1970, 1980, 1990, 2000, 2010, 2020]) {
  for (let offset = 0; offset < 6; offset += 1) {
    CATALOG.push({
      imdbId: `tt${decade}${offset}`,
      title: `Movie ${decade}-${offset}`,
      year: decade + offset,
      genres: GENRE_CYCLE[offset % GENRE_CYCLE.length],
    })
  }
}

const decadeOf = (movie) => Math.floor(movie.year / 10) * 10

describe('shuffle', () => {
  it('keeps every item and leaves the original array untouched', () => {
    const original = [1, 2, 3, 4, 5]
    const shuffled = shuffle(original, seededRandom())

    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5])
    expect(original).toEqual([1, 2, 3, 4, 5])
  })
})

describe('decadesForBirthYear', () => {
  it('lists every decade the person has lived through', () => {
    expect(decadesForBirthYear(1993, 2026)).toEqual([1990, 2000, 2010, 2020])
  })

  it('handles someone born in the current decade', () => {
    expect(decadesForBirthYear(2021, 2026)).toEqual([2020])
  })

  it('returns nothing when the birth year is unknown', () => {
    expect(decadesForBirthYear(null)).toEqual([])
    expect(decadesForBirthYear(Number.NaN)).toEqual([])
  })
})

describe('sampleMoviesForProfile', () => {
  const baseOptions = { genres: ['Action', 'Comedy'], birthYear: 1993, currentYear: 2026 }

  it('returns exactly the requested amount', () => {
    const sample = sampleMoviesForProfile(CATALOG, {
      ...baseOptions,
      total: 12,
      random: seededRandom(),
    })

    expect(sample).toHaveLength(12)
  })

  it('never repeats a movie', () => {
    const sample = sampleMoviesForProfile(CATALOG, {
      ...baseOptions,
      total: 16,
      random: seededRandom(),
    })

    expect(new Set(sample.map((movie) => movie.imdbId)).size).toBe(sample.length)
  })

  it('covers every decade the person has lived through', () => {
    const sample = sampleMoviesForProfile(CATALOG, {
      ...baseOptions,
      total: 12,
      random: seededRandom(),
    })

    const decades = new Set(sample.map(decadeOf))
    expect([...decades].sort()).toEqual([1990, 2000, 2010, 2020])
  })

  it('splits the movies evenly across those decades', () => {
    const sample = sampleMoviesForProfile(CATALOG, {
      ...baseOptions,
      total: 12,
      random: seededRandom(),
    })

    const perDecade = {}
    for (const movie of sample) perDecade[decadeOf(movie)] = (perDecade[decadeOf(movie)] ?? 0) + 1

    expect(Object.values(perDecade)).toEqual([3, 3, 3, 3])
  })

  it('never picks a movie released before the person was born', () => {
    const sample = sampleMoviesForProfile(CATALOG, {
      ...baseOptions,
      total: 12,
      random: seededRandom(),
    })

    expect(sample.every((movie) => movie.year >= 1990)).toBe(true)
  })

  it('favors the chosen genres without picking only them', () => {
    const sample = sampleMoviesForProfile(CATALOG, {
      ...baseOptions,
      total: 12,
      outsideRatio: 0.25,
      random: seededRandom(),
    })

    const favorites = sample.filter((movie) =>
      movie.genres.some((genre) => baseOptions.genres.includes(genre)),
    )

    expect(favorites.length).toBeGreaterThan(sample.length / 2)
    expect(favorites.length).toBeLessThan(sample.length)
  })

  it('borrows from other decades when one of them is too thin', () => {
    const thinCatalog = CATALOG.filter((movie) => decadeOf(movie) !== 2020 || movie.year === 2020)

    const sample = sampleMoviesForProfile(thinCatalog, {
      ...baseOptions,
      total: 12,
      random: seededRandom(),
    })

    expect(sample).toHaveLength(12)
    expect(sample.filter((movie) => decadeOf(movie) === 2020)).toHaveLength(1)
  })

  it('uses the whole catalog when the birth year is unknown', () => {
    const sample = sampleMoviesForProfile(CATALOG, {
      genres: ['Action'],
      birthYear: null,
      total: 10,
      random: seededRandom(),
    })

    expect(sample).toHaveLength(10)
    expect(new Set(sample.map(decadeOf)).size).toBeGreaterThan(1)
  })

  it('never asks for more movies than the catalog holds', () => {
    const sample = sampleMoviesForProfile(CATALOG, {
      ...baseOptions,
      total: 500,
      random: seededRandom(),
    })

    expect(sample.length).toBeLessThanOrEqual(CATALOG.length)
  })

  it('is reproducible for the same seed', () => {
    const options = { ...baseOptions, total: 12 }
    const first = sampleMoviesForProfile(CATALOG, { ...options, random: seededRandom(7) })
    const second = sampleMoviesForProfile(CATALOG, { ...options, random: seededRandom(7) })

    expect(first.map((movie) => movie.imdbId)).toEqual(second.map((movie) => movie.imdbId))
  })
})
