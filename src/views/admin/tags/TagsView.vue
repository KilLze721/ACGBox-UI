<script setup lang="ts">
/**
 * 标签管理页面：按名称搜索和分页展示标签，使用抽屉完成新增、修改。
 * 管理行选择、批量删除确认及未保存状态；不提供标签详情页面。
 */
import '@/assets/adminManagementCards.css'
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { createTag, deleteTags, getTagById, getTagPage, updateTag } from '@/api/tags'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import type { NamedOption, PageResult } from '@/types/api'
import { pageSizeValues, resolvePageSize } from '@/utils/preferences'

type DrawerMode = 'create' | 'edit'

const pageSizeOptions: NamedOption[] = pageSizeValues.map((value) => ({
  id: value,
  name: `${value} 条`,
}))
const route = useRoute()
const initialName = typeof route.query.name === 'string' ? route.query.name.trim() : ''
const page = ref<PageResult<NamedOption>>({
  pageNum: 1,
  pageSize: resolvePageSize(pageSizeOptions.map((option) => option.id), 10),
  total: 0,
  pages: 0,
  rows: [],
})
const totalTags = ref<number | null>(null)
const pageSize = ref(page.value.pageSize)
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
const currentTag = ref<NamedOption | null>(null)
const formName = ref('')
const initialNameValue = ref('')
const nameError = ref('')
const drawerError = ref('')
const drawerLoading = ref(false)
const saving = ref(false)
const deleteTargets = ref<NamedOption[]>([])
const deleteConfirmed = ref(false)
const deleteError = ref('')
const deleting = ref(false)
const toast = ref<{ message: string; error: boolean } | null>(null)
const tabActive = ref(true)

