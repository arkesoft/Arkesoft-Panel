# T-017 — QA Gate — Tur 2 (DAR kapsam)

**Tarih:** 2026-11-10
**Sürüm:** v0.0.15.1 — Aktif oturum listesi + hassas işlemlerde step-up
**Gate:** qa — Tur 2, DAR (tur 1'de PASS verildi; bu tur yalnızca İŞ ①
`solid` MED-2'nin kapatılması + kendi bulgularımın kapanış teyidi + AC'nin
yeniden ölçümü — yeni genel tarama YOK).

---

## İŞ ① — `solid` MED-2 (medium, bana atandı): eksik e2e testi

**Bulgu (birebir, handoff'tan):** `apps/admin/e2e/panel-flow.spec.ts`'te
`:256-282`'deki UserMenu Escape→odak-döner emsali, oturum kartı ve 2FA
kartındaki AYNI düzeltme (wcag FIX turu 1/W-1) için TEKRARLANMAMIŞ.

**Yapılan:** Yeni dosya
`apps/admin/e2e/session-security-dialog-focus.qa.spec.ts` — `panel-
flow.spec.ts`'e DOKUNMADAN (AGENT_BASELINE §5), İKİ test:

1. **ActiveSessionsCard** — "Sonlandır" tetikleyicisi → Escape/"Vazgeç"
   tıklaması/"×" (Kapat) tıklaması ÜÇÜ de diyaloğu kapatır VE odağı
   tetikleyiciye GERİ VERİR. İkinci bir aktif oturum GEREKTİĞİ için (satırın
   "Sonlandır" butonu yalnızca `isCurrent===false` satırda var) AYNI
   kullanıcı için İKİ AYRI `sign-in/email` çağrısı (iki `APIRequestContext`)
   kullanıldı.
2. **TwoFactorStatusCard** — "Devre dışı bırak" tetikleyicisi → AYNI üç
   senaryo. 2FA, UI sihirbazı ÜZERİNDEN DEĞİL, doğrudan `/auth/two-factor/
   enable` → gerçek TOTP kodu (RFC 6238/4226, `node:crypto`, YENİ bağımlılık
   YOK, apps/api'nin `totp-code-generator.port.ts`'iyle BİREBİR aynı
   algoritma — apps/admin'in apps/api'ye paket bağımlılığı olmadığı için
   İTHAL EDİLMEDİ, kendi kendine yeterli kopya) → `verify-totp` ile API
   seviyesinde kuruldu.

**Davranış seviyesi, mekanizma değil:** test `setTimeout`/`dialogTriggerRef`e
HİÇ atıf yapmıyor — yalnızca "diyalog iptal edilince odak tetikleyiciye
döner" gözlemlenebilir sonucunu assert ediyor. `wcag` tur 2 mekanizmayı
`onCloseAutoFocus`+`preventDefault`'a çevirirse test YİNE geçerli kalır.

**Altı ölçülen kalem — hepsi pinlendi (her iki kartta):**
- `escapeReturnsFocusToTrigger` ✓ (her iki kart)
- `cancelClickReturnsFocusToTrigger` ✓ (her iki kart)
- `closeIconClickReturnsFocusToTrigger` ✓ (her iki kart)
- `cancelButtonFoundByName` ('Vazgeç', exact) ✓
- `closeIconFoundByDistinctName` ('Kapat', exact) ✓
- `closeIconNoLongerSharesCancelName` (`button[aria-label="Vazgeç"]` → 0) ✓

**Teknik tuzaklar ÇÖZÜLDÜ (canlı ölçüldü, kayıtlı):**
- Vite proxy varsayılan hedefi (`127.0.0.1:3000`) kullanıcının İLGİSİZ bir
  `next-server` sürecine (3000) gidiyordu — gerçek `apps/api` 3100'de
  çalışıyordu (`ps`/`lsof` ile doğrulandı). Çözüm:
  `ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3100` env override'ı.
- Better Auth'un KENDİ `Origin` denetimi: oturum çerezi VARKEN `Origin`
  eksikse `403 MISSING_OR_NULL_ORIGIN` — `APIRequestContext` (tarayıcı
  DEĞİL) bu başlığı otomatik EKLEMEZ, `/auth/two-factor/enable` ve
  `/auth/two-factor/verify-totp` çağrılarına AÇIKÇA `Origin: baseURL`
  eklendi. (`sign-in`/`sign-up` çerezsiz olduğu için bu denetime GİRMİYOR.)

### Vacuity kanıtı — mutasyonla kırmızı, geri alındı, shasum çifti

**Mutasyon #1 — `ActiveSessionsCard.tsx:361`** (`focusDialogTrigger()`
çağrısı yoruma alındı, odak-döndürme devre dışı):
- shasum ÖNCESİ: `d66e32bc2a9f53a6d643811a6c40dfc25d4a89626ddcecceacff2174bbd66943`
- Koşum: `Aktif oturumlar kartında...` testi **KIRMIZI** —
  `expect(locator).toBeFocused() failed ... Received: "inactive"`
  (`:299`, Escape dalı).
