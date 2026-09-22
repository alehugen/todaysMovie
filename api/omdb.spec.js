import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import handler from './omdb'

function fakeResponse() {
  return {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(payload) {
      this.body = JSON.parse(payload)
    },
  }
}

const request = (query) => ({ url: `/api/omdb?${query}` })

function mockOmdb(payload, { ok = true, status = 200 } = {}) {
  global.fetch = vi.fn().mockResolvedValue({ ok, status, json: async () => payload })
}

const calledUrl = () => new URL(global.fetch.mock.calls[0][0])

describe('omdb proxy', () => {
  beforeEach(() => {
    process.env.OMDB_API_KEY = 'server-side-key'
  })

  afterEach(() => {
    delete process.env.OMDB_API_KEY
    vi.restoreAllMocks()
  })

  it('adds the key on the server and forwards the query', async () => {
    mockOmdb({ Response: 'True', Search: [] })
    const response = fakeResponse()

    await handler(request('s=matrix&type=movie&page=2'), response)

    const url = calledUrl()
    expect(url.origin + url.pathname).toBe('https://www.omdbapi.com/')
    expect(url.searchParams.get('apikey')).toBe('server-side-key')
    expect(url.searchParams.get('s')).toBe('matrix')
    expect(url.searchParams.get('page')).toBe('2')
    expect(response.statusCode).toBe(200)
  })

  it('passes the OMDb payload straight through', async () => {
    mockOmdb({ Response: 'True', Title: 'The Matrix' })
    const response = fakeResponse()

    await handler(request('i=tt0133093'), response)

    expect(response.body).toEqual({ Response: 'True', Title: 'The Matrix' })
  })

  it('refuses to forward parameters outside the whitelist', async () => {
    mockOmdb({ Response: 'True' })

    await handler(request('s=matrix&apikey=stolen&callback=evil'), fakeResponse())

    const url = calledUrl()
    expect(url.searchParams.get('apikey')).toBe('server-side-key')
    expect(url.searchParams.has('callback')).toBe(false)
  })

  it('rejects a request that is neither a search nor a lookup', async () => {
    mockOmdb({ Response: 'True' })
    const response = fakeResponse()

    await handler(request('type=movie'), response)

    expect(response.statusCode).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('says so when the deployment has no key configured', async () => {
    delete process.env.OMDB_API_KEY
    const response = fakeResponse()

    await handler(request('s=matrix'), response)

    expect(response.statusCode).toBe(500)
    expect(response.body.Error).toMatch(/missing its OMDb API key/i)
    expect(response.body.Response).toBe('False')
  })

  it('lets the edge cache absorb repeated lookups', async () => {
    mockOmdb({ Response: 'True' })
    const response = fakeResponse()

    await handler(request('i=tt0133093'), response)

    expect(response.headers['cache-control']).toMatch(/s-maxage=\d+/)
  })

  it('reports a bad gateway when OMDb cannot be reached', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network down'))
    const response = fakeResponse()

    await handler(request('s=matrix'), response)

    expect(response.statusCode).toBe(502)
    expect(response.body.Response).toBe('False')
  })

  it('keeps the upstream status when OMDb itself fails', async () => {
    mockOmdb({ Response: 'False', Error: 'Request limit reached!' }, { ok: false, status: 401 })
    const response = fakeResponse()

    await handler(request('s=matrix'), response)

    expect(response.statusCode).toBe(401)
  })
})
