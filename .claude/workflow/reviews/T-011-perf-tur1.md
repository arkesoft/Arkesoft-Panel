# T-011 — GATE: perf — tur 1

Tarih: 2026-11-03 · Sürüm: platform patch 0.1.0 → 0.1.1 (v0.0.9.1)

GATE: perf
SONUÇ: FAIL

---

## BULGULAR

- **[SEV: high]** `turbo.json:14-21` (`tasks.build.env`) — `lint`/`typecheck` görevlerine
  env bildirimi **bilinçli olarak eklenmedi** (gerekçe: "ESLint ve tsc bu değişkenleri
  okumuyor"). **Ölçüm bu gerekçeyi çürütüyor.** `lint`/`typecheck` → `dependsOn: ["^build",
  "generate"]` zincirinden geçiyor; `build` görevinin env bildirimi (`APP_BASE_DOMAIN` /
  `STOREFRONT_API_BASE_URL`) değer değiştirdiğinde **sadece build değil, transitif olarak
  lint/typecheck de kademeli (cascading) önbellek geçersizleşmesi yaşıyor** — 19 paketten
  18'i `lint`'te, 11'i `typecheck`'te önbelleği kaçırıyor (yalnızca `@arkesoft/config`,
  hiçbir `^build` bağımlılığı olmayan tek yaprak paket, isabet ediyor). Yani "bildirilmeyen
  görev etkilenmiyor" iddiası **yanlış**: izolasyon yalnızca görevin **kendi** `env` listesiyle
  sağlanamıyor, çünkü `dependsOn` zinciri üstündeki `build`'in hash'i aşağı sızıyor.
  **Önerilen düzeltme:** env bildirimini kök `turbo.json`'daki global `build` görevinden
  `apps/storefront/turbo.json` (paket bazlı override) içine taşı — devops'un kendi yorumu
  bunu zaten "daraltılabilirdi" diye not etmiş (`turbo.json` build görevi yorumu, son satır),
  ama uygulanmamış. — **sorumlu ajan: devops**

- **[SEV: low]** `apps/storefront/src/lib/storefront-env-schema.ts:39-67` — `solid`'in
  kaydettiği bilinen kopya (`packages/config/src/env.ts:187-203`'ün birebir eşi). **Ölçüm:**
  üretilen çıktıdaki kopyalanan blok (şema + `parseStorefrontEnv` fonksiyonu) ham **1459 bayt**;
  bu kod zaten `dist/server/virtual_astro_middleware.mjs` (55.584 bayt, `dist/server` toplamı
  1.3 MB) içinde ve *pre-existing* (K17) eager-parse deseniyle gerekli — kopyalanmasaydı bile
  aynı boyutta bir kod bloğu (başka bir dosyadan) orada olacaktı. **Sonuç: ölçülebilir bir
  bundle-boyutu maliyeti YOK** (<%0.11 of `dist/server`, client'a hiç girmiyor) — bu salt
  bakım borcu, v0.0.14'e kayıtlı düzeltme doğru yönlendirilmiş. Bu turda kapatılmayacak —
  borç kaydı metni: "düşük — `storefront-env-schema.ts:39-67`, kopya `parseEnv` gövdesi,
  `@arkesoft/config` bağımlılık sınıflandırması netleşince (Dockerfile sonrası) tüketilsin —
  sorumlu: devops/backend, vade: v0.0.14."

---

## ÖLÇÜMLER

### İŞ 1 — Turbo önbellek davranışı

**1. Build önbelleği sıcak durumda isabet ediyor mu?**
```
$ pnpm build     (1. koşum)
Tasks:    13 successful, 13 total
Cached:    13 cached, 13 total
Time:    50ms >>> FULL TURBO

$ pnpm build     (2. koşum, tekrar)
Tasks:    13 successful, 13 total
Cached:    13 cached, 13 total
Time:    56ms >>> FULL TURBO
```
PASS — sıcak durumda isabet oranı %100, tekrarlanabilir.

**2. Bildirim doğru çalışıyor mu (build geçersizleşmeli)?**
```
$ APP_BASE_DOMAIN=olcum.test pnpm build
Cached:    1 cached, 13 total       (yalnızca db:generate — build görevi değil)
Time:    3.471s

