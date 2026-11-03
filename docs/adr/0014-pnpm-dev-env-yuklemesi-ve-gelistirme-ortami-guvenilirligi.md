# ADR-0014 — `pnpm dev` güvenilirliği: env yükleme/geçirme ayrımı, Playwright teardown'ı ve turbo önbellek ödünleşmesi

- **Durum:** Kabul edildi
- **Tarih:** 2026-11-03
- **Karar verenler:** architect, devops, frontend, qa, security, solid, PO (T-011)
- **İlgili versiyon:** `v0.0.9.1` (bkz. `ROADMAP.md`)

---

## Bağlam

v0.0.8 kapanışından sonra Orkestratör `pnpm dev`'i çalıştırdığında vitrin (`apps/storefront`)
her yolda **500** döndü ve çökme `apps/api`'yi de düşürdü (3000 portu boş, `/health/ready` →
`000`). Kök neden üç halkaydı: (1) kök `.env`'deki `APP_BASE_DOMAIN`/`STOREFRONT_API_BASE_URL`
turbo'ya **bildirilmemiş** ve Astro'nun `envDir`'i repo kökünü **yüklemiyordu**; (2) turbo, tek
bir görevin (`storefront:dev`) çökmesinde tüm koşumu (`apps/api` dahil) sonlandırıyordu; (3)
Playwright'ın `webServer`'ı koşum sonrası arka planda kalıyor, bu da artık süreçlerin paylaşılan
Postgres/Redis/Mailpit'e yüklenmesine ve `pnpm test`'in ölçülebilir şekilde flaky olmasına yol
açıyordu. `pm` bunu v0.0.9'dan ayrı, `high` sınıfı bir hotfix olarak sınıflandırdı (T-010 Karar 2);
kullanıcı kapsamı "üç halka tek Task'ta" ve ROADMAP bağlamasını "yeni kilometre taşı v0.0.9.1"
olarak onayladı.

Üç gerilim bu Task'ı şekillendirdi:

1. **Env'in dosyadan "var olması" ile kabuktan "geçmesi" aynı mekanizma değil.** Bu ayrımın
   karıştırılması halka 1'in kendisiydi; düzeltmenin kalıcı olması için ayrımın ADR'ye açıkça
   yazılması gerekiyordu.
2. **Fail-closed çökme vs. kardeş görevi ayakta tutma.** Vitrinin env hatasıyla çökmesi doğru
   davranış (sessiz bozulma yok); ama bu çökme `apps/api`'yi de düşürmemeli. İki dal ölçüldü,
   biri `apps/api`'nin **kendi** env şemasından kaynaklanan bağımsız bir arızayla karıştı
   (confound) — bu karışıklığın gizlenmesi değil, **açıkça yazılması** mimari bir karardı.
3. **Kaldırılabilir kök neden vs. savunma katmanı.** Playwright'ın artık süreç sorunu bir süreç
   katili (`globalTeardown`) ile maskelenebilirdi; ama kök neden (`am-i-vibing`'in `astro dev`'i
   arka plana alması) ortadan kaldırılabiliyorsa, üstüne bir savunma katmanı eklemek (yanlış
   süreç öldürme riski) kapının kendisini daha riskli kılar.

## Karar

### 1 — İki aşamalı env mekanizması: yükleme ile geçirme birbirinin yerini tutmaz

|            | **YÜKLEME** (loading)                         | **GEÇİRME** (passthrough)       |
| ---------- | ---------------------------------------------- | -------------------------------- |
| Ne yapar   | dosya → `process.env`, **görev içinde**        | kabuk → görev                   |
| Mekanizma  | `--env-file-if-exists` · `process.loadEnvFile` | turbo, `turbo.json`'daki `env`  |
| Etkisi     | değeri **var eder**                            | önbellek hash'ini etkiler (önbelleklenen görevlerde) |

