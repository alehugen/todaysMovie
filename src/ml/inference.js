/**
 * STEP 4 OF THE PIPELINE — INFERENCE
 *
 * Loads the saved model and scores candidate movies. This runs inside the same
 * long-lived Web Worker as training, which is why the model is cached in memory
 * here: rebuilding its tensors from IndexedDB on every thumbs-up would be wasteful
 * when the user is interacting with the page.
 */

import { MODEL_STORAGE_URL, loadSavedModel, predictScores } from './model'

let cachedModel = null
let cachedModelUrl = null

/**
 * Drops the cached model and frees its tensors.
 *
 * This is called right after every training run, and forgetting to do so is a real
 * bug with no visible symptom: the user retrains, the new weights land in
 * IndexedDB, and the worker keeps scoring with the OLD model still in memory. The
 * recommendations simply never change, and nothing errors.
 */
export function forgetModel() {
  cachedModel?.dispose()
  cachedModel = null
  cachedModelUrl = null
}

export async function getModel(modelUrl = MODEL_STORAGE_URL) {
  if (cachedModel && cachedModelUrl === modelUrl) return cachedModel

  forgetModel()
  cachedModel = await loadSavedModel(modelUrl)
  // Only remember the URL if something was actually loaded, so a missing model is
  // retried on the next call instead of being cached as "nothing".
  cachedModelUrl = cachedModel ? modelUrl : null

  return cachedModel
}

/**
 * Scores a batch of feature vectors in a single forward pass.
 *
 * The vectors MUST come from the same `buildFeatureVector` used during training.
 * Producing them through a different path is how training/serving skew appears:
 * the model learns on one distribution and predicts on another, degrading quietly
 * with no error anywhere.
 */
export async function scoreFeatureMatrix(features, { modelUrl = MODEL_STORAGE_URL } = {}) {
  if (!features || features.length === 0) return []

  const model = await getModel(modelUrl)
  if (!model) throw new Error('There is no trained model yet.')

  return predictScores(model, features)
}