$ APP_BASE_DOMAIN=olcum.test3 pnpm build   (farklı yeni değer)
Cached:    1 cached, 13 total
Time:    3.491s

$ pnpm turbo run build --force      (soğuk referans, hiç önbellek yok)
Cached:    0 cached, 13 total
Time:    4.015s
```
→ env değeri değişince `build` önbelleği **13 görevden 12'sinde geçersizleşiyor**
(`db:generate` hariç tüm paketler: `config, errors, tenancy, integrations, ui,
theme-sdk, trpc, db, superadmin, admin, storefront, api`) — soğuk build'e eşdeğer
bir maliyet (~3.5–4.0 sn). Bildirim **işe yarıyor** (amacına ulaşıyor), ama kapsamı
yalnızca `storefront`'un ihtiyacı değil **tüm paketlerin build'i** — bu devops'un
yorumunda ("KABUL EDİLEN MALİYET … TÜM paketlerin build önbelleği geçersizleşir")
**bilinçli ve belgelenmiş** bir maliyet, dolayısıyla ayrı bulgu açmadım (zaten
yazılı kabul edilmiş).

Tersine doğrulama — hash gerçekten **değer bazlı** (deterministik, geri alınabilir),
tek yönlü bir "zehirlenme" değil:
```
$ APP_BASE_DOMAIN=arkesoft.localhost STOREFRONT_API_BASE_URL=http://127.0.0.1:3000 pnpm build   (.env'deki gerçek değer, kabuktan)
Cached:    1 cached, 13 total   Time: 3.999s     (ilk kez bu DEĞER → miss, beklenen)
$ (aynı komut tekrar)
Cached:    13 cached, 13 total  Time: 16ms >>> FULL TURBO   (aynı DEĞER → hit)
$ pnpm build   (env unset, orijinal temel durum)
Cached:    13 cached, 13 total  Time: 47ms >>> FULL TURBO   (önceden görülmüş durum → hit)
```
PASS — bildirim doğru çalışıyor, kalıcı bozulma yok.

**3. Bildirilmeyen görevler (`lint`, `typecheck`) gerçekten etkilenmiyor mu?**
```
# temel durum (env unset, önbellek ısınmış)
$ pnpm lint        → Cached: 19 cached, 19 total   Time: 16ms  >>> FULL TURBO
$ pnpm typecheck    → Cached: 19 cached, 19 total   Time: 16ms  >>> FULL TURBO

# APP_BASE_DOMAIN=olcum.test4 (yeni değer, declared `env` listesinde YOK)
$ pnpm lint        → Cached: 2 cached, 19 total    Time: 12.438s
$ pnpm typecheck    → Cached: 8 cached, 19 total    Time: 2.348s

# her iki değişken birlikte değiştirildiğinde (lint)
$ APP_BASE_DOMAIN=olcum.test5 STOREFRONT_API_BASE_URL=http://x.test pnpm lint
  → Cached: 2 cached, 19 total   Time: 9.387s

