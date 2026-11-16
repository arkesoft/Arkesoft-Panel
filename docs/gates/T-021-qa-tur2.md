# T-021 — `qa` gate, Tur 2 (TAM yeniden denetim)

- **Tarih:** 2026-11-16
- **Sürüm:** ROADMAP v0.0.20 (süper admin iskeleti)
- **Önceki rapor:** `docs/gates/T-021-qa-tur1.md` (FAIL, 1 `high`)
- **Kapsam:** TAM yeniden denetim (tur 1 FAIL kuralı gereği) + ⚠⚠ İŞ①-④ + 13 AC'nin
  hepsinin yeniden canlı doğrulanması. Araçlar: `Read`/`Write`/`Bash` — komutlar
  **gerçekten koşturuldu**.

```
GATE: qa
SONUÇ: FAIL
BULGULAR:
  - [SEV: high] apps/api/src/__tests__/normalize-request-path-trpc-invariant.test.ts:212 — `pnpm lint` CANLI KOŞTURULDU (kök, bu turda), KIRMIZI: `@typescript-eslint/array-type` kuralı `Array<{ readonly rawUrl: string; readonly trpcResolved: string; readonly normalized: string; readonly expected: string }>` yazımını reddediyor ("Array type using 'Array<T>' is forbidden. Use 'T[]' instead"). Bu dosya `security` tur 3/4'ün F8 mutasyon-değişmezlik testidir (DoD İŞ①, 816 kombinasyon), mtime 12:55 — yani `qa` tur 1 (03:12) ve `solid` tur 2 (09:45) raporlarının "lint 0 hata" iddiasından SONRA, FIX turu 4 (`security` tur 4, 13:21) civarında/öncesinde eklendi veya düzenlendi. `security` tur 4 kendi ölçümünde "hedefli vitest: 6 dosya/129 test" diyor — kök `pnpm lint`'i KOŞTURMADI, bu yüzden hata kaçtı. REPRODUCIBLE: `pnpm lint` (kök, 2 bağımsız koşum) VE `pnpm --filter @arkesoft/api lint` (izole, 1 ek koşum) ÜÇÜNDE DE AYNI tek hata, deterministik. ⇒ **AC-12'nin "altı kapı" şartı şu an karşılanmıyor** — `typecheck`/`build`/`format:check`/`test`/`test:isolation`/`guards` hepsi yeşil (aşağıda ayrıntılı), ama `lint` kırmızı. Bu, "kabul kriteri çalıştırılmadan versiyonu bitti ilan etmek" (CLAUDE.md §10 md 5) sınıfına girer — kod hatası küçük (bir satırlık tip yazımı) ama AC-12'yi KARŞILAMIYOR. — Düzeltme: `Array<{...}>` → `{...}[]` (davranış değişikliği YOK, salt sözdizimi). — Sorumlu: security (dosya sahibi, F8 DoD) veya backend (eşgüdüm).
ÖLÇÜMLER: aşağıda ayrıntılı
```

**FAIL kuralı uygulaması (AGENT_BASELINE §4):** 1 `high` ⇒ **FAIL**, düzeltme turu açar.
⚠ Bu `high` İŞ①-④'ün HİÇBİRİYLE ilgili değil — tur 1'in kapsamında yoktu, FIX
turlarının (özellikle FIX 4/security tur 3→4) bir yan etkisi olarak bu turda canlı
koşumda ortaya çıktı. **İŞ①-④'ün DÖRDÜ DE bu turda KAPANDI** (aşağıda) — gate'in FAIL
olmasının nedeni münhasıran bu tek, mekanik, bir-satırlık lint hatasıdır.

---

## 0. ÖZET — bu turun dört özel işi

