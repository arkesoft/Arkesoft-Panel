# ADR-0002 — Tema dağıtım ve çalışma zamanı modeli

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-03
- **Karar verenler:** architect (T-012), dar danışma ile K1'in bedel ölçümü güncellendi (`perf` tur 1 bulgusu sonrası)
- **İlgili versiyon:** `v0.0.10` (bkz. `ROADMAP.md`)

---

## Bağlam

`ROADMAP.md` v0.0.1 bölümünde (`docs/adr/0001-teknoloji-yigini.md:139`) bu ADR "temaların
derleme zamanında paketlenmesi, çok kiracılı tek storefront dağıtımı" başlığıyla **gelecek
ADR** olarak ayrılmıştı; numara (0002) o günden beri **boş** bırakıldı. v0.0.10
(`packages/themes/modern@0.1.0`'ın storefront tarafından yüklenip render edilmesi) bu kararı
ilk kez somut bir uygulamayla karşı karşıya getirdi ve iki bağlayıcı not çözülmeyi
zorunlu kıldı:

- **BN-1 (SEC-5, v0.0.9/security T-010):** `theme-sdk`'nın varlık yolu izin listesi theme-sdk
  içinde bilinçli olarak gevşek (`ThemeAssetRef.path` orada mantıksal bir kimlik, servis yolu
  değil — ADR-0013 Karar 2 ve 7). v0.0.10'un **servis çözücüsü** yazılmadan önce bu izin
  listesinin sıkılaştırılması (SEC-5a) gerekiyordu.
- **BN-2 (önbellek politikası, v0.0.8/security T-009):** `apps/storefront/src/lib/cache-policy.ts`'in
  `/_astro/*` istisnası, `@astrojs/node`'un standalone adaptörü **statik varlıkları
  middleware'e hiç ulaştırmadan** sabit `public, max-age=31536000, immutable` başlığıyla
  servis ettiği için **bugünkü mimariyle açılamıyordu**. Kiracı başına farklılaşabilecek bir
  tema CSS'i bu istisnayla çözülemezdi; üç yoldan biri seçilmek zorundaydı: (a) SSR'dan servis,
  (b) varlık yoluna kiracı ayırıcısı, (c) vekil/CDN katmanı (v0.18.0).

Bu ADR, `ROADMAP.md`'nin A3 (tek çok kiracılı dağıtım) ve A4 (temalar derleme zamanında
paketlenir, N-2 penceresi yan yana) varsayımlarını somutlaştırır ve BN-1/BN-2'yi karara bağlar.

---

## Karar

### 1 — Temalar derleme zamanında paketlenir; tema paketi KAYNAK-DAĞITIMLI

`packages/themes/<ad>` bir workspace paketidir ama **`dist/` üretmez, `build` görevi yoktur.**
`exports` alanı doğrudan kaynağa işaret eder (`packages/themes/modern/package.json:7-10`):
`"."` → `src/theme.config.ts`, `"./templates/*"` → `src/templates/*.astro`. Tek derleyici
host storefront'un kendi Astro/Vite ardışık düzenidir (A4). Sonuç: tema paketinin `.astro`
şablonları **hiçbir tip denetiminden geçmez** — bu, `apps/storefront`'un bugünkü durumuyla
**aynıdır**, yeni bir gerileme değildir; `astro check` eklenmesi **v0.0.19** borcudur
(görsel regresyon altyapısıyla birlikte).

### 2 — Çözümleme TAM EŞLEŞME'dir; eşleşme yoksa adlandırılmış hata

