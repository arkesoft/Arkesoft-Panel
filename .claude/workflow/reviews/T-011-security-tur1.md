# T-011 · GATE: security · tur 1

- **Tarih:** 2026-11-02
- **Sürüm:** kilometre taşı `v0.0.9.1` · platform patch `0.1.0 → 0.1.1`
- **Kapsam:** 11 değişen dosya (`.claude/workflow/**` inceleme dışı)

```
GATE: security
SONUÇ: PASS
```

FAIL kuralı (AGENT_BASELINE §4): 0 critical · 0 high · **1 medium** · 3 low → `1–2 medium` = PASS.
Medium tek başına düzeltme turu açmaz; borç satırı aşağıda hazır.

---

## BULGULAR

### [SEV: medium] `apps/storefront/src/lib/__tests__/root-env-integration.test.ts:42-44, 58-90`

**AC8'in "yapısal garanti" pini, korumak istediği yan etkiyi ölçmüyor — ölçtüğünü sandığı şey
yapısal olarak ölçülemez.**

`beforeEach` (satır 43) `process.env`'i **düz bir nesneyle DEĞİŞTİRİYOR**:
`process.env = { ...ORIGINAL_ENV }`. Bu atamadan sonra `process.env` artık Node'un yerel env
deposuna bağlı özel nesne değil, `Object.prototype` türevli düz bir nesnedir;
`process.loadEnvFile()` ise yerel depoya yazar. **Ölçüldü (Node v25.8.1):**

```
process.env = {...ORIG}; delete process.env['SEC_PROBE_B']; process.loadEnvFile(probe.env)
→ process.env['SEC_PROBE_B'] === undefined   (yerel yazma düz nesneden GÖRÜNMÜYOR)
→ Object.getPrototypeOf(process.env) === Object.prototype  → true
```

Yani `build`/`preview`/`sync` testlerindeki
`expect(process.env['APP_BASE_DOMAIN']).toBeUndefined()` (satır 65-66, 77, 88) assert'leri,
`loadEnvFile` **çağrılmış olsa bile** geçer. Bu üç test AC8'i değil, yalnızca
`parseStorefrontEnv`'in fırlatmamasını ölçüyor.

**Sömürü/regresyon senaryosu (somut):** ileride bir ajan (ör. "dev dışında da yolu çözelim",
"önce dosyayı yükleyip sonra karar verelim" refactor'u) yüklemeyi kapının ÜSTÜNE taşırsa:

```ts
const rootEnvPath = resolveRootEnvPath()
if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath)   // ◀ kapıdan ÖNCE
if (command !== 'dev') return
```

— üç dal testi de **yeşil kalır** (`loadEnvFile` spy assert'i yok, `logger.error` çağrılmıyor, env
nesnesi değişmiyor). Gerçek `astro build` koşumunda ise kök `.env`'in tamamı (`BETTER_AUTH_SECRET`,
`POSTGRES_PASSWORD`, `S3_SECRET_ACCESS_KEY`, `MEILI_MASTER_KEY`, `DATABASE_*_URL` — ölçülen anahtar
listesi) derleme sürecinin `process.env`'ine girer; Vite'ın `loadEnv`'i (ölçüldü:
`vite@8.3.5/dist/node/chunks/node.js:6128` → `for (const key in process.env) if (prefixes.some(...))`)
önek uyumlu her anahtarı istemci paketinin görüş alanına alır. Bu, AC8'in var olma sebebi olan
sınıfın tam kendisi ve bu Task sırasında bir kez (PUBLIC_ sentinel) fiilen yaşandı.

Kapının **tamamen kaldırılması** bugün kırmızıya dönüyor (üç dal testi iki anahtarı sildiği için
`parseStorefrontEnv` fırlar → `resolves.toBeUndefined()` düşer) — ama bu **dolaylı** bir yakalama
(fırlatma üzerinden), yan etkinin kendisi üzerinden değil. Yukarıdaki daraltılmış mutasyon için
tek kalan savunma `env-contract.test.ts:149-175` (P4) — o dosya `process.env`'i yeniden
atamadığı için `delete` + yerel yeniden doldurma yoluyla mutasyonu **yakalayabilir**, ama bu
yakalama (a) Vitest'in o dosyaya yerel `process.env` vermesine ve (b) koşucuda kök `.env`'in var
olmasına bağlı; ikisi de assert edilmiyor. **ÖLÇEMEDİM:** mutasyonu gerçekten koşturmak kaynak
dosyayı değiştirmeyi gerektirirdi (yasak) ve `pnpm test` koşumu yasak — bu paragraf statik akıl
yürütme + yukarıdaki Node ölçümüne dayanıyor.

