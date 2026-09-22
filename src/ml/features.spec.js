import { describe, expect, it } from 'vitest'

import {
  NOSTALGIA_PEAK_AGE,
  FEATURE_COUNT,
  FEATURE_NAMES,
  GENRE_VOCABULARY,
  buildFeatureVector,
  buildTrainingSet,
  encodeDeclaredGenreMatch,
  encodeGenres,
  encodeMaturity,
  encodeNostalgiaFit,
  encodeVoteCount,
  normalizeToUnitRange,
} from './features'

const INTERSTELLAR = {
  imdbId: 'tt0816692',
  title: 'Interstellar',
  genres: ['Adventure', 'Drama', 'Sci-Fi'],
  year: 2014,
  runtimeMinutes: 169,
  imdbRating: 8.7,
  imdbVotes: 2516752,
  rated: 'PG-13',
}

const EMPTY_MOVIE = {
  imdbId: 'tt0000000',
  title: 'Nothing Known',
  genres: [],
  year: null,
  runtimeMinutes: null,
  imdbRating: null,
  imdbVotes: null,
  rated: null,
}

describe('normalizeToUnitRange', () => {
  it('maps a value to 0..1 inside the range', () => {
    expect(normalizeToUnitRange(5, { min: 0, max: 10 })).toBe(0.5)
  })

  it('clamps anything outside the range', () => {
    expect(normalizeToUnitRange(-40, { min: 0, max: 10 })).toBe(0)
    expect(normalizeToUnitRange(999, { min: 0, max: 10 })).toBe(1)
  })

  it('returns null for a missing value instead of NaN', () => {
    expect(normalizeToUnitRange(null, { min: 0, max: 10 })).toBeNull()
    expect(normalizeToUnitRange(Number.NaN, { min: 0, max: 10 })).toBeNull()
  })
})

describe('encodeGenres', () => {
  it('turns on one slot per known genre', () => {
    const encoded = encodeGenres(['Adventure', 'Drama', 'Sci-Fi'])

    expect(encoded).toHaveLength(GENRE_VOCABULARY.length + 1)
    expect(encoded.filter((value) => value === 1)).toHaveLength(3)
    expect(encoded[GENRE_VOCABULARY.indexOf('Drama')]).toBe(1)
    expect(encoded[GENRE_VOCABULARY.indexOf('Horror')]).toBe(0)
  })

  it('falls back to the "other" slot for genres outside the vocabulary', () => {
    const encoded = encodeGenres(['Film-Noir', 'Western'])

    expect(encoded.at(-1)).toBe(1)
    expect(encoded.slice(0, -1).every((value) => value === 0)).toBe(true)
  })

  it('marks "other" when the movie has no genre at all', () => {
    expect(encodeGenres([]).at(-1)).toBe(1)
  })

  it('keeps the known genres when only some are outside the vocabulary', () => {
    const encoded = encodeGenres(['Drama', 'Film-Noir'])

    expect(encoded[GENRE_VOCABULARY.indexOf('Drama')]).toBe(1)
    expect(encoded.at(-1)).toBe(0)
  })
})

describe('encodeMaturity', () => {
  it('keeps the natural order of the age ratings', () => {
    expect(encodeMaturity('G')).toBeLessThan(encodeMaturity('PG'))
    expect(encodeMaturity('PG')).toBeLessThan(encodeMaturity('PG-13'))
    expect(encodeMaturity('PG-13')).toBeLessThan(encodeMaturity('R'))
    expect(encodeMaturity('R')).toBeLessThan(encodeMaturity('NC-17'))
  })

  it('uses a neutral middle value for an unknown rating', () => {
    expect(encodeMaturity(null)).toBe(0.5)
    expect(encodeMaturity('SOMETHING-NEW')).toBe(0.5)
  })
})

describe('encodeVoteCount', () => {
  it('compresses the vote count with a base-10 logarithm', () => {
    expect(encodeVoteCount(1000)).toBeCloseTo(3)
    expect(encodeVoteCount(1000000)).toBeCloseTo(6)
  })

  it('falls back to a typical value when votes are missing', () => {
    expect(encodeVoteCount(null)).toBe(5)
    expect(encodeVoteCount(0)).toBe(5)
  })
})

describe('encodeDeclaredGenreMatch', () => {
  it('is zero when the viewer never picked a genre', () => {
    expect(encodeDeclaredGenreMatch(['Drama'], [])).toBe(0)
  })

  it('grows with the number of genres the viewer asked for', () => {
    expect(encodeDeclaredGenreMatch(['Horror'], ['Drama', 'Sci-Fi'])).toBe(0)
    expect(encodeDeclaredGenreMatch(['Drama'], ['Drama', 'Sci-Fi'])).toBe(0.5)
    expect(encodeDeclaredGenreMatch(['Drama', 'Sci-Fi'], ['Drama', 'Sci-Fi'])).toBe(1)
  })

  it('never goes above 1', () => {
    expect(encodeDeclaredGenreMatch(['A', 'B', 'C'], ['A', 'B', 'C'])).toBe(1)
  })
})

