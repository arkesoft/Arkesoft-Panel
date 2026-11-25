# T-028 — `solid` gate raporu, tur 2 (TAM yeniden denetim)

Tarih: 2026-11-24 · Sürüm: ROADMAP **v0.0.17** (platform `0.12.0 → 0.13.0`)
Task: `.claude/workflow/tasks/T-028.md` · Önceki tur: `T-028-solid-tur1.md` (FAIL — 2 high / 2 medium / 3 low)

```
GATE: solid
SONUÇ: PASS
```

FAIL kuralı (AGENT_BASELINE §4): `critical`/`high` **yok**, `medium` **2** (eşik ≥3) ⇒ **PASS**.
İki `medium` + yedi `low` teknik borca kaydedilir; **düzeltme turu açılmaz**.

---

## 1. Tur 1'deki yedi bulgunun akıbeti

| Tur 1 bulgusu                                                | Durum                     | Doğrulama (bu turda ölçüldü)                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **high-1** `sentry.ts:155` — `trace_id` ikinci kaynağı       | ⭐ **KAPANDI**            | `grep getCurrentTraceId` ⇒ `sentry.ts`'te **0 çağrı** (yalnızca :194/:198 tarihçe yorumu). `traceId` artık `CaptureAppErrorInput`'un **zorunlu** alanı (`sentry.ts:214`), tek çağıran `app-exception.filter.ts:149`. Davranışsal pin **iki** dosyada: `app-exception-filter-log-level.test.ts:331` + `sentry-invariants.test.ts:434` — ikisi de **birebir eşitlik** ister (eski `typeof === 'string'` gevşekliği :427-433'te açıkça kaldırılmış). |
| **high-2** 3 tautoloji + 2 yanlış yorum                      | ⭐ **KAPANDI** (seçenek A) | `toBeGreaterThanOrEqual(0)` deseni `observability-runtime-contract.test.ts`'te **kalmadı** (yalnızca :388/:391/:715 "silindi" gerekçe yorumu); yerine `expect(httpSpans.length).toBeGreaterThan(0)` (:385) ve `expect(preloadSpanCount).toBeGreaterThan(0)` (:730). Yanlış iki yorum bloğu düzeltilmiş (`trpc.ts:150-162` ölçümle tersine çevrilmiş). |
| **medium-1** `error-mapping.ts:86` redaksiyon yok            | ⭐ **KAPANDI**            | `error-mapping.ts:99` → `context: redactDeep(error.context)`; REST/tRPC asimetrisi kapandı. Pin: `error-mapping.test.ts:175-178` (derinlik-2 sır + pozitif kontrol).                                                                                                                             |
| **medium-2** `shutdown-order.test.ts:50` gevşek pin          | ⭐ **KAPANDI**            | Deferred-promise pini **gerçekten** tamamlanma sırasını ölçüyor: `:85-86` mikro görev turundan sonra `expect(shutdownSentry).not.toHaveBeenCalled()`. `Promise.all`/`void …; await …` mutasyonları bu pencerede kırılır.                                                                        |
| **low-1** `trpc.ts` bayat yorum                              | ⭐ **KAPANDI**            | `trpc.ts:150-162` — beş hata sınıfının `logLevel: 'error'`'ı **açıkça** beyan ettiği dosya:satır kanıtıyla düzeltilmiş; kod değişmemiş.                                                                                                                                                         |
| **low-2** `trace-attributes.ts` olmayan mekanizma beyanı     | ⚠ **AÇIK — borç**        | `docs`, v0.18.0. ⭐ Bu turda **aynı dosyada ikinci örnek** ölçüldü (aşağıda `low-6`).                                                                                                                                                                                                            |
| **low-3** `redactDeep` imza + DAG `[circular]`               | ⚠ **AÇIK — borç**        | `backend`'in ölçülmüş gerekçesiyle **bilinçli** erteleme (G8 bağımsız refactor ekseni), v0.18.0. ⭐ **FAIL gerekçesi yapılmadı** (aşağıda `low-7`).                                                                                                                                             |

---

## 2. Bulgular

```
BULGULAR:
  - [SEV: medium] packages/errors/src/redaction.ts:273-274 — "GİRDİYİ MUTASYONA UĞRATMAZ" değişmezi ÜÇ dosyada taşıyıcı olarak beyan ediliyor ama SIFIR testi var; dahası sentry-invariants.test.ts:494 bu değişmez kırılsa bile YEŞİL kalır — beklenen değeri captureAppError KOŞTUKTAN SONRA aynı nesneden hesaplıyor (mutasyonlanmış-ile-mutasyonlanmış karşılaştırması). — redactDeep'in girdisini derinlemesine değiştirmediğini pinleyen bir test ekle (iç içe sır taşıyan nesnenin structuredClone kopyasıyla çağrı öncesi/sonrası toEqual'i); sentry-invariants.test.ts:494'te beklenen değeri çağrıdan ÖNCE hesapla. — backend
  - [SEV: medium] apps/api/src/__tests__/sentry-invariants.test.ts:576-638 — critical dataCollection düzeltmesinin TEK davranışsal kanıtı olan describe (4), Sentry'nin istek-verisi hattının GERÇEKTEN koştuğuna dair test-içi pozitif kontrol taşımıyor; tek boşa-çıkmama koruması (:627) yalnızca "bir event zarfı üretildi"yi kanıtlar, çerez/başlık EKLENMESİNİN çalıştığını kanıtlamaz. Bu sessiz-vakum riski aynı dosyanın kendi başlığında (:555-573) gövde kanalı için ÖLÇÜLMÜŞ olarak kayıtlı; kanıt ise yalnızca yorumda duran, CI'ın tekrarlamadığı elle `node -e` koşumu (:551-553). — Zarfta istek-verisi hattının tetiklendiğini test-içi doğrula (ör. payload.request?.method === 'POST' / url varlığı — bunlar httpHeaders:false + cookies:false altında da hayatta kalır), böylece hat kopunca test KIRMIZI olur. — backend
  - [SEV: low] packages/errors/src/redaction.ts:206-208 — bayat yorum: türetimin "28 girdiyle BİREBİR aynı kümeyi üretir" dediği yerde bu turun +11 adıyla liste 39 girdiye çıktı ve artık KESİN SÜPERKÜME; testin kendisi (:278 başlık, :321-323) zaten "süperküme" diyor. Gelecek bir bakımcı "pino yolları değişmedi" sonucuna yanlış varabilir. — "28 girdilik tarihî anlık görüntünün süperkümesi" ifadesine çevir, donmuş sayıyı kaldır. — backend
  - [SEV: low] apps/api/src/observability/sentry.ts:170-171 — satır içi yorum SDK varsayılan polaritesini "(opt-out DEĞİL, opt-in)" diye yazıyor; bu, aynı dosyanın ÖLÇÜLMÜŞ başlık bulgusunun (:59-60 "SDK varsayılanı opt-out'tur, opt-in DEĞİL") ve düzeltmenin gerekçesinin TAM TERSİ. Yorumu olduğu gibi okuyan biri "verilmeyen alanlar güvenli" sonucuna varır. — İfadeyi :59-60 ile hizala. — backend
  - [SEV: low] apps/api/src/__tests__/observability-shutdown-order.test.ts:41-43 — yorum, iki `it`'in "AYNI mock'u PAYLAŞMAZ" ve "`beforeEach` benzeri bir sıfırlama gerektirmeyecek" olduğunu söylüyor; ikisi de yanlış — `vi.mock` modül seviyesinde TEK mock örneği üretir ve dosya tam bu yüzden :63-67'de afterEach ile callOrder'ı, deferred tutamacını ve vi.clearAllMocks()'u sıfırlıyor. Yorum, 20 satır altındaki kodun tersini söylüyor. — "her `it` kendi deferred'ını kurar; paylaşılan mock afterEach ile sıfırlanır" biçiminde düzelt. — backend
  - [SEV: low] apps/api/eslint.config.mjs:343 ve :476-478 — Sentry kısıtlaması eklendikten sonra yorumdaki sayımlar kaymış: blok (6) ALTI kısıtlama birleştiriyor (prisma + Body/Query/Param + express + pg + Prisma istemci yüzeyi + test harness) ama yorum "BEŞ kısıtlamanın" diyor ve ardından altısını sayıyor; blok (1)'in notu da "diğer beşi DAHİL" diyor, doğrusu altı. — Sayıları düzelt veya deponun kendi dersini uygula (borç :3942 "sayıyı kopyalama, kaynağa atıf ver") ve kümeyi adıyla anlat. — backend
  - [SEV: low] packages/errors/src/__tests__/redaction.test.ts:321-323 — uzunluk assertion'ı iki kardeşi tarafından MANTIKSAL OLARAK ima ediliyor (:315-319 yirmi sekiz benzersiz girdinin üyeliği + :325-327 benzersizlik ⇒ length ≥ 28 zorunlu); dolayısıyla kardeşlerden biri kırılmadan bu assert tek başına ASLA kırılamaz, ek hiçbir garanti getirmez. Zararlı değil (davranışı kardeşler taşıyor) ama "boşa çıkan assertion" sınıfı. — Sil ya da türetim aritmetiğini pinleyerek anlamlı kıl (her girdinin üç türetim dalından birine — düz ad / `*.ad` / `req|res.headers.*` — uyduğunu doğrula; bu, düşen bir türetim dalını VE kaçak bir girdiyi yakalar). — backend
  - [SEV: low] apps/api/src/observability/trace-attributes.ts:4-7 ve :39-43 — (tur 1 low-2'nin DEVAMI, borç) var olmayan mekanizmayı yürürlükteymiş gibi beyan eden iki blok: :4-7 bir `grep` değişmezini ("bu dosya VE tüketicileri DIŞINDA eşleşme VERMEMELİDİR") zorlanıyormuş gibi yazıyor, :39-43 ise ARKESOFT_SPAN_ATTRIBUTE_KEYS dizisini "security/qa'nın taraması bu diziyi GEZEREK doğrular" diye tanımlıyor. Ölçüm: dosyayı import eden/anahtarlarını gezen HİÇBİR dosya yok (grep: 0 eşleşme) ⇒ her iki mekanizma da bugün YOK. ⚠ Dosyanın tüketicisizliği KULLANICI ONAYLI erteleme (:9-19 bunu dürüstçe yazıyor) — bulgu ölü kod DEĞİL, yalnızca iki yorumun kipi. — Her iki bloğu "v0.18.0'da kurulacak" kipine çevir. — docs (vade v0.18.0)
  - [SEV: low] packages/errors/src/redaction.ts:298-328 — (tur 1 low-3'ün KAYIT İÇİN tekrarı, BİLİNÇLİ borç — FAIL gerekçesi DEĞİL) özyineleme durumu (`maxDepth`/`depth`/`seen`) genel imzada; devirsiz bir DAG (iki kardeş anahtardan aynı nesne) ikinci ziyarette `[circular]` alır (fail-closed: sızıntı yok, yalnızca teşhis kaybı); dönüş tipi `unknown` her tüketiciyi `as`'a zorluyor (:363 vb.). ⭐ Bu turda ölçülen ek kenar durum (aynı fonksiyon, aynı eksen): `Object.entries` yolu düz-olmayan nesneleri düzleştiriyor — `Date`/`Map`/`Set` `{}`'ye, `Buffer` sayısal anahtarlara açılır; docstring (:282-296) bu sınıfı hiç anmıyor. — G8 refactor'uyla birlikte: dahili durumu kapatan sarmalayıcı + `seen`'i dal bazında yönetme + düz-olmayan nesne davranışının belgelenmesi. — backend (vade v0.18.0)
```

---

## 3. Özel odakların denetimi

| # | Odak                                           | Sonuç                                                                                                                                                                                                                                                                                                                 |
| - | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | `NORMALIZED_SECRET_FIELD_NAMES` — ikinci kaynak mı | ⭐ **HAYIR — sınav geçildi.** `:266-268` kümeyi `SECRET_FIELD_NAMES`'ten `.map(normalizeFieldName)` ile **türetiyor**; elle yazılmış tek bir ad yok ⇒ **drift yapısal olarak imkânsız**. Modül yükünde bir kez hesaplanıyor (çağrı başına değil). `:262-264`'ün "boyut birebir aynı" iddiası doğrulandı: 27 adın 27 ayrık normalize biçimi var. |
| 2 | `PINO_REDACT_PATHS`'e normalizasyon uygulanmaması | ⭐ **Gerekçeli VE yorumda yazılı** (`:241-254`): `fast-redact` yol metinleri harfe duyarlı; `redactDeep` ise bir HTTP başlığı değil, domain kodunun seçtiği anahtarları tarıyor. Asimetri **testle de pinli** (`redaction.test.ts:501-506`) ve kalan boşluk (`Authorization` pino'da hâlâ kaçar) **açıkça** bilinen sınır olarak yazılmış, birincil savunmaya (K-A7) atıf var. Bulgu yok. |
| 3 | `WILDCARD_NESTED_FIELD_NAMES` 6'da sabit        | ⭐ **Sessiz boşluk DEĞİL.** Üç gerekçe (`:147-165`) ikna edici: (a) mevcut altı girdinin her biri **gözlenmiş** bir iç içe biçimi modelliyor, yeni on birinin hiçbirinin bugün bilinen biçimi yok; (b) `redactDeep` zaten her derinlikte tarıyor — joker burada **birincil değil ikincil** hat; (c) genişletme tetiği adıyla yazılı (`packages/integrations`, v0.6.x). ⭐ `'*.value'` yasağıyla **aynı sınıf** spekülatif genişlemeden kaçınmak tutarlı. Bulgu yok. |
| 4 | `sentry.ts`'in büyümesi / tek sorumluluk        | ⭐ **Tek sorumluluk korunuyor:** dosya Sentry yaşam döngüsünün üç ucunu (başlat / yakala / kapat) taşıyor, başka iş yapmıyor; iş mantığı, sunum, kalıcılık yok. `process.env` okumuyor (`:132-136` — doğrulanmış `ApiEnv` çağırandan geliyor). `CaptureAppErrorInput`'un dördüncü alanı (`traceId`) **sınırı doğru çiziyor**: alan zorunlu ve bu dosya artık traceId **üretemiyor** (import yok) ⇒ high-1'in yapısal garantisi tipte. ⚠ 107 satırlık başlık yorumu uzun ama **tamamı "neden"** (ölçülmüş SDK sürüm farkı, kök neden, reddedilen alternatifler); CLAUDE.md §4 bunu talep ediyor. Bulgu yok (yalnızca içindeki bir cümle → `low`). |
| 5 | `sentry-invariants` describe (4) — yeri/kırılganlığı | ⭐ **Yeri doğru:** bu depoda `apps/api/src/__tests__/` birim **ve** entegrasyon testlerini birlikte tutuyor (emsal: `log-correlation`, `queue-trace-propagation`, `observability-runtime-contract`); ayrı bir e2e yüzeyi açmak yeni dizin/koşucu demekti. ⭐ Gerçek Sentry istemcisi + sahte taşıyıcı dengesi doğru: ağa çıkış yok, gerçek `?? DEFAULTS` çözümlemesi ölçülüyor. ⚠ **Kırılganlık yönü beklenenin tersi:** test yanlış-kırmızı değil, **sessiz-yeşil** riski taşıyor ⇒ `medium` (yukarıda). |
| 6 | Yeni boşa çıkan assertion var mı                | ⭐ Tur 1'in üç tautolojisi **silinmiş ve gerçek assertion'la değiştirilmiş**. +13 yeni testin tamamı mutasyona duyarlı; **iki istisna**: `redaction.test.ts:321-323` (kardeşleri tarafından ima edilen uzunluk pini → `low`) ve `sentry-invariants.test.ts:576-638`'in eksik pozitif kontrolü (→ `medium`). `redactDeep` tamlık pini (`:407-419`) ve 11 vakalık `it.each` (`:429-449`) **güçlü**: bir adı kümeden silmek testi kırar. |
| 7 | Kodun tersini söyleyen yeni yorum               | ⚠ **Üç tane doğdu** (hepsi `low`): `sentry.ts:170-171` (opt-out/opt-in polaritesi ters), `observability-shutdown-order.test.ts:41-43` (paylaşılan mock iddiası 20 satır altındaki `afterEach`'in tersi), `redaction.ts:206-208` (28 ⇒ 39 bayatlaması). ⭐ `trpc.ts`'in **yalnızca yorum** olan değişikliği **doğru**: beş sınıfın `logLevel: 'error'` beyanı dosya:satır kanıtıyla doğrulanmış (:157-160), kod gerçekten değişmemiş. |
| 8 | Standart eksenler                               | ⭐ Hepsi temiz — aşağıdaki §4. |

---

## 4. Standart eksenler

- **Katman / sorumluluk sınırları (CLAUDE.md §3):** ihlal **yok**. `packages/errors/src/redaction.ts`
  **hiçbir** import taşımıyor (saf; "`errors` hiçbir iç pakete bağımlı değildir" kuralı korunuyor).
  `redactDeep` `packages/errors`'ta **saf fonksiyon** olarak duruyor, Sentry'ye bağımlı değil
  (`sentry.ts:276-280` bunu açıkça yazıyor ve kod bunu doğruluyor). İş mantığı `apps/api`'de;
  `packages/trpc` yalnızca sözleşme + sınır davranışı.
- **Bağımlılık yönü / döngü:** `apps/api → packages/errors`, `packages/trpc → packages/errors`.
  Ters yön **yok**, `packages/*` içinde döngü **yok**. Dosya seviyesinde döngü yok:
  `app-exception.filter.ts → observability/{sentry,trace-id}` tek yönlü; `sentry.ts` artık
  `trace-id.ts`'i **hiç** import etmiyor ⇒ tur 1'de işaret edilen çift-kaynak kenarı da kalktı.
- **Sağlayıcı soyutlaması (CLAUDE.md §8 / §10.12):** çekirdekte `if (provider === …)` **yok**.
  `@sentry/node` importu **yapısal olarak** tek dosyaya kilitli — iddia doğrulandı:
  `apps/api/eslint.config.mjs`'te `sentryRestriction` **altı** blokta (:361, :379, :397, :417,
  :445, :468) uygulanıyor ve **yalnızca** blok (6) (`src/observability/sentry.ts`, :481) muaf;
  `src/__tests__/**` bile muaf değil (:430-434). Arayüz açılmaması gerekçeli (sıfır tüketici,
  sıfır ikinci aday) ve yerine konan mekanizma **mekanik**.
