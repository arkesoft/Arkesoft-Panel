// @arkesoft/superadmin — Panel yapılandırma sabitleri (ROADMAP v0.0.20,
// T-021/S8, A-PO21-3; `apps/admin/src/app/panel-config.ts`'in AYNI deseni)
//
// SUPERADMIN_DEV_PORT varsayılan TEK doğruluk kaynağıdır. `.env.example`'daki
// (yorum satırı) `SUPERADMIN_BASE_URL` — şema + `superadmin.arkesoft.localhost`
// + port 5174 —, Vite dev/preview sunucusunun portu (`vite.config.ts`) VE
// Playwright'ın hedef aldığı port (S10) BUNDAN türemek ZORUNDADIR — sapma
// GÖRÜNMEYEN bir `origin_mismatch` 403'üne yol açar (K1 "sessiz 403 tuzağı",
// `apps/admin`'in aynı notu).
//
// PORT OVERRIDE: `ARKESOFT_SUPERADMIN_E2E_PORT` env değişkeni VERİLİRSE
// `resolveSuperadminDevPort` o değeri kullanır — `vite.config.ts` VE
// (S10'un) `playwright.config.ts`'i AYNI fonksiyonu çağırır, böylece ikisi
// BİRLİKTE kayar. Bu dosyanın KENDİSİ `process.env` OKUMAZ — bu modül
// tarayıcı paketine de dahil edilir (`api/auth-rest.ts`, `api/trpc-client.ts`
// vb.); Node-only env okuması buraya SIZARSA tarayıcıda `process is not
// defined` ile çöker. Gerçek `process.env['ARKESOFT_SUPERADMIN_E2E_PORT']`
// OKUMASI yalnızca Node tarafındaki `vite.config.ts`'te yapılır.
//
// TRPC_URL ve AUTH_* yolları GÖRELİ'dir (mutlak URL YOK, `VITE_*` YOK) — tek
// orijin topolojisinde (CORS açılmadı, ADR-0011/ADR-0023 §4) panelin API
// adresi bundle'a asla gömülmez; dev/prod birebir aynı kod çalışır.

/**
 * Vite dev/preview sunucusunun VARSAYILAN dinlediği port. `.env.example`'daki
 * (yorum satırı) `SUPERADMIN_BASE_URL` ile AYNI olmak zorundadır.
 */
export const SUPERADMIN_DEV_PORT = 5174

/**
 * `rawOverride` (tipik olarak `process.env['ARKESOFT_SUPERADMIN_E2E_PORT']`)
 * geçerli bir pozitif tamsayıysa onu, aksi hâlde (tanımsız/boş)
 * `SUPERADMIN_DEV_PORT`'u döner. Geçersiz bir değer fail-fast `Error`
 * fırlatır — port birliği değişmezini SESSİZCE bozmak yerine gürültülü
 * kırılır (`apps/admin/src/app/panel-config.ts`'in `resolvePanelDevPort`'u
 * ile BİREBİR aynı desen).
 *
 * SAF fonksiyon: `process.env`'e BURADA dokunulmaz — çağıran Node-only dosya
 * okur, buraya değer olarak verir.
 */
export function resolveSuperadminDevPort(rawOverride: string | undefined): number {
  if (rawOverride === undefined || rawOverride.trim() === '') {
    return SUPERADMIN_DEV_PORT
  }

  const parsed = Number.parseInt(rawOverride, 10)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(
      `ARKESOFT_SUPERADMIN_E2E_PORT geçersiz: "${rawOverride}" — 1-65535 aralığında bir tamsayı olmalı`,
    )
  }

  return parsed
}

/** tRPC HTTP uç noktası — göreli. */
export const TRPC_URL = '/trpc'

/**
 * Better Auth'un `AUTH_DELEGATED_PATHS`'te (apps/api) tam eşleşmeyle forward
 * ettiği REST uç noktaları — göreli. Panel bunları düz `fetch` ile çağırır
 * (`api/auth-rest.ts`), `better-auth/client` eklenmez.
 */
export const AUTH_SIGN_IN_EMAIL_PATH = '/auth/sign-in/email'
export const AUTH_SIGN_OUT_PATH = '/auth/sign-out'

// İki faktörlü doğrulama — `apps/admin/src/app/panel-config.ts`'in ALTI
// yolundan platform yöneticisinin KURULUM akışının (giriş sırasında kod
// doğrulama + kurulum sihirbazı) ihtiyaç duyduğu DÖRDÜ: devre dışı bırakma/
// yedek kod yenileme bu panelde YOK (hesap güvenliği yönetim ekranı bu
// sürümün kapsamında değil, bkz. docs/ui/T-021).
export const AUTH_TWO_FACTOR_ENABLE_PATH = '/auth/two-factor/enable'
export const AUTH_TWO_FACTOR_GET_TOTP_URI_PATH = '/auth/two-factor/get-totp-uri'
export const AUTH_TWO_FACTOR_VERIFY_TOTP_PATH = '/auth/two-factor/verify-totp'
export const AUTH_TWO_FACTOR_VERIFY_BACKUP_CODE_PATH = '/auth/two-factor/verify-backup-code'
