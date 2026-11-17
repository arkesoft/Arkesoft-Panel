# T-022 — GATE `solid` · tur 1

- **Tarih:** 2026-11-17
- **Sürüm:** ROADMAP v0.0.20.1
- **Dal:** `feat/v0.0.20-super-admin-iskeleti`
- **Ajan:** `solid` (statik denetçi — `Bash` yok, hiçbir komut koşturulmadı)

```
GATE: solid
SONUÇ: PASS
```

FAIL kuralı (`AGENT_BASELINE.md` §4): `critical`/`high` **yok**, `medium` **2** (eşik 3)
⇒ **PASS**. İki `medium` ve altı `low` teknik borca gider; `low`'lar düzeltme turu
**açmaz** (§4, 2026-11-01).

---

## 1. BULGULAR

### M-1 · [SEV: medium] Kanonikleştirme hattı iki dışa açık fonksiyonda tekrar ediyor

**`apps/api/src/http/normalize-request-path.ts:234-236` ve `:261-269`** —
`backend`

`normalizeRequestPath` ve `matchesPrefixOrUnparsablePercentEncoding` **aynı dört
adımlı hattı** ayrı ayrı yazıyor: `resolveCanonicalPathnameOrUnparsable` → decode →
`foldTrpcMountPrefix` → `stripTrailingSlashes`. Paylaşılan olan yalnızca **ilk**
adım (`:206`); kalan üç adım iki yerde tekrarlanıyor ve decode bile iki kez yazılmış
(`decodePathnameSafely:92-98` vs. satır içi `try/catch` `:261-266`).

Bu, dosyanın **kendi** yazılı ilkesinin ihlali: `:102-103` birebir *"`normalize
RequestPath` VE `matchesPrefixOrUnparsablePercentEncoding` TARAFINDAN PAYLAŞILIR —
iki ayrı kopya YAZILMAZ (solid M-1'in AYNI ilkesi)"* diyor, `:1-11` ise dosyanın
varlık sebebini *"beş kopyanın birleştirilmiş hâli"* olarak tanımlıyor.

Risk **spekülatif değil, ölçülmüş**: bu hat son dört turda **üç kez** büyüdü —
yüzde-kodlama (T-021 FIX 1), mount önek fold'u (FIX 3), tam sondaki-eğik-çizgi
soyma (FIX 4) — ve her biri tRPC ile asimetri kapatan bir `high` güvenlik
bulgusuydu. Dördüncü eksen tek bir fonksiyona eklenirse ikinci çağıran sessizce
geride kalır; `matchesPrefix…` ÖNEK testi olduğu için geride kalması **fail-open**
yöndedir (`isPlatformAdminGuardedPath` guard'ı atlanır).

İki çağıranın farkı yalnızca **başarısızlık varsayılanları** (ayrıştırılamaz →
ham `rawUrl` / `true`; decode bozuk → ham pathname ile devam / `true`). Bu fark
hattı ayrı yazmayı gerektirmiyor — üç sonuçlu bir discriminated union (CLAUDE.md
§4) ortak hattı korurken varsayılanı çağıranda bırakır:

```
type CanonicalPath =
  | { kind: 'canonical'; path: string }
  | { kind: 'undecodable'; path: string }   // yüzde dizisi bozuk, ham pathname foldlanmış
  | { kind: 'unparsable' }                  // new URL(...) fırladı
```

**Önerilen düzeltme:** hattı tek bir özel (export edilmeyen) fonksiyonda topla,
yukarıdaki union'ı döndür; iki dışa açık fonksiyon yalnızca `switch` ile kendi
varsayılanını uygulasın. Davranış değişmez (üç dalın bugünkü sonuçları birebir
korunur), değişmezlik testi (`normalize-request-path-trpc-invariant.test.ts`)
aynen geçerli kalır.

---

### M-2 · [SEV: medium] `submitPasswordAndCaptureTotpSecret` iki e2e spec'inde birebir kopya — paylaşılan ev **zaten var ve aynı dosyada kullanılıyor**

**`apps/admin/e2e/two-factor-setup-reload.spec.ts:47-68`** ve
**`apps/superadmin/e2e/two-factor-setup-reload.spec.ts:47-68`** — `frontend`

22 satır **karakter karakter aynı** (yalnızca üstündeki JSDoc metni farklı).
Gerçek tekrar, yüzeysel benzerlik değil: iki kopya **aynı sebeple** değişir —
ikisi de `TwoFactorSetupWizard`'ın `<details><p>{state.totpURI}</p></details>`
düzenine, `'Şifreniz'` / `'Devam et'` / `'Doğrulama kodu'` / `'Bağlantıyı göster
(gelişmiş kullanıcılar için)'` etiketlerine ve `secret=` regex'ine bağlı. Bunların
**tamamı** iki uygulamada da aynı (ADR-0024 Karar 6 iki sihirbaz kopyasının
senkron tutulmasını zorunlu kılıyor) ⇒ birinde değişen şey diğerinde de değişir.

