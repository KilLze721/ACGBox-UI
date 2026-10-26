// 书籍原作层面的职责建议，均允许自由输入，不会作为关联行的默认职责。
export const companyRoles = ['原版出版', '连载', '发行']
export const personRoles = ['作者', '原作', '作画', '插画', '编剧', '监修']
export { linkTitleSuggestions } from './animeFormOptions'

export const bookStatusNames: Record<number, string> = {
  0: '其他',
  1: '未发表',
  2: '连载中',
  3: '已完结',
  4: '暂停中',
  5: '已终止',
}
export const bookStatusOptions = [1, 2, 3, 4, 5, 0].map((id) => ({
  id,
  name: bookStatusNames[id]!,
}))
