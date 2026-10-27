<script setup lang="ts">
/** 书籍管理：服务端筛选、排序与分页；表格和卡片共享同一页真实数据，按标识打开详情。 */
import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  shallowRef,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { deleteBooks, getBookPage, getBookTypes } from '@/api/book'
import { getAdaptationTypes, getRegions, getTags } from '@/api/catalog'
import { searchRelatedEntities } from '@/api/relatedEntities'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import WorkRelationsSummary from '@/components/admin/WorkRelationsSummary.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import AnimeEntitySelect from '@/components/admin/AnimeEntitySelect.vue'
import AnimeAirDateInput from '@/components/admin/AnimeAirDateInput.vue'
import BookCrudDrawer from './BookCrudDrawer.vue'
import { bookStatusNames, bookStatusOptions } from '@/config/bookFormOptions'
import { isBookReference, parseBookDateFilter, parseBookInteger } from '@/utils/bookForm'
import { pageSizeValues, readPreferences, resolvePageSize } from '@/utils/preferences'
import { useCatalogRefresh } from '@/utils/catalogChanges'
import { useModalLayer } from '@/utils/useModalLayer'
import type { NamedOption, PageResult } from '@/types/api'
import type { BookDetail, BookPageItem, BookPageQuery, BookSortField } from '@/types/book'

const route = useRoute(),
  router = useRouter(),
  ownerFullPath = route.fullPath
const active = ref(true),
  visible = computed(() => active.value && route.fullPath === ownerFullPath)
const initialKeyword = typeof route.query.keyword === 'string' ? route.query.keyword : ''
const defaults = () => ({
  keyword: '',
  tagIds: [] as number[],
  tagMatchMode: 'ALL' as 'ALL' | 'ANY',
  bookTypeId: '',
  adaptationTypeId: '',
  regionId: '',
  status: '',
  publishStartDate: '',
  publishEndDate: '',
  companyId: '',
  companyName: '',
  personId: '',
  personName: '',

  ratingMin: '',
  ratingMax: '',
  sortBy: (readPreferences().sortBy === 'PERSONAL_RATING'
    ? 'PERSONAL_RATING'
    : 'PUBLISH_DATE') as BookSortField,
  sortDirection: readPreferences().sortDirection,
})
const filters = reactive({ ...defaults(), keyword: initialKeyword })
// 公司和人物可以拥有相同数值标识，选择值带类型，查询仍使用原有业务字段。
const relatedEntityValue = computed({
  get: () =>
    filters.personId
      ? 'person:' + filters.personId
      : filters.companyId
        ? 'company:' + filters.companyId
        : '',
  set: (value: string) => {
    filters.companyId = filters.personId = ''
    filters.personName = ''
    const [kind, id] = value.split(':')
    if (kind === 'company' && id) filters.companyId = id
    if (kind === 'person' && id) filters.personId = id
  },
})
const relatedEntityName = computed({
  get: () => filters.companyName,
  set: (value: string) => {
    filters.companyName = value
    filters.personName = filters.personId ? value : ''
  },
})
const applied = ref({ ...filters, tagIds: [] as number[] })
const pageSize = ref(resolvePageSize(pageSizeValues, 20))
const page = ref<PageResult<BookPageItem>>({
  pageNum: 1,
  pageSize: pageSize.value,
  total: 0,
  pages: 0,
  rows: [],
})
const pageSizeOptions = pageSizeValues.map((id) => ({ id, name: `${id} 条` }))
const pageSizeModel = computed({
  get: () => String(pageSize.value),
  set: (value: string) => {
    pageSize.value = Number(value)
    void loadPage(1)
  },
})
const jumpPage = ref('1'),
  loading = ref(false),
  errorMessage = ref(''),
  validationMessage = ref(''),
  catalogError = ref('')
const showAdvanced = ref(false),
  showTags = ref(false),
  viewMode = ref<'table' | 'cards'>('table')
const bookTypes = ref<NamedOption[]>([]),
  adaptations = ref<NamedOption[]>([]),
  regions = ref<NamedOption[]>([]),
  tags = ref<NamedOption[]>([])
const tagSearch = ref('')
const tagDropdownRef = ref<HTMLElement>()
const dateRangeEnabled = ref(false)
const ratingRangeEnabled = ref(false)
const brokenCovers = ref(new Set<string>())
const stats = reactive<{
  total: number | null
  ongoing: number | null
  unpublished: number | null
  completed: number | null
}>({ total: null, ongoing: null, unpublished: null, completed: null })
type DeleteTarget = Pick<BookDetail, 'id' | 'name' | 'coverImageUrl' | 'publishDate'> & {
  bookType?: NamedOption
  bookTypeId?: number
}
const deleteTargets = ref<DeleteTarget[]>([]),
  deleteConfirmed = ref(false),
  deleteError = ref(''),
  deleting = ref(false)
const drawerId = ref<number>(),
  drawerMode = ref<'detail' | 'edit' | null>(null),
  drawer = ref<InstanceType<typeof BookCrudDrawer>>()
const pending = shallowRef<(() => void) | null>(null),
  toast = ref('')
const deleteDialog = useModalLayer(() => visible.value && !!deleteTargets.value.length, closeDelete)
const discardDialog = useModalLayer(
  () => visible.value && !!pending.value,
  () => {
    pending.value = null
  },
)
let pageController: AbortController | undefined,
  catalogController: AbortController | undefined,
  statsController: AbortController | undefined,
  toastTimer: number | undefined
let activated = false
const refreshCatalogs = useCatalogRefresh(['book', 'adaptation'], loadCatalogs)
function getCloseState() {
  const state = drawer.value?.getCloseState() ?? { dirty: false, submitting: false }
  return { dirty: state.dirty, submitting: state.submitting || deleting.value }
}
defineExpose({ getCloseState, openBookDetail: (id: number) => openDrawer('detail', id) })
onMounted(() => {
  document.addEventListener('pointerdown', closeTagDropdown)
  void refreshCatalogs()
  void loadStats()
  void loadPage(1)
  if (route.query.detail !== undefined) {
    const id = Number(route.query.detail)
    if (isBookReference(id)) openDrawer('detail', id)
    else validationMessage.value = '书籍标识无效，无法打开详情。'
  }
})
onActivated(() => {
  active.value = true
  if (activated) void loadPage(page.value.pageNum)
  activated = true
})
onDeactivated(() => {
  active.value = false
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeTagDropdown)
  pageController?.abort()
  catalogController?.abort()
  statsController?.abort()
  if (toastTimer) window.clearTimeout(toastTimer)
})

type FilterChipKey =
  | 'keyword'
  | 'tagIds'
  | 'bookTypeId'
  | 'adaptationTypeId'
  | 'regionId'
  | 'status'
  | 'companyId'
  | 'personId'
  | 'publishDate'
  | 'rating'
