# T-019 — `solid` gate, TUR 2

- **Tarih:** 2026-11-15
- **Sürüm:** ROADMAP v0.1.0
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- **Araç kısıtı:** `Bash` YOK. Tüm ölçümler `Read`/`Grep`/`Glob` ile. Komut çıktısı
  gerektiren her şey `DOĞRULANAMADI` olarak işaretli (en altta).

```
GATE: solid
SONUÇ: PASS
BULGULAR:
  - [SEV: medium] apps/api/src/__tests__/helpers/create-test-redis-connection.ts:108 — Q-1'in TÜM kök neden düzeltmesini taşıyan mutasyonun (4000 ms etkin `commandTimeout`) SIFIR pini var; silinse hiçbir test kırılmaz, tek belirti flake'in geri dönmesi — backend
  - [SEV: medium] apps/api/src/__tests__/test-harness-redis-profile-isolation.test.ts:24 — bir `.test.ts`, ikinci bir `.test.ts`'i modül olarak import ediyor ⇒ yabancı 10 test her koşumda İKİNCİ kez koşuyor (3 + 10 = `qa`'nın raporladığı 13) ve yeni kapının kendi ölçümü kirleniyor — backend/qa
  - [SEV: low] apps/api/src/registration/registration.service.ts:200 — yorum VAR OLMAYAN bir dosyaya atıf yapıyor (`plan-limits.schema.ts`), üstelik :75-80 onu bilerek açmadığını yazıyor — backend/docs
  - [SEV: low] apps/admin/src/features/registration/StoreWizard.tsx:55 — `resolveSlugStatusTextColorClassName`'in son dalı `W-1` bölünmesinden sonra ERİŞİLEMEZ hâle geldi (tur 1'de "anlamlı" diye bulgu yazılmamıştı) — frontend
  - [SEV: low] apps/admin/src/features/registration/slug-outcome-message.ts:33 — `resolveSlugLiveStatusMessage` ÜRETİMDE sıfır çağıran (artık yalnızca kendi modülü + test); modülün ÜÇÜNCÜ fazla-geniş export yüzeyi — frontend
  - [SEV: low] apps/admin/src/features/registration/StoreWizard.tsx:191-224 — JSX içinde yalnızca iki değeri destructure etmek için IIFE; çağrı bileşen tepesine taşınabilir (`progressLabel` emsali) — frontend
  - [SEV: low] apps/api/eslint.config.mjs:271-425 — R-P1 invaryantı bu turda 6 blok × 6 kısıtlama (36 el ile tutulan hücre) oldu; invaryantı doğrulayan MEKANİK kapı yok (invaryant bu turda DOĞRU, bulgu doğrulanabilirlik hakkında) — devops/backend
  - [SEV: low] apps/api/src/__tests__/rate-limit-policy.test.ts:153 — runtime doğrulaması olmayan `as [string, string]` (CLAUDE.md §2); dosyadaki aynı desenin 4. kopyası — backend
ÖLÇÜMLER: incelenen dosya 25 (tamamı veya ilgili blokları) · yeni kodda `any` 0 · `@ts-ignore` 0 · `@ts-expect-error` 11 (hepsi gerekçeli tip pini, `db` ajanı TS2578 ile mutasyon-kanıtladı) · runtime doğrulamasız `as`: üretim 0, yeni test kodu 1 (`rate-limit-policy.test.ts:153`) · en büyük YENİ fonksiyon `assertSoleRunOwnership()` 63 satır (create-test-app.ts:251-313) · en büyük dokunulan fonksiyon `StoreWizard()` 238 satır (JSX, karar mantığı dışarıda, DEĞİŞMEDİ) · boş `catch` 0 · tur 1'in 11 `low`'u: 11 DURUYOR, 0 kapandı
```

