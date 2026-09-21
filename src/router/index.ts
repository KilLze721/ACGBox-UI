import { createRouter, createWebHistory } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title: string
    menuName?: string
    icon?: string
    order?: number
    section?: string
    showInMenu?: boolean
    activeMenu?: string
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/admin/dashboard',
    },
    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
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
          component: () => import('@/views/admin/anime/AnimeDetailView.vue'),
          props: true,
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
          component: () => import('@/views/admin/anime/AnimeEditView.vue'),
          props: true,
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
          path: 'tags',
          name: 'admin-tags',
          component: () => import('@/views/admin/TagsView.vue'),
          meta: {
            title: '标签管理',
            menuName: '标签管理',
            icon: 'tags',
            order: 40,
            section: '内容管理',
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
          component: () => import('@/views/admin/TypesView.vue'),
          meta: {
            title: '类型管理',
            menuName: '类型管理',
            icon: 'types',
            order: 60,
            section: '内容管理',
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
            section: '内容管理',
            showInMenu: true,
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

router.afterEach((to) => {
  document.title = `${to.meta.title} · ACGBox`
})

// 当前项目尚未提供登录和权限机制，后续可在此处注册全局前置守卫。

export default router
