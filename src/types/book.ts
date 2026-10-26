import type {
  AnimeDetail,
  AnimePageItem,
  AnimePageQuery,
  AnimePayload,
  AnimePerson,
  SortDirection,
} from './api'

export type BookSortField = 'PUBLISH_DATE' | 'PERSONAL_RATING'

export interface BookDetail extends Omit<
  AnimeDetail,
  'episodeCount' | 'broadcastTypeId' | 'airDate'
> {
  bookTypeId: number
  persons: AnimePerson[]
  publishDate: string | null
  volumeCount: number | null
  chapterCount: number | null
  createdAt: string
  updatedAt: string
}

export interface BookPageItem extends Omit<
  AnimePageItem,
  'episodeCount' | 'broadcastType' | 'airDate'
> {
  bookType: { id: number; name: string; sortOrder: number }
  persons: AnimePerson[]
  publishDate: string | null
  volumeCount: number | null
  chapterCount: number | null
  createdAt: string
  updatedAt: string
}

export interface BookPayload extends Omit<
  AnimePayload,
  'episodeCount' | 'broadcastTypeId' | 'airDate'
> {
  bookTypeId: number
  publishDate: string | null
  volumeCount: number | null
  chapterCount: number | null
}

export interface BookPageQuery extends Omit<
  AnimePageQuery,
  'broadcastTypeId' | 'broadcastStartDate' | 'broadcastEndDate' | 'sortBy'
> {
  bookTypeId?: number
  publishStartDate?: string
  publishEndDate?: string
  sortBy?: BookSortField
  sortDirection?: SortDirection
}
