/**
 * OPTIONAL — PLOT TEXT AS A FEATURE (implemented, measured, disabled)
 *
 * Genre is a coarse label: Interstellar and Alien are both Sci-Fi and have almost
 * nothing in common. The plot summary knows the difference, and OMDb returns it,
 * so this module turns that text into numbers the model can consume.
 *
 * TF-IDF (term frequency x inverse document frequency) is the classic way to do it
 * without downloading a language model:
 *
 *   - TERM FREQUENCY: how often a word appears in THIS plot.
 *   - INVERSE DOCUMENT FREQUENCY: how rare that word is across ALL plots.
 *
 * Multiplying them means a word only scores highly when it is frequent here AND
 * unusual elsewhere. "the" appears everywhere and carries no information; "wormhole"
 * appears rarely and says a lot.
 *
 * The resulting vectors feed the same centroid machinery as `taste.js`, producing
 * two extra features: similarity to the plots the user liked and to the ones they
 * rejected.
 *
 * MEASURED RESULT: +2.2 / +1.1 / -0.4 pp depending on dataset size — and the
 * benchmark behind those numbers was UNDER-POWERED. The synthetic taste signal it
 * planted in the plots was present in only 19 of 182 movies, so a 16-movie sample
 * contained one or two examples of it. The result is therefore INCONCLUSIVE rather
 * than negative, and the feature stays off until a better experiment settles it.
 *
 * Sentence embeddings (Universal Sentence Encoder) would extract far more from the
 * same text, at the cost of a ~25 MB model downloaded at runtime — a hard network
 * dependency in an app whose selling point is that everything runs locally.
 */

// Words that appear in almost every plot carry no discriminative power. Dropping
// them keeps the vocabulary focused on what actually distinguishes one film from
// another. The last few are domain-specific noise from synopsis writing style.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'his', 'her', 'their', 'who', 'that', 'this', 'from', 'into',
  'has', 'have', 'had', 'are', 'was', 'were', 'been', 'but', 'not', 'they', 'them', 'him',
  'she', 'you', 'your', 'our', 'its', 'out', 'off', 'all', 'one', 'two', 'after', 'before',
  'when', 'where', 'while', 'what', 'which', 'how', 'why', 'must', 'will', 'can', 'may',
  'over', 'under', 'than', 'then', 'there', 'here', 'more', 'most', 'some', 'any', 'own',
  'about', 'against', 'between', 'through', 'during', 'himself', 'herself', 'themselves',
  'film', 'movie', 'story', 'tells',
])

export const DEFAULT_VOCABULARY_OPTIONS = {
  maxTerms: 300,
  minDocumentFrequency: 3,
  maxDocumentRatio: 0.4,
}

// Lowercase, strip punctuation, drop stopwords and anything shorter than three
// characters. Returns an empty list — never throws — for missing or non-string input.
export function tokenizePlot(text) {
  if (typeof text !== 'string') return []

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

/**
 * Chooses which words become dimensions.
 *
 * Two filters, at opposite ends, and both matter:
 *   - `minDocumentFrequency` drops words appearing in too few plots, which would
 *     act as an identifier for one movie rather than a shared concept.
 *   - `maxDocumentRatio` drops words appearing in too many, which separate nothing.
 *
 * `maxTerms` caps the dimensionality, because every term is a dimension and the
 * training set is tiny.
 *
 * Note this is UNSUPERVISED — it only reads the text, never the labels — so
 * building the vocabulary over the whole catalog causes no leakage.
 */
export function buildPlotVocabulary(movies, options = {}) {
  const { maxTerms, minDocumentFrequency, maxDocumentRatio } = {
    ...DEFAULT_VOCABULARY_OPTIONS,
    ...options,
  }

  const documentFrequency = new Map()
  let documents = 0

  for (const movie of movies) {
    const terms = new Set(tokenizePlot(movie?.plot))
    if (terms.size === 0) continue

    documents += 1
    for (const term of terms) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1)
    }
  }

  const kept = [...documentFrequency.entries()]
    .filter(([, frequency]) => frequency >= minDocumentFrequency)
    .filter(([, frequency]) => frequency <= documents * maxDocumentRatio)
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, maxTerms)

  return {
    terms: kept.map(([term]) => term),
    index: new Map(kept.map(([term], position) => [term, position])),
    inverseDocumentFrequency: kept.map(([, frequency]) => Math.log(documents / frequency)),
    documents,
  }
}

/**
 * Turns one plot into a TF-IDF vector aligned with the vocabulary.
 *
 * Term frequency is divided by the plot length so that a long synopsis does not
 * outweigh a short one purely by repetition, then multiplied by the term's IDF.
 * Words outside the vocabulary are ignored; a missing plot yields all zeros, which
 * cosine similarity handles by returning 0 rather than NaN.
 */
export function vectorizePlot(plot, vocabulary) {
  const vector = new Array(vocabulary.terms.length).fill(0)
  const tokens = tokenizePlot(plot)
  if (tokens.length === 0) return vector

  const counts = new Map()
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)

  for (const [term, count] of counts) {
    const position = vocabulary.index.get(term)
    if (position === undefined) continue

    vector[position] = (count / tokens.length) * vocabulary.inverseDocumentFrequency[position]
  }

  return vector
}

export function vectorizePlots(movies, vocabulary) {
  return movies.map((movie) => vectorizePlot(movie?.plot, vocabulary))
}
