<script setup>
import { useRouter } from 'vue-router'

import GenrePicker from '@/components/GenrePicker.vue'
import MovieRatingCard from '@/components/MovieRatingCard.vue'
import { MIN_GENRES, MIN_RATINGS, useOnboarding } from '@/composables/useOnboarding'
import { useUserProfileStore } from '@/stores/userProfile'

const router = useRouter()
const userProfile = useUserProfileStore()

const {
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
  canContinue,
  canLoadMore,
  profileHint,
  ratedCount,
  hasEnoughRatings,
  missingRatingsHint,
  isReplacing,
  toggleGenre,
  rateMovie,
  goBackToProfile,
  loadMoviesToRate,
  loadMoreMovies,
  buildAnswers,
} = useOnboarding()

function handleFinish() {
  userProfile.finishOnboarding(buildAnswers())
  router.push({ name: 'recommendations' })
}
</script>

<template>
  <section class="mx-auto max-w-4xl pb-24">
    <p class="text-sm font-medium text-brand-text">
      Step {{ step === 'profile' ? 1 : 2 }} of 2
    </p>

    <template v-if="step === 'profile'">
      <h1 class="mt-1 text-3xl font-semibold tracking-tight">
        Tell us about your taste, {{ userProfile.profile.name }}
      </h1>
      <p class="mt-2 text-muted">
        We use your birth year to pick movies from every decade you have lived through, and your
        genres to choose which ones.
      </p>

      <div class="mt-8 max-w-xs">
        <label for="birth-year" class="text-sm font-medium">Year you were born</label>
        <input
          id="birth-year"
          v-model="birthYear"
          type="number"
          inputmode="numeric"
          :min="earliestBirthYear"
          :max="latestBirthYear"
          placeholder="1993"
          class="focus-ring mt-2 w-full rounded-control border border-outline bg-raised px-3 py-2 transition-colors placeholder:text-muted"
        />
      </div>

      <div class="mt-8">
        <p class="text-sm font-medium">Favorite genres</p>
        <p class="mb-3 text-sm text-muted">Pick at least {{ MIN_GENRES }}.</p>
        <GenrePicker :selected="selectedGenres" @toggle="toggleGenre" />
      </div>

      <p v-if="error" class="mt-6 rounded-control bg-danger-subtle px-4 py-3 text-sm text-danger">
        {{ error.message }}
      </p>

      <div class="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          :disabled="!canContinue || isLoading"
          class="focus-ring cursor-pointer rounded-control bg-brand px-5 py-2.5 font-medium text-brand-contrast transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
          @click="loadMoviesToRate"
        >
          {{ isLoading ? 'Loading movies…' : 'Continue' }}
        </button>

        <span class="text-sm text-muted">{{ profileHint || 'Ready when you are.' }}</span>
      </div>
    </template>

    <template v-else>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight">Rate these movies</h1>
      <p class="mt-2 text-muted">
        Be honest — your dislikes teach the model as much as your likes.
      </p>

      <div class="sticky top-0 z-10 -mx-4 mt-6 bg-surface px-4 py-3">
        <div class="flex items-center justify-between gap-4 text-sm">
          <span class="text-muted">{{ ratedCount }} of {{ MIN_RATINGS }} needed</span>
          <span v-if="missingRatingsHint" class="text-right text-muted">
            {{ missingRatingsHint }}
          </span>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
          <div
            class="h-full rounded-full bg-brand transition-[width] duration-300"
            :style="{ width: `${Math.min(100, (ratedCount / MIN_RATINGS) * 100)}%` }"
          />
        </div>
      </div>

      <div class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MovieRatingCard
          v-for="movie in movies"
          :key="movie.imdbId"
          :movie="movie"
          :rating="ratings[movie.imdbId]"
          :is-replacing="isReplacing(movie.imdbId)"
          @rate="rateMovie"
        />
      </div>

      <div v-if="canLoadMore" class="mt-8 flex flex-col items-center gap-2">
        <button
          type="button"
          :disabled="isLoadingMore"
          class="focus-ring cursor-pointer rounded-control border border-outline px-5 py-2.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand-text disabled:opacity-40"
          @click="loadMoreMovies"
        >
          {{ isLoadingMore ? 'Loading…' : 'Rate more movies' }}
        </button>
        <p class="text-xs text-muted">Every extra rating makes the model more accurate.</p>
      </div>

      <div class="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          class="focus-ring cursor-pointer rounded-control border border-outline px-4 py-2 text-sm text-muted transition-colors hover:border-brand hover:text-content"
          @click="goBackToProfile"
        >
          Change my answers
        </button>
      </div>

      <Transition
        enter-active-class="transition duration-300 ease-out"
        enter-from-class="translate-y-8 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-200 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="translate-y-8 opacity-0"
      >
        <div
          v-if="hasEnoughRatings"
          class="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5"
        >
          <div
            class="pointer-events-auto flex items-center gap-3 rounded-full border border-outline bg-raised/75 py-2 pl-5 pr-2 shadow-card-hover backdrop-blur-md"
          >
            <p class="text-sm text-muted">
              <span class="font-semibold text-content">{{ ratedCount }}</span> rated
            </p>

            <button
              type="button"
              class="focus-ring cursor-pointer rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover"
              @click="handleFinish"
            >
              See my recommendations
            </button>
          </div>
        </div>
      </Transition>
    </template>
  </section>
</template>
