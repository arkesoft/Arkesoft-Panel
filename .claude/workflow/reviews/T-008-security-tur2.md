# T-008 — security gate, tur 2

- **Tarih:** 2026-11-01
- **Sürüm:** ROADMAP v0.0.7 (platform 0.0.6 → 0.0.7), `minor`
- **Kapsam (tur 2):** Düzeltme Turu 1'in **benim ölçtüğüm üç yüzeyde** yaptığı değişiklikler
  — `apps/admin/vite.config.ts` (`server.host` kaldırıldı) · `apps/admin/package.json`
  (`build` zinciri + `rm -rf dist/.vite`) · `apps/admin/scripts/check-compiled-css-contract.ts`
  (yeni bekçi) · `apps/admin/src/messages/messages.ts` (üçüncü yazıcı) ·
  `apps/admin/src/components/AppShell.tsx` (skip-link) ·
  `apps/admin/src/routes/_auth.sign-in.tsx` (fail-closed alan hatası) ·
  `apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts` (yeni) + tedarik zinciri
- **Referanslar:** kendi tur 1 raporum · T-008.md "Gate Tur 1 sentezi" + "Düzeltme Turu 1 —
  architect kararları" (K1–K4) · ADR-0009 madde 7/8 · ADR-0010 madde 3/4 + Ek · ADR-0011
  taslağı madde 1–4 · CLAUDE.md §7 (14 madde), §10

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] apps/api/src/__tests__/helpers/create-test-app.ts:70-79 — `flushRateLimitCounters` HER `createTestApp()` çağrısında `REDIS_URL`'in İŞARET ETTİĞİ Redis'te `SCAN platform:auth:* → DEL` koşuyor; ne `NODE_ENV` kontrolü ne Redis host allowlist'i var (ÖLÇTÜM: dosyada `NODE_ENV` geçmiyor, bağlantı `RedisService`'in çözdüğü gerçek `ApiEnv`'den geliyor — `apiEnv` override verilmedikçe gerçek `.env`). SALDIRI SENARYOSU (somut): bir geliştirici veya CI job'u paylaşılan bir ortamı (staging) teşhis ederken `REDIS_URL` o Redis'e bakarken **zorunlu kapı komutu** `pnpm test`'i koşar; 30 test dosyasının her `createTestApp()` çağrısı birkaç dakika boyunca o namespace'i TEKRAR TEKRAR siler → `/auth/sign-in/email` (20/15dk), `/auth/sign-up/email` (10/saat) ve şifre sıfırlama sayaçları o pencere boyunca SÜREKLİ sıfırlanır; kimlik bilgisi doldurma (credential stuffing) botu pratikte SINIRSIZ deneme hakkı kazanır. HAFİFLETEN ÖLÇÜMLER (bu yüzden `high` DEĞİL): `tsconfig.build.json` `exclude: [... "src/__tests__"]` ve `apps/api/dist` içinde `create-test-app*` → **0 dosya** (ÜRETİM SÜRECİNDE ASLA KOŞAMAZ); bugün `REDIS_URL` loopback, paylaşılan ortam YOK; namespace'in platform kapsamlı oluşu v0.0.5 borcu. Bu sürüme ATFEDİLMEZ (T-006/S8), `qa` tur 1'de yüzeye çıkardı. ÖNERİLEN DÜZELTME: helper'ın başında fail-closed kapı — `NODE_ENV === 'test'` DEĞİLSE **fırlat**, ve çözülen Redis host'u loopback allowlist'inde (`127.0.0.1`/`::1`/`localhost`) DEĞİLSE **fırlat**; kalıcı çözüm sayaçları koşum başına namespace'lemek. — backend (vade v0.0.8 — architect'in "borç 1439'un kök nedeni `apps/api` test hattının hermetikliği = v0.0.8" teşhisiyle aynı ev)
  - [SEV: low] pnpm-workspace.yaml + pnpm-lock.yaml — `minimatch` orta bulgusu (GHSA-g3hv-75wg-m249, `<11.0.1`) AÇIK kalıyor; **ATFIM DÜZELTİLDİ — S1 HAKLI, BEN YANILMIŞIM.** Ölçüm: `git show HEAD:pnpm-lock.yaml | grep "^  minimatch@"` → **`minimatch@10.2.6` v0.0.6'DA ZATEN VARDI** (iki kayıt) ve `10.2.6 < 11.0.1` → v0.0.6 ZATEN savunmasızdı. Yani tur 1'de bildirdiğim `orta 0 → 1` deltası bir BAĞIMLILIK deltası değil, **advisory veritabanı deltası** (advisory T-007 ölçümümden sonra yayınlanmış). v0.0.7 gerçekten İKİNCİ bir savunmasız yol ekliyor (`minimatch@3.1.5` ← `eslint-plugin-jsx-a11y@6.10.2`, `git diff pnpm-lock.yaml` → `+ minimatch@3.1.5`) ama audit'in 60 yolunun hacmi `eslint@10.13.0` → `@eslint/config-array@0.23.5` → `minimatch@10.2.6` ve bu **11 workspace paketinin devDependency'si** → **jsx-a11y'yi kaldırmak bu bulguyu KAPATMAZ** (S1'in ölçümü doğru). Risk DEĞİŞMEDİ: yalnızca devDependency, `apps/admin/dist` taramasında minimatch izi **0**, minimatch'i besleyen tek girdi operatörün kendi ESLint/Prettier yapılandırması. ÖNERİLEN DÜZELTME: borç satırının metni "bu sürüm ekledi" DEĞİL, "`eslint`'in geçişli `minimatch@10.2.6`'sı; kapanışı upstream `eslint`'in `>=11.0.1`'e geçmesine veya bir `pnpm.overrides` kaydına bağlı" olarak yazılmalı. — devops
  - [SEV: low] pnpm-workspace.yaml:283-292 — `eslint-plugin-jsx-a11y@6.10.2` 2024-10-26'dan beri yayın almamış ve `peerDependencies.eslint` `^10`'u kapsamıyor. Tur 1'de fonksiyonel boşluk OLMADIĞINI ölçmüştüm; bu turda dolaylı teyit: `pnpm lint` **17/17** yeşil ve `packages/ui`/`apps/admin`'in jsx-a11y kuralları aktif. Risk gelecekte: bakımsız eklenti bir sonraki ESLint ana sürümünde SESSİZCE devre dışı kalabilir. — devops (borç)
  - [SEV: low] apps/admin/e2e/panel-flow.spec.ts:25 **+ apps/admin/e2e/qa-blind-spot-and-negative-scenarios.qa.spec.ts:85** — tur 1'deki fixture bulgusunun BORÇ'a atılması doğru (architect Karar 4, v0.0.19) ama **bu turda YÜZEY GENİŞLEDİ ve borç satırı artık yüzeyi EKSİK tarif ediyor**: aynı repoya commit'li parola (`'arkesoft-e2e-fixture-password-123'`) artık **İKİ** dosyada, ve kalıcı doğrulanmış kullanıcı üretimi koşum başına **3 → 4**'e çıktı (`panel-flow`'da 3 × `createVerifiedFixtureUser`, yeni spec'te 1 × `createSignedInFixtureUser` `beforeAll`). SALDIRI SENARYOSU (tur 1'le aynı sınıf, daha hızlı biriken): spec bir gün paylaşılan bir dev/staging'e yöneltilirse orada parolası repoda AÇIKÇA yazılı, e-postası DOĞRULANMIŞ hesaplar birikir; `e2e-<ts>-<rand>@arkesoft.test` / `e2e-qa-<ts>-<rand>@arkesoft.test` desenini bilen biri oturum açabilir. BUGÜN ETKİ SINIRLI (bu yüzden `low`): iki üretici de düz `sign-up` kullanıyor, kiracı ÜYELİĞİ oluşturmuyor → hesaplar yalnızca `session.me`'ye (`{userId, sessionId}`) ulaşır. YAN ETKİ (AC18'in ilgisi): sign-up tavanı 10/saat olduğundan tam e2e koşum kapasitesi saatte ~3 → **~2**'ye düştü; architect'in Karar 4'te ölçtüğü "koşum başına 3 sign-up" sayısı ARTIK GEÇERSİZ. ÖNERİLEN DÜZELTME: borç satırı "`panel-flow.spec.ts`" yerine "**`apps/admin/e2e/**` — iki spec, ortak sabit parola, koşum başına 4 kalıcı doğrulanmış kullanıcı**" diye yeniden yazılsın; çözüm değişmiyor (seed'li yeniden kullanılabilir fixture + parola repoda değil + koşum başına 0 sign-up). — qa (vade v0.0.19)
  - [SEV: low] apps/admin/scripts/check-compiled-css-contract.ts:363-367 + apps/admin/scripts/check-bundle-budget.ts:386-389, :272-284 — iki yeni bekçinin MUTLU YOLU hassas hiçbir şey yazmıyor (ÖLÇTÜM: yalnızca sayaçlar ve KiB değerleri; env değeri, dosya yolu, sır yok) ama BAŞARISIZLIK yolları yazıyor: üst düzey `catch` `error.stack`'i OLDUĞU GİBİ basıyor (ÖLÇTÜM: manifest'i silip koştum → `/Users/kullanici/Desktop/Arkesoft Panel/apps/admin/dist/.vite/manifest.json` mutlak yolu + tam stack trace), `FAIL-CLOSED A` dalı manifest'teki TÜM `src` değerlerini (`src/routes/*` iç yapısı) basıyor. Build log'u CI'da repo okuma yetkisi olan herkese görünür. SOMUT KAZANÇ YOK ve bu yüzden `low`: CI'da mutlak yol runner'ın yolu (`/home/runner/work/...`), rota kaynak adları sır değil, env değeri hiçbir dalda basılmıyor. ÖNERİLEN DÜZELTME: `catch` dalında `error.stack` yerine `error.message` + script adı basmak (bu sürümde aksiyon gerekmiyor). — devops
  - [SEV: low] docs/development.md:175,180 — v0.0.6'dan kalan iki `curl` örneği `-H "Origin: http://localhost:5173"` öğretiyor; v0.0.7 `AUTH_BASE_URL`'i `http://panel.arkesoft.localhost:5173`'e taşıdı → bu Origin `SameOriginGuard` tarafından **403 `CROSS_SITE_REQUEST_REJECTED`** ile reddedilir (ölçüldü: yabancı Origin + çerez → 403, tur 1'de). Operatör "tRPC çalışmıyor" diye teşhis eder — K1'in BİZZAT uyardığı "sessiz 403 tuzağı"nın doküman kardeşi. Güvenlik açığı DEĞİL, yanıltıcı kayıt. ÖNERİLEN DÜZELTME: iki satırdaki Origin'i `http://panel.arkesoft.localhost:5173` yap. — docs
  - [SEV: low] apps/admin/.tanstack/tmp/<uuid> — `@tanstack/router-plugin` her build'de `apps/admin/.tanstack/tmp/` altına uuid adlı bir geçici routeTree kopyası yazıyor; dizin `.gitignore`'da **DEĞİL** (`git check-ignore apps/admin/.tanstack` → eşleşme yok, `git status --short` → `?? apps/admin/.tanstack/`). İçerik hassas değil (`routeTree.gen.ts`'in aynısı) ve bugün hiçbir kapıyı kırmıyor (dosya adında uzantı olmadığı için prettier ve eslint ikisi de ATLIYOR — ölçtüm: `format:check` temiz, `lint` 17/17 bu dosya mevcutken) ama (a) `release`/kullanıcı `git add -A` yaparsa derleme artefaktı repoya girer (CLAUDE.md §10.8'in ruhu), (b) her build yeni bir uuid dosyası bırakır → birikir. ÖNERİLEN DÜZELTME: `.gitignore`'a `apps/admin/.tanstack/` satırı. — devops (vade bu sürüm, tek satır)
  - [SEV: low] apps/admin/package.json:9 — `rm -rf dist/.vite` korumasının KALAN boşluğu: zincir yalnızca `vite build`'i SARAN `build` script'inde; `vite build`'i DOĞRUDAN çağıran bir dağıtım yolu (Dockerfile/Helm) manifest'i `dist`'te bırakır. S1'in borç satırı bu riski doğru tarif ediyor ve **vadesini DOĞRULADIM**: bugün böyle bir yol YOK (ölçtüm: `.github/workflows/**` içinde `vite build` → 0 eşleşme; `infra/` altında yalnızca `docker-compose.yml`, `admin` için Dockerfile/nginx/Helm chart'ı YOK) ve `admin` için ilk gerçek dağıtım hattı ROADMAP'te **v0.18.0** ("Helm chart'ları: … `admin`" + "build → push → migrate → rollout") → **vade v0.18.0 doğru**. ÖNERİLEN DÜZELTME: v0.18.0'da ya manifest'i `outDir` DIŞINA yazan bir plugin ya ingress'te `/.vite/` reddi. — devops (vade v0.18.0)
  - [SEV: low] apps/admin/dist/assets/index-B5uqXwWL.js — tur 1'deki 7. low'un KAPANIŞINDAN SONRA kalan artık: manifest `dist`'ten çıktı (kaynak rota yolları `src/routes/*` artık `dist`'te **0 eşleşme** — ÖLÇTÜM) ama giriş chunk'ı HÂLÂ dört tembel rotanın chunk adlarını (`_auth.sign-in-*.js`, `_app.index-*.js`, `_app-*.js`, `ErrorState-*.js`) tam liste olarak taşıyor — bu kod bölmenin (code splitting) YAPISAL sonucu, `rm -rf dist/.vite`'ın kapatabileceği bir şey DEĞİL. Yani "oturumsuz ziyaretçi panelin rota yüzeyini sayabilir" sınıfı v0.0.14'te (RBAC) hâlâ geçerli olacak. Bir eylem gerektirmiyor ve bu yüzden `low`: rota ADLARI sır değil, kritik olan yetkilendirmenin SUNUCUDA olması. ÖNERİLEN DÜZELTME: aksiyon yok — v0.0.14'ün RBAC kararında "istemci chunk adları rota varlığını açığa vurur; yetki kontrolü istemci rota grafiğine ASLA dayandırılamaz" notu kayda geçsin. — architect (kayıt, v0.0.14)
