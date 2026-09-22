import { afterEach, describe, expect, it } from 'vitest'

import { FEATURE_COUNT } from './features'
import {
  computeClassWeight,
  createModel,
  crossValidate,
  deleteSavedModel,
  loadSavedModel,
  predictScores,
  saveModel,
  shuffleDataset,
  trainModel,
} from './model'

const FAST_OPTIONS = { epochs: 60, seed: 7, minSamplesForValidation: Number.POSITIVE_INFINITY }

function seededRandom(seed = 11) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function separableDataset(size = 24) {
  const features = []
  const labels = []
  const random = seededRandom()

  for (let index = 0; index < size; index += 1) {
    const isSciFi = index % 2 === 0
    const vector = new Array(FEATURE_COUNT).fill(0)
    vector[10] = isSciFi ? 1 : 0
    vector[5] = isSciFi ? 0 : 1
    vector[FEATURE_COUNT - 1] = random()
    vector[FEATURE_COUNT - 2] = random()

    features.push(vector)
    labels.push(isSciFi ? 1 : 0)
  }

  return { features, labels }
}

describe('createModel', () => {
  it('takes one feature vector and returns one probability', () => {
    const model = createModel({ seed: 1 })

    expect(model.inputs[0].shape).toEqual([null, FEATURE_COUNT])
    expect(model.outputs[0].shape).toEqual([null, 1])

    model.dispose()
  })

  it('accepts a list of hidden layers', () => {
    const oneLayer = createModel({ hiddenUnits: 16, seed: 1 })
    const twoLayers = createModel({ hiddenUnits: [16, 8], seed: 1 })

    expect(twoLayers.countParams()).toBeGreaterThan(oneLayer.countParams())
    expect(twoLayers.outputs[0].shape).toEqual([null, 1])

    oneLayer.dispose()
    twoLayers.dispose()
  })

  it('stays small on purpose, given how few examples we have', () => {
    const model = createModel({ seed: 1 })

    expect(model.countParams()).toBeLessThan(400)

    model.dispose()
  })
})

describe('computeClassWeight', () => {
  it('gives more weight to the rarer class', () => {
    const weights = computeClassWeight([1, 1, 1, 1, 1, 1, 1, 1, 0, 0])

    expect(weights[0]).toBeGreaterThan(weights[1])
    expect(weights[0]).toBeCloseTo(10 / (2 * 2))
    expect(weights[1]).toBeCloseTo(10 / (2 * 8))
  })

  it('treats a balanced dataset evenly', () => {
    const weights = computeClassWeight([1, 1, 0, 0])

    expect(weights[0]).toBeCloseTo(weights[1])
  })

  it('returns nothing when one of the classes is missing', () => {
    expect(computeClassWeight([1, 1, 1])).toBeUndefined()
    expect(computeClassWeight([0, 0])).toBeUndefined()
  })
})

describe('shuffleDataset', () => {
  it('keeps every feature vector glued to its own label', () => {
    const features = [[1], [2], [3], [4], [5]]
    const labels = [1, 2, 3, 4, 5]

    const shuffled = shuffleDataset({ features, labels }, seededRandom())

    shuffled.features.forEach((vector, index) => {
      expect(vector[0]).toBe(shuffled.labels[index])
    })
  })

  it('does not modify the original arrays', () => {
    const features = [[1], [2], [3]]
    const labels = [1, 2, 3]

    shuffleDataset({ features, labels }, seededRandom())

    expect(labels).toEqual([1, 2, 3])
  })
})

describe('trainModel', () => {
  it('refuses an empty dataset', async () => {
    await expect(trainModel({ features: [], labels: [] })).rejects.toThrow()
  })

  it('learns a pattern it can actually separate', async () => {
    const dataset = separableDataset()
    const { model } = await trainModel(dataset, FAST_OPTIONS)

    const scores = predictScores(model, dataset.features)
    const correct = scores.filter(
      (score, index) => (score >= 0.5 ? 1 : 0) === dataset.labels[index],
    ).length

    expect(correct / dataset.labels.length).toBeGreaterThan(0.8)

    model.dispose()
  }, 30000)

  it('skips validation when there are too few examples', async () => {
    const dataset = separableDataset(8)
    const result = await trainModel(dataset, { epochs: 10, seed: 3 })

    expect(result.usedValidation).toBe(false)
    expect(result.finalValidationLoss).toBeNull()

    result.model.dispose()
  }, 30000)

  it('holds out a validation split once the dataset is big enough', async () => {
    const dataset = separableDataset(24)
    const result = await trainModel(dataset, { epochs: 10, seed: 3 })

    expect(result.usedValidation).toBe(true)
    expect(result.finalValidationLoss).toBeGreaterThan(0)

    result.model.dispose()
  }, 30000)
})

describe('predictScores', () => {
  it('returns one probability between 0 and 1 per movie', async () => {
    const dataset = separableDataset(12)
    const { model } = await trainModel(dataset, { epochs: 5, seed: 3 })

    const scores = predictScores(model, dataset.features)

    expect(scores).toHaveLength(12)
    for (const score of scores) {
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }

    model.dispose()
  }, 30000)

  it('handles an empty candidate list', () => {
    const model = createModel({ seed: 1 })

    expect(predictScores(model, [])).toEqual([])

    model.dispose()
  })
})

describe('crossValidate', () => {
  it('reports a high accuracy on a separable dataset', async () => {
    const result = await crossValidate(separableDataset(20), { folds: 4, repeats: 1, ...FAST_OPTIONS })

    expect(result.folds).toBe(4)
    expect(result.evaluated).toBe(20)
    expect(result.accuracy).toBeGreaterThan(0.7)
  }, 60000)

  it('evaluates every example once per repeat', async () => {
    const result = await crossValidate(separableDataset(20), { folds: 4, repeats: 3, ...FAST_OPTIONS })

    expect(result.repeats).toBe(3)
    expect(result.evaluated).toBe(60)
  }, 120000)

  it('reports per-class recall, so a majority-class guesser cannot hide', async () => {
    const result = await crossValidate(separableDataset(20), { folds: 4, repeats: 1, ...FAST_OPTIONS })

    expect(result.recallPositive).toBeGreaterThan(0.6)
    expect(result.recallNegative).toBeGreaterThan(0.6)
    expect(result.balancedAccuracy).toBeGreaterThan(0.6)
    expect(result.majorityBaseline).toBeCloseTo(0.5)

    const { truePositives, trueNegatives, falsePositives, falseNegatives } = result.confusion
    expect(truePositives + trueNegatives + falsePositives + falseNegatives).toBe(20)
  }, 60000)

  it('gives up when there is not enough data to split', async () => {
    const result = await crossValidate({ features: [[0]], labels: [1] }, { folds: 4 })

    expect(result.accuracy).toBeNull()
  })
})

describe('saving and loading', () => {
  afterEach(async () => {
    await deleteSavedModel()
  })

  it('brings the model back with the same predictions', async () => {
    const dataset = separableDataset(12)
    const { model } = await trainModel(dataset, { epochs: 20, seed: 5 })

    const before = predictScores(model, dataset.features)
    await saveModel(model)
    model.dispose()

    const restored = await loadSavedModel()
    const after = predictScores(restored, dataset.features)

    after.forEach((score, index) => expect(score).toBeCloseTo(before[index], 5))

    restored.dispose()
  }, 30000)

  it('returns null when nothing was ever saved', async () => {
    await deleteSavedModel()

    expect(await loadSavedModel()).toBeNull()
  })
})
