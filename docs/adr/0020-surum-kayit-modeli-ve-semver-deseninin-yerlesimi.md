# ADR-0020 — Sürüm kayıt modelinin doğruluk kaynağı ve semver deseninin yerleşimi

- **Durum:** Kabul (gate turu 1 PASS — `security`/`solid`/`qa`; `wcag`/`perf` ölçülmüş
  gerekçeyle atlandı; kapanış tarihi 2026-11-12)
- **Tarih:** 2026-11-11
- **Karar verenler:** architect (T-018), Orkestratör onayladı (2026-11-12)
- **İlgili versiyon:** `v0.0.21` (bkz. `ROADMAP.md`)

---

## Bağlam

v0.0.21 platform/tema/API sürümlerini veritabanında izlenebilir kılıyor: beş yeni tablo
(`PlatformRelease`, `Theme`, `ThemeRelease`, `TenantVersionState`, `TenantUpdateHistory`)
ve yeni bir saf paket (`packages/versioning`). Üç güç çatışıyor ve üçü de bu sürümden
önce yazıya geçmiş kararlarla temas ediyor.

**Birinci çatışma — aynı olgunun iki yazılabilir kopyası.** `Tenant` tablosu bugün
`theme_id` ve `theme_version` kolonlarını taşıyor (`packages/db/prisma/schema.prisma:97-98`,
v0.0.10/T-012'de eklendi; migration `modern`/`0.1.0` ile backfill etti ve
`src/seed-data.ts:23-31` o fixture'ı "canlı doğruluk kaynağı" ilan ediyor, ADR-0002
Karar 5). `TenantVersionState` de aynı iki alanı taşıyacak. Vitrin **bugün birincisini
okuyor** ve okuma zinciri public API tel sözleşmesinden geçiyor
(`apps/api/src/trpc/ports/storefront-tenant-read.port.adapter.ts` →
`packages/trpc/src/schemas/storefront-tenant.schema.ts` →
`apps/storefront/src/{middleware.ts, lib/api-client.ts, themes/registry.ts}`).
Karar verilmezse sapma **sessiz** olur ve v0.2.0 provisioning'de "kiracı hangi temada?"
sorusunun iki farklı cevabı olur. `ROADMAP.md` bu konuyu hiç konuşmuyor.

**İkinci çatışma — semver çekirdek deseninin sahibi.** Repoda semver çekirdek deseninin
tanım sayısı bugün **bir**: `packages/theme-sdk/src/semver-format.ts:45-46`
(`SEMVER_CORE_PATTERN_SOURCE`). O dosya kendi başındaki yorumda (`:11-32`) deseni ikinci
kez tanımlamanın **ölçülmüş** bir sapma ürettiğini belgeliyor: `migrations/chain.ts` ve
`manifest/manifest.ts` bağımsız iki desen taşıdığı dönemde `"1.0.0-01"` bir tüketicide
kabul, diğerinde red ediliyordu. Aynı dosya (`:4-9`) `theme-sdk`'nın
`packages/versioning`'e bağımlılık **doğurmamasını** bağlayıcı bir kısıt ilan ediyor —
ve bu kısıt, `packages/versioning`'in **henüz var olmadığı** bir dünyada yazıldı. Yeni
paket semver'in doğal sahibi; deseni nerede tutacağımız bir katman kararıdır.

**Üçüncü çatışma — tema kimliğinin anahtarı.** ADR-0003 R2 konvansiyonu her `id`'yi
`String @id @default(cuid(2))` yapıyor. Ama ADR-0002 Karar 3 (`:62-69`) tema kimliğini
`"{id}@{version}"` olarak **zaten dondurdu** ve bu biçimin v0.0.21'de değişmeyeceğini
yazdı; `Tenant.themeId` bugün `'modern'` taşıyor. Vekil anahtar seçmek, mevcut kolonu
çözümlenemez hâle getirir ve sapma testini (v0.0.21 AC-11) iki farklı türde değeri
karşılaştırmaya zorlar. ROADMAP'in alan listesi ise `Theme` için hem `id` hem `slug`
istiyor.

