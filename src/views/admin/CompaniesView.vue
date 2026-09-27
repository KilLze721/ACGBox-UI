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
import { useRoute } from 'vue-router'
import { getAnimePage } from '@/api/anime'
import {
  createCompany,
  deleteCompanies,
  getCompanies,
  getCompanyById,
  updateCompany,
} from '@/api/catalog'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import type { CompanyOption, NamedOption, PageResult } from '@/types/api'

type DrawerMode = 'create' | 'edit' | 'detail'
type RelatedAnime = { id: number; name: string; role: string | null }

const pageSizeOptions: NamedOption[] = [5, 10, 20].map((value) => ({
  id: value,
  name: `${value} 条`,
}))
const route = useRoute()
const initialName = typeof route.query.name === 'string' ? route.query.name.trim() : ''
const page = ref<PageResult<CompanyOption>>({
  pageNum: 1,
  pageSize: 10,
  total: 0,
  pages: 0,
  rows: [],
})
const totalCompanies = ref<number | null>(null)
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
const currentCompany = ref<CompanyOption | null>(null)
const drawerLoading = ref(false)
const drawerError = ref('')
const form = reactive({ name: '', description: '' })
const initialFormState = ref('')
const nameError = ref('')
const saving = ref(false)
const relatedAnime = ref<RelatedAnime[]>([])
const relatedLoading = ref(false)
const relatedError = ref('')
const deleteTargets = ref<CompanyOption[]>([])
const deleteConfirmed = ref(false)
const deleteError = ref('')
const deleting = ref(false)
const toast = ref<{ message: string; error: boolean } | null>(null)

let pageController: AbortController | undefined
let drawerController: AbortController | undefined
let toastTimer: number | undefined
let previousBodyOverflow: string | undefined
let previousHtmlOverflow: string | undefined

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
const isDirty = computed(
  () =>
    (drawerMode.value === 'create' || drawerMode.value === 'edit') &&
    JSON.stringify(form) !== initialFormState.value,
)

defineExpose({
  getCloseState: () => ({ dirty: isDirty.value, submitting: saving.value || deleting.value }),
})

