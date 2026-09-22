import { beforeEach, describe, expect, it } from 'vitest'
import { effectScope } from 'vue'

import { useRecommenderWorker } from './useRecommenderWorker'

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

  crash(message) {
    this.onerror?.({ message })
  }

  reply(id, payload) {
    this.emit({ id, type: 'result', payload })
  }

  static get last() {
    return FakeWorker.instances.at(-1)
  }
}

const createWorker = () => new FakeWorker()
const DATASET = { features: [[1], [0]], labels: [1, 0] }

describe('useRecommenderWorker', () => {
  beforeEach(() => {
    FakeWorker.instances = []
  })

  it('does not spawn a worker until something is asked of it', () => {
    useRecommenderWorker({ createWorker })

    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('reuses the same worker across requests', async () => {
    const recommender = useRecommenderWorker({ createWorker })

    const training = recommender.train(DATASET)
    FakeWorker.last.reply(1, { examples: 12 })
    await training

    const scoring = recommender.score([[1], [0]])
    FakeWorker.last.reply(2, { scores: [0.9, 0.1] })
    await scoring

    expect(FakeWorker.instances).toHaveLength(1)
    expect(FakeWorker.last.terminated).toBe(false)
  })

  it('tags every request with an id so answers never get mixed up', async () => {
    const recommender = useRecommenderWorker({ createWorker })

    const firstScore = recommender.score([[1]])
    const secondScore = recommender.score([[0]])
    const worker = FakeWorker.last

    worker.reply(2, { scores: [0.2] })
    worker.reply(1, { scores: [0.8] })

    expect(await firstScore).toEqual([0.8])
    expect(await secondScore).toEqual([0.2])
  })

  it('ignores an answer that belongs to no pending request', async () => {
    const recommender = useRecommenderWorker({ createWorker })
    const scoring = recommender.score([[1]])

    FakeWorker.last.reply(999, { scores: [0.5] })
    FakeWorker.last.reply(1, { scores: [0.7] })

    expect(await scoring).toEqual([0.7])
  })

  it('routes progress updates to the reactive state', async () => {
    const recommender = useRecommenderWorker({ createWorker })
    const training = recommender.train(DATASET)

    FakeWorker.last.emit({ id: 1, type: 'progress', payload: { phase: 'training', progress: 0.4 } })

    expect(recommender.phase.value).toBe('training')
    expect(recommender.progress.value).toBe(0.4)
    expect(recommender.isTraining.value).toBe(true)

    FakeWorker.last.reply(1, { examples: 20, evaluation: { balancedAccuracy: 0.74 } })
    await training

    expect(recommender.phase.value).toBe('idle')
    expect(recommender.evaluation.value).toEqual({ balancedAccuracy: 0.74 })
  })

  it('turns a worker-side failure into an error instead of a rejection', async () => {
    const recommender = useRecommenderWorker({ createWorker })
    const training = recommender.train(DATASET)

    FakeWorker.last.emit({ id: 1, type: 'error', payload: { message: 'no trained model yet' } })

    expect(await training).toBeNull()
    expect(recommender.error.value.message).toBe('no trained model yet')
    expect(recommender.isTraining.value).toBe(false)
  })

  it('fails every pending request when the worker crashes', async () => {
    const recommender = useRecommenderWorker({ createWorker })
    const training = recommender.train(DATASET)
    const scoring = recommender.score([[1]])

    FakeWorker.last.crash('script failed to load')

    expect(await training).toBeNull()
    expect(await scoring).toBeNull()
    expect(FakeWorker.last.terminated).toBe(true)
  })

  it('answers an empty candidate list without bothering the worker', async () => {
    const recommender = useRecommenderWorker({ createWorker })

    expect(await recommender.score([])).toEqual([])
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('starts a fresh worker after a crash', async () => {
    const recommender = useRecommenderWorker({ createWorker })
    const scoring = recommender.score([[1]])
    FakeWorker.last.crash('boom')
    await scoring

    const retry = recommender.score([[1]])
    FakeWorker.last.reply(2, { scores: [0.5] })

    expect(await retry).toEqual([0.5])
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('shuts the worker down when the component goes away', async () => {
    const scope = effectScope()
    scope.run(() => {
      const recommender = useRecommenderWorker({ createWorker })
      recommender.score([[1]])
    })

    scope.stop()

    expect(FakeWorker.last.terminated).toBe(true)
  })
})
