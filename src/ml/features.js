import { SELECTABLE_GENRES } from '@/data/seedCatalog'

export const GENRE_VOCABULARY = [...SELECTABLE_GENRES]
export const OTHER_GENRE_LABEL = 'other'

export const FEATURE_RANGES = {
  year: { min: 1920, max: 2030 },
  runtimeMinutes: { min: 45, max: 210 },
  imdbRating: { min: 1, max: 10 },
  logVotes: { min: 2, max: 7 },
}

export const FEATURE_DEFAULTS = {
  year: 2000,
  runtimeMinutes: 110,
  imdbRating: 6.5,
  logVotes: 5,
  maturity: 0.5,
}

const MATURITY_BY_RATING = {
  G: 0,
  'TV-G': 0,
  'TV-Y': 0,
  Approved: 0.25,
  Passed: 0.25,
  PG: 0.25,
  'TV-PG': 0.25,
  'PG-13': 0.5,
  'TV-14': 0.5,
  R: 0.8,
  'TV-MA': 0.9,
  'NC-17': 1,
  X: 1,
}

export const NOSTALGIA_PEAK_AGE = 17
export const NOSTALGIA_WIDTH = 9

export const FEATURE_NAMES = [
  ...GENRE_VOCABULARY.map((genre) => `genre:${genre}`),
  `genre:${OTHER_GENRE_LABEL}`,
  'maturity',
  'year',
  'runtime',
  'imdbRating',
  'logVotes',
  'declaredGenreMatch',
  'nostalgiaFit',
]

export const FEATURE_COUNT = FEATURE_NAMES.length

export function normalizeToUnitRange(value, { min, max }) {
  if (!Number.isFinite(value)) return null
  const scaled = (value - min) / (max - min)
  return Math.min(1, Math.max(0, scaled))
}

export function encodeGenres(genres = []) {
  const vector = new Array(GENRE_VOCABULARY.length + 1).fill(0)
  let matchedKnownGenre = false

  for (const genre of genres) {
    const index = GENRE_VOCABULARY.indexOf(genre)
    if (index === -1) continue
    vector[index] = 1
    matchedKnownGenre = true
  }

  if (!matchedKnownGenre) vector[vector.length - 1] = 1
  return vector
}

export function encodeMaturity(rated) {
  return MATURITY_BY_RATING[rated] ?? FEATURE_DEFAULTS.maturity
}

export function encodeVoteCount(imdbVotes) {
  if (!Number.isFinite(imdbVotes) || imdbVotes <= 0) return FEATURE_DEFAULTS.logVotes
  return Math.log10(imdbVotes)
}

export function encodeDeclaredGenreMatch(movieGenres = [], favoriteGenres = []) {
  if (favoriteGenres.length === 0) return 0

  const favorites = new Set(favoriteGenres)
  const matches = movieGenres.filter((genre) => favorites.has(genre)).length

  return Math.min(1, matches / 2)
}

export function encodeNostalgiaFit(movieYear, birthYear) {
  if (!Number.isFinite(movieYear) || !Number.isFinite(birthYear)) return 0.5

  const ageAtRelease = movieYear - birthYear
  const distance = (ageAtRelease - NOSTALGIA_PEAK_AGE) / NOSTALGIA_WIDTH

  return Math.exp(-0.5 * distance * distance)
}

export function buildFeatureVector(movie, viewer = {}) {
  const year = normalizeToUnitRange(movie.year, FEATURE_RANGES.year)
  const runtime = normalizeToUnitRange(movie.runtimeMinutes, FEATURE_RANGES.runtimeMinutes)
  const imdbRating = normalizeToUnitRange(movie.imdbRating, FEATURE_RANGES.imdbRating)
  const logVotes = normalizeToUnitRange(encodeVoteCount(movie.imdbVotes), FEATURE_RANGES.logVotes)

  return [
    ...encodeGenres(movie.genres),
    encodeMaturity(movie.rated),
    year ?? normalizeToUnitRange(FEATURE_DEFAULTS.year, FEATURE_RANGES.year),
    runtime ?? normalizeToUnitRange(FEATURE_DEFAULTS.runtimeMinutes, FEATURE_RANGES.runtimeMinutes),
    imdbRating ?? normalizeToUnitRange(FEATURE_DEFAULTS.imdbRating, FEATURE_RANGES.imdbRating),
    logVotes ?? normalizeToUnitRange(FEATURE_DEFAULTS.logVotes, FEATURE_RANGES.logVotes),
    encodeDeclaredGenreMatch(movie.genres, viewer.favoriteGenres ?? []),
    encodeNostalgiaFit(movie.year, viewer.birthYear),
  ]
}

export function describeFeatureVector(vector) {
  return FEATURE_NAMES.map((name, index) => ({ name, value: vector[index] }))
}

export function buildTrainingSet(ratings, moviesById, viewer = {}) {
  const features = []
  const labels = []
  const usedImdbIds = []

  for (const { imdbId, liked } of ratings) {
    const movie = moviesById.get?.(imdbId) ?? moviesById[imdbId]
    if (!movie) continue
    if (liked !== true && liked !== false) continue

    features.push(buildFeatureVector(movie, viewer))
    labels.push(liked ? 1 : 0)
    usedImdbIds.push(imdbId)
  }

  const positives = labels.filter((label) => label === 1).length

  return {
    features,
    labels,
    imdbIds: usedImdbIds,
    size: labels.length,
    positives,
    negatives: labels.length - positives,
  }
}
