GATE: qa
TUR: 2 (DAR kapsam — sadece QA-1 kapanışı + backend davranış değişikliğinin AC3'e etkisi + taban sayı doğrulaması; yeni tarama yapılmadı)
TARİH: 2026-11-05
SÜRÜM: ROADMAP v0.0.14.1, T-015 (FIX turu 1 sonrası)
Dal: main (ölçüldü: `git branch --show-current`)
SONUÇ: PASS

---

## ① QA-1 KAPANDI MI

**Bağımsız mutasyon (tur 1'de kullanılandan FARKLI bir alan seçildi — `secretBearingTables` DEĞİL, `roleName`):**

`packages/db/src/__tests__/catalog-lint.test.ts`'teki `BASE_OPTIONS.authRole` nesnesinden
`roleName: AUTH_ROLE_NAME,` satırı çıkarıldı (geçici, yerel mutasyon — scratchpad'e yedek
alındı, sonra birebir geri yüklendi):

```diff
   authRole: {
-    roleName: AUTH_ROLE_NAME,
     secretBearingTables: SECRET_TABLE_NAMES,
     tablePrivilegeExpectations: AUTH_ROLE_TABLE_EXPECTATIONS,
   },
```

`pnpm --filter @arkesoft/db typecheck` çalıştırıldı — **gerçek TS hatası**:

```
src/__tests__/catalog-lint.test.ts(61,3): error TS2741: Property 'roleName' is missing in
type '{ secretBearingTables: readonly ["account", "session", "verification"];
tablePrivilegeExpectations: readonly AuthRoleTablePrivilegeExpectationLike[]; }' but
required in type 'AuthRoleLintInput'.
```

Mutasyon geri alındı (`cp` ile scratchpad yedeğinden birebir geri yüklendi);
`pnpm --filter @arkesoft/db typecheck` tekrar **temiz** geçti (hata yok).

**Sonuç:** `db`'nin iddiası (üç alan artık TEK iç içe `authRole` nesnesinde, "hep ya da hiç"
tip seviyesinde zorlanıyor) **farklı bir alanla bağımsız doğrulandı**. QA-1 **kapandı**.

---

## ② DAVRANIŞ DEĞİŞİKLİĞİNİN AC3'E ETKİSİ

### c2 hâlâ tek yük taşıyan kanıt mı — ayırt edilebilirlik ölçümü

`packages/db/src/auth-role-guard.ts`'in `assertAuthRoleIsRestricted()`'ını (gerçek Postgres'e
karşı, `@arkesoft/db` dist üzerinden) iki senaryoda doğrudan çağırdım (scratchpad script,
repo dosyası değiştirilmedi):

```
WRONG_ROLE(reachable, arkesoft_app) => AuthRoleNotRestrictedError |
  assertAuthRoleIsRestricted(): bağlantının current_user'ı "tenant" tablosunda SELECT
  yetkisine sahip — ...
UNREACHABLE(wrong port) => PrismaClientKnownRequestError |
  Invalid `prisma.$queryRaw()` invocation: ... Can't reach database server at 127.0.0.1:1
```

**Ölçülmüş sonuç:** iki senaryo **gerçekten farklı hata sınıfları ve metinleri** üretiyor.
`database-auth-url-anti-fallback.test.ts`'in (b) senaryosu `.rejects.toThrow(/current_user/)`
ile assert ediyor — bu regex **yalnızca** `AuthRoleNotRestrictedError`'ın mesajında geçer,
"ulaşılamıyor" (`Can't reach database server`) hatasında **geçmez**. Yani test, "rol kısıtlı
değil" (yanlış/geniş role işaret) ile "bağlantı kurulamadı" senaryolarını **ayırt
edebiliyor** — vacuity riski **ölçüldü ve ÇÜRÜTÜLDÜ**.

Ayrıca dosyanın kendi yorumunda itiraf ettiği gibi (satır 9-25), `??` ile fallback denemesi
`DATABASE_AUTH_URL`'in Zod'da koşulsuz zorunlu olması nedeniyle **yapısal olarak test
edilemez** (sağ taraf hiç erişilemez) — bu doğru bir gözlem, test dosyası bunu açıkça
belgeliyor, gizlemiyor.

**Ancak bir nüans var:** c2'nin "tek yük taşıyan kanıt" çerçevesi artık **ikiye bölünmüş**:
- **(a) sağlıklı kontrol** şimdi "`auth.module.ts:79` satırı hiç değiştirilmemiş/literal
  `DATABASE_URL`'e dönülmüş" mutasyonunu yakalıyor (dosyanın kendi ölçtüğü ikinci senaryo —
  `account` tablosuna INSERT, ST-D DDL'i sonrası `arkesoft_app`'in artık bu tabloda SIFIR
  yetkisi olduğu için 42501 ile düşer).
