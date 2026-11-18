# T-020 — `qa` gate, TUR 1

- **Tarih:** 2026-11-15
- **Sürüm:** v0.0.19 (ROADMAP — Test altyapısı: Playwright ve görsel regresyon)
- **Dal:** `feat/v0.0.19-test-altyapisi` (PR #5), taban `feat/v0.0.21-surum-kayit-modeli`
- **HEAD:** `39e6abdf35942a6d3beb65cc513a4e5d14cdc5b5` (gate düzeltme turu, dokuzuncu commit)

```
GATE: qa
SONUÇ: PASS
```

PASS gerekçesi (AGENT_BASELINE §4): `critical`/`high` bulgu yok, 3'ten az `medium`
bulgu var (1 adet, aşağıda). `solid` + `security` tur 1'in `high`/`medium` bulguları
**bağımsız olarak koşturularak** (mutasyon + geri alma, gerçek komut çıktısı)
kapandığı doğrulandı.

---

## 1. 13 Kabul Kriteri — tek tek doğrulama

| AC    | Sonuç    | Kanıt (komut/dosya)                                                                                                                                                                                                                                                                                     |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | **PASS** | `pnpm guards` → `AC-1: kök package.json üçünü de tanımlıyor — test:e2e, test:visual, test:visual:update.` (17/17 koşturuldu, bu oturumda)                                                                                                                                                               |
| AC-2  | **PASS** | `grep -n -A3 '"test:e2e"\|"test:visual"' turbo.json` → ikisi de `"dependsOn": ["^build","generate"]` + `"cache": false` taşıyor                                                                                                                                                                         |
| AC-3  | **PASS** | `grep -n "name:" apps/admin/playwright.config.ts` → 2 proje (`admin-desktop`,`admin-mobile`); storefront → 4 proje (`storefront-desktop/mobile/visual-desktop/visual-mobile`)                                                                                                                           |
| AC-4  | **PASS** | `npx vitest run e2e/__tests__/auth-budget.test.ts` → 3/3 PASS + `pnpm guards`'ın pin tazeliği adımı PASS = dört değişmez. Mutasyonla doğrulandı (bkz. §3)                                                                                                                                               |
| AC-5  | **PASS** | Storefront `test:e2e` **iki kez üst üste** (DB reset YOK): satır sayıları `tenant=10/app_user=57128/tenant_membership=1558` → değişmedi (iki koşumda da). Ayrıntı §4                                                                                                                                    |
| AC-6  | **PASS** | `git ls-files apps/storefront/e2e/visual/` → 4 PNG (`home`/`not-found` × `desktop`/`mobile`), `git check-ignore` boş (commit'li)                                                                                                                                                                        |
| AC-7  | **PASS** | `scripts/playwright/base.ts:119-123` → `animations:'disabled'`, `maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO (0.002)`, `threshold: VISUAL_THRESHOLD (0.2)`, ikisi de gerekçe yorumlu                                                                                                                 |
| AC-8  | **PASS** | **Bağımsız tekrar koşturuldu** — mutasyon `#2563EB→#16A34A`: `test:visual` **2 failed** (home-desktop/mobile), geri alma (Write ile) → **4 passed**, `git diff --stat` **BOŞ**. Ayrıntı §3                                                                                                              |
| AC-9  | **PASS** | **Bağımsız tekrar koşturuldu** — yalnızca yorum eklendi: `test:visual` **4 passed** (kırmadı). Geri alındı, diff BOŞ. Ayrıntı §3                                                                                                                                                                        |
| AC-10 | **PASS** | `gh api .../runs/43713883521/artifacts` → başarısız koşumda `e2e-playwright-artifacts` **13962 byte** yüklü; başarılı koşumlarda (ör. 43731621671) artefakt YOK (`retries:0`+`video:retain-on-failure` yüzünden yakalanacak bir şey olmadığı için — R-9 azaltmasının NİYETİ budur, sessiz atlama değil) |
| AC-11 | **PASS** | `grep -n "test:e2e\|playwright" .github/ci-forbidden-tokens.txt` → yalnızca açıklayıcı YORUM satırı (`:22`), literal yasak girdi YOK; `pnpm guards` 17/17 yeşil                                                                                                                                         |
| AC-12 | **PASS** | `gh run list` + `gh run view` ile **DÖRT ayrı run ID** doğrulandı, hepsi `e2e` job'u yeşil, sıralı (çakışmasız): `43723308968`→`43724498831`→`43728274895`→`43731621671`. Ayrıntı §5                                                                                                                    |
| AC-13 | **PASS** | `docs/testing.md` — 6 başlık (`§1..§6`) var; iddialar denetlendi, doğru (bkz. §6)                                                                                                                                                                                                                       |

**Karşılıksız kriter yok — 13/13 bağımsız olarak doğrulandı.**

---

## 2. Temel kapılar — gerçek çıktı

```
pnpm guards        → 17/17 PASS (bu oturumda koşturuldu, üç kez — baseline + iki mutasyon turundan sonra)
pnpm lint           → 23/23 PASS (cache: 23 cached — commit'ten sonra değişiklik yok, geçerli)
pnpm typecheck      → 23/23 PASS (cache: 23 cached)
pnpm build          → 14/14 PASS (cache: 9 cached, 5 fresh — storefront/admin fresh çalıştı)
pnpm format:check   → temiz (prettier --check .)
pnpm test           → 725/725 PASS (92 dosya, cache bypass "force executing" teyitli — api:test fresh çalıştı)
pnpm test:isolation → 22/22 (api) + db isolation PASS (ilk deneme ENOTEMPTY — eşzamanlı vitest-cache
                      rmdir yarışı, benim kendi art arda komutlarımdan kaynaklı geçici FS hatası,
                      kod kusuru DEĞİL; retry'de temiz geçti — AGENT_BASELINE §4 flaky kuralına göre
                      bu BENİM ölçüm gürültüm, koda atfedilmiyor, aşağıda not edildi)
pnpm test:visual    → 4/4 PASS (baseline), pinli Docker imajı yerel önbellekte (3.54GB, indirilmedi)
```

---

## 3. AC-8 / AC-9 — mutasyon kanıtı (bağımsız tekrar)

**Ortam:** `packages/themes/modern/src/theme.config.ts:45`, orijinal `default: '#2563EB'`.

1. **Mutasyon (AC-8):** `'#2563EB'` → `'#16A34A'` (Write aracıyla, tam dosya yeniden
   yazılarak).
   `pnpm test:visual` → **`2 failed`** (`home-desktop`, `home-mobile`), **`2 passed`**
   (`not-found` — temaya bağımsız, beklenen), `Playwright çıkış kodu: 1`.
2. **Geri alma (Write aracıyla — `git checkout --` KULLANILMADI):** orijinal içerik
   birebir yazıldı.
   `git diff --stat packages/themes/modern` → **BOŞ**.
   `pnpm test:visual` → **`4 passed`**, çıkış kodu `0`.
3. **AC-9 (ters mutasyon):** dosyaya **yalnızca** bir yorum satırı eklendi (değer
   değişmedi).
   `pnpm test:visual` → **`4 passed`** (kırmadı — eşik gevşek değil, doğru).
   Geri alındı (Write ile), `git diff --stat packages/themes/modern` → **BOŞ**.

Sonuç: `AC-8` + `AC-9` birlikte eşiği doğru sıkıştırıyor — kabul kriterinin kendisi
artık sahte yeşil vermiyor (solid'in S6 raporunda kaydettiği düzeltme bağımsız olarak
doğrulandı).

---

## 4. AC-5 — satır sayısı değişmezliği (R-14, bağımsız ölçüm)

**Storefront `test:e2e` — iki kez üst üste, DB reset YOK (auth bütçesine katkısı
sıfır, brief kısıtına uyuldu):**

| Zaman                       | `tenant` | `app_user` | `tenant_membership` |
| --------------------------- | -------- | ---------- | ------------------- |
| Koşum 1 ÖNCESİ              | 10       | 57128      | 1558                |
| Koşum 1 SONRASI (=2 öncesi) | 10       | 57128      | 1558                |
| Koşum 2 SONRASI             | 10       | 57128      | 1558                |

**Birebir aynı** — iki ardışık koşum arasında **ve** koşumların kendi içinde net
sıfır. `storefront-host.spec.ts`/`storefront-theme.spec.ts`'in `beforeAll`/`afterAll`'da
`createCustomDomainTenantFixture()`/`deleteTenantFixture()` çağırdığı kod okuyarak
doğrulandı (`grep -n "createCustomDomainTenantFixture\|deleteTenantFixture"`) — yani bu
**vacuous değil**, her koşumda gerçekten INSERT+DELETE oluyor ve net etkisi sıfır.

**Admin `test:e2e` (23/23 PASS, bir kez — bütçe kısıtı: `EMAIL_IP_LIMIT=10/saat`, tam
koşum 6 sign-up tüketiyor, ikinci koşum brief'in talimatıyla YAPILMADI):**

| Zaman   | `tenant` | `app_user` | `tenant_membership` |
| ------- | -------- | ---------- | ------------------- |
| ÖNCESİ  | 10       | 57130      | 1558                |
| SONRASI | 10       | **57128**  | 1558                |

⚠ **Dürüst not:** `app_user` **birebir eşit değil**, net **−2**. `tenant` ve
`tenant_membership` değişmedi. Bu bir sızıntı **değil** — ters yönde (daha fazla
siliniyor): `globalTeardown`'ın `sweepOrphanedE2eFixtures()`'ı bu koşumda, bu oturumdan
önce birikmiş **iki eski orphan** e2e kullanıcısını süpürdü (biçim-regex'li, fail-closed
kapsamlı silme — ADR-0022 K1(c)). S9'un raporu "birebir aynı" derken **önceden orphan'ları
temizlenmiş bir ortamda** ölçmüştü (471 orphan önceden süpürülmüş); benim ölçümüm temiz
olmayan bir ortamda başladı ve teardown'ın kendi işini **doğru** yaptığını gösterdi. Net
sonuç: kalıcı sızıntı YOK, aksine kendiliğinden düzelen bir mekanizma VAR. Bu `AC-5`'i
**zayıflatmıyor** — storefront'un mükemmel eşitliği (harici gürültüsüz ortam) asıl kanıt,
admin'inki onu teyit ediyor.

**Redis bütçesi (admin koşumu sonrası):** `platform:auth:post-auth-sign-up-email:ip:*`
→ `GET` **6**, `post-auth-sign-in-email:ip:*` → **8** — `auth-budget.ts`'in beyan ettiği
toplamla (`6/10`, `8/20`) **birebir** eşleşti.

---

## 5. AC-12 — üç/dört ayrı CI koşumu, dürüst kayıt değerlendirmesi

Task dosyasının S9 kaydı iki run ID (`43718789011`, `43723308968`) üzerinde üç deneme
olduğunu ve _"üç ayrı koşum kimliği"_ lafzının **birebir karşılanmadığını** not etmişti;
hüküm bu gate'e bırakılmıştı.

**Bu turda `gh run list`/`gh run view` ile ölçüldü** — S9'un raporundan SONRA, gate
düzeltme turunun (`39e6abd` dahil) kendi commit'leri için **üç yeni, tamamen bağımsız
CI koşumu daha** tetiklenmiş (PR'a her push otomatik koşum tetikliyor) ve **hepsi
yeşil**:

| #   | Run ID        | Commit                                        | `e2e` job | Başlangıç → Bitiş   |
| --- | ------------- | --------------------------------------------- | --------- | ------------------- |
| 1   | `43723308968` | `87d46ed` (S9e CPU yarı doygunluk düzeltmesi) | success   | 14:14:57 → 14:26:20 |
| 2   | `43724498831` | `2830f95` (S9 kaydı — docs)                   | success   | 14:28:01 → 14:32:05 |
| 3   | `43728274895` | `030d9f4` (docs/testing.md + ROADMAP)         | success   | 15:09:19 → 15:15:01 |
| 4   | `43731621671` | `39e6abd` (gate düzeltme turu, bu HEAD)       | success   | 15:45:12 → 15:51:06 |

**Dört ayrı (database) run ID**, dördü de `e2e` job'u **success**, zaman aralıkları
**çakışmıyor** (sıralı — `R-8`'in concurrency-cancel riski devreye girmemiş). Bu, S9'un
kendi ölçtüğü iki run ID'lik durumdan **daha güçlü** bir kanıt seti ve `A-T20-1`'in
_"üç ayrı koşum kimliği"_ lafzını **birebir** karşılıyor (hatta bir fazlasıyla).

**Hükmüm:** `AC-12` **PASS**, ek/dördüncü bir koşum **istemiyorum** — zaten doğal
olarak (gate düzeltme turunun kendi push'ları sayesinde) dört bağımsız yeşil koşum
oluştu. Yük altı koşum şartı da S9'un ölçtüğü `43723308968` (ilk deneme, 25 konteyner,
load avg ölçülü) ile karşılanmış durumda; bu turdaki ek üç koşumun hiçbiri yük
üretecini açmadı (depo değişkeni silinmiş durumda kalıyor — doğru, varsayılan kapalı).

---

## 6. `docs/testing.md` denetimi (AC-13)

Altı başlık doğrulandı: §1 Flaky test politikası · §2 Oran sınırı bütçesi · §3 Görsel
regresyon · §4 İzole tenant fabrikası · §5 Operasyonel tuzaklar · §6 Ölçüm metodolojisi.

**İddia denetimi (örnekleme + hedefli doğrulama):**

- §2 "`AUTH_IP_LIMITS` bağımsız pin" + "dört fail-closed değişmez" → kodla eşleşiyor
  (`auth-budget.test.ts` 3 assert + `guards.sh` pin tazeliği = 4).
- §3 `[data-arkesoft-theme="modern"]` seçicisi → `grep` ile `PageSection.astro:39` ve
  `storefront-templates.visual.spec.ts:103`'te **birebir** aynı.
- §4 "dört zorunlu koruma" listesi → `custom-domain-tenant.ts`/`tenant-cleanup.ts`
  kaynak koduyla eşleşiyor (gate düzeltme turundan SONRAKİ hâliyle).
- §2 `LOGIN_IP_LIMIT=20`/`EMAIL_IP_LIMIT=10` → `rate-limit.policy.ts:130,134` ile
  birebir.

**Solid'in tur 1'de yakaladığı yanlış iddia** (çarpan taraması `visual/`'ı
kapsamıyordu ama docs "kapsıyor" diyordu) **artık doğru** — kod docs'a değil, bu kez
**kod düzeltildi ve docs'un iddiası gerçeği yansıtıyor** (bağımsız mutasyonla
doğrulandı, §7).

**Başka yanlış iddia bulunamadı** — denetlenen tüm sayısal/yapısal iddialar koda
uyuyor.

---

## 7. Eksik senaryo avı — solid/security'nin bulgularının bağımsız kapanış kanıtı

### 7.1 Solid'in "kırmayan mutasyon" bulgusu — artık yakalanıyor

**Mutasyon:** `apps/admin/e2e/visual/x.spec.ts` oluşturuldu (yasak jeton
`/auth/sign-in/email` içeriyor) + `auth-budget.ts`'e `'visual/x.spec.ts': {signIn:0,
signUp:0}` eklendi (kapsama assertion'ını atlatmak için, izole test amaçlı).

`npx vitest run e2e/__tests__/auth-budget.test.ts` → **1 failed**:

```
AssertionError: expected [ Array(1) ] to deeply equal []
+ [ "visual/x.spec.ts → \"/auth/sign-in/email\"" ]
```

Geri alındı (Write ile, iki dosya orijinal içeriğe döndürüldü), `git diff --stat
apps/admin/e2e/` → **BOŞ**, test tekrar **3/3 PASS**.

### 7.2 Security'nin "pozitif iddia" bulgusu — artık yakalanıyor

**Mutasyon:** `apps/admin/e2e/fixtures/tenant-cleanup.ts`'teki
`assertDockerHostIsLoopback` fonksiyon adı **tüm 4 geçtiği yerde**
`checkDockerHostLoopbackX` olarak değiştirildi (orijinal jetonun **hiçbir alt dizge
kalıntısı** kalmayacak şekilde).

`pnpm guards` → **16/17 FAIL**:

```
ADR-0022 K1(d) İHLALİ — apps/admin/e2e/fixtures/tenant-cleanup.ts içinde
koruma (a) (assertDockerHostIsLoopback) YOK.
```

Geri alındı (sed ile isim tekrar `assertDockerHostIsLoopback`'e çevrildi — `git
checkout --`/`restore` KULLANILMADI), `git diff --stat
apps/admin/e2e/fixtures/tenant-cleanup.ts` → **BOŞ**, `pnpm guards` → **17/17 PASS**.

**Sonuç:** solid+security tur 1'in `high` bulgusunun tekrarını önleyen mekanizma
(allowlist dosyalarının iki koruma fonksiyonunu taşıdığının pozitif iddiası) **gerçekten
çalışıyor** — teorik değil, canlı mutasyonla doğrulandı.

### 7.3 Yeni test kalitesi — gözlemler

- `auth-budget.test.ts` (3 assert): fail-closed kapsama + çarpan sıfırı (artık
  `visual/`+`responsive/`) + toplam sınır — üçü de anlamlı, mutasyonla ayrı ayrı
  kırılabilir (brief'in S5 raporunda zaten 3 negatif kanıtla gösterilmiş, bu turda
  1'i tekrar bağımsız doğrulandı).
- İki `responsive` spec (`admin`/`storefront`) — okundu, gerçekten auth ucuna ağ
  çağrısı yapmıyor (`sign-in-layout.spec.ts`: form alanları görünür ama **gönderilmiyor**).
- Görsel spec (`storefront-templates.visual.spec.ts`) — `[data-arkesoft-theme="modern"]`
  seçicisi `PageSection.astro`'nun iç detayı; `docs/testing.md`'de **bilinen kırılganlık**
  olarak kayıtlı (yeniden adlandırılırsa test **gürültülü** kırılır, sessiz değil) —
  kabul edilebilir, yeniden yazılması gerekmiyor.
- `tenant-cleanup.ts`'in korumaları — dört koruma da (a/b/c/d) kod okumasıyla ve
  mutasyonla (bu rapor §7.2) doğrulandı; storefront ikizi de artık aynı dört korumayı
  taşıyor (gate düzeltme turunda eklendi, §1 AC-5 kanıtıyla da dolaylı doğrulandı —
  `DOCKER_HOST` loopback dışı bir değerle çalıştırılsaydı fırlardı, statik kod okuması
  ile teyit edildi).

---

## 8. Bulgular

| SEV     | dosya:satır                 | bulgu                                                                                                                                                                                                            | sorumlu ajan |
| ------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **low** | `scripts/run-visual.sh:201` | `security` S-5'in CWE-94 bulgusu (env değişkeni `node -p` programına string enterpole) **hâlâ düzeltilmedi** — beklenen, `low` bulgular için düzeltme turu açılmaz (AGENT_BASELINE §4); teknik borca kaydedilsin | devops       |

**Diğer tüm `low` bulgular** (solid tur 1'in 8'i, security tur 1'in S-3/S-5/S-6'sı)
**teknik borç** olarak zaten task dosyasında kayıtlı veya bu raporda tekrarlandı;
yeni bir düzeltme turu **gerektirmiyor**. İstisna: `ci.yml:1391` log metni ("20 Redis
işçisi") gate düzeltme turunda **fiilen düzeltildi** (bu turda `grep` ile "5"
olduğu teyit edildi) — artık kapalı, borç listesinden düşülebilir.

**1 `low` bulgu → PASS (AGENT_BASELINE §4: yalnızca `low` → PASS, borca kaydedilir).**

---

## 9. DOĞRULANAMADI

| Ne                                                                                 | Neden                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wcag` gate'inin bu turdaki sonucu                                                 | Bu Task'ın kapsamı `axe` entegrasyonunu v0.0.20'ye bıraktı; `wcag` elle koşacak (üçüncü kez) — bu, `qa` gate'inin işi değil, ayrı bir gate ajanının sorumluluğunda                                                                                                   |
| S-1'in gerçek uzak-Docker-daemon sömürü senaryosunun uçtan uca koşturulması        | Uzak bir docker daemon kurmayı gerektirir, kapsam dışı — kanıt statik kod okuma + emsal karşılaştırmasıyla (admin kopyası fırlatır, storefront artık da fırlatır, kod birebir) sağlandı                                                                              |
| macOS→Linux CI'da `run-visual.sh`'in `getent ahostsv4` çözümünün CI'daki davranışı | CI'nın Linux Docker Engine'inde doğrudan koşturmadım; ancak dört CI koşumunun **hepsinde** `test:visual` adımı yeşil geçti (`43723308968`...`43731621671`'in hepsi `e2e` job'u success döndürdü ve bu job `test:visual`'ı da çalıştırıyor) — dolaylı ama güçlü kanıt |
| Turbo cache'in `lint`/`typecheck` için "23 cached" olmasının sahte-yeşil riski     | Ölçüldü ve değerlendirildi: HEAD commit'ten sonra hiçbir dosya değişmedi (git status temiz baseline alınırken), bu yüzden cache hit beklenen/doğru davranış — AGENT_BASELINE §4 ders 3'ün uyardığı "değişiklik var ama cache eski" senaryosu burada **yok**          |

---

## 10. Ölçümlerin koşulları (AGENT_BASELINE §4 ders 2)

Geliştirme makinesi, bu oturumun başında **25 Docker konteyneri** çalışıyordu, load
avg **3.46 4.20 4.34** (orta yük, başka ajan paralel koşmuyordu — Orkestratör
teyitli). `pnpm test`/`test:isolation` fresh çalıştırıldı (cache bypass teyitli,
api:test "force executing" logu ile). Redis auth bütçesi oturum başında **0 anahtar**
idi (temiz başlangıç) — admin e2e koşumu sonrası bütçe **6/10 sign-up, 8/20 sign-in**'e
çıktı (brief'in beklediği sayılarla birebir).

---

## 11. ÖLÇÜMLER (özet)

**KABUL KRİTERİ EŞLEMESİ:** §1 tablosu — 13/13 PASS, hiçbiri DOĞRULANAMADI değil.

**TEST SAYILARI:**

- Bu turda **yeni eklenen test yok** (qa rolü: mevcut testleri doğrulamak +
  mutasyonla kanıtlamak; eksik kriter bulunmadığı için yeni test yazma ihtiyacı
  doğmadı — §1'in 13/13 PASS'i buna dayanıyor).
- `pnpm test`: **725 geçti / 0 başarısız** (92 dosya).
- `pnpm test:isolation`: **22 geçti / 0 başarısız** (api) + db isolation geçti (ilk
  deneme ortam kaynaklı ENOTEMPTY ile düştü, retry'de geçti — bu sürümün kodundan
  kaynaklı değil, benim art arda komut çalıştırmamın yarattığı FS yarışı).
- Admin `test:e2e`: **23 geçti / 0 başarısız**.
- Storefront `test:e2e`: **15 geçti / 0 başarısız** (× 2 ardışık koşum).
- `test:visual`: **4 geçti / 0 başarısız** (baseline) → mutasyonla **2 başarısız**
  (beklenen, AC-8 kanıtı) → geri alınca **4 geçti / 0 başarısız**.
- `auth-budget.test.ts`: **3 geçti / 0 başarısız** (baseline) → mutasyonla **1
  başarısız** (beklenen, §7.1 kanıtı) → geri alınca **3 geçti / 0 başarısız**.

**KOŞTURULAN KOMUTLAR:**

| Komut                                                                    | Exit kodu | Özet                                                              |
| ------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------- |
| `pnpm guards`                                                            | 0 (×3)    | 17/17 PASS — baseline + 2 mutasyon turundan sonra                 |
| `pnpm lint`                                                              | 0         | 23/23 PASS                                                        |
| `pnpm typecheck`                                                         | 0         | 23/23 PASS                                                        |
| `pnpm build`                                                             | 0         | 14/14 PASS                                                        |
| `pnpm format:check`                                                      | 0 (×2)    | temiz                                                             |
| `pnpm test`                                                              | 0         | 725/725 PASS                                                      |
| `pnpm test:isolation`                                                    | 1 then 0  | ilk deneme FS yarışı (ENOTEMPTY), retry 22/22+ PASS               |
| `pnpm --filter @arkesoft/admin test:e2e` (eşdeğeri, doğrudan playwright) | 0         | 23/23 PASS (bir kez, bütçe kısıtı)                                |
| `pnpm --filter @arkesoft/storefront test:e2e` (eşdeğeri) × 2             | 0 (×2)    | 15/15 PASS her ikisinde                                           |
| `pnpm test:visual`                                                       | 0/1/0/0   | 4/4 → (mutasyon) 2 fail → 4/4 → (ters mutasyon) 4/4               |
| `npx vitest run e2e/__tests__/auth-budget.test.ts` × 3                   | 0/1/0     | 3/3 → (mutasyon) 1 fail → 3/3                                     |
| `gh run list` / `gh run view` ×4                                         | 0         | AC-12 — dört ayrı run ID, hepsi `e2e` job success                 |
| `gh api .../artifacts`                                                   | 0         | AC-10 — başarısız koşumda artefakt var, başarılıda yok (beklenen) |

**Önceki turların PASS olmuş eksenleri tekrar denetlenmedi** (AGENT_BASELINE §4 —
gereksiz tekrar), yalnızca değişen/şüpheli eksenler ve 13 AC bağımsız doğrulandı.
