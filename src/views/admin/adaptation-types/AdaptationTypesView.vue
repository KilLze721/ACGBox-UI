<script setup lang="ts">
/**
 * 改编类型字典管理页面：展示并筛选作品来源类型，维护新增和修改表单。
 * 支持勾选后删除和危险操作确认，不包含详情页面或详情抽屉。
 */
import '@/assets/adminManagementCards.css'
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  createAdaptationType,
  deleteAdaptationTypes,
  getAdaptationTypeById,
  getAdaptationTypes,
  updateAdaptationType,
} from '@/api/catalog'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import { notifyCatalogChanged, useCatalogRefresh } from '@/utils/catalogChanges'
import { parseSortOrder } from '@/utils/sortOrder'
import type { NamedOption, SortableNamedOption } from '@/types/api'

type DrawerMode = 'create' | 'edit'

const route = useRoute()
const initialName = typeof route.query.name === 'string' ? route.query.name.trim() : ''
const types = ref<SortableNamedOption[]>([])
const searchName = ref(initialName)
const appliedName = ref(initialName)
const selectedIds = ref<number[]>([])
const loading = ref(false)
const listError = ref('')
const drawerMode = ref<DrawerMode | null>(null)
const currentType = ref<SortableNamedOption | null>(null)
const drawerLoading = ref(false)
const drawerError = ref('')
const formName = ref('')
const initialFormName = ref('')
const formSortOrder = ref('0')
const initialFormSortOrder = ref('0')
const sortOrderError = ref('')
const nameError = ref('')
const saving = ref(false)
const deleteTargets = ref<NamedOption[]>([])
const deleteConfirmed = ref(false)
const deleteError = ref('')
const deleting = ref(false)
const tabActive = ref(true)
const toast = ref<{ message: string; error: boolean } | null>(null)

let listController: AbortController | undefined
let drawerController: AbortController | undefined
let toastTimer: number | undefined
let previousBodyOverflow: string | undefined
let previousHtmlOverflow: string | undefined

const filteredTypes = computed(() => {
  const keyword = appliedName.value.toLocaleLowerCase()
  return keyword
    ? types.value.filter((item) => item.name.toLocaleLowerCase().includes(keyword))
    : types.value
})
const allVisibleSelected = computed(
  () =>
    filteredTypes.value.length > 0 &&
    filteredTypes.value.every((item) => selectedIds.value.includes(item.id))
)
const selectedTargets = computed(() =>
  types.value.filter((item) => selectedIds.value.includes(item.id))
)
const isDirty = computed(
  () =>
    drawerMode.value !== null &&
    (formName.value !== initialFormName.value || formSortOrder.value !== initialFormSortOrder.value)
)

defineExpose({
  getCloseState: () => ({ dirty: isDirty.value, submitting: saving.value || deleting.value }),
})

