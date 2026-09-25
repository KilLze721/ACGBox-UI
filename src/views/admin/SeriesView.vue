<script setup lang="ts">
import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRouter } from 'vue-router'
import { getAnimeDetail, getAnimePage, updateAnime } from '@/api/anime'
import {
  createSeries,
  deleteSeries,
  getSeriesById,
  getSeriesPage,
  updateSeries,
} from '@/api/series'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import type { AnimePageItem, PageResult, SeriesSummary } from '@/types/api'

type DrawerMode = 'create' | 'edit' | 'detail'
type WorkType = 'anime' | 'manga' | 'novel'
type AssociatedWork = {
  type: WorkType
  id: number
  title: string
  coverImageUrl?: string | null
  seriesName?: string | null
}

const workTypeNames: Record<WorkType, string> = { anime: '动画', manga: '漫画', novel: '小说' }
const demoCatalog: Record<'manga' | 'novel', AssociatedWork[]> = {
  manga: [
    { type: 'manga', id: 201, title: '葬送的芙莉莲（漫画）' },
    { type: 'manga', id: 202, title: '迷宫饭（漫画）' },
    { type: 'manga', id: 203, title: '钢之炼金术师（漫画）' },
  ],
  novel: [
    { type: 'novel', id: 301, title: '化物语' },
    { type: 'novel', id: 302, title: '刀剑神域' },
    { type: 'novel', id: 303, title: 'Fate/Zero' },
  ],
}

const router = useRouter()
const page = ref<PageResult<SeriesSummary>>({
  pageNum: 1,
  pageSize: 10,
  total: 0,
  pages: 0,
  rows: [],
})
const totalSeries = ref(0)
const pageSize = ref(10)
const searchName = ref('')
const appliedName = ref('')
const jumpPage = ref('1')
const selectedIds = ref<number[]>([])
const listLoading = ref(false)
const listError = ref('')
const drawerMode = ref<DrawerMode | null>(null)
const tabActive = ref(true)
const currentSeries = ref<SeriesSummary | null>(null)
const drawerLoading = ref(false)
const drawerError = ref('')
const relatedLoading = ref(false)
const relatedError = ref('')
const form = reactive({ name: '', description: '' })
const nameError = ref('')
const selectedWorks = ref<AssociatedWork[]>([])
const relatedWorks = ref<AssociatedWork[]>([])
const originalAnimeIds = ref<number[]>([])
const initialFormState = ref('')
const workType = ref<WorkType>('anime')
const workKeyword = ref('')
const workChoice = ref('')
const workResults = ref<AssociatedWork[]>([])
const workLoading = ref(false)
const workError = ref('')
const associationError = ref('')
const saving = ref(false)
const deleteTargets = ref<SeriesSummary[]>([])
const deleteConfirmed = ref(false)
const deleteError = ref('')
const deleting = ref(false)
const toast = ref<{ message: string; error: boolean } | null>(null)

let pageController: AbortController | undefined
let drawerController: AbortController | undefined
let searchController: AbortController | undefined
let searchTimer: number | undefined
let toastTimer: number | undefined
let previousBodyOverflow: string | undefined
let previousHtmlOverflow: string | undefined

const hasDrawer = computed(() => drawerMode.value !== null)
const allVisibleSelected = computed(
  () =>
    page.value.rows.length > 0 &&
    page.value.rows.every((row) => selectedIds.value.includes(row.id)),
)
const selectedTargets = computed(() =>
  page.value.rows.filter((row) => selectedIds.value.includes(row.id)),
)
const firstResult = computed(() =>
  page.value.total ? (page.value.pageNum - 1) * page.value.pageSize + 1 : 0,
)
const lastResult = computed(() =>
  Math.min(page.value.pageNum * page.value.pageSize, page.value.total),
)
const pageNumbers = computed(() => {
  const values: Array<number | string> = []
  for (let number = 1; number <= page.value.pages; number++) {
    if (number === 1 || number === page.value.pages || Math.abs(number - page.value.pageNum) <= 1) {
      if (
        values.length &&
        typeof values[values.length - 1] === 'number' &&
        number - Number(values[values.length - 1]) > 1
      )
        values.push('…')
      values.push(number)
    }
  }
  return values
})
const filteredWorkResults = computed(() =>
  workResults.value.filter(
    (work) => !selectedWorks.value.some((item) => item.type === work.type && item.id === work.id),
  ),
)
const isDirty = computed(
  () =>
    (drawerMode.value === 'create' || drawerMode.value === 'edit') &&
    JSON.stringify({
      name: form.name,
      description: form.description,
      works: selectedWorks.value.map((work) => `${work.type}:${work.id}`).sort(),
    }) !== initialFormState.value,
)

defineExpose({
  getCloseState: () => ({ dirty: isDirty.value, submitting: saving.value || deleting.value }),
})

function showToast(message: string, error = false) {
  toast.value = { message, error }
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = null
  }, 5000)
}
function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
function saveInitialFormState() {
  initialFormState.value = JSON.stringify({
    name: form.name,
    description: form.description,
    works: selectedWorks.value.map((work) => `${work.type}:${work.id}`).sort(),
  })
}

function lockScroll() {
  if (previousBodyOverflow !== undefined) return
  previousBodyOverflow = document.body.style.overflow
  previousHtmlOverflow = document.documentElement.style.overflow
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
}
function unlockScroll() {
  if (previousBodyOverflow === undefined) return
  document.body.style.overflow = previousBodyOverflow
  document.documentElement.style.overflow = previousHtmlOverflow ?? ''
  previousBodyOverflow = undefined
  previousHtmlOverflow = undefined
}
watch([drawerMode, () => deleteTargets.value.length], ([mode, deleteCount]) => {
  if (mode || deleteCount) lockScroll()
  else unlockScroll()
})

