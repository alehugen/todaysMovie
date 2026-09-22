<script setup>
import { computed } from 'vue'

const props = defineProps({
  movie: { type: Object, required: true },
  rating: { default: undefined },
  isReplacing: { type: Boolean, default: false },
})

const emit = defineEmits(['rate'])

const topGenres = computed(() => props.movie.genres.slice(0, 2))

const facts = computed(() => [
  { label: 'Year', value: props.movie.year ?? '—' },
  { label: 'Runtime', value: props.movie.runtimeMinutes ? `${props.movie.runtimeMinutes} min` : '—' },
  { label: 'Rated', value: props.movie.rated ?? '—' },
])

const choices = [
  { value: false, label: 'Disliked', activeClass: 'bg-danger text-danger-contrast' },
  { value: null, label: "Haven't seen", activeClass: 'bg-outline text-content' },
  { value: true, label: 'Liked', activeClass: 'bg-brand text-brand-contrast' },
]

const isChosen = (value) => props.rating === value
</script>

<template>
  <article
    class="group relative flex flex-col overflow-hidden rounded-card border border-outline bg-raised shadow-card transition duration-300 hover:-translate-y-1.5 hover:border-brand/60 hover:shadow-card-hover focus-within:border-brand focus-within:shadow-card-hover"
  >
    <div
      v-if="isReplacing"
      class="absolute inset-0 z-20 flex items-center justify-center rounded-card bg-raised/85 backdrop-blur-sm"
    >
      <p class="animate-pulse text-xs font-medium text-muted">Finding another movie…</p>
    </div>
    <div class="relative aspect-3/4 overflow-hidden bg-outline">
      <img
        v-if="movie.posterUrl"
        :src="movie.posterUrl"
        :alt="`${movie.title} poster`"
        loading="lazy"
        class="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
      />
      <div v-else class="flex size-full items-center justify-center px-4 text-center text-sm text-muted">
        No poster available
      </div>

      <div
        class="pointer-events-none absolute inset-0 bg-linear-to-t from-overlay via-transparent to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-90"
      />

      <span
        v-if="movie.imdbRating"
        class="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-overlay px-2 py-1 text-xs font-semibold text-overlay-content backdrop-blur-sm"
      >
        <span
          aria-hidden="true"
          class="text-overlay-content transition-colors duration-300 group-hover:text-star"
        >
          ★
        </span>
        <span class="sr-only">IMDb rating</span>
        {{ movie.imdbRating }}
      </span>

      <ul class="absolute inset-x-3 bottom-3 flex flex-wrap gap-1.5">
        <li
          v-for="genre in topGenres"
          :key="genre"
          class="rounded-full bg-overlay px-2 py-0.5 text-[11px] font-medium text-overlay-content backdrop-blur-sm"
        >
          {{ genre }}
        </li>
      </ul>
    </div>

    <div class="flex flex-1 flex-col gap-3 p-4">
      <h3
        class="truncate text-base font-semibold transition-colors group-hover:text-brand-text"
        :title="movie.title"
      >
        {{ movie.title }}
      </h3>

      <dl class="mt-auto grid grid-cols-3 gap-2 border-t border-dashed border-outline pt-3">
        <div v-for="fact in facts" :key="fact.label" class="min-w-0">
          <dt class="text-[10px] font-medium uppercase tracking-wider text-muted">
            {{ fact.label }}
          </dt>
          <dd class="truncate text-sm font-semibold">{{ fact.value }}</dd>
        </div>
      </dl>
    </div>

    <div class="grid grid-cols-3 gap-px border-t border-outline bg-outline">
      <button
        v-for="choice in choices"
        :key="String(choice.value)"
        type="button"
        :aria-pressed="isChosen(choice.value)"
        :disabled="isReplacing"
        class="focus-ring cursor-pointer px-1 py-2.5 text-xs font-medium transition-colors duration-200 active:scale-[0.97] disabled:cursor-not-allowed"
        :class="
          isChosen(choice.value)
            ? choice.activeClass
            : 'bg-raised text-muted hover:bg-surface hover:text-content'
        "
        @click="emit('rate', movie.imdbId, choice.value)"
      >
        {{ choice.label }}
      </button>
    </div>
  </article>
</template>
