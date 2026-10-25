<script setup lang="ts">
/**
 * 人物管理页面：维护允许同名的创作人员档案，支持分页搜索、跨页选择和抽屉编辑。
 * 复用管理端请求、主题和工作区关闭保护，按人物标识分页读取关联动画与全部职责。
 */
import {
  computed,
  inject,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  createPerson,
  deletePersons,
  getPersonById,
  getPersonsPage,
  updatePerson,
} from '@/api/persons'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import ArchiveDescription from '@/components/admin/ArchiveDescription.vue'
import RelatedAnimeList from '@/components/admin/RelatedAnimeList.vue'
import { useRelatedAnime } from '@/utils/relatedAnime'
import { pageSizeValues, resolvePageSize } from '@/utils/preferences'
import type { AnimePageItem, PageResult, Person } from '@/types/api'

type DrawerMode = 'create' | 'edit' | 'detail'
const route = useRoute()
const router = useRouter()
const navigateLinkedContent = inject<(path: '/admin/anime', keyword: string) => Promise<void>>(
  'navigateLinkedContent',
)
const relatedAnime = useRelatedAnime()
const initialName = typeof route.query.name === 'string' ? route.query.name.trim() : ''
const pageSizeOptions = pageSizeValues.map((value) => ({ id: value, name: `${value} 条` }))
const pageSize = ref(resolvePageSize(pageSizeValues, 20))
const page = ref<PageResult<Person>>({
  pageNum: 1,
  pageSize: pageSize.value,
  total: 0,
  pages: 0,
  rows: [],
})
const searchName = ref(initialName)
const appliedName = ref(initialName)
const jumpPage = ref('1')
const jumpError = ref('')
const totalPersons = ref<number | null>(null)
const selectedPersons = ref(new Map<number, Person>())
const selectedTargets = computed(() => [...selectedPersons.value.values()])
const allVisibleSelected = computed(
  () =>
    page.value.rows.length > 0 && page.value.rows.every((row) => selectedPersons.value.has(row.id)),
)
const listLoading = ref(false)
const listError = ref('')
const pageNumbers = computed(() => {
  const values: Array<number | string> = []
  for (let number = 1; number <= page.value.pages; number++) {
    if (number === 1 || number === page.value.pages || Math.abs(number - page.value.pageNum) <= 1) {
      if (values.length && number - Number(values[values.length - 1]) > 1) values.push('…')
      values.push(number)
    }
  }
  return values
})
const pageSummary = computed(() => {
  if (!page.value.total) return '共 0 条'
  const start = (page.value.pageNum - 1) * page.value.pageSize + 1
  return `第 ${start}–${Math.min(page.value.pageNum * page.value.pageSize, page.value.total)} 条，共 ${page.value.total} 条`
})
const pageSizeModel = computed({
  get: () => String(pageSize.value),
  set: (value: string) => {
    pageSize.value = Number(value)
    void loadPage(1)
  },
})
const tabActive = ref(true)
const drawerMode = ref<DrawerMode | null>(null)
const currentPerson = ref<Person | null>(null)
const requestedPersonId = ref<number>()
const drawerLoading = ref(false)
const drawerError = ref('')
const form = reactive({ name: '', description: '' })
const initialFormState = ref(JSON.stringify(form))
const nameError = ref('')
const nameLength = computed(() => Array.from(form.name).length)
const saving = ref(false)
const deleteTargets = ref<Person[]>([])
const deleteConfirmed = ref(false)
const deleteError = ref('')
const deleting = ref(false)
const discardAction = ref<(() => void) | null>(null)
const toast = ref<{ message: string; error: boolean } | null>(null)
const drawer = ref<HTMLElement>()
const deleteDialog = ref<HTMLElement>()
const discardDialog = ref<HTMLElement>()
const isDirty = computed(
  () =>
    (drawerMode.value === 'create' || drawerMode.value === 'edit') &&
    JSON.stringify(form) !== initialFormState.value,
)
const drawerVisible = computed(() => tabActive.value && drawerMode.value !== null)
const modalVisible = computed(
  () => tabActive.value && (deleteTargets.value.length > 0 || !!discardAction.value),
)
let pageController: AbortController | undefined
let totalController: AbortController | undefined
let drawerController: AbortController | undefined
let toastTimer: number | undefined
let scrollState: { body: string; html: string } | undefined
let drawerTrigger: HTMLElement | null = null
let deleteTrigger: HTMLElement | null = null
let discardTrigger: HTMLElement | null = null

defineExpose({
  getCloseState: () => ({ dirty: isDirty.value, submitting: saving.value || deleting.value }),
})

onMounted(() => {
  void loadPage(1)
  void loadTotal()
  const id = Number(route.query.detail)
  if (Number.isInteger(id) && id > 0) void openDrawer('detail', id)
})
onActivated(() => {
  tabActive.value = true
})
onDeactivated(() => {
  tabActive.value = false
})
onBeforeUnmount(() => {
  pageController?.abort()
  totalController?.abort()
  drawerController?.abort()
  if (toastTimer) window.clearTimeout(toastTimer)
  restoreScroll()
})
watch([drawerVisible, modalVisible], ([hasDrawer, hasModal]) => {
  if (hasDrawer || hasModal) {
    if (!scrollState) {
      scrollState = {
        body: document.body.style.overflow,
        html: document.documentElement.style.overflow,
      }
      document.body.style.overflow = document.documentElement.style.overflow = 'hidden'
    }
  } else restoreScroll()
})
watch(drawerVisible, async (visible) => {
  await nextTick()
  if (visible) drawer.value?.focus()
  else if (tabActive.value) drawerTrigger?.focus()
})
watch(
  () => deleteTargets.value.length,
  async (count) => {
    await nextTick()
    if (count && tabActive.value) deleteDialog.value?.focus()
    else if (tabActive.value) deleteTrigger?.focus()
  },
)
watch(discardAction, async (action) => {
  await nextTick()
  if (action && tabActive.value) discardDialog.value?.focus()
  else if (tabActive.value) discardTrigger?.focus()
})

