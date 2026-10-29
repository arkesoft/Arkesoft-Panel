// @arkesoft/db — tenant context kancası: `withTenant()` + GUC sabiti
// (ROADMAP v0.0.13, T-005/S3, architect K-E7)
//
// Bu dosya, v0.0.13'ün RLS politikasının (bkz.
// `prisma/migrations/<ts>_rls_tenant_isolation/migration.sql`) okuduğu
// Postgres GUC'unu (`current_setting(<ad>, true)`) ÇALIŞMA ZAMANINDA tek bir
// yoldan yazar. `app.tenant_id` jetonu KODDA BAŞKA HİÇBİR YERDE literal
// geçmez (K-E12/AC4 mekanik kontrolü) — `TENANT_CONTEXT_SETTING` bu paketin
// TEK dışa açık kaynağıdır; `src/tenancy.ts`'in yorumları ve S4'ün canlı
// katalog linter'ı bu sabiti İTHAL EDER, literal yazmaz (R-P3).
//
// `set_config(<ad>, tenantId, true)` — ÜÇÜNCÜ argüman `true` = `SET LOCAL`
// semantiği: transaction COMMIT/ROLLBACK olduğunda ayar DÜŞER, bağlantı
// havuzundaki fiziksel bağlantı bir SONRAKİ tenant'a bu değeri SIZDIRMAZ.
// ROADMAP'in "`SET LOCAL app.tenant_id = $1`" ifadesi PostgreSQL'de GEÇERSİZ
// (`SET` bağlanabilir parametre almaz, PM riski 2) — aynı semantiği (bağlı
// PARAMETRE + transaction sonunda düşme) karşılayan tek yol `set_config()`
// FONKSİYON ÇAĞRISI; her iki argüman da Prisma'nın ETİKETLİ ŞABLONU
// (`tx.$queryRaw`) üzerinden BAĞLANMIŞ PARAMETRE olarak geçer — dize
// birleştirme veya `$queryRawUnsafe`/`$executeRawUnsafe` YOKTUR (A-E4 ile
// ölçüldü: etiketli şablon `set_config` için hem ayar adını hem değeri
// parametre olarak kabul ediyor).
//
// GUC adı istemciden `WeakMap` ile okunur (bkz. `registerTenantContextSetting`,
// `client.ts`'in `createPrismaClient`'ı `tenantContextSetting` seçeneği
// VERİLDİĞİNDE çağırır) — kayıt yoksa `withTenant` FAIL-CLOSED `throw` eder;
// "tenant context'siz" bir istemci üzerinde sessizce context'siz çalışmaya
// İZİN VERİLMEZ.
//
// İÇ İÇE ÇAĞRI YAPISAL OLARAK İMKÂNSIZ: `callback`'e verilen `tx`
// (`TransactionClient`, bkz. `client.ts`) `$transaction` METODUNU TAŞIMAZ —
// `withTenant(db, tenantId, (tx) => withTenant(tx, ...))` yazmaya çalışmak
// `tx`'in tipinde `$transaction` üyesi bulunmadığı için DERLENMEZ, çalışma
// zamanı kontrolü gerekmez.
//
// `tenantId` boş/yalnızca boşluk ise `throw` — cuid2 BİÇİM kontrolü BİLEREK
// YOK (ADR-0003 madde 1: "ID formatı değişebilir" ile çelişir, bu fonksiyon
// biçime bağımlı olmamalı).

import type { PrismaDatabase, TransactionClient } from './client.js'

/**
 * RLS politikalarının okuduğu Postgres GUC (`current_setting`) adı. Paketin
 * TEK dışa açık kaynağı — bu jetonu literal yazan ikinci bir yer (test
 * yardımcıları hariç, bkz. dosya başı) OLMAMALIDIR.
 */
export const TENANT_CONTEXT_SETTING = 'app.tenant_id'

/**
 * Hangi `PrismaDatabase` örneğinin tenant context kancasına izin verdiğini
 * (hangi GUC adıyla) tutan kayıt. `WeakMap` seçildi: istemci çöp
 * toplandığında kayıt da düşer, ek bir temizleme mekanizması gerekmez.
 */
const tenantContextSettingByClient = new WeakMap<PrismaDatabase, string>()

/**
 * `client.ts`'in İÇ kullanımı — paket dışına (`index.ts`) AÇILMAZ. Verilen
 * istemci örneğini, `withTenant`'ın yazacağı GUC adıyla ilişkilendirir.
 * `createPrismaClient` seçeneklerinde `tenantContextSetting` VERİLMEDİYSE bu
 * fonksiyon hiç ÇAĞRILMAZ — o istemci üzerinde `withTenant` çağrısı
 * fail-closed `throw` eder.
 */
export function registerTenantContextSetting(client: PrismaDatabase, settingName: string): void {
  tenantContextSettingByClient.set(client, settingName)
}

/**
 * Verilen `tenantId` için TEK bir transaction açar, transaction'ın İLK
 * işlemi olarak GUC'u bağlı parametreyle ayarlar ve ardından `callback`'i
 * AYNI transaction istemcisiyle (`TransactionClient`) çağırır.
 *
 * @throws `client` `createPrismaClient({ tenantContextSetting })` İLE
 *   kurulmamışsa (kayıt yoksa, fail-closed).
 * @throws `tenantId` boş veya yalnızca boşluk karakterlerinden oluşuyorsa.
 */
export function withTenant<T>(
  client: PrismaDatabase,
  tenantId: string,
  callback: (tx: TransactionClient) => Promise<T>,
): Promise<T> {
  const settingName = tenantContextSettingByClient.get(client)
  if (settingName === undefined) {
    throw new Error(
      'withTenant(): bu istemci tenant context için kaydedilmemiş — ' +
        'createPrismaClient() "tenantContextSetting" seçeneğiyle oluşturulmalı.',
    )
  }

  if (tenantId.trim().length === 0) {
    throw new Error('withTenant(): "tenantId" boş veya yalnızca boşluk olamaz.')
  }

  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config(${settingName}, ${tenantId}, true)`
    return callback(tx)
  })
}