const filteredTags = computed(() => {
  const keyword = tagSearch.value.trim().toLocaleLowerCase()
  return tags.value.filter((tag) => !keyword || tag.name.toLocaleLowerCase().includes(keyword))
})
const selectedTagText = computed(() => {
  if (!filters.tagIds.length) return '选择标签'
  return (
    tags.value
      .filter((tag) => filters.tagIds.includes(tag.id))
      .map((tag) => tag.name)
      .join('、') || '已选择 ' + filters.tagIds.length + ' 个标签'
  )
})
const sortSummary = computed(
  () =>
    (applied.value.sortBy === 'PUBLISH_DATE' ? '首次发表日期' : '个人评分') +
    ' · ' +
    (applied.value.sortDirection === 'DESC' ? '倒序' : '正序'),
)
const advancedFilterCount = computed(
  () =>
    [
      filters.status,
      filters.bookTypeId,
      filters.adaptationTypeId,
      filters.regionId,
      filters.companyId,
      filters.personId,
      filters.publishStartDate || (dateRangeEnabled.value && filters.publishEndDate),
      filters.ratingMin || (ratingRangeEnabled.value && filters.ratingMax),
    ].filter(Boolean).length,
)
const activeFilterChips = computed(() => {
  const current = applied.value
  const chips: { key: FilterChipKey; label: string }[] = []
  const nameOf = (options: NamedOption[], id: string) =>
    options.find((option) => String(option.id) === id)?.name || '已选资料'
  if (current.keyword) chips.push({ key: 'keyword', label: '名称：' + current.keyword })
  if (current.tagIds.length)
    chips.push({
      key: 'tagIds',
      label:
        '标签（' +
        (current.tagMatchMode === 'ALL' ? '全部满足' : '满足其一') +
        '）：' +
        tags.value
          .filter((tag) => current.tagIds.includes(tag.id))
          .map((tag) => tag.name)
          .join('、'),
    })
  for (const [key, label, options] of [
    ['bookTypeId', '书籍类型', bookTypes.value],
    ['adaptationTypeId', '改编类型', adaptations.value],
    ['regionId', '地区', regions.value],
    ['status', '状态', bookStatusOptions],
  ] as const)
    if (current[key] !== '')
      chips.push({ key, label: label + '：' + nameOf(options, current[key]) })
  for (const [key, nameKey, label] of [
    ['companyId', 'companyName', '公司'],
    ['personId', 'personName', '人物'],
  ] as const)
    if (current[key]) chips.push({ key, label: label + '：' + current[nameKey] })
  if (current.publishStartDate || current.publishEndDate)
    chips.push({
      key: 'publishDate',
      label:
        '发表日期：' +
        (current.publishStartDate === current.publishEndDate
          ? current.publishStartDate
          : (current.publishStartDate || '不限') + ' 至 ' + (current.publishEndDate || '不限')),
    })
  if (current.ratingMin !== '' || current.ratingMax !== '')
    chips.push({
      key: 'rating',
      label:
        '评分：' +
        (current.ratingMin === current.ratingMax
          ? current.ratingMin
          : (current.ratingMin || '不限') + ' 至 ' + (current.ratingMax || '不限')),
    })
  return chips
})
function clearFilter(key: FilterChipKey) {
  if (key === 'tagIds') {
    filters.tagIds = []
    applied.value.tagIds = []
  } else if (key === 'publishDate') {
    filters.publishStartDate = filters.publishEndDate = ''
    applied.value.publishStartDate = applied.value.publishEndDate = ''
  } else if (key === 'rating') {
    filters.ratingMin = filters.ratingMax = ''
    applied.value.ratingMin = applied.value.ratingMax = ''
  } else if (key === 'companyId' || key === 'personId') {
    filters.companyId = filters.personId = ''
    filters.companyName = filters.personName = ''
    applied.value.companyId = applied.value.personId = ''
    applied.value.companyName = applied.value.personName = ''
  } else {
    filters[key] = ''
    applied.value[key] = ''
  }
  void loadPage(1)
}
function closeTagDropdown(event: PointerEvent) {
  if (!tagDropdownRef.value?.contains(event.target as Node)) showTags.value = false
}
function refreshPage() {
  void loadPage(page.value.pageNum)
  void loadStats()
}
function getCoverGradient(id: number) {
  return [
    'linear-gradient(145deg, #d95f86, #7567aa)',
    'linear-gradient(145deg, #658dc5, #8b75b8)',
    'linear-gradient(145deg, #d9865f, #a35274)',
    'linear-gradient(145deg, #56a499, #4777a8)',
  ][id % 4]
}
function markCoverBroken(url: string | null) {
  if (url) brokenCovers.value.add(url)
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
function showToast(message: string) {
  toast.value = message
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 5000)
}
async function loadCatalogs() {
  catalogController?.abort()
  const request = new AbortController()
  catalogController = request
  catalogError.value = ''
  const jobs = [
    getBookTypes(request.signal).then((value) => {
      if (!request.signal.aborted)
        bookTypes.value = value.sort(
          (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
        )
    }),
    getAdaptationTypes(request.signal).then((value) => {
      if (!request.signal.aborted)
        adaptations.value = value.sort(
          (left, right) => left.sortOrder - right.sortOrder || left.id - right.id,
        )
    }),
    getRegions(request.signal).then((value) => {
      if (!request.signal.aborted) regions.value = value
    }),
    (async () => {
      const first = await getTags(1, 100, request.signal)
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, first.pages - 1) }, (_, index) =>
          getTags(index + 2, 100, request.signal),
        ),
      )
      if (!request.signal.aborted)
        tags.value = first.rows.concat(rest.flatMap((result) => result.rows))
    })(),
  ]
  const results = await Promise.allSettled(jobs)
  if (!request.signal.aborted && results.some((result) => result.status === 'rejected'))
    catalogError.value = '部分筛选选项读取失败，请重新读取；已填写条件会保留。'
}
async function loadStats() {
  statsController?.abort()
  const request = new AbortController()
  statsController = request
  await Promise.all(
    (
      [
        ['total', undefined],
        ['ongoing', 2],
        ['unpublished', 1],
        ['completed', 3],
      ] as const
    ).map(async ([key, status]) => {
      try {
        const result = await getBookPage({ pageNum: 1, pageSize: 1, status }, request.signal)
        if (!request.signal.aborted) stats[key] = result.total
      } catch {
        if (!request.signal.aborted) stats[key] = null
      }
    }),
  )
}
function buildQuery(pageNum: number): BookPageQuery {
  const current = applied.value
  const id = (value: string) => (value === '' ? undefined : Number(value))
  return {
    pageNum,
    pageSize: pageSize.value,
    keyword: current.keyword.trim(),
    tagIds: current.tagIds,
    tagMatchMode: current.tagMatchMode,
    bookTypeId: id(current.bookTypeId),
    adaptationTypeId: id(current.adaptationTypeId),
    regionId: id(current.regionId),
    status: id(current.status),
    publishStartDate: current.publishStartDate,
    publishEndDate: current.publishEndDate,
    companyId: id(current.companyId),
    personId: id(current.personId),
    ratingMin: id(current.ratingMin),
    ratingMax: id(current.ratingMax),
    sortBy: current.sortBy,
    sortDirection: current.sortDirection,
  }
}
async function loadPage(pageNum: number) {
  pageController?.abort()
  const request = new AbortController()
  pageController = request
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await getBookPage(buildQuery(pageNum), request.signal)
    if (request.signal.aborted) return
    if (result.pages === 0 && pageNum > 1) {
      void loadPage(1)
      return
    }
    if (result.pages > 0 && pageNum > result.pages) {
      void loadPage(result.pages)
      return
    }
    page.value = result
    jumpPage.value = String(result.pageNum)
  } catch (error) {
    if (!request.signal.aborted) errorMessage.value = messageOf(error, '书籍列表读取失败，请重试。')
  } finally {
    if (pageController === request) loading.value = false
  }
}
function submitQuery() {
  validationMessage.value = ''
  const start = parseBookDateFilter(filters.publishStartDate),
    end = parseBookDateFilter(
      dateRangeEnabled.value ? filters.publishEndDate : filters.publishStartDate,
    )
  if (
    (filters.publishStartDate.trim() && !start) ||
    (dateRangeEnabled.value && filters.publishEndDate.trim() && !end)
  )
    validationMessage.value = '发表日期筛选请输入真实有效的 YYYY、YYYY-MM 或 YYYY-MM-DD。'
  else if (start && end && start.lower > end.upper)
    validationMessage.value = '开始日期不得晚于结束日期。'
  for (const key of (ratingRangeEnabled.value ? ['ratingMin', 'ratingMax'] : ['ratingMin']) as (
    | 'ratingMin'
    | 'ratingMax'
  )[])
    if (filters[key].trim() && parseBookInteger(filters[key], 0, 10) === null)
      validationMessage.value = '评分筛选只能填写 0 至 10 的整数。'
  if (
    ratingRangeEnabled.value &&
    filters.ratingMin !== '' &&
    filters.ratingMax !== '' &&
    Number(filters.ratingMin) > Number(filters.ratingMax)
  )
    validationMessage.value = '最低评分不得高于最高评分。'
  for (const key of [
    'bookTypeId',
    'adaptationTypeId',
    'regionId',
    'companyId',
    'personId',
  ] as const)
    if (filters[key] !== '' && !isBookReference(filters[key]))
      validationMessage.value = '请从选项中选择有效资料。'
  if (!/^(|[0-5])$/.test(filters.status)) validationMessage.value = '状态筛选无效。'
  if (filters.companyName.trim() && !filters.companyId && !filters.personId)
    validationMessage.value = '请从联想结果中明确选择公司或人物，不能只输入名称。'
  if (validationMessage.value) return
  filters.publishStartDate = start?.normalized ?? ''
  filters.publishEndDate = dateRangeEnabled.value ? (end?.normalized ?? '') : ''
  filters.keyword = filters.keyword.trim()
  filters.ratingMin = filters.ratingMin.trim()
  filters.ratingMax = ratingRangeEnabled.value ? filters.ratingMax.trim() : ''
  applied.value = {
    ...filters,
    tagIds: [...filters.tagIds],
    publishEndDate: dateRangeEnabled.value ? filters.publishEndDate : filters.publishStartDate,
    ratingMax: ratingRangeEnabled.value ? filters.ratingMax : filters.ratingMin,
  }
  showTags.value = false
  void loadPage(1)
}
function resetFilters() {
  Object.assign(filters, defaults())
  dateRangeEnabled.value = false
  ratingRangeEnabled.value = false
  tagSearch.value = ''
  showTags.value = false
  pageSize.value = resolvePageSize(pageSizeValues, 20)
  applied.value = { ...filters, tagIds: [] }
  validationMessage.value = ''
  void loadPage(1)
}
function toggleTag(id: number) {
  const index = filters.tagIds.indexOf(id)
  if (index < 0) filters.tagIds.push(id)
  else filters.tagIds.splice(index, 1)
}
function goToPage(value: number | string) {
  const number = typeof value === 'string' ? parseBookInteger(value, 1) : value
  if (
    number !== null &&
    Number.isInteger(number) &&
    number > 0 &&
    number <= Math.max(page.value.pages, 1)
  )
    void loadPage(number)
  else jumpPage.value = String(page.value.pageNum)
}
const pageNumbers = computed(() => {
  const count = page.value.pages,
    current = page.value.pageNum
  return Array.from(
    { length: count <= 7 ? count : Math.min(count, current + 2) - Math.max(1, current - 2) + 1 },
    (_, index) => (count <= 7 ? index + 1 : Math.max(1, current - 2) + index),
  )
})
const resultRange = computed(() =>
  !page.value.total
    ? '共 0 条记录'
    : `第 ${(page.value.pageNum - 1) * page.value.pageSize + 1}–${Math.min(page.value.pageNum * page.value.pageSize, page.value.total)} 条，共 ${page.value.total} 条`,
)
function protect(action: () => void) {
  const state = getCloseState()
  if (state.submitting) return
  if (state.dirty) pending.value = action
  else action()
}
function openDrawer(mode: 'detail' | 'edit', id: number) {
  if (!isBookReference(id)) return
  protect(() => {
    drawerId.value = id
    drawerMode.value = mode
  })
}
function closeDrawer() {
  // 抽屉内部已完成取消确认，此处只处理最终关闭，避免重复询问放弃修改。
  if (getCloseState().submitting) return
  drawerMode.value = null
  drawerId.value = undefined
}
function discardAndContinue() {
  const action = pending.value
  pending.value = null
  action?.()
}
// 仅接收当前书籍，保留原有确认弹窗和删除接口。
function openDelete(target: DeleteTarget) {
  if (deleting.value) return
  protect(() => {
    drawerMode.value = null
    deleteTargets.value = [target]
    deleteConfirmed.value = false
    deleteError.value = ''
  })
}
function closeDelete() {
  if (!deleting.value) deleteTargets.value = []
}
async function confirmDelete() {
  if (deleting.value) return
  if (!deleteConfirmed.value) {
    deleteError.value = '请先勾选确认框，再删除书籍。'
    return
  }
  deleting.value = true
  deleteError.value = ''
  try {
    await deleteBooks(deleteTargets.value.map((book) => book.id))
    deleteTargets.value = []
    showToast('书籍档案已删除。')
    await Promise.all([loadPage(page.value.pageNum), loadStats()])
  } catch (error) {
    deleteError.value = messageOf(error, '删除失败，请重试。')
  } finally {
    deleting.value = false
  }
}
function handleSaved() {
  drawerMode.value = null
  showToast('书籍修改已保存。')
  void loadPage(page.value.pageNum)
  void loadStats()
}
function safeUrl(value: string | null) {
  try {
    return value && ['http:', 'https:'].includes(new URL(value).protocol) ? value : undefined
  } catch {
    return undefined
  }
}
</script>

