# T-014 — `solid` gate · Tur 2 (**DAR** — yalnızca M-1'in kapanışı)

Tarih: 2026-11-04 · Sürüm: ROADMAP **v0.0.14** · Dal: `chore/ajan-altyapisi`

```
GATE: solid
SONUÇ: PASS
```

FAIL kuralı (AGENT_BASELINE §4): `critical` 0 · `high` 0 · `medium` **0** · `low` **1**
→ yalnızca `low` = **PASS**, borca. **Düzeltme turu açmıyorum.**

Kapsam: FIX 1'in değiştirdiği dosyalar. **Yeni tarama yok.** M-2 (`security`), FIX 1b
(`devops`) ve tur 1'in dokuz `low`'u **değerlendirilmedi** (brief gereği).

---

## (a) M-1 KAPANDI MI — NET CEVAP

> **M-1 KAPANDI.** Üç yarısının üçü de kaynakta doğrulandı: (1) kayıt **gerçekten yazılıyor**
> (`trpc.ts:117-131` + `:272`), (2) yanlış cümleler **beş dosyada** düzeltildi, (3)
> `targetUserId` ayrımı **uygulandı** (`tenant-membership-required.error.ts:52`,
> `member.service.ts:121`). ⚠ **Tek kalıntı:** düzeltilen cümlelerden **birinde** alan adı
> **terk edilmiş** `errorContext` olarak kalmış (`permission-procedure.ts:84`) → **L-10**,
> `low`. Mekanizma doğru, tel sözleşmesi değişmemiş, kardeş dosyalar doğru adı yazıyor.

| Yarı | Kanıt (okunarak) | Sonuç |
| ---- | ---------------- | ----- |
| Kaydın yazılması | `trpc.ts:117-131` `logAppError` · `:125` eşik `>= 500` → `error`, aksi `warn` · `:272` `isAppError` dalından, `toTrpcError`'dan **önce** | ✅ |
| Dört dosyadaki yanlış cümle | `permission-denied.error.ts:30-41` · `owner-membership-protected.error.ts:31-35` · `invitation-resend-too-soon.error.ts:25-27` · `pending-invitation-limit-reached.error.ts:26-28` — dördü de `logAppError`'a atıf veriyor, seviyeyi (`warn`) ve `context` nestelemesini doğru yazıyor | ✅ |
| `permission-procedure.ts`'in cümlesi | `:75-87` yeniden yazıldı, kaydı yazan yeri (`../trpc.ts` → `logAppError`) ve seviyeyi doğru söylüyor — ⚠ **ama `:84`'te alan adı `errorContext`** | ⚠ **L-10** |
| `targetUserId` (`security`'nin yarısı) | `tenant-membership-required.error.ts:44` kapalı birleşim `'actor' \| 'target'` · `:47` varsayılan `'actor'` · `:52` üçlü ifade · `member.service.ts:121` açıkça `'target'` · `auth.guard.ts:116` ve `membership-read.port.adapter.ts:50` **iki argümanla** → davranış birebir korundu | ✅ |

⚠ `membership-read.port.adapter.ts:50`'yi ayrıca kontrol ettim: `permissionProcedure`'ün
okuduğu yol **aktörü** reddediyor → varsayılan `'actor'` **doğru özne**. Ayrım yanlış tarafa
uygulanmamış.

---

## (b) Kayıt SINIRDA ve TEK Mİ — evet, dört halka tek tek okundu

| Halka | Kaynak | Kayıt yazar mı |
| ----- | ------ | -------------- |
| `appErrorBoundary` | `trpc.ts:261-277`, `:272` | **Evet — tek yer** |
| `errorFormatter`, parse-EDİLEBİLİR dal | `trpc.ts:163-173` | Hayır (yalnızca `return`) |
| `onError` (`handleTrpcError`) | `create-trpc-request-handler.ts:84-86` | **Hayır — erken dönüş KORUNDU** |
| Nest `AppExceptionFilter` | `error-mapping.ts` (REST yolu) | Bu yolda hiç tetiklenmiyor |

**Teklik yapısal:** `appErrorBoundary` `base`'e **tek kez** bağlanıyor (`trpc.ts:310`) ve
merdivenin beş basamağının tamamı `base`'den türüyor (`:322,346,349,352` +
`permission-procedure.ts:41` `tenantProcedure` üzerinden) → zincire **iki kez** girmesi
mümkün değil. Batching kapalı (`create-trpc-request-handler.ts:103`) → bir HTTP isteği tek
prosedür. **İkinci kayıt yolu yok** ve testi var (`app-error-boundary-logging.test.ts:128`).

