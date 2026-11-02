# T-009 · security gate · tur 1

> **Not (Orkestratör):** Bu rapor iki ajan koşumundan derlendi. İlk koşum sekiz yüzeyi
> tek ajana yükledi ve bağlam taşınamaz hâle gelip üç denemede **hiç çıktı üretemedi**
> (brief hatası). Kapsam **parça A (API tarafı)** ve **parça B (vitrin/host tarafı)**
> olarak bölünüp sıfırdan koşturuldu; ikisine de dosya yazmak yasaklandığı için raporu
> Orkestratör döktü. Ölçümler ajanların ham çıktısıdır.

| Parça | Sonuç | critical | high | medium | low |
| ----- | ----- | -------- | ---- | ------ | --- |
| A — API tarafı | **PASS** | 0 | 0 | 0 | 3 |
| B — vitrin/host tarafı | **PASS** | 0 | 0 | 2 | 5 |

`AGENT_BASELINE.md` §4: 1–2 `medium` → PASS. Parça B'nin iki `medium`'u, `solid`'in
FAIL'i nedeniyle **zaten açılan** düzeltme turuna dahil edilir.

---

## BULGULAR — medium

### B-M1 · `multiple_host_headers` kontrolü üretimde ULAŞILAMAZ

`packages/tenancy/src/resolve-host.ts:123-125` — **sorumlu: backend** (+ `architect`, ADR-0012 notu)

Node'un HTTP ayrıştırıcısı çoğul `Host` başlığını **sessizce ilk değere indiriyor**; dizi
hiç oluşmuyor, dolayısıyla beyan edilen sebep hiç tetiklenmiyor.

Ham soketle ölçüldü:

```
Host: demo + Host: www   → 200 (demo)
sıra ters                → 404
```

Aynı davranış hem vitrin (4321) hem API (3000).

**Bugün saldırı yok** (vekil yok; iki katman da ilkini seçtiği için tutarlı). **v0.18.0
riski:** ters vekil/CDN geldiğinde **son** `Host`'a göre yönlendiren bir ön katman +
**ilk** `Host`'u okuyan vitrin = yönlendirme desenkronu → çapraz kiracı önbellek
zehirlenmesi. Asıl zarar: o sürümün incelemecisi bu satırı okuyup *"vaka ele alınmış"*
sonucuna varır. (`solid` M3 ile **aynı sınıf**: beyanı olan, gerçekliği olmayan kontrol.)

**Düzeltme:** `rawHeaders`'ta `host` tekrarını sayıp `>1`'i açıkça reddet, **veya** sebebi
kaldırıp dosya başına *"Node ilk değeri tutar; çoğulu vekil allowlist'i (v0.18.0) KENARDA
reddetmek zorunda"* notunu yaz.

### B-M2 · `custom-domain` dalı BOŞ host döndürebiliyor → yol segmenti yetkiye kayıyor

`packages/tenancy/src/resolve-host.ts:149-153` + `apps/storefront/src/lib/api-client.ts:42`
— **sorumlu: backend**

