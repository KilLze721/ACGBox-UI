<script setup lang="ts">
import {
  cloneVNode,
  computed,
  defineComponent,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  watchEffect,
  type Component,
  type ComponentPublicInstance,
  type VNode,
} from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AdminIcon from '@/components/admin/AdminIcon.vue'

interface WorkspaceTab {
  id: string
  path: string
  fullPath: string
  title: string
  icon: string
  closable: boolean
  ordinal: number
  cacheName: string
}

interface TabCloseState {
  dirty: boolean
  submitting: boolean
}

interface CloseAwarePage {
  getCloseState?: () => TabCloseState
}

interface PendingTabClose {
  ids: string[]
  keepId: string | null
  affectedTitles: string[]
  submitting: boolean
}

const route = useRoute()
const router = useRouter()
const sidebarCollapsed = ref(false)
const mobileSidebarOpen = ref(false)
const tabViewport = ref<HTMLElement>()
const canScrollTabsLeft = ref(false)
const canScrollTabsRight = ref(false)
const darkTheme = ref(false)
const activeTabId = ref('dashboard')
const pendingTabClose = ref<PendingTabClose | null>(null)
const pageWrappers = new Map<string, Component>()
const pageInstances = new Map<string, CloseAwarePage>()
const tabSession = Date.now().toString(36)
let tabSequence = 0

const menuItems = computed(() =>
  router
    .getRoutes()
    .filter((item) => item.meta.showInMenu)
    .sort((left, right) => (left.meta.order ?? 0) - (right.meta.order ?? 0)),
)

const activeMenu = computed(() => route.meta.activeMenu ?? route.path)
const breadcrumbSection = computed(() => route.meta.section ?? '管理后台')
const currentTitle = computed(() => route.meta.title)

const workspaceTabs = ref<WorkspaceTab[]>([
  {
    id: 'dashboard',
    path: '/admin/dashboard',
    fullPath: '/admin/dashboard',
    title: '数据概览',
    icon: 'dashboard',
    closable: false,
    ordinal: 1,
    cacheName: 'WorkspaceTab-dashboard',
  },
])

const activeTab = computed(() => workspaceTabs.value.find((tab) => tab.id === activeTabId.value))
const cachedTabNames = computed(() => workspaceTabs.value.map((tab) => tab.cacheName))
const canCloseOtherTabs = computed(() =>
  workspaceTabs.value.some((tab) => tab.closable && tab.id !== activeTabId.value),
)

watch(
  () => route.fullPath,
  () => {
    mobileSidebarOpen.value = false
    openCurrentRouteTab()
  },
  { immediate: true },
)

watchEffect(() => {
  const pending = pendingTabClose.value
  if (!pending?.submitting) return
  const stillSubmitting = workspaceTabs.value.some(
    (tab) => pending.ids.includes(tab.id) && getCloseState(tab).submitting,
  )
  if (!stillSubmitting) pendingTabClose.value = null
})

onMounted(() => {
  darkTheme.value = localStorage.getItem('acgbox-theme') === 'dark'
  document.body.dataset.theme = darkTheme.value ? 'dark' : 'light'
  window.addEventListener('resize', updateTabScrollState)
  updateTabScrollState()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateTabScrollState)
})

function getCurrentRouteIcon() {
  if (route.meta.icon) return route.meta.icon

  const menuRoute = router.getRoutes().find((item) => item.path === route.meta.activeMenu)
  return menuRoute?.meta.icon ?? 'anime'
}

function openCurrentRouteTab() {
  if (route.path === '/admin/dashboard') {
    activeTabId.value = 'dashboard'
    if (route.fullPath !== '/admin/dashboard') void router.replace('/admin/dashboard')
    void scrollActiveTabIntoView()
    return
  }

  let tab = workspaceTabs.value.find((item) => item.fullPath === route.fullPath)
  if (!tab) {
    const ordinal =
      Math.max(
        0,
        ...workspaceTabs.value
          .filter((item) => item.path === route.path)
          .map((item) => item.ordinal),
      ) + 1
    const id = `tab-${tabSession}-${++tabSequence}`
    tab = {
      id,
      path: route.path,
      fullPath: route.fullPath,
      title: `${route.meta.title}${ordinal > 1 ? `(${ordinal})` : ''}`,
      icon: getCurrentRouteIcon(),
      closable: true,
      ordinal,
      cacheName: `WorkspaceTab-${id}`,
    }
    workspaceTabs.value.push(tab)
  }
  activeTabId.value = tab.id

  void scrollActiveTabIntoView()
}

