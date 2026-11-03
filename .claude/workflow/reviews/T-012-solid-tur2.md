# T-012 · solid gate · tur 2 (TAM yeniden denetim)

- **Tarih:** 2026-11-03
- **Sürüm:** v0.0.10 · platform 0.2.0 · `@arkesoft/storefront` 0.1.1 · `@arkesoft/themes-modern` 0.1.0 · `@arkesoft/trpc` 0.2.0
- **Kapsam:** FIX 1'in değiştirdiği beş bölge + tur 1'in 4 `medium` / 13 `low`'unun kapanış doğrulaması. `.claude/workflow/**` inceleme dışı.

```
GATE: solid
SONUÇ: PASS
```

**PASS gerekçesi (AGENT_BASELINE §4):** 0 `critical` · 0 `high` · **0 `medium`** · 7 `low`.
Tur 1'in **dört `medium`'unun DÖRDÜ de KAPANDI** (kanıtlar §1). FIX 1'in **getirdiği**
hiçbir `medium`+ bulamadım; getirdiği kusurların tamamı yorum kalitesi / ölü export /
kenar-durum biçimlendirme sınıfında → `low`, düzeltme turu açmaz.

---

## 1. Tur 1 `medium`'larının kapanışı

### M1 (K-A) · `ThemeResolutionError` → `AppError` → **KAPANDI**

| İddia | Ölçüm | Sonuç |
| --- | --- | --- |
| `AppError`'dan türüyor | `registry.ts:169-178` — `code:'THEME_RESOLUTION_FAILED'`, `httpStatus:503`, `userMessageKey:'errors.theme.resolutionFailed'`, `context:{themeId,themeVersion}` | ✓ CLAUDE.md §4 dörtlüsü birebir |
| Elle `instanceof` + durum eşlemesi kalktı | `middleware.ts:251-259` → `isAppError(error)` + `error.httpStatus === 404 ? renderNotFound() : renderUnavailable()`; `instanceof ThemeResolutionError` **0 eşleşme** | ✓ |
| `toFailureFromStatus` ile aynı desen | `map-api-error.ts:69-71` → `status === 404 ? not-found : unavailable`. **Birebir aynı kural** | ✓ beyan doğru |
| Hata yutulmuyor | `middleware.ts:251-254` — `!isAppError` → `throw error` (yorum gerekçeli) | ✓ |
| Davranış pinli | `middleware.test.ts:273-293` — bilinmeyen seçim → `status 503` + `rewrite('/503')` + `cache-control` + gövdede `'bilinmeyen-tema'` **YOK** | ✓ beyan değil, assertion |
| `ThemeRegistryIntegrityError` DEĞİŞMEDİ (K-A kararım) | `registry.ts:130-135` sınıf gövdesi aynı; `:119-129` yorumu artık **NEDEN** türemediğini yazıyor (`AppError` `abstract` + `userMessageKey` zorunlu; açılışta çöken sürece kullanıcı mesajı atfetmek anlamsız) | ✓ karara uyuldu |
| `ThemeCssGenerationError` DEĞİŞMEDİ (**teyit istendi**) | `theme-css.ts:129-134` sınıf gövdesi aynı — **TEYİT EDİLDİ**. ⚠ AMA gerekçe yorumu (`:122-127`) artık **yanlış ölçüm** taşıyor → **N2** | KISMİ: karar doğru, gerekçe bayat |

#### ⚠ DENETLENECEK KARAR 1 · `errors.theme.resolutionFailed` `messages.ts`'e eklenmedi

**KARARIM: CLAUDE.md §10 md 17 ihlali DEĞİL. Repo deseniyle tutarlı bir ileriye-referans.
Bulgu yazmıyorum (`low` dahi değil).** Üç ölçülmüş gerekçe:

1. **md 17'nin lafzı "kullanıcıya dönük **metni** kodda sabit yazmak".** `registry.ts:174`
   metin değil **anahtar** taşıyor (`errors.theme.resolutionFailed`). Türkçe tek bir bayt
   yok. CLAUDE.md §4'ün `AppError` şablonu bunu zaten böyle tanımlıyor:
   *"`userMessageKey` — kullanıcıya gösterilecek i18n anahtarı (Türkçe metin katalogda)"*.
   Anahtarın **çözümlenmesi** `packages/i18n`'in işi; o paket **bugün yok** (glob: 0 dosya).
2. **Emsal DOĞRULANDI — 15/15.** `rg "extends AppError"` → `apps/api/src/errors/domain/**`
   altında **tam 15 üretim sınıfı** (`tenant-context-required`, `mail-delivery-failed`,
   `cross-site-request-rejected`, `tenant-membership-required`, `email-not-verified`,
   `tenant-resolution-failed`, `rate-limit-store-unavailable`, `session-not-found`,
   `tenant-not-found`, `rate-limit-exceeded`, `unauthenticated`, `request-context-unavailable`,
   `dependency-unavailable`, `auth-provider-failed`, `validation`). `errors.*` anahtarlarının
   **hiçbiri** `apps/admin/src/messages/messages.ts` veya `apps/storefront/src/messages/messages.ts`'te
   **geçmiyor** (grep: 23 dosyada `errors.<alan>.<ad>` eşleşmesi var, **ikisi de katalog değil** —
   hepsi hata sınıfları ve testler). `frontend`'in beyanı **DOĞRU**.
