<script setup lang="ts">
import {
  computed,
  inject,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getAnimePage } from '@/api/anime'
import {
  createSeries,
  deleteSeries,
  getSeriesById,
  getSeriesPage,
  updateSeries,
} from '@/api/series'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import type { NamedOption, PageResult, SeriesSummary } from '@/types/api'

type DrawerMode = 'create' | 'edit' | 'detail'
type WorkType = 'anime' | 'manga' | 'novel'
type AssociatedWork = {
  type: WorkType
  id: number
  title: string
  coverImageUrl?: string | null
}

const workTypeNames: Record<WorkType, string> = { anime: '动画', manga: '漫画', novel: '小说' }
const pageSizeOptions: NamedOption[] = [5, 10, 20].map((value) => ({
  id: value,
  name: `${value} 条`,
}))

const router = useRouter()
const route = useRoute()
const ownerFullPath = route.fullPath
const navigateLinkedContent =
  inject<(path: '/admin/anime' | '/admin/series', keyword: string) => Promise<void>>(
    'navigateLinkedContent'
  )
const initialName = typeof route.query.name === 'string' ? route.query.name.trim() : ''
const page = ref<PageResult<SeriesSummary>>({
  pageNum: 1,
  pageSize: 10,
  total: 0,
  pages: 0,
  rows: [],
})
const totalSeries = ref(0)
const pageSize = ref(10)
const pageSizeModel = computed({
  get: () => String(pageSize.value),
  set: (value: string) => changePageSize(value),
})
const searchName = ref(initialName)
const appliedName = ref(initialName)
const jumpPage = ref('1')
const selectedIds = ref<number[]>([])
const listLoading = ref(false)
const listError = ref('')
const drawerMode = ref<DrawerMode | null>(null)
const tabActive = ref(true)
const currentSeries = ref<SeriesSummary | null>(null)
const drawerLoading = ref(false)
const drawerError = ref('')
const relatedError = ref('')
const form = reactive({ name: '', description: '' })
const nameError = ref('')
const relatedWorks = ref<AssociatedWork[]>([])
const initialFormState = ref('')
const saving = ref(false)
const deleteTargets = ref<SeriesSummary[]>([])
const deleteConfirmed = ref(false)
const deleteError = ref('')
const deleting = ref(false)
const toast = ref<{ message: string; error: boolean } | null>(null)

let pageController: AbortController | undefined
let drawerController: AbortController | undefined
let toastTimer: number | undefined
let previousBodyOverflow: string | undefined
let previousHtmlOverflow: string | undefined