ÖLÇÜMLER: aşağıdaki "Ölçümler" bölümü (gerçek komut çıktıları)
```

**FAIL kuralı uygulaması (AGENT_BASELINE §4):** `critical 0 · high 0 · medium 1 · low 8` →
**PASS** (1–2 `medium` → PASS, bulgular teknik borca kaydedilir).

---

## Tur 1'in 7 low'u — kapanış kararları

| # | Tur 1 low'u | KARAR | Dayanak (ölçüm) |
| - | ----------- | ----- | --------------- |
| 1 | `minimatch` orta bulgusu, "zinciri bu sürümün eklediği eklenti açıyor" | **AÇIK (borç) — ATFIM ÇÜRÜTÜLDÜ** | `git show HEAD:pnpm-lock.yaml` → `minimatch@10.2.6` v0.0.6'da ZATEN VAR ve `<11.0.1`. S1 haklı: 60 yolun hacmi `eslint`'ten, jsx-a11y'den bağımsız → jsx-a11y'yi kaldırmak bulguyu kapatmaz. Delta bağımlılık deltası değil, **advisory deltası**. |
| 2 | `eslint-plugin-jsx-a11y` bakımsız + peer uyumsuz | **BORÇ** (tek satıra birleştirildi) | `pnpm lint` 17/17; fonksiyonel boşluk hâlâ yok |
| 3 | `vite.config.ts:76` `server.host: true` | **KAPANDI** | Satır SİLİNDİ. Kendi izole örneğim (`:5199`): `lsof` → **yalnızca `[::1]:5199`** · Vite başlık satırı → "Network: **use --host to expose**" · `curl -4 http://127.0.0.1:5199/` → **exit 7, bağlantı reddi** (tur 1'de 200'dü) · `Host: evil.example.com` → **403 fail-closed** (A-A1 korunuyor) · `Host: panel.arkesoft.localhost` → **200**. Saldırı yüzeyi "tüm arayüzler" → "IPv6 loopback" |
| 4 | e2e fixture parolası repoda, kullanıcılar silinmiyor | **BORÇ (v0.0.19) — ama YÜZEY GENİŞLEDİ → yeni `low`** | Aynı parola artık **2** dosyada; kalıcı kullanıcı üretimi **3 → 4**/koşum |
| 5 | AC8'in RENDER yarısı mekanik olarak ölçülmemiş | **KAPANDI** | `qa-blind-spot…qa.spec.ts:387-403` test **(G)**: gerçek başarısız giriş → `getByText('E-posta veya parola hatalı.')` görünür **ve** `page.content()` ne `/\berrors\.[a-z]/` ne `invalid email or password` içeriyor. Tur 1'de istediğim testin birebir kendisi |
| 6 | Kısmi çıkış başarısızlığında uyarı görünürlüğü | **KAPANDI (gerekçeli, davranış değişmedi)** | S5'in iddiasını MEKANİK doğruladım: `UserMenu.tsx:85` → `role="alert"`, `:72-73` → `onSelect` içinde `event.preventDefault()` (menü AÇIK kalır). Uyarı sessizce kaybolmuyor; "savunulabilir" yargım korunuyor |
| 7 | `dist/.vite/manifest.json` dağıtılabilir çıktıda (vade v0.0.14 demiştim) | **KAPANDI — vade v0.0.14'e GEREK KALMADI** | Üç bağımsız ölçüm (aşağıda): gerçek build'de manifest ÜRETİLİYOR + İKİ script onu OKUYOR + zincirin son adımında SİLİNİYOR; **turbo cache-hit'te `.vite` GERİ GELMİYOR**; manifest YOKKEN iki bekçi de **exit 1** (sessiz geçiş yok). Kalan iki artık ayrı `low` olarak kaydedildi |

