import { computed, ref, watchEffect } from 'vue'

import { useLocalStorage } from './useLocalStorage'

export const THEME_OPTIONS = ['light', 'dark', 'system']

const STORAGE_KEY = 'todaysmovie:theme'
const DARK_CLASS = 'dark'

const preference = useLocalStorage(STORAGE_KEY, 'system')

const systemQuery = window.matchMedia('(prefers-color-scheme: dark)')
const systemPrefersDark = ref(systemQuery.matches)

systemQuery.addEventListener('change', (event) => {
  systemPrefersDark.value = event.matches
})

const activeTheme = computed(() => {
  if (preference.value === 'system') return systemPrefersDark.value ? 'dark' : 'light'
  return preference.value
})

const isDark = computed(() => activeTheme.value === 'dark')

watchEffect(() => {
  document.documentElement.classList.toggle(DARK_CLASS, isDark.value)
})

export function useTheme() {
  function setTheme(next) {
    if (!THEME_OPTIONS.includes(next)) return
    preference.value = next
  }

  function toggleTheme() {
    setTheme(isDark.value ? 'light' : 'dark')
  }

  return { preference, activeTheme, isDark, setTheme, toggleTheme }
}