Her iki dosyadaki yorum gerekçeyi *"cross-app import yasak, yerel kopya"* diye
veriyor — ama bu gerekçe **bu vakada geçerli değil**: aynı iki dosya `:28` / `:36`
satırında `../../../scripts/playwright/totp.js`'i **zaten** import ediyor.
Paylaşılan, mimari sınırın dışındaki ev **mevcut ve kullanımda**.

Emsal bağlayıcı: `apps/admin/e2e/helpers/verified-fixture-user.ts:15-24`'ün
kendi yorumu, T-021/S10 FIX turu 1'de **`solid` M2 bulgusuyla** dört kopyalı bir
Mailpit yardımcısının tam da bu şekilde `scripts/playwright/mailpit.ts`'e
taşındığını ve bunun CLAUDE.md §3'ü **ihlal etmediğini** kayda geçiriyor.

**Önerilen düzeltme:** yardımcıyı `scripts/playwright/`e taşı (ör.
`two-factor-wizard.ts`, imza `(page: Page, password: string): Promise<string>`;
`Page` tipi `@playwright/test`'ten gelir, uygulama bağımlılığı doğmaz). İki spec
`totp.js`'i import ettiği aynı göreli yoldan tüketsin. Akış farkları (admin =
gönüllü kart + "Etkinleştir"e tekrar basma; superadmin = zorunlu kapı +
otomatik yönlendirme) **spec'lerde kalsın** — onlar gerçekten farklı ve
birleştirilmemeli.

---

### L-1 · [SEV: low] `normalizeRequestPath`'in "güvenli varsayılan" iddiası altı tüketicisinden biri için **yanlış**

**`apps/api/src/http/normalize-request-path.ts:222-225`** (ve aynı iddianın
geniş hâli `:38-42`) — `backend`

Yorum, ayrıştırılamayan `rawUrl`'de ham değere düşmenin *"TAM EŞLEŞMELİ
tüketiciler (exempt kümeleri, **rota haritaları**) için güvenli varsayılan"*
olduğunu söylüyor. Muafiyet kümeleri için doğru (eşleşmeme = korumalı kal).
**Rota haritası için değil:** `resolveRateLimitPolicy` eşleşme bulamayınca
`undefined` döner (`auth/rate-limit/rate-limit.policy.ts:382`) ve bu dosyanın
**kendi** `:65-68` satırları bu sonucu *"`RateLimitGuard` Redis'e HİÇ dokunmadan
`true` dönüyordu"* diye, yani **fail-open** olarak tarif ediyor — F8'in (security
tur 3, `high`) kök nedeni tam buydu.

`low` seçildi çünkü **bugün erişilebilir değil**: `rawUrl` `/` ile başlıyorsa
`new URL(ORIGIN + rawUrl)`, WHATWG'in geçersiz karakterleri yüzde-kodlaması
nedeniyle pratikte fırlatmaz; yani `unparsable` dalı rate-limit tüketicisinde
gözlenebilir bir boşluk üretmiyor. Bulgu **davranış değil, belgelenmiş
değişmezin yanlışlığı**: beş yıl sonra bu satırı okuyan biri *"ayrıştırılamaz
her zaman güvenli"* sonucunu çıkarır ve yeni bir tam-eşleşmeli tüketici eklerken
analizi atlar.

**Önerilen düzeltme:** iddiayı tüketici sınıfına göre ayır — *"muafiyet kümeleri
için güvenli (eşleşmeme = korumalı); **politika/rota haritaları için eşleşmeme
fail-OPEN'dır**, bu yüzden `undefined` politikayı tüketen her çağıran kendi
fail-closed davranışını ayrıca kurmalıdır (bkz. F8)"*. Satır sayısı değişmez.

