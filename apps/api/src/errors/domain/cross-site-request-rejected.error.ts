// @arkesoft/api — CROSS_SITE_REQUEST_REJECTED (FIX turu 1, madde 6 — F5,
// medium)
//
// `/auth/sessions*` üçlüsünün (`SessionsController`) kendi CSRF/orijin
// savunması — Better Auth'un delege ettiği uçlar `originCheckMiddleware`/
// `validateFormCsrf`'i ZATEN üretimde alıyor (F4 düzeltmesi, `auth-
// instance.ts`); BİZİM kendi uçlarımız bu korumayı HİÇ ALMIYORDU (ÖLÇÜLDÜ,
// security gate: `Origin: https://evil.example.com` + geçerli çerez →
// `revoke-all` 200 döndü). `SameSite=Lax` yalnızca ÇAPRAZ-SİTE'yi engeller;
// `kiracı.arkesoft.app` → `panel.arkesoft.app` AYNI SİTEDİR (aynı kayıtlı
// alan adı) → tarayıcı çerezi GÖNDERİR. `revoke-all` gövde OKUMADIĞI için
// düz bir HTML `<form>` preflight'SİZ tetiklenebilir.
//
// `httpStatus: 403` — K4(3)'ün ayrımıyla AYNI sınıf: kimlik GEÇERLİ, istek
// KAYNAĞI güvenilmiyor. `context` BOŞ — Origin/Sec-Fetch-Site değeri PII
// DEĞİLDİR ama saldırganın hedef URL'ini TAŞIYABİLİR (ör. kimlik avı
// alanı); CLAUDE.md §9 "sır loglanmaz" ruhuyla TUTARLI tutmak için burada
// da taşınmaz — gözlemlenebilirlik `same-origin-guard.ts`'in KENDİ `warn`
// logunda (sorumlu dosyada) kalır.

import { AppError } from '@arkesoft/errors'

export class CrossSiteRequestRejectedError extends AppError {
  constructor() {
    super({
      code: 'CROSS_SITE_REQUEST_REJECTED',
      httpStatus: 403,
      userMessageKey: 'errors.auth.crossSiteRequestRejected',
      context: {},
      isRetryable: false,
    })
  }
}
