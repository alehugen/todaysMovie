export const CONFIDENCE_LEVELS = {
  unknown: 'unknown',
  low: 'low',
  fair: 'fair',
  good: 'good',
}

export const MIN_TRUSTWORTHY_ACCURACY = 0.58
export const GOOD_ACCURACY = 0.7
export const MIN_EVALUATED_EXAMPLES = 8

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
