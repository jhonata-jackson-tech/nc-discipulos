/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Contas de demonstração, gravadas por `npm run demo`. Só em desenvolvimento. */
  readonly VITE_DEMO_ACCOUNTS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Identidade da build, injetada pelo Vite. Veja `identidadeDaBuild` no `vite.config.ts`. */
declare const __VERSAO__: {
  /** Commit curto. Vazio quando a build saiu sem git e sem `COMMIT_SHA`. */
  commit: string
  /** ISO do momento em que o pacote foi gerado. */
  buildTime: string
}
