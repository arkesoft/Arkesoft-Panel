# T-014 — security gate, tur 2 (DAR kapsam)

**Tarih:** 2026-11-04 · **Sürüm:** ROADMAP v0.0.14 · **Dal:** `chore/ajan-altyapisi`
**Kapsam:** yalnızca **M-1** ve **M-2**'nin kapanışı + FIX 1'in değiştirdiği dosyalar.
🚫 Yeni tarama yok · dokuz `low` yeniden raporlanmadı · `solid`'in bulguları değerlendirilmedi ·
FIX 1b denetlenmedi.

```
GATE: security
SONUÇ: PASS
```

0 `critical` · 0 `high` · 0 `medium` · **1 `low`** → §4: PASS, borca.
⚠ **Düzeltme turu açılmıyor** (`low` için tur koşturulmaz).

---

## (a) M-1 — ✅ **KAPANDI**

Üç yarının üçü de yerinde ve **ölçüldü**:

| Yarı | Kanıt |
| ---- | ----- |
| **Kayıt yazılıyor** | `packages/trpc/src/trpc.ts:117-131` (`logAppError`), `:268-273`'te `isAppError(result.error.cause)` dalından `toTrpcError()`'dan **önce** çağrılıyor. Eşik `:60` `SERVER_ERROR_STATUS_THRESHOLD = 500`; altı `warn`, üstü/eşiti `error`; eşiğin **altındaki** bilinmeyen durum da `warn`'a düşüyor (fail-safe, sessizlik değil). |
| **Dört yanlış cümle** | `permission-procedure.ts:75-87` · `tenant-membership-required.error.ts:9-34` · `owner-membership-protected.error.ts:30` · `invitation-resend-too-soon.error.ts:22` · `pending-invitation-limit-reached.error.ts:23` — hepsi "loga gider" iddiasını **gerçeğe** bağlıyor. Ek olarak `create-trpc-request-handler.ts`'in erken dönüş gerekçesi tamamlandı ve `invitation-invalid.error.ts` **ALTI → YEDİ** moda çıktı. |
| **`targetUserId` ayrımı** | `tenant-membership-required.error.ts:52` → `subject === 'actor' ? {userId, tenantId} : {targetUserId: userId, tenantId}`, varsayılan `'actor'`. ⚠ **Kendi ölçümüm:** `git diff -- apps/api/src/auth/auth.guard.ts \| wc -l` → **0**; `rg "new TenantMembershipRequiredError"` → **üç** çağrı yeri: `auth.guard.ts:116` (2 arg = aktör, **doğru**), `membership-read.port.adapter.ts:50` (2 arg = aktörün üyeliğini çözüyor, **doğru**), `member.service.ts:121` (`'target'`, **doğru**). |

**Tur 1'deki senaryom artık tespit edilebilir mi — EVET.** Üç yazma ucunun üçü de
`permissionProcedure('member:write')` kullanıyor (`member.router.ts:54`, `:95`, `:103`); o builder
`tenantProcedure` → `base = t.procedure.use(appErrorBoundary)` üzerine kuruluyor ve sınır `base`'e
**TEK KEZ** bağlı → kayıt üç uç için **yapısal olarak** garanti.

**Koşturduğum testler (gerçek HTTP + gerçek Postgres):**
`apps/api/src/__tests__/trpc-error-boundary-logging.test.ts` → **6/6 PASS** ·
`packages/trpc/src/__tests__/app-error-boundary-logging.test.ts` + `authz-consistency.test.ts` →
**16/16 PASS**, `Type Errors: no errors`.
⚠ Vacuous değil: altıncı test `/trpc/tenant.current`'tan **HTTP 200** + **sıfır** sınır kaydı
istiyor — canlı oturum + canlı kiracı satırı olmadan geçemez.

Ölçülen kayıt (`member.remove`, `readonly` aktör): `level=warn` · `code=PERMISSION_DENIED` ·
`httpStatus=403` · `isRetryable=false` · `context={permission:'member:write',role:'readonly'}` ·
üst seviye `userId`=aktör · `tenantId` dolu · `stack` **yok**. Tel gövdesi: `details:{}`, tam
dört anahtar, `member:write`/`readonly`/`isRetryable` gövdede **yok**.

