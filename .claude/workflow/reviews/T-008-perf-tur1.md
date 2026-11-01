# T-008 · `perf` gate · tur 1

> Bu dosyayı **Orkestratör** yazdı. `perf` ajanının tanımlı araçları `Read, Bash, Grep, Glob` —
> `Write` yok, bu yüzden raporu handoff paketi olarak döndürdü. İçerik ajanın döndürdüğü
> metindir; Orkestratör yorum eklemedi.

```
GATE: perf
SONUÇ: PASS
```

AGENT_BASELINE.md §4: tek `medium` bulgu (eşik ≥3 `medium` veya ≥1 `high`/`critical`) → **PASS**,
bulgu teknik borca kaydedilir.

## BULGULAR

### medium — AC16 bütçesi gerçek rota kodunu ölçmüyor

`apps/admin/scripts/check-bundle-budget.ts:107-139` (`collectFirstRouteManifestKeys`) +
`apps/admin/bundle-budget.config.ts:9-13`

AC16 bütçesinin ölçtüğü küme ("entry + geçişli statik imports") TanStack Router'ın
`autoCodeSplitting`'i yüzünden gerçek rota kodunu **içermiyor**. `solid` tur 1 M7
**bağımsız olarak doğrulandı** (kanıt ÖLÇÜMLER'de).

Giriş yapmış bir kullanıcı için gerçek ilk ekran (`/`) = entry (126.73 KiB) + `_app.tsx` component
chunk (33.03 KiB — AppShell/Sidebar/Topbar/UserMenu + `@radix-ui/react-dropdown-menu`) +
`_app.index` (0.49 KiB) ≈ **160.3 KiB**; script yalnızca **131.38 KiB**'i görüyor →
**~29 KiB (yaklaşık %18) kör nokta**.

Sonuç: bugün herhangi bir rotaya (örn. gelecekteki tenant listesi / medya ekranı) ağır bir
kütüphane (chart, rich-text, date-picker) eklense AC16 bunu **asla yakalamaz** — o kod
`isDynamicEntry: true` olarak işaretli ve script `dynamicImports`'u izlemiyor (bilerek; K7'nin
yazılı tasarımı).

