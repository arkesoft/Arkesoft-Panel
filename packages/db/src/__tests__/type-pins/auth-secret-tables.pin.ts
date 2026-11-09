// @arkesoft/db — tip pin'i: `tenancy.ts`'in `AUTH_SECRET_BEARING_TABLES`'ı
// `client.ts:68`'in `AUTH_SECRET_BEARING_MODELS`'ı ile BİREBİR aynı modelleri/
// tabloları adlandırdığını doğrular (ROADMAP v0.0.14.1, T-015/ST-C, architect
// "Bağlayıcı yetki beyanı"; ROADMAP v0.0.15, T-016/S2, architect DÜZELTME 3 —
// ÜÇ YOLLU kapalı dünyaya yeniden tasarlandı).
//
// Bu dosya ÇALIŞMA ZAMANI testi DEĞİLDİR — `.test.ts` ile BİTMİYOR,
// `vitest.config.ts`'in `include: ['src/**/*.test.ts']` deseni bu dosyayı
// YAKALAMAZ (`client-options.pin.ts`/`auth-model-narrowing.pin.ts` ile AYNI
// desen — pin'in TEK kanıtı derleme zamanıdır, `pnpm typecheck`).
//
// İKİ sabit AYRI dosyalarda, AYRI amaçlarla yaşar: `AUTH_SECRET_BEARING_MODELS`
// (`client.ts`) çalışma zamanı tip daraltması için (`AppPrismaDatabase`'in
// `Pick<>` allowlist'inin NEYİ düşürdüğünü adlandırır — Prisma MODEL adı,
// camelCase), `AUTH_SECRET_BEARING_TABLES` (`tenancy.ts`) katalog linter'ının
// (`catalog-lint.ts`) `LintCatalogOptions.authSecretBearingTables` girdisi
// için (DB TABLO adı, snake_case). İkisi SESSİZCE ayrışırsa (örn. biri
// güncellenir diğeri unutulursa) linter YANLIŞ tabloları değerlendirir — bu
// pin o ayrışmayı `pnpm typecheck`'te YAKALAR.
//
// ⚠⚠ DÜZELTME 3 (ROADMAP v0.0.15, T-016/S2) — İSİMLENDİRME EKSENİ İLK KEZ
// KIRILIYOR: önceki sürüm iki dizinin STRING LİTERAL eşitliğini zorluyordu;
// bu çalışıyordu çünkü üç üyede Prisma MODEL adı = DB TABLO adı
// (`account`/`session`/`verification`). `TwoFactor` ilk SAPMA: `twoFactor`
// (Prisma, PascalCase model adının camelCase delege adı) ≠ `two_factor` (DB,
// CLAUDE.md §4 → DB snake_case, Prisma PascalCase tekil). Düz string literal
// eşitliği bu sapmayı YA yanlış yakalardı (naming kuralını ihlal etmeye
// zorlardı) YA DA pini zayıflatmayı gerektirirdi — İKİSİ DE YASAK.
//
// KARAR (architect, uygulanır — şekli İCAT EDİLMEZ): eşleme PİN DOSYASININ
// İÇİNDE yaşayan bir `AuthSecretModelToTable` haritasıdır. Üretim veri
// dosyaları (`tenancy.ts`, `client.ts`) SADE kalır; `tenancy.ts` İMPORTSUZ
// kalır (AC9/K-E5 — taksonomi `catalog-lint.ts`'e VERİ olarak
// `LintCatalogOptions` üzerinden geçer, literal GİRMEZ). Haritanın
// ANAHTARLARI (`keyof`) `AUTH_SECRET_BEARING_MODELS` ile, DEĞERLERİ
// `AUTH_SECRET_BEARING_TABLES` ile İKİ YÖNLÜ `Exclude<>` ile karşılaştırılır
// — DÖRT ayrı kapalı dünya karşılaştırması (anahtar fazlalık/eksiklik, değer
// fazlalık/eksiklik). Yeni bir sır taşıyan model eklemek ÜÇ yeri birden
// (harita + iki üretim sabiti) düzenlemeyi zorlar → fail-loud KORUNUR.

import type { AUTH_SECRET_BEARING_MODELS } from '../../client.js'
import type { AUTH_SECRET_BEARING_TABLES } from '../../tenancy.js'

/**
 * Sır taşıyan her Prisma MODELİNİN (camelCase) karşılık geldiği DB TABLO
 * adını (snake_case) adlandıran kapalı harita. `keys` ≡
 * `AUTH_SECRET_BEARING_MODELS`, `values` ≡ `AUTH_SECRET_BEARING_TABLES`.
 */
type AuthSecretModelToTable = {
  account: 'account'
  session: 'session'
  verification: 'verification'
  twoFactor: 'two_factor'
}

type TenancyAuthSecretTable = (typeof AUTH_SECRET_BEARING_TABLES)[number]
type ClientAuthSecretModel = (typeof AUTH_SECRET_BEARING_MODELS)[number]

type MappedModelKeys = keyof AuthSecretModelToTable
type MappedTableValues = AuthSecretModelToTable[MappedModelKeys]

/** Haritanın anahtarlarında (model) olup `client.ts`'te OLMAYAN üyeler. */
type ExtraKeyInMap = Exclude<MappedModelKeys, ClientAuthSecretModel>

/** `client.ts`'te olup haritanın anahtarlarında (model) OLMAYAN üyeler. */
type MissingKeyInMap = Exclude<ClientAuthSecretModel, MappedModelKeys>

/** Haritanın değerlerinde (tablo) olup `tenancy.ts`'te OLMAYAN üyeler. */
type ExtraValueInMap = Exclude<MappedTableValues, TenancyAuthSecretTable>

/** `tenancy.ts`'te olup haritanın değerlerinde (tablo) OLMAYAN üyeler. */
type MissingValueInMap = Exclude<TenancyAuthSecretTable, MappedTableValues>

type AssertNoExtraKeyInMap = ExtraKeyInMap extends never
  ? true
  : ['FAZLA ANAHTAR (model) — harita client.ts ile ayrıştı', ExtraKeyInMap]

type AssertNoMissingKeyInMap = MissingKeyInMap extends never
  ? true
  : ['EKSİK ANAHTAR (model) — harita client.ts ile ayrıştı', MissingKeyInMap]

type AssertNoExtraValueInMap = ExtraValueInMap extends never
  ? true
  : ['FAZLA DEĞER (tablo) — harita tenancy.ts ile ayrıştı', ExtraValueInMap]

type AssertNoMissingValueInMap = MissingValueInMap extends never
  ? true
  : ['EKSİK DEĞER (tablo) — harita tenancy.ts ile ayrıştı', MissingValueInMap]

/**
 * ⚠ DÖRT YOLLU kapalı dünya pin'i — `AUTH_SECRET_BEARING_TABLES` (tenancy.ts)
 * ve `AUTH_SECRET_BEARING_MODELS` (client.ts), `AuthSecretModelToTable`
 * haritası ÜZERİNDEN iki yönlü tutarlı olmalıdır. Bu fonksiyon hiçbir yerden
 * çağrılmaz — varlığı DERLENMESİ yeterlidir.
 */
export function pinAuthSecretBearingTablesMatchClientModels(): {
  noExtraKeyInMap: AssertNoExtraKeyInMap
  noMissingKeyInMap: AssertNoMissingKeyInMap
  noExtraValueInMap: AssertNoExtraValueInMap
  noMissingValueInMap: AssertNoMissingValueInMap
} {
  return {
    noExtraKeyInMap: true,
    noMissingKeyInMap: true,
    noExtraValueInMap: true,
    noMissingValueInMap: true,
  }
}
