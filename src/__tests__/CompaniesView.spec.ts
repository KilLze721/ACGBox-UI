import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import router from '@/router'
import CompaniesView from '@/views/admin/CompaniesView.vue'

const initialCompany = { id: 5, name: 'MADHOUSE', description: '日本动画制作公司' }

function mockApi() {
  const requests: Array<{ path: string; query: string; body?: unknown }> = []
  let companies = [{ ...initialCompany }]
  let rejectDelete = false
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input), 'http://localhost')
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      requests.push({ path: url.pathname, query: url.search, body })
      let data: unknown = null
      let code = 200
      let message = '操作成功'
      if (url.pathname.endsWith('/companies/page')) {
        const name = url.searchParams.get('name') ?? ''
        const filtered = companies.filter((company) => company.name.includes(name))
        const pageNum = Number(url.searchParams.get('pageNum'))
        const pageSize = Number(url.searchParams.get('pageSize'))
        data = {
          pageNum,
          pageSize,
          total: filtered.length,
          pages: Math.ceil(filtered.length / pageSize),
          rows: filtered.slice((pageNum - 1) * pageSize, pageNum * pageSize),
        }
      } else if (url.pathname.endsWith('/companies/5'))
        data = companies.find((company) => company.id === 5)
      else if (url.pathname.endsWith('/anime/page')) {
        data = {
          pageNum: 1,
          pageSize: 100,
          total: 1,
          pages: 1,
          rows: [
            {
              id: 17,
              name: '葬送的芙莉莲',
              companies: [{ companyId: 5, companyName: 'MADHOUSE', role: '动画制作' }],
            },
          ],
        }
      } else if (url.pathname.endsWith('/companies/create')) {
        const company = { id: 6, ...body }
        companies = [company, ...companies]
        data = company
      } else if (url.pathname.endsWith('/companies/update')) {
        companies = companies.map((company) => (company.id === body.id ? body : company))
        data = body
      } else if (url.pathname.endsWith('/companies/delete')) {
        if (rejectDelete) {
          code = 400
          message = '该公司仍被动画引用'
        } else companies = companies.filter((company) => !body.includes(company.id))
      }
      return { ok: true, status: 200, json: async () => ({ code, message, data }) }
    }),
  )
  return {
    requests,
    rejectDelete: () => {
      rejectDelete = true
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

describe('制作公司管理页面', () => {
  it('沿用已有路由，以公司名称搜索分页且不展示数据库 ID', async () => {
    const { requests } = mockApi()
    await router.push('/admin/companies')
    const wrapper = mount(CompaniesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('制作公司档案')
    expect(wrapper.text()).toContain(initialCompany.name)
    expect(wrapper.findAll('.companies-table th').map((cell) => cell.text())).not.toContain('ID')
    expect(wrapper.find('.companies-table').text()).not.toContain('#5')
    await wrapper.get('.companies-search input').setValue('不存在')
    await wrapper.get('.companies-filter').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('没有匹配的公司')
    expect(
      requests.some(
        (request) =>
          request.path === '/api/companies/page' &&
          request.query.includes('name=%E4%B8%8D%E5%AD%98%E5%9C%A8'),
      ),
    ).toBe(true)
    await wrapper.get('.companies-filter .ghost-button').trigger('click')
    await flushPromises()
    await wrapper.get('#companiesPageSize').trigger('click')
    await wrapper.get('.archive-select-option').trigger('click')
    await flushPromises()
    expect(
      requests.some(
        (request) => request.path === '/api/companies/page' && request.query.includes('pageSize=5'),
      ),
    ).toBe(true)
    wrapper.unmount()
  })

  it('详情抽屉通过公司 ID 读取资料和真实关联动画职责', async () => {
    const { requests } = mockApi()
    await router.push('/admin/companies')
    const wrapper = mount(CompaniesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('.companies-row-name').trigger('click')
    await flushPromises()

    const drawer = document.body.querySelector('.companies-drawer')!
    expect(drawer.textContent).toContain('公司详情')
    expect(drawer.textContent).toContain(initialCompany.description)
    expect(drawer.textContent).toContain('葬送的芙莉莲')
    expect(drawer.textContent).toContain('动画制作')
    expect(drawer.textContent).not.toContain('公司 ID')
    expect(requests.some((request) => request.path === '/api/companies/5')).toBe(true)
    expect(
      requests.some(
        (request) => request.path === '/api/anime/page' && request.query.includes('companyId=5'),
      ),
    ).toBe(true)
    wrapper.unmount()
  })

  it('新增和修改均在抽屉提交实际接口，并正确回填名称和简介', async () => {
    const { requests } = mockApi()
    await router.push('/admin/companies')
    const wrapper = mount(CompaniesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('.companies-hero .primary-button').trigger('click')
    document.body
      .querySelector<HTMLFormElement>('#companyEditorForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(document.body.querySelector('.companies-error')?.textContent).toContain('请填写公司名称')
    const name = document.body.querySelector<HTMLInputElement>('#companyName')!
    name.value = '京都动画'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    document.body
      .querySelector<HTMLFormElement>('#companyEditorForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/companies/create')?.body).toEqual({
      name: '京都动画',
      description: null,
    })
    expect(wrapper.text()).toContain('京都动画')

    await wrapper.get('button[aria-label="编辑公司 MADHOUSE"]').trigger('click')
    await flushPromises()
    expect(document.body.querySelector<HTMLInputElement>('#companyName')?.value).toBe(
      initialCompany.name,
    )
    expect(document.body.querySelector<HTMLTextAreaElement>('#companyDescription')?.value).toBe(
      initialCompany.description,
    )
    const description = document.body.querySelector<HTMLTextAreaElement>('#companyDescription')!
    description.value = '更新后的简介'
    description.dispatchEvent(new Event('input', { bubbles: true }))
    document.body
      .querySelector<HTMLFormElement>('#companyEditorForm')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(requests.find((request) => request.path === '/api/companies/update')?.body).toEqual({
      id: 5,
      name: 'MADHOUSE',
      description: '更新后的简介',
    })
    wrapper.unmount()
  })

  it('删除需要勾选确认，后端拒绝时保留弹窗并显示错误', async () => {
    const api = mockApi()
    await router.push('/admin/companies')
    const wrapper = mount(CompaniesView, { attachTo: document.body, global: { plugins: [router] } })
    await flushPromises()
    await wrapper.get('button[aria-label="删除公司 MADHOUSE"]').trigger('click')
    document.body
      .querySelector<HTMLButtonElement>('.companies-dialog-actions .danger-button')!
      .click()
    await flushPromises()
    expect(document.body.querySelector('.companies-checkbox-error')?.textContent).toContain(
      '请先勾选',
    )
    expect(api.requests.some((request) => request.path === '/api/companies/delete')).toBe(false)
    const check = document.body.querySelector<HTMLInputElement>('.companies-delete-check input')!
    check.checked = true
    check.dispatchEvent(new Event('change', { bubbles: true }))
    api.rejectDelete()
    document.body
      .querySelector<HTMLButtonElement>('.companies-dialog-actions .danger-button')!
      .click()
    await flushPromises()
    expect(api.requests.find((request) => request.path === '/api/companies/delete')?.body).toEqual([
      5,
    ])
    expect(document.body.querySelector('.companies-dialog')?.textContent).toContain(
      '该公司仍被动画引用',
    )
    expect(wrapper.text()).toContain('MADHOUSE')
    wrapper.unmount()
  })
})
