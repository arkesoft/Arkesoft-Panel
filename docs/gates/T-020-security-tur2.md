# T-020 — `security` gate, TUR 2 (ÇOK DAR — yalnızca düzeltmenin YENİ kodu)

- **Tarih:** 2026-11-15
- **Sürüm:** v0.0.19 (ROADMAP — Test altyapısı: Playwright ve görsel regresyon)
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- **İncelenen commit:** `39e6abd` (`fix(e2e,ci): gate tur 1 …`), 10 dosya /
  864 ekleme / 45 silme
- **Kapsam:** tur 1'in `S-1`/`S-2`/`S-4` düzeltmeleri + bu düzeltmelerin
  dokunduğu dosyaların etkilediği eksenler. **Tüm yüzey yeniden
  denetlenmedi** (Orkestratör kısıtı).

```
GATE: security
SONUÇ: PASS
```

PASS gerekçesi (AGENT_BASELINE §4): `critical` ve `high` bulgu **yok**;
`medium` sayısı **2** (eşik 3).

---

## 1. Tur 1 bulgularının durumu

| Bulgu                 | Durum              | Kanıt                                                                                                                                       |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **S-1** (`high`)      | **KAPANDI**        | (a)+(b) gövdeleri iki dosyada **normalize diff ile BİREBİR**; storefront'un **2/2** `execFileSync` yolu korumalı; (c) artık gerçek bir kapı |
| **S-2** (`medium`)    | **KISMEN KAPANDI** | Pozitif iddia (alt kontrol 3) eklendi ve `scripts/**` kapsama alındı; **ama** alt kontrol 2 yeni bir kaçak doğurdu — **S-7**                |
| **S-4** (`low`)       | **KAPANDI**        | `retries: overrides.retries ?? 0` pinlendi; zincirin bütünü ölçüldü (aşağıda). Artık `projects[].retries` ekseni açık — **S-11** (`low`)    |
| S-3, S-5, S-6 (`low`) | **DEĞİŞMEDİ**      | Düzeltme bu üç dosyaya/eksene dokunmadı (`git show --stat`); teknik borç satırları tur 1'deki hâliyle geçerli                               |

---

## 2. ⭐ ADR-0022 K1'in dört koruması — İKİ FIXTURE YAN YANA

ADR metni (`docs/adr/0022-…md:50-58`, birebir): _"Bu fabrika dört korumayı
**zorunlu** taşır."_

