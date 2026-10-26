import { onBeforeUnmount, reactive } from 'vue'
import { getBookPage } from '@/api/book'
import { pageSizeValues, resolvePageSize } from '@/utils/preferences'
import type { PageResult, SortDirection } from '@/types/api'
import type { BookPageItem, BookSortField } from '@/types/book'

type RelatedFilter = { personId: number } | { seriesId: number } | { companyId: number }

// 只查询当前实体的一页关联书籍，状态由页面持有，工作区切换不重置临时排序。
export function useRelatedBook() {
  const state = reactive({
    page: { pageNum: 1, pageSize: 20, total: 0, pages: 0, rows: [] } as PageResult<BookPageItem>,
    pageSize: 20,
    sortBy: 'PUBLISH_DATE' as BookSortField,
    sortDirection: 'DESC' as SortDirection,
    loading: false,
    error: '',
  })
  let filter: RelatedFilter | null = null
  let controller: AbortController | undefined
  let requestedPage = 1

  function cancel() {
    controller?.abort()
    state.loading = false
    filter = null
  }
  async function loadPage(pageNum: number) {
    if (!filter) return
    controller?.abort()
    const request = new AbortController()
    controller = request
    const currentFilter = filter
    requestedPage = pageNum
    state.loading = true
    state.error = ''
    try {
      const result = await getBookPage(
        {
          ...currentFilter,
          pageNum,
          pageSize: state.pageSize,
          sortBy: state.sortBy,
          sortDirection: state.sortDirection,
        },
        request.signal,
      )
      if (request.signal.aborted || controller !== request) return
      if (
        'personId' in currentFilter &&
        result.rows.some(
          (book) => !book.persons?.some((person) => person.personId === currentFilter.personId),
        )
      )
        throw new Error('关联结果与当前人物不符，请确认后端已支持 personId 筛选并返回人物职责。')
      if (
        'seriesId' in currentFilter &&
        result.rows.some((book) => book.series?.id !== currentFilter.seriesId)
      )
        throw new Error('关联结果与当前系列不符，请确认后端已支持 seriesId 筛选。')
      if (
        'companyId' in currentFilter &&
        result.rows.some(
          (book) =>
            !book.companies.some((company) => company.companyId === currentFilter.companyId),
        )
      )
        throw new Error('关联结果与当前公司不符，请确认后端已支持 companyId 筛选。')
      state.page = result
    } catch (error) {
      if (!request.signal.aborted && controller === request)
        state.error = error instanceof Error ? error.message : '关联书籍读取失败，请重试。'
    } finally {
      if (controller === request) state.loading = false
    }
  }
  function prepare(value: RelatedFilter) {
    cancel()
    filter = value
    state.pageSize = resolvePageSize(pageSizeValues, 10)
    state.sortBy = 'PUBLISH_DATE'
    state.sortDirection = 'DESC'
    state.page = { pageNum: 1, pageSize: state.pageSize, total: 0, pages: 0, rows: [] }
    requestedPage = 1
  }
  function open(value: RelatedFilter) {
    prepare(value)
    return loadPage(1)
  }
  function changeSort(value: BookSortField) {
    if (state.sortBy === value) return
    state.sortBy = value
    void loadPage(1)
  }
  function toggleDirection() {
    state.sortDirection = state.sortDirection === 'DESC' ? 'ASC' : 'DESC'
    void loadPage(1)
  }
  function changePageSize(value: string) {
    state.pageSize = Number(value)
    void loadPage(1)
  }
  onBeforeUnmount(cancel)
  function suspend() {
    controller?.abort()
    state.loading = false
  }
  return {
    state,
    open,
    prepare,
    cancel,
    loadPage,
    changeSort,
    toggleDirection,
    changePageSize,
    retry: () => loadPage(requestedPage),
    suspend,
    resume: () => loadPage(requestedPage),
  }
}

export type RelatedBookModel = ReturnType<typeof useRelatedBook>
