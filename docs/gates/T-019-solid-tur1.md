# T-019 — `solid` gate, TUR 1

- **Tarih:** 2026-11-14
- **Sürüm:** ROADMAP v0.1.0 (platform 0.8.0 → 0.9.0)
- **Dal:** `feat/v0.0.21-surum-kayit-modeli`
- **Araç kısıtı:** Bash YOK. Tüm ölçümler `Read`/`Grep`/`Glob` ile yapıldı. `git show --stat 9d33820`
  **çalıştırılamadı** → inceleme yüzeyi `T-019.md` üretim loglarındaki dosya listeleri +
  `Glob`/`Grep` keşfiyle kuruldu (aşağıda "Yüzey" bölümü).

```
GATE: solid
SONUÇ: FAIL
BULGULAR:
  - [SEV: medium] apps/admin/src/routes/_auth.kayit.tsx:49-85 — `_auth.sign-in.tsx:70-90`'ın BİREBİR kopyası (aynı fonksiyon adları, aynı Zod `type` literalleri); üçü de modül-private ve `.tsx` içinde ⇒ yapısal olarak test edilemez — frontend
  - [SEV: medium] apps/admin/src/features/registration/OnboardingChecklistCard.tsx:75-77 — `pendingBanner` sorgu durumundan BAĞIMSIZ, KOŞULSUZ render ediliyor: yükleniyor ve HATA dallarında da kiracı durumu hakkında iddia basıyor — frontend
  - [SEV: medium] packages/db/src/tenant-context.ts:142 — `PlatformTenantWriter` `plan` delegesine TAM DML yetkisi veriyor; doc "OKUMASI için" diyor. `withNewTenant()` bu eksende YENİ yetki veriyor — db
  - [SEV: medium] apps/api/src/__tests__/helpers/create-test-app.ts:134-151 — "üçüncü fail-closed kapı" ATOMİK DEĞİL (GET→SET, TOCTOU) + pid yeniden kullanımı + marker koşumdan uzun yaşıyor ⇒ kapı hem korumayı kaçırabiliyor hem kendi flake'ini üretebiliyor — backend
  - [SEV: low] packages/tenancy/src/slug.ts:64-80 — `TURKISH_CASE_FOLD` anahtarları ile `TURKISH_CASE_FOLD_SOURCE` karakter sınıfı İKİ PARALEL liste; sapma SESSİZ no-op — backend
  - [SEV: low] apps/api/src/auth/rate-limit/trpc-rate-limited-paths.ts:38-40 — `isTrpcRateLimitedPath` ÖLÜ export (sıfır çağıran, testi de yok) — backend
  - [SEV: low] apps/admin/src/features/registration/slug-outcome-message.ts:24,50-67 — `resolveSlugFieldErrorMessage`+`FIELD_ERROR_KEY_BY_OUTCOME` sıfır üretim tüketicisi (canlı tablo `store-wizard-controller.ts:85-93`); `SLUG_LIVE_STATUS_MESSAGE_KEY_COUNT` yalnızca testin okuduğu sayaç — frontend
  - [SEV: low] apps/admin/src/api/registration-query.ts:113-116 — `deriveFallbackNameFromEmail`: KALICI bir alanın (`User.name`) DEĞERİ sunum katmanında icat ediliyor — architect/ux kararı gerekiyor
  - [SEV: low] apps/api/src/__tests__/registration.test.ts:114 — `.catch(() => undefined)` temizlik hatasını SESSİZCE yutuyor (S14'ün artık-satır flake sınıfı) — backend
  - [SEV: low] apps/admin/e2e/registration-flow.spec.ts:326-341 — "yükleniyor" assertion'ı sabit 400 ms sahte gecikmeyle YARIŞIYOR (flake üreteci) — frontend
  - [SEV: low] apps/admin/e2e/helpers/verified-fixture-user.ts:42-54 · apps/admin/e2e/registration-flow.spec.ts:38-53 — dış JSON elle yazılmış, EKSİK tip predicate'i + `as Record<string, unknown>` ile daraltılıyor (Zod yok, CLAUDE.md §4) — frontend/devops (borç)
  - [SEV: low] apps/admin/src/features/registration/StoreWizard.tsx:58-63 — `resolveStepProgressLabel`: ayrımlı birleşim üzerinde iç içe ternary + sabit `'3'`, tamlık (`assertNever`) guard'ı YOK — frontend
  - [SEV: low] apps/admin/src/features/registration/StoreWizard.tsx:142-151,169-178,242-251 — adım başlığı bloğu (ilerleme `<p>` + `<h1>` + birebir aynı sınıf dizesi) ÜÇ kez tekrar (4. kopya `_app.kurulum.$slug.tsx:32-38`) — frontend
  - [SEV: low] apps/api/src/registration/registration.service.ts:199 — `trialPlanLimits ?? {}`: iş açısından kritik anlık görüntü kolonunda SESSİZ varsayılan (testle pinli olduğu için low) — backend
  - [SEV: low] packages/tenancy/package.json:6 — `description` bayat: paket artık slug gramerinin de tek evi — docs
ÖLÇÜMLER: incelenen dosya 41 · üretim kodunda `any` 0 · `@ts-ignore`/`@ts-expect-error` 0 · gerekçesiz `as` 0 (üretim), 6 (yeni e2e, elle predicate içinde) · en büyük fonksiyon: `StoreWizard()` 238 satır (JSX; karar mantığı dışarıda) — en büyük mantık fonksiyonu `RegistrationService.onboardingChecklist()` 51 satır · `TENANT_SLUG_PATTERN` kaynak ağaçlarında tam 1 literal · `app.tenant_id` üretim kodunda tam 1 ev · ÖLÜ export 2 · boş `catch` 0
```

