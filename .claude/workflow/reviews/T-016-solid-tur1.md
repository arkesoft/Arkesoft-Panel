# T-016 — `solid` gate, tur 1

- **Tarih:** 2026-11-09
- **Sürüm:** ROADMAP v0.0.15 (iki faktörlü kimlik doğrulama + oturum güvenliği)
- **Ajan:** `solid` (kod kalitesi kapısı)
- **Araç seti:** Read / Grep / Glob — **Bash YOK**. Hiçbir komut koşturulmadı, hiçbir kod
  dosyası değiştirilmedi.

```
GATE: solid
SONUÇ: FAIL
```

**Gerekçe:** `critical`/`high` bulgu **YOK**. **6 `medium`** bulgu var → AGENT_BASELINE §4
"3 veya daha fazla `medium` → FAIL" kuralı gereği FAIL. `low` bulgular tur açmaz, ROADMAP
teknik borç tablosuna gider (metinleri aşağıda hazır).

---

## BULGULAR

### medium

- **[SEV: medium]** `apps/api/src/auth/auth.guard.ts:76-80` (+ `apps/api/src/auth/two-factor-compliance.service.ts:23-31`, `apps/api/src/auth/auth.module.ts:211-224`) —
  `TwoFactorComplianceService` `@Injectable()` taşıyor ama `auth.module.ts`'in `providers`
  dizisinde **yok**; `AuthGuard` onu constructor'ında `new TwoFactorComplianceService(prismaService)`
  ile **elle** kuruyor. Dosyanın kendi yorumu gerekçeyi açıkça yazıyor: mevcut testlerin
  `new AuthGuard(prismaServiceStub)` imzasını kırmamak. Bu, **testin üretim kablolamasını
  şekillendirmesi**dir (DIP) ve `AuthGuard`'a üçüncü bir sorumluluk ekler (auth çözümü
  dallandırma + üyelik zorlama + **bir iş birliği nesnesinin yaşam döngüsünü sahiplenme**).
  Somut bakım senaryosu: `TwoFactorComplianceService`'e ikinci bir bağımlılık (logger,
  önbellek, saat) eklendiği gün `auth.guard.ts:79` derlenmez ve düzeltme o bağımlılığı
  `AuthGuard`'ın constructor'ından geçirmek olur — yani kararın kaçındığı imza değişikliği
  o gün yine olur, üstüne iki kurulum noktası (Nest + elle) sapma riski taşır. Ayrıca
  `AuthGuard`'a sahte bir uyumluluk servisi **enjekte edilemediği** için birim test
  `new Proxy(...)` fırlatan bir hileyle (`auth-guard-two-factor-enforcement.test.ts:214-221`)
  yazılmak zorunda kaldı.
  **Öneri:** servisi `auth.module.ts` `providers`'a ekle, `AuthGuard`'a `@Inject` ile ver;
  `new AuthGuard(stub)` çağrısı yapan testleri ikinci argümanla güncelle (üretim tasarımı
  testi değil, test üretimi izler). — sorumlu: `backend`

