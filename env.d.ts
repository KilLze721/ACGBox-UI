/// <reference types="vite/client" />

declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string

declare module '*?url&no-inline' {
  const url: string
  export default url
}