turbo `.env` dosyalarını **hiç okumaz** — yalnızca kabuktan zaten gelen (veya dosyadan
yüklenmiş) bir değeri **görür** ve görev hash'ine katar. Halka 1 tam olarak bu iki mekanizmanın
karıştırılmasından doğdu: `.env`'de değer **vardı** (yükleme sorunu yok), ama `turbo.json`'da
**bildirilmemişti** (geçirme/önbellek sorunu) ve Astro'nun `envDir`'i paket dizinini gösteriyordu
(yükleme sorunu da vardı — ikisi aynı anda eksikti). **Önceliklendirme (ölçüldü):** kabuk > kök
`.env` — `--env-file-if-exists` ve `process.loadEnvFile` kabukta **zaten tanımlı** bir değeri
**ezmez**. Bu özellik AC5'in kalıcı regresyon reçetesinin (bkz. Karar 7) doğrudan dayanağıdır.

### 2 — Halka 2: vitrin fail-closed çöker (Dal B); kardeş görevi ayakta tutma (Dal A) ölçüldü ve CONFOUND'lu bulundu — "imkânsız" denmedi

İki dal değerlendirildi:

- **Dal B (uygulandı):** vitrin env hatasında **tek seferde** okunur bir Türkçe teşhisle
  fail-closed çöker, döngüye girmez (`EXIT:1`, ~2s, port 4321 dinlemiyor).
- **Dal A (ölçüldü, uygulanmadı):** `turbo run dev --continue=always`. Ölçüm: komut kendiliğinden
  **çıkmadı** (49.8s canlı, elle `SIGINT` gerekti); `apps/api`+`apps/admin` süreçleri turbo
  tarafından **öldürülmedi** — yani teardown **ölçülebilir şekilde önlendi**.