> **Not:** paralel koşan `security` gate'i bu dalı **erişilebilir** bulursa bulgu
> onların `high`'ı olur; ben erişilebilirliği kanıtlayamadım (`Bash` yok) ve
> kanıtsız şişirmedim.

---

### L-2 · [SEV: low] `normalize-request-path-double-slash-http.test.ts`'in adı ve başlığı artık **yanlış** — "bugün KIRMIZI olmak ZORUNDA" diyor, test yeşil

**`apps/api/src/__tests__/normalize-request-path-double-slash-http.test.ts:4`,
`:33-39`, `:59-65`, `:66` (`it(...)` başlığı)** — `backend`

Dosya başı *"BU DOSYA ÜRETİM KODU DEĞİŞMEDEN YAZILDI"*, `it` başlığı ise
*"BUGÜN (fix ÖNCESİ) KIRMIZI olmak ZORUNDA"* diyor. S2 adım④'ün düzeltmesi
**aynı Task'ta** indi (`normalize-request-path.ts:206-215`), dolayısıyla
`normalizeRequestPath('//')` artık fırlatmıyor (`'//'` → `'/'`) ve test yeşil.
Testin adı — bir bakımcının ilk okuduğu şey — gerçeğin tersini söylüyor.

Somut risk: bir sonraki bakımcı "bu test kırmızı olmalıydı, yeşil geliyor"
diyerek assertion'ı `toBe(500)`'e çevirebilir, yani regresyon kapısını
**ters çevirebilir**.

**Önerilen düzeltme:** `it` başlığını üretim gerçeğine çevir (ör. *"`GET //`
authority olarak yorumlanmaz: 500 DÖNMEZ, gövde `requestId` + `code` taşır
(S2 §1.5 regresyon kapısı)"*), üretim-öncesi ölçüm anlatısını (`:33-39`,
`:59-65`) *"bu test S2 adım②'de üretim kodu değişmeden yazıldı ve o koşumda
500 + `INTERNAL_ERROR` gözlendi; adım⑥'da fix ile yeşile döndü"* şeklinde
**geçmiş zamana** al.

---

### L-3 · [SEV: low] `messages.test.ts`'in yeni `describe`'ı mevcut bir assertion'ı **birebir** tekrar ediyor

