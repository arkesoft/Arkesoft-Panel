# T-007 — security gate, tur 2

- **Tarih:** 2026-10-30
- **Sürüm:** platform 0.0.5 → 0.0.6 (ROADMAP v0.0.6, tRPC sözleşme katmanı)
- **Gate:** security
- **Tur:** 2 (düzeltme turu sonrası doğrulama)
- **Kapsam:** düzeltmenin dokunduğu yüzey + tur 1 medium'u. Tur 1'de PASS verilen alanlar yeniden taranmadı.

```
GATE: security
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] apps/api/src/auth/sessions.controller.ts + apps/api/src/errors/app-exception.filter.ts — `GET /auth/sessions` hâlâ `Cache-Control` TAŞIMIYOR ve `Vary` başlığı HİÇ YOK (ÖLÇÜLDÜ: `cache-control: null`, `vary: null`, `etag: W/"b1-..."`, durum 200). Saldırı senaryosu (yöntem duyarlı RFC 9111 modeliyle ÖLÇÜLDÜ): API'nin önünde paylaşımlı bir önbellek (Cloudflare "Cache Everything", ters vekil, ingress) varsa bu yanıt §4.2.2 sezgisel tazelikle SAKLANABİLİR; `Vary` hiç olmadığı için önbellek anahtarında kimlik boyutu YOK → üye Ayşe'nin oturum listesi saklanır ve **aynı host'a gelen oturumsuz bir ziyaretçi aynı URL'yi isteyince saklanan 200'ü alır** (gerçek kimliksiz yanıt 401, ÖLÇÜLDÜ) → `AuthGuard` tamamen atlanır. Sızan içerik ÖLÇÜLDÜ: `[{"id":"ot9Ge…","createdAt":…,"updatedAt":…,"expiresAt":…,"isCurrent":true}]` — oturum satırı id'si + zaman damgaları + `isCurrent`. **CRITICAL DEĞİL, ölçülerek:** gövdedeki `id` (32 krk) çerezdeki ham oturum token'ına (32 krk) **EŞİT DEĞİL** ve token gövdede alt dize olarak da **YOK** → oturum çalma (hijack) mümkün değil; `revokeOwnSession` sahipliği doğruluyor (`row?.userId !== identity.userId` → 404, kaynak okundu) → sızan id başkasının oturumunu sonlandırmak için de kullanılamaz; gövdede `userId`/e-posta/IP/User-Agent/token **YOK** (hepsi ölçüldü). Bu yüzden `high` değil `medium`: kimlik bilgisi değeri olmayan, tek bir kullanıcının oturum meta verisi, ve ön koşul (kimlikli yanıtı saklayacak şekilde yapılandırılmış paylaşımlı önbellek) bu repoda `infra/`'da MEVCUT DEĞİL. Tur 1'de yapısal olarak AYNI sınıfı `/trpc` için `medium` vermiştim (orada DAHA FAZLA veri sızıyordu) — tutarlılık için aynı seviye. **SINIF ÖNCEDEN VAR** (v0.0.4/v0.0.5 borcu, tur 1'de ölçmüştüm) ve düzeltme ajanının dosya kümesinde `apps/api/src/auth/**` yoktu → bu alt görev borcu BÜYÜTMÜYOR; ama `/trpc`'nin düzeltme ÖNCESİ hâlinden bir adım KÖTÜ: orada en azından `Vary: trpc-accept, accept` vardı, burada `Vary` hiç yok (ikinci savunma katmanı sıfır). `/auth/*` + `/health/*` yüzeyinin TAMAMI tarandı (10 uç): `Cache-Control` taşıyan uç sayısı **0**; kimlikli-200-ve-yeniden-kullanılabilir **tek** uç `GET`/`HEAD /auth/sessions`. `POST` uçları (`sign-up/email`, `sign-in/email`, `sign-out`) RFC 9111 §4 gereği açık tazelik bilgisi olmadan yeniden kullanılamaz → `Set-Cookie` taşıyan `POST /auth/sign-out` sömürülebilir DEĞİL (ÖLÇÜLDÜ). Önerilen düzeltme: başlık yazımını `TrpcController`'dan çıkarıp tüm kimlikli yanıtları kapsayan global bir interceptor'a (veya `AppExceptionFilter` + controller ortak yoluna) taşımak; ek olarak `main.ts`'te `app.getHttpAdapter().getInstance().set('etag', false)` ve `disable('x-powered-by')`. — backend (+ devops: CDN/ingress önbellek kuralının kimlikli yanıt saklamadığının doğrulanması)
  - [SEV: low] apps/api/src/errors/app-exception.filter.ts:53-69 — Düzeltme YALNIZCA controller'a ULAŞAN yanıtlara uygulanıyor; guard zincirinin REDDETTİĞİ yanıtlar `AppExceptionFilter`'dan çıkıyor ve orada `Cache-Control`/`Vary` YAZILMIYOR (ÖLÇÜLDÜ: 401 `UNAUTHENTICATED`, 403 `TENANT_MEMBERSHIP_REQUIRED`, 403 `CROSS_SITE_REQUEST_REJECTED`, 404 `TENANT_NOT_FOUND` → dördünde de `cache-control: null`, `vary: null`, `etag` VAR). Bu dört durumdan üçü sömürülemez (401/403 RFC 9110 §15'te varsayılan önbelleklenebilir DEĞİL → ÖLÇÜLDÜ: saklanamaz); **yalnızca 404 saklanabilir** (sezgisel, §4.2.2). Senaryo: bir kiracı host'unda kiracı geçici olarak çözülemediği bir anda (provisioning penceresi, soft-delete, non-production'da `x-arkesoft-tenant` ile tetikleme) üretilen 404 paylaşımlı önbelleğe girer ve TTL boyunca o host'un `/trpc` yüzeyinin TAMAMI meşru üyelere de 404 döner (erişilebilirlik kaybı); ziyaretçi ayrıca BAŞKA bir isteğin `requestId`'sini (gövdede + `x-request-id` başlığında) alır. **Kiracı/kullanıcı verisi sızmıyor** (gövde jenerik `TENANT_NOT_FOUND`, ölçüldü) → `low`. Mekanik koruma tarafı: yeni iki test yalnızca **başarı yolunu** (iki prosedürün 200'ü) pinliyor; hata yolunu hiçbir test assert etmiyor. Önerilen düzeltme: başlıkları ortak interceptor'a taşıyınca bu dal kendiliğinden kapanır; testi de hata yoluna (401/403/404) genişletmek. — backend
  - [SEV: low] packages/trpc/src/trpc.ts:90-92 — Yeni `warn` log'u SIR/PII sızdırmıyor (aşağıda ölçüldü, temiz) ama **oran sınırsız bir yüzeyde koşulsuz log üretiyor**: `/trpc/*` oran sınırı YOK (tur 1'in 5. bulgusu) ve çerçeve kaynaklı her hata bir `warn` satırı doğuruyor (ÖLÇÜLDÜ: bilinmeyen prosedür / batched red / OPTIONS → her biri 1 satır, ~230 bayt). Senaryo: geçerli oturumu + tek bir kiracı üyeliği olan bir kullanıcı `GET /trpc/<rastgele>.<prosedür>` isteklerini sınırsız hızda yollar; her istek bir `warn` satırı üretir → log/Loki yutma hacmi ve maliyeti kimlikli tek bir hesap tarafından sürülebilir. Kimliksiz bir yüzey değil ve yanıtın kendisi düzeltme ÖNCESİ de üretiliyordu — **yeni olan maliyet log satırı**. Tur 1'in oran sınırı borcunun (vade v0.0.14) log-hacmi boyutu olarak kaydedilmesi yeterli. Önerilen düzeltme: v0.0.14'te `/trpc/*` kiracı+IP kovası; ayrıca bu dalda örnekleme (sampling) veya istek başına tek satır garantisi. — backend (vade: v0.0.14)
  - [SEV: low] apps/api/src/__tests__/rate-limit.test.ts — Oran sınırlama bir **güvenlik kontrolü**; regresyon ağı paylaşılan Redis durumuna BAĞIMLI ve bu yüzden güvenilmez. ÖLÇÜLDÜ: `FLUSHDB` sonrası dosya TEK BAŞINA **28/28 yeşil**; AYNI temiz Redis ile TÜM süit içinde koşturulduğunda **3 başarısız** ("expected 429, got 200" sınıfı); ardışık koşumlarda başarısız test KÜMESİ DEĞİŞİYOR (5 → 3 → 4, farklı testler) → akış içi (intra-run) çapraz dosya IP kovası birikimi. `create-test-app.ts`'in `platform:auth:*` flush'ı bu kovayı rate-limit.test.ts'in ihtiyaç duyduğu şekilde sıfırlamıyor. **Düzeltmeye ATFEDİLEMEZ, yapısal olarak:** `rate-limit.test.ts` içinde `/trpc` referansı **0** (ölçüldü) ve düzeltme yalnızca `TrpcController`'ın iki yanıt başlığı + tRPC errorFormatter'ın `warn`'ı. Kontrolün KENDİSİ sağlam (izole 28/28). Önerilen düzeltme: IP kovası anahtarını da flush kapsamına almak veya test başına benzersiz kaynak IP kullanmak. — qa / backend
ÖLÇÜMLER: (aşağıdaki "Ölçümler" bölümü)
```

---

## 1. Tur 1 saldırı senaryosu — YENİDEN KOŞTURULDU

Tur 1'de bildirdiğim medium'u varsayımla değil, **RFC 9111 uyumlu bir paylaşımlı önbellek benzetimiyle** yeniden kurdum. Benzetim §3 (saklanabilirlik), §4.1 (`Vary` eşleşmesi), §4.2.2 (sezgisel tazelik), §5.2.2.5 (`no-store`), §5.2.2.7 (`private`) ve RFC 9110 §15 (varsayılan önbelleklenebilir durum kodları) kurallarını uyguluyor. Üye yanıtı **gerçek** (mount edilmiş Nest uygulaması, gerçek Postgres, gerçek oturum + üyelik).

| Varyant                                                                        | Saklanabilir?                   | Kimliksiz ziyaretçi araması | Sonuç                                      |
| ------------------------------------------------------------------------------ | ------------------------------- | --------------------------- | ------------------------------------------ |
| **BUGÜN** (düzeltilmiş gerçek yanıt)                                           | **HAYIR** — `no-store` §5.2.2.5 | **MISS**                    | **Sızıntı YOK**                            |
| **DÜZELTME ÖNCESİ** (`cache-control` silinmiş, `Vary`'den `Cookie` çıkarılmış) | **EVET** — sezgisel, durum 200  | **HIT**                     | **SIZDI** — `tenantId` tele çıktı (`true`) |
| **SADECE `Vary`** (`no-store` yok, `Vary: …, Cookie` var)                      | EVET                            | **MISS**                    | Sızıntı yok — ikinci, bağımsız katman      |

Gerçek üye yanıtı (ölçülen başlıklar):

```
durum           200
cache-control   no-store, private
vary            trpc-accept, accept, Cookie
etag            W/"8f-pKoY2L60PfjWTWPfWoIvI9KsFGA"
content-type    application/json; charset=utf-8
```

Düzeltme öncesi dünyada önbellekten servis edilen gövde (birebir):

```json
{
  "result": {
    "data": {
      "id": "v2fcxe7pqx0a217k5s4c0643",
      "slug": "sec2-a-5afc1956-d",
      "name": "SEC2 Kiracı A",
      "status": "active",
      "primaryDomain": null
    }
  }
}
```

Kimliksiz ziyaretçinin **gerçek** (önbelleksiz) yanıtı `401 UNAUTHENTICATED` — yani önbellek isabeti guard zincirini gerçekten atlatıyordu.

**Sonuç: `no-store, private` tur 1 senaryosunu KAPATIYOR**, ve iki bağımsız katmanla kapatıyor. Yük taşıyan katman `no-store`'dur: `Vary: Cookie` tek başına da yetiyor ama pratikte zayıftır (birçok CDN `Vary`'yi sınırlı bir başlık kümesi dışında yok sayar) — `no-store` bu CDN davranışına bağımlı değil.

**Kalan artık risk (kod kusuru değil, yapılandırma):** Cloudflare'de "Cache Everything" + "Edge Cache TTL: override origin headers" gibi bir kural köken başlıklarını **bilerek** yok sayar. Bu katmanda yapılabilecek doğru şey yapıldı; CDN/ingress tarafının doğrulanması tur 1'de olduğu gibi **devops**'ta kalıyor.

---

## 2. `Vary` korunması — hata yolları dahil ÖLÇÜLDÜ

Soru: düzeltme yalnızca başarılı yanıtta mı uygulanıyor? **Cevap: hayır — "yalnızca başarılı" değil, "yalnızca controller'a ULAŞAN" yanıtlarda.** Ayrım önemli ve ölçüldü.

### 2.1 Controller'a ulaşan yanıtlar — başlıklar TAM, `Vary` KORUNMUŞ

| İstek                                  | Durum | `cache-control`     | `vary`                        | Saklanabilir? |
| -------------------------------------- | ----- | ------------------- | ----------------------------- | ------------- |
| `GET /trpc/tenant.current` (üye)       | 200   | `no-store, private` | `trpc-accept, accept, Cookie` | HAYIR         |
| `GET /trpc/session.me` (üye)           | 200   | `no-store, private` | `trpc-accept, accept, Cookie` | HAYIR         |
| **batched RED** (`?batch=1`, virgüllü) | 400   | `no-store, private` | `trpc-accept, accept, Cookie` | HAYIR         |
| **bilinmeyen prosedür**                | 404   | `no-store, private` | `trpc-accept, accept, Cookie` | HAYIR         |
| `OPTIONS /trpc/session.me`             | 405   | `no-store, private` | `trpc-accept, accept, Cookie` | HAYIR         |
| `HEAD /trpc/tenant.current`            | 204   | `no-store, private` | `Cookie`                      | HAYIR         |

→ tRPC'nin yazdığı `trpc-accept, accept` **hiçbir yolda ezilmedi**; `appendHeader` kararı doğru. `HEAD`'de tRPC kendi `vary`'sini yazmıyor, bizim append'imiz tek başına kalıyor (`Cookie`) — `no-store` yine mevcut, sorun değil.

### 2.2 Guard zincirinin reddettiği yanıtlar — başlık YOK (2. bulgu)

| İstek                        | Durum | `cache-control` | `vary` | `etag` | Saklanabilir?              |
| ---------------------------- | ----- | --------------- | ------ | ------ | -------------------------- |
| oturumsuz (var olan kiracı)  | 401   | **yok**         | yok    | VAR    | HAYIR — 401 sezgisel değil |
| üye değil (yabancı kiracı)   | 403   | **yok**         | yok    | VAR    | HAYIR — 403 sezgisel değil |
| `Sec-Fetch-Site: cross-site` | 403   | **yok**         | yok    | VAR    | HAYIR — 403 sezgisel değil |
| var olmayan kiracı           | 404   | **yok**         | yok    | VAR    | **EVET** — sezgisel §4.2.2 |
| kiracı başlığı yok           | 404   | **yok**         | yok    | VAR    | **EVET** — sezgisel §4.2.2 |

Bu yanıtlar `AppExceptionFilter`'dan çıkıyor (`app-exception.filter.ts:53-69` yalnızca `x-request-id` + `AppError.httpHeaders` yazıyor). Dört durumun üçü RFC gereği saklanamıyor; **404 saklanabiliyor** ama gövdesi jenerik (`{"code":"TENANT_NOT_FOUND","message":"errors.tenant.notFound","details":{},"requestId":…}`) — kiracı/kullanıcı verisi yok. → 2. bulgu, `low`.

**`Vary: Host` eksikliği bir bulgu DEĞİL (ölçülerek):** `x-arkesoft-tenant` başlığı yalnızca `NODE_ENV !== 'production'` iken onurlandırılıyor (`tenant-resolver.service.ts:139` + `resolve-host.ts:15`, Kullanıcı Onayı #1). Üretimde kiracı çözümü **Host**'tan geliyor ve Host, önbelleğin anahtarındaki etkin istek URI'sinin parçası → ayrı bir `Vary: Host` gerekmiyor. Kiracılar arası (çapraz-tenant) bir önbellek karışması bu yüzden **yapısal olarak** doğmuyor; tur 1'de de tur 2'de de ölçülen sızıntı sınıfı **çapraz-kullanıcı**, çapraz-kiracı değil.

---

## 3. `ETag`'in kalması kabul edilebilir mi?

**Düzeltme ajanının muhakemesi DOĞRU ve bağımsız olarak doğrulandı.** RFC 9111 §5.2.2.5: `no-store` taşıyan bir yanıtın hiçbir parçası saklanamaz. Koşullu doğrulama (`If-None-Match`) **saklanmış bir kopya** gerektirir; kopya yoksa `ETag`'in doğrulayıcı olarak kullanılması yapısal olarak imkânsız. Benzetim bunu teyit etti: `etag` yanıtta VARken saklanabilirlik kararı `no-store` nedeniyle `false`, kimliksiz arama `MISS`. `ETag`'in kendisi ayrıca bir sır taşımıyor (gövdenin zayıf hash'i) ve gövde zaten istek sahibine açık.

**Mekanik koruma var mı? — Kısmen, ve başarı yolunda yeterli.**

| Koruma                                                 | Durum                                                                                                                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Başlık yazımı tek çıkıştan geçiyor mu                  | **EVET** — `forwardTrpcWebResponse` controller'ın TEK çıkışı ve yazım KOŞULSUZ → yeni bir prosedür eklenince otomatik kapsanır (yapısal, teste bağlı değil)                        |
| `no-store`'un kaldırılması testi kırıyor mu            | **EVET** — `trpc-http.test.ts:279` ve `:306` `toBe('no-store, private')` **tam eşitlik** assert'i; satır silinirse veya değer zayıflatılırsa (ör. `max-age=…`) iki test de kırılır |
| tRPC'nin `vary` değerlerinin ezilmesi testi kırıyor mu | **EVET** — `:286-287` `trpc-accept` ve `accept`'i ayrı ayrı assert ediyor (`setHeader`'a dönülürse kırılır)                                                                        |
| Hata yolunu (401/403/404) pinleyen bir assert          | **HAYIR** → 2. bulgunun test tarafı                                                                                                                                                |
| `ETag`'i `no-store`'a BAĞLAYAN bir değişmezlik         | **HAYIR** — `ETag` hâlâ Express varsayılanı; `main.ts`'te (71 satır) `etag`/`x-powered-by` ayarı **yok** (ölçüldü)                                                                 |

**Değerlendirme:** `ETag`'in kalması **kabul edilebilir**, çünkü (a) bugün sömürülemez olduğu ölçüldü ve (b) `no-store`'u zayıflatan bir gelecek değişiklik iki tam-eşitlik assert'ini kırar — yani `ETag`'i yeniden sömürülebilir kılacak hareket sessizce geçemez. Yine de daha sağlam hâli `ETag`'i kaynakta kapatmaktır (`set('etag', false)`): o zaman koruma tek bir başlığın varlığına değil, doğrulayıcının yokluğuna dayanır. Bunu 1. bulgunun önerilen düzeltmesine ekledim; **ayrı bulgu yazmıyorum** (teorik risk için `critical`/`high` vermemek kuralının simetriği: mekanik koruma mevcutken ikinci bir bulgu şişirme olur).

---

## 4. Düzeltmenin dokunduğu yüzeyin denetimi

### 4.1 Başlık yazımı — enjeksiyon / `Vary` şişmesi / tekrar çağrı

| Kontrol                                      | Ölçüm                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ardışık 3 istek sonrası `Vary` şişiyor mu    | **HAYIR** — üç turda da birebir `trpc-accept, accept, Cookie`, **3 alan** (yanıt nesnesi her istekte yeni)                                                       |
| Yanıtta kaç `cache-control` başlığı          | **1**                                                                                                                                                            |
| Yanıtta kaç `vary` başlığı                   | **1** (`appendHeader` virgülle birleştiriyor, başlık tekrarlanmıyor)                                                                                             |
| İstemci kontrollü değer `Vary`'ye giriyor mu | **HAYIR** — `trpc-accept: application/jsonl` gönderildi, `vary` içinde `application/jsonl` **yok**                                                               |
| `Vary`/`Cache-Control` değerleri sabit mi    | **EVET** — ikisi de kaynakta literal (`'no-store, private'`, `'Cookie'`); istek verisi başlık değerine hiç karışmıyor → başlık enjeksiyonu (CRLF) yüzeyi **yok** |
| Yanıt başlık kümesi                          | `cache-control, connection, content-length, content-type, date, etag, vary, x-powered-by, x-request-id`                                                          |

`x-powered-by: Express` hâlâ yazılıyor (tur 1'de yan not olarak geçmiştim) — çerçeve parmak izi, yeni değil, bu alt görevin ürünü değil. `x-request-id` istemcinin gönderdiği değeri yansıtıyor ama değer `/^[A-Za-z0-9_-]{8,64}$/` ile doğrulanıyor → CRLF/log enjeksiyonu yok (v0.0.4 davranışı).

### 4.2 Yeni `warn` log'u — sır/PII taraması

`packages/trpc/src/trpc.ts:91` → `ctx.logger.warn('trpc.error-formatter.unparsable-cause', { requestId })`.

Çerçeve kaynaklı hata (bilinmeyen prosedür) ile dal **gerçekten tetiklendi** ve üretilen satırlar birebir okundu:

```json
{
  "level": "warn",
  "time": "2026-10-30T17:10:12.700Z",
  "service": "api",
  "version": "0.0.4",
  "requestId": "req-sec2-warn-1258a29183d54206bf52cb0322f36df3",
  "tenantId": "v2fcxe7pqx0a217k5s4c0643",
  "userId": "ZWsgx7ShxHBVuE6wUOwTzuUoIRv6Yj1b",
  "msg": "trpc.error-formatter.unparsable-cause"
}
```

| Kontrol                                                                                | Ölçüm                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Anahtar kümesi (3 satırın üçünde de aynı)                                              | `{level, msg, requestId, service, tenantId, time, userId, version}` — **8 alan, fazlası yok**          |
| `cause` parse başarısız olduğunda ham hata içeriği log'a giriyor mu                    | **HAYIR** — çağrı `error`/`error.cause`/`shape`'e **hiç dokunmuyor**, yalnızca `{ requestId }` geçiyor |
| Yığın izi (`stack`)                                                                    | **yok**                                                                                                |
| Yasak ANAHTAR eşleşmesi (`password`/`secret`/`token`/`cookie`/`stack`/`authorization`) | **0**                                                                                                  |
| Yasak DEĞER eşleşmesi (aynı liste, serileştirilmiş kayıt üzerinde)                     | **0**                                                                                                  |
| `msg` dinamik mi                                                                       | **HAYIR** — sabit literal, istek verisi içermiyor                                                      |

`tenantId`/`userId` çağrıdan DEĞİL, ALS'teki pino child logger bağlamından geliyor ve CLAUDE.md §4 log formatı bu iki alanı **zorunlu** kılıyor (opak kimlikler, PII değil). → **Sır/PII sızıntısı YOK.** Tek kayıt: oran sınırsız yüzeyde koşulsuz log üretimi → 3. bulgu (`low`).

### 4.3 Yeni testler sır basıyor mu

`trpc-http.test.ts`'e eklenen iki test (`:272-297`, `:299-312`): yalnızca `response.headers['cache-control']`, `vary` ve `typeof …['etag']` üzerinde assert yapıyor; `cookieHeader` **yalnızca** `.set('Cookie', …)` argümanı olarak kullanılıyor, hiçbir yerde loglanmıyor/assert edilmiyor; gövde hiç okunmuyor. Sır **yok**.

Sır taraması (tüm değişiklik yüzeyi): `git diff HEAD | grep -niE "(password|secret|api[_-]?key|token|BEGIN .*PRIVATE KEY)"` → tek eşleşme `@tokenizer/token@0.3.0` (lockfile paket adı). Takip edilmeyen yeni kaynak dosyalarda yalnızca AC7'nin **yasak alt dize listesi** eşleşti (`trpc-http.test.ts:166`, `session.router.ts:8`). Repoda sır **yok** — tur 1 ile birebir aynı.

---

## 5. `/auth/*` kalan açıklık — risk seviyesi ÖLÇÜLDÜ (1. bulgu)

Yüzeyin **tamamı** yöntem duyarlı modelle tarandı (10 uç). `Cache-Control` taşıyan uç sayısı: **0**.

| Uç                                         | Durum | `Set-Cookie` | Yeniden kullanılabilir?                        |
| ------------------------------------------ | ----- | ------------ | ---------------------------------------------- |
| `GET /auth/sessions` (kimlikli)            | 200   | yok          | **EVET** — sezgisel §4.2.2                     |
| `HEAD /auth/sessions` (kimlikli)           | 200   | yok          | **EVET** — sezgisel §4.2.2                     |
| `GET /auth/sessions` (oturumsuz)           | 401   | yok          | HAYIR — 401 sezgisel değil                     |
| `POST /auth/sign-up/email`                 | 200   | yok          | HAYIR — yöntem POST, açık tazelik yok (§4)     |
| `POST /auth/sign-in/email` (hatalı)        | 401   | yok          | HAYIR — yöntem POST                            |
| `POST /auth/sign-out`                      | 200   | **VAR**      | HAYIR — yöntem POST → **sömürülemez**          |
| `GET /auth/verify-email`                   | 400   | yok          | HAYIR — 400 sezgisel değil                     |
| `GET /auth/list-sessions` (allowlist dışı) | 404   | yok          | EVET — ama gövde jenerik `TENANT_NOT_FOUND`    |
| `GET /health`                              | 200   | yok          | EVET — kimliksiz uç, sızıntı yok               |
| `GET /health/ready`                        | 200   | yok          | EVET — kimliksiz uç (tur 1'de değerlendirildi) |

**İlk modelimde `POST` yanıtlarını `GET` gibi değerlendirmiştim ve `POST /auth/sign-out`'u "Set-Cookie taşıyan ve saklanabilir" olarak işaretlemiştim.** Modeli RFC 9111 §4'e (saklanan yanıtın yöntemi sunulan isteğin yöntemiyle eşleşmek zorunda; POST yanıtı açık tazelik bilgisi olmadan yeniden kullanılamaz) göre düzelttim ve yeniden ölçtüm → **sömürülebilir değil**. Bunu, ilk ölçümü raporlamamak için değil, **aşırı raporlamamak** için düzelttim; ham ilk ölçüm de bu dosyada kayıtlı.

**Sonuç:** kimlikli + `GET`/`HEAD` + yeniden kullanılabilir **tek** uç `GET /auth/sessions`. Sızan içerik kimlik bilgisi değeri taşımıyor (token değil, sahiplik doğrulanıyor, `userId`/e-posta/IP/UA yok) → **`medium`**. Ayrıntılı gerekçe ve `critical`/`high` olmama nedenleri 1. bulguda.

**KVKK notu:** sızan alan kümesi (`id`, üç zaman damgası, `isCurrent`) kişisel veri bakımından minimal; `GET /auth/sessions` gereğinden fazla veri **toplamıyor** (`SESSION_SUMMARY_SELECT` açık dört alan, `token`/`ipAddress`/`userAgent` bilinçli dışarıda). Yine de bir kullanıcının oturum meta verisinin üçüncü bir kişiye gösterilebilmesi KVKK açısından istenmeyen bir ifşadır — 1. bulgunun düzeltilmesi bunu kapatır.

**Yan gözlem (bulgu değil, v0.0.5 yüzeyi):** `POST /auth/sign-up/email` yanıt gövdesi Better Auth'tan OLDUĞU GİBİ geçiyor ve `{"token":null,"user":{…,"email":"…"}}` şeklinde bir **`token` alanı taşıyor**. Bugün `null` — yalnızca e-posta doğrulama zorunlu olduğu için. Doğrulama zorunluluğu bir gün kapatılırsa bu uç gövdesinde **ham oturum token'ı** döner. Önbellekle ilgisi yok (POST, yeniden kullanılamaz) ve yalnızca isteği yapana gider; `/auth` delegasyon borcu satırına not düşülmesi yeterli. — docs/backend (v0.0.14+)

---

## 6. Kök ölçümlerin doğrulanması

| Komut                 | Orkestratör | Benim ölçümüm                                                | Uyum                                       |
| --------------------- | ----------- | ------------------------------------------------------------ | ------------------------------------------ |
| `pnpm lint`           | 16/16       | **16/16 başarılı** (FULL TURBO)                              | ✅                                         |
| `pnpm typecheck`      | 16/16       | **16/16 başarılı** (FULL TURBO)                              | ✅                                         |
| `pnpm test`           | 561/561     | **558/561 — 3 BAŞARISIZ**                                    | ❌ (bkz. aşağı; düzeltmeye atfedilemez)    |
| `pnpm test:isolation` | 16/16       | **16/16** (db 14 + api 2)                                    | ✅                                         |
| `pnpm build`          | 12/12       | **12/12 başarılı**                                           | ✅                                         |
| `pnpm format:check`   | temiz       | **1 uyarı** — `.claude/workflow/reviews/T-007-solid-tur2.md` | ❌ (başka ajanın dosyası, ürün kodu değil) |

Alt toplamlar Orkestratör'ün sayılarıyla **birebir** uyuşuyor: `errors 48` + `trpc 25` (+ `Type Errors: no errors`) + `db 166` + `api 322` = **561**.

**`pnpm test` sapması:** 3 başarısızlık, hepsi `apps/api/src/__tests__/rate-limit.test.ts` içinde, "expected 429, got 200" sınıfı. Nedeni ölçülerek saptandı: paylaşılan Redis'teki IP oran sınırı kovasının akış içi çapraz dosya birikimi. `FLUSHDB` sonrası dosya **tek başına 28/28 yeşil**; aynı temiz Redis ile tüm süit içinde 3 başarısız; ardışık koşumlarda başarısız küme değişiyor (5 → 3 → 4). Orkestratör'ün "İLK koşum" notu bununla tutarlı: pristine durumda yeşil. **Düzeltmeye atfedilemez** (yapısal gerekçe 4. bulguda). → 4. bulgu, `low`, sahibi qa/backend.

**`format:check` sapması:** uyarı yalnızca `T-007-solid-tur2.md` için — **solid** ajanının tur 2 raporu, benim koşumum sırasında diske yazıldı. AGENT_BASELINE §5 gereği başka ajanın dosyasında `prettier --write` **çalıştırmadım**; teşhis `--check` ile yapıldı. Ürün kodu ve `.claude` dışı hiçbir dosya biçim dışı değil.

**Koşum sırasında taban çizgisi kaydı:** ölçümlerim sürerken ağaca iki yeni dosya düştü (`.claude/workflow/reviews/T-007-solid-tur2.md`, `apps/api/src/__tests__/trpc-full-chain-domain-error.test.ts` — qa tur 2 eklemesi). Yeni test dosyasını taradım: sır deseni **0**, `cache-control`/`vary` assert'i **yok** (mekanik koruma tablosunu değiştirmiyor).

---

## 7. Ölçümler

| Ölçüm                                            | Değer                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm audit`                                     | **kritik 0 · high 1 · orta 0 · düşük 0** — tek bulgu `multer >=2.0.0 <2.5.0` (GHSA-q7qp-rjg7-q26m, 4 yol, `@nestjs/platform-express` geçişlisi). **Tur 1 ve v0.0.5 taban çizgisiyle birebir aynı; yeni zafiyet YOK, artış YOK**                                                                                                                                    |
| İncelenen dosya sayısı                           | **14** — `trpc.controller.ts`, `packages/trpc/src/trpc.ts`, `trpc-http.test.ts`, `app-exception.filter.ts`, `sessions.service.ts`, `sessions.controller.ts` (kısmi), `auth-delegated-paths.ts`, `auth-own-paths.ts`, `trpc-logger.adapter.ts`, `trpc-context.types.ts`, `create-test-app.ts`, `auth-fixture.ts`, `main.ts`, `trpc-full-chain-domain-error.test.ts` |
| Paylaşımlı önbellek benzetimi                    | **3 varyant** (bugün / düzeltme öncesi / sadece-`Vary`) × gerçek üye yanıtı → bugün **MISS**, düzeltme öncesi **HIT + `tenantId` sızdı**, sadece-`Vary` **MISS**                                                                                                                                                                                                   |
| Önbellek başlığı ölçülen uç sayısı               | **20** — 10 `/trpc` varyantı (200 ×2, 400 batched, 404 ×3, 403 ×2, 405, 204 HEAD) + 10 `/auth` & `/health` ucu                                                                                                                                                                                                                                                     |
| Düzeltmenin kapsadığı yanıt oranı (`/trpc`)      | **6/6** controller'a ulaşan yanıt (200/400/404/405/204 dahil) — başarı yoluna sınırlı DEĞİL; **0/5** guard-reddi yanıtı                                                                                                                                                                                                                                            |
| Hata yolunda saklanabilir yanıt                  | **2/5** (iki 404 varyantı) — ikisinin de gövdesi jenerik, kiracı/kullanıcı verisi **yok**                                                                                                                                                                                                                                                                          |
| `Vary` korunması                                 | tRPC'nin `trpc-accept, accept` değeri **6/6 controller yanıtında EZİLMEDİ**; 3 ardışık istekte alan sayısı sabit **3** (şişme yok); istemci kontrollü değer `Vary`'ye **girmedi**                                                                                                                                                                                  |
| `/auth/*` yüzeyi                                 | **10 uç** tarandı · `Cache-Control` taşıyan **0** · kimlikli-200-ve-yeniden-kullanılabilir **1** (`GET`/`HEAD /auth/sessions`) · `Set-Cookie` taşıyan ve yeniden kullanılabilir **0**                                                                                                                                                                              |
| Oturum id'si = token mı                          | **HAYIR** — gövdedeki `id` (32 krk) ≠ çerez token'ı (32 krk); token gövdede alt dize olarak da **yok**; `revokeOwnSession` sahipliği doğruluyor → hijack ve çapraz iptal **imkânsız**                                                                                                                                                                              |
| Yeni `warn` log'u                                | **3 satır** yakalandı · anahtar kümesi **8 alan**, fazlası yok · ham hata/`cause`/yığın izi **0** · yasak anahtar eşleşmesi **0** · yasak değer eşleşmesi **0** · `msg` sabit literal                                                                                                                                                                              |
| Yeni testlerin sır taraması                      | `trpc-http.test.ts` +2 test: gövde okunmuyor, çerez loglanmıyor, assert'ler yalnızca başlık üzerinde → sır **yok**                                                                                                                                                                                                                                                 |
| Sır taraması (tüm diff)                          | `git diff HEAD \| grep -niE "(password\|secret\|api[_-]?key\|token\|BEGIN .*PRIVATE KEY)"` → **1** eşleşme, `@tokenizer/token@0.3.0` (lockfile paket adı). Yeni kaynak dosyalarda yalnızca AC7 yasak-alt-dize listesi. Repoda sır **yok**                                                                                                                          |
| Mekanik koruma (`no-store`)                      | **VAR** — 2 tam-eşitlik assert'i (`toBe('no-store, private')`) + yapısal tek-çıkış garantisi; **hata yolunu** pinleyen assert **yok**                                                                                                                                                                                                                              |
| Kök gate'ler                                     | `lint 16/16` ✅ · `typecheck 16/16` ✅ · `test:isolation 16/16` ✅ · `build 12/12` ✅ · `test 558/561` ❌ (3× `rate-limit.test.ts`, paylaşılan Redis durumu — düzeltmeye atfedilemez) · `format:check` 1 uyarı (başka ajanın `.md`'si)                                                                                                                             |
| Tenant izolasyon listesinden karşılanmayan madde | **madde 9** (önbellek anahtarı tenant/kimlik kapsamlı) — `/trpc` için **KARŞILANDI** (tur 1'in tek medium'u kapandı); `/auth/sessions` için **HÂLÂ KARŞILANMADI** → 1. bulgu. Diğer 13 madde tur 1'de denetlendi, bu düzeltme hiçbirinin durumunu değiştirmiyor (başlık yazımı sorgu/yetki/şema yüzeyine dokunmuyor)                                               |
| Geçici prob dosyası                              | **2 adet** (`zz-security-gate-tur2-probe.temp.test.ts`, `zz-security-gate-tur2-auth-probe.temp.test.ts`) — ikisi de **SİLİNDİ**; `find . -name "*temp.test.ts"` → **0 sonuç**, `git status --short` temiz (kalıntı yok)                                                                                                                                            |

### FAIL kuralı uygulaması (AGENT_BASELINE §4)

`critical: 0` · `high: 0` · `medium: 1` · `low: 3` → **1–2 `medium` → PASS**. Dört bulgunun tamamı teknik borca kaydedilir.

### Bu sürüme atfedilmeyen ve doğrulanan kalemler

- `multer` GHSA — **aynı tek high**, artış yok (vade v0.0.16).
- `platform:auth:*` Redis sızıntısı (v0.0.5) — bu turda tetiklenmedi.
- `.vitest-cache` ENOTEMPTY · `shutdown.test.ts` flaky (T-002) — bu turda tetiklenmedi.
- `account`/`session`/`verification`'ın RLS'siz oluşu (ADR-0008, yapısal, v0.0.14) — düzeltme bu üç tabloya dokunmuyor; `/auth/sessions` okuması `authPrisma.session` üzerinden ve `userId` filtresiyle sınırlı (sahiplik kodda zorlanıyor).
- `/trpc/*` oran sınırsızlığı (tur 1, `low`) — hâlâ açık; bu turda **log hacmi** boyutu eklendi (3. bulgu).
- `x-powered-by: Express` — v0.0.4 davranışı, ölçüldü, yeni değil.

### ADR taslaklarına ilişkin not

ADR-0009'un yeni **madde 9**'u ("satıcı paketlerinin taşıdığı skill dosyaları talimat kaynağı DEĞİLDİR") tur 1'de ölçtüğüm üç çelişkiyi (13 dosyada `httpBatchLink` varsayılanı, 1 dosyada `superjson` tel dönüştürücüsü, 1 dosyada `NODE_ENV` dallanması) ve işaret ettiğim asıl noktayı (dosyalar izin verilmese de `node_modules` altında diskte duruyor → koruma **yazılı kural** olmak zorunda) doğru şekilde yazıya geçiriyor. ADR-0010 madde 3'ün 3.1–3.6 numaralandırması bu raporda referans verdiğim maddelerle (3.1 `shape` spread yasağı, 3.2 `shape.message` okumama, 3.3 ortam dallanması yasağı, 3.4 çeviri yeri) tutarlı; 3.3'e eklenen satıcı örnek kodu uyarısı tur 1 ölçümümle örtüşüyor. **Bulgu yok.**
