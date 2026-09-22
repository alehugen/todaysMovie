import { getCurrentScope, onScopeDispose, ref, watch } from 'vue'

import { searchMovies } from '@/services/omdb'

export function useOmdbSearch({ debounceMs = 350, minLength = 3 } = {}) {
  const term = ref('')
  const movies = ref([])
  const totalResults = ref(0)
  const isLoading = ref(false)
  const error = ref(null)

  let debounceTimer = null
  let activeController = null
  let latestRequestId = 0

  function cancelPendingRequest() {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    if (activeController) {
      activeController.abort()
      activeController = null
    }
  }

  function clearResults() {
    movies.value = []
    totalResults.value = 0
  }

  function reset() {
    cancelPendingRequest()
    latestRequestId += 1
    clearResults()
    error.value = null
    isLoading.value = false
    term.value = ''
  }

  async function search(query) {
    cancelPendingRequest()

    const controller = new AbortController()
    const requestId = latestRequestId + 1

    activeController = controller
    latestRequestId = requestId
    isLoading.value = true
    error.value = null

    try {
      const result = await searchMovies(query, { signal: controller.signal })
      if (requestId !== latestRequestId) return

      movies.value = result.movies
      totalResults.value = result.totalResults
    } catch (caught) {
      if (caught.name === 'AbortError' || requestId !== latestRequestId) return

      clearResults()
      if (caught.code !== 'not_found') error.value = caught
    } finally {
      if (requestId === latestRequestId) {
        isLoading.value = false
        activeController = null
      }
    }
  }

  watch(term, (value) => {
    const query = value.trim()
    cancelPendingRequest()

    if (query.length < minLength) {
      latestRequestId += 1
      clearResults()
      error.value = null
      isLoading.value = false
      return
    }

    isLoading.value = true
    debounceTimer = setTimeout(() => search(query), debounceMs)
  })

  if (getCurrentScope()) onScopeDispose(cancelPendingRequest)

  return { term, movies, totalResults, isLoading, error, search, reset }
}
