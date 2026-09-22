/**
 * OPTIONAL — TASTE CENTROID FEATURES (implemented, measured, disabled)
 *
 * The idea, borrowed from classic content-based recommenders: represent the user
 * by the AVERAGE of the feature vectors of the movies they liked, and by a second
 * average for the ones they rejected. Every candidate then gets two extra numbers —
 * how close it is to each centroid.
 *
 *     liked:     [Interstellar] [Arrival] [Ex Machina]
 *                       ↓ mean, component by component
 *     centroid:  [0, 0.3, 1, 0, …, 0.82, 0.71]
 *
 *     candidate: Blade Runner 2049  →  similarity to liked centroid = 0.91
 *                                      similarity to disliked centroid = 0.22
 *
 * MEASURED RESULT: +0.4 pp balanced accuracy, i.e. indistinguishable from noise.
 * Disabled via `USE_TASTE_FEATURES` in `trainingRunner.js`.
 *
 * WHY IT DID NOT HELP: the centroid summarises the SAME 20 features the network
 * already receives, and a dense hidden layer can learn combinations of them by
 * construction — including "resembles the pattern that usually gets label 1".
 * Feature engineering that repackages information the model already has adds
 * dimensions without adding signal, and dimensions are expensive with 20 examples.
 *
 * Where this technique genuinely pays off is high-dimensional sparse input — item
 * IDs, text embeddings, thousands of one-hot categories — where the network cannot
 * learn a notion of "similar" on its own.
 *
 * The file is kept because the two leakage traps it handles are the interesting
 * part, and both are guarded by tests.
 */

export const TASTE_FEATURE_NAMES = ['similarityToLiked', 'similarityToDisliked']
export const TASTE_FEATURE_COUNT = TASTE_FEATURE_NAMES.length
export const NEUTRAL_SIMILARITY = 0.5

/**
 * Cosine similarity: the angle between two vectors, ignoring their length.
 *
 *     cos(a, b) = (a · b) / (‖a‖ × ‖b‖)
 *
 * Direction rather than distance is what matters here. A long, famous movie has
 * large values in `runtime` and `logVotes`, so its Euclidean distance to everything
 * is large even when it is the same KIND of movie. Cosine asks "do these point the
 * same way?" instead of "are these close together?".
 *
 * Returns 0 rather than NaN for a zero vector, which happens when a plot has no
 * vocabulary terms in it.
 */
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

/**
 * Builds both centroids. `skipIndex` excludes one example — see `augmentTrainingSet`.
 * A centroid is `null` when its class has no examples, and callers fall back to a
 * neutral 0.5 rather than inventing a similarity.
 */
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

/**
 * Inference path. The `profile` passed in was built elsewhere — inside
 * cross-validation it comes from the TRAINING fold only, which is leakage trap #1:
 * a centroid built over all the data carries the test fold's labels into the
 * feature, and the model would be reading the answer it is supposed to predict.
 *
 * `sources` lets the similarity be computed over a different vector space than the
 * one being augmented — that is how plot TF-IDF vectors plug into the same machinery.
 */
export function augmentCandidates(features, profile, sources = null) {
  const similaritySources = sources ?? features

  return features.map((vector, index) => [
    ...vector,
    ...tasteFeatures(similaritySources[index], profile),
  ])
}

/**
 * Training path, and leakage trap #2 — the subtle one.
 *
 * A liked movie is PART of the liked centroid, so its similarity to that centroid
 * is inflated: it is partly comparing itself to itself. The problem is not the high
 * value, it is the INCONSISTENCY — at inference time a candidate belongs to no
 * centroid, so the model would learn on one distribution and be used on another.
 *
 * The fix is a leave-one-out centroid: one centroid per row, each excluding its own
 * row. O(n²), which is irrelevant for 20 to 60 examples.
 *
 * Guarded by the test `never lets a movie help build its own centroid`.
 */
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
