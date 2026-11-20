# @arkesoft/i18n

Mesaj kataloğu, hata metni çözümleyicisi, `Money` değer nesnesi ve `Intl` tabanlı
biçimlendiriciler (para, tarih, sayı). `ROADMAP.md` v0.0.18, T-027'de doğdu (ADR-0028).

✅ **Durum (v0.0.18, T-027 tamamlandı — 2026-11-20):** paket **14 üretim dosyası** taşıyor
(bkz. "Dosyalar" aşağıda), `index.ts` tek giriş noktası olarak doluyor. `tr-TR` varsayılan
katalog (35 `errors.*` anahtarı), `Money`, iki yuvarlama modu ve üç biçimlendirici
üretimde. **İçerik çevirisi (`en-US`) ve döviz kuru (`ExchangeRate`) bu sürümde YOK** —
kullanıcı onaylı kapsam daraltması, `v1.5.0`'a ertelendi (ROADMAP v0.0.18 bölümü, ADR-0028).

## Sorumluluk sınırı

| Yapar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Yapmaz                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tr-TR` varsayılan hata mesajı kataloğu (35 anahtar, `errors.*`) · eksik/yetim anahtar tespiti (`catalog-diff.ts`, saf) · değişken ara-değerleme (eksik **ve** fazla değişkende fırlatır) · `Money` değer nesnesi: tamsayı kuruş, para birimi kodu, toplama/çıkarma (uyuşmazlıkta fırlatır, güvenli-tamsayı aralığı dışında fırlatır), tamsayı çarpan, oranla çarpma (yuvarlama modu **zorunlu**, `half-up`/`half-even`) · `SUPPORTED_CURRENCIES` — para birimi kümesinin **tek doğruluk kaynağı** · para/tarih/sayı biçimlendiricileri (`Intl` üzerinden, locale **parametre**, asla sessiz boş dize) | I/O · dosya sistemi erişimi · HTTP/ağ çağrısı · veritabanı erişimi (`@arkesoft/db`, `@prisma/client` **bağımlılık DEĞİL** — AC-49'un drift testi `packages/db`'den `i18n`'e **devDependency**, ters yön yok) · tel sözleşmesi (`@arkesoft/trpc` **bağımlılık DEĞİL**) · kiracı (tenant) verisine erişim · içerik çevirisi (`v1.5.0`'ın kapsamı) · döviz kuru çekme/saklama (`ExchangeRate`, `v1.5.0`) · e-posta içerik kataloğu (`auth.emailVerification` vb. — hâlâ `apps/api/src/auth/mail/messages.ts`'te, bu pakete TAŞINMADI, vade belirtilmedi) · app microcopy'si (≈954 satır admin/superadmin/storefront metni — bu sürümün kataloğu yalnızca `errors.*`'tır, R4 kullanıcı kararı) |

## Bağımlılık yönü

`zod ← @arkesoft/errors ← @arkesoft/i18n ← {apps/admin, apps/superadmin}`.
`packages/i18n`'in tek `@arkesoft/*` bağımlılığı `@arkesoft/errors`'tır (`package.json`
`dependencies = {zod, @arkesoft/errors}`, tam olarak bu ikisi) — kod ↔ anahtar defteri
(`ErrorMessageKey`, `error-message-keys.ts`) **orada** tutulur (ADR-0028 Karar 2:
`packages/errors` yalnızca `zod`'a bağımlı kalmak zorunda olduğu için defter `i18n`'de
olamaz — `errors ↔ i18n` döngüsü oluşurdu).

`apps/storefront` bu pakete **bağımlı değildir** (A-T27-5): onaylı kapsam yalnızca
`errors.*` anahtarlarını kapsıyor ve storefront bu anahtarı hiçbir yerde kullanıcıya
render etmiyor.

`src/__tests__/purity.test.ts` bu sınırı kod satırları üzerinde (yorumlar hariç) denetler:
Node built-in'leri, `process.`, `fetch(`, `@nestjs`, `express`, `@prisma` ve
`@arkesoft/errors` **dışındaki** her `@arkesoft/*` paketi yasaklıdır (yapısal emsal:
`packages/theme-sdk/src/__tests__/purity.test.ts`). İkinci test `package.json`'ın
`dependencies`'ini **tam olarak** `{zod, @arkesoft/errors}`'a pinler.

⚠ **Bilinen kör nokta (borç, vade v0.4.0):** saflık süzgeci `from`/`require(`/`import(`
gerektiren üç desenle çalışır; bağlayıcısız yan-etki importu (`import '@arkesoft/db'`)
bu desenlerden kaçar. `@arkesoft/db`/`@arkesoft/trpc` için `pnpm`'in kendi çözümlemesi
(bu paketin `node_modules`'ında symlink'leri yok) bunu pratikte kapatır, ama
`@arkesoft/config` **devDependency olarak symlink'li** ve ikinci test yalnızca
`dependencies`'i pinlediği için o paket iki katmandan da kaçar — ayrıntı: ROADMAP Teknik
Borç → "v0.0.18 kaynaklı borçlar".

## Neden `packages/db`'ye bağımlılık yok ama `Currency` tablosu var

`Currency` platform tablosu (`code`, `minorUnit`) `packages/db`'de yaşar ve satırları
`SUPPORTED_CURRENCIES`'in **işletimsel alt kümesidir** — ters yön değil. `packages/db` bu
pakete **devDependency** olarak bağımlıdır (yalnızca drift testi için,
`currency-i18n-consistency.test.ts`, `packages/db/src/__tests__/`); üretim bağımlılık
grafiği değişmez. İki liste kaçınılmazdır (migration SQL TypeScript modülü import
edemez); iki yönlü drift testi onları senkron tutar (kod varlığı + `minor_unit` eşitliği

- `['TRY']` pini + negatif kanıt).

## Dosyalar (üretim, 14)

- `locale.ts` — `DEFAULT_LOCALE`, `localeSchema` (BCP-47 basit biçim, `tr-TR`).
- `catalog-types.ts` — `CatalogBundle`, `MessageCatalog` tipleri (değer taşımaz).
- `catalog-diff.ts` — saf `diffCatalogAgainstKeys()`; AC-45'in negatif kanıt yüzeyi, hiçbir
  şey import etmez.
- `interpolate.ts` — `formatMessage()`; eksik **ve** fazla değişkende fırlatır. ⚠ İç içe
  süslü parantez (`{{name}}`) davranışı belgelenmemiş (üretim tüketicisi 0, borç).
- `message-resolver.ts` — `createMessageResolver<L>(bundle, defaultLocale): (locale: L) =>
MessageResolver`; curry'lenmiş (locale önceden bağlanır). `t(key): string` **total**
  (kapalı küme), `resolveMessage(key: string): string | null` **açık-dünya** (telden gelen
  anahtar için, henüz üretim tüketicisi yok).
- `tr-tr-errors.ts` — `TR_TR_ERROR_MESSAGES`, 35 anahtar,
  `satisfies Record<ErrorMessageKey, string>` (eksik **ve** fazla anahtar `tsc`'yi kırar).
- `format-date.ts` / `format-number.ts` / `format-money.ts` — `Intl` tabanlı
  biçimlendiriciler; `locale` her zaman **parametre**, varsayılanı `DEFAULT_LOCALE`.
- `currencies.ts` — `SUPPORTED_CURRENCIES` (**tek doğruluk kaynağı**),
  `SupportedCurrencyCode`, `getMinorUnit()`.
- `rounding.ts` — `divideWithRounding()`, `RoundingMode` (`'half-up' | 'half-even'`).
- `money-errors.ts` — `FractionalMinorUnitError`, `CurrencyMismatchError` (ikisi de
  `AppError` alt sınıfı, `errors.internal.unknown`'a eşlenir — programcı hatası).
- `money.ts` — `Money` değer nesnesi (`BigInt` tabanlı, %100 tamsayı; `toFixed`/
  `parseFloat`/ondalık literal **0 eşleşme**, mekanik olarak denetlenir).
- `index.ts` — tek giriş noktası; tüketiciler iç dosya yoluna girmez.

⚠⚠ **`src/` DÜZ TUTULUR, alt dizin AÇILMAZ.** `src/__tests__/purity.test.ts`'in dosya
taraması (`productionSourceFiles()`) `readdirSync`'i **`recursive` olmadan** çağırır
(emsal: `packages/versioning`, `packages/tenancy` — bu depoda **üç kez** ölçülmüş bir
sınıf). Alt dizin açılırsa tarama üretim dosyalarını **sessizce** atlar — "0 dosya
taradım, 0 ihlal buldum" sahte yeşili. Test `expect(files.length).toBeGreaterThan(0)` ile
bu riske karşı kısmen korunur (dizin tamamen boşalırsa yakalar) ama **alt dizine taşınan**
dosyaları yakalamaz. Açılacaksa (tetik: `v1.5.0`'ın ikinci locale **içeriği**, bugün 14
dosyanın tamamı tek `src/` altında ve bu deponun en büyük düz `src`'si) `{recursive:
true}`'ya geçiş **aynı değişiklikte** yapılmak zorunda (ROADMAP Teknik Borç, vade v1.5.0).

## Testler

9 test dosyası (`src/__tests__/`), 95 test (S5a 38 + S5b 35 + gate turları +22 — bkz. T-027
üretim logları). `packages/i18n` kapsamlı koşum: `cd packages/i18n && npx vitest run`
(⚠ `pnpm --filter @arkesoft/i18n test -- <desen>` bu depoda filtre UYGULAMAZ,
`AGENT_BASELINE.md` §6).
