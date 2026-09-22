import { describe, expect, it } from 'vitest'

import { buildPlotVocabulary, tokenizePlot, vectorizePlot, vectorizePlots } from './plotText'

const MOVIES = [
  { plot: 'A lonely astronaut fights to survive alone on a hostile planet.' },
  { plot: 'An astronaut crew travels through a wormhole to survive a dying Earth.' },
  { plot: 'A detective hunts a killer through the rainy streets of the city.' },
  { plot: 'A detective and a killer share a long night in the city.' },
  { plot: 'A family moves to a quiet town and finds something in the basement.' },
]

describe('tokenizePlot', () => {
  it('lowercases and drops punctuation', () => {
    expect(tokenizePlot('Hostile, Planet!')).toEqual(['hostile', 'planet'])
  })

  it('drops stopwords and very short words', () => {
    expect(tokenizePlot('the astronaut and his ship')).toEqual(['astronaut', 'ship'])
  })

  it('returns an empty list for missing text', () => {
    expect(tokenizePlot(null)).toEqual([])
    expect(tokenizePlot(undefined)).toEqual([])
    expect(tokenizePlot(42)).toEqual([])
  })
})

describe('buildPlotVocabulary', () => {
  it('keeps only terms that appear in enough plots', () => {
    const vocabulary = buildPlotVocabulary(MOVIES, { minDocumentFrequency: 2, maxDocumentRatio: 1 })

    expect(vocabulary.terms).toContain('astronaut')
    expect(vocabulary.terms).toContain('detective')
    expect(vocabulary.terms).not.toContain('basement')
  })

  it('drops terms that appear in almost every plot', () => {
    const everywhere = MOVIES.map((movie) => ({ plot: `${movie.plot} cinema cinema` }))
    const vocabulary = buildPlotVocabulary(everywhere, {
      minDocumentFrequency: 1,
      maxDocumentRatio: 0.5,
    })

    expect(vocabulary.terms).not.toContain('cinema')
  })

  it('caps the vocabulary size', () => {
    const vocabulary = buildPlotVocabulary(MOVIES, { minDocumentFrequency: 1, maxTerms: 3 })

    expect(vocabulary.terms).toHaveLength(3)
  })

  it('gives rarer terms a higher inverse document frequency', () => {
    const vocabulary = buildPlotVocabulary(MOVIES, { minDocumentFrequency: 1, maxDocumentRatio: 1 })
    const idfOf = (term) => vocabulary.inverseDocumentFrequency[vocabulary.index.get(term)]

    expect(idfOf('basement')).toBeGreaterThan(idfOf('detective'))
  })

  it('ignores movies without a plot', () => {
    const vocabulary = buildPlotVocabulary([...MOVIES, { plot: null }, {}], {
      minDocumentFrequency: 1,
    })

    expect(vocabulary.documents).toBe(MOVIES.length)
  })
})

describe('vectorizePlot', () => {
  const vocabulary = buildPlotVocabulary(MOVIES, { minDocumentFrequency: 1, maxDocumentRatio: 1 })

  it('produces one number per vocabulary term', () => {
    expect(vectorizePlot(MOVIES[0].plot, vocabulary)).toHaveLength(vocabulary.terms.length)
  })

  it('lights up only the terms the plot actually contains', () => {
    const vector = vectorizePlot('A lonely astronaut.', vocabulary)

    expect(vector[vocabulary.index.get('astronaut')]).toBeGreaterThan(0)
    expect(vector[vocabulary.index.get('detective')]).toBe(0)
  })

  it('returns all zeros for a missing plot instead of NaN', () => {
    const vector = vectorizePlot(null, vocabulary)

    expect(vector.every((value) => value === 0)).toBe(true)
  })

  it('ignores words outside the vocabulary', () => {
    const vector = vectorizePlot('zebra xylophone', vocabulary)

    expect(vector.every((value) => value === 0)).toBe(true)
  })

  it('gives two similar plots vectors that overlap', () => {
    const [first, second] = vectorizePlots(MOVIES.slice(0, 2), vocabulary)
    const overlap = first.filter((value, index) => value > 0 && second[index] > 0)

    expect(overlap.length).toBeGreaterThan(0)
  })
})
