// @arkesoft/api — tRPC tel sözleşmesi tip pinleri (ROADMAP v0.0.6, T-007/S6,
// architect K5 "Mekanik pinler")
//
// `packages/db/src/__tests__/type-pins/auth-model-narrowing.pin.ts`'in (T-006/
// S2) AYNI idiomu: bu dosya ÇALIŞMA ZAMANI testi DEĞİLDİR (`.pin.ts` ile
// bitiyor, ne `vitest.config.ts`'in `include: ['src/**/*.test.ts']` ne
// `vitest.isolation.config.ts`'in `include: ['src/**/*.isolation.test.ts']`
// GLOB'u bu dosyayı YAKALAR) — kanıt tamamen `pnpm typecheck`'in derlemesinden
// gelir. Her pin fonksiyonu hiçbir yerden ÇAĞRILMAZ; varlığı DERLENMESİ
// yeterlidir (tek istisna: dördüncü satırdaki `tenantStatusWireValuesMatchAt
// Runtime` — bu TEK fonksiyon GERÇEKTEN ÇALIŞMASI gereken bir ÇALIŞMA ZAMANI
// pini, `../trpc-http.test.ts` onu GERÇEKTEN ÇAĞIRIR/assert eder; `pnpm
// typecheck` yalnızca onun TİP düzeyindeki ikiz pinini — pin 1'in ilk yarısı —
// denetler, saf değer karşılaştırmasını çalışma zamanında `pnpm test` yapar).
//
// On pin:
//   1. `TenantStatusWire` ≡ `TenantStatus` (@arkesoft/db) — tip EŞİTLİĞİ +
//      çalışma zamanı değer eşitliği (sıralanmış).
//   2. `keyof TenantSummary` ⊂ `keyof Tenant`; `'planId'`/`'deletedAt'` ∉
//      `keyof TenantSummary` (kullanıcı kararı 1'in derleyici-zorunlu hâli).
//   3. `keyof CurrentUserIdentity` ⊂ `keyof SessionIdentity`; fazlalık TAM
//      OLARAK `{'twoFactorEnabled'}`'a eşit (GÜNCELLEME, ROADMAP v0.0.15,
//      T-016 FIX turu 2/M-4 — bu pin ÖNCEDEN TAM eşitlik denetliyordu,
//      "echo, DB okuması yok" iddiasının pini; `twoFactorEnabled` eklenmesiyle
//      o iddia yalnızca `userId`/`sessionId` için GEÇERLİ kaldı, aşağıdaki
//      pin yorumuna bkz.).
//   4. `TenantReadPortAdapter satisfies TenantReadPort`.
//   5. ⚠ `JobStatusWire` ≡ `JobStatus` (@arkesoft/db) — pin 1'in BİREBİR
//      ikizi (ROADMAP v0.0.11, T-013/S8). Tel sözleşmesi dörtlüyü KENDİ
//      YEREL birleşiminde elle yazıyor (ADR-0009 md 5: `packages/trpc`
//      veritabanı paketini import ETMEZ) — bu pin o yerel birleşimin
//      Prisma enum'undan SESSİZCE sapmasını engeller.
//   6. ⚠ `keyof JobSummary` ⊂ `keyof Job`; kuyruk GİRDİSİ kolonu VE
//      `'tenantId'` ∉ `keyof JobSummary` (architect K7'nin derleyici-zorunlu
//      hâli — "tele çıkmaz" iddiası bir yorum değil, bir derleme kapısı).
//   7. `JobReadPortAdapter satisfies JobReadPort`.
//   8. ⚠ `TenantRoleWire` ≡ `TenantRole` (@arkesoft/db) — pin 1/5'in ÜÇÜNCÜ
//      ikizi (ROADMAP v0.0.14, T-014/S4, AC4). Yetki modelinin tamamı bu
//      sözlüğün üzerinde duruyor: rol → izin eşlemesi sözleşme paketinde TAM
//      bir `Record<TenantRoleWire, …>`'dır, yani tele sözlüğe rol eklemek
//      eşlemeyi derlenemez kılar (fail-closed, "yeni rolün izinsiz kalması
//      İMKÂNSIZ"). O garantinin DEĞERİ, tele sözlüğün veri katmanının
//      enum'uyla AYNI olmasına bağlıdır — bu pin tam o bağı kurar. Tip
//      EŞİTLİĞİ + çalışma zamanı değer eşitliği (sıralanmış).
//   9. `MembershipReadPortAdapter satisfies MembershipReadPort`.
//  10. `MemberWritePortAdapter satisfies MemberWritePort`.
//  11. `TenantSecurityWritePortAdapter satisfies TenantSecurityWritePort`
//      (ROADMAP v0.0.15, T-016/S7 — PİN 4/7/9/10'un ikizi).
//  12. `SessionSecurityReadPortAdapter satisfies SessionSecurityReadPort`
//      (ROADMAP v0.0.15, T-016 FIX turu 2/M-4 — PİN 4/7/9/10/11'in ikizi).
//
// PİN KANITI (DoD): `TenantSummary`'ye `planId` ekleyerek TEK kasıtlı mutasyon
// yapılıp `pnpm --filter @arkesoft/api typecheck`'in KIRILDIĞI ölçüldü (çıktı
// handoff raporunda), mutasyon GERİ ALINDI.
//
// PİN 5/6 KANITI (ROADMAP v0.0.11, T-013/S8 — DoD): iki kasıtlı mutasyon
// FİİLEN uygulandı ve `pnpm --filter @arkesoft/api typecheck`'in KIRILDIĞI
// ölçüldü, ikisi de md5 ile birebir geri alındı:
//   M6 — `jobSummarySchema`'ya kuyruk girdisi kolonu eklendi → PİN 6
//        `TS2322 … '["K7 İHLALİ — … OLMAMALI"]'` verdi.
//   M7 — tel durum sözlüğüne `'cancelled'` eklendi → PİN 5
//        `TS2322 … '["FAZLA DURUM — …", "cancelled"]'` verdi.