onMounted(() => {
  void loadPage(1)
  void loadTotal()
})
onActivated(() => {
  tabActive.value = true
  if (hasDrawer.value || deleteTargets.value.length) lockScroll()
})
onDeactivated(() => {
  tabActive.value = false
  unlockScroll()
})
onBeforeUnmount(() => {
  pageController?.abort()
  drawerController?.abort()
  searchController?.abort()
  if (searchTimer) window.clearTimeout(searchTimer)
  if (toastTimer) window.clearTimeout(toastTimer)
  unlockScroll()
})

async function loadTotal() {
  try {
    totalSeries.value = (await getSeriesPage(1, 1)).total
  } catch {
    return
  }
}
async function loadPage(pageNum: number) {
  pageController?.abort()
  const controller = new AbortController()
  pageController = controller
  listLoading.value = true
  listError.value = ''
  try {
    const result = await getSeriesPage(
      pageNum,
      pageSize.value,
      controller.signal,
      appliedName.value,
    )
    if (pageController !== controller) return
    page.value = result
    jumpPage.value = String(result.pageNum)
    selectedIds.value = []
    if (!appliedName.value) totalSeries.value = result.total
    if (result.total > 0 && result.rows.length === 0 && pageNum > 1) await loadPage(pageNum - 1)
  } catch (error) {
    if (controller.signal.aborted) return
    listError.value = messageOf(error, '系列档案读取失败，请稍后重试。')
  } finally {
    if (pageController === controller) listLoading.value = false
  }
}
function runSearch() {
  appliedName.value = searchName.value.trim()
  void loadPage(1)
}
function resetSearch() {
  searchName.value = ''
  appliedName.value = ''
  void loadPage(1)
}
function changePageSize(event: Event) {
  pageSize.value = Number((event.target as HTMLSelectElement).value)
  void loadPage(1)
}
function goToPage(next: number) {
  if (
    Number.isInteger(next) &&
    next >= 1 &&
    next <= Math.max(page.value.pages, 1) &&
    next !== page.value.pageNum
  )
    void loadPage(next)
}
function jumpToPage() {
  goToPage(Number(jumpPage.value))
  jumpPage.value = String(page.value.pageNum)
}
function toggleRow(id: number, checked: boolean) {
  selectedIds.value = checked
    ? [...selectedIds.value, id]
    : selectedIds.value.filter((value) => value !== id)
}
function toggleAll(checked: boolean) {
  selectedIds.value = checked ? page.value.rows.map((row) => row.id) : []
}

function resetWorkSearch() {
  workType.value = 'anime'
  workKeyword.value = ''
  workChoice.value = ''
  workResults.value = []
  workError.value = ''
  associationError.value = ''
  void searchWorks()
}
async function searchWorks() {
  searchController?.abort()
  workChoice.value = ''
  workError.value = ''
  if (workType.value !== 'anime') {
    const keyword = workKeyword.value.trim().toLocaleLowerCase()
    workResults.value = demoCatalog[workType.value].filter((work) =>
      work.title.toLocaleLowerCase().includes(keyword),
    )
    workLoading.value = false
    return
  }
  const controller = new AbortController()
  searchController = controller
  workLoading.value = true
  try {
    const result = await getAnimePage(
      { pageNum: 1, pageSize: 20, keyword: workKeyword.value.trim() || undefined },
      controller.signal,
    )
    if (controller !== searchController) return
    workResults.value = result.rows.map((anime: AnimePageItem) => ({
      type: 'anime',
      id: anime.id,
      title: anime.name,
      coverImageUrl: anime.coverImageUrl,
      seriesName: anime.series?.name,
    }))
  } catch (error) {
    if (controller.signal.aborted) return
    workResults.value = []
    workError.value = messageOf(error, '动画搜索失败，请重试。')
  } finally {
    if (controller === searchController) workLoading.value = false
  }
}
watch([workType, workKeyword], () => {
  if (!hasDrawer.value || drawerMode.value === 'detail') return
  if (searchTimer) window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => {
    void searchWorks()
  }, 250)
})
function addAssociation() {
  associationError.value = ''
  const candidate = workResults.value.find((work) => `${work.type}:${work.id}` === workChoice.value)
  if (!candidate) {
    associationError.value = '请先从搜索结果中选择内容。'
    return
  }
  if (
    candidate.type === 'anime' &&
    candidate.seriesName &&
    candidate.seriesName !== currentSeries.value?.name
  ) {
    associationError.value = `“${candidate.title}”已归属“${candidate.seriesName}”，请先在动画管理中调整归属。`
    return
  }
  if (!selectedWorks.value.some((work) => work.type === candidate.type && work.id === candidate.id))
    selectedWorks.value.push(candidate)
  workChoice.value = ''
}
function removeAssociation(work: AssociatedWork) {
  selectedWorks.value = selectedWorks.value.filter(
    (item) => item.type !== work.type || item.id !== work.id,
  )
}

