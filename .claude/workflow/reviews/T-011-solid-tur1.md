# T-011 · GATE: solid · tur 1

- **Tarih:** 2026-11-02
- **Sürüm:** kilometre taşı `v0.0.9.1` · platform patch `0.1.0 → 0.1.1`
- **Kapsam:** T-011'de değişen 11 dosya (üretim + test + yapılandırma). `.claude/workflow/**` incelenmedi.
- **Koşturulan komut:** YOK (handoff kısıtı). Tüm bulgular statik okuma + repo içi çapraz kanıtla
  gerekçelendirildi; mutasyon iddiaları "hangi mutasyon yeşil kalır" biçiminde somutlaştırıldı.

```
GATE: solid
SONUÇ: FAIL
```

---

## BULGULAR

### H1 — [SEV: high] `apps/storefront/src/lib/__tests__/root-env-integration.test.ts:58-90` (+ `env-contract.test.ts:149-161`)

**"process.env'e dokunmaz (AC8 yapısal garantisi)" diyen testler, `process.env`'e dokunabilecek TEK
mekanizmayı (`process.loadEnvFile`) hiç gözlemlemiyor — AC8'i kıran gerçek bir mutasyon yeşil kalır.**

Kanıt (iddia değil, somut mutasyon):

Mutasyon M1 — `root-env-integration.ts`'te yükleme satırlarını kapının ÜSTÜNE taşı:

```ts
const rootEnvPath = resolveRootEnvPath()
if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath)   // ← kapıdan ÖNCE
if (command !== 'dev') return
```

- **Gerçek dünyadaki sonucu:** `astro build` ve `astro preview` kök `.env`'i (`BETTER_AUTH_SECRET`,
  rol parolaları) `process.env`'e yükler. Bu tam olarak `root-env-integration.ts:21-31`'in 11 satır
  boyunca "ASLA olmamalı" dediği şeydir (Vite'ın `loadEnv`'i `PUBLIC_*` anahtarları `process.env`'den
  de toplar → sır-bundle yolu yeniden açılır). AC8 fiilen düşer.
- **Testlerdeki sonucu: hepsi yeşil.** Üç "dokunmaz" testi (`build`/`preview`/`sync`) yalnızca
  `expect(process.env['APP_BASE_DOMAIN']).toBeUndefined()` tipinde assert yapıyor
  (satır 65-66, 77, 88) ve P4 aynısını tekrarlıyor (`env-contract.test.ts:159-160`). Ama test
  dosyasının KENDİ ölçümüne göre (`root-env-integration.test.ts:121-130`, yazarın kendi notu)
  `process.loadEnvFile` Vitest sandbox'ında **çağrılıyor ama `process.env`'e yazmıyor**. Yani bu
  assert'ler, yükleme çağrısı yapılsa da yapılmasa da **aynı sonucu verir** → yükleme davranışı
  hakkında sıfır bilgi taşıyorlar. Doğrulamanın (`parseStorefrontEnv`) `dev`'e kapılı kalması
  nedeniyle fırlatma da olmaz.
- **Asimetri ikinci kanıt:** aynı dosya `dev` dalında `vi.spyOn(process, 'loadEnvFile')` +
  `toHaveBeenCalledTimes(1)` kullanıyor (satır 104/111 ve 134/139) — yazar çağrıyı pinlemeyi
  biliyor, ama **önemli olduğu yerde (non-dev dalları) pinlememiş**. Repo genelinde
  `loadEnvFile` için "çağrılmadı" assert'i hiç yok (grep: tüm repo).

Bu, handoff'ta işaret edilen T-010 kusur sınıfının birebir tekrarı: başlık AC8 diyor, assert AC8'i
ölçmüyor.

**Önerilen düzeltme (ucuz, 1 satır/test):** `build`/`preview`/`sync` testlerinin her birinde ve
P4'ün build dalında

```ts
const loadEnvFileSpy = vi.spyOn(process, 'loadEnvFile')
...
expect(loadEnvFileSpy).not.toHaveBeenCalled()
```

