// @arkesoft/storefront — ortak `assertNever` yardımcısı (ROADMAP v0.0.10,
// T-012/S7, CLAUDE.md §4: "discriminated union + exhaustive `switch` (+
// `assertNever`) kullan; boolean bayrak yığını kurma")
//
// `apps/admin/src/errors/assert-never.ts` / `apps/api/src/errors/assert-
// never.ts` İTHAL EDİLEMEZ (CLAUDE.md §3: bağımlılık yönü `apps/*` →
// `packages/*`; başka bir `apps/*` paketine ASLA) — bu yüzden AYNI imza/
// davranışla YEREL bir kopya (`@arkesoft/theme-sdk/src/assert-never.ts`'in
// dosya başı yorumunun "beşinci kopya" dediği sınıfın devamı).
//
// Bu dosya, `src/middleware.ts`'in (S8'in dosyası) o anda taşıdığı YEREL
// kopyanın BİREBİR aynısıdır — T-012/S7 bu modülü uygulama-içi bir dosyaya
// ÇIKARDI, `middleware.ts`'E DOKUNMADI (po'nun ataması, aynı-dosya
// çakışmasını önlemek için): S8 kendi dosyasını bu modülü import edecek
// şekilde güncelleyecek, bu alt görevin kapsamı DEĞİL.

/**
 * Bir birleşim (union) tipinin EXHAUSTIVE `switch`'inde `default` dalında
 * çağrılır. `value`'nun tipi `never` İSE bu fonksiyon hiçbir zaman çalışma
 * zamanında ÇAĞRILMAZ — derleme zamanı kanıtı budur: birleşime yeni bir üye
 * eklenip bir dal UNUTULURSA `value`'nun tipi artık `never` OLMAZ ve
 * `pnpm typecheck` KIRILIR.
 *
 * @param value - teorik olarak `never` olması gereken birleşim kalıntısı.
 * @param context - hangi dosyanın/alanın yakaladığını tanımlayan kısa etiket
 *   (ör. `'theme-css.ts: ThemeSettingDefinition.type'`). Hata mesajına
 *   gömülür; bu fonksiyon HİÇBİR ZAMAN PII/sır taşıyan bir değerle
 *   çağrılmaz — tüm çağıranlar discriminated union ETİKETLERİ üzerinde
 *   çalışır.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: beklenmeyen değer — ${JSON.stringify(value)}`)
}
