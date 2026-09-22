<script setup>
import { computed, onMounted, ref } from 'vue'

import { getManyMovieDetails } from '@/services/movieCatalog'
import { useUserProfileStore } from '@/stores/userProfile'

const userProfile = useUserProfileStore()

const moviesById = ref(new Map())
const isLoading = ref(true)
const error = ref(null)

const withDetails = (imdbIds) =>
  imdbIds.map((imdbId) => moviesById.value.get(imdbId)).filter(Boolean)

const liked = computed(() =>
  withDetails(userProfile.ratings.filter((rating) => rating.liked).map((r) => r.imdbId)),
)

const disliked = computed(() =>
  withDetails(userProfile.ratings.filter((rating) => !rating.liked).map((r) => r.imdbId)),
)

const seenOnly = computed(() =>
  withDetails(
    Object.entries(userProfile.interactions)
      .filter(([, entry]) => entry.status === 'shown')
      .map(([imdbId]) => imdbId),
  ),
)

const sections = computed(() => [
  {
    key: 'liked',
    title: 'Want to watch',
    hint: 'Movies you gave a thumbs up. These are also your positive training examples.',
    movies: liked.value,
  },
  {
    key: 'disliked',
    title: 'Not for me',
    hint: 'Just as valuable to the model — without these it cannot learn what to avoid.',
    movies: disliked.value,
  },
  {
    key: 'seen',
    title: 'Shown but not rated',
    hint: 'Already recommended, so they will not come back. Rate them to feed the model.',
    movies: seenOnly.value,
  },
])

async function loadDetails() {
  isLoading.value = true
  error.value = null

  try {
    const movies = await getManyMovieDetails(userProfile.seenImdbIds)
    moviesById.value = new Map(movies.filter(Boolean).map((movie) => [movie.imdbId, movie]))
  } catch (caught) {
    error.value = caught
  } finally {
    isLoading.value = false
  }
}

function handleRate(imdbId, liked) {
  const current = userProfile.ratingFor(imdbId)
  userProfile.rateRecommendation(imdbId, current === liked ? !liked : liked)
}

onMounted(loadDetails)
</script>

<template>
  <section>
    <h1 class="text-3xl font-semibold tracking-tight">Your library</h1>
    <p class="mt-2 text-muted">
      Everything the model has learned from, and everything it has already shown you.
    </p>

    <dl class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div
        v-for="stat in [
          { label: 'Want to watch', value: liked.length },
          { label: 'Not for me', value: disliked.length },
          { label: 'Training examples', value: userProfile.ratings.length },
          { label: 'Already seen', value: userProfile.seenImdbIds.length },
        ]"
        :key="stat.label"
        class="rounded-card border border-outline bg-raised p-4 shadow-card"
      >
        <dt class="text-[10px] font-medium uppercase tracking-wider text-muted">
          {{ stat.label }}
        </dt>
        <dd class="mt-1 text-2xl font-semibold">{{ stat.value }}</dd>
      </div>
    </dl>

    <p v-if="isLoading" class="mt-8 text-sm text-muted">Loading your movies…</p>

    <p v-else-if="error" class="mt-8 rounded-control bg-danger-subtle px-4 py-3 text-sm text-danger">
      {{ error.message }}
    </p>

    <template v-else>
      <section v-for="section in sections" :key="section.key" class="mt-10">
        <h2 class="text-sm font-semibold uppercase tracking-widest text-muted">
          {{ section.title }}
          <span class="ml-1 font-normal normal-case tracking-normal">({{ section.movies.length }})</span>
        </h2>
        <p class="mt-1 text-sm text-muted">{{ section.hint }}</p>

        <p v-if="section.movies.length === 0" class="mt-4 text-sm text-muted">Nothing here yet.</p>

        <ul v-else class="mt-4 flex flex-col gap-2">
          <li
            v-for="movie in section.movies"
            :key="movie.imdbId"
            class="flex items-center gap-3 rounded-card border border-outline bg-raised p-2.5 transition-colors hover:border-brand/60"
          >
            <img
              v-if="movie.posterUrl"
              :src="movie.posterUrl"
              :alt="`${movie.title} poster`"
              loading="lazy"
              class="h-16 w-11 shrink-0 rounded-md object-cover"
            />

            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold">{{ movie.title }}</p>
              <p class="truncate text-xs text-muted">
                {{ movie.year }} · {{ movie.genres.join(', ') }}
              </p>
            </div>

            <div class="flex shrink-0 gap-1">
              <button
                type="button"
                :aria-pressed="userProfile.ratingFor(movie.imdbId) === false"
                aria-label="Not for me"
                class="focus-ring cursor-pointer rounded-control border px-2.5 py-1 text-xs transition-colors"
                :class="
                  userProfile.ratingFor(movie.imdbId) === false
                    ? 'border-danger bg-danger text-danger-contrast'
                    : 'border-outline text-muted hover:border-danger hover:text-danger'
                "
                @click="handleRate(movie.imdbId, false)"
              >
                Nope
              </button>

              <button
                type="button"
                :aria-pressed="userProfile.ratingFor(movie.imdbId) === true"
                aria-label="Want to watch"
                class="focus-ring cursor-pointer rounded-control border px-2.5 py-1 text-xs transition-colors"
                :class="
                  userProfile.ratingFor(movie.imdbId) === true
                    ? 'border-brand bg-brand text-brand-contrast'
                    : 'border-outline text-muted hover:border-brand hover:text-brand-text'
                "
                @click="handleRate(movie.imdbId, true)"
              >
                Watch
              </button>

              <button
                type="button"
                aria-label="Remove from my library"
                class="focus-ring cursor-pointer rounded-control border border-outline px-2.5 py-1 text-xs text-muted transition-colors hover:text-content"
                @click="userProfile.forgetMovie(movie.imdbId)"
              >
                ✕
              </button>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>
