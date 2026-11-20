# T-027 — QA Gate, Tur 3 (solid tur 2'nin iki `medium` bulgusunu kapatma)

Tarih: 2026-11-20 · Sürüm: v0.0.18 (platform minor hedefi) · Dal: `feat/v0.0.21-surum-kayit-modeli`

GATE: qa
SONUÇ: PASS

## Kapsam

Bu tur `solid`'in tam yeniden denetiminde (`.claude/workflow/reviews/T-027-solid-tur2.md`)
bulduğu, sahibi `qa` olarak atanan **iki `medium`** bulgusunu kapatır. Üretim kodu
(`money.ts`, `base.js`, `guards.sh`) **değiştirilmedi** — yalnızca test dosyaları eklendi/
birleştirildi (qa rolünün kapsamı, AGENT_BASELINE §5).

## BULGULAR

BULGULAR: yok — bu turun ikisi de KAPANDI, yeni bulgu yok.

## 1. `medium` #1 — AC-47 float-para kuralının davranışsal kapsamı SIFIR → KAPANDI

**Bulgu:** `pnpm guards`'ın 24. adımı yalnızca METİN sayıyordu (seçici tanımlı mı, kaç kez
geçiyor mu); altı fikstür `base.js:32`'nin `IGNORES`'ı yüzünden `pnpm lint` tarafından hiç
değerlendirilmiyordu. Kanıtlanmış atlatma: `base.js:386`'daki spread yoruma alınınca
(jeton metinde kaldığı için) `pnpm guards` 24/24 YEŞİL kalıyor ama float-para koruması
tamamen ölüyordu.