`resolveTheme()` (`apps/storefront/src/themes/registry.ts:237-245`) bir `(themeId,
themeVersion)` çiftini kayıt defterine **tam eşleşmeyle** arar. Eşleşme yoksa `null`/`undefined`
**dönmez**, `ThemeResolutionError` **fırlatır** — bu sınıf `AppError`'dan türer
(`code: 'THEME_RESOLUTION_FAILED'`, `httpStatus: 503`, `userMessageKey:
'errors.theme.resolutionFailed'`, `context: { themeId, themeVersion }`) ve vitrin bunu
**503**'e eşler. Sessizce platform varsayılanına düşmek **reddedildi**: kiracı seçtiğinden
farklı bir temayı fark etmeden görür ve bozuk bir dağıtım maskelenir. Aralık/major
çözümlemesi **yapılmaz** — tema yayınları kiracıya zorla uygulanmaz (`ROADMAP.md` Sürüm
Politikası §4) ve aralık hesabı `packages/versioning`'in işidir (henüz yok).

> ⚠ `qa` bu kararı **bozarak doğruladı** (T-012/qa tur1): tam eşleşme kuralı kasıtlı olarak
> gevşetildiğinde `registry.test.ts`'in 2 testi kırmızıya döndü — koruma gerçek, totolojik değil.

### 3 — N-2 penceresi: kayıt defteri id başına ÇOK girdi taşır

`THEME_REGISTRY` tipi `Record<"{id}@{version}", ThemeRegistryEntry>`'dir
(`registry.ts:94-96`). Yan yana yaşayacak majorlar **ayrı workspace paketleri** olarak
modellenir (`packages/themes/{id}-v{major}`), aynı paketin içinde çoklu major yaşamaz.
Anahtar biçimi (`"{id}@{version}"`) ve `resolveTheme()`'in imzası, ikinci bir kayıt defteri
girdisi eklendiğinde (v0.0.21, `ThemeRelease` ile) **değişmeyecek** şekilde bugünden
tasarlandı — geriye dönük kırmaz.

### 4 — BN-2 → yol (a): SSR'dan servis

**Değişmez (yeniden yazılmış, güncel):** **DEĞER kiracıya bağlıdır → yalnızca middleware'in
ulaştığı yanıtta, `private, no-store`. KURAL kiracıdan bağımsızdır → derleme çıktısında donar;
hangi kanalda taşındığı önbellek politikasını ETKİLEMEZ.**

**Ölçülen mekanizma (`perf` tur 1):** Astro'nun `build.inlineStylesheets: "auto"` ayarı +
Vite'ın `assetsInlineLimit`'i (**4096 bayt**) birlikte çalışır. Bu temanın scoped stil
**kuralı** (`.theme-modern-section{...}` + başlık + gövde bildirimleri, **304 bayt**) bu
eşiğin **altında** kaldığı için harici bir `/_astro/*.css` dosyasına değil, **sunucu
paketine** derlenir (`dist/server/chunks/server_CcnToP25.mjs:2573`) ve oradan **her SSR
yanıtına satır-içi** `<style>` elementi olarak girer. `dist/client/` içinde
`theme-modern-section` için **0 eşleşme** vardır; `dist/client/_astro/` dört dosya taşır ama
tema CSS'i için **hiç harici dosya üretilmez**. Aynı sayfadaki `messages.*.css` (**5359 bayt**,
eşiğin **üstünde**) gerçekten `/_astro/*`'tan `immutable` servis edilir — mekanizmanın kendisi
çalışıyor, bu temanın kuralı sadece eşiğin altında kaldığı için başka bir dala düşüyor.