async function loadRelatedAnime(
  series: SeriesSummary,
  signal: AbortSignal,
): Promise<AssociatedWork[]> {
  const works: AssociatedWork[] = []
  let currentPage = 1
  let pages = 1
  do {
    const result = await getAnimePage(
      { pageNum: currentPage, pageSize: 100, keyword: series.name },
      signal,
    )
    works.push(
      ...result.rows
        .filter((anime) => anime.series?.id === series.id)
        .map((anime) => ({
          type: 'anime' as const,
          id: anime.id,
          title: anime.name,
          coverImageUrl: anime.coverImageUrl,
          seriesName: series.name,
        })),
    )
    pages = result.pages
    currentPage++
  } while (currentPage <= pages)
  return works
}
async function refreshRelated(
  series: SeriesSummary,
  signal: AbortSignal,
  preserveSelection = false,
) {
  relatedLoading.value = true
  relatedError.value = ''
  try {
    const works = await loadRelatedAnime(series, signal)
    if (signal.aborted) return
    relatedWorks.value = works
    originalAnimeIds.value = works.map((work) => work.id)
    if (!preserveSelection) selectedWorks.value = [...works]
  } catch (error) {
    if (signal.aborted) return
    relatedError.value = messageOf(error, '关联动画读取失败，不能安全保存关联变更。')
  } finally {
    if (!signal.aborted) relatedLoading.value = false
  }
}
function closeDrawer() {
  if (saving.value) return
  drawerController?.abort()
  searchController?.abort()
  drawerMode.value = null
  currentSeries.value = null
  drawerError.value = ''
}
async function openDrawer(mode: DrawerMode, row?: SeriesSummary) {
  drawerController?.abort()
  const controller = new AbortController()
  drawerController = controller
  drawerMode.value = mode
  currentSeries.value = row ?? null
  drawerLoading.value = mode !== 'create'
  drawerError.value = ''
  relatedError.value = ''
  relatedWorks.value = []
  originalAnimeIds.value = []
  selectedWorks.value = []
  form.name = ''
  form.description = ''
  nameError.value = ''
  if (mode !== 'detail') resetWorkSearch()
  if (mode === 'create') {
    drawerLoading.value = false
    saveInitialFormState()
    return
  }
  if (!row) return
  try {
    const detail = await getSeriesById(row.id, controller.signal)
    if (controller.signal.aborted) return
    currentSeries.value = detail
    form.name = detail.name
    form.description = detail.description ?? ''
    await refreshRelated(detail, controller.signal)
    if (!controller.signal.aborted) saveInitialFormState()
  } catch (error) {
    if (controller.signal.aborted) return
    currentSeries.value = null
    drawerError.value = messageOf(error, '系列详情读取失败，请重试。')
  } finally {
    if (!controller.signal.aborted) drawerLoading.value = false
  }
}
async function saveSeries() {
  nameError.value = form.name.trim() ? '' : '请填写系列名称。'
  if (nameError.value || saving.value || relatedLoading.value) return
  if (drawerMode.value === 'edit' && relatedError.value) {
    drawerError.value = '请先重新读取关联动画，再保存系列。'
    return
  }
  saving.value = true
  drawerError.value = ''
  try {
    const payload = { name: form.name.trim(), description: form.description.trim() || null }
    const savedSeries =
      drawerMode.value === 'create'
        ? await createSeries(payload)
        : await updateSeries({ id: currentSeries.value!.id, ...payload })
    currentSeries.value = savedSeries
    if (drawerMode.value === 'create') drawerMode.value = 'edit'
    const wantedIds = selectedWorks.value
      .filter((work) => work.type === 'anime')
      .map((work) => work.id)
    const changes = [
      ...originalAnimeIds.value
        .filter((id) => !wantedIds.includes(id))
        .map((id) => ({ id, seriesId: null })),
      ...wantedIds
        .filter((id) => !originalAnimeIds.value.includes(id))
        .map((id) => ({ id, seriesId: savedSeries.id })),
    ]
    const failures: string[] = []
    for (const change of changes) {
      try {
        const anime = await getAnimeDetail(change.id)
        if (change.seriesId === null && anime.seriesId !== savedSeries.id) continue
        if (
          change.seriesId !== null &&
          anime.seriesId !== null &&
          anime.seriesId !== savedSeries.id
        )
          throw new Error('动画已归属其他系列')
        await updateAnime({
          ...anime,
          id: anime.id,
          seriesId: change.seriesId,
          seriesSortOrder: change.seriesId === null ? null : (anime.seriesSortOrder ?? 0),
        })
      } catch (error) {
        failures.push(`#${change.id}：${messageOf(error, '保存失败')}`)
      }
    }
    if (failures.length) {
      drawerError.value = `系列基本信息已保存，但部分动画关联失败：${failures.join('；')}。请检查后重试。`
      if (drawerController) await refreshRelated(savedSeries, drawerController.signal, true)
      await Promise.all([loadPage(page.value.pageNum), loadTotal()])
      return
    }
    const hasDemo = selectedWorks.value.some((work) => work.type !== 'anime')
    drawerMode.value = null
    currentSeries.value = null
    showToast(
      hasDemo ? '系列与动画关联已保存；漫画、小说仅为前端演示，未保存到服务器。' : '系列保存成功。',
    )
    await Promise.all([loadPage(page.value.pageNum), loadTotal()])
  } catch (error) {
    drawerError.value = messageOf(error, '保存失败，请稍后重试。')
  } finally {
    saving.value = false
  }
}
function openDelete(targets: SeriesSummary[]) {
  if (!targets.length) return
  closeDrawer()
  deleteTargets.value = targets
  deleteConfirmed.value = false
  deleteError.value = ''
}
function closeDelete() {
  if (!deleting.value) deleteTargets.value = []
}
async function confirmDelete() {
  if (!deleteConfirmed.value) {
    deleteError.value = '请先勾选确认框，再删除系列。'
    return
  }
  if (!deleteTargets.value.length || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  const count = deleteTargets.value.length
  try {
    await deleteSeries(deleteTargets.value.map((row) => row.id))
    deleteTargets.value = []
    showToast(`已删除 ${count} 个系列。`)
    await Promise.all([loadPage(page.value.pageNum), loadTotal()])
  } catch (error) {
    deleteError.value = messageOf(error, '删除失败，请稍后重试。')
  } finally {
    deleting.value = false
  }
}
function openRelatedWork(work: AssociatedWork) {
  if (work.type !== 'anime') {
    showToast('对应详情页暂未实现。')
    return
  }
  closeDrawer()
  void router.push(`/admin/anime/${work.id}`)
}
</script>

<template>
  <section class="series-management">
    <section class="series-hero">
      <div class="series-hero-copy">
        <p class="series-eyebrow">CONTENT ARCHIVE / SERIES INDEX</p>
        <h1>系列管理 <span>SERIES ARCHIVE</span></h1>
        <p>
          维护动画系列档案与说明。新增、修改和详情在当前页面右侧抽屉中打开，便于保留列表上下文。
        </p>
      </div>
      <button class="primary-button" type="button" @click="openDrawer('create')">
        <AdminIcon name="plus" />新增系列
      </button>
    </section>

    <section class="series-stats" aria-label="系列统计">
      <article>
        <span class="series-stat-icon"><AdminIcon name="series" /></span
        ><span
          ><small>系列总数</small><strong>{{ totalSeries }}</strong></span
        >
      </article>
      <article>
        <span class="series-stat-icon"><AdminIcon name="anime" /></span
        ><span
          ><small>当前页记录</small><strong>{{ page.rows.length }}</strong></span
        >
      </article>
      <article>
        <span class="series-stat-icon"><AdminIcon name="check" /></span
        ><span
          ><small>已选系列</small><strong>{{ selectedIds.length }}</strong></span
        >
      </article>
    </section>

    <section class="series-list-card" aria-labelledby="seriesListTitle">
      <header class="series-list-header">
        <div>
          <h2 id="seriesListTitle">系列档案列表</h2>
          <p>按最近更新排序 · 修改记录在保存后更新</p>
        </div>
        <div class="series-header-actions">
          <span>当前显示 {{ page.rows.length }} 条 · 共 {{ page.total }} 条</span
          ><button
            class="danger-button"
            type="button"
            :disabled="!selectedIds.length || listLoading"
            @click="openDelete(selectedTargets)"
          >
            <AdminIcon name="delete" />删除所选 {{ selectedIds.length }}
          </button>
        </div>
      </header>
      <form class="series-filter" @submit.prevent="runSearch">
        <label class="series-search"
          ><AdminIcon name="search-full" /><input
            v-model="searchName"
            type="search"
            placeholder="按系列名称搜索"
            autocomplete="off"
            aria-label="按系列名称搜索" /><button
            v-if="searchName"
            type="button"
            aria-label="清空搜索"
            @click="searchName = ''"
          >
            <AdminIcon name="close" /></button
        ></label>
        <button class="secondary-button" type="submit">查询</button>
        <button class="ghost-button" type="button" @click="resetSearch">重置</button>
      </form>
      <div class="series-table-scroll">
        <table v-if="!listLoading && !listError && page.rows.length" class="series-table">
          <thead>
            <tr>
              <th class="series-check-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="选择当前页全部系列"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th>ID</th>
              <th>系列名称 / 说明</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in page.rows" :key="row.id">
              <td class="series-check-cell">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(row.id)"
                  :aria-label="`选择系列 ${row.name}`"
                  @change="toggleRow(row.id, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td>
                <span class="series-id">#{{ row.id }}</span>
              </td>
              <td>
                <button class="series-row-name" type="button" @click="openDrawer('detail', row)">
                  {{ row.name }}</button
                ><span class="series-row-desc" :title="row.description || '暂无说明'">{{
                  row.description || '暂无说明'
                }}</span>
              </td>
              <td>
                <div class="series-row-actions">
                  <button
                    type="button"
                    title="查看详情"
                    :aria-label="`查看 ${row.name} 详情`"
                    @click="openDrawer('detail', row)"
                  >
                    <AdminIcon name="view" /></button
                  ><button
                    type="button"
                    title="编辑"
                    :aria-label="`编辑 ${row.name}`"
                    @click="openDrawer('edit', row)"
                  >
                    <AdminIcon name="edit" /></button
                  ><button
                    class="danger"
                    type="button"
                    title="删除"
                    :aria-label="`删除 ${row.name}`"
                    @click="openDelete([row])"
                  >
                    <AdminIcon name="delete" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="series-list-state" :class="{ error: !!listError }">
          <span class="series-state-icon"
            ><AdminIcon :name="listError ? 'refresh' : 'series'"
          /></span>
          <strong>{{
            listLoading
              ? '正在读取系列档案…'
              : listError
                ? '系列资料读取失败'
                : appliedName
                  ? '没有匹配的系列'
                  : '暂无系列资料'
          }}</strong>
          <p>
            {{
              listError ||
              (appliedName
                ? '请尝试其他系列名称，或清空查询条件。'
                : '创建一条系列档案后，将显示在此处。')
            }}
          </p>
          <button
            v-if="listError"
            class="secondary-button"
            type="button"
            @click="loadPage(page.pageNum)"
          >
            重新加载
          </button>
          <button
            v-else-if="!listLoading && !appliedName"
            class="primary-button"
            type="button"
            @click="openDrawer('create')"
          >
            新增系列
          </button>
        </div>
      </div>
      <footer class="series-pagination">
        <span>第 {{ firstResult }}–{{ lastResult }} 条，共 {{ page.total }} 条</span>
        <div class="series-page-controls">
          <label for="seriesPageSize">每页</label
          ><select
            id="seriesPageSize"
            :value="pageSize"
            aria-label="每页条数"
            @change="changePageSize"
          >
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="20">20</option></select
          ><button
            type="button"
            aria-label="上一页"
            :disabled="page.pageNum <= 1"
            @click="goToPage(page.pageNum - 1)"
          >
            <AdminIcon name="left" /></button
          ><template v-for="(number, index) in pageNumbers" :key="`${number}-${index}`"
            ><button
              v-if="typeof number === 'number'"
              type="button"
              :class="{ active: number === page.pageNum }"
              :aria-current="number === page.pageNum ? 'page' : undefined"
              @click="goToPage(number)"
            >
              {{ number }}</button
            ><span v-else>…</span></template
          ><button
            type="button"
            aria-label="下一页"
            :disabled="page.pageNum >= Math.max(page.pages, 1)"
            @click="goToPage(page.pageNum + 1)"
          >
            <AdminIcon name="right" /></button
          ><label for="seriesJumpPage">跳至</label
          ><input
            id="seriesJumpPage"
            v-model="jumpPage"
            type="number"
            min="1"
            :max="Math.max(page.pages, 1)"
            @keydown.enter.prevent="jumpToPage"
          /><span>页</span>
        </div>
      </footer>
    </section>

    <Teleport to="body">
      <div v-if="drawerMode && tabActive" class="series-drawer-layer" @click.self="closeDrawer">
        <aside
          class="series-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="
            drawerMode === 'create' ? '新增系列' : drawerMode === 'edit' ? '编辑系列' : '系列详情'
          "
        >
          <header class="series-drawer-header">
            <div>
              <h2>
                {{
                  drawerMode === 'create'
                    ? '新增系列'
                    : drawerMode === 'edit'
                      ? '编辑系列'
                      : '系列详情'
                }}
              </h2>
              <p>
                {{
                  drawerMode === 'create'
                    ? '在系列档案中创建一条记录'
                    : `系列档案 · ID #${currentSeries?.id ?? '—'}`
                }}
              </p>
            </div>
            <button type="button" aria-label="关闭抽屉" @click="closeDrawer">
              <AdminIcon name="close" />
            </button>
          </header>
          <div class="series-drawer-body">
            <div v-if="drawerLoading" class="series-drawer-state">正在读取系列资料与关联内容…</div>
            <div
              v-else-if="drawerError && !currentSeries && drawerMode !== 'create'"
              class="series-drawer-state error"
              role="alert"
            >
              {{ drawerError }}
            </div>
            <template v-else-if="drawerMode === 'detail'">
              <div class="series-detail-kv">
                <div>
                  <span>系列 ID</span><strong>#{{ currentSeries?.id }}</strong>
                </div>
                <div>
                  <span>系列名称</span><strong>{{ currentSeries?.name }}</strong>
                </div>
              </div>
              <div class="series-field">
                <label>系列说明</label>
                <div class="series-detail-description">
                  {{ currentSeries?.description?.trim() || '暂无说明' }}
                </div>
              </div>
              <section class="series-association">
                <header>
                  <strong>关联内容</strong><span>{{ relatedWorks.length }} 项</span>
                </header>
                <p v-if="relatedError" class="series-error" role="alert">
                  {{ relatedError }}
                  <button
                    v-if="currentSeries"
                    type="button"
                    @click="refreshRelated(currentSeries, drawerController!.signal)"
                  >
                    重新读取
                  </button>
                </p>
                <div v-else-if="!relatedWorks.length" class="series-association-empty">
                  当前系列暂无已关联动画；漫画和小说尚无可读取接口。
                </div>
                <div v-else class="series-work-list">
                  <button
                    v-for="work in relatedWorks"
                    :key="`${work.type}-${work.id}`"
                    class="series-work-item related"
                    type="button"
                    @click="openRelatedWork(work)"
                  >
                    <img
                      v-if="work.coverImageUrl"
                      :src="work.coverImageUrl"
                      :alt="`${work.title}封面`"
                    /><span v-else class="series-work-cover">{{ work.title.slice(0, 1) }}</span
                    ><span class="series-work-kind" :class="work.type">{{
                      workTypeNames[work.type]
                    }}</span
                    ><span class="series-work-copy"
                      ><strong>{{ work.title }}</strong
                      ><small>点击查看动画详情</small></span
                    ><AdminIcon name="right" />
                  </button>
                </div>
              </section>
            </template>
            <form v-else id="seriesEditorForm" @submit.prevent="saveSeries">
              <div class="series-field" :class="{ invalid: nameError }">
                <label for="seriesName">系列名称 <span>*</span></label
                ><input
                  id="seriesName"
                  v-model="form.name"
                  maxlength="120"
                  placeholder="输入系列名称，例如：物语系列"
                  autocomplete="off"
                  @input="nameError = ''"
                />
                <p v-if="nameError" class="series-error" role="alert">{{ nameError }}</p>
                <p class="series-hint">系列名称用于建立动画之间的归属关系。</p>
              </div>
              <div class="series-field">
                <label for="seriesDescription">系列说明</label
                ><textarea
                  id="seriesDescription"
                  v-model="form.description"
                  maxlength="2000"
                  placeholder="补充系列背景、作品脉络或编辑备注"
                ></textarea>
                <p class="series-hint">{{ form.description.length }} / 2000 · 可留空</p>
              </div>
              <section class="series-association">
                <header><strong>关联内容</strong><span>动画 / 漫画 / 小说</span></header>
                <p class="series-hint">
                  动画关联会通过现有动画接口保存。漫画、小说仅为前端演示，不会保存到服务器。
                </p>
                <div class="series-association-controls">
                  <select v-model="workType" aria-label="关联作品类型">
                    <option value="anime">动画</option>
                    <option value="manga">漫画（演示）</option>
                    <option value="novel">小说（演示）</option></select
                  ><input
                    v-model="workKeyword"
                    type="search"
                    :placeholder="`搜索${workTypeNames[workType]}名称`"
                    :aria-label="`搜索${workTypeNames[workType]}名称`"
                  /><select
                    v-model="workChoice"
                    aria-label="选择关联内容"
                    :disabled="workLoading || !!workError"
                  >
                    <option value="">
                      {{
                        workLoading
                          ? '搜索中…'
                          : workError
                            ? '搜索失败'
                            : filteredWorkResults.length
                              ? '请选择内容'
                              : '暂无匹配内容'
                      }}
                    </option>
                    <option
                      v-for="work in filteredWorkResults"
                      :key="`${work.type}-${work.id}`"
                      :value="`${work.type}:${work.id}`"
                    >
                      {{ work.title }}{{ work.seriesName ? ` · ${work.seriesName}` : '' }}
                    </option></select
                  ><button type="button" @click="addAssociation">
                    <AdminIcon name="plus" />添加关联
                  </button>
                </div>
                <p v-if="workError || associationError" class="series-error" role="alert">
                  {{ workError || associationError }}
                </p>
                <p v-if="relatedError" class="series-error" role="alert">
                  {{ relatedError }}
                  <button
                    v-if="currentSeries"
                    type="button"
                    @click="refreshRelated(currentSeries, drawerController!.signal, true)"
                  >
                    重新读取
                  </button>
                </p>
                <div v-if="!selectedWorks.length" class="series-association-empty">
                  暂未选择关联内容
                </div>
                <div v-else class="series-work-list">
                  <div
                    v-for="work in selectedWorks"
                    :key="`${work.type}-${work.id}`"
                    class="series-work-item"
                  >
                    <img
                      v-if="work.coverImageUrl"
                      :src="work.coverImageUrl"
                      :alt="`${work.title}封面`"
                    /><span v-else class="series-work-cover">{{ work.title.slice(0, 1) }}</span
                    ><span class="series-work-kind" :class="work.type">{{
                      workTypeNames[work.type]
                    }}</span
                    ><span class="series-work-copy"
                      ><strong>{{ work.title }}</strong
                      ><small>{{
                        work.type === 'anime' ? '保存后关联到系列' : '仅前端演示 · 不会保存'
                      }}</small></span
                    ><button
                      type="button"
                      :aria-label="`移除 ${work.title}`"
                      @click="removeAssociation(work)"
                    >
                      <AdminIcon name="close" />
                    </button>
                  </div>
                </div>
              </section>
              <p v-if="drawerError" class="series-save-error" role="alert">{{ drawerError }}</p>
            </form>
          </div>
          <footer class="series-drawer-footer">
            <span>{{
              drawerMode === 'detail' ? '系列档案' : '名称必填 · 动画关联使用实际 ID'
            }}</span>
            <div>
              <button class="secondary-button" type="button" @click="closeDrawer">
                {{ drawerMode === 'detail' ? '关闭' : '取消' }}</button
              ><button
                v-if="drawerMode === 'detail'"
                class="primary-button"
                type="button"
                :disabled="!currentSeries"
                @click="openDrawer('edit', currentSeries!)"
              >
                编辑系列</button
              ><button
                v-else
                class="primary-button"
                type="submit"
                form="seriesEditorForm"
                :disabled="
                  saving ||
                  drawerLoading ||
                  relatedLoading ||
                  !!relatedError ||
                  (drawerMode === 'edit' && !currentSeries)
                "
              >
                {{ saving ? '保存中…' : '保存系列' }}
              </button>
            </div>
          </footer>
        </aside>
      </div>
      <div
        v-if="deleteTargets.length && tabActive"
        class="series-dialog-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seriesDeleteTitle"
        @click.self="closeDelete"
      >
        <div class="series-dialog">
          <span class="series-dialog-mark"><AdminIcon name="delete" /></span>
          <h2 id="seriesDeleteTitle">确认删除系列？</h2>
          <p>删除后无法通过页面撤销。请核对以下系列；若仍有动画关联，可能需要先调整动画归属。</p>
          <div class="series-delete-preview">
            <strong>{{ deleteTargets.map((row) => row.name).join('、') }}</strong
            ><small>共 {{ deleteTargets.length }} 项</small>
          </div>
          <label class="series-delete-check"
            ><input
              v-model="deleteConfirmed"
              type="checkbox"
              @change="deleteError = ''"
            />我已核对要删除的系列。</label
          >
          <p v-if="deleteError" class="series-error" role="alert">{{ deleteError }}</p>
          <div class="series-dialog-actions">
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
              {{ deleting ? '删除中…' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
      <div
        v-if="toast && tabActive"
        class="series-toast"
        :class="{ error: toast.error }"
        role="status"
      >
        {{ toast.message }}
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.series-management {
  max-width: 1440px;
  margin: 0 auto;
  padding-bottom: 14px;
}
.series-hero {
  position: relative;
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 30px;
  overflow: hidden;
  background: linear-gradient(
    112deg,
    color-mix(in srgb, var(--surface-solid) 90%, transparent),
    color-mix(in srgb, var(--surface-muted) 82%, transparent)
  );
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-soft);
}
.series-hero::before {
  position: absolute;
  top: -54px;
  right: 13%;
  width: 208px;
  height: 208px;
  content: '';
  border: 1px solid rgba(117, 103, 170, 0.15);
  border-radius: 43% 57% 63% 37%;
  transform: rotate(28deg);
}
.series-hero-copy,
.series-hero > button {
  position: relative;
  z-index: 1;
}
.series-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 9px;
  color: var(--accent-strong);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.16em;
}
.series-eyebrow::before {
  width: 17px;
  height: 1px;
  content: '';
  background: currentColor;
}
.series-hero h1 {
  margin: 0;
  font: 700 clamp(23px, 3vw, 30px)/1.25 var(--font-display);
  letter-spacing: -0.035em;
}
.series-hero h1 span {
  color: var(--ink-faint);
  font: 500 12px var(--font-body);
  letter-spacing: 0;
}
.series-hero-copy > p:last-child {
  max-width: 610px;
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 11px;
}
.series-hero .primary-button {
  flex: 0 0 auto;
  min-height: 38px;
  font-size: 11px;
}
.series-hero .primary-button svg {
  width: 14px;
  height: 14px;
}
.series-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
  margin-top: 16px;
}
.series-stats article {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
}
.series-stat-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 10px;
}
.series-stat-icon svg {
  width: 16px;
  height: 16px;
}
.series-stats article:nth-child(2) .series-stat-icon {
  color: var(--cyan);
  background: var(--cyan-soft);
}
.series-stats article:nth-child(3) .series-stat-icon {
  color: var(--accent);
  background: var(--accent-soft);
}
.series-stats small,
.series-stats strong {
  display: block;
}
.series-stats small {
  color: var(--ink-faint);
  font-size: 9px;
}
.series-stats strong {
  margin-top: 2px;
  color: var(--ink);
  font: 700 18px var(--font-display);
}
.series-list-card {
  margin-top: 16px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
}
.series-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}
.series-list-header h2 {
  margin: 0;
  font: 700 14px var(--font-display);
}
.series-list-header p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 9px;
}
.series-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.series-header-actions > span {
  color: var(--ink-faint);
  font-size: 9px;
}
.series-header-actions .danger-button {
  min-height: 34px;
  font-size: 10px;
}
.series-header-actions .danger-button svg {
  width: 13px;
  height: 13px;
}
.series-header-actions .danger-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}
.series-filter {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 14px 17px;
  border-bottom: 1px solid var(--line);
}
.series-search {
  display: flex;
  width: min(440px, 100%);
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 9px;
}
.series-search:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.series-search > svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--ink-faint);
}
.series-search input {
  width: 100%;
  height: 36px;
  padding: 0;
  color: var(--ink);
  background: transparent;
  border: 0;
  outline: none;
  box-shadow: none;
  font-size: 10px;
}
.series-search input:focus {
  box-shadow: none;
}
.series-search button {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border-radius: 6px;
}
.series-search button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.series-search button svg {
  width: 12px;
  height: 12px;
}
.series-filter > button {
  min-height: 36px;
  font-size: 10px;
}
.series-table-scroll {
  overflow-x: auto;
}
.series-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  text-align: left;
}
.series-table th {
  padding: 10px 13px;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--line);
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}
.series-table td {
  padding: 12px 13px;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  vertical-align: middle;
}
.series-table tbody tr:hover {
  background: var(--surface-hover);
}
.series-table tbody tr:last-child td {
  border-bottom: 0;
}
.series-table th:first-child,
.series-table td:first-child {
  padding-left: 17px;
}
.series-table th:last-child {
  text-align: right;
}
.series-check-cell {
  width: 38px;
}
.series-check-cell input,
.series-delete-check input {
  accent-color: var(--accent);
}
.series-id {
  color: var(--ink-faint);
  font:
    10px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.series-row-name {
  display: block;
  padding: 0;
  color: var(--ink);
  background: transparent;
  font: 700 12px var(--font-display);
  text-align: left;
}
.series-row-name:hover {
  color: var(--accent-strong);
}
.series-row-desc {
  display: block;
  max-width: 580px;
  margin-top: 4px;
  overflow: hidden;
  color: var(--ink-faint);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.series-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.series-row-actions button {
  display: grid;
  width: 29px;
  height: 29px;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border-radius: 7px;
}
.series-row-actions button svg {
  width: 14px;
  height: 14px;
}
.series-row-actions button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.series-row-actions button.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.series-list-state {
  display: grid;
  min-height: 220px;
  justify-items: center;
  align-content: center;
  padding: 36px 20px;
  color: var(--ink-faint);
  text-align: center;
}
.series-state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin-bottom: 12px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 16px;
}
.series-state-icon svg {
  width: 24px;
  height: 24px;
}
.series-list-state strong {
  color: var(--ink);
  font: 700 15px var(--font-display);
}
.series-list-state p {
  max-width: 480px;
  margin: 5px 0 13px;
  font-size: 10px;
}
.series-list-state.error .series-state-icon {
  color: var(--danger);
  background: var(--danger-soft);
}
.series-list-state button {
  min-height: 34px;
  font-size: 10px;
}
.series-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
}
.series-pagination > span,
.series-page-controls {
  color: var(--ink-faint);
  font-size: 9px;
}
.series-page-controls {
  display: flex;
  align-items: center;
  gap: 5px;
}
.series-page-controls button {
  display: grid;
  min-width: 29px;
  height: 29px;
  place-items: center;
  color: var(--ink-soft);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 7px;
  font-size: 9px;
}
.series-page-controls button svg {
  width: 12px;
  height: 12px;
}
.series-page-controls button:hover:not(:disabled) {
  color: var(--accent-strong);
  border-color: var(--accent);
}
.series-page-controls button.active {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}
.series-page-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.series-page-controls select,
.series-page-controls input {
  height: 29px;
  padding: 0 7px;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 7px;
  font-size: 9px;
}
.series-page-controls input {
  width: 43px;
  text-align: center;
}
.series-page-controls input::-webkit-outer-spin-button,
.series-page-controls input::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
}
.series-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 225;
  display: flex;
  justify-content: flex-end;
  background: rgba(18, 17, 30, 0.42);
  backdrop-filter: blur(2px);
  overscroll-behavior: contain;
}
.series-drawer {
  display: flex;
  width: min(620px, 94vw);
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: var(--canvas);
  box-shadow: -24px 0 60px rgba(20, 17, 40, 0.2);
}
.series-drawer-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 21px 23px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.series-drawer-header h2 {
  margin: 0;
  font: 700 19px var(--font-display);
}
.series-drawer-header p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.series-drawer-header button {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.series-drawer-header button:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.series-drawer-header button svg {
  width: 15px;
  height: 15px;
}
.series-drawer-body {
  min-height: 0;
  flex: 1;
  padding: 19px 23px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.series-drawer-state {
  padding: 30px;
  color: var(--ink-soft);
  text-align: center;
}
.series-drawer-state.error {
  color: var(--danger);
}
.series-drawer-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  padding: 13px 23px;
  background: var(--surface);
  border-top: 1px solid var(--line);
}
.series-drawer-footer > span {
  color: var(--ink-faint);
  font-size: 9px;
}
.series-drawer-footer > div {
  display: flex;
  gap: 8px;
}
.series-drawer-footer button {
  min-height: 36px;
  font-size: 10px;
}
.series-drawer-footer button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.series-field {
  margin-bottom: 16px;
}
.series-field label {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
  color: var(--ink-soft);
  font-size: 10px;
  font-weight: 700;
}
.series-field label span {
  color: var(--accent-strong);
}
.series-field input,
.series-field textarea,
.series-association-controls input,
.series-association-controls select {
  display: block;
  width: 100%;
  min-height: 39px;
  padding: 9px 11px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  font-size: 11px;
}
.series-field textarea {
  min-height: 118px;
  resize: vertical;
}
.series-field input:hover,
.series-field textarea:hover,
.series-association-controls input:hover,
.series-association-controls select:hover {
  border-color: rgba(117, 103, 170, 0.42);
}
.series-field input:focus,
.series-field textarea:focus,
.series-association-controls input:focus,
.series-association-controls select:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: var(--focus);
}
.series-field.invalid input {
  border-color: var(--danger);
}
.series-hint {
  margin: 5px 0 0;
  color: var(--ink-faint);
  font-size: 9px;
}
.series-error {
  margin: 6px 0;
  color: var(--danger);
  font-size: 10px;
}
.series-error button {
  padding: 0 3px;
  color: var(--accent-strong);
  background: transparent;
  text-decoration: underline;
}
.series-save-error {
  padding: 10px 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 9px;
  font-size: 10px;
}
.series-association {
  padding: 14px;
  margin: 17px 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 13px;
}
.series-association header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 11px;
}
.series-association header strong {
  font: 700 12px var(--font-display);
}
.series-association header span {
  color: var(--ink-faint);
  font-size: 9px;
}
.series-association > .series-hint {
  margin: -3px 0 11px;
}
.series-association-controls {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 7px;
}
.series-association-controls select,
.series-association-controls input {
  min-width: 0;
  height: 37px;
  min-height: 37px;
  padding: 0 9px;
  font-size: 10px;
}
.series-association-controls > button {
  min-height: 36px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
}
.series-association-controls > button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.series-association-controls > button svg {
  width: 12px;
  height: 12px;
}
.series-work-list {
  display: grid;
  gap: 7px;
  margin-top: 10px;
}
.series-work-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  color: var(--ink);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 9px;
  text-align: left;
}
.series-work-item.related {
  width: 100%;
}
.series-work-item.related:hover {
  border-color: var(--accent);
  background: var(--surface-hover);
}
.series-work-item > img,
.series-work-cover {
  width: 30px;
  height: 39px;
  flex: 0 0 auto;
  object-fit: cover;
  border-radius: 5px;
}
.series-work-cover {
  display: grid;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  font: 700 12px var(--font-display);
}
.series-work-kind {
  flex: 0 0 auto;
  padding: 4px 6px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 5px;
  font-size: 8px;
}
.series-work-kind.manga {
  color: #277c79;
  background: var(--cyan-soft);
}
.series-work-kind.novel {
  color: #946a19;
  background: var(--yellow-soft);
}
.series-work-copy {
  min-width: 0;
  flex: 1;
}
.series-work-copy strong,
.series-work-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.series-work-copy strong {
  font-size: 10px;
}
.series-work-copy small {
  margin-top: 2px;
  color: var(--ink-faint);
  font-size: 8px;
}
.series-work-item > button {
  display: grid;
  width: 27px;
  height: 27px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border-radius: 7px;
}
.series-work-item > button:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.series-work-item > button svg,
.series-work-item.related > svg {
  width: 13px;
  height: 13px;
}
.series-association-empty {
  padding: 12px;
  margin-top: 10px;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border: 1px dashed var(--line-strong);
  border-radius: 9px;
  text-align: center;
  font-size: 9px;
}
.series-detail-kv {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-bottom: 15px;
}
.series-detail-kv > div {
  padding: 11px 12px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.series-detail-kv span,
.series-detail-kv strong {
  display: block;
}
.series-detail-kv span {
  color: var(--ink-faint);
  font-size: 9px;
}
.series-detail-kv strong {
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: var(--ink);
  font-size: 11px;
}
.series-detail-description {
  padding: 14px;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.8;
  white-space: pre-wrap;
}
.series-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(18, 17, 30, 0.48);
  backdrop-filter: blur(4px);
  overscroll-behavior: contain;
}
.series-dialog {
  width: min(460px, 100%);
  max-height: calc(100dvh - 40px);
  padding: 22px;
  overflow-y: auto;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow);
}
.series-dialog-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  margin-bottom: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 11px;
}
.series-dialog-mark svg {
  width: 17px;
  height: 17px;
}
.series-dialog h2 {
  margin: 0;
  font: 700 17px var(--font-display);
}
.series-dialog p {
  margin: 7px 0 0;
  color: var(--ink-soft);
  font-size: 10px;
}
.series-delete-preview {
  padding: 11px 12px;
  margin-top: 14px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.series-delete-preview strong,
.series-delete-preview small {
  display: block;
}
.series-delete-preview strong {
  color: var(--ink);
  font-size: 11px;
}
.series-delete-preview small {
  margin-top: 5px;
  color: var(--ink-faint);
  font-size: 9px;
}
.series-delete-check {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
  color: var(--ink-soft);
  font-size: 10px;
}
.series-dialog .series-error {
  color: var(--danger);
}
.series-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 19px;
}
.series-dialog-actions button {
  min-height: 36px;
  font-size: 10px;
}
.series-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 350;
  max-width: min(380px, calc(100vw - 40px));
  padding: 12px 15px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow);
  font-size: 10px;
}
.series-toast.error {
  color: var(--danger);
  border-color: var(--danger);
}
@media (max-width: 620px) {
  .series-hero {
    display: block;
    min-height: 0;
    padding: 21px 19px;
  }
  .series-hero > button {
    margin-top: 15px;
  }
  .series-stats {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .series-list-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .series-header-actions {
    width: 100%;
    justify-content: space-between;
  }
  .series-filter {
    align-items: stretch;
    flex-direction: column;
  }
  .series-search {
    width: 100%;
  }
  .series-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
  .series-page-controls {
    flex-wrap: wrap;
  }
  .series-drawer {
    width: 100vw;
  }
  .series-drawer-header,
  .series-drawer-body,
  .series-drawer-footer {
    padding-right: 15px;
    padding-left: 15px;
  }
  .series-drawer-footer {
    align-items: stretch;
    flex-direction: column;
  }
  .series-drawer-footer > div {
    justify-content: flex-end;
  }
}
</style>
