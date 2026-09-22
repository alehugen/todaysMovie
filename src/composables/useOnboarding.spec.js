import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getManyMovieDetails } from '@/services/movieCatalog'

import {
  MIN_GENRES,
  MIN_RATINGS,
  MOVIES_PER_EXTRA_BATCH,
  MOVIES_TO_RATE,
  useOnboarding,
} from './useOnboarding'

vi.mock('@/services/movieCatalog', () => ({ getManyMovieDetails: vi.fn() }))

const { CATALOG_SIZE } = vi.hoisted(() => ({ CATALOG_SIZE: 24 }))

vi.mock('@/data/seedCatalog', () => {
  const genres = [['Action'], ['Comedy'], ['Action', 'Comedy'], ['Drama']]
  const decades = [1990, 2000, 2010, 2020]

  return {
    SELECTABLE_GENRES: ['Action', 'Comedy', 'Drama'],
    SEED_MOVIES: Array.from({ length: CATALOG_SIZE }, (_, index) => ({
      imdbId: `tt${String(index).padStart(4, '0')}`,
      title: `Movie ${index}`,
      year: decades[index % decades.length] + (index % 9),
      genres: genres[index % genres.length],
    })),
  }
})

const CURRENT_YEAR = 2026

function detailsFor(imdbIds) {
  return imdbIds.map((imdbId) => ({ imdbId, title: `Movie ${imdbId}`, genres: ['Drama'] }))
}

async function readyToContinue(onboarding) {
  onboarding.birthYear.value = 1993
  onboarding.toggleGenre('Action')
  onboarding.toggleGenre('Comedy')
}

