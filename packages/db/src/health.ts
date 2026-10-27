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
 */
export async function checkDatabaseConnection(db: PrismaDatabase): Promise<void> {
  await db.$queryRaw`SELECT 1`
}
