import * as tf from '@tensorflow/tfjs'

import { FEATURE_COUNT } from './features'
import { augmentCandidates, augmentTrainingSet, buildTasteProfile } from './taste'

export const MODEL_STORAGE_URL = 'indexeddb://todaysmovie-model'

export const DEFAULT_TRAINING_OPTIONS = {
  hiddenUnits: 16,
  l2: 0.001,
  dropout: 0.15,
  learningRate: 0.01,
  epochs: 200,
  batchSize: 8,
  patience: 25,
  validationSplit: 0.2,
  minSamplesForValidation: 16,
}

export function createModel({
  inputSize = FEATURE_COUNT,
  hiddenUnits = DEFAULT_TRAINING_OPTIONS.hiddenUnits,
  l2 = DEFAULT_TRAINING_OPTIONS.l2,
  dropout = DEFAULT_TRAINING_OPTIONS.dropout,
  learningRate = DEFAULT_TRAINING_OPTIONS.learningRate,
  seed,
} = {}) {
  const model = tf.sequential()
  const layerSizes = Array.isArray(hiddenUnits) ? hiddenUnits : [hiddenUnits]

  layerSizes.forEach((units, index) => {
    model.add(
      tf.layers.dense({
        ...(index === 0 ? { inputShape: [inputSize] } : {}),
        units,
        activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2 }),
        kernelInitializer: tf.initializers.glorotUniform({ seed }),
      }),
    )

    model.add(tf.layers.dropout({ rate: dropout, seed }))
  })

  model.add(
    tf.layers.dense({
      units: 1,
      activation: 'sigmoid',
      kernelInitializer: tf.initializers.glorotUniform({ seed }),
    }),
  )

  model.compile({
    optimizer: tf.train.adam(learningRate),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  })

  return model
}

export function computeClassWeight(labels) {
  const positives = labels.filter((label) => label === 1).length
  const negatives = labels.length - positives
  if (positives === 0 || negatives === 0) return undefined

  return {
    0: labels.length / (2 * negatives),
    1: labels.length / (2 * positives),
  }
}

export function shuffleDataset({ features, labels }, random = Math.random) {
  const order = features.map((_, index) => index)

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const temporary = order[index]
    order[index] = order[swapIndex]
    order[swapIndex] = temporary
  }

  return {
    features: order.map((index) => features[index]),
    labels: order.map((index) => labels[index]),
  }
}

export async function trainModel(dataset, options = {}) {
  const settings = { ...DEFAULT_TRAINING_OPTIONS, ...options }
  const { random = Math.random, onEpochEnd, model: providedModel, seed } = options

  if (dataset.labels.length === 0) throw new Error('Cannot train on an empty dataset.')

  const shuffled = shuffleDataset(dataset, random)
  const useValidation = shuffled.labels.length >= settings.minSamplesForValidation

  const model =
    providedModel ?? createModel({ ...settings, inputSize: shuffled.features[0].length, seed })

  const inputs = tf.tensor2d(shuffled.features)
  const targets = tf.tensor2d(shuffled.labels, [shuffled.labels.length, 1])

  const callbacks = []
  let bestValidationLoss = Number.POSITIVE_INFINITY
  let bestWeights = null
  let epochsWithoutImprovement = 0

  if (useValidation) {
    callbacks.push({
      onEpochEnd: (_epoch, logs) => {
        const validationLoss = logs?.val_loss
        if (!Number.isFinite(validationLoss)) return

        if (validationLoss < bestValidationLoss) {
          bestValidationLoss = validationLoss
          epochsWithoutImprovement = 0
          bestWeights?.forEach((weight) => weight.dispose())
          bestWeights = model.getWeights().map((weight) => weight.clone())
          return
        }

        epochsWithoutImprovement += 1
        if (epochsWithoutImprovement >= settings.patience) model.stopTraining = true
      },
    })
  }

  if (onEpochEnd) callbacks.push({ onEpochEnd })

  try {
    const history = await model.fit(inputs, targets, {
      epochs: settings.epochs,
      batchSize: Math.min(settings.batchSize, shuffled.labels.length),
      shuffle: true,
      validationSplit: useValidation ? settings.validationSplit : 0,
      classWeight: computeClassWeight(shuffled.labels),
      callbacks,
      verbose: 0,
    })

    if (bestWeights) model.setWeights(bestWeights)

    return {
      model,
      epochsRun: history.epoch.length,
      bestValidationLoss: Number.isFinite(bestValidationLoss) ? bestValidationLoss : null,
      usedValidation: useValidation,
      finalLoss: history.history.loss.at(-1),
      finalAccuracy: history.history.acc?.at(-1) ?? history.history.accuracy?.at(-1) ?? null,
      finalValidationLoss: history.history.val_loss?.at(-1) ?? null,
    }
  } finally {
    bestWeights?.forEach((weight) => weight.dispose())
    inputs.dispose()
    targets.dispose()
  }
}

