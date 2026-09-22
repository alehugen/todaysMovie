import { defineStore } from 'pinia'
import { computed } from 'vue'

import { useLocalStorage } from '@/composables/useLocalStorage'

const STORAGE_KEY = 'todaysmovie:profile'

export const useUserProfileStore = defineStore('userProfile', () => {
  const profile = useLocalStorage(STORAGE_KEY, null)

  const isSignedIn = computed(() => Boolean(profile.value?.name))
  const hasFinishedOnboarding = computed(() => Boolean(profile.value?.finishedOnboardingAt))
  const birthYear = computed(() => profile.value?.birthYear ?? null)
  const favoriteGenres = computed(() => profile.value?.favoriteGenres ?? [])
  const ratings = computed(() => profile.value?.ratings ?? [])
  const trainingSummary = computed(() => profile.value?.trainingSummary ?? null)
  const interactions = computed(() => profile.value?.interactions ?? {})
  const dailyPick = computed(() => profile.value?.dailyPick ?? null)

  const seenImdbIds = computed(() => [
    ...new Set([
      ...ratings.value.map((rating) => rating.imdbId),
      ...Object.keys(interactions.value),
    ]),
  ])

  function signIn(name) {
    const trimmedName = name?.trim() ?? ''
    if (!trimmedName) return false

    profile.value = {
      name: trimmedName,
      createdAt: new Date().toISOString(),
      birthYear: null,
      favoriteGenres: [],
      ratings: [],
      interactions: {},
      dailyPick: null,
      trainingSummary: null,
      finishedOnboardingAt: null,
    }

    return true
  }

  function signOut() {
    profile.value = null
  }

  function finishOnboarding({
    birthYear: year = null,
    favoriteGenres: genres = [],
    ratings: movieRatings = [],
  } = {}) {
    if (!profile.value) return false

    profile.value = {
      ...profile.value,
      birthYear: year,
      favoriteGenres: genres,
      ratings: movieRatings,
      finishedOnboardingAt: new Date().toISOString(),
    }

    return true
  }

  function saveDailyPick(date, imdbIds, explorationIds = []) {
    if (!profile.value) return false

    const now = new Date().toISOString()
    const shown = { ...interactions.value }

    for (const imdbId of imdbIds) {
      if (!shown[imdbId]) shown[imdbId] = { status: 'shown', at: now }
    }

    profile.value = {
      ...profile.value,
      dailyPick: { date, imdbIds, explorationIds },
      interactions: shown,
    }
    return true
  }

  function rateRecommendation(imdbId, liked) {
    if (!profile.value || (liked !== true && liked !== false)) return false

    const ratings = profile.value.ratings.filter((rating) => rating.imdbId !== imdbId)
    ratings.push({ imdbId, liked })

    profile.value = {
      ...profile.value,
      ratings,
      interactions: {
        ...interactions.value,
        [imdbId]: { status: liked ? 'liked' : 'disliked', at: new Date().toISOString() },
      },
    }

    return true
  }

  function forgetMovie(imdbId) {
    if (!profile.value) return false

    const remaining = { ...interactions.value }
    delete remaining[imdbId]

    profile.value = {
      ...profile.value,
      ratings: profile.value.ratings.filter((rating) => rating.imdbId !== imdbId),
      interactions: remaining,
    }

    return true
  }

  function ratingFor(imdbId) {
    return profile.value?.ratings.find((rating) => rating.imdbId === imdbId)?.liked ?? undefined
  }

  function saveTrainingSummary(summary) {
    if (!profile.value) return false

    profile.value = { ...profile.value, trainingSummary: summary }
    return true
  }

  function resetOnboarding() {
    if (!profile.value) return

    profile.value = {
      ...profile.value,
      birthYear: null,
      favoriteGenres: [],
      ratings: [],
      interactions: {},
      dailyPick: null,
      trainingSummary: null,
      finishedOnboardingAt: null,
    }
  }

  return {
    profile,
    isSignedIn,
    hasFinishedOnboarding,
    birthYear,
    favoriteGenres,
    ratings,
    trainingSummary,
    interactions,
    dailyPick,
    seenImdbIds,
    signIn,
    signOut,
    finishOnboarding,
    saveDailyPick,
    rateRecommendation,
    forgetMovie,
    ratingFor,
    saveTrainingSummary,
    resetOnboarding,
  }
})
