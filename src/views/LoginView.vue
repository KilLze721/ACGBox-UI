<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loginByEmail, loginByEmailCode, loginByUsername, sendLoginEmailCode } from '@/api/auth'
import { saveLogin } from '@/utils/auth'

type LoginMode = 'username' | 'email'

const router = useRouter()
const route = useRoute()
const mode = ref<LoginMode>('username')
const identity = ref('')
const password = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const identityError = ref('')
const passwordError = ref('')
const feedback = ref(route.query.reason === 'expired' ? '登录已失效，请重新登录。' : '')
const identityInput = ref<HTMLInputElement>()
const passwordInput = ref<HTMLInputElement>()
const usernameTab = ref<HTMLButtonElement>()
const emailTab = ref<HTMLButtonElement>()
const isEmail = computed(() => mode.value === 'email')
const isEmailCode = ref(false)
const verificationCode = ref('')
const sendingCode = ref(false)
const codeNotice = ref('')
const cooldowns = ref<Record<string, number>>({})
const now = ref(Date.now())
const busy = computed(() => submitting.value || sendingCode.value)
const cooldown = computed(() =>
  Math.max(0, Math.ceil(((cooldowns.value[identity.value.trim()] ?? 0) - now.value) / 1000)),
)
let cooldownTimer: ReturnType<typeof setInterval> | undefined

onUnmounted(() => clearInterval(cooldownTimer))

function startCooldown(email: string) {
  now.value = Date.now()
  cooldowns.value[email] = now.value + 60_000
  if (cooldownTimer) return
  cooldownTimer = setInterval(() => {
    now.value = Date.now()
    if (Object.values(cooldowns.value).every((deadline) => deadline <= now.value)) {
      clearInterval(cooldownTimer)
      cooldownTimer = undefined
    }
  }, 1000)
}

async function toggleEmailCode() {
  if (busy.value) return
  isEmailCode.value = !isEmailCode.value
  password.value = ''
  verificationCode.value = ''
  showPassword.value = false
  passwordError.value = ''
  feedback.value = ''
  codeNotice.value = ''
  await nextTick()
  passwordInput.value?.focus()
}

async function sendCode() {
  if (busy.value || cooldown.value || !isEmailCode.value) return
  if (!validateIdentity()) {
    identityInput.value?.focus()
    return
  }
  const email = identity.value
  sendingCode.value = true
  feedback.value = ''
  codeNotice.value = ''
  startCooldown(email)
  try {
    await sendLoginEmailCode({ email })
    startCooldown(email)
    codeNotice.value = '符合条件的邮箱将收到验证码，请查收。'
    passwordInput.value?.focus()
  } catch (error) {
    const message = error instanceof Error ? error.message : '验证码发送失败，请稍后重试。'
    // 邮件发送失败或网络结果不确定时保留冷却，避免重复触发后端限流。
    if (['邮箱验证码功能尚未启用', '邮件服务尚未配置'].includes(message)) {
      delete cooldowns.value[email]
    }
    feedback.value = message
  } finally {
    sendingCode.value = false
  }
}

function setMode(nextMode: LoginMode) {
  if (busy.value || nextMode === mode.value) return
  mode.value = nextMode
  identity.value = ''
  identityError.value = ''
  passwordError.value = ''
  feedback.value = ''
  showPassword.value = false
  isEmailCode.value = false
  verificationCode.value = ''
  codeNotice.value = ''
}

async function moveMode() {
  setMode(isEmail.value ? 'username' : 'email')
  await nextTick()
  ;(isEmail.value ? emailTab.value : usernameTab.value)?.focus()
}

function validateIdentity() {
  identity.value = identity.value.trim()
  identityError.value = !identity.value
    ? isEmail.value
      ? '请输入邮箱。'
      : '请输入账号。'
    : isEmail.value && identity.value.length > 254
      ? '邮箱长度不能超过 254 个字符。'
      : isEmail.value && identityInput.value?.validity.typeMismatch
        ? '邮箱格式不正确，请检查后重试。'
        : ''
  return !identityError.value
}

function validatePassword() {
  passwordError.value = isEmailCode.value
    ? /^[0-9]{6}$/.test(verificationCode.value)
      ? ''
      : '请输入 6 位数字验证码。'
    : password.value.trim()
      ? ''
      : '请输入密码。'
  return !passwordError.value
}