**Önerilen düzeltme (tek satır/test):** `build`/`preview`/`sync` testlerinde ve P4'ün build
dalında yan etkinin kendisini pinle:

```ts
const loadEnvFileSpy = vi.spyOn(process, 'loadEnvFile')
await expect(runSetupHook('build', logger)).resolves.toBeUndefined()
expect(loadEnvFileSpy).not.toHaveBeenCalled()   // ◀ AC8'in GERÇEK pini
```

Bu assert sandbox'ın env anlambiliminden bağımsızdır ve `process.env` düz nesneyle
değiştirilse de geçerliliğini korur.

**Sorumlu ajan:** qa (test sahibi; S2/S4 pinleri).

---

### [SEV: low] `apps/storefront/src/lib/root-env-integration.ts:93-100` + `.env.example`

**Kök `.env` / `.env.example` içinde `PUBLIC_` önekli anahtar bulunmadığını zorlayan mekanik bir
kontrol yok.**

Ölçülen mekanizma zinciri: Astro 7.4.2 varsayılan önek listesi `["PUBLIC_"]`
(`astro/dist/env/env-loader.js`) → Vite 8.3.5 `loadEnv` önek uyumlu anahtarları **`process.env`'den
de** topluyor (`node.js:6128`) → bu entegrasyon `dev` dalında kök `.env`'i `process.env`'e
yüklüyor → `astro.config.ts:68` `server.host: true` (0.0.0.0).

**Senaryo:** bir geliştirici/ajan kök `.env`'e `PUBLIC_` önekli bir değer koyar (bu Task'ta
`PUBLIC_ARKESOFT_SENTINEL` ile fiilen oldu); `pnpm dev` koşarken geliştiricinin ağındaki
(kafe/ofis Wi-Fi) herhangi bir makine `http://<dev-ip>:4321/` istemci paketinden /
`import.meta.env`'den o değeri okur. Bugün somut değil: kök `.env`'de **0** `PUBLIC_*` anahtarı
var (ölçüldü, anahtar adları listelendi), `.env.example`'da da **0**. Dev-only olduğu ve operatör
hatası gerektirdiği için `low`.

**Önerilen düzeltme:** `env-contract.test.ts`'e altıncı bir pin — `.env.example` (git'te izlenen
dosya) hiçbir satırı `^PUBLIC_` ile başlamıyor; ek olarak `docs/development.md`'ye "kök `.env`'e
`PUBLIC_` önekli anahtar yazılmaz, vitrin dev sunucusu onu istemciye verir" satırı.
**Sorumlu ajan:** qa (pin) + docs (not). **Vade önerisi:** v0.0.14.

---

### [SEV: low] `apps/storefront/playwright.config.ts:83-86`

**Kök `.env` yüklemesinin KAPISIZ ikinci kopyası.**

```ts
const rootEnvUrl = new URL('../../.env', import.meta.url)
if (existsSync(rootEnvUrl)) { process.loadEnvFile(rootEnvUrl) }
```

