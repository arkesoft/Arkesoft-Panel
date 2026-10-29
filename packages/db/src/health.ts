// @arkesoft/db — veritabanı bağlantı sağlığı kontrolü (ROADMAP v0.0.4, T-002/ST-3,
// architect K-A3)
//
// Ham SQL BİLEREK bu pakette kalıyor (CLAUDE.md §3: şema/migration/RLS
// sorumluluğu `packages/db`'nindir). Bu fonksiyon olmasaydı `apps/api`
// kendi `$queryRaw` çağrısını yazardı — bu hem CLAUDE.md §3'ün paket
// sınırını deler hem de v0.0.13'ün şema/erişim denetimini (RLS linter'ı,
// `TENANT_SCOPED_TABLES` taraması) `packages/db` dışına kaçan bir sorguyla
// baypas eder. `checkDatabaseConnection` tek giriş noktası olduğu için
// v0.0.13 bu çağrıyı ileride doğru role (`arkesoft_app`, BYPASSRLS'siz)
// yönlendirebilir; dağınık `$queryRaw` çağrıları bunu imkansız kılardı.
//
// `$queryRaw` kullanımının gerekçesi (CLAUDE.md §4 "ham `prisma.*` çağrısı
// yalnızca platform seviyesi tablolarda kabul edilir" kuralı): bu sorgu
// HİÇBİR TABLOYU hedeflemez, sabit bir `SELECT 1` değişmezidir — `tenant_id`
// taşıyan bir satır okumaz/yazmaz, dolayısıyla tenant filtresi kuralı
// uygulanmaz.
//
// ZAMAN AŞIMI SARMALAMASI BİLEREK BURADA DEĞİL: bu bir iş kuralı değil,
// `apps/api`'nin HTTP bütçesidir (`/health/ready`'nin kaç ms'de 503'e
// düşeceği, ST-6). Bu paket yalnızca "bağlantı canlı mı" sorusuna cevap
// verir; "ne kadar beklemeye razıyım" sorusunu çağıran kendi
// `Promise.race`/`AbortSignal` mekanizmasıyla kurar.

import type { PrismaDatabase } from './client.js'

/**
 * Veritabanı bağlantısının canlı olduğunu doğrular. Sabit `SELECT 1`
 * sorgusu başarıyla dönerse normal döner (`Promise<void>`); bağlantı
 * kurulamazsa veya sorgu başarısız olursa Prisma'nın fırlattığı hata
 * ÇAĞIRANA İLETİLİR (yutulmaz, boole'a çevrilmez) — CLAUDE.md §4
 * "beklenen durumlar için hata fırlat, null döndürüp çağıranı tahmine
 * zorlama" ilkesi. `apps/api`'nin `/health/ready` ucu bu hatayı kendi
 * zaman aşımı ve hata eşlemesiyle (503) yakalar.
 *
 * "SON TEMİZLİK" (ROADMAP v0.0.5, T-006, `security` tur4 S4-1 — ALTINCI
 * KAPI KAPATILDI): imza artık `AppPrismaDatabase` DEĞİL,
 * `Pick<PrismaDatabase, '$queryRaw'>` — TEK üyeli bir parametre tipi.
 * Önceki sürüm (`AppPrismaDatabase`, dört/üç üyeli allowlist) bu fonksiyona
 * GEREĞİNDEN GENİŞ bir yetki veriyordu: `security` tur4'ün ölçtüğü asıl
 * hata, "1 çağrı yolu" gerekçesinin GERÇEKLEŞEN çağrıyı ölçüp ERİŞEBİLEN
 * çağıranı (`.db` getter'ını gören HER `apps/api` servisi) ÖLÇMEMESİYDİ —
 * `$queryRaw` `AppPrismaDatabase`'de KALDIĞI sürece `db.$queryRaw` ile
 * `account`/`session`/`verification` (RLS YOK, `relrowsecurity=f`)
 * tablolarından ham SQL okuyan bir çağrı `tsc 0`/`eslint 0` ile derlenirdi
 * (ÖLÇÜLDÜ: 2830 parola hash'i). Tek üyeli parametre tipi bu yetkiyi
 * SADECE bu fonksiyona verir: `apps/api/src/prisma/prisma.service.ts`'in
 * `connectionProbe` erişimcisi AYNI dar tipi döner ve TEK tüketicisi
 * `apps/api/src/health/checks/database.health-check.ts`'tir.
 * `AppPrismaDatabase`'in KENDİSİ artık `$queryRaw` TAŞIMAZ (bkz. `client.ts`
 * doc'u, negatif pin `pinAppPrismaDatabaseDropsQueryRaw`) — bu fonksiyonun
 * DAVRANIŞI değişmedi (hâlâ sabit `SELECT 1`), yalnızca İMZASININ verdiği
 * yetki YÜZEYİ daraldı.
 */
export async function checkDatabaseConnection(
  db: Pick<PrismaDatabase, '$queryRaw'>,
): Promise<void> {
  await db.$queryRaw`SELECT 1`
}