| Koruma                               | `apps/admin/e2e/fixtures/tenant-cleanup.ts`                                                        | `apps/storefront/e2e/fixtures/custom-domain-tenant.ts`                            | Eşdeğer mi?                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| **(a)** fail-closed loopback kapısı  | `:200-220` `assertDockerHostIsLoopback()`; allowlist `:166-170`                                    | `:122-142` `assertDockerHostIsLoopback()`; allowlist `:85-89`                     | **EVET — normalize diff: FARK YOK**         |
| **(b)** `NODE_ENV`/test kapısı       | `:190-197` + yazıcı `apps/admin/playwright.config.ts:53` (`??= 'test'`)                            | `:108-115` + yazıcı `apps/storefront/playwright.config.ts:80` (`??= 'test'`)      | **EVET — normalize diff: FARK YOK**         |
| → (a)+(b) **çağrı kapsaması**        | `:123-124` (resolve), `:223-224` (runSql), `:267-268` (querySqlRows) ⇒ **3/3** `execFileSync` yolu | `:163-164` (resolve), `:217-218` (runSql) ⇒ **2/2** `execFileSync` yolu           | **EVET — %100 / %100**                      |
| **(c)** `e2e-` önekli kapsamlı silme | `:180` e-posta regex, `:187` slug regex, `:318-322`/`:335-339` fail-closed kapı                    | `:101` `E2E_FIXTURE_ID_PATTERN`, `:313-317` fail-closed kapı (**tur 1'de YOKTU**) | **EVET — storefront'unki DAHA DAR**         |
| **(d)** `apps/*/src/**` sızma yasağı | `pnpm guards` 17/17 PASS (bu tur koşturuldu)                                                       | aynı adım + **yeni alt kontrol 3** (pozitif iddia)                                | **EVET** — ama kaçak var (**S-7**, **S-8**) |

**Tur 1'de `(c)` _"PASS (zayıf)"_ idi — şimdi tam PASS.** Ölçüm (regex,
sandbox'ta koşturuldu, depoya dokunulmadı):

```
SİLİNİR    gerçek üretici: soft-deleted      "e2e-soft-deleted-1794759724843-5rwqaq"
SİLİNİR    gerçek üretici: custom-domain     "e2e-custom-domain-1794759724843-tthka4"
REDDEDİLİR seed kiracısı                     "demo-magaza"
REDDEDİLİR gerçek müşteri                    "e2e-danismanlik"
REDDEDİLİR admin e2e slug (kuyruksuz)        "e2e-magaza-1763212345678"
REDDEDİLİR SQL enjeksiyon denemesi           "e2e-x-1763212345678-ab'; DROP TABLE tenant; --"
REDDEDİLİR çıplak joker                      "%"
REDDEDİLİR boş                               ""
```

⇒ Enjeksiyon yüzeyi de kapalı: tırnak taşıyan hiçbir değer `DELETE` yoluna
ulaşamıyor (pattern `[a-z0-9-]`/`[a-z0-9]` sınıflarıyla çapalı).

**Önbellek baypası YOK:** `resolvePostgresContainerName()` sonucu
önbelleğe alıyor, ama `runSql()` **kendi başında** iki assert'i yeniden
çağırıyor ⇒ ikinci ve sonraki SQL çağrıları korumasız kalmıyor (admin
ikizinde de aynı).

---

## 3. Yeni bulgular

| SEV        | dosya:satır                                                         | özet                                                                             | sorumlu ajan |
| ---------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------ |
| **medium** | `scripts/guards.sh:731-750` (alt kontrol 2)                         | Yeni mekanizma-needle'ı `execSync` + şablon dizgi kopyasını **görmüyor**         | devops       |
| **medium** | `…/tenant-cleanup.ts:200-220` + `…/custom-domain-tenant.ts:122-142` | `docker context` ile uzak daemon, (a) kapısını **baypas ediyor** (ölçüldü)       | devops       |
| low        | `scripts/guards.sh:752-771` (alt kontrol 3)                         | Pozitif iddia **ada** bakıyor: gövdesi boş + çağrısız fonksiyon GEÇİYOR          | devops       |
| low        | her iki fixture, `assertDockerHostIsLoopback`                       | `DOCKER_HOST=unix:///…` → `hostname === ''` ⇒ **meşru yerel soket reddediliyor** | devops       |
| low        | `scripts/playwright/base.ts:104`                                    | `retries` pini yalnızca **üst seviyede**; `projects[].retries` onu ezer          | devops       |

---

### S-7 — `[medium]` Alt kontrol 2 yeni bir kaçak doğurdu (eski kapsamın bir kısmı KAYBOLDU)

**Dosya:** `scripts/guards.sh:731-750`

Düzeltme, alt kontrol 2'nin needle'ını düzyazıdan (`docker exec` / `psql`
bitişik metin) mekanizmaya (`'exec'` + `'psql'` tek tırnaklı dizi öğeleri)
**değiştirdi** — ama eskisini **yanında tutmadı**. Düzyazı needle'ları
(`$shellout_needle`/`$psql_needle`) artık **yalnızca alt kontrol 1**'de
(`apps/*/src/**`) kullanılıyor. Sonuç: `e2e/` altında **şablon dizgiyle**
yazılmış bir üçüncü kopya artık **hiçbir** alt kontrol tarafından
görülmüyor — oysa tur 1 öncesi hâli onu **görüyordu**.

**Sandbox ölçümü** (`/tmp/sec2-sbx`, guards'ın alt kontrol 2 kabuk mantığı
**birebir** koşturuldu; depoya DOKUNULMADI):

```ts
// apps/superadmin/e2e/fixtures/third-copy.ts
import { execSync } from 'node:child_process'
execSync(`docker exec ${container} psql -U arkesoft -d arkesoft -c "${sql}"`)
```

```
--- guards alt kontrol 2'nin GÖRDÜĞÜ küme ---
apps/admin/e2e/fixtures/tenant-cleanup.ts
apps/storefront/e2e/fixtures/custom-domain-tenant.ts
--- beklenen küme --- (AYNI)
SONUÇ: KÜMELER EŞİT => guards YEŞİL kalır => üçüncü kopya SESSİZCE doğar (KAÇIŞ)
--- eski (tur 1 öncesi) DÜZYAZI needle'ı bu dosyayı görür müydü? ---
apps/superadmin/e2e/fixtures/third-copy.ts   ← EVET, GÖRÜRDÜ
```

**SÖMÜRÜ SENARYOSU:** ADR-0022'nin zaten planladığı **v0.0.20 `superadmin`
Playwright projesi** kendi fixture'ını `execSync` + şablon dizgiyle yazar
(en kısa yol; `execFileSync`'in dizi biçimi yerine). `pnpm guards` **17/17
yeşil** kalır; dosya (a)/(b)/(c) korumalarından hiçbirini taşımaz ⇒ tur
1'in S-1 sömürü senaryosu (uzak daemon'da tablo-sahibi rolüyle
`INSERT`/`DELETE FROM tenant`) aynen geri döner. **Ek olarak** bu yazım
biçimi `sql`'i **kabuğa** enterpole ettiği için ayrıca komut enjeksiyonu
yüzeyi açar — eski tarama bunu yakalardı, yenisi yakalamıyor.

⚠ `spawnSync`, `const CMD = 'psql'`, `['exec', …]`'in değişkene alınmış hâli
gibi varyantlar **yakalanıyor** (literaller dosyada kalıyor) — ölçüldü;
tek gerçek kaçış ekseni **literalin hiç yazılmadığı** şablon-dizgi/yol
yazımı (`'/usr/local/bin/psql'` dahil). Çift tırnaklı `"exec"` de kaçamaz:
`packages/config/prettier/index.js` `singleQuote: true` ⇒ `format:check`
onu tek tırnağa normalize eder.

**Önerilen düzeltme (tek satır, kapsamı BİRLEŞTİR):** alt kontrol 2'nin iki
needle'ını **birleşim** yap —
`"${exec_array_needle}|${shellout_needle}"` ve
`"${psql_array_needle}|${psql_needle}"`. Böylece hem mekanizma hem düzyazı
taranır; bugünkü iki dosya ikisini de taşıdığı için küme değişmez (yeşil
kalır, teyit edilmeli).

---

### S-8 — `[low]` Pozitif iddia (alt kontrol 3) fonksiyon ADINA bakıyor, ÇAĞRISINA değil

**Dosya:** `scripts/guards.sh:752-771`

Kontrol `grep -q "assertDockerHostIsLoopback"` / `grep -q
"assertTestEnvironment"` — yani **dosyada bu dizgenin geçmesi** yeterli.
`qa`'nın bağımsız mutasyonu (yeniden adlandırma → 16/17 FAIL) doğru ama
**tek eksenli**: yeniden adlandırma tüm geçişleri değiştirdiği için
yakalanıyor.

**Mutasyon ölçümü (sandbox, `/tmp/sec2-sbx/mutant.ts`):** iki fonksiyonun
**gövdeleri boşaltıldı** ve **tüm çağrı noktaları silindi** (kalan çağrı
sayısı: **0**):

```
assertDockerHostIsLoopback -> BULUNDU => alt kontrol 3 PASS
assertTestEnvironment      -> BULUNDU => alt kontrol 3 PASS
```

Ayrıca: fonksiyon tamamen silinip **yalnızca dosya başı yorumundaki** adı
bırakılsa (storefront kopyasında ad zaten `:58`'deki yorumda geçiyor)
kontrol yine **PASS** verir.

**SÖMÜRÜ SENARYOSU (gerçekçi olan):** v0.0.20'de storefront fixture'ına
**üçüncü** bir SQL giriş noktası eklenir (admin'in `querySqlRows`'unun
ikizi gibi) ve yazan kişi iki assert'i çağırmayı unutur. Dosyada adlar
hâlâ geçtiği için alt kontrol 3 **yeşil**; yeni yol `DOCKER_HOST`
kapısından **geçmeden** `docker exec … psql` çalıştırır.

**Önerilen düzeltme:** adı değil **çağrı sayısını** iddia et — ör. dosyadaki
`execFileSync(` sayısı ile `assertDockerHostIsLoopback()` çağrı sayısının
eşitliği, ya da en az "tanım 1 + çağrı ≥ `execFileSync` sayısı" eşiği.

---

### S-9 — `[medium]` `docker context` (a) kapısını baypas ediyor — ADR'nin yazdığı özellik tam zorlanmıyor

**Dosya:** `apps/admin/e2e/fixtures/tenant-cleanup.ts:200-220` **ve**
`apps/storefront/e2e/fixtures/custom-domain-tenant.ts:122-142` (ikisi
birebir aynı).

ADR-0022 K1(a) birebir: _"fail-closed loopback allowlist — **hedef
veritabanı/konteyner loopback değilse** fırlatır"_. Uygulama ise yalnızca
**`DOCKER_HOST` ortam değişkenini** denetliyor. Docker CLI'ın efektif
daemon adresi `DOCKER_HOST` **yoksa** geçerli **context**'ten gelir
(`docker context use …` ya da `DOCKER_CONTEXT` env) — ikisi de kapının
görüş alanı dışında.

**Bu makinede ölçüldü (kanıt):**

```
$ echo "DOCKER_HOST=[${DOCKER_HOST-<TANIMSIZ>}]"
DOCKER_HOST=[<TANIMSIZ>]
$ node -p "process.env.DOCKER_HOST"      → undefined
$ docker context inspect --format '{{.Name}} -> {{.Endpoints.docker.Host}}'
desktop-linux -> unix:///Users/kullanici/.docker/run/docker.sock
$ docker ps --filter publish=5432 --format '{{.Names}}'
arkesoft-postgres
```

⇒ `DOCKER_HOST` **tanımsızken** `assertDockerHostIsLoopback()` erken
`return` ediyor (_"yerel soket ⇒ güvenli"_), oysa hedef daemon'u
belirleyen şey **context**. Bugün o context yerel; **yarın olmayabilir.**

**SÖMÜRÜ SENARYOSU:** geliştirici uzak bir geliştirme makinesi için
`docker context create remote --docker host=tcp://10.0.0.5:2375` +
`docker context use remote` yapar (yaygın kurulum; `DOCKER_HOST`
**ayarlanmaz**). `pnpm --filter @arkesoft/storefront test:e2e` koşar →
`docker ps`/`docker exec` **uzak** daemon'da çözülür → fixture orada
tablo-sahibi rolüyle (RLS baypas) `INSERT INTO tenant (… status='active',
primary_domain=…)` ve `DELETE FROM tenant` yazar. Tur 1'in S-1 sonucunun
**aynısı**, farklı tetikleyiciyle.

**`high` DEĞİL, çünkü:** (i) tur 1'in isim verdiği `DOCKER_HOST` kapısı
artık **iki kopyada da var** ⇒ S-1 kapandı, bu onu yeniden açmıyor;
(ii) tetikleyici saldırgan girdisi değil operatör tarafı yapılandırma;
(iii) bu **düzeltmenin getirdiği bir gerileme değil** — emsal
(`apps/api/.../create-test-app.ts`) ve admin kopyası aynı sınırı
taşıyordu, tur 1 onu PASS yazmıştı. **`low` da değil, çünkü** ADR'nin
birebir yazdığı özellik ("hedef konteyner loopback değilse fırlatır")
somut ve yaygın bir yapılandırmada **zorlanmıyor**.

**Önerilen düzeltme (tek çağrı, ikisini birden kapatır — S-10 dahil):**
`DOCKER_HOST`'u okumak yerine **efektif uç noktayı docker'ın kendisinden**
al: `docker context inspect --format '{{.Endpoints.docker.Host}}'`
(bu komut `DOCKER_HOST` override'ını **da** yansıtır), sonra allowlist'i
uygula: `unix://`/`npipe://` şemaları **güvenli**, `tcp://`/`ssh://` için
hostname `127.0.0.1`/`::1`/`localhost` olmalı; komut başarısızsa fırlat
(fail-closed).

---

### S-10 — `[low]` `DOCKER_HOST=unix:///…` meşru yerel soketi REDDEDİYOR (fail-closed yanlış pozitif)

Her iki kopyada: `new URL('unix:///var/run/docker.sock').hostname` →
`""` (ölçüldü, Node). `""` allowlist'te olmadığı için kapı **fırlatıyor**.

Colima / Rancher Desktop / Podman ve `DOCKER_HOST`'u dışa aktarmış Docker
Desktop kurulumları tam olarak bu değeri ayarlar ⇒ o makinelerde
`test:e2e` **hiç koşamaz**, üstelik hata metni _"yalnızca loopback docker
daemon'a karşı koşabilir"_ diyerek yanıltır. Güvenlik yönü **fail-closed**
(açık değil), bu yüzden `low`; düzeltmesi S-9'unkiyle **aynı satırda**
kapanır.

---

### S-11 — `[low]` `retries: 0` pini yalnızca ÜST SEVİYEDE; `projects[].retries` onu ezer

**Dosya:** `scripts/playwright/base.ts:104`

Pin doğru yazılmış: `...overrides` spread'inden **sonra** geldiği için
`retries: overrides.retries ?? 0` çağıranın üst seviye değerini **ezmez**
ama varsayılanı **açık karara** çevirir. Playwright ise `projects[].retries`
alanını da destekler ve o, üst seviyeyi **proje bazında ezer** — taban
bunu göremez, yorumdaki uyarı da `projects` içine bakan birine görünmez.

**SÖMÜRÜ SENARYOSU:** ileriki bir PR `apps/admin/playwright.config.ts`'in
`projects:` dizisindeki flaky bir projeye `retries: 2` ekler. `base.ts`'in
`retries: 0` pini **el değmeden** kalır, incelemeci "pin yerinde" der;
ama o projede `trace: 'on-first-retry'` ateşlenir ve `set-cookie` /
`Authorization` taşıyan `trace.zip` **PUBLIC** depo artefaktına yüklenir.

**Önerilen düzeltme:** `auth-budget.test.ts` emsalinde bir Vitest değişmezi —
"hiçbir `playwright.config.ts`'in `projects` girdisi `retries` taşımaz" —
ya da `base.ts`'te `projects`'i gezip `retries`'i sıfırlamak.

---

## 4. Zincirin bütünü — `retries`/`trace`/`screenshot` (S-4 teyidi)

Tur 1'in ölçümü bu turda **yeniden ölçüldü** ve hâlâ ayakta:

```
$ grep -rn "retries" --include='*.ts' --include='*.yml' --include='*.json' apps scripts .github packages
scripts/playwright/base.ts:96,98,99,103   → yorum
scripts/playwright/base.ts:104            → retries: overrides.retries ?? 0   ← TEK ayar
.github/workflows/ci.yml:883,956,1176,1194 → --health-retries (Docker servis sağlığı, ilgisiz)

$ grep -rn "screenshot:" --include='*.ts' apps scripts   → SIFIR eşleşme
```

⇒ `retries = 0` (hiçbir çağıran ezmiyor, CI'da `--retries` bayrağı yok) ⇒
`trace: 'on-first-retry'` **hiç ateşlenmiyor** · `screenshot` varsayılanı
`'off'` ⇒ bugün PUBLIC artefakta giden tek şey **başarısızlık videosu** +
HTML rapor (çerez/başlık taşımaz). Kalan tek eksen **S-11**.

---

## 5. Regresyon denetimi (yalnızca düzeltmenin dokunduğu dosyaların etkilediği eksenler)

| Eksen                                                   | Sonuç                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm guards`                                           | **17/17 PASS** (bu turda koşturuldu; adım sayısı korunmuş, K1(d) adımı pozitif iddia metnini basıyor)                                                                                                                         |
| `apps/storefront` Vitest (P6/P8 `webServer` pini dahil) | **126/126 PASS, 15 dosya** — `env NODE_ENV=development` **dış** sarmalayıcısı `env-contract.test.ts`'in alt dizge pinini **bozmadı**                                                                                          |
| `astro dev` çocuğu gerçekten ayağa kalkıyor mu          | **EVET** — yeni komut birebir koşturuldu, **2.2 sn**'de 200/503 yanıtı verdi (süreç sonra SIGTERM ile kapatıldı; port 4321 boş bırakıldı)                                                                                     |
| `NODE_ENV` sızıntısı (dev sunucusuna `test` kaçıyor mu) | **HAYIR** — dış `env NODE_ENV=development`, iç `env -u CLAUDECODE …` öneki **değişmeden** sarmalıyor; ikisi çarpışmıyor                                                                                                       |
| Oran sınırlama (`auth-budget.test.ts` değişikliği)      | **GÜÇLENDİ** — çarpan değişmezi artık `e2e/visual/**`'i de tarıyor; `listFilesIfExists` dizin yokken `[]` dönüyor (vacuous, **fail-open değil**: dizin açılırsa otomatik taranır)                                             |
| `.github/workflows/ci.yml` değişikliği                  | **Yalnızca bir `echo` metni** (`20` → `5` Redis işçisi); `permissions:`, tetikleyici, `secrets.*`, `${{ }}` kullanımı **dokunulmadı** ⇒ tur 1'in temiz eksenleri etkilenmedi                                                  |
| `storefront-templates.visual.spec.ts` değişikliği       | **Yalnızca yorum** (uydurulmuş CLAUDE.md atfı kaldırıldı) — davranış yok                                                                                                                                                      |
| Sır sızıntısı / yeni bağımlılık                         | Commit **`package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml`'a DOKUNMADI** (grep: sıfır eşleşme); eklenen kodda parola/token/anahtar yok — yeni dizgelerin tamamı Türkçe yorum, hata metni ve `127.0.0.1`/`::1`/`localhost` |
| CLAUDE.md §7 (14 madde)                                 | **ATEŞLENMİYOR** — commit'te `packages/db`, `packages/trpc`, `apps/api` **sıfır dosya**; yeni tablo/kolon/indeks/prosedür/kuyruk işi yok (tur 1 ile aynı)                                                                     |
| Çalışma ağacı                                           | `git diff --stat` **BOŞ**; `git status --porcelain` yalnızca **başka gate'lerin** rapor dosyalarını (`perf`/`qa`/`wcag` tur 1) gösteriyor. Tüm mutasyonlarım `/tmp/sec2-sbx` altında yapıldı, depoya **dokunulmadı**          |

---

## 6. ÖLÇÜMLER

- **`pnpm audit`:** critical **0** · high **1** (multer) · moderate **3**
  (minimatch, astro, @astrojs/node) · low **1** (astro) — tur 1 ile
  **birebir aynı**; düzeltme manifest/lock'a dokunmadı ⇒ yeni açık
  girmesi yapısal olarak imkânsız.
- **`pnpm guards`:** **17/17 PASS**.
- **`pnpm --filter @arkesoft/storefront test`:** **126/126 PASS** (15 dosya,
  510 ms).
- **İncelenen dosya sayısı:** **9** (commit'in 10 dosyasından; kendi tur 1
  raporum `docs/gates/T-020-security-tur1.md` sayılmadı). Ek olarak
  karşılaştırma için 2 referans dosya okundu (`apps/admin/.../tenant-
cleanup.ts`, `docs/adr/0022-….md`).
- **Tenant izolasyon listesinden karşılanmayan madde numaraları:** **yok**
  (liste bu değişiklik için ateşlenmiyor). Muadil kontrol **ADR-0022 K1'in
  dört koruması**: **(a)-(d) dördü de iki fixture'da MEVCUT** — tur 1'in
  karşılanmayan **(a)** ve **(b)** maddeleri **kapandı**. Kalan: (a)'nın
  **kapsamı** eksik (S-9), (d)'nin **mekanik taraması** eksik (S-7, S-8).
- **Ölçümün koşulları (AGENT_BASELINE §4 ders 2):** geliştirme makinesi,
  Docker Desktop (`desktop-linux` context), `arkesoft-postgres` ayakta,
  port **3000 kullanıcının `demo-site` projesinde** (DOKUNULMADI),
  `[::1]:4322`'de başkasına ait bir görsel sunucu dinliyor, **`solid`
  gate'i paralel koşuyor**. `pnpm guards` ve storefront Vitest tek başına
  koşturuldu. **Admin `test:e2e` KOŞTURULMADI** (`EMAIL_IP_LIMIT` kısıtı).

### DOĞRULANAMADI

| Ne                                                          | Neden                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @arkesoft/storefront test:e2e` (uçtan uca)   | **Ortam ön koşulu karşılanmıyor:** `.env.example:153` `STOREFRONT_API_BASE_URL=http://127.0.0.1:3000`, ama **port 3000'i kullanıcının `demo-site` projesi tutuyor** (dokunma kısıtı). Dev sunucusu 2.2 sn'de ayağa kalkıyor ama `/` **503** dönüyor ⇒ `webServer.url` probe'u 30 sn'de timeout veriyor. ⚠ Bu **düzeltmenin değil ortamın** sonucu: devops ve qa 15/15 yeşil ölçtü |
| (b) kapısının Playwright **worker** süreçlerinde de geçtiği | Yukarıdaki nedenle uçtan uca koşturulamadı. Kanıt **statik + emsal**: admin ikizi aynı deseni v0.0.19 boyunca kullanıyor ve devops'un commit'i storefront e2e 15/15 raporluyor                                                                                                                                                                                                    |
| S-9'un uçtan uca koşturulması (`docker context use remote`) | Kullanıcının Docker context'ini değiştirmek **ortamı bozar** (25 konteyner + `demo-site`). Kanıt **ölçülmüş dolaylı**: `DOCKER_HOST` tanımsızken `docker ps`'in **context üzerinden** çözüldüğü bu makinede birebir gösterildi                                                                                                                                                    |
| S-7/S-8'in gerçek depoda mutasyonla kanıtlanması            | Depoya üçüncü dosya yazmak / fixture'ı bozmak gate ajanı yasağı. Yerine **`/tmp/sec2-sbx`**'te guards'ın birebir kabuk mantığı ve `grep -q` mantığı koşturuldu; `git diff --stat` **boş** (yukarıda)                                                                                                                                                                              |

---

## 7. Teknik borç satırları (docs kopyalayabilsin diye)

```
[medium] scripts/guards.sh:731-750 — ADR-0022 K1(d) alt kontrol 2 yalnızca
execFileSync dizi literallerini arıyor; execSync + şablon dizgi ile yazılmış
üçüncü bir fixture kopyası hiçbir alt kontrolde görünmüyor (sandbox'ta
ölçüldü). Düzeltme: needle'ları mekanizma ∪ düzyazı olarak birleştir —
sorumlu: devops — vade önerisi: v0.0.20 (superadmin e2e projesinden ÖNCE)

[medium] apps/admin/e2e/fixtures/tenant-cleanup.ts:200-220 +
apps/storefront/e2e/fixtures/custom-domain-tenant.ts:122-142 — (a) kapısı
yalnızca DOCKER_HOST'u okuyor; `docker context use <uzak>` (DOCKER_HOST
tanımsız) kapıyı baypas ediyor ve ADR K1(a)'nın "hedef konteyner loopback
değilse fırlatır" şartı zorlanmıyor. Düzeltme: efektif uç noktayı
`docker context inspect --format '{{.Endpoints.docker.Host}}'` ile al —
sorumlu: devops — vade önerisi: v0.0.20

[low] scripts/guards.sh:752-771 — pozitif iddia yalnızca fonksiyon ADININ
dosyada geçmesine bakıyor; gövdesi boşaltılmış + çağrısız fonksiyon PASS
veriyor. Düzeltme: çağrı sayısını execFileSync sayısıyla karşılaştır —
sorumlu: devops — vade önerisi: v0.0.21

[low] apps/*/e2e/fixtures/* — DOCKER_HOST=unix:///… (colima/podman/Docker
Desktop) hostname='' üretiyor ve meşru yerel soket REDDEDİLİYOR
(fail-closed yanlış pozitif; e2e o makinelerde hiç koşamaz) —
sorumlu: devops — vade önerisi: v0.0.20 (yukarıdaki medium ile aynı satır)

[low] scripts/playwright/base.ts:104 — retries pini yalnızca üst seviyede;
projects[].retries onu proje bazında ezer ve PUBLIC artefakta trace.zip
(oturum çerezi + Authorization) yükler. Düzeltme: Vitest değişmezi ile
"hiçbir projects girdisi retries taşımaz" — sorumlu: devops —
vade önerisi: v0.0.21
```

Tur 1'in kalan `low`'ları: **S-3** (konteyner kimliği doğrulanmıyor),
**S-5** (`run-visual.sh:201` `node -p` enterpolasyonu) ve **S-6** (`pnpm
audit` borcu + geçmiş vade) **aynen açık** — düzeltme bu üç dosyaya/eksene
dokunmadı, tur 1'deki borç satırları geçerli.
