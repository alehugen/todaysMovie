import { computed, ref } from 'vue'

import { SEED_MOVIES } from '@/data/seedCatalog'
import { getManyMovieDetails } from '@/services/movieCatalog'
import { sampleMoviesForProfile } from '@/services/movieSampler'

export const MIN_GENRES = 2
export const MOVIES_TO_RATE = 20
export const MOVIES_PER_EXTRA_BATCH = 8
export const MIN_RATINGS = 14
export const MIN_AGE = 8
export const MAX_AGE = 110

export function useOnboarding({ currentYear = new Date().getFullYear() } = {}) {
  const step = ref('profile')
  const birthYear = ref(null)
  const selectedGenres = ref([])
  const movies = ref([])
  const ratings = ref({})
  const shownImdbIds = ref(new Set())
  const replacingImdbIds = ref(new Set())
  const isLoading = ref(false)
  const isLoadingMore = ref(false)
  const error = ref(null)

  const earliestBirthYear = currentYear - MAX_AGE
  const latestBirthYear = currentYear - MIN_AGE

  const isBirthYearValid = computed(() => {
    const year = Number(birthYear.value)
    return Number.isInteger(year) && year >= earliestBirthYear && year <= latestBirthYear
  })

  const hasEnoughGenres = computed(() => selectedGenres.value.length >= MIN_GENRES)
  const canContinue = computed(() => isBirthYearValid.value && hasEnoughGenres.value)

  const profileHint = computed(() => {
    if (!isBirthYearValid.value) {
      return `Enter a birth year between ${earliestBirthYear} and ${latestBirthYear}.`
    }
    if (!hasEnoughGenres.value) {
      return `Pick ${MIN_GENRES - selectedGenres.value.length} more genre(s).`
    }
    return ''
  })

  const likedCount = computed(
    () => Object.values(ratings.value).filter((liked) => liked === true).length,
  )

  const dislikedCount = computed(
    () => Object.values(ratings.value).filter((liked) => liked === false).length,
  )

  const ratedCount = computed(() => likedCount.value + dislikedCount.value)

  const hasEnoughRatings = computed(
    () => ratedCount.value >= MIN_RATINGS && likedCount.value > 0 && dislikedCount.value > 0,
  )

  const canLoadMore = computed(() => shownImdbIds.value.size < SEED_MOVIES.length)

  const missingRatingsHint = computed(() => {
    if (ratedCount.value < MIN_RATINGS) {
      return `Rate ${MIN_RATINGS - ratedCount.value} more to continue.`
    }
    if (likedCount.value === 0) return 'Mark at least one movie you liked.'
    if (dislikedCount.value === 0) return 'Mark at least one movie you did not like.'
    if (ratedCount.value < MOVIES_TO_RATE) {
      return `${ratedCount.value} ratings — rating all ${MOVIES_TO_RATE} makes the model noticeably better.`
    }
    return `${ratedCount.value} ratings. Load more if you are enjoying this.`
  })

  const isReplacing = (imdbId) => replacingImdbIds.value.has(imdbId)

  function toggleGenre(genre) {
    const isSelected = selectedGenres.value.includes(genre)
    selectedGenres.value = isSelected
      ? selectedGenres.value.filter((item) => item !== genre)
      : [...selectedGenres.value, genre]
  }

  function goBackToProfile() {
    step.value = 'profile'
  }

  async function fetchSample(total) {
    const sample = sampleMoviesForProfile(SEED_MOVIES, {
      genres: selectedGenres.value,
      birthYear: Number(birthYear.value),
      total,
      currentYear,
      excludeIds: [...shownImdbIds.value],
    })

    for (const movie of sample) shownImdbIds.value.add(movie.imdbId)

    return getManyMovieDetails(sample.map((movie) => movie.imdbId))
  }

  function forgetRating(imdbId) {
    const next = { ...ratings.value }
    delete next[imdbId]
    ratings.value = next
  }

  async function replaceMovie(imdbId) {
    if (replacingImdbIds.value.has(imdbId)) return false

    replacingImdbIds.value = new Set(replacingImdbIds.value).add(imdbId)

    try {
      const [replacement] = canLoadMore.value ? await fetchSample(1) : []
      const index = movies.value.findIndex((movie) => movie.imdbId === imdbId)
      if (index === -1) return false

      movies.value = replacement
        ? movies.value.map((movie, position) => (position === index ? replacement : movie))
        : movies.value.filter((_, position) => position !== index)

      forgetRating(imdbId)
      return Boolean(replacement)
    } catch (caught) {
      error.value = caught
      return false
    } finally {
      const pending = new Set(replacingImdbIds.value)
      pending.delete(imdbId)
      replacingImdbIds.value = pending
    }
  }

  function rateMovie(imdbId, liked) {
    ratings.value = { ...ratings.value, [imdbId]: liked }
    if (liked === null) return replaceMovie(imdbId)
    return Promise.resolve(true)
  }

  async function loadMoviesToRate() {
    if (!canContinue.value) return false

    isLoading.value = true
    error.value = null
    shownImdbIds.value = new Set()

    try {
      movies.value = await fetchSample(MOVIES_TO_RATE)
      ratings.value = {}
      step.value = 'ratings'
      return true
    } catch (caught) {
      error.value = caught
      return false
    } finally {
      isLoading.value = false
    }
  }

  async function loadMoreMovies() {
    if (isLoadingMore.value || !canLoadMore.value) return false

    isLoadingMore.value = true
    error.value = null

    try {
      movies.value = [...movies.value, ...(await fetchSample(MOVIES_PER_EXTRA_BATCH))]
      return true
    } catch (caught) {
      error.value = caught
      return false
    } finally {
      isLoadingMore.value = false
    }
  }

  function buildAnswers() {
    return {
      birthYear: Number(birthYear.value),
      favoriteGenres: [...selectedGenres.value],
      ratings: Object.entries(ratings.value)
        .filter(([, liked]) => liked === true || liked === false)
        .map(([imdbId, liked]) => ({ imdbId, liked })),
    }
  }

  return {
    step,
    birthYear,
    selectedGenres,
    movies,
    ratings,
    isLoading,
    isLoadingMore,
    error,
    earliestBirthYear,
    latestBirthYear,
    isBirthYearValid,
    hasEnoughGenres,
    canContinue,
    canLoadMore,
    profileHint,
    likedCount,
    dislikedCount,
    ratedCount,
    hasEnoughRatings,
    missingRatingsHint,
    isReplacing,
    toggleGenre,
    rateMovie,
    replaceMovie,
    goBackToProfile,
    loadMoviesToRate,
    loadMoreMovies,
    buildAnswers,
  }
}
