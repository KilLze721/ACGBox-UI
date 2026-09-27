<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { createRegion, deleteRegions, getRegionById, getRegions, updateRegion } from '@/api/catalog'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import type { NamedOption } from '@/types/api'

type DrawerMode = 'create' | 'edit'

const route = useRoute()
const initialName = typeof route.query.name === 'string' ? route.query.name.trim() : ''
const regions = ref<NamedOption[]>([])
const searchName = ref(initialName)
const appliedName = ref(initialName)
const selectedIds = ref<number[]>([])
const loading = ref(false)
const listError = ref('')
const drawerMode = ref<DrawerMode | null>(null)
const currentRegion = ref<NamedOption | null>(null)
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

const filteredRegions = computed(() => {
  const keyword = appliedName.value.toLocaleLowerCase()
  return regions.value
    .filter((region) => !keyword || region.name.toLocaleLowerCase().includes(keyword))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
})
const allVisibleSelected = computed(
  () =>
    filteredRegions.value.length > 0 &&
    filteredRegions.value.every((region) => selectedIds.value.includes(region.id)),
)
const selectedTargets = computed(() =>
  regions.value.filter((region) => selectedIds.value.includes(region.id)),
)
const isDirty = computed(
  () => drawerMode.value !== null && formName.value !== initialFormName.value,
)

defineExpose({
  getCloseState: () => ({ dirty: isDirty.value, submitting: saving.value || deleting.value }),
})