function inputVerificationCode() {
  verificationCode.value = verificationCode.value.replace(/[^0-9]/g, '')
  clearFieldError('password')
}

function clearFieldError(key: 'identity' | 'password') {
  if (key === 'identity') {
    identityError.value = ''
    verificationCode.value = ''
    codeNotice.value = ''
  } else passwordError.value = ''
  feedback.value = ''
}

function loginTarget() {
  const redirect = route.query.redirect
  if (typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')) {
    const target = router.resolve(redirect)
    if (target.matched.some((record) => record.meta.requiresAuth)) return target.fullPath
  }
  return '/admin/dashboard'
}

async function submit() {
  if (busy.value) return
  feedback.value = ''
  const identityValid = validateIdentity()
  const passwordValid = validatePassword()
  if (!identityValid) {
    identityInput.value?.focus()
    return
  }
  if (!passwordValid) {
    passwordInput.value?.focus()
    return
  }
  submitting.value = true
  try {
    const result =
      isEmail.value && isEmailCode.value
        ? await loginByEmailCode({
            email: identity.value,
            verificationCode: verificationCode.value,
          })
        : isEmail.value
          ? await loginByEmail({ email: identity.value, password: password.value })
          : await loginByUsername({ username: identity.value, password: password.value })
    saveLogin(result)
    password.value = ''
    verificationCode.value = ''
    await router.replace(loginTarget())
  } catch (error) {
    feedback.value =
      error instanceof TypeError
        ? '无法连接登录服务，请检查网络后重试。'
        : error instanceof Error
          ? error.message
          : '登录失败，请稍后重试。'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="screen-noise" aria-hidden="true"></div>
    <main class="login-layout">
      <section class="brand-stage" aria-labelledby="brandHeadline">
        <RouterLink class="brand-lockup" to="/login" aria-label="ACGBox 登录首页">
          <span class="brand-mark" aria-hidden="true">A</span>
          <span class="brand-copy"><strong>ACGBox</strong><span>Animation Archive</span></span>
        </RouterLink>
        <div class="editorial-block">
          <p class="eyebrow">A PERSONAL ANIMATION ARCHIVE</p>
          <h1 id="brandHeadline">让喜欢的故事，<span>各有归处。</span></h1>
          <p class="editorial-copy">
            从一张片单到一座资料库。登录后继续整理动画、系列与每一段值得珍藏的观看记忆。
          </p>
          <div class="artboard" aria-hidden="true">
            <div class="artboard-frame">
              <span class="frame-index">ACG / INDEX · 001</span><span class="orbit-core">A</span
              ><span class="frame-label">CATALOGUE OF STORIES</span>
            </div>
          </div>
        </div>
        <footer class="stage-footer">
          <span>CURATE · CONNECT · REMEMBER</span
          ><span><i class="status-dot"></i> CONTENT ARCHIVE</span>
        </footer>
      </section>

      <section class="login-card" aria-labelledby="loginTitle">
        <div class="card-kicker">
          <span class="kicker-mark" aria-hidden="true">✦</span><span>管理端入口</span>
        </div>
        <div class="card-heading">
          <h2 id="loginTitle">欢迎回到资料库</h2>
          <p>选择登录方式，继续进入 ACGBox 工作台。</p>
        </div>
        <div
          class="mode-switch"
          role="tablist"
          aria-label="登录方式"
          @keydown.left.prevent="moveMode"
          @keydown.right.prevent="moveMode"
        >
          <button
            id="usernameTab"
            ref="usernameTab"
            class="mode-tab"
            type="button"
            role="tab"
            :aria-selected="!isEmail"
            aria-controls="loginPanel"
            :tabindex="isEmail ? -1 : 0"
            :disabled="busy"
            @click="setMode('username')"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="6.5" r="3.1" />
              <path d="M3.8 16.7c.8-2.8 2.8-4.2 6.2-4.2s5.4 1.4 6.2 4.2" /></svg
            >账号登录
          </button>
          <button
            id="emailTab"
            ref="emailTab"
            class="mode-tab"
            type="button"
            role="tab"
            :aria-selected="isEmail"
            aria-controls="loginPanel"
            :tabindex="isEmail ? 0 : -1"
            :disabled="busy"
            @click="setMode('email')"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="2.8" y="4.2" width="14.4" height="11.6" rx="2" />
              <path d="m3.7 5.5 6.3 4.9 6.3-4.9" /></svg
            >邮箱登录
          </button>
        </div>

        <div
          id="loginPanel"
          role="tabpanel"
          :aria-labelledby="isEmail ? 'emailTab' : 'usernameTab'"
        >
          <form
            id="loginForm"
            class="login-form"
            novalidate
            :aria-busy="submitting"
            @submit.prevent="submit"
          >
            <div class="field" :class="{ 'has-error': !!identityError }">
              <label class="field-label" for="identityInput"
                ><span>{{ isEmail ? '登录邮箱' : '登录账号' }}</span
                ><span class="required-mark">必填</span></label
              >
              <div class="input-shell" :class="{ invalid: !!identityError }">
                <span class="field-icon" aria-hidden="true">
                  <svg v-if="isEmail" viewBox="0 0 20 20">
                    <rect x="2.8" y="4.2" width="14.4" height="11.6" rx="2" />
                    <path d="m3.7 5.5 6.3 4.9 6.3-4.9" />
                  </svg>
                  <svg v-else viewBox="0 0 20 20">
                    <circle cx="10" cy="6.5" r="3.1" />
                    <path d="M3.8 16.7c.8-2.8 2.8-4.2 6.2-4.2s5.4 1.4 6.2 4.2" />
                  </svg>
                </span>
                <input
                  id="identityInput"
                  ref="identityInput"
                  v-model="identity"
                  :name="mode"
                  :type="isEmail ? 'email' : 'text'"
                  :autocomplete="isEmail ? 'email' : 'username'"
                  :placeholder="isEmail ? '请输入邮箱' : '请输入账号'"
                  :readonly="busy"
                  required
                  :aria-invalid="!!identityError"
                  aria-describedby="identityError"
                  autocapitalize="none"
                  spellcheck="false"
                  @blur="validateIdentity"
                  @input="clearFieldError('identity')"
                />
              </div>
              <p id="identityError" class="field-error" aria-live="polite">{{ identityError }}</p>
            </div>

            <div class="field" :class="{ 'has-error': !!passwordError }">
              <div class="field-label">
                <label for="passwordInput">{{ isEmailCode ? '邮箱验证码' : '登录密码' }}</label>
                <button
                  v-if="isEmail"
                  class="credential-mode"
                  type="button"
                  :disabled="busy"
                  :aria-pressed="isEmailCode"
                  @click="toggleEmailCode"
                >
                  {{ isEmailCode ? '密码登录' : '验证码登录' }}
                </button>
                <span v-else class="required-mark">必填</span>
              </div>
              <div class="input-shell" :class="{ invalid: !!passwordError }">
                <span class="field-icon" aria-hidden="true"
                  ><svg viewBox="0 0 20 20">
                    <rect x="3.4" y="8.5" width="13.2" height="8.4" rx="2" />
                    <path d="M6.3 8.3V5.9a3.7 3.7 0 0 1 7.4 0v2.4M10 11.8v2" /></svg
                ></span>
                <input
                  v-if="isEmailCode"
                  id="passwordInput"
                  ref="passwordInput"
                  v-model="verificationCode"
                  name="verificationCode"
                  type="text"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  maxlength="6"
                  placeholder="请输入 6 位验证码"
                  :readonly="busy"
                  required
                  :aria-invalid="!!passwordError"
                  aria-describedby="passwordError"
                  @blur="validatePassword"
                  @input="inputVerificationCode"
                />
                <input
                  v-else
                  id="passwordInput"
                  ref="passwordInput"
                  v-model="password"
                  name="password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="请输入密码"
                  :readonly="busy"
                  required
                  :aria-invalid="!!passwordError"
                  aria-describedby="passwordError"
                  @blur="validatePassword"
                  @input="clearFieldError('password')"
                />
                <button
                  v-if="isEmailCode"
                  class="send-code"
                  type="button"
                  :disabled="busy || cooldown > 0"
                  @click="sendCode"
                >
                  {{ sendingCode ? '发送中…' : cooldown ? `${cooldown} 秒后重试` : '获取验证码' }}
                </button>
                <button
                  v-else
                  class="password-toggle"
                  type="button"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  :aria-pressed="showPassword"
                  :disabled="busy"
                  @click="showPassword = !showPassword"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M2 10s2.8-5 8-5 8 5 8 5-2.8 5-8 5-8-5-8-5Z" />
                    <circle cx="10" cy="10" r="2.2" />
                    <path v-if="showPassword" d="m3 3 14 14" />
                  </svg>
                </button>
              </div>
              <p
                id="passwordError"
                class="field-error"
                :class="{ 'code-notice': !passwordError && !!codeNotice }"
                aria-live="polite"
              >
                {{ passwordError || codeNotice }}
              </p>
            </div>

            <div v-if="feedback" class="feedback show" role="alert">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="7.3" />
                <path d="M10 6.2v4.3M10 13.5h.01" /></svg
              ><span>{{ feedback }}</span>
            </div>
            <button
              class="submit-button"
              :class="{ 'is-loading': submitting }"
              type="submit"
              :disabled="busy"
              :aria-busy="submitting"
            >
              <span class="spinner" aria-hidden="true"></span
              ><span>{{ submitting ? '正在登录' : '登录 ACGBox' }}</span>
              <svg class="submit-arrow" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M3.5 10h12M10.5 5l5 5-5 5" />
              </svg>
            </button>
          </form>
        </div>
        <footer class="card-footer">
          <span>ACGBOX · ANIMATION ARCHIVE</span
          ><span class="footer-seal"
            ><svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 1.8 13 4v3.7c0 3.1-2 5.2-5 6.5-3-1.3-5-3.4-5-6.5V4l5-2.2Z" />
              <path d="m5.8 7.8 1.5 1.5 3-3" /></svg
            >私人资料空间</span
          >
        </footer>
      </section>
    </main>
  </div>
</template>

<style scoped>
.login-page {
  --login-shadow: 0 24px 72px rgba(37, 31, 67, 0.13);
  min-height: 100vh;
  margin: 0;
  color: var(--ink);
  background:
    radial-gradient(ellipse at 4% 90%, rgba(45, 169, 162, 0.09), transparent 31rem),
    radial-gradient(ellipse at 89% 11%, rgba(217, 95, 134, 0.14), transparent 29rem), var(--canvas);
  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
.login-page *,
.login-page *::before,
.login-page *::after {
  box-sizing: border-box;
}
.login-page button,
.login-page input {
  color: inherit;
  font: inherit;
}
.login-page button {
  border: 0;
}
.login-page button:focus-visible,
.login-page input:focus-visible {
  outline: none;
}
.login-page .screen-noise {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.25;
  background-image: radial-gradient(rgba(69, 61, 98, 0.18) 0.65px, transparent 0.8px);
  background-size: 8px 8px;
  mask-image: linear-gradient(to bottom, #000 0%, transparent 48%);
}
.login-page .login-layout {
  position: relative;
  z-index: 1;
  display: grid;
  width: min(1320px, 100%);
  min-height: 100vh;
  grid-template-columns: minmax(0, 1.1fr) minmax(390px, 0.9fr);
  align-items: center;
  gap: clamp(48px, 8vw, 124px);
  padding: clamp(32px, 5vw, 72px);
  margin: 0 auto;
}
.login-page .brand-stage {
  position: relative;
  display: flex;
  min-height: min(690px, calc(100vh - 100px));
  flex-direction: column;
  justify-content: space-between;
  padding: 5px 0 4px;
}
.login-page .brand-lockup {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 12px;
  color: var(--ink);
  text-decoration: none;
}
.login-page .brand-mark {
  position: relative;
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  overflow: hidden;
  color: #fff;
  background: linear-gradient(145deg, #d95f86, #7567aa 78%);
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: 15px 9px 15px 9px;
  box-shadow: 0 9px 24px rgba(157, 80, 125, 0.22);
  font: 800 20px var(--font-display);
}
.login-page .brand-mark::after {
  position: absolute;
  right: -12px;
  bottom: -16px;
  width: 35px;
  height: 35px;
  content: '';
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 50%;
}
.login-page .brand-copy strong,
.login-page .brand-copy span {
  display: block;
}
.login-page .brand-copy strong {
  font: 700 20px/1.1 var(--font-display);
  letter-spacing: 0.035em;
}
.login-page .brand-copy span {
  margin-top: 5px;
  color: var(--ink-faint);
  font-size: 9px;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}
.login-page .editorial-block {
  position: relative;
  max-width: 620px;
  padding: 37px 0 230px;
}
.login-page .eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 17px;
  color: var(--accent-strong);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}
.login-page .eyebrow::before {
  width: 25px;
  height: 1px;
  content: '';
  background: currentColor;
}
.login-page .editorial-block h1 {
  max-width: 590px;
  margin: 0;
  font: 700 clamp(37px, 5.2vw, 66px) / 1.22 var(--font-display);
  letter-spacing: -0.045em;
}
.login-page .editorial-block h1 span {
  display: block;
  color: var(--violet);
}
.login-page .editorial-copy {
  max-width: 410px;
  margin: 18px 0 0;
  color: var(--ink-soft);
  font-size: 13px;
  line-height: 1.9;
}
.login-page .artboard {
  position: absolute;
  right: 0;
  bottom: 0;
  width: min(46%, 270px);
  height: 202px;
  pointer-events: none;
}
.login-page .artboard-frame {
  position: absolute;
  inset: 12px 12px 0 0;
  overflow: hidden;
  background: linear-gradient(140deg, rgba(255, 255, 255, 0.79), rgba(233, 228, 247, 0.66));
  border: 1px solid rgba(117, 103, 170, 0.16);
  border-radius: 19px 11px 22px 13px;
  box-shadow: 0 20px 42px rgba(68, 58, 111, 0.09);
  transform: rotate(-5deg);
}
.login-page .artboard-frame::before {
  position: absolute;
  top: -68px;
  right: -25px;
  width: 180px;
  height: 180px;
  content: '';
  border: 1px solid rgba(217, 95, 134, 0.28);
  border-radius: 50%;
  box-shadow:
    0 0 0 15px rgba(217, 95, 134, 0.035),
    0 0 0 31px rgba(117, 103, 170, 0.035);
}
.login-page .artboard-frame::after {
  position: absolute;
  right: 21px;
  bottom: 21px;
  width: 118px;
  height: 50px;
  content: '';
  opacity: 0.5;
  background-image: radial-gradient(var(--violet) 1px, transparent 1.4px);
  background-size: 8px 8px;
  mask-image: linear-gradient(90deg, transparent, #000);
}
.login-page .frame-index {
  position: absolute;
  top: 19px;
  left: 20px;
  color: var(--ink-faint);
  font:
    9px ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
  letter-spacing: 0.08em;
}
.login-page .orbit-core {
  position: absolute;
  top: 48px;
  left: 49px;
  display: grid;
  width: 89px;
  height: 89px;
  place-items: center;
  color: #fff;
  background: linear-gradient(145deg, #dc7295, #8a78b9);
  border: 7px solid rgba(255, 255, 255, 0.67);
  border-radius: 50%;
  box-shadow: 0 10px 28px rgba(153, 89, 139, 0.19);
  font: 700 19px var(--font-display);
}
.login-page .orbit-core::before {
  position: absolute;
  inset: -15px;
  content: '';
  border: 1px solid rgba(117, 103, 170, 0.25);
  border-radius: 50%;
}
.login-page .orbit-core::after {
  position: absolute;
  top: 5px;
  right: 0;
  width: 9px;
  height: 9px;
  content: '';
  background: var(--cyan);
  border: 2px solid #fff;
  border-radius: 50%;
}
.login-page .frame-label {
  position: absolute;
  right: 20px;
  bottom: 21px;
  color: var(--ink-soft);
  font-size: 8px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.login-page .stage-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 18px;
  color: var(--ink-faint);
  border-top: 1px solid var(--line);
  font-size: 9px;
  letter-spacing: 0.09em;
}
.login-page .stage-footer span:last-child {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.login-page .status-dot {
  width: 6px;
  height: 6px;
  background: var(--cyan);
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(45, 169, 162, 0.12);
}
.login-page .login-card {
  position: relative;
  width: 100%;
  max-width: 470px;
  padding: clamp(27px, 4vw, 43px);
  justify-self: end;
  background: var(--surface);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 24px;
  box-shadow:
    var(--login-shadow),
    inset 0 1px rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(18px);
}
.login-page .card-kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 17px;
  color: var(--violet);
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.login-page .kicker-mark {
  display: grid;
  width: 23px;
  height: 23px;
  place-items: center;
  color: var(--accent-strong);
  background: var(--accent-soft);
  border-radius: 8px 5px 8px 5px;
}
.login-page .card-heading h2 {
  margin: 0;
  font: 700 27px/1.35 var(--font-display);
  letter-spacing: -0.025em;
}
.login-page .card-heading p {
  margin: 7px 0 0;
  color: var(--ink-soft);
  font-size: 11px;
  line-height: 1.8;
}
.login-page .mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  margin: 25px 0 23px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.login-page .mode-tab {
  display: flex;
  min-height: 39px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 9px;
  color: var(--ink-soft);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 9px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 650;
  transition:
    color 150ms ease,
    background 150ms ease,
    box-shadow 150ms ease,
    border-color 150ms ease;
}
.login-page .mode-tab:hover {
  color: var(--accent-strong);
}
.login-page .mode-tab[aria-selected='true'] {
  color: var(--ink);
  background: var(--surface-solid);
  border-color: var(--line);
  box-shadow: 0 3px 9px rgba(37, 31, 67, 0.06);
}
.login-page .mode-tab:focus-visible {
  box-shadow: var(--focus);
}
.login-page .mode-tab svg {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
.login-page .login-form {
  display: grid;
  gap: 17px;
}
.login-page .field {
  display: grid;
  gap: 7px;
}
.login-page .field-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ink-soft);
  font-size: 10px;
  font-weight: 700;
}
.login-page .required-mark {
  color: var(--accent-strong);
}
.login-page .credential-mode,
.login-page .send-code {
  flex: 0 0 auto;
  padding: 0;
  color: var(--accent-strong);
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 10px;
  font-weight: 650;
}
.login-page .credential-mode {
  padding: 2px 5px;
  margin: -2px -5px;
}
.login-page .send-code {
  min-height: 30px;
  padding: 0 8px;
  background: var(--accent-soft);
}
.login-page .credential-mode:hover:not(:disabled),
.login-page .send-code:hover:not(:disabled) {
  background: var(--accent-soft);
  color: var(--ink);
}
.login-page .credential-mode:focus-visible,
.login-page .send-code:focus-visible {
  box-shadow: var(--focus);
}
.login-page .credential-mode:disabled,
.login-page .send-code:disabled {
  color: var(--ink-faint);
  cursor: not-allowed;
}
.login-page .field-error.code-notice {
  color: var(--ink-soft);
  visibility: visible;
}
.login-page .input-shell {
  position: relative;
  display: flex;
  height: 46px;
  align-items: center;
  gap: 10px;
  padding: 0 13px;
  background: var(--surface-solid);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  transition:
    border-color 150ms ease,
    box-shadow 150ms ease,
    background 150ms ease;
}
.login-page .input-shell:hover {
  border-color: rgba(117, 103, 170, 0.42);
}
.login-page .input-shell:focus-within {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.login-page .field-icon {
  display: grid;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ink-faint);
}
.login-page .field-icon svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
.login-page .input-shell input {
  width: 100%;
  min-width: 0;
  height: 100%;
  padding: 0;
  color: var(--ink);
  background: transparent;
  border: 0;
  outline: 0;
  box-shadow: none;
  font-size: 11px;
}
.login-page .input-shell input::placeholder {
  color: #aaa7b8;
}
.login-page .input-shell input:focus-visible {
  box-shadow: none;
}
.login-page .input-shell.invalid {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger-soft) 24%, var(--surface-solid));
}
.login-page .input-shell.invalid:focus-within {
  box-shadow: 0 0 0 3px rgba(200, 76, 92, 0.14);
}
.login-page .field-error {
  display: block;
  min-height: 1.55em;
  margin: -1px 0 0;
  color: var(--danger);
  font-size: 9px;
  visibility: hidden;
}
.login-page .field.has-error .field-error {
  visibility: visible;
}
.login-page .password-toggle {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--ink-faint);
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
}
.login-page .password-toggle:hover {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.login-page .password-toggle:focus-visible {
  box-shadow: var(--focus);
}
.login-page .password-toggle svg {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
.login-page .feedback {
  display: none;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 11px;
  color: #a33c4b;
  background: var(--danger-soft);
  border: 1px solid rgba(200, 76, 92, 0.15);
  border-radius: 9px;
  font-size: 10px;
  line-height: 1.55;
}
.login-page .feedback.show {
  display: flex;
}
.login-page .feedback svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  margin-top: 1px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
}
.login-page .submit-button {
  display: flex;
  width: 100%;
  min-height: 47px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 2px;
  color: #fff;
  background: linear-gradient(120deg, #d95f86, #bd5a8a 55%, #7567aa);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 10px;
  box-shadow: 0 9px 19px rgba(189, 63, 105, 0.19);
  cursor: pointer;
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.035em;
  transition:
    transform 150ms ease,
    box-shadow 150ms ease,
    filter 150ms ease;
}
.login-page .submit-button:hover:not(:disabled) {
  filter: saturate(1.07);
  box-shadow: 0 12px 24px rgba(189, 63, 105, 0.25);
  transform: translateY(-1px);
}
.login-page .submit-button:focus-visible {
  box-shadow:
    var(--focus),
    0 9px 19px rgba(189, 63, 105, 0.19);
}
.login-page .submit-button:disabled {
  cursor: wait;
  opacity: 0.78;
}
.login-page .submit-arrow {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
.login-page .spinner {
  display: none;
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: login-spin 0.72s linear infinite;
}
.login-page .submit-button.is-loading .spinner {
  display: inline-block;
}
.login-page .submit-button.is-loading .submit-arrow {
  display: none;
}
.login-page .card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 18px;
  margin-top: 21px;
  color: var(--ink-faint);
  border-top: 1px solid var(--line);
  font-size: 8px;
  letter-spacing: 0.09em;
}
.login-page .footer-seal {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ink-soft);
  letter-spacing: 0.02em;
}
.login-page .footer-seal svg {
  width: 13px;
  height: 13px;
  fill: none;
  stroke: var(--cyan);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}
@keyframes login-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1100px) {
  .login-page .login-layout {
    grid-template-columns: minmax(0, 1fr) minmax(355px, 0.92fr);
    gap: 42px;
    padding: 38px;
  }
  .login-page .editorial-block {
    padding: 28px 0;
  }
  .login-page .artboard {
    display: none;
  }
}
@media (max-width: 820px) {
  .login-page .login-layout {
    width: min(520px, 100%);
    min-height: 100svh;
    grid-template-columns: 1fr;
    align-content: start;
    gap: 19px;
    padding: 24px 18px 28px;
  }
  .login-page .brand-stage {
    min-height: 0;
  }
  .login-page .brand-lockup {
    gap: 10px;
  }
  .login-page .brand-mark {
    width: 39px;
    height: 39px;
    border-radius: 13px 8px;
    font-size: 18px;
  }
  .login-page .brand-copy strong {
    font-size: 17px;
  }
  .login-page .brand-copy span {
    font-size: 8px;
  }
  .login-page .editorial-block {
    padding: 20px 0 14px;
  }
  .login-page .eyebrow {
    margin-bottom: 9px;
    font-size: 8px;
  }
  .login-page .editorial-block h1 {
    max-width: 370px;
    font-size: clamp(27px, 8vw, 38px);
    line-height: 1.28;
  }
  .login-page .editorial-block h1 span {
    display: inline-block;
  }
  .login-page .editorial-copy {
    max-width: 335px;
    margin-top: 8px;
    font-size: 10px;
    line-height: 1.65;
  }
  .login-page .artboard {
    display: none;
  }
  .login-page .stage-footer {
    display: none;
  }
  .login-page .login-card {
    max-width: none;
    padding: 25px 21px 21px;
    border-radius: 18px;
  }
  .login-page .card-kicker {
    margin-bottom: 11px;
  }
  .login-page .card-heading h2 {
    font-size: 23px;
  }
  .login-page .card-heading p {
    font-size: 10px;
  }
  .login-page .mode-switch {
    margin: 19px 0;
  }
  .login-page .login-form {
    gap: 14px;
  }
  .login-page .card-footer {
    margin-top: 17px;
    padding-top: 14px;
  }
}
@media (max-height: 640px) and (min-width: 821px) {
  .login-page .login-layout {
    padding-top: 24px;
    padding-bottom: 24px;
  }
  .login-page .brand-stage {
    min-height: auto;
  }
  .login-page .editorial-block {
    padding-top: 24px;
    padding-bottom: 20px;
  }
  .login-page .artboard {
    display: none;
  }
}
@media (max-width: 360px) {
  .login-page .login-layout {
    padding-right: 13px;
    padding-left: 13px;
  }
  .login-page .login-card {
    padding-right: 17px;
    padding-left: 17px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .login-page *,
  .login-page *::before,
  .login-page *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
