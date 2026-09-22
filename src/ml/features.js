/**
 * STEP 1 OF THE PIPELINE — FEATURE ENGINEERING
 *
 * A neural network cannot read "The Shawshank Redemption, Drama, 1994, 142 min".
 * It only consumes vectors of numbers of a FIXED length.
 *
 *   { genres: ['Drama', 'Crime'], year: 1994, runtimeMinutes: 142, ... }
 *                              ↓ this file
 *   [0, 0, 0, 0, 1, 1, 0, ..., 0.8, 0.67, 0.59, 0.86, 0.88, 0.5, 0.31]
 *
 * Three rules drive every decision below:
 *
 *   1. Fixed length. Position 14 must mean "year" forever — at training time, at
 *      inference time, and when a model saved last week is loaded again. A shifted
 *      position silently feeds the network garbage with no error anywhere.
 *   2. Everything in 0..1. Gradient descent applies one learning rate to every
 *      weight. If one input arrives in the millions (vote counts) and another in
 *      single digits (IMDb rating), the large one dominates the gradient and the
 *      network effectively ignores the rest.
 *   3. No NaN, ever. A single NaN propagates through the whole tensor, the loss
 *      becomes NaN and the model never converges. Missing data is filled with a
 *      neutral value instead.
 */

import { SELECTABLE_GENRES } from '@/data/seedCatalog'

// The genres the questionnaire offers. Every other genre in the catalog
// (War, Western, Film-Noir, ...) collapses into a single `other` slot.
// Each genre costs one dimension, and dimensions are expensive when the whole
// training set is ~20 examples, so the vocabulary is deliberately short.
export const GENRE_VOCABULARY = [...SELECTABLE_GENRES]
export const OTHER_GENRE_LABEL = 'other'

/**
 * Min-max normalisation bounds.
 *
 * These are FIXED CONSTANTS taken from the domain, not statistics computed from
 * the data, and that is the whole point. Deriving min/max from the dataset would
 * cause two problems:
 *
 *   - Data leakage: if the bounds are computed over the full dataset, information
 *     from the evaluation split leaks into training and the reported accuracy
 *     becomes optimistic.
 *   - Instability: with 20 examples the observed min and max are extreme values of
 *     a tiny sample. One new rating would rescale every previously computed vector.
 *
 * A movie runs between roughly 45 and 210 minutes; IMDb ratings go from 1 to 10.
 * Those are facts about cinema, not facts about this user's 20 movies.
 */
export const FEATURE_RANGES = {
  year: { min: 1920, max: 2030 },
  runtimeMinutes: { min: 45, max: 210 },
  imdbRating: { min: 1, max: 10 },
  logVotes: { min: 2, max: 7 },
}

/**
 * Imputation values for missing data.
 *
 * OMDb returns "N/A" for plenty of fields, which the API layer turns into `null`.
 * Those nulls still need a number here, and the number must be NEUTRAL:
 *
 *   - 0 would be a strong false claim ("this movie is rated 0/10").
 *   - The dataset mean would reintroduce the leakage the fixed ranges avoid.
 *   - A typical domain value says "unknown" without pushing the model either way.
 */
export const FEATURE_DEFAULTS = {
  year: 2000,
  runtimeMinutes: 110,
  imdbRating: 6.5,
  logVotes: 5,
  maturity: 0.5,
}

/**
 * Age ratings have a NATURAL ORDER: G is lighter than PG, which is lighter than R.
 * Ordered categories can be encoded as a single ordinal number instead of a
 * one-hot block — 1 dimension instead of 10, and the network can learn "this user
 * likes heavier content" with one weight rather than discovering it separately in
 * ten independent weights.
 *
 * Unordered categories (genre, country, colour) must NOT be encoded this way:
 * numbering them would tell the network that Horror > Drama and that Comedy is the
 * average of Action and Drama, which is meaningless.
 */
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

// The "reminiscence bump": people show a disproportionate attachment to the films
// and music of their teens and early twenties. Peak at 17, spread by 9 years.
export const NOSTALGIA_PEAK_AGE = 17
export const NOSTALGIA_WIDTH = 9

/**
 * The contract of the whole pipeline: this array defines what each position of
 * every feature vector means. It is exported so that predictions can be inspected
 * and debugged, and a test pins each name to its index.
 */
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

/**
 * Scales a value into 0..1 and CLAMPS anything outside the range.
 *
 * Clamping matters: a 300-minute movie would otherwise produce 1.5 and drag the
 * scale of that whole feature. Returns `null` — never NaN — for missing input, so
 * the caller can decide which default to substitute.
 */
export function normalizeToUnitRange(value, { min, max }) {
  if (!Number.isFinite(value)) return null
  const scaled = (value - min) / (max - min)
  return Math.min(1, Math.max(0, scaled))
}

/**
 * MULTI-HOT encoding of genres: one column per genre, several columns active at
 * once because a movie belongs to several genres simultaneously. (One-hot allows
 * exactly one active column; that would be wrong here.)
 *
 * The trailing `other` slot exists so that a movie whose genres fall outside the
 * vocabulary is not encoded as an all-zero vector, which would be indistinguishable
 * from a movie with no genre information at all.
 */
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

