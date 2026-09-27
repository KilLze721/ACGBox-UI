<script setup lang="ts">
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
import type { NamedOption } from '@/types/api'

type DrawerMode = 'create' | 'edit'

const route = useRoute()
const initialName = typeof route.query.name === 'string' ? route.query.name.trim() : ''
const types = ref<NamedOption[]>([])
const searchName = ref(initialName)
const appliedName = ref(initialName)
const selectedIds = ref<number[]>([])
const loading = ref(false)
const listError = ref('')
const drawerMode = ref<DrawerMode | null>(null)
const currentType = ref<NamedOption | null>(null)
const drawerLoading = ref(false)
const drawerError = ref('')
const formName = ref('')
const initialFormName = ref('')
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
    filteredTypes.value.every((item) => selectedIds.value.includes(item.id)),
)
const selectedTargets = computed(() =>
  types.value.filter((item) => selectedIds.value.includes(item.id)),
)
const isDirty = computed(
  () => drawerMode.value !== null && formName.value !== initialFormName.value,
)

defineExpose({
  getCloseState: () => ({ dirty: isDirty.value, submitting: saving.value || deleting.value }),
})

onMounted(() => void loadTypes())
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
async function openDrawer(mode: DrawerMode, row?: NamedOption) {
  drawerController?.abort()
  const controller = new AbortController()
  drawerController = controller
  drawerMode.value = mode
  currentType.value = row ?? null
  formName.value = row?.name ?? ''
  initialFormName.value = formName.value
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
  if (nameError.value || saving.value || drawerLoading.value) return
  if (drawerMode.value === 'edit' && !currentType.value) return
  saving.value = true
  drawerError.value = ''
  try {
    const created = drawerMode.value === 'create'
    if (created) await createAdaptationType({ name })
    else await updateAdaptationType({ id: currentType.value!.id, name })
    drawerMode.value = null
    currentType.value = null
    if (created) resetSearch()
    showToast(created ? '改编类型已添加。' : '改编类型已修改。')
    await loadTypes()
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
    deleteTargets.value = []
    showToast(`已删除 ${count} 个改编类型。`)
    await loadTypes()
  } catch (error) {
    deleteError.value = messageOf(error, '删除失败，请稍后重试。')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="adaptation-management">
    <section class="adaptation-hero">
      <div class="adaptation-hero-copy">
        <p class="adaptation-eyebrow">CONTENT ARCHIVE / ADAPTATION INDEX</p>
        <h1>改编类型管理 <span>ADAPTATION TYPES</span></h1>
        <p>统一维护动画的来源类型，例如原创、漫画改编与小说改编。新增和修改均通过侧边抽屉完成。</p>
      </div>
      <button class="primary-button" type="button" @click="openDrawer('create')">
        <AdminIcon name="plus" />新增类型
      </button>
    </section>

    <section class="adaptation-stats" aria-label="改编类型统计">
      <article>
        <span class="adaptation-stat-icon"><AdminIcon name="adaptation-types" /></span>
        <span
          ><small>类型总数</small><strong>{{ types.length }}</strong></span
        >
      </article>
      <article>
        <span class="adaptation-stat-icon"><AdminIcon name="search-full" /></span>
        <span
          ><small>当前匹配</small><strong>{{ filteredTypes.length }}</strong></span
        >
      </article>
      <article>
        <span class="adaptation-stat-icon"><AdminIcon name="check" /></span>
        <span
          ><small>已选类型</small><strong>{{ selectedIds.length }}</strong></span
        >
      </article>
    </section>

    <section class="adaptation-list-card" aria-labelledby="adaptationListTitle">
      <header class="adaptation-list-header">
        <div>
          <h2 id="adaptationListTitle">改编类型词条</h2>
          <p>全量读取 · 按名称升序 · 支持名称关键词筛选</p>
        </div>
        <div class="adaptation-header-actions">
          <span>显示 {{ filteredTypes.length }} 条</span>
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
      <form class="adaptation-filter" @submit.prevent="runSearch">
        <label class="adaptation-search">
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
      <div class="adaptation-table-scroll">
        <table v-if="!loading && !listError && filteredTypes.length" class="adaptation-table">
          <thead>
            <tr>
              <th class="adaptation-check-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="选择当前结果全部类型"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th>改编类型名称</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in filteredTypes" :key="item.id">
              <td class="adaptation-check-cell">
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
              <td>
                <div class="adaptation-row-actions">
                  <button
                    type="button"
                    title="编辑"
                    :aria-label="`编辑改编类型 ${item.name}`"
                    @click="openDrawer('edit', item)"
                  >
                    <AdminIcon name="edit" />
                  </button>
                  <button
                    class="danger"
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
        <div v-else class="adaptation-list-state" :class="{ error: !!listError }">
          <span class="adaptation-state-icon"
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
                  @input="nameError = ''"
                />
                <p v-if="nameError" class="adaptation-error" role="alert">{{ nameError }}</p>
                <p class="adaptation-hint">名称需唯一；当前仅维护改编类型名称。</p>
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
.adaptation-management {
  max-width: 1440px;
  margin: 0 auto;
  padding-bottom: 14px;
}
.adaptation-hero {
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
.adaptation-hero::before {
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
.adaptation-hero-copy,
.adaptation-hero > button {
  position: relative;
  z-index: 1;
}
.adaptation-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 9px;
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.16em;
}
.adaptation-eyebrow::before {
  width: 17px;
  height: 1px;
  content: '';
  background: currentColor;
}
.adaptation-hero h1 {
  margin: 0;
  font: 700 clamp(23px, 3vw, 30px) / 1.25 var(--font-display);
  letter-spacing: -0.035em;
}
.adaptation-hero h1 span {
  color: var(--ink-faint);
  font: 500 12px var(--font-body);
  letter-spacing: 0;
}
.adaptation-hero-copy > p:last-child {
  max-width: 610px;
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
}
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
.adaptation-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
  margin-top: 16px;
}
.adaptation-stats article {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
}
.adaptation-stat-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 10px;
}
.adaptation-stat-icon svg {
  width: 17px;
  height: 17px;
}
.adaptation-stats article:nth-child(2) .adaptation-stat-icon {
  color: var(--cyan);
  background: var(--cyan-soft);
}
.adaptation-stats article:nth-child(3) .adaptation-stat-icon {
  color: var(--accent);
  background: var(--accent-soft);
}
.adaptation-stats small,
.adaptation-stats strong {
  display: block;
}
.adaptation-stats small {
  color: var(--ink-faint);
  font-size: 10px;
}
.adaptation-stats strong {
  margin-top: 2px;
  font: 700 18px var(--font-display);
}
.adaptation-list-card {
  margin-top: 16px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
}
.adaptation-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}
.adaptation-list-header h2 {
  margin: 0;
  font: 700 14px var(--font-display);
}
.adaptation-list-header p,
.adaptation-header-actions > span {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.adaptation-header-actions,
.adaptation-filter {
  display: flex;
  align-items: center;
  gap: 9px;
}
.adaptation-filter {
  padding: 14px 17px;
  border-bottom: 1px solid var(--line);
}
.adaptation-search {
  display: flex;
  width: min(440px, 100%);
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 9px;
}
.adaptation-search:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.adaptation-search > svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--ink-faint);
}
.adaptation-search input {
  width: 100%;
  min-width: 0;
  height: 36px;
  color: var(--ink);
  background: transparent;
  border: 0;
  outline: 0;
  font-size: 11px;
}
.adaptation-search button {
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
}
.adaptation-search button svg {
  width: 12px;
  height: 12px;
}
.adaptation-table-scroll {
  overflow-x: auto;
}
.adaptation-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.adaptation-table th,
.adaptation-table td {
  padding: 11px 14px;
  border-bottom: 1px solid var(--line);
}
.adaptation-table th {
  color: var(--ink-faint);
  background: var(--surface-muted);
  font-size: 10px;
  font-weight: 700;
}
.adaptation-table td {
  color: var(--ink-soft);
  font-size: 11px;
}
.adaptation-table tr:last-child td {
  border-bottom: 0;
}
.adaptation-table tbody tr:hover {
  background: var(--surface-hover);
}
.adaptation-check-cell {
  width: 42px;
  padding-left: 18px !important;
}
.adaptation-check-cell input {
  accent-color: var(--accent);
}
.adaptation-table th:last-child,
.adaptation-table td:last-child {
  width: 110px;
  text-align: right;
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
.adaptation-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}
.adaptation-row-actions button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border-radius: 7px;
}
.adaptation-row-actions button svg {
  width: 14px;
  height: 14px;
}
.adaptation-row-actions button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.adaptation-row-actions button.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.adaptation-list-state {
  display: grid;
  min-height: 220px;
  justify-items: center;
  align-content: center;
  padding: 36px 20px;
  color: var(--ink-faint);
  text-align: center;
}
.adaptation-state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin-bottom: 12px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 16px;
}
.adaptation-state-icon svg {
  width: 24px;
  height: 24px;
}
.adaptation-list-state.error .adaptation-state-icon {
  color: var(--danger);
  background: var(--danger-soft);
}
.adaptation-list-state strong {
  color: var(--ink);
  font: 700 15px var(--font-display);
}
.adaptation-list-state p {
  max-width: 480px;
  margin: 5px 0 13px;
  font-size: 11px;
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
@media (max-width: 760px) {
  .adaptation-hero {
    padding: 21px 19px;
  }
  .adaptation-list-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .adaptation-header-actions {
    width: 100%;
    justify-content: space-between;
  }
}
@media (max-width: 620px) {
  .adaptation-hero {
    align-items: flex-start;
    flex-direction: column;
  }
  .adaptation-stats {
    grid-template-columns: 1fr;
  }
  .adaptation-filter {
    align-items: stretch;
    flex-wrap: wrap;
  }
  .adaptation-search {
    width: 100%;
  }
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
