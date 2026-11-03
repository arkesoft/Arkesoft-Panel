# T-011 · Kod Kalitesi (solid) gate · tur 2 — TAM yeniden denetim

- **Tarih:** 2026-11-02
- **Sürüm:** kilometre taşı `v0.0.9.1` · platform patch `0.1.0 → 0.1.1`
- **Kapsam:** 11 değişen dosya (`.claude/workflow/**` hariç)
- **Koşturulan komut:** YOK (handoff kısıtı: test/build/dev/playwright koşturma yasak).
  Tüm bulgular statik okuma + kaynak-üzeri mutasyon muhakemesiyle elde edildi.

```
GATE: solid
SONUÇ: PASS
```

FAIL kuralı (AGENT_BASELINE §4): `critical`/`high` yok, `medium` sayısı 2 (eşik 3) → **PASS**.
İki `medium` + yedi `low` teknik borca kaydedilir.

---

## 1. Tur 1 bulgularının kapanış kararı

### F1 [high] — `loadEnvFile` hiç gözlemlenmiyordu → **KAPANDI**

Kanıt (kod okuması, handoff'un mutasyon ölçümünden bağımsız):

1. `root-env-integration.test.ts:76+87` (build), `:94+100` (preview), `:107+113` (sync) ve
   `env-contract.test.ts:185+196` (P4 build dalı): `vi.spyOn(process, 'loadEnvFile')` +
   `not.toHaveBeenCalled()`.
2. **Anlambilimden bağımsızlık doğrulandı:** `beforeEach` (`root-env-integration.test.ts:58`)
   yalnızca `process` nesnesinin **`env` özelliğini** değiştiriyor; `process.loadEnvFile`
   (spy'ın yerleştiği yer) dokunulmadan kalıyor. Assert, Node'un yerel env deposunu değil
   **spy'ın JS tarafındaki çağrı kaydını** okuyor → `security`'nin ölçtüğü "yerel yazma düz
   nesneden görünmüyor" kusuru bu assert'i etkileyemez. Tur 1'deki kör `toBeUndefined()`
   assert'lerinin aksine bu assert kapının **kendisini** ölçüyor.
3. Mutasyon muhakemesi: `root-env-integration.ts:93-95`'teki `if (command !== 'dev') return`
   kaldırılırsa üç non-dev testi + P4'ün build dalı `loadEnvFile`'ı çağırır → 4 assert kırmızı.
   Handoff'un ölçtüğü sonuçla birebir aynı.
4. Zayıf yol assert'i de kapandı: `:141-142` ve `:170` artık `join(REPO_ROOT, '.env')` ile
   `toBe()`. `REPO_ROOT` testten 5 seviye yukarı (`:36`), üretim yolu
   (`resolveRootEnvPath`, `root-env-integration.ts:67`) 4 seviye yukarı **bağımsız** hesaplanıyor
   → assert totoloji değil; `resolveRootEnvPath`'teki seviye sayısı bozulursa kırmızıya döner.

### F2 [medium] — tetikleyici literalinin sapması görünmezdi → **KAPANDI**

1. **Gerçekten türetiyor:** `env-contract.test.ts:230` → `deriveAstroDevEnvPrefix(pkg.scripts.dev)`
   (`:113-122`). Pozitif assert yolunda (`:233`) hiçbir sabit önek literali yok; karşılaştırılan
   dizge `package.json`'dan okunuyor.
2. **Üçüncü kopya değil:** `:243`'teki literal yalnızca **sentetik negatif girdi**. Meşru bir
   sapmada (dördüncü `-u` İKİ dosyaya birlikte eklenirse) P6 türetilmiş önekle yeşil kalır,
   self-test de yeşil kalır — yani literal, pinin duyarlılığını zehirlemiyor. AGENT_BASELINE §5
   ihlali yok.
3. İki yönlülük: `package.json` sapsa da `playwright.config.ts` sapsa da `toContain` kırmızı verir.
4. Tekilleştirme borcu (T3-1/v0.0.14) **yeniden açılmadı** — kabul edilmiş borç.

### Tur 1'in beş `low`'u — teyit

| # | Konu | Karar |
| - | ---- | ----- |
| 1 | `storefront-env-schema.ts:13-16` hata atfı | **KAPANDI** — metin `root-env-integration.ts:33-50` ile birebir tutarlı (1. deneme = düz `await import` → "Vite module runner has been closed"; 3. deneme = `new Function`, çalışıyordu, saflık pini + `as` yüzünden reddedildi). Satır referansı (`:33-50`) da **doğru**. |
| 2 | `turbo.json:49-52` gerekçesi | **AÇIK** — `apps/storefront/vitest.config.ts:14-21` kök `.env`'i yüklemiyor; "her ikisi de … env'i dosyadan yüklüyor (… ve kardeşleri)" ifadesi storefront için yanlış. Zararsız (storefront testleri env'i kendileri kuruyor). `devops`, v0.0.14. |
| 3 | `runSetupHook` + `fakeLogger` birebir tekrarı | **AÇIK, kötüleşmedi** — hâlâ iki dosyada (`root-env-integration.test.ts:38-55`, `env-contract.test.ts:125-140`); FIX 1 **üçüncü kopya eklemedi**. Ancak aynı dosya içinde yeni bir logic-kopyası doğdu (bkz. M1, P7 self-test). `qa`, v0.0.14. |
| 4 | `parseEnv` gövdesi kopyası | **AÇIK** — `storefront-env-schema.ts:44-53`, `packages/config/src/env.ts:191-199`'un birebir kopyası; hata hâlâ adlandırılmamış düz `Error` (`:55`). `devops`, v0.0.14. |
| 5 | `eslint.config.mjs:76` K14 glob'u | **AÇIK** — `**/storefront-env`, `**/storefront-env.js` desenleri `storefront-env-schema.js` ve `root-env-integration.js`'i kapsamıyor; bir ada `root-env-integration.js`'i ithal ederse `node:fs`/`node:path` istemci grafiğine girer ve hiçbir kural yakalamaz. `frontend`, v0.0.14. |

---

## 2. FIX 1'in kendi denetimi (İŞ 2)

| Düzenleme | Karar |
| --------- | ----- |
| (a) `storefront-env.ts:26-33` | **KISMİ** — "İKİ dosyada okunur" üretim modülleri için doğru (grep: `storefront-env.ts:49`, `root-env-integration.ts:103`), ancak mekanizma tarifi yanlış ve boşluk envanteri eksik → **L1**. |
| (b) `storefront-env.ts:1-4` başlık | **İÇERİK TUTARLI** — başlık artık "bu TEK değil" diyor, gövdeyle çelişmiyor. Ancak başlıktaki satır referansı (`:24-31`) gerçek pasajı (`:26-33`) göstermiyor → **L2**. |
| (c) `storefront-env-schema.ts:13-20` | **KAPANDI** — `root-env-integration.ts:33-50` ile tutarlı, referans doğru. |
| `qa`'nın 6 yeni testi | **3'ü sağlam** (build/preview/sync spy assert'leri — başlıkları ölçtükleri şeyi doğru tarif ediyor), **P6 sağlam**, **P7/P8 self-test'leri yanlış tarif ediyor** → **M1**. |
| "salt yorum düzeltmesi" iddiası | `git diff` **ölçemedim** (Bash izni yok). Mevcut dosyalarda üretim davranışı/imza/export yüzeyi incelendi: `createRootEnvIntegration(): AstroIntegration` imzası, `command` kapısı, `storefront-env.ts`'in export yüzeyi (`storefrontEnvSchema`, `parseStorefrontEnv`, `StorefrontEnv`, `storefrontEnv`) sözleşme testinin assert ettiği yüzeyle tutarlı. Yeni `any`/`@ts-ignore` yok. |

---

## 3. BULGULAR

```
  - [SEV: medium] apps/storefront/src/lib/__tests__/env-contract.test.ts:269-275, :304-309 —
    "self-test" testleri HİÇBİR depo kodunu çalıştırmıyor; başlıkları "filtre bunu YAKALAR" /
    "pin'i KIRMIZIYA düşürür" diye pinin mutasyon duyarlılığını KANITLADIĞINI iddia ediyor.
    P7 self-test, P7'nin filtresini (`:260`) çağırmak yerine satır içinde YENİDEN YAZIYOR;
    P8 self-test iki satır yukarıda tanımlanan bir literal üzerinde assert ediyor ve P8'in
    asıl kırılgan parçasını (`command:` satırı çıkarma, `:286-289`) hiç çalıştırmıyor.
    KANIT: P7'nin filtresi `line.startsWith('PUBLIC')` yapılsa veya P8'in çıkarıcısı
    `.find((line) => line.includes('webServer'))` yapılsa iki self-test de YEŞİL kalır —
    yani iddia ettikleri duyarlılığı ölçmüyorlar. (`high` vermedim: korunan değişmezlerin
    GERÇEK pinleri P7/P8 olarak mevcut ve gerçek dosyaları okuyor; yanlış olan yalnızca
    "kanıt" iddiası ve 84'lük test sayımına eklenen iki totoloji.)
    DÜZELTME: P7'nin filtresini ve P8'in `command:` çıkarıcısını adlandırılmış fonksiyona
    çıkar, self-test'ler o fonksiyonu SENTETİK girdiyle çağırsın; aksi halde self-test'leri
    kaldır (gerçek pinler zaten var). — qa

  - [SEV: medium] apps/storefront/src/lib/storefront-env.ts:42-43 — kullanılmayan
    re-export yüzeyi, üstelik korunan değişmezi hedefleyen bir tuzak. `parseStorefrontEnv`
    ve `StorefrontEnv` isimlerini `storefront-env.js` üzerinden ithal eden HİÇBİR tüketici
    yok (repo çapında grep: tüm tüketiciler `storefront-env-schema.js`'ten alıyor —
    `root-env-integration.ts:56`, `storefront-env.ts:45-46`, `env-contract.test.ts:40`);
    yalnızca `storefrontEnvSchema` bir tüketiciye sahip (`storefront-env.test.ts:30,43,56,69`).
    Yorumun "GERİYE UYUMLULUK için … mevcut tüketiciler/testler değişmedi" gerekçesi üç
    isimden yalnızca biri için geçerli → kullanılmayan genellik (KISS, CLAUDE.md §10/13).
    KANIT (neden ölü koddan fazlası): `root-env-integration.ts:56` bir gün
    `from './storefront-env.js'` olarak "sadeleştirilirse" — ki bu yol SADECE `:42`
    yüzünden var — `astro.config.ts`'in grafiği HER `command` dalında (build/preview/sync
    dahil) `parseStorefrontEnv(process.env)` yan etkisini çalıştırır; bu, `storefront-env-
    schema.ts:4-25`'in tek varlık sebebi olan AC8 değişmezini ("build/preview dalları
    process.env'e HİÇ DOKUNMAZ") ihlal eder. Hiçbir test bunu pinlemiyor: P4'ün
    `delete process.env[...]` çağrıları (`:183-184`) STATİK import'tan SONRA çalışır,
    `loadEnvFile` spy'ı ise okumayı değil yazmayı ölçer.
    DÜZELTME: `:42`'yi yalnızca `storefrontEnvSchema`'ya indir (veya üçünü de kaldırıp
    `storefront-env.test.ts`'i şema modülünden ithal etmeye çevir). — frontend

  - [SEV: low] apps/storefront/src/lib/storefront-env.ts:26-33 — mekanizma tarifi yanlış,
    boşluk envanteri eksik. (i) `no-restricted-globals` (`eslint.config.mjs:149`) bu okumayı
    "ZORLAMIYOR", `src/components/**` içinde YASAKLIYOR — yasak ile zorunlu kılma aynı şey
    değil. (ii) "`src/lib/**` için böyle bir mekanizma YOK" ifadesi boşluğu olduğundan KÜÇÜK
    gösteriyor: kural `files: ['src/components/**/…']` ile sınırlı, dolayısıyla
    `src/pages/**`, `src/middleware.ts`, `src/layouts/**` de kapsam DIŞI. KANIT:
    `src/middleware.ts`'e `const x = process.env['FOO']` eklenirse `pnpm lint` yeşil kalır
    ve bu yorumdaki "İKİ dosyada" iddiası sessizce yanlışlaşır. (iii) "`src/**` altında İKİ
    dosyada okunur" literal olarak yanlış — `src/lib/__tests__/*.test.ts` dosyaları da
    `src/**` altında ve `process.env`'i okuyup yazıyor (ör. `storefront-env.test.ts:14,17-18`,
    `api-client.test.ts:26,29-30`); kastedilen "üretim modüllerinde".
    (`medium` vermedim: cümlenin operatif sonucu — "liste elle tutulur, lint pinlemiyor" —
    doğru ve ihtiyatlı, yani değişmez hakkında yanlış güven üretmiyor.)
    DÜZELTME: "yasaklıyor" + kapsam dışı dizinlerin tam listesi + "üretim modüllerinde". — frontend

  - [SEV: low] apps/storefront/src/lib/storefront-env.ts:4 ve
    apps/storefront/src/lib/__tests__/env-contract.test.ts:23 — FIX 1'in başlığa eklediği
    iki satır tüm dosyayı 2 satır kaydırdı, iki çapraz referans güncellenmedi: başlık
    "ayrıntı aşağıda :24-31" diyor, pasaj `:26-33`'te; test dosyası "`storefront-env.ts:11-22`"
    diyor, bağımlılık kararı `:13-24`'te. KANIT: her iki aralık da gösterdiği metni
    içermiyor (`:24` bağımlılık kararının son satırı, `:25` boş yorum).
    DÜZELTME: referansları `:26-33` ve `:13-24` yap. — frontend / qa

  - [SEV: low] apps/storefront/src/lib/__tests__/root-env-integration.test.ts:10-12 ve :61-64 —
    dosya başlığı "`process.env`/`process.loadEnvFile` HER testten ÖNCE/SONRA
    yedeklenir/geri yüklenir" diyor; `afterEach` yalnızca `process.env`'i geri yüklüyor,
    `vi.restoreAllMocks()`/`mockRestore()` HİÇ çağrılmıyor → FIX 1'in kurduğu beş spy dosya
    sonunda `process.loadEnvFile` üzerinde takılı kalıyor (karşılaştır:
    `env-contract.test.ts:198` `mockRestore()` çağırıyor). Davranışsal etki ölçmedim
    (Vitest dosya izolasyonu nedeniyle sızıntı dosya içinde kalır) — beyan/gerçeklik boşluğu.
    DÜZELTME: `afterEach`'e `vi.restoreAllMocks()` ekle veya başlık iddiasını düzelt. — qa

  - [SEV: low] apps/storefront/src/lib/__tests__/env-contract.test.ts:231-233 — P6 öneki
    `webServer.command` satırında değil, `playwright.config.ts`'in TAMAMINDA arıyor. Bugün
    tek eşleşme gerçek komut (dosya başı yorumu üç jetonu önek biçiminde yazmıyor), ama
    önek bir YORUMA girip komut satırı saparsa P6 yeşil kalır; P8 (`:286-289`) `command:`
    satırını zaten çıkarıyor, P6 aynı çıkarımı kullanmıyor.
    DÜZELTME: P6, P8'in `command:` satırı çıkarıcısını kullansın. — qa

  - [SEV: low] apps/storefront/src/lib/__tests__/root-env-integration.test.ts:137, :169 —
    `loadEnvFileSpy.mock.calls[0] as [string]`: runtime doğrulaması olmayan `as`
    (CLAUDE.md §2). `process.loadEnvFile`'ın imzası `string | URL` kabul ettiği için tip
    yalanı gerçek (`playwright.config.ts:85` bu API'yi URL ile çağırıyor); gürültülü
    kırılırdı, sessiz değil — ama gereksiz.
    DÜZELTME: `expect(loadEnvFileSpy).toHaveBeenCalledWith(join(REPO_ROOT, '.env'))` —
    `as` tamamen kalkar. — qa

  - [SEV: low] apps/storefront/src/lib/__tests__/root-env-integration.test.ts:174-177 —
    birim test, git tarafından izlenmeyen makineye özgü bir dosyanın varlığını assert ediyor
    ("repo kökünde `.env` dosyası gerçekten var"). Modülün davranışını değil geliştiricinin
    ortamını ölçüyor; temiz bir klonda `pnpm install && pnpm test` bu testte kırmızı verir
    (CI'da `setup-workspace` `create-env` varsayılanı `'true'` olduğu için yeşil —
    `.github/actions/setup-workspace/action.yml:15`). `pnpm test` kapısını izlenmeyen bir
    dosyaya bağlamak tekrarlanabilirliği zayıflatıyor.
    DÜZELTME: ön koşul kontrolünü `pnpm env:check`/docs tarafına taşı veya testi
    `.env` yokken `it.skip` yerine **anlamlı** bir davranış testine çevir. — qa

  - [SEV: low] packages/config/src/check-env.ts:98-99 — operatöre dönük metinde
    `.env.example:14` / `.env.example:130` satır numaraları SABİT yazılı. Bugün doğru
    (doğruladım: `.env.example:14` = `APP_BASE_DOMAIN=`, `:130` = `STOREFRONT_API_BASE_URL=`),
    ama hiçbir assert pinlemiyor — `.env.example`'a bir satır eklenirse hata metni operatörü
    YANLIŞ satıra yönlendirir ve hiçbir kapı bunu görmez (P2 yalnızca anahtarın VARLIĞINI
    pinliyor). Tur 1'de kaçırdım.
    DÜZELTME: satır numaralarını metinden çıkar (anahtar adı yeterli) veya P2'yi satır
    numarasını da doğrulayacak şekilde genişlet. — devops
```

## 4. Temiz çıkan kontroller

- `any` / `@ts-ignore` / `@ts-expect-error`: **0** (kapsamdaki tüm dosyalar; `AbortSignal.any`
  bir API adı, tip değil).
- Üretim kodunda `as`: **0**.
- `catch {}` / yutulan hata: **yok**. `root-env-integration.ts:104-113` yakalıyor, logluyor,
  **orijinal hatayı yeniden fırlatıyor** → fail-closed davranış korunuyor.
- Katman ihlali: yok. `apps/storefront` yazma yapmıyor; `@arkesoft/config` yalnızca test
  dosyasından (devDependency) tüketiliyor ve bu karar `env-contract.test.ts:23-28`'de
  gerekçeli; `packages/*` → `apps/*` yönünde bağımlılık yok.
- Döngüsel bağımlılık: yok. `storefront-env.ts → storefront-env-schema.ts`,
  `root-env-integration.ts → storefront-env-schema.ts`, `astro.config.ts →
  root-env-integration.ts`; şema modülü yalnızca `zod`'a bağımlı (yan etkisiz, ters kenar yok).
- Sağlayıcı dallanması / soyutlama: kapsam dışı (env yükleme), ihlal yok.
- İsimlendirme (CLAUDE.md §4): dosyalar kebab-case, tipler PascalCase, sabitler
  SCREAMING_SNAKE (`REPO_ROOT`, `STOREFRONT_ENV_KEYS`, `ORIGINAL_ENV`), fonksiyonlar camelCase
  ve niyet taşıyor (`deriveAstroDevEnvPrefix`, `stripFullLineJsonComments`,
  `resolveRootEnvPath`) — `data`/`temp`/`handle`/`process` gibi belirsiz ad yok.
- Dışa açılan fonksiyonların dönüş tipleri: hepsi açık.
- Dil: yorumlar Türkçe, kod/isimler İngilizce.
- Dış veri Zod'dan geçiyor: `turbo.json` (`turboJsonSchema`), `package.json`
  (`storefrontPackageJsonSchema`), `process.env` (`storefrontEnvSchema`).
- AGENT_BASELINE §5 literal-jeton: `env-contract.test.ts:243`'teki dedektör literali
  `.github/**/*.yml|yaml` tarama hedefinin dışında (`.github/ci-forbidden-tokens.txt:3`),
  CI'da kalıcı yanlış-pozitif üretmez.

## 5. ÖLÇÜMLER

- İncelenen dosya: **11** (kapsam) + **8** referans (`eslint.config.mjs`, `vitest.config.ts`,
  `.env.example`, `ci.yml`, `setup-workspace/action.yml`, `ci-forbidden-tokens.txt`,
  `storefront-env.test.ts`, `middleware.test.ts`).
- `any`: **0** · `@ts-ignore`: **0**.
- Doğrulanmamış `as`: **7**, hepsi test dosyalarında (`root-env-integration.test.ts:40,54,137,144,169`;
  `env-contract.test.ts:134,139`), üretimde **0**. Tur 1'de 6 sayılmıştı; fark FIX 1'in eklediği
  spy assert'lerinden geliyor — `git diff`'i **ölçemedim** (Bash izni yok).
- En büyük üretim fonksiyonu: `createRootEnvIntegration` — **30 satır**
  (`root-env-integration.ts:88-117`). İkinci: `parseStorefrontEnv` — 29 satır
  (`storefront-env-schema.ts:43-71`). En büyük test bloğu: P4 — 34 satır
  (`env-contract.test.ts:179-212`).
- Kapsamdaki test sayısı (statik sayım): `root-env-integration.test.ts` **7**,
  `env-contract.test.ts` **11**. Süit koşumu **ölçemedim** (koşturma yasağı); 958/958 × 3 ve
  84 test sayıları handoff'tan alınmıştır, tarafımdan doğrulanmadı.
