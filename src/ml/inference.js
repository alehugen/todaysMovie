import { MODEL_STORAGE_URL, loadSavedModel, predictScores } from './model'

let cachedModel = null
let cachedModelUrl = null

export function forgetModel() {
  cachedModel?.dispose()
  cachedModel = null
  cachedModelUrl = null
}

export async function getModel(modelUrl = MODEL_STORAGE_URL) {
  if (cachedModel && cachedModelUrl === modelUrl) return cachedModel

  forgetModel()
  cachedModel = await loadSavedModel(modelUrl)
  cachedModelUrl = cachedModel ? modelUrl : null

  return cachedModel
}

export async function scoreFeatureMatrix(features, { modelUrl = MODEL_STORAGE_URL } = {}) {
  if (!features || features.length === 0) return []

  const model = await getModel(modelUrl)
  if (!model) throw new Error('There is no trained model yet.')

  return predictScores(model, features)
}
