# T-011 — QA Gate — Düzeltme Turu 3/3 (SON)

**Tarih:** 2026-11-03 · **Sürüm:** v0.0.9.1 (platform patch 0.1.0 → 0.1.1)

GATE: qa
SONUÇ: PASS

## Kapatılan bulgular

| Bulgu | Önem | Dosya | Durum |
| --- | --- | --- | --- |
| F1 | medium | `apps/storefront/src/lib/__tests__/env-contract.test.ts` | KAPANDI — mutasyon kanıtıyla doğrulandı |
| F2 | low | `apps/storefront/src/lib/__tests__/root-env-integration.test.ts` | KISMEN KAPANDI — ölçülmüş sınırla birlikte uygulandı (aşağıya bkz.) |
| F3 | low | `apps/storefront/src/lib/__tests__/root-env-integration.test.ts` | KAPANDI |
| F4 | low | `apps/storefront/src/lib/__tests__/root-env-integration.test.ts` | KAPANDI |

### F1 — P8 self-test'in "return raw" arıza biçimine körlüğü

- `extractWebServerCommandLine`'ın dosya başı notu, P6, P6 self-test, P8 ve P8 self-test'teki
  "mutasyona karşı duyarlılık GERÇEKTEN ölçülüyor" beyanı **düzeltildi** — artık hangi mutasyon
  sınıflarının yakalandığı ve sınırın nerede olduğu açıkça yazılı.
