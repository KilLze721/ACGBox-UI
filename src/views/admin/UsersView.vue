<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import {
  createUser,
  deleteUser,
  getUserById,
  getUsersPage,
  resetUserPassword,
  updateUser,
} from '@/api/users'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import type {
  PageResult,
  UserAccount,
  UserAccountDTO,
  UserAccountPageQuery,
  UserRole,
} from '@/types/api'

type EditableField = 'username' | 'email' | 'role' | 'enabled'
const roleNames: Record<UserRole, string> = { ADMIN: '管理员', EDITOR: '编辑', USER: '用户' }
const roleValues: UserRole[] = ['ADMIN', 'EDITOR', 'USER']
const roleOptions = roleValues.map((role, index) => ({ id: index + 1, name: roleNames[role] }))
const editableRoleOptions = roleOptions.filter((option) => option.id !== 1)
const enabledOptions = [
  { id: 1, name: '已启用' },
  { id: 2, name: '已停用' },
]
const pageSizeOptions = [10, 20, 50, 100].map((id) => ({ id, name: `${id} 条` }))
const editableFields: { key: EditableField; label: string }[] = [
  { key: 'username', label: '用户名' },
  { key: 'email', label: '邮箱' },
  { key: 'role', label: '角色' },
  { key: 'enabled', label: '账号状态' },
]

const filters = reactive({ username: '', email: '', role: '' as UserRole | '', enabled: '' })
const appliedFilters = ref<Omit<UserAccountPageQuery, 'pageNum' | 'pageSize'>>({})
const page = ref<PageResult<UserAccount>>({
  pageNum: 1,
  pageSize: 20,
  total: 0,
  pages: 0,
  rows: [],
})
const pageSize = ref(20)
const requestedPage = ref(1)
const jumpPage = ref('1')
const loading = ref(true)
const listError = ref('')
const stats = ref<{ total: number; enabled: number; disabled: number } | null>(null)
const statsError = ref('')
const drawerMode = ref<'create' | 'detail' | null>(null)
const currentAccount = ref<UserAccount | null>(null)
const editingField = ref<EditableField | null>(null)
const drawerLoading = ref(false)
const drawerError = ref('')
const saving = ref(false)
const form = reactive({
  username: '',
  email: '',
  password: '',
  role: 'USER' as UserRole,
  enabled: true,
  currentPassword: '',
})
const errors = reactive<Record<string, string>>({})
const emailInput = ref<HTMLInputElement>()
const actionMode = ref<'reset' | 'delete' | null>(null)
const actionTarget = ref<UserAccount | null>(null)
const actionForm = reactive({ currentPassword: '', newPassword: '' })
const actionErrors = reactive<Record<string, string>>({})
const actionError = ref('')
const actionSubmitting = ref(false)
const tabActive = ref(true)
const drawerLayer = ref<HTMLElement>()
const actionLayer = ref<HTMLElement>()
const toast = ref('')
let drawerOpener: HTMLElement | null = null
let actionOpener: HTMLElement | null = null
let pageController: AbortController | undefined
let statsController: AbortController | undefined
let drawerController: AbortController | undefined
let toastTimer: number | undefined
let previousBodyOverflow: string | undefined
let previousHtmlOverflow: string | undefined

const busy = computed(() => saving.value || actionSubmitting.value)
const hasFilters = computed(() => Object.keys(appliedFilters.value).length > 0)
const emailChanged = computed(() => form.email.trim() !== (currentAccount.value?.email || ''))
const firstResult = computed(() =>
  page.value.total ? (page.value.pageNum - 1) * page.value.pageSize + 1 : 0,
)
const lastResult = computed(() =>
  Math.min(page.value.pageNum * page.value.pageSize, page.value.total),
)
const pageNumbers = computed(() => {
  const pages = page.value.pages
  const first = Math.max(1, Math.min(page.value.pageNum - 2, pages - 4))
  return Array.from({ length: Math.min(5, pages) }, (_, index) => first + index)
})
const filterRoleModel = computed({
  get: () => (filters.role ? String(roleValues.indexOf(filters.role) + 1) : ''),
  set: (value: string) => {
    filters.role = roleValues[Number(value) - 1] || ''
  },
})
const filterEnabledModel = computed({
  get: () => (filters.enabled === '' ? '' : filters.enabled === 'true' ? '1' : '2'),
  set: (value: string) => {
    filters.enabled = value === '' ? '' : value === '1' ? 'true' : 'false'
  },
})
const formRoleModel = computed({
  get: () => String(roleValues.indexOf(form.role) + 1),
  set: (value: string) => {
    form.role = roleValues[Number(value) - 1] || 'USER'
  },
})
const pageSizeModel = computed({
  get: () => String(pageSize.value),
  set: (value: string) => {
    pageSize.value = Number(value)
    void loadUsers(1)
  },
})
const isDirty = computed(() => {
  if (drawerMode.value === 'create')
    return !!(form.username || form.email || form.password || form.role !== 'USER' || !form.enabled)
  if (editingField.value && currentAccount.value) {
    const field = editingField.value
    if (form[field] !== (currentAccount.value[field] ?? '')) return true
  }
  return !!(form.currentPassword || actionForm.currentPassword || actionForm.newPassword)
})
defineExpose({ getCloseState: () => ({ dirty: isDirty.value, submitting: busy.value }) })