`normalizeHostname('.')` → `''` (tek sondaki nokta soyma `'.'`'ı tüketiyor). Alt alan adı
dalında karşılığı var (`label.length === 0` → `base_domain_mismatch`), **özel alan adı
dalında yok**.

Ölçülen sonuç:

```
http://${''}/trpc  →  WHATWG URL: host="trpc", path="/"
vitrin → API:      Host: trpc  ·  GET /storefront.currentTenant   ← /trpc öneki KAYIP
```

Ziyaretçi `Host: .` yolluyor; vitrin, **doğruladığı host'tan başka bir yetkiye ve başka
bir yola** istek atıyor. Bugün fail-closed (ölçüldü: 404 — `primaryDomain='trpc'` satırı
yok, kök altında rota yok), ama ilkel *"host çöküyor, yol segmenti yetkiye kayıyor"*
biçiminde duruyor.

**Düzeltme:** `resolveHost`'ta özel alan adı dalından **önce** `host.length === 0` →
`unresolved: 'unparsable_host'`; ayrıca `createStorefrontTrpcClient` boş `tenantHost`'ta
fail-closed fırlatmalı.

---

## LOW BORÇ SATIRLARI (8) — tur açmaz, ROADMAP'e

| # | Yer | Açıklama | Sorumlu | Vade |
| - | --- | -------- | ------- | ---- |
| A-L1 | `apps/api/src/auth/rate-limit/rate-limit.policy.ts:76-96` | `/trpc/*` oran sınırsız (politika haritası **tam 4** `POST /auth/*` rotası); v0.0.8'den itibaren bu yüzeyin **anonim** dalı var. Saldırgan `Host: <slug>.<APP_BASE_DOMAIN>` ile sınırsız çağırıp 200/404 ayrımından kiracı sayabilir, var olan her kiracı için 2 indeksli okuma harcatır. Marjinal bilgi kazancı ≈ 0 (aynı ayrım `slug.arkesoft.app`'e tarayıcıyla girmekle de elde edilir → ADR-0012 koşul A sayımı da kapsıyor) ve **çözümsüz** host 0 sorgu harcıyor. Mekanizma v0.0.14 borcu; **maruziyet penceresi bu sürümde kimlikliden anonime açıldı.** ⚠ **Vitrin herkese açık yayına çıkmadan v0.0.14 öne çekilmezse bu bulgu `medium`'a terfi eder.** | backend + architect | **v0.0.14 (yayından önce)** |
| A-L2 | `apps/api/src/tenancy/tenant-resolver.service.ts:93-99` | `x-arkesoft-tenant` dev başlığı `NODE_ENV !== 'production'` iken slug olarak kabul ediliyor. v0.0.8'e kadar bu başlığın eriştiği `/trpc/*` yolları `AuthGuard`'ın üyelik kontrolü arkasındaydı; **artık kimliksiz bir yol da erişiyor** → `NODE_ENV=development` ile koşan staging'de saldırgan DNS/host bilmeden slug yineleyerek kiracı adlarını toplayabilir. Üretimde fail-closed (`header_rejected_in_production`, host'a geri düşmüyor). Düzeltme: staging/preview ortamlarının `NODE_ENV=production` ile koşması runbook'ta pinlenmeli. | devops | ilk staging (~v0.0.17) |
| A-L3 | `apps/api/src/__tests__/helpers/create-test-app.ts:130-147,243-244` | İki fail-closed kapı doğru kaynaktan okuyor ve yıkıcı `scanStream`+`del`'i gerçekten kapatıyor, fakat `app.init()`'ten **sonra** çalışıyor (kapı tetiklendiğinde bağlantı kurulmuş; yıkıcı işlem yapılmıyor, `finally`'de `app.close()` var). **`DATABASE_URL` için hiçbir kapı yok** (`rg -c DATABASE_URL` → **0**) — oysa aynı helper'a dayanan izolasyon testleri gerçek `Tenant` satırı create/delete ediyor. ⚠ Kullanıcının kalıcı kısıtıyla (`prisma migrate reset` / `db push --force-reset` için birebir onay) **aynı sınıf** boşluk. Düzeltme: `DATABASE_URL` host'u için aynı loopback allowlist kapısı + kapıları `compile()` sonrası / `init()` **öncesine** taşı. | qa | v0.0.14 |
| B-L1 | `packages/tenancy/src/resolve-host.ts:91` | `normalizeHostname` **İDEMPOTAN DEĞİL** (ölçüldü: 70 girdinin **17**'si). Vitrin host'u normalize edip API'ye yolluyor, API aynı fonksiyonu **ikinci** kez uyguluyor → aynı ziyaretçi isteği iki katmanda **farklı** sınıflanıyor. Tek 200 üreten vaka: `Host: demo-magaza.arkesoft.localhost..` → vitrin `custom-domain`, API `subdomain:demo-magaza` → 200; canonical/robots/sitemap'e saldırganın seçtiği sondaki nokta yazılıyor. Çapraz kiracı veri **yok**, enjekte edilebilir bayt **yok** (yalnızca `.`), `no-store` olduğu için önbellek zehirlenmesi **yok**, tek adımda yakınsıyor. Rezerve liste **atlatılmıyor** (ölçüldü: `www\|api\|admin\|superadmin` + `..` → **4/4 404**). | backend + architect | v0.0.10 |
| B-L2 | `apps/storefront/src/pages/503.astro:23` | `Astro.originPathname` yansıtılıyor → `middleware.ts:81-83`'ün *"404/503 HER ziyarette BAYT BAYT AYNI"* iddiası **503 için yanlış** (7 yol → 7 farklı gövde). Sink bugün güvenli: protokol-göreli `//evil.example.com/` tek eğik çizgiye normalize ediliyor (**açık yönlendirme yok**) ve `"` → `&quot;` kaçışlanıyor (**XSS yok**). Kiracı verisi sızmıyor; yan etki: "Yeniden dene" sorgu dizesini kaybediyor ve sonuna `/` ekliyor. | frontend + docs | v0.0.10 |
| B-L3 | `apps/storefront/src/lib/request-origin.ts:28` | Orijin `requestUrl.port`'tan geliyor = sürecin **gerçek dinleme portu**. Ölçüldü: `robots.txt` → `Sitemap: http://demo-magaza.arkesoft.localhost:4321/...`. Üretimde konteyner portu (ör. 8080) + sabit `http` şeması herkese açık `robots.txt`/`sitemap.xml`/`canonical`'a yazılır → **iç port ifşası + yanlış kanonik**. `X-Forwarded-Proto` ile **aynı değişiklikte** çözülmeli. | devops + backend | v0.18.0 |
| B-L4 | `apps/storefront/src/middleware.ts:181` | Her anonim vitrin isteği 1 oran-sınırsız API çağrısı + 2 indeksli okuma üretiyor; `unresolved` host'lar çağrı **atmıyor** (doğru, ucuz ret) ama **bilinmeyen özel alan adı tam tur atıyor**. v0.0.14'ün oran sınırlayıcısı bu **anonim** yolu **IP bazlı** kapsamak zorunda (bugün kiracı/kullanıcı anahtarı yok). | backend | v0.0.14 |
| B-L5 | `apps/storefront/src/lib/cache-policy.ts:12-13` | `/_astro/*` istisnası *"açılmadı"* diye kayıtlı ama mekanik gerçek **daha katı: istisna AÇILAMAZ.** Ölçüldü (derlenmiş standalone sunucu): `/_astro/*` → `public, max-age=31536000, immutable`, middleware'e **hiç** ulaşmıyor, **bilinmeyen host'ta bile 200**. v0.0.10'un kiracı başına tema CSS'i bu dosyaya istisna eklemekle **çözülemez** — ya SSR rotasından servis, ya varlık yoluna kiracı ayırıcısı, ya vekil gerekir. **ROADMAP v0.0.10'a BAĞLAYICI not düşülmeli.** | architect + docs | v0.0.10 |

---

## DOCS'A GİDEN DÜZELTME (bulgu değil)

**ADR-0012 madde 4 ⑥ fazla iddialı.** Ölçüldü: `SameOriginGuard` sunucu-taraflı GET'i
geçiriyor ✔ · `Sec-Fetch-Site: cross-site` → **403** ✔ · `Referer: https://evil.example.com/`
→ **403** ✔ · **ama** `Sec-Fetch-Site` yok + `Referer` yok + GET → **200** (GET
`SAFE_METHODS`'ta, `same-origin.guard.ts:57`). Yani `Referrer-Policy: no-referrer` ile
çapraz-orijin GET veya Fetch-Metadata'sız eski tarayıcı geçebilir. **Sonuç nil** (dönen tek
dize o host'ta zaten herkese açık, çerez okunmuyor, mutasyon yok, `private, no-store`).

ADR'nin *"bu yol tarayıcıdan **kullanılamaz**"* ifadesi → *"tarayıcıdan **kullanılabilir ama
hiçbir şey kazandırmaz**"* olarak düzeltilmeli.

---

## ÖLÇÜMLER — parça A (API tarafı)

| Ne | Ham sonuç |
| -- | --------- |
| ADR-0012 **koşul A** | **KARŞILANDI, tip düzeyinde mekanik.** `router-output.test-d.ts`: `expectTypeOf<RouterOutputs['storefront']['currentTenant']>().toEqualTypeOf<{name: string}>()` (şemadan türetilmemiş literal, **tam eşitlik**) + `StorefrontTenant` eşitliği. `id`/`slug`/`status`/`primaryDomain`/`planId`/`deletedAt` tipte **yok**; adaptör Prisma `select: { name: true }` → Zod soymasına **güvenilmiyor**. |
| ADR-0012 **koşul B** | **KARŞILANDI, iki katman mekanik.** `TENANT_EXEMPT_PATHS`'e eklenmedi → `TenantGuard` 404'ü açık; pipeline `TenantGuard → AuthGuard`, `AuthGuard` `unresolved/failed` dalında `return true` (kararı `TenantGuard`'a bırakıyor). `procedures.test.ts`: `auth:anonymous + tenant:absent` → 401 `TENANT_CONTEXT_REQUIRED` pinli. Salt okunur `.query()`, girdi şeması yok, `Set-Cookie` yazılmıyor. Yanıt başlıkları `no-store, private` + `Vary: Cookie`, `ETag` yok. |
| ADR-0012 **koşul C** | **KARŞILANDI.** `storefront.router.ts:29` tek ifade: `ctx.ports.storefrontTenantRead.findPublicTenant(ctx.tenant.tenantId)`. `ctx.tenant` üzerinde `slug`/`status` okuması **0**. Dallanma 0, `null` kontrolü yok (port total). |
| ADR-0012 **koşul D** | **KARŞILANDI, beyan doğru.** İstek başına **2** okuma: `findUnique` (tekil indeks, `TENANT_SELECT`, `name` yok) + adaptör `findFirst({ id, deletedAt: null })` (PK). Çözümsüz host → **0** sorgu. Oran sınırı **yok** → A-L1. |
| pin 1 `.size === 10` | `auth-exempt-paths.test.ts:28` — var, gevşetilmemiş |
| pin 2 küme eşitliği | `:32` `toEqual(new Set(EXPECTED_EXEMPT_PATHS))` — `toContain`'e **düşürülmemiş** |
| pin 3 yeni yol `true` | `:36` + `it.each` ile on yol tek tek |
| pin 4 `/trpc/tenant.current` → `false` | `:81` var |
| pin 5 `/trpc/session.me` → `false` | `:77` var — (4+5 = "tam olarak **bir** yol açıldı" kanıtı tamam) |
| pin 6 `TENANT_EXEMPT_PATHS.size === 13` | `tenant-exempt-paths.test.ts:38` — diff'te **değişmemiş**, yalnızca yeni `it` eklendi |
| pin 7 yeni yol kiracı kümesinde `false` | `:90` var; küme literali 13 eleman, yeni yol **yok** |
| pin 8 `allowBatching:false` + `httpBatchLink` 0 | `create-trpc-request-handler.ts` `git diff` **boş**; `allowBatching: false` hâlâ `:94`. `rg "httpBatchLink"` → **5 isabet, 5'i yorum/test adı, üretim kullanımı 0**. `transport-negative.test.ts` `?batch=1` reddini pinliyor |
| dosya başı yorum sayımı | `auth-exempt-paths.ts:11` "TAM OLARAK on eleman, DÖRT grup" ✔ · `tenant-exempt-paths.ts:71` "on üç" ✔ |
| port sınırı | `tenant-read.port.ts` `git diff` **boş** · `tenant-summary.schema.ts` **boş**. Yeni port ayrı dosya (dönüş tipi `StorefrontTenant`), yeni şema ayrı dosya |
| `packages/trpc` kapalı bağımlılık listesi | `package.json` `git diff` **boş**; `dependencies` = `@arkesoft/errors`, `@trpc/client`, `@trpc/server`, `zod` (ADR-0009 §5'in **dördü**, birebir). `@arkesoft/tenancy` **eklenmemiş**. `index.ts`/`server.ts` diff'i yalnızca **ekleme** |
| **F maddesi** (T-008 tur 2 medium kapanışı) | `rg -c "NODE_ENV" create-test-app.ts` → **18** (beklenen 18 ✔, T-008'de **0**). Kapı (a) `process.env['NODE_ENV']` → DI'dan **bağımsız**, testlerin `apiEnv.NODE_ENV` override'ı kapıyı **etkileyemez**. Kapı (b) allowlist **modül sabiti** → env'den gevşetilemez. Negatif testler 2/2. Kalan boşluk → A-L3 |
| **Yol eşleştirme atlatması** (auth bypass sınıfı) | **atlatma bulunamadı.** `normalizeRequestPath` ve `buildTrpcWebRequest` **aynı** `new URL(req.url, base)` ayrıştırmasını kullanıyor → dot-segment/sorgu dizesi işlemesinde **sapma yok**; `/trpc/tenant.current/../storefront.currentTenant` iki tarafta da aynı sonuca çözülüyor; `%`-kodlu varyantlar muafiyet eşitliğini **kaybediyor** (fail-closed). tRPC `endpoint: '/trpc'` + tam-eşleşme → muaf URL başka prosedüre **yönlenemiyor**. Canlı curl probu **ölçülmedi** (statik analizle kapatıldı) |
| **AC9** — `@arkesoft/tenancy` terfisi davranış sapması | `resolve-host.ts` ve `reserved-subdomains.ts` eski `apps/api` sürümleriyle **`diff`lendi: fark yalnızca dosya başı yorumu**, gövde **birebir** (rezerve liste, normalizasyon, slug biçimi değişmedi). Paket `dependencies` **boş**, tek export yüzeyi `index.ts` |
| Sır taraması (diff + tüm yeni dosyalar) | **gerçek sır 0.** İsabetler: `.env.example`'ın önceden var olan dev placeholder'ı (**bu diff'te değişmemiş**), `/auth/reset-password` yol literalleri, `pnpm-lock.yaml` paket adları, süreç dokümanlarındaki "token maliyeti" |
| **CLAUDE.md §7** | **geçen 5 · yapısal N/A 8 · ihlal 0.** Geçen: md 4 (istisna ADR-0012 atfıyla bu sürümde eklendi), md 5 (ham `prisma` **dört maddelik** gerekçe), md 6 (**girdi şeması hiç yok** → sahiplik sorusu yapısal olarak doğmuyor), md 12 (var olmayan ⟷ soft-delete ⟷ yetkisiz → hepsi 404, `publicDetails` `{}`), md 13 (`request-logging.interceptor.ts:54` `tenantId`'yi kimlikten **bağımsız** yazıyor). N/A: md 1/2/3 (yeni kiracı tablosu yok, `Tenant` platform seviyesi), md 7 (kuyruk yok), md 8/9/10 (yeni dış kaynak/önbellek anahtarı/dosya yolu yok), md 14 (süper admin yüzeyi yok). **md 11 AKTİF ve karşılandı** (çapraz okuma 2 yeni vaka; yazma yüzeyi yok) |
| `publicTenantProcedure` tüketici sayısı | **1** (`storefront.router.ts`); `publicProcedure` HTTP'de hâlâ **erişilemez** |
| Koşulan testler | `apps/api` **42 dosya / 312 test yeşil** · `packages/trpc` **6 dosya / 32 test yeşil + Type Errors: no errors** |
| İncelenen dosya | **38** (22 `apps/api` · 12 `packages/trpc` · 4 `packages/tenancy`) |
| Geçici prob | `git status --short` **64 satır**, oturum başıyla **aynı**; repoya dokunulmadı |

---

## ÖLÇÜMLER — parça B (vitrin/host tarafı)

### `resolveHost` atlatma denemeleri — 71 ham girdi (`packages/tenancy/dist/resolve-host.js`)

| Sınıf | Girdi → sonuç |
| ----- | ------------- |
| port | `demo.a.l:8080` → `subdomain:demo` · `:99999` → `unparsable_host` · `:` → `subdomain:demo` · `:8080` → `unparsable_host` |
| `@` / kullanıcı bilgisi | `demo.a.l@evil.com` → `custom:evil.com` · `evil.com@demo.a.l` → `subdomain:demo` · `user:pass@www.a.l` → **`reserved_subdomain`** · `@demo.a.l` → `subdomain:demo` |
| boşluk | ` demo.a.l` → `unparsable_host` · `demo .a.l` → `unparsable_host` · `demo.a.l ` → `subdomain:demo` · `demo\t.a.l` → `subdomain:demo` |
| CR/LF | `demo.a.l\r` → `subdomain:demo` · `\n` → `subdomain:demo` · **`demo.a.l\r\nX-Arkesoft-Tenant: evil` → `unparsable_host`** · `demo\r\n.a.l` → `subdomain:demo` · `demo.a.l\r\n.evil.com` → `custom:demo.a.l.evil.com` · NUL → `subdomain:demo` |
| punycode/Unicode | `müşteri.a.l` → `subdomain:xn--mteri-kva70e` · `xn--mteri-xxa3n.a.l` → `unparsable_host` · `xn--www.a.l` → `subdomain:xn--www` · `xn--www-.a.l` → `unparsable_host` |
| **eşbiçim (homograph)** | `www。a.l` (U+3002) · `ｗｗｗ.a.l` (tam genişlik) · `ａｐｉ.a.l` · `w­ww.a.l` (yumuşak tire) · `%77%77%77.a.l` → **5/5 `reserved_subdomain`** (normalizasyondan geçip rezerve listeye takılıyor) · ZWJ/ZWNJ → `unparsable_host` |
| uzun etiket | 61/62/63 → `subdomain` (RFC 1123 sınırı doğru) · 64 ve 200 → `invalid_slug_format` · 255+ → `unparsable_host` |
| `..` | `demo..a.l` → `nested_subdomain` · `../demo.a.l` → `custom:'.'` · `..` → `custom:'.'` |
| kodlanmış | `demo%2ea.l` → `subdomain:demo` · `%0d%0a` → `unparsable_host` · `%2f` → `unparsable_host` · `%00` → `unparsable_host` |
| boş etiket | `.a.l` → `base_domain_mismatch` · `''` → `missing_host` · dizi → `multiple_host_headers` · `undefined` → `missing_host` |
| büyük/küçük | `DEMO.ARKESOFT.LOCALHOST` → `subdomain:demo` · `WWW.a.l`/`AdMiN.a.l` → `reserved_subdomain` |
| sondaki nokta | `demo.a.l.` → `subdomain:demo` · `demo.a.l..` → `custom:'demo.a.l.'` · `a.l.` → `bare_base_domain` |
| diğer | `notarkesoft.localhost` → `custom` (**sonek tuzağı doğru**) · `demo.a.l.evil.com` → `custom` (**içerme tuzağı doğru**) · `a.demo.a.l` → `nested` · `de_mo`/`-demo` → `invalid_slug_format` · `127.0.0.1`/`[::1]`/`2130706433` → `custom` · `/evil` `\evil` `?x=1` `#x` → hepsi `subdomain:demo` (yol/sorgu **soyuluyor**) · `http://demo.a.l` → `custom:'http'` · `[demo.a.l]` → `unparsable_host` |

**Giden `Host` baytlarında tehlikeli karakter: 71/71'de NONE** (`\r \n \t \0 ' ' @ / \ %` taraması).

### Diğer ölçümler — parça B

| Ne | Ham sonuç |
| -- | --------- |
| **Yüzey 1 kararı** — Astro'nun devrettiği doğrulama **yeterli mi** | **EVET.** 71 denemenin **hiçbiri** ne yanlış kiracıya, ne rezerve bir etikete, ne giden `Host`'ta tehlikeli bayta ulaştı. `server.allowedHosts` **ikinci bir doğruluk kaynağı** olurdu; zincirin yakalamadığı tek **sınıf** yok (iki `medium` de fail-closed kenar durum) |
| ADR-0012 md 4 **①** | **DOĞRU.** API'ye `Host: demo-magaza…` → 200 `{"name":"Demo Mağaza"}`; `Host: yok.example.com` → 404 `details:{}`. Kimlik bilgisi taşınmıyor, çerez okunmuyor |
| ADR-0012 md 4 **②** | **DOĞRU ama tam değil.** v0.0.8 öncesi 401, şimdi anonim 200 — dönen tek dize o host'ta vitrinin **kendisi** tarafından zaten yayınlanıyor (`<h1>`/`<title>`), yani yetenek vitrinle **birlikte** doğdu. Tek kapı `deletedAt: null`; `status` kapısı PM A3 ile v0.1.0'a **ertelenmiş** (askıya alınmış kiracının adı bugün 200 ile okunabilir — **kabul edilmiş varsayım**) |
| ADR-0012 md 4 **③** | **DOĞRU.** ADR-0010 md 5 ile duyurulmuş; sebep kodu tele **yazılmıyor** (`toErrorBody` `context`'i okumuyor, `error-body.ts:13-15`); ölçülen gövde `details:{}` |
| ADR-0012 md 4 **④** | **DOĞRULANDI, ölçüldü.** `resolveOutgoingHeaders` (`storefront-server-fetch.ts:106`) `headers['host']`'u **koşulsuz** `requestUrl.host`'tan **eziyor**; değer `normalizeHostname` çıktısı → 71/71 girdide port/kullanıcı bilgisi/`@`/boşluk/CR-LF/`%`/`/` **içermiyor** → **başlık enjeksiyonu yapısal olarak imkânsız**. TCP hedefi env'den sabit → **SSRF yüzeyi yok** |
| ADR-0012 md 4 **⑤** | `x-arkesoft-tenant` storefront'ta **0 eşleşme** (kod+yorum, tüm `apps/storefront`). Çalışır hâlde de yok sayılıyor: `Host: yok.example.com` + `x-arkesoft-tenant: demo-magaza` → **404** |
| ADR-0012 md 4 **⑥** | **KISMEN** → yukarıdaki "docs'a giden düzeltme" |
| **AC9** kopya sayısı | **0.** Slug regex tüm repoda **1** tanım (`resolve-host.ts:38`); 12 rezerve etiket **1** tanım (`reserved-subdomains.ts:25`); 8 sebep literali 1 kaynak + 1 üst küme tipi (11 sebep, belgeli) + 2 test. `apps/api`'de kalıntı **0**. `packages/tenancy` `dependencies: {}`; `apps/storefront` `@arkesoft/tenancy: workspace:*` → iki uygulama **aynı** normalizasyondan geçiyor (tek istisna B-L1'in çift-nokta vakası) |
| **AC18** | **7/7** (`no-store-headers.test.ts`, 1 dosya 7 test, yeşil). Gerileme **yok** (5/5 → 7/7) |
| **K7 URI argümanı** | **DOĞRULANDI.** Girdi şeması **yok** + `allowBatching:false` → sorgu dizesi hiç doğmuyor → hedef URI her kiracı için `GET /trpc/storefront.currentTenant`, **birebir aynı**. RFC 9111'de birincil anahtar hedef URI; yanıtı ayıran tek şey `Host` **başlığı** → `public` yapmak URI'ye göre anahtarlayan **her** aracıda doğrudan çapraz kiracı sızıntısı. İstisna listesi **açılmamış → doğru karar** |
| Vitrin önbellek sınıfları (canlı, derlenmiş standalone) | kiracı 200 · bilinmeyen host 404 · çıplak taban 404 · rezerve 404 · `/404` · `/503` · `robots.txt` · `sitemap.xml` → **8/8 `private, no-store`**. `Vary` yazılmıyor, `Server`/`X-Powered-By` banner'ı **yok** |
| `/_astro/*` — v0.0.10'dan **önce** bir şey gerekiyor mu | **hayır (kod) · EVET (bağlayıcı not)** → B-L5 |
| **AC6 ①** | **DOĞRULANDI.** `TenantNotFoundError` tek sınıf; `reason` yalnızca `context`'e, `context` tele **hiç** yazılmıyor. Ölçülen gövde `{"code":"TENANT_NOT_FOUND","message":"errors.tenant.notFound","details":{},"requestId":"req_…"}` — hem bilinmeyen host hem soft-delete için; adaptör ayrıca `deletedAt: null` ile ikinci savunma |
| **AC6 ②** | **DOĞRULANDI** (`map-api-error.ts:57`). `StorefrontApiFailure` iki üyeli union, `code`/`message`/`requestId` **yok** → eşitlik **tipin şekline** dayanıyor; `mapApiError` yalnızca `status`/`httpStatus` okuyor, **kod literali okumuyor** |
| **AC6 ③** | `404.astro` `locals.tenant`/`requireResolvedTenant` → **0 eşleşme**, `Astro.locals` **hiç** okunmuyor, baytı sabit. `503.astro` da `locals.tenant` okumuyor ✔ **ama** `Astro.originPathname` yansıtıyor → B-L2 |
| **AC8** | **DOĞRULANDI.** 8 sebebin tamamı tek `unresolved` dalından jenerik 404'e düşüyor; `.reason` middleware'de de okunmuyor. Canlı: rezerve/çıplak/nested/bozuk/uzun/boş host (+ `Host: .`) → **hepsi 404**, **5xx yok**. Tek 5xx yolu API erişilemezliği (tasarım) |
| **404/503 yeni oracle** | **HAYIR.** Ayrım kiracıdan **değil** API'nin erişilebilirliğinden türüyor — ölçüldü: API'yi ölü porta çevirince **aynı** bilinmeyen host 404 → **503**'e döndü, yani 503 kiracı hakkında **hiçbir bit** taşımıyor. Yan gözlem: `unresolved` host'lar API turu **atmıyor**, özel alan adları **atıyor** → zamanlama farkı host **şeklini** ayırt eder, **kiracıyı etmez** (saldırgan host'u kendi seçtiği için yeni bilgi yok) |
| `dist/client` sır taraması | **0.** 9 hassas anahtarın **gerçek değeri** → client 0, server 0. `dist/client`'ta mutlak `URL:port` 0 · DB dizesi 0 · `localhost`/`127.0.0.1` 0 · `process.env` 0 · kiracı adı 0. `STOREFRONT_API_BASE_URL` yalnızca `dist/server/virtual_astro_middleware.mjs`'de **anahtar adı** olarak (Zod şeması) — tarayıcıya **gitmiyor**. Yeni kaynakta `password\|secret\|api_key\|token\|PRIVATE KEY\|authorization` → **0**; `console.*` → **0** |
| **Adaların env okuması — kasıtlı ihlal** | `src/components/` altına `storefront-env` + `api-client` ithal eden ada yazıldı: **`eslint` çıkış 0, 0 hata** (kontrol: doğrudan `process` → `no-restricted-globals` **yakaladı**). `client:load` ile bağlanıp derlendi: build **başarılı**, ada `dist/client/_astro/__SecurityProbe.*.js` olarak **bundle'a girdi** — içinde zod'un tamamı + **32 `process` referansı** + env **anahtar adları**; **gerçek env değeri 0** (Vite yalnızca `NODE_ENV`'i ikame ediyor). Sonuç **fail-closed**: sır sızmıyor, ada tarayıcıda `process` tanımsızlığıyla kırılır. Prob dosyaları **silindi**, temiz yeniden derleme yapıldı, `git status --short` = 64 satır (oturum başıyla aynı), `probe\|__Security` → **0** |
| `solid`'in eslint `medium`'u | **DOĞRULANDI** (yukarıdaki kasıtlı ihlalle). Yorumun atıf verdiği *"modül sınırı"* mekanizması **yok**. Güvenlik sonucu ayrı bulgu **yazılmadı** — sızıntı sınıfı yalnızca anahtar adları + zod, **değer sızmıyor** |
| `pnpm audit` | `2 vulnerabilities found · 1 moderate \| 1 high` → **1 high** `multer >=2.0.0 <2.5.0` (GHSA-q7qp-rjg7-q26m, 4 yol) + **1 orta** `minimatch <11.0.1` (GHSA-g3hv-75wg-m249, 62 yol, **hepsi `eslint` altında = devDep**; artık `packages/tenancy>eslint` yolu da var). **v0.0.7 farkı: FARK YOK** — üç yeni bağımlılık (hepsi katalogda **exact**, 7 gün kuralı `astro 7.4.4` ve `@astrojs/react 7.1.2`'yi **eledi**) **0 yeni zafiyet** getirdi. İkisi de bu sürüme **atfedilmiyor** (v0.0.16 / devDep) |
| **CLAUDE.md §7** karşılanmayan madde | **yok.** md 6: prosedürün **girdi şeması yok** → IDOR yüzeyi **sıfır**. md 11: `trpc-cross-tenant.isolation.test.ts:230+` çapraz **okuma** + soft-delete bayt eşitliği (yazma prosedürü yok → N/A); `test:isolation` 2 dosya/4 test yeşil. md 13: **vitrin bu sürümde log üretmiyor** (K11, borç v0.0.10 — **kabul edilmiş**); API tarafı `tenantId` logluyor |
| KVKK | Gereksiz veri **yok**: tel sözleşmesi tek alan `{name}`; `id`/`slug`/`status`/`primaryDomain`/`planId`/`deletedAt` **bilinçli** dışarıda; sızdırmazlık **portun dönüş tipine** dayanıyor. Kişisel veri toplanmıyor, üçüncü tarafa veri gitmiyor, silme talebi akışı `deletedAt` ile **uyumlu** (soft-delete → 404) |
| İncelenen dosya | **31** (vitrin 18 · tenancy 3 · api/trpc/errors 8 · yapılandırma 2) + `dist/client` 4 + `dist/server` hedefli |
| Koşulan komutlar | `pnpm audit` · `no-store-headers.test.ts` · `test:isolation` · `pnpm --filter @arkesoft/storefront build` **3×** (1 temiz · 1 kasıtlı ihlal · 1 temizlik sonrası; kök `pnpm build` **koşulmadı**) · derlenmiş `dist/server/entry.mjs` 4321'de canlı prob (ham soket + curl, iş sonunda **kapatıldı**, port boş) · 2 geçici TS probu **scratchpad'de (repo dışı)**. Playwright/e2e **koşulmadı** (`qa`'nın). Parça A'nın beş maddesine **dokunulmadı** |