- **[SEV: medium]** `scripts/guards.sh:152-153` ↔ `.github/workflows/ci.yml:553-556`
  (ayrıca `guards.sh:157-182` ↔ `ci.yml:560-594`) — "run: bloğu içi şablon ifadesi"
  taramasının **34 satırlık awk programı** iki yerde birebir kopya. Veri dosyaları
  (`.github/ci-*.txt`) paylaşıldığı için S12'nin raporu doğru, **ama mantık kopyası ÖLÇÜLEBİLİR
  BİÇİMDE ZATEN SAPMIŞ:** `ci.yml` tarama hedefini AC13 adımının tek yerde ürettiği
  `/tmp/ac-workflow-action-targets.txt` dosyasından **okur** (dosyanın kendi yorumu: "Hedef
  küme burada TEKRAR `find` ile türetilmiyor — T-003 düzeltme turu 3 C4"), `guards.sh:153`
  ise **kendi `find`'ını** çalıştırır. Yani CI'da bir düzeltme turuyla kaldırılan ikinci
  türetme, yerel kopyada yeniden doğmuş. Somut senaryo: hedef kümeye yeni bir dizin/uzantı
  eklenince (ör. `.github/actions/**/*.yaml` dışında bir yol) `pnpm guards` yeşil kalır, CI
  kırmızı olur — ya da tersi, ki o durumda yerel kapı sessizce kör olur. "devops `.github/**`'e
  yazamaz" bir **ajan izni** kısıtıdır, kod tasarımı kısıtı değil: CI bu adımları
  `run: pnpm guards` ile çağırabilir veya awk programı `scripts/lib/*.awk` dosyasına
  çıkarılıp iki taraftan okunabilir.
  **Öneri:** awk/bash mantığını `scripts/` altına tek dosyaya çıkar; CI o dosyayı çağırsın.
  Kısa vadede en az hedef kümeyi tek kaynaktan türet. — sorumlu: `devops` (+ Orkestratör:
  `.github/**` dosya sahipliğini bu iş için aç)

- **[SEV: medium]** `apps/admin/src/features/two-factor/TwoFactorStatusCard.tsx:49-78`
  (bileşenin tamamı 31-268, **238 satır**) — kurulum akışının karar mantığı saf, React'ten
  bağımsız `two-factor-setup-controller.ts`'e çıkarılmışken, **disable** ve **regenerate**
  akışlarının karar mantığı (hata eşleme, depo yazması, önbellek senkronu, diyalog kapatma)
  bileşenin içinde kaldı ve **hiç birim testi yok** (admin 68/68 yeşil ama bu iki
  `handle*Confirm` dalını çalıştıran bir test ölçülemedi). Aynı özellik klasöründe iki farklı
  standart. Somut senaryo: `handleDisableConfirm`'deki üç satırın (`invalidateQueries` →
  `writeTwoFactorEnabled(false)` → `setQueryData`) sırası veya biri kaldırıldığında hiçbir
  test kırmızı olmaz; kart "2FA açık" göstermeye devam eder ve kullanıcı ikinci kez
  devre dışı bırakmaya çalışır. İkincil: iki `ConfirmDialog` bloğu (208-236, 238-265)
  yalnızca etiket/handler/variant farkıyla kopya, `password`/`isMutating`/`mutationError`
  durumunu **paylaşıyor**.
  **Öneri:** iki akışı `two-factor-setup-controller.ts` emsaliyle saf bir kontrolcüye (veya
  iki saf fonksiyona) çıkar ve `environment: 'node'` altında test et. — sorumlu: `frontend`

- **[SEV: medium]** `apps/admin/src/api/two-factor-status-store.ts:24-60` +
  `apps/admin/src/api/two-factor-status-query.ts:17-20` +
  `apps/admin/src/features/two-factor/TwoFactorStatusCard.tsx:167-181` — kullanıcının KENDİ
  `twoFactorEnabled` durumu sunucudan değil `sessionStorage`'dan türetiliyor. S10'un
  ölçümü doğrulandı (`packages/trpc/src/schemas/session-identity.schema.ts` yalnızca
  `userId`/`sessionId` taşıyor; `requireTwoFactorForOwner` `tenant-summary.schema.ts:59`'da
  var ama o **kiracının politikası**, kullanıcının durumu değil) ve **boş depo** hâli
  dürüstçe hata durumuna düşüyor (`TwoFactorStatusUnknownError` → `isError` → "Enable"
  butonu render EDİLMİYOR, fail-closed ✓). **Ancak ajanın bildirdiği sınırlama eksik:**
  `sessionStorage` **sekme başınadır**. İki sekme senaryosu: B sekmesi sign-in ile
  `false` seed'ler → kullanıcı A sekmesinde 2FA'yı kurar (A'nın deposu `true` olur, B'nin
  deposu DEĞİL, B'yi tazeleyen hiçbir sinyal yok) → B'de kart "2FA kapalı" + "Etkinleştir"
  gösterir → kullanıcı tıklar → `enableTwoFactor` **ikinci kez** çağrılır ve
  `two-factor-rest.ts:87`'nin kendi yazdığı gibi "ikinci çağrı sırrı yeniden üretir":
  A sekmesinde kaydedilen authenticator kaydı geçersizleşir. `TwoFactorSetupController`'ın
  `hasCalledEnable` koruması **mount başınadır**, bu yolu kapatmaz.
  **Öneri:** `session.me` çıktısına katkısal `twoFactorEnabled: boolean` ekle (MINOR) ve
  `twoFactorStatusQueryOptions`'ı ona bağla; depo ve dört senkron noktası silinir. Ara
  çözüm: kart `enable`'a girmeden önce durumu sunucudan doğrulasın. — sorumlu: `backend`
  (trpc sözleşmesi) + `frontend`

- **[SEV: medium]** `packages/db/sql/bootstrap-roles.sql:291` ·
  `packages/db/sql/rollback-auth-role.sql:70` · `packages/db/src/tenancy.ts:192-199` —
  "sır taşıyan tablo kümesi" `{account, session, verification, two_factor}` bu sürümde
  **altı** elle yazılmış yerde yaşıyor: (1) `tenancy.ts:158` `AUTH_SECRET_BEARING_TABLES`
  (kanonik TS), (2) `tenancy.ts:192-199` `AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` (dört
  satırı bu kümenin aynası), (3) `client.ts` `AUTH_SECRET_BEARING_MODELS`, (4)
  `__tests__/type-pins/auth-secret-tables.pin.ts:49-54` harita, (5) `bootstrap-roles.sql:291`
  SQL literal, (6) `rollback-auth-role.sql:70` SQL literal. **Mekanik olarak kapalı olanlar
  yalnızca (1)(3)(4)** — pin dört yollu `Exclude<>` ile bunları bağlıyor. (2) ve iki SQL
  literali **hiçbir derleme/çalışma zamanı kontrolüne bağlı değil**. Brief'in "üçüncü ayna"
  dediği `rollback-auth-role.isolation.test.ts` ÖLÇÜLDÜ ve **düzeltilmiş**: `expectedFindings`
  artık `AUTH_SECRET_BEARING_TABLES`'tan türüyor (satır 209, 222, 265) — elle kalan tek
  parça 159-169'daki DDL taklidi. Yani brief'in "üçü de elle" ifadesi S3b sonrası
  **kısmen eskidir**; kalan risk SQL tarafındadır. Somut senaficrio: yedinci bir sır tablosu
  eklenince TS tarafı pin'le kırmızı olur, **iki SQL betiği sessizce eksik kalır** →
  `arkesoft_app` o tabloda yetkili kalır (bootstrap) veya rollback tutarsız ara durum
  üretir (ikisinin de gerekçesi dosyalarda yazılı). Karşı emsal aynı Task'ta var ve doğru
  deseni gösteriyor: `auth-delegated-paths.ts` ↔ `auth-exempt-paths.ts` ikilisi
  `auth-path-sets.test.ts:117`'nin küme cebri assert'iyle **mekanik olarak kapatılmış**.
  **Öneri:** SQL betiklerinin dizisini `AUTH_SECRET_BEARING_TABLES`'tan üretilen bir
  `.sql` parçasına/psql değişkenine çevir; en azından katalog linter'ına "SQL'deki dizi ≡
  TS sabiti" assert'i ekle (dosya metni okuyan mekanik kapı emsali `auth-path-sets.test.ts:233`'te
  zaten var). — sorumlu: `db`

