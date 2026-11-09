T-016 — İki faktörlü kimlik doğrulama (TOTP) ve oturum güvenliği
GATE: qa (tur 1)
TARİH: 2026-11-09
SÜRÜM: v0.0.15 (ROADMAP satır 1054, tamamlandı: 2026-11-06)

GATE: qa
SONUÇ: PASS

---

## 1. KABUL KRİTERİ → TEST EŞLEMESİ

### ROADMAP'in dört bağlayıcı kabul kriteri (düzeltilmiş metin)

| # | Kriter | Test | Geçti mi |
|---|---|---|---|
| 1 | 2FA kurulum/giriş/yedek kod akışları entegrasyon testinde yeşil | `two-factor-acceptance-ac1-setup-flow.test.ts`, `ac2-login-redirect-contrast.test.ts`, `ac3-backup-code-single-use.test.ts` | ✅ geçti |
| 2 | 2FA zorunlu hesapta kodsuz sign-in → 401 DEĞİL, 200 + `{twoFactorRedirect:true, twoFactorMethods:[...]}` | `ac2-login-redirect-contrast.test.ts` (karşıtlık iii), `two-factor-plugin-live.test.ts` hücre (a) | ✅ geçti |
| 3 | doğru TOTP → 200 + yeni oturum çerezi; yanlış kod → 401 `INVALID_CODE` | `ac1-setup-flow.test.ts`, `ac2-login-redirect-contrast.test.ts`, `two-factor-http-chain.test.ts`, `two-factor-plugin-live.test.ts` | ✅ geçti |
| 4 | 10 ardışık başarısız doğrulama → 429 `ACCOUNT_TEMPORARILY_LOCKED` | `two-factor-plugin-live.test.ts:317-401` (`accountLockout` describe'ı) | ✅ geçti |

Dördü de **status + `code` alanı** birlikte doğrulanıyor — yalnızca status koduna bakan bir
assert bu sürümdeki **üç farklı 401**'i (`INVALID_CODE` / `INVALID_TWO_FACTOR_COOKIE` /
`UNAUTHENTICATED`) ayırt edemezdi; incelenen tüm dosyalarda bu ayrım **her yerde** `code`
üzerinden yapılıyor. Karşılıksız kriter **yok**.

### Genişletilmiş AC1–AC11 eşlemesi (BAĞLAM ÖZETİ'nin saydığı alt kırılım)

