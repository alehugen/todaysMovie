import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MOVIE_DETAILS_TTL_MS,
  allCachedMovies,
  cachedMovieCount,
  clearMovieCache,
} from './movieCache'
import { getManyMovieDetails, getMovieDetails } from './movieCatalog'
import { fetchMovieDetails } from './omdb'

vi.mock('./omdb', () => ({ fetchMovieDetails: vi.fn() }))

const movieFor = (imdbId) => ({ imdbId, title: `Movie ${imdbId}`, genres: ['Drama'] })

function freezeClockAt(isoDate) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(isoDate))
}

describe('movieCatalog', () => {
  beforeEach(async () => {
    await clearMovieCache()
    fetchMovieDetails.mockReset()
    fetchMovieDetails.mockImplementation(async (imdbId) => movieFor(imdbId))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fetches a movie the first time it is asked for', async () => {
    expect(await getMovieDetails('tt1')).toEqual(movieFor('tt1'))
    expect(fetchMovieDetails).toHaveBeenCalledTimes(1)
  })

  it('serves a second request within the TTL from the cache', async () => {
    await getMovieDetails('tt1')
    await getMovieDetails('tt1')

    expect(fetchMovieDetails).toHaveBeenCalledTimes(1)
  })

  it('goes back to the API once the cached copy is stale', async () => {
    freezeClockAt('2026-09-21T10:00:00Z')
    await getMovieDetails('tt1')

    vi.setSystemTime(new Date(Date.now() + MOVIE_DETAILS_TTL_MS + 1000))
    await getMovieDetails('tt1')

    expect(fetchMovieDetails).toHaveBeenCalledTimes(2)
  })

  it('keeps serving from the cache just before the TTL expires', async () => {
    freezeClockAt('2026-09-21T10:00:00Z')
    await getMovieDetails('tt1')

    vi.setSystemTime(new Date(Date.now() + MOVIE_DETAILS_TTL_MS - 1000))
    await getMovieDetails('tt1')

    expect(fetchMovieDetails).toHaveBeenCalledTimes(1)
  })

  it('accepts a shorter freshness window per call', async () => {
    freezeClockAt('2026-09-21T10:00:00Z')
    await getMovieDetails('tt1')

    vi.setSystemTime(new Date(Date.now() + 60_000))
    await getMovieDetails('tt1', { maxAgeMs: 30_000 })

    expect(fetchMovieDetails).toHaveBeenCalledTimes(2)
  })

  it('goes back to the API when refresh is asked for', async () => {
    await getMovieDetails('tt1')
    await getMovieDetails('tt1', { refresh: true })

    expect(fetchMovieDetails).toHaveBeenCalledTimes(2)
  })

  it('survives a page reload because the cache lives in IndexedDB', async () => {
    await getMovieDetails('tt1')

    expect(await allCachedMovies()).toEqual([movieFor('tt1')])
  })

  it('keeps the requested order even with parallel requests', async () => {
    fetchMovieDetails.mockImplementation(async (imdbId) => {
      await new Promise((resolve) => setTimeout(resolve, imdbId === 'tt1' ? 20 : 1))
      return movieFor(imdbId)
    })

    const movies = await getManyMovieDetails(['tt1', 'tt2', 'tt3'])

    expect(movies.map((movie) => movie.imdbId)).toEqual(['tt1', 'tt2', 'tt3'])
  })

  it('never runs more requests at once than the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0

    fetchMovieDetails.mockImplementation(async (imdbId) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return movieFor(imdbId)
    })

    await getManyMovieDetails(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], { concurrency: 3 })

    expect(peak).toBe(3)
  })

  it('reads the whole batch from the cache in a single lookup', async () => {
    await getManyMovieDetails(['tt1', 'tt2'])
    fetchMovieDetails.mockClear()

    const movies = await getManyMovieDetails(['tt1', 'tt2', 'tt3'])

    expect(fetchMovieDetails).toHaveBeenCalledTimes(1)
    expect(fetchMovieDetails).toHaveBeenCalledWith('tt3', expect.anything())
    expect(movies.map((movie) => movie.imdbId)).toEqual(['tt1', 'tt2', 'tt3'])
  })

  it('clearMovieCache empties the store', async () => {
    await getMovieDetails('tt1')
    expect(await cachedMovieCount()).toBe(1)

    await clearMovieCache()

    expect(await cachedMovieCount()).toBe(0)
  })
})
