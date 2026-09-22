import { forgetModel, scoreFeatureMatrix } from './inference'
import { runTraining } from './trainingRunner'

const handlers = {
  async train({ dataset, options }, onProgress) {
    const summary = await runTraining(dataset, { ...options, onProgress })
    forgetModel()
    return summary
  },

  async score({ features, options }) {
    return { scores: await scoreFeatureMatrix(features, options) }
  },
}

self.addEventListener('message', async (event) => {
  const { id, type, payload } = event.data ?? {}
  const handler = handlers[type]

  if (!handler) {
    self.postMessage({ id, type: 'error', payload: { message: `Unknown request "${type}".` } })
    return
  }

  try {
    const result = await handler(payload ?? {}, (progress) =>
      self.postMessage({ id, type: 'progress', payload: progress }),
    )

    self.postMessage({ id, type: 'result', payload: result })
  } catch (error) {
    self.postMessage({ id, type: 'error', payload: { message: error.message } })
  }
})
