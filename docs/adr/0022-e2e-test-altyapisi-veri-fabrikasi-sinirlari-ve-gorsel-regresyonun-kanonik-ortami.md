# ADR-0022 — Uçtan uca test altyapısı: veri fabrikası sınırı, proje matrisi ve görsel regresyonun kanonik ortamı

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-15
- **Karar verenler:** architect (T-020), Orkestratör, kullanıcı (dört bağlayıcı kapsam kararı, 2026-11-15)
- **İlgili versiyon:** `v0.0.19` (bkz. `ROADMAP.md`)

---

## Bağlam

v0.0.19'a kadar uçtan uca (e2e) testler iki bağımsız `playwright.config.ts` dosyasında
yaşadı (`apps/admin`, `apps/storefront`), her biri tek proje/tek viewport/`workers: 1`
ile. CI bu testlerin **hiçbirini** koşmuyordu: `playwright` jetonu `.github/` içinde
yalnızca bir **yasak jeton** olarak geçiyordu (`ci-forbidden-tokens.txt:127`). Görsel
regresyon için sıfır referans görüntü vardı; üç ayrı dosya `toHaveScreenshot`'ı yorum
içinde bu sürüme erteliyordu.

Üç güç çatışıyor:

1. **Oran sınırı bütçesi.** `apps/api`'nin kimlik doğrulama uçları IP bazlı sayaçlar
   tutuyor (`LOGIN_IP_LIMIT = 20`/15 dk, `EMAIL_IP_LIMIT = 10`/saat —
   `rate-limit.policy.ts:130,134`). E2E süiti bu bütçeyi paylaşıyor ve bugün tek doğruluk
   kaynağı bir **yorum bloğu** (`apps/admin/playwright.config.ts:43-58`). Her yeni spec
   dosyası ve her yeni viewport bu bütçeyi çarpıyor. Çarpan 2 olduğu anda sign-up
   6→12 > 10 ⇒ ilk koşum 429 alır.
2. **Test verisi izolasyonu.** "Her test kendi kiracısını yaratır ve yıkar" gereksinimi
   e2e sürecinden veritabanına yazmayı gerektirir — ama e2e süreci (Playwright) ile
   uygulama süreci (`apps/api`) ayrıdır ve `apps/storefront`/`apps/admin` tasarım gereği
   `@arkesoft/db`'ye bağımlı **değildir** (mimari sınır; pnpm sembolik bağı hiç üretilmez).
3. **Görsel regresyonun platform duyarlılığı.** PNG referanslar yazı tipi
   rasterizasyonuna bağlıdır; bir geliştiricinin macOS'ta ürettiği referans Linux CI'da
   eşleşmez. Bu, "tema sürümünün görsel sözleşmesi" iddiasının mekanikleşmesinin
   önündeki tek teknik engeldir.

Ek olarak T-019 bağlayıcı bir kural bıraktı: _"İkinci bir test-only bağlantı profili
ihtiyacı doğarsa (ör. Postgres bağlantı havuzu), bu desen bir ADR'ye yükseltilmek
zorundadır."_ Bu sürüm o ihtiyacın doğup doğmadığını karara bağlamak zorundaydı.

## Karar

**Karar 1 — E2E veri fabrikası sınırı.** E2E testlerinin veritabanı fixture'ları
`apps/<app>/e2e/fixtures/**` altında yaşayacak ve veritabanına **yalnızca** çalışan
Postgres konteynerine `docker exec … psql` ile, bir **alt süreç** üzerinden yazacak.
E2E katmanından Prisma istemcisi, Node Postgres sürücüsü veya `@arkesoft/db` **hiçbir
koşulda** kullanılmayacak. Bu, v0.0.8'de kurulan desenin
(`apps/storefront/e2e/fixtures/custom-domain-tenant.ts`) kalıcı politika hâline
getirilmesidir.

Bu fabrika dört korumayı **zorunlu** taşır:

(a) fail-closed loopback allowlist — hedef veritabanı/konteyner loopback değilse fırlatır
(`apps/api/src/__tests__/helpers/create-test-app.ts:380-408` deseninin birebir ikizi);
(b) `NODE_ENV`/test ortamı kapısı;
(c) her satır `e2e-` önekli kimlik taşır ve temizlik **yalnızca** bu önekle kapsamlanır —
öneksiz toplu silme (`DELETE FROM tenant` gibi) yasaktır;
(d) `apps/*/src/**` içinden `child_process`+`psql` kullanımı `pnpm guards` taramasıyla
yasaklanır — fabrika üretim koduna sızamaz.

