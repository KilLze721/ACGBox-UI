<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  createBroadcastType,
  deleteBroadcastTypes,
  getBroadcastTypeById,
  getBroadcastTypes,
  updateBroadcastType,
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
const toast = ref('')

let listController: AbortController | undefined
let drawerController: AbortController | undefined
let toastTimer: number | undefined
let previousBodyOverflow: string | undefined
let previousHtmlOverflow: string | undefined

const filteredTypes = computed(() => {
  const keyword = appliedName.value.toLocaleLowerCase()
  return types.value
    .filter((type) => !keyword || type.name.toLocaleLowerCase().includes(keyword))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})
const allVisibleSelected = computed(
  () =>
    filteredTypes.value.length > 0 &&
    filteredTypes.value.every((type) => selectedIds.value.includes(type.id)),
)
const selectedTargets = computed(() =>
  types.value.filter((type) => selectedIds.value.includes(type.id)),
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
function showToast(message: string) {
  toast.value = message
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = ''), 5000)
}
async function loadTypes() {
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  loading.value = true
  listError.value = ''
  try {
    const result = await getBroadcastTypes(controller.signal)
    if (controller.signal.aborted) return
    types.value = result
    selectedIds.value = []
  } catch (error) {
    if (!controller.signal.aborted)
      listError.value = messageOf(error, '放送类型读取失败，请稍后重试。')
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
  const visibleIds = filteredTypes.value.map((type) => type.id)
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
    const type = await getBroadcastTypeById(row.id, controller.signal)
    if (controller.signal.aborted) return
    currentType.value = type
    formName.value = type.name
    initialFormName.value = type.name
  } catch (error) {
    if (controller.signal.aborted) return
    currentType.value = null
    drawerError.value = messageOf(error, '放送类型读取失败，请重试。')
  } finally {
    if (!controller.signal.aborted) drawerLoading.value = false
  }
}
async function saveType() {
  const name = formName.value.trim()
  nameError.value = name ? '' : '放送类型名称不能为空。'
  if (nameError.value || saving.value || drawerLoading.value) return
  if (drawerMode.value === 'edit' && !currentType.value) return
  saving.value = true
  drawerError.value = ''
  try {
    const created = drawerMode.value === 'create'
    if (created) await createBroadcastType({ name })
    else await updateBroadcastType({ id: currentType.value!.id, name })
    drawerMode.value = null
    currentType.value = null
    if (created) resetSearch()
    showToast(created ? '放送类型已添加。' : '放送类型已修改。')
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
    deleteError.value = '请先勾选确认框，再删除放送类型。'
    return
  }
  if (!deleteTargets.value.length || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  const count = deleteTargets.value.length
  try {
    await deleteBroadcastTypes(deleteTargets.value.map((type) => type.id))
    deleteTargets.value = []
    showToast(`已删除 ${count} 个放送类型。`)
    await loadTypes()
  } catch (error) {
    deleteError.value = messageOf(error, '删除失败，请稍后重试。')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="broadcast-management">
    <section class="broadcast-hero">
      <div>
        <p class="broadcast-eyebrow">CONTENT ARCHIVE / BROADCAST INDEX</p>
        <h1>放送类型管理 <span>BROADCAST TYPES</span></h1>
        <p>统一维护动画的播出形式，例如 TV、WEB、OVA 与剧场版。</p>
      </div>
      <button class="primary-button" type="button" @click="openDrawer('create')">
        <AdminIcon name="plus" />新增放送类型
      </button>
    </section>

    <section class="broadcast-stats" aria-label="放送类型统计">
      <article>
        <span class="broadcast-stat-icon"><AdminIcon name="broadcast-types" /></span>
        <span
          ><small>类型总数</small><strong>{{ types.length }}</strong></span
        >
      </article>
      <article>
        <span class="broadcast-stat-icon"><AdminIcon name="search-full" /></span>
        <span
          ><small>当前匹配</small><strong>{{ filteredTypes.length }}</strong></span
        >
      </article>
      <article>
        <span class="broadcast-stat-icon"><AdminIcon name="check" /></span>
        <span
          ><small>已选类型</small><strong>{{ selectedIds.length }}</strong></span
        >
      </article>
    </section>

    <section class="broadcast-list-card" aria-labelledby="broadcastListTitle">
      <header class="broadcast-list-header">
        <div>
          <h2 id="broadcastListTitle">放送类型词条</h2>
          <p>全量读取 · 按名称升序 · 名称在页面内筛选</p>
        </div>
        <div class="broadcast-header-actions">
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
      <form class="broadcast-filter" @submit.prevent="runSearch">
        <label class="broadcast-search">
          <AdminIcon name="search-full" />
          <input
            v-model="searchName"
            type="text"
            placeholder="按放送类型名称搜索"
            autocomplete="off"
            aria-label="按放送类型名称搜索"
          />
        </label>
        <button class="secondary-button" type="submit">查询</button>
        <button class="ghost-button" type="button" @click="resetSearch">重置</button>
      </form>
      <div class="broadcast-table-scroll">
        <table v-if="!loading && !listError && filteredTypes.length" class="broadcast-table">
          <thead>
            <tr>
              <th class="broadcast-check-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="选择当前结果全部放送类型"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th>放送类型名称</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="type in filteredTypes" :key="type.id">
              <td class="broadcast-check-cell">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(type.id)"
                  :aria-label="`选择放送类型 ${type.name}`"
                  @change="toggleRow(type.id, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td>
                <span class="broadcast-name">{{ type.name }}</span>
              </td>
              <td>
                <div class="broadcast-row-actions">
                  <button
                    type="button"
                    title="编辑"
                    :aria-label="`编辑放送类型 ${type.name}`"
                    @click="openDrawer('edit', type)"
                  >
                    <AdminIcon name="edit" />
                  </button>
                  <button
                    class="danger"
                    type="button"
                    title="删除"
                    :aria-label="`删除放送类型 ${type.name}`"
                    @click="openDelete([type])"
                  >
                    <AdminIcon name="delete" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="broadcast-list-state" :class="{ error: !!listError }">
          <span class="broadcast-state-icon"
            ><AdminIcon :name="listError ? 'refresh' : 'broadcast-types'"
          /></span>
          <strong>{{
            loading
              ? '正在读取放送类型…'
              : listError
                ? '放送类型读取失败'
                : appliedName
                  ? '没有匹配的放送类型'
                  : '暂无放送类型'
          }}</strong>
          <p>
            {{
              listError ||
              (appliedName
                ? '请尝试其他名称，或清空查询条件。'
                : '创建一个放送类型词条后，将显示在此处。')
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
            新增放送类型
          </button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="drawerMode && tabActive" class="broadcast-drawer-layer" @click.self="closeDrawer">
        <aside
          class="broadcast-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="drawerMode === 'create' ? '新增放送类型' : '编辑放送类型'"
        >
          <header class="broadcast-drawer-header">
            <div>
              <h2>{{ drawerMode === 'create' ? '新增放送类型' : '编辑放送类型' }}</h2>
              <p>
                {{
                  drawerMode === 'create'
                    ? '为动画资料建立一个播出形式词条'
                    : `正在修改 ${currentType?.name || '放送类型'}`
                }}
              </p>
            </div>
            <button type="button" aria-label="关闭抽屉" @click="closeDrawer">
              <AdminIcon name="close" />
            </button>
          </header>
          <div class="broadcast-drawer-body">
            <div v-if="drawerLoading" class="broadcast-drawer-state">正在读取放送类型…</div>
            <div
              v-else-if="drawerError && !currentType && drawerMode === 'edit'"
              class="broadcast-drawer-state error"
              role="alert"
            >
              {{ drawerError }}
            </div>
            <form v-else id="broadcastEditorForm" @submit.prevent="saveType">
              <div class="broadcast-field" :class="{ invalid: !!nameError }">
                <label for="broadcastEditorName">放送类型名称 <span>*</span></label>
                <input
                  id="broadcastEditorName"
                  v-model="formName"
                  placeholder="例如：TV、WEB、OVA、剧场版"
                  autocomplete="off"
                  @input="nameError = ''"
                />
                <p v-if="nameError" class="broadcast-error" role="alert">{{ nameError }}</p>
                <p class="broadcast-hint">名称需唯一；当前仅维护放送类型名称。</p>
              </div>
              <p v-if="drawerError" class="broadcast-save-error" role="alert">{{ drawerError }}</p>
            </form>
          </div>
          <footer class="broadcast-drawer-footer">
            <span>放送类型名称必填</span>
            <div>
              <button class="secondary-button" type="button" @click="closeDrawer">取消</button>
              <button
                class="primary-button"
                type="submit"
                form="broadcastEditorForm"
                :disabled="saving || drawerLoading || (drawerMode === 'edit' && !currentType)"
              >
                {{ saving ? '保存中…' : '保存放送类型' }}
              </button>
            </div>
          </footer>
        </aside>
      </div>
      <div
        v-if="deleteTargets.length && tabActive"
        class="broadcast-dialog-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="broadcastDeleteTitle"
        @click.self="closeDelete"
      >
        <div class="broadcast-dialog">
          <span class="broadcast-dialog-mark"><AdminIcon name="delete" /></span>
          <h2 id="broadcastDeleteTitle">确认删除放送类型？</h2>
          <p>删除后无法通过页面撤销。请核对以下放送类型。</p>
          <div class="broadcast-delete-preview">
            <strong>{{ deleteTargets.map((type) => type.name).join('、') }}</strong
            ><small>共 {{ deleteTargets.length }} 项</small>
          </div>
          <label class="broadcast-delete-check"
            ><input
              v-model="deleteConfirmed"
              type="checkbox"
              @change="deleteError = ''"
            />我已核对要删除的放送类型及其关联作品。</label
          >
          <p v-if="deleteError" class="broadcast-delete-error" role="alert">{{ deleteError }}</p>
          <div class="broadcast-delete-note" role="note">
            <span aria-hidden="true">!</span
            ><span
              >若作品仍在使用这些放送类型，请先检查并调整作品资料；删除请求及关联关系按后端规则处理。</span
            >
          </div>
          <div class="broadcast-dialog-actions">
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
      <div v-if="toast && tabActive" class="broadcast-toast" role="status">{{ toast }}</div>
    </Teleport>
  </section>
</template>

<style scoped>
.broadcast-management {
  max-width: 1440px;
  margin: 0 auto;
  padding-bottom: 14px;
}
.broadcast-management button {
  cursor: pointer;
}
.broadcast-hero {
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
.broadcast-hero::before {
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
.broadcast-hero > * {
  position: relative;
  z-index: 1;
}
.broadcast-eyebrow {
  margin: 0 0 9px;
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.16em;
}
.broadcast-hero h1 {
  margin: 0;
  font: 700 clamp(23px, 3vw, 30px)/1.25 var(--font-display);
  letter-spacing: -0.035em;
}
.broadcast-hero h1 span {
  color: var(--ink-faint);
  font: 500 12px var(--font-body);
  letter-spacing: 0;
}
.broadcast-hero p:last-child {
  max-width: 610px;
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
}
.primary-button,
.secondary-button,
.ghost-button,
.danger-button {
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
.primary-button svg,
.danger-button svg {
  width: 15px;
  height: 15px;
}
.primary-button {
  color: #fff;
  background: linear-gradient(135deg, #df7395, #bb5d88);
  box-shadow: 0 7px 15px rgba(197, 75, 117, 0.18);
}
.secondary-button,
.ghost-button {
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
}
.danger-button {
  color: #fff;
  background: var(--danger);
}
.primary-button:hover,
.danger-button:hover:not(:disabled) {
  filter: brightness(0.96);
}
.secondary-button:hover,
.ghost-button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.danger-button:disabled,
.primary-button:disabled {
  color: var(--ink-faint);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  box-shadow: none;
  cursor: not-allowed;
}
.broadcast-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
  margin-top: 16px;
}
.broadcast-stats article {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
}
.broadcast-stat-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 10px;
}
.broadcast-stat-icon svg {
  width: 17px;
  height: 17px;
}
.broadcast-stats article:nth-child(2) .broadcast-stat-icon {
  color: var(--cyan);
  background: var(--cyan-soft);
}
.broadcast-stats article:nth-child(3) .broadcast-stat-icon {
  color: var(--accent);
  background: var(--accent-soft);
}
.broadcast-stats small,
.broadcast-stats strong {
  display: block;
}
.broadcast-stats small {
  color: var(--ink-faint);
  font-size: 10px;
}
.broadcast-stats strong {
  margin-top: 2px;
  font: 700 18px var(--font-display);
}
.broadcast-list-card {
  margin-top: 16px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
}
.broadcast-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
}
.broadcast-list-header h2 {
  margin: 0;
  font: 700 16px var(--font-display);
}
.broadcast-list-header p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.broadcast-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--ink-faint);
  font-size: 11px;
  white-space: nowrap;
}
.broadcast-filter {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 15px 20px;
}
.broadcast-search {
  display: flex;
  width: min(390px, 100%);
  height: 40px;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
}
.broadcast-search:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.broadcast-search svg {
  width: 16px;
  height: 16px;
  color: var(--ink-faint);
}
.broadcast-search input {
  width: 100%;
  min-width: 0;
  color: var(--ink);
  background: transparent;
  border: 0;
  outline: 0;
  font: 11px var(--font-body);
}
.broadcast-search input::placeholder {
  color: var(--ink-faint);
}
.broadcast-table-scroll {
  overflow-x: auto;
}
.broadcast-table {
  width: 100%;
  min-width: 580px;
  border-collapse: collapse;
  text-align: left;
}
.broadcast-table th {
  padding: 11px 14px;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  font-weight: 700;
}
.broadcast-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 11px;
}
.broadcast-table tbody tr:last-child td {
  border-bottom: 0;
}
.broadcast-table tbody tr:hover {
  background: var(--surface-hover);
}
.broadcast-check-cell {
  width: 50px;
}
.broadcast-check-cell input,
.broadcast-delete-check input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
}
.broadcast-name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 9px;
  color: #62568e;
  background: var(--violet-soft);
  border: 1px solid color-mix(in srgb, var(--violet) 15%, transparent);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 650;
}
.broadcast-name::before {
  width: 6px;
  height: 6px;
  content: '';
  background: var(--violet);
  border-radius: 50%;
}
.broadcast-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 5px;
}
.broadcast-row-actions button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border: 0;
  border-radius: 8px;
}
.broadcast-row-actions button svg {
  width: 15px;
  height: 15px;
}
.broadcast-row-actions button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.broadcast-row-actions button.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.broadcast-list-state {
  padding: 48px 20px;
  text-align: center;
}
.broadcast-state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin: 0 auto 12px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 16px;
}
.broadcast-state-icon svg {
  width: 22px;
  height: 22px;
}
.broadcast-list-state strong {
  display: block;
  font: 700 15px var(--font-display);
}
.broadcast-list-state p {
  margin: 6px 0 14px;
  color: var(--ink-faint);
  font-size: 11px;
}
.broadcast-list-state.error .broadcast-state-icon {
  color: var(--danger);
  background: var(--danger-soft);
}
.broadcast-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(18, 17, 30, 0.42);
  backdrop-filter: blur(2px);
}
.broadcast-drawer {
  position: absolute;
  inset: 0 0 0 auto;
  display: flex;
  width: min(520px, 94vw);
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: var(--canvas);
  box-shadow: -24px 0 60px rgba(20, 17, 40, 0.2);
  animation: broadcast-slide-in 0.22s ease both;
}
@keyframes broadcast-slide-in {
  from {
    transform: translateX(102%);
  }
  to {
    transform: translateX(0);
  }
}
.broadcast-drawer-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 21px 23px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.broadcast-drawer-header h2 {
  margin: 0;
  font: 700 19px var(--font-display);
}
.broadcast-drawer-header p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.broadcast-drawer-header button {
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
.broadcast-drawer-header button svg {
  width: 15px;
  height: 15px;
}
.broadcast-drawer-body {
  min-height: 0;
  flex: 1;
  padding: 20px 23px;
  overflow: auto;
}
.broadcast-drawer-state {
  color: var(--ink-faint);
  font-size: 12px;
}
.broadcast-drawer-state.error {
  color: var(--danger);
}
.broadcast-field label {
  display: flex;
  gap: 5px;
  margin-bottom: 7px;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 700;
}
.broadcast-field label span {
  color: var(--accent-strong);
}
.broadcast-field input {
  display: block;
  width: 100%;
  height: 42px;
  padding: 0 12px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  outline: 0;
  font: 12px var(--font-body);
}
.broadcast-field input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.broadcast-field.invalid input {
  border-color: var(--danger);
}
.broadcast-field input::placeholder {
  color: var(--ink-faint);
}
.broadcast-hint {
  margin: 7px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.broadcast-error,
.broadcast-save-error {
  margin: 7px 0 0;
  color: var(--danger);
  font-size: 11px;
}
.broadcast-drawer-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  padding: 13px 23px;
  background: var(--surface);
  border-top: 1px solid var(--line);
}
.broadcast-drawer-footer > span {
  color: var(--ink-faint);
  font-size: 10px;
}
.broadcast-drawer-footer > div {
  display: flex;
  gap: 8px;
}
.broadcast-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(18, 17, 30, 0.48);
  backdrop-filter: blur(3px);
}
.broadcast-dialog {
  width: min(440px, 100%);
  padding: 24px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 24px 70px rgba(18, 17, 30, 0.22);
  color: var(--ink);
  font-family: var(--font-body);
}
.broadcast-dialog-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 12px;
}
.broadcast-dialog-mark svg {
  width: 19px;
  height: 19px;
}
.broadcast-dialog h2 {
  margin: 14px 0 5px;
  font: 700 17px/1.4 var(--font-display);
}
.broadcast-dialog > p:not(.broadcast-delete-error) {
  margin: 0 0 15px;
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.6;
}
.broadcast-delete-preview {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.broadcast-delete-preview strong {
  font-size: 12px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.broadcast-delete-preview small {
  color: var(--ink-faint);
  font-size: 10px;
}
.broadcast-delete-check {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}
.broadcast-delete-check input {
  flex: 0 0 auto;
  margin: 0;
}
.broadcast-dialog .broadcast-delete-error {
  margin: 5px 0 0 20px;
  color: var(--danger);
  font-size: 11px;
}
.broadcast-delete-note {
  display: flex;
  gap: 8px;
  padding: 9px 10px;
  margin-top: 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 8px;
  font-size: 10px;
  line-height: 1.5;
}
.broadcast-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.broadcast-toast {
  position: fixed;
  right: 25px;
  bottom: 24px;
  z-index: 1500;
  padding: 10px 15px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: var(--shadow-soft);
  font-size: 12px;
}
@media (max-width: 680px) {
  .broadcast-hero,
  .broadcast-list-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .broadcast-stats {
    grid-template-columns: 1fr;
  }
  .broadcast-filter {
    flex-wrap: wrap;
  }
  .broadcast-search {
    width: 100%;
  }
  .broadcast-drawer-footer > span {
    display: none;
  }
}
</style>
