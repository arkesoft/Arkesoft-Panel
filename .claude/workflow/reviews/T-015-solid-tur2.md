# T-015 · GATE: solid · TUR 2 · KAPSAM: DAR

**Tarih:** 2026-11-05 · **Sürüm:** ROADMAP v0.0.14.1 · **Dal:** `main` (`.git/HEAD` → `ref: refs/heads/main`, okundu)

```
GATE: solid
SONUÇ: PASS
BULGULAR:
  - [SEV: low] packages/db/src/catalog-lint.ts:776 — JSDoc hâlâ `columnOnly === true` diye bir SATIR ALANINA atıf yapıyor; böyle bir alan YOK (türetme `catalog-snapshot.ts:70,152,397`'de BİLEREK materyalize edilmemiş) — SD-5'in kapattığı beyan/gerçeklik boşluğunun aynı fonksiyondaki artığı — Düzeltme: JSDoc'u "tablo bazlı yetki yok + üç kolon yetkisi tam" diye GÖZLENEN alanlarla yaz — db
  - [SEV: low] apps/api/src/__tests__/database-auth-url-no-fallback-literal.test.ts:140-142 — `lineNumber: index + 1` BİRLEŞTİRİLMİŞ dizi üzerinden sayılıyor; her birleşme sonrası raporlanan satır numarası gerçek kaynak satırından sapar (yalnızca başarısızlık çıktısının teşhis kalitesi) — Düzeltme: birleştirmede ilk ham satırın indeksini taşı — backend
  - [SEV: low] apps/api/src/__tests__/auth-secret-leak.test.ts — QA-3'ün YAPISAL yüzü: dosya açılış-fazı ile istek-fazı iddialarını AYNI kurulumda taşıyor ve anti-vacuity bekçisi yok (kardeş dosya `database-auth-url-no-fallback-literal.test.ts:129` bu deyimi ZATEN kullanıyor) — Düzeltme: istek-fazı testini probu SAĞLAYAN fixture ile ayır + `expect(spy.mock.calls.length).toBeGreaterThan(0)` bekçisi — backend
ÖLÇÜMLER: 11 dosya incelendi (packages/db 6 · packages/config 2 · apps/api 3) · `any` = 0 · `@ts-ignore` = 0 · en büyük fonksiyon 166 satır (`lintTenantScopedTable`, catalog-lint.ts:331-496 — FIX 1'de DEĞİŞMEDİ)
```

---

## SEKİZ BULGUMUN KAPANIŞI