**Kabul edilen bedel:** istek başına **720 bayt ham** (416 bayt değer + 304 bayt kural);
değerin (dinamik kısmın) marjinal sıkıştırılmış maliyeti **141 bayt** (gzip-9) / **136 bayt**
(brotli-q11) — tekrar eden sistem font yığını DEFLATE'in geriye-referans mekanizmasında
neredeyse ücretsizleşiyor. ⚠ **Kuralın (304 baytın) marjinal gzip maliyeti bu turda
ÖLÇÜLMEDİ** — ham/sıkıştırılmış ayrımı bu yüzden yazılıdır, 720 baytı sıkıştırılmış bir sayı
gibi sunmayınız. ⚠ **Perf bütçesi bu sürümde tanımlı değildir** (Core Web Vitals bütçesi
v0.1.x+'ta geliyor) — yukarıdaki sayılar mutlak kayıttır, bir bütçeyle karşılaştırılamaz.

**`inlineStylesheets: 'never'` REDDEDİLDİ**, üç gerekçeyle (en güçlüsü: (A)): (A) bu ayar tema
CSS'ini `@astrojs/node`'un `/{assetsDir}/` altına sabit `immutable` başlıkla yazdığı ve
`middleware.ts`'e **hiç uğratmadığı** adaptör kanalına sokar — bu kanal ADR-0012 madde 11'in
*"yapılandırılabilir çözümü yok"* diye ölçtüğü aynı kanaldır. Bugün güvenlidir (değer her
kiracı için birebir aynı, kapsam madde 4), ama **v0.3.0'da tek bir kural kiracıya bağlanırsa
geri dönüşü olmayan bir mimari hataya düşer.** (B) bu ayar **tüm** sayfa CSS'ini her zaman
harici dosyaya zorlar — kapsamı bu kararın ihtiyacından geniştir, repo genelinde ölçülmemiş bir
yan etki taşır. (C) bugün davranışsal fark sıfırdır (bütçe aşımı yok), değişikliğin getirisi
risksiz bir statüko yerine ölçülmemiş bir statüko olurdu.
⚠ **Bu, belgeli bir kaçış kapısıdır** — kapatılmış bir yol değil: aşağıdaki gözden geçirme
koşulları bu kararı ne zaman yeniden açacağını tanımlar.

**`is:inline`'ın gerekçesi düzeltildi:** bu direktifin zorunluluğu önbellek **değil**,
**derleme zamanında donma**dır — derlenen `<style>` elementi build zamanında değerlendirilir,
yani kiracı değeri build'de **donar**. v0.3.0'da kiracı JSONB'si bu üretece beslendiğinde bu
idiom **yapısal olarak kırılacaktır** (gözden geçirme koşulu 1).

**(b) [varlık yoluna kiracı ayırıcısı] ikinci kez ölür:** A3/A4 ile **yapısal olarak
imkânsız** — build zamanında kiracı listesi yok, prerender edilmiş rota **sıfır**
(ADR-0012:174-180). Hedef kanal da madde 11 gereği **adaptör kontrolünde**, uygulama kodunun
eli değmiyor. **(c) [vekil/CDN]** v0.18.0'a kadar **bloke edici**.

**BEŞ GÖZDEN GEÇİRME KOŞULU** (süreç yükümlülüğü, bkz. "Gözden geçirme koşulları" bölümü).

### 5 — Platform varsayılan teması DERLEME ZAMANI SABİTİDİR

`DEFAULT_THEME_SELECTION` (`registry.ts:254-261`) env/DB/API'den **okunmaz**. Kayıt defteriyle
**aynı modülde** yaşar ve tipi kayıt defterinin anahtar birleşimine (`ThemeRegistryKey`)
bağlıdır — var olmayan bir temaya işaret etmek `pnpm typecheck`'i **kırar**, çalışma zamanı
sürprizi değil, **derleme hatasıdır**. Env reddedildi: derleme çıktısında bulunmayan bir temaya
işaret edebilirdi (A4'ü ihlal eder). DB reddedildi: platform varsayılanı
`PlatformRelease`'in uyumluluk beyanının parçasıdır (`ROADMAP.md` Sürüm Politikası §3), o tablo
**v0.0.21**'de doğar, bugün yok.

> ⚠ `qa` bu kararı da **bozarak doğruladı**: `DEFAULT_THEME_SELECTION` var olmayan bir temaya
> (`hayali-tema@9.9.9`) çevrildiğinde `pnpm typecheck` `TS2322` ile kırmızı döndü.

⚠ Migration'ın yazdığı `tenant.theme_id = 'modern'` / `theme_version = '0.1.0'` backfill
değeri **donmuş tarihsel bir olgudur** — canlı varsayılanın kaynağı **değildir**; canlı
varsayılan her zaman bu modüldeki `DEFAULT_THEME_REGISTRY_KEY`'dir.

### 6 — Tel sözleşmesinde tema seçimi NULLABLE ve KALICI olarak nullable'dır

`storefront.currentTenant` yanıtı `{ name, themeId: string | null, themeVersion: string | null }`
döner. API, doğrulayamadığı bir seçimi **icat etmez** — hangi tema modüllerinin kurulu olduğu
storefront'un derleme çıktısının özelliğidir, `apps/api` bunu bilemez. Varsayılanı uygulayan
taraf **VİTRİN**'dir (`apps/api` coalesce etmez, port `total` kalır — yokluk raporlanır,
uydurulmaz). ⚠ Bu alanları ileride non-null yapmak **MAJOR**'dır (`ROADMAP.md` Sürüm Politikası
§2, Public API MINOR = yalnızca ekleme kuralı).

