// @arkesoft/db — tip pin'i: `tenancy.ts`'in `AUTH_SECRET_BEARING_TABLES`'ı
// `client.ts:68`'in `AUTH_SECRET_BEARING_MODELS`'ı ile BİREBİR aynı üç üyeyi
// adlandırdığını doğrular (ROADMAP v0.0.14.1, T-015/ST-C, architect
// "Bağlayıcı yetki beyanı")
//
// Bu dosya ÇALIŞMA ZAMANI testi DEĞİLDİR — `.test.ts` ile BİTMİYOR,
// `vitest.config.ts`'in `include: ['src/**/*.test.ts']` deseni bu dosyayı
// YAKALAMAZ (`client-options.pin.ts`/`auth-model-narrowing.pin.ts` ile AYNI
// desen — pin'in TEK kanıtı derleme zamanıdır, `pnpm typecheck`).
//
// İKİ sabit AYRI dosyalarda, AYRI amaçlarla yaşar: `AUTH_SECRET_BEARING_MODELS`
// (`client.ts`) çalışma zamanı tip daraltması için (`AppPrismaDatabase`'in
// `Pick<>` allowlist'inin NEYİ düşürdüğünü adlandırır), `AUTH_SECRET_BEARING_
// TABLES` (`tenancy.ts`) katalog linter'ının (`catalog-lint.ts`)
// `LintCatalogOptions.authSecretBearingTables` girdisi için. İkisi SESSİZCE
// ayrışırsa (örn. biri güncellenir diğeri unutulursa) linter YANLIŞ tabloları
// değerlendirir — bu pin o ayrışmayı `pnpm typecheck`'te YAKALAR.
//
// KAPALI DÜNYA karşılaştırması (`auth-model-narrowing.pin.ts`'in JENERİK
// pin'iyle AYNI desen): iki yönlü `Exclude<>` — fazla VEYA eksik üye varsa
// aşağıdaki `satisfies`/atama bir tuple tipine çözülür ve `true` literaline
// UYMAZ, `pnpm typecheck` TS2322 ile KIRMIZIYA döner.

import type { AUTH_SECRET_BEARING_MODELS } from '../../client.js'
import type { AUTH_SECRET_BEARING_TABLES } from '../../tenancy.js'

type TenancyAuthSecretTable = (typeof AUTH_SECRET_BEARING_TABLES)[number]
type ClientAuthSecretModel = (typeof AUTH_SECRET_BEARING_MODELS)[number]

/** `tenancy.ts`'te olup `client.ts`'te OLMAYAN üyeler (fazlalık). */
type ExtraInTenancy = Exclude<TenancyAuthSecretTable, ClientAuthSecretModel>

/** `client.ts`'te olup `tenancy.ts`'te OLMAYAN üyeler (eksiklik). */
type MissingInTenancy = Exclude<ClientAuthSecretModel, TenancyAuthSecretTable>

type AssertNoExtraInTenancy = ExtraInTenancy extends never
  ? true
  : ['FAZLA ÜYE — tenancy.ts client.ts ile ayrıştı', ExtraInTenancy]

type AssertNoMissingInTenancy = MissingInTenancy extends never
  ? true
  : ['EKSİK ÜYE — tenancy.ts client.ts ile ayrıştı', MissingInTenancy]

/**
 * ⚠ JENERİK PİN — `AUTH_SECRET_BEARING_TABLES` (tenancy.ts) ve
 * `AUTH_SECRET_BEARING_MODELS` (client.ts) İKİ YÖNLÜ aynı üç üyeyi
 * adlandırmalıdır. Bu fonksiyon hiçbir yerden çağrılmaz — varlığı
 * DERLENMESİ yeterlidir.
 */
export function pinAuthSecretBearingTablesMatchClientModels(): {
  noExtraInTenancy: AssertNoExtraInTenancy
  noMissingInTenancy: AssertNoMissingInTenancy
} {
  return { noExtraInTenancy: true, noMissingInTenancy: true }
}
