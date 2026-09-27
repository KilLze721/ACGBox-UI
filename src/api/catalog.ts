import { get, post } from './http'
import type { CompanyOption, NamedOption, PageResult } from '@/types/api'

export function getBroadcastTypes(signal?: AbortSignal) {
  return get<NamedOption[]>('/broadcast-type/list', {}, signal)
}

export function getAdaptationTypes(signal?: AbortSignal) {
  return get<NamedOption[]>('/adaptation-type/list', {}, signal)
}

export function getAdaptationTypeById(id: number, signal?: AbortSignal) {
  return get<NamedOption>(`/adaptation-type/${id}`, {}, signal)
}

export function createAdaptationType(payload: { name: string }) {
  return post<NamedOption>('/adaptation-type/create', payload)
}

export function updateAdaptationType(payload: NamedOption) {
  return post<NamedOption>('/adaptation-type/update', payload)
}

export function deleteAdaptationTypes(ids: number[]) {
  return post<null>('/adaptation-type/delete', ids)
}

export function getRegions(signal?: AbortSignal) {
  return get<NamedOption[]>('/region/list', {}, signal)
}

export function getRegionById(id: number, signal?: AbortSignal) {
  return get<NamedOption>(`/region/${id}`, {}, signal)
}

export function createRegion(payload: { name: string }) {
  return post<NamedOption>('/region/create', payload)
}

export function updateRegion(payload: NamedOption) {
  return post<NamedOption>('/region/update', payload)
}

export function deleteRegions(ids: number[]) {
  return post<null>('/region/delete', ids)
}

export function getTags(pageNum = 1, pageSize = 100, signal?: AbortSignal) {
  return get<PageResult<NamedOption>>('/tags/page', { pageNum, pageSize }, signal)
}

export function getCompanies(name = '', pageSize = 10, signal?: AbortSignal, pageNum = 1) {
  return get<PageResult<CompanyOption>>('/companies/page', { pageNum, pageSize, name }, signal)
}

export function getCompanyById(id: number, signal?: AbortSignal) {
  return get<CompanyOption>(`/companies/${id}`, {}, signal)
}

export function createCompany(payload: { name: string; description: string | null }) {
  return post<CompanyOption>('/companies/create', payload)
}

export function updateCompany(payload: CompanyOption) {
  return post<CompanyOption>('/companies/update', payload)
}

export function deleteCompanies(ids: number[]) {
  return post<null>('/companies/delete', ids)
}
