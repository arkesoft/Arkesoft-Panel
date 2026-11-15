# T-020 — `security` gate, TUR 1

- **Tarih:** 2026-11-15
- **Sürüm:** v0.0.19 (ROADMAP — Test altyapısı: Playwright ve görsel regresyon)
- **Dal:** `feat/v0.0.19-test-altyapisi` (PR #5), taban
  `origin/feat/v0.0.21-surum-kayit-modeli`
- **HEAD:** `030d9f470085edb29e27e0a2fe88a7ca915e6651` (8 commit)

```
GATE: security
SONUÇ: FAIL
```

FAIL gerekçesi (AGENT_BASELINE §4): en az bir `high` bulgu var (**S-1**).

---

## 1. Bulgular

| SEV        | dosya:satır                                                                 | bulgu                                                                                  | sorumlu ajan |
| ---------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------ |
| **high**   | `apps/storefront/e2e/fixtures/custom-domain-tenant.ts:75-117,130-161`       | ADR-0022 K1'in **zorunlu** (a) loopback allowlist ve (b) test-ortamı kapısı **YOK**    | devops       |
| **medium** | `scripts/guards.sh` → `check_adr22_k1d_shellout_boundary` (alt kontrol 2)   | Allowlist **mekanizmayı değil düzyazıyı** eşliyor — üçüncü kopya sessizce doğabilir    | devops       |
| low        | `apps/admin/e2e/fixtures/tenant-cleanup.ts:119-163` + storefront ikizi      | Konteyner **yalnızca host portundan** çözülüyor; kimlik doğrulaması yok                | devops       |
| low        | `scripts/playwright/base.ts:100-101` + `.github/workflows/ci.yml:1418-1426` | Depo **PUBLIC**; R-9 azaltması `retries` ayarsızlığına **tesadüfen** bağlı             | devops       |
| low        | `scripts/run-visual.sh:201`                                                 | Ortam değişkeni bir `node -p` programına **string olarak enterpole** ediliyor (CWE-94) | devops       |
| low        | `pnpm audit` (depo geneli)                                                  | 1 high (multer) + 3 moderate + 1 low — **bu değişiklikle gelmedi**, vadesi geçmiş borç | docs         |

---

### S-1 — `[high]` E2E fabrikasının storefront kopyası dört korumanın İKİSİNİ taşımıyor

**Dosya:** `apps/storefront/e2e/fixtures/custom-domain-tenant.ts`
(`resolvePostgresContainerName` :75-117, `runSql` :130-161)

**Ölçüm (birebir komut çıktısı):**

```
$ grep -nE "assertTestEnvironment|assertDockerHostIsLoopback|DOCKER_HOST|NODE_ENV|loopback" \
    apps/storefront/e2e/fixtures/custom-domain-tenant.ts
(sıfır eşleşme — yalnızca 195. satırdaki ilgisiz "127.0.0.1" yorumu)

$ grep -n "NODE_ENV" apps/storefront/playwright.config.ts
(SIFIR EŞLEŞME)
```

Kardeş dosya `apps/admin/e2e/fixtures/tenant-cleanup.ts` **ikisini de taşıyor**
(`assertDockerHostIsLoopback` :200-220, `assertTestEnvironment` :190-197; her SQL
yolunun başında çağrılıyor: :123-124, :223-224, :267-268) ve `NODE_ENV`'i
`apps/admin/playwright.config.ts:53`'te `??= 'test'` ile sabitliyor.
ADR-0022 Karar 1 fabrikayı `apps/<app>/e2e/fixtures/**` olarak tanımlıyor ve
"**Bu fabrika dört korumayı zorunlu taşır**" diyor — iki dosyadan biri için bu
şart **karşılanmıyor**. Üstelik bu dosya bu sürümde **değiştirildi** (S9a,
`8d70e82`): dinamik konteyner çözümü eklenirken (a)/(b) eklenmedi.

**SÖMÜRÜ SENARYOSU (somut girdi → sonuç):**
Geliştirici veya koşucu `DOCKER_HOST=tcp://10.0.0.5:2375` ile çalışıyor (uzak
docker daemon / `docker context` — yaygın bir kurulum). `pnpm --filter
@arkesoft/storefront test:e2e` koşuyor:

1. `docker ps --filter publish=5432` **UZAKTAKİ** daemon'da çalışır, oradaki
   Postgres konteynerinin adını döner (yerel allowlist kapısı olmadığı için
   hiçbir şey durdurmaz).
2. `createCustomDomainTenantFixture()` →
   `docker exec <uzak-pg> psql -U arkesoft -d arkesoft -c "INSERT INTO tenant
(id, slug, name, status, primary_domain) VALUES (…, 'active',
'<çağıranın seçtiği host>');"` — **tablo sahibi rolüyle, RLS devre dışı**.
   Ortaya `status='active'` ve çağıranın seçtiği `primary_domain` taşıyan bir
   kiracı satırı çıkar; `resolveHost`'un `custom-domain` dalı o host'u artık bu
   kiracıya çözer (host→kiracı yönlendirme primitifi).
3. `deleteTenantFixture()` aynı yolla `DELETE FROM tenant WHERE id = …` yazar —
   uzak veritabanında **veri kaybı** yolu.

Ortak/staging bir veritabanına işaret eden bir `DOCKER_HOST` bu akışı bir kiracı
oluşturma + yönlendirme manipülasyonu aracına çevirir. `apps/admin` kopyası tam
olarak bu sınıfı kapatıyor; `apps/storefront` kopyası kapatmıyor ve **hiçbir
mekanik kapı bu asimetriyi görmüyor** (guards K1(d) yalnızca jeton sınırını
denetler, (a)/(b)'nin varlığını denetlemez — bkz. S-2).

**`critical` DEĞİL, çünkü:** tetikleyici saldırgan girdisi değil, operatör tarafı
yanlış yapılandırma; ürün yüzeyinde kiracıdan kiracıya veri sızması yok.
**`high`, çünkü:** ADR'nin açıkça "zorunlu" dediği fail-closed bir kontrol,
ayrıcalıklı ve RLS baypas eden bir yazma yolunda **yok** (kabul kriterini
karşılamama).

**Önerilen düzeltme:**

1. `assertDockerHostIsLoopback()` + `assertTestEnvironment()` fonksiyonlarını
   storefront kopyasına **birebir** taşı ve `resolvePostgresContainerName` ile
   `runSql`'in başında çağır (admin kopyasındaki çağrı noktalarıyla aynı).
2. `apps/storefront/playwright.config.ts`'e `process.env['NODE_ENV'] ??= 'test'`
   ekle (`apps/admin/playwright.config.ts:53` emsali).
3. ⚠ Aynı anda `webServer.command`'daki `astro dev` çocuğunu `NODE_ENV=
development`'a geri pinle — admin'in `env NODE_ENV=development vite …`
   deseni (`apps/admin/playwright.config.ts:137`); mevcut `env -u CLAUDECODE …`
   önekine eklenir. Aksi hâlde `NODE_ENV=test` dev sunucusuna sızar.

---

### S-2 — `[medium]` K1(d) allowlist'i mekanizmayı değil düzyazıyı eşliyor

**Dosya:** `scripts/guards.sh` → `check_adr22_k1d_shellout_boundary`, **alt
kontrol 2** ("`docker exec`+`psql` kullanan dosya kümesi TAM OLARAK bu ikisi").

**Ölçüm — depodaki her literal `docker exec` geçişi yorum ya da teşhis metni:**

```
$ grep -n "docker exec" apps/admin/e2e/fixtures/tenant-cleanup.ts \
                        apps/storefront/e2e/fixtures/custom-domain-tenant.ts
… :13 :36 :43 :67 :69 :79 :86 :89   → Türkçe yorum
… :253 :298 :155                     → `Denenen komut: …` hata mesajı
```

Gerçek mekanizma `execFileSync('docker', ['exec', …, 'psql', …])` — bu çağrıda
`docker exec` **bitişik hiç geçmiyor**. Yani tarama, korumak istediği şeyin
yanındaki **açıklama metnini** eşliyor.

**Sandbox kanıtı (`/tmp`'de, depoya DOKUNULMADI):** mekanizması birebir aynı,
yorumunda `docker exec` ifadesi bitişik geçmeyen üçüncü bir kopya
(`apps/superadmin/e2e/fixtures/third-copy.ts`, gövdesinde
`runSql('DELETE FROM tenant;')`) oluşturup alt kontrol 2'nin **birebir** kabuk
mantığını koşturdum:

```
--- 'docker exec'+'psql' TAŞIYAN dosya kümesi (guards'ın gördüğü) ---
[]
--- ÜÇÜNCÜ KOPYA DİSKTE VAR MI ---
third-copy.ts
SONUÇ: küme BOŞ => guards sapma GÖRMEZ => üçüncü kopya SESSİZCE doğar.
```

Gerçek depoda bu kopya eklendiğinde `actual_files` yine **tam olarak** beklenen
iki dosya kalır (ikisi düzyazıda jetonu taşıyor), `diff` farkı üretmez, `pnpm
guards` **yeşil** kalır.

**SÖMÜRÜ SENARYOSU:** ADR-0022'nin "Etkilenen sonraki kararlar" bölümünde zaten
planlanmış olan **v0.0.20 `superadmin` Playwright projesi**, kendi e2e
fixture'ını yazarken aynı `execFileSync('docker', ['exec', …, 'psql', …])`
desenini kopyalar ve (a)/(b)/(c) korumalarından hiçbirini taşımaz. `pnpm guards`
17/17 yeşil kalır; po'nun bağlayıcı "üçüncü kopya SESSİZCE doğamaz" şartı
**gerçekte zorlanmamış** olur. S-1 bu sınıfın bugün **zaten gerçekleşmiş**
örneğidir (iki kopyadan biri korumasız ve hiçbir kapı bunu görmüyor).

**Önerilen düzeltme:** alt kontrol 2'yi **mekanizmaya** bağla — ör. `'psql'`
argüman literalini (`['exec'` dizi öğesiyle birlikte) veya `child_process`
import'u + `'psql'` birlikteliğini ara; ek olarak **pozitif** bir iddia koy: her
allowlist dosyası `assertDockerHostIsLoopback` ve `assertTestEnvironment`
adlarının **ikisini de** içermeli (bu tek değişiklik S-1'i de mekanikleştirir).

---

### S-3 — `[low]` Konteyner yalnızca host portundan çözülüyor, kimliği doğrulanmıyor

**Dosya:** `apps/admin/e2e/fixtures/tenant-cleanup.ts:119-163` ve
`apps/storefront/e2e/fixtures/custom-domain-tenant.ts:75-117`.

S9a'nın iddiası (_"yanlış konteynere yazma riskini Docker'ın port çakışma
koruması engelliyor"_) **kısmen doğrulandı, kısmen çürütüldü.**

**Ölçüm (geliştirme makinesi, 25 çalışan konteyner):**

```
$ docker ps --filter publish=5432 --format '{{.Names}}\t{{.Image}}\t{{.Ports}}'
arkesoft-postgres  postgres:17.11-alpine  0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp
```

Makinede **ikinci bir Postgres var** (`cnc_proje-postgres-1`,
`0.0.0.0:55432->5432/tcp`) ve `publish=5432` filtresi onu **doğru biçimde
dışlıyor** ⇒ dosya yorumundaki "`expose` yanlış pozitif verir, `publish`
doğru ayırt eder" ölçümü **doğrulandı**.

**Doğrulanan taraf:** Docker'ın bind çakışması iki konteynerin aynı anda host
5432'yi yayınlamasını engeller ⇒ "birden fazla eşleşme → fail-closed" dalı
pratikte **ulaşılamaz** (belirsizlik riski yok).
**Çürütülen taraf:** bu koruma, **tek bir yabancı konteynerin** 5432'yi sahiplendiği
durumu kapsamaz. `arkesoft-postgres` kapalıyken başka bir projenin Postgres'i
5432'de ayaktaysa, `docker ps` **tek** eşleşme döner ve fabrika o veritabanına
yazar/siler — çözümden sonra **hiçbir kimlik doğrulaması yok** (imaj, etiket,
şema işaretçisi kontrol edilmiyor).

**SÖMÜRÜ SENARYOSU:** geliştirici `pnpm infra:down` sonrası başka bir Arkesoft
çalışma kopyasının (worktree) Postgres'ini 5432'de ayağa kaldırır; `pnpm --filter
@arkesoft/admin test:e2e` koşar; `globalTeardown` → `sweepOrphanedE2eFixtures()`
o **diğer** veritabanında `DELETE FROM app_user …` / `DELETE FROM tenant …`
koşturur. Yıkım yarıçapı (c)'nin regex'leriyle sınırlı ve hedef şemada `tenant`/
`app_user` yoksa `ON_ERROR_STOP=1` gürültülü hata verir ⇒ **`low`**.

**Önerilen düzeltme:** çözümden sonra kimliği doğrula — `docker inspect
--format '{{.Config.Image}}'` ile `postgres:` öneki, ya da bir kerelik
`SELECT 1 FROM _prisma_migrations LIMIT 1` işaretçi sorgusu (ikisi de
fail-closed).

---

### S-4 — `[low]` Depo PUBLIC; R-9 azaltması `retries` ayarsızlığına tesadüfen bağlı

**Ölçüm:**

```
$ gh repo view --json name,visibility,isPrivate,owner
{"isPrivate":false,"name":"Arkesoft-Panel","owner":{"login":"arkesoft"},"visibility":"PUBLIC"}
```

Public depolarda Actions artefaktları **herkes tarafından indirilebilir**.
`.github/workflows/ci.yml:1418-1426` `if: always()` ile `apps/*/test-results` +
`apps/*/playwright-report` yüklüyor (`retention-days: 7`).

**R-9 azaltma zinciri — gerçekte YERİNDE, ama beklenenden farklı sebeple:**
`scripts/playwright/base.ts:100-101` `trace: 'on-first-retry'` +
`video: 'retain-on-failure'` veriyor. Ancak **hiçbir yapılandırma `retries`
ayarlamıyor** (ölçüldü: `apps/admin/playwright.config.ts`,
`apps/storefront/playwright.config.ts`, `scripts/playwright/base.ts` — sıfır
eşleşme) ⇒ Playwright varsayılanı `retries: 0` ⇒ **`on-first-retry` hiçbir zaman
trace üretmez**. `screenshot` de ayarlanmamış ⇒ Playwright varsayılanı `'off'`.
Yani bugün yüklenen artefakt yalnızca **başarısızlık videosu** (çerez/başlık
taşımaz) ve HTML rapor. ⇒ R-9'un tarif ettiği çerez/`Authorization` sızıntısı
**bugün gerçekleşmiyor**; `if: always()` yeşil koşumda da adımı çalıştırıyor ama
yüklenecek trace/screenshot **yok**.

**SÖMÜRÜ SENARYOSU:** ileriki bir PR tek satırlık, zararsız görünen bir
`retries: 2` ekler (CI'da çok yaygın). O andan itibaren başarısız bir e2e
koşumu, `set-cookie`/`Authorization` başlıklarını ve `FIXTURE_PASSWORD` içeren
tam sign-up gövdelerini taşıyan `trace.zip`'i **public, giriş gerektirmeyen** bir
artefakta yükler. Sızan kimlik bilgileri efemer CI fixture'ları ve yok edilmiş
bir runner'ın `localhost:3000`'ine bağlı olduğu için saldırgan için değeri
**sıfıra yakın** ⇒ `low`, `high` değil.

**Önerilen düzeltme:** `scripts/playwright/base.ts`'te `retries`'i R-9
gerekçesiyle **açıkça** `0`'a pinle (`overrides.retries ?? 0`), ya da retry
isteniyorsa yükleme adımına `!**/trace.zip` hariç tutma deseni ekle. `docs/
testing.md`'nin R-9 notuna deponun **public** olduğu gerçeği yazılsın — bugün
yazılı değil.

---

### S-5 — `[low]` `node -p` programına ortam değişkeni string olarak enterpole ediliyor

**Dosya:** `scripts/run-visual.sh:201`

```bash
API_PORT_FOR_VISUAL="$(node -p "new URL('$STOREFRONT_API_BASE_URL_FOR_VISUAL').port || 80")"
```

`STOREFRONT_API_BASE_URL_FOR_VISUAL` (`:191`, kaynağı
`STOREFRONT_API_BASE_URL_OVERRIDE`) içinde tek tırnak varsa JS string literali
kapanır ve kalan metin `node -p` tarafından **çalıştırılır** (CWE-94).

**SÖMÜRÜ SENARYOSU — ve sınırı (dürüst):** bugün bu değeri yalnızca
`ci.yml:1410` (literal) ya da `pnpm test:visual`'ı koşturan kişi ayarlıyor;
`turbo.json`'ın `passThroughEnv`'i sadece iletiyor. Yani **bugün ayrıcalık
yükseltmesi YOK** — değeri ayarlayabilen zaten kabuğa sahip. Somut tetikleyici
yalnızca değerin daha az güvenilen bir kaynaktan gelmeye başladığı anda doğar
(`.envrc`/direnv ile paylaşılan bir geliştirme profili, ya da ileride bir CI
matris girdisi). Bu yüzden `low` ve "latent desen" olarak kaydediliyor.

**Önerilen düzeltme:** değeri program metnine gömme, argv/env ile geçir:
`node -p "new URL(process.argv[1]).port || 80" "$STOREFRONT_API_BASE_URL_FOR_VISUAL"`.

---

### S-6 — `[low]` `pnpm audit`: 1 high + 3 moderate + 1 low (bu değişiklikle GELMEDİ)

```
high     | multer       | DoS via pending async fileFilter | >=2.0.0 <2.5.0 -> >=2.5.0
moderate | minimatch    | globparts amplification DoS      | >=7.0.0 <11.0.1 -> >=11.0.1
moderate | astro        | @astrojs/node image endpoint path read | >=5.14.3 <=7.4.6 -> >=7.4.7
moderate | @astrojs/node| (aynı advisory)                  | <=11.1.11 -> >=11.1.12
low      | astro        | XSS via attribute injection in dynamic tag names | <=7.4.4 -> >=7.4.5
META {"info":0,"low":1,"moderate":3,"high":1,"critical":0}
```

**Bu değişiklik hiçbirini getirmedi** (doğrulandı): tek manifest değişikliği kök
`devDependencies["@playwright/test"]: "catalog:"` ve catalog zaten `1.64.1`'e
pinliydi; `pnpm-lock.yaml` diff'i **3 satır** (yalnızca bir importer girdisi,
yeni paket girdisi yok). ⇒ "yeni ana bağımlılık YOK" iddiası **doğrulandı**.

⚠ `multer` borcu `.github/ci-forbidden-tokens.txt:16`'da `v0.0.16` vadesiyle
kayıtlı — **vade geçmiş** (bugün v0.0.19/v0.0.21) ve `pnpm audit` hâlâ CI'da
yasak jeton olduğu için hiçbir mekanizma bunu yüzeye çıkarmıyor. Bu sürümün
kapsamı dışı; ROADMAP teknik borç satırı olarak `docs`'a devrediliyor.

**Teknik borç satırı (docs kopyalayabilsin diye):**
`[low] .github/ci-forbidden-tokens.txt:16 — multer GHSA (high) ve 3 moderate
advisory açık; "pnpm audit → v0.0.16" vadesi geçmiş, yeni vade atanmalı —
sorumlu: devops — vade önerisi: v0.0.22`

---

## 2. ADR-0022 Karar 1 — dört zorunlu koruma, dosya bazında

| Koruma                                 | `apps/admin/e2e/fixtures/tenant-cleanup.ts`                                                                          | `apps/storefront/e2e/fixtures/custom-domain-tenant.ts`                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **(a)** fail-closed loopback allowlist | **PASS** — `:166-170` allowlist, `:200-220` `assertDockerHostIsLoopback()`; çağrı: `:124`, `:224`, `:268`            | **FAIL** — sıfır eşleşme (S-1)                                                                                                            |
| **(b)** `NODE_ENV`/test ortamı kapısı  | **PASS** — `:190-197` + `apps/admin/playwright.config.ts:53` (`??= 'test'`), çocuk süreç `development`'a pinli       | **FAIL** — ne fixture'da ne `playwright.config.ts`'te (S-1)                                                                               |
| **(c)** `e2e-` önekli KAPSAMLI silme   | **PASS** — `:180` e-posta regex, `:187` slug regex, `:318-322`/`:335-339` fail-closed kapı; SQL `~` + JS çift katman | **PASS (zayıf)** — çıplak silme yok (`WHERE id = <kendi ürettiği id>`), ama **biçim kapısı yok**; güvenlik self-generated id'ye dayanıyor |
| **(d)** `apps/*/src/**`'e sızma yasağı | **PASS** — `pnpm guards` adımı yeşil (ölçüldü)                                                                       | **PASS** — aynı adım; ⚠ allowlist mekanizmayı değil düzyazıyı eşliyor (S-2)                                                               |

**Emsalle karşılaştırma** (`apps/api/src/__tests__/helpers/create-test-app.ts:380-408`):
admin kopyası allowlist kümesini (`127.0.0.1`/`::1`/`localhost`), `new URL(...)
.hostname` çözümünü, ayrıştırma hatasında fail-closed fırlatmayı ve
tanımsız/boş değerde "yerel soket ⇒ güvenli" dalını **birebir** taşıyor —
emsalle uyumlu. Storefront kopyası emsalin **hiçbir ayağını** taşımıyor.

### (c)'nin sınırının gerçekten dar olduğu — ÖLÇÜLDÜ

`E2E_FIXTURE_EMAIL_PATTERN` ve `E2E_FIXTURE_TENANT_SLUG_PATTERN` temsilî
kimliklere karşı koşturuldu:

```
kapsam dışı  seed yöneticisi                    demo-yonetici@arkesoft.test
kapsam dışı  apps/api vitest (12 char uuid)     s5-a1b2c3d4-e5f@arkesoft.test
kapsam dışı  apps/api vitest (TÜM RAKAM uuid)   s5-12345678-901@arkesoft.test
kapsam dışı  apps/api neg-seed                  neg-seed-3-a1b2c3d4@arkesoft.test
kapsam dışı  apps/api perf2                     perf2-12345678-9@arkesoft.test
kapsam dışı  apps/api sabit                     user@arkesoft.test
SİLİNİR      admin e2e panel-flow               e2e-1763212345678-k3j9x2mq@arkesoft.test
SİLİNİR      admin e2e med2                     med2-sessions-1763212345678-ab12cd@arkesoft.test
---slug---
kapsam dışı  seed demo tenant                   demo-magaza
SİLİNİR      admin e2e tenant                   e2e-magaza-1763212345678
kapsam dışı  storefront fixture                 e2e-soft-deleted-…-x9k2mq
kapsam dışı  gerçek müşteri                     e2e-danismanlik
```

⇒ **S5'in iddiası doğrulandı.** Seed'in `demo-yonetici@arkesoft.test`'i kapsam
**dışında**. `apps/api`'nin Vitest fixture'ları da kapsam **dışında** ve bu
yapısal: format `${prefix}-${randomUUID().slice(0,12)}@arkesoft.test`, UUID
hex'i 8. karakterde `-` ile bölündüğü için **≥10 haneli kesintisiz rakam dizisi
üretmesi imkânsız**; regex'in `\d{10,}` segmenti bu yüzden ancak `Date.now()`
(13 hane) üreticileriyle eşleşiyor. "56.785 → 471" daralmasının sınırı gerçekten
dar.

---

## 3. Temiz çıkan eksenler (ölçümle)

| Eksen                                                     | Sonuç                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CLAUDE.md §7 — 14 madde**                               | **ATEŞLENMİYOR** (doğrulandı): `git diff --stat` içinde `packages/db`, `packages/trpc`, `apps/api` **sıfır dosya**; yeni tablo/kolon/indeks/prosedür/kuyruk işi yok; `createTenantIsolationSuite()` değişmedi                                                                                                                                          |
| §7 "dış kaynak kapsamlandırması" (kendi değerlendirmem)   | Yeni Meilisearch indeksi / S3 öneki / önbellek anahtarı yok; görsel PNG referansları tema demosuna ait, kiracı verisi taşımıyor                                                                                                                                                                                                                        |
| §7 "bağımlı/türetilmiş DB nesnesi" (kendi değerlendirmem) | Yeni DB nesnesi yok. Ama e2e fabrikası **ayrıcalıklı, RLS baypas eden bir yazma yolu** — §7'nin muadili kontrol ADR-0022 K1'in dört koruması; **2/4 eksik** (S-1)                                                                                                                                                                                      |
| İş akışı izinleri                                         | `permissions: contents: read` **yalnızca** iş akışı seviyesinde (`ci.yml:16`); **hiçbir job seviyesi `permissions:` yok** (grep: sıfır eşleşme) ⇒ `e2e` job'u izin YÜKSELTMİYOR                                                                                                                                                                        |
| Fork PR tetikleyicisi                                     | `pull_request_target` **yok** (KALICI yasak jeton; AC13 adımı yeşil). Tetikleyici `pull_request:` + `push: branches:[main]`; `e2e` job'u hiçbir `secrets.*` okumuyor                                                                                                                                                                                   |
| `vars.ARKESOFT_E2E_SYNTHETIC_LOAD`                        | **YALNIZCA `if:` içinde** (`ci.yml:1318`, tek kullanım — grep ile doğrulandı); `run:` bloğunda `${{ }}` yok ⇒ şablon enjeksiyonu yüzeyi yok. Yük adımının `docker exec arkesoft-ci-redis redis-cli SET/GET` komutları **sabit konteyner adı + `seq` sayacı** kullanıyor, dışarıdan gelen hiçbir değer argümana girmiyor ⇒ komut enjeksiyonu yüzeyi yok |
| `ci-forbidden-tokens.txt` silinen iki jeton               | `test:e2e` ve `playwright` **GEÇİCİ KAPSAM BOŞLUĞU** bölümünden silindi (`:119-131`), `# >>> PERMANENT`/`# <<< PERMANENT` bloğu (7 satır) **bit birebir değişmedi** ve `ci-forbidden-tokens-permanent.txt` ile **aynı sırada aynı içerik** ⇒ çift yönlü `diff` tutuyor. Başka hiçbir jeton silinmedi (diff: tam olarak 2 silme)                        |
| `pnpm guards`                                             | **17/17 PASS** (koşturuldu, tam çıktı alındı) — üç yeni adım (AC-1, bütçe pin tazeliği, ADR-0022 K1(d)) dahil                                                                                                                                                                                                                                          |
| Sır repoya girdi mi                                       | **HAYIR** — diff'teki tek eşleşme `POSTGRES_PASSWORD: arkesoft_dev_only` (`api` job'unda zaten var olan, `.env.example` ile birebir dev-only değer); `.env` `.gitignore:7`'de ve `git ls-files`'ta **yok**; `BEGIN … PRIVATE KEY` sıfır eşleşme                                                                                                        |
| `.env.example` değişikliği                                | **YOK** (diff boş) ⇒ yeni env değişkeni `.env.example` sözleşmesine dokunmuyor; `K8` drift kontrolü yeşil (35 anahtar)                                                                                                                                                                                                                                 |
| Yeni ana bağımlılık                                       | **YOK** — `@playwright/test` catalog'da zaten `1.64.1`'e pinliydi; `pnpm-lock.yaml` diff'i 3 satır, yeni paket girdisi yok                                                                                                                                                                                                                             |
| `start-queue-redis` composite'i                           | Saf taşıma; `run:` içinde `${{ }}` yok (`env:` üzerinden), imaj etiketi sabit (`redis:8.10-alpine`), yalnızca OKUMA assertion'ı, sır yok                                                                                                                                                                                                               |
| Ödeme / kart verisi / PII / KVKK                          | **Bu sürümde ilgili yüzey yok** — ödeme, webhook, imza doğrulama, idempotency, kart verisi, TCKN: diff'te sıfır dokunuş. Toplanan tek kişisel veri e2e fixture e-postası (`@arkesoft.test`, RFC 2606 rezerve) ve koşum sonunda siliniyor                                                                                                               |
| Oran sınırlama                                            | **GüçLENDİ** — bütçe yorum bloğundan tipli beyan tablosuna taşındı (`auth-budget.ts`), üç fail-closed değişmez (`auth-budget.test.ts`) + config yükleme anında dördüncü kapı (`playwright.config.ts:72-86`) + guards pin tazeliği. `responsive/sign-in-layout.spec.ts` ölçüldü: auth ucuna tek ağ çağrısı yok                                          |
| Enjeksiyon — SQL                                          | İki fabrikadaki SQL string birleştirmeleri **kapalı**: admin'de her değer `^[a-z0-9-]+…$` / `^e2e-[a-z0-9-]*\d{10,}$` regex kapısından geçiyor (tırnak karakteri imkânsız); storefront'ta değerler `Date.now()` + `Math.random().toString(36)` ile **süreç içinde** üretiliyor. `POSTGRES_USER`/`POSTGRES_DB` `execFileSync` **argümanı** (kabuk yok)  |
| Enjeksiyon — XSS / açık yönlendirme / yol gezinme         | Yeni kullanıcıya dönük render yolu, yeni yönlendirme hedefi, kullanıcı girdisinden türeyen dosya yolu yok                                                                                                                                                                                                                                              |
| SSRF                                                      | Kullanıcı girdisinden türeyen giden istek yok. `--host-resolver-rules` değeri `run-visual.sh`'in **kendi çözdüğü** gateway IP'si ve `^\d+\.\d+\.\d+\.\d+$` ile süzülüyor (`run-visual.sh:152`)                                                                                                                                                         |

---

## 4. ÖLÇÜMLER

- **`pnpm audit`:** critical **0** · high **1** · moderate **3** · low **1**
  (`META {"info":0,"low":1,"moderate":3,"high":1,"critical":0}`). Tamamı
  **mevcut borç**, bu değişiklikle gelmedi (lock diff'i 3 satır, yeni paket yok).
- **`pnpm guards`:** **17/17 PASS** (koşturuldu; üç yeni adım dahil).
- **İncelenen dosya sayısı:** **24** (36 değişen dosyadan; `.claude/workflow/
tasks/T-020.md`'nin tamamı, `ROADMAP.md` ve 4 PNG referansı kapsam dışı
  bırakıldı — ikincisi ikili dosya).
- **Tenant izolasyon listesinden karşılanmayan madde numaraları:** **yok** —
  liste bu değişiklik için ateşlenmiyor (yeni tablo/kolon/indeks/prosedür/kuyruk
  işi yok; `packages/db` + `packages/trpc` + `apps/api` diff'te **sıfır dosya**).
  Muadil kontrol olan **ADR-0022 K1'in dört koruması** için karşılanmayanlar:
  **(a)** ve **(b)** — yalnızca `apps/storefront/e2e/fixtures/
custom-domain-tenant.ts` için (bkz. §2 tablosu, S-1).
- **Ölçümün koşulları (AGENT_BASELINE §4 ders 2):** geliştirme makinesi, **25
  çalışan Docker konteyneri**, paralel koşan başka bir gate ajanı (`solid`) var.
  `pnpm guards` tek başına koşturuldu; `pnpm --filter @arkesoft/admin test:e2e`
  **KOŞTURULMADI** (`EMAIL_IP_LIMIT` bütçesi kısıtı — `qa`'nın payı korundu).

### DOĞRULANAMADI

| Ne                                                                                | Neden                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1'in sömürü senaryosunun uçtan uca koşturulması (`DOCKER_HOST=tcp://…`)         | Uzak bir docker daemon'a bağlanmayı gerektirir; kapsam ve yetki dışı. Kanıt **statik + emsal karşılaştırması** (admin kopyası aynı girdiye karşı fırlatıyor, storefront kopyasında kapı kodu **hiç yok**)                              |
| S-2'nin gerçek depoda mutasyonla kanıtlanması                                     | Depoya üçüncü bir dosya yazmak kaynak değişikliği olurdu (gate ajanı yasağı). Yerine **`/tmp` sandbox'ında alt kontrol 2'nin birebir kabuk mantığı** koşturuldu; sonuç yukarıda                                                        |
| S-4'ün "trace üretilmiyor" iddiasının gerçek CI koşumuyla teyidi                  | CI koşumu tetiklemedim. Kanıt **statik**: üç yapılandırma dosyasında da `retries` sıfır eşleşme ⇒ Playwright varsayılanı `0` ⇒ `on-first-retry` ateşlenmez                                                                             |
| Görsel regresyon koşumunun (`pnpm test:visual`) kendi davranışı                   | Pinli Docker imajını indirir; Orkestratör kısıtı gereği gerekmedikçe koşturulmadı. `run-visual.sh` **statik** incelendi                                                                                                                |
| `pnpm audit` sonucunun taban dalda **birebir aynı** olduğunun koşturularak teyidi | Taban dala geçmek `git checkout` gerektirir (yasak). Yerine `pnpm-lock.yaml` diff'i (3 satır, yeni paket girdisi yok) ve `pnpm-workspace.yaml` catalog pininin değişmediği **ölçüldü** — yeni advisory girmesi yapısal olarak imkânsız |

---

## 5. Düzeltme turu için öncelik

1. **S-1 (high)** — storefront fixture'ına (a)+(b); `playwright.config.ts`'e
   `NODE_ENV ??= 'test'` + `astro dev` çocuğunun `NODE_ENV=development` pini.
2. **S-2 (medium)** — guards alt kontrol 2'yi mekanizmaya bağla **ve** her
   allowlist dosyasında iki koruma fonksiyonunun varlığını pozitif olarak iddia
   et (bu tek değişiklik S-1'in tekrarını da mekanikleştirir).
3. `low`'lar (S-3, S-4, S-5, S-6) için **düzeltme turu açılmaz**
   (AGENT_BASELINE §4) — ROADMAP teknik borç tablosuna. ⚠ İstisna: **S-4'ün
   `retries: 0` pini** `scripts/playwright/base.ts`'te, S-2'nin düzeltmesiyle
   aynı turda "yolu üstündeyse kapat" olarak işaretlenebilir (tek satır).
