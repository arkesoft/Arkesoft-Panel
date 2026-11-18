# Test Altyapısı

Bu belge uçtan uca (e2e) ve görsel regresyon testlerinin **nasıl çalıştığını, nereye
dayandığını ve hangi tuzaklara düştüğünü** anlatır. Komut listesi için
[`CLAUDE.md`](../CLAUDE.md) §6, yerel kurulum için [`development.md`](./development.md),
mimari kararlar için [`ADR-0022`](./adr/0022-e2e-test-altyapisi-veri-fabrikasi-sinirlari-ve-gorsel-regresyonun-kanonik-ortami.md).

> **Kazanım (v0.0.19, T-020):** `CLAUDE.md` §6'nın uzun süredir belgelediği üç komut
> (`pnpm test:e2e`, `pnpm test:visual`, `pnpm test:visual:update`) bu sürümde **ilk kez
> gerçekten var** — belge ile gerçek bu sürümde ilk kez hizalandı (önceki sürümlerde
> `CLAUDE.md` bir özlem belgesiydi, bkz. ROADMAP T-012/T-019 ölçümleri).

> **Kazanım (v0.0.20, T-021):** `apps/superadmin` **üçüncü** Playwright projesi olarak
> kök `pnpm test:e2e`'ye katıldı (dev portu **5174**, override
> `ARKESOFT_SUPERADMIN_E2E_PORT`) — kök toplayıcı artık **admin + superadmin +
> storefront**'u tek komutla yeşil koşturuyor (`qa` tur 2: 44/44 test, 36.4s).
> `pnpm guards` **18 → 19** mekanik adıma çıktı (`scripts/e2e-env-passthrough-check.ts`'in
> `turbo.json`'daki `passThroughEnv` listesini her e2e görevi için elle değil **ölçerek**
> doğrulayan 19. adımı, T-021/S9-S10).

---

## 1. Flaky test politikası