> ⚠ **AÇIKLAYICI NOT (`devops`, T-020/S9a, 2026-11-15 — CI koşumu `43713883521`).**
> Karar 1'in ilk **UYGULAMASI** (v0.0.8'den devralınan desen + T-020/S5) *"çalışan
> Postgres konteyneri"*ni **sabit bir isimle** (`arkesoft-postgres`) buluyordu. Bu,
> CI'da **arızalıydı**: GitHub Actions `services:` konteynerinin adı **otomatik
> üretiliyor** ⇒ üç testin `afterAll` temizliği ve `globalTeardown`
> **`"No such container: arkesoft-postgres"`** ile düştü (⭐ **testlerin kendisi
> geçti** — 20 passed; kırılan yalnızca temizlik).
>
> ⭐ **Karar 1'in METNİ bir isim ZORUNLU KILMIYOR** — kusur **kararda değil,
> uygulamadaydı**. Düzeltme, konteyner adını **host'ta yayınlanan porttan dinamik
> çözüyor** (`docker ps --filter publish=<port>`), ardından **aynı** `docker exec …
> psql` yazma yolunu kullanıyor. ⚠ Ölçülmüş ayrıntı: `--filter expose=<port>`
> **yanlış pozitif** verir (başka bir konteyner aynı portu container-içi expose edip
> host'a farklı porta map'leyebilir); **`publish`** filtresi doğru ayırt eder.
>
> ⇒ **Karar 1 DEĞİŞMEDİ**; `docker exec … psql` yolu ve **dört koruma ((a)-(d))**
> aynen geçerli. Değerlendirilip **elenen** iki alternatif: host-seviyesi
> `psql -h/-p` (⚠ `psql` istemcisi geliştirici makinesinde **kurulu değil** ⇒ bugünkü
> *"yalnızca Docker"* gereksinimine göre **gerileme**) · CI'da Postgres'i adlandırılmış
> `docker run` ile kaldırmak (⚠ `api` job'u da `services: postgres` kullanıyor ⇒
> **gereksiz patlama yarıçapı**).

**Karar 2 — İkinci test-only bağlantı profili AÇILMAYACAK.** T-019'un tetikleyicisi
**ateşlenmiyor**: Karar 1'in yolu bir alt süreçtir; bağlantı havuzu, `commandTimeout`
veya `connectTimeout` gibi ayarlanacak **hiçbir profil yüzeyi yoktur**. Dolayısıyla
`packages/db`'ye, `apps/api`'nin Prisma kurulumuna veya `create-redis-connection.ts`'in
`R-A4` pinine **dokunulmaz**.

**Karar 3 — Proje matrisi ve bütçe değişmezi.** Playwright projeleri **dizin tabanlı**
ayrılır, `--grep` ile **ayrılmaz**:

| Dizin                                   | Kim koşar                          | Auth tüketir mi |
| --------------------------------------- | ---------------------------------- | --------------- |
| `e2e/*.spec.ts`                         | yalnızca masaüstü projesi          | ✅ evet          |
| `e2e/responsive/*.spec.ts`              | masaüstü + mobil                   | ❌ **YASAK**     |
| `e2e/visual/*.visual.spec.ts`           | görsel projeler                    | ❌ **YASAK**     |

Bütçe, bir yorum bloğunda değil, tipli bir **beyan tablosunda** (`e2e/auth-budget.ts`)
yaşar; bir birim testi (i) her spec dosyasının tabloda yer aldığını **fail-closed**
doğrular, (ii) `responsive/` ve `visual/` dizinlerinde kimlik doğrulama uç noktası
jetonunun **sıfır** olduğunu doğrular, (iii) toplamın IP sınırlarının altında kaldığını
doğrular. "Beyan edilen sayının gerçeği yansıttığı" **insan sorumluluğunda kalır** —
mekanikleşen şey, bir dosyanın beyandan **kaçamaması** ve çarpanın **1'den
büyüyememesi**.

**Karar 4 — Görsel regresyonun kanonik ortamı.** Referans görüntüler **tek bir
rasterizasyon ortamında** üretilir ve doğrulanır: resmî Playwright Docker imajı, etiketi
`pnpm-workspace.yaml`'daki `@playwright/test` catalog sürümüne **pinli**. `test:visual` ve
`test:visual:update` yerelde de CI'da da bu imajın içinde koşar. Anlık görüntü yolu
şablonu platform soneki **taşımaz** (tek kanonik set). Referanslar **repoya commit edilir**
(harici anlık görüntü servisi ADR-0001 yığınında yoktur).