import type { Job, Tenant } from '@arkesoft/db'
import {
  JobStatus as JobStatusValue,
  TenantRole as TenantRoleValue,
  TenantStatus as TenantStatusValue,
} from '@arkesoft/db'
import type {
  JobStatusWire,
  JobSummary,
  SessionIdentity,
  TenantRoleWire,
  TenantStatusWire,
  TenantSummary,
} from '@arkesoft/trpc'
import { jobStatusSchema, tenantRoleSchema, tenantStatusSchema } from '@arkesoft/trpc'
import type {
  JobReadPort,
  MemberWritePort,
  MembershipReadPort,
  SessionSecurityReadPort,
  TenantReadPort,
  TenantSecurityWritePort,
} from '@arkesoft/trpc/server'

import type { CurrentUserIdentity } from '../../auth/auth-resolution.types.js'
import type { JobReadPortAdapter } from '../../trpc/ports/job-read.port.adapter.js'
import type { MemberWritePortAdapter } from '../../trpc/ports/member-write.port.adapter.js'
import type { MembershipReadPortAdapter } from '../../trpc/ports/membership-read.port.adapter.js'
import type { SessionSecurityReadPortAdapter } from '../../trpc/ports/session-security-read.port.adapter.js'
import type { TenantReadPortAdapter } from '../../trpc/ports/tenant-read.port.adapter.js'
import type { TenantSecurityWritePortAdapter } from '../../trpc/ports/tenant-security-write.port.adapter.js'

// ---------------------------------------------------------------------------
// PİN 1 — TenantStatusWire ≡ TenantStatus (tip) + çalışma zamanı değer eşitliği
// ---------------------------------------------------------------------------

/**
 * `@arkesoft/db`'nin `TenantStatus`'u bir Prisma string enum'udur — ham bir
 * string literal birleşimiyle (`TenantStatusWire`) `extends` üzerinden
 * KARŞILAŞTIRILAMAZ (string enum'lar NOMİNAL'dir, düz bir string literal'ın
 * enum tipine `extends` ile uyması TS'TE GARANTİ DEĞİLDİR). Bu yüzden
 * karşılaştırma enum'un KENDİ anahtarları üzerinden yapılır — Prisma string
 * enum'larında anahtar adı HER ZAMAN değerle BİREBİR aynıdır (`pending =
 * 'pending'` vb.) — `keyof typeof TenantStatus` bu yüzden düz bir string
 * literal birleşimi ÜRETİR, `TenantStatusWire` ile yapısal olarak KARŞILAŞTIRILABİLİR.
 */
type TenantStatusKeys = keyof typeof TenantStatusValue