**CONFOUND (bilerek kayıt altına alınıyor, gizlenmiyor):** `apps/api` **aynı** env şemasını
(`packages/config`) kullanır ve `APP_BASE_DOMAIN` orada da zorunludur. `APP_BASE_DOMAIN` boşken
`apps/api` **kendi başına** `EnvValidationError` fırlatır (`packages/config/src/env.ts` →
`apps/api/src/config/config.module.ts`), `app.listen()`'a hiç ulaşmaz. Yani bu reçeteyle ölçülen
senaryoda port 3000'in boş olması turbo'nun `apps/api`'yi düşürmesinden **değil**, `apps/api`'nin
**bağımsız arızasından** kaynaklanıyor olabilir. Dolayısıyla *"sağlıklı bir kardeş görev gerçekten
ayakta kalıyor mu"* sorusunun ikinci yarısı **bu reçeteyle test edilemedi**. **Bu ADR bilerek
"turbo'nun persistent-task teardown semantiğiyle imkânsız" cümlesini YAZMAZ** — ölçüm bunun tersini
(teardown'ın önlendiğini) gösteriyor; yazılamayan şey yalnızca "kardeş görev env hatasından
**bağımsız olarak** sağlıklı kalır mı" sorusunun bu reçeteyle yanıtlanamamasıdır. Temiz bir tekrar,
**yalnızca vitrini bozan, `apps/api`'yi bozmayan** bir env değişkeni gerektirir — bu Task'ın
kapsamı dışında, ayrı bir ölçüm olarak işaretlendi (bkz. Teknik Borç → Vadesi v0.0.9.1).

Dal B seçildi çünkü hem AC1'i (temiz kabukta vitrin 200, API 200) hem de AC5'i (regresyonda
döngüsüz, tek seferde çökme) karşılıyor ve Dal A'nın confound'u kapanmadan kardeş-görev garantisi
iddia edilemez.

### 3 — Halka 3: iki ayrı artık süreç kaynağı var; kaldırılabilir olan kapatıldı, kapatılamayan borç olarak kaydedildi

**Kök neden (ölçüldü, ilk teşhisten daha iyi çıktı):** Astro 7.4.2'nin **`am-i-vibing`**
bağımlılığı `CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT`/`AI_AGENT` ortam değişkenleri varken `astro
dev`'i **arka plana alıyor** → süreç Playwright'ın süreç ağacından **kopuyor** → öldürülemiyor.
Önceki teşhis ("teardown bozuk", T-009/S9) **yanlıştı** — sorun tetikleyici ortam değişkenleriydi.

**Katman 1:** `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AI_AGENT` öneki tetikleyiciyi keser
— `package.json`'ın `dev` scriptine **ve** `playwright.config.ts`'nin `webServer.command`'ına
gömülü.
**Katman 2:** `reuseExistingServer: false` **koşulsuz** hale getirildi — eski
`!process.env['CI']` koşulu yerelde `true`'ya düşüp artık süreci **yeniden kullanıp
kalıcılaştırıyordu**.
**Katman 3 (`globalTeardown` süreç toplayıcı) EKLENMEDİ** — ölçüldü: katman 1+2 ile AC3 **3/3
tekrar × 2 ardışık e2e → 66/66, her `pgrep` boş** çıktı. Gerekçe: kaldırılabilir bir kök neden
varken üstüne bir süreç katili eklemek kapının kendisini riskli kılar (yanlış süreç öldürme
olasılığı — ör. geliştiricinin ayrı bir `astro dev` penceresi). Tasarım burada **kayıt** olarak
tutuluyor: ileride gerekirse `astro dev` **VE** `--port <STOREFRONT_E2E_PORT>` ikisini birlikte
taşıyan PID'leri hedefleyen bir toplayıcı eklenebilir; geliştiricinin elle başlattığı `pnpm dev`
sunucusu `--port` taşımadığı için bu ayrım **yanlış süreç öldürmeyi** önler.

**⚠ İKİ AYRI ARTIK SÜREÇ KAYNAĞI VAR, katman 1+2 yalnızca birini kapatıyor:**

- **(a) `am-i-vibing` arka plana alması → Playwright yolu.** Katman 1+2 **kapatıyor**.
- **(b) turbo'nun abort teardown'ı → `pnpm dev` yolu.** turbo'nun ana süreci bir görev
  başarısız olduğunda (ör. Dal B'nin env hatası) **1.99s**'de çıkıyor ama `tsc --watch`,
  `node --watch` (api) ve `vite` (admin) **öksüz olarak çalışmaya devam ediyor** — turbo'nun
  "run failed" teardown'ı çocukları temiz kapatmıyor. **Katman 1+2 bunu kapsamıyor** (farklı
  tetikleyici, aynı artık-süreç ailesi) — bu Task'ın kapsamı dışında, teknik borç olarak
  kaydedildi.

**Canlı kanıt (ölçüm disiplinini göstermek için kayıt altına alınıyor):** Task başlamadan önce
10+ saatlik bir `astro dev` ve 10 sa 47 dk'lık bir `apps/api` süreci bulunup temizlendi.

### 4 — AC8 için ayrı bir SAF modül gerekti, salt ayrı bir export yetmedi

**AC8 = `build`/`preview`/`sync` yollarında `process.env`'e ASLA dokunulmaması.** Tehlike
mekanizması ölçüldü: Vite'ın `loadEnv`'i önek eşleşen (`PUBLIC_*`) anahtarları yalnızca `.env`
dosyalarından değil, **`process.env`'den de** toplar → kök `.env`'i `process.env`'e yüklemek,
oradaki her `PUBLIC_*` anahtarını istemci paketinin görüş alanına sokar; `astro.config.ts`'in
`server.host: true` (`0.0.0.0`) ayarı yüzünden bu, geliştiricinin LAN'ındaki herhangi bir
makineden okunabilir hale gelir. **Bu tehlike bu Task sırasında bir kez gerçekleşti:** bir üretim
ajanı kullanıcının kök `.env`'ine `PUBLIC_ARKESOFT_SENTINEL` satırı bırakıp yarı yolda durdu;
Orkestratör kaldırdı (`diff` tam bir satır olduğunu doğruladı, `dist` temizlendi). Bu ADR'de bu
olay **teorik değil, ölçülmüş bir tehlike örneği** olarak kayıtlıdır.

`storefront-env.ts` **modül yüklenirken** `parseStorefrontEnv(process.env)` çağırır
(açılış-kritik, kasıtlı fail-closed). ES modül semantiği bir ad import edildiğinde modülün **tüm
üst seviyesini** değerlendirir — entegrasyon şemayı `storefront-env.ts`'den import **edemez**,
yoksa `build` dalında da ateşlenir ve AC8 ihlal olur. Çözüm: **ayrı bir SAF modül**
(`storefront-env-schema.ts`, yan etkisiz) + `storefront-env.ts` (re-export, açılış-kritik parse).
Ayrı bir export yeterli **değildi**; ayrı **modül** gerekti.

**Reddedilen üç yol (kayıt):**

1. Düz `await import()` → *"Vite module runner has been closed"* (hook, Astro'nun
   config-yükleme modül çalıştırıcısı **kapandıktan sonra** çalışıyor).
2. `@vite-ignore` → Vite yorumu **yok saydı**.
3. `new Function('specifier', 'return import(specifier)')` ile Node'un gerçek ESM yükleyicisine
   kaçış → **gerçekten çalışıyordu** ama T-010'un saflık pini `eval`/`new Function`'ı yasaklıyor
   ve kaçınılmaz bir `as` gerektiriyordu — reddedildi. `new Function` kalıntısı artık yalnızca
   bu üç denemeyi belgeleyen bir yorumda var.

**Artık risk (`low`, iki gate bağımsız ölçtü):** `storefront-env.ts`'in korunan
`storefrontEnvSchema` re-export'u **da** aynı eager-parse'ı tetikler (ES semantiği) — adlandırılmış
tuzak (`storefront-env.js`'den `parseStorefrontEnv` çağırma) `tsc` ile **kapandı** (o isim artık o
yoldan export edilmiyor) ama dosya artık yan etkisiz bir "şema barrel'ı" gibi **görünüyor** ve bu
hâlâ yanlış. Borç kaydedildi.

### 5 — AC8 bağımsız doğrulama altı yoldan geçti; yöntem notu: import/çağrı araması, kelime araması değil

1. `command` birleşimi Astro 7.4.2'de tam olarak `'dev' | 'build' | 'preview' | 'sync'` →
   `!== 'dev'` bir **allowlist**, gelecekteki yeni değerler de reddedilir (fail-closed).
2. Entegrasyon **tek** hook tanımlıyor, dolaylı tetikleme yüzeyi yok.
3. `rg` ile tüm `loadEnvFile` çağrıları + `process.env` atamaları tarandı → vitrin üretim
   yolunda **tek yazıcı** bu kapılı hook.
4. `dist` ölçüldü: kök `.env`'in 34 anahtarının ≥6 karakterli değerleri arandı →
   `dist/client/**` **0 eşleşme**, sır **0**, `PUBLIC_*` **0**.
5. `vite.envPrefix` override **edilmemiş**, `envDir` paket dizinine pinli ve orada `.env` yok.
6. `loadEnvFile` kabukta tanımlı değeri **EZMİYOR** (AC5 reçetesinin dayanağı).

**Yöntem notu (tekrar eden sınıf):** `dist/server/**`'daki yedi eşleşmenin üçü **Türkçe yorum
içindeki örnek host'lardı** — kelime araması değil, **import/çağrı araması** yapılmak zorunda.
Bu disiplin bu projede daha önce bir kez yanlış sonuç üretmişti (`rg "prettier" dist` yorum
literalleriyle eşleşmiş, gerçek import 0'dı); AC8 doğrulamasında aynı hataya düşülmedi.

### 6 — Kiracı izolasyonu bu Task için N/A varsayılmadı, ölçüldü

`APP_BASE_DOMAIN` host→kiracı çözümlemesini besliyor, bu yüzden CLAUDE.md §7'nin 14 maddesi
yapısal olarak N/A olsa da (yeni endpoint/prosedür/kuyruk işi/tablo yok) sorgulandı:

```
boş/eksik         → z.string().min(1) açılışta düşürür (dev kapısı VE storefront-env.ts modül-
                     yükleme parse'ı, yani üretim çalışma zamanı dahil)
ayrıştırılamaz    → middleware.ts fırlatır
yanlış ama geçerli → resolve-host.ts seçiciyi YALNIZCA Host başlığından türetir
                     (endsWith('.'+base), includes DEĞİL) → unresolved (sorgu atılmaz) veya
                     TAM eşleşme
```

→ **Yanlış kiracıya düşme yolu yok — fail-closed.**

### 7 — Turbo önbellek ödünleşmesi kullanıcı kararıyla kabul edilen bir borçtur, gizlenmiş bir `high` değildir

`turbo.json`'un `tasks.build.env` bildirimi (`APP_BASE_DOMAIN`, `STOREFRONT_API_BASE_URL`),
`lint`/`typecheck`'in `dependsOn: ["^build", "generate"]` zinciri üzerinden `build`'in env-duyarlı
hash'ini **devralmasına** yol açar:

```
build      env DEĞERİ değişince: 13/13 → 1/13 cached, 3.47–4.0s
lint       env değişince:        19/19 → 2/19 cached, 9.4–12.4s   (17 paket kaçırıyor)
typecheck  env değişince:        19/19 → 8/19 cached, 2.35s        (11 paket kaçırıyor)
aynı değere dönünce:              FULL TURBO (deterministik, geri alınabilir)
istisna: @arkesoft/config isabet ediyor (build bağımlılığı YOK) → zincir teorisini doğruluyor
```

`perf` gate'i bunu **`high`** olarak işaretledi çünkü `devops`'un "bildirilmeyen görev
etkilenmiyor" gerekçesi bu zincir yüzünden **yanlıştı**. **Kullanıcı kararı (bağlayıcı):** bulgu
borca indirildi — "yorumu düzelt + borcu kaydet". Gerekçe: maliyet yalnızca bu iki env **değeri**
değişince doğuyor (CI'da `cp .env.example .env` ile **sabit** kalır) → tek seferlik ~15-18s;
denetlenebilirlik (env değişince tüm bağımlı paketlerin yeniden build/lint/typecheck edilmesi)
`devops`'un bilinçli tercihiydi; alternatifi (paket bazlı `apps/storefront/turbo.json` override'ı)
adıyla yazılmış ve ölçümü `perf`'e devredilmişti. Repoya **ilk** paket-bazlı `turbo.json`'ı sokmak,
ikinci bir gerekçe (T3-1, v0.0.14) doğduğunda daha yerinde — bu yüzden şimdi değil, borç olarak
kaydedildi. **Bu bir gizlenmiş `high` değildir** — ölçülmüş, sınırlı ve kullanıcı onaylı bir
ödünleşmedir.

İstemci sızıntısı ölçüldü ve yok: `createRootEnvIntegration`/`arkesoft-root-env`/`loadEnvFile` →
`dist`'te 0 import/çağrı; `dist/client`'da şema 0 eşleşme; bu Task hiçbir client/island dosyasını
değiştirmedi (`dist/client` 228 KB raw / 71.27 KB gzip, değişmedi). Perf bütçesi bu Task için
tanımlı değil — sayılar mutlak olarak kaydedildi.

### 8 — Aynı kusur sınıfı üç kez kendi düzeltmesinin içinde yeniden üretildi; reçete kayda geçti

Kovalanan kusur sınıfı ("mutasyona duyarlı olduğunu iddia eden ama ölçmeyen test") düzeltme
turlarının **içinde** üç kez tekrarlandı:

```
tur 1   testler AC8'i ölçtüğünü söylüyordu — ölçmüyordu (loadEnvFile hiç gözlenmiyordu)
tur 2   self-test'ler mutasyon duyarlılığını kanıtladığını söylüyordu — hiçbir depo kodunu çağırmıyordu
tur 3   çıkarılan fonksiyonun self-test'i "gerçekten ölçülüyor" diyordu — `return raw` arızasına kördü
```

Üçünü de **yalnızca mutasyon** yakaladı; statik kapıların hiçbiri (`lint` 19/19, `typecheck`
19/19, 957 yeşil test) üçünü de göremedi. **Reçete (yeniden kullanılabilir kural):** bir pin ile
onun kanıtı aynı yardımcıyı paylaşabilir — bağımsız uygulama şart değildir, çünkü "H'nin kopyasını
sınayan test H hakkında sıfır bilgi taşır". Güvenlik bunun yerine **assert gücünden** gelir: (1)
tek uygulama + (2) **tam çıktı** assert'i + (3) **yakın-kaçırma** içeren sentetik veri.
`filterPublicPrefixedLines` bu reçetenin üçünü de taşır ve sağlamdır; `extractWebServerCommandLine`
üçüncü maddeyi (yakın-kaçırma + tam çıktı) taşımadığı için `return raw` arızasına **kör** kaldı ve
bu kusur üçüncü turda düzeltildi (`toContain` → `toBe` + yakın-kaçırma satırı +
`expectSingleLine()` invaryantı).

Ayrıca **çapraz referanslarda satır numarası kullanılmaması** gerektiği bu Task'ta üç kez
bayatlayarak kanıtlandı (dosyaya eklenen her yardımcı diğer referansları kaydırdı) — kural artık
sembol/bölüm adıyla referans vermek.

**Üç bağımsız yakınsama** kayda değer: F1 (spy eksikliği), spy-restore kusuru ve `return raw`
körlüğü — üçünde de bir gate **statik türetti**, diğeri **ölçtü**, aynı sonuca vardılar. Bu,
statik ve dinamik gate'lerin birlikte koşmasının (bu Task'ta `solid` + `security` paralel)
değerini doğrudan doğruluyor.

### Değerlendirilen alternatifler

| Alternatif                                                                 | Neden seçilmedi                                                                                                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dal A (`--continue=always`) ile kardeş görevi ayakta tutmak                | Confound'lu: `apps/api` aynı env şemasını paylaştığı için port 3000'in boş olması turbo'nun teardown'ından mı yoksa `apps/api`'nin bağımsız arızasından mı belirsiz; "sağlıklı kardeş ayakta kalıyor" iddiası bu reçeteyle kanıtlanamaz. |
| `globalTeardown` süreç toplayıcı (katman 3) hemen eklemek                  | Kaldırılabilir kök neden (`am-i-vibing`) katman 1+2 ile kapatıldı (AC3 3/3 temiz); üstüne süreç katili eklemek yanlış-süreç-öldürme riski taşır.             |
| `new Function` ile dinamik import (çalışıyordu)                           | T-010'un saflık pini `eval`/`new Function`'ı yasaklıyor; kaçınılmaz `as` gerektiriyordu.                                                                     |
| `@vite-ignore` ile dinamik import                                         | Vite yorumu yok saydı, modül yine statik çözümlendi.                                                                                                         |
| `storefront-env.ts`'ten şemayı doğrudan re-export etmeye devam etmek      | ES modül semantiği `storefront-env.ts`'in üst seviyesini (eager parse) her import'ta tetikler → `build`'de AC8 ihlal olur.                                   |
| Paket-bazlı `apps/storefront/turbo.json` override'ını bu Task'ta uygulamak | Kapsam dışına taşırdı (CLAUDE.md §4.5 md 1); `devops` bilinçli olarak erteledi, kullanıcı borç olarak kabul etti (T3-1, v0.0.14).                            |
| Çift Redis'i flakiness'in kök nedeni saymak                               | Ölçümle çürütüldü: çift Redis canlıyken `pnpm test` 3 ardışık koşumda 957/957 geçti; yakın sebep artık süreçlerdi.                                           |

## Sonuçlar

### Olumlu

- `pnpm dev` temiz kabukta vitrini (200, `<title>Demo Mağaza</title>`) ve API'yi (`/health/ready`
  200) birlikte kaldırıyor — T-011'in varlık sebebi olan kusur ölçülerek kapandı.
