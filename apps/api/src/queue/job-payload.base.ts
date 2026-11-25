// @arkesoft/api — iş payload'ının TABAN şeması (ROADMAP v0.0.11, T-013/S5,
// architect K5 katman 1; `traceId` ALANI ROADMAP v0.0.17, T-028/S7, architect
// K-A28-1 KUYRUK YAYILIMI EKLEMESİ)
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
//
// ⚠⚠ `traceId` OPSİYONEL — İKİ GEREKÇE: (1) EXPAND/CONTRACT (CLAUDE.md §4):
// bu alan eklenmeden ÖNCE kuyruğa yazılmış/bekleyen bir iş kaydı bu şemayla
// AYNEN parse EDİLEBİLMELİ, aksi hâlde platform rollback'i şema rollback'i
// gerektirirdi; (2) alan JSONB İÇERİĞİDİR — Prisma kolonu DEĞİL, `packages/db`
// şemasına HİÇBİR DOKUNUŞ yok, migration YOK. ⚠⚠ SAHTECİLİK bu dosyada
// ÖNLENMEZ — çağıranın gönderdiği değer `QueueService.enqueue`'da ALS/Katman 1
// korelasyonuyla ÜZERİNE YAZILIR (`queue.service.ts` dosya başı yorumu);
// buradaki regex yalnızca BİÇİMİ (`getCurrentTraceId()`'in ürettiği 32 hex
// karakter) doğrular.
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
 *
 * `traceId`: `observability/trace-id.ts`'in `getCurrentTraceId()`'ının
 * ürettiği biçimle (16 bayt → 32 hex karakter) UYUMLU, OPSİYONEL. Tek kaynak
 * BURASI — `jobPayloadBaseSchema.extend(...)` ile kurulan HER iş türü şeması
 * (`queue/jobs/tenant-provision/payload.schema.ts:30`) bu alanı TEK SATIRLA
 * devralır; ikinci bir tanım açılmaz.
 */
export const jobPayloadBaseSchema = z.object({
  tenantId: z.string().min(1),
  traceId: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
})

/**
 * Tüm iş payload'larının üst sınırı. `readonly`: handler payload'ı
 * DEĞİŞTİREMEZ (`JobHandler` sözleşmesi payload'ı salt okunur kabul eder —
 * değiştirilmiş payload Redis'teki kayda GERİ YAZILMAZ, yani mutasyon sessiz
 * bir yanlış bilgi kaynağı olurdu).
 */
export type JobPayloadBase = Readonly<z.infer<typeof jobPayloadBaseSchema>>
