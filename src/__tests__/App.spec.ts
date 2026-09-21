import { describe, it, expect } from 'vitest'

import { flushPromises, mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'

describe('App', () => {
  it('渲染管理端路由页面', async () => {
    await router.push('/admin/anime/42')
    await router.isReady()

    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.text()).toContain('动画详情')
    expect(wrapper.text()).toContain('42')
    expect(wrapper.find('.nav-item.active').text()).toContain('动画管理')

    wrapper.unmount()
  })

  it('侧栏菜单链接与管理页面路由一致', async () => {
    await router.push('/admin/dashboard')

    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    })

    const menuItems = wrapper.findAll('.nav-item')
    expect(menuItems).toHaveLength(8)
    expect(wrapper.find('a[href="/admin/types"]').text()).toContain('类型管理')
    expect(wrapper.find('a[href="/admin/regions"]').text()).toContain('地区管理')

    const seriesLink = wrapper.find('a[href="/admin/series"]')
    expect(seriesLink.attributes('href')).toBe('/admin/series')

    await router.push('/admin/series')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/admin/series')
    expect(wrapper.find('.nav-item.active').text()).toContain('系列管理')
    expect(wrapper.text()).toContain('维护动画系列关系')

    wrapper.unmount()
  })

  it('页面标签随路由打开、切换并关闭', async () => {
    await router.push('/admin/anime')

    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.findAll('.workspace-tab')).toHaveLength(2)
    expect(wrapper.find('.workspace-tab.active').text()).toContain('动画管理')
    expect(wrapper.find('a[href="/admin/dashboard"] + .workspace-tab-close').exists()).toBe(false)

    await router.push('/admin/series')
    await flushPromises()

    expect(wrapper.findAll('.workspace-tab')).toHaveLength(3)
    expect(wrapper.find('.workspace-tab.active').text()).toContain('系列管理')

    await wrapper.find('button[aria-label="关闭 系列管理"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/admin/anime')
    expect(wrapper.findAll('.workspace-tab')).toHaveLength(2)
    expect(wrapper.find('.workspace-tab.active').text()).toContain('动画管理')

    wrapper.unmount()
  })

  it('未知地址进入 404 页面', async () => {
    await router.push('/missing-page')

    const wrapper = mount(App, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.text()).toContain('页面未找到')

    wrapper.unmount()
  })
})
