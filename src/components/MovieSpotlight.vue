<script setup>
import { computed } from 'vue'

const props = defineProps({
  movie: { type: Object, required: true },
  rating: { default: undefined },
})

defineEmits(['rate'])

const metaLine = computed(() =>
  [
    props.movie.year,
    props.movie.runtimeMinutes ? `${props.movie.runtimeMinutes} min` : null,
    props.movie.rated,
  ]
    .filter(Boolean)
    .join(' · '),
)

const matchPercent = computed(() => Math.round((props.movie.score ?? 0) * 100))
</script>

<template>
  <article
    class="group overflow-hidden rounded-card border border-outline bg-raised shadow-card transition duration-300 hover:border-brand/60 hover:shadow-card-hover"
  >
    <div class="flex flex-col sm:flex-row">
      <div class="relative shrink-0 overflow-hidden sm:w-56">
        <img
          v-if="movie.posterUrl"
          :src="movie.posterUrl"
          :alt="`${movie.title} poster`"
          class="h-64 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-full"
        />
        <div v-else class="flex h-64 items-center justify-center text-sm text-muted sm:h-full">
          No poster
        </div>

        <span
          v-if="movie.imdbRating"
          class="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-overlay px-2 py-1 text-xs font-semibold text-overlay-content backdrop-blur-sm"
        >
          <span aria-hidden="true" class="text-star">★</span>
          <span class="sr-only">IMDb rating</span>
          {{ movie.imdbRating }}
        </span>
      </div>

      <div class="flex flex-1 flex-col gap-3 p-6">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-[10px] font-semibold uppercase tracking-widest text-brand-text">
              {{ movie.isExploration ? 'Something different' : "Today's movie" }}
            </p>
            <h2 class="mt-1 text-2xl font-semibold tracking-tight">{{ movie.title }}</h2>
            <p class="mt-1 text-sm text-muted">{{ metaLine }}</p>
          </div>

          <span
            class="shrink-0 rounded-full bg-brand-subtle px-3 py-1 text-sm font-semibold text-brand-text"
          >
            {{ matchPercent }}%
          </span>
        </div>

        <ul class="flex flex-wrap gap-1.5">
          <li
            v-for="genre in movie.genres"
            :key="genre"
            class="rounded-full border border-outline px-2 py-0.5 text-[11px] font-medium text-muted"
          >
            {{ genre }}
          </li>
        </ul>

        <p v-if="movie.plot" class="text-sm leading-relaxed text-muted">{{ movie.plot }}</p>

        <div class="mt-auto flex gap-2 pt-2">
          <button
            type="button"
            :aria-pressed="rating === false"
            class="focus-ring flex-1 cursor-pointer rounded-control border px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.98]"
            :class="
              rating === false
                ? 'border-danger bg-danger text-danger-contrast'
                : 'border-outline text-muted hover:border-danger hover:text-danger'
            "
            @click="$emit('rate', movie.imdbId, false)"
          >
            Not for me
          </button>

          <button
            type="button"
            :aria-pressed="rating === true"
            class="focus-ring flex-1 cursor-pointer rounded-control border px-4 py-2.5 text-sm font-semibold transition-colors active:scale-[0.98]"
            :class="
              rating === true
                ? 'border-brand bg-brand text-brand-contrast'
                : 'border-outline text-muted hover:border-brand hover:text-brand-text'
            "
            @click="$emit('rate', movie.imdbId, true)"
          >
            I want to watch this
          </button>
        </div>
      </div>
    </div>
  </article>
</template>