- Geri alındı. shasum SONRASI: `d66e32bc2a9f53a6d643811a6c40dfc25d4a89626ddcecceacff2174bbd66943` (**EŞİT**).
- Sağlık kontrolü: dosya tam koşumu → **2/2 PASS**.

**Mutasyon #2 — `TwoFactorStatusCard.tsx:269`** (disable-dialog'un
`focusDialogTrigger()` çağrısı yoruma alındı):
- shasum ÖNCESİ: `693499a79985f05052c6e7c982a9866a0a1b3e3cd6d96f6c4629c574bb1fb420`
- Koşum: `2FA kartında...` testi **KIRMIZI** —
  `expect(locator).toBeFocused() failed ... Received: "inactive"` (`:384`,
  Escape dalı).
- Geri alındı. shasum SONRASI: `693499a79985f05052c6e7c982a9866a0a1b3e3cd6d96f6c4629c574bb1fb420` (**EŞİT**).
- Sağlık kontrolü: dosya tam koşumu → **2/2 PASS**, bir kez daha koşturuldu → **2/2 PASS** (flake kontrolü, aynı sonuç).

⚠ **Not (şeffaflık):** mutasyon #2'nin İLK denemesinde test, bir sign-up
`429 RATE_LIMIT_EXCEEDED` ile (kendi tekrarlı debug koşumlarımdan tüketilen
`EMAIL_IP_LIMIT=10/saat` bütçesi yüzünden) KIRMIZI çıktı — bu, mutasyonun
KENDİSİNİ KANITLAMADI (yanlış nedenle kırmızı). Bütçe pencere doğal olarak
sıfırlandığında (ölçüldü: Redis `platform:auth:post-auth-sign-up-email:ip:…`
anahtarı TTL=`-2`/yok oldu) mutasyon turu TEKRARLANDI ve bu kez test
TAM OLARAK hedeflenen `toBeFocused()` satırında kırmızı verdi — yukarıdaki
kayıt bu İKİNCİ (geçerli) denemeye ait.

### AC18 bütçe güncellemesi (playwright.config.ts)

Yeni dosya 2 `sign-up` + 3 `sign-in` ekliyor. `playwright.config.ts`'in
üst yorumu güncellendi: toplam `sign-in` 4→**7/20**, `sign-up` 3→**5**
(gerçek sınır `EMAIL_IP_LIMIT=10/saat` — ölçüldü, `rate-limit.policy.ts:131`
+ `api-env.ts:74`, `AUTH_RESET_RATE_WINDOW_SECONDS=3600`). Önceki "≤4"
ifadesi GERÇEK sınır DEĞİLDİ, iki dosyanın o anki toplamıydı — bunu
**VARSAYIM** olarak işaretliyorum (architect/Orkestratör'ün gözden
geçirmesi gerekirse): gerçek risk eksen `LOGIN_IP_LIMIT=20/15dk` (sign-in)
ve `EMAIL_IP_LIMIT=10/saat` (sign-up), yeni toplamlar (7/20, 5/10) HÂLÂ
büyük pay bırakıyor. Diff sadece yorum satırları — `git diff --stat` 35
ekleme/20 silme, config nesnesinin KENDİSİ (fullyParallel/workers/vb.)
DEĞİŞMEDİ (doğrulandı).