- **(b) saldırı senaryosu** şimdi "`DATABASE_AUTH_URL` operatör hatasıyla `DATABASE_URL`'in
  BİREBİR AYNISI yapılırsa" durumunu, bootstrap'taki `assertAuthRoleIsRestricted` probuyla
  yakalıyor — bu KODDAKİ bir `??`/`||` fallback'i DEĞİL, OPERATÖR yapılandırma hatasını
  test ediyor.

İkisi birlikte eski tekil iddiayı (request-time 42501 ile "fallback yok") **daha güçlü** bir
iki parçalı güvenceye dönüştürüyor; davranışsal olarak bir kayıp YOK, ama dosya başlığındaki
"TEK YÜK TAŞIYAN KANIT" çerçevesi artık (a)+(b) ikilisine BÖLÜNMÜŞ — bu bir dokümantasyon
nüansı, bulgu DEĞİL (fonksiyonel bir eksiklik ölçülmedi).

### Üç yeniden yazılmış testin değerlendirmesi — **iki YENİ bulgu bu adımdan doğdu**

`auth-flow.test.ts`, `auth-secret-leak.test.ts`, `database-auth-url-anti-fallback.test.ts`
üçü de "ulaşılamayan `DATABASE_AUTH_URL`" senaryosunu artık **bootstrap reddi** üzerinden
test ediyor (önceden: request-time, Better Auth'un içeride yakalayıp 500 boş gövde dönmesi
veya console.error çağırması). Bu geçiş **iki dosyada ölçülebilir bir boşluk** yarattı:

**BULGU 1 — `auth-secret-leak.test.ts`: `console.error` assert'i artık KALICI VAKUM.**
Testin gövdesi artık `createTestApp(...).rejects.toThrow()` ile bitiyor — HTTP isteği
(`request(...)`) **hiç çağrılmıyor** (bootstrap zaten reddediyor, uygulama hiç ayağa
kalkmıyor). Bu, better-call'un `console.error`'ının **çağrılabileceği tek yolu** (bir HTTP
isteğinin Better Auth dispatch'ine ulaşması) yapısal olarak ORTADAN KALDIRIYOR. Geçici
enstrümantasyon ile (dosyaya tek satır eklendi, test koşturuldu, satır geri alındı) ÖLÇÜLDÜ:

```
calls=0
```

`consoleErrorSpy.mock.calls.length === 0` — yani `expect(allCallsText).not.toContain('wrong')`
HER ZAMAN boş dizeye karşı değerlendiriliyor, **koşulsuz geçer**. Bu assert artık hiçbir
gerçek davranışı sınamıyor; "better-call'un kendi console.error'ı request zamanında şifre
sızdırmıyor" iddiası (solid Tur 1 H-1 bulgusunun kapanışı) bu dosyada **artık KANITLANMIYOR**.
Bootstrap sonrası (başarılı açılış sonrası) bağlantı koparsa bu yol hâlâ teorik olarak
erişilebilir kalıyor ama BUGÜN hiçbir test bunu sınamıyor.

**BULGU 2 — `auth-flow.test.ts`: "Better Auth içeride yakalar → 500 boş gövde,
`AuthProviderFailedError` devreye girmez" davranışı artık HİÇBİR testte doğrulanmıyor.**
Aynı sebep: senaryo bootstrap reddine taşındı, eski assert'ler (`response.status === 500`,
`response.body === {}`) tamamen silindi, yerine geçen test `request()` hiç çağırmıyor. Bu
davranış sınıfı (`AuthController`'ın try/catch'inin GERÇEKTEN devreye GİRMEDİĞİ durum) üretim
kodunda hâlâ var ama artık regresyon testi YOK.

