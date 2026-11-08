import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initializeTheme, readPreferences, setThemeMode, themeMode } from '@/utils/preferences'

beforeEach(() => {
  localStorage.removeItem('acgbox-preferences')
  localStorage.removeItem('acgbox-theme')
  themeMode.value = 'light'
})
afterEach(() => {
  localStorage.removeItem('acgbox-preferences')
  localStorage.removeItem('acgbox-theme')
  vi.unstubAllGlobals()
  document.body.removeAttribute('data-theme')
})

describe('个人偏好存储', () => {
  it('异常或旧版偏好回退到可用值，并清理无效建议', () => {
    localStorage.setItem('acgbox-preferences', '{invalid')
    expect(readPreferences()).toMatchObject({
      pageSize: 20,
      sortBy: 'BROADCAST_DATE',
      sortDirection: 'DESC',
    })
    localStorage.setItem(
      'acgbox-preferences',
      JSON.stringify({
        pageSize: 100,
        sortBy: 'ID',
        sortDirection: 'invalid',
        regionId: 4,
        linkTitles: ['官网', '官网', '', 7],
      }),
    )
    expect(readPreferences()).toMatchObject({
      pageSize: 20,
      sortBy: 'BROADCAST_DATE',
      sortDirection: 'DESC',
      linkTitles: ['官网'],
    })
  })

  it('读取旧主题并响应系统主题变化，释放监听', () => {
    let changed: (() => void) | undefined
    const media = {
      matches: false,
      addEventListener: vi.fn((_event, handler) => {
        changed = handler
      }),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media),
    )
    localStorage.setItem('acgbox-theme', 'dark')
    const release = initializeTheme()
    expect(document.body.dataset.theme).toBe('dark')
    setThemeMode('system')
    expect(localStorage.getItem('acgbox-theme')).toBe('system')
    expect(document.body.dataset.theme).toBe('light')
    media.matches = true
    changed?.()
    expect(document.body.dataset.theme).toBe('dark')
    window.dispatchEvent(new StorageEvent('storage', { key: 'acgbox-theme', newValue: 'light' }))
    expect(document.body.dataset.theme).toBe('light')
    release()
  })
})