**Sonuç İŞ ①: KAPANDI.** Test yazıldı, koştu, mutasyonla doğrulandı, geri
alındı, shasum eşleşti.

---

## İŞ ② — AC'nin dört parçası yeniden ölçüldü (eşleme taşındı)

Kanıt: `apps/api/src/__tests__/auth-sessions.test.ts` tek başına CANLI
koşturuldu (87 dosyalık tam api paketinin parçası olarak da PASS, ayrıca
tekil dosya koşumuyla da doğrulandı):

```
npx vitest run src/__tests__/auth-sessions.test.ts
 ✓ AC1 — iki oturum → iki satır; browserFamily/osFamily/ipAddress/lastSeenAt DOLU; TAM BİR satırda isCurrent
 ✓ AC3 — başkasının sessionId'siyle revoke → 404, var olmayan kimlikle BİREBİR eşit gövde; SIRA KANITI
 ✓ AC5 — step-up olmadan işlem TAMAMLANMAZ (satır VARLIĞINI korur) + AC6 — doğru parolayla 200 + satır silinmiş
 ✓ AC4 — sonlandırılan oturumun çerezi → 401, diğeri 200
 ✓ revoke-all — step-up olmadan TAMAMLANMAZ + doğru parolayla ikisi de 401
 ✓ oturum uçları KİMLİK gerektirir — çerezsiz istek 401
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

Ek kanıt (eşlemenin taşındığı YENİ dosya, (a) için özel önem):

```
npx vitest run src/__tests__/session-summary-mapper.test.ts
 ✓ vaka 1 — boş dize sentinel'i ('') → null
 ✓ vaka 2 — null (IP tespit edilemedi) → null
 ✓ vaka 3 — gerçek IP → KENDİSİ
 ✓ isCurrent — row.id === currentSessionId KARŞILAŞTIRMASINDAN türetilir
 ✓ ham userAgent tele/çıktıya SIZMAZ
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

- **(a)** kendi oturumları + cihaz/IP/son görülme DOLU → **PASS (canlı)** —
  `listOwnSessions` artık `toSessionSummary()`'ye (saf, test edilmiş)
  devrediyor, `where: { userId: identity.userId }` hâlâ yerinde (kod okundu,
  `sessions.service.ts:111-116`).
