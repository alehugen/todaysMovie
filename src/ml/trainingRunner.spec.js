import { afterEach, describe, expect, it, vi } from 'vitest'

import { FEATURE_COUNT } from './features'
import { deleteSavedModel, loadSavedModel, predictScores } from './model'
import { MIN_TRAINING_EXAMPLES, TRAINING_PHASES, describeDatasetProblem, runTraining } from './trainingRunner'

const MODEL_URL = 'indexeddb://test-model'
const FAST = { epochs: 20, seed: 7, evaluate: false, useTasteFeatures: false, modelUrl: MODEL_URL }

function datasetOf(size) {
  const features = []
  const labels = []

  for (let index = 0; index < size; index += 1) {
    const vector = new Array(FEATURE_COUNT).fill(0)
    vector[10] = index % 2
    features.push(vector)
    labels.push(index % 2)
  }

  return { features, labels, size, positives: size / 2, negatives: size / 2 }
}

describe('describeDatasetProblem', () => {
  it('accepts a usable dataset', () => {
    expect(describeDatasetProblem(datasetOf(8))).toBeNull()
  })

  it('rejects an empty dataset', () => {
    expect(describeDatasetProblem({ labels: [] })).toMatch(/nothing to train/i)
  })

  it('rejects a dataset that is too small', () => {
    expect(describeDatasetProblem({ labels: [1, 0] })).toMatch(new RegExp(String(MIN_TRAINING_EXAMPLES)))
  })

  it('rejects a dataset with a single class', () => {
    expect(describeDatasetProblem({ labels: [1, 1, 1, 1, 1] })).toMatch(/liked and one disliked/i)
  })
})

describe('runTraining', () => {
  afterEach(async () => {
    await deleteSavedModel(MODEL_URL)
  })

  it('refuses to start on an unusable dataset', async () => {
    await expect(runTraining({ labels: [1, 1, 1, 1], features: [] }, FAST)).rejects.toThrow(
      /liked and one disliked/i,
    )
  })

  it('reports every phase in order', async () => {
    const phases = []
    await runTraining(datasetOf(8), {
      ...FAST,
      evaluate: true,
      folds: 2,
      onProgress: ({ phase }) => {
        if (phases.at(-1) !== phase) phases.push(phase)
      },
    })

    expect(phases).toEqual([
      TRAINING_PHASES.evaluating,
      TRAINING_PHASES.training,
      TRAINING_PHASES.saving,
    ])
  }, 60000)

  it('reports progress that only moves forward, from 0 to 1', async () => {
    const values = []
    await runTraining(datasetOf(8), {
      ...FAST,
      onProgress: ({ phase, progress }) => {
        if (phase === TRAINING_PHASES.training) values.push(progress)
      },
    })

    expect(values.at(0)).toBe(0)
    expect(values.at(-1)).toBeLessThanOrEqual(1)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  }, 60000)

  it('leaves a usable model behind', async () => {
    const dataset = datasetOf(8)
    await runTraining(dataset, FAST)

    const model = await loadSavedModel(MODEL_URL)
    expect(model).not.toBeNull()

    const scores = predictScores(model, dataset.features)
    expect(scores).toHaveLength(8)

    model.dispose()
  }, 60000)

  it('returns the numbers the UI needs', async () => {
    const result = await runTraining(datasetOf(8), { ...FAST, evaluate: true, folds: 2 })

    expect(result.examples).toBe(8)
    expect(result.epochsRun).toBeGreaterThan(0)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.trainedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.evaluation.balancedAccuracy).not.toBeNull()
  }, 60000)

  it('trains on the plain feature vector by default', async () => {
    const result = await runTraining(datasetOf(8), FAST)

    expect(result.featureCount).toBe(FEATURE_COUNT)
    expect(result.tasteProfile).toBeNull()
  }, 60000)

  it('widens the model with the taste features and reports the profile', async () => {
    const result = await runTraining(datasetOf(8), { ...FAST, useTasteFeatures: true })

    expect(result.featureCount).toBe(FEATURE_COUNT + 2)
    expect(result.tasteProfile.liked).toHaveLength(FEATURE_COUNT)
    expect(result.tasteProfile.disliked).toHaveLength(FEATURE_COUNT)
  }, 60000)

  it('skips the evaluation when asked to', async () => {
    const result = await runTraining(datasetOf(8), FAST)

    expect(result.evaluation).toBeNull()
  }, 60000)
})