| ID       | İddia                                                 | Bağımsız doğrulamam                                                                                                                                                                                                                                                                                                                      | Sonuç                      |
| -------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **SD-1** | BORÇTA                                                | `packages/db/src/env.ts:31,63,104,136` — dört yapısal olarak BİREBİR tip takma adı (`DatabaseEnv`/`DatabaseBootstrapEnv`/`DatabaseMigrationEnv`/`DatabaseAuthEnv`, hepsi `databaseUrl: string` + `nodeEnv: NodeEnv`) DURUYOR. Borç metni geçerli.                                                                                        | BORÇ TEYİT                 |
| **SD-2** | BORÇTA + beyan düzeltilecek                           | Üçleme DURUYOR: `resolvePrismaCliPath`/`handleSpawnResult`/`isEnoent` üç dosyada da var (`bootstrap-roles.ts:85,110,128` · `run-guarded-prisma.ts:120,145,166` · `rollback-roles.ts:121,146,164`). ⚠ **Kaynaktaki eksik beyan `rollback-roles.ts:45-49`'da AYNEN DURUYOR** ("KÜÇÜK YARDIMCI … `resolvePrismaCliPath`/`handleSpawnResult`/`isEnoent`"). | BORÇ TEYİT (metin aşağıda) |
| **SD-3** | KAPANDI                                               | `tenancy.ts:58-64` artık sabit sayı YAZMIYOR, `TENANT_ISOLATION_RULES`'u TEK doğruluk kaynağı ilan ediyor. Vacuity sınaması: desen `[0-9]+ (kural\|rule)` (-i) `packages/db/src` altında **3 gerçek eşleşme** verdi (`catalog-lint.test.ts:616,770,1092` — describe başlıkları), **üretim kaynağında 0**. Desen çalışıyor, boş değil.    | **KAPANDI**                |
| **SD-4** | docs'ta, yapılmadı                                    | Yeniden açılmadı (ST-I bu turdan sonra koşacak).                                                                                                                                                                                                                                                                                         | AÇIK (docs)                |
| **SD-5** | KAPANDI                                               | `isColumnOnlyPrivilege` üretim kodunda YOK (repo genelinde yalnızca `catalog-lint.ts:820,826` YORUMLARINDA ve tur-1 raporunda geçiyor). `catalog-lint.ts:831` doğrudan `hasColumnSelect && hasColumnInsert && hasColumnUpdate`. Invariant yorumu `:820-830`'da ve DOĞRU: `isTableLevel` `:801`'de elendiği için `hasTableX` üçü de garanti `false`. | **KAPANDI** (artık: aşağıda) |
| **SD-6** | KAPANDI                                               | `mergeOperatorLineContinuations` `:79-102` var; iki prettier biçimi `:158-166`'da PARÇALARDAN kurulup `:171` eski davranışın `false` (kaçırıyor), `:175` yeni davranışın `true` döndüğünü AYNI girdiyle gösteriyor — bu gerçek bir "boş değil" kanıtı. Kendi-kaynak testi `:185-193` ayrı. Literal-jeton kuralı korunmuş (jetonlar sabitlerden kuruluyor). | **KAPANDI** (artık: aşağıda) |
| **SD-7** | BORÇTA                                                | Yeniden açılmadı.                                                                                                                                                                                                                                                                                                                        | BORÇ TEYİT                 |
| **SD-8** | KAPANDI                                               | `check-env.ts:188-196` tek yardımcı; dört çağrı noktası `:205,215,229,247`. Tip çıkarımı iddiası DOĞRU ve ÖLÇÜLDÜ: yardımcı imzası `(error: unknown, describeGuidance: (issues: readonly string[]) => string): void` — generic YOK, `as` YOK, `exitCode` döndürmüyor; her blok kendi `parseEnv`/`printEntries` çağrısını koruyor. Hata YUTULMUYOR: `:192-194` `EnvValidationError` değilse `throw error`. | **KAPANDI**                |

### SD-2 borç satırının metni (`docs` kopyalayacak)

```
medium · packages/db/src/rollback-roles.ts:60-196 ⇄ bootstrap-roles.ts:44-159 ⇄ run-guarded-prisma.ts:104-206 ·
Prisma CLI spawn iskeletinin ÜÇÜNCÜ kopyası — ~110/217 satır birebir (üç ortak yardımcı:
resolvePrismaCliPath, handleSpawnResult, isEnoent + .env yükleme + guard çağrısı + stderr/stdout deseni).
⚠ Borç ödenirken `rollback-roles.ts:45-49`'daki dosya başı beyanı DA düzeltilecek: beyan yinelenmeyi
"KÜÇÜK YARDIMCI FONKSİYONLAR" diye küçültüyor, ÖLÇÜM ~110/217 satır. Erteleme gerekçesi: düzeltmesi
bu alt görevin dosya listesinde OLMAYAN dosyalara dokunmayı zorunlu kılar (CLAUDE.md §10 md 13).
· db · vade: v0.0.16
```

```
medium · packages/db/src/env.ts:31-34, :63-66, :104-107, :136-139 ·
Dört yapısal olarak BİREBİR AYNI tip takma adı; dört ayrıcalık seviyesi (app/bootstrap/migration/auth)
tip katmanında AYRIŞMIYOR — dördüncüsü bu sürümde eklendi, beşinci rol beşinci kopyayı getirir.
Erteleme gerekçesi: ayrıştırma (branded tip veya discriminated okuyucu) kapsam dışı çağrı
noktalarına dokunur (CLAUDE.md §10 md 13). · db · vade: v0.0.16
```

---

## `index.ts` ADDITIVE AÇILMASI (A-PO2) — değerlendirme

**KABUL EDİLEBİLİR.** Ölçtüğüm üç şey:

