# ADR-0012 — Vitrin Yüzeyi: Anonim tRPC Erişimi, Kiracının Host ile Taşınması ve Önbellek Politikası

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-02
- **Karar verenler:** Architect (T-009); kaynak bulgular: pm (T-009 — dört ölçüm, R1–R10), Kullanıcı (2026-11-01 — iki onay: `apps/api` kapsam genişlemesi + `packages/tenancy`), ADR-0009 madde 7/8, ADR-0010 madde 5, ADR-0011 madde 3. Üretim fazı ölçümleri (madde 9–11): S4, S6, Orkestratör kaynak doğrulaması; ADR'ye işleyen: docs (T-009/S10). Gate sonrası ölçümler (madde 4 ⑥ düzeltmesi + madde 12): solid tur 1, security tur 1 (parça A/B); ADR'ye işleyen: docs (T-009, kapanış).
- **İlgili versiyon:** `v0.0.8` (v0.0.10, v0.0.14, v0.1.x, v0.18.0, v0.19.0, v0.20.0, v0.0.22 bu karara bağlıdır)

---

## Bağlam

v0.0.8 platformun ilk **anonim** (kimlik doğrulamasız) HTTP yüzeyini getiriyor. Dört ölçülmüş
gerçek bu sürümden önce birbirinden bağımsız doğdu ve vitrin ilk kez dördünü aynı anda zorluyor.

**1. `/trpc` yüzeyinin tamamı bugün kimlik istiyor.** `AUTH_EXEMPT_PATHS` dokuz yol taşıyor ve
hiçbiri `/trpc/*` değil; `publicProcedure`'ün HTTP'de erişilebilir bir yolu **yok**
(`packages/trpc/src/trpc.ts:207-217` bunu bilinçli bir tasarım kararı olarak yazıyor — kaynak
taslakta bu satırlar `202-209` olarak atıflanmıştı; dosya bu ADR'nin S5 üretim adımında
güncellendiği için satırlar kaydı, burada doğrulanmış hâliyle düzeltildi). Vitrin ziyaretçisi ise
anonimdir. ROADMAP v0.0.8'in kendi kabul kriteri `apps/api`'ye dokunmadan karşılanamaz.

**2. ADR-0011 madde 3 bu kararı adıyla erteledi.** Koşul ② birebir şöyle: *"`publicProcedure`'ü
HTTP'de erişilebilir kılmak **ayrı ve daha ağır** bir karardır ve bu ADR onu vermez."* Madde 3'ün
üç koşulu **kiracı** ekseninin (`TENANT_EXEMPT_PATHS`) kararıdır; kimlik ekseni açık kaldı.

**3. Kiracı yalnızca `Host` başlığından çözülür ve bu bilinçli olarak tek kanaldır.**
`packages/tenancy/src/resolve-host.ts:17-26` (bu dosya madde 5'in kararıyla bu pakete taşındı;
taşımadan önceki konumunda — `apps/api/src/tenancy/resolve-host.ts` — kaynak taslak bu satırları
`9-18` olarak atıflamıştı) `X-Forwarded-Host`'un okunmasını **yapısal olarak** imkânsız kılıyor
(fonksiyonun hiçbir parametresi böyle bir başlığı temsil etmiyor) ve gerekçesini yazıyor: güvenilir
bir vekil allowlist'i v0.18.0'a kadar yok, güvenilmeyen bir vekil başlığı "istemci beyanı" kapısını
arka kapıdan yeniden açar. `x-arkesoft-tenant` ise üretimde reddedilir. Ama vitrin API'yi **sunucu
tarafından** çağırır ve iç bir taban URL'si kullanılırsa isteğin `Host`'u API'nin kendi host'u olur
— kiracı kaybolur.

**4. Önbellek politikası fail-closed ve istisnasız.** `apps/api/src/http/no-store-response-headers.ts:22-24`:
*"politika 'her şey `no-store`', istisna listesi YOK. İlk gerçekten public önbeklenebilir yanıt
doğduğunda rota kapsamlı bir istisna eklenecek."* Vitrin bu cümleyi ilk kez test ediyor.

Dolayısıyla "vitrin kiracıyı nasıl öğrenir" bir yerleşim tercihi değil, **kimlik muafiyetinin,
kiracı çözümünün ve önbellek anahtarlamasının birlikte verilmesi gereken tek kararıdır.**

## Karar

### 1. Prosedür merdivenine dördüncü builder eklenir: `publicTenantProcedure`

`publicTenantProcedure = base.use(requireTenant)` — kimlik **yok**, kiracı **zorunlu**. Mevcut
`requireTenant` middleware'i değiştirilmeden yeniden kullanılır. Merdiven böylece iki eksenin
(kimlik × kiracı) çarpımı olur ve eksik hücre kapanır. `publicProcedure`'ün HTTP'de erişilebilir
bir yolu **hâlâ yoktur**.

### 2. Anonim yüzey tek bir yolla, tam eşleşmeyle açılır