- Env yükleme (dosya → `process.env`) ile geçirme (kabuk → görev, `turbo.json` `env`)
  birbirinden ayrı mekanizmalar olarak belgelendi; bu ayrımın karıştırılması halka 1'in kök
  nedeniydi.
- Playwright'ın artık süreç sorunu kaldırılabilir kök nedeniyle (tetikleyici env değişkenleri)
  kapatıldı; AC3 3/3 temiz, e2e 11/11 × 6 koşum.
- AC8 (build/preview/sync'te `process.env`'e dokunulmaması) altı bağımsız yoldan doğrulandı.
- Kiracı izolasyonu N/A varsayılmadı, ölçüldü: yanlış kiracıya düşme yolu yok.

### Olumsuz ve kabul edilen maliyetler

- Turbo önbellek ödünleşmesi: `lint` 17/19, `typecheck` 11/19 paketin önbelleğini kaçırıyor —
  kullanıcı kararıyla borca indirildi (Karar 7), vade v0.0.14 (paket bazlı `turbo.json`).
- Dal A'nın "sağlıklı kardeş ayakta kalır mı" sorusu confound nedeniyle yanıtsız kaldı — ayrı
  ölçüm gerekiyor, bu Task'ın kapsamı dışında (vade v0.0.9.1 borcu).
