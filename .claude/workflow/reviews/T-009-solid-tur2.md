# T-009 — `solid` gate, tur 2 (KAPSAM: TAM)

Tarih: 2026-11-02
Sürüm: ROADMAP v0.0.8 · versiyon etkisi **minor**
Kapsam: tur 1'in dört `medium` kapanışı + düzeltme turunda değişen altı dosya derinlemesine +
yapısal değişmezler repo genelinde (`rg`) + tur 1'in 14 `low`'unun durumu

```
GATE: solid
SONUÇ: PASS
```

**PASS gerekçesi (`AGENT_BASELINE.md` §4, bağlayıcı):** `critical` 0 · `high` 0 · `medium` 0 ·
`low` 2 (yeni) → kural "yalnızca `low` → PASS". Tur 1'in **dört `medium`'u DA KAPANDI**
(dördü tek tek doğrulandı, aşağıda). İki yeni `low` düzeltme turu **açmaz**, borç satırı
metinleri aşağıda.

**Komut koşumu: HİÇBİRİ.** `Bash` aracım bu turda da yok. `lint`/`typecheck`/`test`/`build`/
`format:check`/`git diff`/Playwright **çalıştırılmadı**; BAĞLAM ÖZETİ'ndeki sayılar bağımsız
doğrulanmadı. Tüm doğrulamalar **kaynak okuma + `rg`** ile yapıldı; mutasyon iddiaları kod
akışı izlenerek türetildi. `pnpm test`'in `apps/api` flakiliği bu sürüme **atfedilmedi**
(talimat gereği, teyit edilemedi).

---

## BULGULAR

### critical / high / medium — **yok**

### low (2 — YENİ, bu turun düzeltmeleri getirdi) — düzeltme turu AÇMAZ

- **[SEV: low]** `apps/storefront/src/lib/storefront-tenant-context.ts:29-31` ·
  `apps/storefront/src/pages/index.astro:8` · `apps/storefront/src/pages/robots.txt.ts:11`
  — **M1'in düzeltmesi üç yerdeki değişmez cümlesini yanlışladı; dahası repo artık kendisiyle
  çelişiyor.** Üç cümle sırasıyla şunu söylüyor: *"`unresolved` durumu middleware'de 404'e
  çevrilir, ASLA `next()` çağrılmaz"* · *"`unresolved` dalı yapısal olarak ULAŞILAMAZ"* ·
  *"`Astro.locals.tenant` HER ZAMAN `resolved`dir"*. M1'den sonra `middleware.ts:150`
  `locals.tenant = { kind: 'unresolved' }` yazıyor ve **:151'de `next()`'i çağırıyor** — yani
  "unresolved ile asla `next()` çağrılmaz" cümlesi artık **olgusal olarak yanlış**. Buna karşılık
  `middleware.ts:147-149` tam tersini yazıyor: *"`unresolved` dalı zaten ayrık birleşimin
  ULAŞILABİLİR üyesi"*. Bugünkü gerçek güvenlik argümanı **rota tabanlı**: o `next()`'e yalnızca
  `/404`/`/503` pathname'i ulaşır ve o iki sayfa `locals`'ı okumaz — bu, yazılı olandan **farklı
  ve daha zayıf** bir argüman. `requireResolvedTenant`'ı çağıran üç tüketici var
  (`index.astro:15`, `robots.txt.ts:18`, `sitemap.xml.ts:13`) ve bir sonraki geliştirici
  güvenlik gerekçesini bu yanlış cümlelerden okuyacak. Davranış bugün **doğru**; kusur
  yorum/gerekçe katmanında. CLAUDE.md §4 (yorum *neden*i anlatır ve güncel olur).
  — **Düzeltme:** üç cümleyi gerçek değişmezle değiştir: *"`next()` iki yoldan çağrılır —
  `resolved` (adım 6) ve erken çıkış (`/404`/`/503`, `unresolved`); `unresolved` bağlamla render
  edilen iki sayfa `locals.tenant`'ı OKUMAZ, bu yüzden `requireResolvedTenant` çağıran her
  sayfa/uç `resolved` görür"*. `middleware.ts:147-149` ile tutarlı hâle getir.
  — **Sorumlu ajan:** `frontend` — **vade: v0.0.9**

