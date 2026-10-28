<script setup lang="ts">
/**
 * 书籍新增、修改共用表单：加载字典和关联资料，回填、校验并转换为书籍提交数据。
 * 统一管理别名、标签、人物、公司、系列、外链、评分及日期，并上报保存、取消和未保存状态。
 */
import { computed, onActivated, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { createBook, getBookDetail, updateBook, getBookTypes } from '@/api/book'
import {
  getCompanies,
  getCompanyById,
  getRegions,
  getTags,
  getAdaptationTypes,
} from '@/api/catalog'
import { getSeriesById, getSeriesPage } from '@/api/series'
import { getPersonsPage } from '@/api/persons'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import CoverImageUpload from '@/components/admin/CoverImageUpload.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import AnimeAirDateInput from '@/components/admin/AnimeAirDateInput.vue'
import AnimeSuggestionInput from '@/components/admin/AnimeSuggestionInput.vue'
import AnimeEntitySelect from '@/components/admin/AnimeEntitySelect.vue'
import {
  companyRoles as defaultCompanyRoles,
  linkTitleSuggestions as defaultLinkTitles,
  personRoles as defaultPersonRoles,
} from '@/config/bookFormOptions'
import { readPreferences } from '@/utils/preferences'
import { useCatalogRefresh } from '@/utils/catalogChanges'
import type { CompanyOption, NamedOption, PageResult, SeriesSummary } from '@/types/api'

import type { BookDetail, BookPayload } from '@/types/book'
import { bookStatusOptions } from '@/config/bookFormOptions'
import { parseBookInteger, isBookReference } from '@/utils/bookForm'
import { useModalLayer } from '@/utils/useModalLayer'

const props = defineProps<{
  mode: 'create' | 'edit'
  bookId?: number
}>()

// 每个新建表单只读取一次偏好，已打开的表单与修改已有作品不受后续设置影响。
const entryPreferences = props.mode === 'create' ? readPreferences() : null
const companyRoles = [...defaultCompanyRoles]
const linkTitleSuggestions = entryPreferences?.linkTitles ?? [...defaultLinkTitles]
const personRoles = [...defaultPersonRoles]

const route = useRoute()
const router = useRouter()
const ownerFullPath = route.fullPath
const visible = computed(() => route.fullPath === ownerFullPath)

const emit = defineEmits<{
  saved: [book: BookDetail]
  cancelled: []
}>()

interface BookForm {
  name: string
  bookTypeId: string
  adaptationTypeId: string
  regionId: string
  status: string
  publishDate: string
  chapterCount: string
  volumeCount: string
  personalRatingScore: string
  coverImageUrl: string
  description: string
  aliasNames: string[]
  tagIds: number[]
  persons: Array<{
    rowKey: number
    personId: string
    personName: string
    role: string
    sortOrder: number
  }>
  companies: Array<{
    rowKey: number
    companyId: string
    companyName: string
    role: string
    sortOrder: number
  }>
  externalLinks: Array<{ rowKey: number; title: string; url: string; sortOrder: string }>
  seriesId: string
  seriesName: string
  seriesSortOrder: string
  autoCreateSeries: boolean
}

const form = reactive<BookForm>(createDefaultForm())
const initialFormState = ref(getFormSnapshot())
const bookTypes = ref<NamedOption[]>([])
const adaptationTypes = ref<NamedOption[]>([])
const regions = ref<NamedOption[]>([])
const tags = ref<NamedOption[]>([])
const tagLoadError = ref('')
const tagsRefreshing = ref(false)
const loading = ref(true)
const personsLoaded = ref(props.mode === 'create')
const submitting = ref(false)
const coverUploading = ref(false)
const coverUpload = ref<InstanceType<typeof CoverImageUpload>>()
const busy = computed(() => submitting.value || coverUploading.value)
const confirmationAction = ref<'save' | 'reset' | 'cancel' | null>(null)
const confirmDialog = useModalLayer(
  () => !!confirmationAction.value && visible.value,
  dismissConfirmation,
)
const loadError = ref('')
const catalogWarning = ref('')
const errorMessage = ref('')
const errors = reactive<Record<string, string>>({})
let loadController: AbortController | undefined
let typeController: AbortController | undefined
let tagController: AbortController | undefined
let refreshTagsOnReturn = false
let nextCompanyRowKey = 0
let nextPersonRowKey = 0
let nextExternalLinkRowKey = 0
const refreshTypeOptions = useCatalogRefresh(['book', 'adaptation'], loadTypeOptions)

const statusOptions = bookStatusOptions
function createDefaultForm(): BookForm {
  return {
    name: '',
    bookTypeId: '',
    adaptationTypeId: '',
    regionId: '',
    status: '',
    publishDate: '',
    volumeCount: '',
    chapterCount: '',
    personalRatingScore: '',
    coverImageUrl: '',
    description: '',
    aliasNames: [],
    tagIds: [],
    persons: [],
    companies: [],
    externalLinks: [],
    seriesId: '',
    seriesName: '',
    seriesSortOrder: '',
    autoCreateSeries: false,
  }
}

function getFormSnapshot() {
  return JSON.stringify({
    ...form,
    tagIds: [...new Set(form.tagIds)].sort((left, right) => left - right),
  })
}

async function getAllPages<T>(loadPage: (pageNum: number) => Promise<PageResult<T>>) {
  const firstPage = await loadPage(1)
  if (firstPage.pages <= 1) return firstPage.rows
  const remaining = await Promise.all(
    Array.from({ length: firstPage.pages - 1 }, (_, index) => loadPage(index + 2)),
  )
  return firstPage.rows.concat(remaining.flatMap((page) => page.rows))
}

// 将详情接口的数据转换为可编辑字段，并记录回填快照用于未保存判断。
function applyBook(
  book: BookDetail,
  companyNames: CompanyOption[],
  selectedSeries: SeriesSummary | null,
) {
  // 未返回关联数据时不能按空数组保存，避免覆盖原有创作人员。
  if (
    [book.persons, book.companies, book.externalLinks, book.aliasNames, book.tagIds].some(
      (value) => !Array.isArray(value),
    )
  ) {
    throw new Error('创作人员关联未能加载，请重新读取书籍资料后再保存。')
  }
  Object.assign(form, {
    name: book.name,
    bookTypeId: String(book.bookTypeId),
    adaptationTypeId: String(book.adaptationTypeId),
    regionId: String(book.regionId),
    status: String(book.status),
    publishDate: book.publishDate ?? '',
    volumeCount: book.volumeCount === null ? '' : String(book.volumeCount),
    chapterCount: book.chapterCount === null ? '' : String(book.chapterCount),
    personalRatingScore: book.personalRatingScore === null ? '' : String(book.personalRatingScore),
    coverImageUrl: book.coverImageUrl ?? '',
    description: book.description ?? '',
    aliasNames: [...(book.aliasNames ?? [])],
    tagIds: [...(book.tagIds ?? [])],
    persons: book.persons.map((person) => ({
      rowKey: nextPersonRowKey++,
      personId: String(person.personId),
      personName: person.personName,
      role: person.role,
      sortOrder: person.sortOrder,
    })),
    companies: (book.companies ?? []).map((company, index) => ({
      rowKey: nextCompanyRowKey++,
      companyId: String(company.companyId),
      companyName: companyNames[index]?.name ?? '',
      role: company.role ?? '',
      sortOrder: company.sortOrder,
    })),
    externalLinks: (book.externalLinks ?? []).map((link) => ({
      rowKey: nextExternalLinkRowKey++,
      title: link.title ?? '',
      url: link.url,
      sortOrder: String(link.sortOrder ?? 0),
    })),
    seriesId: book.seriesId === null ? '' : String(book.seriesId),
    seriesName: selectedSeries?.name ?? '',
    seriesSortOrder: book.seriesSortOrder === null ? '' : String(book.seriesSortOrder),
  })
  personsLoaded.value = true
  initialFormState.value = getFormSnapshot()
}

async function loadTypeOptions() {
  const controller = new AbortController()
  typeController = controller
  try {
    const [broadcast, adaptation] = await Promise.all([
      getBookTypes(controller.signal),
      getAdaptationTypes(controller.signal),
    ])
    if (controller.signal.aborted) return
    bookTypes.value = broadcast
    adaptationTypes.value = adaptation
    catalogWarning.value = ''
  } catch (error) {
    if (!controller.signal.aborted)
      catalogWarning.value = error instanceof Error ? error.message : '类型选项读取失败，请重试。'
  }
}

async function loadForm() {
  loadController?.abort()
  const controller = new AbortController()
  loadController = controller
  loading.value = true
  loadError.value = ''
  personsLoaded.value = props.mode === 'create'
  try {
    if (props.mode === 'edit' && !props.bookId)
      throw new Error('未取得书籍标识，无法读取修改资料。')
    const [, region, allTags, book] = await Promise.all([
      refreshTypeOptions(),
      getRegions(controller.signal),
      getAllPages((pageNum) => getTags(pageNum, 100, controller.signal)),
      props.mode === 'edit' && props.bookId
        ? getBookDetail(props.bookId, controller.signal)
        : Promise.resolve(null),
    ])
    if (controller.signal.aborted) return
    if (catalogWarning.value) throw new Error(catalogWarning.value)
    regions.value = region
    tags.value = allTags

    if (book) {
      const [companyNames, selectedSeries] = await Promise.all([
        Promise.all(
          book.companies.map((company) => getCompanyById(company.companyId, controller.signal)),
        ),
        book.seriesId === null
          ? Promise.resolve(null)
          : getSeriesById(book.seriesId, controller.signal),
      ])
      if (controller.signal.aborted) return
      applyBook(book, companyNames, selectedSeries)
    }
  } catch (error) {
    if (!controller.signal.aborted)
      loadError.value = error instanceof Error ? error.message : '书籍资料加载失败，请稍后重试。'
  } finally {
    if (loadController === controller) loading.value = false
  }
}
onMounted(() => void loadForm())
onActivated(() => {
  if (refreshTagsOnReturn) {
    refreshTagsOnReturn = false
    void refreshTags()
  }
})

onBeforeUnmount(() => {
  loadController?.abort()
  typeController?.abort()
  tagController?.abort()
})

function searchCompanies(name: string, pageNum: number, signal: AbortSignal) {
  return getCompanies(name, 10, signal, pageNum)
}

function searchSeries(name: string, pageNum: number, signal: AbortSignal) {
  return getSeriesPage(pageNum, 10, signal, name)
}

function searchPersons(name: string, pageNum: number, signal: AbortSignal) {
  return getPersonsPage(pageNum, 10, name, signal)
}

function addPerson() {
  if (submitting.value) return
  const sortOrder = Math.min(
    2147483647,
    Math.max(-1, ...form.persons.map((person) => person.sortOrder)) + 1,
  )
  form.persons.push({
    rowKey: nextPersonRowKey++,
    personId: '',
    personName: '',
    role: '',
    sortOrder,
  })
}

function clearPersonErrors() {
  Object.keys(errors)
    .filter((key) => key.startsWith('person-'))
    .forEach((key) => delete errors[key])
}

function removePerson(index: number) {
  if (submitting.value) return
  form.persons.splice(index, 1)
  clearPersonErrors()
}

function movePerson(index: number, offset: number) {
  const target = index + offset
  if (submitting.value || target < 0 || target >= form.persons.length) return
  const [person] = form.persons.splice(index, 1)
  form.persons.splice(target, 0, person!)
  // 保留普通编辑的原始排序值，仅在明确移动后按有效行顺序重排。
  let sortOrder = 0
  form.persons.forEach((row) => {
    row.sortOrder = sortOrder
    if (row.personId) sortOrder += 1
  })
  clearPersonErrors()
}

function openPersonManagement() {
  if (!submitting.value) void router.push('/admin/persons')
}

function openCompanyManagement() {
  if (!submitting.value) void router.push('/admin/companies')
}

function openTagManagement() {
  if (submitting.value) return
  refreshTagsOnReturn = true
  void router.push('/admin/tags')
}

// 从标签管理返回时只更新可选项，保留当前书籍草稿及已选标签。
async function refreshTags() {
  tagController?.abort()
  const controller = new AbortController()
  tagController = controller
  tagsRefreshing.value = true
  tagLoadError.value = ''
  try {
    const result = await getAllPages((pageNum) => getTags(pageNum, 100, controller.signal))
    if (!controller.signal.aborted) tags.value = result
  } catch (error) {
    if (!controller.signal.aborted)
      tagLoadError.value = error instanceof Error ? error.message : '标签读取失败，请重试。'
  } finally {
    if (tagController === controller) tagsRefreshing.value = false
  }
}

function addAlias() {
  form.aliasNames.push('')
}

function removeAlias(index: number) {
  if (submitting.value) return
  form.aliasNames.splice(index, 1)
}

function moveAlias(index: number, offset: number) {
  const target = index + offset
  if (submitting.value || target < 0 || target >= form.aliasNames.length) return
  const [alias] = form.aliasNames.splice(index, 1)
  form.aliasNames.splice(target, 0, alias!)
}

function addCompany() {
  const sortOrder = Math.min(
    2147483647,
    Math.max(-1, ...form.companies.map((company) => company.sortOrder)) + 1,
  )
  form.companies.push({
    rowKey: nextCompanyRowKey++,
    companyId: '',
    companyName: '',
    role: '',
    sortOrder,
  })
}

function removeCompany(index: number) {
  if (submitting.value) return
  form.companies.splice(index, 1)
  clearCompanyErrors()
}

function clearCompanyErrors() {
  Object.keys(errors)
    .filter((key) => key.startsWith('company-'))
    .forEach((key) => delete errors[key])
}

function moveCompany(index: number, offset: number) {
  const target = index + offset
  if (submitting.value || target < 0 || target >= form.companies.length) return
  const [company] = form.companies.splice(index, 1)
  form.companies.splice(target, 0, company!)
  // 只有明确调整顺序时才重排有效行；普通职责编辑保留原始排序值。
  let sortOrder = 0
  form.companies.forEach((row) => {
    row.sortOrder = sortOrder
    if (row.companyId) sortOrder += 1
  })
  clearCompanyErrors()
}

function addExternalLink() {
  if (submitting.value) return
  const sortOrder = Math.min(
    2147483647,
    Math.max(-1, ...form.externalLinks.map((link) => Number(link.sortOrder))) + 1,
  )
  form.externalLinks.push({
    rowKey: nextExternalLinkRowKey++,
    title: '',
    url: '',
    sortOrder: String(sortOrder),
  })
}

function removeExternalLink(index: number) {
  if (submitting.value) return
  form.externalLinks.splice(index, 1)
  clearExternalLinkErrors()
}

function clearExternalLinkErrors() {
  Object.keys(errors)
    .filter((key) => key.startsWith('external-'))
    .forEach((key) => delete errors[key])
}

function moveExternalLink(index: number, offset: number) {
  const target = index + offset
  if (submitting.value || target < 0 || target >= form.externalLinks.length) return
  const [link] = form.externalLinks.splice(index, 1)
  form.externalLinks.splice(target, 0, link!)
  // 显式移动时按有效链接顺序重排；只编辑标题或地址时保留原排序值。
  let sortOrder = 0
  form.externalLinks.forEach((row) => {
    row.sortOrder = String(sortOrder)
    if (row.url.trim()) sortOrder += 1
  })
  clearExternalLinkErrors()
}

function toggleTag(id: number) {
  const index = form.tagIds.indexOf(id)
  if (index === -1) form.tagIds.push(id)
  else form.tagIds.splice(index, 1)
}

function setError(key: string, message: string) {
  errors[key] = message
}

function selectRating(value: string) {
  form.personalRatingScore = value
  errors.personalRatingScore = ''
}

// 数字输入框显式读取原始字符串，避免 v-model 自动转成数字后破坏空值和整数校验。
function updateCount(key: 'volumeCount' | 'chapterCount', event: Event) {
  form[key] = (event.target as HTMLInputElement).value
  errors[key] = ''
}

// 在提交前统一校验日期、评分及关联选择，输入的公司名称不能替代真实公司标识。
function validateForm() {
  Object.keys(errors).forEach((key) => delete errors[key])
  if (!personsLoaded.value) setError('persons', '关联资料未完整加载，请重新读取后保存。')
  if (!form.name.trim()) setError('name', '请填写书籍名称。')
  else if (Array.from(form.name.trim()).length > 200) setError('name', '书名不能超过 200 个字符。')
  for (const key of ['bookTypeId', 'adaptationTypeId', 'regionId'] as const)
    if (!isBookReference(form[key])) setError(key, '请明确选择有效的资料选项。')
  if (!/^[0-5]$/.test(form.status)) setError('status', '请选择有效的书籍状态。')
  if (form.publishDate.trim()) {
    const date = normalizePublishDate(form.publishDate)
    if (!date) setError('publishDate', '请输入真实完整日期（YYYY-MM-DD），不知道具体日期可留空。')
    else form.publishDate = date
  } else form.publishDate = ''
  for (const key of ['volumeCount', 'chapterCount'] as const)
    if (form[key].trim() !== '' && parseBookInteger(form[key]) === null)
      setError(key, '请输入 0 至 2147483647 的整数，未知可留空。')
  if (
    form.personalRatingScore.trim() !== '' &&
    parseBookInteger(form.personalRatingScore, 0, 10) === null
  )
    setError('personalRatingScore', '评分只能是 0 至 10 的整数，未评分可留空。')
  if (
    form.coverImageUrl.trim() &&
    (!isHttpUrl(form.coverImageUrl) || Array.from(form.coverImageUrl.trim()).length > 500)
  )
    setError('coverImageUrl', '封面须为不超过 500 个字符的 HTTP 或 HTTPS 地址。')
  const companyIds = new Set<number>()
  form.companies.forEach((company, index) => {
    if (!company.companyId && !company.companyName.trim() && !company.role.trim()) return
    const key = 'company-' + index
    if (!isBookReference(company.companyId))
      setError(key, '请从结果中选择已有公司，不能只填写名称或职责。')
    else if (companyIds.has(Number(company.companyId))) setError(key, '同一公司只能关联一次。')
    else if (Array.from(company.role.trim()).length > 50)
      setError(key, '公司职责不能超过 50 个字符。')
    else if (
      !Number.isInteger(company.sortOrder) ||
      company.sortOrder < -2147483648 ||
      company.sortOrder > 2147483647
    )
      setError(key, '公司排序必须是有效整数，请使用上下移动调整。')
    companyIds.add(Number(company.companyId))
  })
  const personRolesSeen = new Map<string, number>()
  form.persons.forEach((person, index) => {
    const role = person.role.trim(),
      key = 'person-' + index
    if (!person.personId && !person.personName.trim() && !role) return
    if (!isBookReference(person.personId)) setError(key, '请从搜索结果中明确选择已有人员。')
    else if (!role || Array.from(role).length > 50) setError(key, '请填写职责，最多 50 个字符。')
    else if (
      !Number.isInteger(person.sortOrder) ||
      person.sortOrder < 0 ||
      person.sortOrder > 2147483647
    )
      setError(key, '人员排序须为非负整数，请使用上下移动调整。')
    else {
      const identity = person.personId + ':' + role,
        previous = personRolesSeen.get(identity)
      if (previous !== undefined) {
        setError(key, '同一人物的相同职责不能重复。')
        setError('person-' + previous, '同一人物的相同职责不能重复。')
      } else personRolesSeen.set(identity, index)
    }
  })
  const urls = new Set<string>()
  form.externalLinks.forEach((link, index) => {
    const url = link.url.trim(),
      key = 'external-' + index
    if (!url && !link.title.trim()) return
    if (!url || !isHttpUrl(url) || Array.from(url).length > 500)
      setError(key, '请填写不超过 500 个字符的 HTTP 或 HTTPS 链接。')
    else if (Array.from(link.title.trim()).length > 100)
      setError(key, '链接标题不能超过 100 个字符。')
    else if (parseBookInteger(link.sortOrder, -2147483648) === null)
      setError(key, '外链排序必须是有效整数，请使用上下移动调整。')
    else if (urls.has(url)) setError(key, '同一链接不能重复关联。')
    urls.add(url)
  })
  if (form.seriesName.trim() && !form.seriesId)
    setError('seriesId', '请从结果中选择已有系列，或清空名称。')
  if (form.seriesId && !isBookReference(form.seriesId)) setError('seriesId', '请选择有效系列。')
  if (
    form.seriesId &&
    form.seriesSortOrder.trim() !== '' &&
    parseBookInteger(form.seriesSortOrder, -2147483648) === null
  )
    setError('seriesSortOrder', '系列排序请输入有效整数。')
  if (form.tagIds.some((id) => !isBookReference(id))) setError('tags', '标签选项无效，请重新选择。')
  return Object.keys(errors).length === 0
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizePublishDate(value: string) {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12) return null
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const lastDay = month === 2 ? (isLeapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31
  if (day < 1 || day > lastDay) return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(
    2,
    '0',
  )}`
}

// 将输入框中的字符串、可选空值和重复行整理为后端书籍数据模型。
function buildPayload(): BookPayload {
  return {
    ...(props.mode === 'edit' && props.bookId ? { id: props.bookId } : {}),
    name: form.name.trim(),
    volumeCount: form.volumeCount.trim() === '' ? null : parseBookInteger(form.volumeCount),
    chapterCount: form.chapterCount.trim() === '' ? null : parseBookInteger(form.chapterCount),
    bookTypeId: Number(form.bookTypeId),
    adaptationTypeId: Number(form.adaptationTypeId),
    regionId: Number(form.regionId),
    publishDate: normalizePublishDate(form.publishDate),
    coverImageUrl: form.coverImageUrl.trim() || null,
    status: Number(form.status),
    description: form.description.trim() || null,
    aliasNames: [...new Set(form.aliasNames.map((alias) => alias.trim()).filter(Boolean))],
    persons: form.persons
      .filter((person) => person.personId)
      .map((person) => ({
        personId: Number(person.personId),
        role: person.role.trim(),
        sortOrder: person.sortOrder,
      })),
    companies: form.companies
      .filter((company) => company.companyId)
      .map((company) => ({
        companyId: Number(company.companyId),
        role: company.role.trim() || null,
        sortOrder: company.sortOrder,
      })),
    externalLinks: form.externalLinks
      .filter((link) => link.url.trim())
      .map((link) => ({
        title: link.title.trim() || null,
        url: link.url.trim(),
        sortOrder: Number(link.sortOrder || 0),
      })),
    tagIds: [...new Set(form.tagIds)],
    seriesId: form.seriesId ? Number(form.seriesId) : null,
    seriesSortOrder: form.seriesId
      ? form.seriesSortOrder.trim() === ''
        ? 0
        : parseBookInteger(form.seriesSortOrder, -2147483648)
      : null,
    ...(props.mode === 'create' ? { autoCreateSeries: form.autoCreateSeries } : {}),
    personalRatingScore:
      form.personalRatingScore.trim() === ''
        ? null
        : parseBookInteger(form.personalRatingScore, 0, 10),
  }
}

function requestSave() {
  if (loading.value || loadError.value || busy.value || !validateForm()) return
  confirmationAction.value = 'save'
}

async function saveForm() {
  if (loading.value || loadError.value || busy.value || !validateForm()) return
  submitting.value = true
  errorMessage.value = ''
  const submittedFormState = getFormSnapshot()
  try {
    const payload = buildPayload()
    const saved =
      props.mode === 'create'
        ? await createBook(payload)
        : await updateBook(payload as BookPayload & { id: number })
    initialFormState.value = submittedFormState
    emit('saved', saved)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '保存书籍资料失败，请稍后重试。'
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  if (busy.value) return
  coverUpload.value?.reset()
  Object.assign(form, createDefaultForm())
  Object.keys(errors).forEach((key) => delete errors[key])
}

function requestReset() {
  if (busy.value) return
  confirmationAction.value = 'reset'
}

function requestCancel() {
  if (busy.value) return
  if (!getCloseState().dirty) {
    emit('cancelled')
    return
  }
  confirmationAction.value = 'cancel'
}

// 供新增页、修改抽屉及工作区关闭检查读取，不依赖是否打开过表单来判断修改。
function getCloseState() {
  return {
    dirty: getFormSnapshot() !== initialFormState.value,
    submitting: busy.value,
  }
}

defineExpose({ requestCancel, getCloseState })

function dismissConfirmation() {
  if (busy.value) return
  confirmationAction.value = null
}

async function confirmAction() {
  if (busy.value) return
  const action = confirmationAction.value
  confirmationAction.value = null
  if (action === 'save') await saveForm()
  else if (action === 'reset') resetForm()
  else if (action === 'cancel') emit('cancelled')
}
</script>

<template>
  <div class="anime-editor-form">
    <div v-if="loading" class="anime-form-state">正在加载书籍表单…</div>
    <div v-else-if="loadError" class="anime-form-state error">
      {{ loadError }}
      <button class="secondary-button" type="button" @click="loadForm">重新读取</button>
    </div>
    <form
      v-else
      class="anime-editor-content"
      :inert="submitting"
      :aria-busy="busy"
      @submit.prevent="requestSave"
    >
      <p v-if="catalogWarning" class="anime-catalog-warning" role="alert">
        类型选项更新失败：{{ catalogWarning }}
        <button type="button" @click="refreshTypeOptions">重新读取选项</button>
      </p>
      <header class="anime-editor-hero">
        <div>
          <p class="eyebrow">
            BOOK ARCHIVE / {{ mode === 'create' ? 'NEW ENTRY' : 'UPDATE ENTRY' }}
          </p>
          <h1>{{ mode === 'create' ? '新增书籍' : '编辑书籍' }} <span>· 建立完整作品档案</span></h1>
          <p>录入基础信息、分类关系及外部资料。标有 <b class="required-mark">*</b> 的为必填项。</p>
        </div>
        <div class="anime-editor-actions">
          <button
            v-if="mode === 'create'"
            class="secondary-button"
            type="button"
            @click="requestReset"
            :disabled="busy"
          >
            重置表单
          </button>
          <button class="primary-button" type="submit" :disabled="busy">
            <AdminIcon name="check" />{{
              submitting ? '正在保存…' : mode === 'create' ? '保存书籍' : '保存修改'
            }}
          </button>
        </div>
      </header>

      <section class="anime-editor-card">
        <div class="anime-editor-section-head">
          <div>
            <h2>基础资料</h2>
            <p>书籍名称、发表信息和作品封面</p>
          </div>
          <span>01</span>
        </div>
        <div class="anime-editor-grid">
          <label class="field full" :class="{ 'has-error': errors.name }">
            <span>书籍名称 <b class="required-mark">*</b></span>
            <input
              v-model="form.name"
              type="text"
              placeholder="输入正式名称"
              @input="errors.name = ''"
            />
            <small v-if="errors.name" class="field-error">{{ errors.name }}</small>
          </label>
          <div class="field" :class="{ 'has-error': errors.bookTypeId }">
            <span class="anime-field-label">书籍类型 <b class="required-mark">*</b></span>
            <ArchiveSelect
              id="bookBookType"
              v-model="form.bookTypeId"
              label="书籍类型"
              placeholder="请选择书籍类型"
              :options="bookTypes"
              :show-placeholder-option="false"
            />
            <small v-if="errors.bookTypeId" class="field-error">{{ errors.bookTypeId }}</small>
          </div>
          <div class="field" :class="{ 'has-error': errors.adaptationTypeId }">
            <span class="anime-field-label">改编类型 <b class="required-mark">*</b></span>
            <ArchiveSelect
              id="bookAdaptationType"
              v-model="form.adaptationTypeId"
              label="改编类型"
              placeholder="请选择改编类型"
              :options="adaptationTypes"
              :show-placeholder-option="false"
            />
            <small v-if="errors.adaptationTypeId" class="field-error">{{
              errors.adaptationTypeId
            }}</small>
          </div>
          <div class="field" :class="{ 'has-error': errors.regionId }">
            <span class="anime-field-label">地区 <b class="required-mark">*</b></span>
            <ArchiveSelect
              id="bookRegion"
              v-model="form.regionId"
              label="地区"
              placeholder="请选择地区"
              :options="regions"
              :show-placeholder-option="false"
            />
            <small v-if="errors.regionId" class="field-error">{{ errors.regionId }}</small>
          </div>
          <div class="field" :class="{ 'has-error': errors.status }">
            <span class="anime-field-label">书籍状态 <b class="required-mark">*</b></span>
            <ArchiveSelect
              id="bookStatus"
              v-model="form.status"
              label="书籍状态"
              placeholder="请选择书籍状态"
              :options="statusOptions"
              :show-placeholder-option="false"
            />
            <small v-if="errors.status" class="field-error">{{ errors.status }}</small>
          </div>
          <div class="field" :class="{ 'has-error': errors.publishDate }">
            <span>首次发表日期</span>
            <AnimeAirDateInput
              id="bookPublishDate"
              label="首次发表日期"
              v-model="form.publishDate"
              :invalid="!!errors.publishDate"
              @update:model-value="
                (value) => {
                  if (!value.trim() || normalizePublishDate(value)) errors.publishDate = ''
                }
              "
            />
            <small v-if="errors.publishDate" class="field-error">{{ errors.publishDate }}</small>
          </div>
          <label class="field" :class="{ 'has-error': errors.volumeCount }">
            <span>卷数</span>
            <div class="anime-input-suffix">
              <input
                :value="form.volumeCount"
                type="number"
                min="0"
                step="1"
                placeholder="未确定可留空"
                @input="updateCount('volumeCount', $event)"
              /><i>卷</i>
            </div>
            <small v-if="errors.volumeCount" class="field-error">{{ errors.volumeCount }}</small>
          </label>
          <label class="field" :class="{ 'has-error': errors.chapterCount }">
            <span>章节数</span>
            <div class="anime-input-suffix">
              <input
                :value="form.chapterCount"
                type="number"
                min="0"
                step="1"
                placeholder="未确定可留空"
                @input="updateCount('chapterCount', $event)"
              /><i>章</i>
            </div>
            <small v-if="errors.chapterCount" class="field-error">{{ errors.chapterCount }}</small>
          </label>
          <div class="field" :class="{ 'has-error': errors.personalRatingScore }">
            <span>个人评分</span>
            <div class="anime-rating-control" role="radiogroup" aria-label="个人评分，1 至 10 分">
              <button
                v-for="score in 10"
                :key="score"
                class="anime-rating-star"
                :class="{ selected: Number(form.personalRatingScore) >= score }"
                type="button"
                role="radio"
                :aria-label="`${score} 分`"
                :aria-checked="form.personalRatingScore === String(score)"
                @click="selectRating(String(score))"
              >
                ★
              </button>
              <span class="anime-rating-value"
                >{{ form.personalRatingScore === '' ? '未评分' : form.personalRatingScore }} /
                10</span
              >
              <button
                v-if="form.personalRatingScore"
                class="anime-rating-clear"
                type="button"
                @click="selectRating('')"
              >
                清除
              </button>
            </div>
            <small v-if="errors.personalRatingScore" class="field-error">{{
              errors.personalRatingScore
            }}</small>
          </div>
          <div class="field full" :class="{ 'has-error': errors.coverImageUrl }">
            <span>封面图片</span>
            <CoverImageUpload
              :key="`${mode}:${bookId ?? 'new'}`"
              ref="coverUpload"
              v-model="form.coverImageUrl"
              target-type="BOOK"
              :disabled="submitting || !!confirmationAction"
              :error="errors.coverImageUrl"
              @uploading-change="coverUploading = $event"
              @update:model-value="errors.coverImageUrl = ''"
            />
          </div>
          <label class="field full">
            <span>书籍简介</span>
            <textarea
              v-model="form.description"
              rows="4"
              placeholder="记录剧情简介或编辑备注"
            ></textarea>
          </label>
        </div>
      </section>

      <section class="anime-editor-card">
        <div class="anime-editor-section-head">
          <div>
            <h2>别名与标签</h2>
            <p>一个作品可关联多个别名和标签</p>
          </div>
          <span>02</span>
        </div>
        <div class="anime-editor-grid">
          <div class="field full">
            <span class="anime-field-label">别名列表</span>
            <div class="anime-repeat-list">
              <div
                v-for="(alias, index) in form.aliasNames"
                :key="`alias-${index}`"
                class="anime-repeat-row"
              >
                <input
                  v-model="form.aliasNames[index]"
                  type="text"
                  placeholder="输入别名"
                  :disabled="submitting"
                />
                <div class="anime-repeat-actions">
                  <button
                    class="anime-order-button move-up"
                    type="button"
                    :aria-label="`上移别名 ${index + 1}`"
                    title="上移"
                    :disabled="submitting || index === 0"
                    @click="moveAlias(index, -1)"
                  >
                    <AdminIcon name="right" />
                  </button>
                  <button
                    class="anime-order-button move-down"
                    type="button"
                    :aria-label="`下移别名 ${index + 1}`"
                    title="下移"
                    :disabled="submitting || index === form.aliasNames.length - 1"
                    @click="moveAlias(index, 1)"
                  >
                    <AdminIcon name="right" />
                  </button>
                  <button
                    class="anime-remove-button"
                    type="button"
                    :aria-label="`移除别名 ${index + 1}`"
                    :disabled="submitting"
                    @click="removeAlias(index)"
                  >
                    <AdminIcon name="close" />
                  </button>
                </div>
              </div>
            </div>
            <button
              class="anime-inline-button"
              type="button"
              :disabled="submitting"
              @click="addAlias"
            >
              <AdminIcon name="plus" />添加别名
            </button>
          </div>
          <div class="field full">
            <span class="anime-field-label">标签</span>
            <small v-if="errors.tags" class="field-error">{{ errors.tags }}</small>
            <div class="anime-tag-picker">
              <button
                v-for="tag in tags"
                :key="tag.id"
                type="button"
                class="tag-option"
                :class="{ selected: form.tagIds.includes(tag.id) }"
                :aria-pressed="form.tagIds.includes(tag.id)"
                @click="toggleTag(tag.id)"
              >
                {{ tag.name }}
              </button>
              <span v-if="!tags.length" class="anime-muted-note">暂无可选标签</span>
            </div>
            <button
              class="anime-inline-button"
              type="button"
              :disabled="submitting"
              @click="openTagManagement"
            >
              <AdminIcon name="right" />到标签管理中新增
            </button>
            <small v-if="tagsRefreshing" class="anime-muted-note" role="status"
              >正在更新标签…</small
            >
            <small v-if="tagLoadError" class="field-error" role="alert">
              {{ tagLoadError }}
              <button class="anime-inline-button" type="button" @click="refreshTags">
                重新读取标签
              </button>
            </small>
          </div>
        </div>
      </section>

      <section class="anime-editor-card">
        <div class="anime-editor-section-head">
          <div>
            <h2>关联资料</h2>
            <p>关联公司、系列和外部来源</p>
          </div>
          <span>03</span>
        </div>
        <div class="anime-editor-grid">
          <div class="field full">
            <span class="anime-field-label">创作人员</span>
            <div class="anime-repeat-list">
              <div
                v-for="(person, index) in form.persons"
                :key="person.rowKey"
                class="anime-repeat-row anime-person-row"
                :class="{ invalid: errors[`person-${index}`] }"
              >
                <AnimeEntitySelect
                  :id="`bookPerson-${person.rowKey}`"
                  v-model="person.personId"
                  v-model:selected-name="person.personName"
                  label="创作人员"
                  placeholder="输入姓名搜索已有人员"
                  no-results-message="未找到人物，请先到人物管理创建，再返回搜索。"
                  :search="searchPersons"
                  :require-explicit-selection="true"
                  :show-option-description="true"
                  :disabled="submitting"
                  :error-message="errors[`person-${index}`]"
                  @update:model-value="errors[`person-${index}`] = ''"
                />
                <AnimeSuggestionInput
                  :id="`bookPersonRole-${person.rowKey}`"
                  v-model="person.role"
                  label="人物职责"
                  placeholder="请输入职责"
                  :suggestions="personRoles"
                  :disabled="submitting"
                  @update:model-value="errors[`person-${index}`] = ''"
                />
                <div class="anime-repeat-actions">
                  <button
                    class="anime-order-button move-up"
                    type="button"
                    :aria-label="`上移人员 ${index + 1}`"
                    title="上移"
                    :disabled="submitting || index === 0"
                    @click="movePerson(index, -1)"
                  >
                    <AdminIcon name="right" />
                  </button>
                  <button
                    class="anime-order-button move-down"
                    type="button"
                    :aria-label="`下移人员 ${index + 1}`"
                    title="下移"
                    :disabled="submitting || index === form.persons.length - 1"
                    @click="movePerson(index, 1)"
                  >
                    <AdminIcon name="right" />
                  </button>
                  <button
                    class="anime-remove-button"
                    type="button"
                    :aria-label="`移除人员 ${index + 1}`"
                    :disabled="submitting"
                    @click="removePerson(index)"
                  >
                    <AdminIcon name="close" />
                  </button>
                </div>
              </div>
            </div>
            <small v-if="errors.persons" class="field-error" role="alert">{{
              errors.persons
            }}</small>
            <div class="anime-person-actions">
              <button
                class="anime-inline-button"
                type="button"
                :disabled="submitting"
                @click="addPerson"
              >
                <AdminIcon name="plus" />添加人员
              </button>
              <button
                class="anime-inline-button"
                type="button"
                :disabled="submitting"
                @click="openPersonManagement"
              >
                <AdminIcon name="right" />到人物管理新增
              </button>
            </div>
          </div>
          <div class="field full">
            <span class="anime-field-label">关联公司</span>
            <div class="anime-repeat-list">
              <div
                v-for="(company, index) in form.companies"
                :key="company.rowKey"
                class="anime-repeat-row"
                :class="{ invalid: errors[`company-${index}`] }"
              >
                <AnimeEntitySelect
                  :id="`bookCompany-${index}`"
                  v-model="company.companyId"
                  v-model:selected-name="company.companyName"
                  label="关联公司"
                  placeholder="输入公司名称搜索"
                  no-results-message="未找到该关联公司，请检查名称。"
                  no-results-error="该公司名称不存在"
                  :error-message="errors[`company-${index}`]"
                  :search="searchCompanies"
                  :require-explicit-selection="true"
                  @update:model-value="errors[`company-${index}`] = ''"
                />
                <AnimeSuggestionInput
                  :id="`bookCompanyRole-${index}`"
                  v-model="company.role"
                  label="公司职责"
                  placeholder="请输入职责"
                  :suggestions="companyRoles"
                />
                <div class="anime-repeat-actions">
                  <button
                    class="anime-order-button move-up"
                    type="button"
                    :aria-label="`上移公司 ${index + 1}`"
                    title="上移"
                    :disabled="submitting || index === 0"
                    @click="moveCompany(index, -1)"
                  >
                    <AdminIcon name="right" />
                  </button>
                  <button
                    class="anime-order-button move-down"
                    type="button"
                    :aria-label="`下移公司 ${index + 1}`"
                    title="下移"
                    :disabled="submitting || index === form.companies.length - 1"
                    @click="moveCompany(index, 1)"
                  >
                    <AdminIcon name="right" />
                  </button>
                  <button
                    class="anime-remove-button"
                    type="button"
                    :aria-label="`移除公司 ${index + 1}`"
                    :disabled="submitting"
                    @click="removeCompany(index)"
                  >
                    <AdminIcon name="close" />
                  </button>
                </div>
              </div>
            </div>
            <div class="anime-person-actions">
              <button
                class="anime-inline-button"
                type="button"
                :disabled="submitting"
                @click="addCompany"
              >
                <AdminIcon name="plus" />添加公司
              </button>
              <button
                class="anime-inline-button"
                type="button"
                :disabled="submitting"
                @click="openCompanyManagement"
              >
                <AdminIcon name="right" />到公司管理新增
              </button>
            </div>
          </div>
          <div class="field full">
            <span class="anime-field-label">所属系列</span>
            <div class="anime-series-fields">
              <AnimeEntitySelect
                id="bookSeries"
                v-model="form.seriesId"
                v-model:selected-name="form.seriesName"
                label="所属系列"
                placeholder="暂不关联系列"
                :error-message="errors.seriesId"
                empty-option="暂不关联系列"
                :search="searchSeries"
                :require-explicit-selection="true"
                :show-option-description="true"
              />
              <div class="anime-input-suffix">
                <input
                  v-model="form.seriesSortOrder"
                  type="text"
                  inputmode="numeric"
                  placeholder="系列排序"
                /><i>序号</i>
              </div>
            </div>
            <small v-if="errors.seriesSortOrder" class="field-error">{{
              errors.seriesSortOrder
            }}</small>
            <label v-if="mode === 'create'" class="anime-switch-row">
              <span><strong>无系列时自动创建</strong><small>使用书籍名称创建同名系列</small></span>
              <button
                class="anime-switch"
                type="button"
                role="switch"
                :aria-checked="form.autoCreateSeries"
                aria-label="无系列时自动创建"
                @click="form.autoCreateSeries = !form.autoCreateSeries"
              >
                <span></span>
              </button>
            </label>
          </div>
          <div class="field full">
            <span class="anime-field-label">外部链接</span>
            <div class="anime-repeat-list">
              <div
                v-for="(link, index) in form.externalLinks"
                :key="link.rowKey"
                class="anime-repeat-row anime-link-row"
                :class="{ invalid: errors[`external-${index}`] }"
              >
                <AnimeSuggestionInput
                  :id="`bookExternalTitle-${index}`"
                  v-model="link.title"
                  label="来源标题"
                  placeholder="来源标题"
                  :suggestions="linkTitleSuggestions"
                />
                <input
                  v-model="link.url"
                  type="url"
                  placeholder="https://..."
                  :disabled="submitting"
                  :aria-label="`外链地址 ${index + 1}`"
                  @input="errors[`external-${index}`] = ''"
                />
                <div class="anime-repeat-actions">
                  <button
                    class="anime-order-button move-up"
                    type="button"
                    :aria-label="`上移外链 ${index + 1}`"
                    title="上移"
                    :disabled="submitting || index === 0"
                    @click="moveExternalLink(index, -1)"
                  >
                    <AdminIcon name="right" />
                  </button>
                  <button
                    class="anime-order-button move-down"
                    type="button"
                    :aria-label="`下移外链 ${index + 1}`"
                    title="下移"
                    :disabled="submitting || index === form.externalLinks.length - 1"
                    @click="moveExternalLink(index, 1)"
                  >
                    <AdminIcon name="right" />
                  </button>
                  <button
                    class="anime-remove-button"
                    type="button"
                    :aria-label="`移除外链 ${index + 1}`"
                    :disabled="submitting"
                    @click="removeExternalLink(index)"
                  >
                    <AdminIcon name="close" />
                  </button>
                </div>
                <small v-if="errors[`external-${index}`]" class="field-error">{{
                  errors[`external-${index}`]
                }}</small>
              </div>
            </div>
            <button
              class="anime-inline-button"
              type="button"
              :disabled="submitting"
              @click="addExternalLink"
            >
              <AdminIcon name="plus" />添加外链
            </button>
          </div>
        </div>
      </section>

      <p v-if="errorMessage" class="anime-save-error" role="alert">{{ errorMessage }}</p>
      <footer class="anime-editor-footer">
        <button class="secondary-button" type="button" :disabled="busy" @click="requestCancel">
          取消
        </button>
        <button class="primary-button" type="submit" :disabled="busy">
          <AdminIcon name="check" />{{
            submitting ? '正在保存…' : mode === 'create' ? '保存书籍' : '保存修改'
          }}
        </button>
      </footer>
    </form>
    <Teleport to="body">
      <div
        v-if="confirmationAction"
        v-show="visible"
        class="anime-confirm-backdrop"
        @click.self="dismissConfirmation"
      >
        <section
          ref="confirmDialog"
          tabindex="-1"
          class="anime-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bookConfirmTitle"
        >
          <span class="anime-confirm-mark" aria-hidden="true">?</span>
          <h2 id="bookConfirmTitle">
            {{
              confirmationAction === 'save'
                ? '确认保存书籍？'
                : confirmationAction === 'reset'
                  ? '确认重置表单？'
                  : '确认取消编辑？'
            }}
          </h2>
          <p>
            {{
              confirmationAction === 'save'
                ? '请确认当前书籍资料无误后继续保存。'
                : confirmationAction === 'reset'
                  ? '当前填写的内容将被清空，是否继续？'
                  : '尚未保存的修改将会丢失，是否离开？'
            }}
          </p>
          <div class="anime-confirm-actions">
            <button
              class="secondary-button"
              type="button"
              :disabled="busy"
              @click="dismissConfirmation"
            >
              返回
            </button>
            <button class="primary-button" type="button" :disabled="busy" @click="confirmAction">
              {{
                confirmationAction === 'save'
                  ? '确认保存'
                  : confirmationAction === 'reset'
                    ? '确认重置'
                    : '确认离开'
              }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped src="@/assets/animeEditorForm.css"></style>