3. **Eklemek AKTİF OLARAK ZARARLI olurdu.** `messages.ts`'in dosya başı yorumu (`:1-19`)
   kataloğun sözleşmesini yazıyor: *"`docs/ux/T-009.md`'nin 15 benzersiz dizesi BİREBİR
   taşınır: kiracı 6 + 404 4 + 503 5"* ve kök ad alanı `storefront.*`. Oraya bir `errors.*`
   dalı açmak (a) 15 dizelik ölçülmüş sözleşmeyi bozar, (b) `apps/api`'nin 15 emsaliyle
   **ayrışan ikinci bir konvansiyon** kurar, (c) hiçbir yerde render edilmeyen bir Türkçe
   dize üretir — `/503` sayfası metnini `storefront.unavailable.*`'tan okuyor
   (`middleware.ts:258-261` → `/503`, katalog `:41-48`). Beyan ↔ gerçeklik: `registry.ts:163-167`
   bu durumu **açıkça yazıyor** ve ölçümüm onu doğruluyor.

**Not (`docs` için, bulgu değil):** v0.0.18'in i18n paketi geldiğinde 15+1 = **16 anahtarın**
tamamı tek seferde katalogla eşleştirilmeli; eksik anahtar o sürümde bir **kapı testi** ister
(`rg -o "userMessageKey: '([^']+)'"` ∖ katalog anahtarları = ∅). Bu, bugünkü ileriye-referansın
borç satırı.

### M2 (K-C) · Anahtar formülü tek üretici yerde → **KAPANDI** (artık `as` = 0)

- `middleware.ts`'te `` `${themeId}@${themeVersion}` as ThemeRegistryKey `` **SİLİNDİ**.
  `rg "\bas [A-Z]"` → `apps/storefront/src` üretim kodunda **0 eşleşme**; kalan 2 eşleşme
  **yorum metni** (`middleware.ts:245`, `registry.ts:208`), 1'i test (`registry.test.ts:51`, = L13).
  **ÖLÇÜM TEYİT EDİLDİ: üretim `as` 1 → 0.**
- ⚠ **`frontend`'in "type guard" iddiası DOĞRULANDI:** `registry.ts:237-245` içinde `key`
  `isThemeRegistryKey(key)` ile daraltılıyor; `:181-183` gerçek bir çalışma-zamanı kontrolü
  (`Object.hasOwn(THEME_REGISTRY, key)`) — `as` değil. `ResolvedTheme.key` bu **daraltılmış**
  değerdir, ikinci bir üretim yok.
- ⚠ **`THEME_REGISTRY_KEYS` de `as` GEREKTİRMİYOR:** `registry.ts:198-199`
  `Object.keys(THEME_REGISTRY).filter(isThemeRegistryKey)` — `string[]` → `ThemeRegistryKey[]`
  daraltması **tip koruyucusuyla süzme** ile yapılıyor. Doğru.
- **Kalan artık (N6):** `${id}@${version}` birleştirmesi `registry.ts` **içinde** hâlâ iki
  yerde (`:85 registryKeyOf`, `:238 resolveTheme`). Tur 1'deki **zarar yolu KAPANDI**: her iki
  üretici artık testle pinli ve **fail-closed** — `:238`'in ayracı sapsa `registry.test.ts:8-15,21-23`
  KIRMIZI döner (ve ziyaretçi 500 değil tasarlanmış 503 görür); `:85` sapsa
  `assertRegistryKeysMatchManifests` **modül yüklenirken** fırlar, registry'yi import eden
  4 test dosyası birden kırmızı olur. Bu yüzden `medium` DEĞİL, `low` borç satırı.

### M3 · Drift pin gerçek modülden okuyor → **KAPANDI**

**Reçeteme (T-011) karşı denetim:**

| Reçete maddesi | Ölçüm | Sonuç |
| --- | --- | --- |
| (1) tek uygulama | Registry tarafı `THEME_REGISTRY_KEYS` **import'u** (`:25,44`) — regex YOK. `.astro` tarafı grep (`:30,36-41`) | ✓ kaçınılmaz olan tarafta tek grep kaldı |
| (2) TAM ÇIKTI assert'i | `:54` `expect(fromDispatcher).toEqual(fromRegistry)` — küme eşitliği; `:52-53` iki taraf için `length > 0` | ✓ `length > 0` tek başına DEĞİL |
| (3) yakın-kaçırma sentetik veri | `ghost@9.9.9` (dispatcher'da fazla) ve `phantom@9.9.9` (registry'de fazla) — **iki yönlü** | ✓ |

**İki yönlü mutasyon çıktısı reçetenin tam istediği şekil:** A yönü dispatcher'ın fazlasını,
B yönü registry'nin fazlasını kırmızıya çeviriyor. Tur 1'in kör noktası (**kısmi** küme) artık
kapalı: registry tarafı regex'le değil modülden okunduğu için "regex'in yakalayamadığı biçimde
yazılmış ikinci girdi" senaryosu **yapısal olarak** imkânsız.