[`CLAUDE.md`](../CLAUDE.md) §6: _"Flaky test düzeltilir veya kaldırılır; `test.skip` ile
kalıcı susturma yasak (ROADMAP'te takip kaydı olmadan)."_

Bu kural yazılı bir dilek değil — **T-019'da gerçek bir maliyetle ölçüldü.** Aynı test
sınıfı (e2e kimlik doğrulama akışları) **beş düzeltme turu** ve bir **kullanıcı kararı**
(`CLAUDE.md` §4.5 tetikleyici 4 — "3 düzeltme turundan sonra hâlâ FAIL var") gerektirdi;
oran yaklaşık **%11** ölçüldü ve test **dört kez** "kapandı" sanıldı, dördünde de bir
sonraki ölçüm bunu çürüttü (bkz. `AGENT_BASELINE.md` §4 "Ölçüm disiplini" dersi 1).

**Sonuç — ardışık yeşil koşum flake'in yokluğunu kanıtlamaz.** Gereken koşum sayısı
gözlenen orana göre hesaplanır; mekanik izolasyon + nedensel açıklama + yeterli koşum
üçü birlikte gerekir. Ayrıntı ve aritmetik: `AGENT_BASELINE.md` §4.

---

## 2. Oran sınırı bütçesi

Kimlik doğrulama uçları (`sign-in`, `sign-up`) IP bazlı sayaç taşır
(`apps/api/src/auth/rate-limit/rate-limit.policy.ts`). E2E süiti bu bütçeyi üretim
trafiğiyle **paylaşır** — bütçeyi aşan bir koşum 429 alır ve bu "flaky" gibi görünür.

⚠ **Sayılar burada tekrar edilmez.** Tek doğruluk kaynağı
[`apps/admin/e2e/auth-budget.ts`](../apps/admin/e2e/auth-budget.ts) (`po`'nun T-020
sahiplik kararı — `apps/admin/playwright.config.ts`'in eski yorum bloğu bu sürümde "tek
doğruluk kaynağı" olmaktan çıktı, config artık yalnızca bu dosyaya işaret eden kısa bir
not taşır).

**Mekanizma** (sayı değil, nasıl çalıştığı):

- `AUTH_IP_LIMITS` **bağımsız bir pin**'dir — `apps/api`'nin `rate-limit.policy.ts`'inden
  **ithal edilmez** (`apps/admin`'in `apps/api`'ye kaynak bağımlılığı yok, yalnızca
  HTTP/tRPC ile konuşur).
- `e2e/__tests__/auth-budget.test.ts` dört fail-closed değişmezi mekanik doğrular (ADR-0022
  Karar 3 + `guards.sh`'in dördüncüsü):
  1. **Kapsama** — `e2e/` kökündeki her `*.spec.ts` beyan tablosunda var mı (fail-closed;
     yeni bir spec bugün bütçeden sessizce kaçamaz).
  2. **Çarpan sıfırı** — `responsive/**` ve `visual/**` içinde auth uç jetonu sıfır.
  3. **Toplam sınır altı** — beyan edilen toplam `AUTH_IP_LIMITS`'i aşmıyor.
  4. **Pin tazeliği** — `scripts/guards.sh`'in `check_auth_budget_pin_freshness` adımı
     `AUTH_IP_LIMITS`'in değerlerini **dinamik okuyup** `rate-limit.policy.ts`'teki gerçek
     sabitlerle (ad + değer) karşılaştırır; biri kayarsa guards kırmızı olur.
- Bonus savunma: `apps/admin/playwright.config.ts` config yüklenir yüklenmez aynı toplamı
  **ikinci, bağımsız** bir fail-closed kontrolle de doğrular — Vitest'i çalıştırmayı
  beklemeden.
- ⚠ **Dürüst sınır:** "beyan edilen sayı gerçeği yansıtıyor mu" insan sorumluluğunda
  kalır — mekanikleşen şey bir dosyanın beyandan kaçamaması ve çarpanın 1'den
  büyüyememesidir, beyanın kendisinin doğruluğu değil.
- ⚠ `EMAIL_IP_LIMIT` **saatlik bir pencere** taşır — yerelde pratik sonucu, tam bir e2e
  koşumunun bütçeyi tek seferde büyük ölçüde tükettiği ve **saatte yaklaşık bir tam
  koşum** yapılabildiğidir. CI'da her job taze bir Redis ile başladığı için bu kısıt
  CI'da geçerli değildir (bkz. §5).

---

## 3. Görsel regresyon

ADR-0022 Karar 4 + Karar 5:

- **Kanonik rasterizasyon ortamı** pinli bir Playwright Docker imajıdır
  (`mcr.microsoft.com/playwright:v<catalog-sürümü>-noble`, etiket
  `pnpm-workspace.yaml`'daki `@playwright/test` catalog sürümüne pinli). `test:visual` ve
  `test:visual:update` **yerelde de CI'da da** bu imajın içinde koşar — "yerelde kırmızı =
  CI'da kırmızı" tanım gereği doğrudur.
- `snapshotPathTemplate` **platform soneki taşımaz** (`{-snapshotSuffix}` kaldırıldı,
  `{-projectName}` korundu) — tek kanonik referans seti.
- Referans görüntüler **repoya commit edilir** (harici anlık görüntü servisi bu yığında
  yok).
- Görsel testler **üretim derlemesine** karşı koşar (`astro build` + `node
dist/server/entry.mjs`, port 4322) — **`astro dev`'e değil.** Ölçülmüş gerekçe:
  `astro dev`'in geliştirme araç çubuğu `<body>`'ye `main`'in dışında ek bir `h1`
  enjekte ediyor; üretim derlemesinde bu DOM yok.

### ⭐⭐ En değerli uyarı — kabul kriterinin kendisi bir kez sahte yeşil verdi

`AC-8`'in mutasyon testi (`theme.config.ts`'teki marka rengini değiştirip görsel testin
kırmızı olmasını doğrulamak) **bir kez sahte yeşil verdi**: `fullPage: true` ile alınan
tam sayfa ekran görüntüsünde renk mutasyonunun ürettiği piksel farkı, pixelmatch'in
antialiasing sezgisiyle birleşince resmin yalnızca **~%0.04**'üne denk geldi —
`maxDiffPixelRatio: 0.002` eşiğinin **altında** kaldı. Kriter "geçti" görünüp hiçbir şey
tespit etmeyecekti.

**Eşik gevşetilmedi.** Çözüm, ölçüm yüzeyini temanın **gerçek render kapsayıcısına**
(`[data-arkesoft-theme="modern"]`) daraltmaktı — aynı piksel farkı küçük paydada eşiği
güvenilir biçimde aşıyor. İlke: **dedektörü zayıflatmak yerine ölçümü düzelt.** (`AC-8` +
`AC-9` — ters mutasyon, yalnızca yorum değişikliği — birlikte eşiği iki yandan
sıkıştırarak doğrular.)

⚠ Bilinen kırılganlık: `[data-arkesoft-theme="modern"]` seçicisi `PageSection.astro`'nun
iç detayıdır; yeniden adlandırılırsa görsel test **gürültülü** kırılır (sessiz değil —
kabul edilebilir).

---

## 4. İzole tenant fabrikası

ADR-0022 Karar 1: e2e veri fabrikaları `apps/<app>/e2e/fixtures/**` altında yaşar ve
veritabanına **yalnızca** `docker exec … psql` ile, bir alt süreç üzerinden yazar —
Prisma/`@arkesoft/db` **hiçbir koşulda** kullanılmaz (bu, `apps/storefront`/`apps/admin`
tasarım gereği `@arkesoft/db`'ye bağımlı olmamasının yapısal sonucudur).

**Dört zorunlu koruma:**

1. Fail-closed loopback allowlist — hedef Docker daemon'u loopback değilse fırlatır.
2. `NODE_ENV`/test ortamı kapısı.
3. Her satır `e2e-`/zaman damgalı biçim-regex'li bir kimlik taşır; temizlik **yalnızca**
   bu biçimle kapsamlanır — çıplak `DELETE FROM tenant` gibi toplu silme yasaktır.
4. `apps/*/src/**` içinde `child_process`+`psql` kullanımı `pnpm guards`'ın
   `check_adr22_k1d_shellout_boundary` taramasıyla yasaklanır — fabrika üretim koduna
   sızamaz.

**Fabrika çekirdeği ARTIK tek bir paylaşılan modüldür** (`po`'nun T-020 kararının
**gözden geçirilmiş hâli**, `architect`/T-021, ADR-0022 GÜNCELLEME bloğu —
⚠ aşağıdaki paragraf önce "iki kopya, ortak modül değil" diyordu, bu **bayattı**):
`scripts/playwright/sql.ts` (`runSql`/`querySqlRows` gövdeleri + dört koruma).
`apps/storefront/e2e/fixtures/custom-domain-tenant.ts`,
`apps/admin/e2e/fixtures/tenant-cleanup.ts` **ve** `apps/superadmin/e2e/fixtures/platform-admin.ts`
onu **göreli yolla** import eder; her fabrika yalnızca kendi `e2e-` önek desenini ve
kendi temizlik mantığını taşır. Gözden geçirme koşulu (_"üçüncü uygulama e2e kazanırsa
karar yeniden açılır"_) T-021'de **tetiklendi**: `apps/superadmin` üçüncü uygulama oldu
ve dizin sözleşmesi (`responsive/`/`visual/` eksikliği) **yeterli kaldığı** için Karar 3
(proje bazlı ayrım) değişmedi, ama Karar 1'in **uygulaması** tek modülde birleştirildi.
`packages/*`'e çıkarılması **hâlâ yasaktır** (bir `e2e/*.spec.ts`'in `packages/`'ten
import etmesi uygulama test kodunu paket dışı bir yola bağlar) — `scripts/playwright/`
Karar 6'nın zaten kurduğu, paket **olmayan** bir alandır.

`guards.sh`'in K1(d) taraması artık _"`docker exec`+`psql` kullanan dosya kümesi = tam
olarak **bu bir** modül"_ der (eskiden "tam olarak bu iki dosya" diyordu) — kapı
**güçlendi**: metinsel eşitlik denetimine gerek kalmadı, çünkü artık tek gövde var.
Mailpit doğrulama yardımcısı da aynı eve taşındı: `scripts/playwright/mailpit.ts`
(`findVerificationToken`), dört çağıran (`apps/admin`'in üç dosyası + `apps/superadmin`)
onu import eder — önceki dört bağımsız kopya **tek tanıma** indirildi.

⚠ **Dürüst sınır (hâlâ geçerli, eksen değişti):** paylaşılan `sql.ts` gövdesinin kendi
içindeki davranışı tek yerde değiştiğinde üç fabrikanın **hepsi** etkilenir — bu artık
bir "sapma" riski değil, bir "tek noktadan kırılma" riski; `scripts/tsconfig.json`'ın
`playwright/*.ts` kapsamı (tip kontrolü) ve e2e koşumlarının kendisi (davranışsal
kırmızı) bunun tek savunması, mekanik bir "üç fabrika aynı sürümü mü kullanıyor" kapısı
yok. `scripts/playwright/totp.ts` (RFC 6238, test-only TOTP üreticisi, `apps/superadmin/e2e`
için — `apps/api`'den import edilemediği için yazıldı) **bağımsız bir implementasyon**
taşır; üretim portundan (`totp-code-generator.port.ts`) sapması da mekanik yakalanmaz,
sapma e2e'nin kırmızı olmasıyla fark edilir.

### ⭐ `S9a`'nın dersi — konteyner adını sabit yazma

Fabrikanın ilk uygulaması Postgres konteynerini **sabit bir adla** (`arkesoft-postgres`)
arıyordu. Bu yerelde doğruydu (`infra/docker-compose.yml`'in `container_name:`'i) ama
CI'da **arızalıydı**: GitHub Actions `services:` konteynerinin adı otomatik üretilir.
Düzeltme konteyner adını host'ta **yayınlanan porttan** dinamik çözer
(`docker ps --filter publish=<port>`), aynı `docker exec … psql` yazma yolunu
değiştirmeden kullanır.

⚠⚠ **Ölçülmüş ayrıntı:** `--filter expose=<port>` **yanlış pozitif** verir — başka bir
konteyner aynı portu konteyner-içi expose edip host'a farklı bir porta map'leyebilir.
**`publish`** filtresi doğru ayırt eder.

---

## 5. Operasyonel tuzaklar

Bu bölüm en çok işe yarayacak olandır — hepsi ölçülmüş, hiçbiri teorik değil.

### Bayat `dist`

T-019'da **beş kez**, T-020'de **bir kez** önlendi. ⚠ _"`dist/main.js`'in mtime'ına
bakarak karar verme"_ — `tsc` artımlı yazar, bu yüzden mtime "yeni" görünse de içerik
eski olabilir. Doğru soru: **süreç ne zaman başladı** (build, sonra süreç başlatma —
sırayı doğrula, dosya zaman damgasına güvenme).

### ⚠⚠ `reuseExistingServer`'ın sessiz tuzağı

`apps/admin/playwright.config.ts`'in eski ayarı `reuseExistingServer: !process.env['CI']`
idi. Yerelde 5173'te **zaten koşan** bir vite varsa Playwright onu **sessizce yeniden
kullanır**; o süreç `ARKESOFT_PANEL_DEV_API_TARGET`'ı taşımıyorsa proxy varsayılana
(`http://127.0.0.1:3000`) düşer ve **her tRPC çağrısı port 3000'e** gider. Bu makinede
3000'de geliştiricinin **başka bir projesi** (`demo-site`, Next.js) çalışıyordu — admin
testleri sessizce o projeye konuşuyordu.

**Çözüm:** admin artık storefront'un emsalini izleyip **`reuseExistingServer: false`**
kullanır — her koşum kendi vite'ını başlatır (biraz daha yavaş, ama deterministik).

### ⚠⚠ Turbo env filtrelemesi

`turbo.json`'da bir görevin `passThroughEnv`/`env` listesinde **bildirilmeyen** bir
ortam değişkeni, görev çağrılmadan **önce turbo tarafından silinir** — script kendi
varsayılanına düşer. Bu `turbo.json:5-11`'de **zaten yazılı** bir gerekçeydi (ADR-0014
Karar 1, "`globalEnv` her görevin hash'ine girer, dar tutulmalı") ama yeni e2e/visual
görevlerine **uygulanmamıştı**.

⭐ **`test:e2e`'nin CI'da geçmesi tesadüftü**, tasarım değil: CI'da API varsayılan
3000 portunda başlıyor ve `ARKESOFT_PANEL_DEV_API_TARGET` bildirilmediği için script de
3000'e düşüyordu — ikisi **rastlantıyla** eşleşiyordu. Yerelde API 3100'de koşar; aynı
eksik bildirim kökten çağrılan `pnpm test:e2e`'yi sessizce `demo-site`'a (3000)
yönlendirirdi. `test:visual` için aynı sınıf bir eksik bildirim CI'da gerçek bir 503
üretti (storefront yanlış porta bağlandı) — düzeltme her iki görev için de
`passThroughEnv`'e eksik değişkenleri eklemekti (`turbo.json`'daki ilgili görev
yorumlarına bkz.).

### Port haritası

| Servis                   | Port                                          | Not                                                                                                                                       |
| ------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| API (yerel)              | **3100**                                      | Kabuk değişkeni ile verilir — **`.env`'e yazılmaz**.                                                                                      |
| Panel (admin)            | **5173**, sabit                               | `AUTH_BASE_URL` origin tutarlılığı için değişmez.                                                                                         |
| Süper admin (superadmin) | **5174**, sabit                               | `SUPERADMIN_BASE_URL` origin tutarlılığı için değişmez (T-021). E2E override: `ARKESOFT_SUPERADMIN_E2E_PORT`.                             |
| Görsel (storefront)      | **4322**                                      | `ARKESOFT_STOREFRONT_VISUAL_PORT` ile override edilebilir.                                                                                |
| ⚠ **3000**               | geliştiricinin **başka** bir projesi olabilir | Bu makinede `demo-site` (Next.js) — admin/kök e2e script'leri varsayılan olarak yanlışlıkla buraya düşebilir (yukarıdaki iki tuzağa bkz). |

⚠ Kök `.env`'deki `STOREFRONT_API_BASE_URL` **3000** der; gerçek yerel API **3100**'de
koşar. Uyuşmazsa Astro SSR `503` döner ve Playwright'ın `webServer` probu `timeout`
ile düşer (T-020/S3'te ölçüldü).

---

## 6. Ölçüm metodolojisi

`AGENT_BASELINE.md` §4 "Ölçüm disiplini" dört ders taşır (ardışık yeşil kanıt değildir ·
sakin makinede ölçüm yük kaynaklı flake için kanıt değildir · turbo önbelleği yeşili
sahte yapabilir · `Grep`/`Glob` çağrılarında `path` açıkça verilir) — burada
**tekrarlanmaz**, bu bölüm T-020'nin eklediği somut vakalardır.

### ⚠⚠ Yük üreteci "makine meşgul" simüle etmeli, "kaynak yok" değil

İlk sentetik yük tasarımı bir `redis-cli EVAL` busy-loop'uydu (tek iş parçacıklı Redis'i
sonsuz döngüyle bloke etmek). Bu, Redis PING süresini **15.339 ms**'ye çıkardı —
`HEALTH_COMMAND_TIMEOUT_MS` (**1500 ms**) eşiğinin **10 katı**. Sonuç: oran sınırı guard'ı
**doğru şekilde** fail-closed oldu ve sign-up isteği **doğru şekilde** reddedildi.
**Ürün kusursuzdu; ölçüm aracı yanlıştı** — bu araç "Redis kaynağının tamamen yok
olduğu" bir durumu simüle ediyordu, "makinenin meşgul ama çalışır olduğu" bir durumu
değil.

Düzeltme CPU + düşük öncelikli I/O + düz `SET`/`GET` trafiğine geçti, ama bu da **tam CPU
doygunluğuyla** (çekirdek sayısı kadar işçi, 4 çekirdekli CI runner'ında) ikinci bir
yanlış sonuç üretti: süit **22 saniyeden 6 dakikaya** çıktı (~16×) ve zamanlamaya duyarlı
assert'ler düştü. Nihai düzeltme: CPU işçi sayısı `nproc` → **`nproc/2`** (en az 1),
Redis işçisi **20 → 5** — yük altında yeşil.

⭐⭐ **En önemli cümle:** _T-019'da aynı `EVAL` busy-loop **doğru** araçtı — oradaki amaç
Redis `commandTimeout`'unu **teşhis etmekti**. Burada amaç farklıydı (gerçekçi rekabet
simüle etmek) — **aynı araç, farklı amaçta yanlış.**_

### ⭐ Teşhis alanı ekle, tahmin etme

Görsel sunucu sağlık probuna eklenen _"son gözlenen HTTP kodu"_ alanı kök nedeni **tek
koşumda** verdi: `000` bağlantı seviyesinde bir arızaya işaret eder, `503` ise sunucunun
ayakta olup uygulama seviyesinde hata döndürdüğünü gösterir. Bu tek alan, aksi hâlde
birkaç tur tahmin gerektirecek bir teşhisi tek koşuma indirdi.

### CI'da ölç

CI'ya e2e eklemek **dört gizli varsayımı** ortaya çıkardı; dördü de yerelde
**görünmezdi**, biri **v0.0.8'den beri** sessizce duruyordu:

1. Fixture'ların sabit konteyner adı varsayımı (§4'teki `S9a` dersi).
2. Sağlık probunun `curl` çağrısında zaman aşımı sınırı olmaması (yavaş bir deneme
   döngünün bütçesini tüketiyordu).
3. Turbo'nun bildirilmeyen env değişkenini göreve geçmeden silmesi (§5'teki ders).
4. Sentetik yük tasarımının "kaynak yok" ile "makine meşgul"ü karıştırması (yukarıda).

ROADMAP'in _"CI'da güvenilir koşsun"_ hedefinin iş değeri tam olarak budur — bu dört
varsayım CI hiç koşmadığı için birikmişti ve başka hiçbir yerel ölçüm onları ortaya
çıkaramazdı.

---

## 7. Erişilebilirlik testi — `@axe-core/playwright`'ın kapsamı ve sınırı

(ROADMAP v0.0.20.3, T-024; mimari karar: [`ADR-0025`](./adr/0025-erisilebilirlik-kapisinin-mekanik-siniri.md).)

`scripts/playwright/a11y.ts`'in tek dışa açılan yüzeyi
(`expectNoAccessibilityViolations`) üç uygulamanın altı sayfasını
(`apps/admin/e2e/accessibility.spec.ts`, `apps/superadmin/e2e/accessibility.spec.ts`,
`apps/storefront/e2e/accessibility.spec.ts`) `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`
etiketleriyle tarar. **Bu, `wcag` gate'inin dört sürümde (T-016, T-019, T-020, T-021)
elle yaptığı işin kabaca yarısını mekanikleştirir — tamamını değil.**

### ⚠⚠ Kurulacak cümle

> **Kontrast ve etiket regresyonu artık mekanik; odak/klavye/duyuru `wcag`'ın elle
> kontrol listesinde KALIR.**

Bunun **ötesinde** bir iddia ("erişilebilirlik artık mekanik") yanlıştır ve yazılmaz —
aşağıdaki dokuz eksen axe'ın statik DOM analizinin yapısal olarak göremediği veya
kasıtlı etiket kümesi dışında bıraktığı alanlardır (dokuzuncusu, eksen 9, `wcag`
gate'inin kendi ölçümüyle bu Task'ta eklendi).

### axe'ın kapsamadığı dokuz eksen

| #   | Eksen                                                          | axe                    | Not                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Odak yönetimi**                                              | ❌                     | axe tuş basmaz, odak akışını gözlemlemez. `wcag`'ın T-021'de bulduğu sidebar odak dönüşü bulgusu axe ile **bulunamazdı**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2   | **`aria-live` / WCAG 4.1.3**                                   | ❌                     | T-022'nin tüm `aria-live` muhakemesi **elle** kalır.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 3   | **Klavye / tuzak**                                             | ❌                     | Statik DOM denetimi, etkileşim üretmez.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 4   | **Açılmamış içerik**                                           | ❌                     | Kapalı bir dialog DOM'da yok ⇒ taranmaz — bu yüzden `admin/e2e/accessibility.spec.ts` dialog'u **açıkken** tarar (`admin-account-security-dialog`); kalan açılmamış yüzeyler kör noktadır.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 5   | **Görsel/gradyan üstü kontrast**                               | ⚠ `incomplete`         | İhlal değil, "belirlenemedi" — `scripts/playwright/a11y.ts`'in `ACKNOWLEDGED_INCOMPLETE_RULE_IDS` listesi dışındaki her `incomplete` testi kırar; yutulursa sessiz yeşil doğardı (AC-21).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 6   | **Metin kalitesi + i18n sabit metin** (CLAUDE.md §17)          | ❌                     | Bir metnin **varlığına** bakar, **anlamına** bakmaz.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 7   | **WCAG 1.4.10 reflow / 320 px**                                | ❌                     | Ayrı bir mekanizma — aşağıdaki "320 px reflow" bölümü.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8   | **`page-has-heading-one` sınıfı "best-practice" kurallar**     | ❌ (tasarım gereği)    | Keşif ölçümü superadmin `/giris`'te `h1` bulunmadığını gösterdi; axe bunu işaretlemedi çünkü kural `WCAG_RULE_TAGS` (`wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa`) kümesinde **değil**, axe'ın kendi `best-practice` etiketinde. Bu bir **uygunluk hatası değil** — ama kör nokta. Borç kaydı: `D21` (bkz. Teknik Borç → "Vadesi v0.0.20.5 / T-024").                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 9   | **WCAG 2.2 / SC 2.5.8 Hedef Boyutu (Minimum) — `target-size`** | ❌ (etiket kümede yok) | `wcag` gate'inin T-024'te ölçtüğü eksen (`.claude/workflow/reviews/T-024-wcag-tur1.md`): axe-core `4.14.0`'ın gerçek rule kataloğu `node -e` ile yüklenip sayıldı — `wcag2a`=62, `wcag2aa`=3, `wcag21a`=1, `wcag21aa`=3 (`WCAG_RULE_TAGS` birleşimi=69 kural, WCAG 2.0/2.1 A/AA'nın axe kapsamını **tam** temsil ediyor — iddia fazla değil). Ama `wcag22aa` (axe'ın **tek** WCAG 2.2 AA kuralı, `target-size`) kümede **yok** ve bu karar bugüne kadar hiçbir belgede yazılı değildi. Bu bir uygunluk hatası **değil** (yardımcının kendi iddiası zaten "WCAG 2.1", 2.2 değil) ama **gerekçesiz** bir sessiz kapsam farkı — ve `wcag` ajanının kendi görev tanımı "WCAG 2.2 AA" dediği için kapı, denetlediği standardın bir sürüm **gerisinde**. Bugün ne mekanik tarafından ne `wcag`'ın elle kontrol listesi tarafından kapsanıyor — üçüncü, kayıtsız bir boşluk. Borç kaydı: `D28` (bkz. Teknik Borç → "Vadesi v0.0.20.5 / T-024"), vade **v0.0.20.5**, sorumlu `architect`/`docs`. |

### `wcag` gate'inin daralan elle kontrol listesi

`wcag` **kaldırılmadı, daraldı.** Görevi artık axe'ın yerini aldığı mekanizmayı
**denetlemek**, onu **tekrar etmemek**:

1. `WCAG_RULE_TAGS` gerçekten WCAG 2.1 A/AA'yı kapsıyor mu (iddia ≠ kapsam) —
   ve iddia edilen standardın **sürümünün** (2.1 vs. kendi görev tanımındaki
   2.2) sessizce kayması yok mu (bkz. eksen 9).
2. Allowlist (`ALLOWED_VIOLATIONS`) boş mu; değilse her girdinin gerekçesi + borç
   satırı var mı.
3. Bu bölüm (axe'ın kapsamadığı dokuz eksen) ad ad güncel mi ve fazla iddia
   etmiyor mu.
4. **"axe yeşil ⇒ PASS" demek yasak.**
5. Üretim koduna (`apps/*/src/**`, `packages/themes/**`) inen bir A-sınıfı
   düzeltme varsa o yüzeyi elle yeniden denetlemek.

Yukarıdaki dokuz eksenden 1-4 ve 6-8 `wcag`'ın elle kontrol listesinde kalır;
5 ve 7 mekanik olarak axe/reflow testine devredildi; **9 bugün ikisi tarafından
da kapsanmıyor** — ne mekanik ne `wcag`'ın elle listesi tarafından, salt
`D28` olarak kayıtlı bir boşluk (bkz. yukarıdaki tablo satırı 9).

### 320 px reflow

Reflow testi artık WCAG 1.4.10'un kendi referans genişliğini (320 px) kullanır —
`scripts/playwright/base.ts`'teki `reflowMobileDevice`, paylaşılan `mobileDevice`
(`Pixel 7`, 412 px) sabitini **değiştirmeden** onun cihaz profilini (userAgent,
`isMobile`, `hasTouch`) korur ve yalnızca `viewport.width`'i 320'ye daraltır.
**Yalnızca** `admin-mobile` (`apps/admin/playwright.config.ts:128`) ve
`storefront-mobile` (`apps/storefront/playwright.config.ts:146`) bu türevi tüketir;
`storefront-visual-mobile` (`apps/storefront/playwright.config.ts:158`)
**bilerek değişmedi** — `mobileDevice`'ı (412 px) tüketmeye devam eder, bu
görsel regresyonun referans PNG'lerinin bu sürümde **hiç değişmemesinin** yapısal
garantisidir.

### Yerel iki-süreç gereği (R4)

Yerelde kök `pnpm test:e2e` **tek** `apps/api` sürecine karşı koşar. Üç uygulamanın
yeni `accessibility.spec.ts` dosyaları eklediği kimlik doğrulama maliyeti
(`apps/admin/e2e/auth-budget.ts`, `apps/superadmin/e2e/auth-budget.ts`) toplam
bütçeyi admin'de `signIn=11/signUp=8`, superadmin'de `signIn=5/signUp=5`'e
çıkarır — `AUTH_IP_LIMITS = { signIn: 20, signUp: 10 }` sınırının altında kalır,
ama **tek süreçli** yerel koşumda `apps/admin` + `apps/superadmin` + diğer
spec'lerin toplamı sınırı aşarsa `RATE_LIMIT_EXCEEDED` (429) alınır. **CI bu
riske açık değildir** — CI job'ları iki ayrı süreç ve iki ayrı Redis DB kullanır
(§2, "CI'da her job taze bir Redis ile başladığı için bu kısıt CI'da geçerli
değildir"). Yerelde art arda tam `test:e2e` koşumu çalıştırılıyorsa bu bütçe göz
önünde tutulmalıdır.

### PII azaltma — dört kanal, kaynak ve CI boru hattı seviyesinde

> ⚠ **Düzeltme notu #1 (`docs`, T-024 gate turu 1, 2026-11-18):** bu bölümün önceki
> hâli tek katman anlatıyordu (`a11y.ts`'in kendi `node.html` okumaması) ve
> `target[0]`'ı kesme uzunluğuyla "güvenli" sayıyordu. `security` tur 1 ve `qa`
> tur 1 **bağımsız** ölçümle ikisini de çürüttü — ayrıntı aşağıda, kaynak atıflı.
> Düzeltmeler koda uygulandı.

> ⚠⚠ **Düzeltme notu #2 (`docs`, T-024 gate turu 3, 2026-11-18) — bu bölümün
> başlığı daha önce "iki bağımsız katman" diyordu; bu da ÇÜRÜDÜ. Artık ÜÇ katman
> var ve rolleri değişti: birincil savunma hariç tutma deseni, env ikincil.**
> `security` tur 2'nin ölçümü
> (`.claude/workflow/reviews/T-024-security-tur2.md`, SEV: high): Playwright'ın
> tam sayfa ARIA anlık görüntüsü üretmenin **iki bağımsız** yolu var —
> F1'in aşağıda anlattığı `_takePageSnapshot()` (yalnızca düz `Error` ile düşen,
> **matcher-olmayan** başarısızlıklarda tetiklenir) **ve** `playwright-core`'un
> `_ariaSnapshotForExpect()`'i: bir **matcher** (`expect(locator).toBeVisible()`
> gibi) düştüğünde, eleman görünmez/bulunamazsa `document.body`'nin TAMAMININ
> ARIA ağacını alır. Zincir: `coreBundle.js` → `expect.js:13339`
> (`ExpectError.matcherResult.ariaSnapshot`) → `workerProcessEntry.js:830-831`
> (`testInfo.errors[i].errorContext`) → `errorContext.js:67-73` (`# Error
details` bölümünün **içine** ek bir `yaml` bloğu). `PLAYWRIGHT_NO_COPY_PROMPT`
> bu dalı **hiç görmez** — env, `_takePageSnapshot()`'ın İÇİNDEKİ bir
> erken-dönüş; `_ariaSnapshotForExpect()` o fonksiyonu hiç çağırmaz. İki dal
> birbirini **dışlar** (`playwright/lib/index.js:666`: bir hata zaten
> `errorContext` taşıyorsa `_takePageSnapshot()` hiç çağrılmaz) — yani bu
> env'in kapattığı dal, **tam olarak** matcher hatalarında zaten çalışmayan
> daldı; matcher hataları bu env'in korumasının **hiçbir zaman** altında
> olmadı.
>
> **Ampirik kanıt** (`security` tur 2, env SET iken, repo dışı `/tmp`, yalnızca
> `page.setContent`, gerçek Playwright 1.64.1): üretilen `error-context.md`'de
> `# Page snapshot` yok (env çalışıyor) ama `# Error details` içinde:
>
> ```yaml
> - main:
>     - heading "Aktif oturumlar" [level=1]
>     - paragraph: gizli-fixture-eposta@arkesoft.test
>     - paragraph: IP 203.0.113.9 — Chrome 141 macOS
>     - paragraph: 'Kiracı: e2e-magaza-1763400000000-abc'
> ```
>
> çıplak. **Sömürü yolu, bu sürümün kendi spec'lerinde somut var:**
> `apps/admin/e2e/accessibility.spec.ts:134`
> (`await expect(terminateTrigger).toBeVisible()`) oturum-içi `/hesap/guvenlik`'te
> koşuyor; o sayfa aktif oturum listesini (fixture e-postası, IP, user-agent,
> tarih) render ediyor — bu matcher herhangi bir nedenle düşerse (render
> yarışı, `D24` sınıfı 403) tam sayfanın ARIA ağacı `error-context.md`'ye
> yazılır. Aynısı `apps/superadmin/e2e/accessibility.spec.ts:110`
> (`expect(heading "Mağazalar").toBeVisible()`, kiracı listesi) için geçerli.
> `a11y.ts`'in redaksiyonu bu dizeye **hiç dokunamaz** — dize Playwright'ın
> matcher katmanında, `a11y.ts` çağrılmadan **önce** doğuyor.
>
> ⚠⚠ **Önceki turda yazılı üç gerekçe olgusal olarak yanlıştı** (bu Task
> ailesinde üçüncü kez — "kendi güvenlik gerekçemiz yanlış olabilir" tuzağı):
> "`target[0]` kesmesi tek PII riskiydi", "hariç tutma deseni reddedildi çünkü
> dosya artık PII taşımıyor", "kalan bölümler PII taşımıyor çünkü hata mesajı
> F2'den geçiyor" — üçü de matcher hatalarını (bu kanalın `a11y.ts`'ten **hiç
> geçmeyen** tek yolu) hesaba katmıyordu. `qa` tur 1'in iki yönlü ölçümü
> **geçerliydi ama genellenemezdi**: `a11y.ts` düz `new Error` atıyor ⇒
> `matcherResult` hiç oluşmuyor; ölçüm tam olarak bu dalı kaçırmıştı.
>
> **Düzeltme — üç katman, roller değişti (`devops`, FIX turu 3):**
>
> 1. **Birincil savunma:** `ci.yml:1815-1824`'teki Playwright artefakt yükleme
>    adımının `path:` listesine `!apps/*/test-results/**/error-context.md`
>    eklendi. `devops` bunu gerçek `@actions/glob@0.7.0` ile, repo dışı
>    `/tmp`'ta, **iki sırayla** sınadı: `apps/*/test-results` →
>    `!apps/*/test-results/**/error-context.md` → `apps/*/playwright-report`
>    sırası hariç tutmayı uyguluyor (sonuç listesinde `error-context.md` **hiç
>    yok**; trace/screenshot/video/html **korunuyor**); hariç tutma deseni
>    **ilk** satıra alınıp sıra tersine çevrildiğinde etkisi **sıfıra**
>    düşüyor — sıra her zaman "kapsayan desen → hariç tutma → sonraki
>    kapsayan desen" olmalı.
> 2. **İkincil savunma:** `PLAYWRIGHT_NO_COPY_PROMPT` (`ci.yml:1626`)
>    **korundu** — matcher-dışı (düz `Error`) hatalarda `# Page snapshot`'ı
>    kaynakta bastırmaya devam ediyor; tek başına yeterli olmadığı ölçüldü,
>    artık birincil savunmanın **tamamlayıcısı**.
> 3. **Üçüncü katman:** `if: always()` → `if: failure()` (`ci.yml:1816`).
>    Gerekçe: `always()`'in kattığı tek fark başarılı koşumların artefaktıydı;
>    bu sürümün `retries: 0` pini + `testInfo.errors.length > 0` koşulu
>    yüzünden başarılı koşumda trace/video/`error-context.md` zaten **boş**
>    üretiliyor (`always()` yalnızca değersiz boş dizin/`playwright-report`
>    yüklerdi). Hariç tutma deseni PII riskini bu ayrımdan **bağımsız** olarak
>    zaten kapatıyor; `failure()` savunma derinliği için eklendi, teşhis
>    değeri kaybı yok.
>
> ⚠ `scripts/playwright/a11y.ts` tarafında yapılacak **hiçbir şey yok** — dize
> Playwright'ın **içinde** doğuyor, bizim redaksiyonumuz oraya erişemiyor.
>
> ⭐ **Ders — bu Task'ta aynı dosya ailesinde İKİNCİ kez yaşandı (önce
> madde/bulgu `target[0]`, şimdi bu):** tek katmanlı bir savunmanın "kapattık"
> denmesi, kanalın **tek** olduğu ölçülmediyse erkendir. `security` tur 3 bu
> üç katmanın gerçekten kapandığını teyit edecek — bu bölüm sonucu **PASS**
> diye yazmaz, "düzeltme koda uygulandı, teyit bekliyor" yazar.

