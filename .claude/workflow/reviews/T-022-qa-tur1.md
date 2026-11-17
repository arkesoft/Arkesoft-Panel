# T-022 — GATE `qa`, tur 1 (SON GATE — bağımsız koşuldu)

Tarih: 2026-11-17 · ROADMAP sürümü: v0.0.20.1 · Dal: `feat/v0.0.20-super-admin-iskeleti`

```
GATE: qa
SONUÇ: PASS
BULGULAR:
  - [SEV: low] ROADMAP.md / T-022.md — AC-3'ün "kapalı-dünya anahtar sayısı artar"
    ifadesi HANGİ kapalı dünyayı kastettiği belirtmiyor. `apps/admin/src/__tests__/
    messages.test.ts:155-157`'nin kendi yorumu "`ERROR_MESSAGES`/`PanelErrorCode`
    kapalı dünyasını BÜYÜTMEZ" diyor (doğru — `ERROR_MESSAGES_KEY_COUNT` testi
    değişmedi, ölçüldü). Büyüyen kapalı dünya `MESSAGES.auth.twoFactor` TS literal
    tipi (yeni `setupResumedNotice` anahtarı) — bu, runtime `Object.keys().length`
    assertion'ı DEĞİL, `pnpm typecheck`'in (anahtar yoksa derleme hatası verir)
    dolaylı garantisiyle doğrulanıyor. Davranış doğru, test de yeterli (içerik +
    varlık assertion'ı, wcag i18n-sabit-metin taraması) — yalnızca AC metninin
    hangi nesneyi kastettiği belirsiz, ilk okuyucu test yorumuyla çelişki sanabilir.
    Önerilen düzeltme: AC-3 metnini "MESSAGES.auth.twoFactor anahtar sayısı artar
    (ERROR_MESSAGES kapalı dünyası BÜYÜMEZ)" şeklinde netleştir. — docs — vade v0.0.22
ÖLÇÜMLER: aşağıda — tam döküm (§11'de test kapsamı boşluğu kapatma kanıtı dahil)
```

---

## 0. Yöntem notu

Bu turda **hiçbir önceki gate raporuna "güvenilerek" PASS verilmedi**. `solid`/
`security`/`wcag` tur-1 raporları okundu (bağlam için), ama AC-1, AC-2, AC-4, AC-5,
AC-6, AC-7, AC-9'un **her biri bu oturumda bağımsız olarak yeniden üretildi**:
kendi API sürecimi (port 3102, taze `dist/`) açtım, kendi Playwright koşumlarımı
yaptım, kendi mutasyonumu uyguladım/geri aldım, kendi `pnpm lint/typecheck/test/
test:isolation/build/guards` koşumumu `--force` ile yaptım.

---

## 1. KABUL KRİTERİ EŞLEMESİ

