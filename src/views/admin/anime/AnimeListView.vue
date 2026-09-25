<script setup lang="ts">
import { computed, inject, onActivated, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { routeLocationKey } from 'vue-router'
import { deleteAnime, getAnimeDetail, getAnimePage } from '@/api/anime'
import {
  getAdaptationTypes,
  getBroadcastTypes,
  getCompanies,
  getRegions,
  getTags,
} from '@/api/catalog'
import type {
  AnimePageItem,
  AnimePageQuery,
  AnimeSortField,
  CompanyOption,
  NamedOption,
  PageResult,
  SortDirection,
  TagMatchMode,
} from '@/types/api'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import ArchiveDateInput from '@/components/admin/ArchiveDateInput.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import { getArchiveDateBound, validateArchiveDate } from '@/utils/archiveDate'
import AnimeCrudDrawer from './AnimeCrudDrawer.vue'

const route = inject(routeLocationKey, null)
const ownerFullPath = route?.fullPath ?? ''

interface AnimeFilters {
  keyword: string
  tagIds: number[]
  tagMatchMode: TagMatchMode
  broadcastTypeId: string
  adaptationTypeId: string
  broadcastStartDate: string
  broadcastEndDate: string
  status: string
  regionId: string
  companyId: string
  companyKeyword: string
  ratingMin: string
  ratingMax: string
  sortBy: AnimeSortField
  sortDirection: SortDirection
}

interface AnimeStats {
  total: number | null
  ongoing: number | null
  upcoming: number | null
  completed: number | null
}

const statusNames: Record<number, string> = {
  1: '未放送',
  2: '放送中',
  3: '已完结',
  4: '其他',
}

const statusOptions: NamedOption[] = Object.entries(statusNames).map(([id, name]) => ({
  id: Number(id),
  name,
}))

const pageSizeOptions: NamedOption[] = [5, 10, 20, 50].map((value) => ({
  id: value,
  name: `${value} 条`,
}))

const createDefaultFilters = (): AnimeFilters => ({
  keyword: '',
  tagIds: [],
  tagMatchMode: 'ALL',
  broadcastTypeId: '',
  adaptationTypeId: '',
  broadcastStartDate: '',
  broadcastEndDate: '',
  status: '',
  regionId: '',
  companyId: '',
  companyKeyword: '',
  ratingMin: '',
  ratingMax: '',
  sortBy: 'BROADCAST_DATE',
  sortDirection: 'DESC',
})

const form = reactive<AnimeFilters>(createDefaultFilters())
const appliedFilters = ref<AnimeFilters>(createDefaultFilters())
const pageSize = ref(10)
const pageSizeModel = computed({
  get: () => String(pageSize.value),
  set: (value: string) => {
    const nextPageSize = Number(value)
    if (nextPageSize === pageSize.value) return
    pageSize.value = nextPageSize
    changePageSize()
  },
})
const jumpPage = ref(1)
const loading = ref(false)
const errorMessage = ref('')
const validationMessage = ref('')
const dateErrors = reactive({
  broadcastStartDate: '',
  broadcastEndDate: '',
})
const ratingErrors = reactive({
  ratingMin: '',
  ratingMax: '',
})
const catalogWarning = ref('')
const showAdvancedFilters = ref(false)
const showCompanySuggestions = ref(false)
const showTagDropdown = ref(false)
const tagSearch = ref('')
const dateRangeEnabled = ref(false)
const ratingRangeEnabled = ref(false)
const appliedRatingRangeEnabled = ref(false)
const deleteTarget = ref<AnimePageItem | null>(null)
const deleteSubmitting = ref(false)
const deleteConfirmed = ref(false)
const deleteConfirmationMessage = ref('')
const drawerMode = ref<'detail' | 'edit' | null>(null)
const crudDrawer = ref<InstanceType<typeof AnimeCrudDrawer> | null>(null)

function getCloseState() {
  return crudDrawer.value?.getCloseState() ?? { dirty: false, submitting: false }
}

defineExpose({ getCloseState })
const drawerAnime = ref<AnimePageItem | null>(null)
const toast = ref<{ title: string; message: string; type: 'success' | 'error' } | null>(null)
const page = ref<PageResult<AnimePageItem>>({
  pageNum: 1,
  pageSize: 10,
  total: 0,
  pages: 0,
  rows: [],
})
const stats = reactive<AnimeStats>({
  total: null,
  ongoing: null,
  upcoming: null,
  completed: null,
})
const broadcastTypes = ref<NamedOption[]>([])
const adaptationTypes = ref<NamedOption[]>([])
const regions = ref<NamedOption[]>([])
const tags = ref<NamedOption[]>([])
const companySuggestions = ref<CompanyOption[]>([])

let pageController: AbortController | undefined
let catalogController: AbortController | undefined
let statsController: AbortController | undefined
let companyController: AbortController | undefined
let companySearchTimer: number | undefined
let toastTimer: number | undefined
let hasActivated = false

const advancedFilterCount = computed(
  () =>
    [
      form.status,
      form.broadcastTypeId,
      form.adaptationTypeId,
      form.regionId,
      form.companyId,
      form.broadcastStartDate,
      form.broadcastEndDate,
      form.ratingMin,
      form.ratingMax,
    ].filter(Boolean).length,
)

const activeFilterCount = computed(() => {
  const filters = appliedFilters.value
  return (
    [
      filters.keyword,
      filters.status,
      filters.broadcastTypeId,
      filters.adaptationTypeId,
      filters.regionId,
      filters.companyId,
      filters.broadcastStartDate,
      filters.broadcastEndDate,
      filters.ratingMin,
      filters.ratingMax,
    ].filter(Boolean).length + (filters.tagIds.length ? 1 : 0)
  )
})

const filteredTags = computed(() => {
  const keyword = tagSearch.value.trim().toLocaleLowerCase()
  return keyword
    ? tags.value.filter((tag) => tag.name.toLocaleLowerCase().includes(keyword))
    : tags.value
})

const selectedTagText = computed(() => {
  if (!form.tagIds.length) return '选择标签'
  const selectedNames = tags.value
    .filter((tag) => form.tagIds.includes(tag.id))
    .map((tag) => tag.name)
  return selectedNames.length <= 2
    ? selectedNames.join('、')
    : `${selectedNames.slice(0, 2).join('、')} +${selectedNames.length - 2}`
})

const activeFilterChips = computed(() => {
  const filters = appliedFilters.value
  const chips: Array<{ key: string; label: string }> = []
  const findName = (items: NamedOption[], value: string) =>
    items.find((item) => item.id === Number(value))?.name ?? value

  if (filters.keyword) chips.push({ key: 'keyword', label: `关键词：${filters.keyword}` })
  filters.tagIds.forEach((id) => {
    const tag = tags.value.find((item) => item.id === id)
    if (tag) chips.push({ key: `tag:${id}`, label: `标签：${tag.name}` })
  })
  if (filters.status)
    chips.push({ key: 'status', label: `状态：${statusNames[Number(filters.status)]}` })
  if (filters.broadcastTypeId) {
    chips.push({
      key: 'broadcastTypeId',
      label: `放送：${findName(broadcastTypes.value, filters.broadcastTypeId)}`,
    })
  }
  if (filters.adaptationTypeId) {
    chips.push({
      key: 'adaptationTypeId',
      label: `改编：${findName(adaptationTypes.value, filters.adaptationTypeId)}`,
    })
  }
  if (filters.regionId)
    chips.push({ key: 'regionId', label: `地区：${findName(regions.value, filters.regionId)}` })
  if (filters.companyId) chips.push({ key: 'companyId', label: `公司：${filters.companyKeyword}` })
  if (filters.broadcastStartDate)
    chips.push({
      key: 'broadcastStartDate',
      label: `${dateRangeEnabled.value ? '始于' : '日期'}：${filters.broadcastStartDate}`,
    })
  if (dateRangeEnabled.value && filters.broadcastEndDate)
    chips.push({ key: 'broadcastEndDate', label: `止于：${filters.broadcastEndDate}` })
  if (filters.ratingMin)
    chips.push({
      key: 'ratingMin',
      label: `${appliedRatingRangeEnabled.value ? '评分 ≥' : '评分：'}${filters.ratingMin}`,
    })
  if (appliedRatingRangeEnabled.value && filters.ratingMax)
    chips.push({ key: 'ratingMax', label: `评分 ≤ ${filters.ratingMax}` })
  return chips
})

const pageNumbers = computed(() => {
  const total = page.value.pages
  const current = page.value.pageNum
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)

  const numbers: Array<number | 'ellipsis'> = [1]
  if (current > 4) numbers.push('ellipsis')
  for (
    let value = Math.max(2, current - 1);
    value <= Math.min(total - 1, current + 1);
    value += 1
  ) {
    numbers.push(value)
  }
  if (current < total - 3) numbers.push('ellipsis')
  numbers.push(total)
  return numbers
})

const resultRange = computed(() => {
  if (page.value.total === 0) return '0 条记录'
  const start = (page.value.pageNum - 1) * page.value.pageSize + 1
  const end = Math.min(page.value.pageNum * page.value.pageSize, page.value.total)
  return `第 ${start}–${end} 条，共 ${page.value.total} 条`
})

const sortSummary = computed(() => {
  const field = appliedFilters.value.sortBy === 'BROADCAST_DATE' ? '开始放送日期' : '个人评分'
  const direction = appliedFilters.value.sortDirection === 'DESC' ? '倒序' : '正序'
  return `${field} · ${direction}`
})

onMounted(() => {
  void loadCatalogs()
  void loadStats()
  void loadPage(1)
  void openLinkedDetail()
})

onActivated(() => {
  if (!hasActivated) {
    hasActivated = true
    return
  }
  void loadPage(page.value.pageNum)
})

