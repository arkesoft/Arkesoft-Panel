// @arkesoft/db — Prisma istemci fabrikası (ROADMAP v0.0.3, T-001/ST-3)
//
// Üretilen istemciye TEK erişim noktası. Prisma'nın resmi istemci paketini asla
// doğrudan import etmiyoruz; her şey `package.json#imports` üzerindeki `#prisma`
// dolaylaması üzerinden gelir (AC4). Prisma 7 hattı `datasource.url`'i şemadan kaldırdığı için
// `PrismaClient` artık bir sürücü adaptörü (`@prisma/adapter-pg`) olmadan
// kurulamıyor; adaptör ve onun `pg.Pool`/bağlantı dizesi örneği bu dosyanın
// dışına SIZMAZ.
//
// Modül seviyesi singleton kasıtlı olarak YOK: `createPrismaClient` çağrıldığı
// her yerde yeni bir istemci kurar. İstemcinin yaşam döngüsünü (bağlan/kapat)
// yönetmek v0.0.4'teki NestJS `PrismaModule`'ün işi.

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '#prisma'
import type { Prisma } from '#prisma'

import { registerTenantContextSetting } from './tenant-context.js'

/**
 * `createPrismaClient` için girdi seçenekleri.
 *
 * v0.0.3'te yalnızca bağlantı dizesi taşınır. Log yapılandırması (pino entegrasyonu)
 * v0.0.4'ün işi; yeni alan eklemek geriye uyumlu (additive) kalacak.
 *
 * `tenantContextSetting` (ROADMAP v0.0.13, T-005/S3, architect K-E6): ADDITIVE
 * alan — `exactOptionalPropertyTypes` uyumlu, mevcut
 * `createPrismaClient({ databaseUrl })` çağrısı DEĞİŞMEDEN derlenir (AC7,
 * bkz. `__tests__/type-pins/client-options.pin.ts`). VERİLİRSE, üretilen
 * istemci `./tenant-context.js`'in `withTenant()` kancasına KAYDEDİLİR —
 * yalnızca bu seçenekle kurulan istemcilerde `withTenant()` çağrılabilir
 * (fail-closed, bkz. `tenant-context.ts`). Değer tipik olarak
 * `TENANT_CONTEXT_SETTING` sabitidir.
 */
export type CreatePrismaClientOptions = {
  readonly databaseUrl: string
  readonly tenantContextSetting?: string
}

/**
 * Üretilen `PrismaClient` tipinin paket dışına açılan takma adı. Yapıcının
 * (constructor) kendisi dışa açılmaz — yalnızca `createPrismaClient` üzerinden
 * örneklenir.
 */
export type PrismaDatabase = PrismaClient

/**
 * `$transaction(async (tx) => ...)` geri çağrımının aldığı istemci tipi.
 * v0.0.13'ün `withTenant()` imzasında kullanılacak; bu sürümde sıfır maliyetli
 * bir tip takma adıdır, çalışma zamanı karşılığı üretmez.
 */
export type TransactionClient = Prisma.TransactionClient

/**
 * MADDE 2 — R-1 KARARI (ROADMAP v0.0.5, T-006/S2, architect ADR-0008 taslağı):
 * parola hash'i (`account.password`) ve oturum/doğrulama belirteçleri
 * (`session.token`, `verification.value`) taşıyan ÜÇ Better Auth tablosu.
 * Veritabanı seviyesinde RLS İLE korunamazlar (bkz. şema dosyası başı yorumu
 * "MADDE 2" — asıldan ÖNCE okunan satırlar, `current_setting`'e dayalı bir
 * yüklem tanımlanamaz). Koruma bunun yerine DERLEME ZAMANINDA:
 * `AppPrismaDatabase`/`TenantTransactionClient` bu üç model DELEGESİNİ
 * (ve istemcinin KALAN her şeyini) TÜRÜNDEN DÜŞÜRÜR — `tx.account.findMany()`
 * gibi bir çağrı `apps/api`'nin tenant kapsamlı kod yolunda DERLENMEZ. Tam
 * istemci yüzeyine (bu üç delegeyi İÇEREN) erişim yalnızca `AuthPrismaDatabase`
 * üzerinden ve yalnızca `AuthModule` içinde (lint katmanı,
 * `apps/api/eslint.config.mjs` `prismaClientSurfaceRestriction`) mümkündür.
 */
