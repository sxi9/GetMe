/// <reference types="vite/client" />
interface ImportMetaEnv { readonly VITE_APP_TARGET?: 'customer' | 'partner' | 'shop'; readonly VITE_API_URL?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