⚠ `member-invite-flow.test.ts:561-582` **gevşetilmedi**: "hiç log yok" yokluk assert'i, "tam bir
kayıt + `level==='error'` + `httpStatus===503` + `isRetryable===true`" varlık+içerik assert'ine
dönüştü — **sıkılaştırma**.

---

## (b) M-2 — ✅ **KAPANDI** (tur 1'in `DOĞRULANAMADI` maddesi bu turda **TEYİT EDİLDİ**)

Tur 1'de HTTP seviyesini gözleyememiştim. **Bu turda gerçek istekle ölçtüm:**

| Yol | Sonuç |
| --- | ----- |
| `member.acceptInvitation`, kiracı yarısında NUL | **HTTP 404** · `INVITATION_INVALID` · `details:{}` · `unclassified-error` **0** · hiçbir kayıtta `stack` **yok** · kiracı kimliği **hiçbir kayda girmiyor** |
| `member.remove`, `userId`'de NUL (ikinci erişim yolu) | **HTTP 403** · `TENANT_MEMBERSHIP_REQUIRED` · `unclassified-error` **0** · transaction **hiç açılmıyor** (`assertUserIdShape` `member.service.ts:373`/`:450`'de `withTenant`'tan **önce**) |
| L6 — 4096 karakterlik `userId` | **HTTP 400** · sınır kaydı **0** (`member.schema.ts:119` `min(1).max(64)`) |

**Kapının vacuous olmadığını kendim ölçtüm** (salt okuma, geri alınan transaction):

```
set_config('app.tenant_id', repeat('a',24), true)   → OK,  count 0
set_config('app.tenant_id', repeat('a',510), true)  → OK (len 510), count 0   ← desenin EN UZUN girdisi
set_config('app.tenant_id', 'abc' || chr(0), true)  → ERROR: null character not permitted
kolon tipleri: tenant_invitation/tenant_membership/audit_log → tenant_id, user_id = text
```

Yani girdi ile ham 500 arasındaki **tek** şey `TENANT_ID_PATTERN`'dir ve kolonlar `text` olduğu
için uzunluk kaynaklı bir karşılaştırma hatası da yok.

🚫 `withTenant` kapısı değişmedi: `git diff -- packages/db/src/tenant-context.ts | wc -l` → **0**
(ADR-0003 md 1 korundu, düzeltme **çağıran** tarafta).
**Karakter sınıflarını canlı veriden kendim doğruladım:**
`tenant` 1 satır, 24 karakter, **%100** `^[a-z0-9]+$` · `app_user` **21 469** satır, 24-32 karakter,
**%100** `^[A-Za-z0-9_-]+$`, **64'ten uzun 0 satır** · `tenant_membership.user_id` 4 435 satır,
**%100** uyumlu → `max(64)` **hiçbir meşru kimliği kilitlemiyor**.

---

## (c) ADR-0016 md 6 koşul D — ✅ **ARTIK TAM** (tur 1: "D KISMEN")

**Sekizinci modu aradım, ATLATMAYI DENEDİM — bulamadım.** Altı prob ailesi:

1. **Desen çapaları, 20 bayt/biçim vakası** (kendi probum): NUL · LF · CR · VT · FF · U+0085 ·
   U+2028 · U+2029 · tab · boşluk · BOM · ZWSP · soft hyphen · lone surrogate · Arap-Hint rakam ·
   tam genişlik rakam · büyük harf · nokta → **hepsi reddedildi**. `flags` **boş** → `m` yok →
   JS'te `$` sondaki LF'ten önce eşleşmiyor (**ölçtüm: `false`**), `g` yok → `lastIndex` tuzağı yok.
2. **Desenin izin verdiği EN UÇ girdi** (510 × `[a-z0-9]`): `set_config` OK → sorgu OK → 0 satır →
   **aynı tek 404**. Yeni mod değil.