export const AUTH_SECRET_BEARING_MODELS = ['account', 'session', 'verification'] as const

/** {@link AUTH_SECRET_BEARING_MODELS} elemanlarının birleşim tipi. */
export type AuthModelName = (typeof AUTH_SECRET_BEARING_MODELS)[number]

/**
 * MEKANİZMA DEĞİŞİKLİĞİ (ROADMAP v0.0.5, T-006/S2, FIX turu 3 —
 * `security` tur3 + `qa` tur3, bağımsız ölçüm, BEŞİNCİ kaçış kapısı: `$extends`):
 *
 * Bu tip artık `Omit<PrismaDatabase, ...>` (DENY-LIST) DEĞİL,
 * `Pick<PrismaDatabase, ...>` (ALLOWLIST) ile tanımlanır. Gerekçe — deny-list
 * beş kez atlatıldı, hepsi AYNI mekanizma hatası:
 *
 *   Tur 1 — `createPrismaClient` import'u (lint jetonu ile kapatıldı)
 *   Tur 1 — `AUTH_INSTANCE` export'u (token daraltma ile kapatıldı)
 *   Tur 2 — `$transaction` (`AppPrismaDatabase`'in KENDİSİNDE) — `Omit<>`'e
 *           `'$transaction'` EKLENDİ
 *   Tur 2 — `$transaction` (`TenantTransactionClient`'IN İÇ İÇE çağrımında) —
 *           `Omit<>`'e AYNI jeton EKLENDİ (ayrı tip, ayrı kaçış)
 *   Tur 3 — `$extends`: `p.db.$extends({}).account.findMany()` VE
 *           `p.db.$extends({}).$transaction(tx => tx.account.findMany())`
 *           `tsc 0, eslint 0` ile derlendi, ÇALIŞMA ZAMANINDA 1844 parola
 *           hash'i okundu (`security` tur3 prob'u, `account`/`session`/
 *           `verification` tablolarında RLS YOK — filtre yok, sinyal sıfır).
 *           Sebep YAPISAL: `$extends`'in dönüş tipi Prisma'nın TypeMap'inden
 *           YENİDEN İNŞA EDİLİR, `AppPrismaDatabase`'den TÜREMEZ — `Omit<>`
 *           ile düşürülen anahtarlar bu yeniden inşada GERİ GELİR.
 *
 * Her tur deny-list'e YENİ bir jeton/üye EKLEYEREK kapatıldı — ama Prisma
 * istemcisi ÜRETİLEN ve EVRİLEN bir tip yüzeyi: her yeni `$`-metot (veya
 * `$extends` gibi tip-seviyesinde yeniden inşa eden bir metot) deny-list'te
 * YOKSA otomatik olarak AÇIK kalır (fail-open). Bu YAPISAL olarak sürdürülemez
 * — T-004'te aynı ders öğrenildi (üç sezgisel eşik yerine kanonik tam eşitlik)
 * ve çözüm orada da MEKANİZMA değişikliğiydi, dördüncü eşik değil.
 *
 * `Pick<>` bunun tersini yapar: yalnızca AÇIKÇA listelenen anahtarlar
 * erişilebilir, KALAN HER ŞEY (bugün var olan VEYA Prisma'nın ileride
 * ekleyeceği) OTOMATİK OLARAK erişilemez. `$extends` burada AYRICA
 * listelenmek ZORUNDA DEĞİL — Pick'in doğası onu zaten dışarıda tutar.
 *
 * **BAĞLAYICI KURAL:** bu bir ALLOWLIST'tir; yeni bir üye eklemek AÇIK bir
 * mimari karar ve kod incelemesi GEREKTİRİR. `Omit<>` tabanlı deny-list'e
 * **BİR DAHA GERİ DÖNÜLMEYECEK.**
 *
 * **SON TEMİZLİK (ROADMAP v0.0.5, T-006, `security` tur4 S4-1 — ALTINCI
 * KAPI, `$queryRaw`, KAPATILDI):** FIX turu 3 `'$queryRaw'`'ı bu allowlist'e
 * "1 ÇAĞRI YOLU: `health.ts`" gerekçesiyle KOYMUŞTU. `security` tur4'ün
 * teşhisi: bu ölçüt GERÇEKLEŞEN çağrıyı ölçer, ERİŞEBİLEN çağıranı (`.db`
 * getter'ını gören HER `apps/api` servisi, ÖLÇÜLDÜĞÜNDE ~38 çağrı yeri)
 * ÖLÇMEZ. `tenant`/`user`/`tenantMembership` için bu ayrım zararsızdır (RLS
 * VAR, satır bazlı filtre çalışır); `$queryRaw` için DEĞİL — ham SQL hiçbir
 * RLS'e tabi DEĞİLDİR. Ölçüldü (prob, SİLİNDİ):
 * `` db.$queryRaw`SELECT u.email, a.password FROM "account" a JOIN
 * "app_user" u ON u.id = a.user_id` `` → `tsc 0`/`eslint 0` ile derlenip
 * çalışma zamanında **2830 parola hash'i** okudu (`account`/`session`/
 * `verification`, `relrowsecurity=f`, tenant context YOK, denetim/log
 * sinyali SIFIR). `$queryRaw` BU YÜZDEN ALLOWLIST'TEN ÇIKARILDI — artık
 * `AppPrismaDatabase` üzerinde ERİŞİLEMEZ (negatif pin:
 * `pinAppPrismaDatabaseDropsQueryRaw`). Tek meşru tüketici (`health.ts`'in
 * sabit `SELECT 1`'i) artık KENDİ dar, tek üyeli tipini
 * (`Pick<PrismaDatabase, '$queryRaw'>`) `apps/api/src/prisma/prisma.service.ts`'in
 * AYRI `connectionProbe` erişimcisinden alır — yetki `.db`'yi gören
 * HERKESE değil, YALNIZCA o fonksiyona verilir.
 *
 * **Üç üye, üçü de `apps/api/src/**` (yalnızca `__tests__/**` DIŞINDA,
 * üretim kod yolu) grep'iyle ÖLÇÜLDÜ:**
 *   - `'tenant'`           — 32 çağrı (`.db.tenant.findUnique/create/...`,
 *                            örn. `tenancy/tenant-resolver.service.ts`)
 *   - `'user'`             — 5 çağrı (örn. `auth/auth-context.middleware.ts`
 *                            `.db.user.findUnique(...)`)
 *   - `'tenantMembership'` — `.db.tenantMembership` üzerinden ÜRETİMDE SIFIR
 *                            çağrı (`solid` tur4 L4-3, ÖLÇÜLDÜ: tek eşleşme
 *                            repo genelinde `__tests__/prisma-with-tenant.
 *                            test.ts:86`). Üretimde üyelik okuması
 *                            `withTenant()` callback'inin `tx.
 *                            tenantMembership`'i üzerinden gider
 *                            (`TenantTransactionClient`'ın üyesi,
 *                            `AppPrismaDatabase`'in DEĞİL — örn.
 *                            `auth/auth.guard.ts`). `$disconnect`'in
 *                            dışarıda bırakılma ÖLÇÜTÜ ("sıfır çağrı")
 *                            yüzeysel olarak burada da geçerli görünür, ama
 *                            GERÇEK fark: `$disconnect`'in `.db` üzerinde
 *                            SIFIR TÜKETİCİSİ var (üretim DE test DE yok);
 *                            `tenantMembership`'in TEK tüketicisi bir
 *                            İZOLASYON TESTİDİR (`prisma-with-tenant.
 *                            test.ts` Vaka 2 — context'siz okumanın 0 satır
 *                            döndüğünü pinler, gerçek bir izolasyon
 *                            değişmezi). Üyeyi çıkarmak o test dosyasını
 *                            (`apps/api/src/__tests__/**`) değiştirmeyi
 *                            gerektirir — bu "son temizlik" turunun yetki
 *                            sınırı DIŞINDA. **Bilinçli olarak TUTULDU**:
 *                            sır TAŞIMAZ, RLS VAR (`tenant_membership`
 *                            `relrowsecurity=t`), test-only kullanım
 *                            allowlist'in güvenlik garantisini ZAYIFLATMAZ.
 *
 * `$disconnect` BİLEREK Pick'TE YOK (önceki `Omit<>` sürümünde vardı) —
 * ölçüldü: `apps/api`'de `$disconnect()` HER ZAMAN `#client` (TAM tip,
 * `AuthPrismaDatabase`/`PrismaDatabase`) üzerinden çağrılıyor
 * (`prisma.service.ts`), `.db` (`AppPrismaDatabase`) üzerinden SIFIR
 * çağrı. Allowlist'te KULLANILMAYAN üye TUTMAK ("belki bir gün gerekir")
 * allowlist'in değerini düşürür — bu yüzden dışarıda bırakıldı.
 */
