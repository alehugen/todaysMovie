import { cacheMovies, cachedMovieIds } from './movieCache'
import { fetchMovieDetails, searchMovies } from './omdb'
import { shuffle } from './movieSampler'

export const DISCOVERY_TERMS = [
  'love', 'night', 'man', 'war', 'last', 'day', 'dead', 'life', 'world', 'city',
  'girl', 'boy', 'house', 'blood', 'star', 'king', 'dark', 'red', 'home', 'lost',
  'black', 'time', 'father', 'death', 'game', 'road', 'story', 'end', 'little', 'great',
  'blue', 'dream', 'fire', 'gold', 'heart', 'moon', 'river', 'sky', 'summer', 'wild',
]

export const DEFAULT_DISCOVERY_OPTIONS = {
  queryCount: 6,
  targetNewMovies: 30,
  maxRequests: 60,
  concurrency: 4,
  minVotes: 5000,
  minRating: 5.5,
  overfetchFactor: 4,
}

export const EXCLUDED_GENRES = ['Documentary', 'Short', 'News', 'Talk-Show', 'Reality-TV']

export function isWorthRecommending(
  movie,
  { minVotes = DEFAULT_DISCOVERY_OPTIONS.minVotes, minRating = DEFAULT_DISCOVERY_OPTIONS.minRating } = {},
) {
  if (movie?.type !== 'movie') return false
  if (!movie.posterUrl) return false
  if (!movie.genres?.length) return false
  if (movie.genres.some((genre) => EXCLUDED_GENRES.includes(genre))) return false
  if (!Number.isFinite(movie.imdbVotes) || movie.imdbVotes < minVotes) return false
  if (!Number.isFinite(movie.imdbRating) || movie.imdbRating < minRating) return false

  return true
}

export function buildDiscoveryPlan({
  terms = DISCOVERY_TERMS,
  queryCount = DEFAULT_DISCOVERY_OPTIONS.queryCount,
  maxPage = 3,
  random = Math.random,
} = {}) {
  const shuffledTerms = shuffle(terms, random)

  return Array.from({ length: Math.min(queryCount, shuffledTerms.length) }, (_, index) => ({
    term: shuffledTerms[index],
    page: 1 + Math.floor(random() * maxPage),
  }))
}

export async function growCatalog({
  plan,
  knownIds,
  targetNewMovies = DEFAULT_DISCOVERY_OPTIONS.targetNewMovies,
  maxRequests = DEFAULT_DISCOVERY_OPTIONS.maxRequests,
  concurrency = DEFAULT_DISCOVERY_OPTIONS.concurrency,
  minVotes = DEFAULT_DISCOVERY_OPTIONS.minVotes,
  minRating = DEFAULT_DISCOVERY_OPTIONS.minRating,
  overfetchFactor = DEFAULT_DISCOVERY_OPTIONS.overfetchFactor,
  signal,
  onProgress = () => {},
  search = searchMovies,
  fetchDetails = fetchMovieDetails,
  listKnownIds = cachedMovieIds,
  persist = cacheMovies,
} = {}) {
  const known = new Set(knownIds ?? (await listKnownIds()))
  const queries = plan ?? buildDiscoveryPlan()

  const candidateLimit = targetNewMovies * overfetchFactor
  const found = []
  let requests = 0

  for (const query of queries) {
    if (found.length >= candidateLimit || requests >= maxRequests) break

    onProgress({ stage: 'searching', found: found.length, requests })

    try {
      requests += 1
      const { movies } = await search(query.term, { page: query.page, signal })

      for (const movie of movies) {
        if (known.has(movie.imdbId) || !movie.posterUrl) continue
        known.add(movie.imdbId)
        found.push(movie.imdbId)
        if (found.length >= candidateLimit) break
      }
    } catch (error) {
      if (error.name === 'AbortError') throw error
      if (error.code === 'rate_limited' || error.code === 'invalid_api_key') throw error
    }
  }

  const detailed = []
  let nextIndex = 0

  async function worker() {
    while (nextIndex < found.length && requests < maxRequests && detailed.length < targetNewMovies) {
      const index = nextIndex
      nextIndex += 1
      requests += 1

      try {
        const movie = await fetchDetails(found[index], { signal })
        if (isWorthRecommending(movie, { minVotes, minRating })) detailed.push(movie)
      } catch (error) {
        if (error.name === 'AbortError') throw error
      }

      onProgress({ stage: 'detailing', found: detailed.length, requests })
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, found.length) }, worker))

  if (detailed.length > 0) await persist(detailed)

  return {
    added: detailed.length,
    examined: nextIndex,
    requests,
    queries: queries.length,
  }
}
