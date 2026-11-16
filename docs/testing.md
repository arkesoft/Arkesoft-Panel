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
