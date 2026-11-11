# ACGBox-UI

## 资料名称排序

公司、人物、系列和标签管理默认按名称首字母 A–Z 排列。列表可切换到 Z–A，切换时保留已应用的搜索条件并返回第一页。
新增和修改动画、书籍时，人员、公司、系列及标签选择器按 Z–A 读取选项。两种方向都由后端先排序再分页，`#` 分组排在末尾。
动画和书籍列表按接口返回的顺序展示标签。已保存的人员、公司与职责顺序沿用原有规则。

## 服务连接检测

设置页“系统信息”调用 `GET /admin/system/health`，仅 ADMIN 查询，EDITOR 显示权限提示。
数据库、Redis、SMTP 分别展示 UP、DOWN、DISABLED、UNCONFIGURED、NOT_CHECKED 对应的状态，检测时间来自后端；请求失败只显示无法获取结果，不将各依赖标记为故障。
首次进入时获取，可用刷新按钮再次请求；后端检测期限为 10 秒，结果缓存 30 秒，前端十五秒超时，离开页面会取消请求，检测不会保存或修改个人偏好。
SMTP 检测只验证连接、不发送邮件。后端 JWT 认证依赖数据库，数据库不可用时可能无法获得检测结果，也不会绕过认证。
完整接口说明位于 `../ACGBox/docs/服务连接检测接口.md`，实际连通性应在部署环境验证，自动化测试及界面验证使用模拟依赖或响应。

This template should help get you started developing with Vue 3 in Vite.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
npm run test:unit
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
