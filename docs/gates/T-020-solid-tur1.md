# T-020 — `solid` gate, TUR 1

- **Tarih:** 2026-11-15
- **Sürüm:** `v0.0.19` (ROADMAP) — dal `feat/v0.0.19-test-altyapisi`, PR #5
- **GATE:** solid
- **SONUÇ:** **FAIL** (1 × high, 2 × medium — `AGENT_BASELINE` §4 FAIL kuralı)

---

## Bulgular

| SEV        | dosya:satır                                                                 | bulgu                                                                                                                                                                                                                                                                                                                                                                                                                  | negatif kanıt                                                                                                                                                                                                                                         | → ajan                                                                                                                                                                                                              |
| ---------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **high**   | `apps/storefront/e2e/fixtures/custom-domain-tenant.ts:75,130,214`           | ADR-0022 K1'in **zorunlu (a) loopback allowlist** ve **(b) `NODE_ENV` kapısı** bu kopyada **YOK**. Admin ikizinde var (`tenant-cleanup.ts:190-220`, `223-224`, `267-268`). T-020.md:432-433 _"Bugün (a) ve (b) YOK — bu sürümün eklemesi"_ + R-16 (T-020.md:534-535) **bağlayıcı**. Dosya bu dalda **değişti** (S9a dinamik konteyner çözümü) ama iki koruma eklenmedi.                                                | `DOCKER_HOST=tcp://1.2.3.4:2375 pnpm --filter @arkesoft/storefront test:e2e`: admin fabrikası **fırlatır**, bu fabrika **uzak** daemon'un konteynerinde `INSERT INTO tenant` + `DELETE FROM tenant` **çalıştırır**; `NODE_ENV` ne olursa olsun koşar. | devops (S6/S9a)                                                                                                                                                                                                     |
| **medium** | `apps/admin/e2e/__tests__/auth-budget.test.ts:67-82` · `docs/testing.md:53` | "Çarpan değişmezi" **yalnızca `responsive/`**'i tarar (`RESPONSIVE_ROOT`, satır 28). `docs/testing.md:53` _"`responsive/**` ve `visual/**`"_ diyor; ADR-0022 K3 tablosu `visual/`'ı da **YASAK** ilan ediyor ⇒ beyan ≠ mekanizma.                                                                                                                                                                                      | `apps/admin/e2e/visual/x.spec.ts` içine `/auth/sign-in/email` + `SPEC_AUTH_COST`'a `'visual/x.spec.ts': {signIn:1,signUp:0}` ⇒ **üç assert de YEŞİL** (kapsama geçer, çarpan taranmaz, toplam 9≤20/6≤10).                                             | docs + frontend                                                                                                                                                                                                     |
| **medium** | `scripts/guards.sh:704-706` · `:690-691` (yorum `:643-645`)                 | Allowlist alt kontrolü yalnızca `apps`+`packages`'i tarar; ADR **Karar 6** `scripts/`'i birinci sınıf TS alanı yaptı ⇒ "üçüncü kopya sessizce doğamaz" iddiası `scripts/`'te tutmuyor. Ayrıca alt kontrol 1'in `--exclude-dir=__tests__`'ı, kendi yorumundaki _"HİÇBİR istisna dosya YOK"_ ifadesiyle **çelişiyor**.                                                                                                   | (i) `scripts/seed-e2e.ts`'e `docker exec`+`psql` ⇒ `actual_files` kümesi `apps                                                                                                                                                                        | packages`içinde değişmediği için **guard YEŞİL**. (ii)`apps/api/src/x/**tests**/y.ts`'e **yalnızca** `psql` (docker exec'siz) ⇒ alt kontrol 1 dizini atlar, alt kontrol 2 **AND** istediği için görmez ⇒ **YEŞİL**. | devops (S7) |
| low        | `scripts/playwright/base.ts:33,41,58,69`                                    | Dört export'un repoda **tüketicisi yok** (grep: yalnızca kendi dosyası). İki tüketici de `desktopDevice`/`mobileDevice` **kısayolunu** seçti ⇒ `*_DEVICE_NAME`'in v0.0.20'de tüketici kazanması emsale aykırı. Erken genelleme (ADR'nin "v0.0.20 tek dosyayla katılsın" muafiyeti **kısmen** örtüyor).                                                                                                                 | Dördünden `export` kaldır ⇒ `pnpm typecheck`/`lint`/`guards` **hiçbiri kırılmaz** (sıfır harici importer).                                                                                                                                            | borç satırı                                                                                                                                                                                                         |
| low        | `.github/workflows/ci.yml:1391`                                             | `echo "… + 20 Redis SET/GET işçisi …"` — gerçek sayı **5** (`:1361` `seq 1 5`; `:1356` yorumu _"20 → 5"_). Ölçüm **koşulunu** yanlış raporluyor (`AGENT_BASELINE` §4 ders 2: koşullar rapora yazılır).                                                                                                                                                                                                                 | `ARKESOFT_E2E_SYNTHETIC_LOAD=1` koşumunda log "20" der, `pgrep -fc redis-cli` **5** gösterir.                                                                                                                                                         | borç satırı                                                                                                                                                                                                         |
| low        | `scripts/tsconfig.json:33`                                                  | `include: ["*.ts", "playwright/*.ts"]` **tek seviye**. `po`'nun düzeltme notunun kapattığı kör nokta bir alt dizin derinliğinde **geri geliyor**; `**/*.ts` sınıfı kalıcı kapatırdı.                                                                                                                                                                                                                                   | `scripts/playwright/helpers/x.ts` + kasıtlı tip hatası ⇒ `check_scripts_typecheck` **YEŞİL** (dosyayı hiç görmez), `check_scripts_eslint` _"not in project"_ ile kırmızı ⇒ çelişkili sinyal.                                                          | borç satırı                                                                                                                                                                                                         |
| low        | `scripts/guards.sh:605-606`                                                 | Pin okuması `head -n 1` ile `auth-budget.ts`'in **metin sırasına** bağlı: `AUTH_IP_LIMITS`, `SPEC_AUTH_COST`'tan **önce** olmak zorunda (yazılı değil).                                                                                                                                                                                                                                                                | İki bildirimin yerini değiştir (davranışsız düzenleme) ⇒ pin `3` okunur, _"signIn (3) … LOGIN_IP_LIMIT ile UYUŞMUYOR"_ ⇒ **yanlış kırmızı**.                                                                                                          | borç satırı                                                                                                                                                                                                         |
| low        | `turbo.json:132-136`                                                        | `test:e2e`'nin `passThroughEnv`'i yalnızca `ARKESOFT_PANEL_DEV_API_TARGET`. İki fabrika çalışma zamanında `POSTGRES_PORT`/`POSTGRES_USER`/`POSTGRES_DB` (ve `DOCKER_HOST`) **okuyor** (`tenant-cleanup.ts:100-102`, `custom-domain-tenant.ts:56-58`) — turbo strict env bunları siler. ⚠ `ARKESOFT_PANEL_E2E_PORT`/`ARKESOFT_STOREFRONT_E2E_PORT` **zaten kayıtlı borç** (S9c bilinçli kapsam dışı), tekrar yazılmadı. | `POSTGRES_PORT=5433 pnpm test:e2e` ⇒ turbo siler ⇒ fabrika 5432'yi yayınlayan konteyneri arar ⇒ fail-closed _"hiçbir Docker konteyneri bulunamadı"_. **Gürültülü** düştüğü için `low`.                                                                | borç satırı                                                                                                                                                                                                         |
| low        | `apps/storefront/e2e/visual/visual-port.ts:24-26,33-35`                     | `resolveStorefrontVisualPort`/`storefrontVisualUrl` gövdeleri `e2e-port.ts:14-16,23-25` ile **birebir** (yalnızca sabit farklı). Dosya başı gerekçesi **ayrı sabiti** savunuyor, ayrı **fonksiyonu** değil. Ek olarak `Number(override)` doğrulamasız (emsalden devralındı).                                                                                                                                           | (i) Şema `https`'e dönerse **iki dosya da** değişmek zorunda ⇒ aynı sebeple değişen iki yer. (ii) `ARKESOFT_STOREFRONT_VISUAL_PORT=abc` ⇒ `http://…:NaN/`.                                                                                            | borç satırı                                                                                                                                                                                                         |
| low        | `scripts/run-visual.sh:126`                                                 | Sabit `/tmp/arkesoft-run-visual-pull.log`; **aynı script** satır 204'te `mktemp` kullanıyor ⇒ kendi içinde tutarsız.                                                                                                                                                                                                                                                                                                   | Başka kullanıcıya ait/salt-okunur bir `/tmp/arkesoft-run-visual-pull.log` varsa yönlendirme düşer ve `fail "docker pull … başarısız"` **yanlış teşhis** basar.                                                                                        | borç satırı                                                                                                                                                                                                         |
| low        | `apps/storefront/e2e/visual/storefront-templates.visual.spec.ts:43-45`      | Yardımcı tekrarı *"CLAUDE.md §4, dosyalar arası bağımsızlık ilkesi"*ne dayandırılıyor — CLAUDE.md'de **böyle bir ilke yok**.                                                                                                                                                                                                                                                                                           | `grep -n "bağımsızlık" CLAUDE.md` ⇒ **0 eşleşme**. Yanlış kural atfı (yorum kalitesi).                                                                                                                                                                | borç satırı                                                                                                                                                                                                         |