<template>
  <div class="anime-management-page book-management-page">
    <section class="page-hero">
      <div class="hero-copy">
        <p class="eyebrow">Content Archive / Books</p>
        <h1>书籍管理 <span>BOOK INDEX</span></h1>
        <p class="hero-description">
          统一编目小说、轻小说、漫画与其他图书，记录原作资料、创作关系和站长个人评分。
        </p>
      </div>
      <div class="hero-actions">
        <button class="primary-button" type="button" @click="router.push('/admin/book/create')">
          <AdminIcon name="plus" />新增书籍
        </button>
      </div>
    </section>
    <section class="stats-grid" aria-label="书籍统计">
      <article
        v-for="item in [
          { key: 'total' as const, name: '书籍总数', icon: 'book' },
          { key: 'ongoing' as const, name: '连载中', icon: 'refresh' },
          { key: 'unpublished' as const, name: '未发表', icon: 'clock' },
          { key: 'completed' as const, name: '已完结', icon: 'check' },
        ]"
        :key="item.key"
        class="stat-card"
      >
        <div class="stat-icon"><AdminIcon :name="item.icon" /></div>
        <div class="stat-copy">
          <span>{{ item.name }}</span
          ><strong>{{ stats[item.key] ?? '—' }}</strong>
        </div>
      </article>
    </section>
    <section class="card filter-card" aria-labelledby="bookFilterTitle">
      <div class="section-heading">
        <div class="section-title">
          <span class="section-title-mark" aria-hidden="true"></span>
          <div>
            <h2 id="bookFilterTitle">检索资料</h2>
            <p>组合筛选条件，快速定位书籍记录</p>
          </div>
        </div>
        <button
          class="ghost-button"
          type="button"
          :aria-expanded="showAdvanced"
          aria-controls="bookMoreFilterPanel"
          @click="showAdvanced = !showAdvanced"
        >
          <AdminIcon name="filter" /><span>更多筛选</span
          ><span v-if="advancedFilterCount">· {{ advancedFilterCount }}</span>
        </button>
      </div>
      <form novalidate @submit.prevent="submitQuery" @reset.prevent="resetFilters">
        <div class="filter-grid">
          <div class="field keyword-field">
            <label for="bookKeyword"
              >名称关键词 <span class="field-label-note">书名 / 别名 / 系列</span></label
            >
            <div class="input-shell">
              <AdminIcon class="input-icon" name="search-full" /><input
                id="bookKeyword"
                v-model="filters.keyword"
                class="has-icon"
                type="search"
                placeholder="输入书籍名称、别名或系列"
                autocomplete="off"
              />
            </div>
          </div>
          <div ref="tagDropdownRef" class="field" @keydown.esc.stop="showTags = false">
            <div class="tag-field-head">
              <span class="field-label">标签</span>
              <div class="tag-match-control" role="group" aria-label="书籍标签匹配方式">
                <button
                  type="button"
                  :class="{ active: filters.tagMatchMode === 'ALL' }"
                  :aria-pressed="filters.tagMatchMode === 'ALL'"
                  title="同时包含所有已选标签"
                  @click="filters.tagMatchMode = 'ALL'"
                >
                  全部满足
                </button>
                <button
                  type="button"
                  :class="{ active: filters.tagMatchMode === 'ANY' }"
                  :aria-pressed="filters.tagMatchMode === 'ANY'"
                  title="包含任意一个已选标签"
                  @click="filters.tagMatchMode = 'ANY'"
                >
                  满足其一
                </button>
              </div>
            </div>
            <button
              class="multi-select-trigger"
              type="button"
              aria-label="选择书籍标签"
              aria-haspopup="listbox"
              :aria-expanded="showTags"
              @click="showTags = !showTags"
            >
              <span class="multi-select-value" :class="{ selected: filters.tagIds.length }">{{
                selectedTagText
              }}</span
              ><svg class="chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="m7 10 5 5 5-5" />
              </svg>
            </button>
            <div v-if="showTags" class="dropdown-panel tag-dropdown-panel open">
              <input
                v-model="tagSearch"
                class="dropdown-search"
                type="search"
                placeholder="搜索标签"
                aria-label="搜索书籍标签"
              />
              <ul
                class="option-list"
                role="listbox"
                aria-label="书籍标签选项"
                aria-multiselectable="true"
              >
                <li v-if="!filteredTags.length" class="option-empty">没有可选标签</li>
                <li v-for="tag in filteredTags" :key="tag.id">
                  <button
                    class="tag-option"
                    type="button"
                    role="option"
                    :aria-selected="filters.tagIds.includes(tag.id)"
                    :class="{ selected: filters.tagIds.includes(tag.id) }"
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
            <div class="segmented-control" role="group" aria-label="书籍排序字段">
              <button
                class="segment-button"
                :class="{ active: filters.sortBy === 'PUBLISH_DATE' }"
                type="button"
                :aria-pressed="filters.sortBy === 'PUBLISH_DATE'"
                @click="filters.sortBy = 'PUBLISH_DATE'"
              >
                首次发表日期
              </button>
              <button
                class="segment-button"
                :class="{ active: filters.sortBy === 'PERSONAL_RATING' }"
                type="button"
                :aria-pressed="filters.sortBy === 'PERSONAL_RATING'"
                @click="filters.sortBy = 'PERSONAL_RATING'"
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
                filters.sortDirection === 'DESC'
                  ? '当前为倒序，点击切换为正序'
                  : '当前为正序，点击切换为倒序'
              "
              :title="filters.sortDirection === 'DESC' ? '倒序排列' : '正序排列'"
              @click="filters.sortDirection = filters.sortDirection === 'ASC' ? 'DESC' : 'ASC'"
            >
              <AdminIcon :name="filters.sortDirection === 'DESC' ? 'sort-desc' : 'sort-asc'" />
            </button>
          </div>
          <div class="filter-actions">
            <button class="secondary-button" type="reset"><AdminIcon name="reset" />重置</button
            ><button class="primary-button" type="submit" :disabled="loading">
              <AdminIcon name="search-full" />查询
            </button>
          </div>
        </div>
        <div
          id="bookMoreFilterPanel"
          class="more-filter"
          :class="{ open: showAdvanced }"
          :inert="!showAdvanced"
        >
          <div class="more-filter-inner">
            <div class="advanced-grid">
              <div class="field">
                <label for="bookFilterStatus">书籍状态</label
                ><ArchiveSelect
                  id="bookFilterStatus"
                  v-model="filters.status"
                  :options="bookStatusOptions"
                  placeholder="全部状态"
                  label="书籍状态筛选"
                />
              </div>
              <div class="field">
                <label for="bookFilterType">书籍类型</label
                ><ArchiveSelect
                  id="bookFilterType"
                  v-model="filters.bookTypeId"
                  :options="bookTypes"
                  placeholder="全部类型"
                  label="书籍类型筛选"
                />
              </div>
              <div class="field">
                <label for="bookFilterAdaptation">改编类型</label
                ><ArchiveSelect
                  id="bookFilterAdaptation"
                  v-model="filters.adaptationTypeId"
                  :options="adaptations"
                  placeholder="全部来源"
                  label="改编类型筛选"
                />
              </div>
              <div class="field">
                <label for="bookFilterRegion">原作地区</label
                ><ArchiveSelect
                  id="bookFilterRegion"
                  v-model="filters.regionId"
                  :options="regions"
                  placeholder="全部地区"
                  label="地区筛选"
                />
              </div>
              <div class="field advanced-company-field">
                <label for="bookFilterCompany"
                  >关联公司 / 人物 <span class="field-label-note">输入后联想</span></label
                >
                <AnimeEntitySelect
                  id="bookFilterCompany"
                  v-model="relatedEntityValue"
                  v-model:selected-name="relatedEntityName"
                  label="公司或人物"
                  placeholder="输入公司或人物名称"
                  :search="searchRelatedEntities"
                  :search-on-input-only="true"
                  :show-option-description="true"
                  :require-explicit-selection="true"
                />
              </div>
              <div class="date-filter-group" :class="{ 'range-enabled': dateRangeEnabled }">
                <div class="date-filter-head">
                  <div class="date-filter-title">
                    首次发表日期
                    <span class="date-filter-mode">{{
                      dateRangeEnabled ? '范围查询' : '精确查询'
                    }}</span>
                  </div>
                  <label class="date-mode-switch"
                    ><span>范围选择</span
                    ><input
                      v-model="dateRangeEnabled"
                      type="checkbox"
                      aria-label="启用书籍发表日期范围查询" /><span class="date-mode-track"
                      ><span class="date-mode-thumb"></span></span
                  ></label>
                </div>
                <div class="date-filter-inputs">
                  <div class="field">
                    <label for="bookFilterDateStart"
                      >{{ dateRangeEnabled ? '开始日期' : '固定日期' }}
                      <span>年 / 年月 / 日期</span></label
                    ><AnimeAirDateInput
                      id="bookFilterDateStart"
                      v-model="filters.publishStartDate"
                      :label="dateRangeEnabled ? '发表起始日期筛选' : '发表日期筛选'"
                      :placeholder="dateRangeEnabled ? '开始日期' : '输入日期'"
                    />
                  </div>
                  <div v-if="dateRangeEnabled" class="field range-end-date">
                    <label for="bookFilterDateEnd">结束日期 <span>年 / 年月 / 日期</span></label
                    ><AnimeAirDateInput
                      id="bookFilterDateEnd"
                      v-model="filters.publishEndDate"
                      label="发表结束日期筛选"
                      placeholder="结束日期"
                    />
                  </div>
                </div>
              </div>
              <div class="rating-filter-group" :class="{ 'range-enabled': ratingRangeEnabled }">
                <div class="date-filter-head">
                  <div class="date-filter-title">
                    个人评分
                    <span class="date-filter-mode">{{
                      ratingRangeEnabled ? '范围查询' : '精确查询'
                    }}</span>
                  </div>
                  <label class="date-mode-switch"
                    ><span>范围筛选</span
                    ><input
                      v-model="ratingRangeEnabled"
                      type="checkbox"
                      aria-label="启用书籍个人评分范围查询" /><span class="date-mode-track"
                      ><span class="date-mode-thumb"></span></span
                  ></label>
                </div>
                <div class="rating-filter-inputs">
                  <div class="field">
                    <label for="bookFilterRatingMin">{{
                      ratingRangeEnabled ? '最低评分' : '固定评分'
                    }}</label>
                    <div class="input-shell score-input-shell">
                      <input
                        id="bookFilterRatingMin"
                        v-model="filters.ratingMin"
                        type="text"
                        inputmode="numeric"
                        :placeholder="ratingRangeEnabled ? '最低评分' : '输入评分'"
                        autocomplete="off"
                      /><span class="score-input-suffix">/ 10</span>
                    </div>
                  </div>
                  <div v-if="ratingRangeEnabled" class="field range-rating-field">
                    <label for="bookFilterRatingMax">最高评分</label>
                    <div class="input-shell score-input-shell">
                      <input
                        id="bookFilterRatingMax"
                        v-model="filters.ratingMax"
                        type="text"
                        inputmode="numeric"
                        placeholder="最高评分"
                        autocomplete="off"
                      /><span class="score-input-suffix">/ 10</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p v-if="validationMessage" class="form-alert error" role="alert">
          {{ validationMessage }}
        </p>
        <p v-if="catalogError" class="form-alert warning" role="alert">
          {{ catalogError
          }}<button class="ghost-button" type="button" @click="refreshCatalogs">
            重新读取选项
          </button>
        </p>
        <div v-if="activeFilterChips.length" class="active-filter-bar visible">
          <span class="active-filter-label">已生效</span>
          <div class="active-filter-list">
            <span v-for="chip in activeFilterChips" :key="chip.key" class="filter-chip"
              >{{ chip.label
              }}<button
                type="button"
                :aria-label="'移除 ' + chip.label"
                @click="clearFilter(chip.key)"
              >
                <AdminIcon name="close" /></button
            ></span>
          </div>
          <button class="ghost-button" type="button" @click="resetFilters">清除全部</button>
        </div>
      </form>
    </section>
    <section class="card list-card" aria-labelledby="bookListTitle">
      <div class="list-header">
        <div class="list-title">
          <h2 id="bookListTitle">书籍资料列表</h2>
          <span
            >共 <strong>{{ page.total }}</strong> 条记录</span
          >
        </div>
        <div class="list-tools">
          <div class="sort-summary">
            <span>当前排序</span><strong>{{ sortSummary }}</strong>
          </div>
          <button class="ghost-button" type="button" :disabled="loading" @click="refreshPage">
            <AdminIcon name="refresh" /><span>刷新</span>
          </button>
          <div class="book-view-toggle" role="group" aria-label="书籍列表展示方式">
            <button
              type="button"
              :class="{ active: viewMode === 'table' }"
              :aria-pressed="viewMode === 'table'"
              @click="viewMode = 'table'"
            >
              表格</button
            ><button
              type="button"
              :class="{ active: viewMode === 'cards' }"
              :aria-pressed="viewMode === 'cards'"
              @click="viewMode = 'cards'"
            >
              卡片
            </button>
          </div>
        </div>
      </div>
      <div class="table-scroll">
        <div
          v-if="loading"
          class="skeleton-body visible"
          role="status"
          aria-label="正在加载书籍数据"
        >
          <div v-for="index in 4" :key="index" class="skeleton-row">
            <div class="skeleton-block skeleton-cover"></div>
            <div v-for="block in 6" :key="block" class="skeleton-block"></div>
          </div>
        </div>
        <div v-else-if="errorMessage || !page.rows.length" class="table-state visible">
          <div>
            <div v-if="errorMessage" class="error-visual" aria-hidden="true">!</div>
            <div v-else class="table-state-visual" aria-hidden="true">
              <div class="empty-box"><span class="empty-box-face"></span></div>
            </div>
            <h3>
              {{
                errorMessage
                  ? '书籍读取失败'
                  : activeFilterChips.length
                    ? '没有找到匹配的书籍'
                    : '资料库还是空的'
              }}
            </h3>
            <p v-if="errorMessage" role="alert">{{ errorMessage }}</p>
            <p v-else>
              {{
                activeFilterChips.length
                  ? '可以尝试减少筛选条件，或切换标签匹配模式。'
                  : '尚未收录任何书籍，可以通过新增页面录入资料。'
              }}
            </p>
            <button v-if="errorMessage" class="secondary-button" type="button" @click="refreshPage">
              <AdminIcon name="refresh" />重新加载
            </button>
            <button
              v-else-if="activeFilterChips.length"
              class="secondary-button"
              type="button"
              @click="resetFilters"
            >
              重置筛选
            </button>
            <button
              v-else
              class="primary-button"
              type="button"
              @click="router.push('/admin/book/create')"
            >
              <AdminIcon name="plus" />新增书籍
            </button>
          </div>
        </div>
        <table v-else-if="viewMode === 'table'" class="anime-table book-list-table">
          <caption class="sr-only">
            书籍资料分页列表
          </caption>
          <thead>
            <tr>
              <th class="cover-cell" scope="col">封面</th>
              <th class="work-cell" scope="col">书籍 / 别名 / 系列</th>
              <th class="tag-cell" scope="col">标签</th>
              <th class="meta-cell" scope="col">卷数 / 章节 / 类型</th>
              <th class="date-cell" scope="col">首次发表</th>
              <th class="status-cell" scope="col">状态</th>
              <th class="region-cell" scope="col">地区</th>
              <th class="book-relation-cell" scope="col">创作人员 / 关联公司</th>
              <th class="rating-cell" scope="col">个人评分</th>
              <th class="external-cell" scope="col">外部链接</th>
              <th class="action-cell" scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="book in page.rows" :key="book.id">
              <td class="cover-cell">
                <div class="cover" :style="{ '--cover-gradient': getCoverGradient(book.id) }">
                  <img
                    v-if="safeUrl(book.coverImageUrl) && !brokenCovers.has(book.coverImageUrl!)"
                    :src="safeUrl(book.coverImageUrl)"
                    :alt="book.name + '封面'"
                    loading="lazy"
                    @error="markCoverBroken(book.coverImageUrl)"
                  /><span v-else class="cover-code">{{ book.name.slice(0, 2) }}</span>
                </div>
              </td>
              <td class="work-cell">
                <button
                  class="work-title"
                  type="button"
                  :title="book.name"
                  :aria-label="'查看 ' + book.name + ' 详情'"
                  @click="openDrawer('detail', book.id)"
                >
                  {{ book.name }}</button
                ><span class="work-alias" :title="book.aliasNames.join(' · ')">{{
                  book.aliasNames.join(' · ') || '暂无别名'
                }}</span
                ><span class="work-series" :title="book.series?.name"
                  ><AdminIcon name="series" />{{ book.series?.name || '未归属系列' }}</span
                >
              </td>
              <td class="tag-cell">
                <div class="tag-list">
                  <span v-for="tag in book.tags" :key="tag.id" class="tag" :title="tag.name">{{
                    tag.name
                  }}</span
                  ><span v-if="!book.tags.length" class="empty-value">—</span>
                </div>
              </td>
              <td class="meta-cell">
                <div class="meta-stack">
                  <span
                    ><strong>{{ book.volumeCount ?? '—' }}</strong> 卷 ·
                    <strong>{{ book.chapterCount ?? '—' }}</strong> 章</span
                  ><span
                    >{{ book.bookType?.name || '—' }} · {{ book.adaptationType?.name || '—' }}</span
                  >
                </div>
              </td>
              <td class="date-cell">
                <span class="date-main">{{ book.publishDate || '待定' }}</span
                ><span class="date-sub">{{
                  book.publishDate ? book.publishDate.slice(0, 4) + ' 年档案' : '日期未录入'
                }}</span>
              </td>
              <td class="status-cell">
                <span class="status-badge" :class="'book-status-' + book.status">{{
                  bookStatusNames[book.status]
                }}</span>
              </td>
              <td class="region-cell">
                <span class="company-name">{{ book.region?.name || '—' }}</span>
              </td>
              <td class="book-relation-cell">
                <WorkRelationsSummary
                  :persons="book.persons"
                  :companies="book.companies"
                  company-label="关联公司"
                />
              </td>
              <td class="rating-cell">
                <span v-if="book.personalRating !== null" class="rating"
                  ><span class="rating-star">★</span><strong>{{ book.personalRating }}</strong
                  ><span>/10</span></span
                ><span v-else class="empty-value">暂无</span>
              </td>
              <td class="external-cell">
                <div class="external-links">
                  <a
                    v-for="link in book.externalLinks
                      .filter((item) => safeUrl(item.url))
                      .slice(0, 3)"
                    :key="link.url"
                    class="external-link"
                    :href="safeUrl(link.url)"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="link.title || link.url"
                    >{{ link.title?.trim().slice(0, 2).toUpperCase() || '外链' }}</a
                  ><span
                    v-if="!book.externalLinks.some((link) => safeUrl(link.url))"
                    class="empty-value"
                    >—</span
                  >
                </div>
              </td>
              <td class="action-cell">
                <div class="row-actions">
                  <button
                    class="row-action"
                    type="button"
                    title="查看"
                    :aria-label="'查看 ' + book.name + ' 详情'"
                    @click="openDrawer('detail', book.id)"
                  >
                    <AdminIcon name="view" /></button
                  ><button
                    class="row-action"
                    type="button"
                    title="编辑"
                    :aria-label="'编辑 ' + book.name"
                    @click="openDrawer('edit', book.id)"
                  >
                    <AdminIcon name="edit" /></button
                  ><button
                    class="row-action danger"
                    type="button"
                    title="删除"
                    :aria-label="'删除 ' + book.name"
                    @click="openDelete(book)"
                  >
                    <AdminIcon name="delete" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="book-card-grid">
          <article v-for="book in page.rows" :key="book.id" class="book-work-card">
            <div class="book-card-heading">
              <div class="cover" :style="{ '--cover-gradient': getCoverGradient(book.id) }">
                <img
                  v-if="safeUrl(book.coverImageUrl) && !brokenCovers.has(book.coverImageUrl!)"
                  :src="safeUrl(book.coverImageUrl)"
                  :alt="book.name + '封面'"
                  loading="lazy"
                  @error="markCoverBroken(book.coverImageUrl)"
                /><span v-else class="cover-code">{{ book.name.slice(0, 2) }}</span>
              </div>
              <div>
                <button
                  class="work-title"
                  type="button"
                  :title="book.name"
                  :aria-label="'查看 ' + book.name + ' 详情'"
                  @click="openDrawer('detail', book.id)"
                >
                  {{ book.name }}</button
                ><span class="work-alias" :title="book.aliasNames.join(' · ')">{{
                  book.aliasNames.join(' · ') || '暂无别名'
                }}</span
                ><span class="work-series"
                  ><AdminIcon name="series" />{{ book.series?.name || '未归属系列' }}</span
                >
              </div>
            </div>
            <div class="book-card-meta">
              <span class="status-badge" :class="'book-status-' + book.status">{{
                bookStatusNames[book.status]
              }}</span
              ><span v-if="book.personalRating !== null" class="rating"
                ><span class="rating-star">★</span
                ><strong>{{ book.personalRating.toFixed(1) }}</strong
                ><span>/10</span></span
              ><span v-else class="empty-value">未评分</span>
            </div>
            <div class="meta-stack">
              <span>
                <strong>{{ book.volumeCount ?? '—' }}</strong> 卷 ·
                <strong>{{ book.chapterCount ?? '—' }}</strong> 章
              </span>
              <span>{{ book.bookType?.name || '—' }} · {{ book.adaptationType?.name || '—' }}</span>
              <span>首次发表：{{ book.publishDate || '日期未录入' }}</span>
              <span>地区：{{ book.region?.name || '—' }}</span>
            </div>
            <div class="tag-list book-card-tags">
              <span v-for="tag in book.tags" :key="tag.id" class="tag">{{ tag.name }}</span>
            </div>
            <div class="book-card-details">
              <div class="work-card-relation-group">
                <span class="work-card-relation-label">创作人员</span>
                <div v-for="(person, index) in book.persons" :key="index">
                  <span class="company-name">{{ person.personName }}</span>
                  <span class="company-role">{{ person.role || '暂无职责' }}</span>
                </div>
                <span v-if="!book.persons.length" class="empty-value">暂无人员</span>
              </div>
              <div class="work-card-relation-group">
                <span class="work-card-relation-label">关联公司</span>
                <div v-for="(company, index) in book.companies" :key="index">
                  <span class="company-name">{{ company.companyName }}</span>
                  <span class="company-role">{{ company.role || '暂无职责' }}</span>
                </div>
                <span v-if="!book.companies.length" class="empty-value">暂无公司</span>
              </div>
            </div>
            <div
              v-if="book.externalLinks.some((link) => safeUrl(link.url))"
              class="external-links book-card-links"
            >
              <a
                v-for="link in book.externalLinks.filter((item) => safeUrl(item.url))"
                :key="link.url"
                class="external-link"
                :href="safeUrl(link.url)"
                target="_blank"
                rel="noopener noreferrer"
                :title="link.title || link.url"
                >{{ link.title?.trim().slice(0, 2).toUpperCase() || '外链' }}</a
              >
            </div>
            <div class="book-card-actions">
              <button
                class="ghost-button"
                type="button"
                :aria-label="'查看 ' + book.name"
                @click="openDrawer('detail', book.id)"
              >
                <AdminIcon name="view" />查看</button
              ><button
                class="ghost-button"
                type="button"
                :aria-label="'编辑 ' + book.name"
                @click="openDrawer('edit', book.id)"
              >
                <AdminIcon name="edit" />编辑</button
              ><button
                class="ghost-button"
                type="button"
                :aria-label="'删除 ' + book.name"
                @click="openDelete(book)"
              >
                <AdminIcon name="delete" />删除
              </button>
            </div>
          </article>
        </div>
      </div>
      <footer v-if="!loading && !errorMessage && page.total" class="pagination">
        <div class="page-summary">
          第 <strong>{{ resultRange.match(/\d+–\d+/)?.[0] }}</strong> 条，共
          <strong>{{ page.total }}</strong> 条 · {{ page.pageNum }}/{{ page.pages }} 页
        </div>
        <div class="page-controls">
          <label class="page-size-wrap"
            ><span>每页</span
            ><ArchiveSelect
              id="bookPageSize"
              v-model="pageSizeModel"
              class="page-size-select"
              :options="pageSizeOptions"
              placeholder="选择数量"
              label="书籍每页条数"
              placement="top"
              :show-placeholder-option="false"
          /></label>
          <button
            class="page-button"
            type="button"
            :disabled="loading || page.pageNum <= 1"
            aria-label="上一页书籍"
            @click="goToPage(page.pageNum - 1)"
          >
            <AdminIcon name="left" />
          </button>
          <button
            v-for="number in pageNumbers"
            :key="number"
            class="page-button"
            type="button"
            :class="{ active: page.pageNum === number }"
            :aria-current="page.pageNum === number ? 'page' : undefined"
            :disabled="loading"
            @click="goToPage(number)"
          >
            {{ number }}
          </button>
          <button
            class="page-button"
            type="button"
            :disabled="loading || page.pageNum >= page.pages"
            aria-label="下一页书籍"
            @click="goToPage(page.pageNum + 1)"
          >
            <AdminIcon name="right" />
          </button>
          <label class="jump-wrap"
            >跳至<input
              id="bookJumpPage"
              v-model="jumpPage"
              type="text"
              inputmode="numeric"
              aria-label="书籍跳转页码"
              @keydown.enter.prevent="goToPage(jumpPage)"
            />页</label
          ><button
            class="page-button"
            type="button"
            aria-label="确认跳转书籍页码"
            title="跳转"
            :disabled="loading"
            @click="goToPage(jumpPage)"
          >
            <AdminIcon name="right" />
          </button>
        </div>
      </footer>
    </section>
    <BookCrudDrawer
      v-if="drawerMode && drawerId !== undefined"
      :key="`${drawerMode}-${drawerId}`"
      ref="drawer"
      :mode="drawerMode"
      :book-id="drawerId"
      @close="closeDrawer"
      @edit="openDrawer('edit', drawerId!)"
      @saved="handleSaved"
      @delete="openDelete($event)"
    />
    <Teleport to="body">
      <div
        v-if="visible && deleteTargets.length"
        class="modal-layer open book-dialog-layer"
        @click.self="closeDelete"
      >
        <section
          ref="deleteDialog"
          class="dialog book-delete-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除书籍"
          tabindex="-1"
        >
          <div class="dialog-icon" aria-hidden="true"><AdminIcon name="delete" /></div>
          <h2>确认删除这本书籍？</h2>
          <p>删除后将从书籍资料库中移除，且无法通过页面撤销。</p>
          <div class="book-delete-targets">
            <div v-for="target in deleteTargets" :key="target.id" class="delete-target">
              <div class="delete-target-cover">
                <img
                  v-if="safeUrl(target.coverImageUrl) && !brokenCovers.has(target.coverImageUrl!)"
                  :src="target.coverImageUrl!"
                  :alt="`${target.name}封面`"
                  @error="markCoverBroken(target.coverImageUrl)"
                />
                <span v-else aria-hidden="true">{{ target.name.slice(0, 1) || 'B' }}</span>
              </div>
              <span>
                <strong>{{ target.name }}</strong>
                <span>{{
                  `${target.bookType?.name || bookTypes.find((type) => type.id === target.bookTypeId)?.name || '未知类型'} · ${target.publishDate || '日期待定'}`
                }}</span>
              </span>
            </div>
          </div>
          <label class="dialog-delete-confirm"
            ><input
              v-model="deleteConfirmed"
              type="checkbox"
              :disabled="deleting"
              @change="deleteError = ''"
            /><span>我已核对即将删除的书籍及其关联资料。</span></label
          >
          <p v-if="deleteError" class="dialog-checkbox-error" role="alert">{{ deleteError }}</p>
          <div class="dialog-note">
            <span aria-hidden="true">!</span>
            <span>关联的别名、标签、公司、人物、外链、个人评分及系列归属将按后端规则处理。</span>
          </div>
          <div class="dialog-actions">
            <button
              class="secondary-button"
              type="button"
              :disabled="deleting"
              @click="closeDelete"
            >
              取消</button
            ><button
              class="danger-button"
              type="button"
              :disabled="deleting"
              @click="confirmDelete"
            >
              {{ deleting ? '正在删除…' : '确认删除' }}
            </button>
          </div>
        </section>
      </div>
      <div v-if="visible && pending" class="modal-layer open book-dialog-layer">
        <section
          ref="discardDialog"
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-label="未保存的书籍修改"
          tabindex="-1"
        >
          <h2>放弃未保存的修改？</h2>
          <p>当前书籍表单尚未保存，放弃后再继续操作。</p>
          <div class="dialog-actions">
            <button class="secondary-button" type="button" @click="pending = null">继续编辑</button
            ><button class="primary-button" type="button" @click="discardAndContinue">
              放弃修改
            </button>
          </div>
        </section>
      </div>
    </Teleport>
    <div v-if="toast && visible" class="toast-region" role="status">
      <div class="toast">
        <span class="toast-copy">{{ toast }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped src="@/assets/animeList.css"></style>
<style scoped src="@/assets/workListCards.css"></style>
<style scoped>
.book-management-page .book-list-table {
  min-width: 1420px;
}
.book-management-page .book-list-table .work-cell {
  width: 205px;
}
.book-management-page .book-list-table .tag-cell {
  width: 170px;
}
.book-management-page .book-list-table .meta-cell {
  width: 140px;
}
.book-management-page .book-list-table .region-cell {
  width: 66px;
}
.book-management-page .book-list-table .book-relation-cell {
  width: 185px;
}
.book-management-page .book-list-table .empty-value {
  font-size: 10px;
}
.book-status-0 {
  --status-color: var(--ink-soft);
  --status-bg: var(--surface-muted);
}
.book-status-1 {
  --status-color: var(--yellow);
  --status-bg: var(--yellow-soft);
}
.book-status-2 {
  --status-color: var(--cyan);
  --status-bg: var(--cyan-soft);
}
.book-status-3 {
  --status-color: var(--success);
  --status-bg: var(--success-soft);
}
.book-status-4 {
  --status-color: var(--violet);
  --status-bg: var(--violet-soft);
}
.book-status-5 {
  --status-color: var(--ink-soft);
  --status-bg: var(--surface-muted);
}

.book-management-page .advanced-grid :deep(.anime-entity-select > input:not([type='checkbox'])),
.book-management-page .advanced-grid :deep(.anime-date-input > input:not([type='checkbox'])) {
  /* 查询控件继承列表输入字号，避免表单组件内的固定字号与评分、关键词不一致。 */
  font: inherit;
}
.book-management-page .advanced-grid :deep(.anime-entity-select > input:not([type='checkbox'])) {
  padding-right: 34px;
}
.book-management-page .advanced-grid :deep(.anime-date-input > input:not([type='checkbox'])) {
  min-height: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}
.book-management-page .advanced-grid :deep(.anime-entity-select),
.book-management-page .advanced-grid :deep(.anime-date-input) {
  height: 40px;
}
.book-management-page .advanced-grid :deep(.anime-date-panel) {
  z-index: 160;
}
.book-dialog-layer {
  z-index: 400;
}
.book-delete-targets {
  display: grid;
  gap: 8px;
  max-height: 220px;
  margin-top: 17px;
  overflow: auto;
  overscroll-behavior: contain;
}
.book-delete-targets .delete-target {
  min-width: 0;
  margin-top: 0;
}
.book-delete-targets .delete-target > span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.book-delete-dialog {
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.book-delete-dialog h2 {
  font-size: 17px;
}
.book-delete-dialog .delete-target > span > span {
  font-size: 10px;
}
.book-delete-dialog .dialog-delete-confirm,
.book-delete-dialog .dialog-checkbox-error,
.book-delete-dialog .dialog-note,
.book-delete-dialog .dialog-actions button {
  font-size: 11px;
}
.book-delete-dialog .dialog-delete-confirm {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-top: 10px;
  color: var(--ink-soft);
}
.book-delete-dialog .dialog-delete-confirm input {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
  margin: 0;
  accent-color: var(--danger);
}
.book-delete-dialog .dialog-checkbox-error {
  margin: 5px 0 0 20px;
  color: var(--danger);
}
.book-management-page .page-controls {
  flex-wrap: wrap;
}
@media (max-width: 1240px) {
  .book-management-page .list-header {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .book-management-page .list-tools {
    margin-left: auto;
  }
}
@media (max-width: 620px) {
  .book-management-page .list-tools {
    width: 100%;
    margin-left: 0;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
  .book-management-page .list-title {
    flex-wrap: wrap;
    gap: 5px 10px;
  }
  .book-management-page .page-controls {
    width: 100%;
    gap: 5px;
  }
  .book-management-page .date-filter-inputs :deep(.anime-date-panel) {
    width: min(300px, calc(100vw - 80px));
  }
}
</style>
