// @arkesoft/api — PrismaService yaşam döngüsü (ROADMAP v0.0.4, T-002/ST-6,
// architect K-A3)
//
// `PrismaClient` yapıcısı dışa açılmadığı için `class PrismaService extends
// PrismaClient` deseni İMKANSIZ (packages/db yalnızca `createPrismaClient`
// fabrikasını dışa açar) → sarmalayıcı sınıf + `.db` getter. v0.0.13
// `withTenant()`'ı AYNI sınıfa ADDITIVE ekleyecek — tek sınıf, tek erişim
// noktası (`.db` ham erişim o sürümde lint ile kısıtlanabilir, architect notu).
//
// `onModuleDestroy`: `$disconnect()` YETERLİ (B3+B4 kanıtı, architect K-A3) —
// adaptörün (`@prisma/adapter-pg`) kendi `pg.Pool`'unu
// `$disconnect()` → engine `disconnect()` → `adapter.dispose()` → `pool.end()`
// zinciriyle serbest bırakır; `packages/db`'ye ek teardown yüzeyi GEREKMEZ.
//
// EAGER `$connect()` YOK — bu dosyada hiçbir yerde çağrılmaz: DB kapalıyken
// süreç yine ayağa kalkar, `/health/ready` (ST-6'nın bu sürümde eklediği uç)
// 503 döner (v0.18.0 Kubernetes readiness semantiğinin temeli). SONUÇ:
// `$connect()` hiç çağrılmadıysa `$disconnect()` NO-OP'tur — AC11 testinin
// (ST-7'nin işi) SIGTERM'DEN ÖNCE DB'ye giden en az bir istek atması bu
// yüzden ZORUNLUDUR (yoksa disconnect süre ölçümü anlamsızlaşır).
//
// GÜNCELLEME (ROADMAP v0.0.13, T-005/S6, architect K-E7): `withTenant()`
// ADDITIVE metot — iş mantığı taşımaz, yalnızca `@arkesoft/db`'nin
// `withTenant()` fonksiyonuna DI/yaşam döngüsü sarmalayıcısı olarak
// delege eder (CLAUDE.md §3: veri erişim mekanizması `packages/db`'nin işi).
// `prisma.module.ts` bu istemciyi `tenantContextSetting` seçeneğiyle
// kurduğu için (`TENANT_CONTEXT_SETTING`) bu metot fail-closed REDDEDİLMEZ —
// kayıtsız bir istemci üzerinde çağrılsaydı `@arkesoft/db`'nin kendisi
// `throw` ederdi (bkz. `tenant-context.ts`).
//
// DARALTMA (ROADMAP v0.0.5, T-006/S3, "MADDE 2 — R-1 KARARI", katman 1'in
// `apps/api` yarısı; mekanizma FIX turu 3'te `Omit<>`'ten `Pick<>`'e geçti,
// "son temizlik"te `$queryRaw` de allowlist'ten ÇIKARILDI): `.db` getter'ı
// `AppPrismaDatabase` döner — bu bir
// `Pick<PrismaDatabase, 'tenant' | 'user' | 'tenantMembership'>` ALLOWLIST'tir
// (`packages/db/src/client.ts`); `account`/`session`/`verification`
// delegeleri VE `$queryRaw` DAHİL istemcinin bu üç üye DIŞINDAKİ HER ŞEYİ bu
// tipte erişilemez. `withTenant()`'ın `callback` parametresi de
// `TransactionClient` DEĞİL `TenantTransactionClient`
// (`Pick<TransactionClient, 'tenantMembership'>`) kabul eder. PM riski 1'in
// tarif ettiği senaryo (`tx.account.findMany()` ile tüm parola
// hash'lerinin dökülmesi) artık bu sarmalayıcı üzerinden DERLENMEZ.
// `packages/db`'nin `withTenant()` imzası BİLEREK DOKUNULMADI (PO sapması 1)
// — orada `TenantTransactionClient` kullanılsaydı bu dosyadaki
// `(tx: TenantTransactionClient) => ...` callback'i `strictFunctionTypes`
// altında UYUMSUZ olurdu. Daraltma SADECE bu sarmalayıcıda: callback
// parametresinin tipi kontravaryant konumda olduğu için
// `(tx: TenantTransactionClient) => Promise<T>`, alttaki
// `withTenantInPackageDb`'in beklediği `(tx: TransactionClient) => Promise<T>`
// imzasına EK BİR `as` GEREKMEDEN uyar (`TransactionClient` zaten
// `TenantTransactionClient`'a yapısal olarak atanabilir — fazladan alan
// SORUN DEĞİL). Tam istemci yüzeyine erişim yalnızca `AuthModule` içinde
// (`AuthPrismaDatabase`, lint katmanı R-1 katman 2) mümkündür.
//
// GÜNCELLEME (FIX turu 2, security tur2 S-1 — `db`'nin düzeltmesi):
// `TenantTransactionClient`'IN KENDİSİ `$transaction`'ı TAŞIMAZ — bugünkü
// `Pick<TransactionClient, 'tenantMembership'>`'in TEK üyesi
// `tenantMembership` olduğu için `$transaction` listede hiç YOK (ÖLÇÜLEN
// kaçış kapısı: ÖNCEKİ `Omit<>` tanımında `tx.$transaction(async (nested) =>
// nested.account.findMany())` ile İÇ İÇE transaction üzerinden sır taşıyan
// delegelere TEKRAR erişime İZİN VERİYORDU). Davranış DEĞİŞMEDİ — bu
// dosyanın yukarıdaki yorumu hâlâ DOĞRU (`withTenant()`'ın KENDİSİ iç içe
// çağrılamaz, K-E5) — `tx.$transaction(...)` çağırmak (hiç kullanılmıyor,
// `grep -rn "tx\.\$transaction" apps/api/src/` → 0 eşleşme) TİP HATASIDIR.
//
// GÜNCELLEME (ROADMAP v0.0.5, T-006, "son temizlik" — `security` tur4 S4-1,
// S4-2): İKİ bağımsız kapı kapatıldı.
//   (1) ALTINCI KAPI (`$queryRaw`) — `AppPrismaDatabase` artık `$queryRaw`
//       TAŞIMAZ; `/health/ready`'nin tek ihtiyacı ayrı, tek üyeli bir
//       erişimci olan `connectionProbe`'tan gelir (aşağıda) — yetki `.db`'yi
//       gören HER servise değil, YALNIZCA `DatabaseHealthCheck`'e verilir.
//   (2) YEDİNCİ KAPI (`as unknown as` ile `private` alanı okumak —
//       TypeScript `private`'ın ÇALIŞMA ZAMANINDA VAR OLMADIĞI gerçeğinden
//       yararlanarak; ÖLÇÜLDÜ: `(p as unknown as { client: ... }).client.
//       account.findMany()` `tsc 0`/`eslint 0` ile derlenip 2894 satır
//       okudu) — alan artık `private readonly client` DEĞİL, gerçek
//       ECMAScript private alan `#client`: tip zorlaması çalışma zamanında
//       VAR OLMAYAN bir alana erişemez, `as unknown as` onu GÖREMEZ.

