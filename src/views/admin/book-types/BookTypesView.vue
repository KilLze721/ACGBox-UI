<script setup lang="ts">
/**
 * 书籍类型字典管理页面：维护书籍使用的书籍类型，支持名称筛选和多项选择。
 * 新增、修改在抽屉内完成，删除需确认；当前列表由已有字典接口一次读取。
 */
import '@/assets/adminManagementCards.css'
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  createBookType,
  deleteBookTypes,
  getBookTypeById,
  getBookTypes,
  updateBookType,
} from '@/api/book'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import { notifyCatalogChanged, useCatalogRefresh } from '@/utils/catalogChanges'
import { useModalLayer } from '@/utils/useModalLayer'
import { parseBookInteger } from '@/utils/bookForm'
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
const toast = ref('')

let listController: AbortController | undefined
let drawerController: AbortController | undefined
let toastTimer: number | undefined

const filteredTypes = computed(() => {
  const keyword = appliedName.value.toLocaleLowerCase()
  return types.value.filter((type) => !keyword || type.name.toLocaleLowerCase().includes(keyword))
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
  () =>
    drawerMode.value !== null &&
    (formName.value !== initialFormName.value ||
      formSortOrder.value !== initialFormSortOrder.value),
)

const discarding = ref(false)
const drawerRef = useModalLayer(() => tabActive.value && !!drawerMode.value, closeDrawer)
const deleteRef = useModalLayer(() => tabActive.value && !!deleteTargets.value.length, closeDelete)
const discardRef = useModalLayer(
  () => tabActive.value && discarding.value,
  () => {
    discarding.value = false
  },
)
function discardEditor() {
  discarding.value = false
  finishCloseDrawer()
}

defineExpose({
  getCloseState: () => ({ dirty: isDirty.value, submitting: saving.value || deleting.value }),
})

const refreshTypes = useCatalogRefresh(['book'], loadTypes)
onMounted(() => void refreshTypes())
onActivated(() => {
  tabActive.value = true
})
onDeactivated(() => {
  tabActive.value = false
})
onBeforeUnmount(() => {
  listController?.abort()
  drawerController?.abort()
  if (toastTimer) window.clearTimeout(toastTimer)
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
    const result = await getBookTypes(controller.signal)
    if (controller.signal.aborted) return
    types.value = result
    selectedIds.value = []
  } catch (error) {
    if (!controller.signal.aborted)
      listError.value = messageOf(error, '书籍类型读取失败，请稍后重试。')
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
  if (isDirty.value) {
    discarding.value = true
    return
  }
  finishCloseDrawer()
}
function finishCloseDrawer() {
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
    const type = await getBookTypeById(row.id, controller.signal)
    if (controller.signal.aborted) return
    currentType.value = type
    formName.value = type.name
    initialFormName.value = type.name
    formSortOrder.value = String(type.sortOrder)
    initialFormSortOrder.value = formSortOrder.value
  } catch (error) {
    if (controller.signal.aborted) return
    currentType.value = null
    drawerError.value = messageOf(error, '书籍类型读取失败，请重试。')
  } finally {
    if (!controller.signal.aborted) drawerLoading.value = false
  }
}
async function saveType() {
  const name = formName.value.trim()
  nameError.value = !name
    ? '书籍类型名称不能为空。'
    : Array.from(name).length > 50
      ? '名称不能超过 50 个字符。'
      : ''
  const sortOrder = parseBookInteger(formSortOrder.value)
  sortOrderError.value = sortOrder === null ? '排序请输入 0 至 2147483647 之间的整数。' : ''
  if (nameError.value || sortOrder === null || saving.value || drawerLoading.value) return
  if (drawerMode.value === 'edit' && !currentType.value) return
  saving.value = true
  drawerError.value = ''
  try {
    const created = drawerMode.value === 'create'
    if (created) await createBookType({ name, sortOrder })
    else await updateBookType({ id: currentType.value!.id, name, sortOrder })
    notifyCatalogChanged('book')
    drawerMode.value = null
    currentType.value = null
    if (created) resetSearch()
    showToast(created ? '书籍类型已添加。' : '书籍类型已修改。')
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
    deleteError.value = '请先勾选确认框，再删除书籍类型。'
    return
  }
  if (!deleteTargets.value.length || deleting.value) return
  deleting.value = true
  deleteError.value = ''
  const count = deleteTargets.value.length
  try {
    await deleteBookTypes(deleteTargets.value.map((type) => type.id))
    notifyCatalogChanged('book')
    deleteTargets.value = []
    showToast(`已删除 ${count} 个书籍类型。`)
    await refreshTypes()
  } catch (error) {
    deleteError.value = messageOf(error, '删除失败，请稍后重试。')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="broadcast-management management-cards">
    <section class="broadcast-hero management-hero">
      <div class="management-hero-copy">
        <p class="broadcast-eyebrow management-eyebrow">CONTENT ARCHIVE / BOOK INDEX</p>
        <h1>书籍类型管理 <span>BOOK TYPES</span></h1>
        <p>维护小说、轻小说、漫画及其他图书的主类型。</p>
      </div>
      <button class="primary-button" type="button" @click="openDrawer('create')">
        <AdminIcon name="plus" />新增书籍类型
      </button>
    </section>

    <section class="broadcast-stats management-stats" aria-label="书籍类型统计">
      <article class="management-stat">
        <span class="broadcast-stat-icon management-stat-icon"
          ><AdminIcon name="book-types"
        /></span>
        <span class="management-stat-copy"
          ><small class="management-stat-label">类型总数</small
          ><strong class="management-stat-value">{{ types.length }}</strong></span
        >
      </article>
      <article class="management-stat">
        <span class="broadcast-stat-icon management-stat-icon"
          ><AdminIcon name="search-full"
        /></span>
        <span class="management-stat-copy"
          ><small class="management-stat-label">当前页记录</small
          ><strong class="management-stat-value">{{ filteredTypes.length }}</strong></span
        >
      </article>
      <article class="management-stat">
        <span class="broadcast-stat-icon management-stat-icon"><AdminIcon name="check" /></span>
        <span class="management-stat-copy"
          ><small class="management-stat-label">已选类型</small
          ><strong class="management-stat-value">{{ selectedIds.length }}</strong></span
        >
      </article>
    </section>

    <section class="broadcast-list-card management-list-card" aria-labelledby="bookListTitle">
      <header class="broadcast-list-header management-list-header">
        <div>
          <h2 id="bookListTitle">书籍类型词条</h2>
          <p>全量读取 · 按排序值升序 · 名称在页面内筛选</p>
        </div>
        <div class="broadcast-header-actions management-list-actions">
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
      <form class="broadcast-filter management-filter" @submit.prevent="runSearch">
        <label class="broadcast-search management-search">
          <AdminIcon name="search-full" />
          <input
            v-model="searchName"
            type="text"
            placeholder="按书籍类型名称搜索"
            autocomplete="off"
            aria-label="按书籍类型名称搜索"
          />
        </label>
        <button class="secondary-button" type="submit">查询</button>
        <button class="ghost-button" type="button" @click="resetSearch">重置</button>
      </form>
      <div class="broadcast-table-scroll management-table-scroll">
        <table
          v-if="!loading && !listError && filteredTypes.length"
          class="broadcast-table management-table"
        >
          <thead>
            <tr>
              <th class="broadcast-check-cell management-check-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="选择当前结果全部书籍类型"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th>书籍类型名称</th>
              <th class="broadcast-sort-cell">排序</th>
              <th class="management-actions-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="type in filteredTypes" :key="type.id">
              <td class="broadcast-check-cell management-check-cell">
                <input
                  type="checkbox"
                  :checked="selectedIds.includes(type.id)"
                  :aria-label="`选择书籍类型 ${type.name}`"
                  @change="toggleRow(type.id, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td>
                <span class="broadcast-name">{{ type.name }}</span>
              </td>
              <td class="broadcast-sort-cell">{{ type.sortOrder }}</td>
              <td class="management-actions-cell">
                <div class="broadcast-row-actions management-row-actions">
                  <button
                    class="management-row-action management-icon-action"
                    type="button"
                    title="编辑"
                    :aria-label="`编辑书籍类型 ${type.name}`"
                    @click="openDrawer('edit', type)"
                  >
                    <AdminIcon name="edit" />
                  </button>
                  <button
                    class="danger management-row-action management-icon-action"
                    type="button"
                    title="删除"
                    :aria-label="`删除书籍类型 ${type.name}`"
                    @click="openDelete([type])"
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
          class="broadcast-list-state management-list-state"
          :class="{ error: !!listError }"
        >
          <span class="broadcast-state-icon management-state-icon"
            ><AdminIcon :name="listError ? 'refresh' : 'book-types'"
          /></span>
          <strong>{{
            loading
              ? '正在读取书籍类型…'
              : listError
                ? '书籍类型读取失败'
                : appliedName
                  ? '没有匹配的书籍类型'
                  : '暂无书籍类型'
          }}</strong>
          <p>
            {{
              listError ||
              (appliedName
                ? '请尝试其他名称，或清空查询条件。'
                : '创建一个书籍类型词条后，将显示在此处。')
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
            新增书籍类型
          </button>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <div v-if="drawerMode && tabActive" class="broadcast-drawer-layer" @click.self="closeDrawer">
        <aside
          ref="drawerRef"
          tabindex="-1"
          class="broadcast-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="drawerMode === 'create' ? '新增书籍类型' : '编辑书籍类型'"
        >
          <header class="broadcast-drawer-header">
            <div>
              <h2>{{ drawerMode === 'create' ? '新增书籍类型' : '编辑书籍类型' }}</h2>
              <p>
                {{
                  drawerMode === 'create'
                    ? '为书籍资料建立一个主类型词条'
                    : `正在修改 ${currentType?.name || '书籍类型'}`
                }}
              </p>
            </div>
            <button type="button" aria-label="关闭抽屉" @click="closeDrawer">
              <AdminIcon name="close" />
            </button>
          </header>
          <div class="broadcast-drawer-body">
            <div v-if="drawerLoading" class="broadcast-drawer-state">正在读取书籍类型…</div>
            <div
              v-else-if="drawerError && !currentType && drawerMode === 'edit'"
              class="broadcast-drawer-state error"
              role="alert"
            >
              {{ drawerError }}
            </div>
            <form v-else id="bookEditorForm" @submit.prevent="saveType">
              <div class="broadcast-field" :class="{ invalid: !!nameError }">
                <label for="bookEditorName">书籍类型名称 <span>*</span></label>
                <input
                  id="bookEditorName"
                  v-model="formName"
                  placeholder="例如：小说、轻小说、漫画"
                  autocomplete="off"
                  :disabled="saving"
                  @input="nameError = ''"
                />
                <p v-if="nameError" class="broadcast-error" role="alert">{{ nameError }}</p>
                <p class="broadcast-hint">名称需唯一，排序决定列表和书籍表单中的显示顺序。</p>
              </div>
              <div class="broadcast-field" :class="{ invalid: !!sortOrderError }">
                <label for="bookEditorSortOrder">排序 <span>*</span></label>
                <input
                  id="bookEditorSortOrder"
                  v-model="formSortOrder"
                  type="text"
                  inputmode="text"
                  :disabled="saving"
                  :aria-invalid="!!sortOrderError"
                  :aria-describedby="sortOrderError ? 'bookSortOrderError' : undefined"
                  @input="sortOrderError = ''"
                />
                <p
                  v-if="sortOrderError"
                  id="bookSortOrderError"
                  class="broadcast-error"
                  role="alert"
                >
                  {{ sortOrderError }}
                </p>
                <p class="broadcast-hint">数值越小越靠前，仅支持非负整数；相同数值保持稳定顺序。</p>
              </div>
              <p v-if="drawerError" class="broadcast-save-error" role="alert">{{ drawerError }}</p>
            </form>
          </div>
          <footer class="broadcast-drawer-footer">
            <span>书籍类型名称必填</span>
            <div>
              <button class="secondary-button" type="button" @click="closeDrawer">取消</button>
              <button
                class="primary-button"
                type="submit"
                form="bookEditorForm"
                :disabled="saving || drawerLoading || (drawerMode === 'edit' && !currentType)"
              >
                {{ saving ? '保存中…' : '保存书籍类型' }}
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
        aria-labelledby="bookDeleteTitle"
        @click.self="closeDelete"
      >
        <div ref="deleteRef" tabindex="-1" class="broadcast-dialog">
          <span class="broadcast-dialog-mark"><AdminIcon name="delete" /></span>
          <h2 id="bookDeleteTitle">确认删除书籍类型？</h2>
          <p>删除后无法通过页面撤销。请核对以下书籍类型。</p>
          <div class="broadcast-delete-preview">
            <strong>{{ deleteTargets.map((type) => type.name).join('、') }}</strong
            ><small>共 {{ deleteTargets.length }} 项</small>
          </div>
          <label class="broadcast-delete-check"
            ><input
              v-model="deleteConfirmed"
              type="checkbox"
              @change="deleteError = ''"
            />我已核对要删除的书籍类型及其关联作品。</label
          >
          <p v-if="deleteError" class="broadcast-delete-error" role="alert">{{ deleteError }}</p>
          <div class="broadcast-delete-note" role="note">
            <span aria-hidden="true">!</span
            ><span
              >若作品仍在使用这些书籍类型，请先检查并调整作品资料；删除请求及关联关系按后端规则处理。</span
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
      <div v-if="discarding && tabActive" class="broadcast-dialog-layer">
        <section
          ref="discardRef"
          tabindex="-1"
          class="broadcast-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="放弃书籍类型修改"
        >
          <h2>放弃未保存的修改？</h2>
          <p>当前书籍类型尚未保存，是否放弃本次修改？</p>
          <div class="broadcast-dialog-actions">
            <button class="secondary-button" type="button" @click="discarding = false">
              继续编辑</button
            ><button class="primary-button" type="button" @click="discardEditor">放弃修改</button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped src="@/assets/catalogTypeManagement.css"></style>
