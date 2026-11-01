# ADR-0011 — Panel Orijin Topolojisi, Tek Orijin Vekili ve Kiracı Muafiyetinin Kiracısız Yüzeylere Uygulanması

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-31
- **Karar verenler:** Architect (T-008); kaynak bulgular: security (T-006 tur2/tur3 — `SameOriginGuard`), qa (T-007 — delege origin kontrolü), Orkestratör (T-008 R2 kararı), Kullanıcı (R1 — kiracı seçimi v0.1.0)
- **İlgili versiyon:** `v0.0.7` (v0.0.8, v0.0.15, v0.0.20 ve v0.1.0 bu karara bağlıdır)

---

## Bağlam

v0.0.7 platformun ilk tarayıcı istemcisini getiriyor. Üç ölçülmüş gerçek bu sürümden önce birbirinden bağımsız doğmuştu ve panel ilk kez üçünü **aynı anda** zorluyor.

**1. Kiracı yalnızca host'tan çözülür ve `panel` rezerve bir alt alan adıdır.** `reserved-subdomains.ts` `panel`'i kiracı slug'ı olarak yasaklar; `TenantContextMiddleware` panel host'unda kiracıyı çözemez ve `TenantGuard` kiracı gerektiren her yolu 404 ile reddeder. Bu **beklenen** davranıştır — panel bir kiracı değildir. Sonucu: panelin tüketeceği hiçbir tRPC yolu bugün panel host'unda erişilebilir değildir.

**2. `AUTH_BASE_URL` tek başına üç kararı taşıyor.** Better Auth'un `baseURL`'i (`auth-instance.ts`), `SameOriginGuard`'ın güvenilir orijini (`same-origin.guard.ts` — dosyanın kendi bağlayıcı kuralı "ikinci bir yapılandırma yüzeyi AÇILMAZ") ve dolaylı olarak doğrulama/sıfırlama bağlantılarının alan adı. Değer v0.0.5'te API'nin kendi portuna (`:3000`) ayarlandı, çünkü o sürümde tarayıcı istemcisi **yoktu**.

**3. İki bağımsız origin kontrolü etkindir ve ikisi de aynı değişkene bakar.** `SameOriginGuard` `/auth/sessions*` ve `/trpc` yüzeylerinde; Better Auth'un **kendi** `origin-check`'i delege `/auth/*` yollarında (`disableOriginCheck: env.NODE_ENV === 'test'` — yani geliştirme ve üretimde **açık**; qa tur 3 bunu HTTP seviyesinde 403 `INVALID_ORIGIN` ile ölçtü).

Dolayısıyla "panel nereden servis edilir" sorusu bir yerleşim tercihi değil, **CSRF savunmasının, çerez alan adının ve kiracı çözümünün birlikte verilmesi gereken tek kararıdır**.

## Karar

### 1. Platformun tarayıcıya dönük yüzeyi **tek orijindir**

Panel, `/trpc` ve `/auth` tarayıcı için **aynı orijinin** yollarıdır.

- **Üretim:** `https://panel.arkesoft.app` statik SPA'yı servis eder; ingress `/trpc/*` ve `/auth/*` yollarını API servisine yönlendirir. Başka hiçbir yol API'ye gitmez.
- **Geliştirme:** Vite dev/preview sunucusu `panel.arkesoft.{APP_BASE_DOMAIN}:<PANEL_DEV_PORT>` üzerinde aynı iki yolu API sürecine vekiller.

Sonucu: **CORS açılmaz.** `Access-Control-Allow-*` başlıkları hiçbir ortamda üretilmez, `credentials: 'include'` kullanılmaz (`same-origin` yeterlidir), güvenilir orijin kümesi genişlemez, Better Auth'a `trustedOrigins` listesi eklenmez. "Allow-Origin asla `*`" ve "keyfi `Origin` yansıtılmaz" garantileri **değer kontrolüyle değil, başlığın hiç var olmamasıyla** sağlanır — ve bu durum testle pinlenir.