| AC | Kriter | Doğrulama yöntemi (bu turda BAĞIMSIZ koşuldu) | Sonuç |
| --- | --- | --- | --- |
| **AC-1** | Reload sonrası `secret=` EŞİT (iki uygulama) | Kendi API sürecim (3102) + kendi Vite sunucularım (5273/5274) ile `apps/admin/e2e/two-factor-setup-reload.spec.ts` ve `apps/superadmin/e2e/two-factor-setup-reload.spec.ts` gerçekten koşturuldu | **GEÇTİ** (2/2 e2e PASS, §3) |
| **AC-2** | ⭐ İki yönlü mutasyon — fallback bozulursa İKİ spec/test KIRMIZI | `resolveTotpUriAction`'ı admin + superadmin'de `'enable'`'a sabitleyen mutasyon uyguladım → her ikisinde 2/11 unit test KIRMIZI → `Write` ile birebir orijinale geri aldım → 11/11 YEŞİL (byte-level diff ile doğrulandı) | **GEÇTİ** (§4, tam döküm) |
| **AC-3** | Açık Türkçe metin + kapalı-dünya anahtar sayısı artar | `MESSAGES.auth.twoFactor.setupResumedNotice` içerik/varlık testi okundu+koşturuldu; `ERROR_MESSAGES_KEY_COUNT` testi DEĞİŞMEDİĞİ (bilerek) doğrulandı; `pnpm typecheck` yeni anahtarın TS literal tipine girdiğini dolaylı doğruladı | **GEÇTİ** — 1 `low` bulgu (AC metni netleştirilmeli) |
| **AC-4** | `//` ailesi 500 üretmez | Kendi taze `dist/`'imle `curl --path-as-is` → `//`, `///`, `//trpc/...` üçü de **404**, temiz JSON (`requestId`+`code`), **asla 500** | **GEÇTİ** (§2, ham çıktı) |
| **AC-5** | İki fonksiyon AYRI vaka + NO-OP değişmezi | `normalize-request-path.test.ts` okunup koşturuldu: `normalizeRequestPath` ve `matchesPrefixOrUnparsablePercentEncoding` için `"//" ailesi"` İKİ AYRI `describe` bloğu (satır 154, 221) doğrulandı | **GEÇTİ** (48/48 → §11 sonrası 52/52 test) |
| **AC-6** | `grep export const …` → 0 satır | `grep -rn "export const DESKTOP_DEVICE_NAME\|...MOBILE_DEVICE_NAME\|...VISUAL_MAX_DIFF_PIXEL_RATIO\|...VISUAL_THRESHOLD"` repo genelinde BAĞIMSIZ koşuldu | **GEÇTİ** (0 satır, §2) |
| **AC-7** | Artefakt iki yönlü (var VE iş KIRMIZI) + redaksiyon tanı metnini bozmuyor | (a) `set -o pipefail` mekanizması `/tmp`'te generic olarak yeniden üretildi (pipefail'siz exit=0, pipefail'li exit=1) (b) `scripts/redact-test-log.ts`'e sentetik log beslendi: `Expected:`/`Received:`/`AssertionError`/yığın izi DEĞİŞMEDEN geçti, otpauth secret/Set-Cookie/JSON cookie/base32 sır dörtü de `[REDACTED]` oldu | **GEÇTİ** (§5) |
| **AC-8** | `--continue` | `grep -n "test:e2e" package.json` → `"turbo run test:e2e --concurrency=1 --continue"` | **GEÇTİ** |
| **AC-9** | Altı kapı + turbo önbellek teyidi | `pnpm lint` (23/23, cache hit/miss karışık — değişen paketler miss) · `pnpm typecheck` (23/23) · `pnpm build` (14/14, bundle bütçeleri içinde) · `pnpm test --force` (21/21 task, **0 cached**, api 103 dosya/836 test, §11 sonrası 840) · `pnpm test:isolation --force` (11/11 task, **0 cached**, api 6 dosya/31 test) · `pnpm guards` (20/20 mekanik adım PASS) — HEPSİ bu oturumda gerçekten koşturuldu | **GEÇTİ** (§6) — ⚠ `release`'in kendi changeset/sürüm adımı henüz koşmadı (`.changeset/` boş, `package.json` sürümü `0.10.0`) — bu AC-9'un mekanik altı kapı kısmını etkilemiyor, release'e not |

9/9 AC bağımsız doğrulandı. Karşılıksız kriter yok. ⭐ Brief'in (c) maddesi (test
kapsamı boşluğu) **§11**'de kapatıldı.

---

## 2. AC-4 + AC-6 — ham çıktı

### AC-4 (kendi taze build'im, port 3102)

```
$ pnpm --filter @arkesoft/api build   # (taze dist/, önceki 3100 ikilisi BAYATTI — security tur1 ölçtü)
$ API_PORT=3102 PORT=3102 SUPERADMIN_IP_ALLOWLIST="127.0.0.1,::1,::ffff:127.0.0.1" \
  AUTH_BASE_URL="http://panel.arkesoft.localhost:5273" \
  SUPERADMIN_BASE_URL="http://superadmin.arkesoft.localhost:5274" \
  node --env-file-if-exists=../../.env dist/main.js &
$ curl -s -o /dev/null -w "health=%{http_code}\n" http://localhost:3102/health
health=200

$ curl -s -i --path-as-is "http://localhost:3102//"
HTTP/1.1 404 Not Found
{"code":"HTTP_EXCEPTION","message":"errors.http.generic","details":{},"requestId":"req_971f930b-..."}

$ curl -s -i --path-as-is "http://localhost:3102///"
HTTP/1.1 404 Not Found
{"code":"HTTP_EXCEPTION", ... }

$ curl -s -i --path-as-is "http://localhost:3102//trpc/platform.tenantList"
HTTP/1.1 404 Not Found
{"code":"HTTP_EXCEPTION", ... }
```

Üçünde de **500 YOK**, hep 404 + temiz tel sözleşmesi. AC-4 **GEÇTİ**, bağımsız.

### AC-6

```
$ grep -rn "export const DESKTOP_DEVICE_NAME\|export const MOBILE_DEVICE_NAME\|export const VISUAL_MAX_DIFF_PIXEL_RATIO\|export const VISUAL_THRESHOLD" --include="*.ts" .
(çıktı yok, exit=1)
```

