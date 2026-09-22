import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useUserProfileStore } from '@/stores/userProfile'

import { resolveNavigation } from './index'

const signInRoute = { name: 'sign-in', meta: { guestOnly: true } }
const onboardingRoute = { name: 'onboarding', meta: { requiresProfile: true } }
const recommendationsRoute = {
  name: 'recommendations',
  meta: { requiresProfile: true, requiresOnboarding: true },
}

describe('navigation guard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lets a visitor reach the sign-in page', () => {
    expect(resolveNavigation(signInRoute)).toBe(true)
  })

  it('sends a signed-out visitor back to sign-in', () => {
    expect(resolveNavigation(onboardingRoute)).toEqual({ name: 'sign-in' })
    expect(resolveNavigation(recommendationsRoute)).toEqual({ name: 'sign-in' })
  })

  it('sends a signed-in user away from the sign-in page', () => {
    useUserProfileStore().signIn('Ada')

    expect(resolveNavigation(signInRoute)).toEqual({ name: 'onboarding' })
  })

  it('blocks recommendations until the questionnaire is done', () => {
    useUserProfileStore().signIn('Ada')

    expect(resolveNavigation(recommendationsRoute)).toEqual({ name: 'onboarding' })
  })

  it('opens recommendations once the questionnaire is done', () => {
    const store = useUserProfileStore()
    store.signIn('Ada')
    store.finishOnboarding({ favoriteGenres: ['Drama'] })

    expect(resolveNavigation(recommendationsRoute)).toBe(true)
  })

  it('sends a fully onboarded user straight to the recommendations', () => {
    const store = useUserProfileStore()
    store.signIn('Ada')
    store.finishOnboarding({ favoriteGenres: ['Drama'] })

    expect(resolveNavigation(signInRoute)).toEqual({ name: 'recommendations' })
  })
})