Bugün güvenli: bu yalnızca Playwright **koşucu** süreci ve `webServer.command` `astro dev`
çalıştırıyor (yani `command === 'dev'`, kök `.env` zaten yüklenecekti) — AC8 (istemci paketi)
etkilenmiyor. **Risk:** `webServer.command` ileride `astro build && astro preview`'e dönerse
(önizlemeyi gerçek çıktı üzerinde koşturmak yaygın bir e2e refactor'u), `build` alt süreci kök
`.env`'i **miras** alır ve `root-env-integration.ts`'in `command` kapısı BYPASS edilir — kapı
yalnızca kendi süreç içi yüklemesini kontrol ediyor, miras gelen ortamı değil. Hiçbir assert
`webServer.command`'ın `astro dev` olduğunu pinlemiyor.

**Önerilen düzeltme:** `env-contract.test.ts`'e `webServer.command` içinde `astro dev` geçtiğini
(ve `astro build`/`astro preview` geçmediğini) assert eden bir pin + bu dosyaya "bu yükleme
`astro dev` varsayımına bağlıdır" yorumu. **Sorumlu ajan:** qa. **Vade önerisi:** v0.0.14.

---

### [SEV: low] `packages/config/src/check-env.ts:88-103`

`describeStorefrontEnvGuidance` metni `.env.example` satır numaralarını (`:14`, `:130`) **sabit
yazıyor**. Güvenlik etkisi yok (sır sızdırmıyor — aşağıdaki ölçüme bakın), ama `.env.example`
kaydığında teşhis operatörü yanlış satıra yönlendirir; `pnpm env:check` eksik anahtar senaryosunda
yanlış rehberlik üretir. **Önerilen düzeltme:** satır numaralarını kaldır veya P2 pinine satır
numarası doğrulaması ekle. **Sorumlu ajan:** devops/qa. **Vade önerisi:** v0.0.14.

---

## DOĞRULANAN KONTROLLER (ölçümle)

### AC8 — sır sızıntısı (ana hat): İHLAL YOK

1. **`command` kapısı kapsayıcı.** Astro 7.4.2'de hook imzası
   `command: 'dev' | 'build' | 'preview' | 'sync'`
   (`astro/dist/types/public/integrations.d.ts:349`, ölçüldü). `command !== 'dev' → return`
   bir **allowlist** (deny-by-default): bugünkü diğer üç değer + Astro'nun ileride ekleyeceği
   her yeni değer `process.env`'e dokunmadan döner. Fail-closed.
2. **Dolaylı tetikleme yok.** Entegrasyon tek hook tanımlıyor (`astro:config:setup`); başka
   kanca yok, `astro:build:*` yolundan çağrılabilecek bir yüzey yok.
3. **`process.env`'e yazan başka kod yok.** `rg` ile `loadEnvFile` çağrıları ve
   `process.env[...] = ` atamaları tarandı: vitrin üretim yolunda tek yazıcı bu kapılı hook;
   diğer tüm atamalar test dosyalarında. `packages/db`/`apps/api`'nin `loadEnvFile`'ları
   vitrin build'ine girmiyor.
4. **Üretilen `dist` ölçüldü (yeni build KOŞTURULMADI — mevcut `dist` okundu).**
   `apps/storefront/dist` mtime `22:08:13`, `root-env-integration.ts` mtime `22:07:39`,
   `.env` mtime `21:56:29` → **dist değişiklik SONRASI ve sentinel temizliği SONRASI** üretilmiş.
   Kök `.env`'in **her** değeri (≥6 karakter) `dist` içinde arandı (yalnızca anahtar adı
   raporlandı):
   - `dist/client/**` → **0 eşleşme** (hiçbir `.env` değeri istemci paketinde yok)
   - `dist/server/**` → 7 düşük-entropili eşleşme: `NODE_ENV`, `APP_BASE_DOMAIN`,
     `POSTGRES_USER`, `POSTGRES_DB`, `API_HOST`, `SMTP_HOST`, `MAIL_FROM_NAME`.
     **Hepsi tesadüf:** `APP_BASE_DOMAIN` değerinin üç geçişi
     `dist/server/virtual_astro_middleware.mjs` içindeki **Türkçe kaynak YORUMUNUN** örnek
     host'ları (`notarkesoft.localhost`, `demo.arkesoft.localhost.evil.com` — `resolve-host`
     algoritma açıklaması); diğerleri `arkesoft` / `127.0.0.1` / `Arkesoft` gibi genel dizeler.
   - **Hiçbir sır eşleşmedi:** `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `S3_SECRET_ACCESS_KEY`,
     `MEILI_MASTER_KEY`, `DATABASE_URL`/`DATABASE_MIGRATION_URL`/`DATABASE_BOOTSTRAP_URL` → 0.
   - `dist` genelinde `PUBLIC_[A-Z0-9_]+` ve `SENTINEL` → **0 eşleşme** (sentinel artığı yok).
5. **`vite.envDir`** paketin kendi mutlak dizinine pinli ve o dizinde `.env` yok → Vite'ın dosya
   tarama yolu ikinci bir kapı açmıyor. `vite.envPrefix` **override edilmemiş** → yalnızca
   `PUBLIC_`.
6. **`loadEnvFile` EZMİYOR (ölçüldü, Node v25.8.1):** kabukta tanımlı bir anahtar dosyadan
   gelenle ezilmiyor → gerçek ortam/secret yöneticisi dev'de bile tek doğruluk kaynağı kalıyor.

### Teşhis mesajı sır sızdırmıyor

- `storefront-env-schema.ts:46-66` yalnızca `issue.path` (anahtar adı) + `issue.message`
  kullanıyor. Zod hata nesnesinin `received`/`input` alanlarına **dokunulmuyor**; mesajlar
  şemada özel tanımlı (`'boş olamaz'`, `'geçerli bir URL olmalı'`) → **değer yazılmıyor**.
- `storefrontEnvSchema` non-strict `z.object` → bilinmeyen anahtarlar hata üretmiyor, dolayısıyla
  `process.env`'in geri kalanı (sırlar) ne mesaja ne `result.data`'ya giriyor; `result.data`
  yalnızca iki anahtarı taşıyor.
- `root-env-integration.ts:110-112` `logger.error(message)` — aynı değer-sız metin, sonra orijinal
  hata yeniden fırlatılıyor (fail-closed korunuyor).
- `check-env.ts:88-103` `describeStorefrontEnvGuidance` yalnızca `error.issues` (anahtar adı +
  kural) yazıyor. Başarı yolunda `printEntries` değer basıyor ama bu iki anahtar sır değil
  (`APP_BASE_DOMAIN` = alan adı; `STOREFRONT_API_BASE_URL` içinde kimlik bilgisi olsa
  `URL_CREDENTIALS_PATTERN` maskeliyor).

### `.env` dosyası okuma/yazma yüzeyi

- Yol statik: `join(import.meta.dirname, '..','..','..','..', '.env')` — kullanıcı girdisinden
  türemiyor, dizin geçişi (path traversal) yüzeyi yok, `existsSync` koruması **var**.
- **Kök `.env` repoda değil:** `git check-ignore -v .env` → `.gitignore:7`; `git ls-files` →
  yalnızca `.env.example`; `git status --porcelain` çıktısında `.env` **yok**.
- Yeni dosyalarda gömülü sır/kimlik bilgisi yok (`password|secret|api[_-]?key|token|BEGIN .*PRIVATE KEY`
  → yalnızca `root-env-integration.ts:26,31`'de **yorum metni** olarak `BETTER_AUTH_SECRET`/
  "secret yöneticisi" ibareleri). Testlerdeki değerler sır değil
  (`arkesoft.localhost`, `http://127.0.0.1:3000`).