> ⚠⚠ **Düzeltme notu #3 (`docs`, T-024 gate turu 4, 2026-11-18) — bu bölüm
> İKİ ayrı eksende çürüdü: (a) "Düzeltme notu #2"nin üç katmanı bir
> DÖRDÜNCÜ kanalı (video) hiç kapatmıyordu; (b) savunmanın tamamı (dört
> katman dahil) hâlâ BEŞİNCİ bir kanalı — bu adımın kendi STDOUT'unu — hiç
> saymıyor.**
>
> **(a) Video kanalı — `security` tur 3'ün ölçümü (SEV: high), FIX turu 4'te
> `devops` tarafından, kullanıcı onayıyla (kota dışı dördüncü FIX turu)
> kapatıldı.** Yukarıdaki "Düzeltme notu #2"nin ampirik doğrulaması
> ("sonuç listesinde `error-context.md` hiç yok; trace/screenshot/**video**/
> html korunuyor") o anda **doğruydu** ama yalnızca `error-context.md`'nin
> hariç tutulduğu bir `path:` sırasını sınıyordu — "korunuyor" ifadesi
> videonun sızıntı yüzeyi **dışında** olduğu yanlış sonucuna yol açtı.
> Gerçek: `scripts/playwright/base.ts:149`'un `video: 'retain-on-failure'`
> ayarı, hemen üstündeki `trace: 'on-first-retry'`'ın aksine `retries`'e
> **bağımlı değildir** — Playwright son deneme başarısız olduğunda videoyu
> deneme sayısından **bağımsız** saklar. `security` tur 3'ün ampirik koşumu
> (repo dışı `/tmp`, gerçek Playwright 1.64.1, yalnızca `page.setContent`):
> başarısız testte `video.webm` **üretildi** (10.842 bayt); `ffmpeg` ile
> çıkarılan karede sentetik e-posta/IP/user-agent/kiracı slug'ı **okunabilir**.
> Bu kanalı `if: failure()` **kapatmaz** — koşullar çakışıyor: video tam
> olarak başarısızlıkta doğar, artefakt yükleme adımı tam olarak
> başarısızlıkta çalışır. Düzeltme ("Playwright artefaktlarını yükle
> (trace + video)" adımının `path:` listesi): `!apps/*/test-results/**/*.webm`
> ve `!apps/*/test-results/**/trace.zip` eklendi (`trace.zip` o an zaten
> `retries: 0` sayesinde doğmuyordu, ikinci katman olarak eklendi — bkz.
> ROADMAP `D33`, bu desenin Playwright sürümüne bağlı bir varsayım olduğu
> not düşülmüş). `security` tur 4 `devops`'un ölçümüne güvenmeden sıfırdan
> yeniden ölçtü (iki ayrı `@actions/glob` sürümü, 28 sentetik dosya, genişletilmiş
> derinlik ekseni): `error-context.md`/`video.webm`/`trace.zip` sonuç
> listesinde **sıfır**, `test-failed-1.png`/`.last-run.json`/görsel
> `-actual.png`/`-diff.png` **korunuyor** (teşhis değeri duruyor) — **bu kez
> gerçekten kapandı**. ⚠ **Hafifletici (dürüstlük için kayıtlı):** bu
> Task'ın verisi sentetik e2e fixture verisi; video `trace.zip`'in aksine
> çerez/`Authorization` başlığı taşımaz (yalnızca sayfa görüntüsü).
>
> **(b) Dördüncü kanal — `a11y.ts`'in kendi redaksiyonu → STDOUT (`security`
> tur 4'ün bulgusu, SEV: medium, `D31`).** Yukarıdaki (artık dört) `path:`
> hariç tutması ve `PLAYWRIGHT_NO_COPY_PROMPT` **artefakt dosyalarını** ve
> Playwright'ın kendi ARIA anlık görüntüsü üretimini kapatır — ama
> `test:e2e` adımının kendi **stdout**'u (public Actions job log, giriş
> gerekmez) tamamen başka bir kanaldır ve yukarıdaki katmanların **hiçbiri**
> onu kapsamaz. `security` tur 4'ün gerçek Playwright 1.64.1 koşumuyla
> (repo dışı, yalnızca `page.setContent`) ölçtüğü tablo:
>
> | Senaryo                                 | stdout'a düşen                                                  |
> | --------------------------------------- | --------------------------------------------------------------- |
> | `expect(locator).toBeVisible()` düştü   | yalnızca locator ifadesi — sayfa içeriği yok                    |
> | `expect(bodyText).toContain(...)` düştü | `Received string:` = sayfanın **tam `innerText`'i, kesilmeden** |
> | strict mode ihlali                      | eşleşen elemanların **ham `outerHTML`'i**                       |
> | `error-context.md` içeriği              | basılmıyor, yalnızca dosya **yolu**                             |
>
> Bu kanal `scripts/redact-test-log.ts`'in **dışındadır** (o süzgeç yalnızca
> `.github/actions/run-gates/action.yml:93,143`'teki `tee` borularını kapsar)
> ve `if: failure()`/dört `path:` hariç tutmasından **bağımsızdır** — farklı
> bir taşıma (stdout ≠ artefakt). `scripts/playwright/a11y.ts:73-79` bunu
> bugün **doğru** adlandıran **tek** yer; bu bölüm ve `ADR-0025` bugüne kadar
> saymıyordu. **T-024 bu kanalı genişletmiyor** — yeni a11y spec'lerinin
> mesajları sabit locator veya `a11y.ts`'in redakte edilmiş düz `Error`'u;
> en geniş desenin (`expect(bodyText).toContain`) iki örneği
> (`apps/storefront/e2e/accessibility.spec.ts:75,91`) **anonim vitrin**
> sayfalarında (demo kiracı + 404) ⇒ bugün PII akmıyor — bu yüzden `high`
> değil, `medium`: risk, bir sonraki ajanın aynı deseni `/hesap/guvenlik`
> veya kiracı listesine kopyalamasıdır. Borç: `D31` (bkz. ROADMAP), vade
> **v0.0.22**, sorumlu `devops`/`docs`.
>
> **Savunma modeli artık dört kanaldır, üç değil** — her biri farklı bir
> yüzeyi kapatır, biri diğerinin yedeği değildir:
>
> 1. `path:` hariç tutmaları (`error-context.md`/`*.webm`/`trace.zip`) →
>    **artefakt dosyaları**.
> 2. `PLAYWRIGHT_NO_COPY_PROMPT` → matcher-dışı (düz `Error`) `# Page
snapshot` üretimini **kaynakta** bastırır.
> 3. `if: failure()` → yükleme **yüzeyini** küçültür (teşhis değeri kaybı
>    yok, başarılı koşumda zaten boş artefakt).
> 4. `a11y.ts`'in kendi redaksiyonu (`redactAxeDetail`) → axe'ın ürettiği
>    mesajı **STDOUT'a düşmeden önce** temizler; bu, STDOUT kanalının
>    **tek** savunmasıdır ve yalnızca `a11y.ts`'in kendi `new Error`
>    mesajlarını kapsar — Playwright'ın matcher hatalarının `Received
string:`/`outerHTML` çıktısını **kapsamaz** (`D31`'in konusu tam
>    olarak bu).
>
> ⭐ **Ders (bu Task'ta ölçümle dördüncü kez yazılan aynı cümle):** bir
> savunmanın kapsamı, **kapattığı kanal sayılmadan** ilan edilemez — "üç
> katman" dört olabiliyordu, "dört katman" da beşinci bir kanalı (stdout)
> saymıyordu.

"E2E süitini çalıştır (pnpm test:e2e)" adımının ürettiği Playwright
artefaktları, aynı job'daki **"Playwright artefaktlarını yükle (trace +
video)"** adımıyla CI'a taşınıyor. ⚠⚠ **Satır atıfları bu Task içinde
dördüncü kez bayatladı** (önceki hâller `:1534`/`:1558`/`:1565`, sonra
`:1815-1824`/`:1816`/`:1822`/`:1824` diyordu; gerçek adım bugün
`ci.yml:1889-1900`). Sebep hep aynı: `ci.yml` bu Task boyunca 1634 → 1973
satıra çıktı — her FIX turunun eklediği yorum bloğu önceki turun atıflarını
kaydırıyor. ⇒ **Bundan sonra bu bölümde mutlak satır numarasına atıf
verilmez; adım adına veya `if:`/`path:` anahtarına atıf verilir.**

Yükleme adımı bu Task'ta **iki** kez sıkılaştırıldı:

- FIX turu 3: `if: always()` → `if: failure()`; `path:` listesine
  `!apps/*/test-results/**/error-context.md` eklendi.
- FIX turu 4 (`security` tur 3'ün `high` bulgusuna karşılık — ayrıntı
  yukarıdaki "Düzeltme notu #3"): `path:` listesine
  `!apps/*/test-results/**/*.webm` ve `!apps/*/test-results/**/trace.zip`
  eklendi. ⚠ `trace.zip` deseni **literal dosya adına** dayanır — Playwright
  1.64.1 çoklu context trace'lerini `mergeTraceFiles()` ile tek dosyada
  birleştirir, bugün tam kapsıyor ama bu **sürüme bağlı bir varsayım**dır
  (bkz. ROADMAP `D33`). `retention-days: 7` değişmedi.

Depo **public** — bu dört hariç tutma deseni **ve** `failure()` koşulu
olmadan önce yeşil bir koşumda da artefakt anonim indirilebilirdi.
`scripts/redact-test-log.ts` bunu **çözmez**: (1) yalnızca
`test`/`test:isolation` borusundadır (`.github/actions/run-gates/action.yml:93,143`),
`test:e2e`'de hiç yok; (2) sır **biçimli** jetonları hedefler, axe'ın asıl
riski (fixture e-postası, kiracı slug'ı — DOM parçacığının **görünür
metninde**) PII'dir, sır biçimi değil. ⚠⚠ Ayrıca bu dört hariç tutma deseni
**artefakt dosyalarını** kapsar — `test:e2e` adımının kendi **stdout**'u
(public job log) tamamen **ayrı, dördüncü bir kanaldır** ve hiçbirinin
kapsamında değildir; ayrıntı yukarıdaki "Düzeltme notu #3 (b)" ve `D31`.

**F1 — Playwright'ın kendi ARIA anlık görüntüsü (`error-context.md`).** `security`
tur 1'in ölçümü (`T-024-security-tur1.md`, SEV: high, çürüten bulgu): `a11y.ts`'in
`node.html`'i hiç okumaması bu kanalı **etkilemiyordu** — Playwright'ın kendisi
(`playwright@1.64.1`, `node_modules/.pnpm/playwright@1.64.1/.../lib/index.js:662-680`
`_takePageSnapshot()`) başarısız bir testte `page.ariaSnapshot({ mode: 'ai' })` alıyor
ve bunu `errorContext.js:75-81` `error-context.md`'ye `# Page snapshot` başlığıyla
gömüyor; bu, tek bir `node.html` parçacığından **geniştir** — oturum içi bir taramanın
(admin `/hesap/guvenlik`, superadmin `/`) tüm erişilebilir metnini (fixture e-postası,
oturum listesi: IP/user-agent/tarih, kiracı adları) taşıyabilir. Düzeltme:
`test:e2e` adımına `PLAYWRIGHT_NO_COPY_PROMPT: '1'` env'i eklendi (`ci.yml:1626`,
⚠ bu satır numarası FIX turu 3'ün eklediği yorumlarla kaymıştır, bu turda yeniden
doğrulandı) + `turbo.json`'un `test:e2e.passThroughEnv` listesine eklendi
(`turbo.json:215`, aksi hâlde `check_e2e_env_passthrough` kırar) —
`playwright/lib/index.js:663` bu değişken
varsa `_takePageSnapshot()`'ı hiç çağırmıyor. `qa`'nın **iki yönlü** mutasyon ölçümü
(`T-024-qa-tur1.md`, F1): env **olmadan** koşulan testte enjekte edilen e-posta/slug
"# Page snapshot" bölümünde **çıplak** görüldü; env **ile** koşulan aynı testte o
bölüm **hiç yoktu** — gerçek full-suite koşumunda da hiçbir `error-context.md`
sayfa-çapında PII taşımadı.

