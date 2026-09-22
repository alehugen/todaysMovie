export function shuffle(items, random = Math.random) {
  const result = [...items]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const temporary = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = temporary
  }

  return result
}

export function decadesForBirthYear(birthYear, currentYear = new Date().getFullYear()) {
  if (!Number.isFinite(birthYear)) return []

  const firstDecade = Math.floor(birthYear / 10) * 10
  const lastDecade = Math.floor(currentYear / 10) * 10
  if (firstDecade > lastDecade) return []

  const decades = []
  for (let decade = firstDecade; decade <= lastDecade; decade += 10) decades.push(decade)
  return decades
}

function distributeQuotas(total, bucketCount) {
  const quotas = new Array(bucketCount).fill(Math.floor(total / bucketCount))
  let remainder = total % bucketCount

  for (let index = bucketCount - 1; index >= 0 && remainder > 0; index -= 1) {
    quotas[index] += 1
    remainder -= 1
  }

  return quotas
}

function partitionByGenres(movies, selectedGenres) {
  const selected = new Set(selectedGenres)
  const favorites = []
  const others = []

  for (const movie of movies) {
    if (selected.size > 0 && movie.genres.some((genre) => selected.has(genre))) favorites.push(movie)
    else others.push(movie)
  }

  return { favorites, others }
}

function pickBalancedByGenre(movies, genres, limit, random) {
  if (limit <= 0 || genres.length === 0) return []

  const poolsByGenre = new Map(
    genres.map((genre) => [
      genre,
      shuffle(movies.filter((movie) => movie.genres.includes(genre)), random),
    ]),
  )

  const picked = []
  const usedIds = new Set()
  let pickedSomething = true

  while (picked.length < limit && pickedSomething) {
    pickedSomething = false

    for (const genre of genres) {
      if (picked.length >= limit) break

      const nextMovie = poolsByGenre.get(genre)?.find((movie) => !usedIds.has(movie.imdbId))
      if (!nextMovie) continue

      usedIds.add(nextMovie.imdbId)
      picked.push(nextMovie)
      pickedSomething = true
    }
  }

  return picked
}

function pickFromPool(pool, { genres, limit, outsideRatio, usedIds, random }) {
  if (limit <= 0) return []

  const available = pool.filter((movie) => !usedIds.has(movie.imdbId))
  const { favorites, others } = partitionByGenres(available, genres)

  const outsideTarget = Math.min(Math.round(limit * outsideRatio), others.length)
  const insideTarget = Math.max(0, limit - outsideTarget)

  const picked = pickBalancedByGenre(favorites, genres, insideTarget, random)
  const pickedIds = new Set(picked.map((movie) => movie.imdbId))

  for (const movie of shuffle(others, random)) {
    if (picked.length >= limit) break
    picked.push(movie)
    pickedIds.add(movie.imdbId)
  }

  for (const movie of shuffle(available, random)) {
    if (picked.length >= limit) break
    if (pickedIds.has(movie.imdbId)) continue
    picked.push(movie)
    pickedIds.add(movie.imdbId)
  }

  for (const movie of picked) usedIds.add(movie.imdbId)
  return picked
}

export function sampleMoviesForProfile(
  movies,
  {
    genres = [],
    birthYear = null,
    total = 12,
    outsideRatio = 0.4,
    currentYear = new Date().getFullYear(),
    excludeIds = [],
    random = Math.random,
  } = {},
) {
  const usedIds = new Set(excludeIds)
  const picked = []
  const decades = decadesForBirthYear(birthYear, currentYear)

  if (decades.length > 0) {
    const quotas = distributeQuotas(total, decades.length)

    decades.forEach((decade, index) => {
      const bucket = movies.filter((movie) => movie.year >= decade && movie.year < decade + 10)
      picked.push(
        ...pickFromPool(bucket, { genres, limit: quotas[index], outsideRatio, usedIds, random }),
      )
    })
  }

  if (picked.length < total) {
    picked.push(
      ...pickFromPool(movies, {
        genres,
        limit: total - picked.length,
        outsideRatio,
        usedIds,
        random,
      }),
    )
  }

  return shuffle(picked, random)
}