`AUTH_EXEMPT_PATHS` dokuzdan **ona** çıkar; eklenen tek yol `/trpc/storefront.currentTenant`.
`TENANT_EXEMPT_PATHS` **on üçte kalır** — hiçbir satır eklenmez. Vitrin ziyaretçisi kimliksizdir
ama **kiracısız değildir**: kiracı `Host`'tan çözülür ve `TenantGuard` çözümsüz hostu 404 ile
reddeder. Kiracı muafiyeti eklemek `TenantGuard`'ın 404'ünü kapatarak varlık-sızdırmama
garantilerini yapısal olarak imkânsız kılardı.

Kardinalite assertion'ı ve küme eşitliği **susturulmaz**; her büyüme aynı değişiklikte elle
güncellenir. Mekanizmanın dayandığı değişmezlik ADR-0009 madde 8'dir: tam yol eşleşmesi +
**batching kapalı**.

### 3. Anonim yol eklemenin dört bağlayıcı koşulu

ADR-0011 madde 3'ün üç koşulu kiracı ekseninindir ve bu yola **uygulanmaz** (bkz. "Değerlendirilen
alternatifler" altındaki eksen tablosu). Kimlik ekseni için dört **yeni** koşul konur; gelecekteki
her anonim yol dördünü de karşılamak zorundadır:

**A — Çıktı, o host'ta zaten herkese açık olandan fazlasını taşımaz; ve bu tipin şekliyle
sağlanır.** `storefront.currentTenant` yalnızca `{ name: string }` döner. `id`, `slug`, `status`,
`primaryDomain`, `planId`, `deletedAt` **yoktur** ve her birinin dışarıda bırakılma gerekçesi tek
tek yazılıdır. Mevcut bir şemanın (`TenantSummary`) Zod soyması ile daraltılması **reddedilmiştir**
— sızdırmazlık serileştirmeye değil, portun **dönüş tipine** dayanır.

**B — Kimlik düşerken kiracı zorunluluğu düşmez; ve yanıt hiçbir yetki/eylem yeteneği taşımaz.**
Prosedür salt okunur bir `query`'dir; yazma yok, oturum yok, çerez yok. Kiracı iki katmanda
zorlanır: `TenantGuard` (HTTP, 404) ve `requireTenant` (sözleşme).

**C — Resolver `ctx.tenant`'ı yalnızca `tenantId` olarak okur ve yalnızca porta geçirir.**
`slug`/`status` okunmaz; `ctx`'in hiçbir alanı çıktıya doğrudan kopyalanmaz. Girdi şeması
**yoktur** — ADR-0009 madde 7 korunur.

**D — Yol, istek başına veritabanı maliyetini ve enumerasyon oranını beyan eder.** Bu yol: **2**
indeksli okuma (host çözümünde bir tekil-indeks `findUnique`, portta bir birincil-anahtar
`findFirst`); oran sınırı **yok** (`/trpc` oran sınırlaması v0.0.14 borcu). Varlık oracle'ı
**yeni değildir** — ADR-0010 madde 5 onu zaten duyurdu ve kabul etti.

### 4. Kiracı, vitrinden API'ye `Host` başlığıyla taşınır; API'de hiçbir şey değişmez

Vitrin, ziyaretçinin host'unu **kendi doğruladıktan sonra** API'ye giden sunucu-taraflı isteğin
`Host` başlığı olarak taşır. `X-Forwarded-Host` okunmaz, `trust proxy` kapalı kalır,
`x-arkesoft-tenant` üretimde reddedilmeye devam eder, `resolve-host.ts` **değişmez**.

**İkinci bir "istemci beyanı" kanalı açılmaz** — var olan tek kanal kullanılır. `Host` bir kimlik
bilgisi değil, bir **seçicidir**: internetteki bir istemci istediği host'u seçerek o host'ta zaten
herkese açık olan dizeyi alır; tarayıcıyla o adresi ziyaret ederek alacağının **aynısı**. Yetki
yükseltmesi yoktur.

**Giden `Host` asla ham istemci baytı değildir.** Vitrin `normalizeHostname()`'in çıktısını
(`new URL().hostname`) taşır — port, kullanıcı bilgisi, `@`, boşluk ve CR/LF yapısal olarak
içeremez; başlık enjeksiyonu imkânsızdır. Vitrin ve API **aynı** normalizasyondan geçer, sapma
imkânsızdır. Mekanizma bir mekanik ölçümle kanıtlanır: tek kullanımlık bir HTTP sunucusu, gördüğü
`req.headers.host`'u assert eder.

**Tarayıcı erişilebilirliği — ölçüldü (security, T-009 tur 1).** Bu mekanizmanın tarayıcıdan
**kullanılamayacağı** düşünülebilir ama bu **ölçülmedi** ve iddia **fazla iddialıdır**. Gerçek
ölçüm dört vaka: sunucu-taraflı GET (başlıksız) → **200** · `Sec-Fetch-Site: cross-site` → **403**
· `Referer: https://evil.example.com/` → **403** · `Sec-Fetch-Site` **yok** + `Referer` **yok** +
GET → **200** (GET `SameOriginGuard`'ın `SAFE_METHODS`'unda, `same-origin.guard.ts:57`). Yani
`Referrer-Policy: no-referrer` gönderen bir sayfadan çapraz-orijin bir GET veya Fetch Metadata
başlıkları taşımayan eski bir tarayıcı bu yolu **tarayıcıdan da çağırabilir**. **Doğru ifade:** bu
yol tarayıcıdan **kullanılabilir ama hiçbir şey kazandırmaz** — dönen tek dize o host'ta zaten
herkese açık, çerez okunmuyor/yazılmıyor, mutasyon yok, yanıt `private, no-store`. `SameOriginGuard`
burada bir **savunma katmanı değil**; madde 3'ün A–D koşulları (çıktının zaten herkese açık
olandan fazlasını taşımaması) tek gerçek savunmadır.

