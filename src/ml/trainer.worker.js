/**
 * THE THREAD BOUNDARY
 *
 * Training runs for roughly 200 epochs. On the main thread that freezes the page
 * completely — clicks stop responding, animations stall, and the progress bar
 * ironically cannot move. JavaScript in the browser runs on ONE thread that also
 * handles layout, painting and input.
 *
 * So this worker owns TensorFlow.js. The main thread never imports it, which is
 * also why the main bundle stays around 110 kB while this file compiles to ~1.6 MB.
 *
 * The file is deliberately tiny. Everything hard lives in `trainingRunner.js` and
 * `inference.js`, which are ordinary modules that can be unit-tested; jsdom cannot
 * execute a real Worker, so the untestable surface is kept down to this shell.
 *
 * PROTOCOL — a minimal RPC over postMessage. Every request carries an `id` so that
 * answers can arrive out of order without being matched to the wrong caller:
 *
 *     main → worker   { id, type: 'train' | 'score', payload }
 *     worker → main   { id, type: 'progress', payload }   (many)
 *                     { id, type: 'result',   payload }   (once)
 *                     { id, type: 'error',    payload }   (once)
 */

import { forgetModel, scoreFeatureMatrix } from './inference'
import { runTraining } from './trainingRunner'

const handlers = {
  async train({ dataset, options }, onProgress) {
    const summary = await runTraining(dataset, { ...options, onProgress })

    // The weights in IndexedDB are new, so the copy cached in this worker's memory
    // is stale. Without this line the app would retrain and keep serving the old
    // recommendations, silently.
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
    /**
     * An exception inside a worker does NOT propagate to the main thread. Without
     * this catch the failure would vanish and the caller's promise would hang
     * forever, leaving a progress bar spinning with nothing behind it.
     *
     * Only `error.message` is sent: an Error object does not survive structured
     * cloning with its stack intact.
     */
    self.postMessage({ id, type: 'error', payload: { message: error.message } })
  }
})