3. **Boş dize / boş kiracı yarısı:** `separatorIndex <= 0` + `+` niceleyicisi kesiyor.
4. **Gizli yarı** Postgres'e **hiç ulaşmıyor** — yalnızca onaltılık `sha256` özeti gidiyor →
   oradaki herhangi bir bayt zararsız.
5. **Yeni tablolara HAM giden ikinci girdi sınıfı** (`ip`/`userAgent` → `audit_log`): Node'un HTTP
   ayrıştırıcısı başlık değerindeki NUL'u **ve** CR'yi **uygulama kodundan önce** 400 ile
   reddediyor — ham soketle ölçtüm: kontrol **200**, UA'da NUL **400**, XFF'te NUL **400**,
   UA'da CR **400**. O katmana da ulaşılamıyor.
6. **`member.invite` e-posta alanı** (`z.email().max(254)`, zod 4.6.7): NUL · LF · CR · lone
   surrogate · boşluk · unicode yerel/alan → **hepsi reddedildi**; 252 karakter geçiyor.

⚠ **Akıştaki sekizinci SONUÇ bir kusur DEĞİL:** `member.service.ts:672-680`
`(tenant_id,user_id)` benzersizlik ihlalini yakalayıp `AlreadyMemberError`'a çeviriyor → ham 500
değil, **sınıflandırılmış**. Ayrıca **GEÇERLİ bir belirteç** gerektiriyor, yani koşul D'nin
koruduğu **enumerasyon** yüzeyinde değil (koşul D belirteç-geçersizliği modlarıyla ilgilidir, bu
ise doğrulama-sonrası bir sonuç).

---

## (d) Yeni logun KENDİSİ — uyumlu, bir ölçülmüş çekince ile

- **Sır/PII yok:** `apps/api/src/errors/domain/`'deki **24** `context:` yerinin tamamını saydım —
  opak cuid'ler, izin dizgisi, rol enum'u, sayaçlar, i18n anahtarları, `reason` enum'ları.
  **Sıfır** e-posta/token/parola/TCKN/kart.
- **Gölgeleme savunması ÇALIŞIYOR (gerçek pino + gerçek `PINO_REDACT_PATHS` ile ölçtüm):**
  `context.userId = 'usr_TARGET'` verdiğimde üst seviye `userId` **aktörde kaldı** (`usr_actor`).
  Nesteleme iddia edildiği gibi **fail-closed**.
- `AppError.context` varsayılanı `{}` (`app-error.ts:130` `?? {}`) → `undefined` dalı yok.
- `InvitationInvalidError` `context` **boş** ve **doğrulanmamış** kiracı kimliği hiçbir kayda
  girmiyor (testte assert'li, ben koşturdum).
- ⚠ **Ama "redaction yollarının kapsamına girer" iddiası beşte bir doğru** → aşağıdaki `low`.

---

## (e) `targetUserId` — tele **sızmıyor**, oracle **açmıyor**

**İki kiracılı senaryoyu geri alınan bir transaction'da kurup ölçtüm** (net durum değişikliği
**sıfır**: üç prob satırının üçü de `ROLLBACK` sonrası **0**):

```
SET ROLE arkesoft_app; set_config('app.tenant_id','<kiracı A>',true)
hedef BAŞKA KİRACIDA (var olan kullanıcı) → 0 satır
hedef HİÇ YOK (uydurma kimlik)            → 0 satır     ← AYIRT EDİLEMEZ
kontrol: A'nın kendi üyeleri              → 4435 satır  ← vacuous DEĞİL
```