### 5. `resolve-host.ts` + `reserved-subdomains.ts` `packages/tenancy`'ye terfi eder

İki dosya ölçülerek saf bulundu (üretim ithal eden tek dosya `tenant-resolver.service.ts`;
dışarıdan kullanılan tek şey global `URL`). Yeni paketin çalışma zamanı bağımlılığı **yoktur** —
`packages/errors`'tan (yalnızca `zod`) daha katı. `apps/api` ve `apps/storefront` ikisi de ithal
eder; **kopyalama reddedildi** (12 rezerve etiket + slug regex'i güvenlik sınırındadır, sapma
sessizdir). `apps/* → apps/*` ithali CLAUDE.md §3 ile yasak olduğu için terfi tek temiz yoldur.
`TenantContext` **değerini** üretme yetkisi `apps/api`'nin `TenantResolverService`'inde kalır —
yeni paket yalnızca saf kuralları taşır.

### 6. Vitrinin tüm HTTP yüzeyi `private, no-store`; API'nin istisna listesi açılmaz

`no-store-response-headers.ts`'in fail-closed cümlesi **tetiklenmez**. Yeni anonim yol gerçekten
public ama **önbeklenebilir değildir**: tüketicisi yalnızca vitrinin sunucu-taraflı fetch'idir ve
araya girecek bir paylaşımlı önbellek yoktur (repoda ingress/Helm/Pulumi yok). Dahası, prosedürün
**girdisi olmadığı** için hedef URI'si her kiracı için birebir aynıdır; RFC 9111'de birincil
önbellek anahtarı hedef URI'dir, yanıtı ayıran tek şey `Host` **başlığıdır**. Bu yanıtı `public`
yapmak, URI'ye göre anahtarlayan herhangi bir aracıda **doğrudan çapraz kiracı sızıntısıdır**.

Vitrinin kendi yüzeyi de — kiracı sayfası, 404, 503, `robots.txt`, `sitemap.xml` ve `/_astro/*`
hash'li varlıklar dahil — tek bir politika taşır: `private, no-store`, literal **tek** dosyada,
istisna listesi **yok**, `Vary` **yazılmaz**. Gerekçe: bu sürümde CDN/edge yok (kazanç ölçülebilir
şekilde sıfır); `public → private` yönü yanlış seçilirse bir deploy ile geri alınamaz (purge
yeteneği v0.18.0/v0.20.0); ve politika sepet/oturum varsayımına (PM A6) **dayanmaz**, bu yüzden o
varsayım yanlış çıksa bile doğru kalır.

**Üretim fazında ölçülen kısıt — bu kararın kapsamı daraldı: bkz. madde 11.** `/_astro/*` için
yukarıdaki "tek dosya, istisna yok" niyeti **adaptör katmanında gerçekleştirilemedi**; madde 11
ölçümü ve kapsam daralmasını kayda geçirir.

### 7. SEO'nun her baytı istek host'undan türer

`robots.txt`, `sitemap.xml`, `<link rel="canonical">` ve `og:url` tek bir fonksiyondan
(`resolveRequestOrigin`) beslenir. Bu fonksiyon `env` okumaz, `primaryDomain` okumaz,
`APP_BASE_DOMAIN`'i orijin olarak kullanmaz. `X-Forwarded-Proto` **okunmaz** —
`X-Forwarded-Host`'un birebir aynı gerekçesi. Her iki uç kiracıya kapsamlıdır: bilinmeyen host'ta
**404** (200 + boş gövde kabul edilmez). `primaryDomain` tel şemasında **olmadığı** için sabit bir
alan adı kaynağı yapısal olarak mevcut değildir.

### 8. Vitrin, API'nin 404'ünü 404'e; her şeyi 503'e eşler

Yalnızca `httpStatus === 404` vitrinin 404 sayfasına eşlenir. Zaman aşımı, bağlantı reddi, 5xx ve
parse edilemeyen hata **503**'tür. Gerekçe: bir API kesintisini 404'e eşlemek her kiracının bütün
sayfalarını arama motorlarına "silinmiş" olarak bildirirdi — geri alınması haftalar süren bir
zarar. Ayrım yeni bir varlık oracle'ı açmaz; 404 davranışı ADR-0010 madde 5 ile zaten duyurulmuştur.

### 9. `output: 'hybrid'` yasağı mimari olarak gereksizdi — bu Astro sürümünün tipinde değer hiç yok

