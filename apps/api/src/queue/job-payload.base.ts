// @arkesoft/api — iş payload'ının TABAN şeması (ROADMAP v0.0.11, T-013/S5,
// architect K5 katman 1)
//
// ⚠ CLAUDE.md §7 md 7'nin ("kuyruk işinin payload'ında `tenantId` VAR")
// TİP DÜZEYİNDEKİ karşılığı. `JobDefinition<P extends JobPayloadBase>`
// kısıtı sayesinde `tenantId` TAŞIMAYAN bir şemayla iş tanımı DERLENMEZ —
// bu bir uyarı yorumu değil, derleyici kapısı (AC5'in ilk yarısı).
//
// Payload kuyruğa girmeden ÖNCE bu şemayla parse edilir (`QueueService.
// enqueue`) — CLAUDE.md §4: "dış dünyadan gelen her veri Zod ile parse
// edilir; parse edilmemiş veriye tip verilmez". Kuyruk payload'ı iki kez dış
// veridir: (1) üretici çağrısı, (2) Redis'ten geri okuma (worker tarafında
// T-013/S6 TEKRAR parse eder — tek parse YETMEZ, araya Redis giriyor).

import { z } from 'zod'

/**
 * Her iş payload'ının taşımak ZORUNDA olduğu alan. `z.object` varsayılan
 * olarak tanınmayan anahtarları DÜŞÜRÜR (strip) — v0.0.11'in tek iş türü
 * (kiracı kurulum iskeleti) ek alan taşımadığı için bu tam istenen davranış:
 * çağıran fazladan bir alan geçirirse o alan JSONB'ye SESSİZCE yazılmaz.
 *
 * `min(1)`: boş dize bir kiracı kimliği DEĞİLDİR; `withTenant()` de boş
 * `tenantId` için fail-closed fırlatır (`@arkesoft/db` `tenant-context.ts`)
 * — kapıyı iki katmanda tutuyoruz ki hata kuyruğa girmeden, ÜRETİCİDE
 * yakalansın.
 */
export const jobPayloadBaseSchema = z.object({
  tenantId: z.string().min(1),
})

/**
 * Tüm iş payload'larının üst sınırı. `readonly`: handler payload'ı
 * DEĞİŞTİREMEZ (`JobHandler` sözleşmesi payload'ı salt okunur kabul eder —
 * değiştirilmiş payload Redis'teki kayda GERİ YAZILMAZ, yani mutasyon sessiz
 * bir yanlış bilgi kaynağı olurdu).
 */
export type JobPayloadBase = Readonly<z.infer<typeof jobPayloadBaseSchema>>