- **[SEV: medium]** `apps/admin/src/api/two-factor-rest.ts:79`, `:118`, `:220` +
  `apps/admin/src/features/two-factor/TwoFactorSetupWizard.tsx:50` (kökü:
  `apps/admin/src/features/two-factor/two-factor-setup-controller.ts:58`) — tip disiplini,
  CLAUDE.md §2/§4 ihlali. (a) Üç HTTP yanıt gövdesi Zod ile değil **elle yazılmış tip
  guard**'larla doğrulanıyor ve içlerinde `value as Record<string, unknown>` var; CLAUDE.md
  §4 "Dış dünyadan gelen her veri (HTTP gövdesi...) Zod ile parse edilir" ve §2 "`as`
  yalnızca runtime doğrulamasından (Zod) **hemen sonra** kabul edilir". Kardeş dosya
  `auth-rest.ts:28-39,81-89` **aynı Task'ta** aynı iş için Zod kullanıyor — tutarsızlık tek
  commit içinde. (b) `mapError(error: unknown)` içindeki `error as PanelError` **hiçbir
  runtime doğrulamasından sonra değil**; üstelik gereksiz: kontrolcü `result.error`'ı zaten
  `PanelError` olarak biliyor, `mapError` imzasını `(error: unknown)` diye genişletmek
  cast'ı kendi eliyle doğurdu. Aynı klasördeki `TwoFactorChallengeForm.tsx:54-65` doğru
  deseni (`error: PanelError`, cast YOK) kullanıyor. Somut senaryo: Better Auth gövde
  şekli değişince guard'lar `false` dönüp sessizce `{kind:'unknown'}`'a düşer — Zod'un
  `safeParse` hata ayrıntısı (hangi alan) kaybolur; `as PanelError` ise yanlış şekilli bir
  hatada `resolvePanelErrorMessage`'ı tanımsız alan okumaya zorlar.
  **Öneri:** üç guard'ı `z.object(...).safeParse` ile değiştir; `TwoFactorSetupDeps`'in
  hata eşleyicisini `(error: PanelError) => string` olarak daralt ve cast'ı sil. —
  sorumlu: `frontend`