---

## Temiz çıkan eksenler (ölçülerek)

1. **`base.ts` derin birleştirme + ikinci native merge yasağı (S4 kısıtı) — TUTMUŞ.**
   Her iki config de `createPlaywrightBaseConfig(...)`'ı **tek kez** çağırıyor
   (`apps/admin/playwright.config.ts:88`, `apps/storefront/playwright.config.ts:95`);
   ikinci `defineConfig(a,b)` **yok**. Birleştirme doğru: `expect` sığ yayılıyor ama
   `toHaveScreenshot` **ayrıca** derin birleştiriliyor (`base.ts:104-114`), tüketicinin
   anahtarları `...overrides.expect?.toHaveScreenshot` ile **sonda**. Bugün hiçbir tüketici
   `expect` override'ı vermiyor ⇒ `animations`/`caret`/`scale` kaybı **yok**.
2. **`any` / `@ts-ignore` / gerekçesiz `as`:** yeni `.ts` dosyalarında **sıfır**. Taranan
   yüzeyde bulunan tek `as` sınıfı (`as Record<string, unknown>`) tip **guard'larının**
   içinde ve T-019'un dosyalarına ait.
3. **`run-visual.sh` hata yönetimi:** `set -euo pipefail`; `fail()` her yolda `exit 1`;
   `trap cleanup EXIT`; son satır `exit "$PLAYWRIGHT_EXIT_CODE"`. **`exit 0` ile sessiz
   geçiş yok** (ADR yasağı korunmuş). `|| true` kullanımlarının **hepsi** ardından boşluk
   denetimiyle karara bağlanıyor (satır 108, 157, 269) ⇒ yutulan hata yok.
