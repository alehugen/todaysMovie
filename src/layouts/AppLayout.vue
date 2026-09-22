<script setup>
import { useRouter } from 'vue-router'

import appLogo from '@/assets/icon.png'
import ThemeToggle from '@/components/ThemeToggle.vue'
import { useUserProfileStore } from '@/stores/userProfile'

const AUTHOR_NAME = 'Alessandro Hugen'
const AUTHOR_LINKEDIN_URL = 'https://www.linkedin.com/in/alehugen'

const userProfile = useUserProfileStore()
const router = useRouter()

function handleSignOut() {
  userProfile.signOut()
  router.push({ name: 'sign-in' })
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-surface text-content">
    <header class="border-b border-outline">
      <div class="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4">
        <RouterLink
          :to="{ name: 'sign-in' }"
          class="focus-ring flex items-center gap-2.5 rounded-control text-lg font-semibold tracking-tight"
        >
          <img :src="appLogo" alt="" aria-hidden="true" class="h-8 w-auto shrink-0" />
          <span>Today's <span class="text-brand-text">Movie</span></span>
        </RouterLink>

        <div class="flex items-center gap-3">
          <nav v-if="userProfile.hasFinishedOnboarding" class="flex items-center gap-1">
            <RouterLink
              v-for="link in [
                { name: 'recommendations', label: 'Today' },
                { name: 'library', label: 'Library' },
              ]"
              :key="link.name"
              :to="{ name: link.name }"
              class="focus-ring rounded-full px-3 py-1 text-sm font-medium text-muted transition-colors hover:text-content"
              active-class="bg-brand-subtle text-brand-text"
            >
              {{ link.label }}
            </RouterLink>
          </nav>

          <span v-if="userProfile.isSignedIn" class="hidden text-sm text-muted sm:inline">
            {{ userProfile.profile.name }}
          </span>

          <ThemeToggle />

          <button
            v-if="userProfile.isSignedIn"
            type="button"
            class="focus-ring cursor-pointer rounded-full border border-outline px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-content"
            @click="handleSignOut"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <slot />
    </main>

    <footer class="border-t border-outline">
      <div
        class="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between"
      >
        <p>Movie data by OMDb. Recommendations trained locally in your browser.</p>

        <a
          :href="AUTHOR_LINKEDIN_URL"
          target="_blank"
          rel="noopener noreferrer"
          :aria-label="`${AUTHOR_NAME} on LinkedIn`"
          class="focus-ring inline-flex items-center gap-2 rounded-control font-medium transition-colors hover:text-brand-text"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            class="size-4 shrink-0"
          >
            <path
              d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"
            />
          </svg>
          {{ AUTHOR_NAME }}
        </a>
      </div>
    </footer>
  </div>
</template>
