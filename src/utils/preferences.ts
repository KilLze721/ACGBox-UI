import { computed, ref } from 'vue'
import type { AnimeSortField, SortDirection } from '@/types/api'
import { companyRoles, linkTitleSuggestions, personRoles } from '@/config/animeFormOptions'

export type ThemeMode = 'light' | 'dark' | 'system'
export interface PersonalPreferences {
  pageSize: number
  sortBy: AnimeSortField
  sortDirection: SortDirection
  regionId: string
  broadcastTypeId: string
  linkTitles: string[]
  companyRoles: string[]
  personRoles: string[]
}

const preferencesKey = 'acgbox-preferences'
export const pageSizeValues = [10, 20, 50]
export const themeMode = ref<ThemeMode>('light')
const systemDark = ref(false)
export const effectiveDarkTheme = computed(() =>
  themeMode.value === 'system' ? systemDark.value : themeMode.value === 'dark',
)

export function defaultPreferences(): PersonalPreferences {
  return {
    pageSize: 20,
    sortBy: 'BROADCAST_DATE',
    sortDirection: 'DESC',
    regionId: '',
    broadcastTypeId: '',
    linkTitles: [...linkTitleSuggestions],
    companyRoles: [...companyRoles],
    personRoles: [...personRoles],
  }
}

export function readPreferences(): PersonalPreferences {
  const defaults = defaultPreferences()
  try {
    const saved = JSON.parse(localStorage.getItem(preferencesKey) ?? 'null')
    if (!saved || typeof saved !== 'object') return defaults
    return {
      pageSize: pageSizeValues.includes(saved.pageSize) ? saved.pageSize : defaults.pageSize,
      sortBy: ['BROADCAST_DATE', 'PERSONAL_RATING'].includes(saved.sortBy)
        ? saved.sortBy
        : defaults.sortBy,
      sortDirection: ['ASC', 'DESC'].includes(saved.sortDirection)
        ? saved.sortDirection
        : defaults.sortDirection,
      regionId:
        typeof saved.regionId === 'string' && /^\d+$/.test(saved.regionId) ? saved.regionId : '',
      broadcastTypeId:
        typeof saved.broadcastTypeId === 'string' && /^\d+$/.test(saved.broadcastTypeId)
          ? saved.broadcastTypeId
          : '',
      linkTitles: readSuggestions(saved.linkTitles, defaults.linkTitles),
      companyRoles: readSuggestions(saved.companyRoles, defaults.companyRoles),
      personRoles: readSuggestions(saved.personRoles, defaults.personRoles),
    }
  } catch {
    return defaults
  }
}

function readSuggestions(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === 'string' && !!item.trim())
            .map((item) => item.trim()),
        ),
      ]
    : fallback
}

export function savePreferences(value: PersonalPreferences) {
  localStorage.setItem(preferencesKey, JSON.stringify(value))
}

// 不改变列表原有可选范围；偏好不受支持时回退到该列表原有默认值。
export function resolvePageSize(
  options: readonly number[],
  fallback: number,
  preferred = readPreferences().pageSize,
) {
  return options.includes(preferred) ? preferred : fallback
}

function applyTheme() {
  document.body.dataset.theme = effectiveDarkTheme.value ? 'dark' : 'light'
}

export function setThemeMode(value: ThemeMode) {
  localStorage.setItem('acgbox-theme', value)
  themeMode.value = value
  applyTheme()
}

export function initializeTheme() {
  const saved = localStorage.getItem('acgbox-theme')
  themeMode.value = saved === 'dark' || saved === 'system' ? saved : 'light'
  const media = window.matchMedia?.('(prefers-color-scheme: dark)')
  systemDark.value = media?.matches ?? false
  applyTheme()
  const changed = () => {
    systemDark.value = media?.matches ?? false
    applyTheme()
  }
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== 'acgbox-theme') return
    themeMode.value =
      event.newValue === 'dark' || event.newValue === 'system' ? event.newValue : 'light'
    applyTheme()
  }
  media?.addEventListener('change', changed)
  window.addEventListener('storage', storageChanged)
  return () => {
    media?.removeEventListener('change', changed)
    window.removeEventListener('storage', storageChanged)
  }
}