type ExtraWireStatuses = Exclude<TenantStatusWire, TenantStatusKeys>
type MissingWireStatuses = Exclude<TenantStatusKeys, TenantStatusWire>

type AssertNoExtraWireStatuses = ExtraWireStatuses extends never
  ? true
  : ['FAZLA DURUM — tenantStatusSchema içinde olup TenantStatus içinde olmayan', ExtraWireStatuses]

type AssertNoMissingWireStatuses = MissingWireStatuses extends never
  ? true
  : [
      'EKSİK DURUM — TenantStatus içinde olup tenantStatusSchema içinde olmayan',
      MissingWireStatuses,
    ]

/**
 * ⚠ TİP PİNİ 1 — `TenantStatusWire` ve `TenantStatus`'un anahtar kümesi TAM
 * eşleşmeli. Şemaya yeni bir durum eklenirse (ör. `'archived'`) VEYA Prisma
 * enum'u değişirse (migration ile) bu pin `pnpm typecheck`'i KIRAR. Hiçbir
 * yerden çağrılmaz — varlığı derlenmesi yeterlidir.
 */
export function pinTenantStatusWireKeysExactlyMatchTenantStatus(): {
  noExtra: AssertNoExtraWireStatuses
  noMissing: AssertNoMissingWireStatuses
} {
  return { noExtra: true, noMissing: true }
}

/**
 * ÇALIŞMA ZAMANI PİNİ 1 — `Object.values(TenantStatus)` ile
 * `tenantStatusSchema.options` SIRALANMIŞ karşılaştırma. Dosya başı yorumuna
 * bkz.: bu fonksiyon `pnpm typecheck` tarafından DEĞİL, `../trpc-http.test.ts`
 * tarafından GERÇEKTEN ÇAĞRILIR (`pnpm test`) — tip pininin (yukarıdaki)
 * yakalayamayacağı bir sapmayı (ör. aynı anahtar kümesi ama Prisma'nın değer
 * tarafı farklı yazılmış — teorik olarak mümkün) yakalar.
 */
export function tenantStatusWireValuesMatchPrismaAtRuntime(): boolean {
  const wireValues = [...tenantStatusSchema.options].sort()
  const prismaValues = Object.values(TenantStatusValue).sort()

  return (
    wireValues.length === prismaValues.length &&
    wireValues.every((value, index) => value === prismaValues[index])
  )
}

// ---------------------------------------------------------------------------
// PİN 2 — keyof TenantSummary ⊂ keyof Tenant; 'planId'/'deletedAt' ∉ TenantSummary
// ---------------------------------------------------------------------------

/** `TenantSummary`'de olup `Tenant` Prisma modelinde OLMAYAN alanlar (olmamalı — boş küme). */
type TenantSummaryKeysNotInTenant = Exclude<keyof TenantSummary, keyof Tenant>

type AssertTenantSummarySubsetOfTenant = TenantSummaryKeysNotInTenant extends never
  ? true
  : ['FAZLA ALAN — TenantSummary alanı Tenant modelinde yok', TenantSummaryKeysNotInTenant]

type AssertPlanIdExcludedFromTenantSummary = 'planId' extends keyof TenantSummary
  ? ["KULLANICI KARARI İHLALİ — 'planId' TenantSummary'de OLMAMALI"]
  : true

type AssertDeletedAtExcludedFromTenantSummary = 'deletedAt' extends keyof TenantSummary
  ? ["KULLANICI KARARI İHLALİ — 'deletedAt' TenantSummary'de OLMAMALI"]
  : true

/**
 * ⚠ TİP PİNİ 2 — `TenantSummary`'nin alan kümesi `Tenant`'ın bir ALT kümesi
 * olmalı (yeni bir tele-özgü alan icat edilemez) ve `planId`/`deletedAt`
 * KASITLI OLARAK dışarıda kalmalı (PM kullanıcı kararı #1'in derleyici-zorunlu
 * hâli). Herhangi biri eklenirse bu pin `pnpm typecheck`'i KIRAR.
 */
export function pinTenantSummaryIsSubsetOfTenantAndExcludesPlanIdAndDeletedAt(): {
  subset: AssertTenantSummarySubsetOfTenant
  excludesPlanId: AssertPlanIdExcludedFromTenantSummary
  excludesDeletedAt: AssertDeletedAtExcludedFromTenantSummary
} {
  return { subset: true, excludesPlanId: true, excludesDeletedAt: true }
}

