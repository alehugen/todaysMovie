/**
 * SERVERLESS PROXY FOR THE OMDb API
 *
 * The browser must never see the API key. Anything shipped to the client — env
 * var, obfuscated constant, whatever — can be read from DevTools, so the only
 * real fix is for the key to stay on a machine the user does not control.
 *
 * The client calls `/api/omdb?s=matrix`, this function adds the key and forwards
 * the request to OMDb. The key lives in `OMDB_API_KEY`, deliberately WITHOUT the
 * `VITE_` prefix so that Vite cannot bundle it into the client.
 *
 * Written with plain Node request/response APIs only, so the same handler runs
 * both on Vercel and inside the Vite dev server (see vite.config.js).
 */

const OMDB_BASE_URL = 'https://www.omdbapi.com/'

// Only these parameters are forwarded. Without a whitelist this endpoint would be
// an open proxy: anyone could point it at arbitrary OMDb queries — or at other
// parameters entirely — using someone else's quota.
const ALLOWED_PARAMS = ['s', 'i', 'type', 'page', 'y', 'plot']

export default async function handler(request, response) {
  const apiKey = process.env.OMDB_API_KEY

  if (!apiKey) {
    // Mirrors OMDb's own error envelope so the client needs no special case.
    return send(response, 500, {
      Response: 'False',
      Error: 'The server is missing its OMDb API key.',
    })
  }

  const incoming = new URL(request.url, 'http://localhost')
  const target = new URL(OMDB_BASE_URL)
  target.searchParams.set('apikey', apiKey)

  for (const name of ALLOWED_PARAMS) {
    const value = incoming.searchParams.get(name)
    if (value) target.searchParams.set(name, value)
  }

  // Every legitimate request is either a search or a lookup by id.
  if (!target.searchParams.has('s') && !target.searchParams.has('i')) {
    return send(response, 400, {
      Response: 'False',
      Error: 'Missing search term or IMDb id.',
    })
  }

  try {
    const upstream = await fetch(target)
    const payload = await upstream.json()

    // Movie details barely change, so let Vercel's edge cache absorb repeated
    // lookups. This protects the daily quota far more than client caching alone.
    response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')

    return send(response, upstream.status, payload)
  } catch {
    return send(response, 502, { Response: 'False', Error: 'Could not reach OMDb.' })
  }
}

function send(response, status, payload) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}
