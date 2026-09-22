import { describe, expect, it } from 'vitest'

import {
  NEUTRAL_SIMILARITY,
  TASTE_FEATURE_COUNT,
  augmentCandidates,
  augmentTrainingSet,
  buildTasteProfile,
  cosineSimilarity,
  tasteFeatures,
} from './taste'

const SCIFI = [1, 0, 0, 0.8]
const SCIFI_TWIN = [1, 0, 0, 0.7]
const COMEDY = [0, 1, 0, 0.3]
const COMEDY_TWIN = [0, 1, 0, 0.4]

const DATASET = {
  features: [SCIFI, SCIFI_TWIN, COMEDY, COMEDY_TWIN],
  labels: [1, 1, 0, 0],
}

describe('cosineSimilarity', () => {
  it('is 1 for identical directions', () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6)
  })

  it('is 0 for vectors that share nothing', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6)
  })

  it('returns 0 instead of NaN for an all-zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0)
  })

  it('never leaves the 0..1 range for non-negative vectors', () => {
    expect(cosineSimilarity([0.4, 0.9], [0.8, 0.1])).toBeGreaterThanOrEqual(0)
    expect(cosineSimilarity([0.4, 0.9], [0.8, 0.1])).toBeLessThanOrEqual(1)
  })
})

describe('buildTasteProfile', () => {
  it('averages the liked and the disliked vectors separately', () => {
    const profile = buildTasteProfile(DATASET.features, DATASET.labels)

    expect(profile.liked.slice(0, 3)).toEqual([1, 0, 0])
    expect(profile.liked[3]).toBeCloseTo(0.75, 10)
    expect(profile.disliked.slice(0, 3)).toEqual([0, 1, 0])
    expect(profile.disliked[3]).toBeCloseTo(0.35, 10)
  })

  it('leaves a centroid null when that class has no examples', () => {
    const profile = buildTasteProfile([SCIFI, SCIFI_TWIN], [1, 1])

    expect(profile.liked).not.toBeNull()
    expect(profile.disliked).toBeNull()
  })

  it('can leave one example out, which is what training needs', () => {
    const withAll = buildTasteProfile(DATASET.features, DATASET.labels)
    const withoutFirst = buildTasteProfile(DATASET.features, DATASET.labels, { skipIndex: 0 })

    expect(withoutFirst.liked).toEqual([...SCIFI_TWIN])
    expect(withoutFirst.liked).not.toEqual(withAll.liked)
  })
})

describe('tasteFeatures', () => {
  const profile = buildTasteProfile(DATASET.features, DATASET.labels)

  it('scores a movie closer to what the viewer liked', () => {
    const [toLiked, toDisliked] = tasteFeatures(SCIFI, profile)

    expect(toLiked).toBeGreaterThan(toDisliked)
  })

  it('scores a movie closer to what the viewer rejected', () => {
    const [toLiked, toDisliked] = tasteFeatures(COMEDY, profile)

    expect(toDisliked).toBeGreaterThan(toLiked)
  })

  it('stays neutral when a centroid is missing', () => {
    expect(tasteFeatures(SCIFI, { liked: null, disliked: null })).toEqual([
      NEUTRAL_SIMILARITY,
      NEUTRAL_SIMILARITY,
    ])
  })
})

describe('augmentCandidates', () => {
  it('adds exactly two columns', () => {
    const profile = buildTasteProfile(DATASET.features, DATASET.labels)
    const augmented = augmentCandidates([SCIFI, COMEDY], profile)

    expect(augmented[0]).toHaveLength(SCIFI.length + TASTE_FEATURE_COUNT)
    expect(augmented[0].slice(0, SCIFI.length)).toEqual(SCIFI)
  })

  it('leaves the incoming vectors untouched', () => {
    augmentCandidates([SCIFI], buildTasteProfile(DATASET.features, DATASET.labels))

    expect(SCIFI).toEqual([1, 0, 0, 0.8])
  })
})

describe('augmentTrainingSet', () => {
  it('adds two columns to every row', () => {
    const augmented = augmentTrainingSet(DATASET)

    expect(augmented.features).toHaveLength(4)
    expect(augmented.features[0]).toHaveLength(SCIFI.length + TASTE_FEATURE_COUNT)
    expect(augmented.labels).toBe(DATASET.labels)
  })

  it('never lets a movie help build its own centroid', () => {
    const honest = augmentTrainingSet(DATASET).features[0].at(-2)

    const inflated = tasteFeatures(SCIFI, buildTasteProfile(DATASET.features, DATASET.labels))[0]

    expect(honest).toBeLessThan(inflated)
  })

  it('still separates liked from disliked after the leave-one-out correction', () => {
    const [likedRow, , dislikedRow] = augmentTrainingSet(DATASET).features

    expect(likedRow.at(-2)).toBeGreaterThan(likedRow.at(-1))
    expect(dislikedRow.at(-1)).toBeGreaterThan(dislikedRow.at(-2))
  })
})