1. **Transitif kapanış (tuzak 1).** `packages/db/package.json:7-12` — `exports` yalnızca `"."` taşıyor. `apps/api` için `assertAuthRoleIsRestricted`'a ulaşmanın **ikinci bir yolu yok**; alternatif (ikinci bir subpath açmak) yüzeyi daha fazla genişletirdi. Yapısal zorunluluk, tasarım gevşekliği değil.
2. **A-PO2'nin lafzı tutuldu.** Açılan iki sembol bir **fonksiyon** ve bir **hata sınıfı** — A-PO2'nin konusu olan yeni **tipler/sabitler** değil. Doğrulandı: `index.ts:42` hâlâ yalnızca `PLATFORM_LEVEL_TABLES`/`TENANT_SCOPED_TABLES` açıyor; ST-C'nin yeni sabitleri (`AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` vb.) ve `catalog-lint.ts`'in **hiçbir** sembolü (`TENANT_ISOLATION_RULES`, `AuthRoleLintInput`, `lintCatalog`) dışa **AÇILMADI**. Linter test-içi kalmış.
3. **Katman sınırı korunmuş.** `auth-role-guard.ts` saf bir yetki probu: `Pick<PrismaDatabase, '$queryRaw'>` dar parametresi (`health.ts` deseniyle aynı), Zod ile parse (`:94`), yaşam döngüsü kararı **vermiyor** (`:25-31` bunu açıkça `apps/api`'ye devrediyor). `auth.module.ts:103-113` kararı veriyor: `OnModuleInit`, bir kez, logla **ve yukarı fırlat**. `catch {}` yok, `null`'a çevirme yok. CLAUDE.md §3 `packages/db` "iş mantığı yapmaz" sınırı ihlal **edilmiyor** — rol/yetki doğrulaması db'nin RLS/şema remiti.

**Bir not, bulgu değil:** `AuthRoleNotRestrictedError` `AppError` yerine `Error`'dan türüyor. Emsal var ve tutarlı — `packages/config/src/env.ts:192` (`EnvValidationError`) ve `packages/theme-sdk/src/errors.ts:111` (`ThemeContractError`) de böyle. Gerekçe sağlam: açılış probu hatası kullanıcıya ulaşmaz (`userMessageKey`/`httpStatus` anlamsız), süreç düşer. Bulgu **yazmıyorum**.

---

## EK SORU: bir düzeltme var olan bir testin iddiasını sessizce boşaltıyorsa yapısal sorun mu?

**Evet, yapısal — ve evet, ayırmak gerekir.** Fonksiyonel tarafı `qa`/`security` ölçtü; yapısal teşhis şu:

Bu üç test **iki ayrı sistem sınırını** tek kurulumda taşıyordu:

- **Açılış/kablolama invariant'ı** — modül grafiği kısıtsız rolle ayağa kalkmayı reddediyor mu. Değişme sebebi: DI yaşam döngüsü, `OnModuleInit` sırası.
- **İstek anı davranışı** — gerçek bir istek yanıtta/logda sır sızdırıyor mu. Değişme sebebi: better-call, hata sınırı, logger.

Bu ikisi **farklı sebeplerle değişir** → test dosyası seviyesinde tek sorumluluk ihlali. FIX 1 birinciyi değiştirdi ve ikincinin **arrange fazını** kuruttu: test hâlâ yeşil, ama *act* fazına hiç ulaşmıyor. Yapısal işaret tam olarak bu — **iddiası ayakta kalıp ön koşulu buharlaşan bir test**, kurulumu için başka bir kaygının kablolamasına bağımlı olan bir testtir. "Açılış reddi" üretim kapısı olduğu an, onu paylaşan her istek-fazı testi onun rehinesi olur.

Ayırma reçetesi (iki madde, ikisi de `backend`):

1. **İstek-fazı testi üretim açılış kapısına bağlı olmasın** — probu *sağlayan* bir fixture ile mount et (probu karşılayan istemci enjekte et veya o fixture'da `assertAuthRoleIsRestricted`'ı stub'la). Açılış reddi kendi testinde kalır (zaten var, `OnModuleInit` fırlatması).
2. **Anti-vacuity bekçisi zorunlu olsun** — "X, Y'de görünmüyor" diyen her iddia ÖNCE Y'nin boş olmadığını assert etmeli. `consoleErrorSpy.mock.calls.length === 0` + "çağrılarda parola yok" tam olarak boş (vacuous) biçim. Bu deyim repoda **zaten var**: `apps/api/src/__tests__/database-auth-url-no-fallback-literal.test.ts:129` (`expect(files.length).toBeGreaterThan(0) // vacuity karşıtı`) ve `:187`. Kardeş dosyada kurulu deyimin bu dosyada uygulanmaması, kaybı sessiz kılan şey.

**Önem derecesi hakkında:** davranış/kapsam yüzü `qa`'nın QA-3'ü (medium) ve zaten düzeltme turu açık. Ben aynı kökü ikinci kez `medium` yazıp sayıyı şişirmiyorum — yapısal reçeteyi **low** olarak, QA-3'e bağlı yazıyorum.

---

## YENİ BULGULAR (yalnızca kapanış kontrolünden doğanlar)

| ID        | SEV | Dosya:satır                                                                  | Açıklama                                                                                                                                                                                                                                | Sorumlu ajan |
| --------- | --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| **SD-5r** | low | `packages/db/src/catalog-lint.ts:776`                                        | SD-5 artığı: JSDoc "Satır `columnOnly === true` ise" diyor ama satırda `columnOnly` **alanı yok** — `catalog-snapshot.ts:70,152,397` türetmeyi BİLEREK materyalize etmediğini yazıyor. SD-5'in kapattığı beyan/gerçeklik boşluğu sınıfı, aynı fonksiyonun JSDoc'unda. | db           |
| **SD-6r** | low | `apps/api/src/__tests__/database-auth-url-no-fallback-literal.test.ts:140-142` | SD-6 artığı: `lineNumber: index + 1`, `mergedLines` üzerinden sayılıyor. Birleşme olan her dosyada raporlanan satır numarası gerçek kaynak satırından **kayar**. Kapının yakala/kaçır davranışı DOĞRU; etkilenen yalnızca başarısızlık çıktısının teşhis değeri.         | backend      |
| **SD-9**  | low | `apps/api/src/__tests__/auth-secret-leak.test.ts`                            | QA-3'ün yapısal yüzü (yukarıdaki EK SORU): açılış-fazı ve istek-fazı iddiaları aynı kurulumda; anti-vacuity bekçisi yok. QA-3'ün düzeltmesiyle **aynı dosyada ve aynı düzenlemede** kapanır (AGENT_BASELINE §4 "yolu üstündeyse kapat").                               | backend      |

**Borç satırı metinleri** (`low` → düzeltme turu açmaz, `docs` kopyalar):

```
low · packages/db/src/catalog-lint.ts:776 · JSDoc var olmayan `columnOnly` satır alanına atıf yapıyor · db · vade: v0.0.16
low · apps/api/src/__tests__/database-auth-url-no-fallback-literal.test.ts:140-142 · ihlal satır numarası birleştirilmiş dizi üzerinden sayılıyor, kayıyor · backend · vade: v0.0.16
low · apps/api/src/__tests__/auth-secret-leak.test.ts · açılış-fazı/istek-fazı aynı dosyada + anti-vacuity bekçisi yok (QA-3'ün yapısal yüzü) · backend · vade: QA-3 ile BU SÜRÜM
```

---

## `security` tur 2 yeni bulguları (S-7…S-14) — tek cümle

Kapsamım değil; yapısal gözlem: bu turda hem benim SD-6'm hem `security`'nin S-2(b)'si "kapı var ama **üretim** çağrı noktası yok / kapı **kendi** varsayımını ölçmüyor" sınıfından çıktı — tekrarlayan kök, derleme-zamanı kapılarının **çalışma-zamanı eşdeğerinin** sistematik olarak aranmaması.

---

## DOĞRULANAMADI

- **Testlerin gerçekten koştuğu/yeşil olduğu.** `Bash` iznim yok; `pnpm test`, `pnpm test:isolation`, `pnpm typecheck` çalıştırılmadı. SD-6 ve SD-8 kapanışını **kaynak okuyarak** doğruladım (mantık ve iddia yapısı), **koşturarak değil**. → **`qa` / `release`'e havale.**
- **SD-2'nin ~110/217 satır oranı** satır-satır diff ile değil, üç dosyadaki ortak yardımcı adlarının varlığı ve tur-1 ölçümümün değişmemiş olmasıyla teyit edildi (üç dosyanın da ilgili bölümleri FIX 1'de değişmemiş görünüyor; `git diff` çalıştıramadım). → **`release`'e havale.**
- **`tsconfig.build.json`'dan `src/__tests__` hariç tutulmasının** build çıktısına etkisi — `pnpm build` çalıştırılmadı. → **`devops`/`release`'e havale.**
- **`catalog-lint.test.ts:616,770,1092` describe başlıklarındaki kural sayılarının (3/1/1) güncelliği** — SD-3'ün sınıfının kapsam-içi örnekleri değil (global sayı değil, blok-içi sayı) ve `:1141`'de mekanik bir sayı pini olduğunu gördüm; pinin bu başlıkları da kapsayıp kapsamadığını ölçmedim. DAR kapsam gereği genişletmedim.
