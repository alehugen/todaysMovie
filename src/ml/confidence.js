/**
 * STEP 7 OF THE PIPELINE — HOW MUCH TO TRUST THE MODEL
 *
 * Object detectors do not report every box they compute: below a confidence
 * threshold they stay silent, because a wrong detection asserted confidently is
 * worse than no detection. The same applies to a recommender.
 *
 * This module turns the cross-validation result into something the interface can
 * say out loud, and decides when the user should be nudged to rate more.
 *
 * The thresholds below were CALIBRATED FROM MEASUREMENTS, not guessed. The measured
 * working range of this model is 60–78% balanced accuracy. An earlier version used
 * "below 60% means it is guessing", which labelled the model's normal behaviour as
 * a failure and nagged the user constantly.
 */

export const CONFIDENCE_LEVELS = {
  unknown: 'unknown',
  low: 'low',
  fair: 'fair',
  good: 'good',
}

export const MIN_TRUSTWORTHY_ACCURACY = 0.58
export const GOOD_ACCURACY = 0.7

// Below this many predictions, the quality estimate is itself too noisy to report.
export const MIN_EVALUATED_EXAMPLES = 8

/**
 * Note that `unknown` is not the same as `low`.
 *
 * "The model is bad" and "I cannot tell yet whether the model is bad" are different
 * statements, and conflating them is a small act of dishonesty toward the user. A
 * model reporting 90% from four predictions is not a good model — it is an
 * unmeasured one.
 *
 * `needsAttention` is what the UI reads: only `unknown` and `low` raise a visible
 * warning. Everything inside the normal working range is reported as a quiet fact
 * instead of a demand for more ratings.
 */
export function describeModelConfidence(summary) {
  const evaluation = summary?.evaluation ?? null
  const balancedAccuracy = evaluation?.balancedAccuracy ?? null
  const evaluated = evaluation?.evaluated ?? 0

  if (balancedAccuracy === null || evaluated < MIN_EVALUATED_EXAMPLES) {
    return {
      level: CONFIDENCE_LEVELS.unknown,
      trustworthy: false,
      needsAttention: true,
      accuracy: balancedAccuracy,
      message: 'Rate a few movies so the model has something to learn from.',
    }
  }

  if (balancedAccuracy < MIN_TRUSTWORTHY_ACCURACY) {
    return {
      level: CONFIDENCE_LEVELS.low,
      trustworthy: false,
      needsAttention: true,
      accuracy: balancedAccuracy,
      message: 'Still figuring out your taste — rating a few more would help a lot.',
    }
  }

  if (balancedAccuracy < GOOD_ACCURACY) {
    return {
      level: CONFIDENCE_LEVELS.fair,
      trustworthy: true,
      needsAttention: false,
      accuracy: balancedAccuracy,
      message: 'Picking well and still improving.',
    }
  }

  return {
    level: CONFIDENCE_LEVELS.good,
    trustworthy: true,
    needsAttention: false,
    accuracy: balancedAccuracy,
    message: 'Dialled in to your taste.',
  }
}