function restoreScroll() {
  if (!scrollState) return
  document.body.style.overflow = scrollState.body
  document.documentElement.style.overflow = scrollState.html
  scrollState = undefined
}
function handleDialogKey(event: KeyboardEvent, close: () => void) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    close()
  } else if (event.key === 'Tab') {
    const root = event.currentTarget as HTMLElement
    const controls = [
      ...root.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      ),
    ].filter((element) => element.getClientRects().length > 0)
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (!first) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
      event.preventDefault()
      last?.focus()
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === root)
    ) {
      event.preventDefault()
      first.focus()
    }
  }
}
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
  totalController?.abort()
  const controller = new AbortController()
  totalController = controller
  try {
    const result = await getPersonsPage(1, 1, '', controller.signal)
    if (!controller.signal.aborted) totalPersons.value = result.total
  } catch {
    if (!controller.signal.aborted) totalPersons.value = null
  }
}
async function loadPage(pageNum: number) {
  pageController?.abort()
  const controller = new AbortController()
  pageController = controller
  listLoading.value = true
  listError.value = ''
  jumpError.value = ''
  try {
    const result = await getPersonsPage(
      pageNum,
      pageSize.value,
      appliedName.value,
      controller.signal,
    )
    if (controller.signal.aborted) return
    page.value = result
    jumpPage.value = String(result.pageNum)
    result.rows.forEach((person) => {
      if (selectedPersons.value.has(person.id)) selectedPersons.value.set(person.id, person)
    })
    if (!appliedName.value) totalPersons.value = result.total
    if (!result.rows.length && pageNum > 1) await loadPage(Math.max(result.pages, 1))
  } catch (error) {
    if (!controller.signal.aborted)
      listError.value = messageOf(error, '人物档案读取失败，请稍后重试。')
  } finally {
    if (pageController === controller) listLoading.value = false
  }
}
function runSearch() {
  appliedName.value = searchName.value.trim()
  searchName.value = appliedName.value
  selectedPersons.value.clear()
  void loadPage(1)
}
function resetSearch() {
  pageSize.value = resolvePageSize(pageSizeValues, 20)
  searchName.value = ''
  runSearch()
}
function goToPage(next: number) {
  if (listLoading.value) return
  if (!Number.isInteger(next) || next < 1 || next > Math.max(page.value.pages, 1)) {
    jumpError.value = '请输入有效页码。'
    return
  }
  jumpError.value = ''
  if (next !== page.value.pageNum) void loadPage(next)
}
function toggleRow(person: Person, checked: boolean) {
  if (checked) selectedPersons.value.set(person.id, person)
  else selectedPersons.value.delete(person.id)
}
function toggleAll(checked: boolean) {
  page.value.rows.forEach((person) => toggleRow(person, checked))
}
function protectChanges(action: () => void) {
  if (saving.value || deleting.value || discardAction.value) return
  if (isDirty.value) {
    discardTrigger = document.activeElement as HTMLElement | null
    discardAction.value = action
  } else action()
}
function keepEditing() {
  discardAction.value = null
}
function discardChanges() {
  const action = discardAction.value
  discardAction.value = null
  action?.()
}
function closeDrawer() {
  protectChanges(finishCloseDrawer)
}
function finishCloseDrawer() {
  drawerController?.abort()
  relatedAnime.cancel()
  drawerMode.value = null
  currentPerson.value = null
  drawerError.value = ''
  form.name = form.description = ''
  initialFormState.value = JSON.stringify(form)
}
function requestDrawer(mode: DrawerMode, id?: number) {
  protectChanges(() => {
    void openDrawer(mode, id)
  })
}
async function openDrawer(mode: DrawerMode, id?: number) {
  if (saving.value || deleting.value) return
  if (drawerMode.value === null) drawerTrigger = document.activeElement as HTMLElement | null
  drawerController?.abort()
  relatedAnime.cancel()
  const controller = new AbortController()
  drawerController = controller
  drawerMode.value = mode
  requestedPersonId.value = id
  currentPerson.value = null
  drawerError.value = ''
  nameError.value = ''
  form.name = form.description = ''
  initialFormState.value = JSON.stringify(form)
  drawerLoading.value = mode !== 'create'
  if (mode === 'create' || id === undefined) return
  try {
    const person = await getPersonById(id, controller.signal)
    if (controller.signal.aborted) return
    currentPerson.value = person
    form.name = person.name
    form.description = person.description ?? ''
    initialFormState.value = JSON.stringify(form)
    if (mode === 'detail') void relatedAnime.open({ personId: person.id })
  } catch (error) {
    if (!controller.signal.aborted)
      drawerError.value = messageOf(error, '人物资料读取失败，请重试。')
  } finally {
    if (!controller.signal.aborted) drawerLoading.value = false
  }
}
function personRoles(anime: AnimePageItem) {
  return anime.persons
    ?.filter((person) => person.personId === currentPerson.value?.id)
    .map((person) => person.role).join('、') || '未注明职责'
}
function openRelatedAnime(anime: AnimePageItem) {
  finishCloseDrawer()
  if (navigateLinkedContent) void navigateLinkedContent('/admin/anime', anime.name)
  else void router.push({ path: '/admin/anime', query: { keyword: anime.name } })
}
async function savePerson() {
  if (saving.value || drawerLoading.value || (drawerMode.value === 'edit' && !currentPerson.value))
    return
  const name = form.name.trim()
  nameError.value = !name
    ? '请填写人物姓名。'
    : Array.from(name).length > 100
      ? '人物姓名不能超过 100 个字符。'
      : ''
  if (nameError.value) {
    document.getElementById('personName')?.focus()
    return
  }
  saving.value = true
  drawerError.value = ''
  const created = drawerMode.value === 'create'
  try {
    const payload = { name, description: form.description.trim() ? form.description : null }
    const saved = created
      ? await createPerson(payload)
      : await updatePerson({ id: currentPerson.value!.id, ...payload })
    if (selectedPersons.value.has(saved.id)) selectedPersons.value.set(saved.id, saved)
    initialFormState.value = JSON.stringify(form)
    drawerMode.value = null
    currentPerson.value = null
    if (created) searchName.value = appliedName.value = ''
    showToast(created ? '人物档案已添加。' : '人物资料已保存。')
    await Promise.all([loadPage(created ? 1 : page.value.pageNum), loadTotal()])
  } catch (error) {
    drawerError.value = messageOf(error, '人物保存失败，请稍后重试。')
  } finally {
    saving.value = false
  }
}
function openDelete(targets: Person[]) {
  if (!targets.length || saving.value || deleting.value) return
  protectChanges(() => {
    deleteTrigger = drawerMode.value ? drawerTrigger : document.activeElement as HTMLElement | null
    finishCloseDrawer()
    deleteTargets.value = [...targets]
    deleteConfirmed.value = false
    deleteError.value = ''
  })
}
function closeDelete() {
  if (!deleting.value) deleteTargets.value = []
}
async function confirmDelete() {
  if (deleting.value) return
  if (!deleteConfirmed.value) {
    deleteError.value = '请先勾选确认框，再删除人物。'
    return
  }
  deleting.value = true
  deleteError.value = ''
  try {
    const ids = deleteTargets.value.map((person) => person.id)
    await deletePersons(ids)
    ids.forEach((id) => selectedPersons.value.delete(id))
    deleteTargets.value = []
    showToast(`已删除 ${ids.length} 位人物。`)
    await Promise.all([loadPage(page.value.pageNum), loadTotal()])
  } catch (error) {
    deleteError.value = messageOf(error, '人物删除失败，请稍后重试。')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="persons-management">
    <section class="persons-hero">
      <div>
        <p class="persons-eyebrow">CONTENT ARCHIVE / PEOPLE INDEX</p>
        <h1>人物管理 <span>/ 创作人员档案</span></h1>
        <p>记录常用署名与人物简介。保留同名人物的独立档案，让每一份署名都能清晰辨认。</p>
      </div>
      <button class="primary-button" type="button" @click="requestDrawer('create')">
        <AdminIcon name="plus" />新增人物
      </button>
    </section>
    <p v-if="toast" class="persons-notice" :class="{ error: toast.error }" role="status">
      <AdminIcon name="check" />{{ toast.message }}
    </p>
    <section class="persons-stats" aria-label="人物统计">
      <article>
        <span><AdminIcon name="user" /></span>
        <div>
          <small>人物档案总数</small><strong>{{ totalPersons ?? '—' }}</strong>
        </div>
      </article>
      <article>
        <span><AdminIcon name="archive" /></span>
        <div>
          <small>当前页记录</small><strong>{{ listLoading ? '—' : page.rows.length }}</strong>
        </div>
      </article>
      <article>
        <span><AdminIcon name="check" /></span>
        <div>
          <small>已选人物</small><strong>{{ selectedPersons.size }}</strong>
        </div>
      </article>
    </section>
    <section class="persons-list-card" aria-labelledby="personsListTitle">
      <header class="persons-list-header">
        <div>
          <h2 id="personsListTitle">人物档案</h2>
          <p>按最近更新排序 · 同名人物可结合简介与详情区分</p>
        </div>
        <div>
          <span>共 {{ page.total }} 条</span
          ><button
            class="danger-button"
            type="button"
            :disabled="!selectedPersons.size || listLoading || deleting"
            @click="openDelete(selectedTargets)"
          >
            <AdminIcon name="delete" />删除所选 {{ selectedPersons.size || '' }}
          </button>
        </div>
      </header>
      <form class="persons-search-form" @submit.prevent="runSearch">
        <label class="persons-search"
          ><AdminIcon name="search-full" /><input
            v-model="searchName"
            type="text"
            aria-label="按人物姓名模糊搜索"
            placeholder="按姓名或常用署名搜索"
            autocomplete="off"
        /></label>
        <button class="secondary-button" type="submit">查询</button
        ><button class="ghost-button" type="button" @click="resetSearch">重置</button>
        <span>同名可保留，档案不自动合并。</span>
      </form>
      <div v-if="selectedPersons.size" class="persons-selection">
        <span>已选 {{ selectedPersons.size }} 位人物 · 跨页保留选择</span
        ><button type="button" @click="selectedPersons.clear()">清空选择</button>
      </div>
      <div class="persons-table-scroll">
        <table v-if="!listLoading && !listError && page.rows.length" class="persons-table">
          <thead>
            <tr>
              <th class="persons-check-cell">
                <input
                  type="checkbox"
                  :checked="allVisibleSelected"
                  aria-label="选择当前页全部人物"
                  @change="toggleAll(($event.target as HTMLInputElement).checked)"
                />
              </th>
              <th class="persons-name-cell">姓名 / 常用署名</th>
              <th>人物简介</th>
              <th class="persons-actions-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="person in page.rows"
              :key="person.id"
              :class="{ selected: selectedPersons.has(person.id) }"
            >
              <td>
                <input
                  type="checkbox"
                  :checked="selectedPersons.has(person.id)"
                  :aria-label="`选择人物 ${person.name}`"
                  @change="toggleRow(person, ($event.target as HTMLInputElement).checked)"
                />
              </td>
              <td>
                <button
                  class="persons-name"
                  type="button"
                  @click="requestDrawer('detail', person.id)"
                >
                  {{ person.name }}
                </button>
              </td>
              <td><ArchiveDescription :text="person.description" /></td>
              <td>
                <div class="persons-row-actions">
                  <button
                    type="button"
                    title="查看详情"
                    :aria-label="`查看人物 ${person.name}详情`"
                    @click="requestDrawer('detail', person.id)"
                  >
                    <AdminIcon name="view" />
                  </button>
                  <button
                    type="button"
                    title="编辑"
                    :aria-label="`编辑人物 ${person.name}`"
                    @click="requestDrawer('edit', person.id)"
                  >
                    <AdminIcon name="edit" />
                  </button>
                  <button
                    type="button"
                    class="danger"
                    title="删除"
                    :aria-label="`删除人物 ${person.name}`"
                    @click="openDelete([person])"
                  >
                    <AdminIcon name="delete" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-else class="persons-list-state" :class="{ error: listError }" role="status">
          <AdminIcon :name="listError ? 'info' : 'user'" />
          <h3>
            {{
              listLoading
                ? '正在读取人物档案…'
                : listError
                  ? '人物档案读取失败'
                  : appliedName
                    ? '没有匹配的人物'
                    : '暂无人物档案'
            }}
          </h3>
          <p>
            {{
              listError ||
              (appliedName
                ? '请尝试其他姓名，或清空查询条件。'
                : '新增人物后，将在此处显示独立档案。')
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
            v-else-if="!listLoading"
            class="secondary-button"
            type="button"
            @click="appliedName ? resetSearch() : requestDrawer('create')"
          >
            {{ appliedName ? '清空查询条件' : '新增人物' }}
          </button>
        </div>
      </div>
      <footer class="persons-pagination">
        <span>{{ pageSummary }}</span>
        <div class="persons-page-controls">
          <ArchiveSelect
            id="personsPageSize"
            v-model="pageSizeModel"
            :options="pageSizeOptions"
            placeholder="每页条数"
            label="人物每页条数"
            :show-placeholder-option="false"
            placement="top"
          />
          <button
            type="button"
            aria-label="上一页人物"
            :disabled="listLoading || page.pageNum <= 1"
            @click="goToPage(page.pageNum - 1)"
          >
            <AdminIcon name="left" />
          </button>
          <template v-for="(number, index) in pageNumbers" :key="index"
            ><button
              v-if="typeof number === 'number'"
              type="button"
              :class="{ active: number === page.pageNum }"
              :aria-label="`第 ${number} 页人物`"
              :aria-current="number === page.pageNum ? 'page' : undefined"
              :disabled="listLoading"
              @click="goToPage(number)"
            >
              {{ number }}</button
            ><span v-else>…</span></template
          >
          <button
            type="button"
            aria-label="下一页人物"
            :disabled="listLoading || page.pageNum >= page.pages"
            @click="goToPage(page.pageNum + 1)"
          >
            <AdminIcon name="right" />
          </button>
          <label for="personsJumpPage">跳至</label
          ><input
            id="personsJumpPage"
            v-model="jumpPage"
            type="text"
            inputmode="numeric"
            aria-label="跳转人物页码"
            :aria-invalid="!!jumpError"
            aria-describedby="personsJumpError"
            @keydown.enter.prevent="goToPage(Number(jumpPage))"
            @blur="goToPage(Number(jumpPage))"
          /><span>页</span>
        </div>
      </footer>
      <p
        v-if="jumpError"
        id="personsJumpError"
        class="persons-error persons-jump-error"
        role="alert"
      >
        {{ jumpError }}
      </p>
    </section>
    <p class="persons-footnote">
      <AdminIcon
        name="info"
      />人物被作品引用时不能删除；批量操作中任一人物被引用，整批均不删除。删除人物不会删除作品或自动解除关联。
    </p>
    <Teleport to="body">
      <div v-if="drawerVisible" class="persons-drawer-layer" @click.self="closeDrawer">
        <aside
          ref="drawer"
          class="persons-drawer"
          :class="{ 'persons-detail-drawer': drawerMode === 'detail' }"
          role="dialog"
          aria-modal="true"
          aria-labelledby="personDrawerTitle"
          tabindex="-1"
          @keydown="handleDialogKey($event, closeDrawer)"
        >
          <header class="persons-drawer-header">
            <div>
              <h2 id="personDrawerTitle">
                {{
                  drawerMode === 'create'
                    ? '新增人物'
                    : drawerMode === 'edit'
                      ? '编辑人物'
                      : '人物详情'
                }}
              </h2>
              <p>
                {{
                  drawerMode === 'create'
                    ? '在人物档案中创建一条记录'
                    : currentPerson?.name || '人物档案'
                }}
              </p>
            </div>
            <button
              class="persons-icon-button"
              type="button"
              aria-label="关闭人物抽屉"
              :disabled="saving"
              @click="closeDrawer"
            >
              <AdminIcon name="close" />
            </button>
          </header>
          <div class="persons-drawer-body">
            <div v-if="drawerLoading" class="persons-list-state" role="status">
              正在读取人物资料…
            </div>
            <div
              v-else-if="drawerError && !currentPerson && drawerMode !== 'create'"
              class="persons-list-state error"
              role="alert"
            >
              <h3>人物资料读取失败</h3>
              <p>{{ drawerError }}</p>
              <button
                class="secondary-button"
                type="button"
                @click="openDrawer(drawerMode!, requestedPersonId)"
              >
                重新读取
              </button>
            </div>
            <section v-else-if="drawerMode === 'detail' && currentPerson" aria-label="人物完整资料">
              <div class="persons-detail-heading">
                <span>人物名称</span>
                <strong>{{ currentPerson.name }}</strong>
              </div>
              <h4 class="persons-detail-label">人物简介</h4>
              <div class="persons-detail-description">
                {{ currentPerson.description?.trim() ? currentPerson.description : '暂无简介' }}
              </div>
              <RelatedAnimeList
                :model="relatedAnime"
                title="关联内容与负责职责"
                description="关联动画及该人物的全部职责；点击名称搜索此动画"
                :role-label="personRoles"
                @select="openRelatedAnime"
              />
            </section>
            <form v-else id="personEditorForm" novalidate @submit.prevent="savePerson">
              <fieldset :disabled="saving">
                <div class="persons-field" :class="{ invalid: nameError }">
                  <label for="personName"
                    ><span>姓名 / 常用署名 <b>*</b></span
                    ><small>{{ nameLength }} / 100</small></label
                  ><input
                    id="personName"
                    v-model="form.name"
                    autocomplete="off"
                    placeholder="请输入常用署名或笔名"
                    :aria-invalid="!!nameError"
                    aria-describedby="personNameError personNameHint"
                    @input="nameError = ''"
                  />
                  <p v-if="nameError" id="personNameError" class="persons-error" role="alert">
                    {{ nameError }}
                  </p>
                  <p id="personNameHint" class="persons-hint">
                    最多 100 个字符，保存时去除首尾空格。允许与已有档案同名。
                  </p>
                </div>
                <div class="persons-field">
                  <label for="personDescription">人物简介 <small>选填</small></label
                  ><textarea
                    id="personDescription"
                    v-model="form.description"
                    rows="8"
                    placeholder="可补充创作经历、参与领域或有助于区分同名人物的信息。"
                    aria-describedby="personDescriptionHint"
                  ></textarea>
                  <p id="personDescriptionHint" class="persons-hint">
                    可留空；编辑时清空此项将移除原简介。
                  </p>
                </div>
              </fieldset>
              <p class="persons-interface-note">
                <AdminIcon name="info" /><span
                  >同名人物是独立档案。建议填写易于辨认的简介，选择人员时同时核对姓名、ID
                  与简介。</span
                >
              </p>
              <p v-if="drawerError" class="persons-error" role="alert">{{ drawerError }}</p>
            </form>
          </div>
          <footer class="persons-drawer-footer">
            <span>{{ drawerMode === 'detail' ? '创作人员档案' : '姓名必填，简介可选。' }}</span>
            <div>
              <button
                class="secondary-button"
                type="button"
                :disabled="saving"
                @click="closeDrawer"
              >
                {{ drawerMode === 'detail' ? '关闭' : '取消' }}</button
              ><button
                v-if="drawerMode === 'detail'"
                class="primary-button"
                type="button"
                :disabled="!currentPerson || drawerLoading"
                @click="requestDrawer('edit', currentPerson!.id)"
              >
                <AdminIcon name="edit" />编辑人物</button
              ><button
                v-else
                class="primary-button"
                type="submit"
                form="personEditorForm"
                :disabled="saving || drawerLoading || (drawerMode === 'edit' && !currentPerson)"
              >
                {{ saving ? '保存中…' : '保存人物' }}
              </button>
            </div>
          </footer>
        </aside>
      </div>
      <div
        v-if="tabActive && deleteTargets.length"
        class="persons-modal-layer"
        @click.self="closeDelete"
      >
        <section
          ref="deleteDialog"
          class="persons-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="personDeleteTitle"
          tabindex="-1"
          @keydown="handleDialogKey($event, closeDelete)"
        >
          <span class="persons-dialog-mark"><AdminIcon name="delete" /></span>
          <h2 id="personDeleteTitle">确认删除人物？</h2>
          <p>请核对姓名与 ID。删除只涉及人物档案，不会自动解除作品引用，也不会删除作品。</p>
          <ul class="persons-delete-targets">
            <li v-for="person in deleteTargets" :key="person.id">
              <strong>{{ person.name }}</strong
              ><span>ID · {{ person.id }}</span>
            </li>
          </ul>
          <label class="persons-delete-check"
            ><input
              v-model="deleteConfirmed"
              type="checkbox"
              :disabled="deleting"
              @change="deleteError = ''"
            /><span>我已核对所选人物的姓名与 ID。</span></label
          >
          <p v-if="deleteError" class="persons-error" role="alert">{{ deleteError }}</p>
          <p class="persons-danger-note">
            <AdminIcon name="info" /><span
              >如任一所选人物仍被作品引用，本次整批删除将被拒绝；请先在对应作品中解除关联。</span
            >
          </p>
          <div class="persons-dialog-actions">
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
        </section>
      </div>
      <div v-if="tabActive && discardAction" class="persons-modal-layer persons-discard-layer">
        <section
          ref="discardDialog"
          class="persons-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="personDiscardTitle"
          tabindex="-1"
          @keydown="handleDialogKey($event, keepEditing)"
        >
          <span class="persons-dialog-mark violet"><AdminIcon name="edit" /></span>
          <h2 id="personDiscardTitle">放弃未保存的修改？</h2>
          <p>当前人物资料尚未保存。放弃后会清空本次填写的内容，已有档案保持不变。</p>
          <div class="persons-dialog-actions">
            <button class="secondary-button" type="button" @click="keepEditing">继续编辑</button
            ><button class="primary-button" type="button" @click="discardChanges">放弃修改</button>
          </div>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.persons-management {
  width: min(1220px, 100%);
  margin: 0 auto;
}
.persons-hero {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  min-height: 150px;
  padding: 26px 30px;
  overflow: hidden;
  color: var(--ink);
  background: linear-gradient(
    112deg,
    color-mix(in srgb, var(--surface-solid) 90%, transparent),
    color-mix(in srgb, var(--surface-muted) 82%, transparent)
  );
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-soft);
}
.persons-hero::before {
  position: absolute;
  top: -54px;
  right: 13%;
  width: 208px;
  height: 208px;
  border: 1px solid rgba(117, 103, 170, 0.15);
  border-radius: 43% 57% 63% 37%;
  transform: rotate(28deg);
  content: '';
  pointer-events: none;
}
.persons-hero > div {
  position: relative;
  z-index: 1;
}
.persons-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 9px;
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.16em;
}
.persons-eyebrow::before {
  width: 17px;
  height: 1px;
  content: '';
  background: currentColor;
}
.persons-hero h1 {
  margin: 0;
  font: 700 clamp(23px, 3vw, 30px) / 1.25 var(--font-display);
  letter-spacing: -0.035em;
}
.persons-hero h1 span {
  color: var(--ink-faint);
  font: 500 12px var(--font-body);
  letter-spacing: 0;
}
.persons-hero > div > p:last-child {
  max-width: 610px;
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
}
.persons-hero > button {
  flex: 0 0 auto;
  position: relative;
}
.persons-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
  margin-top: 16px;
}
.persons-stats article {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 17px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
}
.persons-stats article > span {
  display: grid;
  width: 35px;
  height: 35px;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 11px;
  flex: 0 0 auto;
}
.persons-stats article:nth-child(2) > span {
  color: var(--cyan);
  background: var(--cyan-soft);
}
.persons-stats article:nth-child(3) > span {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.persons-stats svg {
  width: 19px;
  height: 19px;
}
.persons-stats small,
.persons-stats strong {
  display: block;
}
.persons-stats small {
  color: var(--ink-faint);
  font-size: 10px;
}
.persons-stats strong {
  margin-top: 1px;
  font: 700 21px/1.3 var(--font-display);
}
.persons-list-card {
  margin-top: 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow-soft);
}
.persons-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 17px 19px;
  border-bottom: 1px solid var(--line);
}
.persons-list-header h2 {
  margin: 0;
  font: 700 15px var(--font-display);
}
.persons-list-header p {
  margin: 5px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.persons-list-header > div:last-child {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}
.persons-list-header > div > span {
  color: var(--ink-faint);
  font-size: 10px;
}
.persons-list-header .danger-button {
  min-height: 34px;
  padding: 0 11px;
  border-radius: 9px;
  font-size: 10px;
}
.persons-search-form {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line);
}
.persons-search {
  display: flex;
  width: min(365px, 100%);
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  color: var(--ink-faint);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 9px;
}
.persons-search svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}
.persons-search:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.persons-search input {
  min-width: 0;
  width: 100%;
  height: 38px;
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
  font-size: 11px;
}
.persons-search-form > button {
  min-height: 38px;
  font-size: 11px;
}
.persons-search-form > span {
  margin-left: auto;
  color: var(--ink-faint);
  font-size: 10px;
}
.persons-selection {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 18px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  font-size: 10px;
}
.persons-selection button {
  padding: 4px 7px;
  color: var(--accent-strong);
  background: transparent;
  font-size: 11px;
}
.persons-table-scroll {
  overflow-x: auto;
  border-radius: 0 0 12px 12px;
}
.persons-table {
  width: 100%;
  min-width: 790px;
  table-layout: fixed;
  border-collapse: collapse;
  text-align: left;
}
.persons-table th {
  padding: 11px 13px;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}
