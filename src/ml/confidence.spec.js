import { describe, expect, it } from 'vitest'

import { CONFIDENCE_LEVELS, describeModelConfidence } from './confidence'

const summaryWith = (balancedAccuracy, evaluated = 20) => ({
  evaluation: { balancedAccuracy, evaluated },
})

describe('describeModelConfidence', () => {
  it('admits it knows nothing when there is no evaluation', () => {
    const confidence = describeModelConfidence(null)

    expect(confidence.level).toBe(CONFIDENCE_LEVELS.unknown)
    expect(confidence.trustworthy).toBe(false)
  })

  it('admits it knows nothing when too few examples were evaluated', () => {
    expect(describeModelConfidence(summaryWith(0.9, 4)).level).toBe(CONFIDENCE_LEVELS.unknown)
  })

  it('flags a model that is barely better than a coin flip', () => {
    const confidence = describeModelConfidence(summaryWith(0.52))

    expect(confidence.level).toBe(CONFIDENCE_LEVELS.low)
    expect(confidence.trustworthy).toBe(false)
    expect(confidence.needsAttention).toBe(true)
  })

  it('accepts a middling model without nagging the user', () => {
    const confidence = describeModelConfidence(summaryWith(0.66))

    expect(confidence.level).toBe(CONFIDENCE_LEVELS.fair)
    expect(confidence.trustworthy).toBe(true)
    expect(confidence.needsAttention).toBe(false)
  })

  it('treats the measured working range as acceptable, not as a problem', () => {
    for (const accuracy of [0.6, 0.65, 0.7, 0.78]) {
      expect(describeModelConfidence(summaryWith(accuracy)).needsAttention).toBe(false)
    }
  })

  it('is happy with a genuinely good model', () => {
    const confidence = describeModelConfidence(summaryWith(0.81))
    expect(confidence.needsAttention).toBe(false)

    expect(confidence.level).toBe(CONFIDENCE_LEVELS.good)
    expect(confidence.trustworthy).toBe(true)
  })

  it('reports the accuracy it judged by', () => {
    expect(describeModelConfidence(summaryWith(0.74)).accuracy).toBe(0.74)
  })
})
