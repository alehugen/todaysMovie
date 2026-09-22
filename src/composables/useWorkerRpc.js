import { getCurrentScope, onScopeDispose } from 'vue'

export function useWorkerRpc(createWorker) {
  let worker = null
  let nextRequestId = 0
  const pendingRequests = new Map()

  function terminate() {
    worker?.terminate()
    worker = null
    pendingRequests.clear()
  }

  function handleMessage({ data }) {
    const request = pendingRequests.get(data?.id)
    if (!request) return

    if (data.type === 'progress') {
      request.onProgress?.(data.payload)
      return
    }

    pendingRequests.delete(data.id)

    if (data.type === 'error') {
      request.reject(Object.assign(new Error(data.payload.message), { code: data.payload.code }))
      return
    }

    request.resolve(data.payload)
  }

  function handleWorkerError(event) {
    const crash = new Error(event?.message ?? 'The worker crashed.')
    for (const request of pendingRequests.values()) request.reject(crash)
    terminate()
  }

  function ensureWorker() {
    if (worker) return worker

    worker = createWorker()
    worker.onmessage = handleMessage
    worker.onerror = handleWorkerError
    return worker
  }

  function request(type, payload, onProgress) {
    nextRequestId += 1
    const id = nextRequestId
    const activeWorker = ensureWorker()

    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject, onProgress })
      activeWorker.postMessage({ id, type, payload })
    })
  }

  if (getCurrentScope()) onScopeDispose(terminate)

  return { request, terminate }
}