Backend'in handoff'taki "kapsam genişletmesi değil, kaçınılmaz sonuç" değerlendirmesi
**doğru** — bootstrap probu zorunlu olarak request-time senaryosunu erişilemez kılıyor.
Ancak bunun **doğal sonucu** olarak kaybolan iki regresyon testi (BULGU 1, BULGU 2) `backend`
tarafından **yeni bir test ile telafi edilmedi** (örn. bootstrap BAŞARILI olduktan SONRA
bağlantının koptuğu bir senaryo, veya Better Auth'un içeride yakaladığı FARKLI bir
provider-hatası — ikisi de `DATABASE_AUTH_URL` doğrulamasının yakalayamayacağı bir sınıf).

---

## ③ TABAN SAYILAR VE BEŞ KAPI

Tüm komutlar `DATABASE_AUTH_URL` kabuk öneki + `--env-mode=loose --force` ile **bağımsız
olarak** koşturuldu; `.env`'e yazılmadı.

| Komut | Sonuç | Taban ile karşılaştırma |
|---|---|---|
| `pnpm lint` | 21/21 başarılı | ✅ eşleşti |
| `pnpm typecheck` | 21/21 başarılı | ✅ eşleşti |
| `pnpm build` | 13/13 başarılı | ✅ eşleşti |
| `pnpm format:check` | exit 0, "All matched files use Prettier code style!" | ✅ eşleşti |
| `pnpm test` (1. koşum) | 18/18 görev · db **195/195** (8 dosya) · api **490/490** (62 dosya) · platform toplamı **1295/1295** (tüm paketler) | ✅ eşleşti — toplam 1295 bağımsız ölçüldü ve doğrulandı (tenancy 39 + ui 23 + errors 48 + theme-sdk 223 + themes-modern 5 + admin 37 + trpc 110 + storefront 125 + db 195 + api 490 = 1295) |
| `pnpm test` (2. koşum, flake kontrolü) | Aynı: 18/18 · toplam 1295/1295 | ✅ flake YOK |
| `pnpm test:isolation` (1. koşum) | 10/10 görev · db **50/50** (5 dosya) · api **18/18** (4 dosya) · toplam **68/68** (9 dosya) | ✅ eşleşti — ayrı ayrı ölçüldü, sayı DÜŞMEDİ |
| `pnpm test:isolation` (2. koşum, flake kontrolü) | Aynı: db 50/50 · api 18/18 | ✅ flake YOK |

Beş kapı (`lint && typecheck && test && test:isolation && build`) **tam yeşil**, taban
raporuyla **birebir eşleşiyor**, iki koşumda da kararlı (flaky davranış YOK).

---

## YENİ BULGULAR (DAR kapsamında yalnızca ①②'den doğanlar)

| ID | SEV | Dosya:satır | Açıklama | Sorumlu ajan |
|---|---|---|---|---|
| QA-3 | medium | `apps/api/src/__tests__/auth-secret-leak.test.ts` (describe "better-call router.mjs:93 console.error") | Test artık `createTestApp(...)` bootstrap reddini bekliyor, `request(...)` HİÇ çağrılmıyor — `consoleErrorSpy` ÖLÇÜLDÜ: `calls=0`. `expect(allCallsText).not.toContain('wrong')` koşulsuz/vakum geçiyor; "better-call'un console.error'ı request zamanında şifre sızdırmaz" iddiası (solid Tur 1 H-1'in kapanışı) bu dosyada artık KANITLANMIYOR. Bootstrap-sonrası bağlantı kopması senaryosu hiçbir testte yok. | backend (yeni senaryo: bootstrap BAŞARILI olduktan sonra bağlantı kopması veya request-time'da erişilebilir farklı bir provider-hatası) |
| QA-4 | low | `apps/api/src/__tests__/auth-flow.test.ts` (describe "AuthController — sağlayıcı seviyesi hata ÖLÇÜMÜ") | "Better Auth içeride yakalar → 500 boş gövde, `AuthProviderFailedError` devreye girmez" davranışı (üretim kodunda `AuthController`'ın try/catch'i hâlâ var) artık hiçbir testte doğrulanmıyor — eski assert'ler (`response.status===500`, `response.body==={}`) silindi, yerine request hiç yapılmayan bootstrap-reddi testi geçti. | backend |

