import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  defaultPreferences,
  effectiveDarkTheme,
  initializeTheme,
  pageSizeValues,
  readPreferences,
  resolvePageSize,
  savePreferences,
  setThemeMode,
  themeMode,
} from '@/utils/preferences'

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
  it('默认值遵循当前表单预设，异常存储不会污染默认值', () => {
    expect(readPreferences()).toEqual({
      pageSize: 20,
      sortBy: 'BROADCAST_DATE',
      sortDirection: 'DESC',
      regionId: '',
      broadcastTypeId: '',
      linkTitles: ['官网', 'Bilibili', 'Bangumi', '豆瓣'],
      companyRoles: ['动画制作', '制作协力', '3DCG'],
    })
    localStorage.setItem('acgbox-preferences', '{invalid')
    expect(readPreferences()).toEqual(defaultPreferences())
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
      regionId: '',
      linkTitles: ['官网'],
    })
    const snapshot = readPreferences()
    snapshot.companyRoles.push('新职责')
    expect(readPreferences().companyRoles).not.toContain('新职责')
  })

  it('所有分页共用 10、20、50 三档，均能应用默认偏好', () => {
    expect(pageSizeValues).toEqual([10, 20, 50])
    for (const pageSize of pageSizeValues) {
      savePreferences({ ...defaultPreferences(), pageSize })
      expect(resolvePageSize(pageSizeValues, 10)).toBe(pageSize)
      expect(resolvePageSize(pageSizeValues, 20)).toBe(pageSize)
    }
    expect(resolvePageSize(pageSizeValues, 20, 100)).toBe(20)
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
    expect(themeMode.value).toBe('dark')
    expect(document.body.dataset.theme).toBe('dark')
    setThemeMode('system')
    expect(localStorage.getItem('acgbox-theme')).toBe('system')
    expect(effectiveDarkTheme.value).toBe(false)
    media.matches = true
    changed?.()
    expect(document.body.dataset.theme).toBe('dark')
    window.dispatchEvent(new StorageEvent('storage', { key: 'acgbox-theme', newValue: 'light' }))
    expect(themeMode.value).toBe('light')
    expect(document.body.dataset.theme).toBe('light')
    release()
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
