T-006 — Kimlik doğrulama (Better Auth) — QA Gate, Tur 2 (FIX turu 1 sonrası, dar kapsam)
Tarih: 2026-10-29
Sürüm: v0.0.5 (minor)
Dal: main (commit atılmadı)

GATE: qa
SONUÇ: FAIL

**FAIL gerekçesi (AGENT_BASELINE §4, mekanik):** 3 `medium` bulgu (≥3 medium = FAIL).
`critical` yok, `high` yok. Üçü de düşük maliyetli (test mantığı düzeltmesi + bir log
satırı + mevcut flaky borcunun devamı).

---

## AC1–AC11 — GERİLEME var mı?

Tur 1'de hepsiPASS'ti. Bu tur hepsi **yeniden koşuldu, gerileme YOK**:

| AC   | Yeniden doğrulama (bu tur)                                                                                                                                                                | Sonuç |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| AC1  | `pnpm lint/typecheck/format:check/test/test:isolation/build` — bkz. "Kapı" bölümü aşağıda                                                                                                 | PASS* |
| AC2  | `pnpm test` içindeki `catalog-lint` (db paketi) — değişmedi, 3× yeşil koşum                                                                                                               | PASS  |
| AC3  | Dosya incelemesi — `schema.prisma`'da `tenant_membership.user_id` → `app_user.id` FK'si FIX1'de dokunulmadı                                                                               | PASS  |
| AC4  | `auth-flow.test.ts` hedefli koşum (18 test) — 3× tam `pnpm test` + hedefli koşum, hepsi yeşil                                                                                             | PASS  |
| AC5  | `auth-flow.test.ts` "AC5" describe'u hedefli koşumda yeşil                                                                                                                                | PASS  |
| AC6  | `auth-sessions.test.ts` hedefli koşumda yeşil; F3 kasıtlı bozma AC6'nın bağımsız mantığını BOZMADI (ayrı mekanizma)                                                                       | PASS  |
| AC7  | `rate-limit.test.ts` + `rate-limit-policy.test.ts` hedefli koşumda yeşil (107 test, 7 dosya)                                                                                              | PASS  |
| AC8  | `auth-secret-leak.test.ts` tam akış testi 3× tam koşumda yeşil — yeni `info` olayları (F6/M-5) hiçbir satırda tam e-posta/ipAddress SIZDIRMIYOR                                           | PASS  |
| AC9  | `AUTH_EXEMPT_PATHS` (9, değişmedi) · `AUTH_OWN_PATHS` (3, değişmedi) · `TENANT_EXEMPT_PATHS` (12, değişmedi) — dosyalardan BİREBİR doğrulandı, dördüncü küme testi (M-3 düzeltmesi) yeşil | PASS  |
| AC10 | `auth-cross-tenant.isolation.test.ts` — `vitest.isolation.config.ts` ile ayrı koşumda yeşil (2 kez doğrulandı)                                                                            | PASS  |
| AC11 | Dosya incelemesi — `mail-transport.test.ts`'e dokunulmadı; `pnpm audit` bu turda ayrıca koşulmadı (FIX1 bağımlılık eklemedi, risk yok) — "çalıştırılmadı"                                 | N/A*  |

`*` AC1: lint/typecheck/build/test/test:isolation **oturumun başında temiz ölçüldü**
(bkz. "Kapı" bölümü) — oturumun SONUNDA `security` gate'in eşzamanlı çalıştığı
PAYLAŞILAN ağaca bıraktığı geçici prob dosyaları (`zzsecprobe2-5.test.ts`)
`lint`/`typecheck`'i KİRLETTİ. Bu **T-006'nın FIX1'inden KAYNAKLANMIYOR** — ayrı
madde olarak aşağıda raporlanıyor, T-006'nın PASS/FAIL'ine KATILMIYOR (nedensellik
yok), ama Orkestratör'e AÇIKÇA bildiriliyor.

---

## Madde 2 — ⚠ Yeni testleri KASITLI BOZMA (F3, F5)

### F3 — `revokeSessionsOnPasswordReset`

`apps/api/src/auth/auth-instance.ts:250` → `true` → **geçici `false`** yapıldı.

```
AssertionError: expected 200 to be 401
 ❯ src/__tests__/auth-flow.test.ts:444:41
```

