// @arkesoft/admin — ortak `assertNever` yardımcısı (DÜZELTME TURU 2, T-008/S5,
// CLAUDE.md §4: "discriminated union + exhaustive `switch` (+ `assertNever`)
// kullan; boolean bayrak yığını kurma")
//
// `apps/api/src/errors/assert-never.ts` İTHAL EDİLEMEZ (CLAUDE.md §3:
// bağımlılık yönü `apps/*` → `packages/*`; başka bir `apps/*` paketine
// ASLA) — bu yüzden AYNI imza/davranışla YEREL bir kopya. İkinci bir
// tüketici (bugün yalnızca `messages.ts`'in `resolvePanelErrorMessage`'ı)
// doğarsa bu dosya BÜYÜMEZ, yalnızca yeniden kullanılır.

/**
 * Bir birleşim (union) tipinin EXHAUSTIVE `switch`'inde `default` dalında
 * çağrılır. `value`'nun tipi `never` İSE bu fonksiyon hiçbir zaman çalışma
 * zamanında ÇAĞRILMAZ — derleme zamanı kanıtı budur: birleşime yeni bir üye
 * eklenip bir dal UNUTULURSA `value`'nun tipi artık `never` OLMAZ ve
 * `pnpm typecheck` KIRILIR.
 *
 * @param value - teorik olarak `never` olması gereken birleşim kalıntısı.
 * @param context - hangi dosyanın/alanın yakaladığını tanımlayan kısa etiket
 *   (ör. `'messages.ts: PanelError.kind'`). Hata mesajına gömülür; bu
 *   fonksiyon HİÇBİR ZAMAN PII/sır taşıyan bir değerle çağrılmaz — tüm
 *   çağıranlar discriminated union ETİKETLERİ üzerinde çalışır.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: beklenmeyen değer — ${JSON.stringify(value)}`)
}
