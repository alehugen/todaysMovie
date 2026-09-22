import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useUserProfileStore } from './userProfile'

describe('userProfile store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts signed out', () => {
    const store = useUserProfileStore()

    expect(store.isSignedIn).toBe(false)
    expect(store.hasFinishedOnboarding).toBe(false)
  })

  it('signs the user in and trims the name', () => {
    const store = useUserProfileStore()

    expect(store.signIn('  Ada  ')).toBe(true)
    expect(store.profile.name).toBe('Ada')
    expect(store.isSignedIn).toBe(true)
  })

  it('refuses a blank name', () => {
    const store = useUserProfileStore()

    expect(store.signIn('   ')).toBe(false)
    expect(store.isSignedIn).toBe(false)
  })

  it('persists the profile so a returning visitor stays signed in', async () => {
    useUserProfileStore().signIn('Ada')
    await nextTick()

    setActivePinia(createPinia())
    const storeOnNextVisit = useUserProfileStore()

    expect(storeOnNextVisit.isSignedIn).toBe(true)
    expect(storeOnNextVisit.profile.name).toBe('Ada')
  })

  it('records the onboarding answers and marks it finished', () => {
    const store = useUserProfileStore()
    store.signIn('Ada')

    store.finishOnboarding({
      favoriteGenres: ['Drama', 'Sci-Fi'],
      ratings: [{ imdbID: 'tt0111161', liked: true }],
    })

    expect(store.hasFinishedOnboarding).toBe(true)
    expect(store.favoriteGenres).toEqual(['Drama', 'Sci-Fi'])
    expect(store.ratings).toHaveLength(1)
  })

  it('cannot finish onboarding while signed out', () => {
    const store = useUserProfileStore()

    expect(store.finishOnboarding({ favoriteGenres: ['Drama'] })).toBe(false)
    expect(store.hasFinishedOnboarding).toBe(false)
  })

  it('keeps the name when the questionnaire is retaken', () => {
    const store = useUserProfileStore()
    store.signIn('Ada')
    store.finishOnboarding({ favoriteGenres: ['Drama'] })

    store.resetOnboarding()

    expect(store.isSignedIn).toBe(true)
    expect(store.hasFinishedOnboarding).toBe(false)
    expect(store.favoriteGenres).toEqual([])
  })

  describe('daily recommendations', () => {
    function signedIn() {
      const store = useUserProfileStore()
      store.signIn('Ada')
      store.finishOnboarding({
        favoriteGenres: ['Drama'],
        ratings: [{ imdbId: 'tt1', liked: true }],
      })
      return store
    }

    it('remembers which movies were already shown', () => {
      const store = signedIn()

      store.saveDailyPick('2026-09-21', ['tt2', 'tt3'])

      expect(store.dailyPick).toEqual({
        date: '2026-09-21',
        imdbIds: ['tt2', 'tt3'],
        explorationIds: [],
      })
      expect(store.interactions.tt2.status).toBe('shown')
    })

    it('counts rated and merely shown movies as seen', () => {
      const store = signedIn()
      store.saveDailyPick('2026-09-21', ['tt2', 'tt3'])

      expect(store.seenImdbIds.sort()).toEqual(['tt1', 'tt2', 'tt3'])
    })

    it('turns a recommendation rating into a training example', () => {
      const store = signedIn()
      store.saveDailyPick('2026-09-21', ['tt2'])

      expect(store.rateRecommendation('tt2', false)).toBe(true)

      expect(store.ratings).toContainEqual({ imdbId: 'tt2', liked: false })
      expect(store.interactions.tt2.status).toBe('disliked')
      expect(store.ratingFor('tt2')).toBe(false)
    })

    it('lets the user change their mind without duplicating the example', () => {
      const store = signedIn()
      store.rateRecommendation('tt2', false)
      store.rateRecommendation('tt2', true)

      expect(store.ratings.filter((rating) => rating.imdbId === 'tt2')).toHaveLength(1)
      expect(store.ratingFor('tt2')).toBe(true)
    })

    it('ignores a rating that is neither like nor dislike', () => {
      const store = signedIn()

      expect(store.rateRecommendation('tt2', null)).toBe(false)
      expect(store.ratingFor('tt2')).toBeUndefined()
    })

    it('does not overwrite a rating with a plain "shown" mark', () => {
      const store = signedIn()
      store.rateRecommendation('tt2', true)

      store.saveDailyPick('2026-09-22', ['tt2', 'tt4'])

      expect(store.interactions.tt2.status).toBe('liked')
      expect(store.interactions.tt4.status).toBe('shown')
    })

    it('wipes the history when the questionnaire is retaken', () => {
      const store = signedIn()
      store.saveDailyPick('2026-09-21', ['tt2'])

      store.resetOnboarding()

      expect(store.dailyPick).toBeNull()
      expect(store.seenImdbIds).toEqual([])
    })
  })

  it('clears everything on sign out', async () => {
    const store = useUserProfileStore()
    store.signIn('Ada')

    store.signOut()
    await nextTick()

    expect(store.isSignedIn).toBe(false)
    expect(localStorage.getItem('todaysmovie:profile')).toBeNull()
  })
})
