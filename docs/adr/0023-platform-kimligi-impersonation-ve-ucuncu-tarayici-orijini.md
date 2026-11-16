# ADR-0023 — Platform Kimliği, İz Bırakan Kiracı Erişimi (Impersonation) ve Üçüncü Tarayıcı Orijini

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-15
- **Karar verenler:** architect (T-021); kaynak kararlar: ADR-0011 gözden geçirme koşulu 2,
  ROADMAP:3075-3076 (kullanıcı onaylı iki taşıma, 2026-11-04), kullanıcı kapsam kararları
  (2026-11-15, T-021)
- **İlgili versiyon:** `v0.0.20` (v0.0.20.1, v0.0.22 ve v0.15.0 bu karara bağlıdır)

---

## Bağlam

v0.0.20 platformun **üçüncü** tarayıcı uygulamasını ve **ilk kiracı-dışı yetki eksenini**
getiriyor. Dört ölçülmüş gerçek bu sürümden önce birbirinden bağımsız doğdu ve bu sürüm
dördünü aynı anda zorluyor.

**1. Kiracı rolü enum'u platform yetkisini yapısal olarak reddediyor.**
`schema.prisma:966` _"`platform_admin` YOKTUR — platform yetkisi, üyelik değildir"_ diyor;
`packages/trpc/src/__tests__/permissions-catalog.test.ts:51` bunu **canlı bir mekanik pinle**
koruyor (`expect(roles).not.toContain('platform_admin')`). Oturum ne kiracı ne platform
kapsamı taşıyor (`schema.prisma:256-271`).

**2. Kiracı verisine erişimin tek kapısı RLS + GUC.** `BYPASSRLS` bir politika değil
**katalog kuralı** (`packages/db/src/catalog-lint.ts` → `APP_ROLE_IS_SUPERUSER_OR_BYPASSRLS`).
Yani "süper admin kiracı verisini nasıl görür" sorusunun cevabı mimari olarak zaten
daraltılmış: ya GUC kurulur, ya hiçbir satır görülmez.

**3. Kiracı listesinin `plan` kolonu kiracı kapsamlı bir tabloda.**
`Tenant.planId` v0.1.0'dan beri DEPRECATED ve **sıfır** yazıcı/okuyucusu var
(`schema.prisma:105-117`); tek doğruluk kaynağı `Subscription.planId`'dir ve `subscription`
`TENANT_SCOPED_TABLES`'ın üyesidir (RLS `ENABLE`+`FORCE`, `tenancy.ts:177-185`).
⇒ Bir platform listesi `plan`'ı **kiracı bağlamı kurmadan okuyamaz.**

**4. `AUTH_BASE_URL` tek bir tarayıcı orijini taşıyor.** ADR-0011 bunu bilinçli olarak
tek değerde tuttu ve maliyetini yazdı: _"İkinci bir tarayıcı orijini (süper admin paneli)
geldiğinde bu yetersiz kalacaktır — bilinçli olarak bugün çözülmemiştir"_ (ADR-0011:85),
kararı adıyla v0.0.20'nin architect'ine bıraktı (:92).

## Karar

### 1. Platform yetkisi bir PLATFORM KAYDIDIR; enum'a, üyeliğe ve oturuma dokunulmaz

Yeni platform seviyesi tablo `platform_admin` (`user_id` benzersiz, `app_user`'a
`ON DELETE CASCADE` FK). **`TenantRole` enum'u değişmez**, `tenant_membership`'e satır
yazılmaz, `session` şeması değişmez.

Yetki **her istekte okunur** — `permission-procedure.ts:62-66`'nın yazılı gerekçesinin
birebir uygulaması: _"rol KİRACI bazlı, kimlik KULLANICI bazlıdır (kategori hatası) ve
oturum kiracı taşımaz"_. Aynı kategori hatası platform yetkisi için de geçerlidir:
platform yetkisi **oturumun** değil, **kullanıcının** bir özelliğidir ve oturum belirteci
onu taşımaya çalışmamalıdır (taşırsa yetki iptali oturum ömrü kadar gecikir).