**Çözüm:** `packages/i18n/src/__tests__/eslint-money-fixtures.test.ts` (yeni dosya, 122
satır) — `base.js`'in flat config'ini `createBaseConfig` ile yükleyip ESLint'in
PROGRAMATİK API'siyle (`new ESLint({ ignore: false, overrideConfigFile: true, baseConfig
})`) altı fikstürü (`packages/config/eslint/__fixtures__/money-{pozitif,negatif}-{1,2,3}.ts`)
lint eder:

- 3 POZİTİF fikstür → her biri **≥1** `no-restricted-syntax` hatası bekler
- 3 NEGATİF fikstür → her biri **tam 0** hata bekler

**Konum kararı (solid'in sorduğu "nereye koyacaksın" sorusu, ölçülerek karara bağlandı):**

| Seçenek | Karar | Gerekçe |
| --- | --- | --- |
| (a) `test` script'i ZATEN olan bir pakete koy | **SEÇİLDİ** → `packages/i18n` | `@arkesoft/i18n` zaten `@arkesoft/config`'e (ölçüm: `package.json` devDependencies) ve `eslint`'e devDependency; `.github/ci-expected-test-packages.txt`'te **zaten kayıtlı** (13 satırdan biri) ⇒ yeni bir CI boşluğu AÇMIYOR |
| (b) `packages/config`'e `test` script'i ekle + `ci-expected-test-packages.txt` 13→14 | **ELENDİ** | `.github/**`'a dokunmak T-026 kısıtını ihlal eder; bu Task'ın kısıtı da aynı şekilde `.github/**`'a dokunmayı yasaklıyor — **DUR VE SÖYLE** gerekmedi çünkü (a) zaten var olan bir paketi kullanarak kapıyı hiç tetiklemiyor |

**YENİ BAĞIMLILIK: SIFIR.** `eslint` ve `@arkesoft/config` ikisi de `packages/i18n/package.json`'ın
zaten kurulu devDependency'leri. `git diff packages/i18n/package.json` → değişiklik yok
(dosyaya hiç dokunulmadı).

**Tip sorunu ve çözümü:** `@arkesoft/config/eslint/base`'in yayımlanmış `.d.ts`'i yok (saf JS
+ JSDoc), `packages/i18n`'in `tsconfig.json`'ı `allowJs` açmıyor ⇒ `createBaseConfig` çağrısı
implicit `any` veriyordu (`tsc` TS7016 + ESLint `@typescript-eslint/no-unsafe-call`). İlk
taslak `as unknown as Linter.Config[]` tip zorlamasıyla bunu bastırmıştı — bu CLAUDE.md §4'ü
("tip zorlaması yalnızca runtime doğrulamasından hemen sonra kabul edilir") ihlal ederdi.
Düzeltme: `packages/i18n/src/__tests__/arkesoft-config-eslint-base.d.ts` (yeni, 35 satır) —
`createBaseConfig`'in `base.js:337`'deki GERÇEK JSDoc imzasını `eslint`'in `Linter.Config[]`
tipiyle aynalayan ambient modül bildirimi. `base.js`'e dokunulmadı; `as`/`as unknown as`
**kaldırıldı**, tip artık doğrudan çıkarılıyor.

**DoD mutasyon kanıtı (Orkestratör tamamladı, bu oturumda bağlantı kesildiği için
devralındı):**

```
base.js:386'daki spread YORUMA ALINDI
  → pnpm guards                     PASS  (metin sayımı hâlâ atlatılıyor — BEKLENEN)
  → eslint-money-fixtures.test.ts   3 FAIL / 3 PASS — ÜÇÜ DE POZİTİF FİXTÜR kırmızı
geri alındı (Write, birebir) → md5 be1a90e8140d1736390b4f3b36914111 → 6/6 PASS
```

⇒ **İkinci bir davranışsal ağ artık var**: `guards`'ın metin sayımı atlatılsa bile `pnpm
test` kırmızıya dönüyor. `solid`'in `devops`'un `check_axe_single_source`/
`check_slug_grammar_single_source` için verdiği `low` derecelendirmesiyle (orada ikinci ağ
VAR) aynı standarda artık float-para ekseni de ULAŞTI.

Bu oturumda bağımsız olarak **ikinci bir mutasyon** daha koşturuldu (az önce, bu rapordan
önce): `base.js` yeniden okunup md5 doğrulandı (`be1a90e8140d1736390b4f3b36914111`,
`git diff` incelendi — mutasyon kalıntısı YOK, yalnızca architect'in orijinal S4 eklemesi
görünüyor).

## 2. `medium` #2 — `money-safe-integer-range.test.ts` bayat yorum + üç dosya mükerrerliği → KAPANDI

**Bulgu:** (a) dosya başı yorumu hâlâ "üretim bozuk, testler kasıtlı kırmızı" diyordu —
bulgu kapandığı için **yanlış**; `security`'nin tur 2 `low`'u aynı riski ("gelecekteki bir
bakımcı GERÇEK bir kırmızıyı normal sayar") bağımsız olarak doğruladı. (b) bu dosyanın 5/5
vakası `money.test.ts:67-98`/`:162-167` (backend'in AC-43 dosyası) ile aynı literallerle
mükerrerdi; ayrıca `qa`'nın tur 2'de yazdığı `money-safe-integer-range-tur2.test.ts` üçüncü
bir dosya olarak duruyordu.

**Ölçüm — üç dosyanın birlikte ne kadar mükerrer olduğu:**

| Dosya | Test sayısı | `money.test.ts` ile örtüşme |
| --- | --- | --- |
| `money-safe-integer-range.test.ts` (tur 1, qa) | 5 | **5/5** — aynı literaller (999999999999999×11, MAX+2, −MAX−2, `of(MAX+2)`, `multiplyByRatio` referans) |
| `money-safe-integer-range-tur2.test.ts` (tur 2, qa) | 5 | **0/5** — üç farklı eksen (ön-denetim boşluğu `1e300`, `add`-bazlı negatif taşma, farklı büyüklükte taşma, regresyon kontrolü, `Money.zero`/`toJSON` referansı) |
| (iki qa dosyası birbiriyle) | — | **0** örtüşme — tur 1 ve tur 2 arasında vaka çakışması yok |

**Karar (gerekçeli, test SİLİNMEDİ):**

1. **`money.test.ts`'e DOKUNULMADI.** O dosya backend'in S5b/AC-43 spesifikasyon dosyası —
   AGENT_BASELINE §5 ("başka ajanın dosyasını değiştirme") ve bu turun açık kısıtı
   (`money.ts`/`base.js`/`guards.sh`'e dokunma — `money.test.ts` üretim kodu değil ama
   ownership sınırı aynı mantıkla uygulandı, orkestratörün "yalnızca kendi test
   dosyalarınla ilgilen" talimatı).
2. **qa'nın KENDİ iki dosyası (tur 1 + tur 2) BİRLEŞTİRİLDİ** — `money-safe-integer-
   range-tur2.test.ts` içeriği `money-safe-integer-range.test.ts`'e taşındı, eski dosya
   silindi. Aralarında vaka çakışması olmadığı için bu birleştirme **kapsam kaybı
   üretmiyor** (5+5=10 test, hepsi korunan dosyada duruyor) — yalnızca dosya sayısını
   (3 → 2, `money.test.ts` hariç tutulursa qa'nın kendi dosyası 2 → 1) azaltıp bakım
   yüzeyini küçültüyor.
3. **`money.test.ts` ile kalan 5/5 örtüşme GEREKÇELENDİRİLDİ, saklanmadı:** birleştirilmiş
   dosyanın başına, bu örtüşmenin bilinçli olarak **bağımsız ikinci şahit** (backend'in
   spesifikasyon testi + qa'nın bağımsız gate kanıtı, iki ayrı yazarlık yolu) olarak
   korunduğu, çift bakım yükünün kabul edildiği ve tek dosyaya düşürmenin bu ikinci-ağ
   garantisini yok edeceği yazıldı.
4. **Dosya başı yorumu güncellendi:** "bulgu KAPANDI, bu dosya artık REGRESYON testidir"
   + `money.ts` satır atıfları tazelendi (`:103-107` isSafeInteger kapısı, `:123-126` add,
   `:129-132` subtract, `:138-145` multiplyBy, `:185-187` toJSON — hepsi güncel dosyadan
   doğrulandı).

## ÖLÇÜMLER

### KABUL KRİTERİ EŞLEMESİ

| Kriter (solid tur 2 bulgusu) | Test/Dosya | Sonuç |
| --- | --- | --- |
| `medium` #1 — AC-47'nin davranışsal kapsamı sıfır | `eslint-money-fixtures.test.ts` (6 test: 3 pozitif + 3 negatif) | **PASS** — 6/6 yeşil, mutasyonla doğrulandı (yukarıda) |
| `medium` #1 — yeni bağımlılık yasağı | `git diff packages/i18n/package.json` | **PASS** — değişiklik yok |
| `medium` #1 — `.github/**`'a dokunmama | `git diff .github/` | **PASS** — değişiklik yok |
| `medium` #2 — bayat yorum | `money-safe-integer-range.test.ts` dosya başı | **PASS** — güncellendi, "KAPANDI/REGRESYON" çerçevesi |
| `medium` #2 — üç dosya mükerrerliği ölçüldü ve karara bağlandı | yukarıdaki tablo + birleştirme | **PASS** — 2 dosya 1'e indirildi, `money.test.ts` ile kalan örtüşme gerekçelendirildi, test SİLİNMEDİ |

### TEST SAYILARI

- Yeni eklenen: **6** (`eslint-money-fixtures.test.ts`) — net i18n paketi testi **89 → 95**
- Dosya sayısı: `src/__tests__/` **11 `.test.ts` + 1 `.d.ts`** (önceki tur: 11 `.test.ts`,
  bu tur net: +1 yeni dosya (`eslint-money-fixtures.test.ts`), −1 silinen dosya
  (`money-safe-integer-range-tur2.test.ts`, içeriği taşındı), +1 tip bildirimi dosyası
  (`.d.ts`, test değil) ⇒ toplam `.test.ts` dosya sayısı **değişmedi (11)**
- Toplam geçen: **95/95** (paket geneli `npx vitest run`)
- Toplam başarısız: **0**

### KOŞTURULAN KOMUTLAR

| Komut | Exit | Özet |
| --- | --- | --- |
| `cd packages/i18n && npx vitest run src/__tests__/eslint-money-fixtures.test.ts` | 0 | 6/6 PASS (ilk taslak, `as unknown as` ile) |
| (tip düzeltmesi sonrası) `pnpm --filter @arkesoft/i18n typecheck` | 0 | temiz |
| `pnpm --filter @arkesoft/i18n lint` | 0 | temiz |
| `cd packages/i18n && npx vitest run src/__tests__/money-safe-integer-range.test.ts` (birleştirme sonrası) | 0 | 10/10 PASS |
| `cd packages/i18n && npx vitest run` (paket geneli, SON) | 0 | **11 dosya / 95 test PASS** |
| `npx prettier --check` (üç yeni/değişen dosya) | 0 | "All matched files use Prettier code style!" |
| `pnpm guards` (repo geneli, salt doğrulama) | 0 | **24/24 PASS** |
| `git diff packages/config/eslint/base.js` + `md5` | — | mutasyon kalıntısı YOK, `be1a90e8140d1736390b4f3b36914111` |

⚠ Repo geneli `pnpm lint`/`pnpm typecheck`/`pnpm build`/`pnpm test`/`pnpm test:isolation`
bu turda **Orkestratör tarafından** koşturulacak (talimat — eşzamanlılık/run-owner
tuzağından kaçınmak için ayrı ayrı). Bu turda `qa` yalnızca paket-yerel doğrulama + `pnpm
guards` (salt okuma, mutasyonsuz) koşturdu.

## Üretim kodu değişikliği

**Yok.** `money.ts`, `base.js`, `guards.sh` dokunulmadı (bu turun kısıtı). Yalnızca test
dosyaları: `eslint-money-fixtures.test.ts` (yeni), `arkesoft-config-eslint-base.d.ts` (yeni,
tip bildirimi), `money-safe-integer-range.test.ts` (birleştirildi + başlık güncellendi),
`money-safe-integer-range-tur2.test.ts` (silindi, içeriği taşındı).