export type AppPrismaDatabase = Pick<PrismaDatabase, 'tenant' | 'user' | 'tenantMembership'>

/**
 * `withTenant()`'ın KENDİ imzası bu tipi KULLANMAZ (PO sapması 1, bağlayıcı) —
 * `packages/db`'nin `withTenant(client, tenantId, callback: (tx:
 * TransactionClient) => ...)` imzası DEĞİŞMEDEN kalır. Bu tip yalnızca dışa
 * açılır; S3 `PrismaService` tarafında KENDİ sarmalayıcısında uygular. Burada
 * uygulansaydı `apps/api/src/prisma/prisma.service.ts`'teki
 * `(tx: TransactionClient) => ...` callback'i `strictFunctionTypes` altında
 * uyumsuz hâle gelir ve S2↔S3 arası typecheck kırmızı kalırdı.
 *
 * MEKANİZMA DEĞİŞİKLİĞİ (FIX turu 3, `AppPrismaDatabase` İLE AYNI gerekçe) —
 * `Omit<TransactionClient, AuthModelName | '$transaction'>` yerine
 * `Pick<TransactionClient, 'tenantMembership'>`. `TenantTransactionClient`'ın
 * ihtiyacı `AppPrismaDatabase`'den DAHA KÜÇÜK — `apps/api/src/**` içinde
 * `withTenant()` callback'inin aldığı `tx` parametresi üzerinde YALNIZCA
 * `tx.tenantMembership.*` çağrılıyor (`grep -rn "tx\.\w\+" apps/api/src`
 * ÖLÇÜLDÜ: `auth.guard.ts` + yedi test dosyası, HEPSİ `tenantMembership`;
 * `tx.tenant`/`tx.user`/`tx.$queryRaw` erişimi SIFIR). `$queryRaw` bu yüzden
 * BİLEREK DIŞARIDA — "gerekirse eklenir" önerisi ÖLÇÜLDÜ ve gerekmediği
 * görüldü, eklemek fazladan bir allowlist üyesi olurdu.
 *
 * `Prisma.TransactionClient`'ın KENDİSİ Prisma'nın `ITXClientDenyList`
 * (`['$connect','$disconnect','$on','$use','$extends']`) ile zaten
 * `$extends`'i TAŞIMAZ — ama `$transaction`'ı TAŞIR (önceki `Omit<>` turunun
 * ÖLÇTÜĞÜ dördüncü kaçış kapısı, bkz. T-006 FIX turu 2 kaydı). `Pick<>`
 * allowlist'i BUNU AYRICA listelemeyi GEREKTİRMEZ — Pick'in doğası `account`/
 * `session`/`verification`/`$transaction`'ın TÜMÜNÜ otomatik dışarıda tutar.
 */
