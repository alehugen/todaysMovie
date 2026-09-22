export const TASTE_FEATURE_NAMES = ['similarityToLiked', 'similarityToDisliked']
export const TASTE_FEATURE_COUNT = TASTE_FEATURE_NAMES.length
export const NEUTRAL_SIMILARITY = 0.5

export function cosineSimilarity(first, second) {
  let dotProduct = 0
  let firstNorm = 0
  let secondNorm = 0

  for (let index = 0; index < first.length; index += 1) {
    dotProduct += first[index] * second[index]
    firstNorm += first[index] * first[index]
    secondNorm += second[index] * second[index]
  }

  const magnitude = Math.sqrt(firstNorm) * Math.sqrt(secondNorm)
  return magnitude === 0 ? 0 : Math.min(1, Math.max(0, dotProduct / magnitude))
}

function centroidOf(vectors) {
  if (vectors.length === 0) return null

  const sum = new Array(vectors[0].length).fill(0)
  for (const vector of vectors) {
    for (let index = 0; index < vector.length; index += 1) sum[index] += vector[index]
  }

  return sum.map((total) => total / vectors.length)
}

export function buildTasteProfile(features, labels, { skipIndex = -1 } = {}) {
  const liked = []
  const disliked = []

  features.forEach((vector, index) => {
    if (index === skipIndex) return
    if (labels[index] === 1) liked.push(vector)
    else disliked.push(vector)
  })

  return { liked: centroidOf(liked), disliked: centroidOf(disliked) }
}

export function tasteFeatures(vector, profile) {
  return [
    profile?.liked ? cosineSimilarity(vector, profile.liked) : NEUTRAL_SIMILARITY,
    profile?.disliked ? cosineSimilarity(vector, profile.disliked) : NEUTRAL_SIMILARITY,
  ]
}

export function augmentCandidates(features, profile, sources = null) {
  const similaritySources = sources ?? features

  return features.map((vector, index) => [
    ...vector,
    ...tasteFeatures(similaritySources[index], profile),
  ])
}

export function augmentTrainingSet({ features, labels }, sources = null) {
  const similaritySources = sources ?? features

  return {
    features: features.map((vector, index) => [
      ...vector,
      ...tasteFeatures(
        similaritySources[index],
        buildTasteProfile(similaritySources, labels, { skipIndex: index }),
      ),
    ]),
    labels,
  }
}
