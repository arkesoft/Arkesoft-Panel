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
// ROADMAP v0.0.8, T-009/S8, architect K7 — bu cümle ANONİM `/trpc/
// storefront.currentTenant` yolunun (ADR-0012) 200 yanıtıyla TETİKLENMEDİ,
// kod DEĞİŞMEDİ, istisna listesi AÇILMADI. Üç ölçülmüş gerekçe:
//   1. Yanıt `public` ama ÖNBELLEKLENEBİLİR DEĞİL — tek tüketici
//      storefront'un SUNUCU taraflı fetch'i, tarayıcıya HİÇ gitmiyor;
//      repoda ingress/CDN YOK.
//   2. ASIL GEREKÇE: prosedürün GİRDİSİ olmadığı için hedef URI her kiracı
//      için BİREBİR aynı (`/trpc/storefront.currentTenant`, sorgu dizesi
//      yok). RFC 9111'de birincil önbellek anahtarı HEDEF URI'dir; yanıtı
//      ayıran tek şey `Host` BAŞLIĞI — bu yanıtı `public` yapmak URI'ye göre
//      anahtarlayan HERHANGİ bir aracıda DOĞRUDAN çapraz kiracı sızıntısıdır.
//   3. `no-store` KALMANIN maliyeti ~sıfır (CWV/p95 bütçesi v0.20.0).
// AC18 bu yüzden 5/5 → 6/6 çıktı (altıncı vaka: yeni yolun 200'ü) — bkz.
// `apps/api/src/__tests__/no-store-headers.test.ts`.
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