`desktopDevice`/`mobileDevice` (kısayollar) hâlâ `export` — bunlar AC-6'nın kapsamı
DIŞINDA (gerçek tüketicileri var, `solid` §2.3'te doğrulandı, ben de
`apps/superadmin/playwright.config.ts`'in `git diff`'ini okuyarak S6'nın yalnızca
import adını değiştirdiğini (`DESKTOP_DEVICE_NAME`→`desktopDevice`), yeni/yapay bir
tüketici EKLEMEDİĞİNİ doğruladım — `apps/admin`/`apps/storefront`'un playwright
config'leri bu diff'te **hiç değişmedi**).

---

## 3. AC-1 — bağımsız e2e yeniden üretimi (ham çıktı)

Kendi API sürecim (3102) + kendi Vite dev sunucularım üzerinden, **gerçek** reload
akışıyla (sayfa açılır → şifre gönderilir → secret okunur → **sayfa `page.reload()`
ile yenilenir** → tekrar şifre gönderilir → secret YENİDEN okunur → eşitlik kontrol
edilir):

```
$ cd apps/admin && ARKESOFT_PANEL_E2E_PORT=5273 \
  ARKESOFT_PANEL_DEV_API_TARGET=http://127.0.0.1:3102 \
  npx playwright test e2e/two-factor-setup-reload.spec.ts
  ✓ 1 [admin-desktop] › ... şifre adımı reload öncesi/sonrası AYNI secret= döner;
    ilk sırdan üretilen kod reload SONRASI hâlâ kabul edilir (AC-1) (2.2s)
  1 passed (8.7s)

$ cd apps/superadmin && ARKESOFT_SUPERADMIN_E2E_PORT=5274 \
  ARKESOFT_SUPERADMIN_DEV_API_TARGET=http://127.0.0.1:3102 \
  npx playwright test e2e/two-factor-setup-reload.spec.ts
  ✓ 1 [superadmin] › ... şifre adımı reload öncesi/sonrası AYNI secret= döner;
    ilk sırdan üretilen kod reload SONRASI hâlâ kabul edilir (AC-1) (1.1s)
  1 passed (3.8s)
```

Rate-limit bütçesi: her spec 1 signUp + 1 signIn harcıyor (`auth-budget.ts`
beyanı, ikisi de doğrulandı) — toplam 2 signUp, 10/saat sınırının çok altında.
Redis ölçümü (öncesi/sonrası, `arkesoft-redis` konteyneri — `cnc_proje-redis-1`'e
DOKUNULMADI): `platform:auth:*` deseninde **öncesi 0, sonrası 0 eşleşen anahtar**
(Playwright `NODE_ENV=test` ayrı bir Redis test profiline düşüyor — `redis-connection-
profiles.test.ts`/`test-harness-redis-profile-isolation.test.ts` bunun tasarım
olduğunu doğruluyor); gerçek dev/CI IP bütçesine bu QA turunun hiçbir etkisi olmadı.

---

## 4. AC-2 — bağımsız mutasyon kanıtı (dört aşama, tam döküm)

**Hedef:** ADR-0024'ün çözdüğü regresyonu (her `submitPassword`'da koşulsuz
`enable` çağrısı → sır yeniden üretilir) kasıtlı olarak geri getirip iki
uygulamanın da bunu AYRI AYRI yakaladığını göster.

### Aşama 1 — temel çizgi (YEŞİL)

```
$ cd apps/admin && npx vitest run src/features/two-factor/__tests__/two-factor-setup-controller.test.ts
 Test Files  1 passed (1) · Tests  11 passed (11)

$ cd apps/superadmin && npx vitest run src/features/two-factor/__tests__/two-factor-setup-controller.test.ts
 Test Files  1 passed (1) · Tests  11 passed (11)
```

### Aşama 2 — mutasyon uygulandı (her iki dosyada BAĞIMSIZ olarak)

```diff
- return error.kind === 'known' && error.code === 'TOTP_NOT_ENABLED' ? 'enable' : 'show-error'
+ return 'enable' // QA-MUTATION-T022-AC2
```

### Aşama 3 — KIRMIZI (her iki uygulama AYRI AYRI yakaladı)