- **`.env.example` değişmeliydi mi? Hayır** — `storefrontEnvCheckSchema`'nın zorunlu kıldığı
  iki anahtar da zaten var: `.env.example:14 APP_BASE_DOMAIN=`, `.env.example:130
  STOREFRONT_API_BASE_URL=`; P2 pini bunu mekanik olarak zorluyor.

### Kiracı izolasyonu (CLAUDE.md §7) — 14 maddenin tamamı yapısal olarak N/A, **doğrulandı**

Yeni endpoint / tRPC prosedürü / kuyruk işi / tablo **yok**; veritabanına gidilmiyor; önbellek
anahtarı, S3 öneki, arama indeksi üretilmiyor; `prisma` importu yok. 11 dosyanın tamamı okundu.

**Handoff'un sorusu — `APP_BASE_DOMAIN` yanlış/boşsa yanlış kiracıya düşer mi? Hayır, fail-closed:**

- **Boş/eksik:** `storefrontEnvSchema.APP_BASE_DOMAIN = z.string().min(1)` → hem `dev` kapısında
  hem `storefront-env.ts:42`'nin modül-yükleme-anı parse'ında (yani üretim çalışma zamanında da)
  süreç açılışta düşer.
- **Ayrıştırılamaz değer:** `middleware.ts:97-107` `normalizeHostname` `undefined` dönerse
  **fırlatıyor** → middleware modülü yüklenemez → sunucu istek servis etmez.
- **Yanlış ama geçerli değer:** `resolve-host.ts` kiracı seçicisini **yalnızca istek `Host`
  başlığından** türetiyor; `APP_BASE_DOMAIN` sadece sonek eşleşmesinde kullanılıyor
  (`host.endsWith('.' + base)`, `includes`/dotsuz `endsWith` **değil**). Yanlış taban alan adının
  sonucu: `nested_subdomain` / `base_domain_mismatch` / `invalid_slug_format` → `unresolved`
  (sorgu bile atılmıyor), ya da `custom-domain` dalında `primaryDomain` TAM eşleşmesi. Her iki
  dalda da çözülen kiracı `Host`'ta adı geçen kiracıdır — **başka bir kiracıya düşme yolu yok**.
  (Vitrin halka açık; `Host` ile kiracı seçmek tasarım gereği ve ayrıcalık üretmiyor.)

### Diğer

- **Enjeksiyon:** `webServer.command` içindeki tek dinamik parça `String(STOREFRONT_E2E_PORT)`;
  `e2e-port.ts:15` `Number(override)` uyguluyor → kabuk metakarakteri hayatta kalamaz
  (en kötü hâl `--port NaN`). `env -u ...` önekleri sabit literal. Komut enjeksiyonu yüzeyi yok.
  SQL / dosya yolu / XSS / açık yönlendirme yüzeyi bu değişiklikte yok.
