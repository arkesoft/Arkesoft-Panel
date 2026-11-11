// @arkesoft/admin — Panel yapılandırma sabitleri (ROADMAP v0.0.7, T-008/S4,
// architect K1/K5; devops chore "gate paralelliği için Playwright portunun
// ajan başına ayrılması" — port override eklendi, VARSAYILAN DEĞİŞMEDİ)
//
// PANEL_DEV_PORT varsayılan TEK doğruluk kaynağıdır. `.env.example`'daki
// `AUTH_BASE_URL` (şema + `panel.arkesoft.localhost` + port 5173), Vite
// dev/preview sunucusunun portu (S5, `vite.config.ts` + `--strictPort`) VE
// Playwright'ın hedef aldığı port BUNDAN türemek ZORUNDADIR — sapma GÖRÜNMEYEN bir
// `origin_mismatch` 403'üne yol açar (K1 "sessiz 403 tuzağı": belirtisi
// hatadan çok "giriş çalışmıyor"dur). `panel-origin-pin.test.ts` bu sabiti
// `.env.example`'daki port numarasına eşitleyerek pinler.
//
// PORT OVERRIDE (devops, gate paralelliği): `ARKESOFT_PANEL_E2E_PORT` env
// değişkeni VERİLİRSE `resolvePanelDevPort` o değeri kullanır — `vite.
// config.ts` VE `playwright.config.ts` AYNI fonksiyonu çağırır, böylece
// ikisi BİRLİKTE kayar (drift imkânsız kalır). Bu dosyanın KENDİSİ
// `process.env` OKUMAZ — TRPC_URL/AUTH_* gibi bu modül de tarayıcı
// paketine (`api/auth-rest.ts`, `api/trpc-client.ts`) dahil edilir; Node-only
// env okuması buraya SIZARSA tarayıcıda `process is not defined` ile çöker.
// Gerçek `process.env['ARKESOFT_PANEL_E2E_PORT']` OKUMASI yalnızca Node
// tarafındaki `vite.config.ts`/`playwright.config.ts`'te yapılır (K5'teki
// `ARKESOFT_PANEL_DEV_API_TARGET` ile AYNI desen); bu fonksiyon saf bir
// string→number doğrulayıcıdır, `apps/api`'nin `AUTH_BASE_URL`'ini BURADAN
// KAYDIRMAZ — o, API sürecinin KENDİ ortam değişkeni, bu paketin dosya
// listesi DIŞINDA (bkz. devops raporu KARARLAR/RİSKLER).
//
// TRPC_URL ve AUTH_* yolları GÖRELİ'dir (mutlak URL YOK, `VITE_*` YOK) — K5:
// tek orijin topolojisinde (CORS açılmadı, ADR-0011) panelin API adresi
// bundle'a asla gömülmez; dev/prod birebir aynı kod çalışır.

/**
 * Vite dev/preview sunucusunun VARSAYILAN dinlediği port. `.env.example`'daki
 * `AUTH_BASE_URL` ile AYNI olmak zorundadır (K1). `panel-origin-pin.test.ts`
 * bu sabiti pinler — override uygulanmış bir koşumda DEĞİL, bu VARSAYILANA
 * karşı doğrular.
 */
export const PANEL_DEV_PORT = 5173

/**
 * `rawOverride` (tipik olarak `process.env['ARKESOFT_PANEL_E2E_PORT']`)
 * geçerli bir pozitif tamsayıysa onu, aksi hâlde (tanımsız/boş)
 * `PANEL_DEV_PORT`'u döner. Geçersiz (tamsayı değil, aralık dışı) bir değer
 * fail-fast `Error` fırlatır — port birliği değişmezini SESSİZCE bozmak
 * yerine gürültülü kırılır (K1'in `strictPort` felsefesiyle aynı).
 *
 * SAF fonksiyon: `process.env`'e BURADA dokunulmaz (yukarıdaki dosya başı
 * yorumuna bkz.) — çağıran Node-only dosya okur, buraya değer olarak verir.
 */
export function resolvePanelDevPort(rawOverride: string | undefined): number {
  if (rawOverride === undefined || rawOverride.trim() === '') {
    return PANEL_DEV_PORT
  }

  const parsed = Number.parseInt(rawOverride, 10)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(
      `ARKESOFT_PANEL_E2E_PORT geçersiz: "${rawOverride}" — 1-65535 aralığında bir tamsayı olmalı`,
    )
  }

  return parsed
}

/** tRPC HTTP uç noktası — göreli (K5). */
export const TRPC_URL = '/trpc'

/**
 * Better Auth'un `AUTH_DELEGATED_PATHS`'te (apps/api) tam eşleşmeyle
 * forward ettiği REST uç noktaları — göreli (K5). Panel bunları düz
 * `fetch` ile çağırır (`api/auth-rest.ts`), `better-auth/client`
 * eklenmez.
 */
export const AUTH_SIGN_IN_EMAIL_PATH = '/auth/sign-in/email'
export const AUTH_SIGN_OUT_PATH = '/auth/sign-out'

// ROADMAP v0.0.15 (T-016/S10) — `apps/api/src/auth/auth-delegated-paths.ts`
// (S5'in dosyası, DOKUNMA) ALTI two-factor yolunu Better Auth'a delege
// ediyor; bu altı sabit o allowlist'in panel tarafındaki BİREBİR karşılığı
// (göreli, K5 — mutlak URL YOK, `VITE_*` YOK).
export const AUTH_TWO_FACTOR_ENABLE_PATH = '/auth/two-factor/enable'
export const AUTH_TWO_FACTOR_DISABLE_PATH = '/auth/two-factor/disable'
export const AUTH_TWO_FACTOR_GET_TOTP_URI_PATH = '/auth/two-factor/get-totp-uri'
export const AUTH_TWO_FACTOR_GENERATE_BACKUP_CODES_PATH = '/auth/two-factor/generate-backup-codes'
export const AUTH_TWO_FACTOR_VERIFY_TOTP_PATH = '/auth/two-factor/verify-totp'
export const AUTH_TWO_FACTOR_VERIFY_BACKUP_CODE_PATH = '/auth/two-factor/verify-backup-code'

// ROADMAP v0.0.15.1 (T-017/S11) — `apps/api/src/auth/sessions.controller.ts`
// (S8a'nın dosyası, DOKUNMA) üç SABİT yolu tanımlıyor; ikisi (revoke/
// revoke-all) step-up (parola) ister, ADR-0019 §Karar 4 — bu iki sabit o
// uçların panel tarafındaki BİREBİR karşılığı (göreli, K5 — mutlak URL YOK,
// `VITE_*` YOK). `GET /auth/sessions` BURADA tanımLANMAZ — o, bir REST
// `fetch` çağrısı DEĞİL, `session.list` tRPC prosedürü üzerinden gider
// (`api/sessions-query.ts`).
export const AUTH_SESSIONS_REVOKE_PATH = '/auth/sessions/revoke'
export const AUTH_SESSIONS_REVOKE_ALL_PATH = '/auth/sessions/revoke-all'