- **Tip disiplini:** `apps/api/src` genelinde `: any` / `<any>` / `@ts-ignore` → **0**.
  Tek `as` kullanımı `instrumentation.ts:136` (`globalThis as ObservabilityGlobal`) — dış veri
  parse'ı değil, bildirilen opsiyonel `Symbol` alanına genişletme; CLAUDE.md'nin "Zod'dan sonra"
  kuralının hedefi değil. Dışa açılan **her** fonksiyonun dönüş tipi yazılı.
  `@ts-expect-error` örnekleri yalnızca **önceden var olan** tip pinlerinde ve gerekçeli.
- **Hata yönetimi:** `catch {}` **yok**, hata `null`'a çevrilip yutulmuyor.
  `logLevel` dağıtımı exhaustive `switch` + `assertNever` (`app-exception.filter.ts:140-163`,
  `error-mapping.ts:178-187`) — boolean bayrak yığını değil, discriminated union.
  `logLevel` `isRetryable`'dan **türetilmiyor** (K-A28-5'in bağlayıcı yasağına uyuluyor).
  Sağlayıcıya özgü tip dışarı sızmıyor (`@sentry/node` tipleri `StartSentryOptions.transport`
  içinde kalıyor; testler duck-typed fabrikayla uyuyor).
- **Tek sorumluluk:** `logByLevel` (`app-exception.filter.ts:130-164`) altı parametre alıyor ve
  'error' dalında loglamanın yanında Sentry'ye de gönderiyor — adı yalnızca loglamayı ima ediyor.
  ⭐ Bulgu **yazmadım**: "seviyeye göre raporla" tek bir karar; ayırmak `logLevel === 'error'`
  koşulunu **iki** yere kopyalardı, ki bu daha kötü bir tasarım olurdu.