**Not:** Her ikisi de aynı kök sebepten (bootstrap probu, request-time senaryosunu
erişilemez kılıyor) doğuyor; backend'in "kaçınılmaz sonuç" değerlendirmesi mekanizma
açısından doğru, ama kaybolan iki regresyon testi telafi edilmedi.

## DOĞRULANAMADI

- Bootstrap-sonrası (başarılı açılıştan SONRA) bağlantı koptuğunda `console.error`/pino
  logunun şifre sızdırıp sızdırmadığı — hiçbir test bunu sınamıyor, canlı ortamda da
  ölçmedim (kapsam dışı, DAR).
- `database-auth-url-fail-fast.test.ts` (c1) ve `database-auth-url-no-fallback-literal.test.ts`
  (c3) içeriği — handoff bunları değişmemiş/tamamlayıcı olarak işaretliyor, DAR kapsamı
  gereği ayrıca okunmadı/mutasyonla sınanmadı.

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ (bu tur yalnızca ①②③'ü doğruladı — yeni kriter eşlemesi
yapılmadı, tam eşleme tur 1 raporunda):**

| Kontrol | Yöntem | Sonuç |
|---|---|---|
| QA-1 kapandı mı | bağımsız mutasyon (`roleName` çıkarıldı) + typecheck | geçti — TS2741 hatası üretti, geri alındıktan sonra temiz |
| c2 ayırt edilebilirlik | `assertAuthRoleIsRestricted()`'ı iki senaryoda doğrudan çağırma | geçti — iki farklı hata sınıfı/metni ölçüldü |
| console.error vacuity şüphesi | geçici enstrümantasyon + koşum + geri alma | DOĞRULANDI — `calls=0`, QA-3 bulgusu açıldı |

**TEST SAYILARI:** yeni eklenen test: 0 (bu tur üretim/test dosyası eklemedi, yalnızca
geçici mutasyon+geri alma) · toplam geçen: `pnpm test` 1295/1295, `pnpm test:isolation`
68/68 (iki koşum, flake yok) · toplam başarısız: 0.

**KOŞTURULAN KOMUTLAR:**

| Komut | Exit kodu | Özet |
|---|---|---|
| `pnpm --filter @arkesoft/db typecheck` (QA-1 mutasyonlu) | 2 | TS2741, beklenen hata |
| `pnpm --filter @arkesoft/db typecheck` (geri alındıktan sonra) | 0 | temiz |
| scratchpad `probe-errors.mjs` (node, `assertAuthRoleIsRestricted` iki senaryo) | 0 | iki farklı hata sınıfı/metni ölçüldü |
| `pnpm --filter @arkesoft/api exec vitest run src/__tests__/auth-secret-leak.test.ts` (enstrümante, geçici) | 0 | `calls=0` dosyaya yazıldı, test YEŞİL (ama vakum) |
| `pnpm lint --env-mode=loose --force` | 0 | 21/21 |
| `pnpm typecheck --env-mode=loose --force` | 0 | 21/21 |
| `pnpm build --env-mode=loose --force` | 0 | 13/13 |
| `pnpm format:check` | 0 | tüm dosyalar Prettier uyumlu |
| `pnpm test --env-mode=loose --force` (×2) | 0 | 18/18 görev, toplam 1295/1295, iki koşumda AYNI |
| `pnpm test:isolation --env-mode=loose --force` (×2) | 0 | 10/10 görev, db 50/50 + api 18/18 = 68/68, iki koşumda AYNI |

## SONUÇ GEREKÇESİ

Bu tur toplam **1 medium (QA-3) + 1 low (QA-4)** yeni bulgu üretti. AGENT_BASELINE §4
kuralına göre 1-2 `medium` → **PASS** (bulgular teknik borca kaydedilir). QA-1 bağımsız
doğrulandı ve kapandı; AC3'ün c2 kanıtı ayırt edilebilirlik açısından sağlam (vacuity riski
çürütüldü); taban sayılar ve beş kapı birebir eşleşti, iki koşumda flake yok.

**SONUÇ: PASS** — QA-3 (medium) ve QA-4 (low) teknik borç tablosuna kaydedilsin (`backend`
sorumlu; düzeltme turu QA-3 için AÇILABİLİR — medium bulgu kuralı gereği, Orkestratör karar
versin).
