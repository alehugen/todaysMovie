<script setup>
const props = defineProps({
  movie: { type: Object, required: true },
  rating: { default: undefined },
})

defineEmits(['rate'])

const isRated = () => props.rating === true || props.rating === false
</script>

<template>
  <article
    class="group flex flex-col overflow-hidden rounded-card border border-outline bg-raised shadow-card transition duration-300 hover:-translate-y-1 hover:border-brand/60 hover:shadow-card-hover focus-within:border-brand"
    :class="{ 'opacity-60': isRated() }"
  >
    <div class="relative aspect-3/4 overflow-hidden bg-outline">
      <img
        v-if="movie.posterUrl"
        :src="movie.posterUrl"
        :alt="`${movie.title} poster`"
        loading="lazy"
        class="size-full object-cover transition-transform duration-500 group-hover:scale-105"
      />

      <span
        class="absolute right-2 top-2 rounded-full bg-overlay px-2 py-0.5 text-[11px] font-semibold text-overlay-content backdrop-blur-sm"
      >
        {{ Math.round((movie.score ?? 0) * 100) }}%
      </span>

      <span
        v-if="movie.isExploration"
        class="absolute left-2 top-2 rounded-full bg-overlay px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-overlay-content backdrop-blur-sm"
      >
        Wildcard
      </span>
    </div>

    <div class="flex flex-1 flex-col gap-1 p-3">
      <h3 class="truncate text-sm font-semibold" :title="movie.title">{{ movie.title }}</h3>
      <p class="truncate text-xs text-muted">{{ movie.year }} · {{ movie.genres.join(', ') }}</p>
    </div>

    <div class="grid grid-cols-2 gap-px border-t border-outline bg-outline">
      <button
        type="button"
        :aria-pressed="rating === false"
        class="focus-ring cursor-pointer py-2 text-xs font-medium transition-colors"
        :class="rating === false ? 'bg-danger text-danger-contrast' : 'bg-raised text-muted hover:text-danger'"
        @click="$emit('rate', movie.imdbId, false)"
      >
        Nope
      </button>
      <button
        type="button"
        :aria-pressed="rating === true"
        class="focus-ring cursor-pointer py-2 text-xs font-medium transition-colors"
        :class="rating === true ? 'bg-brand text-brand-contrast' : 'bg-raised text-muted hover:text-brand-text'"
        @click="$emit('rate', movie.imdbId, true)"
      >
        Watch
      </button>
    </div>
  </article>
</template>
