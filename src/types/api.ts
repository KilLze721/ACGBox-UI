export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export interface PageResult<T> {
  pageNum: number
  pageSize: number
  total: number
  pages: number
  rows: T[]
}

export interface NamedOption {
  id: number
  name: string
}

export interface CompanyOption extends NamedOption {
  description: string | null
}

export interface AnimeCompany {
  companyId: number
  companyName: string
  role: string | null
}

export interface ExternalLink {
  title: string | null
  url: string
  sortOrder: number
}

export interface SeriesSummary extends NamedOption {
  description: string | null
}

export interface AnimePageItem {
  id: number
  name: string
  aliasNames: string[]
  tags: NamedOption[]
  episodeCount: number | null
  broadcastType: NamedOption
  adaptationType: NamedOption
  airDate: string
  coverImageUrl: string | null
  status: number
  region: NamedOption
  companies: AnimeCompany[]
  externalLinks: ExternalLink[]
  personalRating: number | null
  series: SeriesSummary | null
}

export interface AnimeDetail {
  id: number
  name: string
  episodeCount: number | null
  broadcastTypeId: number
  adaptationTypeId: number
  regionId: number
  airDate: string
  coverImageUrl: string | null
  status: number
  description: string | null
  aliasNames: string[]
  companies: Array<{ companyId: number; role: string | null }>
  externalLinks: ExternalLink[]
  tagIds: number[]
  seriesId: number | null
  seriesSortOrder: number | null
  personalRatingScore: number | null
}

export interface AnimePayload {
  id?: number
  name: string
  episodeCount?: number | null
  broadcastTypeId: number
  adaptationTypeId: number
  regionId: number
  airDate: string
  coverImageUrl?: string | null
  status: number
  description?: string | null
  aliasNames?: string[]
  companies?: Array<{ companyId: number; role: string | null }>
  externalLinks?: ExternalLink[]
  tagIds?: number[]
  seriesId?: number | null
  seriesSortOrder?: number | null
  autoCreateSeries?: boolean
  personalRatingScore?: number | null
}

export type TagMatchMode = 'ALL' | 'ANY'
export type AnimeSortField = 'BROADCAST_DATE' | 'PERSONAL_RATING'
export type SortDirection = 'ASC' | 'DESC'

export interface AnimePageQuery {
  pageNum: number
  pageSize: number
  keyword?: string
  tagIds?: number[]
  tagMatchMode?: TagMatchMode
  broadcastTypeId?: number
  adaptationTypeId?: number
  broadcastStartDate?: string
  broadcastEndDate?: string
  status?: number
  regionId?: number
  companyId?: number
  ratingMin?: number
  ratingMax?: number
  sortBy?: AnimeSortField
  sortDirection?: SortDirection
}