**Karar 5 — Görsel testler üretim derlemesine karşı koşar.** Görsel projenin `webServer`'ı
`astro build` + `node dist/server/entry.mjs`'tir, `astro dev` **değildir**. Ölçülmüş
gerekçe: `astro dev`'in geliştirme araç çubuğu `<body>`'ye ek DOM enjekte ediyor
(`apps/storefront/e2e/storefront-theme.spec.ts:149-155`) — bu araç çubuğu üretim
derlemesinde yoktur. Yan kazanç: `am-i-vibing` kaynaklı arka plan süreci sınıfı
(ADR-0014 bağlamı, T-011 "halka 3") görsel yolda hiç doğmaz.

**Karar 6 — Paylaşılan Playwright tabanının yeri.** Ortak `defineConfig` yardımcısı
`scripts/playwright/base.ts`'te yaşar. `packages/config` **elendi**: Playwright'ın
TypeScript dönüştürücüsü `node_modules`'ü hariç tutar, bu yüzden bir workspace paketinden
ham `.ts` ihraç edilemez; `dist`'e derlemek ise bayat-derleme (stale dist) tuzağını geri
getirirdi. `scripts/` zaten workspace dışı, kök seviyeli bir TypeScript alanıdır ve
`pnpm guards` tarafından tip ve lint denetimi görür.

> ⚠⚠ **DÜZELTME (`po`, 2026-11-15 — Orkestratör ölçerek doğruladı).** Yukarıdaki son
> cümle **bugünkü hâliyle `scripts/playwright/base.ts` için DOĞRU DEĞİLDİ**:
> `scripts/tsconfig.json:28` → **`"include": ["*.ts"]`**, yani **yalnızca üst seviye**.
> Alt dizindeki bir dosyayı `check_scripts_typecheck` (`tsc -p scripts/tsconfig.json`)
> **hiç görmez**; `check_scripts_eslint` ise *"dosya projede yok"* hatasıyla **kırılır**.
> ⇒ Bu kararın güvence ayağı, `include`'un `["*.ts", "playwright/*.ts"]` olarak
> **genişletilmesine BAĞIMLIDIR** ve bu genişletme kararın **ayrılmaz parçasıdır**
> (T-020 alt görev `S4`; negatif kanıt: `base.ts`'e kasıtlı tip hatası → `pnpm guards`
> **kırmızı**, geri alınınca yeşil).
> ⭐ Genişletme yapılmazsa bu karar **sessiz bir güvenlik hissi** verir — tam olarak bu
> sürümün kapatmayı hedeflediği kusur sınıfı.

### Değerlendirilen alternatifler

| Alternatif                                                                | Neden seçilmedi                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E2E fixture'larının Prisma/`@arkesoft/db` ile yazması                     | `apps/storefront`/`apps/admin` tasarım gereği `@arkesoft/db`'ye bağımlı değil; bağımlılık eklemek mimari sınırı deler ve T-019'un ADR tetikleyicisini (ikinci bağlantı profili) gerçekten ateşlerdi                  |
| Test-only bir HTTP tohumlama (seeding) ucu                                | Üretim yüzeyinde kimlik doğrulama/oran sınırı muafiyeti açar (güvenlik riski); `@arkesoft/trpc` Public API birimine ekleme yapar ⇒ minor bump; ve kimlik doğrulama bütçesini artırarak bütçe değişmezini kırar       |
| Oran sınırından muaf bir test-only yol                                    | Aynı güvenlik gerekçesi; ayrıca `ROADMAP:3135`'in üretim düzeltmesi (scope'a origin/port bileşeni) kendi sürümünü hak ediyor                                                                                          |
| Görsel referansların platform sonekiyle (hem `-darwin` hem `-linux`)      | İki referans seti = iki doğruluk kaynağı; biri bayatlar ve sessizce sapar; depo boyutu iki katına çıkar                                                                                                                |
| Görsel testlerin yalnızca CI'da koşması                                   | "Yerelde koşmayan komut" tam olarak bu sürümün düzelttiği kusur sınıfı (CLAUDE.md §6'nın özlem belgesi hâli). Geri çekilme yolu olarak **saklandı**, birincil karar değil                                             |
| CI koşucusunun yerel (native) rasterizasyonunun kanonik sayılması         | GitHub koşucu imajı bizim pinimiz değil; sürüm yükseltmesi referansları sessizce kırar. Depo Postgres/Redis/Mailpit imajlarının hepsini pinliyor — aynı disiplin                                                      |
| Ayrımın `--grep` ile yapılması                                            | Test başlığına bağlı; bir başlık düzenlemesi kapsamı sessizce kaydırır                                                                                                                                                 |
| Bütçenin statik regex taramasıyla denetlenmesi                            | ÖLÇÜLDÜ ve reddedildi (`apps/admin/playwright.config.ts:74-88`): gerçek ağ çağrısı ile `page.route()` taklidi birebir aynı metinsel örüntüyü taşıyor                                                                  |
| E2E'nin mevcut `run-gates` composite'ine eklenmesi                        | Kimlik doğrulama sayaçları paylaşılan, değişken bir kaynak; test harness'ı onları siliyor ve Playwright harness kilidini almıyor — aynı job içinde herhangi bir paralelleştirme sessiz bir sahte yeşil üretir         |
| `superadmin` Playwright projesinin önceden kurulması                      | `apps/superadmin`'de `dev` script'i yok; `webServer` başlatılacak komut bulamaz ⇒ ölü yapılandırma. v0.0.20 projeyi zaten sahipleniyor (kullanıcı kararı)                                                             |

