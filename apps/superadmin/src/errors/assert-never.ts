// @arkesoft/superadmin — ortak `assertNever` yardımcısı (ROADMAP v0.0.20,
// T-021/S8, CLAUDE.md §4: "discriminated union + exhaustive `switch`
// (+ `assertNever`) kullan; boolean bayrak yığını kurma")
//
// `apps/admin/src/errors/assert-never.ts` İTHAL EDİLEMEZ (CLAUDE.md §3:
// bağımlılık yönü `apps/*` → `packages/*`; başka bir `apps/*` paketine
// ASLA) — bu yüzden AYNI imza/davranışla YEREL bir kopya.

/**
 * Bir birleşim (union) tipinin EXHAUSTIVE `switch`'inde `default` dalında
 * çağrılır. `value`'nun tipi `never` İSE bu fonksiyon hiçbir zaman çalışma
 * zamanında ÇAĞRILMAZ — derleme zamanı kanıtı budur.
 */
export function assertNever(value: never, context: string): never {
  throw new Error(`${context}: beklenmeyen değer — ${JSON.stringify(value)}`)
}
