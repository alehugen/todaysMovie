import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OmdbError, fetchMovieDetails, searchMovies } from './omdb'

const SHAWSHANK_DETAILS = {
  Title: 'The Shawshank Redemption',
  Year: '1994',
  Rated: 'R',
  Runtime: '142 min',
  Genre: 'Drama, Crime',
  Director: 'Frank Darabont',
  Actors: 'Tim Robbins, Morgan Freeman, Bob Gunton',
  Language: 'English',
  Country: 'United States',
  Plot: 'Two imprisoned men bond over a number of years.',
  Poster: 'http://m.media-amazon.com/images/poster.jpg',
  Metascore: '82',
  imdbRating: '9.3',
  imdbVotes: '2,800,000',
  imdbID: 'tt0111161',
  Type: 'movie',
  Response: 'True',
}

function mockOmdbResponse(payload, { ok = true, status = 200 } = {}) {
  global.fetch = vi.fn().mockResolvedValue({ ok, status, json: async () => payload })
}

function requestedUrl() {
  return new URL(global.fetch.mock.calls[0][0])
}

describe('omdb service', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_OMDB_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  describe('request building', () => {
    it('sends the api key, the term and the movie filter', async () => {
      mockOmdbResponse({ Response: 'True', Search: [], totalResults: '0' })

      await searchMovies('matrix', { page: 2 })
      const url = requestedUrl()

      expect(url.origin + url.pathname).toBe('https://www.omdbapi.com/')
      expect(url.searchParams.get('apikey')).toBe('test-key')
      expect(url.searchParams.get('s')).toBe('matrix')
      expect(url.searchParams.get('type')).toBe('movie')
      expect(url.searchParams.get('page')).toBe('2')
    })

    it('asks for a single title by id', async () => {
      mockOmdbResponse(SHAWSHANK_DETAILS)

      await fetchMovieDetails('tt0111161')

      expect(requestedUrl().searchParams.get('i')).toBe('tt0111161')
    })

    it('fails fast when the api key is missing', async () => {
      vi.stubEnv('VITE_OMDB_API_KEY', '')
      mockOmdbResponse({})

      await expect(searchMovies('matrix')).rejects.toMatchObject({ code: 'missing_api_key' })
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('fails fast when the key is still the placeholder', async () => {
      vi.stubEnv('VITE_OMDB_API_KEY', 'PASTE_YOUR_KEY_HERE')
      mockOmdbResponse({})

      await expect(searchMovies('matrix')).rejects.toMatchObject({ code: 'missing_api_key' })
    })
  })

  describe('normalization', () => {
    it('turns the raw payload into typed values', async () => {
      mockOmdbResponse(SHAWSHANK_DETAILS)

      const movie = await fetchMovieDetails('tt0111161')

      expect(movie).toMatchObject({
        imdbId: 'tt0111161',
        title: 'The Shawshank Redemption',
        year: 1994,
        runtimeMinutes: 142,
        imdbRating: 9.3,
        imdbVotes: 2800000,
        metascore: 82,
        genres: ['Drama', 'Crime'],
        actors: ['Tim Robbins', 'Morgan Freeman', 'Bob Gunton'],
      })
    })

    it('turns every "N/A" into null or an empty list', async () => {
      mockOmdbResponse({
        ...SHAWSHANK_DETAILS,
        Runtime: 'N/A',
        Genre: 'N/A',
        imdbRating: 'N/A',
        Metascore: 'N/A',
        Poster: 'N/A',
        Rated: 'N/A',
      })

      const movie = await fetchMovieDetails('tt0111161')

      expect(movie.runtimeMinutes).toBeNull()
      expect(movie.imdbRating).toBeNull()
      expect(movie.metascore).toBeNull()
      expect(movie.posterUrl).toBeNull()
      expect(movie.rated).toBeNull()
      expect(movie.genres).toEqual([])
    })

    it('upgrades poster urls to https', async () => {
      mockOmdbResponse(SHAWSHANK_DETAILS)

      const movie = await fetchMovieDetails('tt0111161')

      expect(movie.posterUrl).toBe('https://m.media-amazon.com/images/poster.jpg')
    })

    it('reads the first year of a range', async () => {
      mockOmdbResponse({ ...SHAWSHANK_DETAILS, Year: '2005-2010' })

      const movie = await fetchMovieDetails('tt0111161')

      expect(movie.year).toBe(2005)
    })

    it('normalizes every item of a search result', async () => {
      mockOmdbResponse({
        Response: 'True',
        totalResults: '412',
        Search: [
          { Title: 'The Matrix', Year: '1999', imdbID: 'tt0133093', Type: 'movie', Poster: 'N/A' },
        ],
      })

      const result = await searchMovies('matrix')

      expect(result.totalResults).toBe(412)
      expect(result.movies).toEqual([
        { imdbId: 'tt0133093', title: 'The Matrix', year: 1999, type: 'movie', posterUrl: null },
      ])
    })
  })

  describe('error handling', () => {
    it('treats the HTTP 200 failure envelope as an error', async () => {
      mockOmdbResponse({ Response: 'False', Error: 'Movie not found!' })

      await expect(searchMovies('zzzzzz')).rejects.toBeInstanceOf(OmdbError)
    })

    it('maps the known OMDb messages to stable codes', async () => {
      const cases = [
        ['Movie not found!', 'not_found'],
        ['Too many results.', 'too_many_results'],
        ['Invalid API key!', 'invalid_api_key'],
        ['Request limit reached!', 'rate_limited'],
        ['Something brand new', 'unknown_error'],
      ]

      for (const [message, code] of cases) {
        mockOmdbResponse({ Response: 'False', Error: message })
        await expect(searchMovies('anything')).rejects.toMatchObject({ code })
      }
    })

    it('reports a network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

      await expect(searchMovies('matrix')).rejects.toMatchObject({ code: 'network_error' })
    })

    it('reports a non-200 status', async () => {
      mockOmdbResponse({}, { ok: false, status: 503 })

      await expect(searchMovies('matrix')).rejects.toMatchObject({ code: 'http_error' })
    })

    it('lets an aborted request bubble up untouched', async () => {
      const abortError = new DOMException('Aborted', 'AbortError')
      global.fetch = vi.fn().mockRejectedValue(abortError)

      await expect(searchMovies('matrix')).rejects.toBe(abortError)
    })
  })
})