`auth-flow.test.ts`'in F3 testi **gerçekten KIRMIZI** verdi (önceden kurulan çerez
sıfırlama sonrası hâlâ 200 dönüyordu — test bunu YAKALADI). Dosya `cp` ile
yedeklenen orijinaliyle **byte-birebir** geri yüklendi (`diff` çıktısı **boş**),
test yeniden koşturuldu → YEŞİL (`1 passed`). F3 sahte-yeşil DEĞİL.

### F5 — `SameOriginGuard`

`apps/api/src/auth/sessions.controller.ts`'ten `@UseGuards(SameOriginGuard)`
**geçici kaldırıldı**.

```
AssertionError: expected 200 to be 403   (Origin: evil.example.com testi)
AssertionError: expected 404 to be 403   (Sec-Fetch-Site: cross-site testi)
 ❯ src/__tests__/same-origin-guard.test.ts:95 / :114
```

`same-origin-guard.test.ts`'in İKİ gerçek-HTTP testi **gerçekten KIRMIZI** verdi.
`cp` ile yedeklenen orijinaliyle **byte-birebir** geri yüklendi (`diff` çıktısı
**boş**), test yeniden koşturuldu → YEŞİL (`8 passed`). F5 sahte-yeşil DEĞİL.

---

## Madde 3 — ⚠ `SameOriginGuard` FAIL-OPEN davranışsal ölçüm

Önceki (yarıda kesilen) oturumdan kalan `same-origin-guard-fail-open.qa.test.ts`
dosyası incelendi, çalıştırıldı ve geçerli bulundu (mevcut testleri DEĞİŞTİRMİYOR,
üretim kodunu DEĞİŞTİRMİYOR) — bu turda **korundu ve kullanıldı**.

**Ölçüm:** `Origin` **VE** `Sec-Fetch-Site` başlıkları İKİSİ DE hiç gönderilmeden
(iki canlı oturum, aynı hesap) `POST /auth/sessions/revoke-all` çağrıldı:

- Yanıt: **200** (`guard` istek GEÇİRDİ).
- Mutasyon GERÇEKTEN gerçekleşti: ÜÇÜNCÜ, bağımsız bir girişle BİRİNCİ çerez
  kontrol edildi → **401** (revoke-all GERÇEKTEN tüm oturumları sildi).

**Sonuç:** fail-open gerçek ve davranışsal olarak ÖLÇÜLDÜ — başlıksız bir istek
guard'ı TAMAMEN atlatıp hassas bir mutasyonu (tüm oturumları iptal) GERÇEKLEŞTİREBİLİYOR.
Tasarımın KENDİSİNİN meşru olup olmadığı (`solid`'in tur 2 değerlendirmesi: tarayıcılar
çapraz-orijin POST'ta Origin'i daima gönderir, asıl saldırı yüzeyi "Origin VAR ve
EŞLEŞMİYOR" dalıyla kapanıyor) **security/solid'in yargısı** — ben yalnızca
DAVRANIŞI ölçüp raporluyorum: **evet, başlıksız istek atlatıyor, ölçülen ve
doğrulanmış bir gerçek**.

---

## Madde 4 — ⚠ `solid` tur 2 M-1 — sahte yeşil KANITLANDI

Yeni dosya: `apps/api/src/__tests__/auth-secret-leak-assertion-fragility.qa.test.ts`
(mevcut testler DEĞİŞTİRİLMEDİ).

**İlk deneme (gerçek HTTP ile, `createTestApp` + yanlış `DATABASE_URL` şifresi):**
bugünkü `better-auth@1.7.14` + Prisma sürümünde bu senaryo `better-call`'un
`console.error`'ını **HİÇ TETİKLEMİYOR** (`consoleErrorSpy.mock.calls.length === 0`,
ölçüldü, 2 bağımsız koşumda doğrulandı). Bu, `solid`'in M-1 madde 2'sinin
("`else` dalı — `length === 0` ZORUNLU olarak doğru, tautolojik") **bugün
GERÇEKTEN çalışan kol olduğunu** bağımsız olarak doğruluyor.

**İkinci, kütüphane davranışından bağımsız kanıt (saf, kendi kendine yeten test):**
`consoleErrorSpy`'a elle iki çağrı enjekte edildi — (1) DEKOY, ikinci argümansız;
(2) GERÇEK SIZINTI, `DATABASE_URL` şifresini taşıyan bir `Error`, `calls[1]`'de.
`auth-secret-leak.test.ts:182-193`'ün assert mantığı **birebir** kopyalanıp bu
senaryoya uygulandı:

