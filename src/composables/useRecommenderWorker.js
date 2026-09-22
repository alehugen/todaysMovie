import { computed, ref } from 'vue'

import { useWorkerRpc } from './useWorkerRpc'

export function createRecommenderWorker() {
  return new Worker(new URL('../ml/trainer.worker.js', import.meta.url), { type: 'module' })
}

export function useRecommenderWorker({ createWorker = createRecommenderWorker } = {}) {
  const { request, terminate } = useWorkerRpc(createWorker)

  const phase = ref('idle')
  const progress = ref(0)
  const error = ref(null)
  const summary = ref(null)

  const isTraining = computed(() => phase.value !== 'idle')
  const evaluation = computed(() => summary.value?.evaluation ?? null)

  async function train(dataset, options = {}) {
    error.value = null
    phase.value = 'starting'
    progress.value = 0

    try {
      const result = await request('train', { dataset, options }, (update) => {
        phase.value = update.phase
        progress.value = update.progress
      })

      summary.value = result
      progress.value = 1
      return result
    } catch (caught) {
      error.value = caught
      return null
    } finally {
      phase.value = 'idle'
    }
  }

  async function score(features, options = {}) {
    if (features.length === 0) return []

    try {
      const { scores } = await request('score', { features, options })
      return scores
    } catch (caught) {
      error.value = caught
      return null
    }
  }

  return { phase, progress, error, summary, evaluation, isTraining, train, score, terminate }
}
