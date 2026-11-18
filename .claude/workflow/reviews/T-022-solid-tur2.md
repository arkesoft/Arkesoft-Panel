# T-022 — GATE `solid`, tur 2 (kapanış denetimi)

- **Tarih:** 2026-11-17
- **Sürüm:** ROADMAP v0.0.20.1 / v0.1.0 hattı (T-022)
- **Kapsam:** ⚠⚠ DAR — tur 1'in **iki `medium`** + **altı `low`** bulgusunun kapanış
  doğrulaması. Yeni tarama YAPILMADI; yeni `high`/`critical` aranmadı (yolu üstünde de
  görülmedi).
- **Araç kısıtı:** `Bash` yok — tüm doğrulama **statik okuma** ile yapıldı. Hiçbir test
  koşturulmadı; `backend`/`frontend`/`qa`'nın koşum iddiaları **kod kanıtıyla** denetlendi,
  **yeniden ölçülmedi**.

```
GATE: solid
SONUÇ: PASS
```

---

## 1. Kapanış tablosu

| Bulgu | Durum       | Kanıt (`dosya:satır`)                                                       |
| ----- | ----------- | --------------------------------------------------------------------------- |
| M-1   | **KAPANDI** | `apps/api/src/http/normalize-request-path.ts:246-249, 262-279, 293-306, 342-355` |
| M-2   | **KAPANDI** | `scripts/playwright/two-factor-wizard.ts:38-62`; iki spec `:35`/`:40` import  |
| L-1   | **KISMEN**  | `normalize-request-path.ts:43-48` vs `rate-limit.policy.ts:378`               |
| L-2   | **KAPANDI** | `normalize-request-path-double-slash-http.test.ts:73` (+ `:90-93, :103` dokunulmamış) |
| L-3   | **KAPANDI** | `apps/admin/src/__tests__/messages.test.ts:56-58`, `apps/superadmin/src/__tests__/messages.test.ts:35-37` |
| L-4   | **KAPANDI** | `apps/admin/.../two-factor-setup-controller.ts:142`, `apps/superadmin/.../two-factor-setup-controller.ts:140` |
| L-5   | **KAPANDI** | `apps/admin/.../two-factor-setup-controller.ts:202, 216, 226, 236-241`        |
| L-6   | **KAPANDI** | `apps/admin/e2e/two-factor-setup-reload.spec.ts:51`                           |

---

## 2. M-1 — ayrıntılı doğrulama (**KAPANDI**)

**(1) Hat gerçekten tekilleştirilmiş mi / `decodeURIComponent` kaç çağrı noktasında?**
`canonicalizeRequestPath` (`:262-279`) dört adımı sırayla tek yerde yürütüyor:
resolve (`:263`) → decode (`:272`) → fold (`:277`) → strip (`:278`).
Depo genelinde tarandı (`apps/api/src`): **üretim kodunda `decodeURIComponent`'in TEK
çağrı noktası `normalize-request-path.ts:272`**. Diğer tüm eşleşmeler ya yorum
(`:25, :37, :228, :240, :253, :256, :309`; `platform-admin-ip.guard.ts:59`) ya da test
dosyası (`normalize-request-path-trpc-invariant.test.ts:190` — **bilinçli BAĞIMSIZ ikinci
implementasyon**, totoloji önleyici; `member-invite-flow.test.ts:107` — ilgisiz).
İsim değiştirilmiş kopya **yok**: `matchesPrefixOrUnparsablePercentEncoding` (`:342-355`)
kendi decode/fold/strip'ini **hiç yazmıyor**, yalnızca `canonicalizeRequestPath` çağırıyor.

**(2) Önerilen üç sonuçlu union kurulmuş mu?** Evet, birebir:
`RequestPathCanonicalization = { kind:'canonical'; path } | { kind:'undecodable'; rawPathname } | { kind:'unparsable' }`
(`:246-249`), tüm alanlar `readonly`.

**(3) `switch`'ler exhaustive mi?** Evet. İki `switch` de üç dalı kapsıyor ve `default`
dalında `assertNever(result, …)` çağırıyor (`:303-304` ve `:352-353`), `assertNever`
`../errors/assert-never.js`'ten (`:106`) — CLAUDE.md §4 "discriminated union + exhaustive
switch + assertNever" kuralıyla uyumlu.

**(4) Asimetri KORUNMUŞ mu?** Evet, davranış değişmemiş:

- `normalizeRequestPath`: `canonical` → `result.path` (`:298`); `undecodable` → ham
  pathname üzerinde fold+strip (`:300`, eski `decodePathnameSafely` davranışı);
  `unparsable` → **ham `rawUrl`** (`:302`).
