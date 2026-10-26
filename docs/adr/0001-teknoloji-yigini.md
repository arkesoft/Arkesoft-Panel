# ADR-0001 — Teknoloji Yığını

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-26
- **Karar verenler:** Arkesoft ürün ve mühendislik
- **İlgili versiyon:** `v0.0.1` ve sonrası (bkz. `ROADMAP.md`)

---

## Bağlam

Arkesoft, Türkiye pazarına yönelik çok kiracılı bir SaaS e-ticaret ve kurumsal web sitesi platformu kuruyor. Ürünün çözmesi gereken problem şu kısıtları getiriyor:

1. **Tek kod tabanı, binlerce kiracı.** Her müşteriye ayrı kurulum yapılamaz; tek dağıtım birden fazla tenant'a hizmet eder ve veri izolasyonu kesin olmak zorundadır.
2. **Dakikalar içinde site kurulumu.** "Siteyi Kur" butonu DNS, SSL, seed ve tema kurulumunu içeren uzun süreli bir işi tetikler; bu işin durumu kullanıcıya canlı yansımalıdır.
3. **Vitrin performansı ticari bir gerekliliktir.** Dönüşüm oranı ve SEO doğrudan Core Web Vitals'a bağlı. Vitrin büyük ölçüde içerik ağırlıklı ve etkileşim adacıkları sınırlı.
4. **Panel karmaşık bir uygulamadır.** Vitrinin aksine panel SEO gerektirmez; yoğun form, tablo, filtre ve gerçek zamanlı durum içerir.
5. **Her şey versiyonlanır.** Platform, tema sözleşmesi, her tema ve public API ayrı semver taşır. Bu, paket sınırlarının ve sözleşmelerin derleme zamanında zorlanmasını gerektirir.
6. **Türkiye'ye özgü entegrasyon yoğunluğu.** Ödeme (iyzico, PayTR, banka POS'ları), kargo (Yurtiçi, Aras, MNG, Sürat, PTT), e-fatura, pazaryerleri, SMS. Sağlayıcılar değişir, çekirdek değişmemelidir.
7. **Küçük ekip.** Aynı kişiler backend, panel ve vitrini yazıyor. Bağlam değiştirme maliyeti ve tip güvenliği birinci derecede önemli.
8. **Ürün uzun ömürlü olacak.** Rakipler (IdeaSoft, ikas, Ticimax) yıllardır sahada. Teknoloji seçimleri 5+ yıl taşınabilir olmalı; tek satıcıya (vendor) kilitlenme riski minimize edilmeli.

Bu bağlamda bir yığın seçmemiz ve bu seçimleri dondurmamız gerekti. Ekip içinde her sprint'te teknoloji tartışması açmak, ürünü geciktiren asıl risktir.

---

## Karar

Aşağıdaki yığın benimsenmiştir. Bu kararlar **tartışmaya kapalıdır**; değiştirmek yeni bir ADR gerektirir.

### Dil: TypeScript (strict)

Tek dil, tek tip sistemi, backend'den vitrine kadar paylaşılan tipler. `strict` mod ve `any` yasağı; çünkü asıl değeri tipin kendisi değil, **ihlal edilemez olması** sağlıyor.

### Backend API: NestJS

Modül, bağımlılık enjeksiyonu, guard, interceptor ve middleware kavramları hazır. Tenant context, yetkilendirme ve denetim kaydı gibi **kesişen kaygılar** (cross-cutting concerns) bu yapılarla tek yerde çözülüp her endpoint'te otomatik uygulanabiliyor — çok kiracılı bir sistemde en kritik ihtiyaç bu. Kuyruk worker'ı da aynı modül grafiğini yeniden kullanıyor.

### Vitrin: Astro (SSR, React adaları)

Vitrin içerik ağırlıklı; varsayılan olarak sıfır JavaScript gönderip yalnızca gerekli yerde (varyant seçici, sepet, arama) React adası yüklemek Core Web Vitals hedefleri için en doğrudan yol. SSR modu, host adından tenant çözümü ve kişiselleştirilmiş içerik için gerekli. Tema sistemi için Astro'nun dosya tabanlı şablon ve bileşen modeli, tema sözleşmesine doğal olarak oturuyor.

