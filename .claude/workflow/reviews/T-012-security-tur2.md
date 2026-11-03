# T-012 · security gate · tur 2 (DAR kapsam)

- **Tarih:** 2026-11-03
- **Sürüm:** v0.0.10
- **Kapsam:** DAR — yalnızca tur 1'de yazdığım `medium`'un kapanışı (İŞ 1) + `ThemeResolutionError`→`AppError` dönüşümünün güvenlik etkisi (İŞ 2). Yeni tarama yapılmadı.

```
GATE: security
SONUÇ: PASS
```

---

## Karar özeti

| Kalem                                           | Sonuç                                                       |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Tur 1 `medium` (`theme-css.ts:80` dengesiz tırnak) | **KAPANDI** — 59 vektör ölçüldü, karşı örnek 0              |
| İŞ 2 — `AppError` dönüşümü madde 12'yi bozdu mu | **BOZMADI** — ölçüldü, test pini hâlâ yeşil                 |
| FIX 1'in getirdiği yeni `medium`+               | **YOK** → FAIL koşulu oluşmadı                              |
| Yeni bulgu                                      | 1 × `low` (ileriye dönük, fail-closed yönünde)              |

---

## İŞ 1 · Tur 1 `medium`'unun kapanışı → **KAPANDI**

### md 1 — "Girdiden tırnak ASLA kopyalanmıyor" iddiası GERÇEKTEN doğru mu? → **DOĞRU (kaynak izlendi)**

`frontend`'in iddiasına güvenmedim, yolu uçtan uca izledim:

