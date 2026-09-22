<script setup>
import { useTheme } from '@/composables/useTheme'

const { preference, setTheme } = useTheme()

const options = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
]
</script>

<template>
  <div
    role="group"
    aria-label="Color theme"
    class="inline-flex items-center gap-0.5 rounded-full border border-outline bg-raised p-0.5"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="preference === option.value"
      class="focus-ring cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors"
      :class="
        preference === option.value
          ? 'bg-brand text-brand-contrast'
          : 'text-muted hover:text-content'
      "
      @click="setTheme(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
