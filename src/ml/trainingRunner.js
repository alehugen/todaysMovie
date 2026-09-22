/**
 * STEP 3 OF THE PIPELINE — ORCHESTRATION
 *
 * The recipe that runs end to end: validate the dataset, measure how good the model
 * would be, train the real one, save it. It is a plain module with no Web Worker
 * API in it, which is deliberate — this is where all the logic lives so that
 * `trainer.worker.js` can stay an 18-line shell that is trivially correct.
 *
 * Order matters:
 *
 *   1. evaluate  → cross-validation trains k throwaway models to estimate quality
 *   2. train     → one final model on ALL the data
 *   3. save      → to IndexedDB, so the next visit scores without retraining
 *
 * Evaluation comes first because it answers "should the user trust this?", and the
 * answer must not be computed from the same model that is shipped.
 */

import {
  DEFAULT_TRAINING_OPTIONS,
  MODEL_STORAGE_URL,
  crossValidate,
  saveModel,
  trainModel,
} from './model'
import { USE_TASTE_FEATURES } from './pipelineConfig'
import { augmentTrainingSet, buildTasteProfile } from './taste'

// Reported to the UI so the progress bar can label what is happening.
export const TRAINING_PHASES = {
  evaluating: 'evaluating',
  training: 'training',
  saving: 'saving',
}

export const MIN_TRAINING_EXAMPLES = 4

/**
 * Refuses to train on a dataset that cannot teach anything, and says why in plain
 * language so the UI can show it directly.
 *
 * The last check is the important one: a classifier trained on a single class has
 * no gradient to learn from. It minimises the loss by always answering that class,
 * scores 100% on its own training data, and is completely useless. That is why the
 * questionnaire insists on at least one like and one dislike.
 */
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

  // Cross-validation must run with the SAME feature pipeline as the final model,
  // otherwise it measures something that will never be shipped.
  const similarity = useTasteFeatures ? 'taste' : 'none'

  if (evaluate) {
    onProgress({ phase: TRAINING_PHASES.evaluating, progress: 0 })
    evaluation = await crossValidate(dataset, { ...options, similarity })
  }

  const totalEpochs = options.epochs ?? DEFAULT_TRAINING_OPTIONS.epochs
  onProgress({ phase: TRAINING_PHASES.training, progress: 0 })

  // The final model may use ALL the data to build its centroids: at this point
  // there is no held-out set left to leak into.
  const tasteProfile = useTasteFeatures
    ? buildTasteProfile(dataset.features, dataset.labels)
    : null

  const trainingSet = useTasteFeatures ? augmentTrainingSet(dataset) : dataset

  const { model, epochsRun, usedValidation, finalLoss } = await trainModel(trainingSet, {
    ...options,
    // Each epoch reports back; in the worker this becomes a postMessage that
    // drives the progress bar on the main thread.
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
    // The model crosses the worker boundary as bytes in IndexedDB, never as an
    // object — a LayersModel is not structured-cloneable. Once saved, dispose it.
    model.dispose()
  }

  return {
    evaluation,
    epochsRun,
    usedValidation,
    finalLoss,
    tasteProfile,
    // Stored so inference can rebuild exactly the same input width later.
    featureCount: trainingSet.features[0].length,
    examples: dataset.labels.length,
    trainedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  }
}
