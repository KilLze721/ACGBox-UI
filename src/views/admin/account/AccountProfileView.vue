<script setup lang="ts">
/**
 * 个人账号页面：展示当前登录账号，提供密码修改及邮箱绑定、验证、换绑和解绑。
 * 管理验证码冷却、换绑凭证有效期、登录令牌更新和未保存保护，不编辑其他账号。
 */
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import {
  bindCurrentAccountEmail,
  changeCurrentAccountPassword,
  getCurrentAccount,
  sendCurrentAccountEmailCode,
  unbindCurrentAccountEmail,
  verifyCurrentAccountEmail,
} from '@/api/account'
import { getToken, saveLogin } from '@/utils/auth'
import type { LoginResult, UserAccount, UserAccountEmailPurpose } from '@/types/api'

type FlowMode = 'bind' | 'verify' | 'change' | 'unbind'
const account = ref<UserAccount | null>(null)
const loading = ref(true)
const loadError = ref('')
const busy = ref<'password' | 'send' | 'email' | 'verify' | null>(null)
const active = ref(true)
const passwordOpen = ref(false)
const password = reactive({ currentPassword: '', newPassword: '' })
const passwordVisible = reactive({ currentPassword: false, newPassword: false })
const passwordError = ref('')
const errors = reactive<Record<string, string>>({})
const flow = reactive({
  mode: null as FlowMode | null,
  step: 'new' as 'old' | 'new' | 'done',
  email: '',
  oldCode: '',
  newCode: '',
  proofExpiresAt: 0,
})
const flowError = ref('')
const sendStatus = ref('')
const sendFailed = ref(false)
const success = ref('')
const cooldowns = reactive<Record<UserAccountEmailPurpose, number>>({
  BIND: 0,
  CHANGE: 0,
  UNBIND: 0,
})
const now = ref(Date.now())
const pendingDiscard = shallowRef<(() => void) | null>(null)
const discardDescription = ref('')
const pageRoot = ref<HTMLElement>()
const drawer = ref<HTMLElement>()
const discardDialog = ref<HTMLElement>()
const savingDialog = ref<HTMLElement>()
let emailChangeToken = ''
let controller: AbortController | undefined
let timer: number | undefined
let disposed = false
let flowOpener: HTMLElement | null = null
let discardOpener: HTMLElement | null = null
let scrollSnapshot:
  | { body: string; html: string; shell: HTMLElement | undefined; inert: boolean }
  | undefined

const roleName = computed(() =>
  account.value?.role === 'ADMIN' ? '管理员' : account.value?.role === 'EDITOR' ? '编辑' : '用户'
)
const passwordBytes = computed(() => new TextEncoder().encode(password.newPassword).length)
const passwordDirty = computed(() => !!(password.currentPassword || password.newPassword))
const emailDirty = computed(
  () =>
    !!flow.mode &&
    flow.step !== 'done' &&
    !!(
      flow.oldCode ||
      flow.newCode ||
      flow.proofExpiresAt ||
      flow.email !== (flow.mode === 'verify' ? account.value?.email : '')
    )
)
const dirty = computed(() => passwordDirty.value || emailDirty.value)
const purpose = computed<UserAccountEmailPurpose>(() =>
  flow.mode === 'unbind' ? 'UNBIND' : flow.step === 'old' ? 'CHANGE' : 'BIND'
)
const cooldown = computed(() =>
  Math.max(0, Math.ceil((cooldowns[purpose.value] - now.value) / 1000))
)
const proofSeconds = computed(() =>
  Math.max(0, Math.ceil((flow.proofExpiresAt - now.value) / 1000))
)
const proofTime = computed(
  () =>
    `${String(Math.floor(proofSeconds.value / 60)).padStart(2, '0')}:${String(
      proofSeconds.value % 60
    ).padStart(2, '0')}`
)
const flowTitle = computed(
  () =>
    ({ bind: '绑定邮箱', verify: '验证已绑定邮箱', change: '更换邮箱', unbind: '解绑邮箱' }[
      flow.mode || 'bind'
    ])
)
const submitLabel = computed(() =>
  flow.step === 'done'
    ? '完成'
    : flow.mode === 'unbind'
    ? '确认解绑'
    : flow.step === 'old'
    ? '验证原邮箱'
    : flow.mode === 'change'
    ? '验证并换绑'
    : flow.mode === 'verify'
    ? '验证邮箱'
    : '验证并绑定'
)
defineExpose({ getCloseState: () => ({ dirty: dirty.value, submitting: !!busy.value }) })

onMounted(() => {
  void loadAccount()
  startClock()
  document.addEventListener('keydown', handleModalKey)
  document.addEventListener('visibilitychange', tick)
  window.addEventListener('beforeunload', beforeUnload)
})
onActivated(() => {
  active.value = true
  tick()
  startClock()
})
onDeactivated(() => {
  active.value = false
  passwordVisible.currentPassword = false
  passwordVisible.newPassword = false
  stopClock()
  releaseModal()
})
onBeforeUnmount(() => {
  disposed = true
  controller?.abort()
  stopClock()
  clearPassword()
  clearFlow()
  pendingDiscard.value = null
  releaseModal()
  document.removeEventListener('keydown', handleModalKey)
  document.removeEventListener('visibilitychange', tick)
  window.removeEventListener('beforeunload', beforeUnload)
})
watch(
  () => flow.email,
  () => {
    flow.newCode = ''
    delete errors.newCode
    delete errors.newEmail
    sendStatus.value = ''
  }
)
watch(
  [() => flow.mode, () => flow.step, pendingDiscard, busy, active],
  async () => {
    const open = active.value && !!(flow.mode || pendingDiscard.value || busy.value === 'password')
    if (open && !scrollSnapshot) {
      const shell = pageRoot.value?.closest<HTMLElement>('.app-shell') || pageRoot.value
      scrollSnapshot = {
        body: document.body.style.overflow,
        html: document.documentElement.style.overflow,
        shell,
        inert: shell?.inert || false,
      }
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      if (shell) shell.inert = true
    } else if (!open) releaseModal()
    await nextTick()
    const target = currentModal()
    if (target && !target.contains(document.activeElement)) {
      const first = target.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')
      const focusTarget = first || target
      focusTarget.focus()
    }
  },
  { flush: 'post' }
)