onMounted(() => {
  void loadUsers()
  void loadStats()
})
onActivated(() => {
  tabActive.value = true
  syncScroll()
})
onDeactivated(() => {
  tabActive.value = false
  unlockScroll()
})
onBeforeUnmount(() => {
  pageController?.abort()
  statsController?.abort()
  drawerController?.abort()
  if (toastTimer) window.clearTimeout(toastTimer)
  clearPasswords()
  unlockScroll()
})
watch([drawerMode, actionMode], syncScroll)
watch([drawerMode, actionMode, editingField, drawerLoading, tabActive], async () => {
  await nextTick()
  const layer = actionMode.value ? actionLayer.value : drawerLayer.value
  if (!layer) return
  const editor = editingField.value ? layer.querySelector('.inline-editor') : null
  const target = editor || layer
  if (editor || !layer.contains(document.activeElement))
    target.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus()
})
watch(
  () => form.email,
  () => {
    if (editingField.value === 'email' && !emailChanged.value) {
      form.currentPassword = ''
      delete errors.currentPassword
    }
  },
)
function syncScroll() {
  if (!tabActive.value) return
  if (drawerMode.value || actionMode.value) {
    if (previousBodyOverflow !== undefined) return
    previousBodyOverflow = document.body.style.overflow
    previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
  } else unlockScroll()
}
function unlockScroll() {
  if (previousBodyOverflow === undefined) return
  document.body.style.overflow = previousBodyOverflow
  document.documentElement.style.overflow = previousHtmlOverflow || ''
  previousBodyOverflow = undefined
  previousHtmlOverflow = undefined
}
function trapFocus(event: KeyboardEvent) {
  const controls = (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
    'input:not(:disabled), button:not(:disabled), [tabindex="0"]',
  )
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
    event.preventDefault()
    const target = event.shiftKey ? last : first
    target?.focus()
  }
}
function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
function showToast(message: string) {
  toast.value = message
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => {
    toast.value = ''
  }, 5000)
}
function clearErrors(target: Record<string, string>) {
  Object.keys(target).forEach((key) => {
    delete target[key]
  })
}
function clearPasswords() {
  form.password = ''
  form.currentPassword = ''
  actionForm.currentPassword = ''
  actionForm.newPassword = ''
}
function fillForm(account?: UserAccount) {
  Object.assign(form, {
    username: account?.username || '',
    email: account?.email || '',
    password: '',
    role: account?.role || 'USER',
    enabled: account?.enabled ?? true,
    currentPassword: '',
  })
  clearErrors(errors)
}
async function loadUsers(pageNum = requestedPage.value) {
  pageController?.abort()
  const controller = new AbortController()
  pageController = controller
  requestedPage.value = pageNum
  loading.value = true
  listError.value = ''
  try {
    const result = await getUsersPage(
      { pageNum, pageSize: pageSize.value, ...appliedFilters.value },
      controller.signal,
    )
    if (controller.signal.aborted) return
    if (pageNum > 1 && pageNum > Math.max(1, result.pages)) {
      await loadUsers(Math.max(1, result.pages))
      return
    }
    page.value = result
    jumpPage.value = String(result.pageNum)
  } catch (error) {
    if (!controller.signal.aborted) listError.value = messageOf(error, '账号读取失败，请稍后重试。')
  } finally {
    if (pageController === controller) loading.value = false
  }
}
async function loadStats() {
  statsController?.abort()
  const controller = new AbortController()
  statsController = controller
  statsError.value = ''
  try {
    const [enabled, disabled] = await Promise.all([
      getUsersPage({ pageNum: 1, pageSize: 1, enabled: true }, controller.signal),
      getUsersPage({ pageNum: 1, pageSize: 1, enabled: false }, controller.signal),
    ])
    if (!controller.signal.aborted)
      stats.value = {
        total: enabled.total + disabled.total,
        enabled: enabled.total,
        disabled: disabled.total,
      }
  } catch (error) {
    if (!controller.signal.aborted) {
      stats.value = null
      statsError.value = messageOf(error, '账号概况读取失败。')
    }
  }
}
function runSearch() {
  filters.username = filters.username.trim()
  filters.email = filters.email.trim()
  appliedFilters.value = {
    ...(filters.username ? { username: filters.username } : {}),
    ...(filters.email ? { email: filters.email } : {}),
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.enabled !== '' ? { enabled: filters.enabled === 'true' } : {}),
  }
  void loadUsers(1)
}
function resetFilters() {
  Object.assign(filters, { username: '', email: '', role: '', enabled: '' })
  appliedFilters.value = {}
  void loadUsers(1)
}
function changePage(value: number | string) {
  const pageNum = Number(value)
  if (loading.value || !Number.isInteger(pageNum) || pageNum < 1 || pageNum > page.value.pages) {
    jumpPage.value = String(page.value.pageNum)
    return
  }
  void loadUsers(pageNum)
}
function shortDate(value: string | null, full = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(full ? ({ hour: '2-digit', minute: '2-digit', hour12: false } as const) : {}),
  }).format(date)
}
function fieldValue(account: UserAccount, field: EditableField) {
  if (field === 'role') return roleNames[account.role]
  if (field === 'enabled') return account.enabled ? '已启用' : '已停用'
  return account[field] || '未设置'
}
function fieldLocked(field: EditableField) {
  return currentAccount.value?.role === 'ADMIN' && (field === 'role' || field === 'enabled')
}
function openCreate() {
  if (busy.value) return
  drawerOpener = document.activeElement as HTMLElement | null
  drawerController?.abort()
  drawerMode.value = 'create'
  currentAccount.value = null
  editingField.value = null
  drawerLoading.value = false
  drawerError.value = ''
  fillForm()
}
function closeDrawer() {
  if (busy.value || actionMode.value) return
  drawerController?.abort()
  drawerMode.value = null
  currentAccount.value = null
  editingField.value = null
  clearPasswords()
  if (drawerOpener?.isConnected) drawerOpener.focus()
}
async function openDetail(id: number) {
  if (busy.value) return
  drawerOpener = document.activeElement as HTMLElement | null
  drawerMode.value = 'detail'
  currentAccount.value = null
  editingField.value = null
  clearPasswords()
  await loadAccount(id)
}
async function loadAccount(id: number) {
  drawerController?.abort()
  const controller = new AbortController()
  drawerController = controller
  drawerLoading.value = true
  drawerError.value = ''
  try {
    const account = await getUserById(id, controller.signal)
    if (!controller.signal.aborted) currentAccount.value = account
  } catch (error) {
    if (!controller.signal.aborted)
      drawerError.value = messageOf(error, '账号详情读取失败，请重试。')
  } finally {
    if (!controller.signal.aborted) drawerLoading.value = false
  }
}
function startEdit(field: EditableField) {
  if (!currentAccount.value || editingField.value || fieldLocked(field) || busy.value) return
  fillForm(currentAccount.value)
  drawerError.value = ''
  editingField.value = field
}
function cancelEdit() {
  if (saving.value) return
  editingField.value = null
  drawerError.value = ''
  clearPasswords()
  clearErrors(errors)
}
function validateForm() {
  clearErrors(errors)
  const creating = drawerMode.value === 'create'
  if (creating || editingField.value === 'username') {
    const username = form.username.trim()
    if (!username) errors.username = '请输入用户名。'
    else if (username.length > 50) errors.username = '用户名不能超过 50 个字符。'
    else if (username.includes('@')) errors.username = '用户名不能包含 @。'
  }
  if (creating || editingField.value === 'email') {
    if (form.email.trim().length > 254 || emailInput.value?.validity.typeMismatch)
      errors.email = '请输入有效邮箱，且不超过 254 个字符。'
    if (!creating && emailChanged.value && !form.currentPassword.trim())
      errors.currentPassword = '修改邮箱需要输入当前管理员密码。'
  }
  if (creating) {
    if (!form.password.trim()) errors.password = '请输入初始密码。'
    else if (new TextEncoder().encode(form.password).length > 72)
      errors.password = '密码不能超过 72 个 UTF-8 字节。'
  }
  if ((creating || editingField.value === 'role') && form.role !== 'USER' && form.role !== 'EDITOR')
    errors.role = '请选择用户或编辑。'
  return Object.keys(errors).length === 0
}
async function saveUser() {
  if (busy.value || !validateForm()) return
  saving.value = true
  drawerError.value = ''
  try {
    if (drawerMode.value === 'create') {
      await createUser({
        username: form.username.trim(),
        email: form.email.trim() || null,
        password: form.password,
        role: form.role as 'USER' | 'EDITOR',
        enabled: form.enabled,
      })
      drawerMode.value = null
      clearPasswords()
      showToast('用户已创建。')
      Object.assign(filters, { username: '', email: '', role: '', enabled: '' })
      appliedFilters.value = {}
      await Promise.all([loadUsers(1), loadStats()])
    } else if (currentAccount.value && editingField.value) {
      const account = currentAccount.value
      const payload: UserAccountDTO = {
        id: account.id,
        username: account.username,
        email: account.email,
        role: account.role,
        enabled: account.enabled,
      }
      if (editingField.value === 'username') payload.username = form.username.trim()
      if (editingField.value === 'email') {
        payload.email = form.email.trim() || null
        if (emailChanged.value) payload.currentPassword = form.currentPassword
      }
      if (editingField.value === 'role') payload.role = form.role
      if (editingField.value === 'enabled') payload.enabled = form.enabled
      currentAccount.value = await updateUser(payload)
      editingField.value = null
      clearPasswords()
      showToast('账号资料已保存。')
      await Promise.all([loadUsers(), loadStats()])
    }
  } catch (error) {
    drawerError.value = messageOf(error, '保存失败，请稍后重试。')
  } finally {
    saving.value = false
  }
}
function openAction(mode: 'reset' | 'delete') {
  if (
    !currentAccount.value ||
    editingField.value ||
    busy.value ||
    (mode === 'delete' && currentAccount.value.role === 'ADMIN')
  )
    return
  actionOpener = document.activeElement as HTMLElement | null
  actionMode.value = mode
  actionTarget.value = currentAccount.value
  actionForm.currentPassword = ''
  actionForm.newPassword = ''
  actionError.value = ''
  clearErrors(actionErrors)
}
function closeAction() {
  if (actionSubmitting.value) return
  actionMode.value = null
  actionTarget.value = null
  actionForm.currentPassword = ''
  actionForm.newPassword = ''
  void nextTick(() => {
    if (actionOpener?.isConnected) actionOpener.focus()
  })
}
async function submitAction() {
  if (busy.value || !actionMode.value || !actionTarget.value) return
  clearErrors(actionErrors)
  if (!actionForm.currentPassword.trim()) actionErrors.currentPassword = '请输入当前管理员密码。'
  if (actionMode.value === 'reset') {
    if (!actionForm.newPassword.trim()) actionErrors.newPassword = '请输入新密码。'
    else if (new TextEncoder().encode(actionForm.newPassword).length > 72)
      actionErrors.newPassword = '新密码不能超过 72 个 UTF-8 字节。'
  }
  if (Object.keys(actionErrors).length) return
  const target = actionTarget.value
  const deleting = actionMode.value === 'delete'
  if (deleting && target.role === 'ADMIN') return
  actionSubmitting.value = true
  actionError.value = ''
  try {
    if (deleting) await deleteUser({ id: target.id, currentPassword: actionForm.currentPassword })
    else
      await resetUserPassword({
        id: target.id,
        currentPassword: actionForm.currentPassword,
        newPassword: actionForm.newPassword,
      })
    actionMode.value = null
    actionTarget.value = null
    clearPasswords()
    if (deleting) {
      drawerMode.value = null
      currentAccount.value = null
    }
    showToast(deleting ? '账号已删除。' : '密码已重置。')
    await Promise.all([loadUsers(), loadStats(), ...(!deleting ? [loadAccount(target.id)] : [])])
  } catch (error) {
    actionError.value = messageOf(error, '操作失败，请稍后重试。')
  } finally {
    actionSubmitting.value = false
  }
}
</script>

