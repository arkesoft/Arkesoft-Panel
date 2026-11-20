# T-027 — `solid` gate raporu, tur 1

Tarih: 2026-11-20
Sürüm: ROADMAP v0.0.18 (platform `0.11.0 → 0.12.0`, `minor`)
Task: `.claude/workflow/tasks/T-027.md`

```
GATE: solid
SONUÇ: FAIL
```

Gerekçe (AGENT_BASELINE §4): `critical`/`high` **yok**, ama **3 `medium`** var ⇒ kural
gereği FAIL + düzeltme turu. `low` bulgular düzeltme turu açmaz, borç tablosuna gider.

---

## BULGULAR

### [SEV: medium] `packages/i18n/src/money.ts:79-84` (ve `:98-107`, `:113-120`)

`Money.of` yalnızca `Number.isInteger` denetler; **güvenli tamsayı aralığını denetlemez**.
Taşma koruması yalnızca `multiplyByRatio` yolunda var (`:55-62` + `:139`,
`money.test.ts:129-134` ile test edilmiş) — `add`/`subtract`/`multiplyBy` yollarında **yok**.
⚠ Dosya başı yorumu (`:12-13`) sınıfın değişmezini *"güvenli tamsayı aralığında TAMSAYI
kuruş"* olarak ilan ediyor; kod bu değişmezi **zorlamıyor** ⇒ yorum ile kod çelişiyor.

Somut senaryo (aritmetik, çalıştırılmadı — IEEE-754 davranışı):

```
Money.of(Number.MAX_SAFE_INTEGER, 'TRY').add(Money.of(2, 'TRY')).amountMinor
  → 9007199254740992      (doğrusu 9007199254740993)
  → Number.isInteger(…) === true ⇒ Money.of KABUL EDER, hiçbir hata FIRLAMAZ
  ⇒ bir kuruş SESSİZCE kaybolur — tam olarak `Money`'nin var olma sebebi olan hata sınıfı
```

Aynı delik `multiplyBy`'da da var: `Money.of(MAX_SAFE_INTEGER,'TRY').multiplyBy(2)` sessizce
kabul edilir, `multiplyByRatio({numerator:2,denominator:1})` ise **fırlatır** — aynı matematik,
iki farklı sonuç (asimetri).

**Önerilen düzeltme:** `Money.of`'ta `Number.isInteger` → `Number.isSafeInteger` (tek nokta —
`add`/`subtract`/`multiplyBy`/`multiplyByRatio` dördü de `Money.of`'tan geçiyor), `multiplyBy`
içindeki çarpan denetimi de `isSafeInteger`'a çekilir, `FractionalMinorUnitError`'ın gövdesine
ikinci bir sebep eklenmez (ayrı bir `UnsafeMinorUnitError` veya mevcut `Error` yeterli; defter
anahtarı değişmez).
⚠ **Güvenlik/monotonluk kaydı:** bu sıkılaştırma **monoton** — yalnızca yeni vakaları reddeder,
hiçbir vakayı gevşetmez. Ama **davranış değişikliğidir**: bugün sessizce yanlış değer üreten
çağrı yarın fırlatır. Bugün üretim tüketicisi **0** olduğu için kırılacak çağıran yok (ölçüldü).

**Sorumlu ajan:** `backend` (S5b)

---

### [SEV: medium] `scripts/guards.sh:1436-1446`

24. adımın **alt kontrol 3a**'sı yalnızca `MONEY_NAME_SOURCE[[:space:]]*=` **atamasının**
tekliğini sayıyor. Oysa alt kontrol 2 tam olarak bunun yetmediğini keşfedip (`:1381-1385`)
**seçiciyi taşıyan değişkenin geçiş sayısını** (tanım + kural dizisindeki kullanım = tam 2)
sayacak şekilde yeniden tasarlanmıştı. Bu ders **kardeş kontrole uygulanmamış**.

Ölçüm (`packages/config/eslint/base.js`):

| Değişken | Tanım | Kural dizisinde kullanım | `guards` pini |
| --- | --- | --- | --- |
| `userMessageKeyLiteralSelector` | `:155` | `:385` | ✅ tam 2 (alt kontrol 2) |
| `moneyRestrictedSyntaxSelectors` | `:190` | `:386` | ❌ **pin YOK** |

