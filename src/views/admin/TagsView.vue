<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { createTag, deleteTags, getTagById, getTagPage, updateTag } from '@/api/tags'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import type { NamedOption, PageResult } from '@/types/api'

type DrawerMode = 'create' | 'edit'

const pageSizeOptions: NamedOption[] = [5, 10, 20].map((value) => ({
  id: value,
  name: `${value} 条`,
}))
const route = useRoute()
const initialName = typeof route.query.name === 'string' ? route.query.name.trim() : ''
const page = ref<PageResult<NamedOption>>({
  pageNum: 1,
  pageSize: 10,
  total: 0,
  pages: 0,
  rows: [],
})
const totalTags = ref<number | null>(null)
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
  () => drawerMode.value !== null && formName.value !== initialNameValue.value,
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
  <section class="tags-management">
    <section class="tags-hero">
      <div class="tags-hero-copy">
        <p class="tags-eyebrow">CONTENT ARCHIVE / TAG INDEX</p>
        <h1>标签管理 <span>TAG ARCHIVE</span></h1>
        <p>
          统一维护资料标签名称，为动画资料的检索与分类提供稳定词条。新增和修改均在当前页面抽屉中完成。
        </p>
      </div>
      <button class="primary-button" type="button" @click="openDrawer('create')">
        <AdminIcon name="plus" />新增标签
      </button>
    </section>

    <section class="tags-stats" aria-label="标签统计">
      <article>
        <span class="tags-stat-icon"><AdminIcon name="tags" /></span
        ><span
          ><small>标签总数</small><strong>{{ totalTags ?? '—' }}</strong></span
        >
      </article>
      <article>
        <span class="tags-stat-icon"><AdminIcon name="archive" /></span
        ><span
          ><small>当前页记录</small><strong>{{ page.rows.length }}</strong></span
        >
      </article>
      <article>
        <span class="tags-stat-icon"><AdminIcon name="check" /></span
        ><span
          ><small>已选标签</small><strong>{{ selectedIds.length }}</strong></span
        >
      </article>
    </section>

    <section class="tags-list-card" aria-labelledby="tagsListTitle">
      <header class="tags-list-header">
        <div>
          <h2 id="tagsListTitle">标签词条列表</h2>
          <p>维护清晰、唯一的标签名称，便于作品检索与分类</p>
        </div>
        <div class="tags-header-actions">
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
      <form class="tags-filter" @submit.prevent="runSearch">
        <label class="tags-search"
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
      <div class="tags-table-scroll">
        <table v-if="!listLoading && !listError && page.rows.length" class="tags-table">
          <thead>
            <tr>
              <th class="tags-check-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="选择当前页全部标签"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th>标签名称</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in page.rows" :key="row.id">
              <td class="tags-check-cell">
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
              <td>
                <div class="tags-row-actions">
                  <button
                    type="button"
                    title="编辑"
                    :aria-label="`编辑标签 ${row.name}`"
                    @click="openDrawer('edit', row)"
                  >
                    <AdminIcon name="edit" /></button
                  ><button
                    class="danger"
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
        <div v-else class="tags-list-state" :class="{ error: !!listError }">
          <span class="tags-state-icon"><AdminIcon :name="listError ? 'refresh' : 'tags'" /></span>
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
      <footer class="tags-pagination">
        <span>第 {{ firstResult }}–{{ lastResult }} 条，共 {{ page.total }} 条</span>
        <div class="tags-page-controls">
          <label class="page-size-wrap"
            ><span>每页</span
            ><ArchiveSelect
              id="tagsPageSize"
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
          <p>删除后无法通过页面撤销。请先确认这些标签不再被作品使用。</p>
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
          <p v-if="deleteError" class="tags-error" role="alert">{{ deleteError }}</p>
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
.tags-management {
  max-width: 1440px;
  margin: 0 auto;
  padding-bottom: 14px;
}
.tags-hero {
  position: relative;
  display: flex;
  min-height: 150px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 30px;
  overflow: hidden;
  background: linear-gradient(112deg, var(--surface-solid), var(--surface-muted));
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-soft);
}
.tags-hero::before {
  position: absolute;
  top: -54px;
  right: 13%;
  width: 208px;
  height: 208px;
  content: '';
  border: 1px solid color-mix(in srgb, var(--violet) 20%, transparent);
  border-radius: 43% 57% 63% 37%;
  transform: rotate(28deg);
}
.tags-hero-copy,
.tags-hero > button {
  position: relative;
  z-index: 1;
}
.tags-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 9px;
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.16em;
}
.tags-eyebrow::before {
  width: 17px;
  height: 1px;
  content: '';
  background: currentColor;
}
.tags-hero h1 {
  margin: 0;
  font: 700 clamp(23px, 3vw, 30px)/1.25 var(--font-display);
  letter-spacing: -0.035em;
}
.tags-hero h1 span {
  color: var(--ink-faint);
  font: 500 12px var(--font-body);
  letter-spacing: 0;
}
.tags-hero-copy > p:last-child {
  max-width: 610px;
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
}
.tags-hero > button {
  flex: 0 0 auto;
}
.tags-hero > button svg,
.tags-header-actions button svg {
  width: 14px;
  height: 14px;
}
.tags-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
  margin-top: 16px;
}
.tags-stats article {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
}
.tags-stat-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 10px;
}
.tags-stat-icon svg {
  width: 18px;
  height: 18px;
}
.tags-stats article:nth-child(2) .tags-stat-icon {
  color: var(--cyan);
  background: var(--cyan-soft);
}
.tags-stats article:nth-child(3) .tags-stat-icon {
  color: var(--accent);
  background: var(--accent-soft);
}
.tags-stats small,
.tags-stats strong {
  display: block;
}
.tags-stats small {
  color: var(--ink-faint);
  font-size: 10px;
}
.tags-stats strong {
  margin-top: 2px;
  color: var(--ink);
  font: 700 22px var(--font-display);
}
.tags-list-card {
  margin-top: 16px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
}
.tags-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}
.tags-list-header h2 {
  margin: 0;
  font: 700 16px var(--font-display);
}
.tags-list-header p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.tags-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tags-header-actions > span {
  color: var(--ink-faint);
  font-size: 10px;
  white-space: nowrap;
}
.tags-header-actions button {
  min-height: 34px;
  font-size: 11px;
}
.tags-header-actions .danger-button:disabled {
  color: var(--ink-faint);
  background: var(--surface-muted);
  border-color: var(--line);
  box-shadow: none;
  cursor: not-allowed;
}
.tags-header-actions .danger-button:disabled:hover {
  filter: none;
  transform: none;
}
.tags-filter {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 14px 17px;
  border-bottom: 1px solid var(--line);
}
.tags-search {
  display: flex;
  width: min(440px, 100%);
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 9px;
}
.tags-search:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.tags-search > svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--ink-faint);
}
.tags-search input {
  width: 100%;
  height: 36px;
  min-width: 0;
  color: var(--ink);
  background: transparent;
  border: 0;
  outline: none;
  box-shadow: none;
  font-size: 11px;
}
.tags-search input:focus {
  box-shadow: none;
}
.tags-search button {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border-radius: 6px;
}
.tags-search button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.tags-search button svg {
  width: 12px;
  height: 12px;
}
.tags-filter > button {
  min-height: 36px;
  font-size: 11px;
}
.tags-table-scroll {
  overflow-x: auto;
}
.tags-table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  text-align: left;
}
.tags-table th {
  padding: 10px 13px;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}