- **Dev sunucusu dosya servisi:** Vite 8.3.5 varsayılanı `server.fs.strict: true` ve
  `deny: ['.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**']`
  (ölçüldü); `astro.config.ts` `server.fs`'i **override etmiyor** → `host: true` ile 0.0.0.0'a
  bağlanan dev sunucusu `/@fs/.../.env`'i servis etmiyor.
- **Bağımlılık:** `pnpm-lock.yaml` diff'i **boş**; `apps/storefront/package.json` diff'i yalnızca
  `dev` script'i. **Yeni bağımlılık eklenmedi** (doğrulandı).
- **Oran sınırlama / ödeme / PII / SSRF / dosya yükleme / süper admin denetim kaydı:** bu
  değişiklikte ilgili yüzey yok.
- **KVKK:** kişisel veri toplama/saklama/aktarma yok.

---

## ÖLÇÜMLER

| Ölçüm                                   | Sonuç                                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm audit`                            | **kritik 0 · high 1 · moderate 1 · low 0** — `multer` GHSA-q7qp-rjg7-q26m (high, `@nestjs/platform-express` geçişli) ve `minimatch` GHSA-g3hv-75wg-m249 (moderate, `eslint` geçişli). **İkisi de T-011 öncesi ve ROADMAP'te takipli** (satır 1768 → `multer`, vade v0.0.16; satır 1592 → `minimatch`). `pnpm-lock.yaml` diff'i boş → **T-011 yeni açık getirmedi.** |
| İncelenen dosya sayısı                  | **11 değişen dosya** + 6 bağlam dosyası (`resolve-host.ts`, `middleware.ts`, `e2e-port.ts`, Astro/Vite dist tip ve kaynakları) |
| Tenant izolasyon listesi — karşılanmayan | **yok** — 14 maddenin tamamı yapısal olarak N/A (yeni endpoint/prosedür/kuyruk işi/tablo yok); `APP_BASE_DOMAIN` fail-closed olarak ölçüldü |
| `dist` sır taraması                     | kök `.env`'in 34 anahtarının değerleri tarandı → `dist/client/**` **0 eşleşme**; `dist/server/**` 7 düşük-entropili tesadüf (hepsi yorum/genel dize); sır **0**; `PUBLIC_*` **0**; `SENTINEL` **0** |
| Koşturulmayanlar (yasak/ölçülemeyen)    | `pnpm build`, `pnpm dev`, Playwright, `pnpm test` **koşturulmadı** (handoff kısıtı) → `dist` ölçümü **mevcut** çıktıya dayanıyor (mtime kanıtı yukarıda). Mutasyon testi kaynak değişikliği gerektirdiği için **koşturulmadı**; F1'in mutasyon analizi statik + Node ölçümüne dayanıyor. |

## Borç satırı metni (docs için)

| SEV    | Dosya:satır                                                           | Açıklama                                                                                                                                                      | Sorumlu   | Vade    | Kaynak           |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------- | ---------------- |
| medium | `apps/storefront/src/lib/__tests__/root-env-integration.test.ts:42-44` | AC8 pini yan etkiyi ölçmüyor: `beforeEach` `process.env`'i düz nesneyle değiştirdiği için yerel `loadEnvFile` yazması assert'lerden GÖRÜNMEZ (ölçüldü). `expect(spy).not.toHaveBeenCalled()` eklenmeli. | qa        | v0.0.14 | security tur 1   |
| low    | `apps/storefront/src/lib/root-env-integration.ts:93-100` + `.env.example` | Kök `.env`/`.env.example`'da `PUBLIC_` önekli anahtar bulunmadığını zorlayan mekanik pin yok; dev sunucusu (`host: true`) böyle bir anahtarı istemciye verir.    | qa + docs | v0.0.14 | security tur 1   |
| low    | `apps/storefront/playwright.config.ts:83-86`                          | Kapısız ikinci `loadEnvFile`; `webServer.command`'ın `astro dev` olduğu assert edilmiyor → ileride `astro build` eklenirse AC8 kapısı miras ortamla bypass olur. | qa        | v0.0.14 | security tur 1   |
| low    | `packages/config/src/check-env.ts:98-99`                              | Teşhis metni `.env.example` satır numaralarını sabit yazıyor; dosya kayınca yanlış rehberlik.                                                                   | devops    | v0.0.14 | security tur 1   |
