// @arkesoft/api — ortak `assertNever` yardımcısı (ROADMAP v0.0.5, T-006/S3,
// architect kısıt 4 / PO kısıt "assertNever birleştirmesi AuthGuard'dan ÖNCE")
//
// Bugüne kadar ÜÇ bağımsız kopyası vardı: `errors/error-mapping.ts`'in kendi
// yerel helper'ı, `tenancy/tenant.guard.ts`'in `TenantResolution` birleşimine
// özel yerel helper'ı, `tenancy/tenant-resolver.service.ts`'in host çözümü
// birleşimine özel yerel helper'ı. `AuthGuard` (S6, T-006) bunlara
// DÖRDÜNCÜYÜ ekleyecekti — bu yüzden birleştirme S6'dan ÖNCE yapıldı. Üç
// kopya SİLİNDİ, hepsi bu TEK helper'ı import eder (kanıt: raporda grep
// çıktısı — bu dosyanın KENDİSİ eski yerel adları bitişik YAZMAZ, aksi
// hâlde doğrulama grep'i kendi dokümantasyonunu eşleştirip yanlış pozitif
// üretir).
//
// `context` parametresi HANGİ dosyanın/switch'in beklenmeyen değeri
// yakaladığını hata mesajında TAŞIR — üç eski kopyanın her biri kendi dosya
// adını/alan adını mesaja GÖMÜYORDU; bu bilgi KAYBOLMADI, çağıran tarafından
// açıkça geçiliyor.

/**
 * Bir birleşim (union) tipinin EXHAUSTIVE `switch`'inde `default` dalında
 * çağrılır. `value`'nun tipi `never` İSE bu fonksiyon hiçbir zaman çalışma
 * zamanında ÇAĞRILMAZ — derleme zamanı kanıtı budur
 * (`@typescript-eslint/switch-exhaustiveness-check`,
 * `packages/config/eslint/base.js`). Birleşime yeni bir üye eklenip bir dal
 * UNUTULURSA `value`'nun tipi artık `never` OLMAZ ve `pnpm typecheck`
 * KIRILIR — "default allow" dalı yapısal olarak YOKTUR (R4 telafisi #1).
 *
 * @param value - teorik olarak `never` olması gereken, ama çalışma zamanında
 *   (ör. middleware zincirinin koşmadığı bir rota) beklenmeyen bir değer
 *   taşıyabilecek birleşim kalıntısı.
 * @param context - hangi dosyanın/alanın yakaladığını tanımlayan kısa etiket
 *   (ör. `'tenant.guard.ts: TenantResolution.kind'`). Hata mesajına gömülür;
 *   bu fonksiyon HİÇBİR ZAMAN PII/sır taşıyan bir değerle çağrılmaz — tüm
 *   çağıranlar discriminated union ETİKETLERİ üzerinde çalışır.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: beklenmeyen değer — ${JSON.stringify(value)}`)
}