#### ⚠ DENETLENECEK KARAR 2 · `.astro` tarafının grep kalması

**KARARIM: md 1'i İHLAL ETMİYOR; kaçınılmaz ve kabul edilebilir.** Gerekçe üç ölçümde:

1. **Kaçınılmazlık ölçüldü, beyan değil.** `tsc` `.astro` derlemiyor (repo genelinde,
   `apps/storefront/README.md:58-62`'de borç olarak yazılı) ve repoda `.astro` frontmatter'ını
   **çalıştırabilen** hiçbir test tesisatı yok (`astro check` v0.0.19 borcu). Alternatif
   "ikinci uygulama"ların hepsi daha kötü: `.ts`'ten `.astro` ithali A-A1'in ölçtüğü sınanmamış
   yol (+ `any` riski, YASAK), elle yazılmış anahtar listesi ise **üçüncü** bir doğruluk kaynağı.
2. **md 1'in zararı yön bağımlı.** Tur 1'de grep **pinlenen tarafı** (registry) ikinci kez
   uyguluyordu — orada yanlış **YEŞİL** mümkündü. Şimdi grep yalnızca **ölçülen** tarafta;
   arıza modlarının tamamı **gürültülü**: dispatcher başka bir idioma geçerse (`switch`,
   lookup tablosu) küme **boşalır** → `:53` `length > 0` KIRMIZI; kısmen güncellenirse
   `toEqual` KIRMIZI. "Tek yönlü grep, iki yönlü grep'ten güvenlidir" (tur 1 önerim) **birebir
   uygulanmış**.
3. **Kalan tek yanlış-yeşil yüzeyi `low` ve N5'te kayıtlı:** grep **yorum satırlarını
   elemiyor**, oysa dosya başı (`:5-19`) kardeş pinin desenini kullandığını söylüyor ve o
   kardeş (`theme-css-no-literal-keys.test.ts:30-34` `codeLinesOf`) **eliyor**. Bugün zararsız
   (ölçtüm: `ThemeTemplate.astro:18-21` yorumlarında `themeKey === '...'` geçiyor ama regex
   `currentThemeKey === '` öneki istiyor → **0 yanlış eşleşme**).

### M4 · Sahte port tema seçimini override edebiliyor → **KAPANDI** + ⚠ **kendi alt-iddiamı DÜZELTİYORUM**

- Uygulama doğru: `harness.ts:177-194` opsiyonel `themeSelection?: Pick<StorefrontTenant,'themeId'|'themeVersion'>`
  + `themeSelection?.x ?? null`; **yeni port icat edilmedi**, tek fabrika iki yolu da üretiyor.
  `procedures.test.ts:168-190` null-OLMAYAN yolu `toEqual` tam şekil + `Object.keys` küme
  eşitliğiyle assert ediyor; `:147-165`'teki **null yolu KORUNDU** (iki yol da kapsandı). ✓

#### ⚠ DENETLENECEK KARAR 3 · `backend`'in katman ayrımı

**KARARIM: AYRIM DOĞRU ve metodolojik olarak benden daha titiz. Benim M4 bulgumun ÇEKİRDEĞİ
doğruydu; iki mutasyon örneğimden BİRİ fazla iddialıydı — düzeltiyorum.**

Bağımsız doğrulama (kod okumayla, koşturmadan):
`router-output.test-d.ts:78-82` `toEqualTypeOf<{name:string; themeId:string|null; themeVersion:string|null}>()`
— `toEqualTypeOf` **iki yönlü** tam eşitlik. Şema `z.null()`'a daraltılırsa çıkarsanan tip
`{themeId:null}` olur ve `null ≠ string|null` → **tsc hatası**. `backend`'in ölçümü
(`--typecheck.enabled=false` ile katmanları ayırıp 26 passed/1 skipped/0 failed göstermesi)
bu yapıyla **tutarlı** ve `vitest --typecheck` CLI bayrağı dosyayı değiştirmeden ayırmanın
doğru yolu — **testi gevşetme değil, ölçümü izole etme.**

İki mutasyonu ayırmak gerekiyordu, ben tur 1'de ayırmadım:

| Mutasyon | Tur 1'deki iddiam | Gerçek (ölçüldü) | Hüküm |
| --- | --- | --- | --- |
| Şema `z.null()`'a daralır (**tip** değişikliği) | "o da yeşil kalır" | **tip-düzeyi pin KIRMIZI** (`test-d.ts:78-82`) | ⚠ **İDDİAM YANLIŞTI** |
| Resolver/mapper non-null değeri `null`'a çevirir (**değer** regresyonu, tip aynı) | "üçü de yeşil kalır" | yeni test olmadan **hiçbir şey kırılmıyor** (26/0) | ✓ **İDDİAM DOĞRUYDU** |

**Sonuç:** tip-düzeyi pin boşluğu **kısmen** karşılıyordu — ama yalnızca **tip** mutasyonu
için. v0.0.10'un ana özelliği (kiracının DB'deki seçiminin tele ulaşması) bir **değer**
davranışıdır; tipi değiştirmeyen hiçbir regresyon CI'da yakalanmıyordu. Bulgu bu yüzden
**gerçekti ve `medium`du**; düzeltme de tam bu boşluğu kapatıyor (tek runtime sinyali =
yeni test). Benim hatam severity'de değil, **kanıt cümlesinin fazla genişliğinde**;
raporun kalıcı kaydına böyle geçiyor.

