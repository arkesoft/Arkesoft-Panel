// @arkesoft/theme-sdk — `ThemeManifest` kök şeması (ROADMAP v0.0.9, T-010/S5,
// architect "Tip tasarımı" bölümü)
//
// ⚠ `id` BASİT BİR SLUG'DIR, `packages/tenancy`'nin rezerve etiket/hostname
// kuralları UYGULANMAZ/KOPYALANMAZ (V3, architect kararı) — bir tema id'si
// bir ALAN ADI veya ALT ALAN ADI DEĞİLDİR, iki kavram farklı güven sınırları
// taşır (tema id'si tema YAZARININ beyanı, hostname tenant ÇÖZÜMLEMESİNİN
// girdisi). Bu paketin kapalı bağımlılık listesi (`{ zod }`) zaten
// `packages/tenancy`'ye bağımlılık DOĞURMUYOR (`src/__tests__/purity.
// test.ts` bunu pinler) — bu dosya o kuralı KOPYALAMAZ, basit bir slug
// deseni (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) ile kendi BAĞIMSIZ kuralını
// tanımlar.
//
// ⚠ `version`/`sdkRange` — YALNIZCA BİÇİM doğrulanır, SEMVER KARŞILAŞTIRMASI
// YAPILMAZ (bağlayıcı kısıt, `../migrations/chain.ts`'in dosya başı
// yorumuyla AYNI gerekçe: `packages/versioning`'in işi, bu pakete o pakete
// bağımlılık DOĞMAZ). `version` TAM bir semver'dir (`1.2.3` gibi, aralık
// OPERATÖRÜ TAŞIMAZ — bu TEMANIN KENDİ sürümüdür); `sdkRange` bir ARALIK
// biçimidir (`^1.2.0`, `>=1.0.0 <2.0.0` gibi — theme-sdk'nın HANGİ sürüm
// aralığıyla uyumlu olduğunun BEYANI).
//
// ⚠ B4 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti B) — bu dosya ESKİDEN
// (S4/S5 paralelliğinin bedeli olarak) KENDİ yerel "çekirdek semver"
// desenini (`SEMVER_CORE_SOURCE`) taşıyordu; `../migrations/chain.ts`'in
// deseniyle ÖLÇÜLEBİLİR şekilde SAPMIŞTI (`"1.0.0-01"` burada KABUL,
// orada RED — bkz. `../semver-format.ts`'in dosya başı yorumu, tam
// ölçüm). Artık ikisi de `../semver-format.js`'teki TEK kaynaktan
// (`SEMVER_CORE_PATTERN_SOURCE`) beslenir — `rg` ile tanım sayısı 1.
//
// ⚠ `version` biçimi GEÇERSİZSE özel bir kod YOK (15 kodun kapalı listesinde
// "sürüm biçimi geçersiz" için AYRI bir kod TANIMLANMADI) — en yakın anlamı
// taşıyan `THEME_MANIFEST_INVALID` kullanılır (fallback kodu, özel bir
// `.check()` etiketi GEREKMEZ) — `../migrations/chain.ts`'in AC7 kontrolü
// de (geçersiz `themeVersion`) AYNI kodu kullanır, bu TUTARLI bir karar.
//
// ⚠ `migrations` ALANI — theme.json'ın SAF JSON gövdesi DEĞİL, `defineTheme()`
// (S8'in işi) tarafından kurulan TAM manifest nesnesidir: `migrate`
// fonksiyonları GERÇEK JS fonksiyonlarıdır (JSON'a serileştirilemezler).
// Bu yüzden `validateThemeManifest(input: unknown)` çağrısının girdisi
// "diskten okunan theme.json" DEĞİL, "`defineTheme()`'in topladığı
// bellek-içi manifest nesnesi"dir — ikisi de bu paketin dışından gelen
// `unknown` veridir (CLAUDE.md §4), Zod'suz hiçbiri tip ALMAZ.
// `migrate`'in GERÇEKTEN bir fonksiyon olup olmadığı `z.custom()` ile
// çalışma zamanında doğrulanır; fonksiyonun GÖVDESİ/davranışı bu şemanın
// işi DEĞİLDİR (migration zincirinin KOŞULMASI `../migrations/run.ts`'in,
// S6'nın işi).

import { z } from 'zod'

import type { ThemeContractErrorCode } from '../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'
import type { ThemeSettingsMigration } from '../migrations/chain.js'
import { SEMVER_CORE_PATTERN_SOURCE } from '../semver-format.js'
import { THEME_SETTINGS_LIST_SCHEMA } from '../settings/primitives.js'
import { THEME_TEMPLATES_SCHEMA } from './templates.js'

const THEME_ID_INVALID_CODE: ThemeContractErrorCode = 'THEME_ID_INVALID'
const THEME_SDK_RANGE_INVALID_CODE: ThemeContractErrorCode = 'THEME_SDK_RANGE_INVALID'

/**
 * Basit tema id'si deseni — küçük harfle başlar, küçük harf/rakam/tire ile
 * sürer (dosya başı yorumu, V3). `export` — B5 düzeltmesi (T-010 düzeltme
 * turu 1/3 · parti B): `../json-schema.ts`'in `override` mekanizması bu
 * deseni `id` alanının yayınlanan JSON Schema izdüşümüne TAŞIMAK için
 * yeniden kullanır (tek kaynak, `id` biçimi İKİ yerde TANIMLANMAZ).
 */
export const THEME_ID_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/** `version` alanı — TAM semver, aralık operatörü TAŞIMAZ (temanın KENDİ sürümü). */
const THEME_VERSION_FORMAT_PATTERN = new RegExp(`^${SEMVER_CORE_PATTERN_SOURCE}$`)

