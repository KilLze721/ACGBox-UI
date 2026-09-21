<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import AdminIcon from '@/components/admin/AdminIcon.vue'

interface WorkspaceTab {
  path: string
  title: string
  icon: string
  closable: boolean
}

const route = useRoute()
const router = useRouter()
const sidebarCollapsed = ref(false)
const mobileSidebarOpen = ref(false)
const tabViewport = ref<HTMLElement>()
const canScrollTabsLeft = ref(false)
const canScrollTabsRight = ref(false)
const darkTheme = ref(false)

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
    path: '/admin/dashboard',
    title: '数据概览',
    icon: 'dashboard',
    closable: false,
  },
])

const canCloseOtherTabs = computed(() =>
  workspaceTabs.value.some((tab) => tab.closable && tab.path !== route.fullPath),
)

watch(
  () => route.fullPath,
  () => {
    mobileSidebarOpen.value = false
    openCurrentRouteTab()
  },
  { immediate: true },
)

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
  const currentPath = route.fullPath
  const existingTab = workspaceTabs.value.find((tab) => tab.path === currentPath)

  if (existingTab) {
    existingTab.title = route.meta.title
    existingTab.icon = getCurrentRouteIcon()
  } else {
    workspaceTabs.value.push({
      path: currentPath,
      title: route.meta.title,
      icon: getCurrentRouteIcon(),
      closable: currentPath !== '/admin/dashboard',
    })
  }

  void scrollActiveTabIntoView()
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
  const currentIndex = workspaceTabs.value.findIndex((tab) => tab.path === route.fullPath)
  if (currentIndex < 0) return

  const nextIndex =
    (currentIndex + offset + workspaceTabs.value.length) % workspaceTabs.value.length
  const nextTab = workspaceTabs.value[nextIndex]
  if (nextTab) void router.push(nextTab.path)
}

function closeWorkspaceTab(path: string) {
  const closingIndex = workspaceTabs.value.findIndex((tab) => tab.path === path && tab.closable)
  if (closingIndex < 0) return

  const closingActiveTab = route.fullPath === path
  workspaceTabs.value.splice(closingIndex, 1)

  if (closingActiveTab) {
    const nextTab = workspaceTabs.value[Math.max(0, closingIndex - 1)] ?? workspaceTabs.value[0]
    if (nextTab) void router.push(nextTab.path)
  }

  void nextTick(updateTabScrollState)
}

function closeOtherTabs() {
  workspaceTabs.value = workspaceTabs.value.filter(
    (tab) => !tab.closable || tab.path === route.fullPath,
  )
  void nextTick(updateTabScrollState)
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
            <RouterLink
              class="nav-item"
              :class="{ active: activeMenu === item.path }"
              :to="item.path"
              :aria-current="activeMenu === item.path ? 'page' : undefined"
            >
              <span class="nav-icon" aria-hidden="true">
                <AdminIcon :name="item.meta.icon ?? 'dashboard'" />
              </span>
              <span class="nav-text">{{ item.meta.menuName }}</span>
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
              :key="tab.path"
              class="workspace-tab"
              :class="{ active: tab.path === route.fullPath }"
            >
              <RouterLink
                class="workspace-tab-main"
                :to="tab.path"
                role="tab"
                :aria-selected="tab.path === route.fullPath"
                :tabindex="tab.path === route.fullPath ? 0 : -1"
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
                @click="closeWorkspaceTab(tab.path)"
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
            class="workspace-tab-control"
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
        <RouterView />
      </div>
    </main>
  </div>
</template>
