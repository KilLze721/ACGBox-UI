import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import router from '@/router'
import App from '@/App.vue'
import SettingsView from '@/views/admin/SettingsView.vue'
import {
  defaultPreferences,
  readPreferences,
  savePreferences,
  setThemeMode,
} from '@/utils/preferences'

const wrappers: VueWrapper[] = []
let failCatalog = false
function renderSettings() {
  const wrapper = mount(SettingsView, { attachTo: document.body, global: { plugins: [router] } })
  wrappers.push(wrapper)
  return wrapper
}
function closeState(wrapper: VueWrapper) {
  return (
    wrapper.vm as unknown as { getCloseState(): { dirty: boolean; submitting: boolean } }
  ).getCloseState()
}
beforeEach(async () => {
  localStorage.removeItem('acgbox-preferences')
  setThemeMode('light')
  failCatalog = false
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
  sessionStorage.setItem('acgbox-user', JSON.stringify({ id: 1, username: 'admin', role: 'ADMIN' }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      if (failCatalog) throw new Error('目录读取失败')
      const data = input.includes('region/list')
        ? [{ id: 4, name: '日本' }]
        : [{ id: 1, name: 'TV' }]
      return { ok: true, status: 200, json: async () => ({ code: 200, data }) }
    }),
  )
  await router.push('/admin/settings')
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  localStorage.removeItem('acgbox-preferences')
  localStorage.removeItem('acgbox-theme')
  localStorage.removeItem('unrelated-data')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  document.body.innerHTML = ''
})