**`apps/admin/src/__tests__/messages.test.ts:169-171`** (aynısı `:56-58`'de) ve
**`apps/superadmin/src/__tests__/messages.test.ts:105-107`** (aynısı `:35-37`'de)
— `frontend`

`expect(ERROR_MESSAGES_KEY_COUNT).toBe(PANEL_ERROR_CODES.length)` dört kez yazılı;
yeni iki kopya sıfır ek kapsam üretiyor (aynı girdi, aynı modül, aynı iddia).
Üstelik `describe('MESSAGES.auth.twoFactor.setupResumedNotice — ADR-0024 Karar 5')`
bloğunun içinde duruyor ama `setupResumedNotice` ile ilgisi yok — blok başlığı
içeriğini anlatmıyor.

**Önerilen düzeltme:** yeni `it('kapalı dünya … BÜYÜMEDİ — AC-3')` bloklarını sil;
AC-3'ün kanıtı zaten `:56-58` / `:35-37`'de duruyor ve `setupResumedNotice`
eklenmesinden sonra da koşuyor — yani AC-3 **mekanik olarak** korunuyor.

---

### L-4 · [SEV: low] `submitPassword`'un `'totp'` adımı kabulü erişilemez dal

**`apps/admin/src/features/two-factor/two-factor-setup-controller.ts:142`** ve
**`apps/superadmin/src/features/two-factor/two-factor-setup-controller.ts:140`**
— `frontend`

```ts
if (this.state.step !== 'password' && this.state.step !== 'totp') { return }
```

`submitPassword` yalnızca şifre formundan çağrılıyor
(`TwoFactorSetupWizard.tsx:112-113` / `:99-100`), o form ise yalnızca
`state.step === 'password'` iken render ediliyor (`:111` / `:98`). `'totp'`
kabulü hiçbir akışta tetiklenmiyor; birim testlerinin hiçbiri de 'totp'
adımındayken `submitPassword` çağırmıyor (VAKA 4 önce `goBackToPasswordStep`
çağırıyor). Kaldırılırsa davranış birebir aynı kalır.

Zararsız değil, çünkü `'totp'` iken `setState({ ...this.state, isSubmitting: true })`
`totpURI`/`backupCodes` alanlarını taşımaya devam eder; dal canlanırsa durum
makinesinin ara durumu belgelenmemiş bir şekle girer.

**Önerilen düzeltme:** koşulu `if (this.state.step !== 'password') return` yap
(iki kopyada da, ADR-0024 Karar 6'nın "tek alt görevde birlikte" kuralıyla).

---

### L-5 · [SEV: low] `backupCodesCapturedForDisplay` kurulum bittikten sonra **temizlenmiyor**

**`apps/admin/src/features/two-factor/two-factor-setup-controller.ts:96,188`** ve
**`apps/superadmin/.../two-factor-setup-controller.ts:94,186`** — `frontend`

Alan bir **gösterim** önbelleği — bu doğrulandı (bkz. §2.2): kontrol akışına
girmiyor, karar `:132`/`:130`'da yalnızca sunucu hata koduna bakıyor ve
`resolveTotpUriAction` bu alanı **okumuyor**. Ama alan bir **kimlik doğrulama
sırrı** (yedek/kurtarma kodları) taşıyor ve `submitCode` başarıyla bitip durum
`'backup-codes'`/`'completed'`e geçtikten sonra da **dolu kalıyor**; sıfırlayan
hiçbir satır yok. Sızıntı sınıfı yeni değil (aynı kodlar React state'inde ve
DOM'da zaten var) ve kalıcı depoya/loga **yazılmıyor** — bu yüzden `low`.

**Önerilen düzeltme:** `submitCode`'un başarı dalında (`:218-222` / `:216-220`)
geçiş yapıldıktan sonra `this.backupCodesCapturedForDisplay = null` — sırrın
bellekte kalma süresi gösterim ihtiyacıyla sınırlanır.

---

### L-6 · [SEV: low] Admin spec'i fixture e-postasını `e2e-registration-` önekiyle üretiyor

**`apps/admin/e2e/two-factor-setup-reload.spec.ts:75`** — `frontend`

`createVerifiedFixtureUser(request)` varsayılan `emailPrefix = 'e2e-registration'`
ile çağrılıyor (`e2e/helpers/verified-fixture-user.ts:48`), yani 2FA reload
spec'inin kullanıcıları kayıt akışı spec'ininkilerle aynı önekte doğuyor.
Superadmin kardeşi doğrusunu yapıyor (`:79`, `'e2e-2fa-reload'`). Başarısız bir
koşumda Mailpit/DB'de hangi spec'in artığı olduğu ayırt edilemiyor.

**Önerilen düzeltme:** `createVerifiedFixtureUser(request, 'e2e-2fa-reload')`.

---

### Kontrol edilip **bulgu yazılmayanlar** (negatif kanıt)

| Eksen | Sonuç |
| --- | --- |
| `any` | **0** (değişen 24 dosyada tarandı) |
| `@ts-ignore` / `@ts-expect-error` | **0** |
| Boş `catch {}` | **0** — iki `catch` bloğu da (`normalize-request-path.ts:95`, `TwoFactorSetupWizard.tsx:317`) gerekçeli `return` taşıyor, yutma değil |
| `console.*` | **0** |
| Gerekçesiz `as` | **0** — yalnızca `as const` (`auth-budget.ts:16/23`, sabit nesne dondurma) |
| Katman ihlali (CLAUDE.md §3) | **yok** — `packages/ui`'den yalnızca `Button`/`Input` tüketiliyor, veri çekme yok; `apps/*`→`apps/*` import yok; `apps/*/e2e` → `scripts/playwright/` göreli importu mimari sınırın dışında (T-021/S10 emsali) |
| Döngüsel bağımlılık | **yok** — `http/normalize-request-path.ts` iç bağımlılığı **sıfır** (yalnızca global `URL`), `tenancy ↔ auth` çift yönü doğmuyor |
| Çekirdekte sağlayıcı dallanması | **yok** — `TOTP_NOT_ENABLED` literali ADR-0024 Karar 2/4'te **açıkça kabul edilmiş** bir maliyet ve `apps/api`'de gerçek Better Auth zincirine karşı sözleşme testiyle pinli |
| `ölü kod` (S6 sonrası `base.ts`) | **yok** — dört sabitin dördü de dosya içinde tüketiliyor (`:34→:45`, `:42→:48`, `:59→:142`, `:70→:143`); iki export (`desktopDevice`/`mobileDevice`) üç `playwright.config.ts`'te gerçekten kullanılıyor (ölçüldü, grep) |

---

## 2. HANDOFF'UN SORDUĞU ALTI NOKTA

### 2.1 İki kontrolcü gerçekten eşdeğer mi? — **EVET (bağımsız doğrulandı)**

S4'ün "0 satır" iddiası **doğrulandı**, kendi ölçümümle:

- `apps/admin/.../two-factor-setup-controller.ts:42-232` ≡
  `apps/superadmin/.../two-factor-setup-controller.ts:40-230`, **sabit +2 ofset**
  ile satır satır aynı (import bloğu, `TwoFactorSetupDeps`, `TwoFactorSetupState`
  union'ı, sınıf gövdesi, beş metot).
- Bağımsız mekanik kontrol: yapısal satır sayımı
  (`^\s*(private|public|async|constructor|export|return|if|this\.)`) **43 = 43**.
- `backupCodesCapturedForDisplay` her iki dosyada **5** kez geçiyor, aynı ofsette
  (admin `:32,89,96,157,188` ↔ superadmin `:30,87,94,155,186`).

**Ayrışma yok** ⇒ `ROADMAP:3406`'nın ötesinde bir bulgu doğmuyor.

Tek fark **dosya başı yorum metinleri** (admin "session.me invalidation",
superadmin "platform.session invalidation") — ki bu doğru, çünkü `onVerified`
implementasyonları gerçekten farklı (`invalidateSessionIdentity` vs.
`invalidatePlatformSession`) ve o fark **bileşende**, kontrolcüde değil.

⚠ **Bitişik ama ayrı gözlem (bulgu değil, `docs` için not):** iki kontrolcü
eşdeğer ama **bağımlılıkları değil** — `apps/superadmin/src/errors/panel-error.ts:14`
`fields` kanalı taşımıyor, admin'inki taşıyor (iki test dosyasının
`resolveTotpUriAction` çağrılarındaki `fields: null` farkı buradan geliyor:
admin test `:246-251`, superadmin test `:235`). Bu, ADR-0024'ün
"ortaklaşacak birim **üçlüdür**" tespitini **doğruluyor** — kontrolcüyü tek
başına taşımak v0.0.22'de yetmeyecek.

### 2.2 `backupCodesCapturedForDisplay` — gösterim önbelleği mi, gizli durum mu?

**Gösterim önbelleği.** Kanıt zinciri (okuma, çalıştırma değil):

1. Kontrol akışı kararı **yalnızca** `resolveTotpUriAction` (`:131-133`/`:129-131`)
   tarafından verilir ve o fonksiyon **saf**: tek girdisi `PanelError`, gövdesi
   `error.kind === 'known' && error.code === 'TOTP_NOT_ENABLED'`. Alanı
   **okumuyor**.
2. `submitPassword` içinde alan **iki yerde** geçiyor: `:157` (okuma → doğrudan
   `state.backupCodes`'a, yani render'a) ve `:188` (yazma, `enable` başarısından
   sonra). İkisi de dallanmıyor.
3. `enable` çağrılıp çağrılmayacağı `:164`'teki `show-error` kontrolüyle, yani
   **sunucu durumuyla** belirleniyor — önbellek dolu/boş olması bu dala
   **hiçbir** etki yapmıyor. Önbelleği `null`'a sabitlemek `enable` çağrı
   sayısını değiştirmez.
4. Sır **saklamıyor** (kalıcı anlamda): `localStorage`/`sessionStorage`/çerez
   yazımı yok (ADR-0024 bu alternatifi açıkça reddetmiş), log yok, ağa geri
   gönderim yok. Ömür = controller örneği = mount ömrü; reload yeni örnek ⇒ boş
   önbellek ⇒ `setupResumedNotice` gösterilir (Karar 5'in sınırı **gizlenmiyor**,
   `TwoFactorSetupWizard.tsx:224-228`/`:199-203`).

Tek kusur **temizlenmemesi** → L-5.

### 2.3 S6 sonrası `base.ts`'te ölü kod kaldı mı? — **HAYIR**

Dört sabit de dosya içinde tüketiliyor: `DESKTOP_DEVICE_NAME:34` → `:45`,
`MOBILE_DEVICE_NAME:42` → `:48`, `VISUAL_MAX_DIFF_PIXEL_RATIO:59` → `:142`,
`VISUAL_THRESHOLD:70` → `:143`. (Handoff'taki `:44,47,141,142` referansı bir-iki
satır kaymış; sonuç aynı.) Depo genelinde bu dört adın `base.ts` dışında **hiçbir
kaynak dosyada** geçmediği ölçüldü — yalnızca `ROADMAP.md`/`docs/gates/`/Task
dosyalarındaki anlatı metinlerinde var, yani kapatılan borç gerçekten kapalı ve
yapay tüketici **icat edilmemiş** (A-T21-5 korunmuş). `:21-30`'daki tasarım
yorumu bugünkü gerçeği doğru anlatıyor.

### 2.4 S2'nin üç yeni fonksiyonu

| Fonksiyon | Tek sorumluluk | İsim | Karar |
| --- | --- | --- | --- |
| `foldTrpcMountPrefix:148` | ✅ tek iş: mount segmentini kanonikleştir; sınır kontrolü (`:159-163`) `/trpcX/` yanlış-pozitifini kapatıyor | ✅ `fold…` fiil + nesne, camelCase | temiz |
| `stripTrailingSlashes:104` | ✅ | ✅ | temiz |
| `resolveCanonicalPathnameOrUnparsable:206` | ✅ tek iş: WHATWG çözümü + authority yorumunu yapısal engelleme | ⚠ uzun ama **dürüst** — `…OrUnparsable` soneki `null` dönüşünü adında taşıyor, sessiz sentinel değil | kabul |

**`unparsable`'ın iki çağrı noktasında ters yorumlanması okunabilir ve
belgelenmiş.** Üç ayrı yerde, **gerekçesiyle** yazılı: `:197-205` (üretici,
"TEK bir varsayılan BURAYA KODLANMAZ"), `:217-226` (`normalizeRequestPath` →
ham `rawUrl`), `:239-253` (`matchesPrefix…` → `true`, "ÖNEK eşleşmesi TERS
varsayılana sahip"). Asimetri **gerçekten gerekli** (tam eşleşmede eşleşmeme
= güvenli; önek eşleşmesinde eşleşmeme = guard atlanması) ve bu tam olarak
anlatılmış. ⚠ Tek kusur `:222-225`'teki iddianın rate-limit tüketicisi için
yanlış olması → L-1. Ayrıca hattın iki kez yazılmış olması → M-1.

### 2.5 İki e2e spec'i kopya-yapıştır mı? — **AKIŞ FARKI GERÇEK, yardımcı kopya**

Gerçek fark (birleştirilmemeli):

| | admin | superadmin |
| --- | --- | --- |
| Giriş | `/sign-in` UI'da gönderim → `/hesap/guvenlik`'e **elle git** (`:78-85`) | `storageState` ile context + `/`'den **otomatik yönlendirme** (`:111-115`) |
| Sihirbazı açma | "Etkinleştir" (gönüllü kart) `:88`, reload sonrası **tekrar** `:100` | "Kurulumu başlat" (zorunlu kapı) `:116`, reload sonrası tekrar `:130` |
| Fixture | `createVerifiedFixtureUser(request)` + `tenant-cleanup` | `platform-admin.ts` + `grantPlatformAdmin` + `deletePlatformAuditLogByActor` |
| Bitiş kanıtı | `'İki adımlı doğrulama: Açık'` metni `:115` | `/` URL'ine yönlenme `:146` |
| Bütçe | 1 sign-up (helper) + 1 sign-in (UI) | helper **ikisini birden** üretir, UI'da giriş yok |

Üçü de `auth-budget.ts` satırlarıyla tutarlı (admin `:61`, superadmin `:51`) ve
her iki yorum bloğu farkı A-A22-4'e atıfla **doğru** anlatıyor. Kopya olan
**yalnızca** DOM okuma yardımcısı → M-2.

### 2.6 `any` · `as` · `@ts-ignore` · boş `catch` · `console.log`

**Hepsi sıfır** — §1'deki negatif kanıt tablosuna bkz.

---

## 3. ÖLÇÜMLER

| Ölçüm | Değer |
| --- | --- |
| İncelenen dosya (kapsam içi) | **24** |
| İncelenen dosya (bağlam/tüketici, bulgu yazılmadı) | 4 (`platform-admin-ip.guard.ts`, `rate-limit.policy.ts`, `panel-error.ts`, ADR-0024) |
| `any` sayısı | **0** |
| `@ts-ignore` / `@ts-expect-error` | **0** |
| Boş `catch` bloğu | **0** |
| `console.*` | **0** |
| Gerekçesiz `as` zorlaması | **0** |
| En büyük fonksiyon | `TwoFactorSetupWizard` — **248 satır** (`TwoFactorSetupWizard.tsx:55-302`, admin); dört render dalı, iki form. **Bulgu yazılmadı:** boyutun tamamı T-016'dan devralındı, S4 yalnızca 5 satır (`:224-228`) ekledi; bu Task'ta oluşmuş bir bozulma değil |
| En büyük fonksiyon (bu Task'ta yazılan/değişen) | `submitPassword` — **56 satır** (`two-factor-setup-controller.ts:141-196`, yorumlar dahil; ~28 satır kod) |
| Bulgular | 0 critical · 0 high · **2 medium** · **6 low** |

**Koşturulan komut:** yok — bu ajanın `Bash` aracı yok, denetim tamamen statik.
Hiçbir test/lint sonucu iddia edilmiyor.

⚠ **Orkestratör için:** bu rapor `prettier --write` ile kapatılamadı (`Bash`
yok) — `AGENT_BASELINE.md` §5'in `solid`/`wcag` istisnası gereği biçimlendirmeyi
Orkestratör kapatır.

---

## 4. TEKNİK BORÇ SATIRLARI (`docs` kopyalasın — `AGENT_BASELINE.md` §4)

`low` bulgular düzeltme turu açmaz; aşağıdaki satırlar doğrudan ROADMAP borç
tablosuna gider.

- `[low]` `apps/api/src/http/normalize-request-path.ts:222-225` — "ayrıştırılamaz
  = güvenli varsayılan" iddiası rota/politika haritası tüketicisi için yanlış
  (eşleşmeme = fail-open, F8'in sınıfı); yorumu tüketici sınıfına göre ayır —
  `backend` — vade **v0.0.22**
- `[low]` `apps/api/src/__tests__/normalize-request-path-double-slash-http.test.ts:66`
  — `it` başlığı ve `:33-39`/`:59-65` anlatısı "bugün kırmızı olmalı" diyor, fix
  aynı Task'ta indi ve test yeşil; başlığı üretim gerçeğine, anlatıyı geçmiş
  zamana çevir — `backend` — vade **v0.0.21**
- `[low]` `apps/admin/src/__tests__/messages.test.ts:169-171` ve
  `apps/superadmin/src/__tests__/messages.test.ts:105-107` — `ERROR_MESSAGES_KEY_COUNT`
  assertion'ı aynı dosyada (`:56-58`/`:35-37`) zaten var; sıfır ek kapsamlı kopya
  testleri sil — `frontend` — vade **v0.0.21**
- `[low]` `apps/admin/src/features/two-factor/two-factor-setup-controller.ts:142`
  ve `apps/superadmin/src/features/two-factor/two-factor-setup-controller.ts:140`
  — `submitPassword`'un `'totp'` adımı kabulü erişilemez dal; koşulu
  `step !== 'password'`e indir (iki kopyada **birlikte**, ADR-0024 Karar 6) —
  `frontend` — vade **v0.0.22**
- `[low]` `apps/admin/src/features/two-factor/two-factor-setup-controller.ts:188`
  ve `apps/superadmin/.../two-factor-setup-controller.ts:186` —
  `backupCodesCapturedForDisplay` kurulum tamamlandıktan sonra temizlenmiyor;
  `submitCode` başarı dalında `null`'a çek — `frontend` — vade **v0.0.22**
- `[low]` `apps/admin/e2e/two-factor-setup-reload.spec.ts:75` — fixture e-posta
  öneki varsayılan `'e2e-registration'`; `'e2e-2fa-reload'` geçir (superadmin
  kardeşi `:79` doğrusunu yapıyor) — `frontend` — vade **v0.0.21**

`medium` bulgular (M-1, M-2) ROADMAP borcuna **ek olarak** Orkestratörün
takibine girer; FAIL eşiğini (3) aşmadıkları için bu turda düzeltme turu
açmıyorlar, ama M-1'in vadesi **v0.0.22'yi geçmemeli** (normalizasyon hattına
eklenen her yeni eksen riski büyütüyor).