---

## Yüzey (ölçüldü, uydurulmadı)

`git show --stat 9d33820` **çalıştırılamadı (Bash yok) → DOĞRULANAMADI**. Yüzey şöyle kuruldu:
Task dosyasının üretim loglarındaki dosya listeleri + `Glob` ile dizin keşfi + `Grep` ile
`T-019`/`v0.1.0` atıf taraması. İncelenen 41 dosya:

- `packages/tenancy`: `slug.ts`, `resolve-host.ts`, `index.ts`, `package.json`, `__tests__/slug.test.ts`
- `packages/db`: `tenant-context.ts`, `client.ts` (ilgili bloklar), `seed-data.ts`, `seed.ts` (ilgili bloklar), `__tests__/tenant-context-new-tenant.test.ts`
- `packages/trpc`: `schemas/registration.schema.ts`, `routers/registration.router.ts`, `authz/procedure-surface.ts`, `ports/registration-{read,write}.port.ts`
- `apps/api`: `registration/registration.service.ts`, `registration/registration.module.ts`, `trpc/ports/registration-{read,write}.port.adapter.ts`, `trpc/ports/storefront-tenant-read.port.adapter.ts`, `tenancy/tenant-lifecycle-state.ts`, `tenancy/tenant-resolver.service.ts` (ilgili bloklar), `tenancy/tenant-exempt-paths.ts`, `auth/rate-limit/trpc-rate-limited-paths.ts`, `auth/rate-limit/rate-limit.policy.ts` (ilgili bloklar), `prisma/prisma.service.ts` (ilgili blok), `__tests__/registration.test.ts`, `__tests__/tenant-lifecycle-state.test.ts`, `__tests__/helpers/create-test-app.ts`
- `apps/admin`: `errors/panel-error.ts`, `errors/normalize-panel-error.ts`, `api/registration-query.ts`, `features/registration/*` (8 dosya), `routes/_auth.kayit.tsx`, `routes/_app.magaza-olustur.tsx`, `routes/_app.kurulum.$slug.tsx`, `routes/_app.index.tsx`, `messages/messages.ts` (ilgili bloklar), `vitest.config.ts`
- commit'lenmemiş e2e: `e2e/registration-flow.spec.ts`, `e2e/helpers/verified-fixture-user.ts`, `e2e/panel-flow.spec.ts` (yalnızca metin düzeltmeleri)

⚠ `apps/admin/playwright.config.ts`'in bütçe yorum bloğu brief gereği **kapsam dışı**
bırakıldı (başka ajan güncelliyor).

---

## FAIL gerekçesi

`AGENT_BASELINE §4`: **3 veya daha fazla `medium` → FAIL.** Dört `medium` var.
**`critical`/`high` SIFIR** — yani kapıyı kapatan bulguların hiçbiri davranış hatası,
izolasyon ihlali veya kabul kriteri ihlali değil; dördü de **yerel ve mekanik** düzeltmeler.