### low (tur açmaz — ROADMAP teknik borç satırları)

- **[SEV: low]** `apps/api/src/errors/domain/account-temporarily-locked.error.ts:32-43` —
  sınıf üretim kodunda **hiç inşa edilmiyor** (grep: tek tüketici
  `__tests__/account-temporarily-locked-error.test.ts`). "Sözleşme olarak duruyor" kararı
  savunulabilir, **ama dosyanın kendi gerekçesi yanlış**: emsal gösterdiği
  `AuthProviderFailedError` üretimde GERÇEKTEN fırlatılıyor (`auth.guard.ts:91`), dolayısıyla
  "tanımlı ama tetiklenmeyen sınıf" emsali değil. Vade: v0.0.15.1 (step-up katmanı ikinci
  çağıranı getirir) — o sürümde çağıran gelmezse sınıf silinmeli. Sorumlu: `backend`.
- **[SEV: low]** `apps/api/src/auth/two-factor/totp-code-generator.port.ts:129-150` —
  `TotpCodeGeneratorPort` tipi ve `createTotpCodeGeneratorPort()` fabrikasının **sıfır
  tüketicisi** var (grep: yalnızca tanım satırları; sekiz test doğrudan `generateTotpCode`'u
  import ediyor) → kullanılmayan genellik + tek/sıfır kullanımlı fabrika (KISS). Ek: satır
  92'deki "`digits` 6–8 ile sınırlı" iddiası **kodda zorlanmıyor**; `generateTotpCode`
  `async` ama hiç `await` içermiyor (`Promise.resolve` sarmalaması). Ayrıca dosya
  salt-test amaçlı olduğu halde üretim kaynak ağacında (`src/auth/two-factor/`) duruyor.
  Sorumlu: `backend`.
- **[SEV: low]** `apps/admin/src/api/two-factor-rest.ts:25-32` ↔
  `apps/admin/src/api/auth-rest.ts:60-67` — `parseJsonSafely` birebir kopya. Yorumdaki
  gerekçe ("`auth-rest.ts` dokunma listesinde") **ölçümle yanlış**: `auth-rest.ts` bu
  Task'ta S10 tarafından DEĞİŞTİRİLDİ (satır 14-20'deki AC11 düzeltmesi). Ortak bir
  `api/http/parse-json-safely.ts`'e çıkarılmalı. Sorumlu: `frontend`.
- **[SEV: low]** `apps/api/src/__tests__/two-factor-acceptance-ac2-login-redirect-contrast.test.ts:137-141` —
  `expect(source).toContain('rateLimit: { enabled: false }')`: kaynak **metnini** assert eden
  pin. Depoda emsali var (`queue-happy-path.test.ts:298`, `auth-path-sets.test.ts:233`) ama
  bu örnek **biçimlendirmeye duyarlı bir literal** arıyor — Prettier/yeniden adlandırma
  ifadeyi iki satıra alırsa davranış değişmeden test kırmızı olur (yanlış kırmızı). Satır
  bazlı/regex tarama veya çalışan örneğin yapılandırmasını okumak daha dayanıklı. Sorumlu: `qa`.
- **[SEV: low]** `apps/api/src/auth/auth.guard.ts:41` ("**ÜÇÜNCÜ** zorlama kapısı") vs
  `apps/api/src/auth/auth.guard.ts:143` ve
  `apps/api/src/errors/domain/two-factor-required.error.ts:4` ("**İKİNCİ** zorlama kapısı") —
  aynı kapı aynı dosyanın iki yerinde farklı numarayla anlatılıyor. Yorum tutarlılığı.
  Sorumlu: `backend`.
- **[SEV: low]** `apps/admin/src/features/two-factor/TwoFactorChallengeForm.tsx:48-52` —
  `TERMINAL_CODES` `Set<string>`; `PanelErrorCode` kapalı dünyasına (`messages.ts:52-84`)
  **tip düzeyinde bağlı değil**. Üç kod bugün katalogda var (ölçüldü), ama bir kod yeniden
  adlandırılırsa `ERROR_MESSAGES` derleme hatası verir, `TERMINAL_CODES` **sessizce** eşleşmeyi
  bırakır: kilitlenmiş kullanıcı terminal ekran yerine alan bazlı "kod hatalı" görür.
  `ReadonlySet<PanelErrorCode>` yeterli. Sorumlu: `frontend`.