### Panel ve süper admin: Vite + React + TanStack Router + shadcn/ui + Tailwind

Panel SEO gerektirmiyor; SSR'nin karmaşıklığını ödemenin karşılığı yok. Vite'ın geliştirme döngüsü hızlı. TanStack Router tip güvenli rotalama ve arama parametresi doğrulaması sağlıyor — yoğun filtreli tablolarda doğrudan işe yarıyor. shadcn/ui bileşenleri kaynak olarak repoya geldiği için (bağımlılık olarak değil) tasarım sistemimizi `packages/ui` içinde sahiplenebiliyoruz.

### API tip paylaşımı: tRPC

Panel ve API aynı monorepoda, aynı ekip tarafından yazılıyor. tRPC ile prosedür imzaları derleme zamanında paylaşılıyor; kod üretimi adımı ve şema kayması (drift) ortadan kalkıyor. Public API ihtiyacı için `/api/v1` REST köprüsü ve OpenAPI üretimi ayrıca sağlanıyor (bkz. `ROADMAP.md` v0.0.22) — yani tRPC iç sözleşme, REST dış sözleşme.

### Veritabanı: PostgreSQL — tek veritabanı, `tenant_id` + Row Level Security

Binlerce tenant için tenant başına veritabanı veya şema, migration ve bağlantı havuzu yönetimini işletilemez hale getirir. Paylaşılan şema + `tenant_id` + RLS, izolasyonu **veritabanı seviyesinde** zorlayarak uygulama katmanı hatasının veri sızıntısına dönüşmesini engelliyor. RLS, "her sorguda filtre koymayı hatırlamak" yaklaşımına göre niteliksel olarak daha güvenli.

### ORM: Prisma

Şema tek doğruluk kaynağı, migration'lar sürüm kontrolünde, üretilen istemci tam tipli. Prisma client extension'ları ile her işlemin başında `SET LOCAL app.tenant_id` çalıştırmak ve tenant'a kapsamlı istemci sunmak mümkün — RLS kararımızla doğrudan uyumlu.

### Önbellek ve kuyruk: Redis + BullMQ

Provisioning, görsel türevleri, arama indeksleme, pazaryeri senkronizasyonu, fatura kesme, webhook teslimi — hepsi uzun süreli ve yeniden denenebilir olmalı. BullMQ yeniden deneme, backoff, DLQ, ilerleme raporlama ve zamanlama ihtiyaçlarını karşılıyor. Redis zaten önbellek ve oran sınırlama için gerekli; tek bir altyapı bileşeni iki işi görüyor.

### Arama: Meilisearch

Türkçe arama kalitesi (yazım hatası toleransı, karakter normalizasyonu, eşanlamlı) ürünün satış kalitesini doğrudan etkiliyor. Meilisearch bunları kutudan çıkar halde makul sunuyor, işletme yükü Elasticsearch'e göre çok daha düşük ve tenant başına indeks + kapsamlı (scoped) anahtar modeli izolasyon ihtiyacımıza oturuyor.

### Dosya/medya: S3 uyumlu depolama (dev: MinIO, prod: Cloudflare R2)

S3 API'si fiilî standart. Geliştirmede MinIO ile aynı arayüz, üretimde R2 ile çıkış (egress) maliyeti yok ve Cloudflare CDN'i ile aynı ekosistemde. Bir `StorageAdapter` soyutlaması sağlayıcı değişimini mümkün tutuyor.

### Kimlik doğrulama: Better Auth

Oturum, e-posta doğrulama, şifre sıfırlama, 2FA ve organizasyon/üyelik kavramlarını TypeScript-öncelikli bir API ile veriyor; Prisma adapter'ı ile kullanıcı verisi bizim şemamızda kalıyor. Dış kimlik sağlayıcısına kilitlenmiyoruz — çok kiracılı bir platformda kullanıcı-tenant ilişkisi ürünün çekirdeği, kiralanacak bir parça değil.

### Monorepo: Turborepo + pnpm workspaces

Dört uygulama ve dokuz paket arasında tip paylaşımı, bağımlılık yönünün zorlanması ve bağımsız versiyonlama gerekiyor. pnpm workspace sembolik bağlarıyla paket sınırları gerçek; Turborepo görev grafiği ve uzak önbellek ile CI süresini makul tutuyor. Her temanın kendi `package.json` versiyonunu taşıması bu yapı sayesinde doğal.

