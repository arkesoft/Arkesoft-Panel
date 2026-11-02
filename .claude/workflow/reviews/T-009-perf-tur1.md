# T-009 — perf gate — tur 1

Tarih: 2026-11-02 · Sürüm: v0.0.8 (Astro SSR vitrin iskeleti) · Remit: HAFİF (gözlem, eşik zorlaması yok — architect daraltması)

GATE: perf
SONUÇ: PASS

BULGULAR: yok

ÖLÇÜMLER:

**1. İstemci JS (ada maliyeti) — `TenantGreeting.tsx`**
- Direktif: `client:idle` (`src/pages/index.astro:28`) — en tembel makul seçim (öğe ilk ekranda zaten görünür, `client:visible` ek kazanç sağlamaz).
- `dist/client` (temiz `astro build`, 4 dosya, raw/gzip): `client.Cd-EeyjT.js` (react-dom+scheduler) 212836B/65840B · `react.CvnImTBr.js` 7909B/3041B · `TenantGreeting.DrNdMUQ3.js` 728B/498B · `messages.BmdPD-KH.css` 5359B. **Sayfa başı toplam client JS gzip ≈ 69.4 KB** — bütçe (<100 KB gzip) içinde, %69 kullanım.
- Gözlem (bulgu DEĞİL — gerekçeli karar var): bu maliyetin TAMAMI `<details>/<summary>`'nin native davranışını DEĞİŞTİRMEYEN bir "hidrasyon kanıtı" adası içindir (`docs/ux/T-009.md:301-307`, AC2 — hidrasyonun programatik doğrulanabilir olması şartı). `po`/`ux` kararı, ADR'de gerekçeli; ada "gereksiz" diye işaretlenmedi.
- `node:http` ponyfill sızıntısı: `grep -rl "node:http" dist/client` → 0 eşleşme. **Sızmamış, teyit edildi.**

**2. İstek başına sunucu maliyeti**
- Çözümlenmiş kiracı: 2 okuma (kod incelemesi — `tenant-resolver.service.ts` `findUnique(slug)` tekil indeks + `storefront-tenant-read.port.adapter.ts` `findFirst({id, deletedAt:null})` PK). Prisma canlı sorgu log'u ölçülemedi (`DEBUG=prisma:query` izole bir ikinci API sürecinde (`:3099`) denendi, driver-adapter çıktı vermedi) — sayı **kod incelemesiyle** teyit edildi, runtime log ile değil.
- İki okumanın birleştirilmesi **önerilmedi**: `TENANT_SELECT` bilerek `name` taşımıyor (minimal context, ADR-0012/R2); birleştirme bu sızdırmazlık ayrımını bozar ve ölçülmüş bir perf bütçesi olmadan (v0.20.0) yapılmaması kasıtlı bir karar — takas doğru, gevşetme önerilmedi.
- `unresolved` (rezerve/bozuk host, örn. `www.arkesoft.localhost`): middleware kodu (`src/middleware.ts:161-165`) API çağrısından ÖNCE döner → **0 sorgu, teyit edildi** (kod okumasıyla; ayrıca API'ye hiç istek gitmediği runtime'da da gözlendi — ilgili istek API sürecinin log'unda hiç görünmedi).
- Bilinmeyen özel alan adı (`ozel-alan-adi-yok.example.com`, `custom-domain` dalı): 1 sorgu (`resolveByPrimaryDomain`, tekil indeks) — API turu atıyor, sonra "bulunamadı" ile 404.
- N+1: liste yüzeyi bu sürümde YOK (3 statik sayfa + 1 tekil kiracı okuma) → **N+1 deseni yapısal olarak yok, teyit edildi.**

**3. SSR yanıt süresi — taban çizgisi (standalone `dist/server/entry.mjs`, `n=25`, loopback, izole API süreci)**
| Senaryo | p50 | p95 | min | max |
|---|---|---|---|---|
| 200 — demo-magaza (çözümlenmiş kiracı, 2 okuma) | 5.6 ms | 7.3 ms | 4.6 ms | 18.7 ms |
| 404 — `www.arkesoft.localhost` (rezerve, API turu yok) | 1.2 ms | 1.4 ms | 1.1 ms | 2.9 ms |
| 404 — bilinmeyen özel alan adı (API turu var, 1 okuma) | 3.6 ms | 4.5 ms | 3.2 ms | 6.1 ms |
| 503 — API ölü (ECONNREFUSED) | 2.7 ms | 10.1 ms | 2.2 ms | 11.1 ms |

Hepsi API p95 bütçesinin (<500 ms) çok altında — bu beklenen, sürüm henüz tema/ürün/görsel taşımıyor. `unresolved` (1.2 ms) ile bilinmeyen özel alan adı (3.6 ms) arasındaki ~2.4 ms fark **host ŞEKLİNİ** ayırt ediyor (API turu var/yok), kiracı VARLIĞINI değil — AC8'in "8 sebep tek jenerik 404" garantisiyle tutarlı, zamanlama kanal sızıntısı (timing side-channel) olarak kiracı bilgisi taşımıyor.

**4. Bundle + build**
- `pnpm --filter @arkesoft/storefront build`: **1.53 s** (temiz `dist` silindi, sıfırdan).
- `dist/client`: 228 KB toplam (4 dosya). `dist/server`: 1.3 MB.
- Yeni bağımlılıklar (`astro 7.4.2`, `@astrojs/node 11.1.9`, `@astrojs/react 7.1.1`) client bundle'a sızmamış (react-dom yalnızca `_astro/client.*.js`'te, beklenen).