---

## 2. FIX 1 yeni beyan/gerçeklik boşluğu getirdi mi? (İŞ 2)

Beş bölgeyi yorum/başlık/isim ↔ kodun yaptığı iş ekseninde taradım.

**TEMİZ çıkanlar (ölçüldü):**

| Beyan | Ölçüm | Sonuç |
| --- | --- | --- |
| `middleware.ts:256-257` "`toFailureFromStatus` ile AYNI desen, hata KODU OKUNMAZ" | `map-api-error.ts:69-71` birebir aynı kural; `middleware.ts:258-259`'da `error.code`'a erişim **yok** | ✓ |
| `registry.ts:193-196` "`as` GEREKTİRMEDEN daraltır" | `:198-199` type-guard süzme | ✓ |
| `registry.ts:214-217` "tip koruyucusu — `as` DEĞİL, gerçek runtime doğrulaması" | `:181-183` `Object.hasOwn` | ✓ |
| `registry.ts:163-167` "bu anahtar bugün HİÇBİR yerde render EDİLMEZ, `/503` metnini `storefront.unavailable.*`'tan okur" | `middleware.ts:258-261` + `messages.ts:41-48` | ✓ dürüst |
| `theme-css.ts:38-41` "dengesiz/tek karakterlik tırnak YAPISAL OLARAK çıktıya hiç ULAŞAMAZ" | `:162-198` kod okumasıyla izledim: tırnak **yalnızca** `formatFontFamily`'nin kararıyla üretilir, girdiden kopyalanan hiçbir yol yok; `""`/`''`/boş belirteç de `throw`'a düşer (fail-closed) | ✓ **security tur 1 medium'u GERÇEKTEN kapandı** |
| `ThemeTemplate.astro:77-83` "DÜZELTME: önceki tur çıplak `Error` fırlatıyordu" | `:85-90` `ThemeTemplateDispatchError` + `:111` kullanımı | ✓ L1 kapandı |
| `theme-template-dispatch.test.ts:48` test başlığı | başlık "THEME_REGISTRY_KEYS (GERÇEK modül) > 0 VE ... TAM EŞİT" — `:52-54` tam olarak bunu assert ediyor | ✓ başlık = ölçüm |
| `procedures.test.ts:169` test başlığı | "null-OLMAYAN ... BİREBİR tele TAŞIR, null yolunun YANINDA" — veri gerçekten non-null (`:174-175`), assertion `toEqual` tam şekil, null yolu `:147-165`'te duruyor | ✓ başlık = ölçüm |
| `theme-css.test.ts:122-134` başlığı ("tek tırnaklı → çift tırnağa NORMALİZE, gereksiz tırnak düşer") | `:130-132` çıktı assertion'ı birebir bunu gösteriyor | ✓ |

**BOŞLUK bulunanlar:** N1, N2, N4, N5 (§4). ⚠ Handoff'un alıntıladığı değişmez metni
(*"CSS kuralını kırabilecek HER karakter reddedilir"*) `theme-css.ts`'te **yok**
(`rg "kırabilecek|HER karakter" apps/storefront/src` → **0 eşleşme**) — dosyadaki gerçek
yazılı değişmezler `:26-28` ("Çözüm KAÇIŞLAMA değil İZİN LİSTESİ") ve `:38-41`; ikisi de
**karşılanıyor** (yukarıdaki tablo). Handoff parafraz yapmış; kaydediyorum.

**Bulgu yazmadığım, bakıp geçtiğim iki nüans:**
- `registry.test.ts:18-19` başlığının ikinci cümlesi ("çağıran ... YENİDEN İNŞA ETMEZ") bir
  **motivasyon** ifadesi; bir birim testi çağıranın davranışını kanıtlayamaz. Birinci cümle
  (ölçülen kısım) doğru → M4 sınıfı bir boşluk **değil** (orada veri iddiayı hiç
  egzersiz etmiyordu; burada ediyor).
- `theme-css.test.ts:136` "MUTASYON KANITLI" — kanıt süit dışında; bu repo konvansiyonu
  (`theme-css-no-literal-keys.test.ts:15-19` aynısını yapıp **nedenini** de yazıyor).
  Dört negatif vaka gerçek. Kabul.

---

## 3. İŞ 3 · Tur 1'in 13 `low`'unun durumu (yeniden bulgu AÇMIYORUM)