- turbo'nun abort teardown'ı (`pnpm dev` yolunda `tsc --watch`/`node --watch`/`vite`'ı öksüz
  bırakması) katman 1+2'nin kapsamadığı ayrı bir artık-süreç kaynağı — borç olarak kaydedildi.
- `storefront-env-schema.ts`, `packages/config/src/env.ts`'in `parseEnv` gövdesinin birebir
  kopyasıdır (bakım borcu, bundle maliyeti yok — `perf` ölçtü: dist/server'ın %0.11'i).
- `storefront-env.ts`'teki korunan `storefrontEnvSchema` re-export'u hâlâ eager-parse'ı
  tetikliyor (salt okuma, `loadEnvFile` yazması yok → AC8'in sır-sızma zinciri kurulmuyor, ama
  dosya yan etkisiz görünüyor) — borç.

### Etkilenen sonraki kararlar

- **v0.0.14 (T3-1):** paket bazlı `apps/storefront/turbo.json` override'ı, env bildirimini
  `lint`/`typecheck`'in `dependsOn` zincirinden izole eder — Karar 7'nin borcunu kapatır.
- **Vitrini bozan ama `apps/api`'yi bozmayan bir env değişkeni ile ayrı ölçüm** doğarsa, Dal A'nın
  confound'u kapanabilir ve Karar 2 yeniden değerlendirilir.