import { Inject, Injectable } from '@nestjs/common'
import type { OnModuleDestroy } from '@nestjs/common'
import type { AppPrismaDatabase, PrismaDatabase, TenantTransactionClient } from '@arkesoft/db'
import { withTenant as withTenantInPackageDb } from '@arkesoft/db'
import type { Logger } from 'pino'

import { ROOT_LOGGER } from '../logging/logging.tokens.js'
import { PRISMA_CLIENT } from './prisma.tokens.js'

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly #client: PrismaDatabase

  constructor(
    @Inject(PRISMA_CLIENT) client: PrismaDatabase,
    @Inject(ROOT_LOGGER) private readonly logger: Logger,
  ) {
    this.#client = client
  }

  /**
   * Tenant kapsamlı kod yolunun erişim noktası. `AppPrismaDatabase` döner —
   * sır taşıyan üç Better Auth modeli (`account`/`session`/`verification`)
   * VE `$queryRaw` bu tipte YOKTUR (R-1 katman 1 + "son temizlik" S4-1). Tam
   * yüzeye (`AuthPrismaDatabase`) erişim yalnızca `AuthModule` içinde
   * mümkündür.
   */
  get db(): AppPrismaDatabase {
    return this.#client
  }

  /**
   * Veritabanı bağlantı sağlığı kontrolünün TEK erişim noktası (ROADMAP
   * v0.0.5, T-006, "son temizlik", `security` tur4 S4-1 — ALTINCI KAPI
   * kapatıldı). `.db` (`AppPrismaDatabase`) artık `$queryRaw` TAŞIMADIĞI
   * için bu AYRI, tek üyeli bir erişimcidir — yetki `.db`'yi gören HER
   * servise değil, YALNIZCA tek tüketicisine
   * (`apps/api/src/health/checks/database.health-check.ts`) verilir.
   */
  get connectionProbe(): Pick<PrismaDatabase, '$queryRaw'> {
    return this.#client
  }

  /**
   * Verilen `tenantId` için TEK bir transaction açar ve `callback`'i
   * tenant context'i kurulmuş `TenantTransactionClient` ile çağırır.
   * Mantığın TAMAMI `@arkesoft/db`'nin `withTenant()`'ında — burası
   * yalnızca enjekte edilen istemciyi (`#client`) ona geçiren bir
   * delegasyon; `TenantTransactionClient` daraltması SADECE bu
   * sarmalayıcıda uygulanır (yukarıdaki dosya başı yorumu, PO sapması 1).
   *
   * @throws `tenantId` boş/yalnızca boşluksa veya istemci tenant context
   *   için kaydedilmemişse (bkz. `@arkesoft/db` `tenant-context.ts`).
   */
  withTenant<T>(
    tenantId: string,
    callback: (tx: TenantTransactionClient) => Promise<T>,
  ): Promise<T> {
    return withTenantInPackageDb(this.#client, tenantId, callback)
  }

  async onModuleDestroy(): Promise<void> {
    const startedAt = Date.now()
    await this.#client.$disconnect()
    this.logger.info({ durationMs: Date.now() - startedAt }, 'prisma bağlantısı kapatıldı')
  }
}