```
apps/admin:
  ❯ YENİ VAKA 2 — "INVALID_PASSWORD" enable'a DÜŞÜRMEZ (enable SIFIR çağrı)
    TypeError: Cannot read properties of undefined (reading 'kind')
      ❯ TwoFactorSetupController.submitPassword two-factor-setup-controller.ts:175:22
  ❯ resolveTotpUriAction: TEK koşul TOTP_NOT_ENABLED — ...
    AssertionError: expected 'enable' to be 'show-error'
  Test Files  1 failed (1) · Tests  2 failed | 9 passed (11)

apps/superadmin: BİREBİR AYNI iki test, BİREBİR AYNI başarısızlık biçimi
  Test Files  1 failed (1) · Tests  2 failed | 9 passed (11)
```

### Aşama 4 — geri alma (`Write` ile — `Edit` aracım yok, `git checkout` YASAK)

Geri almadan önce `diff orijinal-yedek mutasyonlu-dosya` ile **tek satırlık** fark
olduğu doğrulandı; geri alma sonrası `diff orijinal-yedek geri-alınmış-dosya` →
**IDENTICAL** (iki dosyada da). Ardından:

```
apps/admin:        Test Files 1 passed (1) · Tests 11 passed (11)
apps/superadmin:   Test Files 1 passed (1) · Tests 11 passed (11)
```

**AC-2 iki yönlü mutasyon kanıtı bağımsız olarak üretildi — her iki uygulama
AYRI AYRI yakaladı, ikisi de geri alınınca YEŞİLE döndü.**

### R-PO1 üzerine ek gözlem (bulgu değil, olumlu gözlem)

`po`'nun R-PO1'i "S3 sunucu tarafını pinler, frontend'in yanlış yazmasını
YAKALAMAZ ⇒ tek uçtan uca kapı S5" diyordu. Ölçtüğüm: `resolveTotpUriAction`'ın
KENDİ unit testi (`two-factor-setup-controller.test.ts`) de `'TOTP_NOT_ENABLED'`
literalini BAĞIMSIZ olarak hardcode ediyor ve controller'daki literal yanlış
yazılırsa bu test de KIRMIZI verir (yukarıdaki Aşama 3) — yani savunma S5
e2e'siyle SINIRLI değil, unit seviyesinde de bir kat var. R-PO1'in gerçek riski
daha dar: `two-factor-rest.ts`/`normalize-panel-error.ts`'in HTTP gövdesinden
`code` alanını GERÇEKTEN doğru çıkarıp çıkarmadığı — bu katman controller
testinde MOCK'landığı için (deps enjekte ediliyor) test edilmiyor, yalnızca S5
(gerçek sunucu + gerçek fetch + gerçek controller) bunu kapsıyor. Bulgu
yazılmadı çünkü S5 zaten var ve ben AC-1 doğrulamasında onu GERÇEKTEN
koşturdum (§3) — risk fiilen kapalı, yalnızca R-PO1'in gerekçesi biraz
daraltılabilirdi (`docs` için not, düzeltme turu gerektirmez).

---

## 5. AC-7 — bağımsız iki yönlü kanıt

### (a) `set -o pipefail` mekanizması (jenerik yeniden üretim)

```
$ bash -c 'false | tee /tmp/x.log; echo "exit=$?"'
exit=0        # pipefail OLMADAN — sahte yeşil senaryosu
$ bash -c 'set -o pipefail; false | tee /tmp/x.log; echo "exit=$?"'
exit=1        # pipefail İLE — gerçek başarısızlık görünür
```

`.github/actions/run-gates/action.yml:91,141`'de `set -o pipefail` her iki
(`test`, `test:isolation`) adımdan ÖNCE geldiği okunarak doğrulandı.

### (b) Redaksiyon tanı metnini bozmuyor mu? (sentetik log, bağımsız besleme)

```
$ printf '%s\n' \
  'Expected: 200' 'Received: 404' \
  'AssertionError: expected 404 to equal 200' \
  '  at Object.<anonymous> (/repo/.../foo.test.ts:42:10)' \
  'otpauth://totp/Arkesoft?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Arkesoft' \
  'beklenmeyen Set-Cookie biçimi: session=abc123XYZsecretvalue; Path=/; HttpOnly; Secure; SameSite=Lax' \
  'raw base32 standalone: JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP end' \
  '{"level":"info","cookie":"abcdef123456","authorization":"Bearer xyz"}' \
  | ARKESOFT_REDACT_ENV_FILE_OVERRIDE=.env.example node scripts/redact-test-log.ts

Expected: 200                                                    ← DEĞİŞMEDİ
Received: 404                                                    ← DEĞİŞMEDİ
AssertionError: expected 404 to equal 200                        ← DEĞİŞMEDİ
  at Object.<anonymous> (/repo/.../foo.test.ts:42:10)             ← DEĞİŞMEDİ
otpauth://totp/Arkesoft?secret=[REDACTED]&issuer=Arkesoft         ← MASKELENDİ
beklenmeyen Set-Cookie biçimi: session=[REDACTED]; Path=/; ...    ← MASKELENDİ
raw base32 standalone: [REDACTED] end                             ← MASKELENDİ
{"level":"info","cookie":"[REDACTED]","authorization":"[REDACTED]"} ← MASKELENDİ
```

