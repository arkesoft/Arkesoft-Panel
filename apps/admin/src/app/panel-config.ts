// @arkesoft/admin — Panel yapılandırma sabitleri (ROADMAP v0.0.7, T-008/S4,
// architect K1/K5)
//
// PANEL_DEV_PORT TEK doğruluk kaynağıdır. `.env.example`'daki
// `AUTH_BASE_URL` (şema + `panel.arkesoft.localhost` + port 5173), Vite
// dev/preview sunucusunun portu (S5, `vite.config.ts` + `--strictPort`) VE
// Playwright'ın hedef aldığı port BUNDAN türemek ZORUNDADIR — sapma GÖRÜNMEYEN bir
// `origin_mismatch` 403'üne yol açar (K1 "sessiz 403 tuzağı": belirtisi
// hatadan çok "giriş çalışmıyor"dur). `panel-origin-pin.test.ts` bu sabiti
// `.env.example`'daki port numarasına eşitleyerek pinler.
//
// TRPC_URL ve AUTH_* yolları GÖRELİ'dir (mutlak URL YOK, `VITE_*` YOK) — K5:
// tek orijin topolojisinde (CORS açılmadı, ADR-0011) panelin API adresi
// bundle'a asla gömülmez; dev/prod birebir aynı kod çalışır.

/**
 * Vite dev/preview sunucusunun dinlediği port. `.env.example`'daki
 * `AUTH_BASE_URL` ile AYNI olmak zorundadır (K1).
 */
export const PANEL_DEV_PORT = 5173

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