<template>
  <section class="users-management">
    <section class="page-hero" aria-labelledby="usersPageTitle">
      <div class="hero-copy">
        <p class="eyebrow">ACGBOX · ACCOUNT DIRECTORY</p>
        <h1 id="usersPageTitle">用户管理 <span>/ 账号档案</span></h1>
        <p>
          维护资料库账号与访问状态。邮箱验证状态依据账号记录展示；敏感凭据不会出现在列表或详情中。
        </p>
      </div>
      <div class="hero-actions">
        <button class="primary-button" type="button" :disabled="busy" @click="openCreate">
          <AdminIcon name="plus" />新增用户
        </button>
      </div>
    </section>

    <section class="stats-grid" aria-label="账号概况">
      <article class="stat-card">
        <span class="stat-icon"><AdminIcon name="user" /></span
        ><span class="stat-copy"
          ><span>账号总数</span><strong>{{ stats?.total ?? '—' }}</strong></span
        >
      </article>
      <article class="stat-card">
        <span class="stat-icon"><AdminIcon name="check" /></span
        ><span class="stat-copy"
          ><span>已启用</span><strong>{{ stats?.enabled ?? '—' }}</strong></span
        >
      </article>
      <article class="stat-card">
        <span class="stat-icon"><AdminIcon name="user" /></span
        ><span class="stat-copy"
          ><span>已停用</span><strong>{{ stats?.disabled ?? '—' }}</strong></span
        >
      </article>
    </section>
    <p v-if="statsError" class="stats-error" role="alert">
      {{ statsError }} <button type="button" @click="loadStats">重新加载概况</button>
    </p>

    <section class="list-card" aria-labelledby="usersListTitle" :aria-busy="loading">
      <header class="list-header">
        <div>
          <h2 id="usersListTitle">账号目录</h2>
          <p>账号资料与访问状态一览</p>
        </div>
        <div class="header-actions">
          <span class="access-note">仅管理员</span
          ><span class="list-meta">{{ loading ? '正在读取…' : `共 ${page.total} 个账号` }}</span>
        </div>
      </header>
      <form class="filter-row" @submit.prevent="runSearch" @reset.prevent="resetFilters">
        <div class="field">
          <label for="filterUsername">用户名</label
          ><input
            id="filterUsername"
            v-model="filters.username"
            type="search"
            maxlength="50"
            placeholder="搜索用户名"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label for="filterEmail">邮箱</label
          ><input
            id="filterEmail"
            v-model="filters.email"
            type="search"
            maxlength="254"
            placeholder="搜索邮箱地址"
            autocomplete="off"
          />
        </div>
        <div class="field">
          <label for="filterRole">账号角色</label
          ><ArchiveSelect
            id="filterRole"
            v-model="filterRoleModel"
            :options="roleOptions"
            placeholder="全部角色"
            label="账号角色"
          />
        </div>
        <div class="field">
          <label for="filterEnabled">启用状态</label
          ><ArchiveSelect
            id="filterEnabled"
            v-model="filterEnabledModel"
            :options="enabledOptions"
            placeholder="全部状态"
            label="启用状态"
          />
        </div>
        <div class="filter-actions">
          <button class="primary-button" type="submit">查询</button
          ><button class="secondary-button" type="reset">重置</button>
        </div>
      </form>
      <div class="table-scroll">
        <table v-if="!loading && !listError && page.rows.length" class="user-table">
          <thead>
            <tr>
              <th scope="col">账号</th>
              <th scope="col">邮箱</th>
              <th scope="col">角色</th>
              <th scope="col">状态</th>
              <th scope="col">创建时间</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="account in page.rows" :key="account.id">
              <td>
                <div class="user-cell">
                  <span class="user-avatar"
                    ><AdminIcon
                      :name="
                        account.role === 'ADMIN'
                          ? 'admin'
                          : account.role === 'EDITOR'
                            ? 'edit'
                            : 'user'
                      " /></span
                  ><span class="user-name"
                    ><strong>{{ account.username }}</strong></span
                  >
                </div>
              </td>
              <td class="email-cell">
                <template v-if="account.email"
                  ><strong>{{ account.email }}</strong
                  ><span class="email-verified" :class="{ unverified: !account.emailVerifiedAt }"
                    ><AdminIcon :name="account.emailVerifiedAt ? 'check' : 'clock'" />{{
                      account.emailVerifiedAt ? '已验证' : '未验证'
                    }}</span
                  ></template
                ><span v-else class="email-missing">未设置邮箱</span>
              </td>
              <td>
                <span class="role-pill" :class="account.role.toLowerCase()">{{
                  roleNames[account.role]
                }}</span>
              </td>
              <td>
                <span class="state-pill" :class="{ disabled: !account.enabled }">{{
                  account.enabled ? '已启用' : '已停用'
                }}</span>
              </td>
              <td class="date-cell">{{ shortDate(account.createdAt) }}</td>
              <td>
                <button
                  class="text-action"
                  type="button"
                  :aria-label="`编辑用户 ${account.username}`"
                  @click="openDetail(account.id)"
                >
                  <AdminIcon name="edit" />编辑
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        v-if="loading || listError || !page.rows.length"
        class="empty-state"
        :class="{ 'is-error': !!listError }"
        :role="listError ? 'alert' : 'status'"
      >
        <span class="empty-illustration"
          ><AdminIcon :name="listError ? 'refresh' : loading ? 'clock' : 'search-full'"
        /></span>
        <strong>{{
          loading
            ? '正在读取账号…'
            : listError
              ? '账号读取失败'
              : hasFilters
                ? '没有找到匹配账号'
                : '暂无用户账号'
        }}</strong>
        <p>
          {{
            loading
              ? '请稍候。'
              : listError ||
                (hasFilters ? '试试调整用户名、邮箱或筛选条件。' : '创建账号后，将在此处显示。')
          }}
        </p>
        <button v-if="listError" class="secondary-button" type="button" @click="loadUsers()">
          重新加载
        </button>
        <button
          v-else-if="!loading && hasFilters"
          class="secondary-button"
          type="button"
          @click="resetFilters"
        >
          清除筛选
        </button>
        <button v-else-if="!loading" class="primary-button" type="button" @click="openCreate">
          新增用户
        </button>
      </div>
      <footer class="pagination">
        <span class="page-summary"
          >共 {{ page.total }} 条 · 当前 {{ firstResult }}–{{ lastResult }} 条</span
        >
        <div class="page-controls">
          <span class="page-note">每页</span
          ><ArchiveSelect
            id="usersPageSize"
            v-model="pageSizeModel"
            :options="pageSizeOptions"
            placeholder="每页条数"
            label="用户列表每页条数"
            placement="top"
            :show-placeholder-option="false"
          />
          <button
            type="button"
            aria-label="上一页"
            :disabled="loading || page.pageNum <= 1"
            @click="changePage(page.pageNum - 1)"
          >
            <AdminIcon name="left" />
          </button>
          <button
            v-for="number in pageNumbers"
            :key="number"
            type="button"
            :class="{ current: page.pageNum === number }"
            :aria-label="`第 ${number} 页`"
            :aria-current="page.pageNum === number ? 'page' : undefined"
            :disabled="loading"
            @click="changePage(number)"
          >
            {{ number }}
          </button>
          <button
            type="button"
            aria-label="下一页"
            :disabled="loading || page.pageNum >= page.pages"
            @click="changePage(page.pageNum + 1)"
          >
            <AdminIcon name="right" />
          </button>
          <label class="page-note" for="usersJumpPage">跳至</label
          ><input
            id="usersJumpPage"
            v-model="jumpPage"
            class="jump-page"
            type="number"
            min="1"
            :max="page.pages || 1"
            :disabled="loading || !page.pages"
            aria-label="跳转页码"
            @change="changePage(jumpPage)"
            @keydown.enter.prevent="changePage(jumpPage)"
          /><span class="page-note">页</span>
        </div>
      </footer>
    </section>

    <Teleport to="body">
      <div
        v-if="drawerMode && tabActive"
        ref="drawerLayer"
        class="users-drawer-layer"
        @click.self="closeDrawer"
        @keydown.esc.stop="closeDrawer"
        @keydown.tab="trapFocus"
      >
        <aside
          class="drawer show"
          role="dialog"
          aria-modal="true"
          aria-labelledby="usersDrawerTitle"
          :inert="!!actionMode"
        >
          <header class="drawer-header">
            <div class="drawer-title">
              <h2 id="usersDrawerTitle">{{ drawerMode === 'create' ? '新增用户' : '用户详情' }}</h2>
              <p>
                {{ drawerMode === 'create' ? '创建可访问 ACGBox 的账号' : '每次可修改一项资料' }}
              </p>
            </div>
            <button
              class="drawer-close"
              type="button"
              aria-label="关闭用户抽屉"
              :disabled="busy"
              @click="closeDrawer"
            >
              <AdminIcon name="close" />
            </button>
          </header>
          <div class="drawer-body" :class="{ 'drawer-body-locked': !!actionMode }">
            <p v-if="drawerLoading" class="drawer-state" role="status">正在读取账号资料…</p>
            <form
              v-else-if="drawerMode === 'create'"
              id="userCreateForm"
              novalidate
              @submit.prevent="saveUser"
            >
              <fieldset class="drawer-form" :disabled="saving">
                <div class="field" :class="{ invalid: errors.username }">
                  <label for="formUsername">用户名 <span class="required">*</span></label
                  ><input
                    id="formUsername"
                    v-model="form.username"
                    maxlength="50"
                    autocomplete="off"
                    placeholder="请输入登录用户名"
                    :aria-invalid="!!errors.username"
                    aria-describedby="userUsernameError"
                    @input="delete errors.username"
                  /><span class="field-hint">不超过 50 个字符；不允许包含 @。</span
                  ><span
                    v-if="errors.username"
                    id="userUsernameError"
                    class="field-error"
                    role="alert"
                    >{{ errors.username }}</span
                  >
                </div>
                <div class="field" :class="{ invalid: errors.email }">
                  <label for="formEmail">邮箱</label
                  ><input
                    id="formEmail"
                    ref="emailInput"
                    v-model="form.email"
                    type="email"
                    maxlength="254"
                    autocomplete="off"
                    placeholder="选填，可留空"
                    :aria-invalid="!!errors.email"
                    aria-describedby="userEmailError"
                    @input="delete errors.email"
                  /><span class="field-hint">留空表示不设置邮箱。</span
                  ><span v-if="errors.email" id="userEmailError" class="field-error" role="alert">{{
                    errors.email
                  }}</span>
                </div>
                <div class="field" :class="{ invalid: errors.password }">
                  <label for="formPassword">初始密码 <span class="required">*</span></label
                  ><input
                    id="formPassword"
                    v-model="form.password"
                    type="password"
                    autocomplete="new-password"
                    placeholder="请输入初始密码"
                    :aria-invalid="!!errors.password"
                    aria-describedby="userPasswordError"
                    @input="delete errors.password"
                  /><span class="field-hint">最多 72 个 UTF-8 字节，首尾空格会保留。</span
                  ><span
                    v-if="errors.password"
                    id="userPasswordError"
                    class="field-error"
                    role="alert"
                    >{{ errors.password }}</span
                  >
                </div>
                <div class="form-row">
                  <div class="field" :class="{ invalid: errors.role }">
                    <label for="formRole">账号角色 <span class="required">*</span></label
                    ><ArchiveSelect
                      id="formRole"
                      v-model="formRoleModel"
                      :options="editableRoleOptions"
                      placeholder="请选择角色"
                      label="新用户角色"
                      :show-placeholder-option="false"
                    /><span v-if="errors.role" class="field-error" role="alert">{{
                      errors.role
                    }}</span>
                  </div>
                  <div class="field">
                    <label>账号状态</label>
                    <div class="choice-field">
                      <span>{{ form.enabled ? '已启用' : '已停用' }}</span
                      ><button
                        class="switch"
                        type="button"
                        role="switch"
                        :aria-checked="form.enabled"
                        aria-label="启用账号"
                        @click="form.enabled = !form.enabled"
                      ></button>
                    </div>
                  </div>
                </div>
              </fieldset>
            </form>
            <section v-else-if="currentAccount" aria-label="用户账号资料">
              <div class="detail-grid">
                <div
                  v-for="field in editableFields"
                  :key="field.key"
                  class="detail-item detail-field"
                  :class="{ editing: editingField === field.key }"
                >
                  <div class="detail-field-head">
                    <div>
                      <span>{{ field.label }}</span
                      ><strong>{{ fieldValue(currentAccount, field.key) }}</strong>
                    </div>
                    <span v-if="fieldLocked(field.key)" class="field-hint"
                      >管理员账号不可修改此项</span
                    ><button
                      v-else
                      class="text-action"
                      type="button"
                      :disabled="!!editingField || busy"
                      :aria-label="`编辑${field.label}`"
                      @click="startEdit(field.key)"
                    >
                      {{ editingField === field.key ? '正在编辑' : '编辑资料' }}
                    </button>
                  </div>
                  <form
                    v-if="editingField === field.key"
                    class="inline-editor"
                    novalidate
                    @submit.prevent="saveUser"
                  >
                    <fieldset class="drawer-form" :disabled="saving">
                      <div
                        v-if="field.key === 'username'"
                        class="field"
                        :class="{ invalid: errors.username }"
                      >
                        <label for="editUsername">用户名</label
                        ><input
                          id="editUsername"
                          v-model="form.username"
                          maxlength="50"
                          autocomplete="off"
                          :aria-invalid="!!errors.username"
                          @input="delete errors.username"
                        /><span class="field-hint">不超过 50 个字符，不能包含 @。</span>
                      </div>
                      <div
                        v-else-if="field.key === 'email'"
                        class="field"
                        :class="{ invalid: errors.email }"
                      >
                        <label for="editEmail">邮箱</label
                        ><input
                          id="editEmail"
                          :ref="(element) => (emailInput = element as HTMLInputElement | undefined)"
                          v-model="form.email"
                          type="email"
                          maxlength="254"
                          autocomplete="off"
                          placeholder="留空表示清除邮箱"
                          :aria-invalid="!!errors.email"
                          @input="delete errors.email"
                        /><span class="field-hint">修改后会清除原邮箱验证状态。</span>
                      </div>
                      <div
                        v-else-if="field.key === 'role'"
                        class="field"
                        :class="{ invalid: errors.role }"
                      >
                        <label for="editRole">角色</label
                        ><ArchiveSelect
                          id="editRole"
                          v-model="formRoleModel"
                          :options="editableRoleOptions"
                          placeholder="请选择角色"
                          label="修改用户角色"
                          :show-placeholder-option="false"
                        />
                      </div>
                      <div v-else class="field">
                        <label>账号状态</label>
                        <div class="choice-field">
                          <span>{{ form.enabled ? '已启用' : '已停用' }}</span
                          ><button
                            class="switch"
                            type="button"
                            role="switch"
                            :aria-checked="form.enabled"
                            aria-label="启用账号"
                            @click="form.enabled = !form.enabled"
                          ></button>
                        </div>
                      </div>
                      <p v-if="errors[field.key]" class="inline-error" role="alert">
                        {{ errors[field.key] }}
                      </p>
                      <div
                        v-if="field.key === 'email' && emailChanged"
                        class="field"
                        :class="{ invalid: errors.currentPassword }"
                      >
                        <label for="operatorPassword"
                          >当前管理员密码 <span class="required">*</span></label
                        ><input
                          id="operatorPassword"
                          v-model="form.currentPassword"
                          type="password"
                          autocomplete="current-password"
                          placeholder="输入当前登录管理员本人的密码"
                          :aria-invalid="!!errors.currentPassword"
                          @input="delete errors.currentPassword"
                        /><span v-if="errors.currentPassword" class="field-error" role="alert">{{
                          errors.currentPassword
                        }}</span>
                      </div>
                      <div class="footer-actions">
                        <button class="secondary-button" type="button" @click="cancelEdit">
                          取消</button
                        ><button class="primary-button" type="submit">
                          {{ saving ? '正在保存…' : '保存此项' }}
                        </button>
                      </div>
                    </fieldset>
                  </form>
                </div>
                <div class="detail-item">
                  <span>邮箱验证</span
                  ><strong>{{
                    currentAccount.email
                      ? currentAccount.emailVerifiedAt
                        ? '已验证'
                        : '未验证'
                      : '未设置'
                  }}</strong>
                </div>
                <div class="detail-item">
                  <span>创建时间</span
                  ><strong>{{ shortDate(currentAccount.createdAt, true) }}</strong>
                </div>
              </div>
              <h3 class="detail-section-title">账号安全</h3>
              <div class="detail-item"><span>凭据</span><strong>密码不会在此处显示</strong></div>
              <h3 class="detail-section-title">账号操作</h3>
              <div class="detail-actions">
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="!!editingField || busy"
                  @click="openAction('reset')"
                >
                  重置密码</button
                ><button
                  class="danger-button"
                  type="button"
                  :disabled="currentAccount.role === 'ADMIN' || !!editingField || busy"
                  :title="currentAccount.role === 'ADMIN' ? '管理员账号不可删除' : undefined"
                  @click="openAction('delete')"
                >
                  删除账号
                </button>
              </div>
            </section>
            <p v-if="drawerError" class="form-alert show" role="alert">{{ drawerError }}</p>
          </div>
          <footer class="drawer-footer">
            <span class="footer-note">{{
              drawerMode === 'create'
                ? '新建账号仅支持“编辑”或“用户”角色。'
                : editingField
                  ? '保存资料后，该账号可能需要重新登录。'
                  : '点击资料旁的编辑按钮进行修改。'
            }}</span>
            <div class="footer-actions">
              <button class="secondary-button" type="button" :disabled="busy" @click="closeDrawer">
                {{ drawerMode === 'create' ? '取消' : '关闭' }}</button
              ><button
                v-if="drawerMode === 'create'"
                class="primary-button"
                type="submit"
                form="userCreateForm"
                :disabled="saving"
              >
                {{ saving ? '正在创建…' : '创建用户' }}
              </button>
            </div>
          </footer>
        </aside>
      </div>

      <div
        v-if="actionMode && actionTarget && tabActive"
        ref="actionLayer"
        class="users-action-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="usersActionTitle"
        @click.self="closeAction"
        @keydown.esc.stop.prevent="closeAction"
        @keydown.tab="trapFocus"
        @wheel.self.prevent
      >
        <section class="dialog">
          <span class="dialog-mark"
            ><AdminIcon :name="actionMode === 'delete' ? 'delete' : 'reset'"
          /></span>
          <h2 id="usersActionTitle">
            {{ actionMode === 'delete' ? '确认删除账号？' : '重置用户密码' }}
          </h2>
          <p>
            {{
              actionMode === 'delete'
                ? '此操作会永久删除该账号，无法恢复。请确认目标账号无误。'
                : '设置一个新密码。目标账号的原密码无需提供。'
            }}
          </p>
          <div class="target-card">
            <span class="user-avatar"
              ><AdminIcon
                :name="
                  actionTarget.role === 'ADMIN'
                    ? 'admin'
                    : actionTarget.role === 'EDITOR'
                      ? 'edit'
                      : 'user'
                " /></span
            ><span class="target-copy"
              ><strong>{{ actionTarget.username }}</strong
              ><span>{{ roleNames[actionTarget.role] }}</span></span
            >
          </div>
          <p v-if="actionMode === 'delete'" class="warning-note">
            删除为永久操作，且需要输入当前登录管理员本人的密码。
          </p>
          <form novalidate @submit.prevent="submitAction">
            <fieldset class="action-fields" :disabled="actionSubmitting">
              <div
                v-if="actionMode === 'reset'"
                class="field"
                :class="{ invalid: actionErrors.newPassword }"
              >
                <label for="dialogNewPassword">新密码 <span class="required">*</span></label
                ><input
                  id="dialogNewPassword"
                  v-model="actionForm.newPassword"
                  type="password"
                  autocomplete="new-password"
                  placeholder="输入新密码"
                  :aria-invalid="!!actionErrors.newPassword"
                  @input="delete actionErrors.newPassword"
                /><span class="field-hint">最多 72 个 UTF-8 字节，首尾空格会保留。</span
                ><span v-if="actionErrors.newPassword" class="field-error" role="alert">{{
                  actionErrors.newPassword
                }}</span>
              </div>
              <div class="field" :class="{ invalid: actionErrors.currentPassword }">
                <label for="dialogCurrentPassword"
                  >当前管理员密码 <span class="required">*</span></label
                ><input
                  id="dialogCurrentPassword"
                  v-model="actionForm.currentPassword"
                  type="password"
                  autocomplete="current-password"
                  placeholder="输入当前管理员密码以验证身份"
                  :aria-invalid="!!actionErrors.currentPassword"
                  @input="delete actionErrors.currentPassword"
                /><span v-if="actionMode === 'reset'" class="field-hint"
                  >这是当前操作者的密码，不是目标账号的旧密码。</span
                ><span v-if="actionErrors.currentPassword" class="field-error" role="alert">{{
                  actionErrors.currentPassword
                }}</span>
              </div>
              <p v-if="actionError" class="dialog-alert show" role="alert">{{ actionError }}</p>
              <div class="dialog-actions">
                <button class="secondary-button" type="button" @click="closeAction">取消</button
                ><button
                  :class="actionMode === 'delete' ? 'danger-button' : 'primary-button'"
                  type="submit"
                >
                  {{
                    actionSubmitting
                      ? '正在处理…'
                      : actionMode === 'delete'
                        ? '确认删除'
                        : '确认重置'
                  }}
                </button>
              </div>
            </fieldset>
          </form>
        </section>
      </div>
      <div v-if="toast && tabActive" class="users-toast" role="status">{{ toast }}</div>
    </Teleport>
  </section>
