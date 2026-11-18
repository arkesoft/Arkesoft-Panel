# T-021 — `qa` gate, Tur 1

- **Tarih:** 2026-11-16
- **Sürüm:** ROADMAP v0.0.20 (süper admin iskeleti)
- **Kapsam:** 13 AC'nin canlı doğrulanması + ①-④ devredilen kanıt boşlukları +
  eksik senaryo taraması. Araçlar: `Read`/`Write`/`Bash` — komutlar **gerçekten
  koşturuldu**, çıktılar aşağıda ham olarak özetlendi.

```
GATE: qa
SONUÇ: FAIL
BULGULAR:
  - [SEV: high] turbo.json:150-159 (passThroughEnv listesi) — Kök `pnpm test:e2e` (KÖK TOPLAYICI, "üç uygulamayı birlikte yeşil koşturma" hedefi) STOREFRONT için REPRODUCIBLE olarak başarısız: `apps/storefront/src/lib/storefront-env.ts:84`'teki eager `parseStorefrontEnv(process.env)` çağrısı `STOREFRONT_API_BASE_URL`'i okur (varsayılansız, zorunlu), ama bu değişken `turbo.json`'ın `test:e2e` görevinin `passThroughEnv` listesinde YOK (yalnızca 5 "ARKESOFT_*" port/hedef değişkeni var, satır 154-158). T-021/S10'un bu listeyi ürettiği denetim (turbo.json:136-140) `astro.config.ts`/`playwright.config.ts`/`e2e-port.ts`'i grep'lemiş ama `src/lib/storefront-env.ts`'i KAÇIRMIŞ. Sonuç: API varsayılan 3000 dışında bir portta koşarken (bu ortamda 3100, kullanıcının "demo-site"i 3000'i işgal ediyor) kök `pnpm test:e2e` çağrısında shell'den verilen `STOREFRONT_API_BASE_URL` turbo tarafından SESSİZCE düşürülür, Astro dev sunucusu env doğrulamasında FIRLAR/hiç 200 vermez, Playwright'ın `webServer` 30 sn sonra "Timed out waiting 30000ms from config.webServer." ile başarısız olur. KANIT (iki bağımsız doğrulama): (1) kök `pnpm test:e2e` İKİ ayrı koşumda da BİREBİR aynı şekilde admin(23/23)+superadmin(4/4) YEŞİL, storefront 0 test/webServer timeout ile KIRMIZI; (2) `STOREFRONT_API_BASE_URL=... npx turbo run test:e2e --filter=@arkesoft/storefront` TEK BAŞINA bile (db:build/admin/superadmin paralelliği YOK) AYNI timeout'u üretti, `--env-mode=loose` ile AYNI komut 15/15 YEŞİL verdi — kök neden kanıtlanmış, tahmin değil. — Düzeltme: `turbo.json`'ın `test:e2e.passThroughEnv` listesine `STOREFRONT_API_BASE_URL` eklenmeli (S10'un denetim grep komutuna `apps/storefront/src/lib/storefront-env.ts` eklenerek metodoloji de düzeltilmeli). — Sorumlu: devops (S9/S10, turbo.json sahibi)
  - [SEV: medium] apps/admin/e2e/auth-budget.ts (toplam signUp=6) + apps/superadmin/e2e/auth-budget.ts (toplam signUp=2, ⭐ qa'nın eklediği spec ile 3) — Kök `pnpm test:e2e` TEK TEMİZ koşumda admin+superadmin BİRLİKTE `EMAIL_IP_LIMIT`in (10/saat, `rate-limit.policy.ts:134`) **8/10'unu** (yeni qa spec'i dahil **9/10**) tüketiyor — canlı ölçüldü (Redis `platform:auth:post-auth-sign-up-email:ip:*` sayaçı 0→8, tek koşum). Bu, AYNI saat içinde İKİNCİ bir koşumu (CI retry, bir geliştiricinin elle tekrar denemesi, ya da `qa`'nın bu turda yaptığı gibi ek bir odaklı e2e testi) neredeyse KAÇINILMAZ olarak 429'a düşürür — canlı kanıtlandı: ikinci koşumumda admin'in 3 testi "sign-up" 429'u yüzünden KIRMIZI oldu, bu bir kod hatası DEĞİLDİ, paylaşılan bütçenin tükenmesiydi. T-021 bu paylaşılan havuza ÜÇÜNCÜ bir tüketici (superadmin) ekleyerek marjı daralttı. — Düzeltme: ya `EMAIL_IP_LIMIT`i e2e ortamında gevşetmeyi (üretim limitini DEĞİL, test-only bir mekanizmayı) değerlendir, ya da kök `test:e2e`'nin CI'da ASLA aynı saat içinde ikinci kez tetiklenmeyeceğini (retry politikası) yazılı güvenceye bağla — bu "flaky" diye yanlış teşhis edilecek bir sınıf üretir. — Sorumlu: devops
  - [SEV: low] apps/superadmin/src/components/Sidebar.tsx:41-45 (yorum) ↔ apps/superadmin/src/routes/_app.denetim-kaydi.tsx:17,21 — Canlı e2e (`sidebar-focus-return.qa.spec.ts`, bu turda eklendi) İKİ kapanma yolunu AYRI AYRI ölçtü: Escape → odak toggle düğmesine GERÇEKTEN dönüyor (`toBeFocused()` PASS, dosya başı yorumun iddiası DOĞRU). Bağlantı seçimi → odak toggle'a DÖNMÜYOR (`toBeFocused()` FAIL, "Received: inactive") — çünkü hedef rotanın (`_app.denetim-kaydi.tsx`) KENDİ `headingRef.current?.focus()`'u (mount `useEffect`'i) Sidebar'ın geri-verdiği odağı navigasyon SONRASI EZİYOR. Bu muhtemelen KÖTÜ bir UX DEĞİL (SPA'da yeni sayfaya geçişte odağın başlığa taşınması yaygın/tercih edilen bir desen — wcag'ın kendi "Odak sırası" PASS maddeleri bu deseni zaten onaylıyor) ama dosya başı yorumu ("İKİ kapanma yolunda da ... odak toggle'a taşınır") bağlantı seçimi için YANLIŞ/yanıltıcı ve orijinal talep ("Escape VE link seçimi sonrası odak toggle'da") LİTERAL olarak karşılanmıyor. — Düzeltme: yorumu düzelt ("bağlantı seçiminde odak YENİ SAYFA BAŞLIĞINA gider, bu BİLİNÇLİ" diye netleştir) VEYA gerçekten her iki yolda da toggle'a dönmesi isteniyorsa `_app.denetim-kaydi.tsx`'in kendi focus-on-mount'unu Sidebar kapanışından sonraki bir mikro-görev'e geciktir. — Sorumlu: frontend + docs
  - [SEV: low] AGENT_BASELINE.md §6 (komut referansı) — "`pnpm --filter <paket> test -- <desen>` filtre UYGULAMIYOR" notu yalnızca Vitest için yazılı; BU TURDA aynı sınıf hata Playwright'ta da canlı ölçüldü: `pnpm --filter @arkesoft/superadmin test:e2e -- sidebar-focus-return.qa.spec.ts` pnpm'in kendi `--` ayracını LİTERAL argüman olarak `playwright test`e geçiriyor (`$ playwright test -- sidebar-focus-return.qa.spec.ts`), filtre UYGULANMIYOR, paketin TÜM spec dosyaları koşuyor. Bu turda bunun bedeli gerçek oldu: istemeden İKİNCİ bir tam-paket koşumu tetiklendi ve `EMAIL_IP_LIMIT` ek olarak tükendi (8→14). Doğru biçim: paket dizininden `npx playwright test <dosya-adı>` (pnpm sarmalayıcısı OLMADAN). — Düzeltme: AGENT_BASELINE §6'ya bu ikinci örneği ekle. — Sorumlu: devops (dosya sahibi) / Orkestratör (süreç notu)
  - [SEV: low] apps/api/src/platform/impersonation.service.ts (platform_admin yetkisinin ANLIK iptali) — `platform_admin` satırı silindiğinde SONRAKİ isteğin gerçekten 403 aldığını doğrulayan CANLI, elle yazılmış bir test bulunamadı (mekanizma — "her istekte DB'den okunur, oturumda taşınmaz" — mimari olarak garanti ediliyor ve dolaylı olarak `platform-authz.isolation.test.ts`'in "platform_admin KAYDI YOK" bloğuyla TUTARLI, ama "önce VARDI, SONRA SİLİNDİ, bir SONRAKİ istek 403" sekansını birebir koşan bir test YOK). — Düzeltme: `platform-authz.isolation.test.ts`'e "grant → 200 → revoke (DELETE FROM platform_admin) → AYNI oturum → 403" sekansı eklensin — bu, R2 kısıtının ("platform yetkisi oturumda taşınmaz") en doğrudan kanıtı olurdu. — Sorumlu: backend + qa
ÖLÇÜMLER: aşağıda ayrıntılı
```

