# T-027 — `security` gate, tur 1

- **Tarih:** 2026-11-20
- **Sürüm:** ROADMAP `v0.0.18` (Çoklu dil ve para birimi altyapısı) · platform `0.11.0 → 0.12.0` (minor)
- **Kapsam:** `main` @ `dea5b70` + commit'lenmemiş T-027 değişiklikleri (70 dosya)
- **Ölçüm koşulları:** load avg `4.81 / 6.23 / 9.02` · 26 konteyner çalışıyor (kullanıcının
  diğer işleri) · `pnpm test:e2e`/Playwright **koşturulmadı** (talimat) · kök `pnpm test` /
  `pnpm test:isolation` **koşturulmadı** (run-owner kapısı)

```
GATE: security
SONUÇ: PASS
```

---

## BULGULAR

### `[SEV: medium]` `packages/i18n/src/money.ts:79-120` — `Money`'nin güvenli tamsayı koruması ASİMETRİK: dört metottan yalnızca biri koruyor

**Ölçüm (`node` + `packages/i18n/dist/money.js`, BigInt yer doğruluğuna karşı):**

| Çağrı | Sonuç | `Number.isSafeInteger` | BigInt doğru değer | Sapma |
| --- | --- | --- | --- | --- |
| `Money.of(MAX_SAFE+10,'TRY')` | `9007199254741000` | **false** | — | kabul edildi |
| `Money.of(1e300,'TRY')` | `1e+300` | **false** | — | kabul edildi |
| `of(MAX_SAFE).add(of(2))` | `9007199254740992` | **false** | `9007199254740993` | **1 kuruş** |
| `of(999999999999999).multiplyBy(11)` | `10999999999999988` | **false** | `10999999999999989` | **1 kuruş** |
| `of(999999999999999).multiplyByRatio({11,1})` | **FIRLATTI** | — | — | 0 (korumalı) |
| `of(MAX_SAFE).multiplyByRatio({2,1})` | **FIRLATTI** | — | — | 0 (korumalı) |

`of`/`add`/`subtract`/`multiplyBy` yalnızca `Number.isInteger` denetler —
`Number.isInteger(1e300) === true` olduğu için güvenli tamsayı aralığının **dışı serbest**.
`toSafeIntegerFromBigInt` (`:55-62`) **yalnızca** `multiplyByRatio`'da çağrılıyor; `multiplyBy`
düz `number` çarpımı yapıyor (`:119`) ve `add`/`subtract` düz `number` toplamı (`:100`,`:106`).
Dosyanın kendi gerekçesi (`:13-15`: *"pay × kuruş `Number.MAX_SAFE_INTEGER`'ı AŞABİLİR"*)
`multiplyBy` için **aynen geçerli** ama orada uygulanmamış.

**Test kapsamı ölçümü:** `packages/i18n/src/__tests__/money.test.ts` içinde güvenli tamsayı
vakası **tek** (`:129-133`) ve o da `multiplyByRatio` için. `of`/`add`/`subtract`/`multiplyBy`
için aralık testi **yok** ⇒ boşluk mekanik olarak korunmuyor.

**Saldırı senaryosu (somut ama bugün canlı değil):** `multiplyBy(quantity)` tam olarak
"satır kalemi toplamı" API'sidir ve `quantity` **kullanıcı girdisidir**. v0.4.0 (fiyat) /
v0.7.0 (checkout) bu metodu sepet satırına bağladığında, üst katmanda `quantity` üst sınırı
zorlanmazsa saldırgan büyük bir `quantity` ile sessizce yanlış (eksik) bir satır toplamı
üretebilir — ne hata, ne log, ne kapı. Aynı hesap `multiplyByRatio` ile **fırlatıyor**;
yani koruma var, sadece yanlış metoda konmuş.

**Neden `high`/`critical` DEĞİL (bilinçli, derece şişirilmedi):** bugün `Money`'nin
**sıfır üretim çağrı yeri** var (A-T27-4, ölçüldü: `grep -rn "Money\.\(of\|zero\)" apps/`
üretimde 0), para kolonu 0, `Currency` okuyucusu 0 ⇒ **bugün sömürülebilir değil** ve
AC-43'ün beş alt maddesinden hiçbiri bu aralığı şart koşmuyor. Somut senaryo bir sonraki
sürüme bağlı olduğu için `medium`.

- **Önerilen düzeltme:** `Money.of`'a `Number.isSafeInteger` kapısı koy (`Number.isInteger`
  yerine) ve `add`/`subtract`/`multiplyBy`'ı `multiplyByRatio` ile **aynı** `BigInt` +
  `toSafeIntegerFromBigInt` yolundan geçir. Dört metot için de aralık testi ekle.
  ⚠ `FractionalMinorUnitError`'ın adı "tam olmayan kuruş" diyor; aralık ihlali ayrı bir
  koşul ⇒ ya mesaj genelleştirilir ya ikinci bir programcı-hatası sınıfı açılır
  (ikisi de `errors.internal.unknown`'a eşlenir, katalog 35'te KALIR).