export function predictScores(model, featureMatrix) {
  if (featureMatrix.length === 0) return []

  return tf.tidy(() => {
    const inputs = tf.tensor2d(featureMatrix)
    const outputs = model.predict(inputs)
    return Array.from(outputs.dataSync())
  })
}

export function stratifiedFolds(labels, foldCount, random = null) {
  const folds = Array.from({ length: foldCount }, () => [])
  const byClass = { 0: [], 1: [] }

  labels.forEach((label, index) => byClass[label].push(index))

  let cursor = 0
  for (const indices of [byClass[1], byClass[0]]) {
    const ordered = random ? shuffleIndices(indices, random) : indices

    for (const index of ordered) {
      folds[cursor % foldCount].push(index)
      cursor += 1
    }
  }

  return folds
}

function shuffleIndices(indices, random) {
  const result = [...indices]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const temporary = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = temporary
  }

  return result
}

export async function crossValidate(
  dataset,
  { folds = 4, repeats = 3, random = Math.random, similarity = 'none', ...options } = {},
) {
  const foldCount = Math.min(folds, dataset.labels.length)
  if (foldCount < 2) return emptyEvaluation()

  const similaritySources = pickSimilaritySources(dataset, similarity)
  const confusion = { truePositives: 0, trueNegatives: 0, falsePositives: 0, falseNegatives: 0 }
  const partitions = []

  for (let repeat = 0; repeat < Math.max(1, repeats); repeat += 1) {
    partitions.push(...stratifiedFolds(dataset.labels, foldCount, repeat === 0 ? null : random))
  }

  for (const testIndices of partitions) {
    if (testIndices.length === 0) continue

    const testSet = new Set(testIndices)
    const trainIndices = dataset.labels.map((_, index) => index).filter((i) => !testSet.has(i))
    const trainLabels = trainIndices.map((i) => dataset.labels[i])
    if (new Set(trainLabels).size < 2) continue

    const foldTraining = {
      features: trainIndices.map((i) => dataset.features[i]),
      labels: trainLabels,
    }
    const foldTesting = testIndices.map((i) => dataset.features[i])

    const trainSources = similaritySources ? trainIndices.map((i) => similaritySources[i]) : null
    const testSources = similaritySources ? testIndices.map((i) => similaritySources[i]) : null

    const { model } = await trainModel(
      trainSources ? augmentTrainingSet(foldTraining, trainSources) : foldTraining,
      { ...options, minSamplesForValidation: Number.POSITIVE_INFINITY },
    )

    const scores = predictScores(
      model,
      testSources
        ? augmentCandidates(
            foldTesting,
            buildTasteProfile(trainSources, trainLabels),
            testSources,
          )
        : foldTesting,
    )

    scores.forEach((score, position) => {
      const predicted = score >= 0.5 ? 1 : 0
      const actual = dataset.labels[testIndices[position]]

      if (actual === 1 && predicted === 1) confusion.truePositives += 1
      else if (actual === 1) confusion.falseNegatives += 1
      else if (predicted === 1) confusion.falsePositives += 1
      else confusion.trueNegatives += 1
    })

    model.dispose()
  }

  return summarizeEvaluation(confusion, foldCount, Math.max(1, repeats))
}

export function pickSimilaritySources(dataset, similarity) {
  if (similarity === 'taste') return dataset.features
  if (similarity === 'plot') return dataset.plotVectors ?? null
  return null
}

function emptyEvaluation() {
  return {
    folds: 0,
    evaluated: 0,
    accuracy: null,
    balancedAccuracy: null,
    recallPositive: null,
    recallNegative: null,
    majorityBaseline: null,
    confusion: null,
  }
}

function summarizeEvaluation(confusion, foldCount, repeats = 1) {
  const { truePositives, trueNegatives, falsePositives, falseNegatives } = confusion
  const evaluated = truePositives + trueNegatives + falsePositives + falseNegatives
  if (evaluated === 0) return emptyEvaluation()

  const actualPositives = truePositives + falseNegatives
  const actualNegatives = trueNegatives + falsePositives

  const recallPositive = actualPositives > 0 ? truePositives / actualPositives : null
  const recallNegative = actualNegatives > 0 ? trueNegatives / actualNegatives : null

  return {
    folds: foldCount,
    repeats,
    evaluated,
    accuracy: (truePositives + trueNegatives) / evaluated,
    balancedAccuracy:
      recallPositive !== null && recallNegative !== null
        ? (recallPositive + recallNegative) / 2
        : null,
    recallPositive,
    recallNegative,
    majorityBaseline: Math.max(actualPositives, actualNegatives) / evaluated,
    confusion,
  }
}

export async function saveModel(model, url = MODEL_STORAGE_URL) {
  await model.save(url)
}

export async function loadSavedModel(url = MODEL_STORAGE_URL) {
  try {
    return await tf.loadLayersModel(url)
  } catch {
    return null
  }
}

export async function deleteSavedModel(url = MODEL_STORAGE_URL) {
  try {
    await tf.io.removeModel(url)
  } catch {
    // there was nothing saved
  }
}