| Bulgu | Düzeltme gidecek ajan | Tahmini dokunulan dosya                                                                 |
| ----- | --------------------- | --------------------------------------------------------------------------------------- |
| M1    | `frontend`            | 2 (yeni ortak `.ts` + `_auth.kayit.tsx`); `_auth.sign-in.tsx` **isteğe bağlı** (kapsam) |
| M2    | `frontend`            | 1 (+ `registration-flow.spec.ts`'in `:336-340` pini taşınır)                            |
| M3    | `db`                  | 1 (+ `tenant-context-new-tenant.test.ts`'in `plan.upsert`'ü)                            |
| M4    | `backend`             | 1                                                                                       |

---

## Bulgular — ayrıntı ve NEGATİF KANIT

### M1 — `medium` · `apps/admin/src/routes/_auth.kayit.tsx:49-85`

Üç fonksiyon (`resolveEmailFieldErrorMessage`, `resolvePasswordFieldErrorMessage`,
`resolvePasswordConfirmFieldErrorMessage`) Zod `error.type` dizesini (`'too_small'`,
`'invalid_format'`, `'custom'`) mesaja eşliyor. İlk ikisi `_auth.sign-in.tsx:70-90`'da
**aynı adlarla ve aynı dal yapısıyla** zaten var (ölçüldü, `Grep`); fark yalnızca
`MESSAGES` anahtarları.

**Neden sorun (yüzeysel benzerlik değil):** ortak değişme sebebi **Zod'un hata kodu
sözlüğü**, metinler değil. Zod bir majorda `too_small`'ı yeniden adlandırırsa **iki
dosyadaki dört fonksiyon** birlikte değişmek zorunda.

**NEGATİF KANIT:** `apps/admin/vitest.config.ts:21` → `include: ['src/**/*.test.ts', …]`
ve bu üç fonksiyon **`export` edilmemiş** (modül-private, `.tsx` içinde) ⇒ hiçbir test
onları çağıramaz. `'invalid_format'` dalını `'invalid_string'` yapsam **tek test bile
kırılmaz**, kullanıcı sessizce `fieldGenericError` görür. S6 KARAR 2'nin ("karar mantığı
`.ts` controller'larda, `.tsx` yalnızca sunum") tam olarak engellemek istediği sınıf bu.

**Önerilen düzeltme:** mesaj üçlüsünü parametre alan tek bir saf `.ts` modülü
(ör. `apps/admin/src/errors/zod-field-error-message.ts`) — hem tekrar kapanır hem
`*.test.ts` kapsamına girer. `_auth.sign-in.tsx`'i güncellemek kapsam kararı
(Orkestratör); güncellenmezse borç satırı kalır.

### M2 — `medium` · `apps/admin/src/features/registration/OnboardingChecklistCard.tsx:75-77`

`MESSAGES.dashboard.onboarding.pendingBanner` (_"Mağazan oluşturuldu ama henüz
ziyaretçilere açık değil…"_, `messages.ts:411-412`) `isPending`/`isError`/`isSuccess`
dallarının **hepsinden önce**, koşulsuz basılıyor.

**Neden sorun:** (a) **hata dalında** panel aynı ekranda hem _"Kurulum durumun şu anda
yüklenemedi"_ (`:92`) hem _"mağazan oluşturuldu ama yayında değil"_ diyor — okuyamadığımız
bir durum hakkında iddia. (b) Çıktı şeması `status` **taşımıyor** (bilinçli,
`registration.schema.ts:241-244`), dolayısıyla bu cümlenin doğruluğu yalnızca _"v0.1.0'da
aktivasyon yolu yok"_ tesadüfüne dayanıyor.

**NEGATİF KANIT:** `seed.ts:206` demo kiracıyı `status: TenantStatus.active` yazıyor ve
`:245-317` o kiracıya `owner` üyeliği + abonelik veriyor. O kullanıcı
`/kurulum/demo-magaza`'yı açtığında **AKTİF** bir mağaza için _"henüz ziyaretçilere açık
değil"_ yazısını görür — ve bunu yakalayan **tek assert yok**; tersine
`registration-flow.spec.ts:336-340` banner'ın **yükleniyor** anında görünür olmasını
PİNLİYOR, yani yanlış davranış teste gömülmüş durumda. v0.2.0 `tenant.provision`
kiracıyı `active`'e çektiği anda bu cümle üretimde yalan olur.

**Önerilen düzeltme:** banner'ı `checklistQuery.isSuccess` dalının içine al (tek satır
taşıma) **ve** e2e'deki yükleniyor-anı assert'ini banner'dan `Skeleton`/liste yokluğuna
çevir. Durumu gerçekten iddia etmek isteniyorsa o `architect` işi (tel sözleşmesine
`status`, vadesi v0.3.0) — bu turda **istenmiyor**.

### M3 — `medium` · `packages/db/src/tenant-context.ts:142`

```ts
export type PlatformTenantWriter = Pick<TransactionClient, 'tenant' | 'plan'>
```

Doc (`:129-141`) gerekçeyi _"`plan` (kayıt akışının `trial` planını **OKUMASI** için)"_
diye yazıyor; tip ise `plan` delegesinin **tamamını** (create/update/upsert/delete)
veriyor.

**Neden sorun:** bu dosyanın kendi felsefesi bağlayıcı biçimde yazılı —
`client.ts:207-212` _"Allowlist'te KULLANILMAYAN üye TUTMAK allowlist'in değerini
düşürür"_ diyerek `$disconnect`'i bile dışarıda bırakmış. `withNewTenant()`'ın doc'u
(`:166-169`) _"BU FONKSİYON YENİ BİR YETKİ VERMEZ"_ diyor; `plan` ekseninde bu **doğru
değil**: `withTenant()` callback'i (`TenantTransactionClient`, `client.ts:284-287`)
`plan`'ı **hiç** görmez, `withNewTenant()`'ın `insertTenant` fazı ise ona yazabiliyor.

**NEGATİF KANIT:** `registration.service.ts`'in `insertTenant` bloğuna
`await tx.plan.delete({ where: { id: TRIAL_PLAN_ID } })` yazsam **derlenir** — kayıt
yolundan platform fiyatlandırma satırı silinebilir. `plan: Pick<TransactionClient['plan'],
'findUnique'>` ile yazılsa aynı satır `typecheck` kapısında kırılırdı. Ayrıca
`tenant-context-new-tenant.test.ts:76-80` bu fazda `plan.upsert` çağırarak boşluğu
**fiilen kullanıyor**, yani fark yalnızca teorik değil.

**Önerilen düzeltme:** `PlatformTenantWriter`'ı
`Pick<TransactionClient, 'tenant'> & { readonly plan: Pick<TransactionClient['plan'], 'findUnique'> }`
biçiminde daralt; testteki `plan.upsert` fixture'ını `testMigrationPrisma` ile
transaction dışına taşı. Prisma delege tipi `Pick`'lenemiyorsa (uygulayan ajan ölçsün)
asgari eylem **doc'u düzeltmek**: granted yetkinin yazma içerdiğini ve neden daraltılamadığını
yazmak — sessiz bırakmak kabul edilemez.

### M4 — `medium` · `apps/api/src/__tests__/helpers/create-test-app.ts:134-151`

Orkestratör'ün devrettiği açık bulgunun **kod kalitesi** değerlendirmesi.

`assertSoleRunOwnership()` bir "run-owner" marker'ı ile eşzamanlı koşumu tespit ediyor.
Üç yapısal kusur:

1. **Atomik değil.** `GET` (`:136`) → karar (`:138-148`) → `SET` (`:150`). İki koşum
   aynı anda başlarsa ikisi de `null` okur, ikisi de kendi ppid'ini yazar ve **ikisi de**
   `platform:auth:*` namespace'ini siler. Yani kapı, **tam olarak kurulduğu senaryoda**
   (eşzamanlı başlangıç) açık kalıyor. `SET … NX` + dönen değerin kontrolü pencereyi
   kapatır.
2. **pid yeniden kullanımı.** `isForeignProcessAlive(foreignPid)` (`:113-126`) o pid'in
   **bizim süreç ailemize ait olup olmadığını** sınamıyor; işletim sistemi pid'i geri
   dönüştürdüyse ilgisiz bir süreç "canlı yabancı koşum" sayılır ve `createTestApp()`
   **gürültülü** patlar. Hata metni (`:143`) o durumda **yanlış teşhis** verir.
3. **Marker koşumdan uzun yaşıyor.** TTL 120 sn ve **her** `createTestApp()` çağrısında
   tazeleniyor (`:150`); 30+ dosyanın ortak bağımlılığı olduğu için pratikte koşumun
   sonuna kadar diri kalır ve bitişten sonra 2 dakika daha durur. İki koşum **ardışık**
   olsa bile, ikinci koşumun ppid'i farklı olduğu için birinci koşumun ppid'inin
   "ölü" olduğuna karar verilmesine bağımlı hâle gelir.

**NEGATİF KANIT (mekanizma):** `:150`'yi `SET … NX` yapıp dönüşü kontrol etseydim 1.
madde kapanırdı; bugünkü kodda iki `createTestApp()`'i aynı milisaniyede başlatan bir
koşum **hiçbir hata üretmeden** birbirinin sayaçlarını siler — S7'nin kendi ölçtüğü
kirlenme senaryosunun aynısı. 3. madde için: marker'ı el ile silip ikinci koşumu TTL
içinde başlatmak davranışı değiştirir, yani sonuç **zamana bağımlı** — bir fail-closed
kapıda istenmeyen özellik.

**Kök `pnpm test` 19/20 flake'i hakkında kararım:**

- Flake'in **kendisi** `solid`'in kapısı **değil** — `pnpm test` zorunlu kapıdır ve
  kırmızılığının FAIL kararı `qa`'ya + `release`'e aittir. Ben koşum yapamadım
  (Bash yok) ⇒ **hangi testin düştüğü DOĞRULANAMADI**, S7'nin kapısının mı tetiklendiği
  **DOĞRULANAMADI**.
- Ama **statik olarak incelenebilen** şey şu: S7'nin çözümü _izolasyon_ değil _tespit_
  seçti (kendi raporu bunu dürüstçe yazıyor: üretim anahtar biçimini süreç kapsamlı DI
  token'a çevirmek `auth.module.ts` gerektiriyordu, kapsam dışı bırakıldı). Tespit
  mekanizması yukarıdaki üç kusurla **hem yanlış-negatif hem yanlış-pozitif** üretebiliyor
  ⇒ kök koşumdaki flake'in **yeni sebebi bu kapının kendisi olabilir** ve bu, eski
  flake'i yenisiyle değiştirmek anlamına gelir.
- **Karar:** (a) 1. ve 2. maddenin düzeltmesi **bu turda** `backend`'e gider (medium,
  tek dosya, ~10 satır). (b) Üretim anahtar biçiminin süreç kapsamına alınması
  (`auth.module.ts`) **teknik borç satırı** olarak kalır — kapsam değişikliği gerektirir,
  gate ajanı kapsam açmaz. (c) Flake'in **kök nedeni** `qa`'nın ölçmesi gereken bir
  kalem olarak kalır; `qa` koşarken S7 kapısının hata metninin (`:143`) çıktıda görünüp
  görünmediğini **özellikle** raporlamalı — görünüyorsa sebep bu kapı, görünmüyorsa
  başka bir eksen var.

### Düşük önemli bulgular

| SEV | dosya:satır                                                                                                | Bulgu / negatif kanıt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Sorumlu       |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| low | `packages/tenancy/src/slug.ts:64-80`                                                                       | `TURKISH_CASE_FOLD` (13 anahtar) ile `TURKISH_CASE_FOLD_SOURCE` karakter sınıfı elle hizalı iki liste. **Kanıt:** tabloya `Æ: 'ae'` eklesem regex onu yakalamaz, `?? char` (`:83`) sessizce kimlik dönüşümü yapar, NFD de ayrıştıramaz ⇒ sessiz no-op, sıfır test kırılması. Düzeltme: regex'i `Object.keys()`'ten üret.                                                                                                                                                                                                                                                                                       | backend       |
| low | `apps/api/src/auth/rate-limit/trpc-rate-limited-paths.ts:38-40`                                            | `isTrpcRateLimitedPath` **ölü export**: repoda tek eşleşme kendi tanımı (`Grep`, `-r`). Politika `TRPC_RATE_LIMITED_PATHS`'i doğrudan kullanıyor (`rate-limit.policy.ts:158`). **Kanıt:** fonksiyonu silsem lint/typecheck/test yeşil kalır.                                                                                                                                                                                                                                                                                                                                                                   | backend       |
| low | `apps/admin/src/features/registration/slug-outcome-message.ts:24,50-67`                                    | `resolveSlugFieldErrorMessage` + `FIELD_ERROR_KEY_BY_OUTCOME`'ın **sıfır üretim tüketicisi** var (yalnızca kendi testi); canlı eşleme ters yönde `store-wizard-controller.ts:85-93`'te elle ikinci kez yazılı. **Kanıt:** iki tabloda birer değeri karşılıklı olarak yanlış eşlesem (`taken↔reserved`) `satisfies` ikisini de geçirir, derleyici sapmayı görmez; bugün etkisi yok çünkü biri ölü. `SLUG_LIVE_STATUS_MESSAGE_KEY_COUNT` ise yalnızca `toBe(5)` için var — `satisfies Record<SlugAvailabilityOutcome, string>` (`:22`) tamlığı **zaten** derleme zamanında zorluyor, sayaç ek garanti üretmiyor. | frontend      |
| low | `apps/admin/src/api/registration-query.ts:113-116`                                                         | `deriveFallbackNameFromEmail` kalıcı `User.name` alanının değerini **sunum katmanında** icat ediyor (e-postanın `@` öncesi). Bugünkü zarar **ölçülmüş sıfır** (S10: `User.name` panelde hiç okunmuyor), bu yüzden low. Ama ikinci bir istemci geldiğinde ikinci bir kural doğar; doğru yer sunucu tarafı. Karar `architect`/`ux`'in.                                                                                                                                                                                                                                                                           | architect     |
| low | `apps/api/src/__tests__/registration.test.ts:114`                                                          | `.catch(() => undefined)` — `afterAll` temizliğindeki silme hatası **sessizce** yutuluyor (CLAUDE.md §10 md 16 deseni). **Kanıt:** FK/RLS sebebiyle silme başarısız olsa artık satırlar sessizce birikir; S14'ün **tam bu sınıfta** (artık satır) bir sürüm harcadığı ölçülmüş. En azından `console`/logger yerine hatayı yeniden fırlatmayan ama **sayan** bir sarmalayıcı.                                                                                                                                                                                                                                   | backend       |
| low | `apps/admin/e2e/registration-flow.spec.ts:326-341`                                                         | "yükleniyor" anı sabit **400 ms** sahte gecikmeyle yarışıyor: `:336`'daki banner beklemesi 400 ms'yi aşarsa `:341`'in `toHaveCount(0)`'ı 5 sn boyunca kırmızı döner. **Kanıt:** gecikmeyi 40 ms yapsam test deterministik olarak düşer ⇒ eşik makineye bağımlı. Deterministik alternatif: route'u açıkça çözülen bir promise ile tut.                                                                                                                                                                                                                                                                          | frontend      |
| low | `apps/admin/e2e/helpers/verified-fixture-user.ts:42-54` · `apps/admin/e2e/registration-flow.spec.ts:38-53` | Dış JSON (Mailpit, tRPC zarfı) elle yazılmış ve **eksik** tip predicate'leriyle + `as Record<string, unknown>` ile daraltılıyor; CLAUDE.md §4 "dış dünyadan gelen her veri Zod ile parse edilir" diyor. **Kanıt:** Mailpit `{messages:[1,2]}` dönse `isMailpitMessagesListResponse` **true** döner ve `:71` `address.Address` üzerinde `TypeError` fırlar — temiz hata yerine kripto bir çökme. ⚠ Desen **önceden var** (`panel-flow.spec.ts`, `session-security-dialog-focus.qa.spec.ts`, `two-factor-rest.ts`) ⇒ bu turda tek dosya düzeltmesi değil, **ortak Zod tabanlı zarf parser'ı** borç satırı.       | frontend/docs |
| low | `apps/admin/src/features/registration/StoreWizard.tsx:58-63`                                               | `resolveStepProgressLabel` ayrımlı birleşim üzerinde iç içe ternary + sabit `'3'`; CLAUDE.md §4 "exhaustive `switch` + `assertNever`" diyor. **Kanıt:** `StoreWizardStep`'e 4. değer eklesem hem `stepNumber` `'3'` kalır hem toplam `'3'` kalır ⇒ "3/3" yalanı, sıfır derleme hatası. (Aynı dosyadaki `resolveSlugStatusTextColorClassName`'in fallback'i **anlamlı** olduğu için bulgu değil.)                                                                                                                                                                                                               | frontend      |
| low | `apps/admin/src/features/registration/StoreWizard.tsx:142-151,169-178,242-251`                             | Adım başlığı bloğu (ilerleme `<p>` + `tabIndex={-1}` `<h1>` + birebir aynı sınıf dizesi) üç kez tekrar; 4. kopya `_app.kurulum.$slug.tsx:32-38`. Aynı sebeple değişir (odak yönetimi + tipografi tokenı) ⇒ gerçek tekrar. Düzeltme: `WizardStepHeader` sunum bileşeni (`apps/admin` içinde, `packages/ui`'ye **taşımadan**).                                                                                                                                                                                                                                                                                   | frontend      |
| low | `apps/api/src/registration/registration.service.ts:199`                                                    | `limits: trialPlanLimits ?? {}` — iş açısından kritik "anlık görüntü" kolonunda sessiz varsayılan; aynı fonksiyonun `:161-168` yorumu _"SESSİZCE devam EDİLMEZ"_ diyor. **Kanıt:** `:170`'teki atamayı silsem abonelik `{}` limitleriyle doğar; `registration.test.ts:476` (`expect(subscription.limits).toEqual(trialPlan.limits)`) bunu **yakalar** — bu yüzden low, medium değil. Daha temizi: `undefined` ise fırlat.                                                                                                                                                                                      | backend       |
| low | `packages/tenancy/package.json:6`                                                                          | `description` yalnızca hostname/rezerve listeden söz ediyor; paket artık **slug gramerinin tek evi** (`slug.ts:41`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | docs          |

---

## Baktığım ama TEMİZ çıkan eksenler (okuyan ajan tekrar bakmasın)

1. **Slug grameri tek kaynak (R2).** `Grep` ile desen taraması: `TENANT_SLUG_PATTERN`
   literali kaynak ağaçlarında **tam bir kez** (`packages/tenancy/src/slug.ts:41`).
   `resolve-host.ts:41` onu **import ediyor**, ikinci literal yok. `scripts/guards.sh:445`
   iğneyi iki parçadan birleştiriyor (literal-jeton kuralı tutuluyor). `resolve-host.ts`'in
   sırası korunmuş: rezerve (`:224`) → desen (`:228`).
2. **`app.tenant_id` tek ev.** Üretim kodunda tek yer `packages/db/src/tenant-context.ts:57`;
   diğer 7 eşleşmenin **hepsi** test dosyası (AC4 taramasının tanıdığı istisna).
3. **`withNewTenant()` sırası.** `:194-204` — `insertTenant` → `set_config(bağlı parametre,
true)` → `callback`. Sıra doğru; fail-closed kayıt kontrolü `$transaction`'dan **önce**
   senkron (`:186-192`); boş `id` kontrolü transaction içinde ⇒ rollback. `$queryRawUnsafe`
   yok, dize birleştirme yok. İç içe çağrı tip düzeyinde imkânsız. `prisma.service.ts:168-173`
   callback'i `TenantTransactionClient`'a daraltıyor (M3 `plan` ekseni **hariç** temiz).
4. **Normalizasyon ≠ doğrulama.** Sunucu `input.slug`'ı **normalize etmiyor**:
   `registration.service.ts:280` doğrudan `validateTenantSlug(slug)`; `createTenantInputSchema`
   yalnızca `name`'e `.trim()` uyguluyor (`registration.schema.ts:171`), `slug`'a **dokunmuyor**.
   `normalizeTenantSlug` yalnızca istemcide öneri üretiyor (`store-wizard-controller.ts:136`).
5. **Normalizasyon sırası.** Katlama (`:103`) `toLowerCase()`'den (`:104`) **önce**;
   `toLocaleLowerCase` repoda **sıfır** eşleşme. Idempotans + geçerlilik özelliği
   `slug.test.ts:89-124`'te pinli; `'İ'.toLowerCase().length === 2` platform gerçeği
   `:20`'de pinli; 14 kod noktası tek tek test ediliyor.
6. **`packages/tenancy` saflığı.** `package.json:25` → `"dependencies": {}` (zod dahil
   sıfır bağımlılık). `slug.ts` **fırlatmıyor**, `SlugValidationResult` ayrımlı birleşimi
   dönüyor. `reserved-subdomains.ts`/`purity.test.ts` dokunulmamış.
7. **Katman ve bağımlılık yönü.** `packages/ui`'de `T-019`/`v0.1.0` atfı **sıfır** (dokunulmadı).
   Sihirbaz `apps/admin/src/features/registration/**` altında; `apps/admin` →
   `@arkesoft/tenancy` (apps→packages, meşru). `packages/trpc` `tenancy`/`db` **ithal
   etmiyor**; `packages/db` `tenancy` ithal etmiyor; `packages/tenancy` hiçbir şey ithal
   etmiyor ⇒ döngü yok. Sunucu doğrulaması atlanmıyor (istemci kontrolü **öneri**, kabul
   oracle'ı sunucuda).
8. **Hata yönetimi deseni.** Yeni `AppError` **sıfır** (F3 çürütmesi uygulanmış);
   `ValidationError` yeniden kullanılmış (`:143`, `:185`). Üretim kodunda boş `catch` **yok**
   (`Grep`: tüm `catch {` eşleşmeleri T-019 dışı dosyalarda). Hata `null`'a çevrilmiyor —
   portlar total (`registration-read/write.port.adapter.ts`). `isUniqueConstraintError`
   dalı **yalnızca tanınan** hatayı dönüştürüyor, kalanı `throw error` ile yukarı iletiyor
   (`:184-187`).
9. **Varlık oracle'ı.** `onboardingChecklist` dört ret modunu **aynı** `TenantNotFoundError`'a
   indiriyor (`:230`, `:247`, `:263`); kimlik çözümü `select: { id: true }` + `deletedAt: null`
   ile "yok" ve "soft-delete"i aynı `null`'a indiriyor; iç kimlik tele hiç çıkmıyor
   (`registration.schema.ts` K kuralı 4). `registration.test.ts:681` gövdelerin **birebir
   aynı** olduğunu assert ediyor.
10. **`deriveTenantLifecycleState()` tek ev.** `Grep` (`deletedAt !== null|=== null|!= null`):
    üretim kodunda türetme yalnızca `tenant-lifecycle-state.ts:46`'da. `tenant-resolver.service.ts:216`
    onu tüketiyor. `user-eligibility.ts:32` **farklı varlık** (User), çift kaynak değil.
    Vitrin adaptörü (`storefront-tenant-read.port.adapter.ts:59`) ve kayıt servisi sorgu
    **filtresi** kullanıyor — türetme değil. 8 vakalık tablo testi gerçek (`4 durum × 2`).
11. **Tip disiplini (üretim).** `any` 0, `@ts-ignore`/`@ts-expect-error` 0, gerekçesiz `as` 0.
    Tek `eslint-disable` (`_app.index.tsx:40`) mevcut ve gerekçeli `redirect()` deseni.
    `exactOptionalPropertyTypes` disiplinine uyum: koşullu prop spread'leri her yerde
    (`{...(x !== null ? {error: x} : {})}`).
12. **Sağlayıcı dallanması.** `if (provider === …)` sınıfı **yok**. Oran sınırı üçüncü yol
    kümesi `rate-limit.policy.ts:155-169`'daki guard'ı **gevşetmeden** genişletiyor
    (üç kümeden birine ait olmayan `routeKey` hâlâ modül yüklenirken fırlatıyor).
13. **Ölü sözlük.** `SiteType`'ın **iki** değerinin de üreticisi var
    (`SiteTypeFieldset.tsx:16-23` iki radyo). `SubscriptionStatus`'ün tek değerli doğması
    `A-A6`'da yargı kararı olarak kayıtlı; gerekçe (_"dolu tabloya v0.17.0'da `NOT NULL`
    kolon eklememek"_) **çürütülemedi** ⇒ bulgu yazmadım.
14. **Test kalitesi (sunucu).** `AC-4` küme **eşitliği** gerçek: `registration.test.ts:168`
    üretim kümesini **ayrı, elle yazılmış 12 literalle** karşılaştırıyor + `:179-182`
    vacuous-değil kontrolü var. `AC-8` round-trip gerçek: `:208` `resolveHost`'u servisin
    oracle çağrısından **bağımsız** çalıştırıyor; uzun taban alan adı vakası ayrı
    `createTestApp` ile ölçülüyor (`:216-233`). `slug.test.ts:168-193` rezerve kümesi için
    de eşitlik kuruyor. Totolojik assert tespit etmedim (tek istisna L3'teki sayaç).
15. **Adaptör sarmalayıcıları** (`registration-{read,write}.port.adapter.ts`) düz delege —
    anlamsız sarmalayıcı **değil**, ADR-0009'un sınır nesnesi deseni ve `MemberWritePortAdapter`
    emsali dosya başında yazılı.
16. **Kabul edilen, gerekçesi yazılı ikilikler (bulgu yazmadım):**
    `TRIAL_PLAN_ID` (`registration.service.ts:69`) ↔ `TRIAL_PLAN.id` (`seed-data.ts:38`) —
    doğal anahtarın bilinçli bedeli, **fail-loud** (`:165-168` plan yoksa fırlatır);
    `REGISTRATION_SLUG_MAX_LENGTH = 63` (`registration.schema.ts:106`) ↔ `TENANT_SLUG_MAX_LENGTH`
    (`slug.ts:43`) — `packages/trpc`'ye `tenancy` bağımlılığı eklemek daha kötü olurdu,
    gerekçe dosyada yazılı; `CheckSlugAvailabilityCallResult`/`CreateTenantCallResult`
    tiplerinin `registration-query.ts:41,57` **ve** `store-wizard-controller.ts:29,33`'te
    ikinci kez tanımlanması — controller'ın `api/` katmanına bağımlı **olmaması** için
    tüketici-tanımlı port deseni, sapma derleme zamanında yakalanır;
    `verified-fixture-user.ts`'in "üçüncü kopya, refaktör değil" kararı — `po` R-PO10
    tarafından bağlayıcı kılınmış.
17. **DOĞRULANAMADI (açıkça):** `git show --stat 9d33820` içeriği · kök `pnpm test`'in hangi
    testte düştüğü · `pnpm lint/typecheck/build/guards` çıktıları (hiçbirini çalıştıramadım,
    Orkestratör'ün ölçümlerini **tekrar etmedim, devralmadım**) · `prisma migrate diff` ·
    migration SQL'inin canlı etkisi (`\d subscription`) · bundle bütçesi baytları.
