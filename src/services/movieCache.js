const DATABASE_NAME = 'todaysmovie'
const DATABASE_VERSION = 1
const STORE_NAME = 'movies'

export const MOVIE_DETAILS_TTL_MS = 24 * 60 * 60 * 1000

let databasePromise = null

function openDatabase() {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'imdbId' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return databasePromise
}

async function runTransaction(mode, handler) {
  const database = await openDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)

    let outcome
    handler(store, (value) => {
      outcome = value
    })

    transaction.oncomplete = () => resolve(outcome)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

const isFresh = (entry, maxAgeMs) =>
  Boolean(entry) && Number.isFinite(entry.cachedAt) && Date.now() - entry.cachedAt < maxAgeMs

export async function readCachedMovie(imdbId, { maxAgeMs = MOVIE_DETAILS_TTL_MS } = {}) {
  const entry = await runTransaction('readonly', (store, done) => {
    const request = store.get(imdbId)
    request.onsuccess = () => done(request.result)
  })

  return isFresh(entry, maxAgeMs) ? entry.movie : null
}

export async function readCachedMovies(imdbIds, { maxAgeMs = MOVIE_DETAILS_TTL_MS } = {}) {
  if (imdbIds.length === 0) return new Map()

  const entries = await runTransaction('readonly', (store, done) => {
    const found = []
    let remaining = imdbIds.length

    for (const imdbId of imdbIds) {
      const request = store.get(imdbId)
      request.onsuccess = () => {
        if (request.result) found.push(request.result)
        remaining -= 1
        if (remaining === 0) done(found)
      }
    }
  })

  return new Map(
    (entries ?? [])
      .filter((entry) => isFresh(entry, maxAgeMs))
      .map((entry) => [entry.imdbId, entry.movie]),
  )
}

export async function cacheMovies(movies) {
  const valid = movies.filter((movie) => movie?.imdbId)
  if (valid.length === 0) return 0

  await runTransaction('readwrite', (store) => {
    const cachedAt = Date.now()
    for (const movie of valid) store.put({ imdbId: movie.imdbId, movie, cachedAt })
  })

  return valid.length
}

export function cacheMovie(movie) {
  return cacheMovies([movie])
}

export async function allCachedMovies() {
  const entries = await runTransaction('readonly', (store, done) => {
    const request = store.getAll()
    request.onsuccess = () => done(request.result)
  })

  return (entries ?? []).map((entry) => entry.movie)
}

export async function cachedMovieIds() {
  const keys = await runTransaction('readonly', (store, done) => {
    const request = store.getAllKeys()
    request.onsuccess = () => done(request.result)
  })

  return keys ?? []
}

export async function cachedMovieCount() {
  const count = await runTransaction('readonly', (store, done) => {
    const request = store.count()
    request.onsuccess = () => done(request.result)
  })

  return count ?? 0
}

export async function clearMovieCache() {
  await runTransaction('readwrite', (store) => store.clear())
}
