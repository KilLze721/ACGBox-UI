import { get } from './http'
import type { SystemHealth } from '@/types/api'

export function getSystemHealth(signal?: AbortSignal) {
  return get<SystemHealth>('/admin/system/health', {}, signal)
}
