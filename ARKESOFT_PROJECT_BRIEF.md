# ARKESOFT — Ürün Brifingi

> Ajanların ve yeni katılanların okuduğu ürün bağlamı. **Teknoloji yığını, kod
> standartları ve yasaklar bu dosyada değil** — onlar `CLAUDE.md`'de. Sürüm planı ve
> kabul kriterleri `ROADMAP.md`'de. Bu dosya "ne inşa ediyoruz ve kim için" sorusunu
> cevaplar.

---

## 1. Ürün

Arkesoft, Türkiye pazarına yönelik **çok kiracılı (multi-tenant) bir SaaS e-ticaret ve
kurumsal web sitesi platformu**dur.

Müşteri panele girer, bir tema seçer, "Siteyi Kur" butonuna basar ve dakikalar içinde
kendi alan adında (veya `musteri.arkesoft.app` alt alan adında) çalışan, SSL'li, ödeme
ve kargo entegrasyonlu bir e-ticaret veya kurumsal sitesi elde eder.

### Bizi ayıran şey: her şey versiyonlanır

Platform çekirdeği, her tema ve her API sözleşmesi **ayrı ayrı semantik versiyon**
taşır. Müşteri kendi sitesinin hangi platform ve tema versiyonunda çalıştığını görür,
güncellemeyi kendisi "Uygula" butonuyla tetikler, bozulursa bir önceki versiyona döner.

Rakiplerin hiçbirinde bu yok. Her ürün kararı bu ilkeyi korumak zorundadır.

---

## 2. Rakipler ve referans aldığımız yönleri

| Rakip                   | Bizim için referans olan yönleri                                                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IdeaSoft**            | Hazır tema mağazası, tek panelden ürün/sipariş/kargo yönetimi, Türk pazaryeri entegrasyonları (Trendyol, Hepsiburada, N11, Amazon TR), e-fatura/e-arşiv, çok sayıda sanal POS |
| **ikas**                | Modern ve hızlı vitrin (Core Web Vitals odaklı), sade ama güçlü yönetim paneli, headless API, sosyal medya satış kanalları, uygulama mağazası mantığı                         |
| **Ticimax**             | Kurumsal müşteri yönetimi (B2B fiyat listeleri, bayi sistemi), ERP entegrasyonları, gelişmiş kampanya/kupon motoru, çoklu dil ve para birimi                                  |
| **Shopify** (yurt dışı) | Tema mimarisi, uygulama/tema versiyonlama, Admin API tasarımı, webhook sistemi                                                                                                |

`pm` ajanı her isteği bu tabloya karşı değerlendirir: rakipte karşılığı var mı, bizim
yaklaşımımız nasıl farklılaşıyor.

---

## 3. Hedef kullanıcılar

| #   | Kullanıcı                         | Ne ister                                                                                       | Dikkat                                                  |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | **Mağaza sahibi** (tenant admin)  | Ürün ekler, sipariş görür, kargo etiketi basar                                                 | **Teknik bilgisi olmayan KOBİ.** Arayüzde jargon olmaz. |
| 2   | **Kurumsal site sahibi**          | Sayfa, blog, iletişim formu, referanslar                                                       | E-ticaret modülü kapalıdır                              |
| 3   | **Arkesoft süper admin**          | Tüm tenant'ları, planları, faturalandırmayı, tema yayınlarını, platform versiyonlarını yönetir | Her işlem denetim kaydı bırakır                         |
| 4   | **Tema geliştirici** (ileride)    | Tema SDK'sı ile tema yazıp mağazaya yükler                                                     | v1.6.0                                                  |
| 5   | **Son müşteri** (alışveriş yapan) | Hızlı, mobil uyumlu, güvenilir vitrin                                                          | Hız ve SEO ticari gereklilik                            |

---

## 4. Modüller

### 4.1 Çekirdek (platform)

- Tenant kaydı, plan/abonelik, alt alan adı ve özel alan adı yönetimi, otomatik SSL
- Kullanıcı/rol/yetki (RBAC), 2FA, oturum yönetimi
- "Tek tuşla kur" provisioning işi: tenant → şema/seed → tema → DNS → SSL → hazır
- **Versiyon yöneticisi:** platform/tema/API versiyonlarını gösterir, güncelleme uygular, rollback yapar
- Webhook sistemi ve genel REST/tRPC API

