<script setup lang="ts">
/**
 * 系统设置页面：维护当前浏览器的主题、列表偏好及之后新建作品的录入默认值。
 * 提供限定范围的偏好重置、真实构建信息和管理员可用的后端服务健康检测。
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { getBroadcastTypes, getRegions } from '@/api/catalog'
import { getSystemHealth } from '@/api/system'
import { getCurrentUser } from '@/utils/auth'
import { useCatalogRefresh } from '@/utils/catalogChanges'
import AdminIcon from '@/components/admin/AdminIcon.vue'
import ArchiveSelect from '@/components/admin/ArchiveSelect.vue'
import {
  defaultPreferences,
  pageSizeValues,
  readPreferences,
  resolvePageSize,
  savePreferences,
  setThemeMode,
  themeMode,
  type PersonalPreferences,
  type ThemeMode,
} from '@/utils/preferences'
import type { DependencyHealth, NamedOption, SystemHealth } from '@/types/api'
import projectReadme from '../../../../README.md?url&no-inline'

const sections = [
  { id: 'appearance', name: '外观与列表', icon: 'sun' },
  { id: 'entry', name: '内容录入偏好', icon: 'edit' },
  { id: 'local', name: '本地数据', icon: 'settings' },
  { id: 'system', name: '系统信息', icon: 'info' },
]
const themes: { id: ThemeMode; name: string }[] = [
  { id: 'light', name: '浅色' },
  { id: 'dark', name: '深色' },
  { id: 'system', name: '跟随系统' },
]
const sortOptions = [
  { id: 'BROADCAST_DATE', name: '放送日期' },
  { id: 'PERSONAL_RATING', name: '个人评分' },
] as const
const suggestionGroups = [
  { key: 'linkTitles', label: '常用外链标题', placeholder: '输入标题，按回车添加' },
  { key: 'companyRoles', label: '常用制作公司职责', placeholder: '输入职责，按回车添加' },
] as const
type SuggestionKey = (typeof suggestionGroups)[number]['key']
const draft = reactive(readPreferences())
const saved = ref(JSON.stringify(draft))
const pendingThemeReset = ref(false)
const dirty = computed(
  () =>
    JSON.stringify(draft) !== saved.value ||
    pendingThemeReset.value ||
    !!suggestionInputs.linkTitles ||
    !!suggestionInputs.companyRoles,
)
const suggestionInputs = reactive({ linkTitles: '', companyRoles: '' })
const suggestionErrors = reactive({ linkTitles: '', companyRoles: '' })
const activeSection = ref('appearance')
const regions = ref<NamedOption[]>([])
const broadcastTypes = ref<NamedOption[]>([])
const catalogLoading = ref(false)
const catalogErrors = reactive({ regionId: '', broadcastTypeId: '' })
const catalogLoaded = reactive({ regionId: false, broadcastTypeId: false })
const status = ref('')
const saveError = ref('')
const resetScope = ref<'lists' | 'all' | null>(null)
const resetDialog = ref<HTMLDialogElement>()
const pageRoot = ref<HTMLElement>()
let catalogController: AbortController | undefined
let healthController: AbortController | undefined
const isAdmin = getCurrentUser()?.role === 'ADMIN'
const healthResult = ref<SystemHealth | null>(null)
const healthLoading = ref(false)
const healthError = ref('')
const healthServices = [
  { key: 'database', label: '数据库' },
  { key: 'redis', label: 'Redis' },
  { key: 'smtp', label: 'SMTP' },
] as const
const healthStatusText: Record<DependencyHealth['status'], string> = {
  UP: '连接正常',
  DOWN: '检查未通过',
  DISABLED: '未启用',
  UNCONFIGURED: '未配置',
  NOT_CHECKED: '未完成检测',
}
const healthCheckedAt = computed(() =>
  healthResult.value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' }).format(
        new Date(healthResult.value.checkedAt),
      )
    : '',
)
let resetFocus: HTMLElement | null = null
let previousOverflow: { body: string; html: string } | null = null
const buildTime = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'medium',
}).format(new Date(__BUILD_TIME__))
const appVersion = __APP_VERSION__
const resetItems = computed(() => [
  '默认分页：20 条（按列表实际选项适配）',
  '动画默认排序：放送日期',
  '排序方向：降序',
  ...(resetScope.value === 'all'
    ? [
        '主题模式：浅色',
        '默认地区与放送类型：不预设',
        `外链标题建议：${defaultPreferences().linkTitles.join('、')}`,
        `制作公司职责建议：${defaultPreferences().companyRoles.join('、')}`,
      ]
    : []),
])

defineExpose({ getCloseState: () => ({ dirty: dirty.value, submitting: false }) })
watch(themeMode, () => {
  pendingThemeReset.value = false
})
const refreshCatalogs = useCatalogRefresh(['broadcast'], loadCatalogs)
onMounted(() => {
  void refreshCatalogs()
  void loadHealth()
})
onDeactivated(() => {
  closeReset()
  healthController?.abort()
})
onBeforeUnmount(() => {
  catalogController?.abort()
  healthController?.abort()
  closeReset()
})

function scrollToSection(id: string) {
  activeSection.value = id
  pageRoot.value?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 仅管理员查询真实服务检测结果；失败或超时保持明确的错误状态，不推断服务正常。
async function loadHealth() {
  if (!isAdmin || healthLoading.value) return
  const controller = new AbortController()
  healthController = controller
  healthLoading.value = true
  healthError.value = ''
  let timedOut = false
  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, 15_000)
  try {
    const result = await getSystemHealth(controller.signal)
    if (!controller.signal.aborted) healthResult.value = result
  } catch (error) {
    if (controller.signal.aborted && !timedOut) return
    healthResult.value = null
    healthError.value = timedOut
      ? '检测请求超时，暂时无法获取服务状态。'
      : `无法获取检测结果：${error instanceof Error ? error.message : '请稍后重试。'}`
  } finally {
    window.clearTimeout(timeout)
    healthLoading.value = false
  }
}

function chooseTheme(value: ThemeMode) {
  try {
    setThemeMode(value)
    pendingThemeReset.value = false
    status.value = '主题已保存，与顶部主题按钮同步。'
    saveError.value = ''
  } catch {
    saveError.value = '无法保存主题，请检查浏览器是否允许本地存储。'
  }
}

async function loadCatalogs() {
  if (catalogLoading.value) return
  catalogController = new AbortController()
  catalogLoading.value = true
  const signal = catalogController.signal
  await Promise.all(
    [
      ['regionId', getRegions, regions] as const,
      ['broadcastTypeId', getBroadcastTypes, broadcastTypes] as const,
    ].map(async ([key, load, options]) => {
      catalogErrors[key] = ''
      try {
        options.value = await load(signal)
        catalogLoaded[key] = true
      } catch (error) {
        if (!signal.aborted)
          catalogErrors[key] = error instanceof Error ? error.message : '暂时无法读取，请重试。'
      }
    }),
  )
  catalogLoading.value = false
}

function catalogOptions(key: 'regionId' | 'broadcastTypeId') {
  const options = key === 'regionId' ? regions.value : broadcastTypes.value
  return draft[key] && !options.some((option) => String(option.id) === draft[key])
    ? [
        ...options,
        {
          id: Number(draft[key]),
          name: catalogLoaded[key] ? '原选项已不可用，请重新选择' : '已保存的选项（待读取）',
        },
      ]
    : options
}

function addSuggestion(key: SuggestionKey) {
  const value = suggestionInputs[key].trim()
  suggestionErrors[key] = !value
    ? '请输入建议项。'
    : draft[key].includes(value)
      ? '该建议项已经存在。'
      : ''
  if (suggestionErrors[key]) {
    pageRoot.value?.querySelector<HTMLInputElement>(`#${key}Input`)?.focus()
    return
  }
  draft[key].push(value)
  suggestionInputs[key] = ''
  status.value = ''
}

function clearSuggestionInputs() {
  suggestionInputs.linkTitles = suggestionInputs.companyRoles = ''
  suggestionErrors.linkTitles = suggestionErrors.companyRoles = ''
}

function undoChanges() {
  Object.assign(draft, JSON.parse(saved.value) as PersonalPreferences)
  clearSuggestionInputs()
  pendingThemeReset.value = false
  saveError.value = ''
  status.value = '已撤销本页未保存的修改；已生效的主题不变。'
}

// 校验建议项和目录引用后仅写入本地偏好，不更新作品资料或正在编辑的业务表单。
function save() {
  saveError.value = ''
  for (const { key } of suggestionGroups) {
    if (suggestionInputs[key].trim()) {
      saveError.value = '请先添加或清空尚未提交的建议项。'
      pageRoot.value?.querySelector<HTMLInputElement>(`#${key}Input`)?.focus()
      return
    }
  }
  for (const key of ['regionId', 'broadcastTypeId'] as const) {
    const options = key === 'regionId' ? regions.value : broadcastTypes.value
    if (
      catalogLoaded[key] &&
      draft[key] &&
      !options.some((option) => String(option.id) === draft[key])
    ) {
      saveError.value = '原地区或放送类型已不可用，请重新选择或设为“不预设”。'
      pageRoot.value?.querySelector<HTMLElement>(`#${key}`)?.focus()
      return
    }
  }
  try {
    savePreferences(draft)
    if (pendingThemeReset.value) setThemeMode('light')
    saved.value = JSON.stringify(draft)
    pendingThemeReset.value = false
    clearSuggestionInputs()
    status.value = '个人偏好已保存在当前浏览器，将用于之后打开的列表和新建作品。'
  } catch {
    saveError.value = '无法保存偏好，请检查浏览器是否允许本地存储。当前修改仍保留。'
  }
}

async function openReset(scope: 'lists' | 'all') {
  resetFocus = document.activeElement as HTMLElement | null
  resetScope.value = scope
  await nextTick()
  previousOverflow = {
    body: document.body.style.overflow,
    html: document.documentElement.style.overflow,
  }
  document.body.style.overflow = document.documentElement.style.overflow = 'hidden'
  resetDialog.value?.showModal()
}

function closeReset() {
  resetDialog.value?.close()
  resetScope.value = null
  if (previousOverflow) {
    document.body.style.overflow = previousOverflow.body
    document.documentElement.style.overflow = previousOverflow.html
    previousOverflow = null
  }
  if (resetFocus?.isConnected) resetFocus.focus()
  resetFocus = null
}

// 确认只把指定范围恢复为待保存默认值，不清空站点存储或登录状态。
function confirmReset() {
  const defaults = defaultPreferences()
  if (resetScope.value === 'all') {
    Object.assign(draft, defaults)
    clearSuggestionInputs()
    pendingThemeReset.value = themeMode.value !== 'light'
  } else
    Object.assign(draft, {
      pageSize: defaults.pageSize,
      sortBy: defaults.sortBy,
      sortDirection: defaults.sortDirection,
    })
  closeReset()
  saveError.value = ''
  status.value = '默认值已填入，点击“保存偏好”后生效。'
}
</script>

<template>
  <main ref="pageRoot" class="settings-page">
    <header class="page-intro">
      <div>
        <p class="eyebrow">PERSONAL WORKSPACE / PREFERENCES</p>
        <h1>系统设置 <span>Preferences</span></h1>
        <p class="intro-copy">让资料库按你的习惯工作。这里的设置只影响当前浏览器的个人偏好。</p>
      </div>
      <span class="scope-tag"><AdminIcon name="user" />仅当前浏览器</span>
    </header>
    <div class="settings-layout">
      <aside class="section-nav" aria-label="本页设置导航">
        <p class="section-nav-title">PREFERENCES / 目录</p>
        <button
          v-for="(section, index) in sections"
          :key="section.id"
          type="button"
          class="section-link"
          :class="{ active: activeSection === section.id }"
          @click="scrollToSection(section.id)"
        >
          <AdminIcon :name="section.icon" />{{ section.name
          }}<span class="number">0{{ index + 1 }}</span>
        </button>
        <section class="preview-card" aria-label="当前设置预览">
          <h2>当前预览</h2>
          <dl class="preview-table">
            <div>
              <dt>主题</dt>
              <dd>{{ themes.find((item) => item.id === themeMode)?.name }}</dd>
            </div>
            <div>
              <dt>默认条数</dt>
              <dd>{{ draft.pageSize }} 条</dd>
            </div>
            <div>
              <dt>动画排序</dt>
              <dd>
                {{ sortOptions.find((item) => item.id === draft.sortBy)?.name }}
                {{ draft.sortDirection === 'DESC' ? '↓' : '↑' }}
              </dd>
            </div>
          </dl>
          <p class="preview-foot">{{ dirty ? '本页修改尚未保存。' : '尚无本页修改。' }}</p>
        </section>
      </aside>
      <form class="settings-form" novalidate @submit.prevent="save">
        <section id="appearance" class="settings-card" aria-labelledby="appearanceTitle">
          <header class="section-head">
            <span class="section-icon"><AdminIcon name="sun" /></span>
            <div>
              <h2 id="appearanceTitle">外观与列表</h2>
              <p>让显示方式与检索习惯保持一致。</p>
            </div>
            <span class="section-mark">01</span>
          </header>
          <div class="section-body">
            <span id="themeLabel" class="setting-label">主题模式</span>
            <div class="theme-options" role="group" aria-labelledby="themeLabel">
              <button
                v-for="theme in themes"
                :key="theme.id"
                type="button"
                class="theme-option"
                :aria-pressed="themeMode === theme.id"
                @click="chooseTheme(theme.id)"
              >
                <span class="theme-mini" :class="theme.id" aria-hidden="true"
                  ><span><i></i><i></i><i></i></span></span
                ><span class="theme-caption"
                  >{{ theme.name }}<span class="theme-check"><AdminIcon name="check" /></span
                ></span>
              </button>
            </div>
            <p class="field-hint">
              主题即时生效并保存，与顶部按钮同步；跟随系统时自动响应系统明暗变化。
            </p>
            <div class="settings-divider"></div>
            <div class="list-settings">
              <div>
                <span id="sizeLabel" class="setting-label">默认分页条数</span>
                <div class="segmented" role="group" aria-labelledby="sizeLabel">
                  <button
                    v-for="size in pageSizeValues"
                    :key="size"
                    type="button"
                    :aria-pressed="draft.pageSize === size"
                    @click="draft.pageSize = size"
                  >
                    {{ size }} 条
                  </button>
                </div>
              </div>
              <div>
                <span id="sortLabel" class="setting-label">动画默认排序</span>
                <div class="sort-control">
                  <div class="segmented" role="group" aria-labelledby="sortLabel">
                    <button
                      v-for="option in sortOptions"
                      :key="option.id"
                      type="button"
                      :aria-pressed="draft.sortBy === option.id"
                      @click="draft.sortBy = option.id"
                    >
                      {{ option.name }}
                    </button>
                  </div>
                  <button
                    id="sortDirection"
                    class="direction-button"
                    type="button"
                    :aria-label="`当前${draft.sortDirection === 'DESC' ? '降序' : '升序'}，点击切换排序方向`"
                    @click="draft.sortDirection = draft.sortDirection === 'DESC' ? 'ASC' : 'DESC'"
                  >
                    <AdminIcon
                      :name="draft.sortDirection === 'DESC' ? 'sort-desc' : 'sort-asc'"
                    /></button
                  ><span class="direction-caption">{{
                    draft.sortDirection === 'DESC' ? '降序' : '升序'
                  }}</span>
                </div>
              </div>
            </div>
            <div class="notice">
              <AdminIcon name="info" />
              <p>默认分页与排序只用于新列表首次初始化或重置筛选，不覆盖已打开列表的临时选择。</p>
            </div>
            <table class="compatibility">
              <caption>
                不同列表如何采用分页偏好
              </caption>
              <thead>
                <tr>
                  <th>列表</th>
                  <th>现有可选条数</th>
                  <th>初始值预览</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>动画</td>
                  <td>{{ pageSizeValues.join(' / ') }}</td>
                  <td>{{ resolvePageSize(pageSizeValues, 20, draft.pageSize) }}</td>
                </tr>
                <tr>
                  <td>标签 · 系列 · 制作公司</td>
                  <td>{{ pageSizeValues.join(' / ') }}</td>
                  <td>{{ resolvePageSize(pageSizeValues, 20, draft.pageSize) }}</td>
                </tr>
                <tr>
                  <td>用户管理</td>
                  <td>{{ pageSizeValues.join(' / ') }}</td>
                  <td>{{ resolvePageSize(pageSizeValues, 20, draft.pageSize) }}</td>
                </tr>
                <tr>
                  <td>公司详情 · 关联动画</td>
                  <td>{{ pageSizeValues.join(' / ') }}</td>
                  <td>{{ resolvePageSize(pageSizeValues, 20, draft.pageSize) }}</td>
                </tr>
              </tbody>
            </table>
            <p class="field-hint">
              所有分页列表统一提供 10 / 20 / 50 条，均可使用已保存的默认分页条数。
            </p>
          </div>
        </section>
        <section id="entry" class="settings-card" aria-labelledby="entryTitle">
          <header class="section-head">
            <span class="section-icon"><AdminIcon name="edit" /></span>
            <div>
              <h2 id="entryTitle">内容录入偏好</h2>
              <p>减少新建作品时的重复填写。</p>
            </div>
            <span class="section-mark">02</span>
          </header>
          <div class="section-body">
            <div class="content-grid">
              <div
                v-for="field in [
                  { key: 'regionId' as const, label: '默认地区', path: '/admin/regions' },
                  {
                    key: 'broadcastTypeId' as const,
                    label: '默认放送类型',
                    path: '/admin/broadcast-types',
                  },
                ]"
                :key="field.key"
                class="field"
              >
                <label :for="field.key">{{ field.label }}</label
                ><ArchiveSelect
                  :id="field.key"
                  v-model="draft[field.key]"
                  :options="catalogOptions(field.key)"
                  placeholder="不预设"
                  :label="field.label"
                />
                <div class="catalog-note">
                  <span :class="{ 'field-error': catalogErrors[field.key] }">{{
                    catalogErrors[field.key] ||
                    (catalogLoading ? '正在读取…' : `已读取 ${catalogOptions(field.key).length} 项`)
                  }}</span
                  ><RouterLink :to="field.path"
                    >{{ field.key === 'regionId' ? '地区管理' : '放送类型管理' }} ↗</RouterLink
                  >
                </div>
              </div>
            </div>
            <div class="catalog-refresh">
              <p>选项来自现有资料目录，在原管理页面维护。</p>
              <button
                class="text-button"
                type="button"
                :disabled="catalogLoading"
                @click="refreshCatalogs"
              >
                {{ catalogLoading ? '正在读取…' : '重新读取选项' }}
              </button>
            </div>
            <div class="settings-divider"></div>
            <div
              v-for="group in suggestionGroups"
              :key="group.key"
              class="suggestion-section field"
            >
              <label :for="`${group.key}Input`">{{ group.label }}</label>
              <div class="chip-list" :aria-label="group.label">
                <span v-for="(text, index) in draft[group.key]" :key="text" class="suggestion-chip"
                  ><span>{{ text }}</span
                  ><button
                    type="button"
                    :aria-label="`移除${text}`"
                    @click="draft[group.key].splice(index, 1)"
                  >
                    <AdminIcon name="close" /></button></span
                ><span v-if="!draft[group.key].length" class="empty-suggestions"
                  >暂无建议项，可在下方添加。</span
                >
              </div>
              <div class="add-row">
                <input
                  :id="`${group.key}Input`"
                  v-model="suggestionInputs[group.key]"
                  :placeholder="group.placeholder"
                  autocomplete="off"
                  :aria-invalid="!!suggestionErrors[group.key]"
                  :aria-describedby="`${group.key}Error`"
                  @input="suggestionErrors[group.key] = ''"
                  @keydown.enter.prevent="addSuggestion(group.key)"
                /><button class="secondary-button" type="button" @click="addSuggestion(group.key)">
                  添加
                </button>
              </div>
              <p :id="`${group.key}Error`" class="field-error" role="status">
                {{ suggestionErrors[group.key] }}
              </p>
            </div>
            <p class="field-hint">建议项用于输入联想，录入时仍可自行填写其他标题或职责。</p>
            <div class="notice">
              <AdminIcon name="info" />
              <p>仅用于之后新建作品，不修改已有作品，不覆盖已打开的新建或修改表单。</p>
            </div>
          </div>
        </section>
        <section id="local" class="settings-card" aria-labelledby="localTitle">
          <header class="section-head">
            <span class="section-icon"><AdminIcon name="settings" /></span>
            <div>
              <h2 id="localTitle">本地数据</h2>
              <p>只恢复个人偏好，不删除业务内容。</p>
            </div>
            <span class="section-mark">03</span>
          </header>
          <div class="section-body">
            <div class="reset-row">
              <div>
                <h3>重置列表偏好</h3>
                <p>恢复默认 20 条、放送日期排序、降序。主题与内容录入偏好不变。</p>
              </div>
              <button
                id="resetLists"
                class="secondary-button"
                type="button"
                @click="openReset('lists')"
              >
                重置列表偏好
              </button>
            </div>
            <div class="reset-row">
              <div>
                <h3>恢复全部个人偏好</h3>
                <p>同时恢复浅色主题、内容录入默认值与列表偏好。确认前可查看完整范围。</p>
              </div>
              <button
                id="resetAll"
                class="secondary-button reset-all-button"
                type="button"
                @click="openReset('all')"
              >
                恢复全部个人偏好
              </button>
            </div>
            <div class="notice">
              <AdminIcon name="admin" />
              <p>确认后填入待保存的默认值。登录凭证、作品资料和未提交的编辑内容均不会被删除。</p>
            </div>
          </div>
        </section>
        <section id="system" class="settings-card" aria-labelledby="systemTitle">
          <header class="section-head">
            <span class="section-icon"><AdminIcon name="info" /></span>
            <div>
              <h2 id="systemTitle">系统信息</h2>
              <p>只展示能够核实的信息。</p>
            </div>
            <span class="section-mark">04</span>
          </header>
          <div class="section-body">
            <dl class="system-info">
              <div>
                <dt>应用版本</dt>
                <dd>{{ appVersion }}</dd>
                <p class="metadata-note">来源：前端 package.json 声明版本。</p>
              </div>
              <div>
                <dt>前端构建时间</dt>
                <dd>{{ buildTime }}</dd>
                <p class="metadata-note">由 Vite 在本次构建时写入；开发环境为启动时间。</p>
              </div>
              <div>
                <dt class="health-heading">
                  <span>当前服务连接情况</span>
                  <button
                    v-if="isAdmin"
                    class="health-refresh"
                    type="button"
                    aria-label="刷新服务连接检测"
                    title="刷新服务连接检测"
                    :disabled="healthLoading"
                    @click="loadHealth"
                  >
                    <AdminIcon name="refresh" />
                  </button>
                </dt>
                <dd class="health-results" :aria-busy="healthLoading">
                  <span v-if="!isAdmin" class="unknown">仅管理员可查看</span>
                  <span v-else-if="healthLoading" class="unknown" role="status">检测中</span>
                  <p v-else-if="healthError" class="health-error" role="alert">{{ healthError }}</p>
                  <ul
                    v-else-if="healthResult"
                    class="health-services"
                    aria-label="依赖连接检测结果"
                  >
                    <li v-for="service in healthServices" :key="service.key">
                      <span>{{ service.label }}</span>
                      <span
                        class="health-state"
                        :class="`health-${healthResult[service.key].status.toLowerCase()}`"
                      >
                        <AdminIcon
                          :name="healthResult[service.key].status === 'UP' ? 'check' : 'info'"
                        />
                        {{ healthStatusText[healthResult[service.key].status] }}
                      </span>
                      <small>{{ healthResult[service.key].message }}</small>
                    </li>
                  </ul>
                  <span v-else class="unknown">尚未检测</span>
                </dd>
                <p v-if="healthResult && !healthLoading" class="metadata-note">
                  检测时间：{{ healthCheckedAt }}
                </p>
              </div>
              <div>
                <dt>偏好存储范围</dt>
                <dd>当前浏览器</dd>
                <p class="metadata-note">本地个人偏好，不是服务器全局配置。</p>
              </div>
            </dl>
            <div class="doc-links">
              <a class="doc-link" :href="projectReadme" target="_blank" rel="noopener"
                ><AdminIcon name="series" />前端项目说明 ↗</a
              >
            </div>
          </div>
        </section>
        <footer class="savebar" :class="{ error: saveError }">
          <div class="save-status" role="status" aria-live="polite">
            <strong>{{
              saveError || (dirty ? '本页修改尚未保存' : status || '当前没有待保存的修改')
            }}</strong
            ><span>{{
              pendingThemeReset
                ? '保存后将同时恢复浅色主题。'
                : '主题即时保存，其他偏好待保存后用于新页面。'
            }}</span>
          </div>
          <div class="save-actions">
            <button class="secondary-button" type="button" :disabled="!dirty" @click="undoChanges">
              撤销修改</button
            ><button id="saveSettings" class="primary-button" type="submit" :disabled="!dirty">
              保存偏好
            </button>
          </div>
        </footer>
      </form>
    </div>
    <Teleport to="body"
      ><dialog
        v-if="resetScope"
        ref="resetDialog"
        class="settings-reset-dialog"
        aria-labelledby="resetTitle"
        aria-describedby="resetDescription resetProtection"
        @cancel.prevent="closeReset"
      >
        <span class="dialog-mark"><AdminIcon name="reset" /></span>
        <h2 id="resetTitle">
          {{ resetScope === 'lists' ? '重置列表偏好？' : '恢复全部个人偏好？' }}
        </h2>
        <p id="resetDescription">以下设置将恢复默认值，仍需保存后生效：</p>
        <ul class="reset-scope">
          <li v-for="item in resetItems" :key="item">{{ item }}</li>
        </ul>
        <p id="resetProtection">不会删除登录凭证、作品资料或未提交的编辑内容。</p>
        <div class="dialog-actions">
          <button class="secondary-button" type="button" autofocus @click="closeReset">取消</button
          ><button id="confirmReset" class="primary-button" type="button" @click="confirmReset">
            恢复这些默认值
          </button>
        </div>
      </dialog></Teleport
    >
  </main>
</template>

<style scoped>
.settings-page {
  width: min(1310px, 100%);
  margin: 0 auto;
}
.settings-page *,
.settings-reset-dialog * {
  box-sizing: border-box;
}
.settings-page svg,
.settings-reset-dialog svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.settings-page button,
.settings-reset-dialog button {
  font-family: var(--font-body);
  cursor: pointer;
}
.settings-page button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.settings-page button:focus-visible,
.settings-reset-dialog button:focus-visible,
.doc-link:focus-visible {
  outline: none;
  box-shadow: var(--focus);
}
.page-intro {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 25px;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 10px;
  color: var(--accent-strong);
  font-size: 10px;
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
  font: 700 30px/1.3 var(--font-display);
  letter-spacing: -0.035em;
}
h1 span {
  margin-left: 6px;
  color: var(--ink-faint);
  font: 400 12px var(--font-body);
  letter-spacing: 0;
}
.intro-copy {
  margin: 9px 0 0;
  color: var(--ink-soft);
  font-size: 12px;
}
.scope-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  color: var(--violet);
  background: var(--violet-soft);
  border: 1px solid var(--line);
  border-radius: 9px;
  white-space: nowrap;
  font-size: 11px;
}
.scope-tag svg {
  width: 14px;
  height: 14px;
}
.settings-layout {
  display: grid;
  grid-template-columns: 196px minmax(0, 1fr);
  align-items: start;
  gap: 20px;
}
.section-nav {
  position: sticky;
  top: 140px;
}
.section-nav-title {
  margin: 0 0 11px 10px;
  color: var(--ink-faint);
  font-size: 10px;
  letter-spacing: 0.12em;
}
.section-link {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 9px;
  min-height: 40px;
  padding: 8px 11px;
  margin-bottom: 5px;
  color: var(--ink-soft);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 12px;
  text-align: left;
}
.section-link:hover {
  color: var(--accent-strong);
  background: var(--surface);
  border-color: var(--line);
}
.section-link.active {
  color: var(--accent-strong);
  background: var(--surface-solid);
  border-color: var(--line);
  box-shadow: var(--shadow-soft);
}
.section-link svg {
  width: 15px;
  height: 15px;
}
.number {
  margin-left: auto;
  color: var(--ink-faint);
  font-size: 10px;
}
.preview-card {
  margin-top: 22px;
  padding: 17px 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.preview-card h2 {
  margin: 0 0 12px;
  font: 700 14px var(--font-display);
}
.preview-table {
  display: grid;
  gap: 11px;
  margin: 0;
}
.preview-table > div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11px;
}
.preview-table dt {
  color: var(--ink-faint);
}
.preview-table dd {
  margin: 0;
  color: var(--ink-soft);
  font-weight: 650;
}
.preview-foot {
  margin: 14px 0 0;
  padding-top: 11px;
  color: var(--ink-faint);
  border-top: 1px dashed var(--line-strong);
  font-size: 10px;
  line-height: 1.8;
}
.settings-form {
  display: grid;
  gap: 18px;
  min-width: 0;
}
.settings-card {
  min-width: 0;
  scroll-margin-top: 140px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow-soft);
}
.section-head {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 20px 22px 17px;
  border-bottom: 1px solid var(--line);
}
.section-icon {
  display: grid;
  width: 35px;
  height: 35px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 11px;
}
.section-head h2 {
  margin: 0;
  font: 700 17px/1.45 var(--font-display);
}
.section-head p {
  margin: 3px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.section-mark {
  margin-left: auto;
  color: var(--ink-faint);
  font-size: 10px;
}
.section-body {
  padding: 22px;
}
.setting-label {
  display: block;
  margin-bottom: 8px;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 650;
}
.theme-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.theme-option {
  position: relative;
  padding: 10px;
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 12px;
  text-align: left;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}
.theme-option:hover {
  border-color: var(--line-strong);
  box-shadow: var(--shadow-soft);
}
.theme-option[aria-pressed='true'] {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft);
}
.theme-mini {
  position: relative;
  display: flex;
  height: 66px;
  gap: 6px;
  padding: 7px;
  overflow: hidden;
  background: #f2f0f6;
  border: 1px solid rgba(61, 56, 88, 0.09);
  border-radius: 7px;
}
.theme-mini::before {
  width: 23%;
  content: '';
  background: #242335;
  border-radius: 3px;
}
.theme-mini > span {
  display: grid;
  flex: 1;
  align-content: start;
  gap: 5px;
  padding-top: 2px;
}
.theme-mini i {
  display: block;
  height: 7px;
  background: #fff;
  border-radius: 2px;
}
.theme-mini i:first-child {
  width: 58%;
  background: #eab2c5;
}
.theme-mini.dark {
  background: #212031;
}
.theme-mini.dark::before {
  background: #131420;
}
.theme-mini.dark i {
  background: #3a374f;
}
.theme-mini.dark i:first-child {
  background: #ad668b;
}
.theme-mini.system {
  background: linear-gradient(90deg, #f2f0f6 50%, #212031 50%);
}
.theme-mini.system i {
  background: linear-gradient(90deg, #fff 38%, #3a374f 38%);
}
.theme-mini.system i:first-child {
  background: #d48aa7;
}
.theme-caption {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  margin-top: 9px;
  color: var(--ink-soft);
  font-size: 12px;
}
.theme-check {
  display: grid;
  width: 15px;
  height: 15px;
  place-items: center;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  color: transparent;
}
.theme-check svg {
  width: 10px;
  height: 10px;
}
.theme-option[aria-pressed='true'] .theme-check {
  color: #fff;
  background: var(--accent);
  border-color: var(--accent);
}
.field-hint {
  margin: 8px 0 0;
  color: var(--ink-faint);
  font-size: 11px;
  line-height: 1.8;
}
.settings-divider {
  height: 1px;
  margin: 22px 0;
  background: var(--line);
}
.list-settings {
  display: grid;
  grid-template-columns: 0.8fr 1.2fr;
  gap: 20px;
}
.segmented {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 40px;
  padding: 3px;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.segmented button {
  min-height: 32px;
  padding: 0 13px;
  color: var(--ink-soft);
  background: transparent;
  border: 0;
  border-radius: 7px;
  font-size: 12px;
}
.segmented button:hover {
  background: var(--surface-hover);
}
.segmented button[aria-pressed='true'] {
  color: var(--accent-strong);
  background: var(--surface-solid);
  box-shadow: 0 2px 7px rgba(37, 31, 67, 0.07);
}
.sort-control {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.direction-button {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  color: var(--violet);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 10px;
}
.direction-button:hover {
  background: var(--violet-soft);
}
.direction-caption {
  color: var(--ink-soft);
  font-size: 11px;
}
.notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 11px 12px;
  margin: 16px 0 0;
  color: var(--violet);
  background: color-mix(in srgb, var(--violet-soft) 55%, transparent);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 11px;
  line-height: 1.85;
}
.notice svg {
  width: 14px;
  height: 14px;
  margin-top: 3px;
}
.notice p {
  margin: 0;
}
.compatibility {
  width: 100%;
  border-collapse: collapse;
  margin-top: 17px;
  text-align: left;
  font-size: 11px;
}
.compatibility caption {
  margin-bottom: 8px;
  color: var(--ink-soft);
  text-align: left;
  font-weight: 650;
}
.compatibility th {
  padding: 8px 9px;
  color: var(--ink-faint);
  background: var(--surface-muted);
  border-bottom: 1px solid var(--line);
  font-weight: 500;
}
.compatibility td {
  padding: 9px;
  color: var(--ink-soft);
  border-bottom: 1px solid var(--line);
}
.compatibility td:last-child {
  color: var(--accent-strong);
  font-weight: 650;
  text-align: center;
}
.compatibility th:last-child {
  text-align: center;
}
.compatibility tr:last-child td {
  border-bottom: 0;
}
.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.field {
  min-width: 0;
}
.field label {
  display: block;
  margin-bottom: 7px;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 650;
}
.field input {
  width: 100%;
  min-width: 0;
  height: 40px;
  padding: 0 12px;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 9px;
  outline: none;
  font: 12px var(--font-body);
}
.field input::placeholder {
  color: var(--ink-faint);
}
.field input:hover {
  border-color: var(--line-strong);
}
.field input:focus {
  border-color: var(--accent);
  box-shadow: var(--focus);
}
.field :deep(.archive-select-trigger) {
  height: 40px;
  font-size: 12px;
}
.field :deep(.archive-select-option) {
  font-size: 12px;
}
.catalog-note {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 9px;
  color: var(--ink-faint);
  font-size: 10px;
}
.catalog-note a,
.doc-link {
  color: var(--violet);
  text-underline-offset: 3px;
}
.catalog-note a:hover,
.doc-link:hover {
  color: var(--accent-strong);
}
.catalog-refresh {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 15px;
}
.catalog-refresh p {
  margin: 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.text-button {
  min-height: 29px;
  padding: 4px 7px;
  color: var(--violet);
  background: transparent;
  border: 0;
  border-radius: 6px;
  white-space: nowrap;
  font-size: 11px;
}
.text-button:hover {
  color: var(--accent-strong);
  background: var(--surface-hover);
}
.suggestion-section + .suggestion-section {
  margin-top: 21px;
}
.chip-list {
  display: flex;
  min-height: 31px;
  flex-wrap: wrap;
  gap: 7px;
  margin: 9px 0 10px;
}
.suggestion-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 5px 6px 5px 10px;
  color: var(--violet);
  background: var(--violet-soft);
  border: 1px solid var(--line);
  border-radius: 7px;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.suggestion-chip button {
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  color: var(--violet);
  background: transparent;
  border: 0;
  border-radius: 5px;
}
.suggestion-chip button:hover {
  color: var(--danger);
  background: var(--surface-solid);
}
.suggestion-chip svg {
  width: 12px;
  height: 12px;
}
.add-row {
  display: flex;
  gap: 8px;
  max-width: 430px;
}
.add-row button {
  min-width: 64px;
  min-height: 40px;
  font-size: 12px;
}
.field-error {
  margin: 6px 0 0;
  color: var(--danger);
  font-size: 11px;
}
.field-error:empty {
  display: none;
}
.empty-suggestions {
  padding: 6px 0;
  color: var(--ink-faint);
  font-size: 11px;
}
.reset-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.reset-row + .reset-row {
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
}
.reset-row h3 {
  margin: 0 0 5px;
  font-size: 13px;
  font-weight: 650;
}
.reset-row p {
  max-width: 390px;
  margin: 0;
  color: var(--ink-faint);
  font-size: 11px;
  line-height: 1.8;
}
.reset-row button {
  flex: 0 0 auto;
  font-size: 12px;
}
.reset-all-button {
  color: var(--danger);
  border-color: var(--danger-soft);
}
.reset-all-button:hover {
  color: var(--danger);
  background: var(--danger-soft);
  border-color: var(--danger);
}
.system-info {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 24px;
  margin: 0;
}
.system-info > div {
  min-width: 0;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}
.system-info dt {
  margin-bottom: 6px;
  color: var(--ink-faint);
  font-size: 11px;
}
.system-info dd {
  margin: 0;
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.unknown {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}
.unknown svg {
  width: 12px;
  height: 12px;
}
.system-info .health-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.health-refresh {
  display: grid;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--ink-soft);
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 6px;
}
.health-refresh:hover:not(:disabled) {
  color: var(--accent-strong);
  border-color: var(--line-strong);
}
.health-refresh svg {
  width: 15px;
  height: 15px;
}
.health-results {
  min-height: 28px;
}
.health-services {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.health-services li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 3px 10px;
  font-size: 12px;
}
.health-state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ink-soft);
  font-size: 11px;
  font-weight: 500;
}
.health-state svg {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
}
.health-up {
  color: var(--success, #25815b);
}
.health-down {
  color: var(--danger);
}
.health-services small {
  grid-column: 1 / -1;
  color: var(--ink-faint);
  font-size: 10px;
  font-weight: 400;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.health-error {
  margin: 0;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.metadata-note {
  margin: 7px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
  font-weight: 400;
  line-height: 1.8;
}
.doc-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  margin-top: 18px;
}
.doc-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.doc-link svg {
  width: 14px;
  height: 14px;
}
.savebar {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  min-height: 68px;
  padding: 12px 20px;
  background: color-mix(in srgb, var(--surface-solid) 94%, transparent);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(16px);
}
.save-status {
  min-width: 0;
}
.save-status strong {
  display: block;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 650;
}
.save-status span {
  display: block;
  margin-top: 3px;
  color: var(--ink-faint);
  font-size: 10px;
}
.save-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
.save-actions button {
  min-width: 95px;
}
.savebar.error .save-status strong {
  color: var(--danger);
}
.settings-reset-dialog {
  max-height: calc(100dvh - 40px);
  width: min(455px, calc(100% - 32px));
  padding: 25px;
  overflow-y: auto;
  overscroll-behavior: contain;
  color: var(--ink);
  background: var(--surface-solid);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: var(--shadow);
  font-family: var(--font-body);
}
.settings-reset-dialog::backdrop {
  background: rgba(21, 20, 35, 0.4);
  backdrop-filter: blur(4px);
}
.dialog-mark {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  margin-bottom: 15px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 13px;
}
.settings-reset-dialog h2 {
  margin: 0 0 8px;
  font: 700 19px var(--font-display);
}
.settings-reset-dialog p {
  margin: 0;
  color: var(--ink-soft);
  font-size: 12px;
  line-height: 1.85;
}
.reset-scope {
  display: grid;
  gap: 8px;
  padding: 13px 13px 13px 29px;
  margin: 15px 0;
  background: var(--surface-muted);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--ink-soft);
  font-size: 12px;
}
.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}
@media (max-width: 1200px) {
  .settings-layout {
    grid-template-columns: 164px minmax(0, 1fr);
    gap: 16px;
  }
  .list-settings {
    grid-template-columns: 1fr;
    gap: 17px;
  }
  .preview-card {
    padding: 15px 11px;
  }
}
@media (max-width: 1000px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }
  .section-nav {
    position: static;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .section-nav-title,
  .preview-card {
    display: none;
  }
  .section-link {
    width: auto;
    margin: 0;
    background: var(--surface);
    font-size: 11px;
    gap: 6px;
    padding: 7px 9px;
  }
  .section-link .number {
    display: none;
  }
}
@media (max-width: 620px) {
  .page-intro {
    align-items: flex-start;
    margin-bottom: 18px;
  }
  h1 {
    font-size: 26px;
  }
  h1 span,
  .scope-tag {
    display: none;
  }
  .intro-copy {
    font-size: 11px;
  }
  .section-nav {
    gap: 5px;
  }
  .section-link {
    flex: 1 1 calc(50% - 5px);
  }
  .section-head {
    padding: 17px;
  }
  .section-head p {
    font-size: 10px;
  }
  .section-body {
    padding: 17px;
  }
  .theme-options {
    gap: 7px;
  }
  .theme-option {
    padding: 7px;
  }
  .theme-mini {
    height: 52px;
    padding: 5px;
  }
  .theme-caption {
    font-size: 11px;
  }
  .content-grid {
    grid-template-columns: 1fr;
    gap: 17px;
  }
  .reset-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .reset-row button {
    width: 100%;
  }
  .system-info {
    grid-template-columns: 1fr;
  }
  .catalog-refresh {
    align-items: flex-start;
  }
  .compatibility th,
  .compatibility td {
    padding: 8px 5px;
    font-size: 10px;
  }
  .savebar {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;
  }
  .save-actions {
    width: 100%;
  }
  .save-actions button {
    flex: 1;
  }
  .settings-reset-dialog {
    padding: 23px 20px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .settings-page * {
    transition: none !important;
    scroll-behavior: auto !important;
  }
}
</style>
