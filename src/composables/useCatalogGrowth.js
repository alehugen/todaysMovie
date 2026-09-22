import { computed, ref } from 'vue'

import { useWorkerRpc } from './useWorkerRpc'

export function createCatalogWorker() {
  return new Worker(new URL('../services/catalog.worker.js', import.meta.url), { type: 'module' })
}

export function useCatalogGrowth({ createWorker = createCatalogWorker } = {}) {
  const { request, terminate } = useWorkerRpc(createWorker)

  const isGrowing = ref(false)
  const discovered = ref(0)
  const error = ref(null)
  const lastResult = ref(null)

  const quotaExhausted = computed(() => error.value?.code === 'rate_limited')

  async function grow({ queryCount, options = {} } = {}) {
    if (isGrowing.value) return null

    isGrowing.value = true
    error.value = null
    discovered.value = 0

    try {
      const result = await request('grow', { queryCount, options }, (update) => {
        discovered.value = update.found
      })

      lastResult.value = result
      discovered.value = result.added
      return result
    } catch (caught) {
      error.value = caught
      return null
    } finally {
      isGrowing.value = false
    }
  }

  return { isGrowing, discovered, error, lastResult, quotaExhausted, grow, terminate }
}
