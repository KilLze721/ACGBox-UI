import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteAnime, getAnimePage } from '@/api/anime'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('动画分页接口', () => {
  it('按照接口文档序列化全部查询参数', async () => {
    const fetchMock = vi
      .fn<
        (
          input?: string | URL | Request,
        ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
      >()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          message: '操作成功',
          data: { pageNum: 1, pageSize: 20, total: 0, pages: 0, rows: [] },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await getAnimePage({
      pageNum: 1,
      pageSize: 20,
      keyword: '芙莉莲',
      tagIds: [17, 18],
      tagMatchMode: 'ALL',
      broadcastTypeId: 1,
      adaptationTypeId: 2,
      broadcastStartDate: '2020',
      broadcastEndDate: '2024',
      status: 3,
      regionId: 1,
      companyId: 5,
      ratingMin: 7,
      ratingMax: 10,
      sortBy: 'PERSONAL_RATING',
      sortDirection: 'DESC',
    })

    const requestUrl = String(fetchMock.mock.calls[0]?.[0])
    const searchParams = new URL(requestUrl, 'http://localhost').searchParams

    expect(new URL(requestUrl, 'http://localhost').pathname).toBe('/api/anime/page')
    expect(Object.fromEntries(searchParams)).toEqual({
      pageNum: '1',
      pageSize: '20',
      keyword: '芙莉莲',
      tagIds: '17,18',
      tagMatchMode: 'ALL',
      broadcastTypeId: '1',
      adaptationTypeId: '2',
      broadcastStartDate: '2020',
      broadcastEndDate: '2024',
      status: '3',
      regionId: '1',
      companyId: '5',
      ratingMin: '7',
      ratingMax: '10',
      sortBy: 'PERSONAL_RATING',
      sortDirection: 'DESC',
    })
  })

  it('将统一响应中的业务错误转换为异常', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<() => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>>()
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ code: 500, message: '日期格式错误', data: null }),
        }),
    )

    await expect(getAnimePage({ pageNum: 1, pageSize: 10 })).rejects.toThrow('日期格式错误')
  })

  it('按照接口文档提交批量删除请求', async () => {
    const fetchMock = vi
      .fn<
        (
          input: string | URL | Request,
          init?: RequestInit,
        ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
      >()
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 200, message: '操作成功', data: null }),
      })
    vi.stubGlobal('fetch', fetchMock)

    await deleteAnime([17, 18])

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/api/anime/delete')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify([17, 18]),
    })
  })
})