- **DRY:** gerçek tekrar **yok**. `redactDeep`'in iki çağrı noktası (`error-mapping.ts:99` ve
  `sentry.ts:247`) **yüzeysel benzerlik**, tekrar değil: iki **ayrı** sınır (log hattı / zarf
  hattı) ve ikisi farklı sebeplerle değişir — birleştirmek savunma katmanını teke indirirdi.
  `PINO_REDACT_PATHS` ↔ `NORMALIZED_SECRET_FIELD_NAMES` ikisi de **türetilmiş**, ikinci defter yok.
- **KISS:** erken soyutlama, tek kullanımlı factory, anlamsız sarmalayıcı **yok**.
  `createArkesoftInstrumentations()` dışa açık ve bu **gerekçeli** (test aynı örneklere kendi
  exporter'ını takıyor ⇒ "hangi enstrümantasyon" sorusunun ikinci kopyası açılmıyor).
  `--import` yolu ölçümle **çıkarılmış** (gereksiz katman eklenmemiş).
- **İsimlendirme (CLAUDE.md §4):** uyumlu. Dosyalar kebab-case; `SECRET_FIELD_NAMES`,
  `REDACTED_PLACEHOLDER`, `SENTRY_FLUSH_TIMEOUT_MS`, `OBSERVABILITY_SDK_GLOBAL_SYMBOL`
  SCREAMING_SNAKE_CASE; `CaptureAppErrorInput`/`StartSentryOptions`/`AppErrorLogLevel`
  PascalCase; `redactDeep`/`normalizeFieldName`/`getCurrentTraceId` camelCase.
  `data`/`temp`/`handle`/`process` gibi belirsiz ad **yok** (`payload`/`logPayload` bağlamında
  kesin). Boolean alan adı icat edilmemiş.
- **Ölü kod:** kullanılmayan export **yok** (`trace-attributes.ts` hariç — **kullanıcı onaylı**
  erteleme, bulgu yazılmadı; yalnızca iki yorumun kipi `low`). Yorum satırına alınmış kod yok.
- **Regresyon kontrolü (kendi başlattığım):** `SECRET_FIELD_NAMES`'e `email` eklenmesi mevcut
  teşhisi bozuyor mu? ⇒ **Hayır.** Depo log çağrılarında **istisnasız** `emailMasked` anahtarını
  kullanıyor (`rate-limit.guard.ts:350`, `auth-instance.ts:251`, `:803`); `email` anahtarıyla
  loglayan **tek** satır yok ⇒ `:98-101`'in "`emailMasked` bilerek eklenmedi" kararı doğru ve
  etkisi ölçüldü.

---

## 5. Ölçümler

```
ÖLÇÜMLER:
  İncelenen dosya            18 (12'si doğrudan okundu, 8'i tam; 6'sı hedefli grep ile)
  Bulunan `any`              0   (apps/api/src + packages/errors + packages/trpc değişen yüzeyi;
                                 `@ts-ignore` 0; `@ts-expect-error` yalnızca önceden var olan,
                                 gerekçeli tip pinlerinde)
  En büyük üretim fonksiyonu startSentry — apps/api/src/observability/sentry.ts:146-188
                                 43 satır (≈18 satır kod + 25 satır gerekçe yorumu)
  İkinci                     AppExceptionFilter.catch — app-exception.filter.ts:82-121, 40 satır
                             redactDeep — packages/errors/src/redaction.ts:298-328, 31 satır
  En büyük test fonksiyonu   sentry-invariants.test.ts:577-638, 62 satır (describe (4))
  Bulgu dağılımı             critical 0 · high 0 · medium 2 · low 7 (5 yeni + 2 devreden)
  Türetim doğrulaması        SECRET_FIELD_NAMES 27 → NORMALIZED_* 27 (ayrık, map ile türetilmiş)
                             PINO_REDACT_PATHS = 27 + 6 + (3×2) = 39 ✓ (elle yazılmış girdi: 0)
  Koşturulan komut           YOK — `Bash` aracı bilinçli olarak verilmedi (`security` paralel
                             koşuyor). Tüm ölçümler Read/Grep/Glob ile, her biri dosya:satır
                             kanıtlı. Test/build/Playwright çalıştırılmadı.
```

> ⚠ Bu dosya `prettier --write` ile bitirilemedi — `solid` ajanının `Bash` aracı yok
> (AGENT_BASELINE §5: biçimlendirmeyi Orkestratör kapatır).
