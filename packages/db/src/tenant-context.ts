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
//
// GÜNCELLEME (ROADMAP v0.1.0, T-019/S1, architect VERİ MODELİ — ADR-0021
// §4): `withNewTenant()` + `PlatformTenantWriter` EKLENDİ — kayıt akışının
// YENİ bir kiracıyı ve onun kiracı kapsamlı satırlarını (`tenant_
// membership(owner)`, `subscription`) TEK transaction'da yazabilmesi için.
// `app.tenant_id` jetonunun TEK EVİ olma kuralı BOZULMADI: yeni fonksiyon
// AYNI `TENANT_CONTEXT_SETTING` sabitini, AYNI `WeakMap` kaydını ve AYNI
// bağlı-parametre `set_config()` çağrısını kullanır — ikinci bir literal
// AÇILMAZ. Bu, bilerek `withTenant()` ile BİREBİR aynı YETKİYİ taşır, YENİ
// bir yetki VERMEZ (fonksiyonun kendi doc'unda tekrar yazılıdır).

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
 * LATENT YOL (ROADMAP v0.0.5, T-006, `security` tur4 S4-4/S4-6 — `low`,
 * kapatılması ZORUNLU DEĞİL): `Parameters<typeof withTenant>[0]` bu imzadan
 * TAM `PrismaDatabase` tipini türetir (`tsc 0`, `eslint 0`) — isim bazlı
 * hiçbir pin bunu göremez, çünkü `withTenant()`'ın İMZASI bilerek
 * `AppPrismaDatabase`'e DARALTILMADI (PO sapması 1, bağlayıcı — bkz.
 * `client.ts`). Bugün sömürülemez: çalışma zamanında `@Inject(PRISMA_CLIENT)
 * full: Parameters<typeof withTenant>[0]` DI çözülemiyor ("Nest can't
 * resolve dependencies … Symbol(PRISMA_CLIENT) …") çünkü
 * `apps/api/src/prisma/prisma.module.ts` `exports: [PrismaService]` —
 * ham `PRISMA_CLIENT` token'ı o modülün DI grafiğinde dışa açılmıyor.
 * Bariyer `apps/api`'nin modül dışa açma yüzeyinde, bu paketin TİP
 * düzeyinde DEĞİL — `withTenant()`'ın imzası bu yüzden BURADAN
 * DEĞİŞTİRİLMEDİ (imzayı daraltmak K-E5/PO sapması 1'i ihlal eder). Kayıtlı
 * kalan borç: `PrismaModule.exports`'un kanonik tam eşitliğini pinleyen bir
 * test YOK — `exports` dizisine `PRISMA_CLIENT` eklenirse `lint`/
 * `typecheck`/`test`/`test:isolation` hepsi yeşil kalır ve bu latent yol
 * çalışma zamanında da açılır. Bu, `apps/api` tarafının (architect, v0.0.14)
 * işi; bu dosyadan izlenebilir kılınması için not düşülmüştür.
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

/**
 * `withNewTenant()`'ın `insertTenant` geri çağrımına verilen istemci tipi
 * (ROADMAP v0.1.0, T-019/S1, architect VERİ MODELİ — ADR-0021 §4).
 *
 * YALNIZCA İKİ üye: `tenant` (yeni kiracı satırını yazmak için — RLS'siz
 * platform tablosu, GUC kurulmadan INSERT meşrudur) ve `plan` (kayıt
 * akışının `trial` planını OKUMASI için — `Plan` de platform seviyesi,
 * `tenant_id` TAŞIMAZ). `user`/`account`/`session`/`verification`/
 * `twoFactor` BİLEREK YOK (`AUTH_SECRET_BEARING_MODELS`'in BİREBİR aynısı —
 * bu geri çağrım kimlik doğrulama tablolarına erişmemeli) ve `$transaction`
 * BİLEREK YOK (`AppPrismaDatabase`/`TenantTransactionClient`'ın BİREBİR aynı
 * kararı — iç içe transaction yapısal olarak İMKÂNSIZ olmalı). Negatif tip
 * pini: `__tests__/tenant-context-new-tenant.test.ts`.
 */
export type PlatformTenantWriter = Pick<TransactionClient, 'tenant' | 'plan'>

/**
 * Kayıt akışının TEK transaction'ı (ROADMAP v0.1.0, T-019/S1, architect VERİ
 * MODELİ — ADR-0021 §4). Üç adımı SIRAYLA, AYNI transaction içinde yapar:
 *
 *   1. `insertTenant(tx)` — platform `tenant` satırını (ve gerekirse `plan`
 *      okumasını) yazar, `{ id }` döner.
 *   2. GUC'u o satırın id'sine `set_config(…, true)` ile **bağlı
 *      parametreyle** ayarlar (`$queryRawUnsafe` YOK, ikinci literal YOK —
 *      `withTenant()`'ın BİREBİR aynı deseni).
 *   3. `callback(tx, tenantId)` — kiracı kapsamlı satırları (`tenant_
 *      membership(owner)`, `subscription`) GUC KURULDUKTAN SONRA yazar; bu
 *      sıra `WITH CHECK`'in sağlanmasını garanti eder.
 *
 * NEDEN (ROADMAP:3113'ün ikinci bağımsız duvarı — architect'in ölçtüğü
 * yapısal gerçek): `AppPrismaDatabase` `$transaction` TAŞIMAZ (`client.ts`)
 * ve `TenantTransactionClient` `tenant` TAŞIMAZ (`client.ts`) — kiracı
 * satırı ile üyelik/abonelik satırları bugün AYNI transaction'da
 * YAZILAMIYORDU. İki fazlı yazım CLAUDE.md §4'ü ("çok kayıtlı yazma işlemleri
 * transaction içinde") ihlal eder VE somut bir hata sınıfı doğurur: faz B
 * patlarsa SAHİPSİZ bir kiracı kalır, slug `@unique` yüzünden KALICI
 * tutulur, kullanıcı aynı slug'la tekrar deneyemez.
 *
 * ⚠⚠ BU FONKSİYON YENİ BİR YETKİ VERMEZ. Çağıranın GUC'u keyfi bir kiracıya
 * ayarlayabilmesi bugünkü `withTenant(herhangiBirId, …)` ile BİREBİR aynıdır
 * — yeni bir kaçış kapısı DEĞİLDİR, aynı güvenlik garantisinin (çağıranın
 * `tenantId`'yi doğru seçmesine güvenme) ikinci bir çağrı yoludur.
 *
 * `app.tenant_id` jetonu bu dosyanın DIŞINA literal olarak SIZMAZ (K-E12/AC4
 * mekanik taraması — `TENANT_CONTEXT_SETTING` değişkeni burada da
 * KULLANILIR, ikinci bir literal AÇILMAZ).
 *
 * @throws `client` `createPrismaClient({ tenantContextSetting })` İLE
 *   kurulmamışsa (kayıt yoksa, fail-closed — `withTenant`'ın BİREBİR aynı
 *   kontrolü).
 * @throws `insertTenant` boş veya yalnızca boşluk karakterlerinden oluşan bir
 *   `id` döndürürse (`withTenant`'ın `tenantId` kontrolünün BİREBİR aynısı).
 */
export function withNewTenant<T>(
  client: PrismaDatabase,
  insertTenant: (tx: PlatformTenantWriter) => Promise<{ readonly id: string }>,
  callback: (tx: TransactionClient, tenantId: string) => Promise<T>,
): Promise<T> {
  const settingName = tenantContextSettingByClient.get(client)
  if (settingName === undefined) {
    throw new Error(
      'withNewTenant(): bu istemci tenant context için kaydedilmemiş — ' +
        'createPrismaClient() "tenantContextSetting" seçeneğiyle oluşturulmalı.',
    )
  }

  return client.$transaction(async (tx) => {
    const createdTenant = await insertTenant(tx)

    if (createdTenant.id.trim().length === 0) {
      throw new Error(
        'withNewTenant(): "insertTenant" boş veya yalnızca boşluk olan bir "id" döndürdü.',
      )
    }

    await tx.$queryRaw`SELECT set_config(${settingName}, ${createdTenant.id}, true)`
    return callback(tx, createdTenant.id)
  })
}
