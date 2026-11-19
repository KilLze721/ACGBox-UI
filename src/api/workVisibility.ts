import { getAnimeDetail, updateAnime } from './anime'
import { getBookDetail, updateBook } from './book'
import type { AnimeDetail } from '@/types/api'
import type { BookDetail } from '@/types/book'

// 现有更新接口接收完整资料，列表切换前读取最新详情并保留所有关联。
function visibilityPayload(detail: AnimeDetail | BookDetail, isPublic: boolean) {
  if (
    [detail.persons, detail.companies, detail.aliasNames, detail.tagIds, detail.externalLinks].some(
      (items) => !Array.isArray(items),
    )
  ) {
    throw new Error('作品关联资料未完整加载，请重试后再调整公开状态。')
  }
  return {
    id: detail.id,
    name: detail.name,
    isPublic,
    adaptationTypeId: detail.adaptationTypeId,
    regionId: detail.regionId,
    coverImageUrl: detail.coverImageUrl,
    status: detail.status,
    description: detail.description,
    aliasNames: detail.aliasNames,
    tagIds: detail.tagIds,
    seriesId: detail.seriesId,
    personalRatingScore: detail.personalRatingScore,
    persons: detail.persons!.map(({ personId, role, sortOrder }) => ({
      personId,
      role,
      sortOrder,
    })),
    companies: detail.companies.map(({ companyId, role, sortOrder }) => ({
      companyId,
      role,
      sortOrder,
    })),
    externalLinks: detail.externalLinks.map(({ title, url, sortOrder }) => ({
      title,
      url,
      sortOrder,
    })),
  }
}

/** 列表快速切换公开状态，继续使用作品详情及更新接口。 */
export async function updateWorkVisibility(kind: 'ANIME' | 'BOOK', id: number, isPublic: boolean) {
  if (kind === 'BOOK') {
    const detail = await getBookDetail(id)
    return updateBook({
      ...visibilityPayload(detail, isPublic),
      bookTypeId: detail.bookTypeId,
      publishDate: detail.publishDate,
      volumeCount: detail.volumeCount,
      chapterCount: detail.chapterCount,
    })
  }
  const detail = await getAnimeDetail(id)
  return updateAnime({
    ...visibilityPayload(detail, isPublic),
    episodeCount: detail.episodeCount,
    broadcastTypeId: detail.broadcastTypeId,
    airDate: detail.airDate,
  })
}