### Test: Vitest + Playwright

Vitest Vite yapılandırmasını paylaşıyor ve hızlı; birim ve gerçek Postgres/Redis'e karşı entegrasyon testleri için kullanılıyor. Playwright çoklu tarayıcı, mobil viewport ve **görsel regresyon** desteği veriyor — tema yayın kapımız buna dayanıyor.

### Altyapı kodu: Pulumi (TypeScript)

Altyapı da aynı dilde yazılıyor; tip güvenliği, döngü/koşul gibi gerçek programlama yapıları ve mevcut test araçları kullanılabiliyor. Ekibin öğrenmesi gereken ikinci bir şablon dili (HCL) yok.

### Konteyner ve orkestrasyon: Docker (dev: compose), Kubernetes + Helm (prod)

Geliştirmede tek komutla beş altyapı servisi. Üretimde tenant sayısına göre bağımsız ölçeklenmesi gereken birden fazla çalışma birimi (api, worker, storefront, admin) var; Kubernetes bunu, Helm ise ortamlar arası yapılandırma farkını yönetiyor. cert-manager ile özel alan adları için otomatik SSL aynı ekosistemde çözülüyor.

### CI/CD ve sürüm: GitHub Actions + Changesets

Changesets bu projenin **ayırt edici gereksinimini** karşılıyor: tek repoda birbirinden bağımsız semver taşıyan birimler (platform, theme-sdk, her tema) ve her birinin kendi değişiklik kaydı. Her PR'da changeset zorunluluğu, sürüm notlarını geliştirme anında üretiyor.

### Gözlemlenebilirlik: OpenTelemetry + Sentry + Grafana/Loki

Çok kiracılı bir sistemde "hangi tenant, hangi istek, hangi iş" sorusunun tek bir `traceId` ile yanıtlanması şart. OpenTelemetry satıcıdan bağımsız enstrümantasyon sağlıyor; Sentry hata triyajı, Grafana/Loki log ve metrik tarafını görüyor.

### Lint/format: ESLint (strict) + Prettier

Standartlar görüş değil kural olmalı. `any` yasağı, float ile para yasağı, tenant filtresiz sorgu tespiti gibi proje kuralları ESLint kuralı olarak yazılıyor ve CI'da zorlanıyor.

### Açıkça reddedilenler

| Reddedilen                       | Gerekçe                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Next.js**                      | Vitrin ve panelin ihtiyaçları birbirinden keskin biçimde farklı: vitrin minimum JavaScript ve SSR istiyor, panel zengin istemci uygulaması istiyor. İkisini tek çatı altında çözen bir çerçeve, her iki tarafta da ödün demek. Astro + Vite kombinasyonu her iki tarafa doğrudan hitap ediyor. Ayrıca çerçevenin kendi sürüm politikası ve mimari kaymaları, "her şey versiyonlanır" taahhüdümüzün üstünde kontrol edemediğimiz bir katman oluşturuyor. **Yasak.** |
| Tenant başına veritabanı/şema    | Binlerce tenant'ta migration, bağlantı havuzu ve yedekleme işletilemez hale gelir.                                                                                                                                                                                                                                                                                                                                                                                 |
| GraphQL                          | İç tüketici tek ve monorepoda; tRPC daha az makine ile aynı tip güvenliğini veriyor. Dış tüketici için REST + OpenAPI yeterli.                                                                                                                                                                                                                                                                                                                                     |
| Elasticsearch                    | İşletme yükü ve kaynak tüketimi, ihtiyacımız olan arama kalitesi için fazla.                                                                                                                                                                                                                                                                                                                                                                                       |
| Terraform                        | Pulumi ile aynı işi TypeScript'te yapıyoruz; ikinci bir dil öğrenme maliyeti gerekçesiz.                                                                                                                                                                                                                                                                                                                                                                           |
| Tipsiz JavaScript kaynak dosyası | Tip sisteminin değeri ihlal edilemezliğinden gelir. **Yasak.**                                                                                                                                                                                                                                                                                                                                                                                                     |

---