describe('useOnboarding', () => {
  beforeEach(() => {
    getManyMovieDetails.mockReset()
    getManyMovieDetails.mockImplementation(async (imdbIds) => detailsFor(imdbIds))
  })

  it('never asks for a minimum it cannot possibly reach', () => {
    expect(MIN_RATINGS).toBeLessThanOrEqual(MOVIES_TO_RATE)
  })

  it('starts on the profile step with nothing filled in', () => {
    const onboarding = useOnboarding({ currentYear: CURRENT_YEAR })

    expect(onboarding.step.value).toBe('profile')
    expect(onboarding.selectedGenres.value).toEqual([])
    expect(onboarding.canContinue.value).toBe(false)
  })

  describe('birth year', () => {
    it('accepts a plausible year', () => {
      const onboarding = useOnboarding({ currentYear: CURRENT_YEAR })
      onboarding.birthYear.value = 1993

      expect(onboarding.isBirthYearValid.value).toBe(true)
    })

    it('rejects a year that would make the person too young or too old', () => {
      const onboarding = useOnboarding({ currentYear: CURRENT_YEAR })

      onboarding.birthYear.value = CURRENT_YEAR
      expect(onboarding.isBirthYearValid.value).toBe(false)

      onboarding.birthYear.value = 1800
      expect(onboarding.isBirthYearValid.value).toBe(false)
    })

    it('rejects anything that is not a whole year', () => {
      const onboarding = useOnboarding({ currentYear: CURRENT_YEAR })

      onboarding.birthYear.value = 'nineteen ninety three'
      expect(onboarding.isBirthYearValid.value).toBe(false)

      onboarding.birthYear.value = 1993.5
      expect(onboarding.isBirthYearValid.value).toBe(false)
    })
  })

  describe('genres', () => {
    it('toggles a genre on and off', () => {
      const onboarding = useOnboarding({ currentYear: CURRENT_YEAR })

      onboarding.toggleGenre('Action')
      expect(onboarding.selectedGenres.value).toEqual(['Action'])

      onboarding.toggleGenre('Action')
      expect(onboarding.selectedGenres.value).toEqual([])
    })

    it(`requires ${MIN_GENRES} genres before moving on`, () => {
      const onboarding = useOnboarding({ currentYear: CURRENT_YEAR })
      onboarding.birthYear.value = 1993

      onboarding.toggleGenre('Action')
      expect(onboarding.canContinue.value).toBe(false)

      onboarding.toggleGenre('Comedy')
      expect(onboarding.canContinue.value).toBe(true)
    })
  })

  describe('loading the movies', () => {
    it('refuses to load while the form is incomplete', async () => {
      const onboarding = useOnboarding({ currentYear: CURRENT_YEAR })

      expect(await onboarding.loadMoviesToRate()).toBe(false)
      expect(getManyMovieDetails).not.toHaveBeenCalled()
    })

    it('moves to the rating step with the fetched movies', async () => {
      const onboarding = useOnboarding({ currentYear: CURRENT_YEAR })
      await readyToContinue(onboarding)

      expect(await onboarding.loadMoviesToRate()).toBe(true)
      expect(onboarding.step.value).toBe('ratings')
      expect(onboarding.movies.value).toHaveLength(MOVIES_TO_RATE)
      expect(onboarding.isLoading.value).toBe(false)
    })

    it('stays on the profile step and reports a failure', async () => {
      getManyMovieDetails.mockRejectedValue(new Error('OMDb is down'))

      const onboarding = useOnboarding({ currentYear: CURRENT_YEAR })
      await readyToContinue(onboarding)

      expect(await onboarding.loadMoviesToRate()).toBe(false)
      expect(onboarding.step.value).toBe('profile')
      expect(onboarding.error.value.message).toBe('OMDb is down')
    })
  })

  describe('ratings', () => {
    async function onRatingStep() {
      const onboarding = useOnboarding({ currentYear: CURRENT_YEAR })
      await readyToContinue(onboarding)
      await onboarding.loadMoviesToRate()
      return onboarding
    }

    function rateFirst(onboarding, count, liked) {
      for (const movie of onboarding.movies.value.slice(0, count)) {
        onboarding.rateMovie(movie.imdbId, liked)
      }
    }

    it('counts likes and dislikes separately', async () => {
      const onboarding = await onRatingStep()

      rateFirst(onboarding, 2, true)
      onboarding.rateMovie(onboarding.movies.value[5].imdbId, false)

      expect(onboarding.likedCount.value).toBe(2)
      expect(onboarding.dislikedCount.value).toBe(1)
      expect(onboarding.ratedCount.value).toBe(3)
    })

    it('does not count "haven\'t seen" as a rating', async () => {
      const onboarding = await onRatingStep()

      await onboarding.rateMovie(onboarding.movies.value[0].imdbId, null)

      expect(onboarding.ratedCount.value).toBe(0)
    })

    it('swaps in a different movie when the user has not seen this one', async () => {
      const onboarding = await onRatingStep()
      const skipped = onboarding.movies.value[3]

      await onboarding.rateMovie(skipped.imdbId, null)

      expect(onboarding.movies.value).toHaveLength(MOVIES_TO_RATE)
      expect(onboarding.movies.value[3].imdbId).not.toBe(skipped.imdbId)
      expect(onboarding.movies.value.some((m) => m.imdbId === skipped.imdbId)).toBe(false)
    })

    it('never brings back a movie that was already shown', async () => {
      const onboarding = await onRatingStep()
      const originalIds = new Set(onboarding.movies.value.map((m) => m.imdbId))

      await onboarding.rateMovie(onboarding.movies.value[0].imdbId, null)
      await onboarding.rateMovie(onboarding.movies.value[1].imdbId, null)

      const replacements = onboarding.movies.value.filter((m) => !originalIds.has(m.imdbId))
      expect(replacements).toHaveLength(2)
      expect(new Set(replacements.map((m) => m.imdbId)).size).toBe(2)
    })

    it('keeps the ratings already given when a card is replaced', async () => {
      const onboarding = await onRatingStep()
      onboarding.rateMovie(onboarding.movies.value[0].imdbId, true)
      onboarding.rateMovie(onboarding.movies.value[1].imdbId, false)

      await onboarding.rateMovie(onboarding.movies.value[2].imdbId, null)

      expect(onboarding.ratedCount.value).toBe(2)
      expect(onboarding.likedCount.value).toBe(1)
      expect(onboarding.dislikedCount.value).toBe(1)
    })

    it('drops the card instead of swapping once the catalog is exhausted', async () => {
      const onboarding = await onRatingStep()

      for (let index = 0; index < CATALOG_SIZE - MOVIES_TO_RATE; index += 1) {
        await onboarding.rateMovie(onboarding.movies.value[0].imdbId, null)
      }

      expect(onboarding.movies.value).toHaveLength(MOVIES_TO_RATE)
      expect(onboarding.canLoadMore.value).toBe(false)

      await onboarding.rateMovie(onboarding.movies.value[0].imdbId, null)

      expect(onboarding.movies.value).toHaveLength(MOVIES_TO_RATE - 1)
    })

    it('lets the user still reach the minimum after skipping several movies', async () => {
      const onboarding = await onRatingStep()

      await onboarding.rateMovie(onboarding.movies.value[0].imdbId, null)
      await onboarding.rateMovie(onboarding.movies.value[1].imdbId, null)

      onboarding.movies.value.slice(0, MIN_RATINGS - 1).forEach((movie) => {
        onboarding.rateMovie(movie.imdbId, true)
      })
      onboarding.rateMovie(onboarding.movies.value[MIN_RATINGS - 1].imdbId, false)

      expect(onboarding.ratedCount.value).toBe(MIN_RATINGS)
      expect(onboarding.hasEnoughRatings.value).toBe(true)
    })

    it('lets the user change their mind', async () => {
      const onboarding = await onRatingStep()
      const { imdbId } = onboarding.movies.value[0]

      onboarding.rateMovie(imdbId, true)
      onboarding.rateMovie(imdbId, false)

      expect(onboarding.likedCount.value).toBe(0)
      expect(onboarding.dislikedCount.value).toBe(1)
    })

    it(`needs ${MIN_RATINGS} ratings with at least one of each class`, async () => {
      const onboarding = await onRatingStep()

      rateFirst(onboarding, MIN_RATINGS, true)
      expect(onboarding.ratedCount.value).toBe(MIN_RATINGS)
      expect(onboarding.hasEnoughRatings.value).toBe(false)
      expect(onboarding.missingRatingsHint.value).toBe('Mark at least one movie you did not like.')

      onboarding.rateMovie(onboarding.movies.value[MIN_RATINGS].imdbId, false)
      expect(onboarding.hasEnoughRatings.value).toBe(true)
    })

    it('keeps only real ratings in the final answers', async () => {
      const onboarding = await onRatingStep()

      onboarding.rateMovie(onboarding.movies.value[0].imdbId, true)
      onboarding.rateMovie(onboarding.movies.value[1].imdbId, false)
      await onboarding.rateMovie(onboarding.movies.value[2].imdbId, null)

      const answers = onboarding.buildAnswers()

      expect(answers.birthYear).toBe(1993)
      expect(answers.favoriteGenres).toEqual(['Action', 'Comedy'])
      expect(answers.ratings).toHaveLength(2)
      expect(answers.ratings).toContainEqual({
        imdbId: onboarding.movies.value[0].imdbId,
        liked: true,
      })
    })

    it('adds a new batch without losing the ratings already given', async () => {
      const onboarding = await onRatingStep()
      const firstBatchIds = onboarding.movies.value.map((movie) => movie.imdbId)
      onboarding.rateMovie(firstBatchIds[0], true)

      expect(await onboarding.loadMoreMovies()).toBe(true)

      expect(onboarding.movies.value.length).toBeGreaterThan(MOVIES_TO_RATE)
      expect(onboarding.ratedCount.value).toBe(1)
    })

    it('never repeats a movie in the extra batch', async () => {
      const onboarding = await onRatingStep()
      const firstBatchIds = new Set(onboarding.movies.value.map((movie) => movie.imdbId))

      await onboarding.loadMoreMovies()
      const extra = onboarding.movies.value.slice(MOVIES_TO_RATE)

      expect(extra.every((movie) => !firstBatchIds.has(movie.imdbId))).toBe(true)
    })

    it('starts over with a clean slate when the answers change', async () => {
      const onboarding = await onRatingStep()
      rateFirst(onboarding, 3, true)

      onboarding.goBackToProfile()
      expect(onboarding.step.value).toBe('profile')

      await onboarding.loadMoviesToRate()
      expect(onboarding.ratedCount.value).toBe(0)
    })
  })
})