| İş                                                                                           | Sonuç                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **①** Kendi spec'im (`sidebar-focus-return.qa.spec.ts:104`) yanlış bekleyişi assert ediyordu | ✅ **DÜZELTİLDİ** (test düzeltmesi, gevşetme DEĞİL) — canlı tekrar koşturuldu, **2/2 PASS**                                                                                                               |
| **②** Kök `pnpm test:e2e` üç uygulamayı birlikte yeşil koştursun                             | ✅ **BAŞARILDI** — tek komut, **44/44 test PASS** (admin 23 + superadmin 6 + storefront 15), **36.4s**                                                                                                    |
| **③** Süre anomalisi (admin 1.3 saat vs S9'un 21.4s) kök nedeni ölç                          | ⚠ **DOĞRULANAMADI** (tam kök neden) — ama **yeniden ÜRETİLEMEDİ**: iki bağımsız tam koşum **42.5s** ve **36.4s** sürdü, S9'un ölçümüyle AYNI mertebede. Ayrıca YENİ bir yapısal risk ölçüldü (aşağıda §3) |
| **④** `pnpm test:isolation`'ın açıklanamayan `9/11`'i tekrar eder mi                         | ⚠ **DOĞRULANAMADI** (kök neden) — ama **5 EK ardışık koşum, 0/5 kırmızı** (toplam tur1+tur2 = **10 ardışık yeşil**, tek kırmızı olay hâlâ izole)                                                          |

---

## 1. İŞ① — Spec düzeltmesi (gevşetme DEĞİL, DOĞRU hedefe çevirme)

### 1.1 Teşhis doğrulandı

`apps/superadmin/src/components/Sidebar.tsx:139-146,157-163` okundu (canlı) —
FIX turu 2/3 bağlantı `onClick` handler'larından `focusToggle()` çağrısını **gerçekten
kaldırmış**, yalnızca `setIsMobileNavOpen(false)` kalmış; dosya başı yorum (`:21-31`)
bu kararı `qa` tur 1'in ölçümüne atıfla açıklıyor.

`apps/superadmin/src/routes/_app.denetim-kaydi.tsx:16-22` okundu (canlı) — `headingRef`
`tabIndex={-1}` ile mount `useEffect`'inde `.focus()` çağrılıyor; T-016'dan beri
tutarlı SPA odak deseni (wcag tur 2'nin BAĞIMSIZ tespitiyle birebir aynı).

⇒ **wcag tur 2'nin kararına KATILIYORUM, çürütmüyorum.** Link seçiminde odağın hedef
sayfanın `h1`'ine gitmesi doğru WCAG 2.4.3 davranışı; toggle'a dönüş beklemek ölü bir
çağrı icat eder (`qa` tur 1 zaten ölçmüştü).

### 1.2 Düzeltme uygulandı

`apps/superadmin/e2e/sidebar-focus-return.qa.spec.ts:85-122` — ikinci testin adı ve
`:104`'teki assertion değiştirildi:

```diff
- test('Bağlantı seçimi — mobil nav kapanınca odak toggle düğmesine döner', ...)
+ test('Bağlantı seçimi — mobil nav kapanınca odak hedef sayfanın başlığına geçer', ...)
  ...
- await expect(toggleButton).toBeFocused()
+ await expect(page.getByRole('heading', { level: 1, name: 'Denetim kaydı' })).toBeFocused()
```

⚠⚠ **Bu bir GEVŞETME DEĞİL** — assertion silinmedi, kaldırılmadı, zayıflatılmadı;
**doğru hedefe** çevrildi (CLAUDE.md §10 md 6 ihlal edilmiyor). Dosya başı yorumu da
güncellendi (qa tur 2 düzeltmesinin gerekçesi + wcag tur 2 atfı).

### 1.3 Canlı doğrulama (izole, tekrarlanabilir)

```bash
$ npx playwright test sidebar-focus-return.qa.spec.ts   (apps/superadmin, 13:32:46)
  ✓ 1 Escape — mobil nav kapanınca odak toggle düğmesine döner (674ms)
  ✓ 2 Bağlantı seçimi — mobil nav kapanınca odak hedef sayfanın başlığına geçer (349ms)
  2 passed (4.2s)
```

**2/2 PASS.** `pnpm --filter @arkesoft/superadmin lint` ve `npx prettier --check` de
bu dosya için temiz (aşağıda §4).

---

## 2. İŞ② — Kök `pnpm test:e2e` üç uygulamayı birlikte yeşil

### 2.1 İlk koşum (düzeltmeden ÖNCE, 13:26:08) — KIRMIZI, ama BEKLENENDEN FARKLI nedenle

```
$ pnpm test:e2e (env override'larıyla)
@arkesoft/admin:test:e2e       23 passed (24.9s)
@arkesoft/superadmin:test:e2e  5 passed, 1 FAILED (sidebar-focus-return.qa.spec.ts:104 — İŞ①'in eski hatası)
[ELIFECYCLE] Command failed with exit code 1.
Tasks: 9 successful, 10 total
Time: 42.51s
```

⚠⚠ **KRİTİK ÖLÇÜM:** `@arkesoft/storefront#test:e2e` bu koşumda **hiç çalışmadı** —
ne kendisi ne bağımlılıkları (`themes-modern:build` dahil) günlükte **bir kez bile**
göründü. ✅ Kök neden MEKANİK olarak izole edildi: `./node_modules/.bin/turbo run
test:e2e --dry=json` → `@arkesoft/storefront#test:e2e` görev grafiğinde GERÇEKTEN VAR
(gerçek komut, gerçek `dependsOn`), ama `turbo run --help` → `--continue` bayrağının
**varsayılanı `never`** ("cancel all tasks" bir hata oluştuğunda). `pnpm test:e2e` =
`turbo run test:e2e --concurrency=1` — **`--continue` HİÇ belirtilmemiş**, yani
varsayılan `never` geçerli. Bu koşumda turbo'nun topolojik sırası admin→superadmin→
storefront idi; superadmin başarısız olunca turbo storefront'u (ve bağımlılıklarını)
**hiç planlamadan** iptal etti. Bu, tur 1'in İKİ koşumunda storefront'un GERÇEKTEN
çalışıp (webServer timeout ile) kırmızı olmasından **farklı bir başarısızlık sınıfı** —
tur 1'de erken bir paket başarısız olmadığı için storefront'a sıra geldi ve kendi
hatasıyla düştü; bu turun ilk koşumunda ise storefront'a **sıra bile gelmedi**.

⇒ **YENİ RİSK (aşağıda §3'te ayrıca işlenir):** `--continue=never` varsayılanı, kök
`pnpm test:e2e`'nin "üç uygulama birlikte yeşil" iddiasını **tek yönlü** kanıtlıyor —
exit 0 ⇒ üçü de GERÇEKTEN çalıştı ve geçti (güvenilir), ama exit ≠ 0 ⇒ hangi
paket(ler)in GERÇEKTEN test edilip başarısız olduğu, hangilerinin HİÇ denenmediği
**günlüğü elle okumadan bilinemez**. `devops` için borç olarak §3'te yazıldı.

### 2.2 İkinci koşum (düzeltmeden SONRA, 13:39:40) — ✅ TAM YEŞİL

```bash
$ env ... ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3100 \
         ARKESOFT_SUPERADMIN_DEV_API_TARGET=http://127.0.0.1:3100 \
         STOREFRONT_API_BASE_URL=http://127.0.0.1:3100 \
         APP_BASE_DOMAIN=arkesoft.localhost \
  pnpm test:e2e
```

```
@arkesoft/admin:test:e2e        23 passed (21.4s)
@arkesoft/superadmin:test:e2e    6 passed (5.9s)   ← İŞ①'in düzeltmesi dahil
@arkesoft/storefront:test:e2e   15 passed (6.5s)
Tasks:    12 successful, 12 total
Cached:    8 cached, 12 total
Time:     36.441s
EXIT=0
```

⇒ **AC-3 — "üç uygulamayı birlikte yeşil koştur" — TEK KOMUTLA, CANLI, KANITLANDI.**
Toplam **44/44 test PASS**, tek `pnpm test:e2e` çağrısı, **36.4 saniye**.

**Bütçe notu (şeffaflık için):** bu iki koşum + ayrıca İŞ①'in izole doğrulaması
`EMAIL_IP_LIMIT` (10/saat) bütçesini **tükettim** (9/10 → 10/10, canlı Redis'te
ölçüldü). `pnpm test`/`pnpm test:isolation` koşumları SONRASINDA (bu testlerin Redis
temizleme/flush rutini olduğu için — kesin mekanizma doğrulanmadı ama gözlem budur)
sayaç **kendiliğinden sıfırlandı** (TTL `-2`, anahtar yok) ve ikinci tam koşumu bu
sayede YENİDEN sign-up bütçesi harcayarak tamamlayabildim. Redis anahtarı **silinmedi**,
limit **değiştirilmedi** — talimatlara uyuldu.

---

## 3. İŞ③ — Süre anomalisi

**Orkestratör'ün ölçümü:** admin e2e **1.3 SAAT**. **S9'un ölçümü:** admin e2e
**21.4 SANİYE** (~200 kat fark).

**Bu turda ÖLÇÜLEN (üç bağımsız koşum):**

| Koşum                                              | admin | superadmin     | storefront        | toplam    |
| -------------------------------------------------- | ----- | -------------- | ----------------- | --------- |
| Kök #1 (13:26, eski spec, storefront iptal edildi) | 24.9s | 13.0s (1 FAIL) | — (hiç çalışmadı) | 42.5s     |
| storefront tek başına (13:31)                      | —     | —              | 6.7s              | —         |
| Kök #2 (13:39, düzeltilmiş spec)                   | 21.4s | 5.9s           | 6.5s              | **36.4s** |

⇒ **Anomali bu turda YENİDEN ÜRETİLEMEDİ.** Üç bağımsız ölçüm de S9'un **21.4
saniyelik** emsaliyle AYNI mertebede (10-40 saniye bandı), **1.3 saatlik** değerden
**~100-200 kat** uzak. Ölçüm koşulları raporlanır (AGENT_BASELINE §4 ders 2):
`load averages: 3.19-4.06` (Orkestratör'ün koşumuyla **karşılaştırılabilir** —
`security` tur 4 `6.17` ölçmüştü, bu daha sakin), **25 docker konteyner** (sabit).

**Elenen hipotezler (ölçülerek):**

- **Retry:** `scripts/playwright/base.ts:123` → `retries: overrides.retries ?? 0`;
  `guards`'ın "Playwright retries tek-kaynak taraması" adımı PASS — hiçbir config
  `retries` eklemiyor. ⇒ Retry anomaliyi AÇIKLAMIYOR.
- **webServer bekleme:** `timeout: 30_000` (admin/superadmin), tek sefer,
  `reuseExistingServer: false` (her koşum kendi vite'ını açar) — bu da 1.3 saati
  açıklayacak bir mertebe üretmez (30s × birkaç deneme ≠ saatler).
- **Turbo cache poisoning:** `test:e2e` `cache: false` (AGENT_BASELINE §4 ders 3'ün
  tam konusu) — her iki koşumda da "cache bypass, force executing" günlüğü GÖRÜLDÜ
  (admin/superadmin/storefront'un üçü de) ⇒ sahte-yeşil/sahte-gecikme riski YOK.

⇒ **DOĞRULANAMADI** (tam kök neden — Orkestratör'ün 1.3 saatlik koşumunu bizzat
gözlemleyemedim, yalnızca onu YENİDEN ÜRETEMEDİĞİMİ kanıtlayabilirim). Ama **yeni,
ölçülmüş bir yapısal risk** bulundu ve `low` borç olarak yazılıyor (FAIL'e sebep
OLMUYOR, tek başına):

> **[SEV: low]** `package.json:20` (`"test:e2e": "turbo run test:e2e --concurrency=1"`) — `--continue` bayrağı belirtilmemiş, varsayılan `never` ⇒ paketler arası bir başarısızlık, KENDİSİYLE İLİŞKİSİZ sonraki paketlerin (örn. admin'deki bir flake storefront'un) **hiç çalışmasını önler** ve bu DURUM günlükte sessiz kalır (yalnızca "Tasks: N successful, M total" sayısı küçülür, hangi paketin eksik olduğu ayrı ayrı okunmalı). Bu turda tam olarak gözlendi (§2.1). — Düzeltme: `--continue=dependencies-successful` eklenmesi düşünülebilir (bağımsız paketlerin birbirini engellemesini önler, AC-3'ün "birlikte" koşulmasını güvenilir KILAR — şu an "yeşilse güvenilir, kırmızıysa eksik bilgi verir" durumda). — Sorumlu: devops · vade: v0.0.20.1 veya ilk `turbo.json` dokunuşu.

---

## 4. İŞ④ — `pnpm test:isolation`'ın açıklanamayan `9/11`'i

**5 EK ardışık koşum** bu turda yapıldı (13:37:41 - 13:38:41):

```
RUN 1: db 7/7 (82 test) + api 6/6 (31 test) — 11/11 görev PASS, 12.145s
RUN 2: aynı — 11/11 PASS, 11.691s
RUN 3: aynı — 11/11 PASS, 11.497s
RUN 4: aynı — 11/11 PASS, 11.649s
RUN 5: aynı — 11/11 PASS, 12.19s
```

Her koşumda test SAYISI da doğrulandı (varlık değil): `db` 82/82 (aynı 8 dosya adı,
aynı test adedi her satırda), `api` 31/31 — **beş koşumun beşinde de birebir aynı**.

⇒ **Kümülatif: tur 1'in 5'i + bu turun 5'i = 10 ardışık yeşil, 0 kırmızı.** Tek geçmiş
kırmızı olay (`9/11`) hâlâ **1 kırmızı / 15 toplam koşum (≈%6.7)**. AGENT_BASELINE §4
ders 1'in aritmetiğiyle: gerçek flake oranı ~%7 olsaydı 15 koşumun TAMAMEN yeşil
gelme olasılığı ~%34 — **düşük ama imkânsız değil**; "flake değilmiş" diye KAPATMIYORUM.
⚠ **Nedensel açıklama bacağı hâlâ eksik** — orijinal kırmızı koşumun hangi dosya/
`expect` ile düştüğü bu turda da bana **verilmedi** (handoff yalnızca "9/11" taşıyor,
ham Playwright/Vitest çıktısı yok). ⇒ **DOĞRULANAMADI** (kök neden) — tahminle
kapatılmadı, ölçülmüş haliyle bırakıldı.

---

## 5. 13 AC'NİN TAMAMI — YENİDEN CANLI DOĞRULAMA

| AC    | Kriter (özet)                                                          | Bu turda yeniden doğrulama                                                                                                                                                                                                       | Sonuç                                       |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| AC-1  | build exit 0; `dev`+`test:e2e` script var; dev port 200                | `pnpm build` kök koşumunda `@arkesoft/superadmin:build` **PASS** (bundle-budget çıktısıyla); e2e `webServer` superadmin'i **2 kez** başarıyla ayağa kaldırdı (6/6 test geçti → port 200 zorunlu önkoşul)                         | **PASS**                                    |
| AC-2  | ≥2 `@arkesoft/ui` import; `packages/ui` bağımlılık kazanmaz            | `grep -rn "@arkesoft/ui" apps/superadmin/src` (e2e/test hariç) → **14** eşleşme · `git status --porcelain packages/ui` → **BOŞ** (canlı, bu turda)                                                                               | **PASS**                                    |
| AC-3  | Kök `test:e2e` superadmin'i koşturur + (elevated) üç uygulama birlikte | §2.2 — **tek komut, 44/44 test, 36.4s, admin+superadmin+storefront ÜÇÜ DE**                                                                                                                                                      | **PASS** (tur 1'in FAIL'i TERSİNE ÇEVRİLDİ) |
| AC-4  | 2FA'sız yönetici (a) kuruluma yönlenir (b) 403                         | `superadmin-authz.spec.ts` AC-4(a)/(b) — **iki tam koşumda da PASS** (13:26 ve 13:39)                                                                                                                                            | **PASS**                                    |
| AC-5  | Enum değişmez; platform yöneticiliği kiracı rolü değil                 | `permissions-catalog.test.ts` + `platform-authz.isolation.test.ts` blok C — `pnpm test` (812/812) ve `pnpm test:isolation` (×5) içinde yeşil                                                                                     | **PASS**                                    |
| AC-6  | Yüzey sayılabilir; 5 rol × her uç → 403; boş/yazılmamış uç → kırmızı   | `platform-authz.isolation.test.ts` blok A (9 test, 5× tekrarlı koşumda yeşil); mutasyon kanıtı S5'in Task log'unda (bu turda yeniden üretilmedi — tur 1/solid/security zaten doğruladı, düşük risk)                              | **PASS**                                    |
| AC-7  | ≥2 kiracı gerçek değerlerle; sıra deterministik                        | `superadmin-flow.spec.ts` AC-7 testi — **2/2 tam koşumda PASS**, `toHaveText` ile                                                                                                                                                | **PASS**                                    |
| AC-8  | Giriş+impersonation satırı; count = öncesi+2                           | `superadmin-flow.spec.ts` AC-8 testi — **2/2 tam koşumda PASS**, sayarak                                                                                                                                                         | **PASS**                                    |
| AC-9  | (1) yapısal zorunlu param (2) mekanik tek-çağrı kapı (3) N⇒tam N       | `platform-impersonation-write-gate.test.ts` + `platform-impersonation-audit-count.test.ts` — `pnpm test` (812/812) içinde yeşil; mutasyon kanıtı `security` tur 1-4'te bağımsız doğrulanmış (tekrar üretilmedi, düşük risk)      | **PASS**                                    |
| AC-10 | 0 BYPASSRLS/superuser; `f\|f`                                          | **Canlı psql (bu turda)**: `arkesoft_app\|f\|f`, `arkesoft_auth\|f\|f`, `arkesoft_migrator\|f\|f`                                                                                                                                | **PASS**                                    |
| AC-11 | Gerekçe/süre/uyarı YOK, pinlenir                                       | `platform-audit-entry-negative-scope.test.ts` (5 test) — `pnpm test` içinde yeşil; `platform.impersonate` mutation'ı yapısal olarak yok                                                                                          | **PASS**                                    |
| AC-12 | 6 kapı + `format:check`; turbo önbellek durumu                         | **`lint` KIRMIZI** (yukarıdaki `high` bulgu, 2 bağımsız koşumda deterministik); `typecheck`/`build`/`test`/`test:isolation`/`guards`/`format:check` hepsi **YEŞİL** (§6)                                                         | **FAIL** (yalnızca `lint`)                  |
| AC-13 | `passThroughEnv` 3 e2e port değişkenini bildirir                       | `turbo.json:186-197` → **10** değişken, üçü de (`ARKESOFT_PANEL_E2E_PORT`, `ARKESOFT_STOREFRONT_E2E_PORT`, `ARKESOFT_SUPERADMIN_E2E_PORT`) **VAR**; `STOREFRONT_API_BASE_URL` da artık listede (tur 1'in `high`'ının düzeltmesi) | **PASS**                                    |

**Karşılıksız AC yok — 13/13 bir teste eşlendi.** Net sonuç: **12/13 PASS, 1/13 FAIL
(AC-12, münhasıran `lint`)**.

---

## 6. ÖLÇÜMLER

### KOŞTURULAN KOMUTLAR

| Komut                                                                                 | Exit       | Özet                                                                                                                  | Turbo önbellek durumu                                           |
| ------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm lint` (kök, 2× — ilk + izole `--filter api`)                                    | **1** (×2) | `@arkesoft/api:lint` KIRMIZI (`array-type`), diğer 22 paket PASS                                                      | 21/23 cached, 2 miss (api + superadmin — yeni/değişen dosyalar) |
| `pnpm typecheck` (kök)                                                                | 0          | 23/23 paket PASS                                                                                                      | 21/23 cached                                                    |
| `pnpm build` (kök)                                                                    | 0          | 14/14 paket PASS, superadmin bundle-budget raporlandı                                                                 | 12/14 cached                                                    |
| `pnpm format:check` (kök)                                                             | 0          | prettier temiz (`sidebar-focus-return.qa.spec.ts` dahil)                                                              | n/a (cache yok, prettier doğrudan)                              |
| `pnpm guards`                                                                         | 0          | **19/19** mekanik adım PASS (yeni "e2e env passthrough — T-021 İŞ③" adımı dahil, devops'un eklediği 19. adım)         | n/a (shell script, turbo değil)                                 |
| `pnpm test` (kök)                                                                     | 0          | 21/21 turbo görevi; `@arkesoft/api` **812/812** (101 dosya, tur1'den +25 test — FIX turlarının yeni testleri)         | 9/21 cached                                                     |
| `pnpm test:isolation` × 5 (ardışık, bu turda)                                         | 0 (×5)     | her koşumda **11/11** görev, **113/113** test (82 db + 31 api), sayı HER koşumda birebir doğrulandı                   | 9/11 cached (db+api test:isolation `cache:false`)               |
| `pnpm test:e2e` (kök, eski spec, 13:26)                                               | 1          | admin 23/23 PASS + superadmin 5/6 PASS (İŞ①'in eski hatası) + **storefront HİÇ ÇALIŞMADI** (`--continue=never`, §2.1) | cache bypass (test:e2e `cache:false`)                           |
| `npx turbo run test:e2e --dry=json`                                                   | 0          | storefront#test:e2e'nin GERÇEK görev olduğunu doğruladı (37 "phantom" + gerçek görev ayrımı)                          | n/a (dry-run)                                                   |
| `pnpm --filter @arkesoft/storefront test:e2e` (izole, 13:31)                          | 0          | **15/15 PASS**, 6.7s                                                                                                  | cache bypass                                                    |
| `npx playwright test sidebar-focus-return.qa.spec.ts` (izole, apps/superadmin, 13:32) | 0          | **2/2 PASS** (İŞ①'in düzeltmesi doğrulandı)                                                                           | n/a                                                             |
| `pnpm test:e2e` (kök, düzeltilmiş spec, 13:39)                                        | **0**      | **admin 23 + superadmin 6 + storefront 15 = 44/44 PASS, 36.4s**                                                       | 8/12 cached                                                     |
| Canlı `psql` (AC-10)                                                                  | —          | `rolsuper\|rolbypassrls` → `f\|f` × 3 rol                                                                             | —                                                               |
| Canlı `redis-cli` (bütçe teşhisi)                                                     | —          | `EMAIL_IP_LIMIT` sayaçı 9→10, sonra kendiliğinden sıfırlandı (TTL −2)                                                 | —                                                               |
| `pnpm --filter @arkesoft/superadmin lint`                                             | 0          | temiz (yeni dosya dahil)                                                                                              | —                                                               |
| `npx prettier --check apps/superadmin/e2e/sidebar-focus-return.qa.spec.ts`            | 0          | temiz                                                                                                                 | —                                                               |

### TEST SAYILARI

- **Yeni eklenen (bu tur, `qa`):** 0 yeni dosya — **1 mevcut dosya düzeltildi**
  (`sidebar-focus-return.qa.spec.ts`, 1 assertion + 1 test adı, 2 test SAYISI
  değişmedi).
- **Toplam geçen (bu turda canlı koşturulan, kümülatif):** `pnpm test` 812 ·
  `pnpm test:isolation` 113×5 (565, hepsi PASS) · `pnpm test:e2e` toplam 44 (tek
  komut, tam yeşil) + storefront izole 15 + sidebar-focus-return izole 2 (üst
  kümenin alt kümeleri, çift saymaya dikkat edildi).
- **Toplam başarısız (gerçek, kod hatası):** **0** test başarısızlığı YOK bu turda
  (İŞ①'in eski hatası ZATEN düzeltildi, yeniden üretilmedi).
- **Toplam başarısız (mekanik, lint):** **1** — `normalize-request-path-trpc-
invariant.test.ts:212`, `high` bulgu olarak yazıldı.

### Mutasyon (negatif) kanıtı — bu turda DOĞRULANAN

- İŞ① — Escape yolu PASS, (artık doğru hedefe çevrilmiş) bağlantı yolu PASS; eski
  (yanlış) assertion'ın FAIL verdiği canlı günlükte kayıtlı (§2.1) — düzeltmenin
  gerçekten bir şeyi değiştirdiğinin kanıtı.
- `guards`'ın "e2e env passthrough" adımı PASS — tur 1'in `high` bulgusunun
  (`STOREFRONT_API_BASE_URL` eksikliği) artık MEKANİK olarak yakalanacağının kanıtı
  (yeni guard adımı, devops'un S9/S10'da eklediği).

---

## 7. EKSİK SENARYO TARAMASI (tekrar)

- **Tenant çapraz erişim:** değişmedi (N/A gerekçeli, tur 1'deki gibi — yeni kiracı
  tablosu yok).
- **İdempotency:** AC-9(3) — değişmedi, hâlâ kanıtlı.
- **Eşzamanlılık:** değişmedi — yazılı kabul edilmiş bedel (R-PO4), yeni bulgu yok.
- **Platform yetkisinin ANLIK iptali:** tur 1'in `low` bulgusu (grant→revoke→403
  sekansı test edilmemiş) **hâlâ açık** — AGENT_BASELINE §4 kuralına göre `low`
  bulgular düzeltme turu AÇMAZ, bu yüzden bu turda yeniden yazılmadı/eklenmedi;
  teknik borç olarak durur (`docs`'a kopyalanacak, sorumlu backend+qa).
- **Regresyon:** `pnpm test` 812/812, `pnpm test:isolation` 113/113×5, kök
  `pnpm test:e2e` 44/44 (admin+superadmin+storefront) — T-021'den ÖNCEKİ hiçbir
  davranış kırılmamış.
- **Kritik akış Playwright:** değişmedi — bu Task salt-okunur bir iç panel,
  kayıt/kur/sipariş/ödeme akışına dokunmuyor, yeni e2e GEREKMİYOR (admin'in mevcut
  `registration-flow.spec.ts`/`panel-flow.spec.ts` regresyon olarak zaten koşuyor
  ve PASS).

---

## 8. KONTROL LİSTESİ

- [x] 13/13 AC yeniden canlı doğrulandı; karşılıksız yok
- [x] Negatif senaryolar (403 matrisi, 2FA eksikliği) — değişmedi, hâlâ PASS
- [x] Tenant çapraz erişim — N/A gerekçeli (değişmedi)
- [x] Idempotency — AC-9(3) ile kanıtlı (değişmedi)
- [ ] Eşzamanlılık — yazılı kabul edilmiş bedel (değişmedi)
- [x] Regresyon — `pnpm test`/`test:isolation`/`test:e2e` tam yeşil
- [x] `pnpm test` gerçekten koştu — 812/812
- [x] `pnpm lint`/`typecheck`/`build` gerçekten koştu — **lint KIRMIZI** (yeni `high`), typecheck/build YEŞİL
- [x] Testler `skip`/`only` içermiyor (mekanik tarama: yeni/değişen test dosyalarının tamamında 0 eşleşme)
- [x] Şüpheli testler kasıtlı bozma ile doğrulandı (İŞ①'in eski/yeni hali canlı karşılaştırıldı)
- [x] Flaky davranış kontrol edildi — İŞ④, +5 koşum (toplam 10 ardışık yeşil), DOĞRULANAMADI ama ölçülmüş
- [x] ⭐ YENİ: turbo `--continue` davranışı mekanik olarak izole edildi ve borç yazıldı (İŞ③)

---

## 9. DOSYA LİSTESİ (bu turda yazılan/değiştirilen)

- `apps/superadmin/e2e/sidebar-focus-return.qa.spec.ts` — **DÜZELTİLDİ** (İŞ①: yanlış
  assertion → doğru hedef; test SAYISI değişmedi, gevşetme YAPILMADI)
- `docs/gates/T-021-qa-tur2.md` — bu rapor
- `.claude/workflow/reviews/T-021-qa-tur2.md` — bu raporun kalıcı kopyası

Hiçbir üretim dosyası (apps/api/src, packages/trpc/src, packages/db, turbo.json,
Sidebar.tsx, guards.sh vb.) **değiştirilmedi** — `high` bulgu (lint hatası)
RAPORLANDI, düzeltilmedi (sahibi `security`/`backend`).