Ek olarak `root-env-integration.test.ts:113`'teki `expect(calledPath.endsWith('.env')).toBe(true)`
zayıf: `apps/storefront/.env` de bu assert'i geçer. Yolu **repo kökünün mutlak `.env` yoluyla**
karşılaştır (`join(REPO_ROOT, '.env')` deseni `env-contract.test.ts:43`'te zaten var).
Düzeltme sonrası M1 mutasyonunu uygulayıp `pnpm --filter @arkesoft/storefront test` ile **kırmızı
olduğunu ölç**, raporla.

**Sorumlu ajan:** `qa` (üretim kodu DEĞİŞMEMELİ — `root-env-integration.ts` doğru davranıyor;
eksik olan assert).

**Dürüstlük notu:** testi koşturmam yasak olduğundan `loadEnvFile`'ın sandbox'ta etkisizliğini
kendim ölçmedim; iki repo içi kanıta dayanıyorum — (1) `root-env-integration.test.ts:121-130`'daki
yazarın ölçüm notu, (2) satır 131-141'deki testin geçerli değerleri `loadEnvFile`'dan beklemek
yerine elle yazmak zorunda kalması. Etkisizlik yanlışsa bile önerilen assert, garantiyi
ortam-bağımsız hale getirdiği için gereklidir.

---

### M1 — [SEV: medium] `apps/storefront/src/lib/storefront-env.ts:24-26`

**Beyan/gerçeklik boşluğu:** başlık yorumu "`process.env` `src/**` altında YALNIZCA bu dosyada
okunur (K17, **mekanik pin**)" diyor. Artık **yanlış**: `root-env-integration.ts:99`
`process.loadEnvFile` ile `process.env`'e **yazıyor**, `:103` `parseStorefrontEnv(process.env)` ile
**okuyor** — ve o dosya da `src/lib/**` altında. "Mekanik pin" ifadesi ayrıca iki kat yanıltıcı:
`no-restricted-globals` yalnızca `src/components/**`'i kapsıyor (`eslint.config.mjs:149`), `src/lib/**`
için hiçbir mekanizma yok.

**Neden kusur:** AC8/AC11'in sır-sızıntı yüzeyi denetimi "`process.env`'i kim okuyor" sorusunun tam
cevabına dayanıyor. Bu yoruma güvenen bir denetçi tek dosyayı inceler ve **kök `.env`'i diskten
yükleyen** dosyayı atlar. Yorumun kendisi yanlış bir güvenlik hissi üretiyor.

**Önerilen düzeltme — tam olarak düzeltilecek satırlar 24-26:**

```
// `process.env` `src/**` altında İKİ dosyada geçer: bu dosya (okuma, K17) ve
// `root-env-integration.ts` (yalnızca `command === 'dev'` dalında yazma+okuma).
// MEKANİK pin yalnızca `src/components/**` için var (`no-restricted-globals`,
// eslint.config.mjs:149); `src/lib/**` için pin YOK — bu iki dosya elle korunur.
```

Yol üstündeyse: `eslint.config.mjs:123-125`'teki aynı premise ("`src/lib/storefront-env.ts` (K17)
`process.env`'i okumak ZORUNDADIR") artık eksik — ama o dosya bu Task'ın değişen listesinde
değil, borç satırı olarak bırakıldı (L5 ile aynı sahip).

**Sorumlu ajan:** `frontend` (dosya sahibi).

---

### M2 — [SEV: medium] `apps/storefront/package.json:8` ↔ `apps/storefront/playwright.config.ts:108`

**Tekrarlanan tetikleyici literali (`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u AI_AGENT`) iki
yerde ve hiçbir assert ikisini birbirine pinlemiyor.**

Önce **DRY kararı:** bu **gerçek** tekrardır, yüzeysel benzerlik değil — iki satır aynı nedenle
(`am-i-vibing` dedektör listesi) var ve aynı nedenle **birlikte** değişir (dördüncü bir dedektör
değişkeni, bir değişken adının değişmesi, önekin kaldırılması). Yine de **literalin kendisini
tekilleştirmek bu Task'ta kapatılamaz**: paylaşılan sarmalayıcı `scripts/`'in workspace paketi
olmasını bekliyor (T3-1, v0.0.14, ROADMAP'te kayıtlı) → **literal tekrarı kabul edilebilir borç.**

Kapatılabilir olan **sapmanın görünmezliği**. Kusurun kanıtı `playwright.config.ts:66-68`'de
yazarın kendi ifadesinde duruyor: "hiçbir assert bu ikisini pinlemiyor, sapma `pnpm test`'te
GÖRÜNMEZ". Somut senaryo: biri `package.json`'daki `dev` scriptine dördüncü bir `-u` ekler,
`playwright.config.ts`'i unutur → e2e koşumu yine artık süreç bırakır; bu **tam olarak T-011'in
Halka 3'te kapattığı kusur** ve `pnpm lint`/`typecheck`/`test` hiçbiri kırmızı vermez. Sapma ancak
"Playwright 10 saattir koşuyor" diye yeniden keşfedilir.

**Önerilen düzeltme (bu Task'ta, ~10 satır):** `env-contract.test.ts`'e **P6** eklenecek. Dosya
`apps/storefront/package.json`'ı zaten Zod ile okuyor (`readStorefrontPackageJson`, satır 88-92);
şemayı `scripts: { build: z.string(), dev: z.string() }` olacak şekilde genişlet, öneki
`scripts.dev`'den **türet** (`' astro dev'`den önceki kısım) ve `playwright.config.ts`'in metninde
`toContain` ile ara. Böylece literal **testin içinde yazılmaz** (AGENT_BASELINE §5 literal-jeton
disiplinine de uygun) ve pin tek kaynaktan türer.

**Sorumlu ajan:** `qa` (dosya sahibi, P1-P5 orada).

---

### L1 — [SEV: low] `apps/storefront/src/lib/storefront-env-schema.ts:13-16`

İki yeni yorum birbiriyle **çelişiyor**. Burada "ilk denemede `new Function` tabanlı dinamik
`import()` kullanılmıştı, o da ... modül çalıştırıcısının hook anında KAPALI olması nedeniyle
kırılıyordu" yazıyor. `root-env-integration.ts:36-42` ise tam tersini söylüyor: "modül çalıştırıcısı
kapalı" hatası **1. denemeye** (düz `await import(...)`) ait; `new Function` (3. deneme)
"**GERÇEKTEN ÇALIŞIYORDU**", saflık pini + `as` gerekçesiyle reddedildi. Ayrıca "ayrıntı
`root-env-integration.ts`'in **geçmiş** yorumunda" ifadesi yanlış yönlendiriyor — ayrıntı o dosyanın
**güncel** 33-50. satırlarında.
**Düzeltme:** 13-16'yı `root-env-integration.ts:36-42` ile uyumlu hale getir, "geçmiş" → mevcut
satır referansı. **Sorumlu:** `frontend`. **Vade:** ilk dokunuşta.

### L2 — [SEV: low] `turbo.json:49-52`

Gerekçe yorumu "`test` ve `test:isolation`'a env bildirimi EKLENMEDİ: **her ikisi de** cache: false
VE **env'i dosyadan yüklüyor** (`apps/api/vitest.config.ts:19-26` **ve kardeşleri**)" diyor.
`apps/storefront/vitest.config.ts` (okundu, 21 satır) kök `.env`'i **yüklemiyor** — `loadEnvFile`
çağrısı yok. Yani bu Task'ın asıl paketinde gerekçe geçerli değil. Bugün davranış hatası üretmiyor
(storefront testleri env'i kendileri kuruyor), ama latent: ambient env'e dayanan yeni bir storefront
testi çıplak `vitest` ile yeşil, `turbo run test` altında (turbo süzdüğü için) `undefined` görür.
**Düzeltme:** iddiayı daralt ("`apps/storefront` testleri env'i testin içinde kurar, ambient env'e
dayanmaz") veya storefront vitest config'ine kardeşlerinin `existsSync`+`loadEnvFile` desenini ekle.
**Sorumlu:** `devops`. **Vade:** v0.0.14.

### L3 — [SEV: low] `apps/storefront/src/lib/__tests__/env-contract.test.ts:95-110` ↔ `root-env-integration.test.ts:23-40`

`runSetupHook` ve `fakeLogger` iki test dosyasında **birebir** tekrarlanıyor (env-contract.test.ts:94
bunu kabul ediyor: "AYNI yardımcı deseni"). Aynı nedenle değişirler (Astro hook imzası / `command`
birleşimi) → gerçek tekrar. Ek olarak P4 (satır 149-175), `root-env-integration.test.ts`'in 2. ve 5.
testlerinin davranışını tekrar assert ediyor; ayrıca env izolasyonu bir dosyada
`beforeEach/afterEach`, diğerinde elle `try/finally` ile yapılıyor (iki farklı disiplin).
**Düzeltme:** `src/lib/__tests__/helpers/astro-setup-hook.ts` (tek `runSetupHook` + `fakeLogger` +
env yedekleme), P4'ü yalnızca "sözleşme pini" iddiasına indir. **Sorumlu:** `qa`. **Vade:** v0.0.14.

### L4 — [SEV: low] `apps/storefront/src/lib/storefront-env-schema.ts:39-67` ↔ `packages/config/src/env.ts:187-203`

`parseStorefrontEnv`'in gövdesi `parseEnv`'in **birebir** kopyası (issue eşleme bloğu satır 46-49 vs
197-200 karakter karakter aynı); fark yalnızca hata sınıfı ve mesaj kuyruğu. Kopyanın gerekçesi
(`storefront-env.ts:11-22`) `@arkesoft/config`'in `apps/storefront/package.json:29`'da
`devDependencies` altında olması; yani bir **bağımlılık sınıflandırması** hipotetik bir
`pnpm install --prod` senaryosu için kalıcı kod tekrarıyla ödeniyor (bugün Dockerfile yok).
İkincil maliyet: kopya `EnvValidationError` gibi **adlandırılmış bir hata tipi üretmiyor**, çıplak
`Error` fırlatıyor → `root-env-integration.ts:110` ve testler yalnızca Türkçe mesaja regex
uygulayabiliyor (`toThrow(/Storefront ortam değişkenleri geçersiz/)`); kullanıcıya dönük metin
değişince testler kırılır, tip ile ayırt etme imkânı yok.
**Düzeltme:** gerçek Dockerfile yazılırken `@arkesoft/config`'i `dependencies`'e taşı ve kopyayı sil;
o güne kadar en azından `StorefrontEnvValidationError extends Error` ihraç et.
**Sorumlu:** `devops`. **Vade:** v0.0.14 (Dockerfile sürümü).

### L5 — [SEV: low] `apps/storefront/eslint.config.mjs:76` (değişen listede DEĞİL — borç satırı)

K14 ada ithal kısıtının glob'u `['**/storefront-env', '**/storefront-env.js']`; yeni
`storefront-env-schema.js` ve `root-env-integration.js` bu desenlere **uymuyor**. Bugün gerçek bir
delik yok (şema modülü değer taşımıyor, adalarda `process` zaten `no-restricted-globals` ile yasak),
ama pin, niyetinden daha dar kaldı: env sözleşmesi modülleri bölündü, kısıt bölünmeyi takip etmedi.
**Düzeltme:** group'a `'**/storefront-env-schema'`, `'**/storefront-env-schema.js'`,
`'**/root-env-integration'`, `'**/root-env-integration.js'` ekle.
**Sorumlu:** `frontend`. **Vade:** v0.0.14.

---

## ÇÜRÜTÜLEN HATLAR (ölçüldü, bulgu DEĞİL)

1. **Hat 3 — `command` dallanmasının exhaustive olmaması.** Astro 7.4.2'nin tipi
   `command: 'dev' | 'build' | 'preview' | 'sync'`
   (`node_modules/.pnpm/astro@7.4.2_.../astro/dist/types/public/integrations.d.ts:349`) — yani
   `root-env-integration.ts:83-86`'nın dört komutu sayan dokümantasyonu **bugün tam**.
   `assertNever` deseni burada **uygulanmamalı**: kod 4 yollu bir dispatch değil, `command !== 'dev'`
   negatif kapısı; Astro ileride beşinci bir komut eklerse mevcut biçim **fail-closed** davranır
   (`process.env`'e dokunmaz), `assertNever` ise o komutta **fırlatarak** yapılandırma yüklemesini
   kırar. CLAUDE.md §4'ün exhaustive `switch` kuralı değer üreten union dispatch'leri hedefler;
   güvenlik kapısında negatif guard doğru desendir. **Bulgu yok.**
2. **Sağlayıcı dallanması (`if (provider === ...)`).** Yok. `command === 'dev'` çerçevenin kendi
   komut ayrımı, dış sağlayıcı değil.
3. **Katman ihlali.** `apps/storefront` → `packages/config` ithali yalnızca
   `env-contract.test.ts:37`'de, test-zamanında (gerekçesi satır 23-28'de yazılı) — üretim modülü
   bu ithali yapmıyor (doğrulandı: `storefront-env.ts`/`-schema.ts`/`root-env-integration.ts`
   yalnızca `zod`, `node:fs`, `node:path`, `astro` tipi ithal ediyor). `packages/config` hiçbir
   uygulamaya bağımlı değil. Yazma işlemi, DB erişimi, `trpc` bağımlılığı yok. **İhlal yok.**
4. **Döngüsel bağımlılık.** Yön tek: `astro.config.ts → root-env-integration.ts → storefront-env-schema.ts`
   ve `storefront-env.ts → storefront-env-schema.ts`. Şema modülü hiçbir şey ithal etmiyor (`zod`
   hariç). **Döngü yok.**
5. **Ölü kod.** `storefront-env.ts:35-36`'nın geriye uyumluluk re-export'ları ölü **değil** —
   `storefront-env.test.ts:30/43/56/69` onları tüketiyor. (Tek sembol için iki ithal yolu kalması
   gereksiz dolaylılık; L3 düzeltmesiyle aynı turda kapatılabilir ama ayrı bulgu yazmıyorum.)
6. **`.env.example` satır referansları.** `check-env.ts:98-99`'un `APP_BASE_DOMAIN` →
   `.env.example:14`, `STOREFRONT_API_BASE_URL` → `.env.example:130` atıfları **doğru** (grep ile
   satır satır doğrulandı). Beyan/gerçeklik boşluğu yok.
7. **`packages/config/src/env.ts:134-156` şema ayrımı ve `turbo.json` `env` yerleşimi.** Handoff'taki
   gerekçeler (api'nin `.extend()`'i, gereksiz hash churn) kod ile tutarlı; `storefrontEnvCheckSchema`
   ile `storefrontEnvSchema`'nın iki yerde durması P3 (`env-contract.test.ts:136`) ile **mekanik
   olarak** bağlanmış — yani iki şema sapınca test kırmızı verir. **Kusur değil, pinli tasarım.**
8. **`check-env.ts:105-154` `main()`'in üç neredeyse-aynı try/catch bloğu.** Üçlemeyi gördüm ve
   bilinçli olarak bulgu yazmıyorum: üç blok farklı rehber metinleriyle farklı sorumluluk
   sınırlarını (temel / ayrıcalıklı DB / storefront) temsil ediyor ve `instanceof` yeniden fırlatma
   disiplini üçünde de doğru uygulanmış; tablo-sürücülü bir döngüye çevirmek okunabilirlik
   kazandırır ama davranış riski sıfır. Dördüncü blok eklenirse yeniden değerlendirilmeli.

---

## ÖLÇÜMLER

- **İncelenen değişen dosya:** 11/11 (`turbo.json`, `packages/config/src/env.ts`,
  `packages/config/src/check-env.ts`, `apps/storefront/astro.config.ts`,
  `apps/storefront/package.json`, `apps/storefront/playwright.config.ts`,
  `apps/storefront/src/lib/storefront-env.ts`, `.../storefront-env-schema.ts`,
  `.../root-env-integration.ts`, `.../__tests__/root-env-integration.test.ts`,
  `.../__tests__/env-contract.test.ts`)
- **Doğrulama için ek okunan dosya:** 5 (`apps/storefront/eslint.config.mjs`,
  `apps/storefront/vitest.config.ts`, `.../__tests__/storefront-env.test.ts` (kısmi),
  `.env.example` (grep), `astro/dist/types/public/integrations.d.ts:349`)
- **`any` sayısı (değişen dosyalarda):** **0** (grep'in tek eşleşmesi kapsam dışı
  `storefront-server-fetch.ts`'teki `AbortSignal.any` API adı)
- **`@ts-ignore` / `@ts-expect-error`:** 0
- **`as` zorlaması:** 6, **tamamı test dosyalarında** (`as unknown as AstroIntegrationLogger` ×2,
  `as unknown as Parameters<typeof hook>[0]` ×2, `as [string]` ×2) — `middleware.test.ts`'in
  önceden kabul edilmiş deseni, üretim kodunda `as` yok. Üretim yolunda Zod dışı tip zorlaması: 0.
- **En büyük fonksiyon:** `check-env.ts:105-154` `main()` = **50 satır** (sonraki:
  `createRootEnvIntegration` 30 satır, `parseStorefrontEnv` 29 satır)
- **Dışa açılan fonksiyonlarda açık dönüş tipi:** 4/4 (`parseStorefrontEnv: StorefrontEnv`,
  `createRootEnvIntegration: AstroIntegration`, `resolveRootEnvPath: string`, hook `: void`)
- **Yorum/doküman dili:** Türkçe ✓ · kod/isim/dosya adı İngilizce + kebab-case ✓ (isimlendirme
  tablosu ihlali 0)
- **Hata yönetimi:** `catch {}` 0 · hatayı `null`'a çevirme 0 ·
  `root-env-integration.ts:102-113` logla + **orijinali yeniden fırlat** ✓
- **Bulgu dağılımı:** 1 high · 2 medium · 5 low → **FAIL** (AGENT_BASELINE §4: en az bir `high`)
- **Düzeltme turu açan bulgular:** H1 (`qa`), M1 (`frontend`), M2 (`qa`). L1-L5 ROADMAP borç
  tablosuna; L1 M1 ile aynı dosya ailesinde olduğu için "yolu üstündeyse kapat".
- **Koşturulmayan komutlar (handoff kısıtı):** `pnpm test`, `pnpm build`, `pnpm dev`,
  `pnpm --filter @arkesoft/storefront test:e2e` — hiçbiri çalıştırılmadı.