## Sonuçlar

### Olumlu

- Uçtan uca tek dil ve tek tip sistemi; şema değişikliği Prisma'dan tRPC'ye ve panele derleme hatası olarak yayılıyor.
- Tenant izolasyonu veritabanı seviyesinde zorlanıyor; uygulama hatası otomatik olarak veri sızıntısına dönüşmüyor.
- Vitrin ve panel kendi ihtiyaçlarına göre optimize edilmiş ayrı araçlar kullanıyor; biri diğerini sınırlamıyor.
- Monorepo + Changesets, "her şey versiyonlanır" taahhüdünü araç seviyesinde mümkün kılıyor.
- Adaptör deseni ve soyutlamalar (`PaymentAdapter`, `ShippingAdapter`, `StorageAdapter`, `InvoiceAdapter`) sayesinde Türkiye'ye özgü sağlayıcı çeşitliliği çekirdeği kirletmiyor.
- Yığının tamamı açık kaynak ve kendi kendine barındırılabilir; tek bir satıcıya kilitlenme yok.

### Olumsuz ve kabul edilen maliyetler

- **Operasyonel yüzey geniş.** Postgres, Redis, Meilisearch, S3, Kubernetes — hepsi işletilmesi gereken bileşenler. Üretime çıkmadan önce yedekleme, izleme ve runbook yazımı zorunlu kılındı (`ROADMAP.md` v0.18.0, v0.20.0).
- **RLS disiplin gerektiriyor.** Yeni tablo eklerken politika yazmayı unutmak sessiz bir güvenlik açığıdır. Karşı önlem: CI'da şema linter'ı ve her kaynak için zorunlu izolasyon testi (v0.0.13).
- **Dört uygulama ve dokuz paket, küçük bir ekip için yüksek yapısal karmaşıklık.** Karşı önlem: `CLAUDE.md`'de net sorumluluk sınırları ve bağımsızlık yönü kuralı.
- **tRPC içe dönük bir sözleşmedir.** Dışa açık API için ayrı bir REST/OpenAPI katmanı yazma ve iki sözleşmeyi senkron tutma maliyeti var. Karşı önlem: sözleşme snapshot testi (v0.0.22).
- **Astro'nun React ekosistemine göre bileşen ekosistemi daha küçük.** Karşı önlem: etkileşimli parçalarda React adası kullanımı ve `packages/ui`'nin paylaşılması.
- **Pulumi durum (state) yönetimi gerektiriyor.** Karşı önlem: yönetilen backend ve ortam başına stack ayrımı.
- **Better Auth, kurumsal kimlik sağlayıcılarına göre daha genç bir proje.** Karşı önlem: kullanıcı verisinin kendi şemamızda kalması; gerekirse kimlik doğrulama katmanı değiştirilebilir, veri taşınmaz.

### Bu kararın etkilediği sonraki ADR'ler

- **ADR-0002** — Tema dağıtım ve çalışma zamanı modeli (temaların derleme zamanında paketlenmesi, çok kiracılı tek storefront dağıtımı).
- **ADR-0003** — Tenant izolasyon stratejisinin ayrıntıları (RLS politika deseni, bağlantı havuzu ve rol modeli).
- **ADR-0004** — Public API sürümleme ve kullanımdan kaldırma politikası.

### Gözden geçirme koşulları

Bu ADR şu durumlarda yeniden değerlendirilir:

- Tek Postgres örneği tenant sayısı veya yazma yükü nedeniyle ölçeklenemez hale gelirse (parçalama/sharding kararı).
- Vitrin performans hedefleri Astro ile tutulamazsa.
- Ana bağımlılıklardan biri bakımsız kalırsa veya lisansı değişirse.

---

## Sonraki güncellemeler

Bu ADR geçmişe dönük düzenlenmez. Kararlarından biri değiştiğinde buraya
yalnızca bir işaretçi eklenir:

- **2026-10-26 — yerel geliştirmede nesne depolama:** MinIO'nun public Docker
  imajları anonim erişimden kalktığı için yerel S3 servisi **SeaweedFS** olarak
  değişti. Üretim depolaması (Cloudflare R2) etkilenmedi. Bkz.
  [ADR-0005](./0005-yerel-s3-depolama.md).