describe('系统设置页面', () => {
  it('工作区关闭设置标签时识别未保存偏好，继续编辑后保留草稿', async () => {
    const wrapper = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    wrappers.push(wrapper)
    await flushPromises()
    await wrapper.get('[aria-labelledby="sizeLabel"] button:last-child').trigger('click')
    await wrapper.get('[aria-label="关闭 系统设置"]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.workspace-close-layer')?.textContent).toContain('未保存')
    document.body
      .querySelector<HTMLButtonElement>('.workspace-close-layer .secondary-button')
      ?.click()
    await flushPromises()
    expect(
      wrapper.get('[aria-labelledby="sizeLabel"] button:last-child').attributes('aria-pressed'),
    ).toBe('true')
    expect(router.currentRoute.value.path).toBe('/admin/settings')
  })

  it('真实加载目录，保存分页排序和建议项，并暴露未保存状态', async () => {
    const wrapper = renderSettings()
    await flushPromises()
    expect(closeState(wrapper).dirty).toBe(false)
    await wrapper.get('[aria-labelledby="sizeLabel"] button:last-child').trigger('click')
    await wrapper.get('[aria-labelledby="sortLabel"] button:last-child').trigger('click')
    for (const row of wrapper.findAll('.compatibility tbody tr')) {
      expect(row.findAll('td')[1]!.text()).toBe('10 / 20 / 50')
      expect(row.findAll('td')[2]!.text()).toBe('50')
    }
    await wrapper.get('#sortDirection').trigger('click')
    await wrapper.get('#regionId').trigger('click')
    await wrapper
      .get('#regionId')
      .element.closest('.archive-select')
      ?.querySelector<HTMLButtonElement>('[role="option"]:last-child')
      ?.click()
    await wrapper.get('#linkTitlesInput').setValue('自定义链接')
    await wrapper.get('#linkTitlesInput').trigger('keydown', { key: 'Enter' })
    await wrapper.get('#companyRolesInput').setValue('作画协力')
    await wrapper.get('#companyRolesInput').trigger('keydown', { key: 'Enter' })
    expect(closeState(wrapper).dirty).toBe(true)
    expect(readPreferences().pageSize).toBe(20)
    await wrapper.get('form').trigger('submit')
    expect(readPreferences()).toMatchObject({
      pageSize: 50,
      sortBy: 'PERSONAL_RATING',
      sortDirection: 'ASC',
      regionId: '4',
    })
    expect(readPreferences().companyRoles).toContain('作画协力')
    expect(readPreferences().linkTitles).toContain('自定义链接')
    expect(closeState(wrapper).dirty).toBe(false)
    expect(wrapper.get('.save-status').text()).toContain('个人偏好已保存')
  })

  it('未添加的建议项阻止保存，重复项显示错误，撤销恢复已保存值', async () => {
    const wrapper = renderSettings()
    await flushPromises()
    await wrapper.get('#linkTitlesInput').setValue('官网')
    await wrapper.get('#linkTitlesInput').trigger('keydown', { key: 'Enter' })
    expect(wrapper.get('#linkTitlesError').text()).toContain('已经存在')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('.save-status').text()).toContain('请先添加或清空')
    await wrapper.get('.save-actions .secondary-button').trigger('click')
    expect(closeState(wrapper).dirty).toBe(false)
    expect((wrapper.get('#linkTitlesInput').element as HTMLInputElement).value).toBe('')
  })

  it('重置列表仅影响列表偏好，确认和保存分开，不清除其他数据', async () => {
    savePreferences({
      ...defaultPreferences(),
      pageSize: 50,
      sortBy: 'PERSONAL_RATING',
      sortDirection: 'ASC',
      regionId: '4',
      companyRoles: ['自定义职责'],
    })
    setThemeMode('dark')
    localStorage.setItem('unrelated-data', 'keep')
    const token = sessionStorage.getItem('acgbox-token')
    const wrapper = renderSettings()
    await flushPromises()
    await wrapper.get('#resetLists').trigger('click')
    expect(document.body.querySelector('.settings-reset-dialog')?.textContent).toContain(
      '默认分页：20 条',
    )
    expect(document.body.querySelector('.reset-scope')?.textContent).not.toContain('主题模式')
    expect(document.body.style.overflow).toBe('hidden')
    document.body.querySelector<HTMLButtonElement>('#confirmReset')?.click()
    await flushPromises()
    expect(readPreferences().pageSize).toBe(50)
    expect(document.body.style.overflow).toBe('')
    await wrapper.get('form').trigger('submit')
    expect(readPreferences()).toMatchObject({
      pageSize: 20,
      sortBy: 'BROADCAST_DATE',
      sortDirection: 'DESC',
      regionId: '4',
      companyRoles: ['自定义职责'],
    })
    expect(localStorage.getItem('acgbox-theme')).toBe('dark')
    expect(localStorage.getItem('unrelated-data')).toBe('keep')
    expect(sessionStorage.getItem('acgbox-token')).toBe(token)
  })

  it('全部恢复涵盖主题和录入偏好，Escape 取消不变更，确认后保存才生效', async () => {
    savePreferences({
      ...defaultPreferences(),
      regionId: '4',
      broadcastTypeId: '1',
      linkTitles: ['自定义'],
    })
    setThemeMode('dark')
    const wrapper = renderSettings()
    await flushPromises()
    await wrapper.get('#resetAll').trigger('click')
    const dialog = document.body.querySelector<HTMLDialogElement>('.settings-reset-dialog')!
    expect(dialog.textContent).toContain('主题模式：浅色')
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }))
    await flushPromises()
    expect(readPreferences().regionId).toBe('4')
    expect(closeState(wrapper).dirty).toBe(false)
    await wrapper.get('#resetAll').trigger('click')
    document.body.querySelector<HTMLButtonElement>('#confirmReset')?.click()
    await flushPromises()
    expect(localStorage.getItem('acgbox-theme')).toBe('dark')
    await wrapper.get('form').trigger('submit')
    expect(readPreferences()).toEqual(defaultPreferences())
    expect(localStorage.getItem('acgbox-theme')).toBe('light')
  })

  it('目录读取失败可重试，不丢失已存的默认 ID；系统信息取实际构建信息', async () => {
    savePreferences({ ...defaultPreferences(), regionId: '4' })
    failCatalog = true
    const wrapper = renderSettings()
    await flushPromises()
    expect(wrapper.text()).toContain('目录读取失败')
    expect(readPreferences().regionId).toBe('4')
    failCatalog = false
    await wrapper.get('.catalog-refresh button').trigger('click')
    await flushPromises()
    expect(wrapper.get('#regionId').text()).toContain('日本')
    expect(wrapper.get('#system').text()).toContain(__APP_VERSION__)
    expect(wrapper.get('#system').text()).toContain('未提供检测')
    expect(wrapper.get('#system').text()).not.toContain('运行正常')
    expect(wrapper.get('.doc-link').attributes('href')).not.toContain('data:')
  })

  it('顶部主题和设置选项同步，支持跟随系统，保存失败保留草稿', async () => {
    await router.push('/admin/dashboard')
    const app = mount(App, { attachTo: document.body, global: { plugins: [router] } })
    wrappers.push(app)
    await router.push('/admin/settings')
    await flushPromises()
    await app.get('.theme-options button:nth-child(2)').trigger('click')
    expect(document.body.dataset.theme).toBe('dark')
    expect(app.get('[aria-label^="当前主题"]').attributes('aria-label')).toContain('深色')
    await app.get('[aria-label^="当前主题"]').trigger('click')
    expect(app.get('.theme-options button:nth-child(3)').attributes('aria-pressed')).toBe('true')
    await app.get('[aria-labelledby="sizeLabel"] button:last-child').trigger('click')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    await app.get('form.settings-form').trigger('submit')
    expect(app.get('.save-status').text()).toContain('无法保存偏好')
    expect(app.get('#saveSettings').attributes('disabled')).toBeUndefined()
  })
})
