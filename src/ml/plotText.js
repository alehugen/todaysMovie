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

export function tokenizePlot(text) {
  if (typeof text !== 'string') return []

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

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
