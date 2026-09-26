import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import router from '@/router'
import AnimeCrudDrawer from '@/views/admin/anime/AnimeCrudDrawer.vue'
import type { AnimePageItem } from '@/types/api'

const anime: AnimePageItem = {
  id: 15,
  name: '测试动画',
  aliasNames: [],
  tags: [],
  episodeCount: 12,
  broadcastType: { id: 1, name: 'TV' },
  adaptationType: { id: 1, name: '原创' },
  airDate: '2026-09-26',
  coverImageUrl: null,
  status: 1,
  region: { id: 1, name: '日本' },
  companies: [],
  externalLinks: [],
  personalRating: null,
  series: { id: 7, name: '测试系列', description: null },
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
})

describe('动画详情的所属系列链接', () => {
  it('点击已关联系列后进入带名称搜索的系列管理列表', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          code: 200,
          message: '操作成功',
          data: {
            id: anime.id,
            name: anime.name,
            aliasNames: [],
            tagIds: [],
            companies: [],
            externalLinks: [],
            episodeCount: anime.episodeCount,
            broadcastTypeId: 1,
            adaptationTypeId: 1,
            regionId: 1,
            airDate: anime.airDate,
            coverImageUrl: null,
            status: 1,
            description: null,
            personalRatingScore: null,
            seriesId: 7,
            seriesSortOrder: null,
          },
        }),
      })),
    )
    await router.push('/admin/anime')
    const wrapper = mount(AnimeCrudDrawer, {
      props: { mode: 'detail', animeId: anime.id, anime },
      global: { plugins: [router] },
    })
    await flushPromises()

    const link = document.body.querySelector<HTMLButtonElement>('.anime-detail-series-link')
    expect(link?.textContent).toContain('测试系列')
    link?.click()
    await vi.waitFor(() => {
      expect(router.currentRoute.value.path).toBe('/admin/series')
      expect(router.currentRoute.value.query.name).toBe('测试系列')
      expect(router.currentRoute.value.query.detail).toBeUndefined()
    })

    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