**Dağıtım kayması telafisi:** `apps/api` ve `apps/storefront` ayrı dağıtılabilir olduğundan
(kademeli açılış, `ROADMAP.md` Sürüm Politikası §4) tek taraflı rollback gerçek bir senaryodur.
Vitrin, API yanıtını **kendi yerel Zod şemasıyla** parse eder (`themeId: z.string().nullish()`
→ `?? null`) — API vitrinin güven sınırının dışındadır (CLAUDE.md §4). Eksik alan "seçim yok"
gibi davranır → platform varsayılan teması render edilir, boş/kırık sayfa gösterilmez.

### 7 — `0.x` migration eşiği değişmez; yükümlülük sürüm aritmetiğinden değil ayar şeması kırılmasından doğar

`packages/theme-sdk/src/migrations/chain.ts`'in `themeMajor > 1` eşiği **değiştirilmedi**.
Üç gerekçe: (1) yükümlülüğün kaynağı sürüm aritmetiği değil, **ayar şeması kırılmasıdır** —
eşiği `0.x`'e genişletmek her `0.x` minör'üne (salt görsel iyileştirmeye bile) migration
yazmayı zorlardı; (2) `v0.0.10`'da `0.x` aralığında **kurulu taban yoktur** (Karar 8) → kırılacak
kiracı yok; (3) çapraz sürüm kontrolü `ThemeRelease` gerektirir, o kayıt **v0.0.21**'de gelir.