---

## Ölçümler

### Zorunlu kapı (Orkestratör ölçümü doğrulandı)

| Komut | Çıktı | Orkestratör iddiası | Sonuç |
| ----- | ----- | ------------------- | ----- |
| `pnpm lint` | `Tasks: 17 successful, 17 total` | 17/17 | ✅ doğrulandı |
| `pnpm typecheck` | `Tasks: 17 successful, 17 total` | 17/17 | ✅ doğrulandı |
| `pnpm format:check` | `All matched files use Prettier code style!` | temiz | ✅ doğrulandı |
| `pnpm build` | `Tasks: 12 successful, 12 total` | 12/12 | ✅ doğrulandı |
| `pnpm test` | ui **21** · errors **48** · admin **29** · trpc **26** · db **166** · api **334** = **624** | 624 (tur 1: 613) | ✅ **birebir** |
| `pnpm test:isolation` | `Tasks: 8 successful, 8 total` (db 14 + api 2 = 16 test) | 8/8 | ✅ doğrulandı |
| `pnpm --filter @arkesoft/admin test:e2e` | **KOŞTURULMADI** (brief kısıtı: 5173 `qa`/`wcag`'ın) | — | kısıta uyuldu |

### ÖZEL DİKKAT 1 — `rm -rf dist/.vite`: yeni yüzey, üç ölçüm

Zincir (`apps/admin/package.json:9`):

```
"build": "vite build && node ./scripts/check-compiled-css-contract.ts && node ./scripts/check-bundle-budget.ts && rm -rf dist/.vite"
```

**① Manifest gerçekten üretiliyor VE iki script onu okuyor mu — GERÇEK build (cache miss):**

```
$ pnpm build --force --filter @arkesoft/admin
@arkesoft/admin:build: $ vite build && node ./scripts/check-compiled-css-contract.ts && node ./scripts/check-bundle-budget.ts && rm -rf dist/.vite
@arkesoft/admin:build: dist/.vite/manifest.json                 2.35 kB │ gzip: 0.46 kB   ← ÜRETİLDİ
@arkesoft/admin:build: ✓ built in 236ms
@arkesoft/admin:build: [check-compiled-css-contract] taranan CSS dosyası sayısı: 1, bildirim sayısı: 332, @theme token tanımı: 24, kaynakta referans verilen token sayısı: 23
@arkesoft/admin:build: [check-compiled-css-contract] PASS — N1/N2/P1/P2 hepsi geçti.
@arkesoft/admin:build: [bundle-budget] MAKSİMUM — JS (gzip): 174.53 KiB / bütçe 250.00 KiB (%69.8, rezerv 75.47 KiB)
 Tasks:    5 successful, 5 total        Cached:    0 cached, 5 total
```

→ Script'ler **GERÇEK sayı raporluyor** (332 bildirim, 24 token tanımı, 23 referans; 174.53 KiB) —
yani manifest'i gerçekten okudular, "sessizce atlanma" YOK. Sıra zincirde doğru: `rm` **en son**
adım, iki bekçi ondan ÖNCE. Zincir `&&` ile bağlı → bir bekçi kırmızı olursa `rm` HİÇ koşmaz
(manifest teşhis için `dist`'te kalır, build zaten başarısız).

**architect'in şartı — CSS dosya adı manifest'ten mi geliyor, glob YASAĞI tutuyor mu:**

```
$ grep -n "readdirSync\|glob\|isEntry" apps/admin/scripts/check-compiled-css-contract.ts
46-47:  // Girdi `dist/.vite/manifest.json`'un `isEntry:true` girdilerinin `css` dizisidir — HASH'TEN BAĞIMSIZ (dosya adını glob'la aramak YASAK…)
128-129: /** `isEntry:true` girdilerinin `css` dizilerini BİRLEŞTİRİR (tekilleştirilmiş) — glob YOK, hash'ten bağımsız. */
165:     const entries = readdirSync(rootDir, …)   ← YALNIZCA KAYNAK taraması (P1), dist DEĞİL
```

→ Derlenmiş CSS **manifest'ten**, kaynak taraması `readdirSync` ile (bu doğru — P1 kaynağı tarar).
Glob'la CSS arama **yok**.

**Manifest YOKKEN bekçi fırlatıyor mu (architect'in "sessizce geçmemeli" şartı) — ÖLÇTÜM:**

```
$ node ./scripts/check-compiled-css-contract.ts   # dist/.vite silinmiş durumda
[check-compiled-css-contract] Beklenmeyen hata: Error: ENOENT: … dist/.vite/manifest.json
$ echo $?  →  1

$ node ./scripts/check-bundle-budget.ts
[bundle-budget] Beklenmeyen hata: Error: ENOENT: … dist/.vite/manifest.json
$ echo $?  →  1
```

→ **İKİSİ DE exit 1.** Üst düzey `try/catch` hatayı YUTMUYOR, `process.exitCode = 1` yazıyor →
`&&` zinciri kırılır, `pnpm build` KIRMIZI olur. **Sessiz geçiş yolu YOK.**

**② Turbo cache-hit'te `.vite` geri geliyor mu — İKİ KEZ BUILD, DECISIVE TEST:**

`turbo.json` → `build: { outputs: ["dist/**"] }`. Kritik soru: cache arşivi `.vite`'ı taşıyor mu?
Zayıf test (sadece iki kez build) yeterli değil — `dist`'i **tamamen silip** cache'ten geri
yüklettim:

```
$ rm -rf apps/admin/dist
$ pnpm build
 Tasks:    12 successful, 12 total
Cached:    12 cached, 12 total
  Time:    76ms >>> FULL TURBO                    ← script'ler KOŞMADI, dist CACHE'TEN geri yüklendi

$ ls -la apps/admin/dist
drwxr-xr-x  .          Nov  1 16:36     ← mtime ŞİMDİ = gerçekten cache'ten yazıldı
drwxr-xr-x  assets
-rw-r--r--  index.html
$ ls apps/admin/dist/.vite
ls: apps/admin/dist/.vite: No such file or directory     ← GERİ GELMEDİ
```

→ **Koruma cache'te DELİNMİŞ DEĞİL.** Mekanizma: `rm` görev İÇİNDE, turbo çıktıyı görev
BİTTİKTEN SONRA arşivliyor → cache arşivi `.vite`'ı hiç içermiyor, dolayısıyla restore de
edemiyor. Üç durumun hepsinde `.vite` yok: cache-hit (dist yerinde) · cache-hit (dist silinmiş,
restore) · cache-miss (gerçek build).

**③ S1'in kalan borç satırı yeterli mi, vade doğru mu:** bkz. yukarıdaki `low` — **yeterli ve
vade v0.18.0 DOĞRU** (ölçüm: CI'da `vite build` → 0 eşleşme; `admin` için Dockerfile/nginx/Helm
→ yok; ROADMAP v0.18.0 `admin` Helm chart'ını + "build → push → rollout" hattını getiren İLK
sürüm).

**`dist`'in son hâli — teslim edilen artefakt:**

```
$ find apps/admin/dist -type f | wc -l   →  11
apps/admin/dist/index.html
apps/admin/dist/assets/{index-B5uqXwWL.js, index-B9K055UW.css, _app-kNh9SgJu.js,
  _app-BunF0vcC.js, _app.index-BnzBbVmu.js, _auth.sign-in-Bz6n26xx.js,
  messages-_osBa0GN.js, auth-rest-Dckl2fhm.js, dist-BHhf5sRv.js, ErrorState-Bh4Dg1Cg.js}
$ grep -rc "src/routes" apps/admin/dist/   →  her dosyada 0     ← manifest'in TEK sızıntısı kapandı
$ grep -rc "\.vite/manifest" apps/admin/dist/   →  0
```

### ÖZEL DİKKAT 2 — `server.host` kaldırıldı: regresyon doğdu mu

**Bağlanma — `lsof` (iki bağımsız örnek):**

```
# Başka bir ajanın 13:42'den beri ayakta duran dev sunucusu (DOKUNMADIM, yalnızca gözlem):
node 88565 … IPv6 … TCP [::1]:5173 (LISTEN)

# Kendi izole örneğim (:5199, 5173'e DOKUNMADAN):
$ ./node_modules/.bin/vite --port 5199 --strictPort
  ➜  Local:   http://localhost:5199/
  ➜  Network: use --host to expose              ← ağa açılmıyor
node 97750 … IPv6 … TCP [::1]:5199 (LISTEN)     ← TEK bağlanma: IPv6 loopback
```

→ `0.0.0.0`/`::` bağlanması **YOK**. Tur 1'deki "güvenilmeyen ağdaki herkes panel SPA'sını
yükleyebilir" senaryosu **yapısal olarak imkânsız** hâle geldi.

**Host başlığı probları (`:5199`, `[::1]` üzerinden):**

| Prob | Sonuç | Tur 1 (host: true) |
| ---- | ----- | ------------------ |
| `Host: panel.arkesoft.localhost:5199` | **200** | 200 |
| `Host: evil.example.com` | **403** `Blocked request. This host ("evil.example.com") is not allowed.` | 403 |
| `Host: 127.0.0.1:5199` (IP-literal, `[::1]` bağlantısı üzerinden) | 200 (Vite IP-literal'leri geçiriyor — değişmedi) | 200 |
| **`curl -4 http://127.0.0.1:5199/`** (IPv4 BAĞLANTI) | **exit 7 — bağlantı reddedildi** | **200** |
| `curl http://panel.arkesoft.localhost:5199/` (curl kendi çözümü) | **200**, `remote_ip=::1` | 200 |
| `curl http://localhost:5199/` | **200**, `remote_ip=::1` | 200 |

→ **① Panel dev sunucusu `panel.arkesoft.localhost`'ta ÇALIŞIYOR.** S5'in gerekçesi FONKSİYONEL
olarak doğru ama LAFZI kısmen yanlış: ad `/etc/hosts`'ta **yok** (`grep arkesoft /etc/hosts` → 0
satır), macOS `*.localhost`'u otomatik çözüyor ve **önce `::1`, sonra `127.0.0.1`** veriyor
(`dns.lookup(all)` → `[{::1,6},{127.0.0.1,4}]`). Yani "zaten `127.0.0.1`'e çözülüyor" değil,
"**`::1`'e çözülüyor ve Vite'ın varsayılanı da `::1`'e bağlanıyor**" — iki taraf tesadüfen
uyuştuğu için akış çalışıyor.
**② `allowedHosts` HÂLÂ fail-closed** (A-A1 korunuyor).
**③ Playwright etkisi (config okunarak, KOŞTURULMADI):** `webServer.url` =
`http://panel.arkesoft.localhost:5173` — **hostname** (IP literal değil) → Node/Chromium aynı
çözümü yapıp `::1`'e bağlanır, uyumlu. `grep -rn "5173"` ile repoda **`127.0.0.1:5173` sabiti
YOK** (tek eşleşmeler `PANEL_DEV_PORT`, `.env.example`, yorumlar) → kırılacak sabit kodlu hedef
bulunamadı. **Regresyon bulunamadı.** Tek ortam varsayımı kayda değer: IPv6 loopback'i olmayan
veya `*.localhost`'u çözmeyen bir ortamda (bazı Linux CI imajları) hem bağlanma hem çözüm IPv4'e
kayar → **kendi içinde tutarlı kalır**; e2e için CI job'u bu sürümde EKLENMEDİ (AC17), bu yüzden
bugün bir risk değil.

### ÖZEL DİKKAT 3 — orijin topolojisi ve muafiyet: DEĞİŞMEDİ

**`apps/api` bu turda dokunulmadı — İKİ bağımsız kanıt:**

```
$ git diff --stat -- apps/api
 9 dosya (same-origin-guard.test.ts, tenant-exempt-paths.test.ts,
          trpc-cross-tenant.isolation.test.ts, trpc-http.test.ts, app.module.ts,
          auth.controller.ts, tenant-exempt-paths.ts, trpc.controller.ts, vitest.config.ts)
 → tur 1'de ölçtüğüm küme ile BİREBİR AYNI, yeni dosya YOK

$ find apps/api/src apps/api/vitest.config.ts -type f -newermt "2026-10-31" | xargs ls -lT
  EN YENİ mtime: Oct 31 20:41:41   (same-origin-guard.test.ts)
```

→ Düzeltme Turu 1 **Nov 1 15:17–16:22** arasında koştu. `apps/api` altında **Nov 1 mtime'lı
HİÇBİR dosya yok** → architect Karar 4'ün "`apps/api` DOKUNMAZ / oran sınırı politikasına
dokunulmaz" hükmü **uygulandı**. (Aynı `find`'ın Nov 1 çıktısı yalnızca `apps/admin/**`,
`packages/ui/**`, `docs/ui/T-008.md` ve Prisma'nın `packages/db/generated/**` yeniden üretimini
içeriyor.)

**CORS HİÇ üretilmiyor — canlı HTTP (gerçek süreç, `node --env-file=.env apps/api/dist/main.js`):**

| Prob | status | `cache-control` | `vary` | `etag` | `access-control-*` | `x-powered-by` |
| ---- | ------ | --------------- | ------ | ------ | ------------------ | -------------- |
| `GET /health` + Origin: panel | **200** | `no-store, private` | `Cookie` | **yok** | **yok** | **yok** |
| `GET /trpc/session.me` çerezsiz + Origin: panel | **401** | `no-store, private` | `Cookie` | **yok** | **yok** | **yok** |
| `GET /trpc/session.me` çerezsiz + Origin: **evil** | **401** | `no-store, private` | `Cookie` | **yok** | **yok** | **yok** |
| `GET /trpc/tenant.current` panel host'u | **404** | `no-store, private` | `Cookie` | **yok** | **yok** | **yok** |
| `GET /tamamen-bilinmeyen` | **404** | `no-store, private` | `Cookie` | **yok** | **yok** | **yok** |
| `OPTIONS /trpc/session.me` + preflight başlıkları + Origin: **evil** | **401** | `no-store, private` | `Cookie` | **yok** | **yok** | **yok** |

→ **6/6 probda `access-control-allow-*` HİÇ ÜRETİLMEDİ**, preflight dahil. Statik çapraz kontrol:

```
$ grep -rniE "enableCors|from 'cors'|access-control-allow|cors:" --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.yaml" apps packages infra | <node_modules, dist, __tests__ hariç>
apps/admin/vite.config.ts:87:   // … `Access-Control-Allow-Origin` ekliyor (ÖLÇÜLDÜ — `curl` ile) —   ← YORUM
apps/admin/vite.config.ts:92:   cors: false,                                                            ← KAPATMA
```

→ Üretim kodunda CORS **açan** tek satır yok; tek eşleşme Vite'ın dev-only `cors: false`'u.

**`vary`/`no-store` politikası (tur 1'de 0/5 → 5/5 kapattığım bulgu):** yukarıdaki tabloda
**6/6** — hâlâ yerinde. `apps/api` değişmediği için derin yeniden ölçüm yapılmadı (brief: "hızlı
teyit yeter"). Kimlikli 200 + `vary: trpc-accept, accept` ikinci satırı ve 403 `SameOriginGuard`
reddi tur 1'de ölçüldü; `apps/api` değişmediğinden geçerli (ve bu iki prob geçerli çerez
gerektirdiği için `qa`'nın oran sınırı bütçesini korumak adına tekrarlanmadı).

**Muafiyet kardinalitesi — GEVŞETİLMEDİ:**

```
TENANT_EXEMPT_PATHS = 13 eleman:
  /health · /health/ready · /auth/sign-up/email · /auth/sign-in/email · /auth/sign-out ·
  /auth/verify-email · /auth/send-verification-email · /auth/request-password-reset ·
  /auth/reset-password · /auth/sessions · /auth/sessions/revoke · /auth/sessions/revoke-all ·
  /trpc/session.me
AUTH_EXEMPT_PATHS   =  9 eleman

$ grep -n "\.size).toBe\|EXPECTED_EXEMPT_PATHS" apps/api/src/__tests__/tenant-exempt-paths.test.ts
38:    expect(TENANT_EXEMPT_PATHS.size).toBe(13)                              ← KARDİNALİTE DURUYOR
42:    expect(new Set(TENANT_EXEMPT_PATHS)).toEqual(new Set(EXPECTED_EXEMPT_PATHS))   ← KÜME EŞİTLİĞİ
45:  it.each(EXPECTED_EXEMPT_PATHS)('%s tam eşleşmeyle muaftır', …)
```

→ `.size` **kaldırılmadı**, `toContain`'e **düşürülmedi**, 14'e **çıkarılmadı**. ADR-0011 madde
1-2-3'ün dayanakları aynen duruyor. `same-origin.guard.ts` / `auth-instance.ts` /
`app-exception.filter.ts` / `api-env.ts` / `main.ts` **hiçbiri Nov 1'de dokunulmadı** (mtime
kanıtı yukarıda).

### ÖZEL DİKKAT 4 — panelin sır yüzeyi: `dist` yeniden tarandı

**DEĞER bazlı tarama (gerçek `.env`'den okunan değerlerle, ad bazlı değil) — taze `dist`:**

| Değişken | `.env` değer uzunluğu | `dist` eşleşme |
| -------- | --------------------- | -------------- |
| `BETTER_AUTH_SECRET` | 43 | **0** |
| `POSTGRES_PASSWORD` | 17 | **0** |
| `MEILI_MASTER_KEY` | 33 | **0** |
| `S3_SECRET_ACCESS_KEY` | 19 | **0** |
| `S3_ACCESS_KEY_ID` | 12 | **0** |
| `DATABASE_URL` | 85 | **0** |
| `REDIS_URL` | 22 | **0** |
| `MAIL_FROM_ADDRESS` | 26 | **0** |
| `AUTH_BASE_URL` | 36 | **0** |
| **TOPLAM** | — | **0** |

Ad bazlı tarama da **0** (`VITE_`, `ARKESOFT_PANEL_DEV_API_TARGET`, `process.env` → her biri 0).

```
$ grep -rhoE "https?://[A-Za-z0-9._:/-]+" apps/admin/dist/ | sort -u
http://json-schema.org/draft-04/schema   http://localhost          https://react.dev/errors/
http://json-schema.org/draft-07/schema   http://www.w3.org/…       https://tailwindcss.com
https://json-schema.org/draft/2020-12/schema
$ grep -rc "postgres://|redis://|127\.0\.0\.1|:3000|panel\.arkesoft|arkesoft\.localhost|e2e-|FIXTURE_PASSWORD|src/routes" apps/admin/dist/
  → hepsi 0
```

→ Mutlak API URL'i, iç host adı, DB dizesi, `VITE_` öneki, dev proxy hedefi: **hiçbiri yok**.
Tek `http://localhost` TanStack Router'ın iç geri düşüş sabiti (tur 1'de teşhis edildi).
**Yeni kazanç:** `src/routes/*` kaynak yolları artık **0** (manifest silindiği için).

**İki yeni build script'inin çıktısı:** mutlu yolda **hassas hiçbir şey yok** (yalnızca sayaç ve
KiB değerleri — yukarıdaki build çıktısı); başarısızlık yollarında mutlak dosya yolu + stack →
ayrı `low` olarak kaydedildi. Script'lerin import yüzeyi: `node:fs`, `node:path`, `node:url`,
`node:zlib` — **`child_process` YOK**, ağ erişimi YOK, kullanıcı girdisi YOK (girdi kendi
`dist/.vite/manifest.json`'u).

### ÖZEL DİKKAT 5 — hata yüzeyi: `messages.ts`'in ÜÇÜNCÜ yazıcısı

**ADR-0010 Ek'inin dört bağlayıcı kuralı — her biri ölçüldü:**

| # | Kural | Kanıt | Sonuç |
| - | ----- | ----- | ----- |
| ① | `PanelError` HİÇBİR mesaj alanı taşımıyor | `apps/admin/src/errors/panel-error.ts` **mtime Oct 31 20:56 — düzeltme turunda DOKUNULMADI**. Tip gövdesi: `{kind:'known'; code: string; requestId: string\|null} \| {kind:'unknown'; requestId: string\|null}`. `grep -nE "message\|userMessageKey"` → 2 eşleşme, **ikisi de YORUM** | ✅ |
| ② | Ham İngilizce sunucu metni / `errors.*` anahtarı ekrana ÇIKAMAZ | Yeni `resolvePanelErrorMessage(error: PanelError)` (`messages.ts:253-258`) yalnızca iki şey dönebiliyor: `resolveErrorMessage(error.code)` (katalog veya jenerik) ya `MESSAGES.errors.network` (katalog). `error` nesnesinde ham metin alanı **yok** (①) → yapısal imkânsızlık KORUNUYOR. Ayrıca e2e **(G)** bunu DOM'da ölçüyor | ✅ |
| ③ | `resolveErrorMessage` fail-closed davranışı GEVŞETİLMEDİ | `messages.ts:140-145` aynen: `isPanelErrorCode(code)` değilse `GENERIC_ERROR_MESSAGE`, **kod basılmıyor**. **GÜÇLENDİ:** `messages.test.ts:74-82` yeni yazıcı için AYNI assertion'ı ekliyor — `expect(message).toBe(resolveErrorMessage('TOTALLY_UNKNOWN_CODE_XYZ'))` **+** `expect(message).not.toContain('TOTALLY_UNKNOWN_CODE_XYZ')` | ✅ |
| ④ | `satisfies Record<PanelErrorCode, string>` kapalı dünyası duruyor | `messages.ts:119` → `} satisfies Record<PanelErrorCode, string>`; runtime ikizi `messages.test.ts:55` → `expect(ERROR_MESSAGES_KEY_COUNT).toBe(PANEL_ERROR_CODES.length)` | ✅ |

**Yeni: fail-closed alan hatası ENUMERATION doğuruyor mu — HAYIR.**
`_auth.sign-in.tsx:52-73` iki çözücü `errors.email?.type` / `errors.password?.type` okuyor; bu
değerler **react-hook-form + zodResolver**'ın **İSTEMCİ tarafındaki** parse çıktısı — yani
kullanıcının KENDİ girdiği değerin şekil doğrulaması. **Sunucudan gelen HİÇBİR veri bu yola
girmiyor** → başka bir kullanıcının/kiracının varlığı hakkında bilgi taşıyamaz. Düşülen mesaj
(`'Bu alanda bir sorun var. Lütfen kontrol edip tekrar deneyin.'`) **hangi alanın NEDEN
reddedildiğini söylemiyor** — jenerik ve alan-kapsamlı. Değişikliğin yönü güvenlik açısından
**iyileştirme**: önceden tanınmayan `issue.code` `undefined` dönüyordu → alan hatası SESSİZCE
kayboluyordu (kullanıcı neden gönderilemediğini bilmiyordu); şimdi her zaman görünür bir mesaj.

**A-A5 TEYİT EDİLDİ — kendi canlı ölçümüm (gerçek uç, gerçek seed kullanıcısı):**

```
--- A) VAR OLAN kullanıcı (demo-yonetici@arkesoft.test) + YANLIŞ parola ---
HTTP/1.1 401 Unauthorized
cache-control: no-store, private
vary: Cookie
{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}

--- B) VAR OLMAYAN kullanıcı (hic-olmayan-kullanici-xyz@arkesoft.test) ---
HTTP/1.1 401 Unauthorized
cache-control: no-store, private
vary: Cookie
{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}
```

→ **Durum, gövde ve başlıklar BİREBİR AYNI.** `set-cookie` yok, `access-control-*` yok.
Panelin Türkçe metni de ayrımı sızdırmıyor: `messages.ts:117` →
`INVALID_EMAIL_OR_PASSWORD: 'E-posta veya parola hatalı.'` — tek metin, hangisinin yanlış
olduğunu söylemiyor; `messages.test.ts:39-45` üç negatif ifadeyi (`'böyle bir kullanıcı'`,
`'kullanıcı yok'`, `'bulunamadı'`) **pinliyor** ve `:48-51` ham İngilizceyi pinliyor.

**Panelin diğer enjeksiyon/sızıntı yüzeyi — yeniden tarandı (`apps/admin/src` + `packages/ui/src`, test hariç):**

```
dangerouslySetInnerHTML 0 · innerHTML 0 · eval( 0 · new Function 0 · console.* 0
localStorage 0 · sessionStorage 0 · document.cookie 0
window.open 0 · location.href 0 · location.assign 0 · document.write 0 · target="_blank" 0
href= → TEK eşleşme: AppShell.tsx:60  href="#main-content"   (sabit fragment, kullanıcı girdisi YOK)
child_process / exec / spawn → 0 (3 eşleşme RegExp.exec, yanlış pozitif)
ham SQL ($queryRaw/$executeRaw) diff'te → 0
```

### ÖZEL DİKKAT 6 — `pnpm test`'in oran sınırı FLUSH'ı

**Mekanizma (kaynak okundu):** `create-test-app.ts:66` → `RATE_LIMIT_KEY_SCAN_PATTERN =
'platform:auth:*'`; `:70-79` `scanStream` + toplu `del`; `:159` her `createTestApp()`'in
`app.init()` sonrası **koşulsuz** çağrılıyor.

**① Yalnızca test ortamında mı — HAYIR, mekanik kapı YOK:**

```
$ grep -c "NODE_ENV" apps/api/src/__tests__/helpers/create-test-app.ts   →  0
```

Bağlantı `app.get(RedisService)` ile çözülüyor → `apiEnv` override VERİLMEDİKÇE gerçek
`parseEnv(process.env)`, yani gerçek `.env`'in `REDIS_URL`'i. Yani helper "hangi Redis" sorusunu
hiç sormuyor. **Hafifleten, ÖLÇÜLEN gerçek:** üretim SÜRECİNDE koşamaz —

```
$ cat apps/api/tsconfig.build.json | grep exclude
  "exclude": ["node_modules", "dist", "src/__tests__"]
$ find apps/api/dist -name "create-test-app*"   →  (boş)
$ ls apps/api/dist/__tests__                    →  No such file or directory
$ grep -rln "create-test-app" apps packages --include="*.ts" | grep -v __tests__   →  (boş)
```

→ 30 ithal edenin **hepsi** `src/__tests__/` altında. Risk "üretim süreci" değil, **"test
süitini yanlış Redis'e karşı koşmak"**.

**② Paylaşılan Redis'te başka sürecin sayaçlarını siliyor — EVET, desen platform kapsamlı:**
anahtar biçimi `platform:auth:<routeKey>:<scope>:<hmacHex>`; `platform:auth:*` glob'u
**kim yazdıysa** siliyor. Benim ölçümüm (homebrew redis, `pnpm test` + `test:isolation` sonrası):

```
$ redis-cli -h 127.0.0.1 -p 6379 DBSIZE  →  3
platform:auth:post-auth-sign-in-email:ip:e3c148812f623fe6       = 5   ttl=892
platform:auth:post-auth-sign-up-email:ip:e3c148812f623fe6       = 1   ttl=3592
platform:auth:post-auth-sign-up-email:account:415d07dbe6716ea6  = 1   ttl=3592
```

Gate'e başladığımda bu namespace **BOŞTU** (0 anahtar) — bugün koşmuş e2e turlarının sign-up/
sign-in'leri bıraktığı sayaçlar **yok olmuş** durumda; flush'ın (ve/veya TTL'in) sonucu. Yerel
ortamda saldırganın makinede olması gerektiği için **bugün etki yok**; gerçek risk ① ile aynı
misconfiguration yolu. → `medium` bulgu, sorumlu **backend**, vade **v0.0.8**.

**Ortam teyidi (`qa`'nın keşfi doğrulandı):**

```
$ lsof -nP -iTCP:6379 -sTCP:LISTEN
redis-ser  1445  …  IPv4  TCP 127.0.0.1:6379 (LISTEN)     ← homebrew, Eylül'den beri
redis-ser  1445  …  IPv6  TCP [::1]:6379     (LISTEN)
com.docke  5321  …  IPv6  TCP *:6379         (LISTEN)      ← arkesoft-redis konteyneri
$ redis-cli -h 127.0.0.1 -p 6379 DBSIZE  →  3
$ redis-cli -h ::1        -p 6379 DBSIZE  →  3             ← AYNI örnek (homebrew)
```

→ Homebrew `redis-server` iki loopback adresini de SPESİFİK olarak tuttuğu için Docker'ın
wildcard (`*:6379`) bağlanması loopback'te **kaybediyor**; **tüm trafik homebrew örneğine
gidiyor**, `arkesoft-redis` konteyneri kullanılmıyor. Sayaç okuyan herkes bu örneğe bakmalı.

### `pnpm audit` — S1'in sayıları doğrulandı

```
$ pnpm audit
2 vulnerabilities found
Severity: 1 moderate | 1 high
```

| Seviye | Sayı | Bulgu | v0.0.6 taban çizgisi | Tur 1 | Tur 2 |
| ------ | ---- | ----- | -------------------- | ----- | ----- |
| kritik | **0** | — | 0 | 0 | değişmedi |
| **high** | **1** | `multer >=2.0.0 <2.5.0` GHSA-q7qp-rjg7-q26m, 4 yol (`@nestjs/platform-express`) | 1 (aynı) | 1 | **değişmedi**, atfedilmez (v0.0.16) |
| **orta** | **1** | `minimatch <11.0.1` GHSA-g3hv-75wg-m249, **60 yol** | 0 (advisory yayınlanmamıştı) | 1 | **değişmedi** |
| düşük | **0** | — | 0 | 0 | değişmedi |

**Katalog bu turda değişmedi — teyit edildi:**

```
$ ls -lT pnpm-workspace.yaml pnpm-lock.yaml packages/config/package.json
Oct 31 14:28:18  pnpm-workspace.yaml
Oct 31 22:56:15  pnpm-lock.yaml
Oct 31 14:28:18  packages/config/package.json
```

→ Üçü de **Oct 31**; düzeltme turu Nov 1 15:17+ → **tedarik zincirine dokunulmadı**, yeni paket
yok. `pnpm audit` sonucu tur 1 ile birebir aynı. **Yeni bir şey doğmadı.**

**`minimatch` atfının DECISIVE ölçümü (S1 vs. ben):**

```
$ git show HEAD:pnpm-lock.yaml | grep -nE "^  minimatch@"
2181:  minimatch@10.2.6:            ← v0.0.6'DA ZATEN VAR
4404:  minimatch@10.2.6:            ← v0.0.6'DA ZATEN VAR
$ grep -nE "^  minimatch@" pnpm-lock.yaml
3364:  minimatch@10.2.6:   3368:  minimatch@3.1.5:
6906:  minimatch@10.2.6:   6910:  minimatch@3.1.5:
$ git diff pnpm-lock.yaml | grep -E "^[-+].*minimatch@" | sort -u
+  minimatch@3.1.5:                 ← YALNIZCA 3.1.5 eklendi
$ git show HEAD:pnpm-lock.yaml | grep -nE "^  eslint@"
1738:  eslint@10.13.0:               ← eslint sürümü de DEĞİŞMEDİ
```

→ `10.2.6 < 11.0.1` **ve** v0.0.6'da vardı → **v0.0.6 da savunmasızdı**; advisory T-007
ölçümümden sonra yayınlanmış. v0.0.7 ikinci bir savunmasız yol (`3.1.5` ← jsx-a11y) ekliyor ama
**onu kaldırmak bulguyu KAPATMAZ** → **S1 haklı, tur 1 atfım yanlış**, kayıt düzeltildi.

### CLAUDE.md §7 — 14 madde: bu turda değişen bir şey var mı

```
$ git status --short packages/db
 M packages/db/vitest.config.ts          ← ŞEMA/MIGRATION/RLS DEĞİŞİKLİĞİ YOK
```

Tur 1'in madde-madde gerekçelendirmesi **aynen geçerli** (9 madde N/A, madde 4/6/12 doğrulandı,
madde 13 değişmedi). Bu turda yeniden ölçülenler:

| # | Madde | Tur 2 durumu |
| - | ----- | ------------ |
| 4 | `tenantProcedure`/`permissionProcedure`, `publicProcedure` değil | **DEĞİŞMEDİ** — `apps/api` dokunulmadı; `AUTH_EXEMPT_PATHS` **9**, `TENANT_EXEMPT_PATHS` **13**, kardinalite assertion'ı yerinde |
| 6 | Girdiden gelen `id`'ler için sahiplik (IDOR) | **DEĞİŞMEDİ** — düzeltme turu HİÇBİR yeni prosedür/girdi eklemedi; panel hâlâ hiçbir kaynak `id`'si göndermiyor. Yeni `fieldGenericError` yolu **tamamen istemci tarafı** (kendi girdisinin Zod parse'ı) → IDOR yüzeyi doğmuyor |
| **9** | **Önbellek anahtarı kimlik boyutu taşıyor mu** | **KAPALI KALIYOR — yeniden ölçüldü: 6/6 probda `cache-control: no-store, private` + `vary: Cookie`, `etag` YOK** (guard reddi ve preflight dahil). Sunucu tarafı önbelleği yok. `apps/api` değişmediği için mekanizma aynı |
| 12 | Hata mesajı başka tenant'ın varlığını sızdırmıyor | **KORUNUYOR** — `tenant.current` panel host'unda **404 `TENANT_NOT_FOUND`** (canlı ölçüm); A-A5 birebir aynı gövde (yukarıda); `PanelError` mesaj alanı yok (ADR-0010 Ek ①) |
| 13 | Log kayıtlarında `tenantId` | **DEĞİŞMEDİ** — `logging/**` Nov 1'de dokunulmadı; `pnpm test` çıktısındaki canlı hata satırlarında `requestId`/`tenantId`/`userId` var, sır/PII yok (`context.fields` yalnızca i18n anahtarı taşıyor: `errors.validation.tooSmall`) |

**Karşılanmayan madde numarası: YOK.**

**AC22 mekanik tarama (yeniden koşuldu):**

```
$ grep -rniE "x-arkesoft-tenant|tenantId|tenant_id|tenantSlug" apps/admin/src packages/ui/src
0 eşleşme
```

→ Panel kiracı kimliğini gövdede/başlıkta/sorgu dizesinde göndermiyor (ADR-0011 madde 4,
ADR-0009 madde 7 korunuyor).

### Skip-link: metin katalogdan mı geliyor (CLAUDE.md §10.17)

```
apps/admin/src/components/AppShell.tsx:30   readonly skipToContentLabel: string      ← PROP, literal DEĞİL
apps/admin/src/components/AppShell.tsx:60   href="#main-content"                      ← SABİT fragment
apps/admin/src/components/AppShell.tsx:67   {skipToContentLabel}
apps/admin/src/routes/_app.tsx:186          skipToContentLabel={MESSAGES.appShell.skipToContent}
apps/admin/src/messages/messages.ts:211     skipToContent: 'İçeriğe geç',
```

→ **Metin KATALOGDAN.** `AppShell.tsx` içinde kullanıcıya dönük hiçbir Türkçe literal yok.
`href="#main-content"` sabit fragment — kullanıcı girdisinden türetilmiyor, **açık yönlendirme
yüzeyi doğmuyor**. (Aynı kontrolü `_app.index.tsx` için de yaptım: tüm metinler
`MESSAGES.dashboard.*`/`MESSAGES.meta.*`.)

### Diğer güvenlik kontrolleri (tur 2'de yeniden koşuldu)

| Kontrol | Sonuç |
| ------- | ----- |
| Sır jetonu taraması (diff) | `git diff \| grep -niE "(password\|secret\|api[_-]?key\|token\|BEGIN .*PRIVATE KEY)"` → gerçek sır **0**. Eşleşmeler: `.env.example`'ın ÖNCEDEN VAR OLAN dev yer tutucusu (`..._change_me_32plus`, **bağlam satırı, `+`/`-` yok**), `js-tokens`/`@tokenizer` paket adları, `COLOR_TOKENS` export'u, `session_token=abc` test fixture'ı |
| Sır jetonu taraması (izlenmeyen dosyalar) | Tek kalem: iki e2e spec'inin paylaştığı `FIXTURE_PASSWORD` → `low` (yukarıda) |
| Ödeme / kart verisi / webhook | **N/A** — bu sürümde ödeme yüzeyi, kart verisi, webhook yok |
| Oran sınırlama | `apps/api/src/auth/rate-limit/**` **Nov 1'de dokunulmadı** (mtime kanıtı). Giriş/kayıt/şifre sıfırlama IP **ve** hesap kapsamında sınırlı, anahtarlarda ham e-posta/IP yok (HMAC — canlı anahtar örnekleri yukarıda). `/trpc` oran sınırsızlığı v0.0.14'e atfedilmiş, bu tur onu büyütmedi |
| SSRF | Kullanıcının verdiği URL'e istek atan kod **yok**; iki yeni script ağa HİÇ çıkmıyor (import yüzeyi `node:fs/path/url/zlib`). Tek dış hedef `ARKESOFT_PANEL_DEV_API_TARGET` — operatör kontrolünde, dev-only, Zod `z.url()`, `VITE_` öneki yok, `dist`'te 0 eşleşme |
| Dosya yükleme / path traversal | **N/A** — yükleme yüzeyi yok (v0.0.16). Yeni script'lerin `join(DIST_DIR, relativePath)`'i manifest'ten geliyor (build-yerel, kullanıcı girdisi değil) |
| KVKK / fazla veri | **DEĞİŞMEDİ** — `session.me` hâlâ `{userId, sessionId}` (`packages/trpc` şeması dokunulmadı); panel `localStorage`/`sessionStorage`'a hiçbir şey yazmıyor (grep 0); üçüncü tarafa veri gönderen kod 0. Yeni eklenen iki katalog girdisi (`fieldGenericError`, `skipToContent`) kişisel veri taşımıyor |
| Süper admin / denetim kaydı | **N/A** — süper admin v0.0.20; bu sürümde süper admin işlemi, impersonation veya müşteri verisine erişen platform işlemi yok |

### Geçici dosya ve süreç disiplini

- Repoya **hiçbir** geçici prob dosyası yazılmadı (tur 1'de bir `.tsx` probu yazıp silmiştim; bu
  turda lint probuna gerek olmadı).
- Kendi başlattığım Vite örneği (`:5199`) **kapatıldı** — `lsof -nP -iTCP:5199 -sTCP:LISTEN` → boş.
- `scratchpad`'deki tek log dosyası (`vite5199.log`) **silindi**.
- **5173'e DOKUNULMADI** ve **Playwright KOŞTURULMADI.** 5173'teki sunucu yalnızca `lsof`/`ps`
  ile GÖZLEMLENDİ (okuma); ona hiçbir HTTP isteği gönderilmedi.

```
$ git status --short | grep -iE "probe|zz-|tmp"
(boş — benim bıraktığım geçici dosya YOK)
```

**Orkestratöre iki operasyonel not (bulgu değil):**

1. **İki artık süreç var ve BENİM değil:** `vite --port 5173 --strictPort` (PID 88565, Nov 1
   13:42'den beri, `[::1]:5173`) ve `node --env-file=.env apps/api/dist/main.js` (PID 22043,
   Nov 1 14:18'den beri, `*:3000`). İkincisi tur 1'de benim başlattığım komutla **aynı komut
   satırı** — tur 1 raporumda "kapatıldı" demiştim; ya kapanmadı ya başka bir ajan aynı komutu
   koştu. **Kasten KAPATMADIM:** `qa`/`wcag` bu turda e2e için ikisine de ihtiyaç duyacak.
   Döngü sonunda kapatılmaları gerekiyor.
2. **Ağaç ölçümüm sırasında değişti:** `apps/admin/bundle-budget.config.ts` (16:39:08) ve
   `apps/admin/src/routes/_app.index.tsx` (16:40:01) ben gate'i koşarken yazıldı. Bütün kritik
   ölçümleri **değişiklik sonrası** tekrarladım (build + bekçiler + `dist` sır taraması + lint +
   format) — sonuçlar aynı. Ama bu, gate'lerin **hareketli bir ağaç** üzerinde koştuğunu
   gösteriyor; eşzamanlı düzenleme döngünün ölçüm bütünlüğü için bir risk.

### Bu sürüme ATFEDİLMEYEN (brief gereği, yeniden teyit edildi)

- `platform:auth:*` Redis anahtar uzayının global/platform kapsamlı oluşu — v0.0.5 borcu;
  `rate-limit/**` Nov 1'de **dokunulmadı**. (Yukarıdaki `medium` **farklı** bir konu: namespace'in
  kapsamı değil, **flush helper'ının ortam kapısı olmaması**.)
- `/trpc` oran sınırsızlığı — v0.0.14; değişmedi.
- `account`/`session`/`verification` tablolarının RLS'siz oluşu — ADR-0008, yapısal, v0.0.14;
  `packages/db` şeması değişmedi.
- `multer` GHSA-q7qp-rjg7-q26m (1 high) — v0.0.16; **artış yok**, aynı tek bulgu, 4 yol.
- `shutdown.test.ts` flaky — T-002; bu turda `pnpm test` **iki kez** koştu, ikisinde de api
  **334/334** yeşil.
- e2e fixture yaşam döngüsü — borç v0.0.19 (architect Karar 4). Yalnızca borç satırının
  **metninin** genişletilmesini istiyorum, vadeyi değil.
- `8g` terminoloji tutarsızlığı ("parola" vs. "Şifre") — borç v0.0.8; `messages.ts:106-116`'da
  S5'in gerekçesi yazılı, bu bir güvenlik konusu değil.