let pageController: AbortController | undefined
let drawerController: AbortController | undefined
let toastTimer: number | undefined
let previousBodyOverflow: string | undefined
let previousHtmlOverflow: string | undefined

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
  () => drawerMode.value !== null && formName.value !== initialNameValue.value
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
    totalTags.value = (await getTagPage(1, 1)).total
  } catch {
    totalTags.value = null
  }
}
async function loadPage(pageNum: number) {
  pageController?.abort()
  const controller = new AbortController()
  pageController = controller
  listLoading.value = true
  listError.value = ''
  try {
    const result = await getTagPage(pageNum, pageSize.value, controller.signal, appliedName.value)
    if (pageController !== controller) return
    page.value = result
    jumpPage.value = String(result.pageNum)
    selectedIds.value = []
    if (!appliedName.value) totalTags.value = result.total
    if (result.total > 0 && result.rows.length === 0 && pageNum > 1) await loadPage(pageNum - 1)
  } catch (error) {
    if (controller.signal.aborted) return
    listError.value = messageOf(error, '标签读取失败，请稍后重试。')
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
  pageSize.value = resolvePageSize(pageSizeOptions.map((option) => option.id), 10)
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

function closeDrawer() {
  if (saving.value) return
  drawerController?.abort()
  drawerMode.value = null
  currentTag.value = null
  drawerError.value = ''
}
async function openDrawer(mode: DrawerMode, row?: NamedOption) {
  drawerController?.abort()
  const controller = new AbortController()
  drawerController = controller
  drawerMode.value = mode
  currentTag.value = row ?? null
  formName.value = row?.name ?? ''
  initialNameValue.value = formName.value
  nameError.value = ''
  drawerError.value = ''
  drawerLoading.value = mode === 'edit'
  if (mode === 'create' || !row) return
  try {
    const tag = await getTagById(row.id, controller.signal)
    if (controller.signal.aborted) return
    currentTag.value = tag
    formName.value = tag.name
    initialNameValue.value = tag.name
  } catch (error) {
    if (controller.signal.aborted) return
    currentTag.value = null
    drawerError.value = messageOf(error, '标签读取失败，请重试。')
  } finally {
    if (!controller.signal.aborted) drawerLoading.value = false
  }
}
async function saveTag() {
  const name = formName.value.trim()
  nameError.value = name ? '' : '标签名称不能为空。'
  if (nameError.value || saving.value || drawerLoading.value) return
  if (drawerMode.value === 'edit' && !currentTag.value) return
  saving.value = true
  drawerError.value = ''
  try {
    if (drawerMode.value === 'create') await createTag({ name })
    else await updateTag({ id: currentTag.value!.id, name })
    const created = drawerMode.value === 'create'
    closeDrawerAfterSave()
    if (created) {
      searchName.value = ''
      appliedName.value = ''
    }
    showToast(created ? '标签已添加。' : '标签已修改。')
    await Promise.all([loadPage(created ? 1 : page.value.pageNum), loadTotal()])
  } catch (error) {
    const message = messageOf(error, '保存失败，请稍后重试。')
    if (message.includes('已存在')) nameError.value = message
    else drawerError.value = message
  } finally {
    saving.value = false
  }
}
function closeDrawerAfterSave() {
  drawerController?.abort()
  drawerMode.value = null
  currentTag.value = null
}
function openDelete(targets: NamedOption[]) {
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
    deleteError.value = '请先勾选确认框，再删除标签。'
    return
  }
  if (!deleteTargets.value.length || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  const count = deleteTargets.value.length
  try {
    await deleteTags(deleteTargets.value.map((row) => row.id))
    deleteTargets.value = []
    showToast(`已删除 ${count} 个标签。`)
    await Promise.all([loadPage(page.value.pageNum), loadTotal()])
  } catch (error) {
    deleteError.value = messageOf(error, '删除失败，请稍后重试。')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="tags-management management-cards">
    <section class="tags-hero management-hero">
      <div class="tags-hero-copy management-hero-copy">
        <p class="tags-eyebrow management-eyebrow">CONTENT ARCHIVE / TAG INDEX</p>
        <h1>标签管理 <span>TAG ARCHIVE</span></h1>
        <p>
          统一维护资料标签名称，为动画资料的检索与分类提供稳定词条。新增和修改均在当前页面抽屉中完成。
        </p>
      </div>
      <button class="primary-button" type="button" @click="openDrawer('create')">
        <AdminIcon name="plus" />新增标签
      </button>
    </section>

    <section class="tags-stats management-stats" aria-label="标签统计">
      <article class="management-stat">
        <span class="tags-stat-icon management-stat-icon"><AdminIcon name="tags" /></span
        ><span class="management-stat-copy"
          ><small class="management-stat-label">标签总数</small><strong class="management-stat-value">{{ totalTags ?? '—' }}</strong></span
        >
      </article>
      <article class="management-stat">
        <span class="tags-stat-icon management-stat-icon"><AdminIcon name="archive" /></span
        ><span class="management-stat-copy"
          ><small class="management-stat-label">当前页记录</small><strong class="management-stat-value">{{ page.rows.length }}</strong></span
        >
      </article>
      <article class="management-stat">
        <span class="tags-stat-icon management-stat-icon"><AdminIcon name="check" /></span
        ><span class="management-stat-copy"
          ><small class="management-stat-label">已选标签</small><strong class="management-stat-value">{{ selectedIds.length }}</strong></span
        >
      </article>
    </section>

    <section class="tags-list-card management-list-card" aria-labelledby="tagsListTitle">
      <header class="tags-list-header management-list-header">
        <div>
          <h2 id="tagsListTitle">标签词条列表</h2>
          <p>维护清晰、唯一的标签名称，便于作品检索与分类</p>
        </div>
        <div class="tags-header-actions management-list-actions">
          <span class="management-list-meta">当前显示 {{ page.rows.length }} 条 · 共 {{ page.total }} 条</span
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
      <form class="tags-filter management-filter" @submit.prevent="runSearch">
        <label class="tags-search management-search"
          ><AdminIcon name="search-full" /><input
            v-model="searchName"
            type="text"
            placeholder="按标签名称搜索"
            autocomplete="off"
            aria-label="按标签名称搜索" /><button
            v-if="searchName"
            type="button"
            aria-label="清空搜索"
            @click.prevent="resetSearch"
          >
            <AdminIcon name="close" /></button
        ></label>
        <button class="secondary-button" type="submit">查询</button>
        <button class="ghost-button" type="button" @click="resetSearch">重置</button>
      </form>
      <div class="tags-table-scroll management-table-scroll">
        <table v-if="!listLoading && !listError && page.rows.length" class="tags-table management-table">
          <thead>
            <tr>
              <th class="tags-check-cell management-check-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="选择当前页全部标签"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th>标签名称</th>
              <th class="management-actions-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in page.rows" :key="row.id">
              <td class="tags-check-cell management-check-cell">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(row.id)"
                  :aria-label="`选择标签 ${row.name}`"
                  @change="toggleRow(row.id, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td>
                <span class="tags-name">{{ row.name }}</span>
              </td>
              <td class="management-actions-cell">
                <div class="tags-row-actions management-row-actions">
                  <button class="management-row-action management-icon-action"
                    type="button"
                    title="编辑"
                    :aria-label="`编辑标签 ${row.name}`"
                    @click="openDrawer('edit', row)"
                  >
                    <AdminIcon name="edit" /></button
                  ><button
                    class="danger management-row-action management-icon-action"
                    type="button"
                    title="删除"
                    :aria-label="`删除标签 ${row.name}`"
                    @click="openDelete([row])"
                  >
                    <AdminIcon name="delete" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="tags-list-state management-list-state" :class="{ error: !!listError }">
          <span class="tags-state-icon management-state-icon"><AdminIcon :name="listError ? 'refresh' : 'tags'" /></span>
          <strong>{{
            listLoading
              ? '正在读取标签…'
              : listError
              ? '标签读取失败'
              : appliedName
              ? '没有匹配的标签'
              : '暂无标签'
          }}</strong>
          <p>
            {{
              listError ||
              (appliedName
                ? '请尝试其他标签名称，或清空查询条件。'
                : '创建一条标签词条后，将显示在此处。')
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
            新增标签
          </button>
        </div>
      </div>
      <footer class="tags-pagination management-pagination">
        <span>第 {{ firstResult }}–{{ lastResult }} 条，共 {{ page.total }} 条</span>
        <div class="tags-page-controls management-page-controls">
          <label class="page-size-wrap management-page-size-wrap"
            ><span>每页</span
            ><ArchiveSelect
              id="tagsPageSize"
              v-model="pageSizeModel"
              class="page-size-select management-page-size"
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
          <label for="tagsJumpPage">跳至</label
          ><input
            id="tagsJumpPage"
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
      <div v-if="drawerMode && tabActive" class="tags-drawer-layer" @click.self="closeDrawer">
        <aside
          class="tags-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="drawerMode === 'create' ? '新增标签' : '编辑标签'"
        >
          <header class="tags-drawer-header">
            <div>
              <h2>{{ drawerMode === 'create' ? '新增标签' : '编辑标签' }}</h2>
              <p>
                {{
                  drawerMode === 'create'
                    ? '在标签库中创建一条词条'
                    : `正在修改标签词条 · ${currentTag?.name || ''}`
                }}
              </p>
            </div>
            <button type="button" aria-label="关闭抽屉" @click="closeDrawer">
              <AdminIcon name="close" />
            </button>
          </header>
          <div class="tags-drawer-body">
            <div v-if="drawerLoading" class="tags-drawer-state">正在读取标签资料…</div>
            <div
              v-else-if="drawerError && !currentTag && drawerMode === 'edit'"
              class="tags-drawer-state error"
              role="alert"
            >
              {{ drawerError }}
            </div>
            <form v-else id="tagEditorForm" @submit.prevent="saveTag">
              <div class="tags-field" :class="{ invalid: !!nameError }">
                <label for="tagsEditorName">标签名称 <span>*</span></label
                ><input
                  id="tagsEditorName"
                  v-model="formName"
                  maxlength="80"
                  placeholder="输入标签名称，例如：奇幻"
                  autocomplete="off"
                  @input="nameError = ''"
                />
                <p v-if="nameError" class="tags-error" role="alert">{{ nameError }}</p>
                <p class="tags-hint">同名标签不允许重复创建。</p>
              </div>
              <p v-if="drawerError" class="tags-save-error" role="alert">{{ drawerError }}</p>
            </form>
          </div>
          <footer class="tags-drawer-footer">
            <span>标签名称必填</span>
            <div>
              <button class="secondary-button" type="button" @click="closeDrawer">取消</button
              ><button
                class="primary-button"
                type="submit"
                form="tagEditorForm"
                :disabled="saving || drawerLoading || (drawerMode === 'edit' && !currentTag)"
              >
                {{ saving ? '保存中…' : '保存标签' }}
              </button>
            </div>
          </footer>
        </aside>
      </div>
      <div
        v-if="deleteTargets.length && tabActive"
        class="tags-dialog-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tagsDeleteTitle"
        @click.self="closeDelete"
      >
        <div class="tags-dialog">
          <span class="tags-dialog-mark"><AdminIcon name="delete" /></span>
          <h2 id="tagsDeleteTitle">确认删除标签？</h2>
          <p>删除后无法通过页面撤销。请核对以下标签。</p>
          <div class="tags-delete-preview">
            <strong>{{ deleteTargets.map((row) => row.name).join('、') }}</strong
            ><small>共 {{ deleteTargets.length }} 项</small>
          </div>
          <label class="tags-delete-check"
            ><input
              v-model="deleteConfirmed"
              type="checkbox"
              @change="deleteError = ''"
            />我已核对要删除的标签及其关联作品。</label
          >
          <p
            v-if="deleteError"
            class="tags-error"
            :class="{ 'tags-checkbox-error': !deleteConfirmed }"
            role="alert"
          >
            {{ deleteError }}
          </p>
          <div class="tags-delete-note" role="note">
            <span aria-hidden="true">!</span>
            <span
              >若仍有作品使用此标签，请先检查并调整作品标签，直接删除会导致作品丢失关联信息。</span
            >
          </div>
          <div class="tags-dialog-actions">
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
        class="tags-toast"
        :class="{ error: toast.error }"
        role="status"
      >
        {{ toast.message }}
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.tags-table {
  width: 100%;
  min-width: 620px;
}
.tags-table th:last-child, .tags-table td:last-child {
  width: 110px;
}
.tags-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  color: var(--violet);
  background: var(--violet-soft);
  border: 1px solid color-mix(in srgb, var(--violet) 16%, transparent);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 650;
}
.tags-name::before {
  width: 6px;
  height: 6px;
  content: '';
  background: var(--violet);
  border-radius: 50%;
}
.tags-drawer-layer,
.tags-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 125;
  background: rgba(18, 17, 30, 0.43);
  backdrop-filter: blur(3px);
}
.tags-drawer-layer {
  display: flex;
  justify-content: flex-end;
  animation: tags-drawer-fade 0.16s ease both;
}
.tags-drawer {
  display: flex;
  width: min(560px, 94vw);
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: var(--canvas);
  box-shadow: -24px 0 60px rgba(20, 17, 40, 0.2);
  animation: tags-drawer-slide 0.2s ease both;
}
@keyframes tags-drawer-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes tags-drawer-slide {
  from {
    opacity: 0.7;
    transform: translateX(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.tags-drawer-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 21px 23px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.tags-drawer-header h2 {
  margin: 0;
  font: 700 19px var(--font-display);
}
.tags-drawer-header p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.tags-drawer-header button {
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
.tags-drawer-header button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.tags-drawer-header button svg {
  width: 15px;
  height: 15px;
}
.tags-drawer-body {
  min-height: 0;
  flex: 1;
  padding: 19px 23px;
  overflow-y: auto;
}
.tags-drawer-state {
  padding: 30px;
  color: var(--ink-soft);
  text-align: center;
  font-size: 11px;
}
.tags-drawer-state.error {
  color: var(--danger);
}
.tags-field label {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 700;
}
.tags-field label span {
  color: var(--accent-strong);
}
.tags-field input {
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
.tags-field input:hover {
  border-color: color-mix(in srgb, var(--violet) 42%, transparent);
}
.tags-field input:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: var(--focus);
}
.tags-field.invalid input {
  border-color: var(--danger);
}
.tags-field input::placeholder {
  color: var(--ink-faint);
}
.tags-hint {
  margin: 5px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.tags-error {
  margin: 6px 0;
  color: var(--danger);
  font-size: 11px;
}
.tags-save-error {
  padding: 10px 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 9px;
  font-size: 11px;
}
.tags-drawer-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  padding: 13px 23px;
  background: var(--surface);
  border-top: 1px solid var(--line);
}
.tags-drawer-footer > span {
  color: var(--ink-faint);
  font-size: 10px;
}
.tags-drawer-footer > div {
  display: flex;
  gap: 8px;
}
.tags-drawer-footer button {
  min-height: 36px;
  font-size: 11px;
}
.tags-drawer-footer button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.tags-dialog-layer {
  z-index: 145;
  display: grid;
  place-items: center;
  padding: 20px;
}
.tags-dialog {
  width: min(460px, 100%);
  padding: 22px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow);
}
.tags-dialog-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  margin-bottom: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 11px;
}
.tags-dialog-mark svg {
  width: 17px;
  height: 17px;
}
.tags-dialog h2 {
  margin: 0;
  font: 700 17px var(--font-display);
}
.tags-dialog > p {
  margin: 7px 0 0;
  color: var(--ink-soft);
  font-size: 11px;
}
.tags-delete-preview {
  padding: 11px 12px;
  margin-top: 14px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.tags-delete-preview strong {
  display: block;
  color: var(--ink);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.tags-delete-preview small {
  display: block;
  margin-top: 5px;
  color: var(--ink-faint);
  font-size: 10px;
}
.tags-delete-check {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 11px;
  color: var(--ink-soft);
  font-size: 11px;
}
.tags-delete-check input {
  margin-top: 2px;
  accent-color: var(--danger);
}
.tags-dialog .tags-error {
  color: var(--danger);
}
.tags-dialog .tags-checkbox-error {
  margin: 5px 0 0 20px;
  color: var(--danger);
  font-size: 11px;
}
.tags-delete-note {
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
.tags-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 19px;
}
.tags-toast {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 150;
  max-width: min(380px, calc(100vw - 40px));
  padding: 12px 15px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 12px;
  box-shadow: var(--shadow);
  font-size: 11px;
}
.tags-toast.error {
  color: var(--danger);
}
@media (max-width: 620px) {
  .tags-drawer {
    width: 100vw;
  }
  .tags-drawer-header,
  .tags-drawer-body,
  .tags-drawer-footer {
    padding-right: 15px;
    padding-left: 15px;
  }
  .tags-drawer-footer {
    align-items: stretch;
    flex-direction: column;
  }
  .tags-drawer-footer > div {
    justify-content: flex-end;
  }
}
</style>