// ---------------------------------------------------------------------------
// PİN 3 — keyof SessionIdentity ≡ keyof CurrentUserIdentity
// ---------------------------------------------------------------------------

type SessionIdentityExtraKeys = Exclude<keyof SessionIdentity, keyof CurrentUserIdentity>
type SessionIdentityMissingKeys = Exclude<keyof CurrentUserIdentity, keyof SessionIdentity>

// ⚠⚠ GÜNCELLEME (ROADMAP v0.0.15, T-016 FIX turu 2/M-4) — bu pin ÖNCEDEN
// `keyof SessionIdentity ≡ keyof CurrentUserIdentity` (TAM eşitlik)
// denetliyordu: "`session.me` yolunda hiçbir DB okuması yok, ALS'teki
// daraltma OLDUĞU GİBİ ECHO edilir" iddiasının derleyici-zorunlu kanıtı
// (architect K5). `twoFactorEnabled` (`SessionSecurityReadPort` üzerinden AYRI
// bir DB okumasıyla dolar — `apps/api/src/trpc/ports/
// session-security-read.port.adapter.ts`) o TAM eşitliği KASITLI olarak
// kırdı. Pin ŞİMDİ İKİ YARI iddia taşıyor, ikisi de hâlâ derleyici-zorunlu:
//   (i) `CurrentUserIdentity`'nin HİÇBİR alanı eksik değil (eski "missing"
//       denetimi DEĞİŞMEDİ — `userId`/`sessionId` HÂLÂ saf echo).
//   (ii) `SessionIdentity`'nin fazlalığı TAM OLARAK `twoFactorEnabled`'dır —
//        BAŞKA bir fazla alan (veya bu alanın kaldırılması) pin'i KIRAR.
// Bu, `apps/api/src/auth/auth-resolution.types.ts` (bu alt görevin DOKUNMA
// YASAĞI) DEĞİŞMEDEN `session.me`'nin DB okuyan TEK alanını genişletmenin
// derleyici-zorunlu, isimle pinlenmiş karşılığıdır — "testi gevşetmek"
// DEĞİL, invariant'ın KENDİSİNİN ADLANDIRILMIŞ EVRİMİ.
type SessionIdentityUnexpectedExtraKeys = Exclude<SessionIdentityExtraKeys, 'twoFactorEnabled'>
type SessionIdentityMissingExpectedExtraKey = Exclude<'twoFactorEnabled', SessionIdentityExtraKeys>

type AssertNoMissingSessionIdentityKeys = SessionIdentityMissingKeys extends never
  ? true
  : [
      'EKSİK ALAN — CurrentUserIdentity içinde olup SessionIdentity içinde olmayan',
      SessionIdentityMissingKeys,
    ]

type AssertExtraSessionIdentityKeyIsExactlyTwoFactorEnabled =
  SessionIdentityUnexpectedExtraKeys extends never
    ? SessionIdentityMissingExpectedExtraKey extends never
      ? true
      : [
          "EKSİK ALAN — 'twoFactorEnabled' SessionIdentity içinde YOK (M-4 regresyonu)",
          SessionIdentityMissingExpectedExtraKey,
        ]
    : [
        "FAZLA ALAN — SessionIdentity'de beklenen ('twoFactorEnabled') dışında ekstra alan",
        SessionIdentityUnexpectedExtraKeys,
      ]

/**
 * ⚠ TİP PİNİ 3 — `CurrentUserIdentity`'nin HİÇBİR alanı `SessionIdentity`'den
 * eksik değil (echo invariant'ı, `userId`/`sessionId` için HÂLÂ geçerli) VE
 * `SessionIdentity`'nin fazlalığı TAM OLARAK `{'twoFactorEnabled'}`'dır
 * (M-4'ün DB okuyan TEK ek alanı, isimle pinlenmiş). `CurrentUserIdentity`'ye
 * (`email`/`name` vb.) yeni bir alan eklenip `SessionIdentity`'ye
 * YANSITILMAZSA, VEYA `SessionIdentity`'ye `twoFactorEnabled` DIŞINDA bir alan
 * eklenirse, VEYA `twoFactorEnabled` KALDIRILIRSA bu pin KIRILIR.
 */
