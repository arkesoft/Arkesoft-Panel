# @arkesoft/versioning

Semver karşılaştırma, uyumluluk aralığı ve N-2 destek penceresi yardımcıları.
`ROADMAP.md` v0.0.21, T-018'de ilk içeriğini kazandı (ADR-0020).

## Sorumluluk sınırı

| Yapar                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Yapmaz                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Semver çekirdek biçim doğrulaması + major çıkarımı (`semver.ts`); ayrıştırılmış sürüm karşılaştırması (`compareSemverParts`); semver ARALIK (`^ ~ >= <= > < =`, boşlukla ayrılmış VE-birleşimi) ayrıştırma ve karşılama hesabı (`range.ts`); N-2 destek penceresi hesapları — platform (minor), theme-sdk/tema (major), public API (12 ay), zorunlu yükseltme (30 gün) (`support-window.ts`); `TenantVersionState.previousState` anlık görüntü şeması (`snapshot.ts`) | I/O · dosya sistemi erişimi · HTTP/ağ çağrısı · veritabanı erişimi · **kiracı (tenant) verisine erişim** · domain hatası tanımlama/fırlatma (`@arkesoft/errors`'a bağımlı DEĞİL) · i18n · **sistem saatini okuma** (`Date.now()`/`new Date()` — tüm tarihler fonksiyon PARAMETRESİ olarak enjekte edilir) · tam npm semver grameri (`\|\|`, `x`/`*` joker, tire aralıkları — platformun kendi grameri bunları yapısal olarak reddediyor) |

## Neden kapalı bir bağımlılık listesi

`dependencies` alanı **tam olarak** `{ "zod": "catalog:" }` — `semver` npm
paketi **eklenmedi** (ADR-0020 Karar 2): platformun kendi manifest grameri
(`packages/theme-sdk/src/manifest/manifest.ts:72-84`) kapalı bir kümedir;
`semver`'in yüzeyinin büyük kısmı ölü kod olurdu ve `loose`/`coerce`
davranışları bu paketin `"1.0.0-01"` sınıfı sapmayı kapatan katılığını
sessizce yeniden açabilirdi.

`src/__tests__/purity.test.ts` bu iddiayı iki yönden pinler:

1. `src/` üretim kaynaklarında (`__tests__` hariç) Node built-in'leri,
   `fetch(`, `process.`, `@nestjs`, `express`, `@prisma`, `@arkesoft/*`
   dizgilerinden hiçbiri geçemez — **ve** sistem saatini okuyan iki çağrı
   dizgisi (`Date.now(`/`new Date(`) de aynı taramada yasaklıdır (AC-7).
2. `package.json`'daki `dependencies` **tam olarak** `{ zod: 'catalog:' }`
   olmak zorunda.

## İki katman (`semver.ts`)

CLAUDE.md §4 "beklenen durumlar için hata fırlat" der, ama bu paket domain
hatası tanımlamaz ve `@arkesoft/errors`'a bağımlı olamaz (ADR-0020 Karar 2).
Çözüm: dizeden tipe geçişin **tek sınırı** `parseSemver`/`extractMajor` —
biçim geçersizse `undefined` döner. Sınırın ötesindeki fonksiyonlar
(`compareSemverParts`, `satisfiesParsed`, destek penceresi fonksiyonları)
**toplamdır** (total) — zaten ayrıştırılmış girdi üzerinde çalışır,
`undefined` dönemez. `compareSemver`/`satisfies` bu iki katmanı birleştiren
sarmalayıcılardır.

## Taşınan kaynak

`SEMVER_CORE_PATTERN_SOURCE`, `SEMVER_FORMAT_PATTERN` ve `extractMajor`
`packages/theme-sdk/src/semver-format.ts`'ten ADR-0020 Karar 2 ile BİREBİR
buraya taşındı (dosyanın başı yorumu, ölçüm/gerekçe dahil, `src/semver.ts`'e
birebir aktarılmıştır). `packages/theme-sdk` artık bu üçünü buradan ithal
eder; repoda semver çekirdek deseninin tanım sayısı **bir** kalır.

## Dosyalar

- `src/semver.ts` — semver çekirdek biçim deseni (taşınan kaynak), major
  çıkarımı, `SemverParts`, `parseSemver`, `compareSemverParts`,
  `compareSemver`.
- `src/range.ts` — semver ARALIK biçimi (platformun kapalı grameri),
  `parseRange`, `satisfiesParsed`, `satisfies` (fail-closed),
  `isThemeReleaseCompatibleWithSdk`.
- `src/support-window.ts` — N-2 destek penceresi: platform (minor pencere),
  theme-sdk/tema (major pencere, ayrı fonksiyonlar), public API (12 ay
  yaşam, UTC takvim ayı aritmetiği), zorunlu yükseltme (30 gün, milisaniye
  arimetiği). Tarihler enjekte edilir.
- `src/snapshot.ts` — `TENANT_VERSION_SNAPSHOT_SCHEMA` (Zod,
  `z.strictObject`), `TenantVersionSnapshot`.
- `src/index.ts` — tek giriş noktası; tüketiciler iç dosya yoluna girmez.

## Bilinen tuzaklar (okumadan önce)

- **`^`/`~`'nin `0.x` özel hâlleri npm UYUMLUDUR, naif bir uygulama
  DEĞİLDİR.** `^0.1.0` ⇒ `>=0.1.0 <0.2.0`, `^0.0.3` ⇒ `>=0.0.3 <0.0.4`,
  `~0.1.0` ⇒ `>=0.1.0 <0.2.0`. Bu, el yazımı bir uygulamanın npm'den
  sessizce ayrıştığı tek yerdir — sınır testleri `__tests__/range.test.ts`'te.
- **Asgari ön-sürüm kuralı.** Ön-sürüm taşıyan bir sürüm, eşleşen
  ön-sürümlü bir karşılaştırıcı (aynı major.minor.patch üçlüsünde) YOKSA
  hiçbir aralığı karşılamaz — `satisfies('1.0.0-rc.1', '>=1.0.0')` `false`
  döner.
- **`themeId` biçimi bu pakette doğrulanmaz.** Tek kaynak
  `packages/theme-sdk`'nın `THEME_ID_PATTERN`'ıdır; bu paket oraya bağımlı
  olamaz (döngü). Deseni kopyalamak AC-8b'nin yasakladığı sapma sınıfı olurdu.
- **Platform/theme-sdk/tema destek pencereleri farklı davranır.** (b) ve
  (c) bugün aynı aritmetiği kullanır ama AYRI fonksiyonlardır — girdileri
  ve yaşam döngüleri farklıdır (bkz. `support-window.ts` dosya başı
  "DÜRÜSTLÜK NOTU").