onBeforeUnmount(() => {
  pageController?.abort()
  catalogController?.abort()
  statsController?.abort()
  companyController?.abort()
  if (companySearchTimer) window.clearTimeout(companySearchTimer)
  if (toastTimer) window.clearTimeout(toastTimer)
})

function optionalNumber(value: string) {
  return value === '' ? undefined : Number(value)
}

function createQuery(pageNum: number): AnimePageQuery {
  const filters = appliedFilters.value
  return {
    pageNum,
    pageSize: pageSize.value,
    keyword: filters.keyword.trim() || undefined,
    tagIds: filters.tagIds.length ? filters.tagIds : undefined,
    tagMatchMode: filters.tagIds.length ? filters.tagMatchMode : undefined,
    broadcastTypeId: optionalNumber(filters.broadcastTypeId),
    adaptationTypeId: optionalNumber(filters.adaptationTypeId),
    broadcastStartDate: filters.broadcastStartDate || undefined,
    broadcastEndDate:
      (dateRangeEnabled.value ? filters.broadcastEndDate : filters.broadcastStartDate) || undefined,
    status: optionalNumber(filters.status),
    regionId: optionalNumber(filters.regionId),
    companyId: optionalNumber(filters.companyId),
    ratingMin: optionalNumber(filters.ratingMin),
    ratingMax: optionalNumber(
      appliedRatingRangeEnabled.value ? filters.ratingMax : filters.ratingMin,
    ),
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
  }
}

async function loadPage(pageNum: number) {
  pageController?.abort()
  const controller = new AbortController()
  pageController = controller
  loading.value = true
  errorMessage.value = ''

  try {
    const result = await getAnimePage(createQuery(pageNum), controller.signal)
    page.value = result
    jumpPage.value = result.pageNum
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    errorMessage.value = error instanceof Error ? error.message : '动画资料读取失败'
  } finally {
    if (pageController === controller) loading.value = false
  }
}

async function loadCatalogs() {
  catalogController?.abort()
  const controller = new AbortController()
  catalogController = controller

  const results = await Promise.allSettled([
    getBroadcastTypes(controller.signal),
    getAdaptationTypes(controller.signal),
    getRegions(controller.signal),
    getAllTags(controller.signal),
  ])

  if (results[0].status === 'fulfilled') broadcastTypes.value = results[0].value
  if (results[1].status === 'fulfilled') adaptationTypes.value = results[1].value
  if (results[2].status === 'fulfilled') regions.value = results[2].value
  if (results[3].status === 'fulfilled') tags.value = results[3].value

  catalogWarning.value = results.some((result) => result.status === 'rejected')
    ? '部分筛选选项加载失败，可以刷新页面后重试。'
    : ''
}

async function getAllTags(signal: AbortSignal) {
  const firstPage = await getTags(1, 100, signal)
  if (firstPage.pages <= 1) return firstPage.rows

  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.pages - 1 }, (_, index) => getTags(index + 2, 100, signal)),
  )
  return firstPage.rows.concat(remainingPages.flatMap((item) => item.rows))
}

async function loadStats() {
  statsController?.abort()
  const controller = new AbortController()
  statsController = controller

  try {
    const [all, upcoming, ongoing, completed] = await Promise.all([
      getAnimePage({ pageNum: 1, pageSize: 1 }, controller.signal),
      getAnimePage({ pageNum: 1, pageSize: 1, status: 1 }, controller.signal),
      getAnimePage({ pageNum: 1, pageSize: 1, status: 2 }, controller.signal),
      getAnimePage({ pageNum: 1, pageSize: 1, status: 3 }, controller.signal),
    ])
    stats.total = all.total
    stats.upcoming = upcoming.total
    stats.ongoing = ongoing.total
    stats.completed = completed.total
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
  }
}

function validateFilters() {
  if (form.companyKeyword.trim() && !form.companyId) {
    return '请从联想结果中选择制作公司。'
  }

  return ''
}

type BroadcastDateField = 'broadcastStartDate' | 'broadcastEndDate'

function clearDateError(field: BroadcastDateField) {
  dateErrors[field] = ''
}

function validateDateField(field: BroadcastDateField) {
  if (field === 'broadcastEndDate' && !dateRangeEnabled.value) {
    dateErrors.broadcastEndDate = ''
    return true
  }

  const result = validateArchiveDate(form[field])
  dateErrors[field] = result.error
  if (result.error) return false

  if (result.value) form[field] = result.value.normalized
  else form[field] = ''
  return true
}

function validateDateRange() {
  const startValid = validateDateField('broadcastStartDate')
  const endValid = validateDateField('broadcastEndDate')
  if (!startValid || !endValid || !dateRangeEnabled.value) return startValid && endValid

  const startValue = validateArchiveDate(form.broadcastStartDate).value
  const endValue = validateArchiveDate(form.broadcastEndDate).value
  if (
    startValue &&
    endValue &&
    getArchiveDateBound(startValue, false) > getArchiveDateBound(endValue, true)
  ) {
    dateErrors.broadcastEndDate = '结束日期不能早于开始日期。'
    return false
  }
  return true
}

function handleDateBlur(field: BroadcastDateField) {
  if (!validateDateField(field)) return
  if (dateRangeEnabled.value) validateDateRange()
}

function handleDateRangeModeChange() {
  dateErrors.broadcastStartDate = ''
  dateErrors.broadcastEndDate = ''
}

type RatingField = 'ratingMin' | 'ratingMax'

function clearRatingError(field: RatingField) {
  ratingErrors[field] = ''
}

function validateRatingField(field: RatingField) {
  if (field === 'ratingMax' && !ratingRangeEnabled.value) {
    ratingErrors.ratingMax = ''
    return true
  }

  const value = form[field].trim()
  if (!value) {
    form[field] = ''
    ratingErrors[field] = ''
    return true
  }

  if (/^-\d+$/.test(value)) {
    ratingErrors[field] = '评分不能低于 0 分。'
    return false
  }
  if (/^-?\d+\.\d+$/.test(value)) {
    ratingErrors[field] = '评分仅支持整数。'
    return false
  }
  if (!/^\d+$/.test(value)) {
    ratingErrors[field] = '评分格式不正确，请输入 0 至 10 的整数。'
    return false
  }

  const score = Number(value)
  if (score > 10) {
    ratingErrors[field] = '评分不能超过 10 分。'
    return false
  }

  form[field] = String(score)
  ratingErrors[field] = ''
  return true
}

function validateRatingRange() {
  const minValid = validateRatingField('ratingMin')
  const maxValid = validateRatingField('ratingMax')
  if (!minValid || !maxValid || !ratingRangeEnabled.value) return minValid && maxValid

  if (
    form.ratingMin !== '' &&
    form.ratingMax !== '' &&
    Number(form.ratingMin) > Number(form.ratingMax)
  ) {
    ratingErrors.ratingMax = '最高评分不能低于最低评分。'
    return false
  }
  return true
}

function handleRatingBlur(field: RatingField) {
  if (!validateRatingField(field)) return
  if (ratingRangeEnabled.value) validateRatingRange()
}

function handleRatingRangeModeChange() {
  ratingErrors.ratingMin = ''
  ratingErrors.ratingMax = ''
  if (!ratingRangeEnabled.value) form.ratingMax = ''
}

function submitQuery() {
  const datesValid = validateDateRange()
  const ratingsValid = validateRatingRange()
  if (!datesValid || !ratingsValid) {
    validationMessage.value = ''
    return
  }
  validationMessage.value = validateFilters()
  if (validationMessage.value) return

  appliedFilters.value = {
    ...form,
    ratingMax: ratingRangeEnabled.value ? form.ratingMax : '',
    tagIds: [...form.tagIds],
  }
  appliedRatingRangeEnabled.value = ratingRangeEnabled.value
  void loadPage(1)
}

function resetFilters() {
  Object.assign(form, createDefaultFilters())
  appliedFilters.value = createDefaultFilters()
  validationMessage.value = ''
  dateErrors.broadcastStartDate = ''
  dateErrors.broadcastEndDate = ''
  ratingErrors.ratingMin = ''
  ratingErrors.ratingMax = ''
  companySuggestions.value = []
  dateRangeEnabled.value = false
  ratingRangeEnabled.value = false
  appliedRatingRangeEnabled.value = false
  showTagDropdown.value = false
  void loadPage(1)
}

function changePageSize() {
  void loadPage(1)
}

function goToPage(pageNum: number) {
  if (
    loading.value ||
    pageNum < 1 ||
    pageNum > page.value.pages ||
    pageNum === page.value.pageNum
  ) {
    return
  }
  void loadPage(pageNum)
}

function jumpToPage() {
  const target = Math.min(Math.max(Math.trunc(jumpPage.value), 1), Math.max(page.value.pages, 1))
  jumpPage.value = target
  goToPage(target)
}

function toggleSortDirection() {
  form.sortDirection = form.sortDirection === 'DESC' ? 'ASC' : 'DESC'
}

function handleCompanyInput() {
  form.companyId = ''
  showCompanySuggestions.value = true
  if (companySearchTimer) window.clearTimeout(companySearchTimer)

  const keyword = form.companyKeyword.trim()
  if (!keyword) {
    companySuggestions.value = []
    return
  }

  companySearchTimer = window.setTimeout(() => {
    companyController?.abort()
    const controller = new AbortController()
    companyController = controller
    void getCompanies(keyword, 10, controller.signal)
      .then((result) => {
        if (companyController === controller) companySuggestions.value = result.rows
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          companySuggestions.value = []
        }
      })
  }, 250)
}

function selectCompany(company: CompanyOption) {
  form.companyId = String(company.id)
  form.companyKeyword = company.name
  companySuggestions.value = []
  showCompanySuggestions.value = false
}

function hideCompanySuggestions() {
  window.setTimeout(() => {
    showCompanySuggestions.value = false
  }, 120)
}