const hasDrawer = computed(() => drawerMode.value !== null)
const allVisibleSelected = computed(
  () =>
    page.value.rows.length > 0 && page.value.rows.every((row) => selectedIds.value.includes(row.id))
)
const selectedTargets = computed(() =>
  page.value.rows.filter((row) => selectedIds.value.includes(row.id))
)
const firstResult = computed(() =>
  page.value.total ? (page.value.pageNum - 1) * page.value.pageSize + 1 : 0
)
const lastResult = computed(() =>
  Math.min(page.value.pageNum * page.value.pageSize, page.value.total)
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
const isDirty = computed(
  () =>
    (drawerMode.value === 'create' || drawerMode.value === 'edit') &&
    JSON.stringify({
      name: form.name,
      description: form.description,
    }) !== initialFormState.value
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
  openLinkedDetail()
})
onActivated(() => {
  tabActive.value = true
  if (hasDrawer.value || deleteTargets.value.length) lockScroll()
  if (!hasDrawer.value) openLinkedDetail()
})
onDeactivated(() => {
  tabActive.value = false
  unlockScroll()
})
onBeforeUnmount(() => {
  pageController?.abort()
  drawerController?.abort()
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
      appliedName.value
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
function changePageSize(value: string) {
  const nextPageSize = Number(value)
  if (nextPageSize === pageSize.value) return
  pageSize.value = nextPageSize
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

async function loadRelatedAnime(
  series: SeriesSummary,
  signal: AbortSignal
): Promise<AssociatedWork[]> {
  const works: AssociatedWork[] = []
  let currentPage = 1
  let pages = 1
  do {
    const result = await getAnimePage(
      { pageNum: currentPage, pageSize: 100, keyword: series.name },
      signal
    )
    works.push(
      ...result.rows
        .filter((anime) => anime.series?.id === series.id)
        .map((anime) => ({
          type: 'anime' as const,
          id: anime.id,
          title: anime.name,
          coverImageUrl: anime.coverImageUrl,
        }))
    )
    pages = result.pages
    currentPage++
  } while (currentPage <= pages)
  return works
}
async function refreshRelated(series: SeriesSummary, signal: AbortSignal) {
  relatedError.value = ''
  try {
    const works = await loadRelatedAnime(series, signal)
    if (signal.aborted) return
    relatedWorks.value = works
  } catch (error) {
    if (signal.aborted) return
    relatedError.value = messageOf(error, '关联动画读取失败，请稍后重试。')
  }
}
function closeDrawer() {
  if (saving.value) return
  drawerController?.abort()
  drawerMode.value = null
  currentSeries.value = null
  drawerError.value = ''
}
async function openDrawer(mode: DrawerMode, row?: SeriesSummary | number) {
  drawerController?.abort()
  const controller = new AbortController()
  drawerController = controller
  drawerMode.value = mode
  currentSeries.value = typeof row === 'number' ? null : row ?? null
  drawerLoading.value = mode !== 'create'
  drawerError.value = ''
  relatedError.value = ''
  relatedWorks.value = []
  form.name = ''
  form.description = ''
  nameError.value = ''
  if (mode === 'create') {
    drawerLoading.value = false
    saveInitialFormState()
    return
  }
  if (!row) return
  try {
    const detail = await getSeriesById(typeof row === 'number' ? row : row.id, controller.signal)
    if (controller.signal.aborted) return
    currentSeries.value = detail
    form.name = detail.name
    form.description = detail.description ?? ''
    if (mode === 'detail') await refreshRelated(detail, controller.signal)
    if (!controller.signal.aborted) saveInitialFormState()
  } catch (error) {
    if (controller.signal.aborted) return
    currentSeries.value = null
    drawerError.value = messageOf(error, '系列详情读取失败，请重试。')
  } finally {
    if (!controller.signal.aborted) drawerLoading.value = false
  }
}
function openLinkedDetail() {
  const id = Number(route.query.detail)
  if (!Number.isInteger(id) || id <= 0 || route.fullPath !== ownerFullPath) return
  void openDrawer('detail', id)
}
async function saveSeries() {
  nameError.value = form.name.trim() ? '' : '请填写系列名称。'
  if (nameError.value || saving.value) return
  saving.value = true
  drawerError.value = ''
  try {
    const payload = { name: form.name.trim(), description: form.description.trim() || null }
    if (drawerMode.value === 'create') await createSeries(payload)
    else await updateSeries({ id: currentSeries.value!.id, ...payload })
    drawerMode.value = null
    currentSeries.value = null
    showToast('系列保存成功。')
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
    showToast('对应管理页面暂未实现。')
    return
  }
  closeDrawer()
  if (navigateLinkedContent) void navigateLinkedContent('/admin/anime', work.title)
  else void router.push({ path: '/admin/anime', query: { keyword: work.title } })
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
            type="text"
            placeholder="按系列名称搜索"
            autocomplete="off"
            aria-label="按系列名称搜索"
        /></label>
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
          <label class="page-size-wrap">
            <span>每页</span>
            <ArchiveSelect
              id="seriesPageSize"
              v-model="pageSizeModel"
              class="page-size-select"
              label="每页条数"
              placeholder="选择数量"
              placement="top"
              :show-placeholder-option="false"
              :options="pageSizeOptions"
            />
          </label>
          <button
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
                    : currentSeries?.name || '系列档案'
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
              <p v-if="drawerError" class="series-save-error" role="alert">{{ drawerError }}</p>
            </form>
          </div>
          <footer class="series-drawer-footer">
            <span>{{ drawerMode === 'detail' ? '系列档案' : '名称必填' }}</span>
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
                :disabled="saving || drawerLoading || (drawerMode === 'edit' && !currentSeries)"
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
          <p>
            删除后无法通过页面撤销。请核对以下系列；若仍有作品关联此系列，请先调整作品归属，直接删除会导致作品丢失关联系列。
          </p>
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
  font-size: 10px;
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
  font: 700 clamp(23px, 3vw, 30px) / 1.25 var(--font-display);
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
  font-size: 12px;
}
.series-hero .primary-button {
  flex: 0 0 auto;
  min-height: 38px;
  font-size: 12px;
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
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 10px;
}
.series-stat-icon svg {
  width: 18px;
  height: 18px;
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
  font-size: 10px;
}
.series-stats strong {
  margin-top: 2px;
  color: var(--ink);
  font: 700 22px var(--font-display);
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
  font: 700 16px var(--font-display);
}
.series-list-header p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.series-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.series-header-actions > span {
  color: var(--ink-faint);
  font-size: 10px;
}
.series-header-actions .danger-button {
  min-height: 34px;
  font-size: 11px;
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
  font-size: 11px;
}
.series-search input:focus {
  box-shadow: none;
}
.series-filter > button {
  min-height: 36px;
  font-size: 11px;
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
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.series-table td {
  padding: 12px 13px;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--line);
  font-size: 11px;
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
.series-row-name {
  display: block;
  padding: 0;
  color: var(--ink);
  background: transparent;
  font: 700 13px var(--font-display);
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
  font-size: 10px;
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
  font-size: 11px;
}
.series-list-state.error .series-state-icon {
  color: var(--danger);
  background: var(--danger-soft);
}
.series-list-state button {
  min-height: 34px;
  font-size: 11px;
}
.series-pagination {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--line);
}
.series-pagination > span,
.series-page-controls {
  color: var(--ink-faint);
  font-size: 10px;
}
.series-page-controls {
  display: flex;
  align-items: center;
  gap: 7px;
}
.series-page-controls button {
  display: grid;
  min-width: 32px;
  height: 32px;
  place-items: center;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 10px;
}
.series-page-controls button svg {
  width: 12px;
  height: 12px;
}
.series-page-controls button:hover:not(:disabled) {
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-color: rgba(217, 95, 134, 0.3);
}
.series-page-controls button.active {
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-color: rgba(217, 95, 134, 0.3);
}
.series-page-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.series-page-controls input {
  height: 32px;
  padding: 0 7px;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 10px;
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
  animation: series-drawer-fade 0.16s ease both;
}
.series-drawer {
  display: flex;
  width: min(620px, 94vw);
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: var(--canvas);
  box-shadow: -24px 0 60px rgba(20, 17, 40, 0.2);
  animation: series-drawer-slide 0.2s ease both;
}
@keyframes series-drawer-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes series-drawer-slide {
  from {
    opacity: 0.7;
    transform: translateX(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
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
  font-size: 11px;
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
  font-size: 10px;
}
.series-drawer-footer > div {
  display: flex;
  gap: 8px;
}
.series-drawer-footer button {
  min-height: 36px;
  font-size: 11px;
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
  font-size: 11px;
  font-weight: 700;
}
.series-field label span {
  color: var(--accent-strong);
}
.series-field input,
.series-field textarea {
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
.series-field textarea:hover {
  border-color: rgba(117, 103, 170, 0.42);
}
.series-field input:focus,
.series-field textarea:focus {
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
  font-size: 10px;
}
.series-error {
  margin: 6px 0;
  color: var(--danger);
  font-size: 11px;
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
  font-size: 11px;
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
  font: 700 13px var(--font-display);
}
.series-association header span {
  color: var(--ink-faint);
  font-size: 10px;
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
  font-size: 9px;
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
  font-size: 12px;
}
.series-work-copy small {
  margin-top: 2px;
  color: var(--ink-faint);
  font-size: 10px;
}
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
  font-size: 11px;
}
.series-detail-kv {
  display: grid;
  grid-template-columns: 1fr;
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
  font-size: 10px;
}
.series-detail-kv strong {
  margin-top: 4px;
  overflow-wrap: anywhere;
  color: var(--ink);
  font-size: 13px;
}
.series-detail-description {
  padding: 14px;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 12px;
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
  font-size: 11px;
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
  font-size: 12px;
}
.series-delete-preview small {
  margin-top: 5px;
  color: var(--ink-faint);
  font-size: 10px;
}
.series-delete-check {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
  color: var(--ink-soft);
  font-size: 11px;
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
  font-size: 11px;
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
  font-size: 11px;
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
