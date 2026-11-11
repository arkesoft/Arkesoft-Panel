// @arkesoft/trpc — `session.list` tel sözleşmesi (ROADMAP v0.0.15.1, T-017/S4,
// architect "TASARIM" bölümü)
//
// ⚠⚠ İSİM ÇAKIŞMASI BİLEREK ÖNLENDİ (po ölçtü, Orkestratör doğruladı):
// `apps/api/src/auth/sessions.service.ts`'in `SessionSummary`'si BAŞKA bir
// şekildir (oturum listesi iş mantığının İÇ tipi) — bu dosyanın tel tipi onunla
// KARIŞTIRILMASIN diye `ActiveSessionWire` adlandırıldı
// (`session-identity.schema.ts`'in `apps/api` `SessionSummary`'siyle yaptığı
// AYNI bilinçli önleme — bkz. o dosyanın başlık yorumu).
//
// K5 bağlayıcı kurallar (ADR-0009 madde 7, `job-summary.schema.ts`/
// `tenant-summary.schema.ts` ile AYNI):
//   1. Opsiyonel ÇIKTI alanı YOK — yokluk `null` ile ifade edilir
//      (`ipAddress` bunun TEK örneği: boş dize sentinel'i `SessionsService.
//      listOwnSessions`'da, `toSessionSummary()` (`apps/api/src/auth/
//      session-summary.mapper.ts`) içinde `null`'a eşlenir, bu şemada
//      DEĞİL — port adaptörü bu alanı OLDUĞU GİBİ taşır, ikinci bir
//      dönüşüm YAPMAZ).
//   2. Yalnızca JSON ilkelleri — `Date` YOK. Zaman alanları ISO-8601 dizesidir
//      (`trpc.ts`'in "transformer YOK" değişmezi). ⚠ `z.iso.datetime()`
//      KULLANILIR, `z.string().datetime()` DEĞİL: ikincisi zod 4.6.7'de
//      `@deprecated` ve `@typescript-eslint/no-deprecated` (strictTypeChecked)
//      bunu LINT HATASI yapıyor (emsal: `job-summary.schema.ts:16-29`).
//   3. Çıktı şeması İŞ KURALI taşımaz.
//
// Enum'lar YERELDİR (`job-summary.schema.ts:4-14` emsali) — bu paket
// `@arkesoft/db`'yi ANMAZ (ADR-0009 madde 5): tarayıcı tüketicisi olan bir
// pakete Prisma'nın ürettiği durum sözlüğünü ne TİP ne DEĞER olarak sokmak,
// Prisma tiplerini admin SPA'sının modül grafiğine sızdırır. `apps/api`'nin
// adaptörü (S9) veritabanı değerini bu yerel sözlüğe eşler; sapma riski orada
// bir tip pini + çalışma zamanı pini ile yakalanır.
//
// ⚠⚠ TELE ÇIKMAYAN İKİ ŞEY (architect TASARIM bölümü, bağlayıcı):
//   (1) `token` — zaten `select`'te yok (adaptörün işi), bu şemada hiç alan
//       olarak BİLDİRİLMEDİ.
//   (2) HAM `userAgent` dizesi — BİLİNÇLİ olarak tele konmaz (parmak izi
//       echo'su + ekrana yabancı dize basma yüzeyi). Sızdırmazlık `.output()`
//       ile YAPISALDIR, testle DEĞİL (`z.object()`'in bilinmeyen anahtarları
//       SOYMASI — `job-summary.schema.ts:76-79`'un AYNI gerekçesi).

import { z } from 'zod'

/**
 * Tarayıcı ailesi sözlüğü — `apps/api`'nin kullanıcı aracısı ayrıştırıcısının
 * YEREL, tele-özgü karşılığı. `unknown` ayrıştırılamayan/tanınmayan bir aracı
 * dizesi için VAR OLAN bir değerdir — opsiyonel alan değil (K5 kuralı 1).
 */
export const deviceBrowserSchema = z.enum([
  'chrome',
  'firefox',
  'safari',
  'edge',
  'opera',
  'samsung',
  'other',
  'unknown',
])

/** {@link deviceBrowserSchema}'nın çıkarılan tip karşılığı. */
export type DeviceBrowserWire = z.infer<typeof deviceBrowserSchema>

/** İşletim sistemi ailesi sözlüğü — {@link deviceBrowserSchema} ile AYNI gerekçe. */
export const deviceOsSchema = z.enum([
  'windows',
  'macos',
  'linux',
  'ios',
  'android',
  'other',
  'unknown',
])

/** {@link deviceOsSchema}'nın çıkarılan tip karşılığı. */
export type DeviceOsWire = z.infer<typeof deviceOsSchema>

/**
 * `session.list`'in öğe şekli — kullanıcının KENDİ aktif oturumlarından biri.
 * Sekiz alan, hiçbiri kiracı taşımaz (`Session`'da `tenantId` YOK —
 * `schema.prisma:187-202`, po doğruladı).
 *
 * `ipAddress` — boş dize SENTİNEL'i `SessionsService.listOwnSessions`'da
 * (`toSessionSummary()`, `apps/api/src/auth/session-summary.mapper.ts`)
 * `null`'a eşlenir (K5 kuralı 1); bu şema o eşlemeyi YAPMAZ, yalnızca
 * sonucunu BİLDİRİR.
 */
export const activeSessionWireSchema = z.object({
  id: z.string(),
  isCurrent: z.boolean(),
  browserFamily: deviceBrowserSchema,
  osFamily: deviceOsSchema,
  ipAddress: z.string().nullable(),
  lastSeenAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
})

/** {@link activeSessionWireSchema}'nın çıkarılan tip karşılığı. */
export type ActiveSessionWire = z.infer<typeof activeSessionWireSchema>
