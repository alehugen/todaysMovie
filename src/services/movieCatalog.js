import { SEED_MOVIES } from '@/data/seedCatalog'

import { MOVIE_DETAILS_TTL_MS, allCachedMovies, cacheMovies, readCachedMovies } from './movieCache'
import { fetchMovieDetails } from './omdb'

const DEFAULT_CONCURRENCY = 4

export async function getMovieDetails(
  imdbId,
  { signal, refresh = false, maxAgeMs = MOVIE_DETAILS_TTL_MS } = {},
) {
  if (!refresh) {
    const cached = await readCachedMovies([imdbId], { maxAgeMs })
    if (cached.has(imdbId)) return cached.get(imdbId)
  }

  const movie = await fetchMovieDetails(imdbId, { signal })
  await cacheMovies([movie])
  return movie
}

export async function getManyMovieDetails(
  imdbIds,
  { signal, refresh = false, maxAgeMs = MOVIE_DETAILS_TTL_MS, concurrency = DEFAULT_CONCURRENCY } = {},
) {
  const cached = refresh ? new Map() : await readCachedMovies(imdbIds, { maxAgeMs })
  const results = new Array(imdbIds.length)
  const missing = []

  imdbIds.forEach((imdbId, index) => {
    if (cached.has(imdbId)) results[index] = cached.get(imdbId)
    else missing.push(index)
  })

  let nextPosition = 0

  async function worker() {
    while (nextPosition < missing.length) {
      const position = nextPosition
      nextPosition += 1

      const index = missing[position]
      results[index] = await fetchMovieDetails(imdbIds[index], { signal })
    }
  }

  const workerCount = Math.min(concurrency, missing.length)
  await Promise.all(Array.from({ length: workerCount }, worker))

  if (missing.length > 0) await cacheMovies(missing.map((index) => results[index]))

  return results
}

export async function getCandidateCatalog() {
  const cached = await allCachedMovies()
  const byId = new Map(SEED_MOVIES.map((movie) => [movie.imdbId, movie]))

  for (const movie of cached) {
    if (movie?.imdbId && movie.genres?.length > 0) byId.set(movie.imdbId, movie)
  }

  return [...byId.values()]
}
