# @arkesoft/theme-sdk

Bir temanın platformla konuşma **sözleşmesi** — `theme.json` biçimi, ayar
ilkelleri, desteklenen şablon kümesi ve ayar migration zinciri. `ROADMAP.md`
v0.0.9, T-010'da ilk içeriğini kazandı (v0.0.1'deki hâli boş bir iskeletti).

## Sorumluluk sınırı

| Yapar                                                                                                                                                                                                                                                                                                                     | Yapmaz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tema sözleşmesi tipleri (`ThemeManifest`, ayar ilkelleri, şablon/slot tanımı); `theme.json`'ı Zod ile doğrulama ve okunur hata üretme (`validateThemeManifest`, `validateThemeSettings`); `defineTheme()` yazar yardımcısı; ayar migration zinciri sözleşmesi ve çalıştırıcısı; JSON Schema üretimi (saf, nesne döndürür) | I/O · dosya sistemi erişimi · HTTP/ağ çağrısı (`fetch`, Node `http`/`https`) · veritabanı erişimi · **kiracı (tenant) verisine erişim** · **semver KARŞILAŞTIRMASI** (bu `packages/versioning`'in işi — bu paket yalnızca `sdkRange`/`version` alanlarının BİÇİMİNİ doğrular, uyumluluk hesaplamaz) · ayarları kalıcılaştırma veya silme (kalıcılık `apps/api`'nin işi) · sunum/i18n (kullanıcıya dönük çeviri `code` → i18n anahtarı eşlemesiyle UYGULAMA katmanında yapılır, v0.0.21) |

## Neden kapalı bir bağımlılık listesi

`dependencies` alanı **tam olarak** `{ "zod": "catalog:" }` — ne daha az ne
daha fazla. `@arkesoft/errors` **bilerek dahil edilmedi**: `AppError`
`httpStatus` taşır, bu paket ise HTTP'yi hiç bilmez (bu paketin doğrulama
fonksiyonları ayrımlı birleşim döner, bkz. `src/errors.ts` dosya başı
yorumu — CLAUDE.md §4'ten bilinçli bir sapma, gerekçesi orada). Semver
karşılaştırması (`packages/versioning`) de **dahil edilmedi** — bu paket
`sdkRange`/`version` alanlarının yalnızca BİÇİMİNİ doğrular, bir sürümün bir
aralığa UYUP uymadığını hesaplamaz.

`src/__tests__/purity.test.ts` bu iddiayı iki yönden pinler:

1. `src/` üretim kaynaklarında (`__tests__` hariç) Node built-in'leri
   (`node:fs`, `node:http` vb.), `fetch(`, `process.`, `@nestjs`, `express`,
   `@prisma`, `@arkesoft/*` dizgilerinden hiçbiri geçemez (yorum satırları
   hariç — grep kapsamı yalnızca gerçek kod satırlarıdır).
2. `package.json`'daki `dependencies` **tam olarak** `{ zod: 'catalog:' }`
   olmak zorunda.

## Hata ve mesaj sözleşmesi

Kararlı makine sözleşmesi `src/errors.ts`'teki `ThemeContractErrorCode`
(15 kod) — bir kod silinmesi/anlam değişimi **major**, yeni kod eklenmesi
**minor**'dır. `src/messages.ts`'teki `THEME_CONTRACT_MESSAGES` Türkçe
**geliştirici** metni taşır (i18n anahtarı DEĞİL — tüketici tema
geliştiricisidir, metin bir CI logunda/terminalde okunur); mesaj metninin
değişmesi **patch**'tir. `satisfies Record<ThemeContractErrorCode, string>`
bu tablonun eksiksiz olduğunu derleme zamanında zorlar.

## Dosyalar

- `src/errors.ts` — `ThemeContractErrorCode`, `ThemeContractIssue`,
  `ThemeContractResult<T>` (ayrımlı birleşim) ve fırlatan ikizi
  `ThemeContractError`.
- `src/messages.ts` — kod → Türkçe geliştirici metni tablosu.
- `src/paths.ts` — `formatThemeContractPath`: Zod `issue.path` segment
  dizisini okunur bir alan yoluna çevirir (`templates[2].slots[0].id`).
- `src/assert-never.ts` — paket-yerel `assertNever` (platformdaki BEŞİNCİ
  kopya, bilinçli karar — gerekçe dosya başı yorumunda, ROADMAP borç 1583
  ile çatışmaz, onu teyit eder).
- `src/semver-format.ts` — tema sürüm/`sdkRange` biçimi için TEK kaynak
  (`chain.ts` ve `manifest.ts` buradan besleniyor); yalnızca BİÇİM doğrular,
  aralık karşılaştırması yapmaz (`packages/versioning`'in işi).
- `src/json-schema.ts` — `docs/theme-contract.schema.json`'ın **saf** üretici
  fonksiyonu; şema **nesnesi** döndürür, dosya YAZMAZ (I/O `scripts/`'te).
- `src/define-theme.ts` — tema yazarının `theme.config.ts`'inden çağırdığı
  yardımcı; `assertThemeManifest()`'in ince sarmalayıcısı, geçersiz manifestte
  **fırlatır**.
- `src/manifest/` — `manifest.ts` (`ThemeManifest` = `z.strictObject`, bilinmeyen
  anahtarı **REDDEDER**), `templates.ts` (zorunlu şablon kümesi `home`+`404`,
  `templates` bir **DİZİ**), `asset-ref.ts` (`ThemeAssetRef.path` izin listesi +
  512 uzunluk sınırı), `validate-manifest.ts` (`validateThemeManifest()` +
  fırlatan ikizi).
- `src/settings/` — `primitives.ts` (sekiz ayar ilkeli, `z.discriminatedUnion`),
  `keys.ts` (`isAcceptableSettingKey` — anahtar kabul edilebilirliğinin TEK
  kaynağı: dokuz adlı `Object.prototype` kara listesi + biçim deseni + 128
  uzunluk), `schema-from-definitions.ts` (`assertDefinitionsAreAcceptable()`
  ön kontrolünün yaşadığı TEK nokta), `defaults.ts` (`deriveDefaultSettings`),
  `validate-settings.ts` (`validateThemeSettings()` — **SOY ama RAPORLA**,
  `unknownKeys`), `duplicate-key-check.ts` / `duplicate-key-issues.ts` /
  `unsafe-key-scan.ts` / `zod-issue-mapping.ts` — yardımcı modüller.
- `src/migrations/` — `chain.ts` (`validateMigrationChain` — boşluk/tekrar/
  döngü/eksik hedef major), `run.ts` (`migrateThemeSettings` — `migrate()`
  çıktısının hedef şemadan geçmesi, hatalar `{ cause }` ile sarmalanır).
- `src/index.ts` — tek giriş noktası; tüketiciler iç dosya yoluna girmez.
- `scripts/generate-contract-schema.ts` — paketin **TEK I/O noktası**;
  `src/json-schema.ts`'in ürettiği şemayı Prettier uyumlu biçimde
  `docs/theme-contract.schema.json`'a yazar. `src/`'e girmez, `dist/`'e
  derlenmez.

## Bilinen tuzaklar (okumadan önce)

- **`unknownKeys` `"__proto__"` dizesini içerebilir.** `validateThemeSettings`
  bilinmeyen kök anahtarları **olduğu gibi** raporlar (SOY ama RAPORLA,
  yukarı bakın); `"__proto__"` biçimsel olarak geçerli bir JS nesne anahtarı
  olduğu için bu listede görünebilir. SDK'nın kendisi bunu hiçbir yere
  **atamıyor** — ama bu diziyi okuyup başka bir nesneye `unknownKeys[i]`
  ile **atama anahtarı** olarak kullanan bir tüketici (ör. `obj[key] = …`)
  prototip kirliliğine kendi açabilir. `unknownKeys`'i her zaman bir **rapor**
  olarak işleyin, bir atama kaynağı olarak değil.
- **`cause` ayıklama içindir, loglanmaz.** `ThemeContractResult`'ın
  başarısızlık dalındaki `cause` alanı (ör. migration hatasının orijinal
  nesnesi) `Object.defineProperty(…, { enumerable: false })` ile taşınır —
  `JSON.stringify(result)` ona **ulaşmaz** ama doğrudan `result.cause`
  erişimi mümkündür. `apps/api` gibi bir tüketici bu alanı **doğrudan**
  (`logger.error(result.cause)`) loglarsa, ayar değeri gibi hassas içerik
  (ör. `migrate()`'e geçirilen kullanıcı girdisi) log akışına düşebilir.
  `cause`'u yalnızca geliştirici ayıklaması için okuyun; yapılandırılmış log
  kaydına yazmadan önce `@arkesoft/errors` redaction'ından geçirin.
