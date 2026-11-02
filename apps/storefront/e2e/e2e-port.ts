// @arkesoft/storefront — e2e port çözümü (ROADMAP v0.0.8, T-009/S9, qa —
// ÜRETİM ROLÜNDE)
//
// `playwright.config.ts` VE `storefront-host.spec.ts` AYNI portu TEK
// kaynaktan okur — `astro.config.ts`'in (S4'ün dosyası, DOKUNULMADI)
// `server.port: 4321`'iyle AYNI varsayılan (ROADMAP v0.0.8 kabul kriterinin
// metninin kendisi `:4321`'i sabitliyor). `ARKESOFT_STOREFRONT_E2E_PORT` ile
// override edilebilir (admin'in `ARKESOFT_PANEL_E2E_PORT` emsali, ÖNERİLDİ/
// ZORUNLU DEĞİL) — `playwright.config.ts`'in dosya başı notundaki A-M5
// telafisi (webServer.url bu porta pinli) bu modülün TEK tüketicisi
// sayesinde iki dosyada SENKRONSUZ KALAMAZ.
const DEFAULT_PORT = 4321

export function resolveStorefrontE2ePort(override: string | undefined): number {
  return override !== undefined && override.length > 0 ? Number(override) : DEFAULT_PORT
}

export const STOREFRONT_E2E_PORT = resolveStorefrontE2ePort(
  process.env['ARKESOFT_STOREFRONT_E2E_PORT'],
)

/** Verilen host etiketine (ör. `demo-magaza.arkesoft.localhost`) bu koşumun portunu ekler. */
export function storefrontUrl(host: string, pathname = '/'): string {
  return `http://${host}:${String(STOREFRONT_E2E_PORT)}${pathname}`
}
