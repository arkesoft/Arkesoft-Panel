/// <reference types="astro/client" />

// @arkesoft/storefront — `App.Locals` TEK burada bildirilir (ROADMAP v0.0.8,
// T-009/S6, architect K16) — ikinci bir `declare namespace App` YOK.
// `src/middleware.ts` (K21) `locals.tenant`'ı YALNIZCA burada tanımlı
// şekilde yazar; sayfalar/uçlar `Astro.locals.tenant`/`locals.tenant`
// üzerinden okur.

import type { StorefrontTenantContext } from './lib/storefront-tenant-context.js'

// Bu dosya bir `import` içerdiği için TypeScript'in gözünde bir MODÜLdür —
// `declare global` SARMALAMADAN yazılan `declare namespace App` global
// olarak BİRLEŞMEZ (yalnızca bu modüle özel, kullanışsız bir yerel ad
// üretirdi). `declare global` bu birleşmeyi AÇIKÇA geri getirir.
declare global {
  namespace App {
    interface Locals {
      tenant: StorefrontTenantContext
    }
  }
}
