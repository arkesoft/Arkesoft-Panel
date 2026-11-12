# T-018 — `solid` gate, tur 1

- **Tarih:** 2026-11-11
- **Sürüm:** ROADMAP `v0.0.21` (sürüm kayıt modeli)
- **Araç kısıtı:** Read / Grep / Glob. **Bash YOK** — hiçbir komut koşturulmadı.
  Komut gerektiren her iddia `DOĞRULANAMADI:` ile işaretlendi.

```
GATE: solid
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] packages/theme-sdk/src/__tests__/purity.test.ts:11-12 ve :129-130 (desenler :132-134) — saflık pini "parseSemver/compareSemver/satisfies HÂLÂ ithal edilmez … Bu test o iddiayı kod satırları üzerinde DENETLER" diyor; desen PAKET seviyesinde çalışır, SEMBOL seviyesinde DEĞİL — `import { compareSemver } from '@arkesoft/versioning'` negatif lookahead'den geçer ve test YEŞİL kalır — `@arkesoft/versioning` import satırlarının isimli bağlarını {SEMVER_CORE_PATTERN_SOURCE, SEMVER_FORMAT_PATTERN, extractMajor} kümesine pinleyen bir assertion ekle VEYA iki yorumdan sembol iddiasını kaldır — S3 (theme-sdk) / qa
  - [SEV: low] packages/versioning/src/__tests__/support-window.test.ts:6-11 ve :32-42 — yorum "saflık taraması `src` ağacının TAMAMINI (test dosyaları DAHİL) tarıyor" diyor; purity.test.ts:37-42 yalnızca `src/*.ts` dosyalarını tarar (`entry.isFile()`), `src/__tests__/` dizin olduğu için kapsam dışı — kendi doc'u da "test dosyaları HARİÇ" diyor. Yanlış öncül `Reflect.construct(Date, [0])` (:43) karmaşıklığının TEK gerekçesi — yorumu düzelt, fikstürü `new Date(0)`'a indir — S1 (versioning)
  - [SEV: low] packages/versioning/src/__tests__/snapshot.test.ts:51-58 — nesne literalinde `__proto__:` prototip ATAYICISIDIR, own property ÜRETMEZ → `Object.keys` görmez → Zod `strictObject` onu hiç değerlendirmez; redde sebep YALNIZCA `extraUnknownKey` (:55). Test adının "(prototip kirlenmesi sınıfına karşı)" iddiası ve snapshot.ts:21-26'nın SEC-9 beyanı KANITLANMIYOR — gerçek vektörü `JSON.parse('{"__proto__":{…}}')` ile ekle (kardeş describe :108-124 zaten `JSON.parse` kullanıyor) — S1 (versioning) / qa
  - [SEV: low] packages/versioning/src/range.ts:246-253 ve :261-266 — `satisfies`/`isThemeReleaseCompatibleWithSdk` fail-closed; "geçersiz aralık" ile "uyumsuz sürüm" ayrımı KAYBOLUYOR ve adlandırılmış sarmalayıcı ayrımı geri kazanma yolu SUNMUYOR. Repodaki emsal şekil ayrımlı birleşim + sebep: packages/tenancy/src/resolve-host.ts:71-74 (`{kind:'unresolved', reason}`) — v0.16.0'da tüketici yazılırken `satisfiesWithReason`/ayrımlı birleşim additive olarak eklensin — architect / S1, vade v0.16.0
  - [SEV: low] packages/theme-sdk/src/__tests__/migration-chain.test.ts:151-153 ve packages/theme-sdk/src/manifest/__tests__/validate-manifest.test.ts:305 — SİLİNMİŞ `semver-format.ts` / `semver-format.test.ts` dosyalarına atıf veren bayat yorumlar (S3 bulduğunu bildirdi, dosya listesinde olmadığı için dokunmadı) — atıfları `@arkesoft/versioning/src/semver.ts` ve `src/__tests__/semver.test.ts` olarak güncelle — S3 / docs
  - [SEV: low] packages/db/src/__tests__/version-registry-seed.test.ts:64-73 — test adı "platform sürümüyle EŞİT OLMAK ZORUNDA DEĞİLDİR (… BAĞIMSIZ bir semver birimi)" diyor; iki assertion yalnızca `SEMVER_LIKE_PATTERN` kontrol ediyor ve bu iddia :45 ile :61'de ZATEN var. Fiilen no-op, adı fazlasını vaat ediyor — testi kaldır veya adını "ikisi de semver biçiminde" yap — S5 (db)
  - [SEV: low] packages/versioning/src/__tests__/snapshot.test.ts:35, packages/db/src/__tests__/version-registry-seed.test.ts:40 ve :56 — runtime doğrulaması olmadan `as` zorlaması (CLAUDE.md §2: `as` yalnızca Zod'dan HEMEN SONRA). Aynı sürümün üretim kodu `as`'ten bilinçle kaçındı (semver.ts:85-92, range.ts:63-86) — tutarsızlık; `Object.keys` için `satisfies`/yerel tip, package.json okuması için Zod kullan — S1 / S5
  - [SEV: low] packages/db/src/seed.ts:88-284 — `main()` 197 satır (bu sürümde ~100 satır büyüdü: üç yeni upsert). Tek sorumluluk/okunabilirlik: `seedVersionRegistry(tx, versionValues)` ve `seedTenantVersionState(tx, …)` olarak ayrılabilir — davranış değişmez — S5 (db)
  - [SEV: low] packages/versioning/src/index.ts:7-36 — 23 dışa açılan simgeden yalnızca İKİSİ üretimde tüketiliyor (`SEMVER_CORE_PATTERN_SOURCE` → manifest.ts:54, `extractMajor` → chain.ts:58); `parseRange` yalnızca bir TEST tarafından; `support-window.ts`'in TAMAMI (5 fonksiyon + 5 sabit, 237 satır) ve `snapshot.ts` SIFIR tüketicili. ADR-0020 bu "ölü sözlük" riskini açıkça kabul ediyor, tüketici v0.16.0 — ROADMAP borç satırı aç, v0.16.0'da tüketilmeyen export kalırsa KALDIR — architect, vade v0.16.0
  - [SEV: low] packages/versioning/README.md:35-38 — "destek penceresi fonksiyonları TOPLAMDIR … `undefined` dönemez" iddiası YANLIŞ: `countPlatformMinorsBehind` (support-window.ts:58-66) `number | undefined` döner ve kendi doc'u bunu kabul ediyor — README'de istisnayı yaz — S1 (versioning) / docs
  - [SEV: low] packages/versioning/src/semver.ts:65-66 — `SEMVER_CORE_PATTERN_SOURCE`'un beyan edilmiş değişmezi ("ÇAPA TAŞIMAZ") için hiçbir DOĞRUDAN iddia yok; hiçbir test dosyası bu sabiti import etmiyor. Dolaylı kapsam VAR (çapa eklenirse range-grammar-equivalence.test.ts:57'nin `'>=0.1.0 <1.0.0'` pozitif vakası kırmızıya düşer) — bu yüzden low; tek satırlık doğrudan assertion ekle — S1 (versioning)
ÖLÇÜMLER: incelenen dosya 27 · `any` 0 · `@ts-ignore`/`@ts-expect-error` 0 · runtime-doğrulamasız `as` 3 (hepsi test dosyası) · en büyük fonksiyon `packages/db/src/seed.ts:88-284` `main()` = 197 satır (packages/versioning içindeki en büyük: `parseSemver`, semver.ts:116-151 = 36 satır) · döngüsel bağımlılık 0 · katman ihlali 0
```

**FAIL kuralı (AGENT_BASELINE §4) uygulaması:** `critical` 0, `high` 0, `medium` **1**
(3'ün altında) → **PASS**. On `low` → düzeltme turu açılmaz, ROADMAP teknik borç
tablosuna yazılır. SD-1 (`medium`) de borca gider; ama düzeltmesi **tek bir
assertion** olduğu için Orkestratör'e, `docs`/`release`'den önce "yolu üstündeyse
kapat" olarak işaretlemesini öneriyorum (zorunlu değil).

---

## On inceleme noktası — nokta nokta karar

### 1. İki katmanlı API (`sınırda undefined`, `ötesinde TOPLAM`) — tutarlı mı?

**İncelendi. İlk yarı: bulgu yok. İkinci yarı: SD-4 (`low`).**

**(a) `undefined` CLAUDE.md §4 ile çelişiyor mu?** **Hayır — meşru bir sınır
istisnası.** Nasıl ölçtüm: §4'ün kuralı *domain işlemleri* içindir ("beklenen
durumlar için hata fırlat") ve kardeş kuralları (`IntegrationError`'a çevirme,
`AppError` hiyerarşisi) kuralın bir **hata hiyerarşisinin mevcut olduğunu**
varsaydığını gösteriyor. Bu paket `@arkesoft/errors`'a bağımlı olamaz (ADR-0020
Karar 2, bağlayıcı). Repoda **ölçülmüş emsal** var: `packages/tenancy` (diğer saf,
I/O'suz paket) `normalizeHostname(raw): string | undefined` dışa açıyor
(`packages/tenancy/src/resolve-host.ts:89`). `extractMajor`'ın `undefined` şekli de
v0.0.9'dan beri kabul görmüş. `parseSemver`/`parseRange` aynı sınıftır ("parse,
don't validate"). Tutarlılık da sağlam: `semver.ts:53-62`, `range.ts:89-93`,
`README.md:30-39` aynı ilkeyi aynı sözcüklerle anlatıyor.

**(b) `satisfies`'ın fail-closed'u ayrımı kaybediyor mu, çağıran ayırt edebilir mi?**
Çağıran **edebilir** (`parseRange` dışa açık, index.ts:17) ama **adlandırılmış
sarmalayıcı** `isThemeReleaseCompatibleWithSdk` (range.ts:261-266) **edemez** —
v0.16.0'ın uzanacağı API tam olarak o. Somut senaryo: `theme_release.sdk_range`
kolonunda **DB seviyesi biçim CHECK'i YOK** (schema.prisma:655-658 bunu açıkça
yazıyor); bozuk bir `sdk_range` satırı → `false` → kiracıya "tema uyumlu değil"
gösterilir → platform veri bütünlüğü arızası **kalıcı olarak maskelenir**
(CLAUDE.md §10 md 16'nın sınıfı). Repo bu sorunu **zaten çözmüş**:
`resolve-host.ts:71-74` `{kind:'unresolved', reason: HostResolutionFailureReason}`
döner ki `apps/api` 400 ile 404'ü ayırabilsin. → **SD-4**, `low` (bugün tüketici
yok, düzeltme additive, ADR bilinçli karar verdi; AGENT_BASELINE §4 "emin değilsen
bir alt seviye").

### 2. `support-window.ts` — dört fonksiyon, ikisi aynı aritmetik: DRY ihlali mi?

**İncelendi, bulgu yok. `architect`'in kararı DOĞRU; birleştirme daha kötü olurdu.**

Nasıl ölçtüm: aritmetik **tek** özel yardımcıda yaşıyor (`isWithinMajorWindow`,
support-window.ts:101-110); `isThemeSdkVersionSupported` (:116-125) ve
`isThemeVersionSupported` (:131-140) ikisi de ona delege ediyor — **kopyalanmış tek
satır yok**. DRY'ın yasakladığı şey bilgi tekrarıdır; burada bilgi tek yerde.
Birleştirmek, `ROADMAP` Sürüm Politikası §6'nın **ayrı maddelerde** tanımladığı iki
kuralı tek değişim ekseninde kilitlerdi — benim kontrol listemin "farklı sebeplerle
değişecek iki şeyi birleştirmek daha kötüdür" maddesinin tam kendisi.

**"Ölü/ikiz API mi?"** Bugün **ayırt edilemez**, evet — ama bu ikizliğin değil
**tüketicisizliğin** sonucu (madde 10, SD-9). İki ayrı ad + iki ayrı sabit
(`THEME_SDK_SUPPORTED_MAJOR_WINDOW` / `THEME_SUPPORTED_MAJOR_WINDOW`) tam olarak
"ileride ayrışabilirler" taahhüdünün maliyeti; dürüstlük notu (:26-32) gizleme
yapmıyor. Parametre adı asimetrisi (`latest` vs `latestForTheme`) kişisel tercih
sınırında — bulgu yazmıyorum.

### 3. `semver.ts`'in iki sorumluluğu — ayrılmalı mıydı?

**İncelendi, bulgu yok.** Nasıl ölçtüm: iki küme **aynı tek kaynağı** paylaşıyor —
`parseSemver` (:117) ve `extractMajor` (:80) ikisi de `SEMVER_FORMAT_PATTERN`
(:72) üzerinden gidiyor. Ayırmak o regex'i dosya sınırı üzerinden ithal etmeyi
gerektirirdi ve `index.ts` ikisini de aynı barrel'dan yeniden açtığı için
**tüketicinin gördüğü yüzey değişmezdi** — yani ayırma, benim medium bulgum
SD-1'in kapatmadığı riski de kapatmazdı. "Birden fazla sebeple değişir mi?" testi:
ikisi de semver.org spesifikasyonu değiştiğinde değişir — **tek sebep**. Dosya
262 satır ama bunun 63 satırı (`:1-62`) taşınan kurumsal bellek yorumu; kod gövdesi
~200 satır, en büyük fonksiyon 36 satır.

### 4. ⚠⚠ TEST KALİTESİ (en önemli madde)

**`purity.test.ts` (versioning, 2 test)** — assertion'lar gerçek:
`expect(violations).toEqual([])` (:93) + `expect(packageJson.dependencies).toEqual({zod:'catalog:'})`
(:108). `expect(files.length).toBeGreaterThan(0)` (:78) vacuous-korumasını da
taşıyor. **Kaçış analizi (brief'in sorduğu):**
- `globalThis.Date` / `Reflect.construct(Date, …)` / dinamik `import()` **gerçekten
  yakalanmıyor** — FORBIDDEN_PATTERNS (:44-73) yalnızca `Date.now(` ve `new Date(`
  dizgilerini arıyor. Ama bu bir **bulgu değil**: pin, kazara saflık kaybına karşı
  mekanik bir kapıdır, kötü niyetli kaçınmaya karşı değil; ve gözden geçirme
  koşulu 2 (ADR-0020) insan incelemesini zaten şart koşuyor. Üretim kodunda
  `globalThis.Date`/`Reflect.construct` **yok** (support-window.ts'i satır satır
  okudum; yalnızca `structuredClone` + `setUTC*` var).
- **"S1 fikstürlerde `Reflect.construct(Date,[0])` KULLANDI — kendi testini
  atlatmak mı?"** → **HAYIR, ama meşru fikstür tekniği de DEĞİL: GEREKSİZ.**
  Ölçüm: `productionSourceFiles()` (purity.test.ts:38-42) `readdirSync(SRC_DIR,
  {withFileTypes:true})` + `entry.isFile()` kullanıyor; `src/__tests__` bir
  **dizin**dir → filtreden geçmez. Fonksiyonun kendi doc'u (`:37`) "test dosyaları
  **HARİÇ**" diyor. Yani test dosyaları **hiç taranmıyor** → atlatılacak bir kapı
  yok, `new Date(0)` serbestti. `support-window.test.ts:6-11` ve `:32-42`'nin
  "test dosyaları DAHİL" iddiası **yanlış** → **SD-2** (`low`).
- Yan sonuç: pinin `new Date\(` yasağı **aşırı geniş** (`new Date(x)` saftır;
  yalnızca sıfır-argümanlı hâli impure) ve üretim kodunu `structuredClone`'a
  itiyor (support-window.ts:186, :234, yorum :38-42 bunu kabul ediyor). Bugün
  davranışsal sonuç yok, SD-2'nin düzeltmesiyle aynı yerde kapanır.

**`support-window.test.ts` (21 test)** — **vacuous olan yok.** Dört `describe` + bir
beşinci ((e) 30 gün). Sınırların üçü de gerçek: N-2 içeride / N-3 dışarıda (:72-75),
ay-sonu kırpması `2028-02-29`+12ay→`2029-02-28` ve **Mart'a taşmadığı** ayrıca
iddia ediliyor (:131-137), kapsayıcılık üç noktada (`sunset-1ms` true,
`sunset` false, `sunset+1ms` false, :150-163). İki saflık testi girdi
mutasyonunu pinliyor (:139-144, :178-183). "Pencere sabiti 2dir" türü üç test
(`:59`, `:92`, `:108`) tek başına zayıf ama davranış testleriyle **birlikte**
sabitin yanlışlıkla değiştirilmesini yakalar — bulgu değil.

**`range.test.ts` (27 test)** — **yeterli.** Negatif kanıt tam (`'1.0.0'`→false
:68, `'0.0.9'`→false :72, `'0.5.0'`→true :76 ile birlikte totoloji değil); npm 0.x
sınırları üç operatör için **iki yönlü** (:98-116, alt VE üst sınır); ön-sürüm
kuralının istisnası ve istisnanın **tetiklenmediği** hâl de var (:136-138).
Tek zayıf nokta: `satisfiesParsed` için yalnızca mutlu yol (:156-165) — ama
`satisfies` üzerinden dolaylı olarak 20+ kez koşuyor; bulgu yazmıyorum.

**`snapshot.test.ts` (13 test)** — yeterlilik pini **çift katmanlı ve doğru**:
alan adı kümesi (:24-25) + her alanın **tek tek** zorunluluğu (:34-47, yorumu
:28-33 "tamlık testi tek başına optional yazımını yakalayamaz" riskini açıkça
kapatıyor). Negatif JSONB vakaları gerçek `JSON.parse` üzerinden (:108-124).
**Ama** `__proto__` vakası inert → **SD-3** (`low`), yukarıda mekanizması yazılı.

**`version-registry-seed.test.ts` (7 test) — S5'in "BAĞIMSIZ ikinci okuma"sı
GERÇEKTEN bağımsız mı? → EVET, totoloji DEĞİL.** Ölçüm:
- `:38-39` testin kendi `readFileSync(new URL('../../package.json', import.meta.url))`
  → `src/__tests__/` → `packages/db/package.json`.
  `resolvePlatformVersion()` (version-registry-seed.ts:86) `new URL('../package.json',
  import.meta.url)` → `src/` → **aynı dosya, farklı kod yolu**. Fonksiyonun dönüşü
  kendisiyle değil, **ikinci bir okumayla** karşılaştırılıyor (:44). Bağımsız.
- `:54-55` → `../../../trpc/package.json` → `packages/trpc/package.json`;
  `resolveApiVersion()` (:95) → `../../trpc/package.json` → aynı dosya. Bağımsız.
- AC-2 türetme testi (:77-89) iki tarafı da `modernTheme.manifest`'ten okuyor —
  bu **manifest↔çözücü** bağını pinler (manifest değişirse kırmızı), tek başına
  "çözücü doğru mu" demez; o yüzden **ikinci bir test** (:91-104) bugünkü
  manifest değerlerini literal olarak pinliyor. İkisi **birlikte** yeterli.
- `:106-111` (`resolveVersionRegistrySeedValues` ≡ iki çözücü) totolojiye yakın
  ama `platformVersion`/`apiVersion` **yer değiştirmesini** yakalar — kabul.
- `:64-73` fiilen no-op → **SD-6** (`low`).
- `readPackageVersion` hata yolu (:115-118) argümansız `.toThrow()` — zayıf ama
  kabul; Zod yolu (versiyon alanı eksik/boş) test **edilmemiş**, 2 satırlık şema
  olduğu için bulgu yazmıyorum.

**`version-registry-state.isolation.test.ts` (1 test, AC-11) — doğrulandı.**
`:40-43` `tenant`'ı DB'den okuyor, `:62-67` `tenantVersionState`'i DB'den okuyor
(`withTenant` içinde, RLS+FORCE gerekçesi `:59-61`'de yazılı), `:78-79` **iki DB
satırını** karşılaştırıyor. `DEMO_SEED`'den gelen tek değer `tenant.slug`
(arama anahtarı) — karşılaştırmaya girmiyor. Sabitle karşılaştırma **yok**.
`:45-57` ve `:69-73` üç ayrı "seed koşmamış" dalını hataya çeviriyor → test
`undefined === undefined` totolojisine **düşemez**. Yapısal olarak sağlam.

**`range-grammar-equivalence.test.ts` (7 test) — beş `false⟺false` totoloji riski
taşıyor mu? → HAYIR.** Ölçüm: `:72` eşdeğerliği iddia ediyor (`patternAccepts
=== parseRangeAccepts`), `:77` **mutlak beklenen yönü** iddia ediyor
(`patternAccepts === expectedAccepted`). Fikstür listesinde **iki pozitif** vaka
var (`'^0.1.0'` :56, `'>=0.1.0 <1.0.0'` :57, ikisi de `expectedAccepted: true`).
Dolayısıyla "iki taraf da her şeyi reddetse yeşil kalır" senaryosu **imkânsız**:
o iki satır `:77`'de kırmızıya düşer. Dosya başı `:74-76` bu riski zaten
adıyla anıp kapatıyor. **Brief'in endişesi yerinde ama kod onu çözmüş** — bulgu
yok.

**S3'ün kaldırdığı 8 test (`semver-format.test.ts`) — kapsam korundu mu?**
- `DOĞRULANAMADI:` silinen dosyanın içeriğini okuyamam (Bash/`git show` yok).
  Hangi 8 iddianın olduğunu **ölçemedim**; "kapsam birebir korundu" **diye
  yazmıyorum**.
- Bugünkü kapsamı **ölçtüm**: `packages/versioning/src/__tests__/semver.test.ts`
  `SEMVER_FORMAT_PATTERN` kabul (:16), `extractMajor` üç geçerli biçim (:17-19),
  ön-sürüm+build (:22-26), **B4 sapma sınıfı `'1.0.0-01'` iki yönlü** (:28-31),
  beş biçimsiz girdi (:33-39) → B4 ekseni **eksiksiz** burada.
- **Bir eksen doğrudan pinsiz kaldı:** `SEMVER_CORE_PATTERN_SOURCE`'un
  "çapa taşımaz" değişmezi (semver.ts:65-66). Hiçbir test bu sabiti import
  etmiyor (`packages/versioning` ve `packages/theme-sdk` testlerinde grep'le
  doğruladım). Dolaylı kapsam var (çapa eklenirse manifest'in gömülü üst deseni
  ve `range-grammar-equivalence.test.ts:57` kırılır) → **SD-11**, `low`.
  Bu eksenin eski dosyada test edilip edilmediğini **bilmiyorum**.

### 5. ⚠⚠ `purity.test.ts` pin daraltması — "gevşetme" mi? **AÇIK KARAR**

**CLAUDE.md §10 md 6 ihlali DEĞİL.** Gerekçe: md 6 "kabul kriterini geçirmek için
testi gevşetmek"i yasaklar. Burada daraltmanın sebebi bir kriteri geçirmek değil;
**ADR-0020 Karar 2'nin kendisi** o kenarı açıyor ve `semver-format.ts:4-9`'un
kısıt metni "yalnızca gerekçeli bir ADR ile açılabilir" diyordu — yani kısıt
**kendi kapısını** gösteriyordu. `architect`'in R-A5'i ("aynı kararın zorunlu
ikinci yarısı") **doğru**. Üstelik daraltma **cerrahi**: negatif lookahead
`(?!versioning['"])` alt-yol ithalini de kapatıyor (`'@arkesoft/versioning/internal'`
→ `/` ≠ alıntı → lookahead geçer → **yasaklı**), ve `:190-193`'ün
`dependencies` iddiası `toEqual` ile **genişletilerek** üçüncü bir paketi
yakalamaya devam ediyor. Test adı `:178`'de güncellendi (bayatlamadı).

**AMA daraltmanın ilan ettiği YENİ garanti UYGULANMADI** → **SD-1 (`medium`)**.
`:11-12` ve `:129-130` "bu paket hâlâ `parseSemver`/`compareSemver`/`satisfies`
İTHAL EDEMEZ … **Bu test o iddiayı kod satırları üzerinde DENETLER**" diyor; desen
paket seviyesindedir. Somut başarısızlık: v0.16.0'da biri `migrations/chain.ts`'e
`import { compareSemver } from '@arkesoft/versioning'` ekler (tema sürümlerini
sıralamak için makul bir hamle), `purity.test.ts` **yeşil kalır**, ADR-0020
Karar 2'nin bağlayıcı kısıtı ("theme-sdk hâlâ karşılaştırma yapmaz") **sessizce**
düşer. Bu, `semver-format.ts:4-9`'un var olma sebebinin tam olarak geri açılması.
Düzeltme tek assertion: `@arkesoft/versioning`'den ithal edilen isimli bağların
kümesi ⊆ {`SEMVER_CORE_PATTERN_SOURCE`, `SEMVER_FORMAT_PATTERN`, `extractMajor`}.

### 6. ⚠⚠ `packages/db` → `packages/themes/modern` üretim kenarı — KATMAN İHLALİ Mİ? **AÇIK KARAR**

**KATMAN İHLALİ DEĞİL. KABUL. Bir `low` borç notu (SD-9 ile birlikte değil, ayrı
gerekçe aşağıda) — ama bu sürümde bulgu açmıyorum.**

Nasıl ölçtüm:
1. **Yazılı kural ihlali yok.** CLAUDE.md §3 yalnızca iki kenarı yasaklıyor:
   `packages/ui` → (uygulama | `trpc`) ve `packages/errors` → (herhangi bir iç
   paket). `packages/db` için yasak olan şey **"iş mantığı"**dır; `seed` ise
   §3'te `packages/db`'nin **"Yapar"** sütununda yazılı. Tema fixture'ının
   doğruluk kaynağını **temanın kendi manifestinden** okumak seed verisi
   türetmesidir, iş mantığı değil.
2. **Döngü yok.** Ölçtüm: `themes-modern` → `theme-sdk` → `versioning` → (yalnızca
   `zod`). `theme-sdk`/`themes-modern` `@arkesoft/db`'ye bağımlı **değil**
   (package.json'ları okudum). `db` → `{config, errors, themes-modern, …}`.
   Yön `packages/*` → `packages/*`, zaten var olan bir sınıf (`db` → `errors`).
3. **`po`'nun reddettiği alternatif gerçekten daha kötü.** Testi tema paketine
   koymak `themes-modern` → `db` kenarını doğururdu: **veri katmanına doğru ters
   yön** ve `themes-modern` → `theme-sdk` → … zincirine Prisma'yı sokardı.
4. **S5'in `devDependencies`'ten sapması DOĞRU.** `prisma.config.ts:53` seed'i
   `node --env-file-if-exists=../../.env dist/seed.js` olarak koşturuyor —
   `dist/version-registry-seed.js`'in `@arkesoft/themes-modern` importu
   **üretim kod yolundadır**. `devDependencies`'te olsaydı `pnpm install --prod`
   bağlamında çözümsüz kalırdı. Gerekçe ölçülebilir ve doğru.
5. **"`node dist/` yolu test edilmiyor" endişesini AÇTIM ve KAPATTIM:**
   `.github/actions/prepare-db/action.yml:88` CI'da `pnpm db:seed` koşuyor ve o
   script `node dist/seed.js`'e iner (package.json:36 → `run-guarded-prisma.js
   db seed` → prisma.config.ts:53). Yani düz-node yolu **mekanik olarak kapılı**.
   Bulgu yok.

**Kabul ettiğim kalıntı risk (bulgu değil, `architect`'e not):**
`@arkesoft/themes-modern`'in `exports["."]` değeri **ham `.ts`**
(`./src/theme.config.ts`, package.json:8) ve `packages/db` bu paketin **ilk
düz-Node tüketicisi** (önceki tek tüketici `apps/storefront` = Astro/Vite).
Dolayısıyla `pnpm db:seed`'in doğruluğu artık Node'un tip-soyma yeteneğine
bağlı (kök `engines.node >= 24.0.0` bunu karşılıyor; `theme.config.ts`'i okudum
— `enum`/`namespace`/parametre özelliği **yok**, soyulabilir). İkinci bir tema
(`corporate`) eklendiğinde `packages/db` ya **her temaya** bağımlı olmak ya da
AC-10'un sıfır-literal şartını bırakmak zorunda kalır. ADR-0020'nin gözden
geçirme koşulu 4 ikinci temayı zaten yeniden-açma sebebi sayıyor; **o maddeye
bu kenarın da eklenmesini öneriyorum** (`docs`/`architect`, vade v0.1.x).
`DOĞRULANAMADI:` tip-soymanın bu makinede fiilen çalıştığını **koşturarak**
ölçmedim; taban koşumun `test:isolation 11/11` yeşili (AC-11 testi seed verisi
istiyor) buna dolaylı kanıttır.

### 7. `version-registry-seed.ts` doğru yer mi? `readPackageVersion`'ın dışa açılması meşru mu?

**İncelendi, bulgu yok.**
- **Yer doğru.** Seed değerlerinin türetilmesi `packages/db`'nin işi; modül
  `src/index.ts` barrel'ından **geçmiyor** (grep'le doğruladım: `index.ts`'te
  `version-registry` eşleşmesi **sıfır**) → paketin **dışa açık yüzeyi
  büyümedi**. Tek üretim tüketicisi `seed.ts:77,113`.
- **`readPackageVersion`'ın export'u meşru.** Modül-içi bir export, barrel'da
  olmadığı için kamu API'si değil; test onu **keyfi bir URL** ile çağırmak için
  istiyor (`__fixtures__/does-not-exist.json`, :117) ve `resolvePlatformVersion`
  sabit yol taşıdığı için o yoldan ölçülemez. Alternatif (URL'yi parametre olarak
  `resolvePlatformVersion`'a enjekte etmek) daha fazla yüzey açardı. "Test özel
  API istiyor" smell'i **sınırda ama kabul**.
- Hata yönetimi deseni **doğru**: `fs`/Zod hatası yutulmuyor, çağırana iletiliyor
  (:74-78, doc :66-73); `seed.ts:286-293` üst seviyede `stack` ile raporlayıp
  `exit 1` yapıyor. `catch {}` yok (tüm değişen dosyalarda grep'le aradım).

### 8. `Theme.id` doğal anahtar + `slug` yok — doc yorumu GERÇEKTEN ADR'ye atıf veriyor mu?

**İncelendi, bulgu yok — karşı önlem TESLİM EDİLMİŞ.** `schema.prisma:627-633`
birebir: *"`id` DOĞAL ANAHTARDIR … ADR-0003 R2 konvansiyonundan BİLİNÇLİ bir
sapma (**ADR-0020 Karar 3'te tam gerekçe**)"* + dört gerekçenin ikisi (ADR-0002
Karar 3, `Tenant.themeId` bugün `'modern'`, AC-11) **yerinde tekrarlanmış**.
`slug`'ın yokluğu ayrıca `:635-638`'de gerekçeli. `ThemeRelease` doc'u
(`:675-680`) bileşik FK'nin yokluğunu da ADR'ye atıfla açıklıyor. `Tenant`
modelinin DEPRECATED işareti de yerinde (`:90-103`). ADR'nin söz verdiği her
karşı önlem şemada var.

### 9. İsimlendirme ve konvansiyon

**İncelendi, bulgu yok.** Ölçüm (CLAUDE.md §4 tablosu):
- Prisma modeli PascalCase **tekil**: `PlatformRelease`, `Theme`, `ThemeRelease`,
  `TenantVersionState`, `TenantUpdateHistory` ✓
- DB tablo/kolon snake_case + `@@map`/`@map`: `platform_release`, `theme`,
  `theme_release`, `tenant_version_state`, `tenant_update_history`; `min_api_version`,
  `last_updated_at`, `previous_state`, `triggered_by_user_id`, `from_state`… ✓
- Tip/arayüz PascalCase: `SemverParts`, `SemverRange`, `RangeComparator`,
  `RangeOperator`, `TenantVersionSnapshot`, `VersionRegistrySeedValues` ✓
- Sabit SCREAMING_SNAKE_CASE: `SEMVER_CORE_PATTERN_SOURCE`,
  `PLATFORM_SUPPORTED_MINOR_WINDOW`, `PUBLIC_API_SUNSET_MONTHS`,
  `MANDATORY_UPGRADE_GRACE_DAYS`, `MILLISECONDS_PER_DAY`, `DAYS_IN_MONTH`,
  `TENANT_VERSION_SNAPSHOT_SCHEMA`, `COMPARATOR_TOKEN_PATTERN` ✓
- Boolean `is`/`has`/`can` öneki: `isPlatformVersionSupported`,
  `isThemeSdkVersionSupported`, `isThemeVersionSupported`,
  `isPublicApiMajorSupported`, `isWithinMajorWindow`, `isUtcLeapYear`,
  `isThemeReleaseCompatibleWithSdk` ✓ (`satisfies`/`satisfiesParsed` boolean döner
  ama `is` öneki taşımıyor — bu **npm semver'in evrensel adı**; §4'ün amacı
  belirsiz ad engellemek, burada belirsizlik yok → bulgu değil)
- Dosya kebab-case: `semver.ts`, `range.ts`, `support-window.ts`, `snapshot.ts`,
  `version-registry-seed.ts`, `tenant-version-state.probe.ts`,
  `range-grammar-equivalence.test.ts` ✓
- **`UpdateTrigger {tenant_user, platform_auto}` — mevcut enum'larla TUTARLI.**
  Ölçtüm: `TenantStatus {pending, provisioning…}`, `TenantRole {owner, admin…}`,
  `AuditAction {member_invited, member_invitation_accepted,
  tenant_security_policy_changed}`, `JobStatus {queued…}` — repoda enum değerleri
  **snake_case/lowercase**, `AuditAction` zaten çok sözcüklü snake_case taşıyor.
  Yeni beş enum (`ReleaseChannel`, `ThemeStatus`, `ThemeReleaseStatus`,
  `UpdateTrigger`, `UpdateStatus`) aynı deseni izliyor. Sapma yok.
- Belirsiz ad (`data`, `temp`, `handle`, `process`) yok; kısaltma yok.
  `versionValues` (seed.ts:113) sınırda ama doc'u ne olduğunu söylüyor.

### 10. ⚠⚠ ÖLÜ KOD — `packages/versioning` tüketilmiyor: AÇIK KARAR

**`low` BORÇ — bulgu yazdım (SD-9), ama bu sürümde engel DEĞİL.**

Ölçüm (grep, repo geneli, `@arkesoft/versioning` tüketicileri):
- **Üretim tüketicisi 2:** `SEMVER_CORE_PATTERN_SOURCE` →
  `packages/theme-sdk/src/manifest/manifest.ts:54`; `extractMajor` →
  `packages/theme-sdk/src/migrations/chain.ts:58` (üç çağrı: `:112`, `:113`, `:226`).
- **Test tüketicisi 1:** `parseRange` →
  `packages/theme-sdk/src/__tests__/range-grammar-equivalence.test.ts:36`.
- **Paket-içi tüketici:** `SEMVER_FORMAT_PATTERN` → `snapshot.ts:30`;
  `parseSemver`/`compareSemverParts`/`SemverParts` → `range.ts:31-36`,
  `support-window.ts:47`.
- **Sıfır tüketicili dışa açılan yüzey:** `compareSemver`, `satisfies`,
  `satisfiesParsed`, `isThemeReleaseCompatibleWithSdk`, `RangeOperator`,
  `RangeComparator`, `SemverRange`, `support-window.ts`'in **tamamı** (5 fonksiyon
  + 5 sabit), `TENANT_VERSION_SNAPSHOT_SCHEMA`, `TenantVersionSnapshot`
  → index.ts:7-36'daki 23 simgenin ~20'si.

**Karar ve gerekçesi:** ADR-0020 ("veri yeri önce, davranış sonra") **şema/enum**
kolonları için haklı — bir yazıcı doğmadan kolon var olmak zorundadır, aksi hâlde
v0.2.0 geri-doldurma migration'ı gerekir. Bu gerekçe `support-window.ts`'e
**tam oturmuyor**: o dosya veri değil **saf davranıştır** ve ilk çağıranı 15
minor sonra (v0.16.0). Ama: (a) `packages/versioning`'in kapsamı CLAUDE.md §3
monorepo haritasında *"Semver karşılaştırma, uyumluluk, N-2 penceresi"* olarak
**zaten yazılı** → kapsam dışına çıkma (§10 md 13) yok; (b) 76 test davranışı
gerçekten pinliyor; (c) ADR riski **adıyla kabul ediyor**. Dolayısıyla **FAIL
sebebi değil**, `low` borç: v0.16.0'da tüketici yazıldığında **tüketilmemiş
kalan her export KALDIRILSIN** (özellikle `support-window.ts:17-24`'ün icat
ettiği fail-closed asimetri — §6'da yazılı bir kural değil, bir yorum; gerçek
tüketici farklı bir şekil isteyebilir).

---

## Bu sürüm vs ROADMAP borcu ayrımı

| Bulgu | Nereye |
| ----- | ------ |
| **SD-1** (`medium`, purity pini sembol seviyesinde değil) | ROADMAP borcu — ama tek assertion; `docs` öncesi "yolu üstündeyse kapat" olarak işaretlenmesi önerilir |
| SD-2 (yanlış saflık-kapsamı yorumu + gereksiz `Reflect.construct`) | ROADMAP borcu, vade v0.0.22 |
| SD-3 (`__proto__` fikstürü inert, SEC-9 iddiası kanıtsız) | ROADMAP borcu, vade v0.0.22 |
| SD-4 (`satisfies` fail-closed sebep kaybı) | ROADMAP borcu, vade **v0.16.0** (tüketici yazılırken) |
| SD-5 (silinmiş dosyaya atıf veren iki bayat yorum) | ROADMAP borcu, vade v0.0.22 |
| SD-6 (no-op test, adı fazlasını vaat ediyor) | ROADMAP borcu, vade v0.0.22 |
| SD-7 (üç runtime-doğrulamasız `as`, hepsi test) | ROADMAP borcu, vade v0.0.22 |
| SD-8 (`seed.ts` `main()` 197 satır) | ROADMAP borcu, vade v0.2.0 (provisioning seed'e dokunduğunda) |
| SD-9 (ölü export yüzeyi ~20/23) | ROADMAP borcu, vade **v0.16.0** |
| SD-10 (README'nin "hepsi toplam" iddiası yanlış) | ROADMAP borcu, vade v0.0.22 |
| SD-11 (`SEMVER_CORE_PATTERN_SOURCE` çapasızlığı doğrudan pinsiz) | ROADMAP borcu, vade v0.0.22 |

**Bu sürümde kapatılması zorunlu bulgu: YOK.**

## Brief'teki iddialara itirazlarım (Orkestratör'e)

1. **Madde 4, "S1 kendi testini atlatmak mı?"** — Soru **yanlış öncüle** dayanıyor:
   saflık taraması test dosyalarını hiç taramıyor (`purity.test.ts:38-42`,
   `entry.isFile()`). Atlatma yok; **gereksiz karmaşıklık** var (SD-2).
2. **Madde 4, eşdeğerlik testinin "beş `false⟺false`" totoloji riski** — risk
   **kapatılmış**: `:77`'nin ikinci assertion'ı mutlak yönü pinliyor ve fikstürde
   iki pozitif vaka var. Endişe yerindeydi, kod onu çözmüş.
3. **Madde 6, "katman ihlali mi?"** — **Değil.** CLAUDE.md §3'ün yasakladığı
   kenarlardan hiçbiri; döngü yok; `seed` §3'te `packages/db`'nin işi.
4. **Madde 6, "`node dist/` yolu test edilmiyor" (benim açtığım iddia)** —
   kendim çürüttüm: `.github/actions/prepare-db/action.yml:88` CI'da koşuyor.
5. **Madde 2, "DRY ihlali mi?"** — **Değil**, aritmetik tek yardımcıda;
   birleştirme daha kötü tasarım olurdu. `architect` haklı.
6. **Madde 3, "ayrılmalı mıydı?"** — **Hayır**; ayırma `index.ts` barrel'ı
   yüzünden tüketici yüzeyini değiştirmez ve gerçek riski (SD-1) kapatmaz.
