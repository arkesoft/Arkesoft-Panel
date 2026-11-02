# T-009 · security gate · tur 2 · KAPSAM: DAR

> **Not (Orkestratör):** Bu raporu Orkestratör dökmüştür. Gate ajanına **dosya yazmaması
> talimat verildi** — tur 1'de aynı rol sekiz yüzeyi tek bağlamda taşımaya çalışıp üç
> denemede hiç çıktı üretemediği için, tur 2'nin brief'i kapsamı dörde indirip `Write`
> aracını yasakladı. Denetim izindeki boşluk **ajanın ihlali değil, Orkestratör'ün
> kararıdır**; bu dosya o boşluğu kapatır. Ölçümler ajanın ham çıktısıdır.

| | |
| --- | --- |
| **Sonuç** | **PASS** |
| critical / high / medium | 0 / 0 / 0 |
| low | 1 (yeni) |
| Kapanan `medium` | **2/2** (B-M1, B-M2) |

`run.md` [7] gereği kapsam **DAR**: tur 1'de PASS verdi ama **ölçtüğü yüzey değişti**
(`packages/tenancy/src/resolve-host.ts` — 71 girdilik atlatma tablosunun konusu — ve
`apps/storefront/eslint.config.mjs` — sömürdüğü kapı). Yeni tarama yapılmadı; ADR-0012
A/B/C/D, sekiz mekanik pin, §7 on dört madde, AC18, `/_astro/*`, AC6/AC8, 404-503 oracle,
`dist` sır taraması ve `pnpm audit` **yeniden ölçülmedi** (tur 1'de PASS, yüzeyleri
değişmedi).

---

## B-M1 kapanışı — KAPANDI (kusur olarak)

`packages/tenancy/src/resolve-host.ts:134-159` yorumu artık **dürüst**: *"dizi indirilmez
(K-A4)"* iddiasının hemen ardından ölçülmüş gerçek (*"bu dal üretimde bu girdi tipiyle hiç
tetiklenmez, ham soket: sıra → 200/404"*), sebebin neden **korunduğu** (tipin izin verdiği
`string[]`, altı yerde pinli) ve asıl riskin ne olduğu (son-`Host`'a yönlendiren CDN +
ilk-`Host`'u okuyan kod = yönlendirme desenkronu) yazılı. *"Ele alınmış"* izlenimi veren
başka bir biçim kaynak dosyada **yok**.

v0.18.0 kenar şartı `:153-156`'da **açık** (*"ters vekil allowlist'i geldiğinde (v0.18.0,
ADR gerekli) KENARDA ele alınmak ZORUNDADIR, burada DEĞİL"*) — **ama bulunabilir değil**,
bkz. aşağıdaki `low`.

## B-M2 kapanışı — KAPANDI

`resolve-host.ts:190-192` boş host'u özel alan adı dalından **önce** `unparsable_host`'a
düşürüyor. Ölçüldü: `Host: .` → `unresolved:unparsable_host` → `middleware.ts:169-173`
erken 404, `createStorefrontTrpcClient` **hiç çağrılmıyor** (API'ye istek **yok**, DB
sorgusu **yok**).

`http:///trpc` kırılması **yapısal olarak imkânsız**: `subdomain` dalı `${slug}.${BASE}`
üretiyor (asla boş), `custom-domain` dalı boş host'u artık **üretemiyor**.

İkinci savunma **gerçekten** çalışıyor: `api-client.ts:51-53` fail-closed fırlatıyor ve
`map-api-error.ts:103` bilinmeyen hatayı `unavailable` → 503'e eşliyor (sızıntı değil,
fail-closed). İkisi de pinli: `resolve-host.test.ts:150-159`, `api-client.test.ts:106`.

**`..` ayrımı güvenlik açısından savunulabilir, yarım değil:** `host="."` (uzunluk 1) →
`new URL('http://./trpc')` → authority `.`, pathname `/trpc` (**ölçüldü, yol kaymıyor**) →
giden `Host: .` → API tarafında **aynı** `resolveHost` onu `unparsable_host` yapıyor →
**sorgusuz** 404. Yani `..`'nin maliyeti `evil.com` gibi herhangi bir özel alan adından
**daha az** (o bir Prisma sorgusu yapar, bu yapmaz); tehlikeli mekanizma (boş authority →
yol terfisi) `..` için yapısal olarak **oluşamaz**.

