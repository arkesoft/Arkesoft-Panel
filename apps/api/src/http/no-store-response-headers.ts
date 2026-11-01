// @arkesoft/api — no-store önbellek başlığı politikası (ROADMAP v0.0.7,
// T-008/S3, architect K6, borç 1440+1441+1453)
//
// TEK politika modülü — `cache-control`/`vary` literal'leri YALNIZCA BURADA
// yazılır. `security` tur 1'in medium bulgusu (GUARD ATLATMA): kimlik Cookie
// ile taşındığı için (Authorization DEĞİL), `Cache-Control`sız bir `200 GET`
// RFC 9111 §4.2.2 gereği paylaşımlı bir önbellek (CDN/ters vekil/ingress)
// tarafından sezgisel olarak saklanabilir — saklanan yanıt daha sonra
// kimliksiz/başka kullanıcılı bir isteğe servis edilirse `TenantGuard`+
// `AuthGuard` zinciri TAMAMEN ATLANIR (CLAUDE.md §7 madde 9).
//
// ÖNCEKİ hâl (`trpc.controller.ts`'in `forwardTrpcWebResponse`'u) bu iki
// başlığı yalnızca `/trpc` yanıtlarına, YANIT BAŞARIYLA ÜRETİLDİKTEN SONRA
// yazıyordu — guard reddi (401/403/404) yanıtları bu başlıkları HİÇ
// TAŞIMIYORDU (0/5 ÖLÇÜLDÜ, AC19). Bu modül `no-store-headers.middleware.ts`
// ÜZERİNDEN guard'lardan ÖNCE koşan GLOBAL bir middleware'e taşınır — Nest
// sırası middleware → guard → interceptor olduğu için guard reddi yanıtları
// da bu başlıkları OTOMATİK taşır (middleware'in yazdığı başlık aynı `res`'te
// kalır, `AppExceptionFilter` yalnızca `setHeader`+`reply` yapar, HİÇBİR
// başlığı SİLMEZ).
//
// Fail-closed varsayılan: politika "her şey `no-store`", istisna listesi
// YOK. İlk gerçekten public önbelleklenebilir yanıt doğduğunda rota kapsamlı
// bir istisna eklenecek — bugün YOK.
//
// `HttpResponseLike` yeterli (`setHeader` yüzeyi) — `HttpAdapterHost`
// gerekmiyor, adaptör-nötrlük korunur (K-A1).

import type { HttpResponseLike } from './http-request.types.js'

/**
 * HER yanıta (başarı VE guard reddi dahil) `no-store` önbellek politikasını
 * yazar. Middleware aşamasında henüz başka bir `vary` değeri yazılmadığı için
 * `setHeader` güvenlidir — sonradan yazan forward döngüleri (`trpc.
 * controller.ts`, `auth.controller.ts`) kendi `vary` eklerini `appendHeader`
 * ile yapmak ZORUNDADIR (bu modülün yazdığı `Cookie`'yi EZMEMEK için).
 */
export function applyNoStoreHeaders(res: HttpResponseLike): void {
  res.setHeader('cache-control', 'no-store, private')
  res.setHeader('vary', 'Cookie')
}