### 2. `AUTH_BASE_URL`'in anlamı keskinleştirilir: **tarayıcının gördüğü platform orijini**

API'nin kendi dinleme adresi değildir. Geliştirmede panel geliştirme sunucusunun orijinidir; üretimde panel host'udur. İkinci bir yapılandırma yüzeyi **açılmaz** — `SameOriginGuard`'ın bağlayıcı kuralı korunur ve iki origin kontrolü tek değişkenden **tutarlı** beslenir.

**Bağlayıcı port birliği:** `AUTH_BASE_URL`'in portu, geliştirme sunucusunun portu ve e2e sunucusunun portu aynı olmak zorundadır. Komutlar `--strictPort` taşır (çakışmada sessizce kaymak yerine gürültülü kırılır) ve bir pin testi `.env.example`'daki portun kod sabitine eşitliğini doğrular. Gerekçe: port sapması **sessiz 403** üretir ve belirtisi hatadan çok "giriş çalışmıyor"dur — en pahalı teşhis sınıfı.

### 3. Kiracı muafiyeti, **kiracı verisi taşımayan** tRPC yollarına tek tek, tam eşleşmeyle verilir

`/trpc/session.me` `TENANT_EXEMPT_PATHS`'e eklenir (12 → 13). `AUTH_EXEMPT_PATHS`'e **hiçbir şey eklenmez** (9'da kalır).

Bu, `/auth/sessions*` üçlüsünün emsalinin birebir aynısıdır: **kiracıdan muaf, kimlikten muaf değil.** `AuthGuard`'ın üyelik dalı `tenant.kind === 'exempt'` için zaten `true` döner ve o dalın kendi yorumu bu senaryoyu adıyla anar.

**Muafiyetin üç koşulu (bağlayıcı — gelecekteki her ekleme bunları karşılamak zorundadır):**

1. Prosedürün **çıktı şeması** kiracıya ait hiçbir alan taşımaz (sızdırmazlık testle değil **tipin şekliyle** sağlanır).
2. Prosedür `protectedProcedure`'dür — kimlik zorunlu kalır; `publicProcedure`'ü HTTP'de erişilebilir kılmak **ayrı ve daha ağır** bir karardır ve bu ADR onu vermez.
3. Resolver kiracı bağlamını **hiç okumaz** (`ctx.tenant`'a erişim yok).

**Mekanizmanın dayandığı değişmezlik:** tam yol eşleşmesi + **batching kapalı** (ADR-0009 madde 8). Toplu istekte tek HTTP yolu birden fazla prosedür taşır ve yol-bazlı muafiyet **sessizce** geçersizleşir. Batching'i açmak bu ADR'yi de yeniden değerlendirmeyi gerektirir.

**Kardinalite assertion'ı susturulmaz.** Kümenin eleman sayısını birebir doğrulayan birim testi kasıtlı bir inceleme görünürlüğü mekanizmasıdır; büyütme her zaman aynı değişiklikte elle güncellenir, gevşetilmez (`toContain`'e düşürülmez, `.size` kaldırılmaz).

### 4. Kiracı-kapsamlı prosedürler panel host'undan **erişilemez kalır**

`/trpc/tenant.current` muafiyet kümesine girmez; panel host'unda 404 verir. Bu bir eksik değil, bu sürümün **tasarım kararıdır**: panelin kiracı seçimi (`tenant.list` + mağaza değiştirici) v0.1.0'a taşındı (kullanıcı kararı, 2026-10-31). Panel bu sürümde kiracı kavramını **hiç tanımaz**: kiracı kimliğini gövdede, başlıkta veya sorgu dizesinde **göndermez**.

### Değerlendirilen alternatifler

| Alternatif | Neden seçilmedi |
| ---------- | --------------- |
| Ayrı orijin + CORS + `credentials: include` | Üç güvenlik yüzeyini birden gevşetir: güvenilir orijin tek değerden kümeye geçer, Better Auth'a `trustedOrigins` eklenir, `Allow-Credentials` + `Allow-Origin` yankılaması yazılır. Üretimde hiçbir karşılığı yok — panel orada zaten tek host altında servis edilecek. Yanlış bir yankılama kuralı CSRF savunmasını tek satırda açar. |
| `AUTH_BASE_URL`'i API portunda bırakıp dev vekilinin `Origin` başlığını yeniden yazması | Geliştirme vekili güvenlik açısından anlamlı bir bileşene dönüşür ve dev/prod davranışı ayrışır; "ölçtüğüm ortam çalıştırdığım ortam değil" sınıfı hatalar doğar. |
| `SameOriginGuard` için ikinci bir env değişkeni (güvenilir orijin listesi) | Dosyanın kendi bağlayıcı kuralını bozar ve iki origin kontrolünün (bizim + Better Auth'un) **farklı** kaynaklardan beslenmesine yol açar — ikisinin sapması sessizdir. v0.0.20'de kaçınılmaz hâle gelebilir (bkz. gözden geçirme koşulu 2), ama bugün gereksiz. |
| Muafiyet yerine `/trpc`'ye prefix muafiyeti | Fail-open: bir gün eklenen kiracı-kapsamlı bir prosedür **sessizce** muaf olur. Tam eşleşme kuralı (`tenant-exempt-paths.ts`'in kurucu kararı) bilinçlidir. |
| Panel için kiracı başına host (her mağazanın kendi panel adresi) | Çerez ve oturum çoğalır, mağaza değiştirme yeniden giriş gerektirir; Shopify/ikas deseni tek host + değiştiricidir. R1 bunu v0.1.0'a ertelerken bu yönü seçti. |
| `session.me` yerine yeni bir kiracısız prosedür eklemek | Kapsam genişlemesi; mevcut prosedür zaten tam olarak bu ihtiyacı karşılıyor ve kiracı verisi taşımıyor. |

## Sonuçlar

### Olumlu

- Tek orijin sayesinde CORS, preflight ve `credentials: include` platformun hiçbir yerinde bulunmaz; CSRF savunması **gevşemeden** panel çalışır.
- İki origin kontrolü tek değişkenden beslenir; sapma yapısal olarak imkânsız.
- Geliştirme topolojisi üretim topolojisinin **aynısıdır** (tek orijin, iki vekillenmiş yol öneki) — vekilin kendisi dışında ortam farkı yok.
- Panel bundle'ında mutlak API adresi bulunmaz; yanlış yapılandırılacak bir `VITE_*` değişkeni yoktur.
- Muafiyetin üç koşulu yazılı olduğu için sonraki eklemeler tartışma değil **kontrol listesi** işidir; kardinalite assertion'ı her eklemeyi incelemeye zorlar.

### Olumsuz ve kabul edilen maliyetler

- `AUTH_BASE_URL`'in değeri değişir → mevcut `.env` dosyaları için **operatör müdahalesi** (v0.0.13'ün `DATABASE_URL` anlam değişikliğiyle aynı sınıf; `minor`, geçiş notu zorunlu).
- Geliştirmede tarayıcıdan **doğrudan** API portuna gitmek artık delege uçlarda 403 `INVALID_ORIGIN` verir (Better Auth'un kendi kontrolü). Komut satırı istemcileri (Origin başlığı göndermeyen) etkilenmez. Panel üzerinden gitmek tek desteklenen tarayıcı yoludur; bu `docs/development.md`'ye yazılır.
- Geliştirme vekili yeni bir hareketli parçadır; port birliği bir pin testiyle korunmak zorundadır.
- `AUTH_BASE_URL` **tek** bir orijin taşır. İkinci bir tarayıcı orijini (süper admin paneli) geldiğinde bu yetersiz kalacaktır — bilinçli olarak bugün çözülmemiştir (bkz. gözden geçirme koşulu 2).
- Muafiyet kümesi büyüdü. Her büyüme bir güvenlik kararıdır ve maliyeti inceleme yüküdür; bu yük kardinalite assertion'ıyla **bilerek** görünür tutulur.

### Etkilenen sonraki kararlar

- **v0.0.8 (storefront):** kiracı host'ları (`magaza.arkesoft.app`) **başka** bir host desenidir ve bu ADR'yi ihlal etmez: ROADMAP v0.0.8 API çağrısının **sunucu tarafında, iç ağ üzerinden** yapılmasını şart koşuyor → tarayıcı orijini sorunu o yüzeyde **doğmaz**. Vitrinden tarayıcı içi bir yazma yüzeyi açılırsa (sepet, v0.5.0) bu karar yeniden açılır.
- **v0.0.15 (2FA / oturum ekranı):** `/auth/sessions*` üçlüsü zaten aynı muafiyet sınıfında; panelin giriş akışı araya bir adım eklenebilir biçimde kurulmuştur (dönüş tipi ayrımlı birleşimdir).
- **v0.0.20 (süper admin):** **üçüncü** host (`superadmin.arkesoft.app`) ikinci bir tarayıcı orijini demektir. İki yol vardır ve o sürümün architect'i seçmek zorundadır: (a) güvenilir tarayıcı orijinlerini **liste** hâline getirmek (`SameOriginGuard` küme karşılaştırmasına geçer, Better Auth'a `trustedOrigins` eklenir — bu ADR'nin reddettiği yüzey o zaman kaçınılmaz olur, ama **bilinçli** olarak açılır), ya da (b) süper admini aynı orijinin bir yol öneki altında servis etmek. Bu ADR kararı vermez, **soruyu kayda geçirir.**
- **v0.1.0 (panel kiracı seçimi):** tek orijin altında kiracı host'tan **çözülemez**. ADR-0009 madde 7 "`tenantId` asla prosedür girdisinden alınmaz; yalnızca host çözümünden gelen istek bağlamından okunur" diyor. v0.1.0 ya kiracıyı **oturuma bağlı seçili kiracı** olarak yeni bir çözüm kaynağından okumak (ADR-0009 madde 7'yi **genişletmek** — host dışında ikinci bir güvenilir kaynak tanımlamak, girdiden okumak **değil**) ya da paneli kiracı host'una yönlendirmek zorundadır. Bu, v0.1.0'ın **ilk** tasarım sorusudur ve bugün karara bağlanmaz.
- **v0.0.22 (API sürümleme):** sözleşme snapshot'ının pinlemesi gereken şey yalnızca şemalar değil, **erişilebilirlik matrisidir** (hangi yol hangi host sınıfından açık). Bir yolu muafiyet kümesinden çıkarmak, şema değişmese bile tüketici için kırıcıdır.