onMounted(() => {
  void loadPage(1)
  void loadTotal()
})
onActivated(() => {
  tabActive.value = true
  if (drawerMode.value || deleteTargets.value.length) lockScroll()
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
watch([drawerMode, () => deleteTargets.value.length], ([mode, count]) => {
  if (!tabActive.value) return
  if (mode || count) lockScroll()
  else unlockScroll()
})

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
function showToast(message: string, error = false) {
  toast.value = { message, error }
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = null
  }, 5000)
}
async function loadTotal() {
  try {
    totalCompanies.value = (await getCompanies('', 1)).total
  } catch {
    totalCompanies.value = null
  }
}
async function loadPage(pageNum: number) {
  pageController?.abort()
  const controller = new AbortController()
  pageController = controller
  listLoading.value = true
  listError.value = ''
  try {
    const result = await getCompanies(appliedName.value, pageSize.value, controller.signal, pageNum)
    if (pageController !== controller) return
    page.value = result
    jumpPage.value = String(result.pageNum)
    selectedIds.value = []
    if (!appliedName.value) totalCompanies.value = result.total
    if (result.total > 0 && result.rows.length === 0 && pageNum > 1) await loadPage(pageNum - 1)
  } catch (error) {
    if (!controller.signal.aborted)
      listError.value = messageOf(error, '公司档案读取失败，请稍后重试。')
  } finally {
    if (pageController === controller) listLoading.value = false
  }
}
function runSearch() {
  appliedName.value = searchName.value.trim()
  searchName.value = appliedName.value
  void loadPage(1)
}
function resetSearch() {
  searchName.value = ''
  appliedName.value = ''
  void loadPage(1)
}
function changePageSize(value: string) {
  const next = Number(value)
  if (next === pageSize.value) return
  pageSize.value = next
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
  const next = Number(jumpPage.value)
  goToPage(next)
  if (!Number.isInteger(next) || next < 1 || next > Math.max(page.value.pages, 1))
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

function closeDrawer() {
  if (saving.value) return
  drawerController?.abort()
  drawerMode.value = null
  currentCompany.value = null
  drawerError.value = ''
}
async function openDrawer(mode: DrawerMode, row?: CompanyOption) {
  drawerController?.abort()
  const controller = new AbortController()
  drawerController = controller
  drawerMode.value = mode
  currentCompany.value = row ?? null
  drawerLoading.value = mode !== 'create'
  drawerError.value = ''
  relatedAnime.value = []
  relatedError.value = ''
  relatedLoading.value = false
  form.name = ''
  form.description = ''
  nameError.value = ''
  if (mode === 'create') {
    drawerLoading.value = false
    initialFormState.value = JSON.stringify(form)
    return
  }
  if (!row) return
  try {
    const company = await getCompanyById(row.id, controller.signal)
    if (controller.signal.aborted) return
    currentCompany.value = company
    form.name = company.name
    form.description = company.description ?? ''
    initialFormState.value = JSON.stringify(form)
    if (mode === 'detail') void loadRelatedAnime(company, controller.signal)
  } catch (error) {
    if (controller.signal.aborted) return
    currentCompany.value = null
    drawerError.value = messageOf(error, '公司详情读取失败，请重试。')
  } finally {
    if (!controller.signal.aborted) drawerLoading.value = false
  }
}
async function loadRelatedAnime(company: CompanyOption, signal: AbortSignal) {
  relatedLoading.value = true
  relatedError.value = ''
  relatedAnime.value = []
  try {
    const works: RelatedAnime[] = []
    let currentPage = 1
    let pages = 1
    do {
      const result = await getAnimePage(
        { pageNum: currentPage, pageSize: 100, companyId: company.id },
        signal,
      )
      works.push(
        ...result.rows.map((anime) => ({
          id: anime.id,
          name: anime.name,
          role: anime.companies.find((item) => item.companyId === company.id)?.role ?? null,
        })),
      )
      pages = result.pages
      currentPage++
    } while (currentPage <= pages)
    if (!signal.aborted) relatedAnime.value = works
  } catch (error) {
    if (!signal.aborted) relatedError.value = messageOf(error, '关联动画读取失败，请稍后重试。')
  } finally {
    if (!signal.aborted) relatedLoading.value = false
  }
}
async function saveCompany() {
  const name = form.name.trim()
  nameError.value = name ? '' : '请填写公司名称。'
  if (nameError.value || saving.value || drawerLoading.value) return
  if (drawerMode.value === 'edit' && !currentCompany.value) return
  saving.value = true
  drawerError.value = ''
  try {
    const payload = { name, description: form.description.trim() || null }
    const created = drawerMode.value === 'create'
    if (created) await createCompany(payload)
    else await updateCompany({ id: currentCompany.value!.id, ...payload })
    drawerMode.value = null
    currentCompany.value = null
    if (created) {
      searchName.value = ''
      appliedName.value = ''
    }
    showToast(created ? '公司档案已添加。' : '公司档案已修改。')
    await Promise.all([loadPage(created ? 1 : page.value.pageNum), loadTotal()])
  } catch (error) {
    const message = messageOf(error, '保存失败，请稍后重试。')
    if (message.includes('已存在') || message.includes('重复')) nameError.value = message
    else drawerError.value = message
  } finally {
    saving.value = false
  }
}
function openDelete(targets: CompanyOption[]) {
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
    deleteError.value = '请先勾选确认框，再删除公司。'
    return
  }
  if (!deleteTargets.value.length || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  const count = deleteTargets.value.length
  try {
    await deleteCompanies(deleteTargets.value.map((row) => row.id))
    deleteTargets.value = []
    showToast(`已删除 ${count} 家公司。`)
    await Promise.all([loadPage(page.value.pageNum), loadTotal()])
  } catch (error) {
    deleteError.value = messageOf(error, '删除失败，请稍后重试。')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="companies-management">
    <section class="companies-hero">
      <div class="companies-hero-copy">
        <p class="companies-eyebrow">CONTENT ARCHIVE / STUDIO INDEX</p>
        <h1>制作公司管理 <span>STUDIO ARCHIVE</span></h1>
        <p>维护动画制作公司档案与简介。新增、修改和查看都在侧边抽屉中完成，列表上下文保持不变。</p>
      </div>
      <button class="primary-button" type="button" @click="openDrawer('create')">
        <AdminIcon name="plus" />新增公司
      </button>
    </section>

    <section class="companies-stats" aria-label="制作公司统计">
      <article>
        <span class="companies-stat-icon"><AdminIcon name="companies" /></span
        ><span
          ><small>公司档案总数</small><strong>{{ totalCompanies ?? '—' }}</strong></span
        >
      </article>
      <article>
        <span class="companies-stat-icon"><AdminIcon name="archive" /></span
        ><span
          ><small>当前页记录</small><strong>{{ page.rows.length }}</strong></span
        >
      </article>
      <article>
        <span class="companies-stat-icon"><AdminIcon name="check" /></span
        ><span
          ><small>已选公司</small><strong>{{ selectedIds.length }}</strong></span
        >
      </article>
    </section>

    <section class="companies-list-card" aria-labelledby="companiesListTitle">
      <header class="companies-list-header">
        <div>
          <h2 id="companiesListTitle">制作公司档案</h2>
          <p>按最近更新排序 · 公司简介为可选信息</p>
        </div>
        <div class="companies-header-actions">
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
      <form class="companies-filter" @submit.prevent="runSearch">
        <label class="companies-search"
          ><AdminIcon name="search-full" /><input
            v-model="searchName"
            type="text"
            placeholder="按公司名称搜索"
            autocomplete="off"
            aria-label="按公司名称搜索"
        /></label>
        <button class="secondary-button" type="submit">查询</button>
        <button class="ghost-button" type="button" @click="resetSearch">重置</button>
      </form>
      <div class="companies-table-scroll">
        <table v-if="!listLoading && !listError && page.rows.length" class="companies-table">
          <thead>
            <tr>
              <th class="companies-check-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="选择当前页全部公司"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th>公司名称 / 简介</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in page.rows" :key="row.id">
              <td class="companies-check-cell">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(row.id)"
                  :aria-label="`选择公司 ${row.name}`"
                  @change="toggleRow(row.id, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td>
                <button class="companies-row-name" type="button" @click="openDrawer('detail', row)">
                  {{ row.name }}</button
                ><span class="companies-row-desc" :title="row.description || '暂无简介'">{{
                  row.description || '暂无简介'
                }}</span>
              </td>
              <td>
                <div class="companies-row-actions">
                  <button
                    type="button"
                    title="查看详情"
                    :aria-label="`查看公司 ${row.name} 详情`"
                    @click="openDrawer('detail', row)"
                  >
                    <AdminIcon name="view" /></button
                  ><button
                    type="button"
                    title="编辑"
                    :aria-label="`编辑公司 ${row.name}`"
                    @click="openDrawer('edit', row)"
                  >
                    <AdminIcon name="edit" /></button
                  ><button
                    class="danger"
                    type="button"
                    title="删除"
                    :aria-label="`删除公司 ${row.name}`"
                    @click="openDelete([row])"
                  >
                    <AdminIcon name="delete" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="companies-list-state" :class="{ error: !!listError }">
          <span class="companies-state-icon"
            ><AdminIcon :name="listError ? 'refresh' : 'companies'"
          /></span>
          <strong>{{
            listLoading
              ? '正在读取公司档案…'
              : listError
                ? '公司资料读取失败'
                : appliedName
                  ? '没有匹配的公司'
                  : '暂无公司档案'
          }}</strong>
          <p>
            {{
              listError ||
              (appliedName
                ? '请尝试其他公司名称，或清空查询条件。'
                : '创建一条制作公司档案后，将显示在此处。')
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
            新增公司
          </button>
        </div>
      </div>
      <footer class="companies-pagination">
        <span>第 {{ firstResult }}–{{ lastResult }} 条，共 {{ page.total }} 条</span>
        <div class="companies-page-controls">
          <label class="page-size-wrap"
            ><span>每页</span
            ><ArchiveSelect
              id="companiesPageSize"
              v-model="pageSizeModel"
              class="page-size-select"
              label="每页条数"
              placeholder="选择数量"
              placement="top"
              :show-placeholder-option="false"
              :options="pageSizeOptions"
          /></label>
          <button
            type="button"
            aria-label="上一页"
            :disabled="page.pageNum <= 1"
            @click="goToPage(page.pageNum - 1)"
          >
            <AdminIcon name="left" />
          </button>
          <template v-for="(number, index) in pageNumbers" :key="`${number}-${index}`"
            ><button
              v-if="typeof number === 'number'"
              type="button"
              :class="{ active: number === page.pageNum }"
              :aria-current="number === page.pageNum ? 'page' : undefined"
              @click="goToPage(number)"
            >
              {{ number }}</button
            ><span v-else>…</span></template
          >
          <button
            type="button"
            aria-label="下一页"
            :disabled="page.pageNum >= Math.max(page.pages, 1)"
            @click="goToPage(page.pageNum + 1)"
          >
            <AdminIcon name="right" />
          </button>
          <label for="companiesJumpPage">跳至</label
          ><input
            id="companiesJumpPage"
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
      <div v-if="drawerMode && tabActive" class="companies-drawer-layer" @click.self="closeDrawer">
        <aside
          class="companies-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="
            drawerMode === 'create' ? '新增公司' : drawerMode === 'edit' ? '编辑公司' : '公司详情'
          "
        >
          <header class="companies-drawer-header">
            <div>
              <h2>
                {{
                  drawerMode === 'create'
                    ? '新增公司'
                    : drawerMode === 'edit'
                      ? '编辑公司'
                      : '公司详情'
                }}
              </h2>
              <p>
                {{
                  drawerMode === 'create'
                    ? '在制作公司档案中创建一条记录'
                    : currentCompany?.name || '制作公司档案'
                }}
              </p>
            </div>
            <button type="button" aria-label="关闭抽屉" @click="closeDrawer">
              <AdminIcon name="close" />
            </button>
          </header>
          <div class="companies-drawer-body">
            <div v-if="drawerLoading" class="companies-drawer-state">正在读取公司资料…</div>
            <div
              v-else-if="drawerError && !currentCompany && drawerMode !== 'create'"
              class="companies-drawer-state error"
              role="alert"
            >
              {{ drawerError }}
            </div>
            <template v-else-if="drawerMode === 'detail'">
              <div class="companies-detail-kv">
                <div>
                  <span>公司名称</span><strong>{{ currentCompany?.name }}</strong>
                </div>
              </div>
              <div class="companies-field">
                <label>公司简介</label>
                <div class="companies-detail-description">
                  {{ currentCompany?.description?.trim() || '暂无简介' }}
                </div>
              </div>
              <section class="companies-association">
                <header>
                  <div>
                    <h3>关联内容与负责职责</h3>
                    <p>关联动画和该公司在作品中的职责</p>
                  </div>
                  <span>{{ relatedAnime.length }} 条</span>
                </header>
                <p v-if="relatedLoading" class="companies-association-state">正在读取关联动画…</p>
                <p v-else-if="relatedError" class="companies-association-state error" role="alert">
                  {{ relatedError }}
                  <button
                    v-if="currentCompany"
                    type="button"
                    @click="loadRelatedAnime(currentCompany, drawerController!.signal)"
                  >
                    重新读取
                  </button>
                </p>
                <p v-else-if="!relatedAnime.length" class="companies-association-state">
                  暂无关联动画
                </p>
                <div v-else class="companies-association-list">
                  <article v-for="anime in relatedAnime" :key="anime.id">
                    <strong>{{ anime.name }}</strong
                    ><span>动画</span><small>{{ anime.role || '未注明职责' }}</small>
                  </article>
                </div>
              </section>
            </template>
            <form v-else id="companyEditorForm" @submit.prevent="saveCompany">
              <div class="companies-field" :class="{ invalid: !!nameError }">
                <label for="companyName">公司名称 <span>*</span></label
                ><input
                  id="companyName"
                  v-model="form.name"
                  maxlength="120"
                  placeholder="输入公司名称，例如：京都动画"
                  autocomplete="off"
                  @input="nameError = ''"
                />
                <p v-if="nameError" class="companies-error" role="alert">{{ nameError }}</p>
                <p class="companies-hint">公司名称不可与已有档案重复。</p>
              </div>
              <div class="companies-field">
                <label for="companyDescription">公司简介</label
                ><textarea
                  id="companyDescription"
                  v-model="form.description"
                  maxlength="2000"
                  placeholder="可补充公司简介、常用名称或编辑备注"
                ></textarea>
                <p class="companies-hint">可留空；仅维护公司名称与简介。</p>
              </div>
              <p v-if="drawerError" class="companies-error" role="alert">{{ drawerError }}</p>
            </form>
          </div>
          <footer class="companies-drawer-footer">
            <span>{{ drawerMode === 'detail' ? '制作公司档案' : '公司名称必填 · 简介可选' }}</span>
            <div>
              <button class="secondary-button" type="button" @click="closeDrawer">
                {{ drawerMode === 'detail' ? '关闭' : '取消' }}</button
              ><button
                v-if="drawerMode === 'detail'"
                class="primary-button"
                type="button"
                :disabled="!currentCompany"
                @click="openDrawer('edit', currentCompany!)"
              >
                编辑公司</button
              ><button
                v-else
                class="primary-button"
                type="submit"
                form="companyEditorForm"
                :disabled="saving || drawerLoading || (drawerMode === 'edit' && !currentCompany)"
              >
                {{ saving ? '保存中…' : '保存公司' }}
              </button>
            </div>
          </footer>
        </aside>
      </div>
      <div
        v-if="deleteTargets.length && tabActive"
        class="companies-dialog-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="companiesDeleteTitle"
        @click.self="closeDelete"
      >
        <div class="companies-dialog">
          <span class="companies-dialog-mark"><AdminIcon name="delete" /></span>
          <h2 id="companiesDeleteTitle">确认删除公司？</h2>
          <p>删除后无法通过页面撤销。请核对以下公司。</p>
          <div class="companies-delete-preview">
            <strong>{{ deleteTargets.map((row) => row.name).join('、') }}</strong
            ><small>共 {{ deleteTargets.length }} 项</small>
          </div>
          <label class="companies-delete-check"
            ><input
              v-model="deleteConfirmed"
              type="checkbox"
              @change="deleteError = ''"
            />我已核对要删除的公司及其关联作品。</label
          >
          <p v-if="deleteError" class="companies-error companies-checkbox-error" role="alert">
            {{ deleteError }}
          </p>
          <div class="companies-delete-note" role="note">
            <span aria-hidden="true">!</span
            ><span
              >若仍有动画关联这些公司，请先核对作品资料；删除请求及关联关系按后端规则处理。</span
            >
          </div>
          <div class="companies-dialog-actions">
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
        class="companies-toast"
        :class="{ error: toast.error }"
        role="status"
      >
        {{ toast.message }}
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.companies-management {
  max-width: 1440px;
  margin: 0 auto;
  padding-bottom: 14px;
}
.companies-hero {
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
.companies-hero::before {
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
.companies-hero-copy,
.companies-hero > button {
  position: relative;
  z-index: 1;
}
.companies-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 9px;
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.16em;
}
.companies-eyebrow::before {
  width: 17px;
  height: 1px;
  content: '';
  background: currentColor;
}
.companies-hero h1 {
  margin: 0;
  font: 700 clamp(23px, 3vw, 30px) / 1.25 var(--font-display);
  letter-spacing: -0.035em;
}
.companies-hero h1 span {
  color: var(--ink-faint);
  font: 500 12px var(--font-body);
  letter-spacing: 0;
}
.companies-hero-copy > p:last-child {
  max-width: 610px;
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
}
.companies-hero .primary-button {
  flex: 0 0 auto;
  min-height: 38px;
  font-size: 12px;
}
.companies-hero .primary-button svg {
  width: 14px;
  height: 14px;
}
.companies-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
  margin-top: 16px;
}
.companies-stats article {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
}
.companies-stat-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 10px;
}
.companies-stat-icon svg {
  width: 18px;
  height: 18px;
}
.companies-stats article:nth-child(2) .companies-stat-icon {
  color: var(--cyan);
  background: var(--cyan-soft);
}
.companies-stats article:nth-child(3) .companies-stat-icon {
  color: var(--accent);
  background: var(--accent-soft);
}
.companies-stats small,
.companies-stats strong {
  display: block;
}
.companies-stats small {
  color: var(--ink-faint);
  font-size: 10px;
}
.companies-stats strong {
  margin-top: 2px;
  color: var(--ink);
  font: 700 22px var(--font-display);
}
.companies-list-card {
  margin-top: 16px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
}
.companies-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}
.companies-list-header h2 {
  margin: 0;
  font: 700 16px var(--font-display);
}
.companies-list-header p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.companies-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.companies-header-actions > span {
  color: var(--ink-faint);
  font-size: 10px;
}
.companies-header-actions .danger-button {
  min-height: 34px;
  font-size: 11px;
}
.companies-header-actions .danger-button svg {
  width: 13px;
  height: 13px;
}
.companies-header-actions .danger-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}
.companies-filter {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 14px 17px;
  border-bottom: 1px solid var(--line);
}
.companies-search {
  display: flex;
  width: min(440px, 100%);
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 9px;
}
.companies-search:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.companies-search > svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--ink-faint);
}
.companies-search input {
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
.companies-search input:focus {
  box-shadow: none;
}
.companies-filter > button {
  min-height: 36px;
  font-size: 11px;
}
.companies-table-scroll {
  overflow-x: auto;
}
.companies-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  text-align: left;
}
.companies-table th {
  padding: 10px 13px;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.companies-table td {
  padding: 12px 13px;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  vertical-align: middle;
}
.companies-table tbody tr:hover {
  background: var(--surface-hover);
}
.companies-table tbody tr:last-child td {
  border-bottom: 0;
}
.companies-table th:first-child,
.companies-table td:first-child {
  padding-left: 17px;
}
.companies-table th:last-child {
  text-align: right;
}
.companies-check-cell {
  width: 38px;
}
.companies-check-cell input {
  accent-color: var(--accent);
}
.companies-row-name {
  display: block;
  padding: 0;
  color: var(--ink);
  background: transparent;
  font: 700 13px var(--font-display);
  text-align: left;
}
.companies-row-name:hover {
  color: var(--accent-strong);
}
.companies-row-desc {
  display: block;
  max-width: 620px;
  margin-top: 4px;
  overflow: hidden;
  color: var(--ink-faint);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.companies-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.companies-row-actions button {
  display: grid;
  width: 29px;
  height: 29px;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border-radius: 7px;
}
.companies-row-actions button svg {
  width: 14px;
  height: 14px;
}
.companies-row-actions button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.companies-row-actions button.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.companies-list-state {
  display: grid;
  min-height: 220px;
  justify-items: center;
  align-content: center;
  padding: 36px 20px;
  color: var(--ink-faint);
  text-align: center;
}
.companies-state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin-bottom: 12px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 16px;
}
.companies-state-icon svg {
  width: 24px;
  height: 24px;
}
.companies-list-state strong {
  color: var(--ink);
  font: 700 15px var(--font-display);
}
.companies-list-state p {
  max-width: 480px;
  margin: 5px 0 13px;
  font-size: 11px;
}
.companies-list-state.error .companies-state-icon {
  color: var(--danger);
  background: var(--danger-soft);
}
.companies-list-state button {
  min-height: 34px;
  font-size: 11px;
}
.companies-pagination {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--line);
}
.companies-pagination > span,
.companies-page-controls {
  color: var(--ink-faint);
  font-size: 10px;
}
.companies-page-controls {
  display: flex;
  align-items: center;
  gap: 7px;
}
.companies-page-controls button {
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
.companies-page-controls button svg {
  width: 12px;
  height: 12px;
}
.companies-page-controls button:hover:not(:disabled),
.companies-page-controls button.active {
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-color: rgba(217, 95, 134, 0.3);
}
.companies-page-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.companies-page-controls input {
  width: 43px;
  height: 32px;
  padding: 0 7px;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 8px;
  font-size: 10px;
  text-align: center;
}
.companies-page-controls input::-webkit-outer-spin-button,
.companies-page-controls input::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
}
.companies-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 225;
  display: flex;
  justify-content: flex-end;
  background: rgba(18, 17, 30, 0.42);
  backdrop-filter: blur(2px);
  overscroll-behavior: contain;
  animation: companies-drawer-fade 0.16s ease both;
}
.companies-drawer {
  display: flex;
  width: min(560px, 94vw);
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: var(--canvas);
  box-shadow: -24px 0 60px rgba(20, 17, 40, 0.2);
  animation: companies-drawer-slide 0.2s ease both;
}
@keyframes companies-drawer-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes companies-drawer-slide {
  from {
    opacity: 0.7;
    transform: translateX(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.companies-drawer-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 21px 23px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.companies-drawer-header h2 {
  margin: 0;
  font: 700 19px var(--font-display);
}
.companies-drawer-header p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.companies-drawer-header button {
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
.companies-drawer-header button:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.companies-drawer-header button svg {
  width: 15px;
  height: 15px;
}
.companies-drawer-body {
  min-height: 0;
  flex: 1;
  padding: 19px 23px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.companies-drawer-state {
  padding: 30px;
  color: var(--ink-soft);
  text-align: center;
}
.companies-drawer-state.error {
  color: var(--danger);
}
.companies-drawer-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  padding: 13px 23px;
  background: var(--surface);
  border-top: 1px solid var(--line);
}
.companies-drawer-footer > span {
  color: var(--ink-faint);
  font-size: 10px;
}
.companies-drawer-footer > div {
  display: flex;
  gap: 8px;
}
.companies-drawer-footer button {
  min-height: 36px;
  font-size: 11px;
}
.companies-drawer-footer button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.companies-field {
  margin-bottom: 17px;
}
.companies-field label {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 700;
}
.companies-field label span {
  color: var(--accent-strong);
}
.companies-field input,
.companies-field textarea {
  display: block;
  width: 100%;
  min-height: 40px;
  padding: 9px 11px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  font-size: 11px;
}
.companies-field textarea {
  min-height: 126px;
  resize: vertical;
}
.companies-field input:hover,
.companies-field textarea:hover {
  border-color: rgba(117, 103, 170, 0.42);
}
.companies-field input:focus,
.companies-field textarea:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: var(--focus);
}
.companies-field.invalid input {
  border-color: var(--danger);
}
.companies-hint {
  margin: 5px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.companies-error {
  margin: 6px 0;
  color: var(--danger);
  font-size: 11px;
}
.companies-error button {
  padding: 0 3px;
  color: var(--accent-strong);
  background: transparent;
  text-decoration: underline;
}
.companies-detail-kv {
  display: grid;
  gap: 9px;
  margin-bottom: 15px;
}
.companies-detail-kv > div {
  padding: 11px 12px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.companies-detail-kv span,
.companies-detail-kv strong {
  display: block;
}
.companies-detail-kv span {
  color: var(--ink-faint);
  font-size: 10px;
}
.companies-detail-kv strong {
  margin-top: 4px;
  color: var(--ink);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.companies-detail-description {
  min-height: 70px;
  padding: 12px;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 11px;
  white-space: pre-wrap;
}
.companies-association {
  padding: 15px;
  margin-top: 18px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.companies-association header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.companies-association h3 {
  margin: 0;
  font: 700 14px var(--font-display);
}
.companies-association header p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.companies-association header > span {
  flex: 0 0 auto;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 10px;
}
.companies-association-state {
  padding: 22px 5px;
  margin: 0;
  color: var(--ink-faint);
  font-size: 11px;
  text-align: center;
}
.companies-association-state.error {
  color: var(--danger);
}
.companies-association-list {
  display: grid;
  gap: 8px;
  padding-top: 12px;
}
.companies-association-list article {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 11px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.companies-association-list strong {
  min-width: 0;
  flex: 1;
  color: var(--ink);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.companies-association-list article > span {
  padding: 3px 7px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 999px;
  font-size: 10px;
}
.companies-association-list small {
  padding: 3px 7px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 999px;
  font-size: 10px;
}
.companies-dialog-layer {
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
.companies-dialog {
  width: min(460px, 100%);
  max-height: calc(100dvh - 40px);
  padding: 22px;
  overflow-y: auto;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow);
}
.companies-dialog-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  margin-bottom: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 11px;
}
.companies-dialog-mark svg {
  width: 17px;
  height: 17px;
}
.companies-dialog h2 {
  margin: 0;
  font: 700 17px var(--font-display);
}
.companies-dialog > p {
  margin: 7px 0 0;
  color: var(--ink-soft);
  font-size: 11px;
}
.companies-delete-preview {
  padding: 11px 12px;
  margin-top: 14px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.companies-delete-preview strong,
.companies-delete-preview small {
  display: block;
}
.companies-delete-preview strong {
  color: var(--ink);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.companies-delete-preview small {
  margin-top: 5px;
  color: var(--ink-faint);
  font-size: 10px;
}
.companies-delete-check {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
  color: var(--ink-soft);
  font-size: 11px;
}
.companies-delete-check input {
  margin: 0;
  accent-color: var(--danger);
}
.companies-checkbox-error {
  margin-left: 20px;
}
.companies-delete-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 9px 10px;
  margin-top: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 9px;
  font-size: 11px;
}
.companies-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 19px;
}
.companies-dialog-actions button {
  min-height: 36px;
  font-size: 11px;
}
.companies-toast {
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
.companies-toast.error {
  color: var(--danger);
  border-color: var(--danger);
}
@media (max-width: 700px) {
  .companies-hero {
    display: block;
    min-height: 0;
    padding: 21px 19px;
  }
  .companies-hero > button {
    margin-top: 15px;
  }
  .companies-stats {
    grid-template-columns: 1fr;
  }
  .companies-list-header,
  .companies-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
  .companies-header-actions {
    width: 100%;
    justify-content: space-between;
  }
  .companies-filter {
    align-items: stretch;
    flex-direction: column;
  }
  .companies-search {
    width: 100%;
  }
  .companies-page-controls {
    flex-wrap: wrap;
  }
  .companies-drawer {
    width: 100vw;
  }
  .companies-drawer-header,
  .companies-drawer-body,
  .companies-drawer-footer {
    padding-right: 15px;
    padding-left: 15px;
  }
  .companies-drawer-footer {
    align-items: stretch;
    flex-direction: column;
  }
  .companies-drawer-footer > div {
    justify-content: flex-end;
  }
}
</style>
