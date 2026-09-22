import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { searchMovies } from '@/services/omdb'

import { useOmdbSearch } from './useOmdbSearch'

vi.mock('@/services/omdb', () => ({ searchMovies: vi.fn() }))

const THE_MATRIX = { imdbId: 'tt0133093', title: 'The Matrix', year: 1999 }
const INTERSTELLAR = { imdbId: 'tt0816692', title: 'Interstellar', year: 2014 }

function omdbError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

async function typeTerm(search, value) {
  search.term.value = value
  await nextTick()
}

describe('useOmdbSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    searchMovies.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores terms shorter than the minimum length', async () => {
    const search = useOmdbSearch()

    await typeTerm(search, 'ma')
    await vi.advanceTimersByTimeAsync(1000)

    expect(searchMovies).not.toHaveBeenCalled()
    expect(search.isLoading.value).toBe(false)
  })

  it('waits for the debounce before calling the API', async () => {
    searchMovies.mockResolvedValue({ movies: [THE_MATRIX], totalResults: 1 })
    const search = useOmdbSearch({ debounceMs: 350 })

    await typeTerm(search, 'matrix')
    await vi.advanceTimersByTimeAsync(300)
    expect(searchMovies).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(50)
    expect(searchMovies).toHaveBeenCalledTimes(1)
  })

  it('collapses fast typing into a single request', async () => {
    searchMovies.mockResolvedValue({ movies: [THE_MATRIX], totalResults: 1 })
    const search = useOmdbSearch({ debounceMs: 350 })

    await typeTerm(search, 'mat')
    await vi.advanceTimersByTimeAsync(100)
    await typeTerm(search, 'matr')
    await vi.advanceTimersByTimeAsync(100)
    await typeTerm(search, 'matrix')
    await vi.advanceTimersByTimeAsync(350)

    expect(searchMovies).toHaveBeenCalledTimes(1)
    expect(searchMovies).toHaveBeenCalledWith('matrix', expect.anything())
  })

  it('shows the loading state while the user is still waiting', async () => {
    searchMovies.mockResolvedValue({ movies: [THE_MATRIX], totalResults: 1 })
    const search = useOmdbSearch({ debounceMs: 350 })

    await typeTerm(search, 'matrix')
    expect(search.isLoading.value).toBe(true)

    await vi.advanceTimersByTimeAsync(350)
    expect(search.isLoading.value).toBe(false)
  })

  it('exposes the results and the total count', async () => {
    searchMovies.mockResolvedValue({ movies: [THE_MATRIX], totalResults: 42 })
    const search = useOmdbSearch()

    await typeTerm(search, 'matrix')
    await vi.advanceTimersByTimeAsync(350)

    expect(search.movies.value).toEqual([THE_MATRIX])
    expect(search.totalResults.value).toBe(42)
    expect(search.error.value).toBeNull()
  })

  it('treats "movie not found" as an empty result, not as a failure', async () => {
    searchMovies.mockRejectedValue(omdbError('not_found'))
    const search = useOmdbSearch()

    await typeTerm(search, 'zzzzzzzz')
    await vi.advanceTimersByTimeAsync(350)

    expect(search.movies.value).toEqual([])
    expect(search.error.value).toBeNull()
    expect(search.isLoading.value).toBe(false)
  })

  it('surfaces a real failure', async () => {
    searchMovies.mockRejectedValue(omdbError('rate_limited'))
    const search = useOmdbSearch()

    await typeTerm(search, 'matrix')
    await vi.advanceTimersByTimeAsync(350)

    expect(search.error.value).toMatchObject({ code: 'rate_limited' })
    expect(search.movies.value).toEqual([])
  })

  it('clears a previous error once a new search succeeds', async () => {
    searchMovies.mockRejectedValueOnce(omdbError('rate_limited'))
    const search = useOmdbSearch()

    await typeTerm(search, 'matrix')
    await vi.advanceTimersByTimeAsync(350)
    expect(search.error.value).not.toBeNull()

    searchMovies.mockResolvedValueOnce({ movies: [THE_MATRIX], totalResults: 1 })
    await typeTerm(search, 'interstellar')
    await vi.advanceTimersByTimeAsync(350)

    expect(search.error.value).toBeNull()
  })

  it('never lets a slow response overwrite a newer one', async () => {
    let resolveSlowRequest
    searchMovies.mockImplementationOnce(
      () => new Promise((resolve) => { resolveSlowRequest = resolve }),
    )
    searchMovies.mockResolvedValueOnce({ movies: [INTERSTELLAR], totalResults: 1 })

    const search = useOmdbSearch()

    await typeTerm(search, 'matrix')
    await vi.advanceTimersByTimeAsync(350)

    await typeTerm(search, 'interstellar')
    await vi.advanceTimersByTimeAsync(350)

    resolveSlowRequest({ movies: [THE_MATRIX], totalResults: 999 })
    await vi.advanceTimersByTimeAsync(0)

    expect(search.movies.value).toEqual([INTERSTELLAR])
    expect(search.totalResults.value).toBe(1)
  })

  it('aborts a request that is still in flight when the term changes', async () => {
    searchMovies.mockImplementationOnce(() => new Promise(() => {}))
    searchMovies.mockResolvedValueOnce({ movies: [INTERSTELLAR], totalResults: 1 })

    const search = useOmdbSearch()

    await typeTerm(search, 'matrix')
    await vi.advanceTimersByTimeAsync(350)

    const { signal } = searchMovies.mock.calls[0][1]
    expect(signal.aborted).toBe(false)

    await typeTerm(search, 'interstellar')
    expect(signal.aborted).toBe(true)

    await vi.advanceTimersByTimeAsync(350)
    expect(search.movies.value).toEqual([INTERSTELLAR])
  })

  it('reset clears the term, the results and the error', async () => {
    searchMovies.mockResolvedValue({ movies: [THE_MATRIX], totalResults: 5 })
    const search = useOmdbSearch()

    await typeTerm(search, 'matrix')
    await vi.advanceTimersByTimeAsync(350)

    search.reset()
    await nextTick()

    expect(search.term.value).toBe('')
    expect(search.movies.value).toEqual([])
    expect(search.totalResults.value).toBe(0)
    expect(search.error.value).toBeNull()
    expect(search.isLoading.value).toBe(false)
  })
})