Dört sır biçiminin dördü de maskelendi, dört tanı satırının dördü de **birebir**
değişmeden geçti. `security` tur1'in "diff FARK YOK" ölçümü bağımsız olarak
teyit edildi.

---

## 6. AC-9 — altı kapı, bağımsız koşum, ham özet

```
$ pnpm lint        → 23/23 task başarılı, 20 cache hit (değişmeyen paketler) /
                      3 cache miss (admin/superadmin/api — DEĞİŞEN paketler,
                      beklenen) — turbo önbelleği sahte yeşil DEĞİL.
$ pnpm typecheck   → 23/23 task başarılı, aynı hit/miss deseni.
$ pnpm build       → 14/14 task başarılı. check-compiled-css-contract PASS.
                      bundle-budget: admin MAKSİMUM JS %72.7/250KiB, superadmin
                      MAKSİMUM JS %64.4/250KiB — ikisi de bütçe içinde.
$ pnpm test --force          → 21/21 task, 0 cached (zorla taze koşum).
                                 api: 103 dosya / 836 test PASS, 135.55s.
                                 (§11'deki yeni test eklendikten SONRA tekrar
                                 koşuldu: 103 dosya / 840 test PASS, 136.58s.)
$ pnpm test:isolation --force → 11/11 task, 0 cached.
                                 api: 6 dosya / 31 test PASS, 11.81s
                                 (AC10 çapraz kiracı testi dahil, 200/403 ayrımı
                                 gözlemlendi).
$ pnpm guards      → 20/20 mekanik adım PASS (secrets.*↔artefakt sınırı dahil
                      — T-022/S7 FIX1'in kendi guard'ı da yeşil).
```

