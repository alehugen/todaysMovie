import { describe, expect, it, vi } from 'vitest'

import {
  DISCOVERY_TERMS,
  buildDiscoveryPlan,
  growCatalog,
  isWorthRecommending,
} from './catalogBuilder'

function seededRandom(seed = 9) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const searchResult = (imdbId) => ({ imdbId, title: `Movie ${imdbId}`, posterUrl: 'https://p.jpg' })

const detailsFor = (imdbId) => ({
  imdbId,
  title: `Movie ${imdbId}`,
  type: 'movie',
  genres: ['Drama'],
  posterUrl: 'https://p.jpg',
  imdbVotes: 120000,
  imdbRating: 7.4,
})

function harness({ search, fetchDetails } = {}) {
  const persisted = []

  return {
    persisted,
    options: {
      knownIds: [],
      listKnownIds: async () => [],
      persist: async (movies) => persisted.push(...movies),
      search:
        search ??
        vi.fn(async (term) => ({
          movies: [searchResult(`${term}-1`), searchResult(`${term}-2`)],
          totalResults: 2,
        })),
      fetchDetails: fetchDetails ?? vi.fn(async (imdbId) => detailsFor(imdbId)),
    },
  }
}

describe('buildDiscoveryPlan', () => {
  it('produces the requested number of queries', () => {
    expect(buildDiscoveryPlan({ queryCount: 4, random: seededRandom() })).toHaveLength(4)
  })

  it('never repeats a search term inside one plan', () => {
    const plan = buildDiscoveryPlan({ queryCount: 10, random: seededRandom() })

    expect(new Set(plan.map((query) => query.term)).size).toBe(10)
  })

  it('spreads the queries across the first result pages', () => {
    const plan = buildDiscoveryPlan({ queryCount: 8, maxPage: 3, random: seededRandom() })

    expect(plan.every((query) => query.page >= 1 && query.page <= 3)).toBe(true)
  })

  it('cannot ask for more queries than there are terms', () => {
    expect(buildDiscoveryPlan({ queryCount: 999, random: seededRandom() }))
      .toHaveLength(DISCOVERY_TERMS.length)
  })
})

describe('isWorthRecommending', () => {
  const good = detailsFor('tt1')

  it('accepts a well known movie', () => {
    expect(isWorthRecommending(good)).toBe(true)
  })

  it('rejects series and other non-movies', () => {
    expect(isWorthRecommending({ ...good, type: 'series' })).toBe(false)
  })

  it('rejects documentaries and other formats we do not recommend', () => {
    expect(isWorthRecommending({ ...good, genres: ['Documentary'] })).toBe(false)
  })

  it('rejects obscure titles nobody has voted on', () => {
    expect(isWorthRecommending({ ...good, imdbVotes: 300 })).toBe(false)
    expect(isWorthRecommending({ ...good, imdbVotes: null })).toBe(false)
  })

  it('rejects poorly rated movies', () => {
    expect(isWorthRecommending({ ...good, imdbRating: 3.1 })).toBe(false)
  })

  it('rejects anything without a poster or a genre', () => {
    expect(isWorthRecommending({ ...good, posterUrl: null })).toBe(false)
    expect(isWorthRecommending({ ...good, genres: [] })).toBe(false)
  })
})

describe('growCatalog', () => {
  const plan = [{ term: 'night', page: 1 }, { term: 'star', page: 2 }]

  it('stores the movies it discovered', async () => {
    const { options, persisted } = harness()

    const result = await growCatalog({ ...options, plan })

    expect(result.added).toBe(4)
    expect(persisted.map((movie) => movie.imdbId).sort()).toEqual([
      'night-1', 'night-2', 'star-1', 'star-2',
    ])
  })

  it('skips movies the catalog already holds', async () => {
    const { options, persisted } = harness()

    await growCatalog({ ...options, plan, knownIds: ['night-1', 'star-1'] })

    expect(persisted.map((movie) => movie.imdbId).sort()).toEqual(['night-2', 'star-2'])
  })

  it('skips search results without a poster', async () => {
    const search = vi.fn(async (term) => ({
      movies: [{ imdbId: `${term}-1`, posterUrl: null }, searchResult(`${term}-2`)],
    }))
    const { options, persisted } = harness({ search })

    await growCatalog({ ...options, plan })

    expect(persisted.map((movie) => movie.imdbId)).toEqual(['night-2', 'star-2'])
  })

  it('drops anything that is not a proper movie', async () => {
    const fetchDetails = vi.fn(async (imdbId) =>
      imdbId === 'night-1'
        ? { ...detailsFor(imdbId), type: 'series' }
        : { ...detailsFor(imdbId), imdbVotes: imdbId === 'night-2' ? 200 : 120000 },
    )
    const { options, persisted } = harness({ fetchDetails })

    await growCatalog({ ...options, plan })

    expect(persisted.map((movie) => movie.imdbId).sort()).toEqual(['star-1', 'star-2'])
  })

  it('stops fetching details once the target is reached', async () => {
    const { options } = harness()

    const result = await growCatalog({ ...options, plan, targetNewMovies: 2, concurrency: 1 })

    expect(result.added).toBe(2)
    expect(options.fetchDetails).toHaveBeenCalledTimes(2)
  })

  it('collects more candidates than the target, because most get rejected', async () => {
    const { options } = harness()

    const result = await growCatalog({ ...options, plan, targetNewMovies: 1, overfetchFactor: 4 })

    expect(options.search).toHaveBeenCalledTimes(2)
    expect(result.examined).toBeGreaterThanOrEqual(1)
  })

  it('never spends more requests than the budget allows', async () => {
    const { options } = harness()

    const result = await growCatalog({ ...options, plan, maxRequests: 3, concurrency: 1 })

    expect(result.requests).toBeLessThanOrEqual(3)
  })

  it('carries on when one search fails', async () => {
    const search = vi.fn(async (term) => {
      if (term === 'night') throw new Error('temporary glitch')
      return { movies: [searchResult('star-1')] }
    })
    const { options, persisted } = harness({ search })

    const result = await growCatalog({ ...options, plan })

    expect(result.added).toBe(1)
    expect(persisted[0].imdbId).toBe('star-1')
  })

  it('gives up immediately when the daily quota is gone', async () => {
    const rateLimited = Object.assign(new Error('Request limit reached!'), { code: 'rate_limited' })
    const search = vi.fn(async () => {
      throw rateLimited
    })
    const { options } = harness({ search })

    await expect(growCatalog({ ...options, plan })).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('reports progress as it goes', async () => {
    const { options } = harness()
    const stages = new Set()

    await growCatalog({ ...options, plan, onProgress: ({ stage }) => stages.add(stage) })

    expect([...stages].sort()).toEqual(['detailing', 'searching'])
  })

  it('asks the cache for the known ids when none are given', async () => {
    const listKnownIds = vi.fn(async () => ['night-1'])
    const { options, persisted } = harness()

    await growCatalog({ ...options, knownIds: undefined, listKnownIds, plan })

    expect(listKnownIds).toHaveBeenCalled()
    expect(persisted.map((movie) => movie.imdbId)).not.toContain('night-1')
  })
})