function toggleTag(tagId: number) {
  const index = form.tagIds.indexOf(tagId)
  if (index >= 0) form.tagIds.splice(index, 1)
  else form.tagIds.push(tagId)
}

function clearFilter(key: string) {
  if (key.startsWith('tag:')) {
    const tagId = Number(key.slice(4))
    form.tagIds = form.tagIds.filter((id) => id !== tagId)
  } else if (key === 'companyId') {
    form.companyId = ''
    form.companyKeyword = ''
  } else if (key in form) {
    const filterKey = key as keyof AnimeFilters
    if (filterKey === 'tagIds') form.tagIds = []
    else (form[filterKey] as string) = ''
  }
  if (key === 'broadcastStartDate' || key === 'broadcastEndDate') {
    dateErrors[key] = ''
  }
  submitQuery()
}

function showToast(title: string, message: string, type: 'success' | 'error' = 'success') {
  toast.value = { title, message, type }
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = null
  }, 3200)
}

function openDeleteModal(anime: AnimePageItem) {
  deleteTarget.value = anime
  deleteConfirmed.value = false
  deleteConfirmationMessage.value = ''
}

function closeDeleteModal() {
  if (!deleteSubmitting.value) {
    deleteTarget.value = null
    deleteConfirmed.value = false
    deleteConfirmationMessage.value = ''
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  if (!deleteConfirmed.value) {
    deleteConfirmationMessage.value = '请先勾选确认框，再删除动画。'
    return
  }
  deleteConfirmationMessage.value = ''
  deleteSubmitting.value = true
  const target = deleteTarget.value
  try {
    await deleteAnime([target.id])
    deleteTarget.value = null
    showToast('删除成功', `“${target.name}”已从动画资料库移除。`)
    const nextPage =
      page.value.rows.length === 1 && page.value.pageNum > 1
        ? page.value.pageNum - 1
        : page.value.pageNum
    await Promise.all([loadPage(nextPage), loadStats()])
  } catch (error) {
    showToast('删除失败', error instanceof Error ? error.message : '请稍后重试。', 'error')
  } finally {
    deleteSubmitting.value = false
  }
}

function openCrudDrawer(mode: 'detail' | 'edit', anime: AnimePageItem) {
  drawerAnime.value = anime
  drawerMode.value = mode
}

async function openLinkedDetail() {
  if (!route) return
  const id = Number(route.query.detail)
  if (!Number.isInteger(id) || id <= 0 || route.fullPath !== ownerFullPath) return
  try {
    const detail = await getAnimeDetail(id)
    let anime: AnimePageItem | undefined
    try {
      anime = (await getAnimePage({ pageNum: 1, pageSize: 20, keyword: detail.name })).rows.find(
        (row) => row.id === id,
      )
    } catch {
      /* 详情接口成功时仍可展示基础资料。 */
    }
    if (!anime) {
      anime = {
        id: detail.id,
        name: detail.name,
        aliasNames: detail.aliasNames,
        tags: detail.tagIds.map((tagId) => ({ id: tagId, name: `#${tagId}` })),
        episodeCount: detail.episodeCount,
        broadcastType: { id: detail.broadcastTypeId, name: `#${detail.broadcastTypeId}` },
        adaptationType: { id: detail.adaptationTypeId, name: `#${detail.adaptationTypeId}` },
        airDate: detail.airDate,
        coverImageUrl: detail.coverImageUrl,
        status: detail.status,
        region: { id: detail.regionId, name: `#${detail.regionId}` },
        companies: detail.companies.map((company) => ({
          companyId: company.companyId,
          companyName: `#${company.companyId}`,
          role: company.role,
        })),
        externalLinks: detail.externalLinks,
        personalRating: detail.personalRatingScore,
        series:
          detail.seriesId === null
            ? null
            : { id: detail.seriesId, name: `#${detail.seriesId}`, description: null },
      }
    }
    if (route.fullPath === ownerFullPath) openCrudDrawer('detail', anime)
  } catch (error) {
    if (route.fullPath === ownerFullPath)
      showToast('详情读取失败', error instanceof Error ? error.message : '请稍后重试。', 'error')
  }
}

function closeCrudDrawer() {
  drawerMode.value = null
}

async function handleAnimeSaved(anime: { id: number; name: string }) {
  closeCrudDrawer()
  showToast('保存成功', `“${anime.name}”的动画资料已更新。`)
  await Promise.all([loadPage(page.value.pageNum), loadStats()])
}

function handleDrawerDelete(anime: AnimePageItem) {
  closeCrudDrawer()
  openDeleteModal(anime)
}

function refreshPage() {
  void loadPage(page.value.pageNum)
  void loadStats()
}

function getSafeExternalUrl(url: string) {
  try {
    const parsedUrl = new URL(url)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? url : undefined
  } catch {
    return undefined
  }
}

function getExternalLinkLabel(title: string | null) {
  return title?.trim().slice(0, 2).toUpperCase() || '外链'
}

function getCoverGradient(id: number) {
  const gradients = [
    'linear-gradient(145deg, #d95f86, #7567aa)',
    'linear-gradient(145deg, #658dc5, #8b75b8)',
    'linear-gradient(145deg, #d9865f, #a35274)',
    'linear-gradient(145deg, #56a499, #4777a8)',
  ]
  return gradients[id % gradients.length]
}
</script>

<template>
  <div class="anime-management-page">
    <section class="page-hero" aria-labelledby="pageTitle">
      <div class="hero-copy">
        <p class="eyebrow">Content Archive / Animation</p>
        <h1 id="pageTitle">动画管理 <span>ANIME INDEX</span></h1>
        <p class="hero-description">
          编目、检索并维护动画资料。让每一条放送记录、制作关系与个人评分都有清晰归档。
        </p>
      </div>
      <div class="hero-actions">
        <div class="archive-mascot" aria-hidden="true">
          <span class="mascot-orbit"></span>
          <span class="mascot-body">
            <span class="mascot-face">
              <span class="mascot-eye"></span>
              <span class="mascot-eye"></span>
            </span>
          </span>
        </div>
        <RouterLink class="primary-button" to="/admin/anime/create">
          <AdminIcon name="plus" />
          新增动画
        </RouterLink>
      </div>
    </section>

    <section class="stats-grid" aria-label="动画资料统计">
      <article class="stat-card">
        <div class="stat-icon"><AdminIcon name="archive" /></div>
        <div class="stat-copy">
          <span>动画总数</span><strong>{{ stats.total ?? '—' }}</strong>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon"><AdminIcon name="play" /></div>
        <div class="stat-copy">
          <span>放送中</span><strong>{{ stats.ongoing ?? '—' }}</strong>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon"><AdminIcon name="clock" /></div>
        <div class="stat-copy">
          <span>未放送</span><strong>{{ stats.upcoming ?? '—' }}</strong>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-icon"><AdminIcon name="check" /></div>
        <div class="stat-copy">
          <span>已完结</span><strong>{{ stats.completed ?? '—' }}</strong>
        </div>
      </article>
    </section>

    <section class="card filter-card" aria-labelledby="filterTitle">
      <div class="section-heading">
        <div class="section-title">
          <span class="section-title-mark" aria-hidden="true"></span>
          <div>
            <h2 id="filterTitle">检索资料</h2>
            <p>组合筛选条件，快速定位动画记录</p>
          </div>
        </div>
        <button
          class="ghost-button"
          type="button"
          :aria-expanded="showAdvancedFilters"
          aria-controls="moreFilterPanel"
          @click="showAdvancedFilters = !showAdvancedFilters"
        >
          <AdminIcon name="filter" />
          <span>更多筛选</span>
          <span v-if="advancedFilterCount">· {{ advancedFilterCount }}</span>
        </button>
      </div>

      <form novalidate @submit.prevent="submitQuery" @reset.prevent="resetFilters">
        <div class="filter-grid">
          <div class="field keyword-field">
            <label for="keyword"
              >名称关键词 <span class="field-label-note">名称 / 别名 / 系列</span></label
            >
            <div class="input-shell">
              <AdminIcon class="input-icon" name="search-full" />
              <input
                id="keyword"
                v-model="form.keyword"
                class="has-icon"
                type="search"
                placeholder="输入动画名称、别名或系列"
                autocomplete="off"
              />
            </div>
          </div>

          <div class="field">
            <div class="tag-field-head">
              <span class="field-label">标签</span>
              <div class="tag-match-control" role="group" aria-label="标签匹配方式">
                <button
                  type="button"
                  :class="{ active: form.tagMatchMode === 'ALL' }"
                  :aria-pressed="form.tagMatchMode === 'ALL'"
                  title="同时包含所有已选标签"
                  @click="form.tagMatchMode = 'ALL'"
                >
                  全部满足
                </button>
                <button
                  type="button"
                  :class="{ active: form.tagMatchMode === 'ANY' }"
                  :aria-pressed="form.tagMatchMode === 'ANY'"
                  title="包含任意一个已选标签"
                  @click="form.tagMatchMode = 'ANY'"
                >
                  满足其一
                </button>
              </div>
            </div>
            <button
              class="multi-select-trigger"
              type="button"
              aria-haspopup="listbox"
              :aria-expanded="showTagDropdown"
              @click="showTagDropdown = !showTagDropdown"
            >
              <span class="multi-select-value">{{ selectedTagText }}</span>
              <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 10 5 5 5-5" />
              </svg>
            </button>
            <div class="dropdown-panel tag-dropdown-panel" :class="{ open: showTagDropdown }">
              <input
                v-model="tagSearch"
                class="dropdown-search"
                type="search"
                placeholder="搜索标签"
                aria-label="搜索标签"
              />
              <ul class="option-list" role="listbox" aria-multiselectable="true">
                <li v-if="!filteredTags.length" class="option-empty">没有可选标签</li>
                <li v-for="tag in filteredTags" :key="tag.id">
                  <button
                    class="tag-option"
                    type="button"
                    role="option"
                    :aria-selected="form.tagIds.includes(tag.id)"
                    :class="{ selected: form.tagIds.includes(tag.id) }"
                    @click="toggleTag(tag.id)"
                  >
                    {{ tag.name }}
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div class="field">
            <span class="field-label">排序字段</span>
            <div class="segmented-control" role="group" aria-label="排序字段">
              <button
                class="segment-button"
                :class="{ active: form.sortBy === 'BROADCAST_DATE' }"
                type="button"
                :aria-pressed="form.sortBy === 'BROADCAST_DATE'"
                @click="form.sortBy = 'BROADCAST_DATE'"
              >
                放送日期
              </button>
              <button
                class="segment-button"
                :class="{ active: form.sortBy === 'PERSONAL_RATING' }"
                type="button"
                :aria-pressed="form.sortBy === 'PERSONAL_RATING'"
                @click="form.sortBy = 'PERSONAL_RATING'"
              >
                个人评分
              </button>
            </div>
          </div>

          <div class="field sort-direction-compact">
            <span class="field-label">方向</span>
            <button
              class="sort-direction-button"
              type="button"
              :aria-label="
                form.sortDirection === 'DESC'
                  ? '当前为倒序，点击切换为正序'
                  : '当前为正序，点击切换为倒序'
              "
              :title="form.sortDirection === 'DESC' ? '倒序排列' : '正序排列'"
              @click="toggleSortDirection"
            >
              <AdminIcon :name="form.sortDirection === 'DESC' ? 'sort-desc' : 'sort-asc'" />
            </button>
          </div>

          <div class="filter-actions">
            <button class="secondary-button" type="reset"><AdminIcon name="reset" />重置</button>
            <button class="primary-button" type="submit">
              <AdminIcon name="search-full" />查询
            </button>
          </div>
        </div>

        <div id="moreFilterPanel" class="more-filter" :class="{ open: showAdvancedFilters }">
          <div class="more-filter-inner">
            <div class="advanced-grid">
              <div class="field">
                <label for="status">动画状态</label>
                <ArchiveSelect
                  id="status"
                  v-model="form.status"
                  label="动画状态"
                  placeholder="全部状态"
                  :options="statusOptions"
                />
              </div>
              <div class="field">
                <label for="broadcastTypeId">放送类型</label>
                <ArchiveSelect
                  id="broadcastTypeId"
                  v-model="form.broadcastTypeId"
                  label="放送类型"
                  placeholder="全部类型"
                  :options="broadcastTypes"
                />
              </div>
              <div class="field">
                <label for="adaptationTypeId">改编类型</label>
                <ArchiveSelect
                  id="adaptationTypeId"
                  v-model="form.adaptationTypeId"
                  label="改编类型"
                  placeholder="全部来源"
                  :options="adaptationTypes"
                />
              </div>
              <div class="field">
                <label for="regionId">地区</label>
                <ArchiveSelect
                  id="regionId"
                  v-model="form.regionId"
                  label="地区"
                  placeholder="全部地区"
                  :options="regions"
                />
              </div>

              <div
                class="field advanced-company-field"
                :class="{ 'has-error': validationMessage.includes('制作公司') }"
              >
                <label for="companyKeyword"
                  >制作公司 <span class="field-label-note">联想选择</span></label
                >
                <div class="input-shell">
                  <AdminIcon class="input-icon" name="companies" />
                  <input
                    id="companyKeyword"
                    v-model="form.companyKeyword"
                    class="has-icon"
                    type="text"
                    placeholder="输入公司名称"
                    autocomplete="off"
                    aria-autocomplete="list"
                    @input="handleCompanyInput"
                    @focus="showCompanySuggestions = true"
                    @blur="hideCompanySuggestions"
                  />
                </div>
                <div
                  class="suggestion-panel"
                  :class="{ open: showCompanySuggestions && companySuggestions.length }"
                  role="listbox"
                >
                  <button
                    v-for="company in companySuggestions"
                    :key="company.id"
                    class="company-suggestion-item"
                    type="button"
                    role="option"
                    @mousedown.prevent="selectCompany(company)"
                  >
                    {{ company.name }}
                  </button>
                </div>
                <div class="selected-company" :class="{ visible: form.companyId }">
                  <span>✓</span><span>已选择 {{ form.companyKeyword }}</span>
                </div>
                <p class="field-error">请从联想结果中选择制作公司</p>
              </div>

              <div class="date-filter-group" :class="{ 'range-enabled': dateRangeEnabled }">
                <div class="date-filter-head">
                  <div class="date-filter-title">
                    <span>放送日期</span
                    ><span class="date-filter-mode">{{
                      dateRangeEnabled ? '范围查询' : '精确查询'
                    }}</span>
                  </div>
                  <label class="date-mode-switch"
                    ><span>范围选择</span
                    ><input
                      v-model="dateRangeEnabled"
                      type="checkbox"
                      role="switch"
                      @change="handleDateRangeModeChange" /><span class="date-mode-track"
                      ><span class="date-mode-thumb"></span></span
                  ></label>
                </div>
                <div class="date-filter-inputs">
                  <div class="field" :class="{ 'has-error': dateErrors.broadcastStartDate }">
                    <label for="broadcastStartDate"
                      ><span>{{ dateRangeEnabled ? '起始日期' : '固定日期' }}</span
                      ><span class="field-label-note">年 / 年月</span></label
                    >
                    <ArchiveDateInput
                      id="broadcastStartDate"
                      v-model="form.broadcastStartDate"
                      :label="dateRangeEnabled ? '起始日期' : '固定日期'"
                      placeholder="输入日期"
                      :invalid="Boolean(dateErrors.broadcastStartDate)"
                      described-by="broadcastStartDateError"
                      @typing="clearDateError('broadcastStartDate')"
                      @blur="handleDateBlur('broadcastStartDate')"
                      @commit="handleDateBlur('broadcastStartDate')"
                    />
                    <p id="broadcastStartDateError" class="field-error">
                      {{ dateErrors.broadcastStartDate }}
                    </p>
                  </div>
                  <div
                    class="field range-end-date"
                    :class="{ 'has-error': dateErrors.broadcastEndDate }"
                  >
                    <label for="broadcastEndDate">
                      截止日期 <span class="field-label-note">年 / 年月</span></label
                    >
                    <ArchiveDateInput
                      id="broadcastEndDate"
                      v-model="form.broadcastEndDate"
                      label="截止日期"
                      placeholder="输入日期"
                      :disabled="!dateRangeEnabled"
                      align-end
                      :invalid="Boolean(dateErrors.broadcastEndDate)"
                      described-by="broadcastEndDateError"
                      @typing="clearDateError('broadcastEndDate')"
                      @blur="handleDateBlur('broadcastEndDate')"
                      @commit="handleDateBlur('broadcastEndDate')"
                    />
                    <p id="broadcastEndDateError" class="field-error">
                      {{ dateErrors.broadcastEndDate }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="rating-filter-group" :class="{ 'range-enabled': ratingRangeEnabled }">
                <div class="date-filter-head">
                  <div class="date-filter-title">
                    <span>个人评分</span
                    ><span class="date-filter-mode">{{
                      ratingRangeEnabled ? '范围查询' : '精确查询'
                    }}</span>
                  </div>
                  <label class="date-mode-switch"
                    ><span>范围筛选</span
                    ><input
                      v-model="ratingRangeEnabled"
                      type="checkbox"
                      role="switch"
                      @change="handleRatingRangeModeChange" /><span class="date-mode-track"
                      ><span class="date-mode-thumb"></span></span
                  ></label>
                </div>
                <div class="rating-filter-inputs">
                  <div class="field" :class="{ 'has-error': ratingErrors.ratingMin }">
                    <label for="ratingMin"
                      ><span>{{ ratingRangeEnabled ? '最低评分' : '固定评分' }}</span></label
                    >
                    <div class="input-shell score-input-shell">
                      <input
                        id="ratingMin"
                        v-model="form.ratingMin"
                        type="text"
                        inputmode="numeric"
                        placeholder="输入评分"
                        autocomplete="off"
                        :aria-invalid="Boolean(ratingErrors.ratingMin)"
                        aria-describedby="ratingMinError"
                        @input="clearRatingError('ratingMin')"
                        @blur="handleRatingBlur('ratingMin')"
                      />
                      <span class="score-input-suffix" aria-hidden="true">/ 10</span>
                    </div>
                    <p id="ratingMinError" class="field-error">{{ ratingErrors.ratingMin }}</p>
                  </div>
                  <div
                    class="field range-rating-field"
                    :class="{ 'has-error': ratingErrors.ratingMax }"
                  >
                    <label for="ratingMax">最高评分</label>
                    <div class="input-shell score-input-shell">
                      <input
                        id="ratingMax"
                        v-model="form.ratingMax"
                        type="text"
                        inputmode="numeric"
                        placeholder="输入评分"
                        autocomplete="off"
                        :disabled="!ratingRangeEnabled"
                        :aria-invalid="Boolean(ratingErrors.ratingMax)"
                        aria-describedby="ratingMaxError"
                        @input="clearRatingError('ratingMax')"
                        @blur="handleRatingBlur('ratingMax')"
                      />
                      <span class="score-input-suffix" aria-hidden="true">/ 10</span>
                    </div>
                    <p id="ratingMaxError" class="field-error">{{ ratingErrors.ratingMax }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p v-if="validationMessage" class="form-alert error">{{ validationMessage }}</p>
        <p v-if="catalogWarning" class="form-alert warning">{{ catalogWarning }}</p>
        <div class="active-filter-bar" :class="{ visible: activeFilterCount }">
          <span class="active-filter-label">已生效</span>
          <div class="active-filter-list">
            <span v-for="chip in activeFilterChips" :key="chip.key" class="filter-chip">
              {{ chip.label
              }}<button
                type="button"
                :aria-label="`移除 ${chip.label}`"
                @click="clearFilter(chip.key)"
              >
                <AdminIcon name="close" />
              </button>
            </span>
          </div>
          <button class="ghost-button" type="button" @click="resetFilters">清除全部</button>
        </div>
      </form>
    </section>

    <section class="card list-card" aria-labelledby="listTitle">
      <div class="list-header">
        <div class="list-title">
          <h2 id="listTitle">动画资料列表</h2>
          <span
            >共 <strong>{{ page.total }}</strong> 条记录</span
          >
        </div>
        <div class="list-tools">
          <div class="sort-summary">
            <span>当前排序</span><strong>{{ sortSummary }}</strong
            ><span>／ID 倒序</span>
          </div>
          <button class="ghost-button" type="button" :disabled="loading" @click="refreshPage">
            <AdminIcon name="refresh" /><span>刷新</span>
          </button>
        </div>
      </div>

      <div class="table-scroll">
        <table v-show="!loading && !errorMessage && page.rows.length" class="anime-table">
          <caption class="sr-only">
            动画资料分页列表
          </caption>
          <thead>
            <tr>
              <th class="cover-cell" scope="col">封面</th>
              <th class="work-cell" scope="col">动画 / 别名 / 系列</th>
              <th class="tag-cell" scope="col">标签</th>
              <th class="meta-cell" scope="col">集数 / 放送 / 改编</th>
              <th class="date-cell" scope="col">开始放送</th>
              <th class="status-cell" scope="col">状态</th>
              <th class="region-cell" scope="col">地区</th>
              <th class="company-cell" scope="col">制作公司</th>
              <th class="rating-cell" scope="col">个人评分</th>
              <th class="external-cell" scope="col">外部链接</th>
              <th class="action-cell" scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="anime in page.rows" :key="anime.id">
              <td class="cover-cell">
                <div
                  v-if="!anime.coverImageUrl"
                  class="cover"
                  :style="{ '--cover-gradient': getCoverGradient(anime.id) }"
                >
                  <span class="cover-code">{{ anime.name.slice(0, 2) }}</span>
                </div>
                <div v-else class="cover">
                  <img :src="anime.coverImageUrl" :alt="`${anime.name}封面`" loading="lazy" />
                </div>
              </td>
              <td class="work-cell">
                <strong class="work-title" :title="anime.name">{{ anime.name }}</strong>
                <span class="work-alias" :title="anime.aliasNames.join(' · ')">{{
                  anime.aliasNames.join(' · ') || '暂无别名'
                }}</span>
                <span class="work-series"
                  ><AdminIcon name="series" />{{ anime.series?.name || '未归属系列' }}</span
                >
              </td>
              <td class="tag-cell">
                <div class="tag-list">
                  <span v-for="tag in anime.tags.slice(0, 3)" :key="tag.id" class="tag">{{
                    tag.name
                  }}</span
                  ><span
                    v-if="anime.tags.length > 3"
                    class="tag more"
                    :title="
                      anime.tags
                        .slice(3)
                        .map((tag) => tag.name)
                        .join('、')
                    "
                    >+{{ anime.tags.length - 3 }}</span
                  >
                </div>
              </td>
              <td class="meta-cell">
                <div class="meta-stack">
                  <span
                    ><strong>{{ anime.episodeCount ?? '—' }}</strong> 集</span
                  ><span
                    >{{ anime.broadcastType?.name || '—' }} ·
                    {{ anime.adaptationType?.name || '—' }}</span
                  >
                </div>
              </td>
              <td class="date-cell">
                <span class="date-main">{{ anime.airDate || '待定' }}</span
                ><span class="date-sub">{{
                  anime.airDate ? `${anime.airDate.slice(0, 4)} 年档案` : '日期未录入'
                }}</span>
              </td>
              <td class="status-cell">
                <span class="status-badge" :class="`status-${anime.status}`">{{
                  statusNames[anime.status] || '未知'
                }}</span>
              </td>
              <td class="region-cell">
                <span class="company-name">{{ anime.region?.name || '—' }}</span>
              </td>
              <td class="company-cell">
                <span class="company-name" :title="anime.companies[0]?.companyName">{{
                  anime.companies[0]?.companyName || '—'
                }}</span
                ><span class="company-role">{{ anime.companies[0]?.role || '暂无角色' }}</span>
              </td>
              <td class="rating-cell">
                <span v-if="anime.personalRating !== null" class="rating"
                  ><span class="rating-star">★</span
                  ><strong>{{ anime.personalRating.toFixed(1) }}</strong
                  ><span>/10</span></span
                ><span v-else class="empty-value">暂无</span>
              </td>
              <td class="external-cell">
                <div class="external-links">
                  <a
                    v-for="link in anime.externalLinks.slice(0, 3)"
                    :key="link.url"
                    class="external-link"
                    :href="getSafeExternalUrl(link.url)"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="link.title || link.url"
                    >{{ getExternalLinkLabel(link.title) }}</a
                  ><span v-if="!anime.externalLinks.length" class="empty-value">—</span>
                </div>
              </td>
              <td class="action-cell">
                <div class="row-actions">
                  <button
                    class="row-action"
                    :aria-label="`查看 ${anime.name}`"
                    type="button"
                    title="查看"
                    @click="openCrudDrawer('detail', anime)"
                  >
                    <AdminIcon name="view" />
                  </button>
                  <button
                    class="row-action"
                    :aria-label="`编辑 ${anime.name}`"
                    type="button"
                    title="编辑"
                    @click="openCrudDrawer('edit', anime)"
                  >
                    <AdminIcon name="edit" />
                  </button>
                  <button
                    class="row-action danger"
                    type="button"
                    :aria-label="`删除 ${anime.name}`"
                    title="删除"
                    @click="openDeleteModal(anime)"
                  >
                    <AdminIcon name="delete" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div
          class="skeleton-body"
          :class="{ visible: loading }"
          aria-live="polite"
          aria-label="正在加载动画数据"
        >
          <div v-for="index in 4" :key="index" class="skeleton-row">
            <div class="skeleton-block skeleton-cover"></div>
            <div v-for="block in 6" :key="block" class="skeleton-block"></div>
          </div>
        </div>
        <div
          class="table-state"
          :class="{
            visible: !loading && !errorMessage && page.total === 0 && activeFilterCount === 0,
          }"
        >
          <div>
            <div class="table-state-visual" aria-hidden="true">
              <div class="empty-box"><span class="empty-box-face"></span></div>
            </div>
            <h3>资料库还是空的</h3>
            <p>尚未收录任何动画。创建第一条记录，让资料盒开始运转。</p>
            <RouterLink class="primary-button" to="/admin/anime/create"
              ><AdminIcon name="plus" />新增动画</RouterLink
            >
          </div>
        </div>
        <div
          class="table-state"
          :class="{
            visible: !loading && !errorMessage && page.total === 0 && activeFilterCount > 0,
          }"
        >
          <div>
            <div class="table-state-visual" aria-hidden="true">
              <div class="empty-box"><span class="empty-box-face"></span></div>
            </div>
            <h3>没有找到匹配的动画</h3>
            <p>可以尝试减少筛选条件、切换标签匹配模式，或检查制作公司是否已从联想结果中选择。</p>
            <button class="secondary-button" type="button" @click="resetFilters">重置筛选</button>
          </div>
        </div>
        <div class="table-state" :class="{ visible: !loading && !!errorMessage }">
          <div>
            <div class="error-visual" aria-hidden="true">!</div>
            <h3>资料读取失败</h3>
            <p>{{ errorMessage || '接口暂时没有响应，请检查网络连接后重试。' }}</p>
            <button class="secondary-button" type="button" @click="refreshPage">
              <AdminIcon name="refresh" />重新加载
            </button>
          </div>
        </div>
      </div>

      <div v-if="!loading && !errorMessage && page.total" class="pagination">
        <div class="page-summary">
          第 <strong>{{ resultRange.match(/\d+–\d+/)?.[0] }}</strong> 条，共
          <strong>{{ page.total }}</strong> 条 · {{ page.pageNum }}/{{ page.pages }} 页
        </div>
        <div class="page-controls">
          <label class="page-size-wrap">
            <span>每页</span>
            <ArchiveSelect
              id="pageSize"
              v-model="pageSizeModel"
              class="page-size-select"
              label="每页数量"
              placeholder="选择数量"
              placement="top"
              :show-placeholder-option="false"
              :options="pageSizeOptions"
            />
          </label>
          <button
            class="page-button"
            type="button"
            aria-label="上一页"
            :disabled="page.pageNum <= 1"
            @click="goToPage(page.pageNum - 1)"
          >
            <AdminIcon name="left" />
          </button>
          <template v-for="(item, index) in pageNumbers" :key="`${item}-${index}`"
            ><button
              v-if="typeof item === 'number'"
              class="page-button"
              :class="{ active: item === page.pageNum }"
              type="button"
              :aria-current="item === page.pageNum ? 'page' : undefined"
              @click="goToPage(item)"
            >
              {{ item }}</button
            ><span v-else class="page-ellipsis">…</span></template
          >
          <button
            class="page-button"
            type="button"
            aria-label="下一页"
            :disabled="page.pageNum >= page.pages"
            @click="goToPage(page.pageNum + 1)"
          >
            <AdminIcon name="right" />
          </button>
          <label class="jump-wrap"
            >跳至<input
              v-model.number="jumpPage"
              type="number"
              min="1"
              :max="page.pages"
              aria-label="跳转页码"
              @keyup.enter="jumpToPage"
            />页</label
          >
        </div>
      </div>
    </section>

    <AnimeCrudDrawer
      v-if="drawerMode && drawerAnime"
      ref="crudDrawer"
      :key="`${drawerMode}-${drawerAnime.id}`"
      :mode="drawerMode"
      :anime-id="drawerAnime.id"
      :anime="drawerAnime"
      @close="closeCrudDrawer"
      @saved="handleAnimeSaved"
      @edit="drawerMode = 'edit'"
      @delete="handleDrawerDelete"
    />

    <div
      class="modal-layer"
      :class="{ open: deleteTarget }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deleteDialogTitle"
      @click.self="closeDeleteModal"
    >
      <div class="dialog">
        <div class="dialog-icon" aria-hidden="true"><AdminIcon name="delete" /></div>
        <h2 id="deleteDialogTitle">确认删除这条动画？</h2>
        <p>删除后将从动画资料库中移除，且无法通过页面撤销。</p>
        <div class="delete-target">
          <div class="delete-target-cover">
            <img
              v-if="deleteTarget?.coverImageUrl"
              :src="deleteTarget.coverImageUrl"
              :alt="`${deleteTarget.name}封面`"
            />
            <span v-else aria-hidden="true">{{ deleteTarget?.name.slice(0, 1) || 'A' }}</span>
          </div>
          <span
            ><strong>{{ deleteTarget?.name || '—' }}</strong
            ><span>{{
              deleteTarget
                ? `${deleteTarget.broadcastType?.name || '未知类型'} · ${
                    deleteTarget.airDate || '日期待定'
                  }`
                : '—'
            }}</span></span
          >
        </div>
        <label class="dialog-delete-confirm">
          <input
            v-model="deleteConfirmed"
            type="checkbox"
            @change="deleteConfirmationMessage = ''"
          />
          <span>我已确认删除这条动画档案及其关联数据。</span>
        </label>
        <p v-if="deleteConfirmationMessage" class="dialog-checkbox-error" role="alert">
          {{ deleteConfirmationMessage }}
        </p>
        <div class="dialog-note">
          <span aria-hidden="true">!</span
          ><span>关联的别名、标签关系、公司关系与个人评分将由后端业务规则一并处理。</span>
        </div>
        <div class="dialog-actions">
          <button
            class="secondary-button"
            type="button"
            :disabled="deleteSubmitting"
            @click="closeDeleteModal"
          >
            取消</button
          ><button
            class="danger-button"
            type="button"
            :disabled="deleteSubmitting"
            @click="confirmDelete"
          >
            {{ deleteSubmitting ? '正在删除…' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <div class="toast-region" aria-live="polite" aria-atomic="true">
      <div v-if="toast" class="toast" :class="{ error: toast.type === 'error' }">
        <span class="toast-icon">{{ toast.type === 'error' ? '!' : '✓' }}</span
        ><span class="toast-copy"
          ><strong>{{ toast.title }}</strong
          ><span>{{ toast.message }}</span></span
        >
      </div>
    </div>
  </div>

  <div v-if="false" class="anime-page">
    <section class="anime-hero" aria-labelledby="animePageTitle">
      <div>
        <p class="page-eyebrow">Content Archive / Animation</p>
        <h1 id="animePageTitle">动画管理 <span>ANIME INDEX</span></h1>
        <p>编目、检索并维护动画资料，让放送记录、制作关系与个人评分清晰归档。</p>
      </div>
      <RouterLink class="primary-action" to="/admin/anime/create">＋ 新增动画</RouterLink>
    </section>

    <section class="anime-stats" aria-label="动画资料统计">
      <article>
        <span>动画总数</span><strong>{{ stats.total ?? '—' }}</strong>
      </article>
      <article>
        <span>放送中</span><strong>{{ stats.ongoing ?? '—' }}</strong>
      </article>
      <article>
        <span>未放送</span><strong>{{ stats.upcoming ?? '—' }}</strong>
      </article>
      <article>
        <span>已完结</span><strong>{{ stats.completed ?? '—' }}</strong>
      </article>
    </section>

    <section class="anime-card filter-card" aria-labelledby="filterTitle">
      <div class="section-heading">
        <div>
          <h2 id="filterTitle">检索资料</h2>
          <p>组合筛选条件，快速定位动画记录</p>
        </div>
        <button
          class="ghost-action"
          type="button"
          :aria-expanded="showAdvancedFilters"
          @click="showAdvancedFilters = !showAdvancedFilters"
        >
          更多筛选<span v-if="advancedFilterCount"> {{ advancedFilterCount }}</span>
        </button>
      </div>

      <form
        class="filter-form"
        novalidate
        @submit.prevent="submitQuery"
        @reset.prevent="resetFilters"
      >
        <div class="primary-filters">
          <label class="field keyword-field">
            <span>名称关键词 <small>名称 / 别名 / 系列</small></span>
            <input
              v-model.trim="form.keyword"
              type="search"
              placeholder="输入动画名称、别名或系列"
            />
          </label>

          <fieldset class="field tag-field">
            <legend>
              <span>标签</span>
              <span class="tag-mode">
                <button
                  type="button"
                  :class="{ active: form.tagMatchMode === 'ALL' }"
                  @click="form.tagMatchMode = 'ALL'"
                >
                  ALL
                </button>
                <button
                  type="button"
                  :class="{ active: form.tagMatchMode === 'ANY' }"
                  @click="form.tagMatchMode = 'ANY'"
                >
                  ANY
                </button>
              </span>
            </legend>
            <div class="tag-options">
              <label v-for="tag in tags" :key="tag.id">
                <input v-model="form.tagIds" type="checkbox" :value="tag.id" />
                <span>{{ tag.name }}</span>
              </label>
              <span v-if="!tags.length" class="option-placeholder">暂无标签选项</span>
            </div>
          </fieldset>

          <div class="field sort-field">
            <span>排序字段</span>
            <div class="sort-control">
              <button
                type="button"
                :class="{ active: form.sortBy === 'BROADCAST_DATE' }"
                @click="form.sortBy = 'BROADCAST_DATE'"
              >
                放送日期
              </button>
              <button
                type="button"
                :class="{ active: form.sortBy === 'PERSONAL_RATING' }"
                @click="form.sortBy = 'PERSONAL_RATING'"
              >
                个人评分
              </button>
            </div>
          </div>

          <button
            class="sort-direction"
            type="button"
            :aria-label="
              form.sortDirection === 'DESC'
                ? '当前倒序，点击切换为正序'
                : '当前正序，点击切换为倒序'
            "
            @click="toggleSortDirection"
          >
            {{ form.sortDirection === 'DESC' ? '↓' : '↑' }}
          </button>

          <div class="filter-actions">
            <button class="secondary-action" type="reset">重置</button>
            <button class="primary-action" type="submit">查询</button>
          </div>
        </div>

        <div v-show="showAdvancedFilters" class="advanced-filters">
          <label class="field">
            <span>动画状态</span>
            <select v-model="form.status">
              <option value="">全部状态</option>
              <option value="1">未放送</option>
              <option value="2">放送中</option>
              <option value="3">已完结</option>
              <option value="4">其他</option>
            </select>
          </label>
          <label class="field">
            <span>放送类型</span>
            <select v-model="form.broadcastTypeId">
              <option value="">全部类型</option>
              <option v-for="item in broadcastTypes" :key="item.id" :value="String(item.id)">
                {{ item.name }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>改编类型</span>
            <select v-model="form.adaptationTypeId">
              <option value="">全部来源</option>
              <option v-for="item in adaptationTypes" :key="item.id" :value="String(item.id)">
                {{ item.name }}
              </option>
            </select>
          </label>
          <label class="field">
            <span>地区</span>
            <select v-model="form.regionId">
              <option value="">全部地区</option>
              <option v-for="item in regions" :key="item.id" :value="String(item.id)">
                {{ item.name }}
              </option>
            </select>
          </label>

          <div class="field company-field">
            <label for="companyKeyword">制作公司</label>
            <input
              id="companyKeyword"
              v-model="form.companyKeyword"
              type="search"
              autocomplete="off"
              placeholder="输入公司名称并选择"
              @input="handleCompanyInput"
              @focus="handleCompanyInput"
              @blur="hideCompanySuggestions"
            />
            <div
              v-if="showCompanySuggestions && companySuggestions.length"
              class="company-suggestions"
              role="listbox"
            >
              <button
                v-for="company in companySuggestions"
                :key="company.id"
                class="company-suggestion-item"
                type="button"
                @mousedown.prevent="selectCompany(company)"
              >
                {{ company.name }}
              </button>
            </div>
          </div>

          <label class="field">
            <span>放送开始日期 <small>yyyy / yyyy-MM</small></span>
            <input v-model.trim="form.broadcastStartDate" type="text" placeholder="例如 2023-10" />
          </label>
          <label class="field">
            <span>放送结束日期 <small>yyyy / yyyy-MM</small></span>
            <input v-model.trim="form.broadcastEndDate" type="text" placeholder="例如 2024" />
          </label>
          <label class="field">
            <span>最低个人评分</span>
            <input
              v-model.trim="form.ratingMin"
              type="number"
              min="0"
              max="10"
              step="0.1"
              placeholder="0.0"
            />
          </label>
          <label class="field">
            <span>最高个人评分</span>
            <input
              v-model.trim="form.ratingMax"
              type="number"
              min="0"
              max="10"
              step="0.1"
              placeholder="10.0"
            />
          </label>
        </div>

        <p v-if="validationMessage" class="form-message error-message" role="alert">
          {{ validationMessage }}
        </p>
        <p v-if="catalogWarning" class="form-message warning-message">{{ catalogWarning }}</p>

        <div v-if="activeFilterCount" class="active-filter-bar">
          <span>已应用 {{ activeFilterCount }} 项筛选</span>
          <button type="reset">清除全部</button>
        </div>
      </form>
    </section>

    <section class="anime-card list-card" aria-labelledby="listTitle">
      <div class="list-heading">
        <div>
          <h2 id="listTitle">动画资料列表</h2>
          <span
            >共 <strong>{{ page.total }}</strong> 条记录</span
          >
        </div>
        <div class="list-tools">
          <span
            >当前排序：<strong>{{ sortSummary }}</strong
            >／ID 倒序</span
          >
          <button class="ghost-action" type="button" :disabled="loading" @click="refreshPage">
            刷新
          </button>
        </div>
      </div>

      <div class="table-wrap">
        <div v-if="loading" class="table-state" aria-live="polite">
          <span class="loading-spinner" aria-hidden="true"></span>
          <h3>正在读取动画资料</h3>
          <p>正在按照当前筛选条件查询，请稍候。</p>
        </div>

        <div v-else-if="errorMessage" class="table-state error-state" role="alert">
          <span class="state-icon">!</span>
          <h3>资料读取失败</h3>
          <p>{{ errorMessage }}</p>
          <button class="secondary-action" type="button" @click="loadPage(page.pageNum)">
            重新加载
          </button>
        </div>

        <div v-else-if="!page.rows.length" class="table-state">
          <span class="state-icon">□</span>
          <h3>{{ activeFilterCount ? '没有找到匹配的动画' : '资料库还是空的' }}</h3>
          <p>
            {{
              activeFilterCount
                ? '可以尝试减少筛选条件，或切换标签匹配模式。'
                : '尚未收录任何动画，可以稍后通过新增页面录入资料。'
            }}
          </p>
          <button
            v-if="activeFilterCount"
            class="secondary-action"
            type="button"
            @click="resetFilters"
          >
            重置筛选
          </button>
        </div>

        <table v-else class="anime-table">
          <caption class="sr-only">
            动画资料分页列表
          </caption>
          <thead>
            <tr>
              <th>封面</th>
              <th>动画 / 别名 / 系列</th>
              <th>标签</th>
              <th>集数 / 放送 / 改编</th>
              <th>开始放送</th>
              <th>状态</th>
              <th>地区</th>
              <th>制作公司</th>
              <th>个人评分</th>
              <th>外部链接</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="anime in page.rows" :key="anime.id">
              <td>
                <div class="anime-cover">
                  <img
                    v-if="anime.coverImageUrl"
                    :src="anime.coverImageUrl || undefined"
                    :alt="`${anime.name}封面`"
                    loading="lazy"
                  />
                  <span v-else>A{{ anime.id }}</span>
                </div>
              </td>
              <td class="work-column">
                <strong :title="anime.name">{{ anime.name }}</strong>
                <small :title="anime.aliasNames.join('、')">
                  {{ anime.aliasNames.length ? anime.aliasNames.join('、') : '暂无别名' }}
                </small>
                <small class="series-name">{{ anime.series?.name || '未归属系列' }}</small>
              </td>
              <td>
                <div class="tag-list">
                  <span v-for="tag in anime.tags.slice(0, 3)" :key="tag.id">{{ tag.name }}</span>
                  <span
                    v-if="anime.tags.length > 3"
                    :title="
                      anime.tags
                        .slice(3)
                        .map((tag) => tag.name)
                        .join('、')
                    "
                  >
                    +{{ anime.tags.length - 3 }}
                  </span>
                </div>
              </td>
              <td class="meta-column">
                <span
                  ><strong>{{ anime.episodeCount ?? '—' }}</strong> 集</span
                >
                <span>{{ anime.broadcastType?.name || '—' }}</span>
                <span>{{ anime.adaptationType?.name || '—' }}</span>
              </td>
              <td>{{ anime.airDate || '—' }}</td>
              <td>
                <span class="status-badge" :class="`status-${anime.status}`">{{
                  statusNames[anime.status] || '未知'
                }}</span>
              </td>
              <td>{{ anime.region?.name || '—' }}</td>
              <td class="company-column">
                <strong>{{ anime.companies[0]?.companyName || '—' }}</strong>
                <small v-if="anime.companies[0]">{{
                  anime.companies[0]?.role || '参与制作'
                }}</small>
                <small v-if="anime.companies.length > 1"
                  >另有 {{ anime.companies.length - 1 }} 家</small
                >
              </td>
              <td>
                <span v-if="anime.personalRating !== null" class="rating"
                  >★ {{ Number(anime.personalRating).toFixed(1) }}</span
                >
                <span v-else class="empty-value">未评分</span>
              </td>
              <td>
                <div class="external-links">
                  <a
                    v-for="link in anime.externalLinks.slice(0, 3)"
                    :key="link.url"
                    :href="getSafeExternalUrl(link.url)"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="link.title || link.url"
                    >{{ getExternalLinkLabel(link.title) }}</a
                  >
                  <span v-if="!anime.externalLinks.length" class="empty-value">—</span>
                </div>
              </td>
              <td>
                <div class="row-actions">
                  <RouterLink :to="`/admin/anime/${anime.id}`" :aria-label="`查看 ${anime.name}`"
                    >查看</RouterLink
                  >
                  <RouterLink
                    :to="`/admin/anime/${anime.id}/edit`"
                    :aria-label="`编辑 ${anime.name}`"
                    >编辑</RouterLink
                  >
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!loading && !errorMessage && page.total" class="pagination">
        <span class="page-summary">{{ resultRange }}</span>
        <div class="page-controls">
          <label>
            每页
            <select v-model.number="pageSize" aria-label="每页数量" @change="changePageSize">
              <option :value="5">5 条</option>
              <option :value="10">10 条</option>
              <option :value="20">20 条</option>
              <option :value="50">50 条</option>
            </select>
          </label>
          <button type="button" :disabled="page.pageNum <= 1" @click="goToPage(page.pageNum - 1)">
            ‹
          </button>
          <template v-for="(item, index) in pageNumbers" :key="`${item}-${index}`">
            <button
              v-if="typeof item === 'number'"
              type="button"
              :class="{ active: item === page.pageNum }"
              :aria-current="item === page.pageNum ? 'page' : undefined"
              @click="goToPage(item)"
            >
              {{ item }}
            </button>
            <span v-else>…</span>
          </template>
          <button
            type="button"
            :disabled="page.pageNum >= page.pages"
            @click="goToPage(page.pageNum + 1)"
          >
            ›
          </button>
          <label>
            跳至
            <input
              v-model.number="jumpPage"
              type="number"
              min="1"
              :max="page.pages"
              @keyup.enter="jumpToPage"
            />
            页
          </label>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
@media not all {
  .anime-page {
    display: grid;
    gap: 20px;
  }

  .anime-hero,
  .section-heading,
  .list-heading,
  .list-tools,
  .filter-actions,
  .page-controls,
  .pagination {
    display: flex;
    align-items: center;
  }

  .anime-hero {
    justify-content: space-between;
    gap: 24px;
    padding: 4px 2px 10px;
  }

  .anime-hero h1 {
    margin: 5px 0 8px;
    font-family: 'Noto Serif SC', 'STSong', serif;
    font-size: clamp(26px, 3vw, 38px);
    line-height: 1.2;
  }

  .anime-hero h1 span {
    color: var(--accent);
    font-size: 11px;
    letter-spacing: 0.12em;
  }

  .anime-hero p:last-child,
  .section-heading p {
    margin: 0;
    color: var(--ink-soft);
  }

  .anime-hero .page-eyebrow {
    font-size: 10px;
  }

  .anime-hero p:last-child {
    font-size: 12px;
  }

  .anime-page .primary-action,
  .anime-page .secondary-action {
    font-size: 12px;
  }

  .anime-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .anime-stats article {
    display: flex;
    min-height: 86px;
    align-items: center;
    justify-content: space-between;
    padding: 18px 20px;
    background: rgba(255, 255, 255, 0.86);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: 0 8px 26px rgba(37, 31, 67, 0.05);
  }

  .anime-stats span {
    color: var(--ink-soft);
    font-size: 10px;
  }

  .anime-stats strong {
    color: var(--accent-strong);
    font-family: 'Noto Serif SC', 'STSong', serif;
    font-size: 22px;
    line-height: 1.15;
  }

  .anime-card {
    overflow: visible;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid var(--line);
    border-radius: 20px;
    box-shadow: 0 14px 42px rgba(37, 31, 67, 0.07);
  }

  .section-heading,
  .list-heading {
    justify-content: space-between;
    gap: 20px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--line);
  }

  .section-heading h2,
  .list-heading h2 {
    margin: 0;
    font-family: 'Noto Serif SC', 'STSong', serif;
    font-size: 16px;
  }

  .section-heading p,
  .list-heading span,
  .list-tools {
    font-size: 10px;
  }

  .ghost-action,
  .secondary-action {
    min-height: 36px;
    padding: 0 14px;
    color: var(--ink-soft);
    background: var(--surface-muted);
    border: 1px solid var(--line);
    border-radius: 9px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 650;
  }

  .ghost-action:hover,
  .secondary-action:hover {
    color: var(--accent-strong);
    border-color: rgba(217, 95, 134, 0.35);
  }

  .filter-form {
    padding: 18px 20px;
  }

  .primary-filters {
    display: grid;
    grid-template-columns: minmax(220px, 1.5fr) minmax(230px, 1.5fr) minmax(200px, 1.2fr) 44px auto;
    gap: 12px;
    align-items: end;
  }

  .field {
    position: relative;
    display: grid;
    min-width: 0;
    gap: 6px;
    padding: 0;
    margin: 0;
    border: 0;
  }

  .field > span,
  .field > label,
  .field legend {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--ink-soft);
    font-size: 10px;
    font-weight: 700;
  }

  .field small {
    color: #9693a8;
    font-size: 9px;
    font-weight: 500;
  }

  .field input,
  .field select,
  .page-controls select,
  .page-controls input {
    width: 100%;
    height: 39px;
    padding: 0 11px;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 9px;
    outline: none;
    font: inherit;
  }

  .field input:focus,
  .field select:focus,
  .page-controls input:focus,
  .page-controls select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(217, 95, 134, 0.14);
  }

  .tag-field legend {
    width: 100%;
    margin-bottom: 6px;
  }

  .tag-mode,
  .sort-control {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .tag-mode button,
  .sort-control button {
    height: 28px;
    padding: 0 9px;
    color: var(--ink-soft);
    background: transparent;
    border: 0;
    border-radius: 7px;
    cursor: pointer;
    font-size: 9px;
  }

  .tag-mode button.active,
  .sort-control button.active {
    color: var(--accent-strong);
    background: #f9dce6;
  }

  .tag-options {
    display: flex;
    height: 39px;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    overflow-x: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 9px;
  }

  .tag-options label {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    cursor: pointer;
  }

  .tag-options input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .tag-options label span,
  .option-placeholder {
    padding: 4px 8px;
    color: #7567aa;
    background: #e9e4f7;
    border: 1px solid transparent;
    border-radius: 999px;
    font-size: 9px;
    white-space: nowrap;
  }

  .tag-options input:checked + span {
    color: #fff;
    background: #7567aa;
  }

  .sort-control {
    height: 39px;
    padding: 4px;
    background: var(--surface-muted);
    border: 1px solid var(--line);
    border-radius: 9px;
  }

  .sort-control button {
    height: 29px;
    flex: 1;
  }

  .sort-direction {
    width: 42px;
    height: 39px;
    color: var(--accent-strong);
    background: #f9dce6;
    border: 1px solid rgba(217, 95, 134, 0.2);
    border-radius: 9px;
    cursor: pointer;
    font-size: 20px;
  }

  .filter-actions {
    gap: 7px;
  }

  .filter-actions .primary-action,
  .filter-actions .secondary-action {
    min-width: 64px;
  }

  .advanced-filters {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px 12px;
    padding-top: 18px;
    margin-top: 18px;
    border-top: 1px dashed var(--line);
  }

  .company-field {
    z-index: 5;
    grid-column: span 2;
  }

  .company-suggestions {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    left: 0;
    display: grid;
    max-height: 230px;
    padding: 6px;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 11px;
    box-shadow: 0 16px 40px rgba(37, 31, 67, 0.16);
  }

  .company-suggestions button {
    display: grid;
    gap: 2px;
    padding: 8px;
    background: transparent;
    border: 0;
    border-radius: 7px;
    cursor: pointer;
    text-align: left;
  }

  .company-suggestions strong {
    font-size: 11px;
  }

  .company-suggestions button:hover {
    background: var(--surface-muted);
  }

  .company-suggestions small {
    overflow: hidden;
    color: #9693a8;
    font-size: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .form-message {
    margin: 12px 0 0;
    padding: 9px 11px;
    border-radius: 8px;
    font-size: 10px;
  }

  .error-message {
    color: #a93e4d;
    background: #fde4e7;
  }

  .warning-message {
    color: #8a671f;
    background: #fff1c9;
  }

  .active-filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    margin-top: 14px;
    color: var(--ink-soft);
    background: var(--surface-muted);
    border-radius: 9px;
    font-size: 10px;
  }

  .active-filter-bar button {
    padding: 0;
    color: var(--accent-strong);
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .list-card {
    overflow: hidden;
  }

  .list-heading > div:first-child {
    display: grid;
    gap: 3px;
  }

  .list-tools {
    gap: 12px;
    color: #9693a8;
    font-size: 9px;
  }

  .list-tools strong,
  .list-heading strong {
    color: var(--ink);
  }

  .table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .anime-table {
    width: 100%;
    min-width: 1240px;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .anime-table th,
  .anime-table td {
    padding: 11px 9px;
    border-bottom: 1px solid var(--line);
    text-align: left;
    vertical-align: middle;
  }

  .anime-table td {
    font-size: 10px;
  }

  .anime-table th {
    color: #9693a8;
    background: var(--surface-muted);
    font-size: 9px;
    letter-spacing: 0.04em;
  }

  .anime-table th:nth-child(1) {
    width: 64px;
  }
  .anime-table th:nth-child(2) {
    width: 210px;
  }
  .anime-table th:nth-child(3) {
    width: 160px;
  }
  .anime-table th:nth-child(4) {
    width: 120px;
  }
  .anime-table th:nth-child(5) {
    width: 102px;
  }
  .anime-table th:nth-child(6),
  .anime-table th:nth-child(7) {
    width: 82px;
  }
  .anime-table th:nth-child(8) {
    width: 125px;
  }
  .anime-table th:nth-child(9) {
    width: 86px;
  }
  .anime-table th:nth-child(10) {
    width: 92px;
  }
  .anime-table th:nth-child(11) {
    width: 110px;
  }

  .anime-table tbody tr:hover {
    background: rgba(249, 220, 230, 0.22);
  }

  .anime-cover {
    display: grid;
    width: 42px;
    height: 56px;
    place-items: center;
    overflow: hidden;
    color: #fff;
    background: linear-gradient(145deg, #d95f86, #7567aa);
    border-radius: 8px 5px 8px 5px;
    font-family: 'Noto Serif SC', 'STSong', serif;
    font-size: 9px;
    font-weight: 800;
  }

  .anime-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .work-column > strong,
  .work-column > small,
  .company-column > strong,
  .company-column > small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .work-column > strong {
    font-family: 'Noto Serif SC', 'STSong', serif;
    font-size: 13px;
  }

  .work-column > small,
  .company-column > small,
  .meta-column span {
    margin-top: 3px;
    color: #9693a8;
    font-size: 9px;
  }

  .work-column .series-name {
    color: #7567aa;
  }

  .tag-list,
  .external-links,
  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag-list span {
    padding: 4px 7px;
    color: #7567aa;
    background: #e9e4f7;
    border-radius: 999px;
    font-size: 9px;
  }

  .meta-column span {
    display: block;
  }

  .meta-column strong {
    color: var(--ink);
  }

  .status-badge {
    display: inline-flex;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 9px;
    font-weight: 700;
    white-space: nowrap;
  }

  .status-1 {
    color: #9a711e;
    background: #fff1c9;
  }
  .status-2 {
    color: #237d78;
    background: #dff5f2;
  }
  .status-3 {
    color: #316f5e;
    background: #e0f2ec;
  }
  .status-4 {
    color: var(--ink-soft);
    background: var(--surface-muted);
  }

  .company-column strong {
    font-size: 10px;
  }

  .rating {
    color: #b77d14;
    font-family: 'Noto Serif SC', 'STSong', serif;
    font-size: 13px;
    font-weight: 800;
    white-space: nowrap;
  }

  .empty-value {
    color: #9693a8;
    font-size: 9px;
  }

  .external-links a,
  .row-actions a {
    display: inline-grid;
    min-width: 28px;
    height: 28px;
    padding: 0 5px;
    place-items: center;
    color: #7567aa;
    background: #e9e4f7;
    border-radius: 7px;
    font-size: 9px;
    font-weight: 700;
  }

  .row-actions a:hover,
  .external-links a:hover {
    color: var(--accent-strong);
    background: #f9dce6;
  }

  .table-state {
    display: grid;
    min-height: 300px;
    padding: 40px 20px;
    place-items: center;
    place-content: center;
    text-align: center;
  }

  .table-state h3 {
    margin: 12px 0 4px;
    font-family: 'Noto Serif SC', 'STSong', serif;
    font-size: 16px;
  }

  .table-state p {
    max-width: 420px;
    margin: 0 0 15px;
    color: var(--ink-soft);
    font-size: 10px;
  }

  .state-icon,
  .loading-spinner {
    display: grid;
    width: 56px;
    height: 56px;
    place-items: center;
    color: var(--accent-strong);
    background: #f9dce6;
    border-radius: 18px 11px;
    font-family: 'Noto Serif SC', 'STSong', serif;
    font-size: 22px;
    font-weight: 800;
  }

  .loading-spinner {
    width: 38px;
    height: 38px;
    background: transparent;
    border: 3px solid #f9dce6;
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 800ms linear infinite;
  }

  .pagination {
    min-height: 64px;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 20px;
    border-top: 1px solid var(--line);
  }

  .page-summary,
  .page-controls label {
    color: #9693a8;
  }

  .page-summary {
    font-size: 10px;
  }

  .page-controls label {
    font-size: 9px;
  }

  .page-controls {
    flex-wrap: wrap;
    gap: 6px;
  }

  .page-controls label {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .page-controls select {
    width: auto;
    height: 32px;
  }

  .page-controls input {
    width: 48px;
    height: 32px;
  }

  .page-controls > button {
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    color: var(--ink-soft);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    cursor: pointer;
    font-size: 10px;
  }

  .page-controls > button.active {
    color: var(--accent-strong);
    background: #f9dce6;
    border-color: rgba(217, 95, 134, 0.3);
  }

  .page-controls > button:disabled,
  .ghost-action:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 1120px) {
    .primary-filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .sort-direction {
      width: 100%;
    }

    .filter-actions {
      justify-content: flex-end;
    }
  }

  @media (max-width: 760px) {
    .anime-hero,
    .list-heading,
    .pagination {
      align-items: flex-start;
      flex-direction: column;
    }

    .anime-stats,
    .advanced-filters {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .company-field {
      grid-column: span 2;
    }

    .page-controls {
      width: 100%;
    }
  }

  @media (max-width: 520px) {
    .anime-stats,
    .primary-filters,
    .advanced-filters {
      grid-template-columns: 1fr;
    }

    .company-field {
      grid-column: auto;
    }

    .section-heading {
      align-items: flex-start;
      flex-direction: column;
    }
  }
}
</style>
