import { getCurrentScope, onScopeDispose, ref, watch } from 'vue'

export function useLocalStorage(key, defaultValue, options = {}) {
  const { syncAcrossTabs = true } = options

  function cloneDefault() {
    if (defaultValue === undefined) return undefined
    return JSON.parse(JSON.stringify(defaultValue))
  }

  function parseStored(raw) {
    if (raw === null) return cloneDefault()

    try {
      return JSON.parse(raw)
    } catch {
      console.warn(`[useLocalStorage] invalid stored value for "${key}", falling back to the default.`)
      return cloneDefault()
    }
  }

  function readFromStorage() {
    try {
      return parseStored(localStorage.getItem(key))
    } catch {
      return cloneDefault()
    }
  }

  function writeToStorage(value) {
    try {
      if (value === undefined || value === null) localStorage.removeItem(key)
      else localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.warn(`[useLocalStorage] failed to persist "${key}":`, error)
    }
  }

  const state = ref(readFromStorage())

  watch(state, writeToStorage, { deep: true })

  if (syncAcrossTabs) {
    const handleExternalChange = (event) => {
      if (event.key !== key) return
      state.value = parseStored(event.newValue)
    }

    window.addEventListener('storage', handleExternalChange)

    if (getCurrentScope()) {
      onScopeDispose(() => window.removeEventListener('storage', handleExternalChange))
    }
  }

  return state
}