function getTabWrapper(component: VNode) {
  const tab = activeTab.value
  if (!tab) return null
  const existing = pageWrappers.get(tab.id)
  if (existing) return existing

  const wrapper = markRaw(
    defineComponent({
      name: tab.cacheName,
      setup() {
        return () =>
          cloneVNode(
            component,
            {
              ref: (instance: Element | ComponentPublicInstance | null) => {
                if (instance) pageInstances.set(tab.id, instance as CloseAwarePage)
                else pageInstances.delete(tab.id)
              },
            },
            true,
          )
      },
    }),
  )
  pageWrappers.set(tab.id, wrapper)
  return wrapper
}

function openMenuPage(path: string) {
  mobileSidebarOpen.value = false
  if (path === '/admin/dashboard') {
    void router.push(path)
    return
  }
  if (!workspaceTabs.value.some((tab) => tab.path === path)) {
    void router.push(path)
    return
  }
  const id = `tab-${tabSession}-${++tabSequence}`
  // 同一路由通过内部查询参数区分标签实例和浏览器历史记录。
  void router.push({ path, query: { __workspaceTab: id } })
}

async function scrollActiveTabIntoView() {
  await nextTick()
  const activeTab = tabViewport.value?.querySelector<HTMLElement>('.workspace-tab.active')
  activeTab?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  updateTabScrollState()
}

function updateTabScrollState() {
  const viewport = tabViewport.value
  if (!viewport) return

  canScrollTabsLeft.value = viewport.scrollLeft > 1
  canScrollTabsRight.value = viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1
}

function scrollTabs(direction: 'left' | 'right') {
  tabViewport.value?.scrollBy({
    left: direction === 'right' ? 220 : -220,
    behavior: 'smooth',
  })
}

function activateAdjacentTab(offset: number) {
  const currentIndex = workspaceTabs.value.findIndex((tab) => tab.id === activeTabId.value)
  if (currentIndex < 0) return

  const nextIndex =
    (currentIndex + offset + workspaceTabs.value.length) % workspaceTabs.value.length
  const nextTab = workspaceTabs.value[nextIndex]
  if (nextTab) void router.push(nextTab.fullPath)
}

async function activateTab(tab: WorkspaceTab) {
  if (route.fullPath === tab.fullPath) activeTabId.value = tab.id
  else await router.push(tab.fullPath)
}

function getCloseState(tab: WorkspaceTab): TabCloseState {
  return pageInstances.get(tab.id)?.getCloseState?.() ?? { dirty: false, submitting: false }
}

async function finishClosingTabs(ids: string[], keepId: string | null) {
  const closing = new Set(ids)
  const closingIndex = workspaceTabs.value.findIndex((tab) => tab.id === activeTabId.value)
  const remaining = workspaceTabs.value.filter((tab) => !closing.has(tab.id))
  if (closing.has(activeTabId.value)) {
    const nextTab =
      remaining.find((tab) => tab.id === keepId) ??
      remaining[Math.max(0, closingIndex - 1)] ??
      remaining[0]
    if (nextTab) await activateTab(nextTab)
  }
  workspaceTabs.value = remaining
  ids.forEach((id) => {
    pageWrappers.delete(id)
    pageInstances.delete(id)
  })
  void nextTick(updateTabScrollState)
}

async function requestCloseTabs(ids: string[], keepId: string | null = null) {
  if (pendingTabClose.value) return
  const targets = workspaceTabs.value.filter((tab) => tab.closable && ids.includes(tab.id))
  if (!targets.length) return

  const submittingTab = targets.find((tab) => getCloseState(tab).submitting)
  if (submittingTab) {
    await activateTab(submittingTab)
    pendingTabClose.value = {
      ids,
      keepId,
      affectedTitles: [submittingTab.title],
      submitting: true,
    }
    return
  }

  const dirtyTabs = targets.filter((tab) => getCloseState(tab).dirty)
  if (dirtyTabs.length) {
    await activateTab(dirtyTabs[0]!)
    pendingTabClose.value = {
      ids,
      keepId,
      affectedTitles: dirtyTabs.map((tab) => tab.title),
      submitting: false,
    }
    return
  }

  await finishClosingTabs(ids, keepId)
}

