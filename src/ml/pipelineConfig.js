/**
 * PIPELINE SHAPE — the one thing the UI needs to know about the model.
 *
 * This module exists purely to keep TensorFlow.js off the main thread. The view
 * has to know how wide a feature vector is, to detect that a saved model no longer
 * matches the current pipeline and force a retrain. Importing that constant from
 * `trainingRunner.js` would drag in `model.js` and therefore all ~1.6 MB of
 * TensorFlow.js into the main bundle — defeating the entire point of the worker.
 *
 * Nothing here may import `model.js`, `inference.js` or `@tensorflow/tfjs`.
 */

import { FEATURE_COUNT } from './features'
import { TASTE_FEATURE_COUNT } from './taste'

/**
 * Taste-centroid features: implemented, measured (+0.4 pp, i.e. noise), disabled.
 * See `taste.js` for what they do and why they did not help.
 */
export const USE_TASTE_FEATURES = false

// Single source of truth for the width of a feature vector, shared by the trainer
// and by the UI's "is the saved model still valid?" check.
export const PIPELINE_FEATURE_COUNT =
  FEATURE_COUNT + (USE_TASTE_FEATURES ? TASTE_FEATURE_COUNT : 0)
