/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPRITE_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