**CSS bu kör noktadan muaf:** Tailwind tek global stylesheet ürettiği için (manifest'te `css` alanı
yalnızca `index.html` entry'sinde var, hiçbir dinamik route girdisinde yok) CSS bütçesi uygulamanın
**tüm** CSS'ini doğru ölçüyor.

**Düzeltme:** entry'nin yanına panelin gerçekte her zaman yüklediği ilk rotanın (`_app.tsx`'in
`component` + `errorComponent` split'leri ve `_app.index.tsx`) dinamik girdisini de BFS'e dahil et;
ya da iki sayıyı ayrı raporla ("paylaşılan çekirdek" / "ilk rota toplamı") ve AC16'nın eşiğini
ikincisine bağla. K7'nin "ilk rota" tanımı buna göre netleştirilmeli.

**Sorumlu ajan:** `architect` (K7 tanımı) + `frontend` (S5, script implementasyonu)

## ÖLÇÜMLER

Komut (ajanın kendi koşumu): `pnpm --filter @arkesoft/admin build`

```
dist/assets/index-DefH_jTw.css          12.83 kB │ gzip:   3.44 kB   (Vite'ın kendi yaklaşıklığı)
dist/assets/_app-D320CRSD.js             0.46 kB │ gzip:   0.32 kB
dist/assets/auth-rest-Brne-sdx.js        0.53 kB │ gzip:   0.30 kB
dist/assets/ErrorState-D105erQ5.js       0.81 kB │ gzip:   0.45 kB
dist/assets/_app.index-DpafNntd.js       1.00 kB │ gzip:   0.49 kB
dist/assets/messages-Cjx3QkUf.js        12.34 kB │ gzip:   4.77 kB
dist/assets/dist-DH8I5BZm.js            31.67 kB │ gzip:   9.96 kB
dist/assets/_auth.sign-in-D_i5i5Dc.js   39.22 kB │ gzip:  13.84 kB
dist/assets/_app-yYJxfhm_.js            96.65 kB │ gzip:  33.03 kB
dist/assets/index-ClzUd2ox.js          420.67 kB │ gzip: 131.26 kB

[bundle-budget] ilk rota JS  (gzip): 131.38 KiB / bütçe 250.00 KiB  (%52.6, rezerv %47.4)
[bundle-budget] ilk rota CSS (gzip):   3.35 KiB / bütçe  50.00 KiB  (%6.7,  rezerv %93.3)
exit 0 (aşım yok)
```

Orkestratör'ün bildirdiği `131.39 / 3.49` ile ajanın ölçtüğü `131.38 / 3.35` arasındaki fark
gürültü/zamanlama farkı (CSS'te ±%4); build deterministik, içerik kodu değişmedi, aşım durumunu
etkilemiyor.

### Bütçe kümesine giren anahtarlar (`dist/.vite/manifest.json`, isim isim)

```
isEntry: "index.html" → file: assets/index-ClzUd2ox.js, css: assets/index-DefH_jTw.css
  imports: ["_messages-Cjx3QkUf.js"]

BÜTÇE KÜMESİ = {index-ClzUd2ox.js, messages-Cjx3QkUf.js} (JS)
             + {index-DefH_jTw.css} (CSS)

BÜTÇE DIŞI (isDynamicEntry: true — dört rotanın TAMAMI):
  src/routes/_app.tsx?tsr-split=component          → _app-yYJxfhm_.js        33.03 KiB gzip
  src/routes/_app.tsx?tsr-split=errorComponent     → _app-D320CRSD.js         0.32 KiB
  src/routes/_app.index.tsx?tsr-split=component    → _app.index-DpafNntd.js   0.49 KiB
  src/routes/_auth.sign-in.tsx?tsr-split=component → _auth.sign-in-D_i5i5Dc.js 13.84 KiB
  + geçişli bağımlılıkları: ErrorState (0.45), auth-rest (0.30), dist-DH8I5BZm (9.96)
```

### 131.38 KiB'nin neyin ölçüsü olduğu

Sourcemap + grep ile ayrıştırıldı (`--sourcemap` CLI bayrağıyla **ephemeral** build; hiçbir dosya
değiştirilmedi, `.map` dosyaları build sonunda silindi).

- **126.73 KiB (gzip) → `index-*.js`:** react + react-dom + scheduler + use-sync-external-store +
  `@tanstack/react-query` (query-core) + `@tanstack/react-router` (router-core + history + store) +
  `@trpc/client` (+ tip-only `@trpc/server`) + **zod** (gerçek runtime: `ZodObject`/`ZodString`/
  `ZodEnum`/`ZodNullable`/`safeParse` sınıfları minified kodda doğrulandı, **302** `_zod`
  iç-referansı) + panelin kendi `trpc-client.ts`/`session-query.ts`/`normalize-panel-error.ts`/
  `panel-error.ts` (toplam <10 KiB kaynak).
  Bunlar `_app.tsx`'in `beforeLoad` guard'ı **yüzünden** her rotada zorunlu — guard bileşen render
  edilmeden **önce** koşmak zorunda, dolayısıyla **split edilemez**.
- **4.65 KiB (gzip) → `messages-*.js`:** 19 platform hata kodu + ~24 ekran metni kataloğu.

→ Ölçülen rakam **ne** "yalnızca React+Router+Query çekirdeği" **ne de** "ilk ekranın tam maliyeti" —
**"her rotada kaçınılmaz paylaşılan çekirdek + auth guard'ın zorunlu bağımlılıkları"**dır.

`react-hook-form` / `@hookform/resolvers` / `@radix-ui/react-dropdown-menu` bu kümede **yok**
(grep: `formState`/`handleSubmit` yalnızca `_auth.sign-in-*.js`'te, `DropdownMenu`/`radix` yalnızca
`_app-yYJxfhm_.js`'te, entry'de 0) → kod bölme bu üçü için **doğru** çalışıyor.

### Bütçenin yakalayacağı / kaçıracağı regresyon

- **Yakalar:** paylaşılan çekirdeğe (`main.tsx`, `router.ts`, `query-client.ts`, `trpc-client.ts`,
  `normalize-panel-error.ts`, `messages.ts`, `routeTree.gen.ts`'in statik kısmı) veya global CSS'e
  (`packages/ui` token/bileşen stilleri, Tailwind `@theme`) eklenecek **her şey**.
- **Kaçırır:** `_app.tsx`'in component'ine (AppShell/Sidebar/Topbar/UserMenu), `_app.index.tsx`'e
  veya `_auth.sign-in.tsx`'e eklenecek **her şey** — örn. v0.0.16/v0.4.0'da dashboard'a bir
  grafik/rich-text/tarih seçici kütüphanesi eklenirse JS bütçesi **sıfır hareket eder**.

### En büyük beş chunk (gzip)

| # | Chunk | gzip | Bütçede? |
| - | ----- | ---- | -------- |
| 1 | `index-ClzUd2ox.js` (entry) | 131.26 KiB | ✔ |
| 2 | `_app-yYJxfhm_.js` (AppShell) | 33.03 KiB | ✗ |
| 3 | `_auth.sign-in-D_i5i5Dc.js` | 13.84 KiB | ✗ |
| 4 | `dist-DH8I5BZm.js` (paylaşılan alt-chunk) | 9.96 KiB | ✗ |
| 5 | `messages-Cjx3QkUf.js` | 4.77 KiB | ✔ |

İlk beş bağımlılığın payı (entry sourcemap, **ham kaynak** boyutu — minify/gzip sonrası oranla
birebir aynı değil, ama ağırlık sıralaması güvenilir):
`react-dom` (620 KiB) > `zod` (361 KiB) > `@tanstack/router-core` (146 KiB) >
`@tanstack/query-core` (119 KiB) > `@trpc/client`+`server` (95 KiB).

### `./server` alt yolu (ADR-0009)

```
grep -rn "@arkesoft/trpc/server" apps/admin/src apps/admin/*.ts            → 0
grep "PrismaClient|@prisma/client|resolveHost|BetterAuthOptions|better-auth/node" dist/ → 0
packages/trpc/dist/server.js → hiçbir chunk'tan referans edilmiyor (sourcemap kaynak listesinde yok)
```

### Tüketicisiz export'ların bundle maliyeti (AC15)

`grep -o "Toast|DataTable|CardHeader|CardTitle" dist/assets/*.js` → **tüm dosyalarda 0 eşleşme**.
Barrel export olmasına rağmen ESM tree-shaking doğru çalışıyor. **Pozitif tespit, bulgu değil.**

### 19 katalog girdisinin bundle'a inişi

- **İnen (üretim, tarayıcı grafiği):** react · react-dom · `@tanstack/react-router` ·
  `@tanstack/react-query` · `@trpc/client` · zod · react-hook-form (sign-in chunk'ında) ·
  `@hookform/resolvers` (sign-in chunk'ında) · `@radix-ui/react-dropdown-menu` (`_app` chunk'ında) ·
  clsx + tailwind-merge (`packages/ui`, küçük).
- **Bundle'a hiç girmeyen 9 girdi:** `@types/react` · `@types/react-dom` · vite ·
  `@vitejs/plugin-react` · `@tailwindcss/vite` · `@tanstack/router-plugin` · `@playwright/test` ·
  `eslint-plugin-react-hooks` · `eslint-plugin-jsx-a11y`. `tailwindcss` kendisi build-time CSS
  üretici — JS bundle'a girmez.

### Önbellek stratejisi — sunucu

`apps/api/src/http/no-store-response-headers.ts` · `no-store-headers.middleware.ts` ·
`http-hardening.initializer.ts` · `app.module.ts:111`

`consumer.apply(NoStoreHeadersMiddleware).forRoutes({ path: '*path', method: ALL })` — `apps/api`'nin
**kendi** route'larının tümüne (yalnızca `/trpc` + `/auth` + `/health`; bu servis başka bir şey
sunmuyor) `cache-control: no-store, private` + `vary: Cookie`, ETag kapatılmış
(`instance.set('etag', false)`).

Gerçek koşum: `pnpm --filter @arkesoft/api test` → **334/334** geçti (`no-store-headers.test.ts`
5/5 dahil — 200 + 401 + 403×2 + 404, hepsinde `no-store` + `Vary: Cookie` + ETag-yok doğrulanıyor).

**ETag'in bu yollarda önceden değeri: yok.** Tüm yanıtlar session-cookie'ye bağlı kişiselleştirilmiş
JSON (`session.me`, sign-in/sign-out); koşullu doğrulama (304) için pratik fayda yapısal olarak
sıfır. ETag hesaplamasını kapatmak küçük ama **gerçek** bir CPU tasarrufu — **performans kaybı
değil, küçük bir kazanç**.

`/assets/*` etkisi: **dev'de doğrulandı** — Vite proxy yalnızca `/trpc` ve `/auth`'u `apps/api`'ye
yönlendiriyor (`vite.config.ts:84-87`), statik varlıklar Vite dev sunucusundan servis ediliyor,
middleware'e hiç uğramıyor. **Prod'da ölçülemedi:** architect K1 tablosunun mimari niyeti
("ingress `/trpc/*`,`/auth/*` → API; kalanı statik SPA") aynı ayrımı öngörüyor ama bu repoda henüz
ingress/Helm/Pulumi yapılandırması **yok**.

### Önbellek stratejisi — istemci

`apps/admin/src/app/query-client.ts` · `api/session-query.ts` · `routes/_app.tsx:46-52,123-126`

`retry: false` + `refetchOnWindowFocus: false`. Guard
`queryClient.query({ ...sessionMeQueryOptions, staleTime: 'static' })`, bileşen
`useQuery(sessionMeQueryOptions)` → **aynı** anahtar (`['session','me']`), **aynı** cache →
ikinci ağ isteği **yok** (kod okunarak doğrulandı).

`auth-rest.ts` içinde `/auth/get-session` çağrısı **yok** (grep: 0 eşleşme) → Orkestratör'ün
sorduğu **"çift oturum okuma" iddiası bu sürüm için geçersiz**; tek okuma var (`/trpc/session.me`).

Çıkışta `queryClient.clear()` — bugün cache'te tek anahtar olduğu için maliyeti ölçülebilir değil
(bellek içi Map temizliği, ağ çağrısı yok).

### N+1 / sorgu davranışı

`packages/trpc/src/routers/session.router.ts:14-16` — resolver **tek ifade**, `ctx.auth`'tan okuyor,
DB sorgusu **yok** (grep: dosyada `prisma`/`withTenant`/`.findMany` → 0). v0.0.7 yeni
tablo/migration eklemiyor (`git diff --stat` içinde `packages/db` yok). Liste render'ı yok
(`DataTable` tüketicisiz) → **N+1 sınıfı bu sürümde yapısal olarak oluşamaz.**

### Ölçülemeyenler (kapsam dışı, bu sürüme atfedilmez)

| Metrik | Durum |
| ------ | ----- |
| Core Web Vitals (LCP/INP/CLS) | Lighthouse CI altyapısı v0.0.20'de (vitrin). `apps/admin` bir SPA arka ofis; CWV bütçesi ona bağlanmadı (PM riski 6, architect riski 10). Statik bundle analizi yapıldı. |
| API p95 / Arama p95 | k6 altyapısı v0.0.14+. |
| Vitrin ada (client JS) | N/A — bu sürüm `apps/storefront`'a dokunmuyor. |
| Admin ilk yük bütçesi (AC16) | **Ölçüldü** — JS %52.6, CSS %6.7, ikisi de bütçe içinde; ama ölçüm kümesinin kapsamı sınırlı (bkz. BULGULAR). |

### Çakışma disiplini

Playwright / 5173: **dokunulmadı.** Yalnızca `pnpm --filter @arkesoft/admin build` koşturuldu (iki
kez: biri ephemeral `--sourcemap` ile analiz için, map dosyaları silindi; sonra normal build ile
tekrar üretildi). `vite dev` / `vite preview` hiç çağrılmadı, 5173 portuna bağlanılmadı.
Kaynak dosya değiştirilmedi — yalnızca `dist/` build çıktısı.