export function pinSessionIdentityKeysExactlyMatchCurrentUserIdentity(): {
  noMissing: AssertNoMissingSessionIdentityKeys
  extraIsExactlyTwoFactorEnabled: AssertExtraSessionIdentityKeyIsExactlyTwoFactorEnabled
} {
  return { noMissing: true, extraIsExactlyTwoFactorEnabled: true }
}

// ---------------------------------------------------------------------------
// PİN 4 — TenantReadPortAdapter satisfies TenantReadPort
// ---------------------------------------------------------------------------

/**
 * ⚠ TİP PİNİ 4 — `apps/api`'nin `TenantReadPortAdapter`'ı `packages/trpc`'nin
 * `TenantReadPort` sözleşmesini BİREBİR karşılar. Adaptörün KENDİ `implements
 * TenantReadPort` bildirimiyle ZATEN üretim kodunda zorlanıyor olsa da, bu
 * pin bunu TEST tarafından da (üretim dosyasına dokunmadan) bağımsız doğrular
 * — `satisfies` ifadesi `TenantReadPortAdapter`'ın DAR tipini (dönüş tipiyle
 * birebir) KORUR, `TenantReadPort`'a yalnızca ATANABİLİRLİĞİNİ denetler.
 */
export function pinTenantReadPortAdapterSatisfiesPort(
  adapter: TenantReadPortAdapter,
): TenantReadPortAdapter {
  return adapter satisfies TenantReadPort
}

// ---------------------------------------------------------------------------
// PİN 5 — JobStatusWire ≡ JobStatus (tip) + çalışma zamanı değer eşitliği
// (ROADMAP v0.0.11, T-013/S8)
// ---------------------------------------------------------------------------

/** PİN 1'in gerekçesinin AYNISI — karşılaştırma enum'un KENDİ anahtarları üzerinden yapılır. */
type JobStatusKeys = keyof typeof JobStatusValue

type ExtraWireJobStatuses = Exclude<JobStatusWire, JobStatusKeys>
type MissingWireJobStatuses = Exclude<JobStatusKeys, JobStatusWire>

type AssertNoExtraWireJobStatuses = ExtraWireJobStatuses extends never
  ? true
  : ['FAZLA DURUM — jobStatusSchema içinde olup JobStatus içinde olmayan', ExtraWireJobStatuses]

type AssertNoMissingWireJobStatuses = MissingWireJobStatuses extends never
  ? true
  : ['EKSİK DURUM — JobStatus içinde olup jobStatusSchema içinde olmayan', MissingWireJobStatuses]

/**
 * ⚠ TİP PİNİ 5 — `JobStatusWire` ve `JobStatus`'un anahtar kümesi TAM
 * eşleşmeli. Migration ile enum'a yeni bir değer eklenirse (ör. `cancelled`)
 * VEYA tel şeması tek taraflı genişletilirse bu pin `pnpm typecheck`'i KIRAR.
 * Hiçbir yerden çağrılmaz; varlığının derlenmesi yeterlidir.
 */
export function pinJobStatusWireKeysExactlyMatchJobStatus(): {
  noExtra: AssertNoExtraWireJobStatuses
  noMissing: AssertNoMissingWireJobStatuses
} {
  return { noExtra: true, noMissing: true }
}

/**
 * ÇALIŞMA ZAMANI PİNİ 5 — `Object.values(JobStatus)` ile
 * `jobStatusSchema.options` SIRALANMIŞ karşılaştırma (çalışma zamanı pini
 * 1'in birebir ikizi). `../trpc-http.test.ts` bu fonksiyonu GERÇEKTEN
 * ÇAĞIRIR; tip pini anahtar kümesini, bu fonksiyon DEĞER kümesini denetler.
 */
export function jobStatusWireValuesMatchPrismaAtRuntime(): boolean {
  const wireValues = [...jobStatusSchema.options].sort()
  const prismaValues = Object.values(JobStatusValue).sort()

  return (
    wireValues.length === prismaValues.length &&
    wireValues.every((value, index) => value === prismaValues[index])
  )
}

// ---------------------------------------------------------------------------
// PİN 6 — keyof JobSummary ⊂ keyof Job; kuyruk girdisi kolonu ve 'tenantId'
// JobSummary'de YOK (architect K7)
// ---------------------------------------------------------------------------