**5. Core Web Vitals (Lighthouse)**
- **Ölçülemedi: Lighthouse/Lighthouse CI bu sürümde kurulu değil** (`npx lighthouse` paket bulunamadı; kurmak yeni bir ana bağımlılık eklemek olur, onay gerektirir — eklenmedi). ROADMAP/architect daraltması zaten bu sürümde Lighthouse altyapısını gerektirmiyor (v0.0.20 hedefi).
- Statik inceleme (yerine): `BaseLayout.astro` görsel içermiyor (`<img>` yok → CLS riski bu sürümde yapısal olarak düşük), özel web fontu yüklenmiyor (sistem fontu, FOIT/FOUT riski yok), DOM küçük (üç sayfa da tek `<h1>`+`<p>`(+ada) iskeleti). LCP elemanı SSR'lı metin, client JS'e bağımlı değil (`client:idle` ana thread'i bloklamaz). Bu gözlemler ÖLÇÜM değil, v0.0.10'da tema gelince Lighthouse ile doğrulanacak.
- `no-store` önbellek denetimini düşürecek — **beklenen, bulgu değil** (aşağıya bkz.).

**6. Önbellek politikası**
- 4 yanıt sınıfı elle doğrulandı (curl, `Host` başlığı değiştirilerek): 200 (kiracılı) · 404 (rezerve host) · 404 (bilinmeyen özel alan adı) · 503 — **4/4 `cache-control: private, no-store`**.
- Gevşetme **önerilmedi** — bağlayıcı kısıt (RFC 9111: hedef URI `GET /trpc/storefront.currentTenant` her kiracı için birebir aynı, tek ayırıcı `Host` BAŞLIĞI; `public` yapmak URI-anahtarlı herhangi bir aracıda çapraz kiracı sızıntısı olurdu). Maliyet beyanı: CDN/edge önbelleği yok → her istek API'ye gidiyor (yukarıdaki p50/p95 tablosu bu maliyeti taban çizgisi olarak kaydediyor), CDN v0.18.0/v0.20.0'da gelecek.

**7-9. Görsel / DB yükü (transaction, indeks) / kuyruk**
- Görsel: bu sürümde görsel YOK — kapsam dışı (ürün/tema henüz gelmedi).
- Transaction: bu yüzeyde yazma işlemi yok (storefront salt-okunur) — kapsam dışı.
- İndeks: `findUnique(slug)` / `findUnique(primaryDomain)` tekil indeks kullanıyor (kod incelemesi); liste/seq-scan riski taşıyan sorgu bu sürümde yok, `EXPLAIN ANALYZE` çalıştırılmadı (gerek yok, tek satır okuma).
- Kuyruk: bu yüzeyde kuyruk işi yok — kapsam dışı.
- Arama p95: ölçülemedi — Meilisearch bu task kapsamında entegre değil.
- Admin ilk yük: kapsam dışı — bu task storefront'u kapsıyor, admin'e dokunulmadı.

**Temizlik:** Ölçüm için `apps/storefront` dist'i yeniden derlendi (kod dosyası değişmedi). İzole süreçler (storefront `:4322`, test-amaçlı API `:3099`) iş bitince kapatıldı; `git status --short` baseline ile BİREBİR aynı (aşağıda).

```
(ölçüm öncesi/sonrası git status --short birebir aynı — perf gate hiçbir dosya değiştirmedi)
```