- **[SEV: low]** `apps/api/src/__tests__/two-factor-plugin-live.test.ts:379` ·
  `...ac2-login-redirect-contrast.test.ts:219` · `...ac4-secret-redaction-vacuity.test.ts:174` —
  yalnızca **status**'e bakan üç 401 assert'i. Üçü de komşu assert'lerle zincir içinde
  korunmuş (ac2: aynı uç verify sonrası 200; ac4: doğru kod 200; plugin-live: 429'luk
  kardeş assert gövde kodunu doğruluyor), bu yüzden vakum değil — ama `expect(body.code)`
  eklemek üç farklı 401'i (`INVALID_CODE` / `INVALID_TWO_FACTOR_COOKIE` / `UNAUTHENTICATED`)
  ayırt edilebilir kılar; dosyaların geri kalanı bunu zaten yapıyor. Sorumlu: `qa`.
- **[SEV: low]** `scripts/guards.sh:68,80,81` — üç `mktemp` dosyası hiç silinmiyor (`trap`
  yok); her yerel `pnpm guards` koşusu geçici dosya bırakır. Sorumlu: `devops`.
- **[SEV: low]** `apps/admin/src/routes/_app.hesap.guvenlik.tsx:1` — depodaki **ilk Türkçe
  dosya adı** (`_auth.sign-in.tsx`, `_app.index.tsx` İngilizce). CLAUDE.md §4 "dosya adları
  İngilizce" ile "kullanıcıya dönük metin Türkçe" burada çatışıyor, çünkü TanStack dosya
  tabanlı yönlendirmede dosya adı **URL'dir**. Kural bir kere kararlaştırılmalı (ADR veya
  §4'e istisna satırı), aksi halde her yeni rota aynı tartışmayı açar. Sorumlu: `docs` /
  `architect`.
- **[SEV: low]** `apps/admin/src/routes/_auth.sign-in.tsx:136-138,163-164` ·
  `apps/admin/src/features/two-factor/TwoFactorStatusCard.tsx:60-62` ·
  `apps/admin/src/features/two-factor/TwoFactorSetupWizard.tsx:78-80` — "depoya yaz + query
  önbelleğini senkronla + `session.me`'yi invalidate et" değişmezi **dört yerde** elle
  tekrarlanıyor; beşinci bir çağrı noktası bir satırı atlarsa kart sessizce eski durumu
  gösterir. Ayrı bir borç satırı olarak kaydedildi ama **M-4'ün düzeltmesiyle birlikte
  ortadan kalkar** (sunucu alanı gelirse dört nokta da silinir) — ayrı tur açılmasın.
  Sorumlu: `frontend`.

---

## İŞARETLİ KALEMLER (①–⑥) — AÇIK KARAR

