# T-015 — QA Gate · Tur 3 · Tarih: 2026-11-05

## AJAN: qa · TUR: 3 · KAPSAM: DAR · SONUÇ: PASS

Dal: `main` (ölçüldü: `git branch --show-current`)

---

### ① QA-3 KAPANDI MI — bağımsız doğrulama

**Yöntem:** ikisi de benim yazdığım, backend'in yazdığı kodun DIŞINDA bağımsız iki
mutasyon. Her mutasyon öncesi orijinal dosya scratchpad'e kopyalandı, mutasyon
sonrası `diff` ile BİREBİR geri alındığı doğrulandı (çalışma ağacı backend'in
FIX 2 değişikliklerine birebir döndü).

**Mutasyon 1 — `request(...)` çağrısını kaldır (dosya başı yorumunun "kırmızı
yol" iddiasını bağımsız tekrarla):**
`auth-secret-leak.test.ts`'in YENİ `describe` bloğunda (satır ~367-370) gerçek
`request(...)` çağrısını `const response = { status: 500, text: '' }` sabitiyle
değiştirdim (kendi mutasyonum, backend'in gösterdiği senaryonun birebir aynısı
değil — bağımsız doğrulama için ben uyguladım).

```
❯ src/__tests__/auth-secret-leak.test.ts (4 tests | 1 failed)
AssertionError: expected 0 to be greater than 0
 ❯ src/__tests__/auth-secret-leak.test.ts:385:47
   385| expect(consoleErrorSpy.mock.calls.length).toBeGreaterThan(0)
```

→ **Bekçi KIRMIZI.** `request(...)` kaldırılınca (veya atlanınca) anti-vacuity
guard'ı kırılıyor — iddia doğrulandı, vakum senaryosu artık koşulsuz GEÇMİYOR.

**Mutasyon 2 — fixture override'ı devre dışı bırak (fixture'ın gerçekten üretim
kapısını atlattığını, dekoratif olmadığını kanıtlamak için):**
`create-test-app.ts`'te `if (options.bypassAuthBootProbe === true)` koşulunu
`if (false)` ile değiştirdim (override hiç uygulanmaz).

```
❯ src/__tests__/auth-secret-leak.test.ts (4 tests | 1 failed)
PrismaClientKnownRequestError: Can't reach database server at 127.0.0.1:1
 ❯ assertAuthRoleIsRestricted ../../packages/db/src/auth-role-guard.ts:91:16
 ❯ AuthPrismaClientResource.onModuleInit src/auth/auth.module.ts:116:7
```

→ **Üretim boot kapısı (gerçek `assertAuthRoleIsRestricted`) fixture
devre dışıyken GERÇEKTEN çalışıyor ve `createTestApp()`'ı reddediyor** — fixture
GEVŞETME değil, GERÇEK bir DI override'ı; yalnızca `bypassAuthBootProbe: true`
geçildiğinde devreye giriyor. Üretim sınıfının kendisi (`AuthPrismaClientResource`)
değişmedi; `exports: [AUTH_SESSION_READER]` (auth.module.ts:233) hâlâ TEK token'ı
dışa açıyor — `AuthPrismaClientResource`'un `export` edilmesi yalnızca TS modülü
seviyesinde, Nest `exports` dizisine GİRMEDİ (iddia doğrulandı, dosya okunarak).

Her iki mutasyon sonrası dosyalar `diff` ile orijinaline (backend'in FIX 2
çıktısı) birebir geri alındı — kalıcı değişiklik YOK.

**`bypassAuthBootProbe` çağrı noktası sayımı (mekanik, `grep`):**
```
grep -rn "bypassAuthBootProbe" apps/api/src --include="*.ts"
```
→ **tek bir gerçek çağrı noktası** (`auth-secret-leak.test.ts:360`,
`bypassAuthBootProbe: true,`). İkinci eşleşme (`auth-flow.test.ts:623`) bir
YORUM satırı, çağrı DEĞİL. Varsayılan (`undefined`/`false`) davranışı koruyan
49 `createTestApp(` çağrısının HİÇBİRİ bu bayrağı geçmiyor — "additive,
varsayılan birebir eski" iddiası doğrulandı.

