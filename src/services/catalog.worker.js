import { buildDiscoveryPlan, growCatalog } from './catalogBuilder'

self.addEventListener('message', async (event) => {
  const { id, type, payload } = event.data ?? {}

  if (type !== 'grow') {
    self.postMessage({ id, type: 'error', payload: { message: `Unknown request "${type}".` } })
    return
  }

  try {
    const plan = buildDiscoveryPlan({ queryCount: payload?.queryCount })

    const result = await growCatalog({
      ...payload?.options,
      plan,
      onProgress: (update) => self.postMessage({ id, type: 'progress', payload: update }),
    })

    self.postMessage({ id, type: 'result', payload: result })
  } catch (error) {
    self.postMessage({ id, type: 'error', payload: { message: error.message, code: error.code } })
  }
})