| # | Kalem | Karar |
| - | ----- | ----- |
| ① | `TwoFactorComplianceService` DI'ye kaydedilmedi | **BULGU — medium** (yukarıda). Testin üretim tasarımını şekillendirmesi; iki kurulum noktası + enjekte edilemez iş birliği nesnesi. Kabul edilebilir ödünleşme DEĞİL, çünkü kaçınılan imza değişikliği ilk bağımlılık eklemesinde zaten gelecek. |
| ② | `AccountTemporarilyLockedError` tetiklenmiyor | **BULGU — low.** Sözleşme argümanı savunulabilir; **emsal iddiası yanlış** (`AuthProviderFailedError` üretimde `auth.guard.ts:91`'de fırlatılıyor). Borç satırı yazıldı, vade v0.0.15.1. |
| ③ | `guards.sh` mantığı `ci.yml` ile iki yerde | **BULGU — medium.** Kaçınılmaz değil (CI `pnpm guards` çağırabilir / awk ortak dosyaya çıkabilir) ve **sapma zaten ölçüldü**: hedef kümeyi CI tek yerden okur, `guards.sh` kendi `find`'ını koşar. |
| ④ | `TwoFactorStatusCard` disable/regenerate çıkarılmadı | **BULGU — medium.** Aynı özellik klasöründe iki standart; iki mutasyon dalı testsiz. |
| ⑤ | `two-factor-status-store.ts` + `sessionStorage` | **BULGU — medium.** Verilen kısıt (trpc'ye dokunma yasağı) altında "uydurma yok/fail-closed" kısmı DOĞRU ve iyi; ama ajanın bildirdiği sınırlama eksik — **sekme başına depo** nedeniyle eski `false` ikinci bir `enable` çağrısına ve sır yeniden üretimine yol açabilir. Katman ihlali olarak değil, kenar durum hatası olarak işaretlendi. |
| ⑥ | Üç elle yazılmış ayna | **BULGU — medium.** Ayna sayısı **altı**; mekanik olarak kapalı olan **üç** (`tenancy.ts:158` / `client.ts` / tip pin). İzolasyon testi S3b sonrası `AUTH_SECRET_BEARING_TABLES`'tan **türüyor** → brief'in "üçü de elle" ifadesi kısmen eski. **Dördüncü ayna VAR:** `tenancy.ts:192-199` `AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`. Desen bu sürümde **yeni bir yerde tekrarlanmadı**; var olan altı yere dördüncü üye (`two_factor`) eklendi. |

---

## ON BİR DENETİM BAŞLIĞI

1. **SOLID / SRP / DIP** — `AuthGuard` sorumluluğu büyüdü → **M-1**. `TwoFactorStatusCard`
   → **M-3**. `evaluateOwnerStatus` (fırlatmaz) / `assertOwnerCompliance` (fırlatır) ayrımı
   **DOĞRU ve temiz**: ikisi iki ayrı tüketiciye hizmet ediyor (guard zorlar, `session.me`
   zinciri okur), `assertOwnerCompliance` `evaluateOwnerStatus`'u **çağırır** — mantık
   tekrarı yok, "aynı şeyin iki yüzü" değil, saf hesap + ince zorlama sarmalayıcısı.
   Yeni port DIP'e **uyuyor**: `TenantSecurityWritePort` `packages/trpc/src/ports/`'da
   bildirilmiş, `apps/api/src/trpc/ports/tenant-security-write.port.adapter.ts`'te iş
   mantığı taşımayan tek delegasyonla uygulanmış, iş mantığının tamamı
   `tenant/tenant-security.service.ts`'te.
2. **Katman sınırları (CLAUDE.md §3)** — bulgu yok. Ölçüm: `packages/ui`'nin üç yeni
   bileşeni (`Skeleton.tsx`, `Checkbox.tsx`, `CopyButton.tsx`) **veri çekmiyor**, tüm metin
   prop'tan geliyor, `package.json`'ında `@arkesoft/trpc` **yok** (yalnızca `clsx`,
   `tailwind-merge`, peer `react`); Radix `apps/admin`'de kaldı (`ConfirmDialog.tsx`).
   `packages/db` yeni iş mantığı almadı (`tenancy.ts` saf veri beyanları).
   `apps/storefront` dokunulmadı. İş kuralı istemciye kaçmadı: owner 2FA zorlaması
   `AuthGuard`'da, politika yazması `permissionProcedure('security:write')` arkasında
   (`packages/trpc/src/routers/tenant.router.ts:32`), "kendini kilitleme" ön kontrolü
   sunucuda (`tenant-security.service.ts:127-136`).
3. **Bağımlılık yönü / döngü** — bulgu yok. `apps/* → packages/*` korunmuş; `packages/errors`
   çalışma zamanı bağımlılığı **yalnızca `zod`** (`packages/errors/package.json:25-27`).
   S8'in eklediği `pino` **devDependency** ve yalnızca `src/__tests__/redaction.test.ts`'te
   kullanılıyor (grep ile doğrulandı) → kural "hiçbir **iç** pakete bağımlı değildir"
   diyor; dış, dev-only, `dist`'e girmeyen bir bağımlılık bunu bozmuyor ve karşılığında
   gerçek bir vacuity kanıtı alınıyor. **Temiz.**
4. **DRY** — gerçek tekrar: **M-2** (awk/bash mantığı), **M-5** (altı ayna), L (parseJsonSafely),
   L (dört senkron noktası). **Tekrar DEĞİL diye geçilenler:** sekiz AC test dosyasının
   kurulum kodu (`signUpAndVerify`/`toCookiePair`/`uniqueEmail`) — her AC farklı sebeple
   değişir (biri Mailpit akışını, biri kilitlenme döngüsünü, biri redaksiyonu izler) ve
   ortak kısımlar zaten `__tests__/helpers/`'a (`create-test-app.ts`, `mailpit-client.ts`,
   `auth-fixture.ts`) çıkarılmış; kalan yerel kopyalar bilinçli ve işaretli
   (`auth-guard-two-factor-enforcement.test.ts:56`). `two-factor-rest.ts`'in altı REST
   fonksiyonu da yüzeysel benzer, **birleştirilmemeleri doğru** (her uç farklı gövde/dönüş
   sözleşmesi taşıyor).
5. **KISS** — `TwoFactorSetupController` durum makinesi **gereğinden karmaşık değil**: dört
   adımlı discriminated union, `hasCalledEnable`/`capturedBackupCodes` iki alanı AC11'in iki
   bağlayıcı davranışını karşılıyor, erken dönüşler durum korumalı. `challenge-countdown.ts`
   iki saf fonksiyonu **yerinde** (negatif girişte clamp, duyuru eşiği yalnızca 60/0 —
   WCAG 4.1.3 gerekçesi yazılı). Gereksiz genellik: L (`createTotpCodeGeneratorPort`).
6. **İsimlendirme (§4)** — tablo taraması yapıldı: TS modülleri kebab-case ✓
   (`two-factor-rest.ts`, `account-lockout.constants.ts`, `tenant-security-write.port.adapter.ts`),
   React bileşen dosyaları PascalCase ✓ (`TwoFactorSetupWizard.tsx`, `ConfirmDialog.tsx`,
   `BackupCodesList.tsx`, `ChallengeCountdown.tsx`, `Skeleton/Checkbox/CopyButton.tsx`),
   tip/sınıf PascalCase ✓, sabitler SCREAMING_SNAKE_CASE ✓
   (`ACCOUNT_LOCKOUT_MAX_FAILED_ATTEMPTS`, `CHALLENGE_TOTAL_SECONDS`, `TERMINAL_CODES`,
   `BASE32_ALPHABET`), hata kodları SCREAMING_SNAKE_CASE ✓ (`TWO_FACTOR_REQUIRED`,
   `ACCOUNT_TEMPORARILY_LOCKED`), boolean'lar `is`/`has`/`can` ✓ (`isSubmitting`,
   `isMutating`, `hasCalledEnable`, `isPublished` deseni), belirsiz ad (`data`, `temp`,
   `handle`, `process`) yok — `statusQuery.data` TanStack API'si. Tek ihlal: rota dosya
   adının Türkçe olması → **L**.