describe('encodeNostalgiaFit', () => {
  it('peaks for a movie released in the viewer teens', () => {
    const peak = encodeNostalgiaFit(2010, 2010 - NOSTALGIA_PEAK_AGE)
    expect(peak).toBeCloseTo(1, 5)
  })

  it('fades for movies released long before the viewer was born', () => {
    expect(encodeNostalgiaFit(1950, 1993)).toBeLessThan(0.05)
  })

  it('fades for movies released much later in life', () => {
    const teens = encodeNostalgiaFit(2010, 1993)
    const midlife = encodeNostalgiaFit(2050, 1993)
    expect(midlife).toBeLessThan(teens)
  })

  it('stays neutral when the birth year is unknown', () => {
    expect(encodeNostalgiaFit(2010, null)).toBe(0.5)
    expect(encodeNostalgiaFit(null, 1993)).toBe(0.5)
  })
})

describe('buildFeatureVector', () => {
  it('always returns a vector of the same length', () => {
    expect(buildFeatureVector(INTERSTELLAR)).toHaveLength(FEATURE_COUNT)
    expect(buildFeatureVector(EMPTY_MOVIE)).toHaveLength(FEATURE_COUNT)
    expect(FEATURE_NAMES).toHaveLength(FEATURE_COUNT)
  })

  it('keeps every number inside 0..1', () => {
    for (const movie of [INTERSTELLAR, EMPTY_MOVIE]) {
      for (const value of buildFeatureVector(movie)) {
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  it('never produces NaN, even when every field is missing', () => {
    expect(buildFeatureVector(EMPTY_MOVIE).some(Number.isNaN)).toBe(false)
  })

  it('places each feature at its documented position', () => {
    const vector = buildFeatureVector(INTERSTELLAR)
    const valueOf = (name) => vector[FEATURE_NAMES.indexOf(name)]

    expect(valueOf('genre:Sci-Fi')).toBe(1)
    expect(valueOf('genre:Horror')).toBe(0)
    expect(valueOf('maturity')).toBe(0.5)
    expect(valueOf('year')).toBeCloseTo((2014 - 1920) / (2030 - 1920), 5)
    expect(valueOf('runtime')).toBeCloseTo((169 - 45) / (210 - 45), 5)
    expect(valueOf('imdbRating')).toBeCloseTo((8.7 - 1) / (10 - 1), 5)
  })

  it('is deterministic', () => {
    expect(buildFeatureVector(INTERSTELLAR)).toEqual(buildFeatureVector(INTERSTELLAR))
  })

  it('reacts to the viewer profile', () => {
    const anonymous = buildFeatureVector(INTERSTELLAR)
    const fan = buildFeatureVector(INTERSTELLAR, {
      birthYear: 1997,
      favoriteGenres: ['Sci-Fi', 'Drama'],
    })

    const valueOf = (vector, name) => vector[FEATURE_NAMES.indexOf(name)]

    expect(valueOf(anonymous, 'declaredGenreMatch')).toBe(0)
    expect(valueOf(fan, 'declaredGenreMatch')).toBe(1)
    expect(valueOf(fan, 'nostalgiaFit')).toBeGreaterThan(valueOf(anonymous, 'nostalgiaFit'))
  })

  it('keeps the viewer features neutral when there is no profile', () => {
    const vector = buildFeatureVector(INTERSTELLAR)

    expect(vector[FEATURE_NAMES.indexOf('nostalgiaFit')]).toBe(0.5)
  })
})

describe('buildTrainingSet', () => {
  const moviesById = new Map([
    ['tt0816692', INTERSTELLAR],
    ['tt0000000', EMPTY_MOVIE],
  ])

  it('pairs each rating with its feature vector', () => {
    const dataset = buildTrainingSet(
      [
        { imdbId: 'tt0816692', liked: true },
        { imdbId: 'tt0000000', liked: false },
      ],
      moviesById,
    )

    expect(dataset.size).toBe(2)
    expect(dataset.features).toHaveLength(2)
    expect(dataset.features[0]).toHaveLength(FEATURE_COUNT)
    expect(dataset.labels).toEqual([1, 0])
  })

  it('counts each class so we can spot an unbalanced dataset', () => {
    const dataset = buildTrainingSet(
      [
        { imdbId: 'tt0816692', liked: true },
        { imdbId: 'tt0000000', liked: true },
      ],
      moviesById,
    )

    expect(dataset.positives).toBe(2)
    expect(dataset.negatives).toBe(0)
  })

  it('skips ratings whose movie is not in the catalog', () => {
    const dataset = buildTrainingSet([{ imdbId: 'tt9999999', liked: true }], moviesById)

    expect(dataset.size).toBe(0)
  })

  it('skips "haven\'t seen" answers', () => {
    const dataset = buildTrainingSet(
      [
        { imdbId: 'tt0816692', liked: null },
        { imdbId: 'tt0000000', liked: false },
      ],
      moviesById,
    )

    expect(dataset.size).toBe(1)
    expect(dataset.labels).toEqual([0])
  })

  it('also accepts a plain object instead of a Map', () => {
    const dataset = buildTrainingSet([{ imdbId: 'tt0816692', liked: true }], {
      tt0816692: INTERSTELLAR,
    })

    expect(dataset.size).toBe(1)
  })
})