> ⚠ **Aşırı iddia düzeltmesi (`qa` tur 1, low bulgu).** `ci.yml`/`a11y.ts`'in dosya
> başı yorumları bu düzeltme için _"dosya hiç doğmaz"_ diyordu — bu **yanlış**.
> `error-context.md` dosyasının **kendisi hâlâ doğuyor** (`errorContext.js:44`'ün
> `buildErrorContext()`'i `meaningfulErrors.length > 0` tek başına dosyayı üretmeye
> yeterli görüyor); bastırılan **yalnızca** PII taşıyan `# Page snapshot` bölümü.
> Dosya `# Instructions`/`# Test info`/`# Error details`/`# Test source` ile
> yazılmaya **devam ediyor** (bunlar PII taşımıyor çünkü hata mesajının kendisi F2'den
> geçiyor — aşağı bkz.). "Dosya" ile "PII bölümü" birbirine karıştırılmamalı; aksi
> hâlde biri "dosya yoksa risk yok" diye başka bir bölümü genişletip aynı kanalı fark
> etmeden yeniden açabilir.

**F2 — axe'ın ürettiği seçicinin kendisi (`target[0]`).** `security` tur 1'in ölçümü
(SEV: medium, çürüten bulgu): axe-core `4.14.0`'ın seçici üreticisi
(`node_modules/.pnpm/axe-core@4.14.0/.../axe.js:7905`) `ignoredAttributes` listesinde
yalnızca `class`/`style`/`id`/`tabindex`/`aria-*` gibi öznitelikleri dışlıyor;
`axe.js:7914-7936` (`getAttributeNameValue()`) `href`/`src` için alan adını **dâhil**
eden bir "friendly URI" kullanıyor, **diğer her öznitelik** için ham değeri (`:7940`,
değer `< 31` karakterse) doğrudan `ad="değer"` biçiminde seçiciye gömüyor —
`value`/`name`/`title`/`alt`/`aria-label`/`data-*` içindeki kullanıcı verisi seçiciye
girebilir; kesme uzunluğu (≤ 80 karakter) bunu **engellemiyordu**, önceki metin bu
yüzden yanlıştı. Düzeltme (`scripts/playwright/a11y.ts:399-414`, ⚠ bu satır
numarası dosyanın sonraki büyümesiyle kaymıştır, bu turda yeniden doğrulandı —
bkz. ROADMAP `D29`'un dersi, bu dosya çiftinde satır numarası güvenilmez çapa —
`formatResultSummary`): `target[0]` parçacıkları artık
`truncate(redactSensitivePatterns(stringifyFirstTarget(node)), TARGET_SNIPPET_MAX_LENGTH)`
— **redaksiyon önce, kesme sonra** (ters sırada yarım kalan bir e-posta/slug deseni
eşleşmez ve yarım sır maskelenmeden sızabilirdi). `failureSummary` artık aynı
`redactSensitivePatterns()` adımını (`redactAxeDetail()` üzerinden) paylaşıyor — ikisi
**tek** maskeleme mantığını kullanıyor, `target[0]` istisna değil. `qa`'nın mutasyon
ölçümü (F2): etiketsiz bir `input`e `data-qa-marker="qamark@example.test"` eklenip
axe'ın seçiciye bu özniteliği gömmesi zorlandı — gerçek hata mesajı ham e-postayı
**taşımadı**, `***@***` içerdi.

