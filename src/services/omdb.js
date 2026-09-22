// The browser never talks to omdbapi.com directly. It calls our own serverless
// proxy, which holds the API key server-side — see api/omdb.js. A key shipped to
// the client is a public key, whatever the variable is called.
const OMDB_ENDPOINT = '/api/omdb'
const NOT_AVAILABLE = 'N/A'

const ERROR_CODES_BY_MESSAGE = {
  'Movie not found!': 'not_found',
  'Incorrect IMDb ID.': 'not_found',
  'Too many results.': 'too_many_results',
  'Invalid API key!': 'invalid_api_key',
  'Request limit reached!': 'rate_limited',
  'No API key provided.': 'missing_api_key',
  'The server is missing its OMDb API key.': 'missing_api_key',
}

export class OmdbError extends Error {
  constructor(message, { code = 'unknown_error', cause } = {}) {
    super(message)
    this.name = 'OmdbError'
    this.code = code
    this.cause = cause
  }
}

function buildRequestUrl(params) {
  const query = new URLSearchParams()

  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(name, String(value))
  }

  return `${OMDB_ENDPOINT}?${query}`
}

function toErrorCode(message) {
  return ERROR_CODES_BY_MESSAGE[message] ?? 'unknown_error'
}

async function requestOmdb(params, { signal } = {}) {
  const url = buildRequestUrl(params)
  let response

  try {
    response = await fetch(url, { signal })
  } catch (caught) {
    if (caught.name === 'AbortError') throw caught
    throw new OmdbError('Could not reach OMDb. Check your connection.', {
      code: 'network_error',
      cause: caught,
    })
  }

  if (!response.ok) {
    throw new OmdbError(`OMDb replied with HTTP ${response.status}.`, { code: 'http_error' })
  }

  const payload = await response.json()

  if (payload.Response === 'False') {
    throw new OmdbError(payload.Error ?? 'OMDb returned an unknown error.', {
      code: toErrorCode(payload.Error),
    })
  }

  return payload
}

function parseText(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return !trimmed || trimmed === NOT_AVAILABLE ? null : trimmed
}

function parseList(value) {
  const text = parseText(value)
  if (!text) return []
  return text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseNumber(value) {
  const text = parseText(value)
  if (text === null) return null

  const parsed = Number(text.replace(/[^0-9.]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function parseYear(value) {
  const text = parseText(value)
  const match = text?.match(/\d{4}/)
  return match ? Number(match[0]) : null
}

function parsePosterUrl(value) {
  const text = parseText(value)
  return text ? text.replace(/^http:\/\//, 'https://') : null
}

export function normalizeSearchResult(payload) {
  return {
    imdbId: payload.imdbID,
    title: parseText(payload.Title),
    year: parseYear(payload.Year),
    type: parseText(payload.Type),
    posterUrl: parsePosterUrl(payload.Poster),
  }
}

export function normalizeMovieDetails(payload) {
  return {
    imdbId: payload.imdbID,
    title: parseText(payload.Title),
    year: parseYear(payload.Year),
    type: parseText(payload.Type),
    posterUrl: parsePosterUrl(payload.Poster),
    plot: parseText(payload.Plot),
    rated: parseText(payload.Rated),
    genres: parseList(payload.Genre),
    directors: parseList(payload.Director),
    actors: parseList(payload.Actors),
    languages: parseList(payload.Language),
    countries: parseList(payload.Country),
    runtimeMinutes: parseNumber(payload.Runtime),
    imdbRating: parseNumber(payload.imdbRating),
    imdbVotes: parseNumber(payload.imdbVotes),
    metascore: parseNumber(payload.Metascore),
  }
}

export async function searchMovies(term, { page = 1, year = null, signal } = {}) {
  const payload = await requestOmdb({ s: term, type: 'movie', page, y: year }, { signal })

  return {
    movies: (payload.Search ?? []).map(normalizeSearchResult),
    totalResults: parseNumber(payload.totalResults) ?? 0,
  }
}

export async function fetchMovieDetails(imdbId, { signal } = {}) {
  const payload = await requestOmdb({ i: imdbId, plot: 'short' }, { signal })
  return normalizeMovieDetails(payload)
}