.persons-table td {
  padding: 13px;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--line);
  font-size: 11px;
  vertical-align: middle;
}
.persons-table tr:last-child td {
  border-bottom: 0;
}
.persons-table tbody tr:hover {
  background: var(--surface-hover);
}
.persons-table tr.selected {
  background: color-mix(in srgb, var(--accent-soft) 25%, var(--surface-solid));
}
.persons-check-cell {
  width: 40px;
}
.persons-name-cell {
  width: 20%;
}
.persons-actions-cell {
  width: 112px;
}
.persons-name {
  padding: 2px 0;
  color: var(--ink);
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  overflow-wrap: anywhere;
}
.persons-name:hover {
  color: var(--accent-strong);
}
.persons-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.persons-row-actions button,
.persons-icon-button {
  display: grid;
  width: 29px;
  height: 29px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border-radius: 7px;
}
.persons-row-actions svg,
.persons-icon-button svg {
  width: 15px;
  height: 15px;
}
.persons-row-actions button:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.persons-row-actions button.danger:hover {
  color: var(--danger);
}
.persons-list-state {
  display: grid;
  min-height: 260px;
  justify-items: center;
  align-content: center;
  padding: 30px 20px;
  color: var(--ink-faint);
  text-align: center;
  font-size: 12px;
}
.persons-list-state > svg {
  width: 36px;
  height: 36px;
  color: var(--violet);
}
.persons-list-state h3 {
  margin: 12px 0 0;
  color: var(--ink);
  font: 700 16px var(--font-display);
}
.persons-list-state p {
  max-width: 420px;
  margin: 7px 0 15px;
  color: var(--ink-soft);
  line-height: 1.8;
}
.persons-list-state.error,
.persons-error {
  color: var(--danger);
}
.persons-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  color: var(--ink-faint);
}
.persons-page-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.persons-page-controls :deep(.archive-select) {
  width: 92px;
}
.persons-page-controls :deep(.archive-select-trigger) {
  height: 32px;
  font-size: 10px;
  white-space: nowrap;
}
.persons-page-controls :deep(.archive-select-option) {
  font-size: 10px;
}
.persons-page-controls button {
  display: grid;
  min-width: 30px;
  height: 30px;
  place-items: center;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 7px;
  font-size: 10px;
}
.persons-page-controls button.active {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.persons-page-controls svg {
  width: 12px;
  height: 12px;
}
.persons-page-controls input {
  width: 42px;
  height: 30px;
  padding: 0 6px;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 7px;
  text-align: center;
  font-size: 10px;
}
.persons-jump-error {
  padding: 0 18px 10px;
  margin: 0;
}
.persons-footnote {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 13px 3px 0;
  color: var(--ink-faint);
  font-size: 10px;
  line-height: 1.8;
}
.persons-footnote svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  margin-top: 2px;
}
.persons-notice {
  display: flex;
  gap: 8px;
  padding: 12px;
  margin: 16px 0 0;
  color: var(--success);
  background: var(--success-soft);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 11px;
}
.persons-notice svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}
.persons-notice.error {
  color: var(--danger);
  background: var(--danger-soft);
}
.persons-drawer-layer,
.persons-modal-layer {
  position: fixed;
  inset: 0;
  background: rgba(18, 17, 30, 0.42);
  backdrop-filter: blur(2px);
  overscroll-behavior: contain;
  animation: persons-fade 0.16s ease both;
}
.persons-drawer-layer {
  z-index: 225;
  display: flex;
  justify-content: flex-end;
}
.persons-drawer {
  display: flex;
  width: min(560px, 100%);
  height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  color: var(--ink);
  background: var(--surface-solid);
  box-shadow: -24px 0 60px rgba(20, 17, 40, 0.2);
  animation: persons-slide 0.2s ease both;
}
.persons-drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 23px 24px 18px;
  border-bottom: 1px solid var(--line);
}
.persons-drawer-header h2 {
  margin: 0;
  font: 700 20px/1.4 var(--font-display);
}
.persons-drawer-header p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.persons-drawer-header .persons-icon-button {
  width: 32px;
  height: 32px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
}
.persons-drawer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 24px;
  overscroll-behavior: contain;
}
.persons-drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 24px;
  background: var(--surface-solid);
  border-top: 1px solid var(--line);
}
.persons-drawer-footer > span {
  color: var(--ink-faint);
  font-size: 10px;
}
.persons-drawer-footer > div {
  display: flex;
  gap: 8px;
}
.persons-drawer-footer button {
  min-height: 38px;
  font-size: 11px;
}
.persons-drawer fieldset {
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
}
.persons-field {
  display: grid;
  gap: 8px;
  margin-bottom: 20px;
}
.persons-field label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 650;
}
.persons-field small {
  color: var(--ink-faint);
  font-size: 10px;
  font-weight: 400;
}
.persons-field b {
  color: var(--accent-strong);
}
.persons-field input,
.persons-field textarea {
  width: 100%;
  padding: 11px 12px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  outline: 0;
  font: 12px var(--font-body);
}
.persons-field textarea {
  resize: vertical;
  min-height: 150px;
  line-height: 1.8;
}
.persons-field input:focus,
.persons-field textarea:focus {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.persons-field.invalid input {
  border-color: var(--danger);
}
.persons-hint {
  margin: 0;
  color: var(--ink-faint);
  font-size: 10px;
  line-height: 1.8;
}
.persons-error {
  margin: 0;
  font-size: 11px;
  line-height: 1.8;
}
.persons-interface-note {
  display: flex;
  gap: 8px;
  padding: 12px;
  color: var(--violet);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.8;
}
.persons-interface-note svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  margin-top: 2px;
}
.persons-detail-heading {
  padding: 11px 12px;
  margin-bottom: 15px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.persons-detail-heading > span {
  display: block;
  color: var(--ink-faint);
  font-size: 10px;
}
.persons-detail-heading strong {
  display: block;
  margin-top: 4px;
  color: var(--ink);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.persons-detail-label {
  margin: 0 0 6px;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 700;
}
.persons-detail-description {
  min-height: 70px;
  padding: 12px;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 11px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.persons-association {
  padding: 15px;
  margin-top: 18px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.persons-association header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--line);
}
.persons-association h3 {
  margin: 0;
  font: 700 14px var(--font-display);
}
.persons-association header p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.persons-association-state {
  padding: 22px 5px;
  margin: 0;
  color: var(--ink-faint);
  font-size: 11px;
  text-align: center;
}
.persons-detail-drawer {
  width: min(560px, 94vw);
  background: var(--canvas);
}
.persons-detail-drawer .persons-drawer-header {
  flex: 0 0 auto;
  gap: 12px;
  padding: 21px 23px 16px;
  background: var(--surface);
}
.persons-detail-drawer .persons-drawer-header h2 {
  font: 700 19px var(--font-display);
}
.persons-detail-drawer .persons-drawer-header p {
  font-size: 11px;
}
.persons-detail-drawer .persons-icon-button {
  color: var(--ink-soft);
  border-radius: 9px;
}
.persons-detail-drawer .persons-icon-button:hover {
  color: var(--accent);
  background: var(--accent-soft);
}
.persons-detail-drawer .persons-drawer-body {
  padding: 19px 23px;
}
.persons-detail-drawer .persons-drawer-footer {
  flex: 0 0 auto;
  gap: 9px;
  padding: 13px 23px;
  background: var(--surface);
}
.persons-detail-drawer .persons-drawer-footer button {
  min-height: 36px;
  flex: 0 0 auto;
}
.persons-modal-layer {
  z-index: 300;
  display: grid;
  place-items: center;
  padding: 20px;
}
.persons-discard-layer {
  z-index: 320;
}
.persons-dialog {
  width: min(460px, 100%);
  max-height: calc(100dvh - 40px);
  padding: 24px;
  overflow-y: auto;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow);
  overscroll-behavior: contain;
}
.persons-dialog-mark {
  display: grid;
  width: 41px;
  height: 41px;
  place-items: center;
  margin-bottom: 15px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 14px;
}
.persons-dialog-mark.violet {
  color: var(--violet);
  background: var(--violet-soft);
}
.persons-dialog-mark svg {
  width: 19px;
  height: 19px;
}
.persons-dialog h2 {
  margin: 0 0 8px;
  font: 700 19px/1.4 var(--font-display);
}
.persons-dialog > p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.85;
}
.persons-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
.persons-dialog-actions button {
  min-height: 38px;
  font-size: 11px;
}
.persons-delete-targets {
  display: grid;
  gap: 7px;
  max-height: 160px;
  padding: 11px;
  margin: 15px 0;
  overflow-y: auto;
  list-style: none;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.persons-delete-targets li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
}
.persons-delete-targets span {
  color: var(--ink-faint);
  white-space: nowrap;
  font-size: 10px;
}
.persons-delete-check {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 14px 0 8px;
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.8;
}
.persons-delete-check input {
  flex: 0 0 auto;
}
.persons-dialog > .persons-error {
  color: var(--danger);
}
.persons-dialog > .persons-danger-note {
  display: flex;
  gap: 7px;
  padding: 10px 11px;
  margin-top: 10px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 9px;
  font-size: 10px;
}
.persons-danger-note svg {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  margin-top: 2px;
}
.persons-management input[type='checkbox'],
.persons-dialog input[type='checkbox'] {
  width: 14px;
  height: 14px;
  margin: 0;
  accent-color: var(--accent);
  vertical-align: middle;
}
.persons-management button:disabled,
.persons-drawer button:disabled,
.persons-dialog button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
@keyframes persons-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes persons-slide {
  from {
    transform: translateX(24px);
    opacity: 0.7;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .persons-drawer-layer,
  .persons-drawer,
  .persons-modal-layer {
    animation: none;
  }
}
@media (max-width: 620px) {
  .persons-hero {
    min-height: 0;
    padding: 20px;
    align-items: flex-start;
    flex-direction: column;
    border-radius: 18px;
    gap: 17px;
  }
  .persons-hero > button {
    width: 100%;
  }
  .persons-stats {
    gap: 7px;
  }
  .persons-stats article {
    padding: 11px 10px;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .persons-stats small {
    font-size: 9px;
  }
  .persons-stats strong {
    font-size: 18px;
  }
  .persons-list-header {
    align-items: flex-start;
    flex-direction: column;
    padding: 15px;
  }
  .persons-list-header > div:last-child {
    width: 100%;
    justify-content: space-between;
  }
  .persons-search-form {
    flex-wrap: wrap;
    padding: 12px;
  }
  .persons-search {
    width: 100%;
  }
  .persons-search-form > button {
    flex: 1;
  }
  .persons-search-form > span {
    margin-left: 0;
  }
  .persons-pagination {
    flex-direction: column;
    align-items: flex-start;
    padding: 12px;
  }
  .persons-drawer-header {
    padding: 20px 18px 16px;
  }
  .persons-drawer-body {
    padding: 19px 18px;
  }
  .persons-drawer-footer {
    align-items: flex-start;
    flex-direction: column;
    padding: 13px 18px;
    gap: 9px;
  }
  .persons-drawer-footer > div {
    width: 100%;
  }
  .persons-drawer-footer button {
    flex: 1;
  }
  .persons-dialog {
    padding: 22px 19px;
  }
}
@media (max-width: 700px) {
  .persons-detail-drawer { width: 100vw; }
  .persons-detail-drawer .persons-drawer-header,
  .persons-detail-drawer .persons-drawer-body,
  .persons-detail-drawer .persons-drawer-footer {
    padding-right: 15px;
    padding-left: 15px;
  }
  .persons-detail-drawer .persons-drawer-footer {
    align-items: stretch;
    flex-direction: column;
  }
  .persons-detail-drawer .persons-drawer-footer > div { justify-content: flex-end; }
}
</style>