7. **Tip disiplini** — **M-6**. Yeni üretim kodunda `any` **0**, `@ts-ignore`/`@ts-expect-error`
   **0**, `eslint-disable` **0** (grep: `apps/api/src/auth/**` ve
   `apps/admin/src/{api,features,components,lib}/**`). `as any` yalnızca
   `apps/admin/src/routeTree.gen.ts`'te — **üretilen** dosya, CLAUDE.md §2'nin açık
   istisnası. Testlerdeki `as unknown as PrismaService` / `{} as unknown as ExecutionContext`
   test çiftleri; `error as TwoFactorRequiredError` **`toBeInstanceOf` assert'inden sonra**
   (runtime kontrolü var) → kabul.
8. **Hata yönetimi deseni (§4)** — iki yeni hata sınıfı `AppError`'dan türüyor ve dört alanı
   da taşıyor (`two-factor-required.error.ts:34-44`, `account-temporarily-locked.error.ts:32-43`);
   `context` PII içermiyor (opak cuid / saniye). **403 vs 409 ayrımı tutarlı ve doğru
   gerekçelendirilmiş** (`TwoFactorRequiredError` = erişim reddi, politika zaten açık;
   `TwoFactorSetupRequiredError` = politika değiştirme ön kontrolü) ve
   `auth-guard-two-factor-enforcement.test.ts:197-208` bunu iki yönlü `not.toBeInstanceOf`
   ile mekanik olarak sabitliyor. Boş `catch {}` **yok**: üç `catch` bloğu ölçüldü —
   `two-factor-rest.ts:29` (JSON değil → `null`, çağıran `normalizePanelError`'a veriyor),
   `TwoFactorSetupWizard.tsx:300` (URI ayrıştırılamadı → ham URI, uydurma yok),
   `_app.tsx:154` (kullanıcıya `role="alert"` mesaj) — hiçbiri sessiz yutma değil.
   Sağlayıcıya özgü tip dışarı sızmıyor; Better Auth'un kendi 429'u bilinçli olarak
   dönüştürülmeden forward ediliyor (kararı ② altında değerlendirildi).
9. **Test kalitesi** — genel seviye **yüksek** ve ADR-0014'e uyuyor:
   `ac4-secret-redaction-vacuity.test.ts` dört adımlı (pozitif kontrol → redaksiyon →
   gerçek akış → **vacuity kanıtı** redact'siz kontrol logger'ıyla), satır sayısı ve
   sentinel tekrar sayısı assert ediliyor (`toHaveLength(4)`, `occurrences).toBe(1)`);
   `auth-guard-two-factor-enforcement.test.ts` üç yakın-ıska hücresi + çapraz kiracı
   hücresi + `toHaveBeenCalledTimes(0)` boş-assert kanıtı taşıyor;
   `ac3-backup-code-single-use.test.ts` DB sütunu değişimini ve mutasyona uğramış komşu
   kodu ölçüyor. Bulgular: L (üç status-only 401), L (kaynak metni pin'i). `toContain`/`.some()`
   ile yetinilen güvenlik assert'i **bulunmadı** (tam küme + uzunluk assert'leri yerinde).
   Aşırı mock **yok** — testler gerçek Postgres/HTTP/Mailpit kullanıyor; tek sahte
   `createFakePrismaService` ve o da iki `findUnique` çağrı sayısını kanıtlamak için.
10. **Ölü kod** — L (`AccountTemporarilyLockedError`), L (port tipi + fabrika).
    `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS` **doğrulandı: ölü değil** —
    `auth-path-sets.test.ts:41` import ediyor, `:124` `AUTH_EXEMPT_PATHS` türetmesinde,
    `:144-153` alt küme assert'inde, `:196-199` yakın-ıska assert'inde tüketiliyor; dosyanın
    kendi yorumu (satır 132-138) tek tüketicisinin partition testi olduğunu **dürüstçe**
    yazıyor ve bu meşru bir "beyan + mekanik pin" desenidir (⑥'nın SQL aynalarında eksik
    olan tam budur). Üç yeni `packages/ui` bileşeni `index.ts:63-65`'ten export edilmiş ve
    `TwoFactorStatusCard`/`BackupCodesList` tarafından tüketiliyor → ölü değil.
    Yorum satırına alınmış kod bulunmadı.
11. **Yorum/dokümantasyon dili** — tüm yeni dosyalarda yorumlar **Türkçe**, kod/tanımlayıcılar
    **İngilizce** → kural karşılanıyor. Yorumlar ağırlıkla *neden*i anlatıyor (ölçüm
    referansları, reddedilen alternatifler, bağlayıcı sıra gerekçeleri) — bu projenin güçlü
    yanı. Bulgular: L (kapı numarası çelişkisi), L (`parseJsonSafely` gerekçesi ölçümle
    yanlış), L (`digits` 6–8 iddiası kodda zorlanmıyor), M-5 içinde (brief'in "üç ayna"
    ifadesinin S3b sonrası eskimesi).

---

## DOĞRULANAMADI

- Kapı sayıları (`lint`/`typecheck`/`test`/`test:isolation`/`build`/`guards`/`format:check`)
  **Orkestratör tarafından ölçüldü**; Bash erişimim olmadığı için bağımsız doğrulamadım.
- `apps/admin`'in 68 testinden hangilerinin `TwoFactorStatusCard`'ın disable/regenerate
  dallarını çalıştırdığı **koşturulamadı**; M-3'ün "test yok" iddiası dosya taramasına
  dayanıyor (`apps/admin/src/__tests__/` içinde o iki dalı çağıran bir dosya bulunmadı),
  koşum çıktısına değil.
- `Checkbox`'ın `accent-color` kontrastı (dosyanın kendi notu) — `wcag` gate'inin ölçümü.

---

## ÖLÇÜMLER

- **İncelenen dosya:** 34 (tam veya hedefli okuma) + 9 hedefli grep taraması.
  Dağılım: `apps/api` 12, `apps/admin` 13, `packages/ui` 4, `packages/db` 4,
  `packages/errors` 3, `packages/trpc` (grep ile 20 dosya yüzeyi), `scripts/guards.sh`,
  `.github/workflows/ci.yml` (hedefli).
- **Bulunan `any`:** **0** (yeni üretim kodu). `@ts-ignore`/`@ts-expect-error`: **0**.
  `eslint-disable`: **0** (yeni 2FA yüzeyinde). Üretilen `routeTree.gen.ts`'teki 4 `as any`
  CLAUDE.md §2 istisnası kapsamında, sayılmadı.
- **Gerekçesiz `as`:** **4** (`two-factor-rest.ts:79,118,220` + `TwoFactorSetupWizard.tsx:50`)
  → M-6.
- **En büyük fonksiyon:** `TwoFactorStatusCard` — **238 satır**
  (`apps/admin/src/features/two-factor/TwoFactorStatusCard.tsx:31-268`). İkinci:
  `TwoFactorSetupWizard` — **232 satır** (`TwoFactorSetupWizard.tsx:54-285`). İkisi de
  JSX ağırlıklı; en büyük **saf mantık** fonksiyonu
  `TwoFactorSetupController.submitPassword` 32 satır (`two-factor-setup-controller.ts:82-113`).
- **Bulgu dağılımı:** critical 0 · high 0 · **medium 6** · low 10.
- **Değiştirilen kod dosyası:** **0** (yalnızca bu rapor dosyası yazıldı).