| # | Durum | Kanıt / güncel `dosya:satır` |
| --- | --- | --- |
| **L1** | ✅ **KAPANDI** | `ThemeTemplate.astro:85-90` `ThemeTemplateDispatchError`, `:111` fırlatılıyor; yorum `:77-83` gerçeği anlatıyor ("yolu üstündeyse kapat" istisnası doğru uygulanmış) |
| **L2** | 🔸 AÇIK | `packages/themes/modern/src/theme.config.ts:42-43,50-51,57-58,66-67,74-75` — dokunulmadı (FIX 1 kapsamı dışı) |
| **L3** | 🔸 AÇIK | `packages/themes/modern/package.json:9` + `README.md:18-23` — dokunulmadı |
| **L4** | 🔸 AÇIK | `apps/storefront/package.json:16-28` — `@arkesoft/theme-sdk` **hâlâ bildirilmiyor** (ölçtüm); `registry.ts:64` `type ThemeDefinition = typeof modernTheme` duruyor |
| **L5** | 🔸 AÇIK — **ve DAHA bayat** | `packages/errors/src/index.ts:3-5` tüketici listesi hâlâ `apps/storefront`'u saymıyor; artık vitrin yalnızca import etmiyor, **`AppError`'dan türetiyor** (`registry.ts:169`). Vade önerisini v0.0.11'de bırakıyorum, metin güncellemesi tek satır |
| **L6** | 🔸 AÇIK — **1 satır KÜÇÜLDÜ** | `middleware.ts:135-280` `onRequest` = **146 satır** (tur 1: 147). Sorumluluk sayısı **değişmedi (7)**; FIX 1 Adım 5.5'i yeniden yazdı ama **çıkarmadı**. Ölçüm: büyümedi, küçülmedi denecek kadar aynı. Çıkarma önerisi (`src/lib/resolve-tenant-theme.ts`) hâlâ geçerli |
| **L7** | 🔸 AÇIK | `packages/themes/modern/src/__tests__/theme-manifest.test.ts:42-46` — dokunulmadı |
| **L8** | 🔸 AÇIK | `packages/db/src/__tests__/migration-sql.test.ts:1595,1596,1601,1611,1613` — dokunulmadı. ⚠ N5 bunun **vitrindeki kardeşi**; `docs` ikisini aynı borç kümesine yazabilir |
| **L9** | 🔸 AÇIK | `theme-css-no-literal-keys.test.ts:27` tek dosya yoluna sabit (`join(..., 'theme-css.ts')`) — değişmedi |
| **L10** | 🔸 AÇIK | `packages/themes/modern/src/components/PageSection.astro:29` — dokunulmadı |
| **L11** | 🔸 AÇIK (satır kaydı) | `ThemeTemplate.astro:86-89` + `:100-113` sekme girintili, frontmatter yorumları boşluk. Tur 1'de `:83-98` idi; FIX 1 adlandırılmış sınıfı eklerken **aynı sekme idiomunu** sürdürdü → tutarsızlık **genişledi** (yine `.astro` araç kapsamı dışı, bu yüzden hâlâ `low`) |
| **L12** | 🔸 AÇIK (satır kaydı) | `ThemeTemplate.astro:107-109` (`kind === '404'` dalı) — üretimde ulaşılamaz, gerekçeli sınır; tur 1'de `:91-93` |
| **L13** | 🔸 AÇIK (satır kaydı) | `registry.test.ts:51` `error as ThemeResolutionError` — tur 1'de `:41`. `toBeInstanceOf`'tan sonra; `if (!(error instanceof ...)) throw` daraltması `as`'ı sıfırlardı |

**Özet:** 1 kapandı (L1, istisna kuralıyla), **12 AÇIK**. FIX 1 hiçbirini dolaylı olarak
kötüleştirmedi; L5 ve L11 metinsel olarak biraz **daha** geçerli hâle geldi.

---

## 4. İŞ 4 · `security`'nin 4 `low`'uyla çakışma kontrolü ve severity adjudikasyonu

**Çakışma: YOK. Dördü de benim 13 `low`'umla mükerrer DEĞİL.** Gerekçeli eşleme:

| `security` low | Benim en yakın kaydım | Mükerrer mi? |
| --- | --- | --- |
| 1 · `isTraversalSegment` ölü+korumasız (SEC-5a sonrası) | yok (asset-ref yüzeyinde hiç kaydım yok) | **Hayır** — ayrı kayıt. Kanıtı güçlü (blok kaldırılınca 47/47 yeşil = ölü kod tanımı). `low` **doğru**: ölü kod, davranış değiştirmiyor |
| 2 · `styleText` süreç geneli; "yalnızca manifestten türer" pini yok | L9 (AC3 pini tek dosya yoluna sabit) — **farklı değişmez** | **Hayır.** L9 "ad ikinci doğruluk kaynağı olmasın", bunlar "**değer** kiracı JSONB'sinden gelmesin". v0.3.0 vadesi doğru |
| 3 · Vitrin ad deseni SDK'nın yayınlanan sözleşmesinden sıkı | tur 1'de bunu **bulgu yazmadan kabul etmiştim** (`theme-css.ts:65-72`'nin bilinçli kararı) | **Hayır** — benim kaydım yok, onların bulgusu geçerli |
| 4 · Hex deseni SDK'yla birebir aynı, drift pini yok | tur 1 §"DRY — işaretlemediğim yüzeysel benzerlikler" md 2 (açıkça **tekrar değil** dedim) | **Hayır** — ben bulgu yazmadım; aynı yüzey, **farklı iddia** |

#### 3 numara gerçekten `low` mu? → **EVET, `low` DOĞRU.** (Severity gerekçesi)

`security`'nin "**tüm kiracılar** etkilenir" çerçevesi **blast radius** olarak doğru ama
**maruziyet penceresi** olarak fazla geniş. Ölçtüğüm kapı zinciri:

1. `registry.ts:94-96` `THEME_REGISTRY`'yi **modül yüklenirken** kurar →
   `buildRegistryEntry(modernTheme)` → `generateThemeCss()` → `assertValidVariableName`.
   Yani geçersiz bir `key` **import anında** fırlar (fail-closed, bilinçli).
2. Bu modülü **dört test dosyası** import ediyor (`registry.test.ts:5`,
   `theme-template-dispatch.test.ts:25`, `middleware.test.ts:60`, dolaylı `theme-css*.test.ts`).
   `myKey` gibi SDK'ya uyan ama vitrine uymayan bir anahtar eklenirse `pnpm test`
   **kırmızı** olur → PR birleşmez, dağıtım olmaz.
3. "Tüm kiracılar düşer" senaryosu bu yüzden **CI'ı atlatmayı** gerektirir; tek tema var ve
   ev içinde yazıldı; üçüncü taraf temalar **v1.6.0**.

⚠ **Not: bu zinciri kod okumasıyla kurdum, mutasyon KOŞTURMADIM** (koşturma yasağı). Kalan
gerçek kusur bir **ergonomi/doküman** kusuru: hata metni (`theme-css.ts:139-142`) "izin
listesine uymuyor" diyor ama **vitrinin SDK'dan sıkı olduğunu** söylemiyor; tema yazarı
SDK sözleşmesine uyduğu hâlde kırmızı alır ve nedenini aramak zorunda kalır. Bu tam olarak
`low` (iyileştirme önerisi). Vade: v0.0.21 (ikinci tema) — `security`'nin önerdiği vade doğru.

#### 4 numara (hex drift pini) için bir **yön kaydı** ekliyorum

`low` **doğru**, ama eklenecek pin **eşitlik pini OLMAMALI**. Gerekçe: `theme-css.ts:65-72`
kardeş desende (`CSS_VARIABLE_NAME_PATTERN`) SDK'dan **bilinçli olarak sapıyor** ve bu sapma
`theme-css.test.ts:89-96`'da ölçülüyor. Hex'te eşitliği pinlemek, bugün rastlaşan iki
bağımsız kararı **sözleşmeye** dönüştürür ve 3 numaranın tam tersi yöne baskı yapar. Doğru
pin yönü **alt küme**: "vitrinin kabul ettiği her değer SDK'nın da kabul ettiği bir değerdir"
(`∀v: storefront(v) ⇒ sdk(v)`). Bu, hem driftin zararlı yönünü (vitrin **gevşerse**) yakalar
hem de sıkılaşma özgürlüğünü korur. `architect`/`frontend`'e not.

---

## 5. Bağımlılık yönü, döngü, katman — FIX 1 sonrası yeniden ölçüm

| Kontrol | Ölçüm | Sonuç |
| --- | --- | --- |
| `apps/storefront` → `@arkesoft/errors` (**M1'in getirdiği yeni çalışma-zamanı bağı**) | `apps/storefront/package.json:19` `workspace:*` **bildirilmiş** | ✓ `apps/*` → `packages/*` |
| `packages/errors`'un iç bağımlılığı | yalnızca `zod` (CLAUDE.md §3) → `registry.ts` → `errors` → `zod`, **döngü yok** | ✓ |
| Yeni ana bağımlılık | **0** — eklenen her şey zaten bildirilmişti | ✓ |
| `packages/trpc` → `@arkesoft/errors` (harness) | `harness.ts:27`; barrel yorumu `packages/trpc`'yi tüketici olarak sayıyor | ✓ |
| `packages/*` → `apps/*` | yok | ✓ |
| `packages/ui` | T-012'de **hiç dosyası yok**; veri çekme / `trpc` bağımlılığı **yok** | ✓ |
| `packages/db` iş mantığı / `apps/storefront` yazma | FIX 1'de ikisine de dokunulmadı; vitrin yalnızca `query()` çağırıyor (`middleware.ts:194`) | ✓ |
| Çekirdekte sağlayıcı dallanması (`if (provider === ...)`) | 0 | ✓ |
| Dosyalar arası döngü (yeni) | `registry.ts` → `theme-css.ts` → `lib/assert-never.ts`; `ThemeTemplate.astro` → `registry.ts` (yalnızca `type`); `middleware.ts` → `registry.ts`. **Döngü yok** | ✓ |

---

## 6. Bulgular

**MEDIUM / HIGH / CRITICAL: yok.**

### LOW (düzeltme turu açmaz — ROADMAP teknik borç satırları)

| # | `dosya:satır` | Açıklama | Önerilen düzeltme | Sorumlu | Vade |
| --- | --- | --- | --- | --- | --- |
| **N1** | `apps/storefront/src/themes/theme-css.ts:100` ve `:159-160` | Yorumlar **var olmayan** bir fonksiyona atıf yapıyor: `formatFontFamilyDeclaration`. Gerçek ad `formatFontFamily` (`:181`). FIX 1'in getirdiği iki bayat atıf; `rg "formatFontFamilyDeclaration"` → yalnızca bu 2 yorum eşleşmesi, tanım **yok** | İki atfı `formatFontFamily`'ye çevir | `frontend` | v0.0.11 |
| **N2** | `apps/storefront/src/themes/theme-css.ts:122-127` | `ThemeCssGenerationError`'ın gerekçe yorumu ölçüm olarak *"`rg -n "extends AppError" apps/storefront` → 0 eşleşme"* diyor. FIX 1 bunu **kendi eliyle çürüttü**: `registry.ts:169` artık `extends AppError`. **Kararın kendisi savunulabilir kalıyor** (modül yüklenirken fırlar, HTTP/i18n sözleşmesi taşımaz) — kusur, kararın **taşıyıcı gerekçesinin artık yanlış bir ölçüm** olması. Bu projenin yinelenen sınıfı (bayat yorum karar verdirir: tur 1'de K-A'yı tam bu mekanizma yanlış yönlendirmişti) | Ölçüm cümlesini sil; gerekçeyi `registry.ts:119-129`'un (`ThemeRegistryIntegrityError`) **doğru** formülasyonuyla hizala — "açılış-anı hatası, `userMessageKey` anlamsız" | `frontend` | v0.0.11 |
| **N3** | `apps/storefront/src/themes/registry.ts:219-222` (+ `:130`) | **Kullanılmayan export.** `ResolvedTheme` hiçbir yerden import edilmiyor (`rg` apps genelinde: yalnızca kendi dosyasındaki tanım/yorumlar); tek tüketici `middleware.ts:247` onun yerine `ReturnType<typeof resolveTheme>` yazıyor — adlandırılmış tip varken dolaylı türetme. Aynı dosyanın `:186-188` yorumu "kapalı yüzey KORUNUR" ilkesini savunuyor, bu export onunla çelişiyor. ⚠ `ThemeRegistryIntegrityError` (`:130`) de export, hiçbir yerden import edilmiyor — **tur 1'den kalan, benim kaçırdığım** bir kayıt | `middleware.ts:247`'yi `import type { ResolvedTheme }` ile yaz; `ThemeRegistryIntegrityError` için ya `export`'u kaldır ya bir test onu import edip bütünlük hatasını assert etsin (ikincisi daha değerli: `:106-117` bugün hiç test edilmiyor) | `frontend` | v0.0.11 |
| **N4** | `apps/storefront/src/themes/theme-css.ts:181-183` | `formatFontFamily` tırnaklama kararını **yalnızca boşluk** varlığına bakarak veriyor. Girdide tırnaklı gelen ama CSS `<custom-ident>` olarak **geçersiz** bir aile adı (ör. `"1Font"`, `"inherit"`) tırnaksız yazılır → `--font-*` özel özelliği geçerli ama `font-family: var(--font-*)` **hesaplanmış-değer anında geçersiz** olur, tipografi sessizce varsayılana düşer. Enjeksiyon/kural kırılması **YOK** (o yüzden `low`, `medium` değil); eksik olan **negatif test**: `theme-css.test.ts:136-155` dengesiz tırnağı kapsıyor, bu sınıfı kapsamıyor | Kararı "boşluk içeriyor" yerine "geçerli ident dizisi değil" ölçütüne bağla (rakamla/`-`+rakamla başlayan ve CSS-wide keyword olan adlar tırnaklanır); iki `it.each` vakası ekle | `frontend` | v0.0.11 |
| **N5** | `apps/storefront/src/themes/__tests__/theme-template-dispatch.test.ts:30,36-41` | Grep **yorum satırlarını elemiyor**, oysa dosya başı (`:5-8`) kardeş pinin desenini kullandığını söylüyor ve o kardeş (`theme-css-no-literal-keys.test.ts:30-34` `codeLinesOf`) **eliyor**. Yorumda prose olarak `currentThemeKey === '<anahtar>'` yazılırsa pin **yanlış YEŞİL** bir girdi kazanır (gerçek dal silinse bile küme eşitliği korunur). Bugün 0 yanlış eşleşme (ölçtüm) — L8'in (`migration-sql.test.ts`) **vitrindeki kardeşi**, aynı ev kuralı iki yerde uygulanmamış | `codeLinesOf`'u paylaş/çoğalt ve grep'i yalnızca kod satırlarında çalıştır | `frontend` | v0.0.11 (L8 ile aynı borç kümesi) |
| **N6** | `apps/storefront/src/themes/registry.ts:85` + `:238` | M2'nin **artığı**: `${id}@${version}` birleştirmesi modül içinde iki yerde. Tur 1'in zarar yolu kapandı (her iki üretici testle pinli **ve** fail-closed — ayrıntı §1/M2), bu yüzden `medium` değil | `function buildRegistryKey(id: string, version: string): string` çıkar, iki çağrı yerini ona bağla | `frontend` | v0.0.21 (ikinci kayıt girdisiyle) |
| **N7** | `apps/storefront/src/middleware.ts:214-223` ↔ `:258-259` | **Gerçek (yüzeysel değil) tekrar:** "HTTP durumu → `/404` mı `/503` mü" kuralı aynı fonksiyonda **iki kez** kodlanmış — biri `StorefrontApiFailure` üzerinden exhaustive `switch` + `assertNever`, diğeri çıplak ternary. Aynı sebeple değişecek iki yer (ör. 410 → ayrı sayfa eklenirse ikisi de). Ternary yolu `assertNever` korumasından da **yoksun** | `map-api-error.ts:69-71` `toFailureFromStatus`'u export et; tema dalı da `switch (toFailureFromStatus(error.httpStatus).kind)` üzerinden geçsin — tek kural, tek exhaustive switch | `frontend` | v0.0.11 (L6'nın çıkarma düzenlemesiyle aynı yerde) |

---

## 7. Ölçemediklerim (§5)

- **`Bash` aracım yok** → `git diff`/`rg` **komutlarını kendim koşturamadım**; tüm "ölçüm"
  ifadelerim `Grep`/`Glob`/`Read` araçlarıyla yapılan **dosya içeriği taramalarıdır**.
  Handoff'un sekiz mekanik pin diff'i için Orkestratör'ün ölçümünü **olduğu gibi** kabul
  ediyorum (tur 1'deki boşluğum bu turda **Orkestratör tarafından kapatıldı**).
- `pnpm test` / `typecheck` / `lint` / `build` / e2e **koşturmadım** (talimat).
  1015 test · 21/21 · 13/13 · 18/18 sayıları handoff'tan aktarılıyor.
- **Mutasyon koşturmadım.** M3'ün iki yönlü mutasyon çıktısını ve M4'ün üç katmanlı
  ayrımını **yapısal olarak doğruladım** (ilgili assertion'ları ve `toEqualTypeOf`'un iki
  yönlülüğünü okuyarak), **bağımsız olarak yeniden ölçmedim**.
- `security`'nin 1 ve 2 numaralı `low`'larının **kendi dosyalarını okumadım**
  (`asset-ref.ts`, SEC-5a yüzeyi) — çakışma kontrolünü benim 13 kaydımın **kapsamı**
  üzerinden yaptım, onların bulgusunun **doğruluğunu** denetlemedim.
- `procedures.test.ts` **tam okunmadı** (ilgili dört `describe` bloğu + bağlam okundu);
  `apps/api`'nin 15 hata sınıfının gövdeleri **tek tek okunmadı** — `userMessageKey`
  anahtarlarının katalogda bulunmadığını **grep ile küme düzeyinde** ölçtüm.
- `.astro` dosyaları `tsc`/ESLint/Prettier kapsamında olmadığı için
  `ThemeTemplate.astro`'nun **derlenebilirliğini** doğrulayamam; `pnpm build` 13/13
  yeşil ölçümüne dayanıyorum.

---

## ÖLÇÜMLER

```
İncelenen dosya                      : 18 (11 tam, 7 kısmi) — FIX 1 yüzeyi + kapanış kanıtı
`any` (üretim + test)                : 0  (7 eşleşmenin TAMAMI yorum metni — ölçüldü)
`@ts-ignore` / `@ts-expect-error`     : 0
`catch {}` (boş blok)                : 0
`null`'a çevrilip yutulan hata        : 0
Doğrulanmamış `as` (ÜRETİM)           : 0  ← tur 1: 1 (middleware.ts:264). TEYİT EDİLDİ
Doğrulanmamış `as` (test)             : 1  (registry.test.ts:51 = L13) + 20 × `as unknown as` mock (T-009 idiomu, kapsam dışı)
`as const` / `as const satisfies`     : 4  (meşru)
En büyük fonksiyon                    : middleware.ts:135-280 `onRequest` — 146 satır (tur 1: 147 → −1)
İkinci                                : theme-css.ts:211-263 `declarationsOf` — 53 satır (37'si gerekçe yorumu)
Exhaustive switch + assertNever       : 3 (theme-css.ts:260-261, middleware.ts:221-222, storefront-tenant-context.ts)
Kullanılmayan export (yeni ölçüm)     : 2 (registry.ts:219 `ResolvedTheme`, :130 `ThemeRegistryIntegrityError`) = N3
Döngüsel bağımlılık                   : 0
Katman ihlali (apps ↔ packages)       : 0
Çekirdekte sağlayıcı dallanması       : 0
`packages/ui` değişikliği             : 0
Tur 1 medium kapanışı                 : 4/4 KAPANDI (M1 · M2 · M3 · M4)
Tur 1 low kapanışı                    : 1/13 KAPANDI (L1) · 12 AÇIK
Bulgu                                 : 0 critical · 0 high · 0 medium · 7 low
```