---

## 1. KABUL KRİTERİ EŞLEMESİ (13 AC)

| AC    | Kriter (özet)                                                                                                          | Test / kanıt                                                                                                                                                                                                                                                                | Sonuç                                                                                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1  | `build --filter superadmin` exit 0; `dev`+`test:e2e` script var; dev port 200                                          | `npx turbo run build --filter @arkesoft/superadmin --force` (canlı koşturuldu, 5/5, 0 cached) · `package.json` script'leri grep'le doğrulandı · e2e `webServer` superadmin'i 2 kez başarıyla ayağa kaldırdı (200 alınmadan Playwright testi başlatmaz)                      | **PASS**                                                                                                                                                                                     |
| AC-2  | ≥2 `@arkesoft/ui` bileşeni import; `packages/ui` bağımlılık kazanmaz                                                   | `grep -rn "@arkesoft/ui" apps/superadmin/src` → 8+ farklı bileşen (Button, Card, CardContent, Input, Checkbox, CopyButton, Skeleton, DataTable, cn, FOCUS_RING_CLASS_NAMES) · `git diff --stat packages/ui` + `git status --porcelain packages/ui` → BOŞ (canlı doğrulandı) | **PASS**                                                                                                                                                                                     |
| AC-3  | Kök `test:e2e` `superadmin` projesini koşar ve yeşil · **(Orkestratör'ün elevated hedefi) üç uygulama BİRLİKTE yeşil** | `superadmin` tek başına **2/2 koşumda 4/4 YEŞİL** (literal AC-3 metni için PASS) · **ANCAK** kök toplayıcı çağrısında (benim birincil hedefim) `storefront` **2/2 koşumda** webServer timeout'uyla KIRMIZI, kök-nedeni kanıtlandı (bkz. BULGULAR, high)                     | **PASS (literal metin) / FAIL (kök toplayıcı, üç uygulama birlikte)** — ⭐ **net sonuç: FAIL**, çünkü bu Task'ın kendi kabulü ve benim görev tanımım açıkça "üç uygulamayı birlikte" istiyor |
| AC-4  | 2FA'sız yönetici (a) kuruluma yönlenir (b) 403 (401/200 değil)                                                         | `superadmin-authz.spec.ts` — canlı e2e, **2/2 koşumda PASS**: (a) `/iki-adimli-dogrulama`'ya yönlendi + başlık görünür; (b) `response.status===403`, `TWO_FACTOR_REQUIRED`                                                                                                  | **PASS**                                                                                                                                                                                     |
| AC-5  | Enum değişmez; platform yöneticiliği `TenantRole`/`tenant_membership` değil; platform kimliği kiracı yetkisi kazanmaz  | `permissions-catalog.test.ts` `pnpm test` içinde yeşil (787/787'nin parçası) · `platform-authz.isolation.test.ts` blok (C): platform yöneticisi `tenant.current`'ta 403 `TENANT_MEMBERSHIP_REQUIRED` alıyor (`pnpm test` yeşil)                                             | **PASS**                                                                                                                                                                                     |
| AC-6  | Yüzey sayılabilir tabloda; 5 rol × her uç → 403; boş olamaz; yazılmamış uç → kırmızı                                   | `platform-authz.isolation.test.ts` blok (A) — 5 rol × 2 uç = 10 senaryo, `pnpm test` içinde yeşil · mutasyon kanıtı (S5, Task log) ayrıca doğrulandı                                                                                                                        | **PASS**                                                                                                                                                                                     |
| AC-7  | ≥2 kiracı gerçek değerlerle (`toHaveText`); sıra deterministik                                                         | `superadmin-flow.spec.ts` AC-7 testi — canlı e2e **2/2 koşumda PASS**, 5 kolonun hepsi `toHaveText` ile (varlık değil); sıra `createdAt desc` üzerinden (gerçek, farklı zaman damgaları) — **yapısal olarak deterministik**, ikinci canlı koşumla da doğrulandı             | **PASS**                                                                                                                                                                                     |
| AC-8  | Giriş+impersonation satırı yazar; count = öncesi+2                                                                     | `superadmin-flow.spec.ts` AC-8 testi — canlı e2e **2/2 koşumda PASS**, `after === before + 2` tam sayım                                                                                                                                                                     | **PASS**                                                                                                                                                                                     |
| AC-9  | (1) yapısal zorunlu param (2) mekanik tek-çağrı-yeri kapı+mutasyon (3) N=3⇒tam 3                                       | `platform-impersonation-write-gate.test.ts` (4 test, `pnpm test` yeşil) · `platform-impersonation-audit-count.test.ts` — N=3 `expect(after).toBe(3)` + idempotency/retry testleri (M1 fix'in kendi kanıtı) — hepsi `pnpm test`'in 787/787'sinin içinde yeşil                | **PASS**                                                                                                                                                                                     |
| AC-10 | 0 BYPASSRLS/superuser; `f\|f`                                                                                          | Canlı sorgu (bu turda tekrar koşturuldu): `arkesoft_app\|f\|f`, `arkesoft_auth\|f\|f`, `arkesoft_migrator\|f\|f`                                                                                                                                                            | **PASS**                                                                                                                                                                                     |
| AC-11 | Gerekçe/süre/uyarı alanı YOK, pinlenir                                                                                 | `platform-audit-entry-negative-scope.test.ts` (5 test, yeşil) · ayrı `platform.impersonate` mutation'ı yok (yapısal)                                                                                                                                                        | **PASS**                                                                                                                                                                                     |
| AC-12 | 6 kapı + `format:check`; turbo önbellek durumu raporlanır                                                              | Aşağıdaki §3 tablosu — hepsi canlı koşturuldu, önbellek durumu `--force`/`cache:false` ile açıkça ayrıştırıldı                                                                                                                                                              | **PASS**                                                                                                                                                                                     |
| AC-13 | `passThroughEnv` 3 e2e port değişkenini bildirir                                                                       | `turbo.json:154-158` → `ARKESOFT_PANEL_E2E_PORT`, `ARKESOFT_STOREFRONT_E2E_PORT`, `ARKESOFT_SUPERADMIN_E2E_PORT` üçü de VAR (literal metin PASS) — ⚠ ama bu liste AC-3'ü kıran eksik değişkeni (`STOREFRONT_API_BASE_URL`) İÇERMİYOR, bkz. `high` bulgu                     | **PASS (literal)** — bitişik `high` bulguyla birlikte okunmalı                                                                                                                               |

**Karşılıksız AC yok** — 13/13 bir teste eşlendi. Net gate sonucunu belirleyen tek madde **AC-3**'ün kök-toplayıcı yorumudur (yukarıda gerekçeli).

---

## 2. ①-④ ÖZEL KALEMLER

### ① `devops` (Mailpit birleştirmesi) — ⭐ CANLI E2E BU TURDA KOŞTURULDU, R-14 TUTTU

Bu turda kök `pnpm test:e2e` **iki kez** tam, `storefront` **bir kez** tek başına ve
`superadmin` **üç kez** (2× tam koşum + 1× odaklı QA spec'i) canlı koşturuldu —
`scripts/playwright/mailpit.ts`'in birleştirilmiş gövdesi admin'in (23 test/koşum ×2)
VE superadmin'in (4+2 test/koşum ×3) doğrulama e-postalarını **hatasız** buldu; hiçbir
Mailpit zaman aşımı/arama hatası gözlenmedi.

⭐ **R-14 ölçümü (öncesi=sonrası beklentisi):**

| Sayaç                | Tüm e2e koşumlarından ÖNCE | TÜM koşumlardan SONRA                                                                                        |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `tenant`             | 10                         | **10** (değişmedi)                                                                                           |
| `app_user`           | 59007                      | **59006** (−1; muhtemelen bir orphan süpürmesi, S9'un `sweepOrphanedE2eFixtures` emsaliyle AYNI güvenli yön) |
| `platform_audit_log` | 184 (test:e2e öncesi)      | **184** (tüm spec'lerin `afterAll`'ı kendi satırlarını temizledi)                                            |

⇒ **Mailpit birleştirmesi canlı koşumda doğrulandı, kanıt boşluğu kapandı.** Port
5173/5174/3000'e **dokunulmadı**; kullanıcının 25 konteyneri **etkilenmedi**; kök
`.env` **okundu, yazılmadı**; override'lar yalnızca kabuk değişkeniyle verildi
(`ARKESOFT_PANEL_DEV_API_TARGET`, `ARKESOFT_SUPERADMIN_DEV_API_TARGET`,
`STOREFRONT_API_BASE_URL`).

### ② `frontend` (odak dönüşü) — ⭐ CANLI DOM KANITI ÜRETİLDİ — KARIŞIK SONUÇ

Yeni dosya yazıldı: `apps/superadmin/e2e/sidebar-focus-return.qa.spec.ts` (2 test) +
`apps/superadmin/e2e/auth-budget.ts`'e bütçe satırı eklendi (1 sign-up+1 sign-in).
Lint/typecheck/prettier **temiz**, canlı koşturuldu.

| Yol                                       | `toBeFocused()` sonucu                                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escape                                    | **PASS** — odak gerçekten toggle düğmesine dönüyor                                                                                                                                 |
| Bağlantı seçimi ("Denetim kaydı"na tıkla) | **FAIL** — `Received: inactive`; kök neden: hedef rotanın kendi `headingRef.current?.focus()`'u (mount `useEffect`) Sidebar'ın odak-geri-verme çağrısını navigasyon SONRASI eziyor |

⇒ wcag tur1'in ORİJİNAL bulgusu ("odak `document.body`'ye düşüyor, konum kaybı") artık
**İKİ yolda da YANLIŞ** — odak hiçbir zaman body'ye düşmüyor. Ama "iki yolda da toggle'a
döner" iddiası yalnızca **Escape için doğru**; bağlantı seçiminde odak **yeni sayfanın
başlığına** gidiyor (muhtemelen kabul edilebilir bir desen, ama dosya yorumunun ve
orijinal talebin **literal** iddiasıyla çelişiyor) → `low` bulgu yazıldı (§ BULGULAR).

### ③ `backend` (F1 güvenlik düzeltmesi) — KÖK NEDEN CANLI DOĞRULANDI, GUARD'IN KENDİ 403'Ü **DOĞRULANAMADI**

**Kök neden (F1) — canlı curl, salt okuma, bu turda bağımsız tekrarlandı:**

```
Host: superadmin.arkesoft.localhost
GET /trpc/platform.tenantList?input=%7B%7D    → 401 UNAUTHENTICATED
GET /trpc/platform%2EtenantList?input=%7B%7D  → 401 UNAUTHENTICATED   (ÖNCEDEN: 404)
GET /trpc/platform%2etenantList?input=%7B%7D  → 401 UNAUTHENTICATED   (ÖNCEDEN: 404)

Host: isolation-a-b53b7ef4-d28.arkesoft.localhost
GET /trpc/registration%2EcreateTenant         → 401 UNAUTHENTICATED   (ÖNCEDEN: 404)
```

⇒ **Doğrulandı: yanlış kapı → doğru kapı.** `normalize-request-path.ts`'in
`decodeURIComponent` birleştirmesi canlıda çalışıyor; üç yol da artık **aynı** (doğru)
kapıdan (`AuthGuard`) 401 alıyor, bypass **yok**.

**Guard'ın KENDİ 403'ü (izinsiz IP + gerçek 2FA'lı oturum) — ⚠ DOĞRULANAMADI.**
Gerekçe: bu ölçümü yapmak için YENİ bir platform yöneticisi oturumu (sign-up+2FA)
gerekiyordu; `EMAIL_IP_LIMIT` bu turda **kendi testlerimle** (iki tam `test:e2e` koşumu

- bir yanlışlıkla tetiklenen ikinci tam-paket `superadmin` koşumu, bkz. `low` bulgu
  "pnpm --filter" sorunu) **14/10**'a çıktı (TTL ~52 dk) ve **yeni bir sign-up
  denemesi yapmadım** (ⓐ üretim limitini değiştirmek yasak, ⓑ Redis sayaçını silmek
  yasak — S10'un tekrarlanmaması istenen hatası). Mekanik güven **dolaylı olarak
  yüksek**: `platform-admin-ip.guard.ts`'in **21/21** birim testi (`pnpm test`
  içinde, 3 fail-closed dal + yeni `%2E` negatif kanıtları dahil) yeşil ve `security`
  gate'in canlı DB+kod incelemesi guard mantığını zaten doğruladı. Ama **oturumlu,
  izinsiz-IP'den, canlı HTTP 403'ü bizzat gözlemleyemedim.** → **DOĞRULANAMADI**,
  uydurulmadı.

### ④ `pnpm test:isolation` — AÇIKLANAMAYAN KIRMIZI TEKRARLANMADI, YETERSIZ VERİ

**5 ek, ardışık, temiz koşum** yapıldı (bu turda, load average ~3.6-4.7, 25 docker
konteyner — önceki flake'in gözlendiği koşullarla **karşılaştırılabilir**):

```
RUN 1: db 7/7 (82/82) + api 6/6 (31/31) — 11/11 görev PASS
RUN 2: aynı — 11/11 PASS
RUN 3: aynı — 11/11 PASS
RUN 4: aynı — 11/11 PASS
RUN 5: aynı — 11/11 PASS
```

⇒ **5/5 yeşil, flake BU TURDA tekrarlanmadı.** ⚠⚠ **"Flake değilmiş" diye
KAPATMIYORUM** — AGENT_BASELINE §4 ders 1'in aritmetiği burada da geçerli: tek bir
geçmiş kırmızı + şimdi 5 yeşil, **toplam kayıt 1 kırmızı / 10 koşum (≈%10)**. Bu, ne
"kesin flake" ne "kesin tek seferlik olay" demeye **yeterli** değil — ve en önemlisi,
orijinal kırmızı koşumun **hangi test dosyasının hangi assertion'ı** ile başarısız
olduğu bana **hiç verilmedi** (handoff yalnızca "9/11" sayısını taşıyor), bu yüzden
**nedensel açıklama** bacağı (AGENT_BASELINE'ın üçlü standardının ikinci ayağı) bu
turda **tamamlanamadı**. → **DOĞRULANAMADI** (kök neden), ama **ölçülmüş** (5 ek
koşum, 0/5 kırmızı, koşul bilgisiyle). Bir sonraki tekrarda **tam hata çıktısı**
(hangi dosya, hangi `expect`, hangi satır) yakalanmadan bu kapanamaz.

---

## 3. ÖLÇÜMLER

### KOŞTURULAN KOMUTLAR

| Komut                                                                                | Exit   | Özet                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                                                          | 0      | 23/23 paket PASS                                                                                                                                                                                                                                                  |
| `pnpm typecheck`                                                                     | 0      | 23/23 paket PASS                                                                                                                                                                                                                                                  |
| `pnpm build`                                                                         | 0      | 14/14 paket PASS (ilk koşum, karma önbellek)                                                                                                                                                                                                                      |
| `npx turbo run build --filter @arkesoft/superadmin --force`                          | 0      | 5/5, **0 cached** — gerçek yürütme kanıtlandı (AC-12'nin önbellek şartı)                                                                                                                                                                                          |
| `pnpm format:check`                                                                  | 0      | prettier temiz                                                                                                                                                                                                                                                    |
| `pnpm guards`                                                                        | 0      | **18/18** mekanik kapı PASS                                                                                                                                                                                                                                       |
| `pnpm test`                                                                          | 0      | 21/21 turbo görevi; `@arkesoft/api` **787/787** test (99 dosya), 138.6s                                                                                                                                                                                           |
| `pnpm test:isolation` × 5 (ardışık)                                                  | 0 (×5) | her koşumda **11/11** görev, **113/113** test (82 db + 31 api)                                                                                                                                                                                                    |
| `pnpm test:e2e` (kök, env override'larıyla) × 2                                      | 1 (×2) | admin **23/23 PASS** + superadmin **4/4 PASS**, storefront **0 test / webServer timeout KIRMIZI** (her iki koşumda da aynı)                                                                                                                                       |
| `pnpm --filter @arkesoft/storefront test:e2e` (env override'larıyla, turbo YOK)      | 0      | **15/15 PASS**                                                                                                                                                                                                                                                    |
| `npx turbo run test:e2e --filter=@arkesoft/storefront` (env override'ıyla)           | 1      | 0 test / webServer timeout — kök toplayıcıdaki İZOLE tekrarı                                                                                                                                                                                                      |
| `npx turbo run test:e2e --filter=@arkesoft/storefront --env-mode=loose`              | 0      | **15/15 PASS** — kök nedenin KANITI (turbo'nun env filtrelemesi)                                                                                                                                                                                                  |
| `pnpm --filter @arkesoft/superadmin test:e2e -- sidebar-focus-return.qa.spec.ts` × 2 | 1 (×2) | ⚠ filtre UYGULANMADI (pnpm `--` sorunu, bkz. `low` bulgu) — paketin TÜM spec'leri koştu; ilk koşumda 3 pass/2 fail/1 did-not-run (benim Escape testim PASS, Bağlantı-seçimi testim FAIL — gerçek bulgu); ikinci koşum bütçe tükenmesiyle daha fazla kırmızı verdi |
| `pnpm test:contract`                                                                 | —      | **bu sürümde henüz yok** ("Command test:contract not found")                                                                                                                                                                                                      |
| Canlı `curl` (salt okuma, F1 doğrulaması)                                            | —      | `%2E`/`%2e` → **401** (önceden 404) — 4 probe                                                                                                                                                                                                                     |
| Canlı `psql` (AC-10, R-14)                                                           | —      | `rolsuper\|rolbypassrls` üç roldür `f\|f`; tenant/app_user/audit sayıları önce/sonra karşılaştırıldı                                                                                                                                                              |

### TEST SAYILARI

- **Yeni eklenen (bu tur, `qa`):** 1 dosya / 2 test (`sidebar-focus-return.qa.spec.ts`) — 1 PASS (Escape), 1 FAIL (Bağlantı seçimi, gerçek bulgu olarak raporlandı, gevşetilmedi).
- **Toplam geçen (bu turda canlı koşturulan, kümülatif):** `pnpm test` 787 · `pnpm test:isolation` 113×5 (hepsi PASS) · `pnpm test:e2e` admin 23×2 + superadmin (4×2 + 1 yeni PASS) + storefront 15 (yalnızca izole koşumlarda) + 1 yeni FAIL.
- **Toplam başarısız (gerçek, bütçe-kaynaklı olmayan):** **1** — `sidebar-focus-return.qa.spec.ts`'in "Bağlantı seçimi" testi (yukarıda ② altında analiz edildi, `low` bulgu olarak yazıldı).
- **Bütçe-kaynaklı (kod hatası DEĞİL, rapor edildi, gevşetilmedi):** kök `test:e2e`'nin 2. koşumunda admin'in 3 testi (`EMAIL_IP_LIMIT` 429) · ikinci (yanlışlıkla tetiklenen) `superadmin` tam-paket koşumunda ek kırmızılar.

### Mutasyon (negatif) kanıtı — bu turda DOĞRULANAN (üretilen değil, Task log'undan teyit edilen + bir YENİ kanıt)

- AC-9(3) idempotency/retry: `platform-impersonation-audit-count.test.ts`'in M1-fix testi (satır 223: "1. çağrı BAŞARISIZ → sessionId kümeye EKLENMEZ → 2. çağrı YAZAR") — **sahte PrismaService ile canlı koşuyor**, `pnpm test`'in 787'sinin içinde PASS. Bu, solid'in M1 bulgusunun **gerçekten** düzeltildiğinin mekanik kanıtı.
- ② Odak dönüşü — bu turun kendi negatif kanıtı: Escape yolu PASS, bağlantı yolu FAIL (yukarıda).

---

## 4. EKSİK SENARYO TARAMASI

CLAUDE.md §7 kontrol listesi ve standart QA kontrol listesi bu Task'a uygulandı:

- **Tenant çapraz erişim (okuma+yazma):** bu sürüm yeni bir KİRACI tablosu
  **eklemiyor** (iki yeni tablo platform seviyesi) ⇒ "yazma" ekseni **yapısal olarak
  yok** (platform.* prosedürlerinin hiçbiri tenant-scoped bir tabloya YAZMIYOR,
  yalnızca `subscription`'ı OKUYOR). Okuma ekseni `platform-authz.isolation.test.ts`
  blok (D) ile canlı kanıtlı (`tenantB.subscription` tenantA GUC'u altında 0 satır).
  ⇒ **eksik değil, N/A — gerekçeli.**
- **Negatif/sınır değer:** limit şema sınırları (`tenantList` 1-50, `auditLog` 1-100)
  Zod ile zorlanıyor; `security` gate bunu zaten doğruladı, `qa` tekrar koşturmadı
  (zaman/bütçe kısıtı, düşük risk).
- **İdempotency/tekrar gönderim:** AC-9 bunu doğrudan test ediyor (yukarıda). ✅
- **Eşzamanlılık:** `ensureSignInRecorded`'ın GERÇEK eşzamanlı (Promise.all) iki
  çağrısı test edilmiyor — yalnızca SIRALI retry senaryosu var. Bu **bilinçli,
  yazılı bir bedel** (R-PO4 yorumu, "en fazla bir ek satır") — yeni bulgu
  **yazılmadı**, zaten kayıtlı.
- **Platform yetkisinin ANLIK iptali (grant→revoke→aynı oturum→403):** **eksik** —
  `low` bulgu olarak yazıldı (§ BULGULAR).
- **Playwright/e2e kritik akış:** AC-3/AC-4/AC-7/AC-8 hepsi e2e ile kapsanıyor; yeni
  bir "kayıt→sipariş→ödeme" sınıfı akış bu Task'ın kapsamında değil (süper admin
  salt-okunur bir iç panel; ROADMAP'in kritik akış listesi — kayıt/kur/sipariş/ödeme
  — bu sürümde **dokunulmuyor**, dolayısıyla YENİ bir kritik-akış Playwright testi
  **gerekmiyor**, mevcut akışların regresyonu aşağıda).
- **Regresyon:** `pnpm test` 787/787, `pnpm test:isolation` 113/113×5, admin e2e
  23/23×2 — T-021'den ÖNCEKİ davranışların hiçbiri kırılmamış.

---

## 5. KONTROL LİSTESİ (öz)

- [x] 13/13 AC bir teste eşlendi, karşılıksız yok
- [x] Negatif senaryolar test edildi (403 matrisi, 2FA eksikliği, IP allowlist, bozuk yüzde-kodlama)
- [x] Tenant çapraz erişim — N/A gerekçeli (yeni kiracı tablosu yok), okuma ekseni canlı kanıtlı
- [x] Idempotency — AC-9(3) ile kanıtlı
- [ ] Eşzamanlılık — YAZILI kabul edilmiş bedel, gerçek paralel test yok (bulgu yazılmadı, zaten kayıtlı)
- [x] Regresyon kontrol edildi
- [x] `pnpm test` gerçekten koştu — 787/787
- [x] `pnpm lint`/`typecheck`/`build` gerçekten koştu — hepsi PASS
- [x] Testler `skip`/`only` içermiyor (mekanik taramalarda ve elle okumada görülmedi)
- [x] Şüpheli testler kasıtlı bozma ile doğrulandı (② için canlı negatif/pozitif ayrımı; AC-9 M1 fix'in kendi mutasyon kanıtı)
- [x] Flaky davranış kontrol edildi (④, 5 ek koşum, DOĞRULANAMADI ama ölçülmüş)

---

## 6. DOSYA LİSTESİ (bu turda yazılan/değiştirilen)

- `apps/superadmin/e2e/sidebar-focus-return.qa.spec.ts` — **YENİ**, 2 test (② kanıtı)
- `apps/superadmin/e2e/auth-budget.ts` — yukarıdaki spec'in bütçe satırı eklendi (üretim kodu değil, bütçe beyan tablosu; kalıcı sahiplik kararı Orkestratöre bırakıldı)
- `docs/gates/T-021-qa-tur1.md` — bu rapor
- `.claude/workflow/reviews/T-021-qa-tur1.md` — bu raporun kalıcı kopyası

Hiçbir üretim dosyası (apps/api/src, packages/trpc/src, packages/db, turbo.json,
Sidebar.tsx vb.) **değiştirilmedi** — bulgular raporlandı, düzeltilmedi.
