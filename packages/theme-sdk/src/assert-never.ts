// @arkesoft/theme-sdk — ortak `assertNever` yardımcısı (ROADMAP v0.0.9,
// T-010/S2, architect "⚠ `assertNever` 5. kopya" notu)
//
// ⚠ BU, PLATFORMDAKİ BEŞİNCİ `assertNever` KOPYASIDIR VE BU BİLİNÇLİ BİR
// KARAR — ROADMAP borç satırı 1583 (`apps/storefront/src/middleware.ts`,
// dördüncü kopya) şu anda **dört** üretim kopyası sayıyor
// (`apps/api/src/errors/assert-never.ts`, `apps/admin/src/errors/assert-never.ts`,
// `scripts/sync-platform-version.ts`, `apps/storefront/src/middleware.ts`) ve
// AÇIKÇA "terfi **önerilmiyor**" diyor (gerekçesi: davranışsal sonuç yok,
// erken soyutlama olur), paket-içi modüle çıkarmayı öneriyor — bu dosya tam
// olarak onu yapıyor, borç 1583'ün tavsiyesiyle ÇATIŞMIYOR, onu teyit ediyor.
//
// Paylaşılan bir pakete (`packages/errors` vb.) TERFİ BİLİNÇLİ OLARAK
// REDDEDİLDİ: `packages/theme-sdk`'nın kapalı bağımlılık listesi
// (`{ zod: 'catalog:' }`, bkz. `__tests__/purity.test.ts`) `@arkesoft/errors`
// İÇERMİYOR — bu paketi paylaşılan bir yardımcıya bağımlı kılmak yalnızca bu
// tek fonksiyon için yeni bir paketler-arası kenar doğurur ve CLAUDE.md §3'ün
// "kapalı bağımlılık" kararını çürütür. `apps/api`'nin kopyasını import etmek
// zaten yapısal olarak İMKÂNSIZ (CLAUDE.md §3: bağımlılık yönü `apps/* →
// packages/*`, tersi yasak).
//
// `apps/api`/`apps/admin` kopyalarıyla AYNI imza/davranış (platform idiomu,
// CLAUDE.md §4) — yalnızca konum paket-yerel.

/**
 * Bir birleşim (union) tipinin EXHAUSTIVE `switch`'inde `default` dalında
 * çağrılır. `value`'nun tipi `never` İSE bu fonksiyon hiçbir zaman çalışma
 * zamanında ÇAĞRILMAZ — derleme zamanı kanıtı budur: birleşime yeni bir üye
 * eklenip bir dal UNUTULURSA `value`'nun tipi artık `never` OLMAZ ve
 * `pnpm typecheck` KIRILIR.
 *
 * @param value - teorik olarak `never` olması gereken birleşim kalıntısı.
 * @param context - hangi dosyanın/alanın yakaladığını tanımlayan kısa etiket
 *   (ör. `'validate-manifest.ts: ThemeSettingDefinition.type'`). Hata
 *   mesajına gömülür; bu fonksiyon HİÇBİR ZAMAN PII/sır taşıyan bir değerle
 *   çağrılmaz — tüm çağıranlar discriminated union ETİKETLERİ üzerinde
 *   çalışır.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: beklenmeyen değer — ${JSON.stringify(value)}`)
}