// Unknown or missing ratings land in the middle rather than at either extreme.
export function encodeMaturity(rated) {
  return MATURITY_BY_RATING[rated] ?? FEATURE_DEFAULTS.maturity
}

/**
 * Vote counts are HEAVY-TAILED: most movies have tens of thousands of votes and a
 * handful have millions. Normalising them directly squeezes 99% of the catalog
 * into a value near zero, destroying every distinction in the lower range.
 *
 *   without log:  5,000 votes → 0.002   |   2,516,752 votes → 1.000
 *   with log:     5,000 votes → 0.34    |   2,516,752 votes → 0.88
 *
 * log10 turns multiplication into addition — each +1 means "ten times more votes"
 * — which also matches how the difference is perceived: 5k vs 50k separates obscure
 * from known, while 2.0M vs 2.5M separates nothing.
 *
 * Rule of thumb: any count feature (votes, views, sales, income) deserves a log.
 */
export function encodeVoteCount(imdbVotes) {
  if (!Number.isFinite(imdbVotes) || imdbVotes <= 0) return FEATURE_DEFAULTS.logVotes
  return Math.log10(imdbVotes)
}

/**
 * How many of the genres the viewer explicitly asked for this movie has.
 * 0 matches → 0, one match → 0.5, two or more → 1.
 *
 * Without this feature the questionnaire answer never reaches the model: it would
 * only be used to decide WHICH movies to show, and the network would have to
 * rediscover from ~20 examples something the user already stated outright.
 */
export function encodeDeclaredGenreMatch(movieGenres = [], favoriteGenres = []) {
  if (favoriteGenres.length === 0) return 0

  const favorites = new Set(favoriteGenres)
  const matches = movieGenres.filter((genre) => favorites.has(genre)).length

  return Math.min(1, matches / 2)
}

/**
 * A Gaussian bell centred on the age the viewer was when the movie came out.
 * A movie released when they were 17 scores 1.0; one from before they were born
 * scores close to 0.
 *
 * Note why this is NOT redundant with the `year` feature. For a single-user model,
 * `age at release = year - birthYear` is just `year` shifted by a constant, so a
 * LINEAR version would be perfectly collinear and add nothing. This transform is
 * non-linear, and a network with 20 training examples has no chance of discovering
 * a bell curve on its own — handing it over is real feature engineering.
 */
export function encodeNostalgiaFit(movieYear, birthYear) {
  if (!Number.isFinite(movieYear) || !Number.isFinite(birthYear)) return 0.5

  const ageAtRelease = movieYear - birthYear
  const distance = (ageAtRelease - NOSTALGIA_PEAK_AGE) / NOSTALGIA_WIDTH

  return Math.exp(-0.5 * distance * distance)
}

/**
 * Turns one movie into one feature vector. The order here MUST match FEATURE_NAMES.
 *
 * `viewer` carries the profile-dependent part ({ birthYear, favoriteGenres }). The
 * exact same function is used for training and for scoring candidates — using two
 * different code paths is how training/serving skew gets introduced, where a model
 * learns on one distribution and is asked to predict on another.
 */
export function buildFeatureVector(movie, viewer = {}) {
  const year = normalizeToUnitRange(movie.year, FEATURE_RANGES.year)
  const runtime = normalizeToUnitRange(movie.runtimeMinutes, FEATURE_RANGES.runtimeMinutes)
  const imdbRating = normalizeToUnitRange(movie.imdbRating, FEATURE_RANGES.imdbRating)
  const logVotes = normalizeToUnitRange(encodeVoteCount(movie.imdbVotes), FEATURE_RANGES.logVotes)

  return [
    ...encodeGenres(movie.genres),
    encodeMaturity(movie.rated),
    // `?? default` is where missing data is imputed, already normalised.
    year ?? normalizeToUnitRange(FEATURE_DEFAULTS.year, FEATURE_RANGES.year),
    runtime ?? normalizeToUnitRange(FEATURE_DEFAULTS.runtimeMinutes, FEATURE_RANGES.runtimeMinutes),
    imdbRating ?? normalizeToUnitRange(FEATURE_DEFAULTS.imdbRating, FEATURE_RANGES.imdbRating),
    logVotes ?? normalizeToUnitRange(FEATURE_DEFAULTS.logVotes, FEATURE_RANGES.logVotes),
    encodeDeclaredGenreMatch(movie.genres, viewer.favoriteGenres ?? []),
    encodeNostalgiaFit(movie.year, viewer.birthYear),
  ]
}

// Debugging aid: pairs each number with the feature it represents, which is how
// you answer "why did the model score this movie 94%?".
export function describeFeatureVector(vector) {
  return FEATURE_NAMES.map((name, index) => ({ name, value: vector[index] }))
}

/**
 * Assembles the supervised dataset: X (features) and y (labels).
 *
 *   thumbs up   → 1
 *   thumbs down → 0
 *   "haven't seen" → discarded, because a guessed label is worse than no label:
 *                    it teaches the model something false with full confidence.
 *
 * `positives` and `negatives` are returned because class balance drives several
 * downstream decisions — class weights during training, and whether the reported
 * accuracy means anything at all.
 */
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