## Karar

### 1 — `TenantVersionState` kiracının sürüm bileşiminin tek yazılabilir doğruluk kaynağıdır

`Tenant.themeId` / `Tenant.themeVersion` bu sürümden itibaren **kullanımdan kaldırılmış
bir ayna kolondur** ve expand/contract'ın contract fazına girer. Takvim:

- **v0.0.21:** `tenant_version_state` doğar. Seed iki yere de yazar, **tek bir kaynak
  sabitten**. `schema.prisma` doc yorumu kolonları DEPRECATED olarak işaretler (DDL yok).
  Bir sapma testi (AC-11) veritabanından okunan iki satırın eşitliğini pinler; biri elle
  değiştirilirse test kırmızı olur ve bu bozarak doğrulanır. Hiçbir okuyucu taşınmaz.
- **v0.1.0:** kiracı `pending` doğar, `TenantVersionState` satırı **yoktur** (1:0..1).
  Tema seçimi yazan bir yol doğarsa iki kolonu aynı transaction'da yazmak zorundadır.
- **v0.2.0:** provisioning `TenantVersionState`'i birincil yazar, `Tenant.theme*`'i aynı
  transaction'da aynalar. Bu noktadan sonra eklenen her okuyucu `TenantVersionState`'ten
  okur.
- **v0.0.22 / v0.3.0:** son okuyucu zinciri taşınır. Bu bir **tel sözleşmesi
  değişikliğidir**: önce additive yeni alan, sonra `Deprecation`/`Sunset`, sonra kaldırma
  (API minor, ardından major). ADR-0002 Karar 6'nın kalıcı nullable'lığı bunu mümkün kılar.
- **Son okuyucudan en az iki sürüm sonra, ayrı PR:** `DROP COLUMN` + eşleşme CHECK'inin
  kaldırılması. `schema.prisma:83-85`'in "en erken v0.3.0" ifadesi **mümkün olan en erken
  andır, taahhüt değildir** — CLAUDE.md §4 ("sonra tüket, iki sürüm sonra sil") ve §10 md 10
  kullanımdan kaldırma penceresinin dolmasını şart koşar.

v0.0.21'de hiçbir yıkıcı adım yoktur; `Tenant` tablosunun DDL'ine dokunulmaz.

### 2 — Semver çekirdek deseni `packages/versioning`'e taşınır; `theme-sdk` oradan ithal eder

`SEMVER_CORE_PATTERN_SOURCE`, `SEMVER_FORMAT_PATTERN` ve `extractMajor`
`packages/versioning`'e taşınır. `packages/theme-sdk` bu üçünü `@arkesoft/versioning`'den
ithal eder; `semver-format.ts` kaldırılır ve içindeki ölçüm/gerekçe yorumu taşınan dosyaya
**birebir** aktarılır. Repoda semver çekirdek deseninin tanım sayısı **bir** kalır.