function currentModal() {
  return pendingDiscard.value
    ? discardDialog.value
    : busy.value === 'password'
    ? savingDialog.value
    : drawer.value
}
function releaseModal() {
  if (!scrollSnapshot) return
  document.body.style.overflow = scrollSnapshot.body
  document.documentElement.style.overflow = scrollSnapshot.html
  if (scrollSnapshot.shell) scrollSnapshot.shell.inert = scrollSnapshot.inert
  scrollSnapshot = undefined
}
function handleModalKey(event: KeyboardEvent) {
  if (!active.value || document.querySelector('.workspace-close-layer')) return
  const modal = currentModal()
  if (!modal) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (pendingDiscard.value) keepEditing()
    else if (flow.mode) requestCloseFlow()
  } else if (event.key === 'Tab') {
    const controls = [
      ...modal.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)'),
    ]
    const first = controls[0],
      last = controls[controls.length - 1]
    if (!first) {
      event.preventDefault()
      modal.focus()
      return
    }
    if (
      !modal.contains(document.activeElement) ||
      (event.shiftKey ? document.activeElement === first : document.activeElement === last)
    ) {
      event.preventDefault()
      const target = event.shiftKey ? last : first
      target?.focus()
    }
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || busy.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
function startClock() {
  if (!timer) timer = window.setInterval(tick, 1000)
}
function stopClock() {
  if (timer) window.clearInterval(timer)
  timer = undefined
}
// 按真实截止时间更新倒计时，换绑凭证到期后返回原邮箱验证步骤。
function tick() {
  now.value = Date.now()
  if (
    flow.mode === 'change' &&
    flow.step === 'new' &&
    flow.proofExpiresAt <= now.value &&
    !busy.value
  )
    expireProof()
}
function expireProof(message = '验证已过期，请重新验证原邮箱。原邮箱仍然保留。') {
  emailChangeToken = ''
  flow.proofExpiresAt = 0
  flow.step = 'old'
  flow.email = ''
  flow.oldCode = ''
  flow.newCode = ''
  clearErrors()
  sendStatus.value = ''
  flowError.value = message
  void focusField('oldCode')
}
function clearErrors() {
  Object.keys(errors).forEach((key) => delete errors[key])
}
function messageOf(error: unknown) {
  return error instanceof Error ? error.message : '操作失败，请稍后重试。'
}
async function focusField(id: string) {
  await nextTick()
  if (active.value && !pendingDiscard.value)
    (
      drawer.value?.querySelector<HTMLElement>(`#${id}`) ||
      pageRoot.value?.querySelector<HTMLElement>(`#${id}`)
    )?.focus()
}
async function loadAccount() {
  controller?.abort()
  const request = new AbortController()
  controller = request
  loading.value = true
  loadError.value = ''
  try {
    const result = await getCurrentAccount(request.signal)
    if (!request.signal.aborted && !disposed) account.value = result
  } catch (error) {
    if (!request.signal.aborted && !disposed) loadError.value = messageOf(error)
  } finally {
    if (controller === request) loading.value = false
  }
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}
function clearPassword() {
  password.currentPassword = ''
  password.newPassword = ''
  passwordVisible.currentPassword = false
  passwordVisible.newPassword = false
  passwordError.value = ''
  clearErrors()
}
function clearFlow() {
  flow.mode = null
  flow.step = 'new'
  flow.email = ''
  flow.oldCode = ''
  flow.newCode = ''
  flow.proofExpiresAt = 0
  emailChangeToken = ''
  flowError.value = ''
  sendStatus.value = ''
  clearErrors()
}
function askDiscard(
  action: () => void,
  description = '当前填写的内容尚未保存，放弃后将清空这些内容。'
) {
  discardOpener = document.activeElement as HTMLElement | null
  discardDescription.value = description
  pendingDiscard.value = action
}
function keepEditing() {
  pendingDiscard.value = null
  void nextTick(() => {
    if (discardOpener?.isConnected) discardOpener.focus()
  })
}
function confirmDiscard() {
  const action = pendingDiscard.value
  pendingDiscard.value = null
  action?.()
}
function togglePassword() {
  if (busy.value || loading.value || loadError.value) return
  if (!passwordOpen.value) {
    success.value = ''
    passwordOpen.value = true
    void focusField('currentPassword')
    return
  }
  const close = () => {
    clearPassword()
    passwordOpen.value = false
    void focusField('passwordToggle')
  }
  if (passwordDirty.value) askDiscard(close)
  else close()
}
function requestFlow(mode: FlowMode) {
  if (busy.value || loading.value || loadError.value || !account.value) return
  if (mode !== 'bind' && !account.value.email) return
  const opener = document.activeElement as HTMLElement | null
  const open = () => {
    flowOpener = opener
    clearPassword()
    passwordOpen.value = false
    clearFlow()
    success.value = ''
    flow.mode = mode
    flow.step = mode === 'change' || mode === 'unbind' ? 'old' : 'new'
    if (mode === 'verify') flow.email = account.value?.email || ''
    void focusField(flow.step === 'old' ? 'oldCode' : 'newEmail')
  }
  if (passwordDirty.value || emailDirty.value)
    askDiscard(open, '当前修改尚未保存，放弃后再继续邮箱操作。')
  else open()
}
function closeFlow() {
  clearFlow()
  void nextTick(() => {
    if (flowOpener?.isConnected) flowOpener.focus()
  })
}
function requestCloseFlow() {
  if (busy.value) return
  if (emailDirty.value)
    askDiscard(closeFlow, '邮箱修改尚未保存。放弃后将清空本次填写内容，原邮箱保持不变。')
  else closeFlow()
}
function validateAddress() {
  const input = drawer.value?.querySelector<HTMLInputElement>('#newEmail')
  if (!flow.email.trim()) errors.newEmail = '请输入邮箱地址。'
  else if (flow.email.length > 254 || input?.validity.typeMismatch)
    errors.newEmail = '请输入有效邮箱地址，最多 254 个字符。'
  else if (
    flow.mode !== 'verify' &&
    flow.email === account.value?.email &&
    account.value?.emailVerifiedAt
  )
    errors.newEmail = '此邮箱已绑定并验证。'
  else delete errors.newEmail
  if (errors.newEmail) {
    void focusField('newEmail')
    return false
  }
  return true
}
function validateCode(id: 'oldCode' | 'newCode') {
  if (!/^[0-9]{6}$/.test(flow[id])) {
    errors[id] = '验证码必须为 6 位数字。'
    void focusField(id)
    return false
  }
  delete errors[id]
  return true
}
// 账号修改成功后先替换登录令牌，再读取最新资料，避免继续携带已失效的旧令牌。
async function finishSaved(result: LoginResult, requestToken: string | null, message: string) {
  if (disposed || requestToken !== getToken()) return
  saveLogin(result)
  success.value = message
  clearPassword()
  emailChangeToken = ''
  flow.proofExpiresAt = 0
  flow.oldCode = ''
  flow.newCode = ''
  if (flow.mode) flow.step = 'done'
  await loadAccount()
}
async function savePassword() {
  if (busy.value || loading.value || loadError.value) return
  clearErrors()
  passwordError.value = ''
  success.value = ''
  if (!password.currentPassword.trim()) errors.currentPassword = '请输入当前密码。'
  if (!password.newPassword.trim()) errors.newPassword = '请输入新密码。'
  else if (passwordBytes.value > 72) errors.newPassword = '新密码不能超过 72 个 UTF-8 字节。'
  const invalid = Object.keys(errors)[0]
  if (invalid) {
    void focusField(invalid)
    return
  }
  controller?.abort()
  busy.value = 'password'
  passwordVisible.currentPassword = false
  passwordVisible.newPassword = false
  const token = getToken()
  try {
    const result = await changeCurrentAccountPassword({ ...password })
    await finishSaved(result, token, '密码已更新，当前设备保持登录。其他设备需使用新密码重新登录。')
  } catch (error) {
    passwordError.value = messageOf(error)
  } finally {
    busy.value = null
    void focusField(passwordError.value ? 'currentPassword' : 'newPassword')
  }
}