## Gözden geçirme koşulları

1. **Panel ile API'nin aynı orijinde servis edilemeyeceği bir dağıtım topolojisi zorunlu olursa** (ör. panelin ayrı bir CDN alan adından servis edilmesi) — madde 1 düşer; CORS + güvenilir orijin kümesi + `Allow-Credentials` birlikte tasarlanır ve bu ADR yerine yeni bir ADR yazılır.
2. **İkinci bir tarayıcı orijini eklendiğinde** (v0.0.20) — madde 2'nin "tek değer" dayanağı düşer; güvenilir orijin listesi kararı verilir.
3. **Batching açılmak istenirse** — madde 3'ün mekanizması geçersizleşir; muafiyetin prosedür bazına taşınması tasarlanmak zorundadır (ADR-0009 gözden geçirme koşulu 1 ile aynı kapı).
4. **Muafiyet kümesine kiracı verisi taşıyan bir prosedür eklenmek istenirse** — madde 3'ün üç koşulu karşılanmıyor demektir; istek reddedilir ve ihtiyaç kiracı çözümünün kendisinde (v0.1.0'ın seçili-kiracı kaynağı) çözülür.
5. **Better Auth'un origin kontrolünün davranışı veya `baseURL` semantiği değişirse** — madde 2'nin "iki kontrol tek kaynaktan beslenir" garantisi yeniden ölçülür.
