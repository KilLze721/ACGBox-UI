import { getCompanies } from './catalog'
import { getPersonsPage } from './persons'
import type { NamedOption } from '@/types/api'

interface RelatedEntityOption extends NamedOption {
  value: string
  group: string
  description: string | null
}

// 两类资料分别按原接口分页，返回联想批次，不合并作品列表或伪造统一分页总数。
export async function searchRelatedEntities(name: string, pageNum: number, signal: AbortSignal) {
  const [companies, persons] = await Promise.all([
    getCompanies(name, 10, signal, pageNum),
    getPersonsPage(pageNum, 10, name, signal),
  ])
  const rows: RelatedEntityOption[] = [
    ...companies.rows.map((company) => ({
      id: company.id,
      name: company.name,
      value: `company:${company.id}`,
      group: '公司',
      description: company.description ?? null,
    })),
    ...persons.rows.map((person) => ({
      id: person.id,
      name: person.name,
      value: `person:${person.id}`,
      group: '人物',
      description: person.description,
    })),
  ]
  return { rows, pages: Math.max(companies.pages, persons.pages) }
}
