// @arkesoft/api — AuthResolution discriminated union (ROADMAP v0.0.5, T-006/S6,
// architect "TENANT İZOLASYONU" → madde 4 HTTP eşdeğeri, PO kısıt "assertNever
// birleştirmesi AuthGuard'dan ÖNCE")
//
// `TenantResolution`'ın (`request-context.types.ts`) AUTH tarafındaki
// eşdeğeri — AYNI desen: `AuthContextMiddleware` (ÇÖZEN) `pending` ile
// başlayan alanı ya `exempt`/`authenticated`/`unauthenticated`/`failed`'e
// YAZAR, `AuthGuard` (ZORLAYAN) EXHAUSTIVE switch ile okuyup zorlar.
//
// `TenantResolution`'ın TERSİNE bu birleşim `tenancy/**` İÇİNDE DEĞİL,
// `auth/**` içinde yaşar — `request-context.types.ts` (additive) bunu
// İTHAL EDER (`RequestContext.auth` alanı). Bu, `TenantResolution`'ın
// tersi bağımlılık yönüdür (orada `tenancy` → `request-context`); burada
// `request-context` → `auth`. İkisi de AYNI ilkeyi korur: birleşimin
// KENDİSİ, onu ÜRETEN (middleware) ve ZORLAYAN (guard) kodun yaşadığı
// dizinde tanımlanır.
//
// `pending` → `AuthGuard`'da 500 (middleware zincirine kaydedilmeyi unutan
// rota sessizce açılamaz — `TenantGuard`'ın `pending` dalıyla AYNI gerekçe,
// architect riski 13). `exempt`: `AUTH_EXEMPT_PATHS`'teki uç (health +
// yedi Better Auth delege yolu) — kimlik GEREKMEZ. `unauthenticated`:
// oturum çerezi yok/geçersiz/süresi geçmiş VEYA oturum geçerli ama kullanıcı
// `user-eligibility.ts` kriterini KARŞILAMIYOR (soft-delete/suspended —
// hesap durumu İSTEMCİYE SIZDIRILMAZ, aynı 401 `UNAUTHENTICATED`).
// `failed`: `auth.api.getSession()`'ın BEKLENMEDİK şekilde fırlattığı
// (ör. DB erişilemez) durum — `AuthGuard` bunu `AuthProviderFailedError`'a
// çevirir (S5'in sınıfı, DÖRDÜNCÜ bir hata sınıfı İCAT EDİLMEZ).

/**
 * Kimliği doğrulanmış bir isteğin ALS depo nesnesine yazılan asgari özeti.
 * `email`/`name` BİLEREK YOK (K-A4/K-A5 deseniyle AYNI — context iş/PII verisi
 * taşımaz); yalnızca sahiplik/korelasyon için gereken iki opak kimlik.
 */
export type CurrentUserIdentity = {
  readonly userId: string
  readonly sessionId: string
}

/**
 * Discriminated union — `AuthGuard` (bu alt görev) bunu EXHAUSTIVE switch ile
 * okur. `TenantResolution` ile AYNI beş-durumlu iskelet (`pending`/`exempt`/
 * başarı/başarısızlık/beklenmedik-hata), AUTH alanına özgü isimlerle.
 */
export type AuthResolution =
  | { readonly kind: 'pending' }
  | { readonly kind: 'exempt' }
  | ({ readonly kind: 'authenticated' } & CurrentUserIdentity)
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'failed'; readonly cause: unknown }