const beforeReservationErrors = new Set([
  '邮箱验证码功能尚未启用',
  '邮件服务尚未配置',
  '邮箱不能为空',
  '邮箱格式不正确',
  '邮箱长度不能超过 254 个字符',
  '当前账号尚未绑定邮箱',
  '此邮箱已绑定并验证',
  '此邮箱已被使用',
  '请先验证原邮箱后再换绑',
  '邮箱换绑凭证无效或已过期，请重新验证原邮箱',
  '邮箱换绑凭证格式不正确',
])
function handleProofError(message: string) {
  if (flow.mode === 'change' && flow.step === 'new' && message.includes('换绑凭证')) {
    expireProof(message)
    return true
  }
  return false
}
async function sendCode() {
  const step = flow.step
  tick()
  if (step !== flow.step) return
  if (busy.value || cooldown.value || !flow.mode || flow.step === 'done') return
  if (flow.step === 'new' && !validateAddress()) return
  const use = purpose.value
  const payload = {
    purpose: use,
    ...(use === 'BIND'
      ? { email: flow.email, ...(flow.mode === 'change' ? { emailChangeToken } : {}) }
      : {}),
  }
  busy.value = 'send'
  sendStatus.value = ''
  flowError.value = ''
  sendFailed.value = false
  cooldowns[use] = Date.now() + 60000
  try {
    await sendCurrentAccountEmailCode(payload)
    sendStatus.value = '验证码已发送，请查收邮件并使用最新验证码。'
  } catch (error) {
    const message = messageOf(error)
    // 只有明确发生在限流预留之前的错误才解除冷却；SMTP、Redis 或网络错误均保守保留冷却。
    if (beforeReservationErrors.has(message)) cooldowns[use] = 0
    else cooldowns[use] = Math.max(cooldowns[use], Date.now() + 60000)
    sendFailed.value = true
    sendStatus.value =
      message +
      (beforeReservationErrors.has(message) ? '' : '；请等待冷却结束，最终以服务端限流为准。')
    handleProofError(message)
  } finally {
    busy.value = null
    tick()
  }
}
// 按当前邮箱流程分发原邮箱验证、绑定或换绑、解绑请求，不将换绑凭证当作登录令牌。
async function submitEmail() {
  if (busy.value || !flow.mode) return
  if (flow.step === 'done') {
    closeFlow()
    return
  }
  const step = flow.step
  tick()
  if (step !== flow.step) return
  flowError.value = ''
  if (step === 'new' && !validateAddress()) return
  if (!validateCode(step === 'old' ? 'oldCode' : 'newCode')) return
  busy.value = flow.mode === 'change' && step === 'old' ? 'verify' : 'email'
  const token = getToken()
  controller?.abort()
  try {
    if (flow.mode === 'change' && step === 'old') {
      const result = await verifyCurrentAccountEmail({ currentEmailCode: flow.oldCode })
      if (disposed) return
      emailChangeToken = result.emailChangeToken
      flow.proofExpiresAt = Date.now() + result.expiresIn * 1000
      flow.oldCode = ''
      flow.step = 'new'
      sendStatus.value = ''
      void focusField('newEmail')
    } else {
      const result =
        flow.mode === 'unbind'
          ? await unbindCurrentAccountEmail({ verificationCode: flow.oldCode })
          : await bindCurrentAccountEmail({
              email: flow.email,
              newEmailCode: flow.newCode,
              ...(flow.mode === 'change' ? { emailChangeToken } : {}),
            })
      await finishSaved(
        result,
        token,
        flow.mode === 'unbind'
          ? '邮箱已解绑，仍可使用用户名与密码登录。'
          : '邮箱已完成验证并保存，当前设备保持登录，无需重新登录。'
      )
    }
  } catch (error) {
    const message = messageOf(error)
    if (!handleProofError(message)) flowError.value = message
  } finally {
    busy.value = null
    tick()
  }
}
</script>