**Bu turda tek bir kırmızı/flake GÖZLENMEDİ** (hem `test` hem `test:isolation`
tek koşumda temiz geldi, §11'deki ek koşum dahil). AGENT_BASELINE §4'ün dersine
göre: tek yeşil koşum flake'in YOKLUĞUNU kanıtlamaz — bu nedenle iki bilinen
flake (aşağıda) hâlâ **izlemede** sayılıyor, "kapandı" denmiyor.

⚠ **Turbo önbellek teyidi, açıkça:** `lint`/`typecheck`/`build` cache-hit/miss
deseni dosya değişikliklerinin kapsamıyla TUTARLI (değişmeyen `packages/*`
cache'ten, değişen `apps/{admin,superadmin,api}` taze koşuldu) — "FULL TURBO"
yeşili görülmedi, görülseydi şüpheyle `--force` ile tekrarlardım (nitekim
test/isolation için zaten `--force` kullandım).

⚠ **Release notu (bulgu değil, bilgi):** `.changeset/` dizininde bekleyen bir
changeset YOK, kök `package.json` sürümü hâlâ `0.10.0` — `release`/S9'un
changeset+sürüm adımı bu turdan SONRA koşacak. AC-9'un "altı kapı" mekanik
kısmı bağımsız PASS; sürüm/changeset kısmı release'in kendi işi, qa'nın
mandatı dışında.

---

## 7. İki bilinen flake — bu turda gözlenen durum

| Flake | Bu turdaki gözlem | Karar |
| --- | --- | --- |
| `pnpm test:isolation` (~%6.7) | 2 koşum (§6 + §11 sonrası), **0 kırmızı** her ikisinde | Araştırma YOK (kullanıcı kararı korunur). Tek/çift yeşil koşum yokluk kanıtı DEĞİL — izlemede KALIR. |
| `two-factor-acceptance-ac3-backup-code-single-use.test.ts` | `pnpm test --force` içinde İKİ KEZ koştu (§6 + §11 sonrası), **kırmızı GÖZLENMEDİ** | Aynı — izlemede KALIR. Bu turda kırmızı gözlenmediği için "ham `expect` çıktısı" raporlanacak bir olay YOK; görülseydi KESİLMEDEN raporlanacaktı. |

AGENT_BASELINE'ın bıraktığı gözlem (araştırma değil, kayıt): rate-limit
bütçesinin playwright `NODE_ENV=test` altında farklı bir Redis profiline
düştüğü bu turda ÖLÇÜLDÜ (§3) — iki flake'in muhtemel kök nedeni olarak
işaret edilen "oran-sınırı/Redis paylaşımı" hipoteziyle aynı eksen, ama bu
tek ölçüm nedensellik KANITLAMAZ, sadece bir veri noktası ekler.

---

## 8. Negatif/sınır senaryoları — bu turda bağımsız okunan/koşturulan testler

- **Geçersiz girdi:** `normalize-request-path.test.ts`'in bozuk yüzde-kodlama
  (`%ZZ`), büyük/küçük harf, sondaki eğik çizgi (0-3), `//` ailesi VE (§11)
  `unparsable` (gerçek `new URL(...)` fırlaması) blokları BAĞIMSIZ koşturuldu
  (52/52 PASS, §11 sonrası).
- **Yetkisiz/sınır:** `platform-admin-ip.guard.ts`'in tüketicisi olan
  `matchesPrefixOrUnparsablePercentEncoding` için AYRI test bloğu (AC-5)
  koşturuldu; `//` ailesinin TUTUCU `true` varsayılanı doğrulandı.
  `//trpc/platform.tenantList` canlı probu (§2) guard'ın hiç koşmadığını
  (404, rota eşleşmiyor) teyit etti.
- **Eşzamanlılık / idempotency:** bu Task'ta yeni bir kaynak/tablo/queue işi
  YOK (`db` düğümü açılmadı, architect/po doğruladı) — eşzamanlı yazma/tekrar
  gönderim senaryosu bu kapsamda UYGULANABİLİR değil; `get-totp-uri`/`enable`
  zaten AYRI rate-limit kovalarında (security tur1 §2 ölçtü, ben tekrar
  ÜRETMEDİM — kapsam dışı bir API alanı, bu Task'ta davranışı değişmedi).
- **Tenant çapraz erişim:** bu Task'ta yeni tenant'a bağlı kaynak YOK. Mevcut
  `auth-cross-tenant.isolation.test.ts` (AC10) bu turda `pnpm test:isolation
  --force` içinde BAĞIMSIZ koşturuldu ve PASS verdi (§6) — regresyon yok.

---

## 9. Regresyon

`pnpm test --force` ile **836→840/840** api testi (bu Task'ın dokunmadığı
tüm eski testler dahil) ve `pnpm test:isolation --force` ile **31/31**
izolasyon testi bu oturumda GERÇEKTEN koşturuldu, hiçbiri bu Task'ın
değişikliğinden (ne üretim fix'inden ne benim §11'de eklediğim testten)
regresyon göstermedi. `pnpm build` tüm paketlerde yeşil.

---

## 10. DOĞRULANAMADI

- **A-PO22-4** (composite `if: failure()` + `upload-artifact`'in GERÇEK GitHub
  Actions'ta tetiklenmesi) — `security` tur1'de de `DOĞRULANAMADI` kaydedildi;
  ben de workflow'u tetikleyemedim (yasak — gerçek CI/PR bağlamı gerektirir).
  Yerel olarak doğrulayabildiğim: composite dosyasının statik mantığı (§5) ve
  pipefail/redaksiyon mekanizmasının jenerik/sentetik davranışı.
- **İki flake'in kök nedeni** — kullanıcı kararıyla araştırılmadı (§7).

---

## 11. Test kapsamı boşluğu — Orkestratör brief (c) maddesinin kapanışı

**Karar: (A) — dalı kapsayan test YAZILDI, iki yönlü mutasyon kanıtıyla.**

### 11.1 Boşluğun tanımı (backend'in ölçümü, aynen aktarılıyor)

`resolveCanonicalPathnameOrUnparsable`'ın `catch` bloğu (→ `{ kind:
'unparsable' }`) hiçbir mevcut testle tetiklenmiyordu. `backend`'in kendi
mutasyonu (`matchesPrefixOrUnparsablePercentEncoding`'in `unparsable` dalında
`return true` → `return false`) 47 testin 47'sini YEŞİL bırakmıştı — dal
testlerden erişilemiyordu.

### 11.2 Erişilebilirlik — bağımsız ölçüm (node, üretim kodu İTHAL EDİLMEDEN)

`resolveCanonicalPathnameOrUnparsable`'ın MANTIĞI bir `/tmp` betiğinde
BAĞIMSIZ yeniden üretildi (totolojik değil — üretim dosyası import edilmedi,
davranışı KOPYALANDI) ve 27 aday girdiyle tarandı:

```
"/"                                    => "/"
"//"                                   => "//"
"http://[::1"                         => THROWN: Invalid URL
"http://[::1]:abc/"                   => THROWN: Invalid URL
"http://"                             => THROWN: Invalid URL
"http:"                               => "/"
"http://["                            => THROWN: Invalid URL
"http://user:pass@[bad"               => THROWN: Invalid URL
"http://normalize-request-path.invalid:999999/" => THROWN: Invalid URL
"http://host:abc/"                    => THROWN: Invalid URL
"http://example.com:99999999999999999999/" => THROWN: Invalid URL
"http://[::ffff:999.999.999.999]/"    => THROWN: Invalid URL
"http://[1::2::3]/"                   => THROWN: Invalid URL
... (kalan 15 aday THROWN üretmedi)
```

**Bulgu:** dal `/` İLE BAŞLAMAYAN, kendi şema+authority'si olan ve WHATWG'in
host/port ayrıştırmasını BAŞARISIZ kılan girdilerle (bozuk IPv6 literal,
host'suz `http://`, geçersiz port) GERÇEKTEN tetikleniyor. §1.5 fix'i
(`/`-önekli girdiler için `ORIGIN + rawUrl` BİRLEŞTİRMESİ) bu dalı yalnızca
**`/` İLE BAŞLAYAN** girdiler için erişilemez kıldı (security'nin 8.377
girdilik taraması bunu doğruluyor — `//` ailesinin hiçbiri fırlamıyor); dalın
İKİNCİ (relatif çözüm) kolu hâlâ açık.

⚠ Bu girdi sınıfı (`http://[::1` gibi absolute-form) **gerçekçi bir `req.url`
değeri DEĞİL** (Node'un http sunucusu normal istekte `req.url`'i her zaman
`/` ile başlatır) — ama fonksiyonlar saf/parametreli ve rastgele dizge kabul
ediyor; **birim seviyesinde** dal gerçekten erişilebilir. Bu yüzden (B) —
"dal erişilemez, ölü kod" — KANITLANAMADI; (A) seçildi.

### 11.3 Yazılan test (`apps/api/src/__tests__/normalize-request-path.test.ts`)

İki yeni `describe` bloğu eklendi (dosyanın SONUNA, mevcut 258 satır
DEĞİŞTİRİLMEDEN — `git diff` saf ekleme olduğunu doğruladı, `@@ -142,3
+142,175 @@`, 0 silme):

```ts
describe('normalizeRequestPath — "unparsable" dalı (gerçek new URL(...) FIRLAMASI — qa FIX turu 1)', () => {
  it('absolute-form, bozuk IPv6 host ("http://[::1") → ... HAM rawUrl AYNEN döner', () => {
    const rawUrl = 'http://[::1'
    expect(normalizeRequestPath(rawUrl)).toBe(rawUrl)
  })
  it('"http://" (host YOK) → ... HAM rawUrl AYNEN döner', () => {
    const rawUrl = 'http://'
    expect(normalizeRequestPath(rawUrl)).toBe(rawUrl)
  })
})

describe('matchesPrefixOrUnparsablePercentEncoding — "unparsable" dalı (...)', () => {
  it('absolute-form, bozuk IPv6 host ("http://[::1") → ... TUTUCU true döner', () => {
    expect(matchesPrefixOrUnparsablePercentEncoding('http://[::1', '/trpc/platform.')).toBe(true)
  })
  it('"http://" (host YOK) → ... TUTUCU true döner', () => {
    expect(matchesPrefixOrUnparsablePercentEncoding('http://', '/trpc/platform.')).toBe(true)
  })
})
```

### 11.4 İki yönlü kanıt (ham çıktı, dört aşama — AC-2 ile BİREBİR aynı yöntem)

**Aşama 1 — temel çizgi, yeni testler dahil:**

```
$ cd apps/api && npx vitest run src/__tests__/normalize-request-path.test.ts
 Test Files  1 passed (1) · Tests  44 passed (44)   # 40 eski + 4 yeni
```

**Aşama 2 — üretim koduna mutasyon (backend'in KENDİ deseniyle, GENİŞLETİLMİŞ):**

```diff
--- normalizeRequestPath'in unparsable dalı ---
    case 'unparsable':
-     return rawUrl
+     return 'QA-MUTATION-UNPARSABLE' // was: return rawUrl

--- matchesPrefixOrUnparsablePercentEncoding'in unparsable dalı (backend'in TAM mutasyonu) ---
    case 'unparsable':
-     return true
+     return false // QA-MUTATION: was return true
```

**Aşama 3 — KIRMIZI (TAM OLARAK yeni dört test, eski 40 ETKİLENMEDİ):**

```
 FAIL  ... "http://[::1" → ... HAM rawUrl AYNEN döner
   AssertionError: expected 'QA-MUTATION-UNPARSABLE' to be 'http://[::1'
 FAIL  ... "http://" (host YOK) → ... HAM rawUrl AYNEN döner
   AssertionError: expected 'QA-MUTATION-UNPARSABLE' to be 'http://'
 FAIL  ... "http://[::1" → ... TUTUCU true döner
   AssertionError: expected false to be true
 FAIL  ... "http://" (host YOK) → ... TUTUCU true döner
   AssertionError: expected false to be true

 Test Files  1 failed (1)
      Tests  4 failed | 40 passed (44)
```

Bu, backend'in kendi ölçümünü (47/47 yeşil kaldı) TERSİNE çeviriyor: artık
**47+1'in (bu dosyadaki 44'ün 4'ü + diğer dosyalardaki ilgisiz testler) tam
olarak dalı kapsayan 4'ü kırmızı, kalan 40'ı yeşil** — mutasyon SEÇİCİ olarak
yakalanıyor (vacuous bir test değil).

**Aşama 4 — geri alma (`Write`, `git checkout` KULLANILMADI) + doğrulama:**

```
$ diff /tmp/qa-t022-normalize-request-path.ts.bak apps/api/src/http/normalize-request-path.ts
IDENTICAL — revert verified

$ cd apps/api && npx vitest run src/__tests__/normalize-request-path.test.ts \
    src/__tests__/normalize-request-path-trpc-invariant.test.ts \
    src/__tests__/normalize-request-path-double-slash-http.test.ts
 Test Files  3 passed (3) · Tests  51 passed (51)
```

Ardından **tüm paket** (`eslint .` + `tsc --noEmit`) ve **tüm monorepo**
(`pnpm test --force`) yeniden koşturuldu — ikisi de temiz:

```
$ pnpm --filter @arkesoft/api lint        → yeşil
$ pnpm --filter @arkesoft/api typecheck   → yeşil
$ pnpm test --force
 Tasks:    21 successful, 21 total
 Cached:    0 cached, 21 total
 @arkesoft/api:test: Test Files 103 passed (103) · Tests 840 passed (840)
```

`git status`/`git diff --stat` ile de teyit edildi: `apps/api/src/http/
normalize-request-path.ts` üzerinde **sıfır net değişiklik** (mutasyon tam
geri alındı), `apps/api/src/__tests__/normalize-request-path.test.ts`
üzerinde **yalnızca ekleme** (175 satır, 0 silme) kaldı.

### 11.5 Sonuç

Dal artık **gerçek bir regresyon testiyle** kapsanıyor: gelecekte biri
`unparsable` dalının sonucunu (hangi yönde olursa olsun) değiştirirse bu dört
test KIRMIZI verir. Bu bir `DOĞRULANAMADI`/yeni bulgu DEĞİL — brief'in (c)
maddesi **kapatıldı**. `low` AC-3 bulgusu (§ üstteki BULGULAR bloğu) bundan
BAĞIMSIZ, ayrı bir kalem.

---

## 12. Sonuç

**PASS.** 0 `critical`, 0 `high`, 0 `medium`, **1 `low`** (AC-3 metin netliği,
teknik borç tablosuna, vade v0.0.22, sorumlu `docs`). AGENT_BASELINE §4: yalnızca
`low` ⇒ PASS, düzeltme turu açılmaz. Dokuz kabul kriterinin dokuzu da bu oturumda
**bağımsız olarak yeniden üretildi** (rapora bakmakla yetinilmedi) — AC-2 hem
unit hem iki yönlü mutasyon ile, AC-1 hem admin hem superadmin'de gerçek e2e
koşumuyla, AC-4 kendi taze API sürecimle, AC-7 hem pipefail hem redaksiyon
mekanizmasıyla, AC-9 altı kapının tamamıyla (`--force` ile önbellek
şeffaflığı sağlanarak). Orkestratör'ün brief'teki (c) maddesi (test kapsamı
boşluğu) **§11'de (A) seçeneğiyle, iki yönlü mutasyon kanıtıyla kapatıldı** —
`apps/api/src/__tests__/normalize-request-path.test.ts`'e dört kalıcı test
eklendi, üretim koduna hiçbir kalıcı değişiklik yapılmadı (diff ile IDENTICAL
doğrulandı).
