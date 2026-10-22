import { createRouter, createWebHistory } from 'vue-router'
import { authExpiredEvent, getCurrentUser, getToken } from '@/utils/auth'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    menuName?: string
    icon?: string
    order?: number
    section?: string
    menuParent?: string
    showInMenu?: boolean
    activeMenu?: string
    requiresAuth?: boolean
    roles?: string[]
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: '登录', showInMenu: false },
    },
    {
      path: '/',
      redirect: '/admin/dashboard',
    },
    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { title: '管理工作台', requiresAuth: true },
      redirect: '/admin/dashboard',
      children: [
        {
          path: 'dashboard',
          name: 'admin-dashboard',
          component: () => import('@/views/admin/DashboardView.vue'),
          meta: {
            title: '数据概览',
            menuName: '数据概览',
            icon: 'dashboard',
            order: 10,
            section: '工作台',
            showInMenu: true,
          },
        },
        {
          path: 'anime',
          name: 'admin-anime-list',
          component: () => import('@/views/admin/anime/AnimeListView.vue'),
          meta: {
            title: '动画管理',
            menuName: '动画管理',
            icon: 'anime',
            order: 20,
            section: '内容管理',
            showInMenu: true,
          },
        },
        {
          path: 'anime/create',
          name: 'admin-anime-create',
          component: () => import('@/views/admin/anime/AnimeCreateView.vue'),
          meta: {
            title: '新增动画',
            section: '动画管理',
            showInMenu: false,
            activeMenu: '/admin/anime',
          },
        },
        {
          path: 'anime/:id',
          name: 'admin-anime-detail',
          redirect: (to) => ({ path: '/admin/anime', query: { detail: String(to.params.id) } }),
          meta: {
            title: '动画详情',
            section: '动画管理',
            showInMenu: false,
            activeMenu: '/admin/anime',
          },
        },
        {
          path: 'anime/:id/edit',
          name: 'admin-anime-edit',
          redirect: '/admin/anime',
          meta: {
            title: '编辑动画',
            section: '动画管理',
            showInMenu: false,
            activeMenu: '/admin/anime',
          },
        },
        {
          path: 'series',
          name: 'admin-series',
          component: () => import('@/views/admin/SeriesView.vue'),
          meta: {
            title: '系列管理',
            menuName: '系列管理',
            icon: 'series',
            order: 30,
            section: '内容管理',
            showInMenu: true,
          },
        },
        {
          path: 'series/:id',
          name: 'admin-series-detail',
          redirect: (to) => ({ path: '/admin/series', query: { detail: String(to.params.id) } }),
          meta: {
            title: '系列详情',
            section: '系列管理',
            showInMenu: false,
            activeMenu: '/admin/series',
          },
        },
        {
          path: 'tags',
          name: 'admin-tags',
          component: () => import('@/views/admin/TagsView.vue'),
          meta: {
            title: '标签管理',
            menuName: '标签管理',
            icon: 'tags',
            order: 40,
            section: '基础资料',
            showInMenu: true,
          },
        },
        {
          path: 'companies',
          name: 'admin-companies',
          component: () => import('@/views/admin/CompaniesView.vue'),
          meta: {
            title: '制作公司管理',
            menuName: '制作公司管理',
            icon: 'companies',
            order: 50,
            section: '内容管理',
            showInMenu: true,
          },
        },
        {
          path: 'types',
          name: 'admin-types',
          redirect: '/admin/broadcast-types',
          meta: {
            title: '类型管理',
            showInMenu: false,
          },
        },
        {
          path: 'broadcast-types',
          name: 'admin-broadcast-types',
          component: () => import('@/views/admin/BroadcastTypesView.vue'),
          meta: {
            title: '放送类型管理',
            menuName: '放送类型管理',
            icon: 'broadcast-types',
            order: 60,
            section: '动画管理',
            menuParent: '/admin/anime',
            showInMenu: true,
          },
        },
        {
          path: 'adaptation-types',
          name: 'admin-adaptation-types',
          component: () => import('@/views/admin/AdaptationTypesView.vue'),
          meta: {
            title: '改编类型管理',
            menuName: '改编类型管理',
            icon: 'adaptation-types',
            order: 61,
            section: '基础资料',
            showInMenu: true,
          },
        },
        {
          path: 'regions',
          name: 'admin-regions',
          component: () => import('@/views/admin/RegionsView.vue'),
          meta: {
            title: '地区管理',
            menuName: '地区管理',
            icon: 'regions',
            order: 70,
            section: '基础资料',
            showInMenu: true,
          },
        },
        {
          path: 'account',
          name: 'admin-account',
          component: () => import('@/views/admin/AccountProfileView.vue'),
          meta: {
            title: '个人账号',
            icon: 'user',
            section: '账号设置',
            showInMenu: false,
            roles: ['ADMIN', 'EDITOR'],
          },
        },
        {
          path: 'users',
          name: 'admin-users',
          component: () => import('@/views/admin/UsersView.vue'),
          meta: {
            title: '用户管理',
            menuName: '用户管理',
            icon: 'user',
            order: 79,
            section: '系统管理',
            showInMenu: true,
            roles: ['ADMIN'],
          },
        },
        {
          path: 'settings',
          name: 'admin-settings',
          component: () => import('@/views/admin/SettingsView.vue'),
          meta: {
            title: '系统设置',
            menuName: '系统设置',
            icon: 'settings',
            order: 80,
            section: '系统管理',
            showInMenu: true,
          },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/error/NotFoundView.vue'),
      meta: {
        title: '页面未找到',
        showInMenu: false,
      },
    },
  ],
})

router.beforeEach((to) => {
  const token = getToken()
  if (to.meta.requiresAuth && !token) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.roles && !to.meta.roles.includes(getCurrentUser()?.role ?? '')) {
    return '/admin/dashboard'
  }
  if (to.name === 'login' && token) return '/admin/dashboard'
})

router.afterEach((to) => {
  document.title = `${to.meta.title} · ACGBox`
})

window.addEventListener(authExpiredEvent, () => {
  const currentRoute = router.currentRoute.value
  if (!currentRoute.meta.requiresAuth) return
  void router.replace({
    name: 'login',
    query: { redirect: currentRoute.fullPath, reason: 'expired' },
  })
})

export default router