- **[SEV: low]** `apps/storefront/src/lib/api-client.ts:52` — **yeni fail-closed fırlatmanın
  mesajı, uygulamanın diğer üç değişmez-fırlatmasından sapıyor ve kod gibi görünüyor.**
  Mesaj `'storefront_trpc_client_empty_tenant_host'` — İngilizce, snake_case, tek jeton; ve
  `api-client.test.ts:106` onu `toThrow(...)` ile **kararlı bir kimlik gibi pinliyor**. Aynı
  uygulamadaki üç kardeş değişmez-fırlatması (`middleware.ts:100` APP_BASE_DOMAIN,
  `storefront-tenant-context.ts:43-45`, `middleware.ts:115` `assertNever`) **Türkçe teşhis
  cümlesi** kullanıyor — yani dosyanın kendi gerekçesi (*"Mesaj Türkçe DEĞİL, bu bir programlama
  hatası sinyali"*) komşularıyla **çelişiyor**: o üçü de programlama hatası sinyali ve Türkçe.
  Eğer bu dize bir **hata kodu** olarak kullanılacaksa CLAUDE.md §4 SCREAMING_SNAKE_CASE ister ve
  kayıtlı bir yere ait olur; mesajsa Türkçe olur. `AppError`'a terfi **önermiyorum** — değişmez
  ihlali domain hatası değil, mevcut desen (düz `Error`) doğru.
  — **Düzeltme:** Türkçe teşhis cümlesi (`'api-client.ts: tenantHost BOŞ — host çözümü atlanmış
  veya bozulmuş (fail-closed).'`) + testin assertion'ını ona göre güncelle.
  — **Sorumlu ajan:** `backend` — **vade: v0.0.9**

---

## A — DÖRT `medium`'UN KAPANIŞI

### M1 · `App.Locals.tenant` tip yalanı — **KAPANDI ✔**

| Doğrulama | Sonuç |
| --------- | ----- |
| Tip o yolda yalan söylüyor mu | **Hayır.** `middleware.ts:150` erken-çıkış dalında `locals.tenant`'ı `next()`'ten (`:151`) **önce** yazıyor. İki `next()` çağrı yeri (`:151`, `:217`) **ikisi de** öncesinde `locals.tenant` yazıyor — "`next()` çağrılırken `tenant` yazılmış olur" değişmezi artık **yapısal**, sözleşmeye bırakılmamış |
| `rg "kind: 'unresolved'"` üretim kodunda | **Evet, 2 eşleşme:** `middleware.ts:150` (yazım) + `storefront-tenant-context.ts:24` (tip bildirimi). Tur 1'de yalnızca testlerdeydi → ayrık birleşim artık **ulaşılabilir** bir durumu modelliyor |
| `requireResolvedTenant` tasarlanmış Türkçe hatayı mı fırlatıyor | **Evet.** `storefront-tenant-context.ts:39-46`'nın `switch`'i `case 'unresolved'` dalına düşüyor → Türkçe `Error`. `TypeError` (undefined üzerinde `.kind`) yolu kapandı. `middleware.test.ts:384-386` bunu **tam mesajla** pinliyor — mutasyon: `:150` kaldırılırsa `undefined` → `TypeError` → assertion kırmızı |
| `env.d.ts` opsiyonele çevrilmedi mi | **Çevrilmedi** (`:18` `tenant: StorefrontTenantContext`, zorunlu) — talimata uyulmuş, kapsam büyütülmemiş. Testin `:375-377`'deki yorumu bu kararı ve `toEqual` assertion'ının **neden** kanıt olduğunu açıklıyor |

Yan etki: üç yerdeki değişmez cümlesi eskidi → yukarıdaki birinci `low`.

### M2 · `/503` kolu mutasyonsuz — **KAPANDI ✔ (güçlü)**

| Doğrulama | Sonuç |
| --------- | ----- |
| Üç mutasyon geri alındı mı | **Evet, üçü de kaynakta duruyor:** `'/503'` kolu `middleware.ts:142`'de (`\|\| context.url.pathname === '/503'`) · `locals.tenant` satırı `:150`'de · `applyStorefrontCachePolicy` çağrısı `:154`'te |
| 503 harness vakası re-entrancy'yi gerçekten taklit ediyor mu | **Evet, mock'un arkasına saklanmıyor.** `middleware.test.ts:333-357` `createLoopSimulatingHarness` + `buildReentrantContext` kullanıyor: `rewrite(path)` sahtesi `url.pathname`'i hedefe çevirip `onRequest`'i **yeniden çağırıyor**, 4. girişte Astro gibi "Loop Detected" döndürüyor. Düz `vi.fn` **kullanılmıyor** |
| Mutasyon gerçekten öldürülüyor mu (bağımsız türetme) | **Evet.** `:356` `expect(createStorefrontTrpcClientMock).toHaveBeenCalledTimes(1)` — koşuldan `'/503'` çıkarılırsa 2. giriş tam kiracı çözümüne düşer, istemci **ikinci kez** kurulur → bu assertion tek başına kırmızı; ayrıca `invocationCount()` 2→4 ve `status` 503→508/404 sapar. **Üç bağımsız kırmızı** |
| Doğrudan `GET /404`/`GET /503`'te istemci mock'u çağrılmıyor mu | **Ölçülüyor.** `:391-429` iki test: `createStorefrontTrpcClientMock` **not.toHaveBeenCalled** + `queryMock` **not.toHaveBeenCalled** + `context.rewrite` **not.toHaveBeenCalled** + durum + `cache-control`. Bu, `middleware.ts:75-83`'ün güvenlik iddiasının **doğrudan** ölçümü — tur 1'de hiç yoktu |
| Önbellek politikası koşulsuz mu (şart ④, gerileme yasak) | **Koşulsuz.** Dört çağrı yeri: `:154` (erken çıkış) · `:171` (unresolved) · `:209` (API hatası) · `:220` (başarı). Sayı tur 1'deki 4 ile **aynı**, hiçbir dal koşullu hâle gelmemiş. Dört dalın üçü testte `'private, no-store'` ile pinli (`:101,139,175,202,238,402,423`) |

`buildContext`'in opsiyonel `pathname` parametresi (`:58-60`, varsayılan `'/'`) **geriye uyumlu**:
varsayılan URL eskiden de `http://localhost:4321/` idi, mevcut çağrı yerlerinin hiçbiri parametreyi
vermiyor → 62 testin davranışı değişmedi (B4 ✔).

### M3 · Ada ithal kapısı — **KAPANDI ✔; R-P1 BAĞIMSIZ DOĞRULANDI**

- **R-P1 tuzağı kapandı mı — bağımsız doğrulama (kod okuyarak):** `eslint.config.mjs:140-147`'nin
  `mergeRestrictions` çağrısı **dört** argüman alıyor: `restrictedImportsOptions`,
  `trpcServerRestriction`, `dbRestriction`, `islandEnvAccessRestriction`. `mergeRestrictions`
  (`:89-94`) `paths`/`patterns`'i `flatMap` ile birleştiriyor → `src/components/**` bloğu taban
  listeyi **kaybetmiyor**. `restrictedImportsOptions`'ın içeriğini kaynağından
  (`packages/config/eslint/base.js:38-82`) okuyarak teyit ettim: `paths` = `react`
  (`Component`/`PureComponent`), `@prisma/client`, `pg`, `pg-pool`, `pg-native`,
  `@prisma/adapter-pg` (6) · `patterns` = `@prisma/client/*`+`.prisma/client*`, `pg/*` (2).
  Hepsi birleşik kümede. `devops`'un `@prisma/client` probuna **ihtiyaç duymadan** doğrulandı.
- **Blok sırası tuzağı yok:** üçüncü blok (`:155-160`) yalnızca `no-console` yazıyor, aynı dosyaya
  ikinci bir `no-restricted-imports` **koymuyor** → `src/components/**`'ın birleşik kümesi
  sonradan ezilmiyor.
- **`uniqueItems` ihlali yok:** birleşik `paths` 8 girdi, `patterns` 6 girdi — **tekil**,
  `@prisma/client` ikinci kez eklenmemiş (`:39-45`'teki yorum bu tuzağı ve ölçümünü anlatıyor).
- **Yeni yorum mekanizmayı doğru anlatıyor:** `:130-136` iki kuralı ayırıyor —
  `no-restricted-imports` **modül ithalini** (kullanılmasa bile), `no-restricted-globals`
  **doğrudan global kullanımını** yakalar; üçüncü-modül-sarmalayıcı örneğiyle neden ikisinin de
  gerektiği gösterilmiş. Tur 1'in yanlış *"modül sınırıyla sağlanır"* cümlesi **silinmiş** (`rg`
  ile teyit: dosyada o ifade **yok**).
- **Alias varyantının eklenmemesi gerekçeli:** `apps/storefront/tsconfig.json`'da `paths`/`baseUrl`
  **yok** ve `packages/config/tsconfig/**` genelinde de `rg "paths|baseUrl"` → **0 eşleşme** →
  bu modüllere paket-adı/alias ithali **imkansız**. Gerekçe **teyit edildi**.
- **Tur 1'de önerdiğim üçüncü desenin (`storefront-server-fetch`) eklenmemesi DOĞRU karar:**
  o modül hedefi **parametre** olarak alıyor (`api-client.ts:57`), `process.env` okumuyor →
  sır taşımıyor; yasaklamak gereksiz kısıt (KISS) olurdu. Sır yolu yalnızca `storefront-env`
  (doğrudan) + `api-client` (modül yüklenirken gömülen `API_CONNECTION_TARGET`, `:32-34`) — ikisi
  de kapsanmış.
- **Ölçüm sınırı (dürüstlük):** `**/storefront-env` glob'unun `../lib/storefront-env.js`'i
  gerçekten yakaladığını **koşturarak** doğrulayamadım (`Bash` yok). `devops`'un prob kanıtı +
  ESLint'in gitignore-stili desen semantiği bunu destekliyor; bulgu yazmadım, ölçüm sınırı olarak
  kaydediyorum.

### M4 · e2e gövdeyi pinlemiyordu — **KAPANDI ✔ (denetledim; `qa` kendi işini gate edemezdi)**

- **Yeni assertion'lar kendi sınıfına düşmüyor.** Üç yerde **pozitif + negatif çift**:
  `:120-121` (AC5), `:162-163` (AC6), `:239-242` (AC14/AC15, robots **ve** sitemap). `toBeTruthy`
  **yok** (`rg` → 0). Tek başına "içermiyor" **yok** — her `not.toContain(LOOP_DETECTED_BODY)`'nin
  yanında `toContain(MESSAGES.storefront.notFound.heading)` var; boş gövde pozitif assertion'da
  kırmızıya düşer. Ayırt edici güç: `heading` = `'Bu adreste bir mağaza bulunamadı'`
  (`messages.ts:38`), "Loop Detected" düz metninde geçmez.
- **Mevcut 11 test zayıflatılmadı.** `status()` assertion'ları duruyor (`:87,108,182,227-228,262-263`);
  AC6'nın **eşitlik** üçlüsü (`:148-152`) **korunmuş**, içerik assertion'ı ona **eklenmiş** — tam
  olarak istenen yön. AC8 tablosu (`:253-265`) dokunulmamış: o üç vaka AC5 ile aynı
  `renderNotFound()` dalından geçtiği için gövde pini **zaten** AC5'te var; üç kopya daha eklemek
  gereksiz tekrar olurdu (eklenmemesi doğru).
- **`e2e/` → `src/messages/messages.js` ithal yönü: KARARIM — SAĞLIKLI, katman sızıntısı DEĞİL.**
  Gerekçe: (a) aynı paket içi (`apps/storefront`), `tsconfig.json:23` `e2e/**/*`'ı zaten derleme
  kapsamında tutuyor; (b) yön `test → src`, ters yön **yok** (`rg` ile teyit: `src/**` içinde
  `e2e/` ithali 0) → döngü/ters bağımlılık yok; (c) alternatif literal kopyalamaydı ve "iki yerde
  elle eşitlenen Türkçe dize" bu dosyanın **zaten** belgelediği (`:53-58`) istenmeyen desen —
  orada mecburiyet var (`@arkesoft/db` ithal edilemez, AC10), burada **yok**. Tautoloji riski de
  yok: sayfa ile test kataloğa **farklı çalışma zamanı yollarından** varıyor (SSR render ↔ Node
  import), testin yakaladığı sınıf (gövde "Loop Detected") kataloğa bağlı değil.
- **`'Loop Detected'`'ın `messages.ts`'e KONMAMASI doğru.** Değerlendirme: o dize Astro'nun iç
  döngü-koruma metni; Arkesoft'un **sahip olmadığı** ve çevirmediği bir metni i18n kataloğuna
  koymak kataloğun sözleşmesini (`messages.ts:4-8`: "kullanıcıya dönük Türkçe metin") bozar ve
  "bizim metnimiz" izlenimi verir. `:63-67`'deki yerel sabit + gerekçe yorumu **doğru yer**.

---

## B — DÜZELTMELERİN GETİRDİĞİ YENİ SORUNLAR

| # | Konu | Sonuç |
| - | ---- | ----- |
| 1 | `resolveHost`'un boş-host dalı (`resolve-host.ts:190-192`) | **Tutarlı, yarım değil.** Konum doğru: `bare_base_domain`'den (`:194`) önce olması yalnızca dejenere bir yapılandırmada (`APP_BASE_DOMAIN='.'` → normalize `''`) fark yaratır, o da açılışta ayrı kapıdan geçer. `..` ayrımı **bilerek bırakılmış DEĞİL — PİNLENMİŞ**: `resolve-host.test.ts:155-159` `'..' → custom-domain('.')`'i **adıyla ve gerekçesiyle** tablo vakası yapmış (*"kalan '.' BOŞ DEĞİL … WHATWG URL authority kırılması burada OLUŞMAZ"*), `:150-154` de `'.' → unparsable_host`'u pinliyor. Yeni sebep **eklenmemiş** (8 sebep listesi `:54-62` değişmemiş) → sebep sayımı pinleri (`tenant-resolver.test.ts`) korunmuş. Bulgu yok |
| 2 | B-M1 yorumunun dürüstlüğü (`resolve-host.ts:134-156`) | **Artık dürüst.** Cümle *"bu dal ÜRETİMDE bu girdi tipiyle HİÇBİR ZAMAN TETİKLENMEZ"* diye **açıkça** başlıyor, ham soket ölçümünü (ilk değere indirgeme, sıra ters çevrilince 404) veriyor, sebebin **neden korunduğunu** (tipin izin verdiği `string[]`, üç ayrı pin) ve gerçek riskin **nerede** ele alınacağını (v0.18.0 ters vekil allowlist'i, kenarda) yazıyor. "Vaka ele alınmış" izlenimi **başka bir biçimde de** verilmiyor — "Asıl risk bugün YOK" ifadesi koşulunu (**son**'a yönlendiren CDN + **ilk**'i okuyan kod) birlikte söylüyor. Bulgu yok |
| 3 | `assertNever` kopya sayısı | **5. kopya DOĞMADI.** `rg "function assertNever"` (dist hariç) → **4**: `apps/api/src/errors/assert-never.ts:36`, `apps/admin/src/errors/assert-never.ts:24`, `scripts/sync-platform-version.ts:401`, `apps/storefront/src/middleware.ts:114`. Storefront'ta tanım 1, çağrı yeri 1 (`:206`) |
| 4 | `buildContext`'in opsiyonel `pathname`'i | **Geriye uyumlu** (A/M2'de gösterildi): varsayılan `'/'` eski sabit URL'nin birebir aynısı, mevcut çağrı yerleri parametreyi vermiyor |
| 5 | En büyük fonksiyon | **Değişti:** `onRequest` 82 → **90 satır** (`middleware.ts:133-222`) ve `createStorefrontServerFetch`'in **86** satırını (`storefront-server-fetch.ts:215-300`, bu turda dokunulmadı) **geçti** → yeni rekor onun. Yürütülebilir ifade ≈48. Bu, tur 1'in açık `low`'unu (dört koşulsuz çağrı yeri, tek-çıkış yokluğu) **ağırlaştırıyor**; yeni bulgu yazmıyorum, borç satırını güncelliyorum (aşağıda D/#11) |
| 6 | `frontend`'in düzelttiği iki lint sınıfı başka yerde var mı | `toThrowError` → repo genelinde (dist hariç) **0 eşleşme** → sınıf tamamen kapanmış. `no-unnecessary-type-assertion` grep'le güvenilir aranamaz; mekanik bekçi `pnpm lint` ve ölçülmüş durum **19/19 yeşil** — bu sınıfın kalanı olmadığının kanıtı o koşum (ben koşturamadım) |

Ayrıca değerlendirildi, **bulgu yazılmadı**: `eslint.config.mjs:155-160`'ın `no-console` bloğu
`base.js:96`'nın `arkesoftRules`'u zaten `**/*.ts(x)` için aynı kuralı verdiği için fiilen
**gereksiz tekrar** — bu blok bu turda **değişmedi**, tur 1 taban çizgisi onu kabul etti ve
davranışsal etkisi sıfır; bu turda yeni `low` açmak gürültü olurdu (`docs` isterse kaydeder).

---

## C — YAPISAL DEĞİŞMEZLER (tur 1 taban çizgisiyle)

| Değişmez | Tur 1 | Tur 2 | Grep kapsamı / not |
| --- | --- | --- | --- |
| `any` | 0 | **0** | Desen `(:\s*any\b\|as any\b\|<any>\|any\[\])`, repo (dist hariç). Kod eşleşmesi yalnızca `apps/admin/src/routeTree.gen.ts:19,24,29` — **ÜRETİLMİŞ** dosya, T-008'de kayıtlı istisna, T-009 kapsamı dışı. Kalan eşleşmeler **yorum/rapor metni** (`packages/config/eslint/react.js:37`, `.claude/.../*.md`) |
| `@ts-ignore`/`@ts-nocheck` | 0 | **0** | T-009 kapsamında 0. `apps/api/src/__tests__/prisma-with-tenant.test.ts:111` `@ts-expect-error` **önceki sürümden**, kasıtlı tip-düzeyi testi, kapsam dışı; `routeTree.gen.ts:3` üretilmiş |
| üretim `as` (tip zorlama) | 0 | **0** | `apps/storefront/src/**` + `packages/tenancy/src/**`, desen `\bas\s+(unknown\|any\|const\b\|[A-Z])`. Üretim eşleşmesi yalnızca `messages.ts:50` `as const` — **const assertion**, tip zorlaması değil (tur 1 deseninde de sayılmıyordu). Test eşleşmeleri `as unknown as` ve **gerekçeli** (`middleware.test.ts:9-16`; sayı yeni testlerle arttı, deseni değişmedi) |
| döngüsel bağımlılık | 0 | **0** | `packages/tenancy` `dependencies: {}` (yaprak, değişmedi) · `apps/storefront` deps = `@arkesoft/tenancy`, `@arkesoft/trpc`, `@arkesoft/errors` (hepsi `packages/*`) · `src/**` içinde `e2e/` ithali 0 (ters yön yok) |
| katman ihlali | 0 (hepsi yorumda) | **0** | `apps/storefront` genelinde `@arkesoft/db` / `@prisma/client` / `@arkesoft/trpc/server` / `httpBatchLink` / `console.` / `.mutate(` → **kod eşleşmesi 0**. Tüm eşleşmeler: `eslint.config.mjs`'in **yasak metni** (`:13,21,28,36,39,50,57,119,120,154`), `api-client.ts:6` **yorum**, `e2e/fixtures/custom-domain-tenant.ts:4-11` **yorum**, `api-client.test.ts:91` **test adı**. `.mutate(` 0 → yazma yüzeyi hâlâ yok |
| `process.env` üretim dosya sayısı | 1 | **1** | `storefront-env.ts:72`. Kalanlar: `__tests__` (meşru kurulum), `e2e/**`, `playwright.config.ts`, yorumlar. `src/**` üretim = tek dosya ✔ K17 |
| `no-store` literali (üretim) | 1 yer | **1 yer** | `cache-policy.ts:22`. Kalan 11 eşleşme test assertion'ı (pinin kendisi) |
| `rg -n "response\.status" apps/storefront/src/pages` | 0 | **0** | I-404 korunuyor: durum yalnızca `middleware.ts`'in `withStatus`'unda damgalanıyor |
| Çekirdekte sağlayıcı dallanması | 0 | **0** | `if (provider === ...)` sınıfı yok |
| `kind: 'unresolved'` üretim | yalnızca test | **2** | `middleware.ts:150` + `storefront-tenant-context.ts:24` → M1'in kapanış göstergesi |

---

## D — TUR 1'İN 14 `low`'U: KAPANIŞ DURUMU (`docs` için kesin liste)

**Kapanan: 0. Açık kalan: 14.** Düzeltme turu `run.md [7]`'nin "yolu üstündeyse kapat"
istisnasını **kullanmadı** (izinli, zorunlu değil). Dört `low` dokunulan dosyalardaydı ve
kapanmadı; ikisinin **satır referansı kaydı** değişti:

| # | Borç | Durum |
| - | ---- | ----- |
| 1 | `docs/development.md:238-241` eskimiş yol (`docs`, v0.0.9) | **AÇIK** — dosya bu turda değişmedi |
| 2 | `packages/tenancy/src/resolve-host.ts` tek-tüketici yorumları (`backend`, v0.0.9) | **AÇIK** — dosya değişti ama cümleler değişmedi. ⚠ **Satır referansı güncellensin: `:64-70` + `:85-87`** (eski: `:58-62`, `:78-80`). `:85-87` hâlâ yalnızca `TenantResolverService`'i anıyor, ikinci tüketici (`middleware.ts:96-107`) anılmıyor |
| 3 | `apps/storefront/astro.config.ts:13-15` "tek sayfa" (`frontend`, v0.0.9) | **AÇIK** |
| 4 | `storefront-tenant-context.ts:15-16` R9 notu ADR-0012 ile çelişiyor (`frontend`, v0.0.10) | **AÇIK** — dosya bu turda değişmedi |
| 5 | `middleware.ts:114-116` `assertNever` 4. kopyası, dosya içine gömülü (`frontend`, v0.0.10) | **AÇIK** — dosya değişti, kopya **aynı yerde**; 5. kopya da doğmadı |
| 6 | Test adı ölçtüğünden fazlasını iddia ediyor: (a) `storefront-tenant-context.test.ts:27-31` (`qa`) · (b) `api-client.test.ts:91` (`qa`) · (c) `create-test-app-fail-closed.test.ts:42` (`backend`) — v0.0.10 | **AÇIK.** (a),(c) dosyaları değişmedi. (b)'nin dosyası değişti (yeni boş-host testi `:101-108` eklendi, **kaliteli**: pozitif fırlatma + `not.toHaveBeenCalled`), ama `:91`'in adı hâlâ ölçmediği bir mekanizmayı (`httpBatchLink`) adıyla anıyor; bugünkü metindeki *"(döndürülen değer mock'un çıktısıdır)"* parantezi sınırı **açıklıyor** → kalan kusur kozmetik, `low` olarak açık |
| 7 | `packages/tenancy/src/__tests__/purity.test.ts:31-35` özyinelemeli değil (`backend`, v0.0.9) | **AÇIK** |
| 8 | `cache-policy.test.ts:22-38` ayırt edici güç yok (`frontend`, v0.0.10) | **AÇIK** — dosya değişmedi |
| 9 | `packages/trpc/src/index.ts:13` ölü değer ihracı (`backend`, v0.0.10) | **AÇIK** |
| 10 | `503.astro:23` "Yeniden dene" kapalı döngüsü (`frontend`, v0.0.10) | **AÇIK** — erken çıkış `/503`'ü doğrudan istenebilir yol tutmaya devam ediyor (M2 bunu **bilerek** pinledi), bağlantı yedeği eklenmedi |
| 11 | `middleware.ts` UYARI 3 değişmezi dört çağrı yerinde sözleşmeyle korunuyor (`frontend`, v0.0.10) | **AÇIK.** ⚠ **Satır referansı güncellensin: `:154,171,209,220`** (eski: `:146,163,201,212`). Sayı 4'te sabit (gerileme yok) ama fonksiyon **82→90 satıra** çıktı ve kapsamın en büyük fonksiyonu oldu → tek-çıkış refaktörünün (`respond(r,s)` veya `renderNotFound`/`renderUnavailable`'ın politikayı kendi içinde uygulaması, 4→2) gerekçesi **güçlendi** |
| 12 | `storefront-env.ts:24` "mekanik pin" cümlesi test dosyalarını saymıyor (`frontend`, v0.0.9) | **AÇIK** — metin değişmedi |
| 13 | `getText` anlamsız sarmalayıcısı (`qa`, v0.0.10) | **AÇIK.** ⚠ **Satır referansı güncellensin: `:294-297`** (eski: `:252-255`). Dosya değişti, sarmalayıcı kaldırılmadı ve M4 düzeltmesi **iki yeni çağrı yeri** ekledi (`:236-237`) |
| 14 | `packages/trpc/src/context/trpc-context.types.ts:70` "Beş alan" → altı (`backend`, v0.0.9) | **AÇIK** |

Bu tur **iki yeni `low`** ekliyor (yukarıda, BULGULAR): `storefront-tenant-context.ts:29-31` +
`index.astro:8` + `robots.txt.ts:11` eskimiş değişmez (frontend, v0.0.9) ve `api-client.ts:52`
mesaj biçimi (backend, v0.0.9). **Toplam açık `low` borcu: 16.**

---

## ÖLÇÜMLER

İncelenen dosya **15** (değişen 6 derinlemesine + bağlam 9: `base.js`, `tsconfig.json`,
`env.d.ts`, `storefront-tenant-context.ts`, `messages.ts`, `api-client.test.ts`,
`resolve-host.test.ts` kısmi, iki `package.json`) · `any` **0** · `@ts-ignore` **0** · üretim `as`
**0** · en büyük fonksiyon **90 satır** (`middleware.ts:133-222` `onRequest`, tur 1'de 82;
önceki rekor `storefront-server-fetch.ts:215-300` 86) · `assertNever` kopyası **4** (değişmedi) ·
yeni `low` **2** · kapanan `medium` **4/4** · açık `low` borcu **16** · komut koşumu **0**
(`Bash` aracı yok).

---

## KONTROL LİSTESİ

- [x] M1–M4 kapanışları tek tek doğrulandı — **dördü de kapandı**
- [x] M3'ün R-P1 kapanışı **bağımsız** doğrulandı (`base.js` kaynağı okunarak, probtan bağımsız)
- [x] M4 denetlendi (`qa` kendi işini gate edemedi); `e2e → src/messages` ithal yönüne **karar
      verildi: sağlıklı**; `'Loop Detected'`'ın katalog dışında kalması **doğru**
- [x] B bölümünün altı maddesi değerlendirildi — **yeni davranış hatası yok**, bir eskimiş
      değişmez cümlesi + bir mesaj biçimi sapması (`low`)
- [x] C tablosunun tamamı tur 1 taban çizgisiyle karşılaştırıldı — **sekiz değişmez de korunuyor**;
      grep kapsamı (kod/yorum ayrımı) tablo içinde belirtildi
- [x] D: 14 `low`'dan **0 kapandı**, 14 açık; üç satır referansı güncellendi
- [x] Her bulgu `dosya:satır` içeriyor
- [x] `SONUÇ` §4 kuralına göre verildi (0 critical/high/medium → PASS), takdirle değil