| AC | Konu | Dosya | Kanıt kalitesi |
|---|---|---|---|
| AC1 | kurulum ucu-uca (enable→get-totp-uri→verify) | `two-factor-acceptance-ac1-setup-flow.test.ts` | Önce/ara/son DB durumu (satır sayısı + bayrak) + iki yakın-ışka (pencere-dışı kod, yanlış kod) ayrı `code` ile reddediliyor. **Güçlü.** |
| AC2 | sign-in 2FA yönlendirmesi | `two-factor-acceptance-ac2-login-redirect-contrast.test.ts` | Üç karşıtlık (kontrol/yanlış parola/doğru parola+2FA) AYNI testte, `hasSessionCookie` `Max-Age=0` tuzağına karşı korumalı. **Güçlü.** |
| AC3 | yedek kod tek kullanımlık | `ac3-backup-code-single-use.test.ts` | İkinci kullanım + 1-karakter mutasyon + komşu kod hâlâ geçerli + DB sütunu değişti. **Güçlü.** |
| AC4 | sır tele/loga çıkmaz | `ac4-secret-redaction-vacuity.test.ts` | Dört adım (boş değil→sentinel redakte→gerçek akış→vacuity kontrolü redact'sız). **Güçlü, vacuity'e karşı en sağlam dosya.** |
| AC5 | DB rol ayrımı (arkesoft_auth) | `packages/db/src/__tests__/auth-role-privileges.isolation.test.ts` | 2×2 matris + α/β/γ/δ/ε/ζ/η/θ/ι canlı mutasyon prob'ları, hepsi `runProbeAndRollback` ile iz bırakmadan. **Çok güçlü** (T-015'in kapsamlı devamı). |
| AC6 | allowlist fail-closed (send-otp) | `ac6-allowlist-fail-closed.test.ts` | 404'ün `TENANT_NOT_FOUND` değil `HTTP_EXCEPTION` olduğu + kapsam-içi kardeş (`verify-totp`) 404 almıyor. **Güçlü**, yanlış pozitif riskini doğru elemiş. |
| AC7 | kiracı politikası (owner 2FA zorunlu) | `ac7-ac10b-tenant-policy-no-lockout.test.ts` | Aynı owner, iki kiracı, politika açık/kapalı → 403/200. **Güçlü.** |
| AC8 | yetki (security:write yalnızca owner) | `ac8-permission-authz.test.ts` | Katalog pini + çalışma zamanı admin/owner karşıtlığı + izin adı/rol tele sızmıyor + DB yan etkisi yok. **Güçlü.** |
| AC9 | (step-up auth / aktif oturum listesi) | — | **Kapsam dışı.** ROADMAP satır 1070: "kapsam üçe bölündü" kararıyla v0.0.15.1'e taşındı. T-016'da test gerekmiyor. |
| AC10(a) | kendini kilitlememe, çapraz kullanıcı sorgusu yok | `ac10a-self-lockout-no-cross-query.test.ts` | Birim (Proxy fail-closed, yalnızca izin verilen iki çağrı) + davranışsal (sibling owner 2FA açık olsa da sonuç değişmiyor). **Güçlü.** |
| AC10(b) | 403 alan owner kilitli değil | `ac7-ac10b-tenant-policy-no-lockout.test.ts` | Altı 2FA ucu `TENANT_EXEMPT_PATHS`'te + 403 sonrası owner kendi 2FA'sını GERÇEKTEN kurup 403'ten çıkıyor. **Güçlü.** |
| AC11 | panel: enable bir kez, cache tazeleme, dashboard'a gitmez | `two-factor-setup-controller.test.ts`, `session-refresh.test.ts` | "enable bir kez" + vacuity kanıtı (controller seviyesi) **güçlü**; `invalidateSessionIdentity` gerçek `QueryClient` + vacuity kanıtlı **güçlü**; AMA bu mantığın GERÇEKTEN `TwoFactorSetupWizard.tsx`/`_auth.sign-in.tsx` içinde doğru noktada çağrıldığı (DOM/render/router seviyesi) **test edilmiyor** — `vitest.config.ts`'in `environment:'node'` kararı + Playwright'ta 2FA spec'i yok (bkz. bulgu 8, zaten ROADMAP'te kayıtlı borç). |

**Sonuç:** 11 alt kriterin 10'u doğrudan kanıtlanmış, 1'i (AC9) bilinçli kapsam dışı
(ROADMAP kullanıcı kararıyla v0.0.15.1'e taşındı — eksik değil, ertelenmiş). AC11'in
mantık/karar katmanı (controller + cache invalidation) sağlam test edilmiş; yalnızca
"bileşenin bu fonksiyonları doğru noktada çağırdığı" kablolama katmanı (render/e2e)
test edilmemiş — bu zaten borç tablosunda kayıtlı, aşağıda yeniden ölçüldü.

---

## 2. VACUITY DENETİMİ

İncelenen assert sayısı: sekiz AC dosyasının tamamı (AC1,2,3,4,6,7,8,10a — 1610 satır) +
`two-factor-plugin-live.test.ts`, `two-factor-http-chain.test.ts`,
`auth-role-privileges.isolation.test.ts`, `two-factor-setup-controller.test.ts`,
`session-refresh.test.ts`, `auth-path-sets.test.ts` satır bazında okundu.

**Bulunan totoloji:** `auth-path-sets.test.ts`'in BEŞİNCİ describe bloğunda (satır 142-169)
**iki** tautolojik assert var, `security`'nin F4 bulgusu sadece BİRİNİ (satır 158, "kesişim
BOŞ") kapsıyordu. **İKİNCİSİ** (satır 165-169, "birleşim TAM OLARAK `AUTH_DELEGATED_PATHS`")
AYNI kök nedenden ötürü aynı şekilde boş:

```ts
const identityNotRequiredPaths = delegatedPaths.filter(
  (methodAndPath) => !AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS.has(methodAndPath),
)
```

`identityNotRequiredPaths` üretim `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`'in **tümleyeni**
olarak TANIMLANDIĞI için, hem "kesişim boş" hem "birleşim = delegatedPaths" assert'leri
`AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`'in GERÇEK İÇERİĞİNDEN BAĞIMSIZ olarak her zaman
doğrudur (yalnızca satır 149'daki alt küme kontrolü tutarsa — ki o kontrol GERÇEK production
Set'e karşı çalışıyor, o yüzden o satır GERÇEK bir kanıt). Elle doğrulama: `AUTH_DELEGATED_
IDENTITY_REQUIRED_PATHS` boş bir Set olsaydı bile her iki assert YİNE yeşil kalırdı.

Bu partition iddiasının GERÇEK koruması yalnızca iki yerden geliyor: (1) satır 149 (alt küme,
gerçek Set'e karşı) ve (2) satır 171-180 (bağımsız `isAuthExemptPath()` fonksiyonuna karşı
çapraz kontrol — bu GERÇEKTEN bağımsız, çünkü `AUTH_EXEMPT_PATHS` ayrı elle tutulan bir Set).

**Diğer dosyalarda totoloji aranan ama bulunmayan yerler:** AC1-AC10a dosyalarının HİÇBİRİNDE
"türetilmiş veriyi kendisiyle karşılaştırma" deseni yok — hepsi gerçek HTTP yanıtı/DB satırı
gibi bağımsız kaynaklara karşı assert ediyor. AC10(a)'nın "yalnızca findFirst/findUnique
çağrılabilir" Proxy deseni kendi vacuity kanıtını taşıyor (satır 132-140, "tanımsız delegeye
erişim FIRLAR" — bu sahte olumlu riskini mekanik olarak eliyor). AC4'ün dört adımı zaten
kendi vacuity kanıtını (adım 4) taşıyor.

---

## 3. EKSİK SENARYO LİSTESİ

| # | Senaryo | Dosya/konum | Önem | Sorumlu |
|---|---|---|---|---|
| 1 | `auth-path-sets.test.ts:165-169` — F4'ün ikizi totoloji (yukarıda detaylı) | `apps/api/src/__tests__/auth-path-sets.test.ts` | low | qa |
| 2 | Better Auth'un per-challenge 5-deneme sınırı (`TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE`, 400) sadece yorumda açıklanıyor, hiçbir assert bu kodu/durumu doğrulamıyor | `two-factor-plugin-live.test.ts:344` (yorum, assert yok) | low | backend/qa |
| 3 | `disable`/`generate-backup-codes` için davranışsal (DB flag flip, eski kodun geçersizleşmesi, sonraki sign-in'in 2FA istemediği) uçtan uca kanıt yok — mevcut `disable` testi (satır 513-594) yalnızca HTTP 200 + log olayını doğruluyor | `two-factor-plugin-live.test.ts:513-594`; `generate-backup-codes` hiçbir HTTP testinde davranışsal doğrulanmıyor | low | backend/qa |
| 4 | AC11'in motive edici backend iddiası ("enable'ın ikinci çağrısı sırrı yeniden üretir, authenticator kaydını öldürür") hiçbir canlı HTTP testinde doğrulanmamış — yalnızca kaynak kodu okunarak çıkarılmış bir yorum | `two-factor-acceptance-ac1-setup-flow.test.ts:139-141` (yorum) | low | backend |
| 5 | Altı yeni 2FA hata metni (`INVALID_CODE` vb.) `messages.test.ts`'te yalnızca `length>0` + anahtar-sayısı eşitliğiyle kapsanıyor; `INVALID_EMAIL_OR_PASSWORD`'ün aksine BİREBİR metin pini yok | `apps/admin/src/__tests__/messages.test.ts` | low | frontend |
| 6 | `formatAccountTemporarilyLockedMessage` (dakika yuvarlama, Math.ceil sınır değerleri) sıfır test | `apps/admin/src/messages/messages.ts` | low | frontend |
| 7 | Flaky test — AC4 (`two-factor-acceptance-ac4-secret-redaction-vacuity.test.ts`), 3 tam-süit koşumundan 1'inde Mailpit arama zaman aşımıyla düştü (bkz. ÖLÇÜMLER §5) | `two-factor-acceptance-ac4-secret-redaction-vacuity.test.ts` + `helpers/mailpit-client.ts` | low (ROADMAP'in QA-2/QA-5/QA-6 ailesiyle aynı sınıf, o aile de low) | devops+backend |
| 8 | (ZATEN KAYITLI, yeniden ölçüldü) `apps/admin` 2FA bileşenleri için Playwright kapsamı SIFIR | `apps/admin/e2e/panel-flow.spec.ts`, `qa-blind-spot-and-negative-scenarios.qa.spec.ts` (grep: 0 eşleşme "two-factor"/"2FA"/"totp") | low (ROADMAP "Vadesi v0.1.0" tablosunda zaten kayıtlı, qa, aynı metin) | qa |
| 9 | Challenge çerezi 600sn TTL / per-challenge süre aşımı davranışsal test yok (gerçek zaman geçişi gerektirir, Better Auth varsayılanı, platform kodu değil) | — | low (pratik test maliyeti yüksek, kütüphane varsayılanı) | qa (not alındı, iş açılmadı) |

**Yazmadığım test:** Üstteki 9 maddenin hiçbiri için yeni test dosyası yazmadım — hepsi
mevcut, çalışan testleri **genişletme** gerektiriyor (üretim kodu değil), ve üçü zaten
ROADMAP'te kayıtlı/benzer sınıfta. Kapsam genişletmesi riskini (özellikle Playwright
sign-in/sign-up oran-sınırı bütçesi) göz önünde bulundurup ölçüp raporlamayı seçtim.

---

## 4. TENANT İZOLASYONU

AC7/AC10(b) testi aynı owner'ın İKİ farklı kiracıda (`requireTwoFactorForOwner` açık/kapalı)
farklı sonuç aldığını, AC10(a) testi ÇAĞIRANIN dışında hiçbir kullanıcı/kiracı sorgusu
YAPILMADIĞINI (Proxy fail-closed ile yapısal olarak) kanıtlıyor. `two_factor` tablosu platform
seviyesi (tenant_id taşımıyor, T-015 kararı) — bu bilinçli bir mimari karar, AC5 (db rol
ayrımı testi) bu tabloya `arkesoft_app`'in erişemediğini, yalnızca `arkesoft_auth`'un
erişebildiğini kanıtlıyor. Çapraz tenant okuma/yazma testi bu sürümde **ayrı bir tenant'a ait
tablo** üzerinde değil (2FA verisi tenant'a bağlı değil) — asıl izolasyon sınırı rol bazlı
(arkesoft_auth/arkesoft_app) ve bu AC5'te kapsamlı test edilmiş.

---

## 5. ÖLÇÜMLER

### KABUL KRİTERİ EŞLEMESİ
Yukarıdaki §1 tablosu — 4/4 ROADMAP kriteri + 10/11 genişletilmiş AC (AC9 bilinçli kapsam dışı).

### TEST SAYILARI
- Bu turda yeni eklenen test: **0** (üretim/test kodu değiştirilmedi, bkz. §7 git status)
- `apps/api` test: **606/606** geçti (temiz koşumda, 3. deneme — bkz. flake notu aşağıda)
- `apps/api` test:isolation: **18/18**
- `packages/db` test:isolation: **56/56**
- `apps/admin` test: **71/71**
- Toplam turbo `test` görevi (13 paket): run 1 → 1 başarısız (`validation.test.ts`, ioredis
  timeout) · run 2 → 1 başarısız (`two-factor-acceptance-ac4...test.ts`, Mailpit timeout) ·
  run 3 → **606/606 temiz**.

### KOŞTURULAN KOMUTLAR

| Komut | Exit | Özet |
|---|---|---|
| `npx turbo run lint --env-mode=loose` | 0 | 21/21 başarılı (cache) |
| `npx turbo run typecheck --env-mode=loose` | 0 | 21/21 başarılı (cache) |
| `npx turbo run build --env-mode=loose` | 0 | 13/13 başarılı; bundle JS %71.8 (179.39/250 KiB), CSS %7.9 |
| `npx turbo run test --env-mode=loose` (run 1, tam monorepo) | 1 | `@arkesoft/api` 1 başarısız (`validation.test.ts`, `ioredis Command timed out`) |
| `npx turbo run test --env-mode=loose --filter=@arkesoft/api` (run 2) | 1 | 1 başarısız (`two-factor-acceptance-ac4-secret-redaction-vacuity.test.ts`, Mailpit mesajı bulunamadı) |
| `npx turbo run test --env-mode=loose --filter=@arkesoft/api` (run 3) | 0 | **606/606 temiz** |
| `npx turbo run test --env-mode=loose --filter=@arkesoft/db` | 0 | (dahil, toplam suite) |
| `npx turbo run test --env-mode=loose --filter=@arkesoft/admin` | 0 | 71/71 |
| `npx turbo run test:isolation --env-mode=loose` | 0 | api 18/18 + db 56/56 |
| `npx turbo run test:isolation --env-mode=loose --filter=@arkesoft/db` | 0 | 56/56 (ayrı doğrulama) |
| `pnpm run guards` | 0 | 11/11 PASS |
| `pnpm run format:check` | 0 | Prettier temiz |
| `pnpm --filter @arkesoft/admin test:e2e` (run 1, port 3000 = yabancı süreç) | 1 | 2 başarısız (`panel-flow.spec.ts`, `qa-blind-spot...spec.ts`) — **ortam sorunu, kod değil** (bkz. aşağıda) |
| `curl -i -H "Host: panel.arkesoft.localhost:5173" http://127.0.0.1:3000/health` | — | **404 — Next.js "CNC CAD/CAM & Nesting" uygulaması**, Arkesoft API DEĞİL |
| (geçici) `API_PORT=3100 npx turbo run dev --filter=@arkesoft/api` | — | arkesoft api gerçek olarak 3100'de başlatıldı, doğrulandı (`/health` 200) |
| `ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3100 pnpm --filter @arkesoft/admin test:e2e` (run 2) | 0 | **16/16 YEŞİL**, `workers: 1` (config pinli) |
| (temizlik) `kill -TERM` geçici api dev süreci | — | port 3100 serbest bırakıldı |
| `git status --porcelain \| wc -l` | 0 | 129 (başlangıçla AYNI — üretim kodu değiştirilmedi) |

**Playwright kök neden notu:** İlk koşumda `apps/admin` dev sunucusunun proxy hedefi
(`127.0.0.1:3000`, `vite.config.ts`'in varsayılanı) Arkesoft API'sine DEĞİL, **ilişkisiz
bir yabancı Next.js sürecine** (muhtemelen `cnc_proje`, port 3000'de önceden çalışıyordu,
ben başlatmadım) gidiyordu — tRPC istemcisi `"Unable to transform response from server"`
hatası verdi, "/" ziyareti sign-in'e yönlenmedi. Bu **T-016'nın bir regresyonu DEĞİL** —
gerçek API'ye (geçici olarak 3100'de başlattığım kendi sürecim) yönlendirildiğinde AYNI
süit **16/16 yeşil**. Yabancı sürece dokunmadım (durdurmadım); kendi başlattığım süreci
temizledim.

**`pnpm test:contract`**: Bu sürümde kök script yok (ADR/ROADMAP'te daha önce de not edilmiş,
`AGENT_BASELINE.md` §6'nın bilinen durumu) — "bu sürümde henüz yok."

---

## 6. MESAJ KATALOĞU PİNİ DOĞRULAMASI

`git diff --stat HEAD -- apps/admin/src/messages/messages.ts` → **115 eklenen, 0 silinen
satır**. `git diff ... | grep '^-' | grep -v '^---'` → **boş çıktı**, hiçbir satır silinmedi.
S10/frontend'in iddiası **doğrulandı**. Ancak yeni eklenen altı 2FA hata metni BİREBİR
pinlenmemiş (bkz. eksik senaryo #5) — mevcut `messages.test.ts` yalnızca genel/yapısal
kontrol yapıyor, metin sürüklenmesini (drift) yakalamaz.

---

## BULGULAR

- [SEV: low] `apps/api/src/__tests__/auth-path-sets.test.ts:165-169` — F4'ün (security,
  satır 158) İKİZİ bir totoloji: "birleşim TAM OLARAK AUTH_DELEGATED_PATHS" assert'i,
  `identityNotRequiredPaths`'in `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`'in tümleyeni olarak
  TANIMLANMASI nedeniyle o kümenin GERÇEK içeriğinden bağımsız her zaman doğrudur. Önerilen
  düzeltme: bu assert'i kaldır veya satır 171-180'deki `isAuthExemptPath()` çapraz kontrolüyle
  birleştir (gerçek bağımsız kaynak). Sorumlu ajan: qa (borçta, F4 ile birlikte kapatılabilir).

- [SEV: low] `apps/api/src/__tests__/two-factor-plugin-live.test.ts:344` — Better Auth'un
  per-challenge 5-deneme sınırının ürettiği `TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE` (400) hiçbir
  assert'te doğrulanmıyor, sadece yorumda açıklanıyor. Önerilen düzeltme: altıncı denemeyi
  AYNI challenge çereziyle yapıp 400 + bu kodu doğrulayan bir `it` eklemek. Sorumlu ajan:
  backend/qa.

- [SEV: low] `apps/api/src/__tests__/two-factor-plugin-live.test.ts:513-594` + hiçbir dosya
  (`generate-backup-codes` için) — `disable`/`generate-backup-codes` davranışsal sonucu
  (DB bayrağı/kod listesi gerçekten değişti mi, sonraki istek bunu yansıtıyor mu) uçtan uca
  kanıtlanmamış; mevcut kanıt yalnızca HTTP durumu + log olayı. Önerilen düzeltme: disable
  sonrası `user.twoFactorEnabled` DB okuması + yeni bir sign-in'in `twoFactorRedirect`
  DÖNDÜRMEDİĞİNİ doğrulayan bir assert; generate-backup-codes için eski kodun reddedildiğini
  yeni kodun kabul edildiğini doğrulayan bir HTTP testi. Sorumlu ajan: backend/qa.

- [SEV: low] `apps/api/src/__tests__/two-factor-acceptance-ac1-setup-flow.test.ts:139-141`
  (yorum) — AC11'in motive edici backend iddiası ("enable'ın ikinci çağrısı sırrı yeniden
  üretir, authenticator kaydını öldürür") kaynak kodu okunarak ÇIKARILMIŞ, hiçbir canlı HTTP
  testiyle doğrulanmamış. Frontend'in "bir kez çağır" davranışı iyi test edilmiş olsa da, bu
  davranışı GEREKLİ KILAN öncül kanıtlanmamış durumda. Sorumlu ajan: backend.

- [SEV: low] `apps/admin/src/__tests__/messages.test.ts` — altı yeni 2FA hata metni yalnızca
  `length>0` + anahtar-sayısı eşitliğiyle kapsanıyor, `INVALID_EMAIL_OR_PASSWORD`'ün aksine
  birebir metin pini yok; Türkçe metin kazara değişirse hiçbir test kırmızı olmaz. Sorumlu
  ajan: frontend.

- [SEV: low] `apps/admin/src/messages/messages.ts` (`formatAccountTemporarilyLockedMessage`)
  — dakika yuvarlama mantığının (Math.ceil, sınır değerler) sıfır test kapsamı var. Sorumlu
  ajan: frontend.

- [SEV: low] Flaky test ailesi — `two-factor-acceptance-ac4-secret-redaction-vacuity.test.ts`
  3 tam-süit koşumundan 1'inde Mailpit arama zaman aşımıyla düştü (`findLatestMailpitMessageTo`,
  `helpers/mailpit-client.ts`); aynı koşum ailesinde ayrı bir koşuda ilgisiz
  `validation.test.ts` ioredis `Command timed out` ile düştü — bu SONUNCUSU ROADMAP'in zaten
  kayıtlı QA-6 (v0.0.15) bulgusuyla AYNI semptom/aile. Üçüncü koşum 606/606 temiz. Kod mantığı
  değil, kaynak/zamanlama sorunu — susturmadım, raporluyorum. Sorumlu ajan: devops+backend
  (mevcut QA-2/QA-5/QA-6 ailesiyle birleştirilmeli, aynı önem derecesinde: low).

- [SEV: low, ZATEN KAYITLI — yeniden ölçüldü, YENİ bulgu değil] `apps/admin` 2FA bileşenleri
  için Playwright kapsamı sıfır (`TwoFactorSetupWizard.tsx`, `TwoFactorChallengeForm.tsx`,
  `TwoFactorStatusCard.tsx`, `two-factor-manage-controller.ts`'in dialog akışları) —
  `panel-flow.spec.ts` + `qa-blind-spot-and-negative-scenarios.qa.spec.ts`'te "two-factor"/
  "2FA"/"totp" dizisi SIFIR kez geçiyor (grep doğrulandı). ROADMAP'in "Vadesi v0.1.0" borç
  tablosunda (satır 2958) zaten `low`, `qa`, v0.1.0 olarak kayıtlı — bu satır o kaydı
  DOĞRULUYOR, yeni bir madde eklemiyor. Yeni Playwright spec yazmadım: kapsam genişletmesi +
  sıkı sign-in/sign-up oran-sınırı bütçesi riski (bkz. `playwright.config.ts` dosya başı
  yorumu, koşum başı ≤4 sign-in).

---

## SONUÇ

**PASS.** Dört ROADMAP kabul kriteri de gerçek HTTP + gerçek Postgres ile, status VE `code`
birlikte doğrulanarak kanıtlanmış; karşılıksız kriter yok. Genişletilmiş AC1-AC11'in 10'u
sağlam test edilmiş, AC9 bilinçli kapsam dışı (v0.0.15.1'e taşındı). Vacuity denetiminde
BİR yeni totoloji (F4'ün ikizi, satır 165-169) bulundu — `low`, qa borcuna ekleniyor. Sekiz
ek bulgu, hepsi `low` (kalibrasyon gerekçesi: literal AC'ye dokunmuyorlar, çoğu Better
Auth'a delege edilmiş davranışların ikincil/edge-case kapsamı, ikisi zaten mevcut ROADMAP
borcuyla aynı aile). 0 `critical`, 0 `high`, 0 `medium` → FAIL eşiği aşılmadı.

Playwright ile tespit edilen 2 başarısız test **ortam kirliliğinden** (port 3000'de yabancı
bir Next.js süreci) kaynaklandı, T-016 regresyonu DEĞİL — gerçek API'ye yönlendirildiğinde
aynı süit 16/16 yeşil, ayrıca doğrulandı.