**(Üretim fazında ölçüldü — T-009/S4; ADR'ye işleyen: docs, T-009/S10.)** Taslak bu kararı
üretim fazından önce "`output: 'hybrid'` seçilmez/kullanılmaz" biçiminde bir yasak olarak
çerçeveliyordu. Üretim fazında ölçüldü: Astro **7.4.2**'nin kendi tip tanımı
(`astro/dist/types/public/config.d.ts:321`) `output?: 'static' |
'server'`dir — `'hybrid'` değeri bu sürümün tipinde **hiç yoktur**. `'hybrid'` yazmak zaten bir tip
hatası verirdi; yasak **ulaşılamaz bir seçeneği** yasaklıyordu — zararsız ama gereksiz bir
gerekçeydi (`apps/storefront/astro.config.ts:7-9` bu ölçümü kod yorumunda da taşır).

Aynı ölçümün ikinci sonucu: `output: 'server'`'da rota varsayılanı **sunucu taraflı render'dır**
(statik değil); bir rotayı statikleştirmek rota başına **açıkça** `export const prerender = true`
yazmayı gerektirir. `apps/storefront`'un tek sayfası (`index.astro`) bunu ihraç etmez →
derleme çıktısında (`apps/storefront/dist/client/`) prerender edilmiş HTML dosyası **sıfırdır**
(ölçüldü — `dist/client/` altında yalnızca `_astro/` varlıkları var, `.html` yok). Dolayısıyla
"rota bazlı `prerender = false` yazılması" gibi ek bir önlem de **gerekmedi**; taslağın öngördüğü
risk zaten doğmadı.

### 10. Astro'nun kendi `Host` doğrulama kapısı (`allowedHosts`) bilinçli olarak kullanılmıyor

**(Üretim fazında ölçüldü — T-009/S4; ADR'ye işleyen: docs, T-009/S10.)** Madde 4'ün "`Host`
başlığı birebir taşınır" iddiası `middleware.ts:70` (`context.request.headers.get('host')`)
üzerinden doğru ölçüldü: Astro'nun `createRequestFromNodeRequest`'i (`node.js:49`,
`makeRequestHeaders`) gelen `req.headers`'ı **filtresiz** kopyalar.

Ama aynı ölçüm bir yan bulgu çıkardı: `context.url.host` / `Astro.url.host` gelen `Host`'u
**tamamen yok sayar** ve her istekte `localhost:<port>`'a düşer. Kaynak
(`astro/dist/core/app/node.js:41-45`) bunu bilinçli bir güvenlik duruşu olarak yazar:

```js
// Only a Host matching allowedDomains may control Request.url. Otherwise, fall back
// to an origin controlled by the server, matching createRequest's security posture.
const fallbackHostname = serverPort ? `localhost:${serverPort}` : "localhost";
const hostname = validatedHostname ?? fallbackHostname;
```

`validateHost(...)` (`astro/dist/core/app/validate-headers.js:52-64`), `allowedDomains` (=
`server.allowedHosts`, bu projede **ayarlanmadı** → varsayılan `[]`,
`astro/dist/core/config/schemas/defaults.js:38`) boşsa **her zaman** `undefined` döner
(`validate-headers.js:54`: `if (!allowedDomains || allowedDomains.length === 0) return
undefined`).

**Bu ADR'nin kararı:** Astro'nun `allowedHosts` kapısı **bilinçli olarak kullanılmaz**; kiracı
doğrulaması zincirin tamamını `resolveHost` + `RESERVED_SUBDOMAINS` + `TenantGuard`'a devreder.
Bu, Astro'nun sunduğu bir doğrulama sorumluluğunu platformun kendi üstüne aldığı anlamına gelir ve
madde 4'ün `X-Forwarded-Host` gerekçesiyle (bkz. "Değerlendirilen alternatifler") **aynı sınıf**
bir karardır: ikinci bir allowlist ikinci bir doğruluk kaynağı olurdu. `apps/storefront/src/
middleware.ts` kiracı host'unu **yalnızca** `context.request.headers.get('host')`'tan okur;
`context.url.host`/`Astro.url.host` kiracı çözümünde **hiç kullanılmaz** ve `server.allowedHosts`
bu projede hiçbir zaman ayarlanmaz.

### 11. Madde 6'nın `/_astro/*` kapsamı beşe daralır — hash'li varlıklar adaptör kontrolünde

**(Üretim fazında ölçüldü — T-009/S6 + Orkestratör kaynak doğrulaması; ADR'ye işleyen: docs,
T-009/S10.)** Madde 6 "tek politika, istisna yok" derken `/_astro/*` hash'li varlıkları da
kapsama dahil ediyordu. Üretim fazında ölçüldü: `@astrojs/node@11.1.9`'un standalone adaptörü
statik varlıkları `apps/storefront/src/middleware.ts`'e **hiç ulaştırmadan** servis eder ve
üzerine kendi başlığını yazar:

```js
// standalone.js:55
staticHandler(req, res, () => appHandler(req, res));   // statik ÖNCE; bulunamazsa SSR'a devret

// serve-static.js:152-156  (stream olayında, EN SON)
if (normalizedPathname.startsWith(`/${app.manifest.assetsDir}/`)) {
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
}
```

Yapılandırılabilir bir çözüm **yoktur**: adaptörün üstbilgi haritası (`headersMap`,
`serve-static.js:70` — `if (routeData && routeData.prerender)`) yalnızca **prerender edilmiş**
rotalar için devreye girer; madde 9'un ölçümü bu projede prerender edilmiş rota sayısının **sıfır**
olduğunu zaten gösterdi. Ayrıca bu haritanın uygulandığı yer (`stream` öncesi) `stream.pipe`'tan
önce çalışır ve sabit `immutable` başlığı sonradan (`"stream"` olayında) yazılıp üzerine biner.

**Bu ADR'nin kapsam düzeltmesi:** madde 6'nın "tek politika" kararının kapsamı, middleware'in
ulaşabildiği yanıtlara daralır — **beş** sınıf (kiracı 200 · 404 · 503 · `robots.txt` ·
`sitemap.xml`), altı değil. `/_astro/*` **adaptör kontrolündedir** ve bu ADR'nin önbellek
politikasının dışında kalır. Kararın **niyeti değişmez** (çapraz kiracı sızıntısı yaratacak bir
istisna açılmaz); bugün gerçek bir sızıntı **yoktur** çünkü `/_astro/*` içeriği bu sürümde
kiracıya özgü **değildir** — tema CSS'i **v0.0.10**'da geliyor. Taslağın yedinci gözden geçirme
koşulu ("kiracı başına tema varlığı doğduğunda") zaten tam bu anı işaretliyordu; bu ölçümle birlikte
o koşul artık bir **borcun tetikleyicisi** hâline gelir (v0.0.10 kapsamına: `/_astro/*` için
adaptör seviyesinde kiracıya özel önbellek stratejisi tasarlanmalı).

### 12. İki hata zarfının istemci tarafı normalizasyonu vitrin-yerel kalır; `packages/errors`/`packages/trpc`'ye terfi etmez

**(Üretim fazında ölçüldü — T-009/S6; denetleyen: solid tur 1 madde 7, security parça A/B;
ADR'ye işleyen: docs, T-009.)** ADR-0010 madde 4'ün "iki zarf" kararı vitrine de ulaşır: vitrinin
sunucu taraflı tRPC çağrısı hem **taşıma reddi** (dört alanlı tel gövdesi) hem **prosedür hatası**
(tRPC zarfı) üretebilir. Vitrin ikisini `apps/storefront/src/lib/map-api-error.ts`'te tek bir
`StorefrontApiFailure` ayrık birleşimine (`{kind:'not-found'} | {kind:'unavailable'}`) indirger.

**Karar: bu normalizasyon vitrin-yerel kalır; `packages/errors`'a veya `packages/trpc`'ye
terfi etmez.**

**Gerekçe — kopya sayısı sıfırdır, terfi edecek bir kural yoktur.** İki zarfın **tel şemaları**
zaten tek kaynaktan okunur: `appErrorBodySchema` ← `@arkesoft/errors`, `trpcErrorDataSchema` ←
`@arkesoft/trpc`. Vitrinin kopyaladığı şey bir kural değil, ~15 satırlık `safeParse` tesisatıdır
(iki probe: `parseTransportRejection`, `parseTrpcErrorEnvelope`). İki tüketicinin **indirgeme
hedefi** meşru şekilde farklıdır: panel (ADR-0010 Ek v0.0.7) kod-anahtarlı `PanelError`'a
indirger, vitrin bir **HTTP durum kararına** (`not-found` | `unavailable`) indirger — ikisi de
aynı iki zarfı okur, ama sonucun şekli tüketicinin ihtiyacına göre **bilerek** ayrışır.

**`packages/errors` yapısal olarak barındıramaz.** İkinci probe (`parseTrpcErrorEnvelope`)
`trpcErrorDataSchema`'ya bağımlıdır; bu şema `@arkesoft/trpc`'de yaşar. `packages/errors`'a
taşımak `errors → trpc` bağımlılığı doğurur — hem bağımlılık **yönünü** (`apps/* → packages/*`,
CLAUDE.md §3) hem `packages/errors`'ın ADR-0010'dan beri süregelen zod-only kapalı bağımlılık
listesini ihlal eder.

**Terfi hedefi (şimdi kararlaştırıldı, henüz yapılmadı):** üçüncü bir istemci tüketicisi doğarsa,
terfi `packages/trpc`'nin `.` alt yoluna (zaten istemci/tarayıcı tüketicileri için ayrılmış,
ADR-0009) yapılır — **yalnızca iki probe ilkeli** (`parseTransportRejection`,
`parseTrpcErrorEnvelope`); uygulamaya özgü projeksiyon (`StorefrontApiFailure`,
panelin `PanelError`'u) **terfi etmez**, her tüketici kendi indirgeme hedefini yazmaya devam eder.

**Tetikleyici:** üçüncü istemci tüketicisi (`apps/superadmin`, **v0.0.20** — o sürümde
`apps/* → apps/*` ithali yasağı iki probe'un kopyalanmasını değil **terfi edilmesini** zorunlu
kılar) **veya** dördüncü bir zarf şekli doğarsa.

**Üç mekanik sapma telafisi** (iki kopyanın sessizce birbirinden sapmaması için): (1) her iki
probe modülü de kararın dayandığı maddeye (`ADR-0010 madde 4`) ve birbirinin dosya yoluna atıf
verir → `rg "ADR-0010 madde 4"` istemci tarafındaki her zarf okuyucusunu listeler; (2) iki
ponyfill aynı **hata ailesini** üretir (`body` anahtarı taşıyan nesne + `'transport_rejection'`
literali) → `rg "transport_rejection"` her üreticiyi listeler; (3) bu madde + aşağıdaki teknik
borç satırı tetikleyiciyi yazılı tutar.

**Zarf (b)'nin (prosedür hatası) ulaşılamazlığı ölü kod değildir.** Bugün `TenantGuard` HTTP
seviyesinde taşıma reddini **önce** üretir; `storefront.currentTenant`'ın girdi şeması olmadığı
için (madde 3 koşul C) prosedür içi bir hata bugün **doğmaz**. Dal yine de korunur: (a) madde 8'in
lafzı ("her şeyi 503'e eşle") prosedür hatasını da kapsar ve kodun bunu **göstermesi** gerekir,
(b) gelecekteki bir `publicTenantProcedure` prosedürü (koşul A–D'yi karşılayan) bir domain hatası
fırlatabilir ve o zarfı okuyacak kod zaten burada olmalıdır. `map-api-error.ts`'in dosya başı
yorumu bu gerekçeyi taşır; `solid` tur 1 bunu doğruladı ve ölü kod **saymadı**.

### Değerlendirilen alternatifler

| Alternatif | Neden seçilmedi |
| ---------- | --------------- |
| ADR-0011 madde 3'ün üç koşulunu bu yola uygulamak (veya ADR-0011'e ek yazmak) | Eksen farklı. Madde 3 **kiracı** muafiyetinin kararıdır: koşul ①'in tehdit modeli "kiracıdan muaf bir yol kiracı verisi sızdırmasın", ③'ün dayanağı ise muaf bir yolda `ctx.tenant`'ın `absent` olmasıdır. Biz kiracıdan muaf **değiliz**; ikisi de burada tanımsızdır. Koşul ② bu kararı zaten adıyla erteledi. ADR'ler geçmişe dönük düzenlenmez — ek değil, yeni ADR. |
| Kiracı tanımlayıcısını prosedür girdisi yapmak (`input: { host }` / `{ slug }`) | ADR-0009 madde 7 bağlayıcı: *"`tenantId` **asla** prosedür girdisinden alınmaz."* `TenantContext` değerini üreten tek yer `TenantResolverService`'tir, istek girdisinden tenant uydurulamaz. Pratik maliyet: prosedür girdiden çözecekse `TenantGuard`'ı atlaması gerekir → yol **iki** muafiyet kümesine birlikte eklenmek zorunda kalır ve 404'ler prosedür içinde elle yeniden yazılır (bir güvenlik kararının iki yerde uygulanması). |
| `X-Forwarded-Host` okumak + vekil allowlist'i | `resolve-host.ts:17-26` bunu yapısal olarak kapatmış; güvenilir vekil allowlist'i v0.18.0'a kadar yok. Bugün açmak, kapatılmış deliği arka kapıdan açar. |
| `x-arkesoft-tenant`'ı üretimde kabul etmek | Kullanıcı Onayı #1'in doğrudan iptali; dev/prod davranış ayrışması ("ölçtüğüm ortam çalıştırdığım ortam değil"). |
| Paylaşılan iç sır / imzalı başlık | Yanlış problemi çözer: **çağıranı** kimliklendirir, **hangi kiracıyı sorabileceğini** kısıtlamaz — sırdan sonra bile vitrin her kiracıyı sorabilir, kazanç sıfır. Maliyet: yeni env değişkeni, rotasyon öyküsü, yeni sızıntı yüzeyi. |
| mTLS / iç ağ güveni | v0.18.0 işi; repoda ingress/Helm/Pulumi yok. |
| İç taban URL'sine düz `fetch` | İsteğin `Host`'u API'nin kendi host'u olur → kiracı kaybolur. |
| Mevcut `TenantSummary`'yi yeniden kullanıp Zod soymasına güvenmek | Beş alan resolver'a kadar gerçekten gelir; `.output()`'un kaldırılması veya şemanın gevşetilmesi beşini birden tele yazar. Sızdırmazlık tipin şekliyle sağlanmalı (ADR-0011 madde 3 koşul ①'in korunan ilkesi). |
| Vitrin yanıtlarını `public, s-maxage` yapmak | Kazanç bugün ölçülebilir şekilde sıfır (CDN yok); `public → private` yanlış yönü bir deploy ile geri alınamaz (purge v0.18.0+); sepet geldiğinde (v0.1.x) çapraz-ziyaretçi sızıntısına dönüşür. |
| `/_astro/*` için önbellek istisnası açmak | v0.0.10+ kiracı başına tema CSS'i getirecek — istisna o anda çapraz kiracı sızıntısına dönüşür ve bunu fark etmek birinin bu kararı hatırlamasına bağlı kalır. Ayrıca "politika literali tek yerde" şartını "tek yerde ama iki değerli"ye çevirir. |
| Host modülünü `apps/storefront`'a kopyalamak | 12 rezerve etiket + slug regex'i bir güvenlik sınırıdır; iki kopya sessizce sapar. `apps/* → apps/*` ithali CLAUDE.md §3 ile yasak → terfi tek temiz yol. |
| Vitrinin tüm API hatalarını 404'e eşlemek | Bir API kesintisi her kiracının sitesini arama motorlarına "silinmiş" gösterir; SEO zararı haftalarla ölçülür ve kesinti **görünmez** olur. |
| Astro'nun `server.allowedHosts`'unu da ayarlamak (madde 10) | İkinci bir allowlist, ikinci bir doğruluk kaynağı olurdu; `resolveHost` + `RESERVED_SUBDOMAINS` + `TenantGuard` zinciri zaten tek kaynaktır. İki mekanizma sapabilir (biri güncellenir, diğeri unutulur). |

## Sonuçlar

### Olumlu

- Kimlik ekseni ile kiracı ekseni **ayrı** kalır; prosedür merdiveni iki eksenin tam çarpımıdır ve
  "hangi hücrede olduğunu" builder adı söyler.
- Anonim yüzeyin yetki yükseltmesi taşımadığı **tipin şekliyle** kanıtlanır (tek alanlı port dönüş
  tipi), testle değil.
- API'de **tek satır** değişir (muafiyet kümesi); `resolve-host.ts`, `trust proxy`, dev başlığı
  politikası ve `no-store` politikası **hiç** dokunulmaz.
- Giden `Host` normalize edilmiş bir değerdir → başlık enjeksiyonu ve vitrin/API normalizasyon
  sapması yapısal olarak imkânsız.
- `packages/tenancy` sayesinde slug regex'i ve rezerve etiket listesi **tek** kaynaktan okunur;
  iki tüketicinin güvenlik sınırında sapması imkânsız.
- Önbellek politikası tek literal + sıfır istisna → inceleme yükü sabit; sepet/CDN geldiğinde
  karar **görünür** biçimde yeniden açılmak zorunda.
- SEO'nun tek türetme noktası R10'un defekt sınıfını yapısal olarak kapatır.
- Dört koşul (A–D) yazılı olduğu için sonraki anonim yol eklemeleri tartışma değil **kontrol
  listesi** işidir; kardinalite assertion'ı her eklemeyi incelemeye zorlar.
- `output: 'hybrid'` üzerine kurulu bir yasağın gereksiz olduğu ölçüldü (madde 9); tip sistemi
  zaten bu seçeneği kapatıyor, ek bir inceleme yükü taşınmıyor.
- Astro'nun `allowedHosts`/`context.url.host` mekanizmasının **bilinçli olarak** devre dışı
  bırakıldığı yazılı hâle geldi (madde 10); gelecekteki bir ajan bu davranışı "unutulmuş
  yapılandırma" sanıp `server.allowedHosts` eklemeye kalkışmaz.

### Olumsuz ve kabul edilen maliyetler

- **`/trpc` oran sınırsız ve artık anonim olarak erişilebilir.** Önceden pratik maruziyet kimlik +
  üyelik ile sınırlıydı; artık değil. Telafiler bu sürümde: (a) vitrin çözümsüz hostları API'ye
  hiç gitmeden 404'ler (ucuz ret), (b) istek başına yalnızca 2 indeksli okuma, (c) sızan bilgi o
  host'ta zaten herkese açık. Gerçek telafi **v0.0.14** (`/trpc` oran sınırlaması) — vade o
  sürümden **öne alınmalı mı**, o sürümün architect'i ölçmek zorundadır.
- **Önbellek kazancı sıfır.** Vitrin hiçbir şey önbelleklemiyor; her sayfa render'ı API'ye bir tur
  ve iki indeksli okuma demek. Kabul edildi: bu sürümde CWV/p95 bütçesi yok (v0.20.0).
- **`.astro` dosyaları tip denetimi ve lint görmüyor.** Telafi: tüm mantık `.ts`/`.tsx`
  modüllerinde yaşar, `.astro` yalnızca işaretleme + prop enterpolasyonu taşır. Kalıcı çözüm
  (`@astrojs/check`, `eslint-plugin-astro`) v0.0.9'da değerlendirilir. `wcag` `.astro`
  işaretlemesini **elle** denetlemek zorundadır — lint yeşilliği kanıt değildir.
- **CLAUDE.md §7 madde 4 artık dört builder'ı tanımak zorunda.** Maddenin lafzı
  `tenantProcedure`/`permissionProcedure` sayıyordu; `publicTenantProcedure` maddenin **niyetini**
  (kiracısız prosedür yok) karşılıyor ama önceki lafzı karşılamıyordu. Madde 12'nin emsalindeki
  gibi (*"istisna: … bkz. ADR-0010 §5"*) bir atıf eklendi (docs, T-009/S10).
- **CLAUDE.md §3'ün monorepo haritası ve sorumluluk tablosu `packages/tenancy` satırını taşımıyordu.**
  Aynı turda eklendi (docs, T-009/S10).
- **Vitrin yapılandırılmış log üretmiyor.** `tenantId`'li kayıt API tarafında var; vitrinin kendi
  gözlemlenebilirliği v0.0.10 borcudur.
- **Muafiyet kümesi bir satır büyüdü.** Her büyüme bir güvenlik kararıdır; maliyeti inceleme
  yüküdür ve kardinalite assertion'ıyla bilerek görünür tutulur.
- **E2E CI'a bağlanmıyor** (yasaklı jeton, vade v0.0.19); kabul kriteri yerel koşumla ve `qa`
  ölçümüyle karşılanır — `apps/admin`'in v0.0.7 emsaliyle aynı.
- **`/_astro/*` artık yazılı bir borçtur (madde 11).** Bu sürümde sızıntı yok (tema CSS'i yok) ama
  v0.0.10 tema seçimi geldiğinde adaptör seviyesinde kiracıya özel bir önbellek stratejisi
  tasarlanmak zorundadır; aksi hâlde bu ADR'nin "tek politika" niyeti sessizce ihlal edilir.

### Etkilenen sonraki kararlar

- **v0.0.10 (tema seçimi):** `storefrontTenantSchema`'ya `themeId`/`themeVersion` **ekleme** olarak
  girer → Public API **minor**. Çıktının çıplak `string` değil tek alanlı bir **obje** olması tam
  bu sebeple seçildi. AC13'ün küme eşitliği testi o turda elle güncellenir, gevşetilmez. Aynı
  sürüm, madde 11'in borcunu (`/_astro/*` kiracıya özel önbellek) da kapatmak zorundadır.
- **v0.0.14 (`/trpc` oran sınırlaması):** artık yalnızca bir perf/kötüye kullanım işi değil, bu
  ADR'nin koşul D'sinin **asıl telafisi**. Önceliği yeniden değerlendirilmeli.
- **v0.1.x (sepet/kişiselleştirme):** madde 6'nın `private, no-store` kararı **yeniden
  değerlendirilmek zorunda**; ilk `public` politika ile `Vary` tasarımı **aynı değişiklikte**
  verilir.
- **v0.18.0 (ingress/CDN):** madde 6 ve madde 4 birlikte yeniden açılır — bir ters vekil
  allowlist'i doğduğunda `X-Forwarded-Host`/`X-Forwarded-Proto` kararı da yeniden
  değerlendirilebilir hâle gelir (ama bu ADR onu **açmaz**). Astro'nun `server.allowedHosts`'u da
  bu turda yeniden değerlendirilir (madde 10).
- **v0.19.0 (özel alan adı DNS/SSL):** madde 7'nin şema türetmesi (`requestUrl.protocol`) TLS
  sonlandırma arkasında yeniden ölçülmek zorunda.
- **v0.20.0 (CWV bütçesi):** vitrinin "hiçbir şey önbelleklenmiyor" durumu ilk kez bir bütçeye
  karşı ölçülecek; madde 6 orada ya korunur ya `Vary` tasarımıyla birlikte açılır.
- **v0.0.22 (API sürümleme):** sözleşme snapshot'ı `TrpcPorts`'u **değil**, tel şemalarını **ve**
  erişilebilirlik matrisini (hangi yol hangi kimlik sınıfından açık) pinlemelidir. Bir yolu
  `AUTH_EXEMPT_PATHS`'ten **çıkarmak**, şema değişmese bile tüketici için kırıcıdır.

## Gözden geçirme koşulları

1. **Batching açılmak istenirse** — madde 2'nin mekanizması geçersizleşir (tek HTTP yolu birden
   fazla prosedür taşır, yol-bazlı muafiyet **sessizce** çöker). ADR-0009 gözden geçirme koşulu 1
   ve ADR-0011 koşul 3 ile **aynı kapı**.
2. **Anonim yol kümesine koşul A–D'den birini karşılamayan bir prosedür eklenmek istenirse** —
   istek reddedilir; ihtiyaç ya çıktı şemasının daraltılmasıyla ya kimliğin geri getirilmesiyle
   çözülür.
3. **Güvenilir bir ters vekil allowlist'i doğduğunda** (v0.18.0) — madde 4'ün "tek kanal `Host`"
   dayanağı yeniden ölçülebilir hâle gelir.
4. **Vitrin HTML'ine ilk kişiselleştirilmiş öğe girdiğinde** (sepet, oturum, müşteri grubu fiyatı)
   — madde 6 düşer; `public`/`private` ve `Vary` birlikte yeniden tasarlanır.
5. **Vitrinden tarayıcı içi bir yazma yüzeyi açılırsa** (sepet, v0.5.0) — ADR-0011'in tek orijin
   kararı ile bu ADR'nin ayrı-host topolojisi ilk kez çatışır; CORS/orijin kararı o turda verilir.
6. **`/trpc` oran sınırlaması geldiğinde** (v0.0.14) — koşul D'nin "oran sınırı yok" beyanı
   güncellenir.
7. **Kiracı başına tema varlığı (`/_astro/*`) doğduğunda** (v0.0.10+) — madde 6'nın "hash'li
   varlıklar kiracıdan bağımsız" dayanağı düşer; madde 11'in borcu burada kapanmak zorundadır.
8. **Üçüncü bir istemci tüketicisi (`apps/superadmin`, v0.0.20) veya dördüncü bir zarf şekli
   doğduğunda** — madde 12'nin "vitrin-yerel kalır" kararı düşer; iki probe ilkeli
   (`parseTransportRejection`, `parseTrpcErrorEnvelope`) `packages/trpc`'nin `.` alt yoluna terfi
   eder, uygulamaya özgü projeksiyonlar terfi etmez.