/** `JobSummary`'de olup `Job` Prisma modelinde OLMAYAN alanlar (olmamalı — boş küme). */
type JobSummaryKeysNotInJob = Exclude<keyof JobSummary, keyof Job>

type AssertJobSummarySubsetOfJob = JobSummaryKeysNotInJob extends never
  ? true
  : ['FAZLA ALAN — JobSummary alanı Job modelinde yok', JobSummaryKeysNotInJob]

/**
 * ⚠ Kuyruk GİRDİSİNİ taşıyan JSONB kolonunun adı BURADA literal olarak
 * yazılır — bu dosya o yasağı DENETLEYEN taraftır, yasağın ÖZNESİ
 * (`packages/trpc/src/schemas/job-summary.schema.ts`) değildir. Literal-jeton
 * kuralı (AGENT_BASELINE.md §5) jetonu ÖZNEDE yasaklar; DENETLEYİCİDE jeton
 * ZORUNLUDUR, yoksa denetim diye bir şey kalmaz.
 */
type AssertQueueInputColumnExcludedFromJobSummary = 'payload' extends keyof JobSummary
  ? ["K7 İHLALİ — işin kuyruk girdisi kolonu JobSummary'de OLMAMALI"]
  : true

type AssertTenantIdExcludedFromJobSummary = 'tenantId' extends keyof JobSummary
  ? ["K7 İHLALİ — 'tenantId' JobSummary'de OLMAMALI"]
  : true

/**
 * ⚠ TİP PİNİ 6 — `JobSummary`'nin alan kümesi `Job`'un bir ALT kümesi olmalı
 * (tele-özgü bir alan icat edilemez) ve iki alan KASITLI olarak dışarıda
 * kalmalı. Herhangi biri eklenirse bu pin `pnpm typecheck`'i KIRAR — "tele
 * çıkmaz" iddiası böylece bir yorum değil, bir derleme kapısıdır.
 */
export function pinJobSummaryIsSubsetOfJobAndExcludesQueueInputAndTenantId(): {
  subset: AssertJobSummarySubsetOfJob
  excludesQueueInput: AssertQueueInputColumnExcludedFromJobSummary
  excludesTenantId: AssertTenantIdExcludedFromJobSummary
} {
  return { subset: true, excludesQueueInput: true, excludesTenantId: true }
}

// ---------------------------------------------------------------------------
// PİN 7 — JobReadPortAdapter satisfies JobReadPort
// ---------------------------------------------------------------------------

/** ⚠ TİP PİNİ 7 — PİN 4'ün birebir ikizi (ROADMAP v0.0.11, T-013/S8). */
export function pinJobReadPortAdapterSatisfiesPort(
  adapter: JobReadPortAdapter,
): JobReadPortAdapter {
  return adapter satisfies JobReadPort
}

// ---------------------------------------------------------------------------
// PİN 8 — TenantRoleWire ≡ TenantRole (tip) + çalışma zamanı değer eşitliği
// (ROADMAP v0.0.14, T-014/S4 — AC4)
// ---------------------------------------------------------------------------

/**
 * PİN 1'in gerekçesi BİREBİR geçerli: veri katmanının `TenantRole`'ü bir
 * Prisma string enum'udur ve ham bir string literal birleşimiyle `extends`
 * üzerinden karşılaştırılamaz (string enum'lar NOMİNAL'dir). Karşılaştırma
 * enum'un KENDİ anahtarları üzerinden yapılır — Prisma string enum'larında
 * anahtar adı HER ZAMAN değerle birebir aynıdır.
 */
type TenantRoleKeys = keyof typeof TenantRoleValue

type ExtraWireRoles = Exclude<TenantRoleWire, TenantRoleKeys>
type MissingWireRoles = Exclude<TenantRoleKeys, TenantRoleWire>

type AssertNoExtraWireRoles = ExtraWireRoles extends never
  ? true
  : ['FAZLA ROL — tenantRoleSchema içinde olup TenantRole içinde olmayan', ExtraWireRoles]

type AssertNoMissingWireRoles = MissingWireRoles extends never
  ? true
  : ['EKSİK ROL — TenantRole içinde olup tenantRoleSchema içinde olmayan', MissingWireRoles]