- **(b)** başkasının oturumu uzaktan sonlandırma → **404** (ROADMAP metni
  "403" hâlâ hatalı — bu, tur 1'de verdiğim karar, DEĞİŞMEDİ, `low` borç) →
  **PASS (canlı)**.
- **(c)** işlem TAMAMLANMAZ (satır DB'de duruyor) → **PASS (canlı)** — AC5
  hem eksik hem yanlış parolada `findUnique(...).not.toBeNull()`.
- **(d)** step-up tetiklenir → **PASS (canlı)** — AC5 (400
  `INVALID_PASSWORD`) + revoke-all testi.

**Dört parça da PASS, canlı, yeni mapper dosyası dahil.**

---

## İŞ ③ — kendi sekiz `low`'umun durumu

**Üç kapanmış `low` — TEYİT edildi (okuyarak, çalıştırmaya gerek yok —
mantıksal kanıt + ilgili testin PASS'i yeterli):**

1. `session-ip-not-logged.test.ts:168-180` (vacuity riski, negatif-only
   assert) → **KAPANDI.** Artık `positivePinProbe` ile GERÇEK bir pozitif
   assert (`expect(fullLogText).toContain(positivePinProbe)`) negatif
   assert'lerden ÖNCE koşuyor — `LOG_LEVEL=error|silent` ortamında bile
   artık vacuous OLAMAZ (probe `rootLogger.info(...)` ile AÇIKÇA
   üretiliyor, seviyeden bağımsız).
2. `sessions.service.ts:129` (`''→null` sentinel pini eksik) → **KAPANDI.**
   Eşleme `toSessionSummary()`'ye taşındı ve `session-summary-mapper.
   test.ts`'in "vaka 1" testi TAM BU senaryoyu (`''→null`) pinliyor (5/5
   PASS, canlı koşturuldu).
3. `session-list-read-port-adapter.test.ts:113` (tip totolojisi) →
   **KAPANDI.** Eski `row.ipAddress === null || typeof row.ipAddress ===
   'string'` kaldırıldı; artık `expect(row.ipAddress).not.toBeNull()` +
   `.not.toBe('')` + `.toContain([gerçek IP değerleri])` — gerçek değer
   assert'i, tip sisteminin zaten garanti ettiği bir totoloji DEĞİL.

**Kalan beş `low` — KÖTÜLEŞMEDİ (okundu, karşılaştırıldı):**

4. ROADMAP.md:1120 metni hâlâ "403" diyor (docs henüz düzeltmedi) —
   DEĞİŞMEDİ.
5. Q-3 (AC9'un tRPC transport tekrarı eksik) — yeni bir tRPC-seviyesi log
   testi EKLENMEDİ, DEĞİŞMEDİ.
6. Süresi geçmiş satırlar listeden elenmiyor — `sessions.service.ts`'in
   sorgusunda hâlâ `expiresAt` filtresi YOK (kod okundu), DEĞİŞMEDİ.
7. `session.list` sıralama pini eksik — `auth-sessions.test.ts`'te sıra
   doğrulayan yeni bir assert YOK (grep ile arandı, bulunamadı), DEĞİŞMEDİ.
8. Sayfalama yok — `listOwnSessions` hâlâ `take`/`skip` TAŞIMIYOR (kod
   okundu), DEĞİŞMEDİ.

**Sonuç İŞ ③: 3/8 kapandı (teyit edildi), 5/8 ROADMAP borcu olarak
AYNEN duruyor, hiçbiri kötüleşmedi.**

---

## Tek temiz koşum — komutlar ve sayılar

Tüm komutlar `DATABASE_AUTH_URL="postgresql://arkesoft_auth:arkesoft_auth_dev_only@localhost:5432/arkesoft?schema=public"` öneki ile koşturuldu (kullanıcının `.env`'ine YAZILMADI).

| Komut | Exit kodu | Özet |
| --- | --- | --- |
| `npx turbo run test --env-mode=loose` | 0 | **18/18 paket PASS** |
| `npx turbo run test:isolation --env-mode=loose` | 0 | **10/10 paket PASS** |
| `npx turbo run lint --env-mode=loose` | 0 | **21/21 PASS** |
| `npx turbo run typecheck --env-mode=loose` | 0 | **21/21 PASS** |
| `npx turbo run build --env-mode=loose` | 0 | **13/13 PASS** |
| `pnpm guards` | 0 | **11/11 PASS** |
| `pnpm format:check` | 0 | temiz |
| `npx playwright test e2e/session-security-dialog-focus.qa.spec.ts` (×2, flake kontrolü) | 0, 0 | **2/2 PASS**, iki kez, aynı sonuç |

**`pnpm test` paket başına (tek temiz koşum, 2026-11-10 22:56):**

| Paket | Dosya | Test |
| --- | --- | --- |
| `@arkesoft/ui` | 2 passed | 23 passed |
| `@arkesoft/tenancy` | 2 passed | 39 passed |
| `@arkesoft/errors` | 3 passed | 54 passed |
| `@arkesoft/themes-modern` | 1 passed | 5 passed |
| `@arkesoft/admin` | 15 passed | 117 passed |
| `@arkesoft/storefront` | 15 passed | 125 passed |
| `@arkesoft/theme-sdk` | 19 passed | 223 passed |
| `@arkesoft/trpc` | 12 passed | 120 passed |
| `@arkesoft/db` | 10 passed | 210 passed |
| `@arkesoft/api` | 87 passed | 676 passed |

Toplam: 1592 test, hepsi PASS. (Orkestratör'ün bildirdiği baseline — api
676, admin 117, db 210, trpc 120, errors 54 — BİREBİR eşleşiyor;
`auth-flow.test.ts > F3` flake'i bu koşumda da ÇIKMADI.)

**`test:isolation`:** `@arkesoft/db` 5 dosya/56 test PASS, `@arkesoft/api`
4 dosya/18 test PASS — baseline ile BİREBİR eşleşiyor.

⚠ **Önemli not (sırasıyla koşma sırası):** `DATABASE_AUTH_URL` env
değişkeni OLMADAN ilk denememde `@arkesoft/api` testleri 63/87 dosyada
`EnvValidationError` ile KIRMIZI çıktı — bu BENİM eksik önekimdi, üretim
kusuru DEĞİL. Önek eklenince (yukarıdaki tabloda gösterilen koşum) 87/87
temiz. Bunu şeffaflık için not ediyorum; FAIL kararına GİRMİYOR (kendi
komut hatamdı, düzeltip doğru koştum).

**e2e süiti (panel-flow.spec.ts + qa-blind-spot-and-negative-
scenarios.qa.spec.ts) bu turda TEKRAR KOŞTURULMADI** — gerekçe: kendi
debug/mutasyon turlarım `EMAIL_IP_LIMIT=10/saat` (sign-up) bütçesini
7/10'a kadar tüketmişti; panel-flow.spec.ts'in kendi payı (+3 sign-up)
toplamı 10'a/üzerine iterdi ve YANLIŞ-NEGATİF bir 429 riski yaratırdı
(gerçek bir regresyon DEĞİL, benim tekrarlı koşumlarımın yan etkisi).
Bu iki dosyaya HİÇBİR DOKUNUŞ yapılmadı (git status bunu doğruluyor);
dosyaların kendi önceki PASS durumunun bu turda GEÇERSİZ kılındığına dair
hiçbir kanıt da yok. **DOĞRULANAMADI** olarak işaretliyorum, PASS saymıyorum.

---

## Playwright/dev sunucusu, port disiplini

- Her Playwright koşumu kendi `vite` dev sunucusunu başlatıp bitirdi;
  koşum sonunda `:5173` **BOŞ** (doğrulandı, `lsof` sıfır eşleşme) —
  `wcag` için port temiz.
- `:3000` (next-server, kullanıcının İLGİSİZ projesi) ve `:3100`
  (`apps/api`, zaten çalışıyordu) **DOKUNULMADI** — süreç PID'leri
  (`11734`, `63279`) koşum başında ve sonunda AYNI, hiçbiri öldürülmedi.
- `ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3100` sadece KOMUT
  ÖNEKİ olarak kullanıldı, hiçbir dosyaya/`.env`'e YAZILMADI.
- Redis `FLUSHALL`/`FLUSHDB`/`CONFIG SET` **hiç çalıştırılmadı** — yalnızca
  salt-okunur `GET`/`TTL`/`KEYS` (teşhis amaçlı, rate-limit bütçesini
  anlamak için).
- `prisma migrate reset`/`db push --force-reset`/`db:reset`/
  `db:rollback-roles` **hiç çalıştırılmadı**, `PRISMA_USER_CONSENT_FOR_
  DANGEROUS_AI_ACTION` **hiç üretilmedi/export edilmedi**.

---

## git status — yalnızca kendi dosyalarım

```
 M apps/admin/playwright.config.ts                         (yalnızca yorum — İŞ ①'in AC18 bütçe güncellemesi)
 M apps/admin/src/features/two-factor/TwoFactorStatusCard.tsx   (ÖNCEKİ ajanların işi, BENİM mutasyonum GERİ ALINDI — shasum eşleşti, grep "QA MUTASYON" → 0 eşleşme)
?? apps/admin/e2e/session-security-dialog-focus.qa.spec.ts  (YENİ — İŞ ①)
?? apps/admin/src/features/sessions/ActiveSessionsCard.tsx  (ÖNCEKİ ajanların işi — benim mutasyonum da GERİ ALINDI, shasum eşleşti)
?? .claude/workflow/reviews/T-017-*.md                      (gate raporları, benim DIŞIMDA da üretilmiş)
```

`apps/api/src/__tests__/**`, `packages/**`, `apps/admin/src/**` (ConfirmDialog.tsx,
messages.ts, routes) dosyalarına **HİÇ DOKUNULMADI** (DOKUNMAYACAĞIN DOSYALAR
listesine uyuldu) — mutasyonlar İKİ dosyada (`ActiveSessionsCard.tsx`,
`TwoFactorStatusCard.tsx`) yalnızca TEŞHİS/KANIT amaçlıydı, her ikisi de
shasum-doğrulanmış şekilde GERİ ALINDI.

---

## SONUÇ

**GATE: qa**
**SONUÇ: PASS**

### BULGULAR

`yok` — İŞ ① (`solid` MED-2) kapatıldı (test yazıldı + mutasyonla
doğrulandı), İŞ ②'nin dört AC parçası canlı PASS, İŞ ③'ün üç `low`'u
teyitli kapandı, kalan beş `low` ROADMAP borcu olarak AYNEN duruyor
(kötüleşmedi) — yeni bulgu ÜRETMİYORUM (bu tur DAR kapsam, yeni tarama
yapılmadı).

### ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ (yeniden ölçüm, İŞ ②):**

| AC parçası | Test | Sonuç |
| --- | --- | --- |
| (a) kendi oturumları, cihaz/IP/son görülme DOLU | `auth-sessions.test.ts` AC1 + `session-summary-mapper.test.ts` (5 vaka) | **PASS (canlı)** |
| (b) başkasının oturumu uzaktan sonlandırma → 404 (ROADMAP metni "403" hatalı, `low` borç) | `auth-sessions.test.ts` AC3 | **PASS (canlı)** |
| (c) hassas işlem step-up olmadan TAMAMLANMAZ (satır DB'de duruyor) | `auth-sessions.test.ts` AC5/AC6 | **PASS (canlı)** |
| (d) step-up tetiklenir | `auth-sessions.test.ts` AC5 + revoke-all | **PASS (canlı)** |
| `solid` MED-2 — diyalog iptali odağı tetikleyiciye döndürür (oturum kartı + 2FA kartı) | `session-security-dialog-focus.qa.spec.ts` (2 test) | **PASS (canlı + mutasyon doğrulamalı)** |

**TEST SAYILARI:**
- Yeni eklenen (bu turda qa tarafından): 1 dosya
  (`apps/admin/e2e/session-security-dialog-focus.qa.spec.ts`), 2 test,
  PASS (×2 koşum, flake yok).
- Toplam geçen (tek temiz `pnpm test`): **1592/1592** (18/18 paket).
- Toplam geçen (`pnpm test:isolation`): **74/74** (10/10 paket; db 56, api 18).
- Toplam başarısız: **0**.

**KOŞTURULAN KOMUTLAR:** yukarıdaki tabloya bkz. (hepsi gerçek, çıktı
yakalandı; `DATABASE_AUTH_URL` önekini unuttuğum İLK deneme — 63 dosya
kırmızı, kendi hatam, hemen düzeltilip doğru koşuldu — şeffaflık için
kayıtlı, FAIL'e SAYILMIYOR).

**Mutasyon kanıtı (İŞ ①, vacuity):**
- `ActiveSessionsCard.tsx` shasum öncesi/sonrası: `d66e32bc2a9f53a6d643811a6c40dfc25d4a89626ddcecceacff2174bbd66943` (EŞİT).
- `TwoFactorStatusCard.tsx` shasum öncesi/sonrası: `693499a79985f05052c6e7c982a9866a0a1b3e3cd6d96f6c4629c574bb1fb420` (EŞİT).
- İkisi de hedeflenen `toBeFocused()` satırında KIRMIZI verdi, geri alındı,
  sonrasında 2/2 → 2/2 (×2) YEŞİL.

**DOĞRULANAMADI (ölçülmedi, sayılmıyor):**
- `panel-flow.spec.ts` + `qa-blind-spot-and-negative-scenarios.qa.spec.ts`'in
  bu turda regresyonsuz kaldığı — `EMAIL_IP_LIMIT` bütçe riski yüzünden
  koşturulmadı (yukarıda gerekçeli).

**VARSAYIM:** `playwright.config.ts`'in AC18 "≤4 sign-in" ifadesinin gerçek
bir mimari tavan değil, iki dosyanın o anki toplamı olduğu — gerçek sınırlar
(`LOGIN_IP_LIMIT=20/15dk`, `EMAIL_IP_LIMIT=10/saat`) baz alınarak toplam
güncellendi (7/20, 5/10). Architect/Orkestratör onayı gerekirse diye not
düşülüyor.