# aynı değerle TEKRAR (determinizm kontrolü)
$ APP_BASE_DOMAIN=olcum.test4 pnpm lint        → Cached: 19 cached, 19 total  Time: 44ms  >>> FULL TURBO
$ APP_BASE_DOMAIN=olcum.test4 pnpm typecheck    → Cached: 19 cached, 19 total  Time: 17ms  >>> FULL TURBO
```
**SONUÇ: devops'un gerekçesi YANLIŞ.** `lint` 19 paketten **17'sinde**, `typecheck`
19 paketten **11'inde** önbelleği kaçırıyor — tek sebep `dependsOn: ["^build",
"generate"]` zincirinin, env değişince geçersizleşen `build` görev hash'ini yukarı
taşıması. Yalnızca `@arkesoft/config` (hiçbir iç paket bağımlılığı olmayan tek
paket, CLAUDE.md §3 sorumluluk tablosuyla uyumlu) her iki görevde de isabet etti —
bu da zincir teorisini doğruluyor (bağımlılığı olmayan paket etkilenmiyor,
bağımlılığı olan her paket etkileniyor).

Büyüklük: `lint` 16ms → 9.4–12.4sn (yerel makinede ~600–775×), `typecheck` 17ms →
2.35sn (~140×). CI'da soğuk runner'da (bu ölçümler zaten ısınmış yerel disk
önbelleğiyle alındı) mutlak etki daha büyük olur.

**4. Süre etkisi özeti:**
| Senaryo                          | Süre     | Önbellek    |
| --------------------------------- | -------- | ----------- |
| `build` sıcak (değişiklik yok)    | 16–56ms  | 13/13 FULL  |
| `build` soğuk (`--force`)         | 4.015s   | 0/13        |
| `build` env değişince             | 3.47–4.0s| 1/13        |
| `lint` sıcak                      | 16ms     | 19/19 FULL  |
| `lint` env değişince (bildirimsiz)| 9.4–12.4s| 2/19       |
| `typecheck` sıcak                 | 16–17ms  | 19/19 FULL  |
| `typecheck` env değişince         | 2.35s    | 8/19        |

`test` / `test:isolation`: yeniden koşturulmadı — `turbo.json` bu iki görevi zaten
`cache: false` ile tanımlıyor (dosyada doğrulandı, satır: `"test": { ...,
"cache": false }`), yani önbellek isabeti sorusu bu ikisi için **anlamsız** —
zaten her çağrıda yeniden çalışırlar; devops'un gerekçesi bu ikisi için doğru.
qa'nın önceki turda ölçtüğü `957/957 × 3` bu davranışı zaten doğruluyor —
tekrar koşturmadım (gerekçesiz tekrar israf olurdu).

### İŞ 2 — İstemci paketine sızma

```
$ rg -n "arkesoft-root-env|createRootEnvIntegration|loadEnvFile|parseStorefrontEnv|storefrontEnvSchema|storefront-env-schema" apps/storefront/dist/
dist/server/virtual_astro_middleware.mjs:1379: // src/lib/storefront-env-schema.ts  (yorum)
dist/server/virtual_astro_middleware.mjs:1392: function parseStorefrontEnv(source) { ... }
dist/server/virtual_astro_middleware.mjs:1410: var storefrontEnv = parseStorefrontEnv(process.env);
```
- `createRootEnvIntegration` / `arkesoft-root-env` / `loadEnvFile` — **0 eşleşme**
  (import veya çağrı araması, kelime araması değil). **Entegrasyon config-zamanlı
  kaldı, çıktıya sızmadı — beklenen davranış doğrulandı.**
- `parseStorefrontEnv` / şema — **yalnızca `dist/server`'da**, `dist/client`'da **0
  eşleşme**. Bu kod zaten pre-existing (`storefront-env.ts`, K17 eager-parse) bir
  tüketici (`middleware.ts:93,107`) üzerinden geliyor; bu Task'ın yeni dosyası
  (`root-env-integration.ts`) bu yola **eklenmiş değil**, statik import yalnızca
  `storefront-env-schema.ts`'in saf fonksiyonunu kullanıyor (yan etkisiz). **Client
  tarafına sızma yok — AC8 doğrulandı.**

`dist/client` boyutu ve varlıklar (4 dosya, tamamı — "en büyük 5" diye istenen
liste zaten bu kadar):
```
dist/client/_astro/client.Cd-EeyjT.js          raw=212836  gzip=65840
dist/client/_astro/react.CvnImTBr.js           raw=  7909  gzip= 3041
dist/client/_astro/messages.BmdPD-KH.css       raw=  5359  gzip= 1893
dist/client/_astro/TenantGreeting.DrNdMUQ3.js  raw=   728  gzip=  498
Toplam dist/client: 228 KB (du -sk) / ham toplam 226.832 bayt / gzip toplam 71.272 bayt
```
Yeni istemci JS eklendi mi? **Hayır.** `git diff --stat HEAD -- apps/storefront/`
bu Task'ta değişen 4 dosyayı gösteriyor (`astro.config.ts`, `package.json`,
`playwright.config.ts`, `storefront-env.ts`) — hiçbiri `src/components/`,
`src/pages/` veya herhangi bir React adası dosyası değil; `middleware.ts` da
değişmemiş (git status'ta yok). Dolayısıyla `dist/client` bu Task'tan **yapısal
olarak etkilenmedi** — gerçek bir eski-commit build'iyle ikili karşılaştırma
yapmadım (kaynak dosyalara dokunmadan eski `dist/client`'ı yeniden üretmek repo
checkout gerektirirdi, riskli/kapsam dışı); bunun yerine git diff ile hangi
dosyaların client yüzeyine dokunduğunu doğrudan doğruladım.

Genel (Task'a özel olmayan) perf gate bütçe tablosundaki "Vitrin ada (client JS)
< 100 KB gzip/sayfa" ile kıyaslama: toplam gzip **71.27 KB** < 100 KB — bütçe
içinde, ancak bu Task'ın kapsamı bu bütçeyi **değiştirmedi**; bilgi amaçlı not.

`storefront-env-schema.ts` istemci paketine girdi mi? **Hayır** — yukarıdaki rg
taraması doğruluyor, 0 eşleşme `dist/client`'da.

### İŞ 3 — Bilinen kopya (solid'in low bulgusu), ağırlık etkisi

```
$ awk '/^\/\/ src\/lib\/storefront-env-schema.ts$/{p=1} p{print} /^var storefrontEnv = parseStorefrontEnv/{exit}' \
    dist/server/virtual_astro_middleware.mjs | wc -c