⚠ `onError`'ın erken dönüşünün **gerekçesi** de düzeltilmiş
(`create-trpc-request-handler.ts:45-53`): eski metin dalın atlanmasını haklı çıkarıyordu ama
**başka hiçbir halkanın loglamadığını** söylemiyordu; yeni metin bunu yazıyor. Bu, tur 1'de
raporladığım *"beyan ≠ gerçeklik"* sınıfının doğru kapanışı.

## (c) `context` NESTELEME kararı — GEÇERLİ, daha iyi alternatif yok

`trpc.ts:122` `context: appError.context` (spread değil). Fail-closed gerekçe **tutuyor**:
`AppError.context` tipi `Record<string, unknown>` (`app-error.ts:84`, varsayılanı `{}` —
`:130`), yani **hangi anahtarların geleceği sınırda bilinemez**; spread edilse bir hata
sınıfının `userId`/`tenantId` anahtarı child logger'ın bağladığı üst seviye alanı
**gölgeleyebilirdi** (`targetUserId` ayrımının var olma sebebi tam bu sınıf).

**Alternatifler ölçüldü:**

- _Allowlist/şema ile süzmek:_ `packages/trpc`'nin **her domain hatasının context şeklini
  bilmesini** gerektirirdi → `apps/api` → `packages/trpc` bağımlılık yönünün **tersi**
  (CLAUDE.md §3). **Daha kötü.**
- _Üst seviyeye ön ekli spread (`ctx_*`):_ aynı korumayı verir ama REST yolundaki
  `logContext` ile **alan adı paritesini bozar** (bkz. (d)). **Daha kötü.**
- Nesteleme, sınırın **jenerik** kalmasını sağlayan tek seçenek. ⚠ `AppError.context` her
  zaman nesne olduğu için `undefined` anahtar yazılması riski de **yok**.

## (d) Alan adı hizalaması — İDDİA TUTUYOR, karar DRY lehine

`apps/api/src/errors/error-mapping.ts:73` **açıldı ve birebir teyit edildi**:

```ts
const logContext = { code: error.code, isRetryable: error.isRetryable, context: error.context }
```

→ REST yolu **aynı üç alanı aynı adlarla** zaten yazıyor. `trpc.ts:118-123` bunu üçte üç
tutuyor ve yalnızca `httpStatus`'ü **ekliyor** (seviye seçiminin girdisi, kaydı tek başına
okunabilir yapıyor). İkinci bir ad (`errorContext`) operatör sorgularını iki adı bilmeye
zorlardı → **hizalama doğru karar**, `trpc.ts:107-113`'teki gerekçesi gerçeği yansıtıyor.

## (e) `member-invite-flow.test.ts:561-585` — SIKILAŞTIRILDI

Ölçüm (T-013'te `qa`'nın kullandığı yöntemle, assert sayısı):

| | Eski | Yeni |
| - | ---- | ---- |
| Assert | **1** — `toEqual([])` (*"hiç kayıt yok"*) | **6** — `toHaveLength(1)` · `level==='error'` · `msg==='trpc.error-boundary.app-error'` · `httpStatus===503` · `isRetryable===true` · hiçbir kayıtta e-posta yok |
| İddia | **yokluk** | **varlık + içerik + seviye + hijyen** |

