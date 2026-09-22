<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import MovieSpotlight from '@/components/MovieSpotlight.vue'
import SuggestionCard from '@/components/SuggestionCard.vue'
import { useCatalogGrowth } from '@/composables/useCatalogGrowth'
import { useRecommenderWorker } from '@/composables/useRecommenderWorker'
import { describeModelConfidence } from '@/ml/confidence'
import { DAILY_SELECTION_SIZE, buildDailySelection, dateKey } from '@/ml/dailySelection'
import { buildFeatureVector, buildTrainingSet } from '@/ml/features'
import { rankByScore } from '@/ml/ranking'
import { augmentCandidates } from '@/ml/taste'
import { PIPELINE_FEATURE_COUNT, USE_TASTE_FEATURES } from '@/ml/pipelineConfig'
import { getCandidateCatalog, getManyMovieDetails } from '@/services/movieCatalog'
import { sampleMoviesForProfile } from '@/services/movieSampler'
import { useUserProfileStore } from '@/stores/userProfile'

const CANDIDATE_POOL_SIZE = 40
const LOW_CATALOG_THRESHOLD = 60

const PHASE_LABELS = {
  starting: 'Waking up the recommender…',
  evaluating: 'Measuring how well it predicts your taste…',
  training: 'Learning from your ratings…',
  saving: 'Saving the model…',
}

const router = useRouter()
const userProfile = useUserProfileStore()
const { phase, progress, evaluation, error, isTraining, train, score, terminate } =
  useRecommenderWorker()

const { isGrowing, discovered, quotaExhausted, grow } = useCatalogGrowth()

const isPreparing = ref(false)
const picks = ref([])
const catalogSize = ref(0)
const remainingCandidates = ref(0)

const today = dateKey()
const summary = computed(() => userProfile.trainingSummary)
const isBusy = computed(() => isPreparing.value || isTraining.value)
const phaseLabel = computed(() => PHASE_LABELS[phase.value] ?? 'Working…')

const viewer = computed(() => ({
  birthYear: userProfile.birthYear,
  favoriteGenres: userProfile.favoriteGenres,
}))

const modelIsStale = computed(
  () =>
    Boolean(summary.value) &&
    (summary.value.examples !== userProfile.ratings.length ||
      summary.value.featureCount !== FEATURE_COUNT),
)

const confidence = computed(() =>
  describeModelConfidence(evaluation.value ? { evaluation: evaluation.value } : summary.value),
)

const accuracyLabel = computed(() => {
  const accuracy = confidence.value.accuracy
  return accuracy === null ? null : `${Math.round(accuracy * 100)}% match with your ratings`
})

const spotlight = computed(() => picks.value[0] ?? null)
const alternatives = computed(() => picks.value.slice(1))

async function trainFromRatings() {
  isPreparing.value = true

  try {
    const details = await getManyMovieDetails(userProfile.ratings.map((rating) => rating.imdbId))
    const moviesById = new Map(details.map((movie) => [movie.imdbId, movie]))

    isPreparing.value = false
    const result = await train(buildTrainingSet(userProfile.ratings, moviesById, viewer.value))

    if (result) userProfile.saveTrainingSummary(result)
    return Boolean(result)
  } finally {
    isPreparing.value = false
  }
}

async function scoreAll(movies, explorationIds = []) {
  const vectors = movies.map((movie) => buildFeatureVector(movie, viewer.value))
  const scores = await score(
    USE_TASTE_FEATURES ? augmentCandidates(vectors, summary.value?.tasteProfile) : vectors,
  )
  if (!scores) return null

  return movies.map((movie, index) => ({
    ...movie,
    score: scores[index],
    isExploration: explorationIds.includes(movie.imdbId),
  }))
}

async function restoreTodaysPick() {
  const { imdbIds, explorationIds = [] } = userProfile.dailyPick
  const details = await getManyMovieDetails(imdbIds)
  const scored = await scoreAll(details, explorationIds)

  if (scored) picks.value = scored
}

async function growCatalogIfNeeded() {
  if (remainingCandidates.value >= LOW_CATALOG_THRESHOLD || quotaExhausted.value) return

  await grow({})
  await refreshCatalogSize()
}

async function refreshCatalogSize() {
  const catalog = await getCandidateCatalog()
  catalogSize.value = catalog.length
  remainingCandidates.value = catalog.length - userProfile.seenImdbIds.length
  return catalog
}

async function chooseTodaysPick() {
  const catalog = await refreshCatalogSize()

  const candidates = sampleMoviesForProfile(catalog, {
    genres: userProfile.favoriteGenres,
    birthYear: userProfile.birthYear,
    total: CANDIDATE_POOL_SIZE,
    excludeIds: userProfile.seenImdbIds,
  })

  const details = await getManyMovieDetails(candidates.map((movie) => movie.imdbId))
  const scored = await scoreAll(details)
  if (!scored) return

  const selection = buildDailySelection(rankByScore(details, scored.map((movie) => movie.score)), {
    size: DAILY_SELECTION_SIZE,
  })

  picks.value = selection
  userProfile.saveDailyPick(
    today,
    selection.map((movie) => movie.imdbId),
    selection.filter((movie) => movie.isExploration).map((movie) => movie.imdbId),
  )
}

