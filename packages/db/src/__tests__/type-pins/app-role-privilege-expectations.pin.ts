// @arkesoft/db — tip pin'i: `tenancy.ts`'in `APP_ROLE_TABLE_PRIVILEGE_
// EXPECTATIONS` beyanının `tableName` üyelerinin
// `PLATFORM_LEVEL_TABLES ∪ TENANT_SCOPED_TABLES`'in ALT KÜMESİ olduğunu
// derleme zamanında pinler (ROADMAP v0.0.20.2, T-023/S3, architect AC-10 —
// "beyan üyeleri derleme zamanı `Exclude<>` ile pinli", emsal:
// `auth-secret-tables.pin.ts`).
//
// Bu dosya ÇALIŞMA ZAMANI testi DEĞİLDİR — `.test.ts` ile BİTMİYOR,
// `vitest.config.ts`'in `include: ['src/**/*.test.ts']` deseni bu dosyayı
// YAKALAMAZ (`auth-secret-tables.pin.ts`/`client-options.pin.ts`/
// `auth-model-narrowing.pin.ts` ile AYNI desen — pin'in TEK kanıtı derleme
// zamanıdır, `pnpm typecheck`).
//
// GÜNCELLEME (ROADMAP v0.0.20.2, T-023/S6, Orkestratör düzeltmesi — `as const
// satisfies` dönüşümü): AYNA KALDIRILDI, pin artık GERÇEK sabiti tüketir.
// S3'ün ölçtüğü açık (yukarıdaki eski not, tarihsel referans için KORUNUYOR
// — `AYNA` başlıklı paragraf artık GEÇERLİ DEĞİL): `tenancy.ts`'teki eski
// bildirim `: readonly AppRoleTablePrivilegeExpectation[] = [] as const`
// AÇIK bir tip bildirimi taşıyordu ve bu, `tableName`'i `string`'e
// GENİŞLETİYORDU — modül sınırını geçen bir `const`ın tipi HER ZAMAN o açık
// bildirimdir, `as const`'ın ürettiği literal tip bilgisi KAYBOLURDU. S6
// bildirimi `export const APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS = [...] as
// const satisfies readonly AppRoleTablePrivilegeExpectation[]`e ÇEVİRDİ:
// `satisfies` şekli DOĞRULAR ama değişkenin ÇIKARILAN tipini DEĞİŞTİRMEZ —
// `as const`'ın literal tipi (`'audit_log' | 'platform_audit_log'`)
// modül sınırını geçerken KORUNUR. İKİ YÖNLÜ KANIT (DoD 4, elle koşturuldu):
// beyana taksonomide OLMAYAN bir tablo adı (`'audit_log_totally_unknown'`)
// eklenip `pnpm typecheck` çalıştırıldığında bu dosyanın
// `AssertNoExtraTableName` tipi beklenen tuple'a DARALIR ve derleme
// KIRMIZI olur; `Edit` ile geri alındığında `exit 0`'a döner (ham çıktı
// handoff raporunda).

import type {
  APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS,
  PLATFORM_LEVEL_TABLES,
  TENANT_SCOPED_TABLES,
} from '../../tenancy.js'

/** `PLATFORM_LEVEL_TABLES ∪ TENANT_SCOPED_TABLES` — taksonominin TAM birleşimi. */
type TaxonomyTableName =
  (typeof PLATFORM_LEVEL_TABLES)[number] | (typeof TENANT_SCOPED_TABLES)[number]

/**
 * `tenancy.ts`'teki GERÇEK `APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`'ın
 * `tableName` üyelerinin literal birleşimi — artık bir AYNA DEĞİL, sabitin
 * KENDİSİNDEN türetilir (`as const satisfies` sayesinde mümkün oldu, bkz.
 * dosya başı yorum). Senkron kayması riski bu yüzden YAPISAL OLARAK ortadan
 * kalktı: beyana eklenen her yeni satır bu tipe OTOMATİK yansır.
 */
type PinnedTableName = (typeof APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS)[number]['tableName']

/** Gerçek beyanda olup taksonomide OLMAYAN üyeler — KAPALI küme, `never` beklenir. */
type ExtraTableName = Exclude<PinnedTableName, TaxonomyTableName>

type AssertNoExtraTableName = ExtraTableName extends never
  ? true
  : [
      'TAKSONOMİDE OLMAYAN TABLO ADI — APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS taksonomi dışı bir tablo beyan ediyor',
      ExtraTableName,
    ]

/**
 * `tenancy.ts`'teki GERÇEK `APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`'ın HER
 * üyesinin `PLATFORM_LEVEL_TABLES ∪ TENANT_SCOPED_TABLES`'in alt kümesi
 * olduğunu pinler. Bu fonksiyon hiçbir yerden çağrılmaz — varlığı DERLENMESİ
 * yeterlidir (emsal: `auth-secret-tables.pin.ts`).
 *
 * ⚠ Geri alma kanıtı (DoD 4, bu alt görevde elle koşturuldu): gerçek beyana
 * (`tenancy.ts`) taksonomide OLMAYAN bir ad (örn.
 * `'audit_log_totally_unknown'`) eklemek `AssertNoExtraTableName`i
 * `['TAKSONOMİDE OLMAYAN TABLO ADI …', 'audit_log_totally_unknown']`e
 * daraltır — `noExtraTableName: true` dönüşü artık bu tuple tipine
 * ATANAMADIĞI için `pnpm typecheck` KIRMIZI olur.
 */
export function pinAppRoleTablePrivilegeExpectationNamesAreTaxonomyMembers(): {
  noExtraTableName: AssertNoExtraTableName
} {
  return { noExtraTableName: true }
}