`:559` *"tel gövdesi `isRetryable` taşımaz"* assert'i **duruyor** → log ile telin
bağımsızlığı aynı testte ölçülüyor. **Gevşetme değil; yokluk assert'inin tersine
çevrilmesi.** Tur 1'de raporlanan kusurun ta kendisi olan satır artık kapanışın tanığı.

## (f) Düzeltme yeni kalite kusuru getirdi mi — L-10 dışında hayır

- `any`/`@ts-ignore`/`@ts-expect-error`/daraltan `as`: FIX 1'in altı dosyasında **0**
  (grep ile ölçüldü).
- Katman: `packages/trpc` yalnızca **enjekte edilmiş** `TrpcLoggerPort`'u kullanıyor
  (`trpc-context.types.ts:52-55`) — somut logger'a, `pino`'ya, `apps/api`'ye bağımlılık
  yok. `console.log` yok. Sabitler `index.ts`/`server.ts`'ten **export edilmiyor**
  (`trpc.ts:52-55` gerekçeli: log olay adı semver yüzeyi değil).
- SRP: `logAppError` **15 satır**, tek sorumluluk (seviye seçimi + alan kümesi);
  `toTrpcError`'dan **ayrı** → çeviri ve gözlemlenebilirlik birbirine karışmıyor.
  Sihirli sayı yok (`SERVER_ERROR_STATUS_THRESHOLD`).
- İsimlendirme: `APP_ERROR_LOG_EVENT`/`SERVER_ERROR_STATUS_THRESHOLD`
  SCREAMING_SNAKE_CASE · `MembershipRejectionSubject` PascalCase · dosya adları
  kebab-case · belirsiz ad (`data`/`temp`/`handle`) yok.
- Boolean bayrak yığını yok: `MembershipRejectionSubject` **kapalı birleşim**
  (`'actor' | 'target'`), `isTarget: boolean` **değil** → CLAUDE.md §4 ile uyumlu.
