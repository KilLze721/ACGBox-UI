<!-- 未匹配路由的错误页面：展示页面不存在的提示，并提供返回管理首页的入口。 -->
<template>
  <main class="error-page">
    <section class="error-card">
      <p class="error-code">404</p>
      <h1>页面未找到</h1>
      <p>访问的地址不存在或已经被移动。</p>
      <RouterLink class="primary-button" to="/admin/dashboard">返回管理首页</RouterLink>
    </section>
  </main>
</template>
