import { afterEach, describe, expect, it } from 'vitest'

import { FEATURE_COUNT } from './features'
import { forgetModel, getModel, scoreFeatureMatrix } from './inference'
import { deleteSavedModel } from './model'
import { runTraining } from './trainingRunner'

const MODEL_URL = 'indexeddb://inference-test-model'
const OPTIONS = { modelUrl: MODEL_URL }

function datasetOf(flipLabels = false) {
  const features = []
  const labels = []

  for (let index = 0; index < 8; index += 1) {
    const vector = new Array(FEATURE_COUNT).fill(0)
    vector[10] = index % 2
    features.push(vector)
    labels.push(flipLabels ? 1 - (index % 2) : index % 2)
  }

  return { features, labels }
}

const sciFiVector = () => {
  const vector = new Array(FEATURE_COUNT).fill(0)
  vector[10] = 1
  return vector
}

describe('inference', () => {
  afterEach(async () => {
    forgetModel()
    await deleteSavedModel(MODEL_URL)
  })

  it('answers an empty candidate list without touching the model', async () => {
    expect(await scoreFeatureMatrix([], OPTIONS)).toEqual([])
  })

  it('explains itself when no model was trained yet', async () => {
    await expect(scoreFeatureMatrix([sciFiVector()], OPTIONS)).rejects.toThrow(/no trained model/i)
  })

  it('scores candidates once a model exists', async () => {
    await runTraining(datasetOf(), { epochs: 40, seed: 3, evaluate: false, useTasteFeatures: false, modelUrl: MODEL_URL })

    const scores = await scoreFeatureMatrix([sciFiVector(), new Array(FEATURE_COUNT).fill(0)], OPTIONS)

    expect(scores).toHaveLength(2)
    expect(scores[0]).toBeGreaterThan(scores[1])
  }, 60000)

  it('keeps the model in memory between calls', async () => {
    await runTraining(datasetOf(), { epochs: 20, seed: 3, evaluate: false, useTasteFeatures: false, modelUrl: MODEL_URL })

    const first = await getModel(MODEL_URL)
    const second = await getModel(MODEL_URL)

    expect(second).toBe(first)
  }, 60000)

  it('picks up the new weights after forgetModel', async () => {
    await runTraining(datasetOf(), { epochs: 60, seed: 3, evaluate: false, useTasteFeatures: false, modelUrl: MODEL_URL })
    const before = await scoreFeatureMatrix([sciFiVector()], OPTIONS)

    await runTraining(datasetOf(true), { epochs: 60, seed: 3, evaluate: false, useTasteFeatures: false, modelUrl: MODEL_URL })
    const withStaleCache = await scoreFeatureMatrix([sciFiVector()], OPTIONS)
    expect(withStaleCache[0]).toBeCloseTo(before[0], 5)

    forgetModel()
    const afterRefresh = await scoreFeatureMatrix([sciFiVector()], OPTIONS)

    expect(afterRefresh[0]).not.toBeCloseTo(before[0], 2)
  }, 120000)
})