---

## 71 GİRDİLİK ATLATMA TABLOSU — YENİDEN ÖLÇÜM

**Sonuç: yalnızca beklenen `.` değişikliği.** 71/71 vaka yeniden koşturuldu
(`packages/tenancy/dist/resolve-host.js`; dist src'den yeni — `09:37:15 > 09:36:53`, guard
dist'te doğrulandı → `pnpm build` **koşturulmadı**). Fırlatan vaka: **yok**.

| | Tur 1 | Tur 2 |
| --- | --- | --- |
| **SAPMA 1/71** · `.` | `custom-domain:''` | **`unresolved:unparsable_host`** |

Tur 1 ile **birebir aynı** kalanlar (hepsi yeniden ölçüldü):

| Sınıf | Sonuç |
| --- | --- |
| port | 4/4 — `:8080` → `subdomain` · `:99999`/`:8080` → `unparsable` |
| `@` / kullanıcı bilgisi | 4/4 — `user:pass@www` → **`reserved_subdomain`** |
| boşluk | 4/4 |
| CR/LF/NUL | 6/6 — `\r\nX-Arkesoft-Tenant: evil` → `unparsable` |
| punycode | 4/4 |
| **eşbiçim (homograph)** | **5/5 `reserved_subdomain`** + ZWJ → `unparsable` |
| uzun etiket | 61/62/63 → `subdomain` · 64/200 → `invalid_slug_format` · 255+ → `unparsable` |
| `..` | → `custom-domain:.` (**değişmedi**) |
| kodlanmış | 4/4 |
| boş etiket | 4/4 — dizi → `multiple_host_headers` |
| büyük/küçük | 3/3 |
| sondaki nokta | 3/3 |
| sonek/içerme tuzakları | 4/4 — `notarkesoft.localhost` · `demo.arkesoft.localhost.evil.com` · `arkesoft.localhost.evil.com` → `custom` |
| slug biçimi | 3/3 |
| IP | 3/3 |
| yol/sorgu/şema | 6/6 — `http://demo…` → `custom:http` · `[demo…]` → `unparsable` |

**Giden `Host` baytlarında tehlikeli karakter: 71/71 NONE.** Çözülen **36** dalda giden
authority gerçekten inşa edildi (`new URL('http://'+normalizedHost+'/trpc').host`,
`storefront-server-fetch.ts:106`'nın `headers['host'] = requestUrl.host` deseni) ve
`\r \n \t \0 ' ' @ / \ %` tarandı → **0 isabet, 0 yol kayması** (pathname **36/36** `/trpc`).
Kalan 35 vaka `unresolved` → istemciye **yapısal olarak ulaşmıyor**. Başlık enjeksiyonu ve
SSRF yüzeyi **yok** (TCP hedefi env'den sabit).

**Yüzey 1 kararı — Astro'nun `allowedHosts` ile sunduğu doğrulamayı bize devretmek hâlâ
yeterli mi: EVET.** 71 denemenin hiçbiri yanlış kiracıya, rezerve bir etikete, boş/tehlikeli
bir giden `Host`'a veya API'ye kaçak bir çağrıya ulaşmadı; `server.allowedHosts` eklemek
**ikinci bir doğruluk kaynağı** yaratırdı ve zincirin yakalamadığı tek bir sınıf bile
kalmadı (düzeltme boş-host kenarını da kapattı).

---

## ADA KAPISI — SÖMÜRÜNÜN YİNELENMESİ

**POZİTİF** (`src/components/__SecProbeIsland.tsx`, 6 ihlal, çıkış kodu **1**):

```
4:1  error  '../lib/storefront-env.js' import is restricted …        (K14)          no-restricted-imports
5:1  error  '../lib/api-client.js' import is restricted …            (K14)          no-restricted-imports
6:1  error  '../../src/lib/storefront-env' import is restricted …    (DERİN göreli yol da yakalanıyor)
7:1  error  '@prisma/client' import is restricted …                  (CLAUDE.md §3) no-restricted-imports
8:1  error  '@arkesoft/trpc/server' import is restricted …           (ADR-0009 §6)  no-restricted-imports
9:1  error  '@arkesoft/db' import is restricted …                    (AC10)         no-restricted-imports
✖ 6 problems (6 errors, 0 warnings)
```

**R-P1 → GEÇTİ:** `src/components/**` bloğu taban kısıtlarını **kaybetmedi**;
`@prisma/client` o kapsamda **hâlâ** yakalanıyor (satır 7) — `mergeRestrictions` telafisi
çalışıyor.

**NEGATİF:** `src/lib/storefront-env.ts`, `src/middleware.ts`, `src/lib/api-client.ts`,
`src/components/TenantGreeting.tsx` → **0 hata, çıkış kodu 0** (meşru sunucu dosyaları
temiz).

**Prob temizliği:** prob silindi; `git status --short` 68 satır (oturum başıyla aynı küme),
`grep -i probe` → **0**, `ls apps/storefront/src/components` → `TenantGreeting.tsx` (tek
dosya).

---

## YENİ BULGU

**[SEV: low]** `ROADMAP.md` (v0.18.0 bölümü + borç tablosu + A26 satırı) — **sorumlu: docs
+ architect (ROADMAP), qa (vaka adı) — vade: v0.18.0**

B-M1'in **taşınan şartı** yalnızca `packages/tenancy/src/resolve-host.ts:153-156`'daki bir
**yorumda** yaşıyor. v0.18.0'ı uygulayacak kişinin okuduğu yüzeyde (ROADMAP v0.18.0, borç
tablosu, A26 *"ingress `Host`'u korumak zorunda"*) *"çoğul `Host` KENARDA reddedilmeli"*
şartı **sıfır kez** geçiyor (`grep: çoğul|multiple_host_headers` → ROADMAP'te yalnızca
ilgisiz bir v0.0.5 satırı).

Senaryo bugün **sömürülebilir değil** (repoda ingress/vekil yok, ölçüldü) ama v0.18.0'da
son-`Host`'a göre yönlendiren bir CDN eklenirse, ilk-`Host`'u okuyan bu kodla desenkron
olur → **çapraz kiracı önbellek zehirlenmesi**.

**Düzeltme:** ROADMAP v0.18.0 kutusuna *"ters vekil: çoğul `Host` başlığı kenarda 400 ile
reddedilir (ADR gerekli)"* maddesi + borç tablosuna satır. İkincil olarak
`resolve-host.test.ts:56` vaka adı (*"ÇOKLU Host başlığı (dizi) → multiple_host_headers,
ilk değer SEÇİLMEZ"*) kaynak yorumun ölçülmüş kaydını **taşımıyor**; test tek başına
okunduğunda yine *"vaka ele alınmış"* izlenimi veriyor → vaka adına *"(üretimde Node ilk
değere indirir; bu pin TİP sözleşmesi içindir)"* eklenmeli.

> **Durum:** bu bulgunun ROADMAP tarafı `docs` fazında **kapatıldı** (v0.18.0 kutusuna
> madde + borç satırı eklendi). Açık kalan: `resolve-host.test.ts:56`'nın vaka adı (`qa`).

---

## ÖLÇÜM ÖZETİ

| Ne | Sonuç |
| --- | --- |
| 71 vaka yeniden koşumu | sapma **1** (beklenen `.`) |
| giden `Host` tehlikeli karakter | **0/71** · yol kayması **0/36** |
| eslint prob | pozitif **6 hata / çıkış 1** · negatif **0 hata / çıkış 0** · R-P1 **geçti** |
| incelenen dosya | **8** (`resolve-host.ts` · `resolve-host.test.ts` · `api-client.ts` · `api-client.test.ts` · `eslint.config.mjs` · `middleware.ts` · `middleware.test.ts` · `map-api-error.ts`; + `request-origin.ts`/`storefront-server-fetch.ts` kısmi) |
| CLAUDE.md §7 karşılanmayan madde | **yok** |
| `pnpm build` | **koşturulmadı** (dist tazeliği `stat` + guard `grep` ile doğrulandı) |
| `pnpm audit` | tur 1'de ölçüldü, yüzey değişmedi → **yeniden ölçülmedi** |
| bulgu | 0 critical · 0 high · 0 medium · **1 low** |