async function refresh({ force = false } = {}) {
  if (!summary.value || modelIsStale.value) {
    if (!(await trainFromRatings())) return
  }

  isPreparing.value = true

  try {
    if (!force && userProfile.dailyPick?.date === today) {
      await restoreTodaysPick()
      await refreshCatalogSize()
    } else {
      await chooseTodaysPick()
    }
  } finally {
    isPreparing.value = false
  }

  growCatalogIfNeeded()
}

function handleRate(imdbId, liked) {
  const current = userProfile.ratingFor(imdbId)
  userProfile.rateRecommendation(imdbId, current === liked ? !liked : liked)
}

function retakeOnboarding() {
  terminate()
  userProfile.resetOnboarding()
  router.push({ name: 'onboarding' })
}

onMounted(() => refresh())
</script>

<template>
  <section class="pb-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold tracking-tight">
          Hi {{ userProfile.profile.name }}, here is your pick
        </h1>
        <p class="mt-2 text-muted">
          Chosen today from {{ userProfile.ratings.length }} ratings, entirely in your browser.
        </p>
      </div>

      <p
        v-if="summary && !isBusy && confidence.needsAttention"
        class="rounded-full bg-danger-subtle px-4 py-1.5 text-sm font-medium text-danger"
      >
        {{ confidence.message }}
      </p>
      <p v-else-if="summary && !isBusy && accuracyLabel" class="text-sm text-muted">
        {{ accuracyLabel }}
      </p>
    </div>

    <div v-if="isBusy" class="mt-8 rounded-card border border-outline bg-raised p-6 shadow-card">
      <p class="text-sm font-medium">
        {{ isTraining ? phaseLabel : 'Fetching the movies from OMDb…' }}
      </p>
      <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-outline">
        <div
          class="h-full rounded-full bg-brand transition-[width] duration-200"
          :style="{ width: `${Math.round((isTraining ? progress : 0.15) * 100)}%` }"
        />
      </div>
      <p class="mt-3 text-xs text-muted">Running in a background thread.</p>
    </div>

    <p v-else-if="error" class="mt-8 rounded-control bg-danger-subtle px-4 py-3 text-sm text-danger">
      {{ error.message }}
    </p>

    <template v-else-if="spotlight">
      <div class="mt-8">
        <MovieSpotlight
          :movie="spotlight"
          :rating="userProfile.ratingFor(spotlight.imdbId)"
          @rate="handleRate"
        />
      </div>

      <div v-if="alternatives.length" class="mt-10">
        <h2 class="text-sm font-semibold uppercase tracking-widest text-muted">More for you</h2>
        <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SuggestionCard
            v-for="movie in alternatives"
            :key="movie.imdbId"
            :movie="movie"
            :rating="userProfile.ratingFor(movie.imdbId)"
            @rate="handleRate"
          />
        </div>
      </div>
    </template>

    <div
      v-else
      class="mt-8 rounded-card border border-dashed border-outline bg-raised px-6 py-12 text-center"
    >
      <p class="text-sm text-muted">Nothing left to recommend from the current catalog.</p>
    </div>

    <p v-if="isGrowing" class="mt-8 text-xs text-muted">
      Searching OMDb for movies you have not seen yet… {{ discovered }} found.
    </p>
    <p v-else-if="quotaExhausted" class="mt-8 text-xs text-danger">
      The daily OMDb quota is gone. The catalog will grow again tomorrow.
    </p>
    <p v-else-if="catalogSize" class="mt-8 text-xs text-muted">
      {{ catalogSize }} movies in your catalog · {{ remainingCandidates }} still unseen
    </p>

    <div class="mt-6 flex flex-wrap items-center gap-4">
      <button
        v-if="modelIsStale"
        type="button"
        :disabled="isBusy"
        class="focus-ring cursor-pointer rounded-control bg-brand px-5 py-2.5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover disabled:opacity-40"
        @click="refresh({ force: true })"
      >
        Update with my new ratings
      </button>

      <button
        type="button"
        :disabled="isBusy"
        class="focus-ring cursor-pointer rounded-control border border-outline px-4 py-2 text-sm text-muted transition-colors hover:border-brand hover:text-content disabled:opacity-40"
        @click="refresh({ force: true })"
      >
        Pick again
      </button>

      <button
        type="button"
        class="focus-ring cursor-pointer rounded-control border border-outline px-4 py-2 text-sm text-muted transition-colors hover:border-brand hover:text-content"
        @click="retakeOnboarding"
      >
        Retake the questionnaire
      </button>
    </div>
  </section>
</template>