**FAIL/PASS gerekçesi (`AGENT_BASELINE` §4):** `critical`/`high` **0**, `medium` **2**
(≤2 ⇒ PASS, bulgular teknik borca), `low` 6. Tur 1'in dört `medium`'undan **üçü kapandı**,
biri **çürütüldü ve kabul edildi** ⇒ kapıyı kapatan bulgu kalmadı.

---

## İŞ ① — Tur 1'in dört bulgusunun akıbeti

| Bulgu | Durum             | Kanıt özeti                                               |
| ----- | ----------------- | --------------------------------------------------------- |
| `M1`  | KAPANDI           | mutasyon probu beş eksende de kırmızı veriyor (aşağıda)   |
| `M2`  | ÇÜRÜTÜLDÜ (kabul) | `docs/ui/…:233` "her zaman görünür" — ben de okudum       |
| `M3`  | KAPANDI           | tip daraltıldı + beş negatif pin + doc iki eksene ayrıldı |
| `M4`  | KAPANDI           | `SET…NX` + iki Lua betiği; kalıntı risk yazılı            |

### `M1` — KAPANDI, mutasyon GERÇEKTEN kırılıyor

Yeni ev `apps/admin/src/errors/resolve-shape-error-message.ts` (`export`'lu, `.ts`,
`vitest.config.ts`'in `src/**/*.test.ts` kapsamında). Tur 1'in negatif kanıtı
(export'suz + `.tsx` ⇒ görünmez eşleme) **mekanik olarak kapandı**. Hangi mutasyon
hangi assert'i düşürür — `Read` ile satır satır izledim:

- `:48` `'too_small'` → bozulursa `test:42` düşer (`required` yerine `genericError`).
- `:51` `'invalid_format'` → `'invalid_string'` yapılırsa `test:50` düşer (tur 1'in
  **birebir** verdiği mutasyon senaryosu; artık kırılıyor).
- `:54` `'custom'` → bozulursa `test:62` düşer.
- `:51`/`:54`'ün `!== undefined` guard'ı kaldırılırsa `test:56` ve `test:69` düşer
  (`undefined` dönerdi, `genericError` bekleniyor).
- `:45` erken `undefined` dönüşü kaldırılırsa `test:34` düşer.

Ek doğrulama: `_auth.sign-in.tsx`'te **kalıntı yok** (`Grep function resolve` → 0
eşleşme), iki rota (`_auth.kayit.tsx:89,94,98` ve `_auth.sign-in.tsx:123,128`) tek
evi tüketiyor ⇒ tekrarın **kendisi** de kapandı, yalnızca test edilebilirlik değil.
⚠ Tanım sayısı: bu dosyada **7** `it` var (`:33,41,49,55,61,67,72`); handoff **+8**
diyor — kalan 1 testin hangi dosyada olduğunu **ölçemedim** (`Bash` yok).

### `M2` — ÇÜRÜTÜLDÜ, kabul

`docs/ui/T-019-kayit-ve-kiraci-olusturma.md:233`'ü **kendim okudum**: "Dürüst bilgi
şeridi | `<p>` (Card'ın en üstünde, **her zaman görünür**) | … `pendingBanner`".
Koşulsuz render dokümante edilmiş tasarım ⇒ **bu satırı tekrar bulgu yazmıyorum**.
Dersi kabul ediyorum: tasarım dokümanı bu gate'in okuma listesinde.

### `M3` — KAPANDI

`packages/db/src/tenant-context.ts:160-162` tam olarak önerdiğim biçimde
(`Pick<TransactionClient,'tenant'> & { readonly plan: Pick<TransactionClient['plan'],
'findUnique'> }`). Beş negatif pin `tenant-context-new-tenant.test.ts:235-244`
(`create`/`update`/`upsert`/`delete`/`deleteMany`), fixture `testMigrationPrisma`
ile transaction dışına taşınmış (`:78`). Doc'un `:186-203`'ü **iki eksene ayrılmış**
(GUC ↔ tablo erişimi) ve `plan` ekseninde artık doğru. **SQL ayağı ayrımı yazılı**
(`:195-203` yalnızca tip-seviyesi iddia ediyor) ⇒ `R-A6`'yı tekrar yazmıyorum.
Ek olarak doğruladım: `plan`'a yazabilen ikinci bir tip yolu gerçekten yok —
`prisma.service.ts:168-173` faz-3 callback'ini `TenantTransactionClient`'a daraltıyor,
yani `packages/db`'nin geniş `TransactionClient` imzası `apps/api`'ye sızmıyor.

### `M4` — KAPANDI

`create-test-app.ts:251-313`: ① `SET…NX` + dönüş kontrolü, ② `REFRESH_IF_MINE_SCRIPT`
(tek atomik oku+tazele), ③ `TAKEOVER_IF_UNCHANGED_SCRIPT` (Lua CAS) + `'CONFLICT'`'te
tek seviye yeniden deneme. `EVAL` dönüşleri Zod'dan geçiyor (`:169`, `:249`) — `as`
yok. pid yeniden kullanımı ve 120 sn marker ömrü `:126-146`'da kalıntı risk olarak
**yazılı** ⇒ tekrar yazmıyorum. Kök nedenin başka eksende (test harness'ın miras
aldığı 1500 ms) bulunmuş olmasını kayda geçiriyorum; hükmüm "kapının kendisi de bir
aday" idi ve kapı atomikleştirildi — ama **yeni** bulgum (M-A) tam olarak o yeni
çözümün pinsiz olmasıyla ilgili.

---

## İŞ ② — Yeni kod bulguları (negatif kanıtlı)

### M-A · `medium` · `apps/api/src/__tests__/helpers/create-test-redis-connection.ts:108`

Q-1 sagasının **tüm** çözümü tek satır: `client.options.commandTimeout = 4000`.
Bu satırın etkisini doğrulayan **hiçbir** test yok.

**NEGATİF KANIT:** `Grep TEST_HARNESS_REDIS_COMMAND_TIMEOUT_MS` (repo kökü, açık yol)
→ **iki** eşleşme, ikisi de kendi dosyası (`:91` tanım, `:108` kullanım). `:108`'i
silsem `pnpm lint`/`typecheck`/tüm süit **yeşil** kalır; tek belirti ~%11 flake'in
yük altında geri dönmesi — yani regresyon **yalnızca** CI'da, yalnızca yük varsa,
yalnızca olasılıkla görünür. İkinci yol aynı sınıfta: dosya başı yorumu `ioredis`'in
`commandTimeout`'u **her komutta** dinamik okuduğunu `Redis.js:368-369` ile ölçmüş —
bu bir **sürüm bağımlı iç davranış**; bir minor bunu kurucuda snapshot'larsa mutasyon
sessizce etkisizleşir ve yine hiçbir kapı kırmızı olmaz. `redis-connection-profiles.
test.ts` üretim tarafını (1500) pinliyor, bu ekseni **göremez**.

**Pin ücretsiz ve emsali 40 satır ötede:** `redis-connection-profiles.test.ts:69`
`DEAD_REDIS_URL` ile istemci kurup `:193`'te `client.options.commandTimeout`'u assert
ediyor ⇒ **canlı Redis gerekmiyor**. Öneri (iki satır assert):
`createTestHarnessRedisConnection(DEAD_REDIS_URL, logger).options.commandTimeout`
`=== 4000` **ve** `buildRedisConnectionOptions('health').commandTimeout === 1500` —
ikincisi "iki eksen AYRI kaldı" (R-A4) iddiasını da aynı dosyada pinler. **Sorumlu:**
backend. Dört katmanlı **izolasyon** titizlikle kurulmuş; eksik olan **davranışın**
kendisi.

### M-B · `medium` · `apps/api/src/__tests__/test-harness-redis-profile-isolation.test.ts:24`

`import { collectImportStatements } from './production-write-path-grep.qa.test.js'` —
bir test dosyası ikinci bir test dosyasını **modül** olarak tüketiyor. Vitest
collector'ı import edilen modülün top-level `describe()` çağrılarını **import eden
dosyanın** süitine kaydeder.

**NEGATİF KANIT (aritmetik, uydurulmadı):** bu dosya tam **3** `it` tanımlıyor
(`:102`, `:115`, `:121`). `production-write-path-grep.qa.test.ts` tam **10** `it`
tanımlıyor (`:168,196,205,216,222,287,291,295,356,366`). `qa` tur 3 bu dosya için
**13** test raporladı — **3 + 10**. Yani KAPI 1-4 + "tarama yüzeyi" süitleri her
`pnpm test`'te **ikinci kez** koşuyor. Sonuçları: (a) üç kaynak ağacı
(`apps/api/src`, `packages/db/src`, `packages/trpc/src`) ikinci kez recursive
`readdirSync`+`readFileSync` ile yürünüyor; (b) KAPI 2'de (kullanıcı sert silme)
bir ihlal olsa hata **"test-harness Redis izolasyonu"** dosyasında raporlanır ⇒
teşhis yanlış yöne gider; (c) yeni kapının kendi ölçümü (13) ölçtüğü şeyi anlatmıyor.

**Öneri:** `collectImportStatements`'ı `src/__tests__/helpers/collect-import-
statements.ts`'e taşı, iki test dosyası oradan import etsin. Lint engellemiyor —
`__tests__` dizini yeni `noTestHelpersImportRestriction`'dan **muaf** (blok 4b).
Taşıma iki kapının **hiçbir** iddiasını gevşetmez (saf fonksiyon, aynı gövde).
**Sorumlu:** backend/qa.

### L-A · `low` · `apps/api/src/registration/registration.service.ts:200`

Yorum var olmayan bir dosyaya atıf yapıyor: "`plan-limits.schema.ts`'in dosya başı
yorumu: …". **Kanıt:** `Glob **/plan-limits*` → tek sonuç
`src/__tests__/plan-limits-schema.test.ts`; şema dosyası **yok** ve aynı dosyanın
`:75-80`'i onu **bilerek** açmadığını yazıyor ⇒ yorum kendi kararıyla çelişiyor.
Bakımcı o dosyayı arar, bulamaz. **Sorumlu:** backend/docs.

### L-B · `low` · `apps/admin/src/features/registration/StoreWizard.tsx:55`

`resolveSlugStatusTextColorClassName`'in son dalı (`text-(--color-text-secondary)`)
`W-1` bölünmesinden sonra **erişilemez**. Tek çağıran `:214` ve yalnızca
`liveStatusMessage !== null` iken render ediliyor: `'idle'`'da bu koşul sağlanmaz;
`'checking'`'de ancak `transportErrorMessage !== null` iken sağlanır ve o durumda
`hasTransportError` **ilk** dalı alır. **Kanıt:** fallback'i `danger-600` yapsam
hiçbir test ve hiçbir piksel değişmez. ⚠ Tur 1'de bu fallback "anlamlı" diye bulgu
**yazılmamıştı** — `W-1` düzeltmesi onu ölü dala çevirdi. Üstelik fonksiyon `.tsx`
içinde modül-private, yani `M1`'in sınıfı (testsiz karar) burada **sunum ekseninde**
duruyor. **Sorumlu:** frontend.

### L-C · `low` · `apps/admin/src/features/registration/slug-outcome-message.ts:33`

`resolveSlugLiveStatusMessage`'ın **üretimde sıfır çağıranı** kaldı: `StoreWizard.tsx:24`
yalnızca `resolveSlugCheckDisplayMessages` + `buildSlugPreviewAddress` import ediyor;
fonksiyonun diğer çağrıları **aynı modülün içinde** (`:75`, `:79`) + test. **Kanıt:**
`export`'u kaldırsam yalnızca test importu kırılır. Modülün üçüncü fazla-geniş
yüzeyi (tur 1 `L3`'ün `resolveSlugFieldErrorMessage` + `FIELD_ERROR_KEY_BY_OUTCOME`
ölü eşlemesi **duruyor**). **Sorumlu:** frontend.

### L-D · `low` · `apps/admin/src/features/registration/StoreWizard.tsx:191-224`

JSX içinde IIFE (`{(() => { … })()}`) yalnızca iki değeri destructure etmek için.
`state` ve resolver render kapsamında zaten erişilebilir. **Kanıt:** çağrıyı
bileşenin tepesine (`progressLabel` emsali, `:100` civarı) taşımak davranışı
değiştirmez (saf fonksiyon, render başına bir çağrı) ve iki satır JSX gürültüsü
kalkar. **Sorumlu:** frontend.

### L-E · `low` · `apps/api/eslint.config.mjs:271-425`

⚠ **Önce doğrulama (brief'in asıl sorusu): invaryant KORUNMUŞ.** Altı blok yol
düzeyinde **ayrık**: (1) `src/**/*.ts` eksi `main.ts`/`validation`/`prisma`/`auth`/
`__tests__`/`queue/jobs`; (2) `src/main.ts`; (3) `src/validation/**`; (4a)
`src/prisma/**`+`src/auth/**`; (4b) `src/__tests__/**`; (5) `src/queue/jobs/**`.
İkili kesişim yok (yol yapısı gereği). (4b), eski (4)'ün seçenek kümesiyle **birebir**
aynı; yeni `noTestHelpersImportRestriction` **beş üretim bloğunun beşine** de
eklenmiş (1/2/3/4a/5), 4b'ye bilerek **eklenmemiş** — aksi hâlde `create-test-app.ts`
kendi helper'ını import ederken kırmızı olurdu. **Ek risk eksenini ölçtüm:**
`apps/api`'de `src/__tests__/**` DIŞINDA test dosyası **yok**
(`Glob apps/api/src/**/*.test.ts` → 108 eşleşme, **108'i** `src/__tests__/` altında)
⇒ üretim blokları hiçbir test dosyasını yakalamıyor, yanlış-pozitif yüzeyi bugün boş.

**Bulgu, doğrulanabilirlik hakkında:** invaryant artık 6 blok × 6 kısıtlama = **36
el ile tutulan hücre** ve onu doğrulayan **mekanik hiçbir kapı yok** — yalnızca
yorum. **NEGATİF KANIT:** blok (1)'in `ignores`'undan `'src/queue/jobs/**'`'ı silsem
iki blok aynı dosyaya düşer, (5) (1)'i **tamamen** değiştirir; (5) bugün üst küme
olduğu için lint **yeşil** kalır ve hiçbir test kırılmaz ⇒ yorumun kendi anlattığı
("kaybı LINT YAKALAMAZ") sessiz kayıp sınıfı bugün **ölçülemez**. Ucuz pin:
`ESLint#calculateConfigForFile` ile altı temsilci dosya için `no-restricted-imports`
seçenek kümesinin beklenen kısıtlamaları içerdiğini assert etmek (eslint zaten
devDependency; yeni bağımlılık **gerekmez**). **Sorumlu:** devops/backend (borç).

### L-F · `low` · `apps/api/src/__tests__/rate-limit-policy.test.ts:153`

`routeKey.split(' ', 2) as [string, string]` — runtime doğrulaması olmayan `as`
(CLAUDE.md §2); dosyadaki aynı desenin **4. kopyası** (`:72`, `:88`, `:111` bu turdan
önce vardı, `:153` yeni). **Kanıt:** boşluk taşımayan bir `routeKey` literali
eklenirse `path` çalışma zamanında `undefined` olur ama tipi `string` kalır ⇒ anlamsız
hata; bugün girdiler literal olduğu için zarar **sıfır** (bu yüzden `low`). Öneri:
`it.each` girdilerini `['GET', '/trpc/…']` tuple'ları yapmak — `as` tamamen kalkar.
**Sorumlu:** backend (borç).

---

## Brief'in sorduğu iki tasarım sorusuna gerekçeli görüş

**(2) `planLimitsSchema` servis dosyasının İÇİNDE — katman ihlali mi?**
**Hayır, ihlal değil ve bugünkü yer DOĞRU.** Üç gerekçe: (a) şema 6 satır ve **tek**
tüketicisi var (`:212`); erken ayrı dosya bu gate'in KISS maddesinin tam olarak
uyardığı şey olurdu. (b) `apps/api` iş mantığının evi (CLAUDE.md §3); `plan.limits`
hiçbir tRPC çıktısına çıkmıyor ⇒ `packages/trpc`'ye ait değil, `packages/db` ise
"iş mantığı yapmaz" ⇒ oraya da ait değil. `jobPayloadBaseSchema` emsali aynı yerde.
(c) `AC-13`'ün invaryantı **fazla katı değil**: kısıt bir **dosya allowlist'i**
(`registration.test.ts:517` `ALLOWED_LIMITS_FILE`) ve ikinci meşru bir okuyucu
doğduğunda (v0.17.0 enforcement) tek sabiti `ReadonlySet`'e çevirmek **gevşetme
değil, ifade düzeltmesi** olur. ⇒ Bulgu yazmıyorum. Ajanın "testi gevşetmek yerine
çözümü değiştir" refleksi doğruydu. Tek kalıntı: `PlanLimits` tipi `export` ama
yalnızca kendi dosyasında kullanılıyor (`:179`) — ölçüldü, zararsız, bulgu değil.

**(3)+(4) `create-test-redis-connection.ts` kırılganlığı ve koşulsuz override.**
Dış kütüphanenin iç davranışına bağımlılık **gerçek** ama (a) ölçülmüş ve dosya
başında belgelenmiş, (b) `ioredis` tip tanımında alan `readonly` değil, (c) alternatif
(`RedisConnectionProfile`'a üçüncü değer) üretim union'ını kirletirdi ve R-A4'ü
delerdi ⇒ **seçim doğru**. Eksik olan tek şey o davranışın pini = **M-A**.
Koşulsuz override **bugün hiçbir kapsamı silmiyor**: üretim profili `createTestApp`'ten
**bağımsız** olarak `redis-connection-profiles.test.ts:254-259`'da test ediliyor ve
1500 orada pinli. Kalan tasarım riski ("ileride biri `createTestApp` üzerinden
fail-fast zamanlaması test etmeye kalkarsa sessizce 4000 ölçer") bugün **hiçbir
assert'e dokunmuyor** ⇒ ayrı bulgu yazmıyorum; M-A'nın önerdiği iki satırlık pin
bu riski de görünür kılar (iki eşik aynı dosyada yan yana durur).

**(5) `StoreWizard.tsx`'in iki `<p>`'si — ayrım korunmuş mu?** **Evet.** Karar
mantığının tamamı saf `.ts`'te (`resolveSlugCheckDisplayMessages`, `'checking'` ↔
sonuç ↔ taşıma hatası önceliği dahil) ve testi mutasyon notuyla birlikte var
(`slug-outcome-message.test.ts:54`, `:70`). `.tsx` yalnızca `!== null` kontrolü +
sınıf dizesi taşıyor. Kalan iki kusur sunum ekseninde ve `low`: L-B, L-D.

---

## Tur 1'in 11 `low`'unun durumu (`docs` teknik borç için)

**11/11 DURUYOR; hiçbiri kendiliğinden kapanmadı.** Yeni refaktörler tur 1
`low`'larının hiçbirine dokunmadı (M1 düzeltmesi yeni dosya açtı, yerinde temizlik
yapmadı). Güncel satır numaraları:

- `slug.ts:64,80,83` — iki paralel katlama listesi: DURUYOR.
- `trpc-rate-limited-paths.ts:54` — `isTrpcRateLimitedPath` ölü export: DURUYOR
  (repo kökü taraması: tek eşleşme kendi tanımı).
- `slug-outcome-message.ts:24,87-104` — ölü eşleme + yalnızca testin okuduğu sayaç:
  DURUYOR (yeni L-C ile **üçüncü** fazla-geniş yüzey).
- `registration-query.ts:113,135` — `deriveFallbackNameFromEmail`: DURUYOR
  (`architect` kararı bekliyor).
- `registration.test.ts:114` — `.catch(() => undefined)`: DURUYOR.
- `registration-flow.spec.ts:328` — 400 ms yarışı: DURUYOR; yorum genişletildi
  (`:342-349`) ama mekanizma aynı.
- `registration-flow.spec.ts:42,46,50,51` + `e2e/helpers/` — elle predicate +
  `as Record<string, unknown>`: DURUYOR (ortak Zod zarf parser'ı borcu).
- `StoreWizard.tsx:58-63` — `resolveStepProgressLabel` iç içe ternary + sabit `'3'`:
  DURUYOR.
- `StoreWizard.tsx:168-178, 257-…` + `_app.kurulum.$slug.tsx` — adım başlığı bloğu
  3+1 tekrar: DURUYOR.
- `registration.service.ts:249` — `limits: trialPlanLimits ?? {}`: DURUYOR **ve
  niteliği değişti**: `:188` ve `:214`'teki iki fırlatma dalı eklendikten sonra
  `?? {}` **erişilemez** hâle geldi ⇒ artık "sessiz varsayılan" + "ölü dal". Hâlâ
  `low` (davranış pinli, `registration.test.ts:476`).
- `packages/tenancy/package.json:6` — bayat `description`: DURUYOR.

---

## Baktığım ama TEMİZ çıkan YENİ eksenler

1. **Tekrar (DRY) gerçekten kapandı:** `_auth.sign-in.tsx`'te kalıntı fonksiyon yok,
   iki rota tek evi tüketiyor; yeni modül mesaj kümesini **parametre** alıyor ⇒
   "farklı sebeplerle değişecek iki şeyi birleştirme" tuzağına düşmemiş (metinler
   çağırana ait, Zod sözlüğü ortak eve ait — doğru kesim çizgisi).
2. **Katman ve bağımlılık yönü:** yeni dosyaların hiçbiri sınır geçmiyor.
   `apps/admin/src/errors/` yalnızca `messages`'a bakıyor; `packages/ui`'ye
   dokunulmamış; `packages/db` iş mantığı almamış (şema `apps/api`'de kaldı);
   test-only Redis profili `src/__tests__/` içinde ve dört katmanla üretimden ayrık.
   Döngüsel bağımlılık yok. **Tek istisna M-B** (test↔test modül bağı).
3. **Sağlayıcı dallanması:** `if (provider === …)` sınıfı yeni kodda **yok**; oran
   sınırı guard'ı (`rate-limit.policy.ts:155-169`) üçüncü küme eklenirken
   **gevşetilmedi** — üç kümeden hiçbirine ait olmayan `routeKey` hâlâ modül
   yüklenirken fırlatıyor, ve `rate-limit-policy.test.ts:146-164` üç yeni rotanın
   politikasını **tam nesne eşitliğiyle** pinliyor.
4. **Hata yönetimi:** yeni kodda yutulan hata yok. `registration.service.ts:188`/`:214`
   iki ayrı yapılandırma bozukluğunu **loud** fırlatıyor (`ValidationError` değil —
   doğru, kullanıcı girdisi değil); `isForeignProcessAlive`'ın `catch`'i gerekçeli ve
   temkinli yönde; `create-test-app.ts:556-559` hatayı sarmalamadan **yeniden
   fırlatıyor** ve kaynağı temizliyor; `resolveShapeErrorMessage` fail-closed.
5. **Test kalitesi (yeni):** `plan-limits-schema.test.ts` **7 negatif vaka** taşıyor
   (eksik anahtar, yanlış tip, negatif, ondalık, boş nesne, `null`, dizi) — mutlu yol
   dışı kapsam gerçek. `resolve-shape-error-message.test.ts` tablo tabanlı ve her Zod
   literalini ayrı pinliyor. `test-harness-redis-profile-isolation.test.ts`'in
   "kapı vacuous değil" testi (`:121`) **saf tarayıcıyı** sentetik kaynakla ölçüyor —
   mock fazlalığı yok. `tenant-context-new-tenant.test.ts` pinleri implementasyon
   değil **tip sözleşmesi** doğruluyor.
6. **Tip disiplini:** yeni kodda `any` 0, `@ts-ignore` 0. `apps/admin`'deki tek
   `as any` kümesi `src/routeTree.gen.ts` (**üretilen** dosya, CLAUDE.md §2 istisnası,
   bu turdan bağımsız).
7. **İsimlendirme:** yeni dosyalar kebab-case, tipler PascalCase
   (`ShapeErrorFieldMessages`, `SlugCheckDisplayMessages`), sabitler
   SCREAMING_SNAKE_CASE, `has`/`is` önekleri yerinde (`hasTransportError`,
   `isForeignProcessAlive`). `data`/`temp`/`handle`/`process` gibi belirsiz ad yok
   (`refreshResult`, `takeoverResult`, `limitsParseResult` — hepsi anlamlı).
8. **Yorum kalitesi:** yeni yorumların ezici çoğunluğu **neden**i anlatıyor ve
   ölçümle destekli; Türkçe. Tek yanlış/bayat yorum **L-A**.

---

## DOĞRULANAMADI (açıkça — `Bash` yok)

- `pnpm lint` / `typecheck` / `test` / `test:isolation` / `build` / `guards` çıktıları.
  Orkestratör'ün ve diğer ajanların ölçümlerini **devralmadım, tekrar etmedim**.
- `@arkesoft/admin` test tabanının 167 → 175 olması; yeni dosyada **7** `it` saydım,
  handoff **+8** diyor ⇒ 1 testin kaynağı ölçülemedi.
- `M-B`'nin çift koşumunun **vitest çıktısıyla** birebir teyidi. Aritmetik (3 + 10 =
  `qa`'nın raporladığı 13) kapatıyor ama ham çıktıyı ben üretmedim.
- `git show --stat` / `git diff` — inceleme yüzeyi handoff'un dosya listesi +
  `Glob`/`Grep` keşfiyle kuruldu.
- ESLint'in `patterns` eşleşmesinin göreli yollarda (`../__tests__/…`) **fiilen**
  tetiklendiği: `qa` tur 3 bunu ölçmüş (raporuna göre sentetik ihlal satırı eklenip
  geri alındı); ben **ölçemedim**, onun ölçümünü devralmıyorum.

## ⚠ ÖLÇÜM TUZAĞI (sonraki ajan okusun — `AGENT_BASELINE` §5 sınıfı)

`Grep`'i **açık `path` vermeden** çağırmak bu oturumda kökü `apps/api` (cwd) olarak
çözdü: `TURKISH_CASE_FOLD_SOURCE` ve `deriveFallbackNameFromEmail` için **"No matches
found"** döndü ve bu, "tur 1'in iki `low`'u kendiliğinden kapandı" gibi **yanlış** bir
sonuca neredeyse yazıldı. Açık repo kökü verilerek tekrarlandığında ikisi de yerinde
bulundu (`packages/tenancy/src/slug.ts:80`, `apps/admin/src/api/registration-query.ts:113`).
**Kural:** repo geneli iddia üreten her `Grep` çağrısına **mutlak `path`** verilecek;
boş çıktı, yol doğrulanmadan "yok" sayılmayacak.