`platform_admin`'de **`status` kolonu yoktur**: bu sürümde onu yazacak bir yüzey
olmadığı için ölü bir sözlük olurdu (`schema.prisma:995-999`'un kuralı). Yetki = satırın
varlığı; iptal = satırın silinmesi.

**Platform yöneticisi olmak tek başına sıfır kiracı verisi erişimi verir.** Satır ne
RLS'i etkiler, ne GUC kurar, ne yeni bir veritabanı rolü getirir. Tersi de doğrudur:
platform yöneticisi bir kiracı ucuna çağrı yaptığında `AuthGuard`'ın üyelik dalı
(`auth.guard.ts:123-147`) değişmeden çalışır ve üye değilse **403** alır.

### 2. 2FA zorunluluğu PROSEDÜR BUILDER'INDA zorlanır, oturum kurulumunda değil

Merdivenin **altıncı** basamağı:
`platformAdminProcedure = protectedProcedure.use(<platform kaydı + 2FA kapısı>)`.

Kapı iki şeyi sırayla zorlar: (a) `platform_admin` kaydı var mı → yoksa **403**
`PLATFORM_ADMIN_REQUIRED`; (b) `app_user.two_factor_enabled` → `false` ise **403**
`TWO_FACTOR_REQUIRED` (mevcut hata sınıfı yeniden kullanılır, yenisi yazılmaz).

`tenantProcedure` üzerine **kurulamaz**: süper admin host'u rezerve bir alt alan adıdır
(`reserved-subdomains.ts:35`), `resolveHost` onu çözümsüz bırakır, `ctx.tenant` daralmaz.
Bu, `registration.*` üçlüsünün (ADR-0021) birebir aynı yapısal kısıtıdır.

**401 değil 403:** kimlik kurulmuştur; eksik olan yetkidir. Bu bir varlık oracle'ı
değildir — iki hata da yalnızca **çağıranın kendisi** hakkındadır
(`permission-procedure.ts:70-73`'ün aynı gerekçesi).

### 3. Kiracı verisine platform yolundan erişimin TEK yolu, denetim girdisini ZORUNLU PARAMETRE alan bir imzadır

`apps/api/src/platform/impersonation.service.ts`:

```ts
runImpersonated<T>(
  entry: PlatformAuditEntry,                 // ZORUNLU BİRİNCİ PARAMETRE
  tenantIds: readonly string[],
  read: (tx: TenantTransactionClient, tenantId: string) => Promise<T>,
): Promise<ReadonlyMap<string, T>>
```

Bu, `apps/api/src/audit/audit-log.writer.ts:4-21`'in **zaten kurulu** iki ayaklı
deseninin çoğaltılmasıdır: tip sistemi kayıtsız erişimi **derlenemez** kılar; bir grep
kapısı `apps/api/src/platform/**` içinde veri katmanına doğrudan erişimin **sıfır**
olduğunu ve `runImpersonated`'ın **tam bir** çağrı yeri bulunduğunu doğrular. Kapının
boşa çıkmadığı **kasıtlı mutasyonla** (ikinci çağrı yeri) kırmızı görülerek kanıtlanır.

**Denetim birimi = ERİŞİM OPERASYONU, kiracı değil.** Bir `runImpersonated()` çağrısı
**bir** `platform_audit_log` satırı yazar ve satırın `detail.tenantIds` alanı erişilen
kiracı kümesinin **tamamını** adlandırır; ardından her kiracı için ayrı `withTenant()`
açılır.

Gerekçe ölçüldü: kiracı başına kayıt, bir liste görüntülemesini N satıra çevirir ve
denetim izini gürültüye boğar — izin okunabilirliği, izin kendisinin varlık sebebidir.
Kabul edilen bedel: _"X kiracısına kim erişti"_ sorgusu `detail` JSON'ı içinden,
**indekssiz** yapılır (v0.15.0'ın işi).

**Yeni veritabanı rolü, yeni GUC, `SECURITY DEFINER` fonksiyon ve view/matview
YOKTUR.** Mekanizma mevcut `arkesoft_app` rolünü ve mevcut `withTenant()`'ı kullanır —
yani `BYPASSRLS` yasağı ve katalog linter'ının görüş alanı **hiç zorlanmaz**.

### 4. Üçüncü tarayıcı orijini: GÜVENİLİR ORİJİN LİSTESİ (ADR-0011'in (a) yolu), CORS AÇILMADAN

ADR-0011:92 iki yol tanımlamıştı. **(a) seçildi**, (b) (_"süper admini aynı orijinin bir
yol öneki altında servis etmek"_) elendi: geliştirmede iki ayrı Vite sunucusu aynı
host:port'u paylaşamaz; paylaşabilmesi için admin dev sunucusunun süper admin bundle'ını
da servis etmesi gerekirdi — iki uygulamayı geliştirme zamanında birbirine bağlar ve
_"ayrı uygulama"_ kapsam maddesini geliştirme ortamında geçersiz kılar.

Uygulama kısıtları **bağlayıcı**:

1. Güvenilir orijin listesi **tek bir türetme fonksiyonundan** çıkar
   (`apps/api/src/auth/trusted-origins.ts`): `[origin(AUTH_BASE_URL)]` +
   `SUPERADMIN_BASE_URL` verilmişse onun orijini. **Hem** `SameOriginGuard` **hem**
   Better Auth'un `trustedOrigins`'i **aynı** fonksiyonu tüketir ⇒ ADR-0011'in
   _"iki origin kontrolü tek kaynaktan beslenir"_ garantisi **korunur**.
2. **CORS AÇILMAZ.** Süper admin SPA'sı `/trpc` ve `/auth`'u kendi sunucusundan vekiller
   (`apps/admin`'in deseni) ⇒ tarayıcı isteği same-origin kalır. `Access-Control-Allow-*`
   hiçbir ortamda üretilmez; bunu doğrulayan pin testi **korunur**.
3. Liste **tam eşleşmeli orijin dizeleri** taşır — joker, alt alan adı deseni veya
   `Origin` yansıtması **yasaktır**.
4. Liste **kardinalite assertion'ı** taşır (`TENANT_EXEMPT_PATHS`'in emsali): büyütmek
   testi elle değiştirmeyi, yani kod inceleme görünürlüğünü **zorunlu** kılar.
5. `SUPERADMIN_BASE_URL` **verilmediğinde davranış bugünküyle bayt-birebir aynıdır**
   ⇒ bu değişiklik operatör müdahalesi gerektirmez ve **minor**'dır.

Oturum çerezi `AUTH_COOKIE_DOMAIN`'in varsayılanı (`.${APP_BASE_DOMAIN}`) sayesinde her
iki alt alan adında da geçerlidir — ikinci bir çerez alanı **açılmaz**.

### 5. IP kısıtlaması: env tabanlı, fail-closed, SAVUNMA DERİNLİĞİ — birincil yetkilendirme DEĞİL

`SUPERADMIN_IP_ALLOWLIST` (virgülle ayrılmış, varsayılan `''`). Bir Nest guard'ı
süper admin tRPC yollarında şunu zorlar:

- liste **boşsa** → yüzeyin tamamı **403** (fail-closed; "yapılandırılmamış = kapalı"),
- çözülen istemci IP'si listede **yoksa** → 403,
- çözülen IP `UNKNOWN_IP` sentinel'i ise → **403** (bir değer gibi görünen yokluk
  yetkilendirmeye girdi olamaz).

**Bağlayıcı sınır:** bu kapı **birincil yetkilendirme değildir**. Birincil yetkilendirme
oturum + `platform_admin` kaydı + 2FA'dır; IP kapısı **üçüncü** bir katmandır. Gerekçe
ölçüldü: istemci IP'si `resolveClientIp` ile çözülür ve `AUTH_TRUSTED_PROXY_COUNT`
yanlış yapılandırılırsa saldırgan kendi yazdığı `X-Forwarded-For` hop'unu seçtirebilir
(`ROADMAP:3109`, `security` L5). Varsayılan `0`'da başlık **tamamen yok sayılır**
(soket adresi kullanılır) ve bugün sömürülebilir değildir — ama bir **yetkilendirme
kapısını** doğrulanmamış bir değerin üstüne kurmak o borcu taşıyıcı hâle getirirdi.
Bu karar, güvenlik özelliğinin **spoof edilebilir bir değere dayanmamasını** garanti eder.

Yönetici başına IP kuralı ve yönetim arayüzü **kapsam dışıdır** (v0.15.0, kullanıcı kararı).

### Değerlendirilen alternatifler

| Alternatif                                                                  | Neden seçilmedi                                                                                                                                                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TenantRole` enum'una `platform_admin` eklemek                              | Şemanın yazılı kararını sessizce ters çevirir ve canlı mekanik pini (`permissions-catalog.test.ts:51`) kırar; kiracı rolü sözlüğüne kiracı dışı anlam yükler                                             |
| Platform yetkisini oturum satırına yazmak                                   | Yetki iptali oturum ömrü kadar gecikir; `session` şeması ve Better Auth yüzeyi genişler; "rol her istekte okunur" kararıyla (ADR-0016) çelişir                                                              |
| `Tenant.planId`'ı canlandırmak                                              | `Subscription.planId` ile **iki cevap** doğar — T-018'in bir sürüm harcayarak kapattığı çift doğruluk kaynağı sınıfı (ADR-0021 §4). Ayrıca kolon bugün **boştur**, kabul kriterinin "gerçek değerler" şartını karşılayamaz |
| Platform seviyesi view/matview projeksiyonu                                 | `catalog-lint.ts`'in `UNEXPECTED_RELATION_KIND` kuralı view'ları **koşulsuz bulgu** sayıyor (allowlist yok); linter genişletmesi v0.0.14.1 sınıfı ayrı bir iştir                                            |
| Kiracı başına impersonation kaydı                                           | N kiracılık bir liste görüntülemesi N denetim satırı üretir; izin okunabilirliği, izin varlık sebebidir                                                                                                     |
| Platform okuması için `USING (true)` taşıyan ikinci bir RLS politikası + ayrı rol | `BYPASSRLS`'in adı değişmiş hâli; bu sürümün iş hedefinin tam zıddı                                                                                                                                      |
| `SECURITY DEFINER` fonksiyonla kiracı verisi okuma                          | CLAUDE.md §7'nin en ağır maddesi; fonksiyon RLS'i ve kolon kısıtını baypas eder, katalog linter'ının **kör noktasındadır**                                                                                  |
| Süper admini panel orijininin yol öneki altında servis etmek (ADR-0011 (b)) | Geliştirmede iki Vite sunucusu tek host:port paylaşamaz; admin'i süper adminin servis edicisi yapmak iki uygulamayı birbirine bağlar                                                                         |
| Ayrı orijin + CORS + `credentials: include`                                 | Vekil çözümü aynı işi CORS açmadan yapıyor; ADR-0011:63'ün üç yüzeyi birden gevşetme itirazı aynen geçerli                                                                                                 |
| IP allowlist'i birincil yetkilendirme saymak                                | Güvenlik özelliği spoof edilebilir bir değere dayanırdı (`ROADMAP:3109`)                                                                                                                                    |
| Impersonation için ayrı bir `platform.impersonate` mutation'ı               | Sıfır tüketiciyle doğardı (gerçek tüketici listenin `plan` okumasıdır) ve v0.15.0'ın sahipliğindeki kontrolleri (gerekçe/süre/uyarı) bu sürüme çekerdi                                                     |

## Sonuçlar

### Olumlu

- _"Her şey versiyonlanır"_ın kardeşi mekanikleşir: **her platform erişimi yapısal olarak
  iz bırakır** — kayıtsız erişim derlenmez, grep kapısı ikinci savunma hattıdır.
- Kiracı rolü sözlüğü ve oturum şeması **dokunulmadan** kalır; v0.0.14'ün yazılı kararı
  ters çevrilmez, canlı pin yeşil kalır.
- Yeni veritabanı rolü, GUC, view veya `SECURITY DEFINER` fonksiyon **yok** ⇒ katalog
  linter'ının kör noktalarına hiç girilmez ve `BYPASSRLS` kuralı zorlanmaz.
- Migration tamamen additive ⇒ platform rollback'i şema rollback'i gerektirmez.
- `SUPERADMIN_*` env'leri verilmediğinde platformun davranışı **bayt-birebir** bugünküdür
  ⇒ iki kademeli, deploy gerektirmeyen geri alma yolu doğar.

### Olumsuz ve kabul edilen maliyetler

- **Güvenilir orijin artık bir kümedir.** ADR-0011'in reddettiği yüzey **bilinçli**
  açıldı; maliyeti kardinalite assertion'ı ve tek türetme fonksiyonu disipliniyle
  görünür tutuluyor.
- **Denetim satırı kaba tanelidir** (operasyon başına, kiracı başına değil); kiracı
  bazlı denetim sorgusu indekssizdir. v0.15.0'ın işi.
- **Denetim kaydının varlığı `plan` kolonuna bağlıdır.** `plan` listeden çıkarılırsa
  impersonation'ın tek tüketicisi düşer — kapsam maddesi bu yüzden bağlayıcıdır.
- **`platform_audit_log` tamper-evident DEĞİLDİR** ve bu sürüm sorunu büyütmektedir:
  `arkesoft_app` yeni tabloda da dört DML yetkisiyle doğar (katalog linter'ının kuralı).
  Kullanıcı kararıyla **v0.0.20.1**.
- **`platform.tenantList` yapısal olarak 1+N transaction üretir**; sayfa boyutu şema
  seviyesinde 50 ile sınırlandı.
- **`TrpcPorts`'a iki zorunlu üye eklemek** nesneyi elle kuran her yeri derleme hatasına
  düşürür — istenen davranış, ama bu sürümün dosya dokunma yüzeyini genişletir.

### Etkilenen sonraki kararlar

- **v0.0.20.1:** tamper-evidence artık **iki** denetim tablosunu (kiracı + platform)
  kapsamak zorundadır; linter kuralına "tablo başına beklenen yetki kümesi" kavramı
  eklenirken platform tablosu da öznedir.
- **v0.0.22 (API sürümleme):** `@RequirePermission()` borcu (`ROADMAP:3075`) bu sürüme
  kaydırıldı — REST iş yüzeyi (`/api/v1/*`) ilk kez orada açılıyor. Ayrıca sözleşme
  snapshot'ı ADR-0011:94'ün dediği gibi **erişilebilirlik matrisini** de pinlemelidir:
  `platform.*` yolları kiracı host'undan erişilemez olmalıdır.
- **v0.15.0 (impersonation kontrolleri):** gerekçe zorunluluğu, süre sınırı, uyarı bandı,
  yönetici başına IP ve kiracı bazlı denetim sorgusu bu kararın üzerine kurulur;
  `detail.tenantIds` o sürümde normalize edilebilir.
- **ADR-0011:** gözden geçirme koşulu 2 bu ADR ile **kapandı**; madde 2'nin "tek değer"
  dayanağı yerini tek **türetme fonksiyonuna** bıraktı.

## Gözden geçirme koşulları

1. **Dördüncü bir tarayıcı orijini eklenirse** — listenin elle tutulan yapısı yeniden
   değerlendirilir (bugün iki üyeli ve kardinalite pinli).
2. **Platform yetkisi rol/izin ayrımına ihtiyaç duyarsa** (ör. "salt okur platform
   gözlemcisi") — Karar 1'in "yetki = satırın varlığı" sadeliği düşer; o gün bir
   platform izin kataloğu `packages/trpc`'de mi yoksa veritabanında mı yaşayacağı
   ADR-0016'nın gözden geçirme koşulu 2 ile **birlikte** karara bağlanır.
3. **Impersonation'ın tüketicisi birden fazla olursa** — denetim biriminin
   operasyon tanelemesi yeniden ölçülür; kiracı bazlı sorgu ihtiyacı doğarsa
   `detail.tenantIds` normalize edilir (ayrı tablo veya GIN indeks).
4. **IP allowlist birincil yetkilendirme sayılmak istenirse** — `ROADMAP:3109`'un IP
   doğrulama borcu **önce** kapanmak zorundadır; aksi hâlde Karar 5'in yazılı sınırı
   ihlal edilir.
5. **`plan` kolonu kiracı listesinden çıkarılırsa** — Karar 3'ün tek tüketicisi düşer;
   impersonation'ın bu sürümde kalma gerekçesi yeniden değerlendirilir.