Somut senaryo: `base.js:386`'daki `...moneyRestrictedSyntaxSelectors` satırı silinir (tanım
`:190`'da kalır, `MONEY_NAME_SOURCE` tek kopya kalır) ⇒ `pnpm lint` **yeşil**, `pnpm guards`
**24/24 yeşil**, float-para AST yasağı (AC-47) **tamamen kaybolmuş** — sahte yeşil. S8'in kendi
teşhisinin birebir aynısı.

**Önerilen düzeltme:** alt kontrol 3a'ya `moneyRestrictedSyntaxSelectors` için de geçiş sayısı
pini (tam 2) eklenir; `MONEY_NAME_SOURCE` ataması pini korunur. ⚠ `rawSqlRestrictedSyntaxSelectors`
için aynı pin **kurulamaz** (3 geçişi var: `:126`, `:254`, `:384`) — sayı değeri her değişken için
ayrı ölçülmeli, kopyala-yapıştır yapılmamalı.
⚠ **Monotonluk:** yeni kontrol yalnızca başarısızlık vakası ekler, hiçbir şeyi gevşetmez.

**Sorumlu ajan:** `devops` (S8)

---

### [SEV: medium] `apps/admin/src/messages/messages.ts:104-105,134-135,138,145-146` ║ `apps/superadmin/src/messages/messages.ts:81-82,85`

Merdivenin 3. basamağı (`admin:251-253`, `superadmin:190-192`) 4. basamaktan **ÖNCE**
çalışıyor; `isRegisteredPlatformCode` → `Object.hasOwn(ERROR_MESSAGE_KEYS, code)`. Üç kod
**iki deftere de** kayıtlı ⇒ 4. basamak o kodlar için **hiç çalışmıyor**:

| Kod | `ERROR_MESSAGE_KEYS` | admin `ERROR_MESSAGES` | superadmin `ERROR_MESSAGES` | 4. basamak |
| --- | --- | --- | --- | --- |
| `EMAIL_NOT_VERIFIED` | `:112` ✅ | `:104-105` | — | **erişilemez** |
| `ACCOUNT_TEMPORARILY_LOCKED` | `:107` ✅ | `:134-135` | `:81-82` | **erişilemez** |
| `INVALID_PASSWORD` | `:113` ✅ | `:138` | `:85` | **erişilemez** |

Ölçüm: üretimde `resolveErrorMessage`'ı çağıran **tek** yer merdivenin 4. basamağı
(`admin:711`, `superadmin:356`) — `grep` ile doğrulandı, başka üretim çağrısı yok
(`auth-rest.ts:54` yalnızca yorum). ⇒ bu beş satır **ölü metin**, ama aynı zamanda
`packages/i18n/src/tr-tr-errors.ts:48-50`'deki metinlerin **birebir ikinci kopyası** ve
**hiçbir mekanik kapı ikisini eşit tutmuyor** (aradım: `emailNotVerified|invalidPassword|
accountTemporarilyLocked` için panel testlerinde karşılaştırma **yok**).

