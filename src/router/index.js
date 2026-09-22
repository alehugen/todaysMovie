import { createRouter, createWebHistory } from 'vue-router'

import { useUserProfileStore } from '@/stores/userProfile'

const routes = [
  {
    path: '/',
    name: 'sign-in',
    component: () => import('@/views/SignInView.vue'),
    meta: { guestOnly: true },
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/views/OnboardingView.vue'),
    meta: { requiresProfile: true },
  },
  {
    path: '/recommendations',
    name: 'recommendations',
    component: () => import('@/views/RecommendationsView.vue'),
    meta: { requiresProfile: true, requiresOnboarding: true },
  },
  {
    path: '/library',
    name: 'library',
    component: () => import('@/views/LibraryView.vue'),
    meta: { requiresProfile: true, requiresOnboarding: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: 'sign-in' },
  },
]

export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes,
  })

  router.beforeEach(resolveNavigation)

  return router
}

export function resolveNavigation(to) {
  const userProfile = useUserProfileStore()

  if (to.meta.requiresProfile && !userProfile.isSignedIn) {
    return { name: 'sign-in' }
  }

  if (to.meta.requiresOnboarding && !userProfile.hasFinishedOnboarding) {
    return { name: 'onboarding' }
  }

  if (to.meta.guestOnly && userProfile.isSignedIn) {
    return { name: userProfile.hasFinishedOnboarding ? 'recommendations' : 'onboarding' }
  }

  return true
}