**Sonuç: QA-3 KAPANDI.** Anti-vacuity bekçisi gerçek, fixture üretim kapısını
gevşetmiyor (ayrı DI override, tek çağrı noktasında, varsayılan korunmuş).

---

### ② QA-4 — backend'in tasarım kararı bulguyu kapatıyor mu

`auth-secret-leak.test.ts`'in yeni `describe` bloğu (`bypassAuthBootProbe: true`
ile mount edilen istek-fazı testi) **gerçekten** şu davranışı doğruluyor:
`response.status === 500` ve `response.text === ''` — yani Better Auth hatayı
kendi içinde yakalıyor, `AuthController`'ın `try/catch`'i (`AuthProviderFailedError`,
503) devreye girmiyor. Bu testi bağımsız olarak koşturdum (yukarıdaki mutasyon
öncesi/sonrası), gerçek assert'ler var ve geçiyor — PASS, bağımsız ölçüldü.

`auth-flow.test.ts`'in ilgili testinin (satır 628, "ulaşılamayan DATABASE_AUTH_URL
→ AÇILIŞ reddedilir") dosya başı yorumu okundu (satır 608-627): eski *"bu
davranış artık ÜRETİLEMİYOR"* beyanı **açıkça YANLIŞTI olarak işaretlenmiş** ve
yeni teste (`auth-secret-leak.test.ts`'in "İSTEK ANINDA ulaşılamayan DB" bloğu)
doğru atıf yapılıyor. Yorum artık gerçeği anlatıyor — ikinci bir fiziksel kopya
test EKLENMEDİ, tek doğruluk kaynağı korundu.

**Sonuç: QA-4 KAPANDI.** Davranış gerçekten doğrulanıyor (tek yerde, gerçek
assert'lerle), `auth-flow.test.ts`'in yorumu artık gerçeği anlatıyor.

---

### ③ TABAN VE BEŞ KAPI — bağımsız ölçüm

Tüm komutlar repo kökünden, `DATABASE_AUTH_URL` kabuk öneki + `--env-mode=loose
--force` ile koşturuldu (not: `.env`'e yazılmadı).

| Komut | Sonuç | Not |
| --- | --- | --- |
| `pnpm lint` | **21/21 başarılı** | Taban ile birebir |
| `pnpm typecheck` | **21/21 başarılı** | Taban ile birebir |
| `pnpm build` | **13/13 başarılı** | Taban ile birebir |
| `pnpm format:check` | **exit 0** | "All matched files use Prettier code style!" |
| `pnpm test` | **18/18 görev · api 492/62 dosya · db 199/8 dosya · toplam 1301/128 dosya** | Taban ile BİREBİR aynı (62+8+diğer paketler topladığımda 128 dosya, 1301 test — elle toplandı, eşleşti) |
| `pnpm test:isolation` | **15 ayrı koşunun 14'ü**: 10/10 görev, db 55/5 dosya + api 18/4 dosya = 73/9 dosya (taban ile birebir). **1 koşu (ilk koşu, hemen `pnpm test`'in 92 saniyelik ağır yükünden sonra)**: 9/10 görev — `@arkesoft/api:test:isolation` 1 dosya FAILED + 3 PASSED, testler 13 PASSED + **5 SKIPPED** (18 toplam) | **FLAKY — aşağıda yeni bulgu** |

**Flaky test:isolation — bağımsız ölçüldü, 15 ardışık koşu:**
`pnpm test:isolation --env-mode=loose --force` 15 kez koşturuldu (çalıştığım
oturumda, hiçbir ortam değişikliği yapmadan). 14/15 koşu taban rakamıyla (10/10
görev, 73/73 test) BİREBİR eşleşti. **1/15 koşu** (ilk koşu — bir önceki `pnpm
test` komutunun hemen ardından, 92 saniyelik yoğun DB/Redis bağlantı yükünden
sonra) `@arkesoft/api:test:isolation` görevinde **1 dosya FAILED, 3 PASSED**;
**13 test PASSED, 5 test SKIPPED** (toplam 18) üretti. Bu koşunun ÇIKTISINI
yalnızca `grep` ile özetleyerek gördüm (dosyaya KAYDETMEDİM) — hangi test
dosyasının/testin başarısız olduğunu veya SKIPPED'e neden olan hata mesajını
**tekrar üretemedim**: aynı komutu arka arkaya 14 kez daha koşturdum, hiçbiri
tekrarlamadı. Bu dosyalarda (`auth-cross-tenant.isolation.test.ts`,
`member-cross-tenant.isolation.test.ts`, `queue-tenant-context.isolation.test.ts`,
`trpc-cross-tenant.isolation.test.ts`) `grep -n "skipIf\|\.skip("` **boş döndü**
— yani 5 "skipped" sabit kodlanmış bir `test.skip`/`skipIf` DEĞİL, Vitest'in bir
dosya içi hook/assert hatasından sonra kalan testleri "skipped" işaretlemesinin
GÖZLEMİ (muhtemel kaynak: önceki ağır `pnpm test` koşusunun bıraktığı DB/Redis
bağlantı havuzu baskısı — KANITLANMADI, yalnızca zamansal örtüşme gözlemlendi).

**SEV: medium** — flaky davranış, kaynağı doğrulanamadı, susturulmadı: bkz.
YENİ BULGULAR.

---

### YENİ BULGULAR (yalnızca ①② kapanış kontrolü sırasında gözlemlenen, taban ölçümünden)

| ID | SEV | Dosya:satır | Açıklama | Sorumlu ajan |
| --- | --- | --- | --- | --- |
| QA-5 | medium | `apps/api` — `pnpm test:isolation` (tüm izolasyon dosyaları) | 15 ardışık bağımsız koşunun 1'i (~%7) `@arkesoft/api:test:isolation`'da 1 dosya FAILED + 5 test SKIPPED üretti; 14 koşu taban rakamıyla (73/73) birebir eşleşti. Başarısız dosya/testin kimliği YAKALANAMADI (yalnızca özet grep'lendi, tam log kaydedilmedi) ve 14 tekrar denemesinde REPRODÜKSİYON OLMADI. Sabit kodlanmış `skip`/`skipIf` YOK (`grep` boş) — Vitest'in hook/bağlantı hatası sonrası kalan testleri skip işaretlemesi ihtimali var, KANITLANMADI. Önerilen: `devops`/`backend` izolasyon test paketinin DB/Redis bağlantı havuzu temizliğini (özellikle ağır bir `pnpm test` koşusunun hemen ardından) inceleyip, tekrar üretilebilir hâle getirip kök nedeni teşhis etsin; gerekirse `--retry` politikası veya bağlantı havuzu izolasyonu eklesin. | devops |

Not: bu `medium` bulgu AGENT_BASELINE §4 kuralına göre **PASS'ı bozmuyor** (1-2
`medium` → PASS, borca kaydedilir). Düzeltme turu açılmaz (low/medium tek
bulgu kuralına göre — ancak burada `medium` olduğu için normalde düzeltme turu
AÇILABİLİR; ancak bu Task'ın kapsamı DAR ve bu SON TUR — yeni tarama/düzeltme
turu açma yetkim yok, bulguyu borca/Orkestratöre bırakıyorum).

---

### DOĞRULANAMADI

- QA-5'in (flaky test:isolation) kök nedeni ve tam olarak hangi test(ler)in
  SKIPPED/FAILED olduğu — 1 kez gözlemlendi, 14 tekrar denemesinde
  reprodüksiyon olmadı, tam log kaydedilmeden kaybedildi.
- `S-13`/`SD-1`/`SD-2`/`SD-4`/`S-6`/`S-11`/`S-12`/`S-14`/`SD-7`/`QA-2` —
  kapsam DAR olduğu için dokunulmadı, borçta kalıyor (talimat gereği).
- `pnpm test:e2e` / `pnpm test:visual` — kök `package.json`'da script YOK,
  koşturulmadı (bu sürümde henüz yok).

---

## ÖLÇÜMLER

**KABUL KRİTERİ EŞLEMESİ (bu tur, QA-3/QA-4 kapanışı):**

| Kriter | Test | Sonuç |
| --- | --- | --- |
| QA-3: anti-vacuity bekçisi gerçek (vakum senaryosunda KIRMIZI) | kendi mutasyonum: `request(...)` kaldırma → `auth-secret-leak.test.ts` yeni describe | GEÇTİ (kırmızı doğrulandı) |
| QA-3: fixture üretim kapısını gevşetmiyor | kendi mutasyonum: `bypassAuthBootProbe` override'ını devre dışı bırakma → gerçek `assertAuthRoleIsRestricted` hatası | GEÇTİ (üretim kapısı sağlam) |
| QA-3: `bypassAuthBootProbe` varsayılanı eski davranışı koruyor | `grep` ile çağrı noktası sayımı (1 gerçek çağrı, 49 çağrının geri kalanı etkilenmiyor) | GEÇTİ |
| QA-4: "500 boş gövde" davranışı gerçekten doğrulanıyor | `auth-secret-leak.test.ts`'in yeni describe'ı, bağımsız koşturuldu | GEÇTİ |
| QA-4: `auth-flow.test.ts` yorumu gerçeği anlatıyor | dosya okunarak satır 608-627 incelendi | GEÇTİ |

**TEST SAYILARI:** bu turda yeni test YAZILMADI (kapsam DAR — kapanış
doğrulaması, yeni tarama yok). Mutasyon testleri geçici, geri alındı, kalıcı
değil. Taban: `pnpm test` 1301/128 dosya (14/14 ilgili koşuda sabit); `pnpm
test:isolation` 73/9 dosya (14/15 koşuda sabit, 1 koşu flaky — QA-5).

**KOŞTURULAN KOMUTLAR:**

| Komut | Exit/Sonuç | Özet |
| --- | --- | --- |
| `pnpm lint --env-mode=loose --force` | 0 | 21/21 başarılı |
| `pnpm typecheck --env-mode=loose --force` | 0 | 21/21 başarılı |
| `pnpm build --env-mode=loose --force` | 0 | 13/13 başarılı |
| `pnpm format:check` | 0 | Prettier temiz |
| `pnpm test --env-mode=loose --force` | 0 | 18/18 görev, 1301/128 dosya |
| `pnpm test:isolation --env-mode=loose --force` ×15 | 14× 0, 1× (görev seviyesi) kısmi fail | 14/15 10/10 görev·73 test; 1/15 9/10 görev (bkz. QA-5) |
| `npx vitest run src/__tests__/auth-secret-leak.test.ts src/__tests__/auth-flow.test.ts` (apps/api içinden) | 0 | 23/23 test, bağımsız doğrulama |
| Mutasyon 1 (geçici): `request(...)` kaldırma → aynı komut | 1 (beklenen) | `expected 0 to be greater than 0` — KIRMIZI yol doğrulandı, GERİ ALINDI |
| Mutasyon 2 (geçici): fixture override `if(false)` → aynı komut | 1 (beklenen) | üretim boot probu gerçekten reddetti — GERİ ALINDI |
| `git diff`/`diff` (her mutasyon sonrası) | 0 | dosyalar orijinaline birebir döndü doğrulandı |

**GENEL SONUÇ: PASS** (1 yeni `medium` bulgu — QA-5, borca; AGENT_BASELINE §4:
1-2 medium → PASS). QA-3 ve QA-4 bağımsız olarak KAPANDI doğrulandı.