1459
```
Kopyalanan blok (şema tanımı + `parseStorefrontEnv` fonksiyonu + eager-parse satırı)
**1459 bayt ham**, `dist/server/virtual_astro_middleware.mjs` toplamı 55.584 bayt
(dosyanın %2,6'sı), `dist/server` toplamı 1,3 MB (dosyanın %0,11'i). `@arkesoft/config`
paketinin kendisi **dist'e hiç girmiyor** (`rg "@arkesoft/config" dist/` tek eşleşme —
bir yorum satırı, import değil) — doğrulandı, devDependency sınıflandırması
tutarlı. **Sonuç: salt bakım borcu, ölçülebilir bundle-boyutu maliyeti yok.**
Bu turda kapatılmayacak (solid v0.0.14'e kaydetmiş, doğru vade).

### Kapsam dışı — ölçülemedi

- **Core Web Vitals / Lighthouse CI:** ölçülemedi — bu Task sayfa/render yüzeyini
  değiştirmedi (yalnızca env yükleme/config), Lighthouse için `astro dev`/`preview`
  koşturmak gerekirdi ve bu görev tanımında açıkça yasaklandı (port çatışması riski
  + gereksiz). architect'in risk tabanlı kararıyla kapsam dışı.
- **API p95 / Arama p95:** ölçülemedi — bu Task'ta çalışan bir API/arama sunucusu
  yok, DB erişimi yok (security'nin 14 maddesi de bunu doğrulamış).
- **Cache-Control / Redis anahtar kapsamı:** ölçülemedi — bu Task hiçbir HTTP
  yanıtı veya Redis anahtarı üretmiyor; env yükleme saf config-zamanlı bir
  mekanizma.
- **N+1 sorgu / indeks / transaction / kuyruk:** kapsam dışı, bu Task'ta veritabanı
  erişen kod yok.

---

## SONUÇ GEREKÇESİ

Kural (`AGENT_BASELINE.md` §4): en az bir `high` bulgu → **FAIL**. İş 1 madde 3'te
ölçülen kademeli önbellek geçersizleşmesi (`lint` 17/19, `typecheck` 11/19 kaçırma,
gerekçenin aksine) somut, tekrarlanabilir ve gerçek CI süresi maliyeti olan bir
bulgudur — `high` olarak işaretlendi. Diğer tüm ölçümler (build bildirim doğruluğu,
istemci sızıntısı, kopya ağırlığı) **PASS** niteliğinde.

**Düzeltme turu açılacak madde:** yalnızca yukarıdaki `high` bulgu (devops,
`turbo.json`). `low` bulgu (kopya) ROADMAP teknik borç tablosuna gider, bu turda
düzeltme beklenmiyor.