<template>
  <section ref="pageRoot" class="account-profile">
    <header class="page-intro">
      <div>
        <p class="eyebrow">ACGBOX · PERSONAL ACCOUNT</p>
        <h1>个人账号 <span>PERSONAL ACCOUNT</span></h1>
        <p>管理自己的邮箱与登录密码，让每一次登录都有清晰归属。</p>
      </div>
      <div class="index-mark">ACCOUNT FILE<strong>PRIVATE / 01</strong></div>
    </header>
    <div v-if="success" class="notice success" role="status">
      <AdminIcon class="icon" name="check" />
      <p>{{ success }}</p>
    </div>
    <section
      v-if="loading && !account"
      class="skeleton-grid"
      role="status"
      aria-label="正在读取账号资料"
    >
      <div v-for="i in 2" :key="i" class="card skeleton-card">
        <div v-for="j in 4" :key="j" class="skeleton-line" :class="{ short: j % 2 === 0 }"></div>
      </div>
    </section>
    <section v-else-if="loadError" class="card status-panel" role="alert">
      <AdminIcon class="icon" name="info" />
      <h2>{{ success ? '资料保存成功，但刷新失败' : '暂时无法读取账号资料' }}</h2>
      <p>{{ loadError }} 资料加载完成前，无法修改账号。</p>
      <button class="secondary-button" :disabled="loading" @click="loadAccount">
        {{ loading ? '正在加载…' : '重新加载' }}
      </button>
    </section>
    <div v-else-if="account" class="account-grid" :aria-busy="loading">
      <aside class="profile-aside" aria-label="只读账号资料">
        <section class="card identity-card">
          <span class="identity-symbol"
            ><AdminIcon class="icon" :name="account.role === 'ADMIN' ? 'admin' : 'edit'"
          /></span>
          <h2>{{ account.username }}</h2>
          <p class="readonly-caption"><AdminIcon class="icon" name="lock" />登录用户名 · 只读</p>
          <dl class="identity-list">
            <div>
              <dt>账号角色</dt>
              <dd>
                <span class="pill">{{ roleName }}</span>
              </dd>
            </div>
            <div>
              <dt>启用状态</dt>
              <dd>
                <span class="pill" :class="account.enabled ? 'green' : 'yellow'">{{
                  account.enabled ? '已启用' : '已停用'
                }}</span>
              </dd>
            </div>
            <div>
              <dt>创建日期</dt>
              <dd>{{ dateLabel(account.createdAt) }}</dd>
            </div>
          </dl>
          <p class="identity-foot">用户名、角色与启用状态为只读资料，无法在此修改。</p>
        </section>
        <section class="context-note">
          <h3><AdminIcon class="icon" name="admin" />修改后，登录如何变化？</h3>
          <p>密码或邮箱实际变更后，当前设备保持登录；其他设备需要重新登录。</p>
        </section>
      </aside>
      <div class="settings-stack">
        <section class="card" aria-labelledby="emailTitle">
          <header class="card-head">
            <span class="section-icon"><AdminIcon class="icon" name="mail" /></span>
            <div>
              <h2 id="emailTitle">邮箱</h2>
              <p>用于邮箱登录，支持绑定、更换与解绑。</p>
            </div>
            <span class="section-no">01</span>
          </header>
          <div class="card-body">
            <div class="email-summary">
              <div>
                <span class="small-label">{{ account.email ? '当前绑定邮箱' : '邮箱登录' }}</span>
                <p class="email-address">{{ account.email || '尚未绑定邮箱' }}</p>
              </div>
              <span class="pill" :class="account.emailVerifiedAt ? 'green' : 'yellow'">{{
                !account.email ? '未绑定' : account.emailVerifiedAt ? '已验证' : '待验证'
              }}</span>
            </div>
            <div class="email-actions">
              <button
                id="primaryEmailAction"
                class="account-action action-email"
                :disabled="!!busy || loading"
                @click="requestFlow(account.email ? 'change' : 'bind')"
              >
                <AdminIcon class="icon" name="mail" />{{
                  account.email ? '更换邮箱' : '绑定邮箱'
                }}</button
              ><button
                v-if="account.email && !account.emailVerifiedAt"
                id="verifyEmailAction"
                class="secondary-button"
                :disabled="!!busy || loading"
                @click="requestFlow('verify')"
              >
                验证邮箱</button
              ><button
                v-if="account.email"
                id="unbindEmailAction"
                class="account-action action-unbind"
                :disabled="!!busy || loading"
                @click="requestFlow('unbind')"
              >
                <AdminIcon class="icon" name="unlink" />解绑邮箱
              </button>
            </div>
            <p class="email-note">
              <AdminIcon class="icon" name="info" /><span>{{
                account.email
                  ? '更换邮箱需要依次验证原邮箱与新邮箱，无需输入密码。'
                  : '绑定前需验证新邮箱；未绑定时仍可使用用户名与密码登录。'
              }}</span>
            </p>
            <details v-if="account.email" class="help">
              <summary>原邮箱无法使用？</summary>
              <p>请联系管理员核验并处理；管理员账号的恢复需由部署者另行核验身份。</p>
            </details>
          </div>
        </section>
        <section
          class="card password-card"
          :class="{ 'editor-open': passwordOpen }"
          aria-labelledby="passwordTitle"
        >
          <header class="card-head password-header">
            <span class="section-icon pink"><AdminIcon class="icon" name="lock" /></span>
            <div>
              <h2 id="passwordTitle">登录密码</h2>
              <p>使用当前密码确认身份。</p>
            </div>
            <button
              id="passwordToggle"
              class="primary-button password-toggle"
              :disabled="!!busy || loading"
              :aria-expanded="passwordOpen"
              aria-controls="passwordForm"
              @click="togglePassword"
            >
              {{ passwordOpen ? '收起' : '修改密码' }}
            </button>
          </header>
          <form
            v-if="passwordOpen"
            id="passwordForm"
            novalidate
            :aria-busy="busy === 'password'"
            @submit.prevent="savePassword"
          >
            <fieldset :disabled="!!busy || loading">
              <div class="card-body">
                <div v-if="passwordError" id="passwordAlert" class="notice" role="alert">
                  <AdminIcon class="icon" name="info" />
                  <p>{{ passwordError }}</p>
                </div>
                <div class="password-fields">
                  <div class="field" :class="{ invalid: errors.currentPassword }">
                    <label for="currentPassword">当前密码 <span class="required">*</span></label>
                    <div class="password-input">
                      <input
                        id="currentPassword"
                        v-model="password.currentPassword"
                        :type="passwordVisible.currentPassword ? 'text' : 'password'"
                        autocomplete="current-password"
                        placeholder="请输入当前密码"
                        :aria-invalid="!!errors.currentPassword"
                        :aria-describedby="`currentPasswordError${
                          passwordError ? ' passwordAlert' : ''
                        }`"
                        @input="delete errors.currentPassword"
                      />
                      <button
                        class="password-visibility"
                        type="button"
                        :aria-label="
                          passwordVisible.currentPassword ? '隐藏当前密码' : '显示当前密码'
                        "
                        :aria-pressed="passwordVisible.currentPassword"
                        aria-controls="currentPassword"
                        @click="passwordVisible.currentPassword = !passwordVisible.currentPassword"
                      >
                        <AdminIcon
                          class="icon"
                          :name="passwordVisible.currentPassword ? 'view-off' : 'view'"
                        />
                      </button>
                    </div>
                    <p id="currentPasswordError" class="field-error">
                      {{ errors.currentPassword }}
                    </p>
                  </div>
                  <div class="field" :class="{ invalid: errors.newPassword }">
                    <label for="newPassword">新密码 <span class="required">*</span></label>
                    <div class="password-input">
                      <input
                        id="newPassword"
                        v-model="password.newPassword"
                        :type="passwordVisible.newPassword ? 'text' : 'password'"
                        autocomplete="new-password"
                        placeholder="请输入新密码"
                        :aria-invalid="!!errors.newPassword"
                        :aria-describedby="`newPasswordHint newPasswordError byteCount${
                          passwordError ? ' passwordAlert' : ''
                        }`"
                        @input="delete errors.newPassword"
                      />
                      <button
                        class="password-visibility"
                        type="button"
                        :aria-label="passwordVisible.newPassword ? '隐藏新密码' : '显示新密码'"
                        :aria-pressed="passwordVisible.newPassword"
                        aria-controls="newPassword"
                        @click="passwordVisible.newPassword = !passwordVisible.newPassword"
                      >
                        <AdminIcon
                          class="icon"
                          :name="passwordVisible.newPassword ? 'view-off' : 'view'"
                        />
                      </button>
                    </div>
                    <div class="hint-row">
                      <p id="newPasswordHint" class="field-hint">
                        最多 72 个 UTF-8 字节，保留空格与大小写。
                      </p>
                      <span
                        id="byteCount"
                        class="byte-count"
                        :class="{ invalid: passwordBytes > 72 }"
                        >{{ passwordBytes }} / 72 字节</span
                      >
                    </div>
                    <p id="newPasswordError" class="field-error">{{ errors.newPassword }}</p>
                  </div>
                </div>
                <p class="password-note">
                  <AdminIcon class="icon" name="admin" /><span
                    >修改密码与邮箱操作独立进行，当前密码只用于这一次密码修改。</span
                  >
                </p>
              </div>
              <footer class="card-footer">
                <button class="secondary-button" type="button" @click="togglePassword">取消</button
                ><button id="savePassword" class="primary-button" type="submit">
                  {{ busy === 'password' ? '正在保存…' : '更新密码'
                  }}<AdminIcon class="icon" name="right" />
                </button>
              </footer>
            </fieldset>
          </form>
        </section>
      </div>
    </div>
    <footer class="page-footnote">
      <span>ACGBOX · PERSONAL ACCOUNT</span><span>账号与安全设置</span>
    </footer>
    <Teleport to="body">
      <div v-if="flow.mode && active" class="account-flow-layer" @click.self="requestCloseFlow">
        <aside
          ref="drawer"
          class="account-drawer open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="flowTitle"
          tabindex="-1"
          :inert="!!pendingDiscard"
        >
          <header class="drawer-head">
            <div>
              <h2 id="flowTitle">{{ flowTitle }}</h2>
              <p>
                {{
                  flow.mode === 'unbind'
                    ? '使用原邮箱验证码确认解绑，无需输入密码。'
                    : flow.mode === 'change'
                    ? '先验证原邮箱，再验证新邮箱。'
                    : '通过邮箱验证码确认该邮箱属于你。'
                }}
              </p>
            </div>
            <button
              class="icon-button"
              aria-label="关闭邮箱设置"
              :disabled="!!busy"
              @click="requestCloseFlow"
            >
              <AdminIcon class="icon" name="close" />
            </button>
          </header>
          <div class="drawer-body" :class="{ locked: !!pendingDiscard }">
            <ol v-if="flow.mode === 'change'" class="stepper" aria-label="邮箱换绑步骤">
              <li
                v-for="(label, i) in ['验证原邮箱', '验证新邮箱', '完成换绑']"
                :key="label"
                :class="{
                  active: i === (flow.step === 'old' ? 0 : flow.step === 'new' ? 1 : 2),
                  done: i < (flow.step === 'old' ? 0 : flow.step === 'new' ? 1 : 2),
                }"
                :aria-current="
                  i === (flow.step === 'old' ? 0 : flow.step === 'new' ? 1 : 2) ? 'step' : undefined
                "
              >
                <b>0{{ i + 1 }}</b
                ><span>{{ label }}</span>
              </li>
            </ol>
            <div v-if="flowError" id="flowAlert" class="notice" role="alert">
              <AdminIcon class="icon" name="info" />
              <p>{{ flowError }}</p>
            </div>
            <form
              v-if="flow.step !== 'done'"
              id="emailForm"
              novalidate
              :aria-busy="!!busy"
              @submit.prevent="submitEmail"
            >
              <fieldset :disabled="!!busy">
                <div v-if="flow.step === 'old'" class="flow-panel">
                  <p class="flow-copy">
                    {{
                      flow.mode === 'unbind'
                        ? '请获取当前绑定邮箱的验证码，确认后即可解除绑定。'
                        : '请使用当前绑定邮箱接收验证码。验证完成后才能填写新邮箱。'
                    }}
                  </p>
                  <div class="recipient">
                    <span class="small-label">当前绑定邮箱</span
                    ><strong>{{ account?.email }}</strong>
                  </div>
                  <div v-if="flow.mode === 'unbind'" class="notice info">
                    <AdminIcon class="icon" name="info" />
                    <p>解绑后将无法使用邮箱登录，仍可使用用户名与密码登录。</p>
                  </div>
                  <div class="field" :class="{ invalid: errors.oldCode }">
                    <label for="oldCode">原邮箱验证码 <span class="required">*</span></label>
                    <div class="code-row">
                      <input
                        id="oldCode"
                        v-model="flow.oldCode"
                        class="code-input"
                        type="text"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        maxlength="6"
                        placeholder="6 位数字"
                        :aria-invalid="!!errors.oldCode"
                        :aria-describedby="`oldCodeError${flowError ? ' flowAlert' : ''}${
                          sendStatus ? ' codeSendStatus' : ''
                        }`"
                        @input="delete errors.oldCode"
                      /><button
                        id="sendOldCode"
                        class="secondary-button"
                        type="button"
                        :disabled="!!busy || cooldown > 0"
                        @click="sendCode"
                      >
                        {{
                          busy === 'send'
                            ? '发送中…'
                            : cooldown
                            ? `${cooldown} 秒后重发`
                            : '获取验证码'
                        }}
                      </button>
                    </div>
                    <p id="oldCodeError" class="field-error">{{ errors.oldCode }}</p>
                  </div>
                </div>
                <div v-else class="flow-panel">
                  <div v-if="flow.mode === 'change'" class="proof-time">
                    <AdminIcon class="icon" name="clock" /><span>请在验证有效期内完成换绑</span
                    ><strong>{{ proofTime }}</strong>
                  </div>
                  <p class="flow-copy">
                    {{
                      flow.mode === 'verify'
                        ? '验证当前邮箱，无需修改邮箱地址。'
                        : flow.mode === 'change'
                        ? '原邮箱仍然保留，只有新邮箱验证并保存成功后才会替换。'
                        : '填写邮箱地址并验证，完成后即可使用邮箱与密码登录。'
                    }}
                  </p>
                  <div class="field" :class="{ invalid: errors.newEmail }">
                    <label for="newEmail">邮箱地址 <span class="required">*</span></label
                    ><input
                      id="newEmail"
                      v-model="flow.email"
                      type="email"
                      maxlength="254"
                      autocomplete="email"
                      placeholder="请输入邮箱地址"
                      :readonly="flow.mode === 'verify'"
                      :aria-invalid="!!errors.newEmail"
                      :aria-describedby="`newEmailError newEmailHint${
                        flowError ? ' flowAlert' : ''
                      }`"
                      @input="delete errors.newEmail"
                    />
                    <p id="newEmailHint" class="field-hint">
                      保留邮箱字母大小写，邮箱登录时需保持一致。
                    </p>
                    <p id="newEmailError" class="field-error">{{ errors.newEmail }}</p>
                  </div>
                  <div class="field" :class="{ invalid: errors.newCode }">
                    <label for="newCode">邮箱验证码 <span class="required">*</span></label>
                    <div class="code-row">
                      <input
                        id="newCode"
                        v-model="flow.newCode"
                        class="code-input"
                        type="text"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        maxlength="6"
                        placeholder="6 位数字"
                        :aria-invalid="!!errors.newCode"
                        :aria-describedby="`newCodeError${flowError ? ' flowAlert' : ''}${
                          sendStatus ? ' codeSendStatus' : ''
                        }`"
                        @input="delete errors.newCode"
                      /><button
                        id="sendNewCode"
                        class="secondary-button"
                        type="button"
                        :disabled="!!busy || cooldown > 0"
                        @click="sendCode"
                      >
                        {{
                          busy === 'send'
                            ? '发送中…'
                            : cooldown
                            ? `${cooldown} 秒后重发`
                            : '获取验证码'
                        }}
                      </button>
                    </div>
                    <p id="newCodeError" class="field-error">{{ errors.newCode }}</p>
                  </div>
                </div>
              </fieldset>
              <p
                v-if="sendStatus"
                id="codeSendStatus"
                class="send-status"
                :class="{ error: sendFailed }"
                :role="sendFailed ? 'alert' : 'status'"
              >
                {{ sendStatus }}
              </p>
            </form>
            <section v-else class="success-view" role="status">
              <span class="success-seal"><AdminIcon class="icon" name="check" /></span>
              <h3>{{ flow.mode === 'unbind' ? '邮箱已解绑' : '邮箱已更新' }}</h3>
              <p>{{ success }}</p>
              <p v-if="loadError" class="refresh-warning">
                资料刷新失败：{{ loadError }}。关闭后可重新加载。
              </p>
            </section>
            <div v-if="flow.step !== 'done'" class="flow-support">
              <p>验证码有效期 5 分钟，每 60 秒可重新获取一次；每小时最多发送 10 次。</p>
              <p>每条验证码最多允许 5 次错误尝试。重新发送后，请使用最新验证码。</p>
              <p v-if="flow.mode === 'change'">原邮箱会保留至新邮箱验证成功并完成保存。</p>
            </div>
          </div>
          <footer class="drawer-footer">
            <button
              v-if="flow.step !== 'done'"
              class="secondary-button"
              :disabled="!!busy"
              @click="requestCloseFlow"
            >
              取消</button
            ><button id="flowSubmit" class="primary-button" :disabled="!!busy" @click="submitEmail">
              {{ busy === 'verify' ? '正在验证…' : busy === 'email' ? '正在保存…' : submitLabel
              }}<AdminIcon v-if="flow.step !== 'done'" class="icon" name="right" />
            </button>
          </footer>
        </aside>
      </div>
      <div v-if="pendingDiscard && active" class="account-confirm-layer" @click.self="keepEditing">
        <section
          ref="discardDialog"
          class="dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="discardTitle"
          aria-describedby="discardDescription"
          tabindex="-1"
        >
          <span class="dialog-icon"><AdminIcon class="icon" name="edit" /></span>
          <h2 id="discardTitle">放弃未保存的修改？</h2>
          <p id="discardDescription">{{ discardDescription }}</p>
          <div class="dialog-actions">
            <button class="secondary-button" @click="keepEditing">继续编辑</button
            ><button class="primary-button" @click="confirmDiscard">放弃修改</button>
          </div>
        </section>
      </div>
      <div v-if="busy === 'password' && active" class="account-confirm-layer">
        <section
          ref="savingDialog"
          class="dialog saving-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="正在保存密码"
          tabindex="-1"
        >
          <AdminIcon class="icon" name="clock" />
          <p role="status">正在保存密码，请稍候…</p>
        </section>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.page-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 11px;
  color: var(--accent-strong);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.16em;
}
.eyebrow::before {
  width: 20px;
  height: 1px;
  content: '';
  background: currentColor;
}
h1 {
  margin: 0;
  font: 700 30px/1.25 var(--font-display);
  letter-spacing: -0.035em;
}
h1 span {
  margin-left: 6px;
  color: var(--ink-faint);
  font: 400 12px var(--font-body);
  letter-spacing: 0;
}
.page-intro p:last-child {
  margin: 9px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
}
.index-mark {
  padding: 8px 0 8px 15px;
  border-left: 1px solid var(--line-strong);
  color: var(--ink-faint);
  font-size: 9px;
  letter-spacing: 0.14em;
  line-height: 1.9;
}
.index-mark strong {
  display: block;
  color: var(--violet);
  font-size: 11px;
}
.account-grid {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  align-items: start;
  gap: 20px;
}
.profile-aside {
  display: grid;
  gap: 15px;
  position: sticky;
  top: 92px;
}
.card {
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow-soft);
}
.identity-card {
  position: relative;
  padding: 24px 20px 17px;
}
.identity-card::before {
  position: absolute;
  top: -54px;
  right: -42px;
  width: 160px;
  height: 160px;
  content: '';
  pointer-events: none;
  border: 1px solid rgba(117, 103, 170, 0.14);
  border-radius: 42% 58% 65% 35%;
  transform: rotate(25deg);
}
.identity-card::after {
  position: absolute;
  top: 30px;
  right: 30px;
  width: 22px;
  height: 22px;
  content: '';
  opacity: 0.5;
  background-image: radial-gradient(var(--violet) 0.8px, transparent 0.8px);
  background-size: 6px 6px;
}
.identity-symbol {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin-bottom: 18px;
  color: var(--violet);
  background: linear-gradient(140deg, var(--accent-soft), var(--violet-soft));
  border: 1px solid rgba(117, 103, 170, 0.12);
  border-radius: 18px 12px 18px 12px;
}
.identity-symbol .icon {
  width: 25px;
  height: 25px;
}
.identity-card h2 {
  position: relative;
  margin: 0;
  font: 700 21px/1.4 var(--font-display);
  overflow-wrap: anywhere;
}
.readonly-caption {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 5px 0 23px;
  color: var(--ink-faint);
  font-size: 10px;
}
.readonly-caption .icon {
  width: 12px;
  height: 12px;
}
.identity-list {
  margin: 0;
}
.identity-list > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 0;
  border-top: 1px solid var(--line);
}
.identity-list dt {
  color: var(--ink-soft);
  font-size: 11px;
}
.identity-list dd {
  margin: 0;
  color: var(--ink);
  font-size: 11px;
  font-weight: 600;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 6px;
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}
.pill .icon {
  width: 12px;
  height: 12px;
}
.pill.green {
  color: var(--success);
  background: var(--success-soft);
}
.pill.yellow {
  color: #8c681d;
  background: var(--yellow-soft);
}
:global(body[data-theme='dark']) .pill.yellow {
  color: var(--yellow);
}
.identity-foot {
  margin: 11px 0 0;
  padding-top: 14px;
  border-top: 1px dashed var(--line-strong);
  color: var(--ink-faint);
  font-size: 10px;
  line-height: 1.8;
}
.context-note {
  padding: 17px 18px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: color-mix(in srgb, var(--violet-soft) 35%, transparent);
}
.context-note h3 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 9px;
  color: var(--violet);
  font: 700 12px var(--font-display);
}
.context-note .icon {
  width: 14px;
  height: 14px;
}
.context-note p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 10px;
  line-height: 1.9;
}
.settings-stack {
  display: grid;
  gap: 18px;
}
.card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 21px 23px 17px;
  border-bottom: 1px solid var(--line);
}
.section-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  flex: 0 0 auto;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 11px;
}
.section-icon.pink {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.card-head h2 {
  margin: 0;
  font: 700 16px/1.45 var(--font-display);
}
.card-head p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.section-no {
  margin: 4px 0 0 auto;
  color: var(--ink-faint);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.card-body {
  padding: 21px 23px;
}
.email-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.small-label {
  display: block;
  margin-bottom: 7px;
  color: var(--ink-faint);
  font-size: 10px;
}
.email-address {
  margin: 0;
  color: var(--ink);
  font-size: 15px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.email-summary .pill {
  align-self: flex-start;
  margin-top: 3px;
}
.email-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
  margin-top: 19px;
}
.account-action {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 15px;
  border: 1px solid transparent;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 650;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.15s;
}
.action-email {
  color: var(--violet);
  background: color-mix(in srgb, var(--violet-soft) 55%, var(--surface-solid));
  border-color: color-mix(in srgb, var(--violet) 24%, transparent);
}
.action-email:hover {
  background: var(--violet-soft);
  border-color: var(--violet);
  box-shadow: 0 4px 12px rgba(117, 103, 170, 0.1);
  transform: translateY(-1px);
}
.action-unbind {
  color: var(--danger);
  background: var(--surface-solid);
  border-color: color-mix(in srgb, var(--danger) 30%, transparent);
}
.action-unbind:hover {
  background: var(--danger-soft);
  border-color: var(--danger);
  transform: translateY(-1px);
}
.password-header {
  align-items: center;
}
.password-toggle {
  flex: 0 0 auto;
  margin-left: auto;
  white-space: nowrap;
}
.password-card:not(.editor-open) .card-head {
  border-bottom: 0;
}
.text-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 36px;
  padding: 6px 8px;
  color: var(--ink-soft);
  background: transparent;
  border-radius: 8px;
  font-size: 11px;
}
.text-button:hover {
  color: var(--accent-strong);
  background: var(--surface-hover);
}
.text-button.danger {
  color: var(--danger);
}
.text-button.danger:hover {
  background: var(--danger-soft);
}
.email-note {
  display: flex;
  gap: 7px;
  margin: 18px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.email-note .icon {
  width: 13px;
  height: 13px;
  margin-top: 2px;
}
details.help {
  margin-top: 14px;
  color: var(--ink-soft);
  font-size: 10px;
}
details.help summary {
  display: inline-block;
  padding: 3px 0;
  cursor: pointer;
  border-bottom: 1px dotted var(--line-strong);
}
details.help summary:hover {
  color: var(--accent-strong);
}
details.help summary:focus-visible {
  outline: none;
  box-shadow: var(--focus);
  border-radius: 4px;
}
details.help p {
  max-width: 530px;
  margin: 8px 0 0;
  padding-left: 9px;
  border-left: 2px solid var(--line-strong);
  line-height: 1.8;
}
.field {
  display: grid;
  gap: 7px;
  min-width: 0;
}
.field label {
  display: block;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 650;
}
.required {
  color: var(--accent-strong);
}
.field input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 9px;
  outline: none;
  font-size: 12px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field input:hover {
  border-color: var(--line-strong);
}
.field input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.field input::placeholder {
  color: var(--ink-faint);
}
.field input[readonly] {
  background: var(--surface-muted);
  color: var(--ink-soft);
  cursor: default;
}
.field.invalid input {
  border-color: var(--danger);
}
.field-error {
  display: none;
  margin: 0;
  color: var(--danger);
  font-size: 10px;
}
.field.invalid .field-error {
  display: block;
}
.field-hint {
  display: block;
  margin: 0;
  color: var(--ink-faint);
  font-size: 10px;
  line-height: 1.7;
}
.hint-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.byte-count {
  flex: 0 0 auto;
  color: var(--ink-faint);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.byte-count.invalid {
  color: var(--danger);
}
fieldset {
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
}
.password-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: start;
  gap: 16px;
}
.password-input {
  position: relative;
  min-width: 0;
}
.password-input input {
  padding-right: 46px;
}
.password-input input::-ms-reveal {
  display: none;
}
.password-visibility {
  position: absolute;
  top: 5px;
  right: 6px;
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
}
.password-visibility:hover:not(:disabled) {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.password-visibility:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}
.password-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 11px 12px;
  margin: 18px 0 0;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 9px;
  font-size: 10px;
}
.password-note .icon {
  width: 14px;
  height: 14px;
  margin-top: 1px;
  color: var(--violet);
}
.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  padding: 15px 23px;
  border-top: 1px solid var(--line);
  background: color-mix(in srgb, var(--surface-muted) 55%, transparent);
}
.notice {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 12px 13px;
  margin: 0 0 17px;
  color: var(--danger);
  background: var(--danger-soft);
  border: 1px solid rgba(200, 76, 92, 0.16);
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.7;
}
.notice .icon {
  width: 16px;
  height: 16px;
  margin-top: 1px;
}
.notice p {
  margin: 0;
}
.notice strong {
  display: block;
  margin-bottom: 2px;
  font-weight: 650;
}
.notice.success {
  color: var(--success);
  background: var(--success-soft);
  border-color: rgba(57, 131, 111, 0.13);
}
.notice.info {
  color: var(--violet);
  background: var(--violet-soft);
  border-color: rgba(117, 103, 170, 0.13);
}
.page-footnote {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 22px 1px 0;
  color: var(--ink-faint);
  font-size: 9px;
  letter-spacing: 0.03em;
}
.page-footnote span:first-child {
  letter-spacing: 0.12em;
}
.account-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: 31;
  display: flex;
  width: min(490px, 100%);
  height: 100dvh;
  flex-direction: column;
  background: var(--surface-solid);
  box-shadow: -18px 0 60px rgba(24, 22, 46, 0.18);
  transform: translateX(103%);
  transition: transform 0.22s;
}
.account-drawer.open {
  transform: translateX(0);
}
.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 15px;
  padding: 23px 23px 18px;
  border-bottom: 1px solid var(--line);
}
.drawer-head h2 {
  margin: 0;
  font: 700 20px/1.4 var(--font-display);
}
.drawer-head p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.drawer-body {
  flex: 1;
  padding: 22px 23px;
  overflow-y: auto;
}
.drawer-footer {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 15px 23px;
  border-top: 1px solid var(--line);
  background: var(--surface-solid);
}
.drawer-footer > button:last-child {
  min-width: 126px;
}
.stepper {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 0;
  margin: 0 0 25px;
  list-style: none;
}
.stepper li {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  color: var(--ink-faint);
  font-size: 10px;
}
.stepper li:not(:last-child)::after {
  position: absolute;
  top: 13px;
  left: calc(50% + 20px);
  right: calc(-50% + 20px);
  height: 1px;
  content: '';
  background: var(--line-strong);
}
.stepper b {
  position: relative;
  z-index: 1;
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 9px;
  font-size: 10px;
}
.stepper li.active {
  color: var(--accent-strong);
  font-weight: 650;
}
.stepper li.active b {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 4px 12px rgba(217, 95, 134, 0.2);
}
.stepper li.done b {
  color: var(--success);
  background: var(--success-soft);
  border-color: transparent;
}
.stepper li.done::after {
  background: var(--cyan);
  opacity: 0.35;
}
.flow-panel {
  display: grid;
  gap: 18px;
}
.recipient {
  padding: 14px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 11px;
}
.recipient .small-label {
  margin-bottom: 6px;
}
.recipient strong {
  display: block;
  color: var(--ink);
  font-size: 13px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.flow-copy {
  margin: 0;
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.85;
}
.code-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 9px;
}
.code-input {
  letter-spacing: 0.18em;
  font-variant-numeric: tabular-nums;
}
.code-row .secondary-button {
  min-width: 110px;
  padding: 0 10px;
  font-size: 11px;
}
.flow-panel .notice {
  margin-bottom: 0;
}
.send-status {
  margin: -8px 0 0;
  font-size: 10px;
  line-height: 1.7;
  color: var(--ink-soft);
}
.send-status.error {
  color: var(--danger);
}
.proof-time {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 12px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 9px;
  font-size: 10px;
}
.proof-time strong {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.flow-support {
  padding-top: 14px;
  margin-top: 20px;
  border-top: 1px dashed var(--line-strong);
}
.flow-support p {
  margin: 0;
  color: var(--ink-faint);
  font-size: 10px;
  line-height: 1.8;
}
.flow-support p + p {
  margin-top: 5px;
}
.success-view {
  padding: 28px 5px;
  text-align: center;
}
.success-seal {
  display: grid;
  width: 65px;
  height: 65px;
  place-items: center;
  margin: 0 auto 20px;
  color: var(--success);
  background: var(--success-soft);
  border: 1px solid rgba(57, 131, 111, 0.12);
  border-radius: 24px 18px 24px 18px;
}
.success-seal .icon {
  width: 29px;
  height: 29px;
}
.success-view h3 {
  margin: 0 0 9px;
  font: 700 21px var(--font-display);
}
.success-view p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.9;
}
.dialog {
  width: min(410px, 100%);
  padding: 25px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow);
}
.dialog-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  margin-bottom: 15px;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 13px;
}
.dialog h2 {
  margin: 0 0 8px;
  font: 700 19px var(--font-display);
}
.dialog p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.8;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 9px;
  margin-top: 23px;
}
.status-panel {
  padding: 60px 25px;
  text-align: center;
}
.status-panel > .icon {
  width: 35px;
  height: 35px;
  margin-bottom: 15px;
  color: var(--violet);
}
.status-panel h2 {
  margin: 0 0 8px;
  font: 700 20px var(--font-display);
}
.status-panel p {
  margin: 0 0 20px;
  color: var(--ink-soft);
  font-size: 12px;
}
.skeleton-grid {
  display: grid;
  grid-template-columns: 252px 1fr;
  gap: 20px;
}
.skeleton-card {
  height: 290px;
  padding: 25px;
}
.skeleton-line {
  height: 14px;
  width: 75%;
  margin-bottom: 18px;
  background: linear-gradient(
    90deg,
    var(--surface-muted),
    var(--surface-hover),
    var(--surface-muted)
  );
  background-size: 200% 100%;
  border-radius: 5px;
  animation: shimmer 1.3s ease infinite;
}
.skeleton-line.short {
  width: 40%;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.account-profile {
  max-width: 1260px;
  margin: 0 auto;
}
.account-profile,
.account-drawer,
.account-confirm-layer {
  color: var(--ink);
  font-family: var(--font-body);
}
.icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
.primary-button,
.secondary-button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 15px;
  border-radius: 11px;
  font-size: 12px;
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}
button:focus-visible,
summary:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}
.field-error {
  min-height: 15px;
  font-size: 11px;
}
.field.invalid .field-error {
  display: block;
}
.field-hint,
.context-note p,
.identity-foot,
.email-note,
.flow-support p {
  font-size: 11px;
}
.card,
.settings-stack,
.profile-aside,
.email-summary > div {
  min-width: 0;
}
.profile-aside {
  top: 20px;
}
.account-flow-layer,
.account-confirm-layer {
  position: fixed;
  inset: 0;
  background: rgba(21, 20, 35, 0.4);
  backdrop-filter: blur(3px);
  overscroll-behavior: contain;
}
.account-flow-layer {
  z-index: 1500;
}
.account-drawer {
  z-index: auto;
  animation: account-drawer-in 0.22s ease;
}
.drawer-body {
  min-height: 0;
  overscroll-behavior: contain;
}
.drawer-body.locked {
  overflow: hidden;
}
.drawer-head,
.drawer-footer {
  flex: 0 0 auto;
}
.account-confirm-layer {
  z-index: 1600;
  display: grid;
  place-items: center;
  padding: 20px;
}
.dialog {
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dialog h2 {
  font-size: 19px;
}
.dialog p {
  font-size: 12px;
}
.send-status {
  margin: 14px 0 0;
  font-size: 11px;
}
.refresh-warning {
  margin-top: 15px !important;
  color: var(--danger) !important;
}
.saving-dialog {
  display: flex;
  align-items: center;
  gap: 12px;
}
@keyframes account-drawer-in {
  from {
    transform: translateX(103%);
  }
  to {
    transform: translateX(0);
  }
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
@media (max-width: 1150px) {
  .account-grid {
    grid-template-columns: 224px minmax(0, 1fr);
    gap: 16px;
  }
  .password-fields {
    grid-template-columns: 1fr;
  }
  .identity-card {
    padding: 22px 18px 16px;
  }
}
@media (max-width: 760px) {
  .account-grid,
  .skeleton-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  .profile-aside {
    position: static;
  }
  .context-note {
    display: none;
  }
  .identity-symbol {
    float: left;
    width: 45px;
    height: 45px;
    margin: 0 13px 0 0;
  }
  .identity-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 20px;
  }
  .identity-list > div:last-child {
    grid-column: 1/-1;
  }
}
@media (max-width: 620px) {
  .page-intro {
    margin-bottom: 20px;
    align-items: flex-start;
  }
  h1 {
    font-size: 26px;
  }
  h1 span,
  .index-mark {
    display: none;
  }
  .identity-card {
    padding: 19px;
  }
  .identity-card h2 {
    font-size: 19px;
  }
  .readonly-caption {
    margin: 3px 0 19px;
  }
  .card-head {
    padding: 18px 16px 15px;
    flex-wrap: wrap;
    gap: 9px;
  }
  .card-body {
    padding: 18px 16px;
  }
  .card-footer {
    padding: 13px 16px;
  }
  .password-toggle {
    margin-left: auto;
    padding: 0 10px;
  }
  .email-summary {
    gap: 10px;
    align-items: flex-start;
  }
  .email-address {
    font-size: 14px;
  }
  .card-head p {
    font-size: 10px;
  }
  .password-fields {
    gap: 17px;
  }
  .hint-row {
    flex-wrap: wrap;
    gap: 4px;
  }
  .page-footnote {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }
  .drawer-head {
    padding: 20px 18px 16px;
  }
  .drawer-body {
    padding: 21px 18px;
  }
  .drawer-footer {
    padding: 14px 18px;
  }
  .dialog {
    padding: 23px 20px;
  }
  .code-row .secondary-button {
    min-width: 100px;
  }
}
@media (max-width: 380px) {
  .identity-list {
    grid-template-columns: 1fr;
  }
  .identity-list > div:last-child {
    grid-column: auto;
  }
  .code-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .code-row .secondary-button {
    min-height: 40px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .account-drawer,
  .skeleton-line {
    animation: none;
    transition: none;
  }
  .account-action {
    transition: none;
  }
}
</style>
