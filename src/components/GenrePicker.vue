<script setup>
import { SELECTABLE_GENRES } from '@/data/seedCatalog'

defineProps({
  selected: { type: Array, required: true },
})

const emit = defineEmits(['toggle'])
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="genre in SELECTABLE_GENRES"
      :key="genre"
      type="button"
      :aria-pressed="selected.includes(genre)"
      class="focus-ring cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
      :class="
        selected.includes(genre)
          ? 'border-brand bg-brand text-brand-contrast shadow-card'
          : 'border-outline bg-raised text-muted hover:border-brand hover:text-content hover:shadow-card'
      "
      @click="emit('toggle', genre)"
    >
      {{ genre }}
    </button>
  </div>
</template>
