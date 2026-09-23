import { get } from './http'
import type { CompanyOption, NamedOption, PageResult } from '@/types/api'

export function getBroadcastTypes(signal?: AbortSignal) {
  return get<NamedOption[]>('/broadcast-type/list', {}, signal)
}

export function getAdaptationTypes(signal?: AbortSignal) {
  return get<NamedOption[]>('/adaptation-type/list', {}, signal)
}

export function getRegions(signal?: AbortSignal) {
  return get<NamedOption[]>('/region/list', {}, signal)
}

export function getTags(pageNum = 1, pageSize = 100, signal?: AbortSignal) {
  return get<PageResult<NamedOption>>('/tags/page', { pageNum, pageSize }, signal)
}

export function getCompanies(name = '', pageSize = 10, signal?: AbortSignal, pageNum = 1) {
  return get<PageResult<CompanyOption>>('/companies/page', { pageNum, pageSize, name }, signal)
}
