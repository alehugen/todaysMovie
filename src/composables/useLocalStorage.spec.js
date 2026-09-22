import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { useLocalStorage } from './useLocalStorage'

describe('useLocalStorage', () => {
  it('falls back to the default value when nothing is stored', () => {
    const favorites = useLocalStorage('favorites', [])
    expect(favorites.value).toEqual([])
  })

  it('reads the value already present in localStorage', () => {
    localStorage.setItem('profile', JSON.stringify({ name: 'Lele' }))

    const profile = useLocalStorage('profile', null)
    expect(profile.value).toEqual({ name: 'Lele' })
  })

  it('persists the value on assignment', async () => {
    const theme = useLocalStorage('theme', 'light')

    theme.value = 'dark'
    await nextTick() // Vue watchers flush asynchronously

    expect(localStorage.getItem('theme')).toBe('"dark"')
  })

  it('persists deep mutations thanks to deep: true', async () => {
    const ratings = useLocalStorage('ratings', [])

    ratings.value.push({ imdbID: 'tt0111161', liked: true })
    await nextTick()

    expect(JSON.parse(localStorage.getItem('ratings'))).toEqual([
      { imdbID: 'tt0111161', liked: true },
    ])
  })

  it('falls back to the default when the stored content is invalid', () => {
    localStorage.setItem('corrupted', '{not valid json}')

    const value = useLocalStorage('corrupted', { ok: true })
    expect(value.value).toEqual({ ok: true })
  })

  it('never shares the default value reference between instances', async () => {
    const fallback = []
    const a = useLocalStorage('a', fallback)

    a.value.push(1)
    await nextTick()

    expect(fallback).toEqual([]) 
  })

  it('reacts to changes made in another tab', () => {
    const theme = useLocalStorage('theme', 'light')

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'theme', newValue: '"dark"' }),
    )

    expect(theme.value).toBe('dark')
  })
})