**Yazılı kural:** `0.x`'te ayar migration'ı **ancak ve ancak** saklanmış ayar değerleri yeni
`settings` tanımlarıyla parse edilemez hâle geliyorsa (anahtar silme/yeniden adlandırma, tip
değişimi, `select.options` daraltma, `default`'un geçersizleşmesi) zorunludur; taşıyıcı `0.x`
**minor** bump'ıdır. v0.0.21'de `ThemeRelease` ile makineleşir; o genişleme theme-sdk
**minor**'ıdır. İki pin test (`chain.test.ts`) bu boşluğu belgeler: `0.2.0` + `migrations: []`
→ `ok: true` (boşluk belgeli, hata değil); `0.2.0` + gönüllü zincir → `ok: true` (reddedilmez).
Vade bu ADR ile **v0.0.21**'e taşınır — bkz. `ROADMAP.md` → Teknik Borç.

### 8 — `modern@0.1.0` yayınlanmış bir tema sürümü DEĞİLDİR

Yayın koşulu (`ROADMAP.md` Sürüm Politikası §2, Tema): `validateThemeManifest` + görsel
regresyon (**v0.0.19**) + Lighthouse bütçesi (**v0.1.x+**) + `ThemeRelease` kaydı
(**v0.0.21**). Bu üçü de v0.0.10'da **karşılanamaz** → `modern@0.1.0` bir **geliştirme
sürümüdür**, yayınlanmış bir tema sürümü değildir. Sonuç: `0.x` aralığında **kurulu taban
yoktur** (Karar 7'nin ikinci gerekçesi) ve SEC-5a (`theme-sdk`'nın varlık yolu izin listesi
sıkılaştırması) bu yüzden **PATCH** olarak sürümlenir — henüz hiçbir yayınlanmış tema bu
davranışa bağımlı olamaz.

---

### Değerlendirilen alternatifler

| Alternatif                                             | Neden seçilmedi                                                                                                                                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Çalışma zamanında npm'den dinamik tema kurulumu          | A4'ü ihlal eder; MVP kapsamı dışı, tedarik zinciri/güvenlik yüzeyi büyük bir genişleme gerektirir.                                                                                                              |
| BN-2 yol (b): `/_astro/{tenantSlug}/...`                 | A3/A4 ile yapısal olarak imkânsız — build zamanında kiracı listesi yok, prerender edilmiş rota sıfır; hedef kanal adaptör kontrolünde.                                                                          |
| BN-2 yol (c): vekil/CDN katmanı                          | v0.18.0'a kadar bloke edici.                                                                                                                                                                                    |
| `inlineStylesheets: 'never'`                             | Tema CSS'ini adaptör kanalına sokar (geri dönüşü olmayan risk, v0.3.0); kapsamı bu ihtiyacın ötesinde (tüm sayfa CSS'i); bugünkü davranışsal fark sıfır.                                                        |
| Sessizce platform varsayılanına düşme (çözümleme)        | Kiracı farklı tema görür, bozuk dağıtım maskelenir; adlandırılmış hata + 503 tercih edildi.                                                                                                                     |
| Varsayılan temayı env/DB/API'den okumak                  | Env derleme çıktısında bulunmayan temaya işaret edebilir (A4 ihlali); DB'nin ilgili tablosu (`PlatformRelease`) henüz yok.                                                                                      |
| Public API'de tema seçimini non-null yapmak              | API'nin doğrulayamadığı bir seçimi icat etmesini gerektirirdi; vitrinin derleme çıktısı bilgisini API'ye taşır, katman sınırını ihlal eder.                                                                     |
| `0.x` migration eşiğini genişletmek                      | Her `0.x` minör'üne migration yazmayı zorlar; theme-sdk'da davranış değişikliği (patch'ten çıkar); kurulu taban olmadığı için gerekçesiz.                                                                       |

---

## Sonuçlar

### Olumlu

- Tek derleyici (storefront'un Astro/Vite ardışık düzeni) + kaynak-dağıtımlı tema paketi,
  yeni bir build adımı/artefakt sınıfı eklemeden A4'ü karşılar.
- Tam eşleşme + adlandırılmış hata, bozuk bir dağıtımı maskelemek yerine görünür kılar (503),
  ve bunu `qa`'nın kasıtlı bozma testleri doğruladı.
- N-2 kayıt defteri biçimi (Karar 3) ve varsayılan tema sabiti (Karar 5) bugünden ikinci bir
  kayıt girdisine ve derleme zamanı tutarlılığına hazırdır — v0.0.21 geriye dönük kırılma
  taşımaz.
- BN-2'nin (a) yolu bu sürümde **sıfır** yeni SSR rotası, **sıfır** `cache-policy.ts`
  değişikliği gerektirdi; `BaseLayout.astro` mekanik pinle değişmeden kaldı.
- Tel sözleşmesinin kalıcı nullable'lığı (Karar 6), API/vitrin arasındaki dağıtım kaymasını
  (farklı sürüm, farklı anda yayınlanan iki uygulama) sessiz bir `undefined` tuzağına
  dönüşmekten, açık bir "seçim yok → varsayılan" davranışına çevirdi.

### Olumsuz ve kabul edilen maliyetler

- **720 bayt/istek ham bedel** (416 değer + 304 kural), SSR HTML'ine her istekte satır-içi
  giriyor ve bugünkü mimariyle **önbelleklenemiyor**. v0.3.0'a kadar (palet sabit kaldığı
  sürece) sabit kalır; karşı önlem yoktur çünkü bu kasıtlı bir tasarım kararıdır (Karar 4).
- `inlineStylesheets: 'never'` reddedildiği için tema CSS **kuralının** (304 bayt) kiracıdan
  bağımsız olmasına rağmen `/_astro/*`'tan immutable servis edilmediği, satır-içi kaldığı
  ölçüldü (`perf` tur 1) — bu, Karar 4'ün ilk taslağının *"önbellek kaybı ≈ sıfır"* iddiasından
  **daha zayıf ama doğru** bir sonuçtur; metin bu yüzden güncellendi.
- `.astro` şablonları tip denetiminden geçmiyor (Karar 1) — `astro check` gelene kadar
  (v0.0.19) tek savunma mekanik grep-tabanlı drift pinleri ve `pnpm build`'in kendisidir.
- `0.x` migration eşiğinin genişletilmemesi (Karar 7), ileride `ThemeRelease` gelmeden bir
  `0.x` minör'ünün ayar şemasını sessizce kırma riskini **taşır** — iki pin test bu boşluğu
  belgeliyor ama kapatmıyor; vade v0.0.21.

### Etkilenen sonraki kararlar

- v0.3.0'ın tema ayar editörü, Karar 4'ün kural/değer ayrımını **devralır**, yeniden karar
  vermez — ama aşağıdaki "v0.3.0 Mimari Notu" eki yeni bir yapısal ön koşul ekliyor.
- v0.0.21'in `ThemeRelease`/N-2 çalışması Karar 3/5/7/8'in üzerine inşa eder; anahtar biçimi
  ve varsayılan tema sabiti mekanizması **değişmeyecek**.
- v0.18.0/v0.20.0'ın CDN/edge katmanı ve CSP çalışması Karar 4'ün gözden geçirme koşulu 5'i
  tetikler.

---

## Gözden geçirme koşulları

Bu ADR'nin Karar 4'ü (BN-2 → yol (a)) şu durumlarda **zorunlu olarak** yeniden açılır:

1. Kiracıya bağlı bir **KURAL** (değil, değer) doğduğu an — bugün yalnızca *değerler* kiracıya
   bağlı, *kurallar* kiracıdan bağımsız. Bu ayrım bozulursa `is:inline`'ın derleme-zamanı
   donma garantisi artık yeterli değildir.
2. ⚠ **4096 baytlık `assetsInlineLimit` eşiği aşıldığında** — Astro'nun davranışı **kod
   değişikliği olmadan** kendiliğinden döner (kural harici dosyaya taşınır); izolasyon
   korunur ama bu ADR'nin "KURAL satır-içi kalıyor" anlatısı **yanlış hâle gelir**.
   → **`perf` her tema sürümünde bu stil yığınının baytını ve 4096 bayt eşiğine uzaklığını
   raporlamak zorundadır** (süreç yükümlülüğü, bir defalık ölçüm değil).
3. Perf bütçesi (Core Web Vitals, v0.1.x+) tanımlandığında — bugünkü mutlak sayılar (720 bayt
   ham, 141/136 bayt sıkıştırılmış marjinal) o bütçeyle karşılaştırılmalı ve gerekirse karar
   yeniden değerlendirilmeli.
4. Astro veya Vite bir major sürümünde `inlineStylesheets`/`assetsInlineLimit` varsayılanını
   değiştirirse.
5. CDN/edge katmanı (v0.18.0/v0.20.0) veya CSP (v0.20.0) devreye girdiğinde — `style`
   elementinin (attribute değil) seçilmiş olması bu noktada nonce/hash ile izin verme
   (`style-src-elem`) kapısını bedelsiz bırakır; bu koşul o kapının gerçekten kullanılıp
   kullanılmayacağını teyit eder.

Ayrıca: Karar 2 (tam eşleşme) **aralık/major çözümlemesine** geçiş `packages/versioning`
doğduğunda (kapsamı ROADMAP'te tanımlı değil, ileriye dönük not) yeniden değerlendirilebilir.
Karar 7 (`0.x` eşiği) `ThemeRelease` ve ilk gerçek `0.x` yayını geldiğinde (v0.0.21)
makineleştirilir.

---

## Ek · v0.3.0 Mimari Notu — tema CSS üretecinin kiracı başına izolasyonu

> Bu ek, `security` gate'inin T-012'de bulduğu **üç `low` bulgunun** (T-012 security tur 1,
> `apps/storefront/src/themes/registry.ts:71-79,174-182` / `theme-css.ts:63` / `theme-css.ts:71`
> ve T-012 security tur 2'nin `theme-css.ts:106,117`) ortak kökünü karara bağlar; architect'in
> tek kararıdır ve geçmişe dönük bir Karar'ı değiştirmez — v0.3.0'ın **ön koşulunu** yazar.

Üç bulgunun üçü de aynı yapısal riskin farklı yüzleri: `generateThemeCss`'in ürettiği
`styleText` **süreç geneli, bir kez** hesaplanıyor ve *"girdi yalnızca manifestten türer"*
kuralı hiçbir pinle korunmuyor; vitrinin kendi ad izin listesi SDK'nın **yayınlanan**
sözleşmesinden kasıtlı olarak daha sıkı (SDK'ya uyan bir tema yazarı süreci **açılışta**
düşürebilir); font değeri izin listesi **geçerli CSS'i de** reddediyor (çıplak çok kelimeli
aile adı, tırnak içinde tire). Ortak kök: `generateThemeCss` **süreç-başına-bir-kez +
fırlatarak-fail-closed** olduğu sürece — bu bugün doğru ve güvenlidir, çünkü girdi derleme
zamanı sabitidir — **girdi kaynağı kiracıya döndüğü anda (v0.3.0)** tek bir kiracının ayarı
**tüm kiracıların** vitrinini açılışta düşürebilir hâle gelir.

**Karar — hatanın şiddetini girdinin kaynağı belirler:**

- **Manifest kaynaklı hata** (derleme zamanı sabiti, tema yazarının kendi masasında oluşan
  hata) = **dağıtım kusuru** → açılışta **fırlat**, bugünkü davranış **korunur**.
- **Kiracı kaynaklı hata** (`themeSettings` JSONB'sinden gelen bir değer) = **veri kusuru** →
  üreteç **kiracı başına izole** edilir; bir kiracının geçersiz değeri o kiracıyı **platform
  varsayılan paletine** düşürür, `warn` log + denetim kaydı üretir, **süreç düşmez**.

İki yapısal ön koşul:

1. Üreteç çağrısı **kiracı başına** olmak zorunda; memoizasyon gerekirse anahtar **zorunlu
   olarak** `tenant:{tenantId}:theme-css:{themeId}@{themeVersion}` biçiminde olmalı
   (CLAUDE.md §7 madde 9 — global anahtarda tenant verisi yok kuralı).
2. Vitrin izin listesinin SDK'nın yayınlanan sözleşmesinden **bilinçli olarak sıkı** olduğu
   gerçeği **testle pinlenir** ve adlandırılmış hata **hangi kuralın reddettiğini** taşır —
   tema yazarı "geçersiz" demekle yetinen bir mesaj değil, teşhis edilebilir bir hata almalı.

Bu iki ön koşul karşılanmadan v0.3.0'ın kiracı tema ayar editörü `generateThemeCss`'e kiracı
JSONB'si bağlayamaz — bağlarsa Karar 4'ün gözden geçirme koşulu 1 ile çakışır ve bu ek
ADR'nin kapsamı dışına taşar.