</template>

<style scoped>
.page-hero {
  position: relative;
  display: flex;
  min-height: 146px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 25px 30px;
  overflow: hidden;
  background: linear-gradient(112deg, var(--surface-solid), var(--surface-muted));
  border: 1px solid var(--line);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-soft);
}
.page-hero::before {
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
.page-hero::after {
  position: absolute;
  top: 20px;
  right: 20%;
  width: 88px;
  height: 88px;
  content: '';
  border: 1px dashed rgba(217, 95, 134, 0.22);
  border-radius: 50%;
}
.hero-copy,
.hero-actions {
  position: relative;
  z-index: 1;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 9px;
  color: var(--accent-strong);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.eyebrow::before {
  width: 17px;
  height: 1px;
  content: '';
  background: currentColor;
}
.page-hero h1 {
  margin: 0;
  font: 700 clamp(23px, 3vw, 30px)/1.25 var(--font-display);
  letter-spacing: -0.035em;
}
.page-hero h1 span {
  color: var(--ink-faint);
  font: 500 12px var(--font-body);
  letter-spacing: 0;
}
.page-hero p:not(.eyebrow) {
  max-width: 650px;
  margin: 8px 0 0;
  color: var(--ink-soft);
  font-size: 11px;
}
.hero-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 9px;
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
  text-decoration: none;
  transition: 0.16s ease;
}
.primary-button {
  color: #fff;
  background: linear-gradient(135deg, #df7395, #bb5d88);
  box-shadow: 0 7px 15px rgba(197, 75, 117, 0.18);
}
.primary-button:hover {
  background: linear-gradient(135deg, #e681a0, #a94d78);
  transform: translateY(-1px);
}
.primary-button:disabled {
  opacity: 0.55;
  cursor: wait;
  transform: none;
}
.secondary-button,
.ghost-button {
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
}
.secondary-button:hover,
.ghost-button:hover {
  color: var(--accent-strong);
  background: var(--surface-hover);
  border-color: rgba(217, 95, 134, 0.25);
}
.danger-button {
  color: #fff;
  background: var(--danger);
}
.danger-button:hover {
  filter: brightness(0.94);
  transform: translateY(-1px);
}
.danger-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: saturate(0.5);
  transform: none;
}
.access-note {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 999px;
  font-size: 9px;
  font-weight: 650;
}
.access-note::before {
  width: 5px;
  height: 5px;
  content: '';
  background: currentColor;
  border-radius: 50%;
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
  margin-top: 16px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 16px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
}
.stat-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 10px;
  font-size: 15px;
}
.stat-card:nth-child(2) .stat-icon {
  color: var(--cyan);
  background: var(--cyan-soft);
}
.stat-card:nth-child(3) .stat-icon {
  color: var(--accent);
  background: var(--accent-soft);
}
.stat-copy span,
.stat-copy strong {
  display: block;
}
.stat-copy span {
  color: var(--ink-faint);
  font-size: 9px;
}
.stat-copy strong {
  margin-top: 2px;
  font: 700 18px var(--font-display);
}
.list-card {
  margin-top: 16px;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
}
.list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--line);
}
.list-header h2 {
  margin: 0;
  font: 700 14px var(--font-display);
}
.list-header p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 9px;
}
.list-meta {
  color: var(--ink-faint);
  font-size: 9px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.filter-row {
  display: grid;
  grid-template-columns:
    minmax(160px, 1.1fr) minmax(190px, 1.25fr) minmax(130px, 0.7fr) minmax(130px, 0.7fr)
    auto;
  align-items: end;
  gap: 10px;
  padding: 14px 17px;
  border-bottom: 1px solid var(--line);
}
.field {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.field label {
  color: var(--ink-soft);
  font-size: 10px;
  font-weight: 650;
}
.field input,
.field select {
  width: 100%;
  height: 38px;
  padding: 0 11px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  outline: none;
  font-size: 10px;
  transition:
    border-color 0.16s,
    box-shadow 0.16s;
}
.field input::placeholder {
  color: var(--ink-faint);
}
.field input:focus,
.field select:focus {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.filter-actions {
  display: flex;
  gap: 7px;
}
.filter-actions .primary-button,
.filter-actions .secondary-button {
  min-height: 38px;
  padding: 0 12px;
}
.table-scroll {
  overflow: auto;
}
.user-table {
  width: 100%;
  min-width: 850px;
  border-collapse: collapse;
  text-align: left;
}
.user-table th {
  padding: 10px 13px;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--line);
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}
.user-table td {
  padding: 11px 13px;
  border-bottom: 1px solid var(--line);
  color: var(--ink-soft);
  font-size: 10px;
  vertical-align: middle;
}
.user-table tr:last-child td {
  border-bottom: 0;
}
.user-table tbody tr {
  transition: background 0.15s;
}
.user-table tbody tr:hover {
  background: var(--surface-hover);
}
.user-table th:first-child,
.user-table td:first-child {
  padding-left: 18px;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 155px;
}
.user-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--violet);
  background: linear-gradient(145deg, var(--violet-soft), var(--accent-soft));
  border: 1px solid rgba(117, 103, 170, 0.1);
  border-radius: 12px 9px 12px 9px;
  font: 700 12px var(--font-display);
}
.user-name strong {
  color: var(--ink);
  font-size: 11px;
  font-weight: 700;
}
.email-cell {
  min-width: 190px;
}
.email-cell strong {
  display: block;
  color: var(--ink-soft);
  font-size: 10px;
  font-weight: 500;
}
.email-verified {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  color: var(--success);
  font-size: 9px;
}
.email-verified.unverified {
  color: var(--yellow);
}
.email-missing {
  color: var(--ink-faint);
  font-style: italic;
}
.role-pill,
.state-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 7px;
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}
.role-pill.admin {
  color: var(--violet);
  background: var(--violet-soft);
}
.role-pill.editor {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.role-pill.user {
  color: #527f9b;
  background: #e1f0f8;
}
.state-pill {
  color: var(--success);
  background: var(--success-soft);
}
.state-pill::before {
  width: 5px;
  height: 5px;
  content: '';
  background: currentColor;
  border-radius: 50%;
}
.state-pill.disabled {
  color: var(--ink-faint);
  background: var(--surface-muted);
}
.date-cell {
  min-width: 106px;
  color: var(--ink-faint);
  font-size: 9px;
  white-space: nowrap;
}
.row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.text-action {
  padding: 5px 6px;
  color: var(--ink-soft);
  background: transparent;
  border-radius: 6px;
  font-size: 9px;
}
.text-action:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.text-action.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
.text-action:disabled {
  color: var(--ink-faint);
  cursor: not-allowed;
  opacity: 0.55;
}
.empty-state {
  display: grid;
  justify-items: center;
  padding: 52px 20px;
  color: var(--ink-faint);
  text-align: center;
}
.empty-illustration {
  display: grid;
  width: 60px;
  height: 60px;
  place-items: center;
  margin-bottom: 12px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 20px 15px 20px 15px;
  font-size: 23px;
}
.empty-state strong {
  color: var(--ink);
  font: 700 14px var(--font-display);
}
.empty-state p {
  margin: 5px 0 12px;
  font-size: 10px;
}
.pagination {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 18px;
  border-top: 1px solid var(--line);
}
.page-summary,
.page-note {
  color: var(--ink-faint);
  font-size: 9px;
}
.page-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.page-controls button {
  display: grid;
  min-width: 28px;
  height: 28px;
  place-items: center;
  color: var(--ink-soft);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
  font-size: 10px;
}
.page-controls button:hover:not(:disabled) {
  color: var(--accent-strong);
  background: var(--surface-hover);
}
.page-controls button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.page-controls button.current {
  color: #fff;
  background: var(--accent);
}
.page-size,
.jump-page {
  height: 28px;
  padding: 0 7px;
  color: var(--ink-soft);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 7px;
  font-size: 9px;
}
.jump-page {
  width: 43px;
  text-align: center;
}
.page-controls select:focus,
.jump-page:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.drawer {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 31;
  display: flex;
  width: min(520px, 100%);
  height: 100dvh;
  flex-direction: column;
  background: var(--surface-solid);
  box-shadow: -22px 0 60px rgba(24, 22, 46, 0.15);
  transform: translateX(102%);
  transition: transform 0.24s ease;
}
.drawer.show {
  transform: translateX(0);
}
.drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px 17px;
  border-bottom: 1px solid var(--line);
}
.drawer-title h2 {
  margin: 0;
  font: 700 18px var(--font-display);
}
.drawer-title p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.drawer-close {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border-radius: 9px;
  font-size: 18px;
}
.drawer-close:hover {
  color: var(--accent);
}
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}
.drawer-form {
  display: grid;
  gap: 16px;
}
.drawer-form .field input,
.drawer-form .field select {
  height: 42px;
  font-size: 11px;
}
.field-hint {
  color: var(--ink-faint);
  font-size: 9px;
  line-height: 1.5;
}
.field-error {
  display: none;
  color: var(--danger);
  font-size: 9px;
}
.field.invalid input,
.field.invalid select {
  border-color: var(--danger);
  box-shadow: 0 0 0 2px rgba(200, 76, 92, 0.12);
}
.field.invalid .field-error {
  display: block;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.choice-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 0 12px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.choice-field span {
  color: var(--ink-soft);
  font-size: 10px;
}
.switch {
  position: relative;
  width: 37px;
  height: 21px;
  padding: 0;
  background: #c9c6d3;
  border-radius: 999px;
  transition: background 0.16s;
}
.switch::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 15px;
  height: 15px;
  content: '';
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.16s;
}
.switch[aria-checked='true'] {
  background: var(--cyan);
}
.switch[aria-checked='true']::after {
  transform: translateX(16px);
}
.switch:focus-visible {
  box-shadow: var(--focus);
}
.form-alert,
.dialog-alert {
  display: none;
  padding: 10px 12px;
  color: var(--danger);
  background: var(--danger-soft);
  border: 1px solid rgba(200, 76, 92, 0.14);
  border-radius: 9px;
  border-radius: 9px;
  font-size: 10px;
}
.form-alert.show,
.dialog-alert.show {
  display: block;
}
.drawer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 24px;
  background: var(--surface-solid);
  border-top: 1px solid var(--line);
}
.footer-note {
  max-width: 225px;
  color: var(--ink-faint);
  font-size: 9px;
}
.footer-actions {
  display: flex;
  gap: 8px;
}
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.detail-item {
  min-width: 0;
  padding: 12px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 11px;
}
.detail-item.full {
  grid-column: 1/-1;
}
.detail-item span,
.detail-item strong {
  display: block;
}
.detail-item span {
  margin-bottom: 5px;
  color: var(--ink-faint);
  font-size: 9px;
}
.detail-item strong {
  color: var(--ink);
  font-size: 11px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.detail-section-title {
  margin: 21px 0 10px;
  font: 700 12px var(--font-display);
}
.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
}
.dialog {
  width: min(430px, 100%);
  padding: 23px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow);
  transform: translateY(8px) scale(0.99);
  transition: transform 0.2s ease;
}
.users-action-layer .dialog {
  transform: translateY(0) scale(1);
}
.dialog-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 14px;
  font-size: 18px;
}
.dialog h2 {
  margin: 15px 0 5px;
  font: 700 17px var(--font-display);
}
.dialog > p {
  margin: 0 0 15px;
  color: var(--ink-soft);
  font-size: 10px;
}
.target-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px;
  margin: 12px 0;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 11px;
}
.target-card .user-avatar {
  width: 31px;
  height: 31px;
}
.target-copy strong,
.target-copy span {
  display: block;
}
.target-copy strong {
  color: var(--ink);
  font-size: 10px;
}
.target-copy span {
  color: var(--ink-faint);
  font-size: 9px;
}
.dialog .field {
  margin-top: 13px;
}
.dialog .field input {
  height: 40px;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}