## Sonuçlar

### Olumlu

- E2E veri fabrikası ile üretim veri yolu arasında **yapısal** bir sınır doğar; fabrika
  üretim koduna sızamaz ve üretim kodu fabrikayı göremez.
- Kimlik doğrulama bütçesinden bir spec dosyasının **sessizce kaçması** imkânsız hâle
  gelir — bu, dört sürümdür taşınan kırılganlık sınıfının mekanik kapanışıdır.
- "Yerelde kırmızı = CI'da kırmızı" görsel testler için **tanım gereği** doğrudur; tema
  görünümünün sessizce değişmesi, tema semver'inden bağımsız olarak mekanik biçimde
  yakalanır.
- İkinci bir test-only bağlantı profili açılmadığı için `R-A4` pini ve üretim
  Redis/Prisma kurulumu **dokunulmadan** kalır.

### Olumsuz ve kabul edilen maliyetler

- **Docker, görsel testler için zorunlu ön koşul olur.** Kabul edilebilir: `pnpm infra:up`
  zaten Docker gerektiriyor ve mevcut e2e fixture'ı zaten `docker exec` kullanıyor.
- **Pinli imajın indirilmesi bir kerelik maliyet getirir** (yerelde ve CI'da). Ölçülmedi;
  `devops` ölçecek. Beş dakikayı aşarsa Orkestratör'e eskalasyon ve geri çekilme yolu
  (görsel testlerin yalnızca Linux'ta koşması) devreye alınır.
- **Beyan tablosunun doğruluğu insan sorumluluğunda kalır.** Mekanikleşen kapsama ve
  çarpandır, sayının kendisi değil. Bu sınır bilinçli ve yazılıdır.
- **`scripts/` alanı test altyapısıyla büyür.** Kavramsal olarak "derleme/işletim
  script'leri" olan bir dizin artık paylaşılan bir Playwright tabanı da barındırıyor.
  Alternatiflerin tamamı ölçülmüş bir engele çarptığı için kabul edildi.
- **Görsel projenin üretim derlemesi gerektirmesi** e2e koşumuna bir `astro build` adımı
  ekler (süre maliyeti). Karşılığı: araç çubuğu kaynaklı DOM gürültüsünün ve artık süreç
  sınıfının tamamen ortadan kalkması.

### Etkilenen sonraki kararlar

- **v0.0.20** `superadmin` Playwright projesini `scripts/playwright/base.ts` tabanını
  kullanarak **tek dosya** ekleyerek kurar; `@axe-core/playwright` de o sürümde
  değerlendirilir (bu sürümde kullanıcı kararıyla kapsam dışı).
- **`ROADMAP:3135`** (oran sınırı scope'una origin/port bileşeni) bu ADR tarafından
  **kapatılmaz**; üretim `rate-limit` koduna dokunduğu için kendi sürümünü bekler. Bu ADR
  yalnızca onun **e2e tarafındaki semptomunu** çarpan=1 değişmeziyle sınırlar.
- **ADR-0002** (tema dağıtım ve çalışma zamanı modeli) ile birlikte okunur: tema sürümünün
  görsel sözleşmesi artık mekanik bir kanıta sahiptir.

## Gözden geçirme koşulları

- E2E'den **gerçekten** bir bağlantı havuzu gerekirse (ör. fixture'ların `docker exec`
  ile karşılanamayacak bir işlem/transaction semantiği istemesi) — Karar 2 yeniden açılır.
- `apps/superadmin` veya üçüncü bir uygulama e2e kazanır ve dizin sözleşmesi yetersiz
  kalırsa — Karar 3 yeniden açılır.
- Pinli Docker imajının indirme maliyeti kabul edilemez ölçülürse veya macOS'ta ağ
  köprüsü (`host-gateway`) kurulamazsa — Karar 4'ün geri çekilme yolu (yalnızca Linux)
  kalıcılaşır ve bu ADR güncellenir.
- Görsel referansların sayısı tek haneden çıkıp depo boyutunu anlamlı etkilerse — harici
  anlık görüntü servisi (bugün ADR-0001 yığınında yok) yeni bir ADR konusudur.