export type TenantTransactionClient = Pick<TransactionClient, 'tenantMembership'>

/**
 * Tam Prisma istemci yüzeyinin (sır taşıyan üç modeli DE İÇEREN) takma adı.
 * `AuthModule` dışına (lint katmanı, R-1 2. katman) DERLENMEZ — `PrismaDatabase`
 * ile bugün aynı yapısal şekle sahiptir (sıfır maliyetli ayrım), ama adın
 * KENDİSİ `apps/api/eslint.config.mjs`'in `no-restricted-imports` kuralının
 * ANAHTARIDIR (R-1 2. katman). İleride `AppPrismaDatabase`'den fiilen
 * farklılaşırsa (ör. ikinci istemci/havuz, v0.0.14) bu takma ad o noktaya
 * taşınacak tek yüzeydir.
 */
export type AuthPrismaDatabase = PrismaDatabase

/**
 * Tek istemci kurma yolu. `@prisma/adapter-pg` adaptörünü bağlantı dizesinden
 * kurar ve üretilen istemciye verir. Adaptör örneği çağırana döndürülmez.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaDatabase {
  const adapter = new PrismaPg(options.databaseUrl)

  const client = new PrismaClient({ adapter })

  if (options.tenantContextSetting !== undefined) {
    registerTenantContextSetting(client, options.tenantContextSetting)
  }

  return client
}