```
expect(rawErrorText).toBe('undefined')        // PASS
expect(rawErrorText).not.toContain('wrong')   // PASS
```

Ama `calls[1]`'deki GERÇEK sızıntı (`'wrong'` içeren) **hiç kontrol edilmedi** —
ön koşul assert'i (`expect(secondCallText).toContain('wrong')`) bunun GERÇEKTEN
var olduğunu doğruluyor. **KANITLANDI: mevcut testin mantığı calls[0]'a çivili;
calls[1]+'deki gerçek bir sır sızıntısını GÖRMEDEN PASS verir.** `solid`'in M-1
bulgusu (madde 1 ve 2, ikisi de) **doğrulandı, sahte yeşil gerçek**.

---

## Madde 5 — F6 zorunlu alanların VARLIĞI

- **`userId`:** `auth-context.middleware.ts:99` → `context.logger = context.logger.child({userId})`
  — kimliği doğrulanmış HER istekten SONRA üretilen tüm log satırları `userId` taşır.
  Canlı log örnekleri (bu turun koşumlarından): `"userId":"...","sessionId":"...","msg":"giriş başarılı"`,
  `"userId":"...","msg":"oturum sonlandırıldı"` — DOĞRULANDI.
- **Olay logları gerçekten üretiliyor mu?** Canlı koşumlarda GÖRÜLDÜ: `"kullanıcı
kaydı oluşturuldu"` (`auth-instance.ts:298`), `"giriş başarılı"` (`:309`),
  `"oturum sonlandırıldı"` (`:315`, çıkış VE oturum sonlandırmayı TEK DB olayına
  eşliyor — dürüst, belgeli sapma). DOĞRULANDI.
- **`giriş başarısız` (`reason`, `failureCount`) — ⚠ EKSİK, YENİ BULGU.**
  `grep -rn "giriş başarısız\|failureCount" apps/api/src/auth/` → **SIFIR eşleşme**.
  Architect'in bağlayıcı "LOG DESENİ" listesi bunu açıkça ister (`warn` seviyesi,
  `reason`+`failureCount`); `auth-instance.ts`'in FIX1 yorumu bu olayı "architect'in
  LOG DESENİ'ndeki info olay listesinin KALANI" diye TANIMLAMIŞ ama warn seviyesindeki
  bu olayı EKLEMEMİŞ; `solid` tur 2 M-5'i "KAPANDI" ilan ederken bu eksik alt kalemi
  DOĞRULAMAMIŞ (yalnızca 4 `info` olayını saydı). Hiçbir test dosyası bu alanı
  assert etmiyor (`grep` ile doğrulandı, sıfır sonuç). **BULGU (medium, aşağıda).**
- **AC8 gerilemedi mi?** Yeni `info` olayları (`kullanıcı kaydı oluşturuldu`/`giriş
başarılı`/`oturum sonlandırıldı`) `emailMasked`/`userId`/`sessionId` TAŞIYOR,
  ham e-posta YOK — `auth-secret-leak.test.ts`'in tam akış testi bunu 3× tam koşumda
  doğruladı (`not.toContain(email)` PASS). **AC8 GERİLEMEDİ.**

---

## Madde 6 — F2'nin yarım kalması, AC etkisi

`backend`'in ölçümü (dosya başı yorum, `auth-instance.ts:59-71`) doğru: better-auth'un
`runInBackgroundOrAwait`'i mail gönderim hatasını koşulsuz yutuyor, kayıt/sıfırlama
isteği her koşulda 2xx döner. **AC4'ün "(a) kayıt 2xx" maddesi hâlâ teknik olarak
karşılanıyor** (daha da sağlam — her koşulda 2xx). **Hiçbir AC karşılıksız KALMIYOR.**