- Test kalitesi (`app-error-boundary-logging.test.ts`): davranış ölçüyor, implementasyonu
  yansılamıyor; **dört senaryonun üçü mutlu yol dışı**; `:128`/`:182` **çifte kayıt yok**
  karşıt tanığı; `:185-193` **vacuity** kontrolü; `:109-114` anahtar kümesi **ham nesne**
  üzerinde (`z.object`'in anahtar düşürmesi tuzağı yazılı olarak kapatılmış); `:124-125`
  nestelemeyi **iki yönde** ölçüyor. **Bulgu yok.**
- Olay adı literalinin iki test dosyasına kopyalanması (`:25`, `:71`) **tur 1'in L-6
  sınıfı DEĞİL:** L-6'daki Redis anahtar uzayı değişirse flush **sessizce** hiçbir şey
  temizliyordu; burada ad değişirse testler **gürültülü** kırılır (fail-loud) ve export
  etmemenin gerekçesi yazılı. **Bulgu değil.**

---

## BULGULAR

### [SEV: low] L-10 · Düzeltilen cümle TERK EDİLMİŞ alan adını yazıyor (`errorContext`)

**Yer:** `packages/trpc/src/authz/permission-procedure.ts:84`

**Ne:** M-1'in ikinci yarısı olarak **yeniden yazılan** cümle *"izin adı ve rol
`errorContext` alanının altında görünür"* diyor. Gerçek alan adı **`context`**
(`trpc.ts:122`). `errorContext`, `backend`'in kendi ölçümüyle **terk ettiği** ilk taslak
adıdır (`trpc.ts:110` bu terk edişi yazılı olarak anlatıyor).

**Ölçüm:** `rg errorContext` → repoda **iki** kod eşleşmesi: `trpc.ts:110` (terk edildiğini
**anlatan** yorum, doğru) ve `permission-procedure.ts:84` (adı **kullanan** yorum, yanlış).
Kardeş dört hata sınıfı doğru adı yazıyor (`permission-denied.error.ts:38`,
`owner-membership-protected.error.ts:35`, `pending-invitation-limit-reached.error.ts:28`,
`invitation-resend-too-soon.error.ts:27`) → **aynı olgunun iki ifadesi çelişiyor.**

**Neden kusur:** tur 1'in M-1'i *"beyan ≠ gerçeklik"* kusuruydu; bu satır o kusurun **aynı
sınıfından** bir kalıntı. Bu dosyayı okuyup `errorContext` sorgusu yazan operatör **sıfır
kayıt** bulur. ⚠ `medium` **değil**, çünkü mekanizmanın kendisi doğru, tel sözleşmesi
değişmemiş, ve doğru ad aynı olgu için **dört ayrı dosyada** yazılı → tur 1'de aynı sınıfı
(`L-1` olmayan test dosyası atfı, `L-8`/`L-9` bayat sayılar) `low` olarak derecelendirmiştim;
tutarlılık bunu gerektiriyor.

**Yön:** `:84`'te `errorContext` → `context` (tek kelime). Bu dosyaya yapılacak ilk
düzenlemede kapatılabilir.

**Sorumlu:** `backend` · **vade:** v0.0.15

---

## BORÇ SATIRI (`docs` kopyalayabilir)

| SEV | Dosya:satır | Açıklama | Sorumlu ajan | Vade |
| --- | ----------- | -------- | ------------ | ---- |
| low | `packages/trpc/src/authz/permission-procedure.ts:84` | M-1 için düzeltilen cümle, `backend`'in **terk ettiği** `errorContext` alan adını yazıyor; gerçek ad `context` (`trpc.ts:122`) — kardeş dört hata sınıfı doğru yazıyor, aynı olgunun iki ifadesi çelişiyor | `backend` | v0.0.15 |

---

## ÖLÇÜMLER

| Ölçüm | Değer |
| ----- | ----- |
| İncelenen dosya (bu tur) | **13** (tam okuma 6 · hedefli okuma/`rg` 7) — hepsi FIX 1'in kapsamında |
| `any` / `@ts-ignore` / daraltan `as` | **0 / 0 / 0** (FIX 1'in altı dosyası, grep ile) |
| En büyük fonksiyon (FIX 1) | `logAppError` — **15 satır** (`trpc.ts:117-131`); `handleTrpcError` **16 satır** |
| Kayıt yazan halka sayısı | **1 / 4** (teklik yapısal: `base`'e tek bağlanma + batching kapalı) |
| `errorContext` kalıntısı | **1** (`permission-procedure.ts:84`) |
| Katman ihlali / döngüsel bağımlılık (FIX 1) | **0 / 0** — `packages/trpc` yalnızca `TrpcLoggerPort` üzerinden loglar |
| Çalıştırılan komut | **YOK** — `Bash` izni verilmedi |

## ⚠ DOĞRULAYAMADIKLARIM (§5)

1. **Hiçbir komut koşturulmadı** (`Bash` yok). AC8 (`test` 1251, `lint`/`typecheck` 21/21,
   `build` 13/13), **sekiz mutasyonun kırmızı olması**, **md5 bayt karşılaştırması**
   (`ff495fa6…`) ve ölçülen NDJSON kaydı → **`backend`'in raporundan** alınmıştır, benim
   ölçümüm **değildir**. Yargım **yalnızca** kaynak okuma + `rg` üzerine kuruludur.
2. `trpc-error-boundary-logging.test.ts`'in **yalnızca ilk 80 satırını** okudum (başlık +
   sabitler + import'lar); altı vakanın gövdelerini **okumadım** → o dosyada bulgu
   olmadığını iddia etmiyorum. Dört vakası okunan `app-error-boundary-logging.test.ts`
   **tam** değerlendirildi.
3. `error-mapping.ts`'in yalnızca `:40-99` aralığını okudum (`:73` iddiası için yeterli).
4. **M-2, FIX 1b ve tur 1'in dokuz `low`'u değerlendirilmedi** (brief gereği kapsam dışı).