onMounted(() => void loadRegions())
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
async function loadRegions() {
  listController?.abort()
  const controller = new AbortController()
  listController = controller
  loading.value = true
  listError.value = ''
  try {
    const result = await getRegions(controller.signal)
    if (controller.signal.aborted) return
    regions.value = result
    selectedIds.value = []
  } catch (error) {
    if (!controller.signal.aborted) listError.value = messageOf(error, '地区读取失败，请稍后重试。')
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
  const visibleIds = filteredRegions.value.map((region) => region.id)
  selectedIds.value = checked
    ? [...new Set([...selectedIds.value, ...visibleIds])]
    : selectedIds.value.filter((id) => !visibleIds.includes(id))
}

function closeDrawer() {
  if (saving.value) return
  drawerController?.abort()
  drawerMode.value = null
  currentRegion.value = null
  drawerError.value = ''
}
async function openDrawer(mode: DrawerMode, row?: NamedOption) {
  drawerController?.abort()
  const controller = new AbortController()
  drawerController = controller
  drawerMode.value = mode
  currentRegion.value = row ?? null
  formName.value = row?.name ?? ''
  initialFormName.value = formName.value
  nameError.value = ''
  drawerError.value = ''
  drawerLoading.value = mode === 'edit'
  if (mode === 'create' || !row) return
  try {
    const region = await getRegionById(row.id, controller.signal)
    if (controller.signal.aborted) return
    currentRegion.value = region
    formName.value = region.name
    initialFormName.value = region.name
  } catch (error) {
    if (controller.signal.aborted) return
    currentRegion.value = null
    drawerError.value = messageOf(error, '地区读取失败，请重试。')
  } finally {
    if (!controller.signal.aborted) drawerLoading.value = false
  }
}
async function saveRegion() {
  const name = formName.value.trim()
  nameError.value = name ? '' : '地区名称不能为空。'
  if (nameError.value || saving.value || drawerLoading.value) return
  if (drawerMode.value === 'edit' && !currentRegion.value) return
  saving.value = true
  drawerError.value = ''
  try {
    const created = drawerMode.value === 'create'
    if (created) await createRegion({ name })
    else await updateRegion({ id: currentRegion.value!.id, name })
    drawerMode.value = null
    currentRegion.value = null
    if (created) resetSearch()
    showToast(created ? '地区已添加。' : '地区已修改。')
    await loadRegions()
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
    deleteError.value = '请先勾选确认框，再删除地区。'
    return
  }
  if (!deleteTargets.value.length || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  const count = deleteTargets.value.length
  try {
    await deleteRegions(deleteTargets.value.map((region) => region.id))
    deleteTargets.value = []
    showToast(`已删除 ${count} 个地区。`)
    await loadRegions()
  } catch (error) {
    deleteError.value = messageOf(error, '删除失败，请稍后重试。')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="regions-management">
    <section class="regions-hero">
      <div>
        <p class="regions-eyebrow">CONTENT ARCHIVE / REGION INDEX</p>
        <h1>地区管理 <span>REGION ARCHIVE</span></h1>
        <p>维护动画资料的地区词条，统一地区名称供筛选和档案标注使用。</p>
      </div>
      <button class="primary-button" type="button" @click="openDrawer('create')">
        <AdminIcon name="plus" />新增地区
      </button>
    </section>

    <section class="regions-stats" aria-label="地区统计">
      <article>
        <span class="regions-stat-icon"><AdminIcon name="regions" /></span>
        <span
          ><small>地区总数</small><strong>{{ regions.length }}</strong></span
        >
      </article>
      <article>
        <span class="regions-stat-icon"><AdminIcon name="search-full" /></span>
        <span
          ><small>当前匹配</small><strong>{{ filteredRegions.length }}</strong></span
        >
      </article>
      <article>
        <span class="regions-stat-icon"><AdminIcon name="check" /></span>
        <span
          ><small>已选地区</small><strong>{{ selectedIds.length }}</strong></span
        >
      </article>
    </section>

    <section class="regions-list-card" aria-labelledby="regionsListTitle">
      <header class="regions-list-header">
        <div>
          <h2 id="regionsListTitle">地区词条列表</h2>
          <p>全量读取 · 按名称升序 · 名称在页面内筛选</p>
        </div>
        <div class="regions-header-actions">
          <span>显示 {{ filteredRegions.length }} 条</span>
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
      <form class="regions-filter" @submit.prevent="runSearch">
        <label class="regions-search">
          <AdminIcon name="search-full" />
          <input
            v-model="searchName"
            type="text"
            placeholder="按地区名称搜索"
            autocomplete="off"
            aria-label="按地区名称搜索"
          />
        </label>
        <button class="secondary-button" type="submit">查询</button>
        <button class="ghost-button" type="button" @click="resetSearch">重置</button>
      </form>
      <div class="regions-table-scroll">
        <table v-if="!loading && !listError && filteredRegions.length" class="regions-table">
          <thead>
            <tr>
              <th class="regions-check-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="选择当前结果全部地区"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th>地区名称</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="region in filteredRegions" :key="region.id">
              <td class="regions-check-cell">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(region.id)"
                  :aria-label="`选择地区 ${region.name}`"
                  @change="toggleRow(region.id, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td>
                <span class="regions-name">{{ region.name }}</span>
              </td>
              <td>
                <div class="regions-row-actions">
                  <button
                    type="button"
                    title="编辑"
                    :aria-label="`编辑地区 ${region.name}`"
                    @click="openDrawer('edit', region)"
                  >
                    <AdminIcon name="edit" />
                  </button>
                  <button
                    class="danger"
                    type="button"
                    title="删除"
                    :aria-label="`删除地区 ${region.name}`"
                    @click="openDelete([region])"
                  >
                    <AdminIcon name="delete" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="regions-list-state" :class="{ error: !!listError }">
          <span class="regions-state-icon"
            ><AdminIcon :name="listError ? 'refresh' : 'regions'"
          /></span>
          <strong>{{
            loading
              ? '正在读取地区…'
              : listError
                ? '地区读取失败'
                : appliedName
                  ? '没有匹配的地区'
                  : '暂无地区'
          }}</strong>
          <p>
            {{
              listError ||
              (appliedName
                ? '请尝试其他名称，或清空查询条件。'
                : '创建一个地区词条后，将显示在此处。')
            }}
          </p>
          <button v-if="listError" class="secondary-button" type="button" @click="loadRegions">
            重新加载
          </button>
          <button
            v-else-if="!loading && !appliedName"
            class="primary-button"
            type="button"
            @click="openDrawer('create')"
          >
            新增地区
          </button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="drawerMode && tabActive" class="regions-drawer-layer" @click.self="closeDrawer">
        <aside
          class="regions-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="drawerMode === 'create' ? '新增地区' : '编辑地区'"
        >
          <header class="regions-drawer-header">
            <div>
              <h2>{{ drawerMode === 'create' ? '新增地区' : '编辑地区' }}</h2>
              <p>
                {{
                  drawerMode === 'create'
                    ? '在动画资料库中创建一个地区词条'
                    : `正在修改 ${currentRegion?.name || '地区'}`
                }}
              </p>
            </div>
            <button type="button" aria-label="关闭抽屉" @click="closeDrawer">
              <AdminIcon name="close" />
            </button>
          </header>
          <div class="regions-drawer-body">
            <div v-if="drawerLoading" class="regions-drawer-state">正在读取地区…</div>
            <div
              v-else-if="drawerError && !currentRegion && drawerMode === 'edit'"
              class="regions-drawer-state error"
              role="alert"
            >
              {{ drawerError }}
            </div>
            <form v-else id="regionsEditorForm" @submit.prevent="saveRegion">
              <div class="regions-field" :class="{ invalid: !!nameError }">
                <label for="regionsEditorName">地区名称 <span>*</span></label>
                <input
                  id="regionsEditorName"
                  v-model="formName"
                  placeholder="输入地区名称，例如：日本"
                  autocomplete="off"
                  @input="nameError = ''"
                />
                <p v-if="nameError" class="regions-error" role="alert">{{ nameError }}</p>
                <p class="regions-hint">名称需唯一；当前仅维护地区名称。</p>
              </div>
              <p v-if="drawerError" class="regions-save-error" role="alert">{{ drawerError }}</p>
            </form>
          </div>
          <footer class="regions-drawer-footer">
            <span>地区名称必填</span>
            <div>
              <button class="secondary-button" type="button" @click="closeDrawer">取消</button>
              <button
                class="primary-button"
                type="submit"
                form="regionsEditorForm"
                :disabled="saving || drawerLoading || (drawerMode === 'edit' && !currentRegion)"
              >
                {{ saving ? '保存中…' : '保存地区' }}
              </button>
            </div>
          </footer>
        </aside>
      </div>
      <div
        v-if="deleteTargets.length && tabActive"
        class="regions-dialog-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="regionsDeleteTitle"
        @click.self="closeDelete"
      >
        <div class="regions-dialog">
          <span class="regions-dialog-mark"><AdminIcon name="delete" /></span>
          <h2 id="regionsDeleteTitle">确认删除地区？</h2>
          <p>删除后无法通过页面撤销。请核对以下地区。</p>
          <div class="regions-delete-preview">
            <strong>{{ deleteTargets.map((region) => region.name).join('、') }}</strong
            ><small>共 {{ deleteTargets.length }} 项</small>
          </div>
          <label class="regions-delete-check"
            ><input
              v-model="deleteConfirmed"
              type="checkbox"
              @change="deleteError = ''"
            />我已核对要删除的地区及其关联作品。</label
          >
          <p v-if="deleteError" class="regions-delete-error" role="alert">{{ deleteError }}</p>
          <div class="regions-delete-note" role="note">
            <span aria-hidden="true">!</span
            ><span
              >若作品仍在使用这些地区，请先检查并调整作品资料；删除请求及关联关系按后端规则处理。</span
            >
          </div>
          <div class="regions-dialog-actions">
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
      <div v-if="toast && tabActive" class="regions-toast" role="status">{{ toast }}</div>
    </Teleport>
  </section>
</template>

<style scoped>
.regions-management {
  max-width: 1440px;
  margin: 0 auto;
  padding-bottom: 14px;
}
.regions-management button {
  cursor: pointer;
}
.regions-hero {
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
.regions-hero::before {
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
.regions-hero > * {
  position: relative;
  z-index: 1;
}
.regions-eyebrow {
  margin: 0 0 9px;
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.16em;
}
.regions-hero h1 {
  margin: 0;
  font: 700 clamp(23px, 3vw, 30px)/1.25 var(--font-display);
  letter-spacing: -0.035em;
}
.regions-hero h1 span {
  color: var(--ink-faint);
  font: 500 12px var(--font-body);
  letter-spacing: 0;
}
.regions-hero p:last-child {
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
.regions-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
  margin-top: 16px;
}
.regions-stats article {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
}
.regions-stat-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 10px;
}
.regions-stat-icon svg {
  width: 17px;
  height: 17px;
}
.regions-stats article:nth-child(2) .regions-stat-icon {
  color: var(--cyan);
  background: var(--cyan-soft);
}
.regions-stats article:nth-child(3) .regions-stat-icon {
  color: var(--accent);
  background: var(--accent-soft);
}
.regions-stats small,
.regions-stats strong {
  display: block;
}
.regions-stats small {
  color: var(--ink-faint);
  font-size: 10px;
}
.regions-stats strong {
  margin-top: 2px;
  font: 700 18px var(--font-display);
}
.regions-list-card {
  margin-top: 16px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
}
.regions-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--line);
}
.regions-list-header h2 {
  margin: 0;
  font: 700 16px var(--font-display);
}
.regions-list-header p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.regions-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--ink-faint);
  font-size: 11px;
  white-space: nowrap;
}
.regions-filter {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 15px 20px;
}
.regions-search {
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
.regions-search:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.regions-search svg {
  width: 16px;
  height: 16px;
  color: var(--ink-faint);
}
.regions-search input {
  width: 100%;
  min-width: 0;
  color: var(--ink);
  background: transparent;
  border: 0;
  outline: 0;
  font: 11px var(--font-body);
}
.regions-search input::placeholder {
  color: var(--ink-faint);
}
.regions-table-scroll {
  overflow-x: auto;
}
.regions-table {
  width: 100%;
  min-width: 580px;
  border-collapse: collapse;
  text-align: left;
}
.regions-table th {
  padding: 11px 14px;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  font-weight: 700;
}
.regions-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 11px;
}
.regions-table tbody tr:last-child td {
  border-bottom: 0;
}
.regions-table tbody tr:hover {
  background: var(--surface-hover);
}
.regions-check-cell {
  width: 50px;
}
.regions-check-cell input,
.regions-delete-check input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
}
.regions-name {
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
.regions-name::before {
  width: 6px;
  height: 6px;
  content: '';
  background: var(--violet);
  border-radius: 50%;
}
.regions-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 5px;
}
.regions-row-actions button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border: 0;
  border-radius: 8px;
}
.regions-row-actions button svg {
  width: 15px;
  height: 15px;
}
.regions-row-actions button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.regions-row-actions button.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.regions-list-state {
  padding: 48px 20px;
  text-align: center;
}
.regions-state-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin: 0 auto 12px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 16px;
}
.regions-state-icon svg {
  width: 22px;
  height: 22px;
}
.regions-list-state strong {
  display: block;
  font: 700 15px var(--font-display);
}
.regions-list-state p {
  margin: 6px 0 14px;
  color: var(--ink-faint);
  font-size: 11px;
}
.regions-list-state.error .regions-state-icon {
  color: var(--danger);
  background: var(--danger-soft);
}
.regions-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(18, 17, 30, 0.42);
  backdrop-filter: blur(2px);
}
.regions-drawer {
  position: absolute;
  inset: 0 0 0 auto;
  display: flex;
  width: min(520px, 94vw);
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: var(--canvas);
  box-shadow: -24px 0 60px rgba(20, 17, 40, 0.2);
  animation: regions-slide-in 0.22s ease both;
}
@keyframes regions-slide-in {
  from {
    transform: translateX(102%);
  }
  to {
    transform: translateX(0);
  }
}
.regions-drawer-header {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 21px 23px 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}
.regions-drawer-header h2 {
  margin: 0;
  font: 700 19px var(--font-display);
}
.regions-drawer-header p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.regions-drawer-header button {
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
.regions-drawer-header button svg {
  width: 15px;
  height: 15px;
}
.regions-drawer-body {
  min-height: 0;
  flex: 1;
  padding: 20px 23px;
  overflow: auto;
}
.regions-drawer-state {
  color: var(--ink-faint);
  font-size: 12px;
}
.regions-drawer-state.error {
  color: var(--danger);
}
.regions-field label {
  display: flex;
  gap: 5px;
  margin-bottom: 7px;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 700;
}
.regions-field label span {
  color: var(--accent-strong);
}
.regions-field input {
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
.regions-field input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.regions-field.invalid input {
  border-color: var(--danger);
}
.regions-field input::placeholder {
  color: var(--ink-faint);
}
.regions-hint {
  margin: 7px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.regions-error,
.regions-save-error {
  margin: 7px 0 0;
  color: var(--danger);
  font-size: 11px;
}
.regions-drawer-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  padding: 13px 23px;
  background: var(--surface);
  border-top: 1px solid var(--line);
}
.regions-drawer-footer > span {
  color: var(--ink-faint);
  font-size: 10px;
}
.regions-drawer-footer > div {
  display: flex;
  gap: 8px;
}
.regions-dialog-layer {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(18, 17, 30, 0.48);
  backdrop-filter: blur(3px);
}
.regions-dialog {
  width: min(440px, 100%);
  padding: 24px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 24px 70px rgba(18, 17, 30, 0.22);
  color: var(--ink);
  font-family: var(--font-body);
}
.regions-dialog-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 12px;
}
.regions-dialog-mark svg {
  width: 19px;
  height: 19px;
}
.regions-dialog h2 {
  margin: 14px 0 5px;
  font: 700 17px/1.4 var(--font-display);
}
.regions-dialog > p:not(.regions-delete-error) {
  margin: 0 0 15px;
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.6;
}
.regions-delete-preview {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.regions-delete-preview strong {
  font-size: 12px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.regions-delete-preview small {
  color: var(--ink-faint);
  font-size: 10px;
}
.regions-delete-check {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 11px;
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
}
.regions-delete-check input {
  flex: 0 0 auto;
  margin: 0;
}
.regions-dialog .regions-delete-error {
  margin: 5px 0 0 20px;
  color: var(--danger);
  font-size: 11px;
}
.regions-delete-note {
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
.regions-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.regions-toast {
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
  .regions-hero,
  .regions-list-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .regions-stats {
    grid-template-columns: 1fr;
  }
  .regions-filter {
    flex-wrap: wrap;
  }
  .regions-search {
    width: 100%;
  }
  .regions-drawer-footer > span {
    display: none;
  }
}
</style>