/** Bir aralık operatörü öneki — `^`, `~`, `>=`, `<=`, `>`, `<`, `=` veya YOK. */
const RANGE_OPERATOR_SOURCE = '(?:\\^|~|>=|<=|>|<|=)?'

/**
 * `sdkRange` alanı — bir veya daha fazla boşlukla ayrılmış operatör+semver
 * ÇEKİRDEĞİ (ör. `>=1.0.0 <2.0.0`), yalnızca BİÇİM. `export` — B5
 * düzeltmesi (dosya başı yorumu, `THEME_ID_PATTERN` ile AYNI gerekçe):
 * `../json-schema.ts` bu deseni `sdkRange` alanının JSON Schema
 * izdüşümüne taşımak için yeniden kullanır.
 */
export const THEME_SDK_RANGE_FORMAT_PATTERN = new RegExp(
  `^${RANGE_OPERATOR_SOURCE}${SEMVER_CORE_PATTERN_SOURCE}(?:\\s+${RANGE_OPERATOR_SOURCE}${SEMVER_CORE_PATTERN_SOURCE})*$`,
)

/** `id` alanı — biçim geçersizse `THEME_ID_INVALID` (özel kod, custom issue). */
const THEME_ID_SCHEMA = z.string().check((payload) => {
  if (!THEME_ID_PATTERN.test(payload.value)) {
    payload.issues.push({
      code: 'custom',
      input: payload.value,
      message: THEME_CONTRACT_MESSAGES.THEME_ID_INVALID,
      params: { themeContractErrorCode: THEME_ID_INVALID_CODE },
    })
  }
})

/** `sdkRange` alanı — biçim geçersizse `THEME_SDK_RANGE_INVALID` (özel kod, custom issue). */
const THEME_SDK_RANGE_SCHEMA = z.string().check((payload) => {
  if (!THEME_SDK_RANGE_FORMAT_PATTERN.test(payload.value)) {
    payload.issues.push({
      code: 'custom',
      input: payload.value,
      message: THEME_CONTRACT_MESSAGES.THEME_SDK_RANGE_INVALID,
      params: { themeContractErrorCode: THEME_SDK_RANGE_INVALID_CODE },
    })
  }
})

/**
 * Tek bir ayar migration'ı — `../migrations/chain.ts`'in
 * `ThemeSettingsMigration` arayüzüyle YAPISAL OLARAK eşleşir (bu dosya o
 * dosyadan yalnızca TİPİ import eder, DEĞİŞTİRMEZ). `migrate` çalışma
 * zamanında GERÇEKTEN bir fonksiyon mu diye `z.custom()` ile doğrulanır —
 * özel bir kod YOK, fallback `THEME_MANIFEST_INVALID` kullanılır (15 kodun
 * kapalı listesinde "migrate fonksiyon değil" için ayrı kod AÇILMADI).
 */
const THEME_SETTINGS_MIGRATION_SCHEMA = z.strictObject({
  from: z.string(),
  to: z.string(),
  migrate: z.custom<ThemeSettingsMigration['migrate']>((value) => typeof value === 'function'),
})

/**
 * Temanın platformla konuşma sözleşmesinin KÖK şeması. `z.strictObject` —
 * bilinmeyen anahtar REDDEDİLİR (AC4, "yazar masada" felsefesi, bkz.
 * `../zod-issue-mapping.ts`'in `unrecognized_keys` → `THEME_MANIFEST_
 * UNKNOWN_KEY` eşlemesi).
 *
 * ⚠ B1 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti B, A'nın bildirdiği
 * RİSK) — `settings` alanı artık `THEME_SETTINGS_LIST_SCHEMA`
 * (`../settings/primitives.ts`) kullanır, çıplak `z.array(THEME_SETTING_
 * DEFINITION_SCHEMA).readonly()` DEĞİL. Fark: `THEME_SETTINGS_LIST_SCHEMA`
 * `THEME_GROUP_SETTING_SCHEMA.children`'ınki İLE AYNI yinelenen-`key`
 * `.check()`'ini KÖK dizi İÇİN de taşır — ŞEMA SEVİYESİNDE (orkestrasyon
 * seviyesinde DEĞİL). Önceki tur (Parti A) bu kontrolü `manifest.ts`'i
 * DEĞİŞTİREMEDİĞİ için (bu dosya o turda Parti B'ye kilitliydi)
 * `../manifest/validate-manifest.ts`'te (orkestrasyon seviyesinde)
 * uygulamıştı — bu ZAYIF bir savunmaydı: `THEME_MANIFEST_SCHEMA.safeParse()`
 * `validate-manifest.ts`'İ ATLAYARAK DOĞRUDAN çağrılırsa (varsayımsal bir
 * tüketici) korumayı KAYBEDERDİ. Artık savunma ŞEMANIN KENDİSİNDE —
 * `validate-manifest.ts`'teki orkestrasyon çağrısı bu yüzden KALDIRILDI
 * (gerekçe orada, dosya başı yorumunda: çift raporlama OLUŞMASIN).
 */
export const THEME_MANIFEST_SCHEMA = z.strictObject({
  id: THEME_ID_SCHEMA,
  name: z.string(),
  version: z.string().regex(THEME_VERSION_FORMAT_PATTERN),
  sdkRange: THEME_SDK_RANGE_SCHEMA,
  templates: THEME_TEMPLATES_SCHEMA,
  settings: THEME_SETTINGS_LIST_SCHEMA,
  migrations: z.array(THEME_SETTINGS_MIGRATION_SCHEMA).readonly(),
})

/** Bir temanın platformla konuşma sözleşmesinin çıkarılmış TypeScript tipi. */
export type ThemeManifest = z.infer<typeof THEME_MANIFEST_SCHEMA>
