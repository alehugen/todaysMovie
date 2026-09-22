import {
  DEFAULT_TRAINING_OPTIONS,
  MODEL_STORAGE_URL,
  crossValidate,
  saveModel,
  trainModel,
} from './model'
import { FEATURE_COUNT } from './features'
import { TASTE_FEATURE_COUNT, augmentTrainingSet, buildTasteProfile } from './taste'

export const TRAINING_PHASES = {
  evaluating: 'evaluating',
  training: 'training',
  saving: 'saving',
}

export const MIN_TRAINING_EXAMPLES = 4

export const USE_TASTE_FEATURES = false

export const PIPELINE_FEATURE_COUNT =
  FEATURE_COUNT + (USE_TASTE_FEATURES ? TASTE_FEATURE_COUNT : 0)

export function describeDatasetProblem(dataset) {
  const labels = dataset?.labels ?? []

  if (labels.length === 0) return 'There is nothing to train on yet.'
  if (labels.length < MIN_TRAINING_EXAMPLES) {
    return `Rate at least ${MIN_TRAINING_EXAMPLES} movies before training.`
  }
  if (new Set(labels).size < 2) {
    return 'Training needs at least one liked and one disliked movie.'
  }

  return null
}

export async function runTraining(
  dataset,
  {
    onProgress = () => {},
    modelUrl = MODEL_STORAGE_URL,
    evaluate = true,
    useTasteFeatures = USE_TASTE_FEATURES,
    ...options
  } = {},
) {
  const problem = describeDatasetProblem(dataset)
  if (problem) throw new Error(problem)

  const startedAt = Date.now()
  let evaluation = null

  if (evaluate) {
    onProgress({ phase: TRAINING_PHASES.evaluating, progress: 0 })
    evaluation = await crossValidate(dataset, { ...options, useTasteFeatures })
  }

  const totalEpochs = options.epochs ?? DEFAULT_TRAINING_OPTIONS.epochs
  onProgress({ phase: TRAINING_PHASES.training, progress: 0 })

  const tasteProfile = useTasteFeatures
    ? buildTasteProfile(dataset.features, dataset.labels)
    : null

  const trainingSet = useTasteFeatures ? augmentTrainingSet(dataset) : dataset

  const { model, epochsRun, usedValidation, finalLoss } = await trainModel(trainingSet, {
    ...options,
    onEpochEnd: (epoch) =>
      onProgress({
        phase: TRAINING_PHASES.training,
        progress: Math.min(1, (epoch + 1) / totalEpochs),
      }),
  })

  onProgress({ phase: TRAINING_PHASES.saving, progress: 1 })

  try {
    await saveModel(model, modelUrl)
  } finally {
    model.dispose()
  }

  return {
    evaluation,
    epochsRun,
    usedValidation,
    finalLoss,
    tasteProfile,
    featureCount: trainingSet.features[0].length,
    examples: dataset.labels.length,
    trainedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  }
}