Somut senaryo: `ux` ileride `'Şifreniz doğrulanamadı. Tekrar deneyin.'` metnini değiştirir ve
yalnızca `tr-tr-errors.ts`'i güncellerse — `apps/admin/.../messages.ts:138` **bayat kalır**,
`messages.test.ts:44-47` (yalnızca `length > 0`) **yeşil geçer**, `typecheck` **yeşil geçer**,
ve sonraki okuyucu aynı kod için iki farklı metin görüp kullanıcının hangisini gördüğünü
**bilemez**. Bu, bu sürümün kapattığını ilan ettiği defektin (*"ELLE TUTULAN bir AYNA; otomatik
çapraz kontrol MÜMKÜN DEĞİL"*, M7) o üç kod için **kapanmadığı** anlamına gelir.

Ek olarak **bayat yorum**: `admin/.../messages.ts:145-146` *"`retryAfterSeconds` `null` ise
çağıran `ERROR_MESSAGES.ACCOUNT_TEMPORARILY_LOCKED`'ın … metnini kullanmalı"* diyor; gerçek
çağıran (`TwoFactorChallengeForm.tsx:61-64`) o dalda `resolvePanelErrorMessage`'a gidiyor ve
metin artık **i18n kataloğundan** geliyor. Yorum, artık alınmayan bir yolu anlatıyor.

**Önerilen düzeltme (iki seçenek — biri monoton değil, saklanmıyor):**

- **(b), ÖNERİLEN, monoton:** iki panele de bir test eklenir — defterde **de** kayıtlı her
  `PanelErrorCode` için `ERROR_MESSAGES[code] === TR_TR_ERROR_MESSAGES[ERROR_MESSAGE_KEYS[code]]`.
  Kesişim kümesi koddan türetilir (elle liste yazılmaz) ⇒ dördüncü kod eklenirse kendiliğinden
  kapsanır. Hiçbir vakayı gevşetmez, yalnızca drift'i yakalar. `:145-146` yorumu düzeltilir.
- **(a), ÖNERİLMEZ:** üç kodu `PANEL_ERROR_CODES`/`ERROR_MESSAGES`'tan silmek. ⚠ **Monoton
  DEĞİL:** panelin ikinci (sağlayıcı) tablosunu daraltır; merdivenin sırası ileride değişirse
  (ör. 4. basamak 3.'nün önüne alınırsa) bu kodlar **jenerik mesaja düşer** — bugün olmayan bir
  gerileme yolu açar. Ayrıca `EMAIL_NOT_VERIFIED`'ın "iki yoldan gelebiliyor" ölçümü
  (`messages.ts:39-43`) kayıtsız kalır.

**Sorumlu ajan:** `frontend` (S7)

---

## Teknik borç satırları (`low` — düzeltme turu AÇMAZ, `docs`/S9 kopyalar)

- `[low] packages/i18n/src/message-resolver.ts:32,82-85 — açık dünya "resolveMessage"ın ÜRETİM tüketicisi 0 (dört üretim çağrısı da ".t()": admin:707,709 · superadmin:352,354); ayrıca istenen katalogdaki boş dize ("") "undefined" olmadığı için geri düşmez ve "" DÖNER — AC-44'ün "asla sessiz boş dize" garantisi çözümleyicide değil katalog testinde (tr-tr-errors.test.ts:26-32) yaşıyor. İkinci locale içeriği geldiğinde eksik çeviri "" yazılırsa kullanıcı BOŞ hata mesajı görür. Öneri: lookupInCatalog boş dizeyi "yok" sayar. Sorumlu backend, vade v1.5.0.`
- `[low] packages/i18n/src/money.ts:91 — "eslint-disable-next-line @typescript-eslint/no-unnecessary-condition" için hatırlatıcı mekanik kapı YOK, ama ÖLÇÜLDÜ: kurulabilir. packages/i18n/src/__tests__/ içinde currencies testi hiç yok; beş satırlık bir pin (expect(Object.keys(SUPPORTED_CURRENCIES)).toEqual(['TRY']) + "kırılırsa money.ts:91'deki disable KALDIRILMALI" yorumu) ikinci para birimi eklendiği an kırmızı verir. ⇒ bu borç KAÇINILMAZ değil. Sorumlu backend, vade v0.4.0 (ikinci para biriminden önce).`
- `[low] packages/i18n/src/format-money.ts:26 — minör→majör float bölme. KARAR: §2/§10-9 İHLALİ DEĞİL, meşru sunum sınırı (sonuç Money'e geri yazılmıyor, aritmetiğe girmiyor, ondalık basamak getMinorUnit'ten geliyor, yorum doğru). Ama float'sız yol VAR: Intl.NumberFormat.prototype.format ondalık DİZE kabul eder (Intl NumberFormat v3) ⇒ kuruş tamsayısından dize kurulabilir. 2^53 kuruşun üzerinde gösterim sessizce yanlışlaşır (medium 1 bugün bu değerlere izin veriyor). Sorumlu backend, vade v0.4.0.`
- `[low] packages/config/eslint/base.js:180-181 ↔ packages/db/src/__tests__/float-money-ban.test.ts:45-46 — aynı olgunun (para adı) İKİ ayrı kelime kümesi. İki SABİT olmasının gerekçesi yazılı (.js konfigürasyonu .ts'ten import edilemez) ama ÜYELİK FARKI gerekçesiz: ESLint tarafı standalone "tax|discount|refund|payout|revenue" kaçırıyor (ör. "const tax = 0.18" lint'ten geçer), db tarafı "salary|payment" kaçırıyor. ("subtotal" ESLint'te YAKALANIR — "total" alt dizesi.) Öneri: iki kümeyi eşitle + birinin diğerini kapsadığını doğrulayan test. Sorumlu devops, vade v0.4.0.`
- `[low] packages/i18n/src/locale.ts:41 — "Locale" tipi z.infer<ZodString> ⇒ fiilen "string"; FormatDateOptions/FormatMoneyOptions/FormatNumberOptions'ın "locale" alanları kapalı bir küme GİBİ görünüp her dizeyi kabul ediyor (geçersiz etiket Intl'de RangeError üretir). createMessageResolver'ın "L extends string" jeneriği ise AYRI bir locale kavramı — ikisi tip düzeyinde bağlı değil. Sorumlu backend, vade v1.5.0 (kiracı bazlı dil).`
- `[low] packages/i18n/src/money-errors.ts:43 — CurrencyMismatchError(left: string, right: string): SupportedCurrencyCode mevcutken "string"e genişletilmiş; "left"/"right" CLAUDE.md §4'ün belirsiz ad yasağına yakın. Öneri: (expected, received) adları + SupportedCurrencyCode tipi. Sorumlu backend, vade v0.4.0.`
- `[low] apps/admin/src/messages/messages.ts:230-235,706-709 ║ apps/superadmin/src/messages/messages.ts:169-174,351-354 — "wireMessageKey" ve "registryMessageKey" dalları BİREBİR aynı ifadeyi döndürüyor ve classifyErrorResolutionStep dışa açılmadığı için ayrım hiçbir testten GÖZLENEMEZ. Belgeleme değeri gerçek (hangi basamak ateşlendi); KISS açısından iki dal tek dalda birleşebilir. Sorumlu frontend, vade: fırsat doğduğunda.`
- `[low] packages/i18n/src/__tests__/purity.test.ts:64-66 — Orkestratörün dar fail-open bulgusu TEYİT EDİLDİ: üç desen de "from"/"require("/"import(" gerektiriyor ⇒ yan etkili "import '@arkesoft/db'" (from'suz) kaçar. Pratikte ikinci test (:90-106, dependencies'i {zod,@arkesoft/errors}'a pinliyor) kapatıyor — katmanlı savunma gerçek. Öneri: /^\s*import\s+['"]@arkesoft\/(?!errors['"])/ dördüncü desen. Sorumlu devops, vade: fırsat doğduğunda.`
- `[low] packages/i18n/src/ — 14 üretim dosyası TEK dizinde; deponun mevcut düz paketleri 4-5 dosya (tenancy 4, versioning 5, errors 5) ⇒ bu, repodaki EN BÜYÜK düz src'si (yaklaşık 3x). Bugün kabul edilebilir ve alt dizin açmak purity testinin readdirSync'ini {recursive:true}'ya çevirmeyi AYNI değişiklikte zorunlu kılar (architect'in bağlayıcı kısıtı). Tetik koşulu: ikinci locale İÇERİĞİ (v1.5.0) locale başına katalog dosyası ekleyecek ⇒ o değişiklikte src/catalog + src/money alt dizinleri VE {recursive:true} birlikte gelmeli. Sorumlu backend, vade v1.5.0.`

---

## Temiz ölçülen eksenler (PASS — neyi ölçtüm)

| Eksen | Ölçüm | Sonuç |
| --- | --- | --- |
| Bağımlılık yönü / döngü | `packages/errors/package.json:25-27` deps = `{zod}` **tek**, iç paket **yok** · `packages/i18n/package.json:25-28` deps = `{zod, @arkesoft/errors}` · `db → i18n` yalnızca **devDependency** + yalnızca `__tests__` import ediyor | ⭐ `zod ← errors ← i18n ← {admin, superadmin}` **döngü ÜRETİLEMEZ** — `errors` hiçbir iç pakete bağlı değil, teyit edildi |
| Katman ihlali | `i18n` saflık testi: node builtin / `process.` / `fetch(` / `@nestjs` / `express` / `@prisma` / `@arkesoft/*` (errors hariç, negatif lookahead) → **0** · `packages/db`'ye iş mantığı **girmedi** (`Currency` düz tablo, okuyucu yok) · `packages/ui` **dokunulmadı** · paneller veri çekmiyor | İhlal **yok** |
| `any` / `@ts-ignore` | `packages/i18n/src` + `apps/*/src/errors` taraması → `any` **0**, `@ts-ignore` **0**, `@ts-expect-error` **0** | Temiz |
| `as` zorlama | Üretimde **0** · testte `'USD' as never` ×4 (`money.test.ts:45,51,151,157`) — emsal `theme-sdk/.../assert-never.test.ts`, imkânsız durumu kurup çalışma zamanı guard'ını kanıtlamak için; **kabul edilebilir** | Temiz |
| Hata yönetimi deseni | `Money` hataları `AppError`'dan türüyor, anahtar defterden okunuyor (`money-errors.ts:31,47`), `catch {}` **0**, hata `null`'a çevrilmiyor; `createMessageResolver` yapılandırma hatasında **kurulum anında** fırlıyor (`:61-63`, testi `:85-89`) | Desene uygun |
| "Sıfır assertion ile yeşil" riski | 5 döngü/`map` yeri: `purity.test.ts:76,79` → `expect(files.length).toBeGreaterThan(0)` **var** (`:72`) · `tr-tr-errors.test.ts:35` → aynı nesne için ayrı `toHaveLength(35)` pini **var** · `currency-i18n-consistency.test.ts` → `seedRows.length > 0` (`:125`) + `['TRY']` pini (`:141`) · `float-money-ban.test.ts:132` → `migrations.length > 0` · panellerin döngüleri `PANEL_ERROR_CODES` üzerinde ve o tuple `toEqual([…9 kod])` ile pinli | ROADMAP'te kayıtlı desen **yeniden üretilmemiş** |
| İki panelin simetrisi | Merdiven, `classifyErrorResolutionStep` sırası, `switch` + `assertNever`, `isRegisteredPlatformCode`, `parseMessageKey`, zarf sırası **birebir aynı**. Üç fark, üçü de ölçülmüş gerekçeli: (1) `fields` kanalı yalnızca admin (superadmin'in girdili tRPC prosedürü yok), (2) `EMAIL_NOT_VERIFIED` yalnızca admin'in sağlayıcı tablosunda (bu panel e-posta doğrulama akışını koşmuyor), (3) jenerik başlık metinleri farklı (**bu sürümden önce de farklı**, kapsam dışı). Birinde olup diğerinde eksik **merdiven parçası yok** | `po`'nun "tek yazar" kararı **işe yaramış** |
| Exhaustiveness | `ErrorResolutionStep` 5 üye, `switch` 5 `case` + `assertNever` default (admin `:703-716`, superadmin `:348-361`) · `RoundingMode` 2 üye + `assertNeverRoundingMode` (`rounding.ts:61-71`) | Exhaustive |
| `as`'siz daraltma | `isRegisteredPlatformCode` → `Object.hasOwn` + type guard; `as` **yok** (emsal `registry.ts`'in `isThemeRegistryKey`'i) | ⭐ İstenen desen |
| Curry kararı (`createMessageResolver`) | **Haklı, bulgu değil.** İki üretim tüketicisi de modül seviyesinde **bir kez** bağlıyor (`admin:214-217`, `superadmin:153-156`) ⇒ `t`/`resolveMessage` imzaları locale taşımıyor, çağrı yerleri (4) temiz. ⚠ Dürüst kayıt: ikisi de **hemen** `DEFAULT_LOCALE` ile çağırıyor ⇒ kısmi uygulamanın faydası **bugün realize edilmiyor**, "locale parametre" iddiası yalnızca testlerle kanıtlı (`message-resolver.test.ts:36-41,64-69`). Tek fazladan iç içe seviye, v1.5.0'da gerçek tüketici kazanacak | Kabul |
| TS tuzağı çözümü (`defaultCatalog` yeniden atama) | `message-resolver.ts:59-71` — `maybeDefaultCatalog` → açık tipli `defaultCatalog`; adlandırma niyeti söylüyor, gerekçe yorumda. Alternatifler (parametre geçirme, `!` ile zorlama) daha kötü. **Gizli tuzak değil** | Kabul |
| `resolveMessage` ║ `t` ikiliği | Haklı: iki **farklı tip sözleşmesi** (telden gelen açık dünya ↔ derleme zamanı kapalı küme). Gereksiz ikilik değil — ama açık dünya yarısının üretim tüketicisi **0** (yukarıda `low`) | Kabul |
| `index.ts` barrel tutarlılığı | S5a'nın 13 export'u + S5b'nin 13 export'u; her modül `export { değer }` + `export type { tip }` çiftiyle, alfabetik içi tutarlı, iç dosya yolu sızdırmıyor. S5b yukarısını **değiştirmemiş** (yorum `:30-31` sözünü tutmuş) | Tutarlı |
| Gerçek tekrar taraması | `MONEY_NAME_SOURCE`/`MONEY_FIELD_NAME_PATTERN` (ayrı eksenler, `low`) · panel metinleri (medium 3) · `formatAccountTemporarilyLockedMessage` iki panelde kopya (**bu sürümden önce de öyleydi, kapsam dışı**) · `extractCurrencySeedRows`/`readMigrationSet` → mevcut ayrıştırıcı **yeniden kullanılmış**, yeni dosya okuma mekanizması icat edilmemiş · `catalog-diff.ts` **sıfır import** | Yüzeysel benzerlik işaretlenmedi |
| Ölü kod | `Money`, `formatMoney`, `formatNumber`, `divideWithRounding`, `getMinorUnit`, `supportedCurrencyCodeSchema`, `localeSchema`, `formatMessage`'ın **üretim tüketicisi 0** — ama bu, **kullanıcı onaylı kapsamın kendisi** (ROADMAP v0.0.18 altyapı sürümü; `Money`'nin ilk tüketicisi v0.4.0, A-T27-4). Yorumlarda açıkça yazılı, gizlenmemiş ⇒ **bulgu değil** | Kabul |
| Yorum kalitesi | Yorumlar *neden*i anlatıyor, Türkçe, ölçüm/satır referansı taşıyor. **Tek bayat yorum** bulundu: `admin/.../messages.ts:145-146` (medium 3'ün içinde) | Bir istisna dışında temiz |
| İsimlendirme (CLAUDE.md §4) | 14 i18n dosyası **kebab-case** · tipler PascalCase · sabitler SCREAMING_SNAKE_CASE · hata kodları SCREAMING_SNAKE_CASE (`FRACTIONAL_MINOR_UNIT`, `CURRENCY_MISMATCH`) · boolean yok (type guard'lar `is…` öneki taşıyor) · belirsiz ad (`data`/`temp`/`handle`/`process`) **0** — tek yakın vaka `left`/`right` (`low`) | Uyumlu |

## ÖLÇÜMLER

- **İncelenen dosya: 28** — `packages/i18n/src` 14 üretim + 4 test · `packages/errors/src/error-message-keys.ts` · `apps/{admin,superadmin}/src/errors/{panel-error,normalize-panel-error}.ts` (4) · `apps/{admin,superadmin}/src/messages/messages.ts` (2) · `apps/admin/src/__tests__/messages.test.ts` · `apps/superadmin/src/lib/format-platform-date.ts` · `packages/db/src/__tests__/{currency-i18n-consistency,float-money-ban}.test.ts` (2, + `tenancy.ts`/`schema.prisma` ilgili bölümleri) · `packages/config/eslint/base.js` · `scripts/guards.sh` 24. adım
- **`any` sayısı: 0** · `@ts-ignore`: 0 · `@ts-expect-error`: 0 · üretimde `as` zorlama: 0 (testte `as never` ×4, emsalli) · `eslint-disable`: **1** (`money.ts:91`, gerekçeli, `low` borç satırı var)
- **En büyük fonksiyon: 26 satır** — `normalizePanelError` (`apps/admin/src/errors/normalize-panel-error.ts:122-172`, gövde ~50 satır ama yorum dahil; yorumsuz kod 26). İkinci: `divideWithRounding` (`rounding.ts:36-75`, 29 satır). En büyük dosya: `apps/admin/src/messages/messages.ts` **718 satır** (çoğu katalog verisi + yorum)
- Yeni testler: `packages/i18n` 9 dosya · `packages/db`'nin 2 yeni dosyası · panellerin 2 güncel test dosyası — **hiçbirinde** "döngü döndü mü" boşluğu yok (yukarıdaki tabloda tek tek)
- Komut çalıştırılmadı (`Bash` aracım yok) — tüm ölçümler `Read`/`Grep`/`Glob` ile, `path` her çağrıda **açıkça** verildi (AGENT_BASELINE §4 ders 4)

⚠ Bu rapor dosyası `prettier --write` ile **biçimlendirilmedi** — `solid`'in `Bash` aracı yok;
AGENT_BASELINE §5 gereği biçimlendirmeyi **Orkestratör** kapatır.