4. **İki `responsive` spec auth tüketmiyor.** `sign-in-layout.spec.ts` yalnızca
   `page.goto('/sign-in')` + görünürlük/taşma gözlemi; `home-layout.spec.ts` seed'deki
   `demo-magaza`'ya salt-okunur `goto`. İkisinde de form **gönderilmiyor**.
5. **`ci.yml` `e2e` job'u — çıkarılacak ikinci aday YOK.** Ortak dört adım zaten
   composite (`start-queue-redis`, `setup-workspace`, `prepare-db`). `services:` blokları
   (postgres+mailpit) `api` ile birebir ama **composite action `services:` tanımlayamaz**
   ve GitHub Actions YAML **anchor** desteklemez ⇒ tekrar yapısal, kaçınılamaz.
   "apps/api'yi arka planda başlat + probla" adımı bugün **tek** job'da ⇒ erken soyutlama
   olurdu.
6. **Bağımlılık yönü / döngü:** `scripts/playwright/base.ts` **hiçbir** iç paketi ithal
   etmiyor (yalnızca `@playwright/test`) ⇒ `apps → scripts` tek yönlü, döngü yok.
   `apps/*` → `scripts/*` yönü CLAUDE.md §3'te tanımlı değil ama **ADR-0022 Karar 6**
   ile açıkça karara bağlandı — yeniden açılmadı.