`semver-format.ts:4-9`'un bağlayıcı kısıtı bu ADR ile **açılır**. Kısıtın amacı
(karşılaştırma mantığının theme-sdk'ya sızmaması) **ihlal edilmiyor, güçleniyor**:
theme-sdk hâlâ karşılaştırma yapmaz, yalnızca biçim ilkelini sahibinden ithal eder.
Kısıtın kendi metni bu yolu gösteriyordu ("yalnızca gerekçeli bir ADR ile açılabilir").

Yapısal sınıfın zararsızlığı **ölçüldü**: `@arkesoft/trpc` (bağımsız semver birimi, 0.6.0)
`dependencies`'inde `@arkesoft/errors`'u (`fixed` grup üyesi, 0.7.0) taşıyor ve `fixed`
grup yedi minor yükselmesine rağmen lockstep'e sürüklenmedi — `.changeset/config.json:22`
`updateInternalDependencies: "patch"` yalnızca aralık menzil dışına çıkınca günceller,
`workspace:*` asla çıkmaz.

`packages/versioning` bağımlılıkları: **yalnızca `zod`** (`packages/errors`'ın şekli).
`@arkesoft/errors`'a bağımlı **değildir** — domain hatası tanımlamaz, hata fırlatmaz,
i18n anahtarı bilmez; dizeden tipe geçişin tek sınırında `undefined` döner
(`extractMajor`'ın kurduğu, kabul görmüş şekil) ve sınır dönüşümü `apps/api`'nin işidir.
Zaman okumaz: `Date.now()` / `new Date()` çağrılmaz, tarihler enjekte edilir.

### 3 — `Theme.id` doğal anahtardır (manifest id'si); `slug` oluşturulmaz

`Theme.id` `String @id`'dir ve değeri temanın manifest id'sidir (`'modern'`). Bu, ADR-0003
R2 konvansiyonundan ve ROADMAP v0.0.21'in alan listesinden **bilinçli bir sapmadır**.
Dört gerekçe: (a) ADR-0002 Karar 3 tema kimliğini zaten dondurdu ve veritabanı onu
yansıtmalı, yeniden anahtarlamamalı; (b) `Tenant.themeId` bugün `'modern'` taşıyor ve
vekil anahtar AC-11'in sapma testini iki farklı türde değeri karşılaştırmaya zorlar;
(c) `slug` `id`'nin bayt-birebir ikinci kopyası olur — bu ADR'nin Karar 1'de kapattığı
sorunun tam kardeşi; (d) tema id'si yazar beyanıdır, kararlıdır ve biçimi zaten
doğrulanmıştır (`theme-sdk`'nın `THEME_ID_PATTERN`'ı).

`TenantVersionState`'ten `ThemeRelease`'e **bileşik yabancı anahtar yazılmaz**:
`Tenant.themeId`'nin bugün FK'si yoktur (asimetri sapma testini ifade edilemez kılar),
ADR-0002 Karar 5 kodda var olup `Theme` satırı henüz yazılmamış bir temayı meşru bir ara
durum sayar, ve FK izolasyon probunun `cleanupTenant` sözleşmesini platform fixture
sızıntısına açar. Referans bütünlüğü yazma yolunda (v0.2.0) zorlanır.

### 4 — Türetilmiş veritabanı nesnesi üretilmez

VIEW/MATERIALIZED VIEW/FOREIGN TABLE, kullanıcı tanımlı TRIGGER, RULE, FONKSİYON ve
`SECURITY DEFINER` **yoktur**; `public` dışına şema açılmaz. Zaman damgaları uygulama
katmanında yazılır (`schema.prisma:13-14`'ün yürürlükteki kuralı). Sonuç: katalog
linter'ının görüş alanını genişletmek v0.0.21'in kapsamına **girmez**.

Üç yeni yabancı anahtarın ürettiği dahili RI trigger'ları kullanıcı tanımlı nesne
değildir ve mekanizma zaten kuruludur (migration kümesinde aynı biçimde yaratılmış en az
yedi FK vardır). İki yeni CHECK kısıtı `pg_constraint` eksenindedir — CLAUDE.md §7'nin
adlandırdığı kör nokta eksenlerinin hiçbiri değil; CHECK erişim veremez ve RLS'i baypas
edemez, yalnızca yazmayı kısıtlar.

### Değerlendirilen alternatifler

| Alternatif | Neden seçilmedi |
| ---------- | --------------- |
| `Tenant.theme*` doğruluk kaynağı kalsın, `TenantVersionState` onu aynalasın | Dörtlü bileşimin (platform+tema+API) tek satırda yaşaması bu sürümün varlık sebebi; `Tenant` tablosu platform ve API sürümünü taşımıyor ve taşımamalı. Ayna yönünü tersine çevirmek sorunu v0.2.0'a taşır. |
| `Tenant.theme*`'i bu sürümde `DROP` etmek | Yıkıcı (CLAUDE.md §10 md 10); canlı okuyucu zinciri public API tel sözleşmesinden geçiyor; platform rollback'i şema rollback'i gerektirirdi. |
| Semver deseni `theme-sdk`'da kalsın, `versioning` oradan ithal etsin | Döngü yaratmaz ve yapısal sınıfı repoda var, ama semantik ters: semver karşılaştırma kütüphanesi tema sözleşmesi SDK'sına bağımlı olur ve `versioning`'in her tüketicisi manifest şemalarını, migration koşucusunu ve JSON Schema üreticisini gereksiz çeker. `versioning`'in kimliğini (semver'in sahibi) baştan sakatlar ve bu ADR'yi yazmaktan kurtarmaz. |
| Her iki paket deseni kendi tanımlasın + çapraz pin testi | `"1.0.0-01"` sapmasını üreten **tam** mekanizma; `semver-format.ts`'in kapattığı sorunu geri açar. Tanım sayısı 1 olmalı. |
| Deseni `packages/config`'e taşımak | `packages/config` on bir pakette `devDependencies` olarak duruyor; çalışma zamanı regex'i oraya koymak bir derleme-yapılandırma paketini üretim ağacına sokar ve paketin doğasını değiştirir. |
| `semver` npm paketini eklemek | Platformun kendi grameri (`manifest.ts:72-84`) kapalı bir kümedir; `semver`'in yüzeyinin büyük kısmı ölü kod olur ve `loose`/`coerce` davranışları `"1.0.0-01"` sapma sınıfını sessizce yeniden açabilir. Katalogda yok, yalnızca `bullmq`'nun transitifi. |
| `Theme.id` cuid2 + `slug` natural key | `slug`, `id`'nin ikinci kopyası olmazdı ama `ThemeRelease.themeId`'nin bir slug taşıyıp "id" adını kullanması okuyucuyu yanıltır; vekil `id` hiçbir yerden referans alınmaz ve ölü ağırlık olur. |
| `TenantVersionState` → `ThemeRelease` bileşik FK | Referans bütünlüğünü yapısal kılardı ama izolasyon probunun her `insertRow` çağrısında platform ön koşulu kurmasını, `cleanupTenant`'ın (kiracı silip cascade'e güvenen) deseninin platform satırı sızdırmasını ve `Tenant.theme*` ile asimetri doğurmasını getirirdi. |
| `lastUpdatedAt` için veritabanı trigger'ı | `pg_trigger` CLAUDE.md §7'nin adlandırdığı kör noktadır — otomatik kapı yakalamaz; ve `schema.prisma:13-14` "trigger yok" kuralını zaten koymuş. |
| Raporlama için VIEW eklemek | `UNEXPECTED_RELATION_KIND` allowlist taşımıyor ve `catalog-lint.ts:1151-1155` doğru hamlenin kuralı gevşetmek değil allowlist eklemek olduğunu, ve böyle bir ihtiyaç doğmadığı için allowlist'in açılmadığını yazıyor. Bu sürümde view'e ihtiyaç yok. |

## Sonuçlar

### Olumlu

- "Kiracı hangi sürüm bileşiminde?" sorusunun tek bir cevabı olur ve cevap tek bir satırda
  dördü birlikte yaşar. ⚠ **Rakip çerçevesi düzeltildi (`docs`, T-018 kapanışı — `pm`'in
  ölçerek çürüttüğü bir önceki çerçeveyi değiştiriyor):** "rakiplerde müşteri hangi
  sürümde olduğunu görmez" cümlesi savunulamaz bulundu (Shopify tema kütüphanesi tema
  sürümlerini tutar ve temada geri alma vardır). Savunulabilir hâli: rakiplerde
  versiyonlanan şey (varsa) **yalnızca temadır**; Arkesoft **dört** birimi (platform,
  tema, API, tema-SDK sözleşmesi) ayrı ayrı versiyonlar ve `TenantVersionState`'in **tek
  satırı** bu dördünün o kiracı için **aynı andaki bileşimini** taşır — artı
  `previousState` ile **geri dönülebilir önceki hâli**. Rakiplerde platform çekirdeği
  tipik olarak sağlayıcının iç meselesidir: zorla uygulanır, kiracı bazında seçilemez,
  geri alınamaz. ⚠ **Dürüstlük notu:** bu bir **beyan**dır, ölçüm değil — rakip
  panellerinde doğrudan ölçüm yapılmadı (ağ aracı/hesap erişimi yok); dayanak
  `CLAUDE.md` §1'in kendi beyanıdır.
- v0.2.0 provisioning'e gelindiğinde geri-doldurma migration'ı **gerekmez**; kayıt defteri
  ilk satırından itibaren gerçek veriyle başlar.
- Semver'in bir sahibi olur ve `"1.0.0-01"` sınıfı sapmanın yapısal olarak tekrarlanması
  imkânsızlaşır; tanım sayısı bir kalır ve bunu `theme-sdk` tarafındaki bir gramer-uyum
  testi ayrıca pinler.
- `packages/versioning` saf, I/O'suz ve zamansızdır: N-2 penceresinin dört kuralı ve
  12 aylık/30 günlük tarih hesapları enjekte edilmiş tarihlerle test edilebilir.
- Bu sürüm yıkıcı adım içermez; platform rollback'i şema rollback'i gerektirmez ve
  `Tenant.theme*`'in okuyucuları hiç etkilenmez.
- Yeni dış kaynak (Meilisearch indeksi, S3 öneki, önbellek anahtarı) yoktur; kiracı
  izolasyonu yüzeyi yalnızca Postgres'te büyür ve mevcut, ölçülmüş mekanizmalarla kapanır.

### Olumsuz ve kabul edilen maliyetler

- `theme-sdk` yeni bir çalışma zamanı bağımlılığı kazanır ve `purity.test.ts`'in pinli
  kapalı bağımlılık listesi genişler. Karşı önlem: `qa` listeyi bozarak doğrular (üçüncü
  bir paket eklendiğinde test kırmızı kalmalı). Vade: v0.0.21.
- **Platform ve `theme-sdk` ayrı ayrı geri alınamaz.** `theme-sdk@0.1.2`
  `@arkesoft/versioning`'i import ettiği için kısmî geri alma derlemeyi kırar. İkisi aynı
  commit'ten yayınlandığı için tek `git revert` yeterlidir; kısıt PR açıklamasına yazılır.
- `tenant_version_state` iki tekillik indeksi taşır: `UNIQUE(tenant_id)` (gerçek 1:1
  değişmezi) ve `UNIQUE(tenant_id, id)` (migration linter'ının iki kolon şartı,
  `migration-set.ts:625-634`). İkincisi birincinin önekidir, yani artıktır. Maliyet satır
  başına bir fazladan indeks yazımıdır; tablo kiracı başına bir satır taşır. Emsal:
  `Job`/`AuditLog` aynı yapay indeksi aynı gerekçeyle taşıyor.
- `TenantVersionState.themeId`/`themeVersion` referans bütünlüğü veritabanı tarafından
  zorlanmaz. Karşı önlem: provisioning yazma yolu `ThemeRelease`'e karşı doğrular.
  Vade: **v0.2.0**.
- `Theme` tablosu ADR-0003 R2 konvansiyonundan sapar; şemayı okuyan biri için "neden bu
  tablo cuid2 taşımıyor?" sorusu doğar. Karşı önlem: modelin doc yorumu bu ADR'ye atıf
  verir.
- `PlatformRelease.channel` iki değer taşır (`stable`, `canary`) ama Sürüm Politikası §4
  üç kanal tanımlıyor (`dev` dahil). `dev`'in bu sürümde tüketicisi yoktur ("ölü sözlük,
  ölü iznin kardeşidir") ve eklemek `ALTER TYPE … ADD VALUE` ile additive'dir. `docs`
  farkı ROADMAP'e not olarak kaydeder. Vade: v0.16.0.
- `arkesoft_app` çalışma zamanı rolü, `ALTER DEFAULT PRIVILEGES` mekanizması üzerinden
  üç yeni platform tablosuna (platformun kendi sürüm kayıt defterine) blanket DML yetkisi
  kazanır. ⚠ **İncelendi (`security` tur 1, T-018) — medium bulgu, kullanıcı kararıyla
  borç olarak ertelendi (gözden geçirme koşulu 6, TETİKLENDİ).** Sömürü yolu bugün yok
  (beş yeni Prisma delege yüzeyde değil, eslint kısıtı, sıfır `*Unsafe`, storefront
  DB'siz) — ilk yazıcı v0.16.0. Daraltma **tek satırlık `REVOKE` değil, üç parçalı**:
  (1) `bootstrap-roles.sql`'in tablo bazlı `REVOKE` deseni, (2) `catalog-lint.ts`'in
  "platform kayıt defteri = salt okunur" yeni kural modeli, (3) `seed.ts`'in üç platform
  upsert'inin bağlantısının taşınması (daraltma bugünkü hâliyle `pnpm db:seed`'i kırar).
  Vade: v0.16.0'ın ilk yazıcısından önce; kapatılmazsa önem `high`'a yükselir.
- `ReleaseChannel`/`UpdateStatus` enum'larının ve `notes`/`changelog`/`previousState`
  kolonlarının tüketicisi bu sürümde yoktur; tüketici v0.16.0'dadır. Bu bilinçli bir
  "veri yeri önce, davranış sonra" sıralamasıdır — ama ölü sözlük riskini taşır ve her
  değerin §6'daki yazılı bir kuralı karşıladığı doğrulanmıştır.

### Etkilenen sonraki kararlar

- **ADR-0002 Karar 3/5/7/8 üzerine inşa eder ve hiçbirini yeniden açmaz.** Anahtar biçimi
  (`"{id}@{version}"`) ve varsayılan tema sabiti mekanizması değişmez. Karar 8'in
  bağlayıcı sonucu uygulanır: `modern@0.1.0` seed'de **`draft`** statüsüyle yazılır,
  `published` değil — yayın koşulunun iki bileşeni (görsel regresyon v0.0.19, Lighthouse
  v0.1.x+) bu sürümde karşılanamaz.
- **ADR-0003 R2** konvansiyonuna `Theme` tablosu için bir istisna açar; istisna bu ADR'ye
  atıfla sınırlıdır ve genel bir gevşeme değildir.
- **v0.0.22** (`/trpc/v1` + `docs/api-versioning.md`) `apiVersion`'ın kaynağını paket
  sürümünden kendi kayıt defterine taşıyabilir; o değişiklik `previousState` anlık
  görüntülerinin geriye uyumluluğunu etkiler ve orada açıkça yazılmak zorundadır.
- **v0.2.0** provisioning `TenantVersionState`'i birincil yazıcı olarak devralır ve
  `themeId`/`themeVersion` doğrulamasını kurar.
- **v0.16.0** güncelleme/geri alma uygulamasını, N-2 uyarı/takvimini ve `canary` yüzdelik
  hedeflemeyi ekler; bu ADR'nin saf fonksiyonlarını ve kolonlarını **tüketir**, yeniden
  tanımlamaz. Arka plan işi o sürümde `Job` tablosu + ADR-0015'in kuyruk topolojisi
  üzerine kurulur.
- **`peerDependencies` modeli** (`ROADMAP.md:1922-1932`) bu ADR'nin Karar 2'si
  `theme-sdk`'nın bağımlılık bloğunu aynı sürümde zaten değiştirdiği ve `modern@0.1.0` bu
  sürümde bir veritabanı anahtarı hâline geldiği için **v0.0.22'ye** yeniden
  tarihlendirilmesi önerilir; `onlyUpdatePeerDependentsWhenOutOfRange`'in bu Changesets
  sürümündeki davranışı ölçülmemiştir.

## Gözden geçirme koşulları

Bu ADR şu durumlarda **zorunlu olarak** yeniden açılır:

1. `Tenant.theme*`'in son okuyucusu taşındığında — contract fazının (DROP) tarihi ve
   yıkıcı migration PR'ı o anda belirlenir.
2. `packages/versioning`'in saflığı bozulmak zorunda kalırsa (I/O, `@arkesoft/errors`,
   zaman okuma veya ikinci bir çalışma zamanı bağımlılığı) — Karar 2'nin katman gerekçesi
   o anda geçersizleşir.
3. Platformun manifest grameri `||`, `x`/`*` veya tire aralıklarına genişlerse — `semver`
   npm paketini reddetme gerekçesi ("fazlası ölü kod") o anda düşer.
4. İkinci bir tema (`corporate`) veya aynı temanın yan yana yaşayan ikinci bir major'ı
   eklendiğinde — `Theme.id`'nin doğal anahtar olması ve ADR-0002 Karar 3'ün
   "`packages/themes/{id}-v{major}`" modeliyle etkileşimi ölçülmelidir. ⚠ **Ek kenar
   (`solid` tur 1, T-018):** `packages/db` → `@arkesoft/themes-modern`, ham-`.ts` export
   eden bir paketin (`exports["."]` → `./src/theme.config.ts`) **ilk düz-Node
   tüketicisidir** (önceki tek tüketici `apps/storefront`, Astro/Vite); bugün katman
   ihlali değil (§3 bu kenarı yasaklamıyor, döngü yok, `seed` §3'te `db`'nin işi, gate
   `.github/actions/prepare-db/action.yml:88` ile kurulu) ama **ikinci tema geldiğinde**
   `packages/db` ya her temaya bağımlı olmak ya da AC-10'un sıfır-literal şartından
   vazgeçmek zorunda kalır — bu madde yeniden açıldığında birlikte değerlendirilmelidir.
5. Sürüm Politikası §6'nın N-2 kuralları değişirse (özellikle farklı major'lar arası
   davranış — bu ADR orada fail-closed bir boşluk doldurdu: küçük major desteksiz, büyük
   major destekli).
6. ⚠⚠ **TETİKLENDİ (`security` tur 1, T-018, MED-1 — gate turu 1'de ölçüldü, kullanıcı
   kararıyla fix turu açılmadan borç olarak ertelendi).** `arkesoft_app` çalışma zamanı
   rolü üç yeni platform tablosuna (`platform_release`/`theme`/`theme_release`)
   `ALTER DEFAULT PRIVILEGES` yoluyla tam DML yetkisi kazandı; canlı ölçüldü. Düzeltme
   üç parçalı (tablo bazlı `REVOKE` + `catalog-lint.ts`'in "salt okunur platform
   tablosu" kural modeli + `seed.ts`'in platform upsert bağlantısının taşınması) —
   yukarıdaki "daraltma yolu belli" cümlesinin eksik bıraktığı üçüncü parça budur.
   Vade: v0.16.0'ın ilk yazıcısından önce; kapatılmazsa önem `high`'a yükselir ve o
   sürümün gate'i FAIL verir (bkz. `ROADMAP.md` → Teknik Borç → "Vadesi v0.16.0 / v0.0.22
   — Sürüm kayıt modeli kaynaklı borçlar").
7. `TenantVersionState` → `ThemeRelease` referans bütünlüğünün yazma yolunda zorlanması
   yetersiz kalırsa (örn. bir veri bütünlüğü arızası ölçülürse) — bileşik FK kararı
   yeniden değerlendirilir.