### 4.2 E-ticaret

- Ürün, varyant (beden/renk), stok, kategori, marka, etiket, SEO alanları
- Sepet, ödeme (adres, kargo seçimi, misafir alışveriş)
- Sipariş yönetimi, iade, sipariş durumu bildirimleri (e-posta/SMS)
- Kampanya/kupon/indirim motoru, hediye çeki
- Müşteri hesapları, favoriler, yorum ve puanlama
- Çoklu dil ve para birimi (TRY varsayılan)

### 4.3 Türkiye entegrasyonları (adaptör deseni ile)

| Alan               | Sağlayıcılar                                      | İlk sürüm      |
| ------------------ | ------------------------------------------------- | -------------- |
| Ödeme              | iyzico, PayTR, Param, Sipay, banka sanal POS'ları | iyzico + PayTR |
| Kargo              | Yurtiçi, Aras, MNG, Sürat, PTT                    | Yurtiçi + Aras |
| E-fatura / e-arşiv | Entegratör üzerinden                              | Tek sağlayıcı  |
| Pazaryerleri       | Trendyol, Hepsiburada, N11                        | MVP sonrası    |
| SMS                | Netgsm, İleti Merkezi                             | —              |

### 4.4 Kurumsal site

- Blok tabanlı sayfa oluşturucu, blog, iletişim formu, referanslar, ekip, SSS
- E-ticaret modülü kapalıyken aynı tema altyapısı

### 4.5 Tema sistemi

- Tema = ayrı npm paketi, kendi `package.json` versiyonu, `theme.json` ayar şeması
- Tema sözleşmesi (`theme-sdk`) semver ile versiyonlanır; tema `peerDependency` ile
  hangi SDK aralığını desteklediğini bildirir
- Müşteri ayarları JSONB'de saklanır, tema güncellenince ayarlar migrate edilir
- **Her tema Playwright görsel regresyon testinden geçmeden yayınlanamaz**

### 4.6 Süper admin

- Tenant listesi, plan değişikliği, askıya alma, faturalandırma
- Tema yayınlama/kaldırma, platform sürümü yayınlama (canary → tüm tenant'lar)
- Sistem sağlığı ve kuyruk izleme

---

## 5. Mimari ilkeler

Bu yedi ilke her kararın üstündedir.

1. **Tenant izolasyonu her katmanda zorunlu.** Her sorgu `tenant_id` filtreli, Postgres
   RLS aktif, tüm testler çapraz tenant erişimini doğrular.
2. **Sözleşme önce (contract-first).** Prisma şeması ve tRPC router'ları tek doğruluk
   kaynağı. Değişiklik → migration → tip → istemci.
3. **Adaptör deseni.** Her dış sağlayıcı ortak bir arayüzün arkasında. Yeni sağlayıcı =
   yeni adaptör, çekirdek değişmez.
4. **Her şey arka planda.** Dakikadan uzun süren her iş BullMQ'ya gider; ilerleme
   durumu panelde görünür.
5. **Versiyon her yerde.** Platform, tema-sdk, her tema, public API ayrı semver.
   Kırıcı değişiklik → major, yeni özellik → minor, düzeltme → patch. Changesets zorunlu.
6. **Test olmadan kapanmaz.** Her modülün birim testi, her kritik akışın (kur, ürün
   ekle, sipariş ver, öde) Playwright testi var.
7. **ADR yaz.** Mimari karar gerektiren her konu `docs/adr/NNNN-baslik.md` olarak kaydedilir.

---

## 6. Nerede ne yazılı

| Soru                                                                   | Dosya                          |
| ---------------------------------------------------------------------- | ------------------------------ |
| Ne inşa ediyoruz, kim için, rakipler                                   | **bu dosya**                   |
| Teknoloji yığını, yasaklar, kod standartları, tenant izolasyon listesi | `CLAUDE.md`                    |
| Sürüm planı, kabul kriterleri, sürüm politikası, varsayımlar           | `ROADMAP.md`                   |
| Mimari kararların gerekçeleri                                          | `docs/adr/`                    |
| Yerel kurulum, komutlar, tuzaklar                                      | `docs/development.md`          |
| Çok ajanlı geliştirme döngüsü                                          | `.claude/workflow/WORKFLOW.md` |