/**
 * ⚠ TİP PİNİ 8 — `TenantRoleWire` ve `TenantRole`'ün anahtar kümesi TAM
 * eşleşmeli (AC4). Tele sözlüğe elle bir değer EKLEMEK veya ÇIKARMAK bu pini
 * `pnpm typecheck`'te KIRAR.
 *
 * ⚠ NEDEN BU PİN YETKİ MODELİNİN TEMEL TAŞI: rol → izin eşlemesi sözleşme
 * paketinde TAM bir `Record<TenantRoleWire, …>`'dır → veri katmanına yeni bir
 * rol eklendiğinde bu pin kırılır → tele sözlük güncellenir → eşleme EKSİK
 * ANAHTARLA derlenmez → yeni rolün izinsiz (ve dolayısıyla sessizce yetkisiz
 * veya sessizce TAM yetkili) kalması İMKÂNSIZ hâle gelir. Zincirin ilk halkası
 * bu dosyadır.
 */
export function pinTenantRoleWireKeysExactlyMatchTenantRole(): {
  noExtra: AssertNoExtraWireRoles
  noMissing: AssertNoMissingWireRoles
} {
  return { noExtra: true, noMissing: true }
}

/**
 * ÇALIŞMA ZAMANI PİNİ 8 — `tenantStatusWireValuesMatchPrismaAtRuntime`'ın
 * birebir ikizi. `pnpm typecheck` tarafından DEĞİL, `../trpc-http.test.ts`
 * tarafından GERÇEKTEN ÇAĞRILIR (`pnpm test`): tip pininin yakalayamayacağı
 * bir sapmayı (aynı anahtar kümesi ama Prisma'nın DEĞER tarafı farklı
 * yazılmış) yakalar.
 */
export function tenantRoleWireValuesMatchPrismaAtRuntime(): boolean {
  const wireValues = [...tenantRoleSchema.options].sort()
  const prismaValues = Object.values(TenantRoleValue).sort()

  return (
    wireValues.length === prismaValues.length &&
    wireValues.every((value, index) => value === prismaValues[index])
  )
}

// ---------------------------------------------------------------------------
// PİN 9/10 — iki yeni port adaptörü `satisfies` kendi portu
// (ROADMAP v0.0.14, T-014/S4)
// ---------------------------------------------------------------------------

/**
 * ⚠ TİP PİNİ 9 — PİN 4/7'nin ikizi. `implements` ZATEN adaptörün kendi
 * dosyasında yazılı; bu pin ONA EK bir savunmadır: `implements` kaldırılırsa
 * (veya sınıf bir fabrika fonksiyonuna dönüşürse) uyum sessizce kaybolurdu.
 */
export function pinMembershipReadPortAdapterSatisfiesPort(
  adapter: MembershipReadPortAdapter,
): MembershipReadPortAdapter {
  return adapter satisfies MembershipReadPort
}

/** ⚠ TİP PİNİ 10 — PİN 9'un ikizi, platformun ilk YAZMA portu için. */
export function pinMemberWritePortAdapterSatisfiesPort(
  adapter: MemberWritePortAdapter,
): MemberWritePortAdapter {
  return adapter satisfies MemberWritePort
}

/**
 * ⚠ TİP PİNİ 11 — PİN 4/7/9/10'un ikizi (ROADMAP v0.0.15, T-016/S7).
 * `TenantSecurityWritePortAdapter`'ın `TenantSecurityWritePort`'u BİREBİR
 * karşıladığını `implements` bildirimine EK bir savunma olarak doğrular.
 */
export function pinTenantSecurityWritePortAdapterSatisfiesPort(
  adapter: TenantSecurityWritePortAdapter,
): TenantSecurityWritePortAdapter {
  return adapter satisfies TenantSecurityWritePort
}

/**
 * ⚠ TİP PİNİ 12 — PİN 4/7/9/10/11'in ikizi (ROADMAP v0.0.15, T-016 FIX turu
 * 2/M-4). `SessionSecurityReadPortAdapter`'ın `SessionSecurityReadPort`'u
 * BİREBİR karşıladığını `implements` bildirimine EK bir savunma olarak
 * doğrular.
 */
export function pinSessionSecurityReadPortAdapterSatisfiesPort(
  adapter: SessionSecurityReadPortAdapter,
): SessionSecurityReadPortAdapter {
  return adapter satisfies SessionSecurityReadPort
}