const refreshTypes = useCatalogRefresh(['adaptation'], loadTypes)
onMounted(() => void refreshTypes())
onActivated(() => {
  tabActive.value = true
  if (drawerMode.value || deleteTargets.value.length) lockScroll()
})
onDeactivated(() => {
  tabActive.value = false
  unlockScroll()
})
onBeforeUnmount(() => {
  listController?.abort()
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
  toastTimer = window.setTimeout(() => (toast.value = null), 5000)
}
async function loadTypes() {
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  loading.value = true
  listError.value = ''
  try {
    const result = await getAdaptationTypes(controller.signal)
    if (controller.signal.aborted) return
    types.value = result
    selectedIds.value = []
  } catch (error) {
    if (!controller.signal.aborted)
      listError.value = messageOf(error, '改编类型读取失败，请稍后重试。')
  } finally {
    if (listController === controller) loading.value = false
  }
}
function runSearch() {
  appliedName.value = searchName.value.trim()
  searchName.value = appliedName.value
  selectedIds.value = []
}
function resetSearch() {
  searchName.value = ''
  appliedName.value = ''
  selectedIds.value = []
}
function toggleRow(id: number, checked: boolean) {
  selectedIds.value = checked
    ? [...selectedIds.value, id]
    : selectedIds.value.filter((value) => value !== id)
}
function toggleAll(checked: boolean) {
  const visibleIds = filteredTypes.value.map((item) => item.id)
  selectedIds.value = checked
    ? [...new Set([...selectedIds.value, ...visibleIds])]
    : selectedIds.value.filter((id) => !visibleIds.includes(id))
}

function closeDrawer() {
  if (saving.value) return
  drawerController?.abort()
  drawerMode.value = null
  currentType.value = null
  drawerError.value = ''
}
async function openDrawer(mode: DrawerMode, row?: SortableNamedOption) {
  drawerController?.abort()
  const controller = new AbortController()
  drawerController = controller
  drawerMode.value = mode
  currentType.value = row ?? null
  formName.value = row?.name ?? ''
  initialFormName.value = formName.value
  formSortOrder.value = String(row?.sortOrder ?? 0)
  initialFormSortOrder.value = formSortOrder.value
  sortOrderError.value = ''
  nameError.value = ''
  drawerError.value = ''
  drawerLoading.value = mode === 'edit'
  if (mode === 'create' || !row) return
  try {
    const type = await getAdaptationTypeById(row.id, controller.signal)
    if (controller.signal.aborted) return
    currentType.value = type
    formName.value = type.name
    initialFormName.value = type.name
    formSortOrder.value = String(type.sortOrder)
    initialFormSortOrder.value = formSortOrder.value
  } catch (error) {
    if (controller.signal.aborted) return
    currentType.value = null
    drawerError.value = messageOf(error, '改编类型读取失败，请重试。')
  } finally {
    if (!controller.signal.aborted) drawerLoading.value = false
  }
}
async function saveType() {
  const name = formName.value.trim()
  nameError.value = name ? '' : '改编类型名称不能为空。'
  const sortOrder = parseSortOrder(formSortOrder.value)
  sortOrderError.value =
    sortOrder === null ? '排序请输入 -2147483648 至 2147483647 之间的整数。' : ''
  if (nameError.value || sortOrder === null || saving.value || drawerLoading.value) return
  if (drawerMode.value === 'edit' && !currentType.value) return
  saving.value = true
  drawerError.value = ''
  try {
    const created = drawerMode.value === 'create'
    if (created) await createAdaptationType({ name, sortOrder })
    else await updateAdaptationType({ id: currentType.value!.id, name, sortOrder })
    notifyCatalogChanged('adaptation')
    drawerMode.value = null
    currentType.value = null
    if (created) resetSearch()
    showToast(created ? '改编类型已添加。' : '改编类型已修改。')
    await refreshTypes()
  } catch (error) {
    const message = messageOf(error, '保存失败，请稍后重试。')
    if (message.includes('已存在') || message.includes('重复')) nameError.value = message
    else drawerError.value = message
  } finally {
    saving.value = false
  }
}
function openDelete(targets: NamedOption[]) {
  if (!targets.length) return
  deleteTargets.value = targets
  deleteConfirmed.value = false
  deleteError.value = ''
}
function closeDelete() {
  if (!deleting.value) deleteTargets.value = []
}
async function confirmDelete() {
  if (!deleteConfirmed.value) {
    deleteError.value = '请先勾选确认框，再删除改编类型。'
    return
  }
  if (!deleteTargets.value.length || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  const count = deleteTargets.value.length
  try {
    await deleteAdaptationTypes(deleteTargets.value.map((item) => item.id))
    notifyCatalogChanged('adaptation')
    deleteTargets.value = []
    showToast(`已删除 ${count} 个改编类型。`)
    await refreshTypes()
  } catch (error) {
    deleteError.value = messageOf(error, '删除失败，请稍后重试。')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="adaptation-management management-cards">
    <section class="adaptation-hero management-hero">
      <div class="adaptation-hero-copy management-hero-copy">
        <p class="adaptation-eyebrow management-eyebrow">CONTENT ARCHIVE / ADAPTATION INDEX</p>
        <h1>改编类型管理 <span>ADAPTATION TYPES</span></h1>
        <p>统一维护动画的来源类型，例如原创、漫画改编与小说改编。新增和修改均通过侧边抽屉完成。</p>
      </div>
      <button class="primary-button" type="button" @click="openDrawer('create')">
        <AdminIcon name="plus" />新增类型
      </button>
    </section>

    <section class="adaptation-stats management-stats" aria-label="改编类型统计">
      <article class="management-stat">
        <span class="adaptation-stat-icon management-stat-icon"
          ><AdminIcon name="adaptation-types"
        /></span>
        <span class="management-stat-copy"
          ><small class="management-stat-label">类型总数</small
          ><strong class="management-stat-value">{{ types.length }}</strong></span
        >
      </article>
      <article class="management-stat">
        <span class="adaptation-stat-icon management-stat-icon"
          ><AdminIcon name="search-full"
        /></span>
        <span class="management-stat-copy"
          ><small class="management-stat-label">当前页记录</small
          ><strong class="management-stat-value">{{ filteredTypes.length }}</strong></span
        >
      </article>
      <article class="management-stat">
        <span class="adaptation-stat-icon management-stat-icon"><AdminIcon name="check" /></span>
        <span class="management-stat-copy"
          ><small class="management-stat-label">已选类型</small
          ><strong class="management-stat-value">{{ selectedIds.length }}</strong></span
        >
      </article>
    </section>

    <section
      class="adaptation-list-card management-list-card"
      aria-labelledby="adaptationListTitle"
    >
      <header class="adaptation-list-header management-list-header">
        <div>
          <h2 id="adaptationListTitle">改编类型词条</h2>
          <p>全量读取 · 按排序值升序 · 支持名称关键词筛选</p>
        </div>
        <div class="adaptation-header-actions management-list-actions">
          <span class="management-list-meta">显示 {{ filteredTypes.length }} 条</span>
          <button
            class="danger-button"
            type="button"
            :disabled="!selectedIds.length || loading"
            @click="openDelete(selectedTargets)"
          >
            <AdminIcon name="delete" />删除所选 {{ selectedIds.length }}
          </button>
        </div>
      </header>
      <form class="adaptation-filter management-filter" @submit.prevent="runSearch">
        <label class="adaptation-search management-search">
          <AdminIcon name="search-full" />
          <input
            v-model="searchName"
            type="text"
            placeholder="按改编类型名称搜索"
            autocomplete="off"
            aria-label="按改编类型名称搜索"
          />
          <button v-if="searchName" type="button" aria-label="清空搜索" @click="resetSearch">
            <AdminIcon name="close" />
          </button>
        </label>
        <button class="secondary-button" type="submit">查询</button>
        <button class="ghost-button" type="button" @click="resetSearch">重置</button>
      </form>
      <div class="adaptation-table-scroll management-table-scroll">
        <table
          v-if="!loading && !listError && filteredTypes.length"
          class="adaptation-table management-table"
        >
          <thead>
            <tr>
              <th class="adaptation-check-cell management-check-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="选择当前结果全部类型"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th>改编类型名称</th>
              <th class="adaptation-sort-cell">排序</th>
              <th class="management-actions-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredTypes" :key="item.id">
              <td class="adaptation-check-cell management-check-cell">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(item.id)"
                  :aria-label="`选择类型 ${item.name}`"
                  @change="toggleRow(item.id, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td>
                <span class="adaptation-name">{{ item.name }}</span>
              </td>
              <td class="adaptation-sort-cell">{{ item.sortOrder }}</td>
              <td class="management-actions-cell">
                <div class="adaptation-row-actions management-row-actions">
                  <button
                    class="management-row-action management-icon-action"
                    type="button"
                    title="编辑"
                    :aria-label="`编辑改编类型 ${item.name}`"
                    @click="openDrawer('edit', item)"
                  >
                    <AdminIcon name="edit" />
                  </button>
                  <button
                    class="danger management-row-action management-icon-action"
                    type="button"
                    title="删除"
                    :aria-label="`删除改编类型 ${item.name}`"
                    @click="openDelete([item])"
                  >
                    <AdminIcon name="delete" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-else
          class="adaptation-list-state management-list-state"
          :class="{ error: !!listError }"
        >
          <span class="adaptation-state-icon management-state-icon"
            ><AdminIcon :name="listError ? 'refresh' : 'adaptation-types'"
          /></span>
          <strong>{{
            loading
              ? '正在读取改编类型…'
              : listError
              ? '改编类型读取失败'
              : appliedName
              ? '没有匹配的改编类型'
              : '暂无改编类型'
          }}</strong>
          <p>
            {{
              listError ||
              (appliedName
                ? '请尝试其他名称，或清空查询条件。'
                : '创建一条改编类型后，将显示在此处。')
            }}
          </p>
          <button v-if="listError" class="secondary-button" type="button" @click="loadTypes">
            重新加载
          </button>
          <button
            v-else-if="!loading && !appliedName"
            class="primary-button"
            type="button"
            @click="openDrawer('create')"
          >
            新增类型
          </button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="drawerMode && tabActive" class="adaptation-drawer-layer" @click.self="closeDrawer">
        <aside
          class="adaptation-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="drawerMode === 'create' ? '新增改编类型' : '编辑改编类型'"
        >
          <header class="adaptation-drawer-header">
            <div>
              <h2>{{ drawerMode === 'create' ? '新增改编类型' : '编辑改编类型' }}</h2>
              <p>
                {{
                  drawerMode === 'create'
                    ? '在动画资料库中创建一个来源类型'
                    : `正在修改 ${currentType?.name || '改编类型'}`
                }}
              </p>
            </div>
            <button type="button" aria-label="关闭抽屉" @click="closeDrawer">
              <AdminIcon name="close" />
            </button>
          </header>
          <div class="adaptation-drawer-body">
            <div v-if="drawerLoading" class="adaptation-drawer-state">正在读取改编类型…</div>
            <div
              v-else-if="drawerError && !currentType && drawerMode === 'edit'"
              class="adaptation-drawer-state error"
              role="alert"
            >
              {{ drawerError }}
            </div>
            <form v-else id="adaptationEditorForm" @submit.prevent="saveType">
              <div class="adaptation-field" :class="{ invalid: !!nameError }">
                <label for="adaptationEditorName">改编类型名称 <span>*</span></label>
                <input
                  id="adaptationEditorName"
                  v-model="formName"
                  placeholder="例如：漫画改、小说改、原创"
                  autocomplete="off"
                  :disabled="saving"
                  @input="nameError = ''"
                />
                <p v-if="nameError" class="adaptation-error" role="alert">{{ nameError }}</p>
                <p class="adaptation-hint">名称需唯一，排序决定列表和动画表单中的显示顺序。</p>
              </div>
              <div class="adaptation-field" :class="{ invalid: !!sortOrderError }">
                <label for="adaptationEditorSortOrder">排序 <span>*</span></label>
                <input
                  id="adaptationEditorSortOrder"
                  v-model="formSortOrder"
                  type="text"
                  inputmode="text"
                  :disabled="saving"
                  :aria-invalid="!!sortOrderError"
                  :aria-describedby="sortOrderError ? 'adaptationSortOrderError' : undefined"
                  @input="sortOrderError = ''"
                />
                <p
                  v-if="sortOrderError"
                  id="adaptationSortOrderError"
                  class="adaptation-error"
                  role="alert"
                >
                  {{ sortOrderError }}
                </p>
                <p class="adaptation-hint">数值越小越靠前，支持负整数；相同数值保持稳定顺序。</p>
              </div>
              <p v-if="drawerError" class="adaptation-save-error" role="alert">{{ drawerError }}</p>
            </form>
          </div>
          <footer class="adaptation-drawer-footer">
            <span>改编类型名称必填</span>
            <div>
              <button class="secondary-button" type="button" @click="closeDrawer">取消</button>
              <button
                class="primary-button"
                type="submit"
                form="adaptationEditorForm"
                :disabled="saving || drawerLoading || (drawerMode === 'edit' && !currentType)"
              >
                {{ saving ? '保存中…' : '保存类型' }}
              </button>
            </div>
          </footer>
        </aside>
      </div>
      <div
        v-if="deleteTargets.length && tabActive"
        class="adaptation-dialog-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adaptationDeleteTitle"
        @click.self="closeDelete"
      >
        <div class="adaptation-dialog">
          <span class="adaptation-dialog-mark"><AdminIcon name="delete" /></span>
          <h2 id="adaptationDeleteTitle">确认删除改编类型？</h2>
          <p>删除后无法通过页面撤销。请核对以下改编类型。</p>
          <div class="adaptation-delete-preview">
            <strong>{{ deleteTargets.map((item) => item.name).join('、') }}</strong>
            <small>共 {{ deleteTargets.length }} 项</small>
          </div>
          <label class="adaptation-delete-check">
            <input v-model="deleteConfirmed" type="checkbox" @change="deleteError = ''" />
            我已核对要删除的改编类型及其关联作品。
          </label>
          <p v-if="deleteError" class="adaptation-delete-error" role="alert">{{ deleteError }}</p>
          <div class="adaptation-delete-note" role="note">
            <span aria-hidden="true">!</span>
            <span
              >若作品仍在使用这些类型，请先检查并调整作品资料；删除请求及关联关系按后端规则处理。</span
            >
          </div>
          <div class="adaptation-dialog-actions">
            <button
              class="secondary-button"
              type="button"
              :disabled="deleting"
              @click="closeDelete"
            >
              取消
            </button>
            <button class="danger-button" type="button" :disabled="deleting" @click="confirmDelete">
              {{ deleting ? '删除中…' : '确认删除' }}
            </button>
          </div>
        </div>
      </div>
      <div
        v-if="toast && tabActive"
        class="adaptation-toast"
        :class="{ error: toast.error }"
        role="status"
      >
        {{ toast.message }}
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.adaptation-management .primary-button,
.adaptation-management .secondary-button,
.adaptation-management .ghost-button,
.adaptation-management .danger-button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
}
.adaptation-management .primary-button svg,
.adaptation-management .danger-button svg {
  width: 15px;
  height: 15px;
}
.adaptation-management .primary-button {
  color: #fff;
  background: linear-gradient(135deg, #df7395, #bb5d88);
  box-shadow: 0 7px 15px rgba(197, 75, 117, 0.18);
}
.adaptation-management .secondary-button,
.adaptation-management .ghost-button {
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
}
.adaptation-management .danger-button {
  color: #fff;
  background: var(--danger);
}
.adaptation-management .danger-button:disabled {
  color: var(--ink-faint);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  box-shadow: none;
  cursor: not-allowed;
}
.adaptation-table {
  width: 100%;
}
.adaptation-sort-cell {
  width: 110px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.adaptation-field + .adaptation-field {
  margin-top: 20px;
}
.adaptation-table th:last-child,
.adaptation-table td:last-child {
  width: 110px;
}
.adaptation-name {
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
.adaptation-name::before {
  width: 6px;
  height: 6px;
  content: '';
  background: var(--violet);
  border-radius: 50%;
}
.adaptation-drawer-layer,
.adaptation-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 125;
  background: rgba(18, 17, 30, 0.43);
  backdrop-filter: blur(3px);
}
.adaptation-drawer-layer {
  display: flex;
  justify-content: flex-end;
  animation: adaptation-drawer-fade 0.16s ease both;
}
.adaptation-drawer {
  display: flex;
  width: min(560px, 94vw);
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: var(--canvas);
  box-shadow: -24px 0 60px rgba(20, 17, 40, 0.2);
  animation: adaptation-drawer-slide 0.2s ease both;
}
@keyframes adaptation-drawer-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes adaptation-drawer-slide {
  from {
    opacity: 0.7;
    transform: translateX(18px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.adaptation-drawer-header,
.adaptation-drawer-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 23px;
  background: var(--surface);
}
.adaptation-drawer-header {
  align-items: flex-start;
  padding-top: 21px;
  border-bottom: 1px solid var(--line);
}
.adaptation-drawer-header h2 {
  margin: 0;
  font: 700 19px var(--font-display);
}
.adaptation-drawer-header p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.adaptation-drawer-header button {
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
.adaptation-drawer-header button svg {
  width: 15px;
  height: 15px;
}
.adaptation-drawer-header button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.adaptation-drawer-body {
  min-height: 0;
  flex: 1;
  padding: 19px 23px;
  overflow-y: auto;
}
.adaptation-drawer-state {
  padding: 30px;
  color: var(--ink-soft);
  text-align: center;
  font-size: 11px;
}
.adaptation-drawer-state.error {
  color: var(--danger);
}
.adaptation-field label {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 6px;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 700;
}
.adaptation-field label span {
  color: var(--accent-strong);
}
.adaptation-field input {
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
.adaptation-field input:hover {
  border-color: color-mix(in srgb, var(--violet) 42%, transparent);
}
.adaptation-field input:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: var(--focus);
}
.adaptation-field.invalid input {
  border-color: var(--danger);
}
.adaptation-hint {
  margin: 5px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.adaptation-error {
  margin: 6px 0;
  color: var(--danger);
  font-size: 11px;
}
.adaptation-save-error {
  padding: 10px 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 9px;
  font-size: 11px;
}
.adaptation-drawer-footer {
  padding-top: 13px;
  padding-bottom: 13px;
  border-top: 1px solid var(--line);
}
.adaptation-drawer-footer > span {
  color: var(--ink-faint);
  font-size: 10px;
}
.adaptation-drawer-footer > div {
  display: flex;
  gap: 8px;
}
.adaptation-drawer-footer button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.adaptation-dialog-layer {
  z-index: 145;
  display: grid;
  place-items: center;
  padding: 20px;
}
.adaptation-dialog {
  width: min(460px, 100%);
  max-height: calc(100dvh - 40px);
  padding: 22px;
  overflow-y: auto;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow);
  font-family: var(--font-body);
}
.adaptation-dialog-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  margin-bottom: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 11px;
}
.adaptation-dialog-mark svg {
  width: 17px;
  height: 17px;
}
.adaptation-dialog h2 {
  margin: 0;
  color: var(--ink);
  font: 700 17px var(--font-display);
}
.adaptation-dialog > p {
  margin: 7px 0 0;
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.6;
}
.adaptation-delete-preview {
  padding: 11px 12px;
  margin-top: 14px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.adaptation-delete-preview strong {
  display: block;
  color: var(--ink);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.adaptation-delete-preview small {
  display: block;
  margin-top: 5px;
  color: var(--ink-faint);
  font-size: 10px;
}
.adaptation-delete-check {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 11px;
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.5;
}
.adaptation-delete-check input {
  margin-top: 2px;
  accent-color: var(--danger);
}
.adaptation-dialog > .adaptation-delete-error {
  margin: 5px 0 0 20px;
  color: var(--danger);
  font-size: 11px;
}
.adaptation-delete-note {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 9px 10px;
  margin-top: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 9px;
  font-size: 11px;
  line-height: 1.5;
}
.adaptation-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 19px;
}
.adaptation-dialog-actions button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border-radius: 10px;
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 700;
}
.adaptation-dialog-actions .secondary-button {
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
}
.adaptation-dialog-actions .danger-button {
  color: #fff;
  background: var(--danger);
}
.adaptation-dialog-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.adaptation-toast {
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
.adaptation-toast.error {
  color: var(--danger);
}
@media (max-width: 620px) {
  .adaptation-drawer {
    width: 100vw;
  }
  .adaptation-drawer-header,
  .adaptation-drawer-body,
  .adaptation-drawer-footer {
    padding-right: 15px;
    padding-left: 15px;
  }
}
</style>
