import { downloadFile, get, post, postFormData } from './http'

export type TransferType = 'ANIME' | 'BOOK'
export interface TransferIssue {
  sheet: string
  row: number
  field: string
  rowKey?: string
  message: string
}
export interface TransferPreview {
  targetType: TransferType
  workCount: number
  relationCount: number
  errorCount: number
  warningCount: number
  truncated: boolean
  rows: Array<{ rowKey: string; row: number; data: Record<string, unknown> }>
  referenceNames: Record<string, Record<string, string>>
  pendingCatalogs?: Array<{
    temporaryId: number
    type: 'tag' | 'company' | 'person' | 'series'
    name: string
    rowKeys: string[]
  }>
  errors: TransferIssue[]
  warnings: TransferIssue[]
  importToken?: string
  expiresAt?: string
}
export interface TransferBatch {
  importToken: string
  targetType: TransferType
  status: 'READY' | 'PROCESSING' | 'SUCCEEDED' | 'INVALID' | 'EXPIRED' | 'CANCELLED'
  expiresAt: string
  workCount: number
  createdCount?: number
  preview?: TransferPreview
  mappings?: Record<string, number>
  message?: string
  rowKey?: string
}
const base = (type: TransferType) => `/data-transfer/${type === 'ANIME' ? 'anime' : 'book'}`
export const exportWorks = (
  type: TransferType,
  scope: 'SELECTED' | 'FILTERED',
  value: number[] | object,
  signal?: AbortSignal,
) =>
  downloadFile(
    `${base(type)}/export`,
    { targetType: type, scope, ...(scope === 'SELECTED' ? { ids: value } : { filters: value }) },
    signal,
  )
export const downloadTemplate = (type: TransferType, signal?: AbortSignal) =>
  downloadFile(`${base(type)}/template?targetType=${type}`, undefined, signal)
export function previewImport(type: TransferType, file: File, signal: AbortSignal) {
  const body = new FormData()
  body.append('file', file)
  body.append('targetType', type)
  return postFormData<TransferPreview>(
    `${base(type)}/import/preview`,
    body,
    signal,
    'Excel 文件不能超过 5 MiB，上传请求不能超过 6 MiB。',
  )
}
export const commitImport = (type: TransferType, importToken: string, signal: AbortSignal, createMissingCatalogs = false) =>
  post<TransferBatch>(
    `${base(type)}/import/commit`,
    { targetType: type, importToken, acknowledged: true, createMissingCatalogs },
    signal,
  )
export const getImportBatch = (type: TransferType, token: string, signal?: AbortSignal) =>
  get<TransferBatch>(
    `${base(type)}/import/${encodeURIComponent(token)}`,
    { targetType: type },
    signal,
  )
export const cancelImport = (type: TransferType, token: string, signal?: AbortSignal) =>
  post<TransferBatch>(
    `${base(type)}/import/${encodeURIComponent(token)}/cancel`,
    { targetType: type },
    signal,
  )