- **`astro dev` + `--port` birlikte geçen PID'leri hedefleyen bir süreç toplayıcı** gerekirse
  Karar 3'ün "katman 3 eklenmedi" tasarımı yeniden değerlendirilir.

## Gözden geçirme koşulları

- Turbo'nun `env` bildirim semantiği bir sürümde değişip `dependsOn` zincirinin kademeli
  geçersizleşmesi ortadan kalkarsa → Karar 7 yeniden değerlendirilir.
- `apps/api`'nin env şeması `apps/storefront`'unkinden ayrışırsa (örn. ayrı bir Zod şeması) →
  Dal A confound'suz tekrar ölçülebilir, Karar 2 güncellenir.
- Astro'nun `am-i-vibing` bağımlılığı kaldırılır veya tetikleyici davranışı değişirse → Karar 3'ün
  katman 1 gerekçesi yeniden değerlendirilir.
- `storefront-env.ts`'in `storefrontEnvSchema` re-export'u bir tüketici kazanırsa → Karar 4'ün
  artık riski (M2 sınıfı) yeniden değerlendirilir.

---

**Not:** Bu ADR üç düzeltme turunun (`solid`/`security`/`qa`) kararlarını da kapsar — gate
raporları: `.claude/workflow/reviews/T-011-{qa,solid,security}-tur{1,2,3}.md`,
`.claude/workflow/reviews/T-011-perf-tur1.md`.
