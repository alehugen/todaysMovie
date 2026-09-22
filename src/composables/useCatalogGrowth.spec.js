import { beforeEach, describe, expect, it } from 'vitest'

import { useCatalogGrowth } from './useCatalogGrowth'

class FakeWorker {
  static instances = []

  constructor() {
    this.posted = []
    this.terminated = false
    FakeWorker.instances.push(this)
  }

  postMessage(message) {
    this.posted.push(message)
  }

  terminate() {
    this.terminated = true
  }

  emit(data) {
    this.onmessage?.({ data })
  }

  static get last() {
    return FakeWorker.instances.at(-1)
  }
}

const createWorker = () => new FakeWorker()

describe('useCatalogGrowth', () => {
  beforeEach(() => {
    FakeWorker.instances = []
  })

  it('starts idle and spawns nothing', () => {
    const growth = useCatalogGrowth({ createWorker })

    expect(growth.isGrowing.value).toBe(false)
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('asks the worker for a discovery run', () => {
    const growth = useCatalogGrowth({ createWorker })
    growth.grow({ queryCount: 4 })

    expect(FakeWorker.last.posted[0]).toEqual({
      id: 1,
      type: 'grow',
      payload: { queryCount: 4, options: {} },
    })
    expect(growth.isGrowing.value).toBe(true)
  })

  it('reports how many movies were found while it works', async () => {
    const growth = useCatalogGrowth({ createWorker })
    const pending = growth.grow({})

    FakeWorker.last.emit({ id: 1, type: 'progress', payload: { stage: 'detailing', found: 7 } })
    expect(growth.discovered.value).toBe(7)

    FakeWorker.last.emit({ id: 1, type: 'result', payload: { added: 12, requests: 20 } })
    const result = await pending

    expect(result.added).toBe(12)
    expect(growth.discovered.value).toBe(12)
    expect(growth.isGrowing.value).toBe(false)
  })

  it('refuses to start a second run while one is going', async () => {
    const growth = useCatalogGrowth({ createWorker })
    const pending = growth.grow({})

    expect(await growth.grow({})).toBeNull()
    expect(FakeWorker.last.posted).toHaveLength(1)

    FakeWorker.last.emit({ id: 1, type: 'result', payload: { added: 1 } })
    await pending
  })

  it('recognises when the daily quota is gone', async () => {
    const growth = useCatalogGrowth({ createWorker })
    const pending = growth.grow({})

    FakeWorker.last.emit({
      id: 1,
      type: 'error',
      payload: { message: 'Request limit reached!', code: 'rate_limited' },
    })

    expect(await pending).toBeNull()
    expect(growth.quotaExhausted.value).toBe(true)
    expect(growth.error.value.message).toBe('Request limit reached!')
  })

  it('does not treat an ordinary failure as an exhausted quota', async () => {
    const growth = useCatalogGrowth({ createWorker })
    const pending = growth.grow({})

    FakeWorker.last.emit({
      id: 1,
      type: 'error',
      payload: { message: 'network down', code: 'network_error' },
    })
    await pending

    expect(growth.quotaExhausted.value).toBe(false)
  })

  it('can be shut down', async () => {
    const growth = useCatalogGrowth({ createWorker })
    const pending = growth.grow({})

    FakeWorker.last.emit({ id: 1, type: 'result', payload: { added: 3 } })
    await pending

    growth.terminate()

    expect(FakeWorker.last.terminated).toBe(true)
  })
})