1. `parseFontFamilyToken` (`theme-css.ts:162-178`) **iki** dönüş yolu taşır, üçüncüsü yok:
   - **Tırnaklı yol:** `QUOTED_FONT_FAMILY_SHELL_PATTERN` = `/^(["'])([^"']*)\1$/` → dönen değer
     **grup 2**'dir ve grubun gövdesi `[^"']*`'tır, yani **yapı gereği** tırnak içeremez.
   - **Çıplak yol:** `BARE_FONT_FAMILY_PATTERN` = `/^-?[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/` →
     izin kümesi harf/rakam/tire; tırnak **alfabede yok**.
2. ⚠ Kritik yapısal ayrıntı: `:165-173` **`else if`** kullanıyor. Tırnaklı kabuk EŞLEŞİP iç içerik
   doğrulamayı GEÇEMEZSE akış çıplak yola **düşmez**, doğrudan `throw`'a gider. Yani "tırnakla
   sarıp iç doğrulamayı kaçırma" biçiminde bir **atlatma yolu yok**.
3. `formatFontFamily` (`:181-183`) tırnağı **girdiden kopyalamıyor**, `` `"${family}"` `` ile
   kendisi **ekliyor**; `family` yukarıdaki iki yoldan geldiği için tırnak/ters eğik çizgi/kontrol
   karakteri **içermiyor** → üretilen dize her zaman **dengeli**.
4. `toSafeFontValue` (`:192-198`) her belirteci tek tek `parseFontFamilyToken`'dan geçirip
   `', '` ile birleştiriyor — birleştirici de üreteçten geliyor, girdiden değil.
5. `toDeclarationLine` (`:266-268`) `--${name}:${value};` kuruyor; `name` zaten
   `CSS_VARIABLE_NAME_PATTERN`'den geçmiş.

**Sonuç:** tırnak karakterinin çıktıya ulaşabileceği **hiçbir yol bulamadım**. İddia yapısal
olarak doğru.

### md 2 — Tur 1'in DÖRT girdisi → **4/4 RED**

| Vektör      | Tur 1 sonucu | Tur 2 sonucu (ölçüldü)      |
| ----------- | ------------ | --------------------------- |
| `Arial"`    | **KABUL**    | **RED** `ThemeCssGenerationError` |
| `Arial'`    | **KABUL**    | **RED** `ThemeCssGenerationError` |
| `"`         | **KABUL**    | **RED** `ThemeCssGenerationError` |
| `Arial" ,x` | **KABUL**    | **RED** `ThemeCssGenerationError` |

### md 3 — YENİ saldırı vektörleri (ZORUNLU tablo)

Yöntem: geçici ölçüm dosyası (`__tests__/zz-sec-tur2-probe.test.ts`) **gerçek modülü** import etti,
her vektörün çıktısı bağımsız bir `auditOutput()` denetçisiyle (tırnak paritesi, `:root` kabuğu,
iç süslü parantez, kontrol karakteri, satır sonu, ters eğik çizgi, CSS yorumu, fazla `;`) sınandı.
Dosya ölçümden sonra **silindi**, geri alma `shasum -a 256 -c` ile kanıtlandı (aşağıda).

| # | Vektör (girdi) | Sonuç | Kuralı kırdı mı |
|---|---|---|---|
| 05 | `Arial""` | RED | — |
| 06 | `""Arial` | RED | — |
| 07 | `"Arial` | RED | — |
| 08 | `Arial",` | RED | — |
| 09 | `,Arial"` | RED | — |
| 10 | `"Arial", ` (sondaki virgül) | RED | — |
| 11 | `` (boş dize) | RED | — |
| 12 | `,` | RED | — |
| 13 | `,,` | RED | — |
| 14 | `"A"B"` | RED | — |
| 15 | `"A\"B"` (kaçışlı tırnak) | RED | — |
| 16 | `A\` (ters eğik çizgi) | RED | — |
| 16b | `A\\` | RED | — |
| 17 | `“Arial”` (unicode çift tırnak) | RED | — |
| 18 | `‘Arial’` (unicode tek tırnak) | RED | — |
| 19 | `A<NUL>B` | RED | — |
| 19b | `"A<NUL>B"` | RED | — |
| 20 | `A<NBSP>B` | RED | — |
| 20b | `"A<NBSP>B"` | RED | — |
| 21 | `A\nB` | RED | — |
| 21b | `"A\nB"` | RED | — |
| 22 | `"A\tB"` | RED | — |
| 23 | `Segoe UI` (çıplak, boşluklu) | RED | — (⚠ bkz. bulgu `low`) |
| 24 | `Segoe UI, sans-serif` | RED | — (⚠ bkz. bulgu `low`) |
| 25 | `"Segoe  UI"` (çift boşluk) | RED | — |
| 26 | `" Arial"` (iç baştaki boşluk) | RED | — |
| 27 | `"Arial"extra` | RED | — |
| 28 | `'Arial"` (karışık tırnak) | RED | — |
| 29 | `"Arial'` (karışık tırnak) | RED | — |
| 30 | `A;B` | RED | — |
| 31 | `var(--x)` | RED | — |
| 32 | `A/*}*/B` (CSS yorumu) | RED | — |
| 33 | `0Arial` (rakamla başlar) | RED | — |
| 34 | `-` (tek tire) | RED | — |
| 35 | `--A` (çift tire) | RED | — |
| 36 | `a}b{` | RED | — |
| 37 | `"}"` (tırnaklı süslü) | RED | — |
| 38 | `" ; "` (tırnaklı noktalı virgül) | RED | — |
| **39** | `"A B"` (meşru) | **KABUL** | **HAYIR** → `:root{--brand-font:"A B";}` `KURAL-SAGLAM` |
| 40 | `url(http://x)` | RED | — |
| 41 | `"Helvetica-Neue"` (tırnak içinde tire) | RED | — (⚠ bkz. bulgu `low`) |
| **42** | `a-b-c-d-e` (meşru) | **KABUL** | **HAYIR** → `:root{--brand-font:a-b-c-d-e;}` `KURAL-SAGLAM` |
| 43 | `Arial-` (tire ile biter) | RED | — |
| 44 | `Arıal` (unicode harf) | RED | — |
| 45 | `Günes Fontu` (Türkçe) | RED | — |
| 46 | `""` (boş tırnak) | RED | — |
| 47 | `'"Arial"'` (iç içe ters tırnak) | RED | — |
| 48 | `"A\rB"` (CR) | RED | — |
| 49 | `"A\fB"` (form feed) | RED | — |
| 50 | `"A\vB"` (vertical tab) | RED | — |

**Toplam 55 vektör (4 tur-1 + 51 yeni) · KABUL = 3 · kuralı kıran = 0.**
Kabul edilen üç vektörün **üçü de** meşru CSS ve **üçünün de** çıktısı `KURAL-SAGLAM`
(dengeli tırnak, kapalı `:root`, kontrol karakteri yok).

⚠ **`frontend` yalnızca benim dörtlüme test yazmış olabilir** endişesi ölçüldü: yazılmamış 51
vektörün **hiçbiri** kuralı kıran bir çıktı üretmedi. Desen **dar değil, doğru dar**.

### md 4 — ReDoS / karmaşıklık → **KATASTROFİK GERİ İZLEME YOK, LİNEER**

Üç desenin hiçbirinde iç içe nicelik belirteci + alternasyon birleşimi yok:
`BARE` deseninin `(?:-[A-Za-z0-9]+)*` grubu `-` ile **ayrılmış** (önek belirsizliği yok),
`QUOTED_INNER`'ın `(?: [A-Za-z0-9]+)*` grubu boşlukla ayrılmış, `QUOTED_SHELL` sabit uzunluklu
çapa + `[^"']*`.

| Senaryo | Girdi boyutu | Sonuç | Süre |
|---|---|---|---|
| `a`×50000 (başarılı) | 50.000 | KABUL | **0,05 ms** |
| `a`×50000 + `!` (başarısız) | 50.001 | RED | **0,25 ms** |
| `a-`×25000 + `!` (tire zinciri) | 50.001 | RED | **0,27 ms** |
| `a-`×100000 + `!` | 200.001 | RED | **1,07 ms** |
| `"a `×25000 + `!"` | 50.003 | RED | **0,22 ms** |
| `"a `×100000 + `!"` | 200.003 | RED | **0,85 ms** |
| `"` + `a`×200000 (kabuk kapanmaz) | 200.001 | RED | **0,98 ms** |
| 20.000 çıplak belirteç | 119.999 | KABUL | **3,12 ms** |
| 20.000 tırnaklı belirteç | 219.999 | KABUL | **3,66 ms** |

Girdi 4× büyüdüğünde süre ~4× büyüyor → **O(n)**, O(n²) değil. `toSafeFontValue`'nun
`split`/`map`/`join` zinciri de lineer. **ReDoS bulgusu yok.**

### md 5 — Dosyanın yazılı değişmezi artık karşılanıyor mu? → **EVET, boşluk KAPANDI**

Tur 1'de dosyanın `:28-32`'deki beyanı ("CSS kuralını kırabilecek HER karakter reddedilir")
**karşılanmıyordu** — beyan/gerçeklik boşluğu bulgunun özüydü. Dosya artık (`:29-41`) daha
**zayıf ama DOĞRU** bir değişmez beyan ediyor:

> "tırnak karakterinin KENDİSİ çıktıya girdiden KOPYALANMAZ — ÜRETEÇ (`formatFontFamily`) hangi
> ailenin tırnak GEREKTİRDİĞİNE kendi karar verir. Dengesiz/tek karakterlik bir tırnak bu yüzden
> YAPISAL OLARAK çıktıya hiç ULAŞAMAZ."

Bu beyan **ölçülerek doğrulandı** (md 1 kaynak izi + md 2/3'ün 55 vektörü). Beyan artık kodun
gerçekten yaptığı şeyi anlatıyor. **Beyan/gerçeklik boşluğu kapandı.**

### md 6 — `dist/client` DEĞER taraması **YENİLENDİ** (dist 12:12'de taze)

```
dist/client/_astro/ içinde TANIMLANAN custom property'ler — TAM LİSTE (tur 1 ile BİREBİR AYNI):
  --color-white --container-2xl --default-font-family --default-mono-font-family
  --font-mono --font-sans --font-weight-semibold --spacing
  --text-2xl --text-2xl--line-height --tw-font-weight
→ --color-primary / --color-surface / --color-body / --font-heading / --font-body: SIFIR (tanım VE var() referansı)

Palet hex'leri dist/client:  2563EB→0 · 2563eb→0 · 374151→0 · FFFFFF→0 · ffffff→0 · F9FAFB→0 · f9fafb→0
```

**K1 değişmezi (DEĞER yalnızca SSR'da) yeniden doğrulandı:**

| Değer | `dist/server` | `dist/client` |
|---|---|---|
| `ui-sans-serif` (tema yığınının imzası) | 1 | **0** |
| `2563EB` | 1 | **0** |
| `color-primary` | 2 | **0** |
| `font-heading` | 2 | **0** |

Kaçışsız sink hâlâ tek yerde ve **değişmedi**:
`dist/server/chunks/index_BEZjgO08.mjs:116` → `` <style>${unescapeHTML(theme.styleText)}</style> ``
— tek savunma izin listesi, ve bu tur o izin listesinin **artık sağlam olduğunu** ölçtüm.

⚠ **YANLIŞ POZİTİF 1 — yine elendi (tur 1'in aynı dersi):** `Segoe UI`→6, `Noto Sans`→2,
`Helvetica Neue`→2, `Apple Color Emoji`→2, `BlinkMacSystemFont`→2 eşleşmesi `dist/client/_astro/
messages.BmdPD-KH.css`'te **var**. Dosyadaki gerçek değeri okudum:

```
--font-sans:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif, ...
```

Bu **Tailwind'in kendi preflight'ı**; temanın `SYSTEM_FONT_STACK`'i **değil** (Tailwind'de
`BlinkMacSystemFont` var ve `ui-sans-serif` **yok**; temada tam tersi). Ayırt edici imza
`ui-sans-serif` → `dist/client`'ta **0 eşleşme**. Kiracıya bağlanabilir değer sızmıyor.

⚠ **YANLIŞ POZİTİF 2 — FIX 1'in build'e girdiğinin kanıtı sırasında elendi:** "eski
`FONT_VALUE_PATTERN` gövdesi `dist`'te kaldı mı" sorusuna `A-Za-z0-9 ,` araması **1 eşleşme**
döndü. Baytı açtım (`virtual_astro_middleware.mjs` offset 105795): eşleşme **Türkçe JSDoc
yorumunun içinde**, eski deseni *tarif eden* metin (`önceki desen (/^[A-Za-z0-9 ,"'-]+$/)
tırnağı izin listesine DOĞRUDAN ekliyordu`) — **canlı kod değil**. T-011'deki "yorumdaki örnek
host" dersinin aynısı. Canlı kod tarafında **yeni** desenler bundle'da doğrulandı:
`^-?[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*` ve `^(["'])...` → **FIX 1 sevk edilen artefakta
gerçekten girdi**, yalnızca kaynakta değil.

### Geri alma kanıtı (geçici ölçüm dosyası)

```
shasum -a 256 -c themes-before.sha256
apps/storefront/src/themes/registry.ts: OK
apps/storefront/src/themes/theme-css.ts: OK
apps/storefront/src/themes/theme-setting-definition.ts: OK
apps/storefront/src/themes/ThemeTemplate.astro: OK
apps/storefront/src/themes/__tests__/registry.test.ts: OK
apps/storefront/src/themes/__tests__/theme-css-no-literal-keys.test.ts: OK
apps/storefront/src/themes/__tests__/theme-css.test.ts: OK
apps/storefront/src/themes/__tests__/theme-template-dispatch.test.ts: OK

dizin envanteri diff (önce/sonra) → BİREBİR AYNI (geçici dosya silindi)
git status --short apps/storefront/src/themes → "?? apps/storefront/src/themes/" (FIX 1'deki hâli)
```

`solid` ile paralel çalıştım; **kalıcı dosya değişikliği bırakmadım.**

---

## İŞ 2 · `ThemeResolutionError` → `AppError` dönüşümünün güvenlik etkisi

### Madde 12 bozuldu mu? → **BOZULMADI** (üç bağımsız katmanda ölçüldü)

**(a) Yakalama noktası `context`'i hiç okumuyor.** `middleware.ts:250-262`'yi okudum: `catch`
bloğu yalnızca `isAppError(error)` ve `error.httpStatus` okur. `error.context`, `error.message`,
`error.code`, `error.stack` **hiç referans edilmiyor**. Yanıt `renderNotFound()`/
`renderUnavailable()` ile üretiliyor; ikisi de `context.rewrite('/404')`/`('/503')` çağırıyor,
hataya ait **hiçbir bayt taşımıyor**.

**(b) `AppError`'ın tel sözleşmesi `context`'i YAPISAL OLARAK dışa vermiyor.**
`packages/errors/src/error-body.ts` kaynağı: `toErrorBody` imzasında `error.context`
**okunmuyor** (dosyada açık yazılı değişmez, `:13-15` + `:69` — VARSAYIM A-V25: "`error.context`
→ ASLA bu çıktıya girmez; yalnızca logger okur"). Serileşen tek ek alan `publicDetails`'tır ve
`ThemeResolutionError` onu **override etmiyor** → `publicDetails` = `{}`.
Ayrıca: vitrin `toErrorBody`'yi **hiç çağırmıyor** (`rg "toErrorBody|errorBody|redact"
apps/storefront/src` → testler hariç **0 eşleşme**); `@arkesoft/errors`'tan yalnızca `isAppError`
(middleware) ve `appErrorBodySchema` (`map-api-error.ts`, `storefront-server-fetch.ts` — **okuma**
yönünde) tüketiliyor.

**(c) `error.message` kiracı verisi taşımıyor.** `app-error.ts:121-125` ctor'u
`super(options.userMessageKey, ...)` çağırıyor — yani `message === 'errors.theme.resolutionFailed'`.
`context` (`themeId`/`themeVersion`) mesaja **interpolasyon edilmiyor**. Kazara bir `${error}`
veya `error.message` sızıntısı bile **i18n anahtarından başka** bir şey vermez.

**(d) Test pini hâlâ GEÇERLİ ve YEŞİL.** Tur 1'de pinli bulduğum test korunmuş:
`apps/storefront/src/lib/__tests__/middleware.test.ts:288-291` — `themeId: 'bilinmeyen-tema'` ile
istek → `expect(response.status).toBe(503)` · `expect(context.rewrite).toHaveBeenCalledWith('/503')` ·
`expect(await response.clone().text()).not.toContain('bilinmeyen-tema')`. Koştum: **yeşil**.

**(e) Log satırına sızma yolu yok.** Vitrin uygulama logu üretmiyor (tur 1'de ölçüldü,
`eslint.config.mjs` `'no-console': 'error'`); bu turda `AppError`'ın ctor'unda da log çağrısı
**olmadığını** doğruladım (`:121-140` yalnızca alan ataması + `Error.captureStackTrace`).

Ayrıca: `context`'in içeriği (`themeId`/`themeVersion`) **o kiracının kendi** yapılandırmasıdır —
sızsa bile **çapraz kiracı** sızıntısı olmazdı. `critical` sınıfı oluşmuyor.

### `isAppError` + `httpStatus` jenerik eşlemesi → 404/503 karışması mümkün mü? → **HAYIR**

- ⚠ `try` bloğu **tek bir ifade** içeriyor: `resolveTheme(themeSelection)` (`:248-249`). Başka
  hiçbir çağrı o `catch`'e düşemez. `mapApiError`'ın ürettiği hatalar **ayrı** bir `try`'da
  (`:192-227`), **ayrı** bir eşlemeyle (`failure.kind` üzerinde exhaustive `switch`). İki eşleme
  **birbirine karışmıyor** — ADR-0012 §8'in "API 404'ü 404, geri kalan her şey 503" kuralı
  her iki dalda da korunuyor.
- `resolveTheme`'in **tek** çağrı yeri `middleware.ts:249` (ölçtüm: `rg "resolveTheme"
  apps/storefront/src` → üretim kodunda tek çağrı). `resolveTheme` yalnızca
  `ThemeResolutionError` (`httpStatus: 503`) fırlatır → eşleme **her zaman** 503.
- `!isAppError(error)` dalı beklenmeyen hatayı **yukarı iletiyor** (`throw error`), yutmuyor —
  CLAUDE.md §4 uyumlu.
- "Gelecekte biri `httpStatus`'u 404 yaparsa vitrin sessizce 404 döner (SEO/varlık oracle'ı)"
  riskini düşündüm; **mekanik pin mevcut**: `middleware.test.ts:288` `toBe(503)` o değişiklikte
  **kırmızıya döner**. Bulgu değil.
- `isAppError`'ın ördek-tipleme (`appErrorShapeSchema`) yedek yolunu da inceledim
  (`app-error.ts:159-165`): şekli taklit eden bir nesnenin `catch`'e düşmesi için
  `resolveTheme`'in onu fırlatması gerekir — saldırganın o `try` bloğuna nesne enjekte etme yolu
  **yok**. Sömürülebilir değil.

**İŞ 2 sonucu: güvenlik bulgusu YOK.**

---

## BULGULAR

### [SEV: low] `apps/storefront/src/themes/theme-css.ts:106,117` — font değeri izin listesi GEÇERLİ CSS'i de reddediyor; bugün etkisi 0, v0.3.0'da çağrı yeri izole edilmezse TÜM kiracıları düşürür

**Ölçülen gerçek (md 3 tablosu):** FIX 1 kabul kümesini daralttı ve artık **geçerli CSS olan**
bazı değerler de reddediliyor:

- `Segoe UI` / `Segoe UI, sans-serif` — **çıplak** (tırnaksız) çok kelimeli aile adı. CSS
  `<family-name>` grameri birden fazla `<custom-ident>` dizisine İZİN VERİR; bu geçerli CSS'tir.
  Eski desen kabul ediyordu, yeni desen **RED** (vektör 23, 24).
- `"Helvetica-Neue"` — tırnak **içinde tire**. `QUOTED_FONT_FAMILY_INNER_PATTERN`
  (`/^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/`) tireye izin vermiyor, oysa **çıplak**
  `Helvetica-Neue` kabul ediliyor → asimetri (vektör 41).

**Saldırı/arıza senaryosu (somut ama İLERİYE DÖNÜK):** `generateThemeCss`,
`registry.ts:80`'de **modül yüklenirken** her kayıt defteri girdisi için çağrılıyor ve hata
**fırlatıyor** (fail-closed). Bugün tek girdi statik manifest (`SYSTEM_FONT_STACK`) ve
geçiyor — `theme-css.test.ts:148` bunu pinliyor → **bugünkü istismar/arıza riski = 0**.
Ama dosyanın kendi başı (`:16`) "v0.3.0 bu fonksiyona KİRACI JSONB'si besleyecek" diyor.
O gün çağrı yeri **süreç başına bir kez** kalırsa, tek bir kiracı yöneticisinin tema ayarına
yazdığı geçerli-CSS-ama-izin-listesi-dışı bir değer (`Segoe UI`, `"Helvetica-Neue"`)
**sürecin açılışta çökmesine** → **tüm kiracıların** vitrininin düşmesine yol açar.
Bu, kiracı A'nın girdisiyle kiracı B'nin hizmetini düşürmesi olur.

**Niçin `low` ve niçin `critical` değil:** (1) bugün kiracı girdisi bu yola **ulaşmıyor** —
somut senaryo v0.3.0'a bağlı, bugün kurulamıyor; (2) yön **fail-closed** (fazla reddetme),
fail-open değil — bir sızıntı/atlatma değil; (3) tur 1'deki `low` #2 (ad izin listesinin SDK'dan
sıkı olması, "ihlal TÜM kiracıları düşürüyor") ile **aynı sınıf**, bu tur onun **değer**
boyutunu ölçtüm. Önem derecesini şişirmiyorum (BASELINE §4).

**Önerilen düzeltme (bugün kod değişikliği GEREKTİRMEZ):** v0.3.0'da kiracı JSONB'si bu üretece
bağlanırken iki şey zorunlu olsun — (a) `generateThemeCss` çağrısı **kiracı başına** ve
`try/catch` ile izole edilsin, bir kiracının geçersiz değeri o kiracıyı temanın varsayılanına
düşürsün, süreci **düşürmesin**; (b) `QUOTED_FONT_FAMILY_INNER_PATTERN` çıplak desenle
simetrik hâle getirilsin (tireye izin) ve çok kelimeli çıplak aile adı kabul edilip üreteç
tarafından tırnaklanabilsin — ikisi de kabul kümesini **güvenli yönde** genişletir, tırnağın
girdiden kopyalanmaması değişmezini **bozmaz**.

**Teknik borç satırı (`docs` kopyalayabilir):**
`[low] apps/storefront/src/themes/theme-css.ts:106,117 — font değeri izin listesi geçerli CSS'i (çıplak çok kelimeli aile adı, tırnak içinde tire) reddediyor; fail-closed olduğu için bugün etkisi yok (girdi statik manifest). v0.3.0'da kiracı JSONB'si bağlanırken (1) üreteç çağrısı kiracı başına izole edilmeli, (2) tırnaklı/çıplak desen asimetrisi giderilmeli. Sorumlu: frontend. Vade: v0.3.0 kapsamına giriş şartı.`

---

## ÖLÇÜMLER

- **`pnpm audit`: KOŞTURULMADI** (handoff yasağı — `pnpm-lock.yaml` FIX 1'de değişmedi, ölçülmüştü).
  Tur 1 sayıları devralındı: **kritik 0 · high 1 · orta 1 · düşük 0**.
- **İncelenen dosya sayısı: 9**
  - `apps/storefront/src/themes/theme-css.ts` (tam)
  - `apps/storefront/src/themes/registry.ts` (`:110-244`)
  - `apps/storefront/src/middleware.ts` (tam)
  - `apps/storefront/src/themes/__tests__/theme-css.test.ts` (tam)
  - `apps/storefront/src/themes/__tests__/registry.test.ts` (pin taraması)
  - `apps/storefront/src/lib/__tests__/middleware.test.ts` (pin taraması)
  - `packages/errors/src/app-error.ts` (`:60-165`)
  - `packages/errors/src/error-body.ts` (`context` yüzeyi)
  - `apps/storefront/dist/{client,server}/**` (değer taraması)
- **Koşulan testler (tek dosya, handoff'ta KABUL):**
  `vitest run src/themes/__tests__/theme-css.test.ts src/themes/__tests__/registry.test.ts src/lib/__tests__/middleware.test.ts`
  → **3 dosya / 45 test geçti**, 0 başarısız (413 ms).
- **Saldırı vektörü matrisi: 55 vektör** (4 tur-1 + 51 yeni) → **52 RED · 3 KABUL · kuralı kıran 0**.
- **ReDoS: 9 senaryo**, en kötü 219.999 baytta **3,66 ms** → lineer, katastrofik geri izleme yok.
- **Tenant izolasyon listesinden karşılanmayan madde: YOK (0 madde).**
  ⚠ DAR kapsam: 14 maddenin tamamı tur 1'de canlı DB ile ölçüldü, **tekrarlanmadı**. Bu turda
  yalnızca **madde 8** (dış kaynak kapsamlandırması — `dist/client` değer taraması yenilendi) ve
  **madde 12** (hata mesajı başka kiracının varlığını sızdırmıyor — `AppError` dönüşümü sonrası
  yeniden ölçüldü) doğrulandı; **ikisi de karşılanıyor**.
- **Ölçemediklerim (§5 dürüstlük):**
  - `pnpm audit` — handoff yasağı (lock değişmedi).
  - `pnpm build` / `pnpm test` / `pnpm test:isolation` — handoff yasağı; `dist` **okundu**
    (12:12, taze), test sayıları (1015 / 18) handoff'tan **devralındı**.
  - `packages/trpc/src/__tests__/{harness,procedures.test}.ts` — yüzey değişiminde listeli, ama
    **yalnızca test dosyaları** (üretim yüzeyi yok) ve tRPC tüketici zinciri tur 1'de ölçüldü →
    DAR kapsam gereği **incelenmedi**.
  - Tarayıcıda gerçek CSS ayrıştırma davranışı (Playwright/`astro dev` yasağı) — `auditOutput()`
    yapısal denetçisiyle **dolaylı** ölçüldü, gerçek tarayıcı ayrıştırıcısıyla **değil**.

---

## FAIL kuralı değerlendirmesi

| Bulgu sınıfı | Sayı |
|---|---|
| critical | 0 |
| high | 0 |
| medium | **0** (tur 1'in tek `medium`'u KAPANDI) |
| low | 1 |

Yalnızca `low` → **PASS**, bulgu teknik borca kaydedilir, düzeltme turu **açılmaz**
(BASELINE §4: "`low` bulgular için düzeltme turu koşturulmaz").
FIX 1'in **getirdiği** `medium`+ bulgu **yok** → FAIL koşulu oluşmadı.