function closeWorkspaceTab(id: string) {
  void requestCloseTabs([id])
}

function closeOtherTabs() {
  const ids = workspaceTabs.value
    .filter((tab) => tab.closable && tab.id !== activeTabId.value)
    .map((tab) => tab.id)
  void requestCloseTabs(ids, activeTabId.value)
}

function confirmTabClose() {
  const pending = pendingTabClose.value
  if (!pending || pending.submitting) return
  const submittingTab = workspaceTabs.value.find(
    (tab) => pending.ids.includes(tab.id) && getCloseState(tab).submitting,
  )
  if (submittingTab) {
    pendingTabClose.value = {
      ...pending,
      affectedTitles: [submittingTab.title],
      submitting: true,
    }
    return
  }
  pendingTabClose.value = null
  void finishClosingTabs(pending.ids, pending.keepId)
}

function toggleSidebar() {
  if (window.matchMedia('(max-width: 920px)').matches) {
    mobileSidebarOpen.value = !mobileSidebarOpen.value
    return
  }

  sidebarCollapsed.value = !sidebarCollapsed.value
}

function toggleTheme() {
  darkTheme.value = !darkTheme.value
  document.body.dataset.theme = darkTheme.value ? 'dark' : 'light'
  localStorage.setItem('acgbox-theme', darkTheme.value ? 'dark' : 'light')
}
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'sidebar-collapsed': sidebarCollapsed,
      'sidebar-open': mobileSidebarOpen,
    }"
  >
    <aside class="sidebar" aria-label="主导航">
      <RouterLink class="brand" to="/admin/dashboard" aria-label="返回数据概览">
        <span class="brand-mark" aria-hidden="true">A</span>
        <span class="brand-copy">
          <span class="brand-name">ACGBox</span>
          <span class="brand-caption">Archive System</span>
        </span>
      </RouterLink>

      <nav class="nav-wrap">
        <p class="nav-label">工作台 / Workspace</p>
        <ul class="nav-list">
          <li v-for="item in menuItems" :key="item.path">
            <RouterLink :to="item.path" custom v-slot="{ href }">
              <a
                class="nav-item"
                :class="{ active: activeMenu === item.path }"
                :href="href"
                :aria-current="activeMenu === item.path ? 'page' : undefined"
                @click.prevent="openMenuPage(item.path)"
              >
                <span class="nav-icon" aria-hidden="true">
                  <AdminIcon :name="item.meta.icon ?? 'dashboard'" />
                </span>
                <span class="nav-text">{{ item.meta.menuName }}</span>
              </a>
            </RouterLink>
          </li>
        </ul>
      </nav>

      <div class="nav-note">
        <div class="signal-card">
          <span class="signal-dot" aria-hidden="true"></span>
          <span class="signal-copy">
            <strong>资料库连接正常</strong>
            <span>Archive node / Tokyo-01</span>
          </span>
        </div>
      </div>
    </aside>

    <button
      class="sidebar-backdrop"
      type="button"
      aria-label="关闭导航"
      @click="mobileSidebarOpen = false"
    ></button>

    <main class="main-shell">
      <header class="topbar">
        <div class="topbar-left">
          <button
            class="sidebar-toggle"
            type="button"
            :aria-label="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'"
            @click="toggleSidebar"
          >
            <AdminIcon name="menu" />
          </button>
          <div class="breadcrumb" aria-label="面包屑">
            <span>{{ breadcrumbSection }}</span>
            <span class="breadcrumb-separator">/</span>
            <strong>{{ currentTitle }}</strong>
          </div>
        </div>

        <div class="topbar-actions">
          <button
            class="icon-button"
            type="button"
            :aria-label="darkTheme ? '切换浅色主题' : '切换深色主题'"
            @click="toggleTheme"
          >
            <AdminIcon :name="darkTheme ? 'moon' : 'sun'" />
          </button>
          <div class="avatar-button" aria-label="当前用户">
            <span class="avatar" aria-hidden="true">编</span>
            <span class="avatar-copy">
              <strong>内容编辑</strong>
              <span>原型状态预览</span>
            </span>
          </div>
        </div>
      </header>

      <nav class="workspace-tabbar" aria-label="已打开页面">
        <span
          class="workspace-tab-count"
          :title="`已打开 ${workspaceTabs.length} 个页面`"
          aria-label="已打开页面数量"
        >
          {{ workspaceTabs.length }}
        </span>

        <div ref="tabViewport" class="workspace-tab-viewport" @scroll="updateTabScrollState">
          <div
            class="workspace-tab-list"
            role="tablist"
            @keydown.left.prevent="activateAdjacentTab(-1)"
            @keydown.right.prevent="activateAdjacentTab(1)"
          >
            <div
              v-for="tab in workspaceTabs"
              :key="tab.id"
              class="workspace-tab"
              :class="{ active: tab.id === activeTabId }"
            >
              <RouterLink
                class="workspace-tab-main"
                :to="tab.fullPath"
                role="tab"
                :aria-selected="tab.id === activeTabId"
                :tabindex="tab.id === activeTabId ? 0 : -1"
                :title="tab.title"
              >
                <span class="workspace-tab-icon" aria-hidden="true"
                  ><AdminIcon :name="tab.icon"
                /></span>
                <span class="workspace-tab-label">{{ tab.title }}</span>
              </RouterLink>
              <button
                v-if="tab.closable"
                class="workspace-tab-close"
                type="button"
                :aria-label="`关闭 ${tab.title}`"
                title="关闭标签"
                @click="closeWorkspaceTab(tab.id)"
              >
                <AdminIcon name="close" />
              </button>
            </div>
          </div>
        </div>

        <div class="workspace-tab-controls">
          <button
            class="workspace-tab-control tab-scroll-control"
            type="button"
            aria-label="向左查看标签"
            title="向左滚动"
            :disabled="!canScrollTabsLeft"
            @click="scrollTabs('left')"
          >
            <AdminIcon name="left" />
          </button>
          <button
            class="workspace-tab-control tab-scroll-control"
            type="button"
            aria-label="向右查看标签"
            title="向右滚动"
            :disabled="!canScrollTabsRight"
            @click="scrollTabs('right')"
          >
            <AdminIcon name="right" />
          </button>
          <button
            class="workspace-tab-control close-other-tabs-control"
            type="button"
            aria-label="关闭其他页面标签"
            title="关闭其他标签"
            :disabled="!canCloseOtherTabs"
            @click="closeOtherTabs"
          >
            <AdminIcon name="close-tabs" />
          </button>
        </div>
      </nav>

      <div class="content">
        <RouterView v-slot="{ Component }">
          <KeepAlive :include="cachedTabNames">
            <component :is="getTabWrapper(Component)" :key="activeTabId" />
          </KeepAlive>
        </RouterView>
      </div>
    </main>
    <Teleport to="body">
      <div
        v-if="pendingTabClose"
        class="modal-layer open workspace-close-layer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspaceCloseTitle"
      >
        <section class="dialog">
          <span class="dialog-icon" aria-hidden="true">!</span>
          <h2 id="workspaceCloseTitle">
            {{ pendingTabClose.submitting ? '页面正在保存' : '页面有未保存的内容' }}
          </h2>
          <p v-if="pendingTabClose.submitting">
            {{ pendingTabClose.affectedTitles.join('、') }}正在提交，请等待保存结束后再关闭。
          </p>
          <p v-else>
            {{ pendingTabClose.affectedTitles.join('、') }}中有尚未保存的新增或修改内容。
            放弃更改后将关闭本次操作涉及的页面标签。
          </p>
          <div class="dialog-actions">
            <button class="secondary-button" type="button" @click="pendingTabClose = null">
              {{ pendingTabClose.submitting ? '返回页面' : '继续编辑' }}
            </button>
            <button
              v-if="!pendingTabClose.submitting"
              class="primary-button"
              type="button"
              @click="confirmTabClose"
            >
              放弃更改并关闭
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.workspace-close-layer {
  z-index: 400;
  overscroll-behavior: contain;
}
.workspace-close-layer .dialog {
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
</style>