.dialog-actions .primary-button,
.dialog-actions .danger-button {
  min-width: 98px;
}
.warning-note {
  padding: 10px 11px;
  margin: 11px 0 14px;
  color: var(--danger);
  background: var(--danger-soft);
  border-radius: 9px;
  font-size: 9px;
}
.users-management {
  max-width: 1440px;
  margin: 0 auto;
  padding-bottom: 14px;
}
.stats-error {
  color: var(--danger);
  font-size: 11px;
}
.stats-error button {
  color: var(--accent-strong);
  background: transparent;
}
.access-note {
  white-space: nowrap;
}
.stat-icon svg {
  width: 17px;
  height: 17px;
}
.primary-button > svg,
.text-action > svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}
.text-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}
.list-header h2 {
  font-size: 16px;
}
.list-header p,
.list-meta,
.field label,
.field input,
.user-table td,
.email-cell strong {
  font-size: 11px;
}
.stat-copy span,
.page-summary,
.page-note,
.user-table th,
.date-cell {
  font-size: 10px;
}
.field input[type='search'] {
  cursor: text;
}
.user-name strong,
.detail-item strong {
  font-size: 12px;
}
.role-pill,
.state-pill,
.email-verified {
  font-size: 10px;
}
.role-pill.user {
  color: var(--cyan);
  background: var(--cyan-soft);
}
.user-avatar svg {
  width: 19px;
  height: 19px;
}
.email-verified svg {
  width: 12px;
  height: 12px;
}
.empty-illustration svg {
  width: 25px;
  height: 25px;
}
.empty-state.is-error .empty-illustration {
  color: var(--danger);
  background: var(--danger-soft);
}
.pagination .page-controls > button svg {
  width: 13px;
  height: 13px;
}
.users-management :deep(.archive-select-trigger) {
  min-height: 38px;
  height: 38px;
  font-size: 11px;
  border-radius: 9px;
}
.users-management :deep(.archive-select-option),
.users-drawer-layer :deep(.archive-select-option) {
  font-size: 11px;
}
.page-controls :deep(.archive-select) {
  width: 84px;
  flex: 0 0 auto;
}
.page-controls :deep(.archive-select-trigger) {
  min-height: 30px;
  height: 30px;
  padding: 0 9px;
  font-size: 10px;
  border-radius: 8px;
}
.users-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: rgba(20, 19, 33, 0.42);
  backdrop-filter: blur(2px);
}
.drawer.show {
  animation: users-drawer-in 0.24s ease both;
}
.drawer-body {
  min-height: 0;
  overscroll-behavior: contain;
}
.drawer-body-locked {
  overflow: hidden;
}
.drawer-close svg {
  width: 16px;
  height: 16px;
}
.drawer-form,
.action-fields {
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
}
.action-fields {
  display: grid;
  gap: 14px;
}
.drawer-form .field input {
  font-size: 12px;
}
.users-drawer-layer :deep(.archive-select-trigger) {
  min-height: 42px;
  height: 42px;
  font-size: 12px;
  border-radius: 9px;
}
.field-hint {
  font-size: 10px;
}
.field-error {
  margin: 0;
}
.inline-error,
.field-error {
  color: var(--danger);
  font-size: 11px;
}
.inline-error {
  margin: 0;
}
.required {
  color: var(--accent-strong);
}
.detail-field {
  grid-column: 1/-1;
}
.detail-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.detail-field-head > div {
  min-width: 0;
}
.detail-field-head .text-action {
  flex: 0 0 auto;
  color: var(--accent-strong);
  border: 1px solid var(--line);
  background: var(--surface-solid);
  padding: 6px 10px;
}
.detail-field-head .text-action:disabled {
  color: var(--ink-faint);
  cursor: not-allowed;
}
.detail-field-head > .field-hint {
  max-width: 160px;
  margin: 0;
  font-weight: 400;
  text-align: right;
}
.detail-field.editing {
  background: var(--surface-solid);
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.inline-editor {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.inline-editor .footer-actions {
  justify-content: flex-end;
}
.detail-section-title {
  font-size: 13px;
}
.secondary-button:disabled,
.drawer-close:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.drawer-state {
  color: var(--ink-faint);
  font-size: 12px;
}
.form-alert,
.dialog-alert {
  margin: 12px 0 0;
  font-size: 11px;
  line-height: 1.6;
}
.users-action-layer {
  position: fixed;
  inset: 0;
  z-index: 1400;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(20, 19, 33, 0.48);
  backdrop-filter: blur(3px);
  overscroll-behavior: contain;
}
.dialog {
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dialog-mark svg {
  width: 19px;
  height: 19px;
}
.dialog h2 {
  font-size: 17px;
  line-height: 1.4;
}
.dialog > p,
.dialog .field label,
.dialog .field input {
  font-size: 11px;
}
.dialog .field {
  margin-top: 0;
}
.dialog .dialog-alert {
  margin: 0;
}
.dialog-actions {
  margin-top: 4px;
}
.target-copy strong {
  font-size: 12px;
}
.target-copy span,
.warning-note {
  font-size: 11px;
  line-height: 1.6;
}
.users-toast {
  position: fixed;
  right: 24px;
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
@keyframes users-drawer-in {
  from {
    transform: translateX(102%);
  }
  to {
    transform: translateX(0);
  }
}
@media (max-width: 1180px) {
  .filter-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .filter-actions {
    grid-column: 1/-1;
    justify-content: flex-end;
  }
}
@media (max-width: 620px) {
  .page-hero {
    min-height: 0;
    align-items: flex-start;
    flex-direction: column;
    padding: 20px;
    border-radius: 18px;
  }
  .page-hero::before {
    right: -57px;
  }
  .page-hero::after {
    right: 18px;
  }
  .hero-actions {
    width: 100%;
  }
  .hero-actions .primary-button {
    width: 100%;
  }
  .stats-grid {
    gap: 7px;
  }
  .stat-card {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
  }
  .stat-icon {
    width: 29px;
    height: 29px;
  }
  .stat-copy span {
    font-size: 9px;
  }
  .stat-copy strong {
    font-size: 16px;
  }
  .list-header {
    align-items: flex-start;
    flex-direction: column;
    padding: 14px;
  }
  .header-actions {
    width: 100%;
    justify-content: space-between;
  }
  .filter-row {
    padding: 12px;
  }
  .filter-row .field:first-child,
  .filter-row .field:nth-child(2) {
    grid-column: 1/-1;
  }
  .filter-actions button {
    flex: 1;
  }
  .pagination {
    align-items: flex-start;
    flex-direction: column;
    padding: 12px;
  }
  .page-controls {
    width: 100%;
    flex-wrap: wrap;
  }
  .drawer-header {
    padding: 18px 17px 14px;
  }
  .drawer-body {
    padding: 17px;
  }
  .drawer-footer {
    align-items: flex-start;
    flex-direction: column;
    padding: 12px 17px;
  }
  .footer-note {
    max-width: none;
  }
  .footer-actions {
    width: 100%;
  }
  .footer-actions button {
    flex: 1;
  }
  .form-row {
    grid-template-columns: 1fr;
  }
  .dialog {
    padding: 20px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .drawer.show {
    animation: none;
  }
  .primary-button,
  .secondary-button,
  .ghost-button,
  .danger-button,
  .switch,
  .switch::after {
    transition: none;
  }
}
</style>