`node.html` hiçbir koşulda okunmaz; mesaj yalnızca `ruleId`, `impact`, düğüm sayısı,
`helpUrl` ve ilk üç düğümün redaksiyondan geçmiş `target[0]`'ından (≤ 80 karakter)
kurulur, `failureSummary` `redactAxeDetail()`'den geçer (e-posta → `***@***`, fixture
kiracı slug'ı → `[REDACTED-FIXTURE]`, toplam ≤ 200 karakter).

**`playwright-annotations.json` neden `.gitignore`'da.** F4 (AC-21 kanıtı için CI'da,
`process.env['CI']` iken) üç `playwright.config.ts`'in ürettiği
`playwright-annotations.json`, başarısız testlerin tam `Error details`/stack trace'ini
taşıyor — `qa` tur 1 ölçtü (gerçek bir koşumda superadmin'in dosyası bunu doğruladı).
Bu, F1'in kapattığı CI-artefakt sızıntı yüzeyiyle **aynı sınıf** bir yüzeyi git
seviyesinde yeniden açabilirdi (public depoda bir `git add -A`/`git add .` bu dosyayı
yanlışlıkla commit'leyebilirdi — `.gitignore:42-43`'ün eski kapsamı yalnızca
`playwright-report/` ve `test-results/` dizinleriydi, bu dosya listede **yoktu**).
Düzeltme: `.gitignore:55`'e `playwright-annotations.json` eklendi — `devops`'un üç
uygulama için de `git check-ignore -v` ile ölçtüğü doğrulandı.