7. **Dört bütçe değişmezinin üçü totolojik DEĞİL** (mutasyonla düşünüldü): yeni spec
   (kapsama), `responsive/`'e jeton (çarpan), `signUp` şişirme (toplam) ve
   `LOGIN_IP_LIMIT` kayması (guards pin tazeliği) **dördü de ilgili assert'i kırıyor**.
   Tek **kırmayan** mutasyon yukarıdaki medium bulgusunda (`visual/` dizini).
8. **İsimlendirme:** yeni dosyaların tamamı kebab-case; sabitler SCREAMING_SNAKE
   (`DEFAULT_VISUAL_PORT`, `AUTH_IP_LIMITS`, `E2E_FIXTURE_EMAIL_PATTERN`); boolean
   `isVisualRun` **önekli**; tip/arayüz PascalCase. `data`/`temp`/`handle`/`process`
   sınıfı belirsiz ad **yok**.
9. **Zaten karara bağlanmış maddeler** (`scripts/` yerleşimi · iki kopya fabrika ·
   `docker exec psql` · referans PNG yeri · `--concurrency=1` · `reuseExistingServer:
false` · yük üreteci ayarları) **yeniden açılmadı**. İki kopya fabrikanın **sapması**
   ölçüldü ve yukarıda high olarak **sapmanın boyutu** üzerinden yazıldı, "DRY ihlali"
   olarak değil.
10. **Mailpit yardımcılarının üç kopyası** (`panel-flow` · `session-security…` ·
    `helpers/verified-fixture-user.ts`) **T-019'un kayıtlı borcu**
    (`verified-fixture-user.ts:4-13` borç satırını kendisi beyan ediyor) ⇒ yeni bulgu
    yazılmadı.

---

## DOĞRULANAMADI

`Bash` aracım **yok**; aşağıdakiler **çalıştırılmadı**, uydurulmadı:

- `pnpm guards` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` /
  `pnpm test:visual` **koşturulmadı** ⇒ yukarıdaki negatif kanıtlar **mutasyon
  tarifleridir**, çalıştırılmış ölçüm değildir.
- `git diff` koşulamadı ⇒ inceleme yüzeyi handoff'un **dosya listesinden** kuruldu;
  listede olmayan bir değişiklik gözden kaçmış olabilir.
- Görsel referans PNG'lerinin **içeriği** (4 dosyanın varlığı `Glob` ile doğrulandı:
  `home|not-found` × `storefront-visual-desktop|mobile`) ve AC-8 mutasyonunun kırıcılığı
  **yeniden ölçülmedi**.

---

## ÖLÇÜMLER

- **İncelenen dosya:** 27 (24'ü tam okuma; `ci.yml` iki job, `guards.sh` dört fonksiyon,
  `docs/testing.md` üç bölüm kısmi).
- **Bulunan `any`:** **0** · `@ts-ignore`/`@ts-expect-error`: **0** ·
  `eslint-disable`: **0** (yeni `.ts` yüzeyinde).
- **En büyük fonksiyon:** TS — `resolvePostgresContainerName`
  (`apps/admin/e2e/fixtures/tenant-cleanup.ts:119-163`, **45 satır**, yorum/hata metni
  dahil). Shell — `check_adr22_k1d_shellout_boundary`
  (`scripts/guards.sh:668-723`, **56 satır**).
- **Bulgu dağılımı:** high **1** · medium **2** · low **8**.
