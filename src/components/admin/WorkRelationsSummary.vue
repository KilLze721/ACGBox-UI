<script setup lang="ts">
/** 作品列表的关联资料摘要：区分人物与公司，并将姓名和职责成对展示。 */
import AdminIcon from './AdminIcon.vue'
import type { AnimeCompany, AnimePerson } from '@/types/api'

withDefaults(
  defineProps<{
    persons?: AnimePerson[]
    companies: AnimeCompany[]
    companyLabel?: string
  }>(),
  { persons: () => [], companyLabel: '制作公司' },
)
</script>

<template>
  <div class="work-relations-summary">
    <div class="relation-summary-group" role="group" aria-label="创作人员">
      <AdminIcon name="user" class="relation-summary-icon" />
      <div class="relation-summary-items">
        <div
          v-for="(person, index) in persons.slice(0, 2)"
          :key="index"
          class="relation-summary-row"
        >
          <span class="relation-summary-name" :title="person.personName">{{
            person.personName
          }}</span>
          <span class="relation-summary-role" :title="person.role || '未填写职责'">{{
            person.role || '未填写职责'
          }}</span>
        </div>
        <span v-if="!persons.length" class="relation-summary-empty">暂无人员</span>
        <span
          v-if="persons.length > 2"
          class="relation-summary-more"
          :title="
            persons
              .slice(2)
              .map((person) => person.personName + ' · ' + (person.role || '未填写职责'))
              .join('、')
          "
          >另有 {{ persons.length - 2 }} 项人员职责</span
        >
      </div>
    </div>
    <div
      class="relation-summary-group relation-summary-companies"
      role="group"
      :aria-label="companyLabel"
    >
      <AdminIcon name="companies" class="relation-summary-icon" />
      <div class="relation-summary-items">
        <div
          v-for="(company, index) in companies.slice(0, 1)"
          :key="index"
          class="relation-summary-row"
        >
          <span class="relation-summary-name" :title="company.companyName">{{
            company.companyName
          }}</span>
          <span v-if="company.role" class="relation-summary-role" :title="company.role">{{
            company.role
          }}</span>
        </div>
        <span v-if="!companies.length" class="relation-summary-empty">暂无公司</span>
        <span
          v-if="companies.length > 1"
          class="relation-summary-more"
          :title="
            companies
              .slice(1)
              .map((company) => company.companyName + (company.role ? ' · ' + company.role : ''))
              .join('、')
          "
          >另有 {{ companies.length - 1 }} 项公司关联</span
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.work-relations-summary {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.relation-summary-group {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  align-items: start;
  gap: 6px;
}
.relation-summary-icon {
  width: 12px;
  height: 12px;
  margin-top: 3px;
  color: var(--violet);
}
.relation-summary-items {
  display: grid;
  min-width: 0;
  gap: 4px;
}
.relation-summary-row {
  display: flex;
  min-width: 0;
  min-height: 18px;
  align-items: center;
  gap: 6px;
}
.relation-summary-name {
  min-width: 0;
  color: var(--ink);
  font-size: 10px;
  font-weight: 650;
}
.relation-summary-name,
.relation-summary-role {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.relation-summary-role {
  max-width: 76px;
  flex-shrink: 0;
  padding: 2px 5px;
  color: var(--violet);
  background: var(--violet-soft);
  border-radius: 5px;
  font-size: 8px;
  line-height: 1.3;
}
.relation-summary-empty,
.relation-summary-more {
  color: var(--ink-faint);
  font-size: 9px;
  line-height: 18px;
}
.relation-summary-companies .relation-summary-icon {
  color: var(--ink-faint);
}
.relation-summary-companies .relation-summary-name {
  color: var(--ink-soft);
}
.relation-summary-companies .relation-summary-role {
  color: var(--ink-soft);
  background: var(--surface-muted);
}
</style>
