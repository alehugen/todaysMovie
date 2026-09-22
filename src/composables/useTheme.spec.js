import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

function mockSystemPreference(prefersDark) {
  const listeners = new Set()

  window.matchMedia = vi.fn(() => ({
    matches: prefersDark,
    addEventListener: (_event, callback) => listeners.add(callback),
    removeEventListener: (_event, callback) => listeners.delete(callback),
  }))

  return {
    emitChange: (matches) => listeners.forEach((callback) => callback({ matches })),
  }
}

async function loadUseTheme() {
  vi.resetModules()
  const module = await import('./useTheme')
  return module.useTheme()
}

const htmlIsDark = () => document.documentElement.classList.contains('dark')

describe('useTheme', () => {
  it('starts on "system" and follows the operating system preference', async () => {
    mockSystemPreference(true)

    const { preference, activeTheme, isDark } = await loadUseTheme()

    expect(preference.value).toBe('system')
    expect(activeTheme.value).toBe('dark')
    expect(isDark.value).toBe(true)
    expect(htmlIsDark()).toBe(true)
  })

  it('an explicit user choice overrides the system preference', async () => {
    mockSystemPreference(true)

    const { setTheme, activeTheme } = await loadUseTheme()
    setTheme('light')
    await nextTick()

    expect(activeTheme.value).toBe('light')
    expect(htmlIsDark()).toBe(false)
  })

  it('persists the choice in localStorage', async () => {
    mockSystemPreference(false)

    const { setTheme } = await loadUseTheme()
    setTheme('dark')
    await nextTick()

    expect(localStorage.getItem('todaysmovie:theme')).toBe('"dark"')
  })

  it('restores the choice saved on a previous visit', async () => {
    localStorage.setItem('todaysmovie:theme', '"dark"')
    mockSystemPreference(false)

    const { preference, isDark } = await loadUseTheme()

    expect(preference.value).toBe('dark')
    expect(isDark.value).toBe(true)
  })

  it('toggleTheme switches between light and dark', async () => {
    mockSystemPreference(false)

    const { toggleTheme, activeTheme } = await loadUseTheme()

    toggleTheme()
    await nextTick()
    expect(activeTheme.value).toBe('dark')

    toggleTheme()
    await nextTick()
    expect(activeTheme.value).toBe('light')
  })

  it('ignores an unknown theme', async () => {
    mockSystemPreference(false)

    const { setTheme, preference } = await loadUseTheme()
    setTheme('sepia')

    expect(preference.value).toBe('system')
  })

  it('follows the system in real time while the preference is "system"', async () => {
    const system = mockSystemPreference(false)

    const { isDark } = await loadUseTheme()
    expect(isDark.value).toBe(false)

    system.emitChange(true)
    await nextTick()

    expect(isDark.value).toBe(true)
    expect(htmlIsDark()).toBe(true)
  })

  it('stops following the system after an explicit choice', async () => {
    const system = mockSystemPreference(false)

    const { setTheme, isDark } = await loadUseTheme()
    setTheme('light')

    system.emitChange(true)
    await nextTick()

    expect(isDark.value).toBe(false)
  })

  it('shares one single state across every component that uses it', async () => {
    mockSystemPreference(false)

    vi.resetModules()
    const { useTheme } = await import('./useTheme')

    const header = useTheme()
    const footer = useTheme()

    header.setTheme('dark')
    await nextTick()

    expect(footer.activeTheme.value).toBe('dark')
  })
})