- P8 self-test `toContain`/`not.toContain` (alt dizge) yerine `toBe` (tam eşleşme) kullanacak
  şekilde yeniden yazıldı; sentetik veriye bir YAKIN-KAÇIRMA satırı eklendi
  (`commandLabel: \`webServer\`,` — "command" ile başlıyor ama "command:" ile başlamıyor, aynı
  zamanda "webServer" kelimesini de taşıyor — eski self-test'in amacını da koruyor).
- P6, P6 self-test ve P8'in GERÇEK dosya üzerindeki assert'lerine ortak bir
  `expectSingleLine()` invaryantı eklendi: dönen değerin tek satır (çok satırlı bir blob
  DEĞİL) olduğunu zorunlu kılıyor. Bu, "return raw" mutasyonunu — ki ham dosya/blok metninin
  TAMAMI beklenen alt dizgeleri zaten içerdiği için salt `toContain` tabanlı assert'leri
  görünmez bırakıyordu — evrensel ve dinamik gerçek dosya metnine kırılgan bir `toBe` ile
  pinlemeden yakalıyor.
- Gerçek pinler (P6: `readStorefrontPackageJson()` + `readPlaywrightConfigRaw()`, P7:
  `.env.example`, P8: `readPlaywrightConfigRaw()`) **DEĞİŞTİRİLMEDİ** — hâlâ gerçek dosyaları
  okuyor; yalnızca invaryant eklendi.

**MUTASYON KANITI (zorunlu, ham çıktı):**

`extractWebServerCommandLine`'ı geçici olarak `return raw` yapıp çalıştırdım:

```
❯ src/lib/__tests__/env-contract.test.ts (11 tests | 4 failed) 14ms
     × P6: playwright.config.ts webServer.command satırı, ... BAŞLIYOR ...
     × P6 self-test: scripts.dev'e dördüncü bir `-u` değişkeni eklenmiş SENTETİK bir önek ...
     × P8: playwright.config.ts webServer.command "astro dev" içeriyor VE ... içermiyor
     × P8 self-test: extractWebServerCommandLine SENTETİK, ÇOK SATIRLI bir webServer bloğundan ...
 Test Files  1 failed (1)
      Tests  4 failed | 7 passed (11)
```

Dördü de kırmızıya düştü (önceki tur bu mutasyonda dördü de GÖRÜNMEZ/yeşil kalıyordu — kusur
doğrulandı ve kapatıldı). Ardından ikinci mutasyonu (`.includes('webServer')`) tekrar ölçtüm:

```
     × P6: ...
     × P8: ...
     × P8 self-test: ...
 Test Files  1 failed (1)
      Tests  3 failed | 8 passed (11)
```

P6 self-test yeşil kaldı — bu, önceki turun ölçtüğü "R G R R" deseniyle BİREBİR AYNI (P6
self-test bu sınıf mutasyona zaten duyarlı değildi ve olması da gerekmiyordu — drifted prefix
ayrı bir eksen ölçüyor). Her iki mutasyon da `python3` ile metin düzeyinde uygulandı, dosya
`shasum` ile **birebir** aynı duruma geri alındı:

```
50f4c7eac9fd6e5bdb5e33dcc48f4c9fa1023a20  env-contract.test.ts   (mutasyon ÖNCESİ)
50f4c7eac9fd6e5bdb5e33dcc48f4c9fa1023a20  env-contract.test.ts   (mutasyon #1 SONRASI geri alma)
50f4c7eac9fd6e5bdb5e33dcc48f4c9fa1023a20  env-contract.test.ts   (mutasyon #2 SONRASI geri alma)
```

Mutasyon sırasında `apps/storefront/package.json`, `playwright.config.ts`, `.env.example`
dosyalarının HİÇBİRİNE dokunulmadı (DOKUNMA kısıtı).

### F2 — `toHaveBeenCalledTimes(1)` hâlâ kök `.env`'in varlığına bağlı — ÖLÇÜLMÜŞ SINIRLA UYGULANDI

Önerilen düzeltme (`mockImplementation`) uygulandı, AMA **ölçüm, önerinin iddia ettiğini
doğrulamadı** — bu dürüstçe raporlanıyor:

1. `.env`'i geçici olarak taşıyıp (`mv`, sonra geri `mv`) DEĞİŞİKLİK ÖNCESİ iki "dev" testini
   koşturdum → **"expected 1 call, got 0"** ile kırmızı (bağımlılık doğrulandı).
2. `mockImplementation(() => undefined)` ekleyip AYNI deneyi TEKRARLADIM → **yine aynı hata**,
   "expected 1 call, got 0". Kök neden: `root-env-integration.ts`'in
   `if (existsSync(rootEnvPath)) { process.loadEnvFile(...) }` kapısı (bu Task'ta DOKUNMA
   listesinde, dokunulmadı) spy'ın ÇAĞRILIP ÇAĞRILMAYACAĞINI gerçek dosya sisteminden
   belirliyor; spy'ın implementasyonu bunu değiştirmiyor.
3. Hafif bir alternatif denedim: `import * as nodeFs from 'node:fs'; vi.spyOn(nodeFs,
   'existsSync')` → Vitest **"Cannot spy on export 'existsSync' — Module namespace is not
   configurable in ESM"** ile reddetti. Tek çalışan yol tam `vi.mock('node:fs', ...)` +
   `vi.doMock` + dinamik reimport iskelesi — ki bu, aynı dosyada L5'in (tur 2) AYNI gerekçeyle
   REDDETTİĞİ orantısız kapsam büyümesiyle birebir aynı sınıf.

**Uygulanan sonuç:** `mockImplementation(() => undefined)` eklendi (ESLint `no-empty-function`
`() => {}`'i reddettiği için ifade-gövdeli `() => undefined` kullanıldı) — bu, testi `.env`'in
İÇERİĞİNDEN bağımsız kılıyor (gerçek dosya artık asla okunmuyor/parse edilmiyor) ve
`loadEnvFileSpy`'ın "çağrıldı" kanıtını ZAYIFLATMIYOR (spy çağrı kaydını yine tutuyor — ölçüldü,
her iki test de HEAD'de yeşil). Ama testi `.env`'in VARLIĞINDAN bağımsız KILMIYOR — bu, F2'nin
orijinal önerisinin iddia ettiğinden daha dar bir kazanç. Dosyaya bunu dürüstçe belgeleyen bir
yorum eklendi; kalan boşluk ROADMAP borç tablosuna taşınmalı (aynı kök neden, L5'in borcuyla
birleştirilebilir — sorumlu: qa/devops, v0.0.14 penceresi).

F1'in mutasyon kanıtı bu değişiklikten SONRA da geçerli (yukarıdaki F1 bölümü bu turda,
`mockImplementation` eklendikten SONRA ölçüldü).

### F3 — Satır numaralı çapraz referans

`root-env-integration.test.ts:14`'teki `env-contract.test.ts:198` referansı (gerçek konum
artık `:232`, FIX 2'nin iki yardımcı eklediği için kaymıştı) **sembole çevrildi**: "P4 testindeki
`buildLoadEnvFileSpy.mockRestore()`". Dosyadaki TEK BAŞKA satır-numaralı çapraz referans
(`.gitignore:7`) de aynı nedenle (gitignore'a yeni satır eklenirse kayar) **satır numarası
kaldırılarak** `.gitignore` olarak düzeltildi.

### F4 — Doğrulanmamış `as`

`error.mock.calls[0] as [string]` kaldırıldı; `expect(error).toHaveBeenCalledWith(expect.
stringMatching(/regex/))` × 3 ile değiştirildi (aynı tek çağrı, üç farklı asimetrik eşleştiriciyle
doğrulanıyor).

**Ölçülen sayı:** QA'nın iki dosyasında doğrulanmamış `as` → **1 → 0**. Kalan `as` kullanımları
(4 adet: `env-contract.test.ts` 2, `root-env-integration.test.ts` 2) tamamı `as unknown as
<Tip>` test-double deseni — önceden kabul edilmiş, kapsam dışı (grep ile doğrulandı).

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ (bu turun 4 bulgusu):**

| Bulgu | Test | Geçti/Geçmedi |
| --- | --- | --- |
| F1 | P6, P6 self-test, P8, P8 self-test (env-contract.test.ts) | Geçti — ayrıca "return raw" ve ".includes('webServer')" mutasyon kanıtıyla doğrulandı |
| F2 | "dev ve kabuk zaten geçersiz..." + "dev ve env geçerliyse..." (root-env-integration.test.ts) | Geçti — sınırı ölçülüp dürüstçe belgelendi |
| F3 | Dosya başı yorum bloğu (kod değil, statik referans) | Düzeltildi, test yok (dokümantasyon düzeltmesi) |
| F4 | "dev ve kabuk zaten geçersiz..." (root-env-integration.test.ts) | Geçti |

**TEST SAYILARI:**
- `apps/storefront` paketi: **10 dosya / 83 test**, değişmedi (yeni test eklenmedi, mevcut
  testler güçlendirildi) — 3 ardışık koşum, üçü de 10/83 yeşil (flaky değil).
- `pnpm test` (repo geneli): **957/957** geçti (api 312, theme-sdk 217, db 166, errors 48,
  admin 37, tenancy 39, ui 23, trpc 32, storefront 83 — toplam 957).
- `pnpm test:isolation`: **18/18** geçti (db 14, api 4), 9/9 görev başarılı.
- Doğrulanmamış `as` (QA'nın iki dosyası): **1 → 0**. Kalan 4 `as unknown as` — kabul edilmiş desen.

**KOŞTURULAN KOMUTLAR:**

| Komut | Sonuç | Özet |
| --- | --- | --- |
| `pnpm lint` | 0 (19/19 görev) | storefront dahil tüm paketler temiz |
| `pnpm typecheck` | 0 (19/19 görev) | tsc --noEmit, tüm paketler temiz |
| `pnpm format:check` | 0 | Prettier — "All matched files use Prettier code style!" |
| `pnpm build` | 0 (13/13 görev) | `astro build` dahil — AC8'in `build` dalı canlı olarak da doğrulandı |
| `pnpm test` | 0 (16/16 görev) | 957/957 test geçti |
| `pnpm test:isolation` | 0 (9/9 görev) | 18/18 test geçti |
| `pnpm --filter @arkesoft/storefront test` × 3 | 0,0,0 | her koşumda 10/83 — flaky YOK |
| `pnpm test:e2e` | KOŞTURULMADI | Handoff'ta yasaklı (port çekişmesi, önceden ölçülmüş 11/11×6) |

**GİT DURUMU:** `git status --porcelain` → yalnızca iki QA dosyam (`env-contract.test.ts`,
`root-env-integration.test.ts`, her ikisi `??` — bu Task boyunca hiç commit edilmemiş) +
`frontend`'in paralel dosyası (`storefront-env.ts`, `M`) + önceki turlardan kalan diğer
ajanların dosyaları (DOKUNULMADI). `root-env-integration.ts`, `playwright.config.ts`,
`package.json`, `.env.example`, `turbo.json`'a dokunulmadı.

## BULGULAR

Bu tur için yeni bulgu yok — mevcut 4 bulgu (F1–F4) kapatıldı. F2'nin ölçülmüş kalan sınırı
(toHaveBeenCalledTimes'ın `.env` varlığına bağımlılığı) teknik borç olarak not edilmeli:

- [SEV: low] `apps/storefront/src/lib/__tests__/root-env-integration.test.ts:168-184` — kök
  `.env` dosyası diskte yoksa (temiz klon/CI, kurulum script'i koşulmadan) bu iki test
  `toHaveBeenCalledTimes(1)` üzerinde "expected 1, got 0" ile kırmızı verir; tam bağımsızlık
  `root-env-integration.ts`'in `existsSync` kapısına dokunmayı veya `vi.mock('node:fs', ...)` +
  dinamik reimport iskelesini gerektirir (ikincisi bu turda da denendi, L5'in tur 2'de
  REDDETTİĞİ orantısız kapsam büyümesiyle AYNI gerekçeyle hâlâ orantısız) — sorumlu: qa/devops,
  ROADMAP v0.0.14 borç penceresi, L5'in borcuyla birleştirilmeli (aynı kök neden:
  `root-env-integration.ts`'in `existsSync` dalı test edilemiyor).

BULGULAR (kod düzeltmesi gerektiren, bu Task kapsamında): yok.