.tags-table td {
  padding: 12px 13px;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  vertical-align: middle;
}
.tags-table tbody tr:last-child td {
  border-bottom: 0;
}
.tags-table tbody tr:hover {
  background: var(--surface-hover);
}
.tags-check-cell {
  width: 45px;
  padding-left: 17px !important;
}
.tags-check-cell input {
  accent-color: var(--accent);
}
.tags-table th:last-child,
.tags-table td:last-child {
  width: 110px;
  text-align: right;
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
.tags-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.tags-row-actions button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border-radius: 7px;
}
.tags-row-actions button svg {
  width: 14px;
  height: 14px;
}
.tags-row-actions button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.tags-row-actions button.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.tags-list-state {
  padding: 45px 20px;
  color: var(--ink-faint);
  text-align: center;
}
.tags-state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin: 0 auto 12px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 16px;
}
.tags-state-icon svg {
  width: 23px;
  height: 23px;
}
.tags-list-state.error .tags-state-icon {
  color: var(--danger);
  background: var(--danger-soft);
}
.tags-list-state strong {
  display: block;
  color: var(--ink);
  font: 700 15px var(--font-display);
}
.tags-list-state p {
  max-width: 470px;
  margin: 5px auto 13px;
  font-size: 11px;
}
.tags-pagination {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--line);
}
.tags-pagination > span,
.tags-page-controls {
  color: var(--ink-faint);
  font-size: 10px;
}
.tags-page-controls {
  display: flex;
  align-items: center;
  gap: 7px;
}
.tags-page-controls > button {
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
.tags-page-controls > button svg {
  width: 12px;
  height: 12px;
}
.tags-page-controls > button:hover:not(:disabled),
.tags-page-controls > button.active {
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 34%, transparent);
}
.tags-page-controls > button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tags-page-controls > input {
  width: 43px;
  height: 32px;
  padding: 0 5px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 8px;
  text-align: center;
  font-size: 10px;
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
@media (max-width: 760px) {
  .tags-hero {
    padding: 21px 19px;
  }
  .tags-list-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .tags-header-actions {
    width: 100%;
    justify-content: space-between;
  }
  .tags-pagination {
    align-items: flex-start;
    flex-direction: column;
  }
}
@media (max-width: 620px) {
  .tags-hero {
    display: block;
    min-height: 0;
  }
  .tags-hero > button {
    margin-top: 15px;
  }
  .tags-stats {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .tags-filter {
    align-items: stretch;
    flex-direction: column;
  }
  .tags-search {
    width: 100%;
  }
  .tags-page-controls {
    flex-wrap: wrap;
  }
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