İkisi de **aynı** `TENANT_MEMBERSHIP_REQUIRED`/403/`details:{}` üretiyor. Hedefin kimliği tel
gövdesinde **yok** (assert'li). ⚠ Üstelik **ayırt edilebilirlik AZALDI**: biçimsel olarak geçersiz
bir kimlik eskiden **500**, şimdi **aynı 403**.

---

## (f) Düzeltmenin getirdiği yeni yüzey — bir `low`

### [SEV: low] `AppError.context` koşulsuz loglanan bir alana dönüştü; iddia edilen ikinci savunma hattı 22 redaction yolunun yalnızca 4'ünü kapsıyor

**Dosya:** `packages/trpc/src/trpc.ts:101-106` (iddia) + `:122` (uygulama) ·
`packages/errors/src/redaction.ts:58-82` (liste) · `packages/errors/src/app-error.ts:107` (sözleşme)

**Ne:** FIX 1, `AppError.context`'i tRPC yolunda **koşulsuz loglanan** bir alan yaptı. `trpc.ts:105`
bunu *"somut logger'ın joker redaction yollarının (`*.token` vb.) kapsamına girer — ikinci savunma
hattı"* diye gerekçelendiriyor. **Ölçtüm (gerçek pino + gerçek `PINO_REDACT_PATHS` +
`logAppError`'ın birebir payload şekli):**

```
REDACTED : context.token · context.password · context.sessionToken · context.passwordHash
SIZIYOR  : context.secret · context.apiKey · context.accessToken · context.refreshToken
           context.cookie · context.authorization · context.verificationToken · context.resetToken
           context.nested.token (derinlik 3) · context.causeMessage
```

Sebep mekanik: 22 yoldan yalnızca **dördü** (`*.password`, `*.token`, `*.sessionToken`,
`*.passwordHash`) `*.` önekli ve pino'nun `*`'ı **tam bir** seviye eşler. Oysa `app-error.ts:107`
`context` için *"PII içerebilir"* diye **yazılı sözleşme** veriyor.

**Nasıl istismar edilir (bugün: edilemez, yarın: sessizce):** Bugün somut senaryo **kurulamıyor** —
tRPC'den ulaşılabilen hiçbir hata sınıfı bu anahtarlardan birini taşımıyor (24'ünü saydım). Ama
hiçbir mekanizma engellemiyor: `context: { email }` veya `context: { apiKey }` yazan **bir sonraki**
hata sınıfı, CLAUDE.md §4'ün *"asla loglanmaz"* listesini ihlal eden tam bir log sızıntısı üretir ve
yazarı bunu **fark etmez**, çünkü `trpc.ts:105` redaction'ın kapsadığını söylüyor. ⚠ Aynı boşluk
REST yolunda **FIX 1'den önce de vardı** (`errors/error-mapping.ts`'in `logContext`'i `context`'i
aynen yazıyor) → FIX 1 boşluğu **yaratmadı**, `context`'i tüketen yol sayısını **artırdı**. Bu
yüzden `low`, `medium` değil.

**Önerilen düzeltme:** Ya kalan sır adları için `PINO_REDACT_PATHS`'e `*.` varyantları eklenir
(+ `*.email` → `maskEmail`), ya `logAppError`'ın `context: appError.context` satırı bir
izin-listesi/`logSafeContext` projeksiyonuna çevrilir. Hangisi olursa `app-error.ts:107`'nin
*"PII içerebilir"* cümlesi onunla **hizalanmalı** ve **iki yönlü mutasyonla** kanıtlanmalı.
**Sorumlu ajan:** `architect` (politika) + `backend` (uygulama) · **Vade önerisi:** v0.0.17
(aynı dosyadaki `traceId` borcuyla birlikte)

**Borç satırı metni (`docs` kopyalayabilir):**

| SEV | Dosya:satır | Açıklama | Sorumlu ajan | Vade |
| --- | ----------- | -------- | ------------ | ---- |
| low | `packages/trpc/src/trpc.ts:101-106` · `packages/errors/src/redaction.ts:58-82` | `AppError.context` tRPC yolunda koşulsuz loglanıyor ama `app-error.ts:107` sözleşmesi *"PII içerebilir"* diyor; ölçüldü — redaction 22 yoldan yalnızca `*.` önekli **4**'ünü kapsıyor (`secret`/`apiKey`/`accessToken`/`refreshToken`/`cookie`/`authorization`/`verificationToken`/`resetToken` ve derinlik-3 **sızıyor**). Bugün ulaşılamaz; `trpc.ts:105`'in "ikinci savunma hattı" cümlesi gerçekten kapsadığından **geniş** | `architect` + `backend` | v0.0.17 |