- **Sorumlu ajan:** `backend` (S5b'nin sahibi)

---

### `[SEV: low]` `packages/i18n/src/__tests__/purity.test.ts:64-66` — saflık süzgecinin yan-etki importu kör noktası; ikinci katman `devDependency` için de kapanmıyor

**Ölçüm (üç deseni ampirik koşturdum):**

```
YAKALANDI | import { x } from '@arkesoft/db'
YAKALANDI | export * from '@arkesoft/db'
YAKALANDI | import * as db from '@arkesoft/db'
KACTI     | import '@arkesoft/db'
KACTI     | import '@arkesoft/trpc'
```

Üç desenin tamamı (`from\s+`, `require(`, `import(`) bir bağlayıcı **veya** `from` gerektiriyor;
`from`'suz yan-etki importu üçünden de kaçıyor.

**İkinci katman ölçümü (Orkestratörün "katmanlı savunma kapatıyor" teyidi — KISMEN doğru):**

```
packages/i18n/node_modules/@arkesoft/ →  config -> ../../../config
                                          errors -> ../../../errors
```

- `@arkesoft/db` / `@arkesoft/trpc`: **çözülmez** (symlink yok) ⇒ `pnpm build`/`typecheck`
  kırmızı olur ⇒ pratik risk yok. Orkestratörün teyidi bu iki paket için **doğru**.
- ⚠ `@arkesoft/config`: **çözülür** (devDependency symlink'i var) **ve**
  `dependencies` pinleme testi (`:102-105`) yalnızca `dependencies`'i denetliyor,
  `devDependencies`'i denetlemiyor ⇒ `import '@arkesoft/config'` **iki katmanın
  ikisinden de kaçar**. Bugün `packages/config` env şemasını da barındırıyor
  (`process.env` okuyan kod) ⇒ saf bir katalog paketine o yüzeyi sessizce sokmak mümkün.

**Saldırı senaryosu:** doğrudan bir saldırgan senaryosu **yok** (saflık bir mimari
invariant, bir güvenlik kontrolü değil). Risk, invariantın sessizce delinmesi: ileride
bir ajan `import '@arkesoft/config'` yazarsa katalog paketi `process.env` okuyan bir
grafiğe bağlanır ve hiçbir kapı kırmızıya dönmez — bu depoda **üç kez** ölçülmüş
"sahte yeşil" sınıfı.

- **Önerilen düzeltme:** desenleri bağlayıcıdan bağımsız hâle getir — ör.
  `/(^|[^\w])(import|export)\s*(\{[^}]*\}\s*from\s*|[\w*{}\s,]*from\s*)?['"]@arkesoft\/(?!errors['"])/`
  ya da daha dayanıklısı: her satırda `['"]@arkesoft\/(?!errors['"])` dizgisini ara
  (yorumlar `codeLinesOf` ile zaten elenmiş). İkinci testi `devDependencies`'i de
  pinleyecek şekilde genişlet.
- **Sorumlu ajan:** `backend` (dosya sahibi) · `devops` (kapı disiplini)
- **Vade önerisi:** v0.4.0

**Borç satırı metni:**
`| low | packages/i18n/src/__tests__/purity.test.ts:64-66 | Saflık süzgeci `from`'suz yan-etki importunu (`import '@arkesoft/db'`) KAÇIRIYOR (ampirik ölçüldü). @arkesoft/db/trpc için pnpm çözümlemesi kapıyı kapatıyor, ama @arkesoft/config devDependency olarak SYMLINK'Lİ ve ikinci test yalnızca `dependencies`'i pinliyor ⇒ o paket iki katmandan da kaçar. | backend + devops | v0.4.0 | security tur 1 |`

---

### `[SEV: low]` `packages/i18n/src/tr-tr-errors.ts:31-34` — "5 `JOB_*` kodu kullanıcıya HİÇ ulaşmaz" gerekçesi ÖLÇÜMLE YANLIŞ (metinler temiz, gerekçe değil)

`ux`'in `security`'ye devrettiği gerekçe dosyaya yazılı: *"bu kodlar kullanıcıya HİÇ
ulaşmaz (kuyruk altyapı hatası)"*. **Bağımsız ölçüm bunu çürütüyor** — üçü istek
yolundan geçiyor:

| Kod | Fırlatma yeri | İstek yolunda mı |
| --- | --- | --- |
| `JOB_NOT_FOUND` | `apps/api/src/trpc/ports/job-read.port.adapter.ts:207` | ⚠ **EVET — tRPC port adaptörü** |
| `JOB_TYPE_NOT_REGISTERED` | `apps/api/src/queue/queue.service.ts:149` | ⚠ **EVET** (`enqueue` istek içinden çağrılır) |
| `JOB_PAYLOAD_INVALID` | `apps/api/src/queue/queue.service.ts:157` | ⚠ **EVET** (aynı `enqueue` yolu) |
| `JOB_HANDLER_NOT_REGISTERED` | `queue-worker.module.ts:126,130` | hayır (worker açılışı) |
| `JOB_IDENTIFIER_MISSING` | `job-runner.ts:374` | hayır (worker) |

⭐ **Metinlerin KENDİSİ temiz — ölçüldü:** beş `JOB_*` metninde kuyruk adı, handler adı,
iş tipi veya retry sayısı **geçmiyor**; beşi de jenerik ("İsteğiniz işlenemedi…",
"Aradığınız işlem bulunamadı."). `JobNotFoundError` dosya başı yorumu da zaten
*"var olmayan vs. yetkisiz → her ikisi de 404"* diyor ⇒ **§7 md 12 ihlali YOK**.

**Risk:** bulgu metinde değil, **yazılı gerekçede**. Yanlış bir "bu kullanıcıya hiç
ulaşmaz" kaydı, ileride bir ajanın bu beş metne teşhis detayı (kuyruk adı, iş tipi)
koymasını **meşrulaştırır** — o an gerçek bir iç-detay sızıntısı doğar ve hiçbir kapı
yakalamaz.

- **Önerilen düzeltme:** yorumu ölçümle değiştir: *"üçü (`JOB_NOT_FOUND`,
  `JOB_TYPE_NOT_REGISTERED`, `JOB_PAYLOAD_INVALID`) istek yolundan kullanıcıya ULAŞIR;
  bu yüzden beşinin de metni jenerik tutulur — kuyruk/handler/iş-tipi/retry detayı
  YAZILMAZ."*
- **Sorumlu ajan:** `ux` (metin gerekçesinin sahibi) · `docs` (ROADMAP kaydı)
- **Vade önerisi:** aynı turda yolu üstündeyse kapat; aksi hâlde v0.0.19

---

### `[SEV: low]` `apps/{admin,superadmin}/src/messages/messages.ts:225-227` / `:164-165` — prototip zinciri negatif testi YOK (davranış bugün güvenli, kapı yok)

**Ölçüm — bugünkü davranış GÜVENLİ:**

```
hasOwn(__proto__)      = false | bracket erişimi = object
hasOwn(constructor)    = false | bracket erişimi = function
hasOwn(toString)       = false | bracket erişimi = function
hasOwn(hasOwnProperty) = false | bracket erişimi = function
hasOwn(valueOf)        = false | bracket erişimi = function
```

`isRegisteredPlatformCode` `Object.hasOwn` tabanlı (iki panelde **parite** — ölçüldü) ⇒
telden gelen `code: '__proto__'`/`'constructor'` 3. basamağa **girmez**, `genericFallback`'e
düşer. `errorMessageKeySchema.safeParse('__proto__'|'constructor'|'toString')` de
**elendi** (aşağıdaki 21 girdilik matris).

**Risk:** bu güvenlik `Object.hasOwn` seçimine bağlı ama **hiçbir test** onu pinlemiyor —
`grep -rn "__proto__\|prototype" apps/{admin,superadmin}/src/__tests__ packages/{errors,i18n}/src/__tests__` → **0 eşleşme**. `Object.hasOwn` → `in`/`!== undefined` refactor'u sessizce geçer.
⭐ Patlama yarıçapı ölçülü ve SINIRLI: o durumda `ERROR_MESSAGE_KEYS['constructor']` bir
fonksiyon döner, `t(fn)` → `catalog?.[fn]` → `undefined` ⇒ ekranda **boş mesaj**, metin
sızıntısı/enjeksiyon DEĞİL. Bu yüzden `low`.

- **Önerilen düzeltme:** `normalize-panel-error`/`messages` test dosyalarına
  `it.each(['__proto__','constructor','toString','hasOwnProperty'])` ile "kod prototip
  zincirinden gelse bile jenerik Türkçe mesaj döner" negatif vakası ekle (iki panelde).
- **Sorumlu ajan:** `qa`
- **Vade önerisi:** v0.0.19

---

### `[SEV: low]` `pnpm-lock.yaml` — `effect@3.20.0` ReDoS (GHSA, **high**) ROADMAP'te KAYITSIZ; T-027 getirmedi

**Ölçüm — `pnpm audit` (2026-11-20):** `0 kritik / 2 high / 3 moderate / 1 low`

| Sev | Paket | Advisory | ROADMAP'te kayıtlı mı |
| --- | --- | --- | --- |
| high | `multer` `>=2.0.0 <2.5.0` | pending async `fileFilter` → DoS | ✅ (`A-A6`, `ROADMAP:2708`, `:4013`) |
| **high** | **`effect` `<=3.22.0`** | **`Schema.TemplateLiteral` ReDoS** | ⚠ **HAYIR** |
| moderate | `minimatch` `<11.0.1` | glob parts amplification DoS | ✅ (`ROADMAP:3373`) |
| moderate | `astro` `<=7.4.6` | `@astrojs/node` image endpoint path okuma | ✅ (`ROADMAP:4095`) |
| moderate | `@astrojs/node` `<=11.1.11` | aynı | ✅ (`ROADMAP:4095`) |
| low | `astro` `<=7.4.4` | dinamik etiket adında XSS | ✅ (`ROADMAP:4095`) |

**T-027 getirmedi — ölçüldü:**
`git diff pnpm-lock.yaml | grep -E "resolution:|^\+  /"` → **0 satır** ⇒ yeni registry
paketi **SIFIR**; lock diff'i yalnızca `@arkesoft/i18n` workspace link'lerinden oluşuyor.
`git show HEAD:pnpm-lock.yaml | grep -c "^  effect@"` → **2** ⇒ `effect` HEAD'de de vardı.

**Erişilebilirlik:** `pnpm why effect` → `@prisma/config@7.10.1 ← prisma@7.10.1`.
`Schema.TemplateLiteral` Prisma'nın **yapılandırma dosyası** ayrıştırmasında kullanılıyor;
girdi geliştiricinin yazdığı config, **güvenilmeyen istek girdisi değil** ⇒ bugün
erişilemez. Önceki kayıtta geçen `picomatch` ReDoS bu koşumda **hiç görünmüyor**
(ROADMAP:4250'nin "sayım oynak" notu bir kez daha doğrulandı).

- **Önerilen düzeltme:** `effect` satırını ROADMAP borç tablosuna ekle (`multer`/`minimatch`
  satırlarının kardeşi). Kapanış upstream `prisma` yükseltmesine veya kök
  `pnpm.overrides` kaydına bağlı.
- **Sorumlu ajan:** `devops` · **Vade önerisi:** bir sonraki bakım penceresi

---

### `[SEV: low]` `packages/db/src/tenancy.ts` · `prisma/schema.prisma` → `Currency` — `arkesoft_app`'in blanket DML'i CANLI VERİTABANINDA TEYİT EDİLDİ; erteleme `low` olarak DOĞRU

`architect`'in bilinçli non-kararını canlı katalogda ölçtüm (`arkesoft-postgres`, salt okuma):

```
currency        | arkesoft_app      | DELETE,INSERT,SELECT,UPDATE
currency        | arkesoft_migrator | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
plan            | arkesoft_app      | DELETE,INSERT,SELECT,UPDATE
platform_admin  | arkesoft_app      | DELETE,INSERT,SELECT,UPDATE
theme           | arkesoft_app      | DELETE,INSERT,SELECT,UPDATE
```

`arkesoft_auth` → `currency` üzerinde **hiçbir yetki yok** (satır dönmedi).
RLS: `currency.relrowsecurity = f`, `relforcerowsecurity = f` — `theme`/`plan` ile **birebir aynı**.

**"Bugün risk mi?" — HAYIR, ölçümle:**
1. `arkesoft_app` gerçekten `INSERT`/`UPDATE`/`DELETE` yapabilir (yukarıda teyit edildi).
2. Ama bugün tablonun **çalışma zamanı okuyucusu yok** (A-T27-4), **hiçbir FK** yok
   (`git diff schema.prisma` → `Currency`'ye referans veren model 0), **tek satır** var
   (`TRY`). ⇒ `arkesoft_app` ele geçse `TRY` satırını silmek **hiçbir kod yolunu
   etkilemez**, hiçbir kiracı verisi açığa çıkmaz, çapraz kiracı okuma üretmez.
3. Duruş 12 mevcut platform tablosuyla **birebir aynı** ⇒ T-027 **yeni bir yetki ekseni
   açmıyor**, mevcut ekseni 13. tabloya **genişletiyor**.

⇒ `architect`'in `[low]` + **vade v0.4.0** değerlendirmesi **doğrulandı**. ⚠ Vade kritik:
ilk para kolonu `currency.code`'a FK verdiği an bu tablo **fiyat doğruluğunun temeli**
olur ve `arkesoft_app`'in `UPDATE minor_unit` yetkisi gerçek bir para-manipülasyon
yüzeyine dönüşür.

- **Önerilen düzeltme:** v0.4.0'da `bootstrap-roles.sql` §9'un sabit fiil üçlüsünü
  (`REVOKE UPDATE, DELETE, TRUNCATE`) genelleştir ve `currency`'yi
  `APP_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`'a salt-okunur olarak ekle.
  ⚠ `tenancy.ts:314-318`'in "iki yönlü kırmızı pencere" uyarısı gereği DDL + beklenti
  **aynı commit'te**.
- **Sorumlu ajan:** `db` · **Vade önerisi:** v0.4.0

**Borç satırı metni:**
`| low | packages/db/src/tenancy.ts (PLATFORM_LEVEL_TABLES, 13. üye) | `currency` arkesoft_app için salt-okunur DEĞİL — canlı katalogda ölçüldü: DELETE,INSERT,SELECT,UPDATE (theme/plan/platform_admin ile birebir aynı). Bugün zararsız (okuyucu 0, FK 0, tek satır). v0.4.0'da ilk para kolonu FK verdiğinde bootstrap-roles.sql §9 fiil kümesi genelleştirilerek daraltılmalı. | db | v0.4.0 | architect beyanı + security tur 1 canlı ölçümü |`

---

## TEMİZ ÇIKAN YÜZEYLER — ne ölçtüm

### (a) `PanelError.messageKey` kapalı-küme daraltması — **FAIL-CLOSED, 21/21**

**21 düşman girdi, `errorMessageKeySchema.safeParse` üzerinde ampirik koşturuldu**
(`packages/errors/dist/index.js`, zod `4.6.7`):

| Girdi sınıfı | Girdi | Sonuç |
| --- | --- | --- |
| ham Türkçe metin | `'Kullanıcı bulunamadı: admin@…'` | ELENDİ → `null` |
| ham İngilizce metin | `'User not found'` | ELENDİ |
| XSS yükü | `'<img src=x onerror=alert(1)>'` | ELENDİ |
| boş dize | `''` | ELENDİ |
| uydurma anahtar | `'errors.auth.sekreter'` | ELENDİ |
| önek eşleşmesi | `'errors.auth.unauthenticated.extra'` | ELENDİ |
| baştan boşluk | `' errors.auth.unauthenticated'` | ELENDİ |
| **sayı** | `42` | ELENDİ |
| **nesne** (`toString` tuzağı) | `{toString:()=>'errors.auth.unauthenticated'}` | ELENDİ |
| **dizi** | `['errors.auth.unauthenticated']` | ELENDİ |
| **iç içe nesne** | `{a:{b:'errors.auth.unauthenticated'}}` | ELENDİ |
| `null` / `undefined` / `true` | — | ELENDİ |
| **prototip kirliliği** | `'__proto__'`, `'constructor'`, `'toString'` | ELENDİ |
| **prototip kirliliği nesnesi** | `JSON.parse('{"__proto__":{"polluted":true}}')` | ELENDİ (+ `Object.prototype.polluted === undefined`) |
| `Symbol.toPrimitive` tuzağı | `{[Symbol.toPrimitive]:()=>'errors.auth.unauthenticated'}` | ELENDİ |
| `String` sarmalayıcı nesnesi | `new String('errors.auth.unauthenticated')` | ELENDİ |
| ⭐ **POZİTİF KONTROL** | `'errors.auth.unauthenticated'` | **GEÇTİ** |

⇒ **küme dışı sızan girdi: 0** · enum üye sayısı: **35** · defter kod sayısı: **37** ·
benzersiz anahtar: **35** (37→35 çok-bire eşleme teyit edildi).

**TEK filtreleme noktası mı — EVET, mekanik olarak ölçüldü.** `PanelError.known`
üretim kodunda **tam 2 yerde** kuruluyor, ikisi de `normalize-panel-error.ts` içinde
(admin `:114`,`:162` · superadmin `:61`,`:102`); `: PanelError =` elle kurulumu
üretim kodunda **0**. ⇒ atlatılabilir ikinci yol **yok**.

**Üç zarfın hepsi süzülüyor mü — EVET:**

| Zarf | Yol | `messageKey` |
| --- | --- | --- |
| (a) `{body: appErrorBodySchema}` doğrudan | `toKnownFromAppErrorBody` | `parseMessageKey(body.message)` |
| (a) `input.cause` üzerinden (derinlik ≤2) | `toKnownFromAppErrorBody` | aynı süzgeç |
| (b) `{data: trpcErrorDataSchema}` | `toKnownFromAppErrorBody` | aynı süzgeç |
| (a) `appErrorBodySchema` çıplak | `toKnownFromAppErrorBody` | aynı süzgeç |
| (c) Better Auth gövdesi | ayrı dal | **sabit `null`** (`message` HİÇ parse edilmez) |
| — eşleşme yok | fail-closed | `{kind:'unknown'}` |

**DOM'a hangi yolla gidiyor — React metin düğümü, HTML enjeksiyon yolu YOK:**
`grep -rn "dangerouslySetInnerHTML|innerHTML|outerHTML|document.write|set:html"` →
tüm repoda **1 eşleşme**: `apps/storefront/src/pages/index.astro:57` (`<style is:inline
set:html={theme.styleText}>`) — **T-027'nin dokunduğu dosya DEĞİL** (`git status`'ta yok),
ve `storefront` `@arkesoft/i18n`'i hiç almıyor (A-T27-5). `resolvePanelErrorMessage`'ın
çıktısı `ErrorState.tsx:48`'de `{message}` olarak basılıyor ⇒ React metin düğümü, kaçışlı.

**Zincirin kendi testleri:** admin `49/49` · superadmin `32/32`
(`npx vitest run src/__tests__/normalize-panel-error.test.ts src/__tests__/messages.test.ts`),
`packages/i18n` **73/73** (9 dosya), `packages/errors/src/__tests__/error-message-keys.test.ts`
**11/11**, `packages/db` yeni iki test **18/18**.

**İki panel paritesi:** `Object.hasOwn` tabanlı `isRegisteredPlatformCode` **ikisinde de**
var (admin `:225-226`, superadmin `:164-165`) ⇒ superadmin'in aynası "sessizce bayat"
bırakılmamış.

---

### (b) 15–16 kodun ilk kez özel Türkçe metin kazanması — **§7 md 12 İHLALİ YOK**

**⭐ EN ÖNEMLİ ÖLÇÜM — T-027 API seviyesinde SIFIR yeni ayrım kanalı açıyor:**

| Ölçüm | Komut | Sonuç |
| --- | --- | --- |
| `docs/api-contract-surface.json` | `git status --porcelain docs/api-contract-surface.json` | **boş — DEĞİŞMEDİ** |
| `@arkesoft/trpc` | `git status --porcelain packages/trpc/` | **boş — HİÇ DOKUNULMADI** |
| `appErrorBodySchema` 4 alanı | `git diff packages/errors/src/error-body.ts` | yalnızca iki `message:` satırı literal → defter referansı |
| 33 üretim yazıcısı: eski literal vs. yeni defter değeri | node ile çapraz karşılaştırma | **33/33 eşleşti, değer sapması 0** |
| domain hata dosyalarında `userMessageKey` dışı değişiklik | `git diff -U0 … \| grep -v userMessageKey\|import\|yorum` | **0 satır** |

⇒ `code` + `httpStatus` ikilisi (ayrımın **gerçek** taşıyıcısı) **önceden de telde vardı**.
T-027 yalnızca panelin bu kodları **okunabilir** hâle getirmesini sağlıyor; saldırganın
devtools'ta zaten gördüğü ayrımı **artırmıyor**.

**`ux`'in dört gerekçesinin bağımsız kod doğrulaması:**

| Çift | `ux`'in gerekçesi | Benim ölçümüm | Sonuç |
| --- | --- | --- | --- |
| `INVITATION_INVALID` ↔ `ALREADY_MEMBER` (kasten **BİREBİR AYNI** metin) | jeton oracle'ı kapatıldı | ✅ İkisi de `'Bu davet geçerli değil.'` (katalog `:76-77`). **Üstelik kod seviyesinde de oracle yok:** `member.service.ts:317-322` `ALREADY_MEMBER`'a (409, `P2002`) ulaşmak için **önce** `normalizeMemberEmail(invitation.email) === actorEmail` koşulunu geçmek gerekiyor ⇒ üçüncü taraf jeton deneyen saldırgan 409'u **hiç göremez**; `INVITATION_INVALID` yedi ret modunu tek 404'e indiriyor (sınıfın dosya başı yorumu + `invitation-token.ts`'in `TENANT_ID_PATTERN` kapısı) | **DOĞRULANDI** |
| `PLATFORM_ADMIN_REQUIRED` ↔ `PERMISSION_DENIED` (kasten FARKLI metin) | ayrık iki guard | ✅ `PERMISSION_DENIED` **yalnızca** `trpc-errors.port.adapter.ts:58`'den, `permissionProcedure`'ün izin kapısından geliyor ve **üyelik muhafızından SONRA** (`permission-denied.error.ts:6-13`: aktör zaten bu kiracının üyesi). `PLATFORM_ADMIN_REQUIRED` `trpc-errors.port.adapter.ts:68` + `impersonation.service.ts:118` — `platformAdminProcedure`/impersonation. **Aynı isteğin alternatif dalları değil** ⇒ karşılaştırılacak sahte dal yok. ⭐ Ayrıca ikisi de "yetkin yok" diyor, **hiçbiri varlık bilgisi vermiyor** ⇒ metin farkı oracle üretemez | **DOĞRULANDI** |
| `OWNER_MEMBERSHIP_PROTECTED` | aktör üyelik+izin kanıtlamış (409) | ✅ Üç fırlatma yeri (`member.service.ts:409,464,524`) **tamamı** `withTenant` bloğunun İÇİNDE, `permissionProcedure` + üyelik muhafızından sonra. Aktör üye listesini zaten okuyabiliyor ⇒ "hedef owner'dır" bilgisi yeni değil | **DOĞRULANDI** |
| `INVITATION_RESEND_TOO_SOON`, `PENDING_INVITATION_LIMIT_REACHED` | aktör davet GÖNDEREN | ✅ İkisi de davet **gönderme** yolunda, kimliği doğrulanmış + yetkili aktör | **DOĞRULANDI** |
| 5 × `JOB_*` "tekrar" | kullanıcıya hiç ulaşmaz | ⚠ **gerekçe YANLIŞ** (üçü ulaşıyor) ama **metinler temiz** → yukarıda `low` bulgu | **KISMEN** |

**Orkestratörün bulduğu "artık" düzeltmesi — teyit edildi.** `git show HEAD` ile eski
admin kataloğunu okuyup karakter bazında karşılaştırdım: eski katalogda bu iki kod
**yoktu** (`INVITATION_INVALID`/`ALREADY_MEMBER` 15 "jenerik mesaja düşen" kodun
arasındaydı) ⇒ "artık" varyantı **üretime hiç çıkmadı**, düzeltme kataloğun doğuşunda
yapıldı.

**17 "BİREBİR" metin gerçekten birebir mi — EVET, 0 karakter sapması.**
`git show HEAD:apps/admin/src/messages/messages.ts`'ten eski 25 girdiyi çıkarıp
`ERROR_MESSAGE_KEYS` üzerinden `TR_TR_ERROR_MESSAGES`'e eşledim:
**platform ailesine ait taşınan 19 metin · KARAKTER SAPMASI 0** ⇒ `qa`'nın pinli
e2e'lerini kıracak bir boşluk/noktalama farkı **yok**.

**Önceden de ayrı metin taşıyan çiftler T-027'nin regresyonu DEĞİL:**
`TENANT_NOT_FOUND` ("İstenen mağaza bulunamadı.") ↔ `TENANT_MEMBERSHIP_REQUIRED`
("Bu işlem için bir mağazaya üye olmanız gerekiyor.") **ikisi de eski admin
kataloğunda vardı** (`git diff` kaldırılan satırlar listesinde) ⇒ T-027 getirmedi.
Ayrım zaten CLAUDE.md §7 md 12'nin **yazılı istisnası** kapsamında: `TENANT_NOT_FOUND`
yalnızca **host çözümünden** gelir (`tenant.guard.ts:57`, `reason` **tele değil
yalnızca loga** gider) ve `TENANT_MEMBERSHIP_REQUIRED`'a ulaşmak için host'un **zaten
çözülmüş** olması gerekir (`auth.guard.ts:146`, `tenant.kind === 'resolved'`) ⇒ ayırt
edici sinyal (host çözülüyor mu) DNS/TLS seviyesinde **zaten herkese açık** (ADR-0010 §5).

**`PLATFORM_NETWORK_NOT_ALLOWED` (yeni metin) — sızıntı yok:**
`platform-network-not-allowed.error.ts:14-20` ölçüldü — `publicDetails` override
EDİLMEZ, `reason` (`empty_allowlist`/`unknown_ip`/`ip_not_allowed`) **yalnızca loga**
gider; allowlist içeriği ve çözülen istemci IP'si tele **hiç** çıkmıyor. Yeni Türkçe
metin ("…bulunduğunuz konumdan gerçekleştirilemiyor") telde v0.0.20'den beri var olan
`code`'u okunabilir kılıyor, **yeni kanal açmıyor**.

---

### (c) `Currency` tablosu — sınıflandırma DOĞRU, kiracı verisi DEĞİL

- **Taksonomi:** `PLATFORM_LEVEL_TABLES` 12 → **13** (`tenancy.ts`), `TENANT_SCOPED_TABLES`
  **değişmedi** (7'de kaldı). `packages/db/src/__tests__/platform-tables.isolation.test.ts`
  `.toBe(12)` → `.toBe(13)` (tek satır, S6).
- **Kiracıya bağlı olması gereken bir şey platform'a mı konmuş — HAYIR.** Tablonun
  **tüm** içeriği ISO 4217 kodu + ondalık basamak (`code CHAR(3)`, `minor_unit INTEGER`)
  — küresel standart, **her kiracı için aynı**. Kiracı bazlı para birimi listesi /
  fiyat listesi bu sürümde **yok** (R2/R3 ile v1.5.0'a ertelendi). `tenant_id` kolonu
  eklenmesi `TENANT_ID_ON_PLATFORM_TABLE` bulgusu üretirdi.
- **Migration:** yalnızca `CREATE TABLE` + `INSERT … ON CONFLICT DO NOTHING`. Yıkıcı
  adım **0**, FK **0**, trigger/view/RULE/`SECURITY DEFINER` **0** ⇒ katalog linter'ının
  kör noktalarına (`pg_proc.prosecdef`, `pg_trigger`, `pg_rewrite`, `rolconfig`)
  **dokunulmuyor** (CLAUDE.md §7'nin 14. maddesi **konusuz**).
- **`public` dışı şema açılmadı**, **dört sır listesi değişmedi** (tablo parola özeti/
  token/TOTP sırrı/kurtarma kodu **taşımıyor**).
- Blanket DML ölçümü ve değerlendirmesi → yukarıdaki `low` bulgu.

**Katalog kiracı verisi mi — HAYIR, doğrulandı.** `locale` gerçekten fonksiyon
parametresi: `createMessageResolver<L>(bundle, defaultLocale)(locale)` curry'li;
`format{Money,Date,Number}` hepsi `options.locale` alıyor, varsayılan `DEFAULT_LOCALE`.
Kiracı yapılandırmasından okuma **yok** — `grep -rnE "process\.|fetch\(|node:fs|node:path|localStorage|document\."
packages/i18n/src/*.ts` → **0 eşleşme**.

---

### Diğer kontrol listesi maddeleri

| Madde | Ölçüm | Sonuç |
| --- | --- | --- |
| Yeni uç / prosedür / kuyruk işi | `git diff HEAD \| grep -E "publicProcedure\|tenantProcedure\|permissionProcedure\|platformAdminProcedure\|@(Get\|Post\|…)\(\|@Controller\|registerJob\|queue\.add\|\.enqueue\("` → **0** | **IDOR/yetki/oran-sınırı yüzeyi yeni YOK** |
| Girdiden gelen `id` sahipliği | yeni `id` girdisi yok (prosedür yok) | konusuz |
| `withTenant` / ham `prisma` | yeni sorgu **0** | konusuz |
| Önbellek anahtarı / S3 öneki / Meilisearch indeksi | katalog **statik TS modülü**, çalışma zamanı önbelleği gerektirmiyor | yeni dış kaynak **0** |
| Zod ile parse | `errorMessageKeySchema` (tel `message`), `registrationFieldErrorKeySchema` (tel `fields`), `localeSchema`, `supportedCurrencyCodeSchema` — **dış veri girişlerinin tamamı Zod'dan geçiyor** | ✅ |
| Enjeksiyon (SQL) | ham SQL yalnızca migration'da, **parametresiz literal** (`'TRY'`, `2`) — kullanıcı girdisi yok. ⭐ `$executeRawUnsafe`/`$queryRawUnsafe` ESLint yasağı **refactor sonrası da yürürlükte**, `eslint --print-config` ile ölçüldü: üretim yolunda 6 seçici, test yolunda 2 seçici — ham SQL yasağı **ikisinde de** var | ✅ **gerileme YOK** |
| Enjeksiyon (XSS / komut / yol / açık yönlendirme) | HTML sink 0 (yukarıda), `child_process`/`exec` 0, dosya yolu birleştirme 0, `window.location`/`redirect` 0 | ✅ |
| Sır loglanması/saklanması | `git diff HEAD \| grep -niE "(password\|secret\|api[_-]?key\|private key\|bearer\|tckn\|cvv\|credit card)"` → **tüm eşleşmeler hata KOD ADI** (`INVALID_PASSWORD` vb.), **sır DEĞERİ yok**. İzlenmeyen yeni dosyalarda tarama → **0 eşleşme** | ✅ |
| Yeni log çağrı yeri | `git diff HEAD \| grep -E "logger\.(info\|warn\|error\|debug)\|console\."` → **0** | ✅ beyan doğrulandı |
| Ödeme / kart verisi / webhook imzası / idempotency | ödeme akışı, webhook, adaptör **hiç dokunulmadı** (`packages/integrations` değişmedi) | konusuz |
| Oran sınırlama | yeni kötüye kullanılabilir uç **0** | konusuz |
| SSRF / dosya yükleme | kullanıcı URL'i **0**, dosya yükleme **0**, `fetch` **0** (saflık testi yasaklıyor) | konusuz |
| BigInt DoS | `multiplyByRatio({numerator: 1e308, denominator: 1})` → **0.026 ms**, fırlattı. `ratio` parçaları `number` olduğu için BigInt genişliği ~1024 bit ile sınırlı ⇒ **DoS yolu yok** | ✅ |
| ReDoS (yeni regex) | `localeSchema` `/^[a-z]{2}-[A-Z]{2}$/` (çapalı, sabit uzunluk) · `interpolate.ts` `/\{([a-zA-Z0-9_]+)\}/g` (iç içe nicelik yok) · `MONEY_NAME_SOURCE` (alternasyon, geri-izleme yok) ⇒ **katastrofik geri-izleme yok** | ✅ |
| KVKK — gereksiz kişisel veri | `Currency`'de kişisel veri **0**; 35 katalog metninde PII/isim/e-posta/IP/TCKN **0**; `Money` kişisel veri taşımıyor; silme talebi akışına dokunulmuyor; üçüncü tarafa veri gitmiyor | ✅ |
| Süper admin denetim kaydı | yeni süper admin işlemi **0**; `impersonation.service.ts` dokunulmadı | konusuz |
| İstemci bundle'ına giren katalog | `apps/{admin,superadmin}`'e `@arkesoft/i18n` **prod** bağımlılığı eklendi ⇒ 35 Türkçe metin + 37 kod istemciye iniyor. **Hassas bilgi taraması:** 35 metinde iç sistem adı, kuyruk adı, tablo adı, host, IP, sürüm, yol, PII **0**; hepsi zaten kullanıcıya gösterilmek için yazılmış. 37 kod telde `code` alanı olarak **zaten** her yanıtta gidiyor | ✅ **bulgu yok** |
| Yeni ana bağımlılık | `git diff pnpm-lock.yaml \| grep -E "resolution:\|^\+  /"` → **0 satır** ⇒ yeni registry paketi **SIFIR** | ✅ teyit edildi |
| `eslint-disable-next-line` (`money.ts:91`) | `@typescript-eslint/no-unnecessary-condition` bastırılıyor; **çalışma zamanı denetimi KALDIRILMADI** (`if (this.currency !== other.currency) throw`) ⇒ güvenlik zayıflaması **yok**. ⚠ CLAUDE.md §2'nin istediği "ilgili ROADMAP versiyonuna not" yorumda **yok** — standart maddesi, `solid`'in ekseni | not |
| `guards.sh` 24. adım | literal-jeton kuralı uygulanmış (`key_token_a`+`key_token_b`), `grep -r` **var**, fail-closed dal **var**, alt kontrol 2 "tanım dururken diziden düşürülme" mutasyonunu **sayarak** kapatıyor | ✅ |

---

## ÖLÇÜMLER

- **`pnpm audit` (2026-11-20):** `0 kritik / 2 high / 3 moderate / 1 low` — altısının
  **hiçbiri** T-027 tarafından getirilmedi (`pnpm-lock.yaml` diff'inde yeni registry
  paketi **0**; `effect` HEAD lock'ında da mevcut). Beşi ROADMAP'te kayıtlı, `effect`
  **kayıtsız** → yukarıdaki `low`.
- **İncelenen dosya sayısı:** **70** (`git status --porcelain`) — ayrıntılı okunan: 24
  (üç güvenlik yüzeyinin tamamı + 8 `apps/api` hata sınıfı + 2 guard + `member.service.ts`
  ilgili bölümleri + `base.js` + `guards.sh` 24. adımı).
  `packages/i18n/src` üretim dosyası: **14**.
- **Tenant izolasyon listesinden KARŞILANMAYAN madde: YOK (0).**
  - **Konusuz (10 madde):** `tenant_id` · RLS politikası · `(tenant_id, …)` bileşik
    indeks · `tenantProcedure` · `withTenant` · girdi `id` sahipliği · kuyruk payload
    `tenantId` · önbellek anahtarı · dosya yolu tenant öneki · log `tenantId` —
    `currency` **platform tablosu** ve **hiç prosedür/kuyruk işi/sorgu eklenmiyor**.
  - **Geçti (8 madde):** dış kaynak kapsamı (yeni dış kaynak 0) · `createTenantIsolationSuite`
    (yeni kiracı kaynağı 0, `TENANT_SCOPED_TABLES` değişmedi) · hata mesajı sızdırmaması
    (yüzey (b), yukarıda metin bazında denetlendi) · impersonation/denetim kaydı
    (yeni süper admin işlemi 0) · bağımlı/türetilmiş DB nesnesi (view/trigger/RULE/
    matview **0**) · `SECURITY DEFINER` (**0**) · `public` dışı şema (**açılmadı**) ·
    dört sır listesi (**değişmedi**, `currency` sır taşımıyor).
- **Fail-closed matrisi:** 21 düşman girdi → **21 ELENDİ / 0 SIZDI** + 1 pozitif kontrol GEÇTİ.
- **Prototip zinciri probu:** `Object.hasOwn` 5/5 `false` · `Object.prototype.polluted`
  `undefined` (kirlenme yok).
- **Değer korunumu:** 33 üretim `userMessageKey` yazıcısı, eski literal ↔ yeni defter
  değeri — **33/33 eşleşti, sapma 0**. 19 taşınan Türkçe metin — **karakter sapması 0**.
- **ESLint kapı ölçümü:** üretim yolu **6** seçici (ham SQL 2 + literal anahtar 1 +
  float-para 3) · test yolu **2** seçici (ham SQL) ⇒ ham SQL/tenant-izolasyon yasağı
  refactor'da **kaybolmadı**. Fixture'lar: 3 pozitif → **3/3 hata**, 3 negatif → **0 hata**.
- **Canlı veritabanı (salt okuma, `arkesoft-postgres`):** `currency` yetkileri
  `theme`/`plan`/`platform_admin` ile **birebir aynı**; `arkesoft_auth`'un yetkisi **yok**;
  RLS `f`/`f` (diğer platform tablolarıyla aynı).
- **Koşturduğum testler (hepsi yeşil):** `apps/admin` 2 dosya **49/49** ·
  `apps/superadmin` 2 dosya **32/32** · `packages/i18n` 9 dosya **73/73** ·
  `packages/db` 2 yeni dosya **18/18** · `packages/errors` 1 dosya **11/11**.
  (Kök `pnpm test`/`test:isolation`/`test:e2e` **koşturulmadı** — run-owner kapısı.)

---

## FAIL/PASS KARARI

AGENT_BASELINE §4 tablosuna göre: **1 `medium` + 5 `low`** ⇒ `critical` 0, `high` 0,
`medium` < 3 ⇒ **PASS**. Bulguların tamamı teknik borç tablosuna gider; **düzeltme turu
açılmaz**.

⚠ **Orkestratöre not:** `medium` (#1, `Money` güvenli tamsayı asimetrisi) kural gereği
tur açmıyor, ama bu **düzeltmenin en ucuz olduğu an**: `Money`'nin bugün sıfır çağrı yeri
var, v0.4.0/v0.7.0 onun üzerine kuruluyor ve `multiplyBy(quantity)` doğrudan kullanıcı
girdisi alacak. Başka bir gate (`solid`/`qa`) bir düzeltme turu açarsa, bu bulgu
`packages/i18n/src/money.ts` + `money.test.ts`'te **aynı düzenlemede** kapanabilir
(AGENT_BASELINE §4 "yolu üstündeyse kapat" istisnası).