- `matchesPrefixOrUnparsablePercentEncoding`: `canonical` → `startsWith` (`:347`);
  `undecodable` **ve** `unparsable` → **`true`** (`:349, :351`).
- `platform-admin-ip.guard.ts:90-92`: `if (!isPlatformAdminGuardedPath(req.url)) return true`
  ⇒ matcher'ın `true`'su **guard'ı ATLAMAZ**, aksine IP/allowlist dallarına (`:96-108`,
  üç `PlatformNetworkNotAllowedError`) **sokar** ⇒ **fail-CLOSED korunuyor**
  (`security`'nin ölçümüyle tutarlı).
- `qa`'nın eklediği dört test bu asimetriyi **iki yönlü** pinliyor:
  `normalize-request-path.test.ts:294-302` (ham `rawUrl` döner) ve `:309-315` (tutucu
  `true`). Assertion'lar **vacuous değil** — `matchesPrefix…` testlerinde önek
  (`'/trpc/platform.'`) girdiyle **uyuşmuyor**, yani `true` yalnızca tutucu daldan
  gelebilir. Test adları ne test ettiğini söylüyor, dal erişilebilirliğinin gerekçesi
  `:260-291`de **ölçümle** yazılmış. **Bu testler davranışı test ediyor, implementasyonu
  yansılamıyor.**

**(5) Dosyanın KENDİ ilkesi tutarlı mı?** Evet. İlke metni (satır kayması nedeniyle artık
`:9-11`'de: _"aynı sebeple birlikte değişmesi gereken kod, tek yerde durmalı"_) bugün üç
yerde **kodla uyumlu** tekrarlanıyor: `:110-111` (`stripTrailingSlashes` paylaşımı),
`:225-245` (M-1'in kendi gerekçesi, **geçmiş zaman** — "çağrılıyordu/ihlal ediliyordu",
bayat değil), `:253` (decode TEK KEZ). Tur 1'deki "kendi ilkesinin ihlali" durumu ortadan
kalktı.

**Kalan (yeni `low`, M-1'in yüzeyinde):** `:300`'de `undecodable` dalı hattın **son iki
adımını** (`foldTrpcMountPrefix` + `stripTrailingSlashes`) hat fonksiyonunun **dışında
yeniden uyguluyor**. Bugün davranış doğru, ama M-1'in kök gerekçesi ("beşinci bir eksen
eklenirse diğeri GERİDE kalır") bu iki adım için **kısmen geçerli kalıyor**: decode'dan
sonra hatta eklenecek yeni bir normalizasyon adımı `canonical` dalını otomatik
kazandırır, `:300`'ü **sessizce** geride bırakır. Düzeltme ucuz: union'ın `undecodable`
varyantı ham pathname yerine **fold+strip uygulanmış** değeri taşısın; varsayılan kararı
(hangi değerin kullanılacağı) yine çağıranda kalır, asimetri bozulmaz.

---

## 3. M-2 — ayrıntılı doğrulama (**KAPANDI**)

- **Tek okuma noktası:** `submitPasswordAndCaptureTotpSecret` depoda **tek yerde tanımlı**
  — `scripts/playwright/two-factor-wizard.ts:38`. `secret=` regex'i de tek yerde
  (`:53`). Tarama (`*.ts`, depo kökü) toplam 8 eşleşme döndü: 3'ü yardımcı dosyada
  (yorum + tanım + regex), 5'i iki spec'in import/çağrılarında.
- **Spec'lerde kopya yok:** `apps/admin/e2e/two-factor-setup-reload.spec.ts:35` ve
  `apps/superadmin/e2e/two-factor-setup-reload.spec.ts:40` yardımcıyı **import ediyor**;
  gövdelerde DOM adımı (`'Şifreniz'` fill, `'Devam et'` click, `<details>` açma,
  `secret=` regex) **hiç yok**.
- **Akış farkları gereğinden fazla ortaklaştırılmamış** — beş eksenin beşi de spec'lerde
  kalmış:
  1. **Giriş yolu:** admin `:54-58` (UI `sign-in` formu) · superadmin `:83-87`
     (`storageState` + `beforeLoad` otomatik yönlendirmesi).
  2. **Sihirbaz açma:** admin `'Etkinleştir'` (`:64, :76`) · superadmin
     `'Kurulumu başlat'` (`:88, :102`).
  3. **Fixture:** admin `./helpers/verified-fixture-user.js` (`:31`) · superadmin
     `./fixtures/platform-admin.js` + `grantPlatformAdmin` (`:32-37, :60`).
  4. **Bitiş kanıtı:** admin `'İki adımlı doğrulama: Açık'` metni (`:91`) · superadmin
     `toHaveURL(/\/$/)` (`:118`).
  5. **AC18 bütçesi:** admin `:20-22` (1 sign-up + 1 sign-in) · superadmin `:25-29`
     (ikinci sign-in YOK).
- Yardımcının yorumu (`two-factor-wizard.ts:21-27`) bu bilinçli ayrımı **belgeliyor** ve
  yer seçimini (`scripts/` — Playwright transform kısıtı) gerekçelendiriyor; emsal
  (T-021/S10 `mailpit.ts`) atıfla verilmiş. Yardımcı saf sunum adımı taşıyor, iş kuralı
  içermiyor; `any`/`as` yok, dönüş tipi açık (`Promise<string>`), üç ayrı hata dalı
  (`:49-51, :54-56, :58-60`) **yutma yapmadan** `Error` fırlatıyor.

---

## 4. Altı `low`

- **L-1 — KISMEN.** Dosya başı gerçekten ikiye bölünmüş: `normalize-request-path.ts:43-48`
  ("GÜVENLİ sınıf — küme üyeliği, `.has`") ve `:50-62` ("FARKLI sınıf, AYNI GÜVENCE
  DEĞİL — `rate-limit.policy.ts`'in HARİTASI, `.get`, `undefined` ⇒ fail-OPEN").
  Tur 1'in asıl şikâyeti (blanket "eşleşme yokluğu güvenlidir" iddiası) **kapandı**.
  **Ama taksonomi yanlış eksende çizilmiş:** belirleyici olan veri yapısı (`.has` vs
  `.get`) değil, **eşleşmemenin ne anlama geldiği**. İki `.has` çağrı noktası
  "dört çağıran" sayımının **dışında** kalıyor:
  - `apps/api/src/auth/rate-limit/rate-limit.policy.ts:378` — `AUTH_OWN_PATHS.has(...)`;
    eşleşmezse `undefined` ⇒ **fail-OPEN** (yani `auth-own-paths.ts` "güvenli sınıf"
    listesinde yer alırken **aynı küme** fail-open bir çağrı noktasında da tüketiliyor).
  - `apps/api/src/auth/rate-limit/trpc-rate-limited-paths.ts:55` —
    `TRPC_RATE_LIMITED_PATHS.has(...)`; eşleşmezse "sınırlı değil" ⇒ semantik olarak
    fail-OPEN. (Bugün zararsız: `isTrpcRateLimitedPath`'in **üretim tüketicisi yok**,
    küme yalnızca `rate-limit.policy.ts:158`'in yükleme-anı yazım-hatası guard'ında
    kullanılıyor.)
    `low` kalır — davranış doğru, yanlış olan **yorumun kapsamı**. Düzeltme: sınıflandırmayı
    "`.has`/`.get`" yerine "eşleşmeme = korumalı / eşleşmeme = sınırsız" ekseninde yaz ve
    bu iki çağrı noktasını ikinci paragrafa ekle.
- **L-2 — KAPANDI.** Başlık geçmiş zamana çevrilmiş:
  `normalize-request-path-double-slash-http.test.ts:73` → _"…§1.5 fix SONRASI… fix ÖNCESİ
  … KIRMIZI GELMİŞTİ"_. Anlatı yorumu da güncellenmiş (`:40-44, :64-72`) ve bakımcıya
  "assertion'ı `toBe(500)`'e çevirme" uyarısı korunmuş. **`expect` satırlarına
  dokunulmamış:** `:90-93` (header/`code`/`requestId`) ve `:103` (`not.toBe(500)`) aynen
  duruyor — kapı tersine çevrilmemiş, gevşetilmemiş.
- **L-3 — KAPANDI.** Her iki dosyada `ERROR_MESSAGES_KEY_COUNT` assertion'ı artık **tek**:
  `apps/admin/src/__tests__/messages.test.ts:57` ve
  `apps/superadmin/src/__tests__/messages.test.ts:36`. Tur 1'de işaret edilen kopya
  bloklar (`:169-171` / `:105-107`) tarama sonucunda **yok**.
- **L-4 — KAPANDI.** `apps/admin/src/features/two-factor/two-factor-setup-controller.ts:142`
  ve `apps/superadmin/src/features/two-factor/two-factor-setup-controller.ts:140` artık
  `if (this.state.step !== 'password') { return }`. Erişilemez `'totp'` kabulü kalktı;
  iki kopya **birlikte** değişti (ADR-0024 Karar 6).
- **L-5 — KAPANDI, S4-FIX regresyonu GERİ GELMEMİŞ (özellikle denetlendi).**
  Temizleme **doğru dalda**: `apps/admin/.../two-factor-setup-controller.ts:226` (ve
  superadmin `:224`) — `submitCode` içinde, `result.kind === 'error'` erken dönüşünden
  (`:207-214`) **sonra**, `this.deps.onVerified()` (`:216`) sonrasında. Üç bağımsız
  kontrol:
  1. Gösterilecek kodlar `:202`'de **temizlemeden önce** yerel değişkene alınıyor
     (`const backupCodes = this.state.backupCodes`) ⇒ `:228-232`'deki
     `backup-codes`/`completed` dallanması etkilenmiyor.
  2. "Vazgeç" yolu `goBackToPasswordStep` (`:236-241`) `submitCode`'a **hiç uğramıyor** ve
     `backupCodesCapturedForDisplay`'e **dokunmuyor** ⇒ S4-FIX'in korunan senaryosu
     (`:150-160`'daki tekrar gösterim) bozulmamış.
  3. Hata dalında (`:207-214`) temizlik **yapılmıyor** ⇒ yanlış kod girince kodlar
     kaybolmuyor.
     **Küçük not (yeni, `low`):** temizliği açıklayan yorum `:218` (admin) / `:216`
     (superadmin) bulguyu **`solid` L-3** diye anıyor; bu bulgu tur 1 raporunda **L-5**.
     Yanlış atıf, ileride izi sürülemez hâle gelir.
- **L-6 — KAPANDI.** `apps/admin/e2e/two-factor-setup-reload.spec.ts:51` →
  `createVerifiedFixtureUser(request, 'e2e-2fa-reload')`; superadmin kardeşi `:51` ile
  aynı önek.

---

## 5. Bulgular (şablon)

```
GATE: solid
SONUÇ: PASS
BULGULAR:
  - [SEV: low] apps/api/src/http/normalize-request-path.ts:300 — `undecodable` dalı hattın son iki adımını (fold+strip) `canonicalizeRequestPath` DIŞINDA yeniden uyguluyor; decode sonrasına eklenecek beşinci bir normalizasyon ekseni bu dalı sessizce geride bırakır (M-1'in kök gerekçesinin kalıntısı) — union'ın `undecodable` varyantı ham pathname yerine fold+strip UYGULANMIŞ değeri taşısın (varsayılan kararı çağıranda kalır, asimetri bozulmaz) — backend — vade v0.0.22
  - [SEV: low] apps/api/src/http/normalize-request-path.ts:43-48 — tüketici sınıflandırması `.has`/`.get` ekseninde çizilmiş; belirleyici eksen "eşleşmemenin anlamı". `rate-limit.policy.ts:378` (`AUTH_OWN_PATHS.has`, miss ⇒ `undefined` ⇒ fail-OPEN) ve `trpc-rate-limited-paths.ts:55` (bugün üretim tüketicisi YOK) "dört çağıran" sayımının dışında kalıyor — sınıflandırmayı "eşleşmeme = korumalı / = sınırsız" ekseninde yeniden yaz ve iki çağrı noktasını ekle — backend — vade v0.0.22
  - [SEV: low] apps/admin/src/features/two-factor/two-factor-setup-controller.ts:218 ve apps/superadmin/src/features/two-factor/two-factor-setup-controller.ts:216 — temizliği gerekçelendiren yorum bulguyu "`solid` L-3" diye anıyor; doğrusu tur 1 raporundaki L-5 (L-3 `messages.test.ts` kopyasıydı) — atfı düzelt — frontend — vade v0.0.22
ÖLÇÜMLER: incelenen dosya 12 (üretim 6, test/e2e 6); bulunan `any`/`@ts-ignore`/gerekçesiz `as` sayısı 0 (kapanış yüzeyinin tamamında); en büyük fonksiyon `submitPassword` (two-factor-setup-controller.ts:141-196, 56 satır, yorum dahil); kapanan bulgu 7/8 (M-1, M-2, L-2…L-6 KAPANDI; L-1 KISMEN); yeni `high`/`critical` 0; hiçbir komut çalıştırılmadı (`Bash` aracı yok — statik denetim).
```

**FAIL kuralı uygulaması:** `critical` 0, `high` 0, `medium` 0 ⇒ **PASS**. Üç `low`
düzeltme turu **açmaz**; yukarıdaki borç satırları `docs`/`release` tarafından ROADMAP
teknik borç tablosuna kopyalanmalıdır.

> ⚠ Bu dosya `Bash` aracı olmayan bir gate ajanı tarafından yazıldı ⇒ `prettier --write`
> **çalıştırılamadı**; biçimlendirmeyi Orkestratör kapatır (AGENT_BASELINE §5).