Ama: architect'in "HATA SINIFLARI" + "Çıkmaz sokak çözümü" bölümünün belgelediği
"kayıt 503 verebilir, kurtarma yolu `/auth/send-verification-email`" akışı bu
spesifik tetikleyici (e-posta gönderim hatası, better-auth hook'u) için **artık
erişilemez bir koddur** — bu **backend'in kendi yorumunda** "ÖLÇÜLMÜŞ SAPMA
(docs'a taşınmalı)" diye işaretli ama `ROADMAP.md`'de bu sapmaya dair HİÇBİR satır
YOK (`grep` ile doğrulandı, sıfır eşleşme). Bu bir AC ihlali DEĞİL, bir belgeleme/
ROADMAP borcu kaydı eksikliği — **low bulgu** (aşağıda), `solid` tur 2 raporunda
HİÇ geçmiyor (kontrol edildi, sıfır eşleşme — bu turun kendi bulgusu).

---

## Madde 7 — `shutdown.test.ts` flaky — ORAN

Bu turda:

- `pnpm test` (TAM koşum) — **3/3 yeşil** (`shutdown.test.ts` dahil, her üçünde de
  `AC11 — SIGTERM sonrası graceful shutdown` PASS).
- İzole koşum (`vitest run src/__tests__/shutdown.test.ts`, 4 ardışık çağrı) —
  **4/4 yeşil**.
- **Bu turun toplamı: 7/7 yeşil (0 başarısız).**

Tur 1'in ölçümü: 3 tam koşumdan **1'i** FAIL (`execFileSync('pnpm',['exec','tsc',...])`
"Command failed"), 2'si yeşil.

**İki tur birleşik: 10 koşumda 1 başarısız (~%10).** Test testi susturmadım,
`skip` eklemedim. CLAUDE.md §6 gereği bu oranın `release`'e gitmesi gerekiyor —
flaky, kök neden (28 paralel vitest worker + gerçek `tsc` alt süreci kaynak
yarışı, tur 1'in teşhisi) hâlâ DÜZELTİLMEDİ. T-002'nin borcu, T-006 KÖTÜLEŞTİRMEDİ
(oranı tur 1'den tur 2'ye değiştirmedi, aynı sınıf arıza).

---

## Kapı (AC1) — oturum başında, KİRLENMEDEN ÖNCE ölçülen temiz koşum

| Komut                 | Sonuç                                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`           | **15/15** exit 0                                                                                                                                                                         |
| `pnpm typecheck`      | **15/15** exit 0                                                                                                                                                                         |
| `pnpm build`          | **12/12** exit 0                                                                                                                                                                         |
| `pnpm format:check`   | **FAIL** — `.claude/workflow/reviews/T-006-solid-tur2.md` (solid'in KENDİ rapor dosyası, prettier formatsız). Üretim kodu DEĞİL, T-006 FIX1'in parçası DEĞİL. Ayrı bulgu (low, aşağıda). |
| `pnpm test` (×3)      | **493/493, 493/493, 493/493** (errors 41 + db 166 + api 286; api'nin 1'i benim önceki oturumdan kalan `same-origin-guard-fail-open.qa.test.ts`'im) — 3/3 tam yeşil, 0 kalıcı FAIL        |
| `pnpm test:isolation` | **15/15** (db 14 + api 1) exit 0                                                                                                                                                         |

Oturumun SONUNDA (yeni qa test dosyamı eklediğim VE `security` gate'in paylaşılan
ağaca `zzsecprobe2-5.test.ts` dosyalarını bıraktığı an) `pnpm lint`/`pnpm typecheck`
TEKRAR koşuldu ve bu prob dosyaları yüzünden KIRMIZI verdi — ayrıntı "Süreç bulgusu"
altında, T-006'nın PASS/FAIL'ine KATILMIYOR.

---

## BULGULAR

- [SEV: medium] `apps/api/src/__tests__/auth-secret-leak.test.ts:182-193` —
  **KASITLI BOZMA ile KANITLANDI** (madde 4): assert mantığı `calls[0][1]`'e çivili;
  `calls[1]`+'deki gerçek bir sır sızıntısını GÖRMEDEN PASS verir (sahte yeşil).
  Ayrıca bugünkü ortamda `else` dalı (tautolojik, `length===0`) TEK ÇALIŞAN koldur
  (2 bağımsız koşumda ölçüldü, `calls.length===0`). `solid` tur 2 M-1 ile AYNI
  köktür — bu gate bağımsız olarak doğruladı. Önerilen düzeltme: tüm çağrı/
  argümanları tek metne indir, koşulsuz assert et (`solid`'in önerisiyle aynı).
  — **sorumlu ajan: backend (S6/S8)**

- [SEV: medium] `apps/api/src/auth/auth-instance.ts` (log olayları) —
  architect'in bağlayıcı "LOG DESENİ" listesindeki `warn` seviyeli **`giriş
başarısız` (`reason`, `failureCount`) olayı HİÇ İMPLEMENTE EDİLMEMİŞ**
  (`grep` ile doğrulandı, apps/api/src/auth/ genelinde sıfır eşleşme). F6/M-5
  "architect'in LOG DESENİ'ndeki info olay listesinin KALANI" diye yalnızca 4
  `info` olayını ekledi, bu `warn` olayını atladı; `solid` tur 2 M-5'i "KAPANDI"
  ilan ederken bu alt kalemi doğrulamadı. Hiçbir test bu alanı assert etmiyor
  (sıfır eşleşme). Etkisi: başarısız giriş denemeleri hâlâ Redis sayaçlarıyla
  ENGELLENİYOR (AC7 bozulmadı) ama operatör logda BUNU GÖREMİYOR — brute-force
  gözlemlenebilirliği eksik. — **sorumlu ajan: backend**

- [SEV: medium] `apps/api/src/__tests__/shutdown.test.ts` (T-002, T-006 DIŞI,
  dokunulmadı) — **flaky, devam ediyor.** Bu tur 7/7 yeşil (3 tam + 4 izole),
  tur 1'de 3 koşumdan 1'i FAIL. Birleşik: 10 koşumda 1 başarısız (~%10). Kök
  neden tur 1'de teşhis edildi (paralel vitest worker + gerçek `tsc` alt süreci
  kaynak yarışı), hâlâ DÜZELTİLMEDİ. T-006 bu oranı KÖTÜLEŞTİRMEDİ. CLAUDE.md §6
  gereği `release`'e taşınmalı (ROADMAP teknik borç kaydı olmadan `skip`
  edilemez). — **sorumlu ajan: devops/backend (T-002 sahibi)**

- [SEV: low] `ROADMAP.md` — F2'nin ölçtüğü sapma (better-auth'un
  `runInBackgroundOrAwait`'i mail gönderim hatasını koşulsuz yutuyor; architect'in
  "503 + kurtarma yolu" tasarımı bu tetikleyici için erişilemez) `auth-instance.ts`'in
  KENDİ yorumunda "docs'a taşınmalı" diye işaretli ama ROADMAP'te hiçbir satırda
  YOK (`grep` ile doğrulandı). Hiçbir AC karşılıksız KALMIYOR — yalnızca belgeleme/
  teknik borç kaydı eksik. `solid` tur 2 raporunda bu konu HİÇ geçmiyor.
  — **sorumlu ajan: architect (ROADMAP borç satırı), release (kayıt)**

- [SEV: low] `pnpm format:check` — `.claude/workflow/reviews/T-006-solid-tur2.md`
  (solid'in KENDİ gate raporu, bu oturumda üretildi) prettier biçiminde DEĞİL
  (`pnpm exec prettier --check` ile doğrulandı; `T-006-qa-tur1.md`/
  `T-006-solid-tur1.md`/`T-006.md` TEMİZ — yalnızca bu dosya). `.prettierignore`
  `.claude/workflow/**`'i kapsamıyor, bu yüzden CLAUDE.md §6'nın "format:check de
  temiz tutulur" şartı LİTERAL olarak kırılıyor — ama üretim kodu DEĞİL, T-006
  FIX1'in parçası DEĞİL. Kendi dosyasını `prettier --write` ile düzeltmek
  `solid`'in/`release`'in işi (AGENT_BASELINE §5 — başka ajanın dosyasını ben
  DEĞİŞTİRMEM). — **sorumlu ajan: solid (kendi rapor dosyası) / release**

- [SEV: düşük değil — SÜREÇ BULGUSU, Orkestratör'e] Bu QA oturumu SIRASINDA
  `security` gate'in paylaşılan çalışma ağacına bıraktığı geçici prob dosyaları
  (`apps/api/src/__tests__/zzsecprobe2.test.ts` → `zzsecprobe5.test.ts`, dördü de
  başlığı "GEÇİCİ GÜVENLİK PROBU ... SİLİNECEK") **oturumun SONUNDA** `pnpm
typecheck`'i (TS2322, TS6133) ve `pnpm lint`'i (4 kural ihlali) KIRMIZIYA
  düşürdü. Bu, tur 1'in zaten bildirdiği (`zz-security-gate-probe.test.ts`, o
  zaman ZARARSIZDI) AYNI riskin BU TUR GERÇEKTEN MATERYALİZE OLMUŞ hâli —
  dördüncü, beşinci tekrarı (dosya sayısı art ediyor, 18:46 → 18:53 arasında 1 →
  4 dosya). Bu oturumdaki `lint`/`typecheck`/`build`/`test`/`test:isolation`'ın
  AC1 için RAPORLADIĞIM TEMİZ sayıları bu dosyalar belirmeden ÖNCE ölçüldü
  (zaman damgalı, "Kapı" bölümü) — T-006'nın PASS/FAIL'ine bu dosyalar
  KATILMIYOR. Ama bu artık ikinci somut kanıt: `qa`/`security`/`solid` gate'leri
  AYNI checkout'ta GERÇEKTEN eşzamanlı çalışıyor ve bu, merge ÖNCESİ son
  doğrulamayı BOZABİLİR. **Öneri: gate'leri sıralı çalıştırın VEYA izole
  checkout/DB kullanın; merge'den ÖNCE tüm gate'ler bittikten SONRA tek bir
  temiz `lint`/`typecheck` koşumu şart.** — **sorumlu: Orkestratör (süreç)**

---

ÖLÇÜMLER

KABUL KRİTERİ EŞLEMESİ (gerileme kontrolü, bu tur):

| AC   | Test(ler)                                                                                                    | Sonuç |
| ---- | ------------------------------------------------------------------------------------------------------------ | ----- |
| AC1  | `pnpm lint/typecheck/build/test/test:isolation` (oturum başı, temiz) + `format:check` (ayrı bulgu, low)      | PASS* |
| AC2  | `pnpm test` → db paketi `catalog-lint.test.ts`                                                               | PASS  |
| AC3  | Statik inceleme (`schema.prisma`, FK zinciri) — FIX1 dokunmadı                                               | PASS  |
| AC4  | `auth-flow.test.ts` (18 test, hedefli + 3× tam koşum)                                                        | PASS  |
| AC5  | `auth-flow.test.ts` "AC5" describe'u                                                                         | PASS  |
| AC6  | `auth-sessions.test.ts` + F3 kasıtlı bozma (madde 2) bağımsız doğrulama                                      | PASS  |
| AC7  | `rate-limit.test.ts` + `rate-limit-policy.test.ts` (107 test, 7 dosya hedefli koşum)                         | PASS  |
| AC8  | `auth-secret-leak.test.ts` tam akış (3× tam koşum) — yeni `info` olayları dahil, e-posta sızıntısı YOK       | PASS  |
| AC9  | `auth-exempt-paths.test.ts` + `tenant-exempt-paths.test.ts` + `auth-path-sets.test.ts` (dördüncü test dahil) | PASS  |
| AC10 | `auth-cross-tenant.isolation.test.ts` (`vitest.isolation.config.ts`, 2× doğrulama)                           | PASS  |
| AC11 | Statik inceleme — FIX1 bu AC'nin yüzeyine dokunmadı; `pnpm audit` bu turda KOŞULMADI ("çalıştırılmadı")      | N/A   |

Karşılıksız/gerilemiş kriter: **YOK.**

TEST SAYILARI:

- Yeni eklenen test dosyaları (bu tur, QA): 2 —
  `apps/api/src/__tests__/auth-secret-leak-assertion-fragility.qa.test.ts` (1 test,
  madde 4 kanıtı) ve (önceki yarıda kesilen oturumdan kalan, bu turda incelenip
  KORUNAN) `apps/api/src/__tests__/same-origin-guard-fail-open.qa.test.ts` (1 test,
  madde 3 ölçümü). İkisi de PASS, `skip`/`only` YOK.
- `pnpm test` (temiz, security'nin prob dosyalarından ÖNCE, 3× tam koşum):
  errors 41 + db 166 + api 286 = **493** her üçünde de (0 kalıcı FAIL). Baseline
  (Orkestratör, FIX1 sonrası) 492'den **+1** — benim `same-origin-guard-fail-open
.qa.test.ts`'im (önceki oturumdan). Bu turda kendi EKLEDİĞİM
  `auth-secret-leak-assertion-fragility.qa.test.ts` ile birlikte hedefli koşumlarda
  **494**'e çıkıyor (ayrı doğrulandı, tam koşuma henüz YENİDEN girmedi çünkü sonraki
  tam koşum security'nin prob dosyalarıyla ÇAKIŞTI — bkz. süreç bulgusu).
- `pnpm test:isolation`: **15** (db 14 + api 1) — baseline'dan DEĞİŞMEDİ.
- Toplam başarısız (bu turun KENDİ koşumlarında, security'nin prob dosyaları
  HARİÇ): **0** kalıcı. `shutdown.test.ts`: 7/7 yeşil bu tur (ayrıntı madde 7).

KOŞTURULAN KOMUTLAR (gerçek, bu oturumda):

| Komut                                                                                                                                                  | Exit  | Özet                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` (oturum başı)                                                                                                                              | 0     | 15/15                                                                                                          |
| `pnpm typecheck` (oturum başı)                                                                                                                         | 0     | 15/15                                                                                                          |
| `pnpm format:check`                                                                                                                                    | 1     | solid'in kendi rapor dosyası formatsız (low bulgu)                                                             |
| `pnpm build`                                                                                                                                           | 0     | 12/12                                                                                                          |
| `pnpm test` (×3 tam koşum, oturum başı)                                                                                                                | 0,0,0 | 493/493, 493/493, 493/493                                                                                      |
| `pnpm test:isolation`                                                                                                                                  | 0     | 15/15                                                                                                          |
| `apps/api`: `vitest run src/__tests__/shutdown.test.ts` (×4 izole)                                                                                     | 0×4   | 4/4 yeşil                                                                                                      |
| geçici `revokeSessionsOnPasswordReset:false` + `vitest run auth-flow.test.ts -t F3` + geri alma (`diff`)                                               | 1→0   | F3 kasıtlı bozma KIRMIZI verdi, byte-birebir geri alındı, YEŞİL                                                |
| geçici `@UseGuards(SameOriginGuard)` kaldırma + `vitest run same-origin-guard.test.ts` + geri alma (`diff`)                                            | 1→0   | F5 kasıtlı bozma KIRMIZI verdi (2 test), byte-birebir geri alındı, YEŞİL                                       |
| `vitest run same-origin-guard-fail-open.qa.test.ts`                                                                                                    | 0     | fail-open davranışsal ölçüm — 200 + gerçek mutasyon (madde 3)                                                  |
| `vitest run auth-secret-leak-assertion-fragility.qa.test.ts` (yeni)                                                                                    | 0     | solid M-1 sahte-yeşil KANITLANDI (madde 4)                                                                     |
| `vitest run auth-secret-leak.test.ts -t better-call`                                                                                                   | 0     | `calls.length===0` ölçüldü (else dalı tek çalışan kol, 2× doğrulandı)                                          |
| hedefli koşum: `auth-flow/auth-sessions/rate-limit/rate-limit-policy/auth-exempt-paths/tenant-exempt-paths/auth-path-sets/auth-cross-tenant.isolation` | 0     | 107+1 test, hepsi yeşil (AC4-7,9-10 gerileme kontrolü)                                                         |
| `grep` — "giriş başarısız"/"failureCount" (apps/api/src/auth/)                                                                                         | —     | sıfır eşleşme → BULGU (madde 5)                                                                                |
| `grep` — `runInBackgroundOrAwait`/503 sapması (ROADMAP.md)                                                                                             | —     | sıfır eşleşme → BULGU (madde 6, low)                                                                           |
| `pnpm lint`/`pnpm typecheck` (oturum SONU)                                                                                                             | 1,2   | `security`'nin prob dosyaları (zzsecprobe2-5) yüzünden KIRMIZI — süreç bulgusu, T-006 PASS/FAIL'ine KATILMIYOR |
| `pnpm test` (oturum sonu, security'nin prob dosyalarıyla)                                                                                              | 0     | 295/295 (vitest TS tip kontrolü yapmıyor, bu yüzden prob dosyalarının TS hataları `test`'i KIRMADI)            |

Koşulmayan komutlar: `pnpm test:e2e` — bu sürümde yok (PM: frontend yok). `pnpm
test:contract` — bu sürümde `packages/trpc` doğmadı. `pnpm audit` — bu turda
TEKRAR koşulmadı (FIX1 yeni bağımlılık eklemedi, risk yok; "çalıştırılmadı").