**Diğer yeni yüzey adayları — denetlendi, bulgu YOK:**
`auth.guard.ts` / `packages/db/src/tenant-context.ts` diff **0 satır** · yeni env **yok** · yeni
bağımlılık **yok** (`*package.json` + `pnpm-lock.yaml` diff **BOŞ**) · reddedilen ham `userId`
artık `targetUserId` olarak loglanıyor ama **64 karakterle sınırlı** ve JSON kaçışlı (NUL NDJSON
satırını **bozmuyor** — testte `typeof` assert'i, pino'nun kaçışlaması) → log enjeksiyonu yok ·
`logAppError` her 4xx için bir satır yazdığı için log hacmi artıyor, ama bu düzeltmenin **amacı**;
kötüye kullanım yüzeyi tur 1'in **L4**'ünde (tRPC uçlarında oran sınırı yok) zaten kayıtlı,
önem derecesi değişmiyor.

⚠ `permission-procedure.ts:84`'teki terk edilmiş `errorContext` alan adını **bağımsız olarak
yeniden ürettim** (`rg errorContext` → bir kod kalıntısı). Brief gereği `solid`'in bulgularını
değerlendirmiyorum; **zaten `solid` tur 2'nin L-10'u olarak kayıtlı**, kendi bulgum olarak
tekrarlamıyorum.

---

## ÖLÇÜMLER

```
pnpm audit                 → critical 0 · high 1 (multer, geçişli, ULAŞILAMAZ) · moderate 1
                             (minimatch, yalnızca dev) · low 0 — tur 1'e göre DEĞİŞMEDİ
                             git diff --stat HEAD -- '*package.json' 'pnpm-lock.yaml' → BOŞ
İncelenen dosya            → 18 (FIX 1'in dokuz üretim dosyası + iki yeni test + ters çevrilen
                             assert bölgesi + log/redaction zinciri için dört dosya
                             [trpc-logger.adapter.ts, redaction.ts, root-logger.ts, app-error.ts]
                             + diff-0 teyidi: auth.guard.ts, tenant-context.ts)
                             ⚠ FIX 1 diff'i DIŞINDA tarama YAPILMADI (DAR tur)
Tenant izolasyon listesi   → KARŞILANMAYAN MADDE YOK.
                             FIX 1 iki maddeyi İYİLEŞTİRDİ: md 6 (girdiden gelen id'ye
                             güvenilmiyor — assertUserIdShape + TENANT_ID_PATTERN) ve
                             md 12 (geçersiz biçim artık ayrı bir yanıt üretmiyor → aynı 403/404).
                             md 13 (logda tenantId) M-1 ile GERÇEKTEN karşılandı.
                             md 14 (süper admin) hâlâ uygulanamaz — bu sürümde yüzey yok.
Koşturulan test            → 3 dosya / 22 test PASS
                             apps/api trpc-error-boundary-logging.test.ts     6/6  (gerçek HTTP+DB)
                             packages/trpc app-error-boundary-logging.test.ts 4/4
                             packages/trpc authz-consistency.test.ts        12/12
                             Type Errors: no errors
Kendi problarım            → desen baytı: 20 vaka  · GUC sınırı: 5 vaka (salt okuma)
                             redaction derinliği: 15 vaka (gerçek pino + gerçek yollar)
                             ham soket başlık: 4 vaka · zod e-posta: 10 vaka
                             iki kiracılı oracle: geri alınan transaction, net değişiklik SIFIR
Canlı veri teyidi          → tenant 1/24 char/%100 ^[a-z0-9]+$ · app_user 21469/24-32/%100
                             ^[A-Za-z0-9_-]+$ / >64 uzunlukta 0 satır · membership 4435/%100
KOŞTURULMAYAN (brief yasağı) → pnpm test · test:isolation · apps/api TAM süiti (solid paralel,
                             qa sonra TAM kapsamla gelecek)
```
