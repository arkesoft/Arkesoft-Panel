# T-016 — `security` gate, tur 1

- **Tarih:** 2026-11-09
- **Sürüm:** ROADMAP v0.0.15 (iki faktörlü kimlik doğrulama / TOTP + oturum güvenliği)
- **HEAD:** `6e90a6a` (commit atılmadı) · çalışma ağacı: 106 değişiklik
- **Koşturulmayanlar:** Playwright (`qa`/`wcag` için port 5173 serbest bırakıldı) ·
  `turbo run build` · `apps/admin` dev sunucusu · `db:reset` · `db:rollback-roles` ·
  `prisma migrate reset` / `db push --force-reset` · Redis `FLUSHALL`/`FLUSHDB`/`CONFIG SET`
- **Dosya değişikliği:** YOK (bu rapor hariç) — `git status --porcelain` ile kanıtlandı

```
GATE: security
SONUÇ: FAIL
```

---

## BULGULAR

### F1 · `high` · Altı yeni `/auth/two-factor/*` ucunun TAMAMI oran sınırsız; eklentinin kendi sınırlayıcısı etkisiz

**Dosyalar:**

- `apps/api/src/auth/auth-instance.ts:455` → `rateLimit: { enabled: false }`
- `apps/api/src/auth/auth-instance.ts:36-40` → "gerçek politika S8'in Redis tabanlı guard'ındadır" beyanı
- `apps/api/src/auth/rate-limit/rate-limit.policy.ts:76-96` → `RATE_LIMITED_ROUTES`, **4** rota
- `apps/api/src/auth/rate-limit/rate-limit.guard.ts:166-168` → `policy === undefined` → `return true` (listelenmeyen rota için **fail-open**)
- `better-auth@1.7.14` `dist/plugins/two-factor/index.mjs` (dosya sonu) → eklentinin KENDİ kuralı: `pathMatcher: path.startsWith('/two-factor/')`, `window: 10, max: 3`
- `better-auth@1.7.14` `dist/plugins/two-factor/totp/index.mjs:137-142, 158-166` → `assertTwoFactorNotLocked` / `beginAttempt(5)` / `recordTwoFactorFailure` üçü de `isSignIn` ile KOŞULLU

**Ölçüm (kaynak seviyesi, deterministik — canlı HTTP ölçümü değil):**

1. `grep -c "buildPolicy(" rate-limit.policy.ts` → **5** (1 tanım + 4 çağrı).
2. `grep -rn "two-factor" apps/api/src/auth/rate-limit/` → **sıfır eşleşme**.
3. `resolveRateLimitPolicy` düz `Map.get("<METOD> <yol>")`'tür — önek/regex geri düşüşü YOK.
4. `rateLimit: { enabled: false }` eklentinin `rateLimit` kuralını da devre dışı bırakır
   (Better Auth plugin kuralları yalnızca oran sınırlama AÇIKKEN değerlendirilir).

**Sömürü senaryosu (somut):** Saldırgan kurbanın **canlı oturum çerezini** ele geçirir
(kiosk/paylaşılan makine, açık bırakılmış tarayıcı, çerez hırsızlığı) ama **parolayı
bilmez**. Şunu döngüye sokar:

```
POST /auth/two-factor/disable     Cookie: better-auth.session_token=<kurbanın>
Body: {"password":"<tahmin>"}
```

- Yanlış tahmin → `400 INVALID_PASSWORD` (`better-auth` `utils/password.mjs` →
  `validatePassword`). **429 YOK, Retry-After YOK, kilit YOK, sayaç YOK.**
- Doğru tahmin → 2FA **silinir** (`two_factor` satırı `delete`), `app_user.two_factor_enabled`
  `false` olur, **yeni oturum** kurulur.

Elde edilen: (a) **açık metin parola** → kimlik bilgisi tekrar kullanımı ve oturum iptal
edilse bile kalıcı erişim; (b) bu sürümün ürettiği owner-2FA zorlamasının (403
`TWO_FACTOR_REQUIRED`) **tamamen kaldırılması**; (c) `/auth/two-factor/generate-backup-codes`
ile kurbanın yedek kodlarının sessizce **rotasyonu** (kurbanın elindeki kodlar ölür).
Aynı oracle `/auth/two-factor/enable` ve `/auth/two-factor/get-totp-uri` için de geçerli
(üçü de `validatePassword`/`checkPassword` çağırır).

**İkinci yarı — reklam edilen kilit, oturum yolunda HİÇ ÇALIŞMIYOR:**
`totp/index.mjs`'de `isSignIn = !session.session`. Çağıran bir oturum taşıyorsa
`assertTwoFactorNotLocked` **çağrılmaz**, `beginAttempt(5)` **çağrılmaz** (`attempt = null`),
`recordTwoFactorFailure` **çağrılmaz**. Yani `/auth/two-factor/verify-totp`'in
**kurulum-onayı yolunda** ne "challenge başına 5" ne "hesap başına 10/900" eşiği vardır;
sınırsız 6 haneli kod denemesi mümkündür ve `rateLimit: false` nedeniyle üstünde başka bir
sınır da yoktur. (Giriş yolunda — challenge çerezi ile — her iki eşik GEÇERLİ; orada
brute-force 15 dakikada ~10 denemeye iner, bu kısım sağlıklı.)

**Önerilen düzeltme:** Altı yolu `RATE_LIMITED_ROUTES`'a ekle. ⚠ Mevcut hesap kapsamı
`extractAccountScopeValue` ile `body.email`'den okunuyor (`rate-limit.guard.ts:111-117`);
bu uçlar e-posta TAŞIMAZ → kapsam anahtarının **oturumdaki `userId`'den** türetilmesi
gerekir (yeni bir `RateLimitWindowKind`/scope çözücü). Asgari ara çözüm: Better Auth'un
kendi `/two-factor/*` kuralını yeniden etkinleştirmek (o zaman "iki koordinesiz eşik"
yasağı — `auth-instance.ts:36-40` — ADR'de yeniden değerlendirilmeli).
**Sorumlu ajan:** `backend` (kapsam anahtarı kararı için `architect`).

---

### F2 · `medium` · 2FA yaşam döngüsünün en kritik olayı (`disable`) hiç kaydedilmiyor; üstüne YANILTICI "giriş başarılı" olayı yazılıyor

**Dosyalar:**

- `apps/api/src/auth/auth-instance.ts:303-304` → kanca yalnızca `TWO_FACTOR_ENABLE_PATH`
  ve `TWO_FACTOR_VERIFY_TOTP_PATH`'i tanır
- `apps/api/src/auth/auth-instance.ts:556-573` → `databaseHooks.session.create.after` →
  **koşulsuz** `'giriş başarılı'`
- `better-auth` `plugins/two-factor/index.mjs` → `disableTwoFactor` gövdesi:
  `updateUser({twoFactorEnabled:false})` → `adapter.delete(twoFactor)` →
  `internalAdapter.createSession(...)` → `deleteSession(eski)`

**Ölçüm:** `createTwoFactorEventHook` yalnızca iki yol için dallanıyor (kaynak okuması).
`disable` ve `generate-backup-codes` için **hiçbir** 2FA olay logu yok. `audit_log` tarafında
da yalnızca `tenant_security_policy_changed` eylemi eklendi — kullanıcı seviyesi 2FA
değişiklikleri için **hiç** denetim eylemi yok (`AUDIT_SUBJECT_FIELD_BY_ACTION` beş üye,
hiçbiri 2FA yaşam döngüsü değil).

**Sömürü/başarısızlık senaryosu (somut):** F1'in senaryosu (ya da yalnızca parolayı bilen
bir saldırgan) kurbanın 2FA'sını kapatır. Günlüklerde oluşan **tek** iz şudur:

```
{"msg":"giriş başarılı","userId":"usr_…","sessionId":"ses_…"}
{"msg":"oturum sonlandırıldı","userId":"usr_…","sessionId":"ses_…"}
```

Olay müdahalesi yapan kişi bunu **normal bir yeniden giriş** olarak okur. "İkinci faktör
kaldırıldı" bilgisi hiçbir yerde yoktur; kurbanın hesabından 2FA'nın ne zaman, hangi IP'den
kaldırıldığı **kanıtlanamaz**. Aynı yanlış etiketleme kurulum onayında (`verify-totp`
`verified:false→true` dalı) ve `enable(method:'otp')` dalında da üretilir — ikisi de
`createSession` çağırır.

**Önerilen düzeltme:** (1) `createTwoFactorEventHook`'a `/two-factor/disable` ve
`/two-factor/generate-backup-codes` dalları; (2) `session.create.after`'ı
`'giriş başarılı'` yerine yola duyarlı hale getirmek (ya da mesajı "oturum kuruldu"ya
genelleştirip giriş olayını yalnızca `/sign-in/*` yolunda yazmak); (3) `audit_action`'a
kullanıcı seviyesi 2FA eylemleri eklemek v0.0.15.1 borcu olarak ROADMAP'e.
**Sorumlu ajan:** `backend` (2 ve 3 için `architect` kararı).

---

### F3 · `low` · `two_factor.verified` veritabanı varsayılanı `true` — fail-open

`packages/db/prisma/migrations/20261106073351_two_factor_and_security_policy/migration.sql:66`
· `packages/db/prisma/schema.prisma:307`

`verified` bir satırın **giriş faktörü olarak kullanılabilir** olmasını belirler
(`index.mjs`: `if (userTotpSecret && userTotpSecret.verified !== false) twoFactorMethods.push('totp')`;
`totp/index.mjs:137`). Bugün sömürülebilir **değil** — tek yazıcı Better Auth ve o alanı
her zaman AÇIKÇA yazıyor (`verified: !!options?.skipVerificationOnEnable` → bizde `false`).
Varsayılan yine de ters yönde: alanı göndermeyen herhangi bir gelecek yazıcı (seed, veri
taşıma, operatör aracı, kütüphane sürümü) **doğrulanmamış ama güvenilen** bir ikinci faktör
üretir. Kütüphanenin kendi şema beyanıyla (`schema.mjs`, `defaultValue: true`) birebir
olduğu için bilinçli bir hizalama; `low` ve borç olarak kayda geçer.
**Borç satırı:** `low` · `migration.sql:66` + `schema.prisma:307` — `verified` DEFAULT'u
fail-open; tek yazıcı alanı açıkça yazdığı için `false`'a çevirmenin davranışsal maliyeti
yok. **Sorumlu:** `db` · **Vade:** sonraki `two_factor` şema dokunuşu.

### F4 · `low` · `auth-path-sets.test.ts` BEŞİNCİ bloğunun "ayrıklık" iddiası totolojik (hiçbir girdiyle kırılamaz)

`apps/api/src/__tests__/auth-path-sets.test.ts` — BEŞİNCİ blok, "iki sınıf AYRIKTIR" testi.
`identityNotRequiredPaths` zaten `delegatedPaths.filter(p => !IDENTITY_REQUIRED.has(p))`
olarak **türetiliyor**; dolayısıyla kesişim her girdi için zorunlu olarak `[]`'dir. Gündem
kalemi ② ile aynı sınıf: kural, eksikliği yakalamak yerine **atlıyor**. Gerçek güvence
DÖRDÜNCÜ bloğun küme eşitliğinden (`expect(exemptAuthPaths).toEqual(identityNotRequiredDelegatedPaths)`)
ve BEŞİNCİ bloğun alt-küme/birleşim testlerinden geliyor — ikisi de **totolojik değil**, bu
yüzden `medium` değil `low`.
**Borç satırı:** `low` · `auth-path-sets.test.ts` BEŞİNCİ blok — totolojik assert kaldırılsın
veya `AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`'in ham hâli ile `AUTH_EXEMPT_PATHS` arasında
kurulsun. **Sorumlu:** `qa` · **Vade:** v0.0.16.

### F5 · `low` · `scripts/guards.sh` — üç hijyen kusuru (yerel araç, üretim yüzeyi değil)

`scripts/guards.sh:68,80,81` → üç `mktemp` dosyası **hiç silinmiyor** (`trap` yok) → her
koşumda /tmp'de üç dosya birikir.
`scripts/guards.sh:107-115` → `.github/workflows` ve `.github/actions` ikisi de yoksa
`target_array` boş kalır ve `grep -nFf "$pattern_file"` **dosya argümanı olmadan** çağrılır
→ grep **stdin'i okumaya başlar** (etkileşimsiz koşumda askıda kalma).
`scripts/guards.sh:200` → bu kontrolün kendi metni yasak tetikleyici jetonlarını
(`pull_request` vb.) **bitişik** yazıyor; kardeş kontrol (`check_run_block_template_expression:148-150`)
aynı disiplin için needle'ını bilerek ikiye bölüyor. Bugün yanlış pozitif üretmiyor (AC13'ün
tarama hedefi yalnızca `*.yml`/`*.yaml`), ama hedef kümesi `scripts/**`'e genişletilirse
kontrol kendisini yakalar — AGENT_BASELINE §5 literal-jeton kuralının tam olarak uyardığı desen.
**Enjeksiyon/`eval`/`rm -rf`/güvenilmeyen girdi:** YOK — tüm girdiler repo dosyası, desenler
`grep -F` (sabit dize), hiçbir yerde `eval` yok, silme işlemi yok.
**Sorumlu:** `devops` · **Vade:** v0.0.16.

### F6 · `low` · `panel-config.ts` — altı yolun DÖRDÜNCÜ/BEŞİNCİ elle yazılmış aynası, hiçbir mekanik kontrolü yok

`apps/admin/src/app/panel-config.ts` (yeni altı sabit) `apps/api/src/auth/auth-delegated-paths.ts`'in
paket sınırı ötesindeki birebir kopyasıdır. `apps/admin` `apps/api`'ye bağımlı değildir
(ve olmamalı), bu yüzden iki liste arasında **hiçbir** derleme/test kontrolü yok. API yolu
değişirse panel sessizce 404 alır (fail-closed delege → `NotFoundException`). Güvenlik
etkisi yok (açılma değil, kapanma), bu yüzden `low`.
**Sorumlu:** `frontend`/`devops` · **Vade:** v0.0.16 (sözleşme snapshot'ı ya da paylaşılan
yol sabiti paketi).

### F7 · `low` · `AUTH_SECRET_BEARING_TABLES`'tan düşme HÂLÂ hem zorlamada hem tespitte sessiz (gündem ②'nin DB ekseni — yeniden ölçüldü, kapanmadı)

`packages/db/src/catalog-lint.ts:816-842` (`lintAppRoleSecretTablePrivileges`) ve
`:869-930` (`lintAuthRoleSecretTableColumnPrivileges`) **ikisi de** `authSecretBearingTables`
dizisinin ÜZERİNDE dönüyor → listede olmayan bir tabloyu **atlıyor**, bulgu üretmiyor.
Zorlama tarafı da aynı listenin elle yazılmış SQL aynasıdır
(`packages/db/sql/bootstrap-roles.sql:291`, `rollback-auth-role.sql:70`) → bir gelecek sır
taşıyan tablo listeye eklenmezse `arkesoft_app`'in `ALTER DEFAULT PRIVILEGES`'ten gelen
SELECT'i **REVOKE edilmez** ve linter **sıfır** bulgu verir.
**Ölçülen azaltıcı (S3'ün raporunda yok):** ters yön KAPALI —
`lintAuthRoleUnexpectedTablePrivileges` (`catalog-lint.ts:1000+`) **katalog güdümlüdür**
(`snapshot.privileges`), beklenti listesinde yer almayan bir tabloda `arkesoft_auth`'un DML
yetkisi varsa `AUTH_ROLE_EXCESS_TABLE_PRIVILEGE` düşer. `two_factor`'da `arkesoft_auth`
tablo `DELETE` taşıdığı için, bu sürüm tabloyu `AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`'a
eklemeyi **unutsaydı** kapı kırmızı olurdu. Yani iki liste arasındaki boşluk **tek yönlü**.
**Bu sürümün yüzeyinde aynı sınıftan YENİ bir boşluk YOK:** `two_factor` üç üretim listesine
de girdi ve `auth-secret-tables.pin.ts`'in dört yollu `Exclude<>` pini (yeni
`AuthSecretModelToTable` haritası) üç yeri birden düzenlemeye zorluyor.
**Kalan kök boşluk:** hiçbir kural listeyi **şemadan türetmiyor** — "şemada sır taşıyan bir
kolon var ama tablo listede yok" sorusunu soran bir kontrol yok.
**Sorumlu:** `db` · **Vade:** v0.0.16.

### F8 · `low` · `ACCOUNT_TEMPORARILY_LOCKED` 429'u `Retry-After` taşımıyor → panelin geri sayımı ölü yol; hata sınıfının üretim çağıranı yok

`better-auth` `verify-two-factor.mjs:130-133` → `APIError.from("TOO_MANY_REQUESTS", …)`,
**header eklemiyor**. `AuthController.forwardBetterAuthResponse` yanıtı olduğu gibi iletir
(`account-temporarily-locked.error.ts` dosya başı yorumunun kendi beyanı).
`apps/admin/src/api/two-factor-rest.ts:39-48` (`parseRetryAfterSeconds`) → başlık yok →
`null`. Ayrıca `apps/api/src/errors/domain/account-temporarily-locked.error.ts`'in
**hiçbir üretim çağıranı yok** (kendi yorumu da bunu söylüyor) — `httpHeaders: {'Retry-After'}`
hiç yazılmıyor. Güvenlik etkisi yok; `qa`/`ux` yüzeyinde "kalan süre gösterilemez".
**Sorumlu:** `qa` (ölçüm), `backend` (ikinci kararsa). **Vade:** v0.0.16.

---

## ÜÇ GÜNDEM KALEMİ — açık karar

### ① S7'nin iki transaction sapması → `low` (borç), `medium` DEĞİL

**Baktım, şu sonuca vardım:** kabul edilebilir, borç olarak kalır.

- **CLAUDE.md §10 md 18 TETİKLENMİYOR:** o madde *süper admin* işlemlerini kapsar.
  `tenant.updateSecurityPolicy` bir **kiracı owner'ı** işlemidir; süper admin yüzeyine
  dokunulmadı (`apps/superadmin` diff'i boş).
- **Denetim kaydı EKSİK DEĞİL, ATOMİK DEĞİL.** `tenant-security.service.ts:92-106` —
  no-op olmayan her yolda `writeAuditLog` çağrılıyor; `catch` yok, hata yutulmuyor
  (§10 md 16 sağlanıyor). Audit yazması patlarsa istek 500 döner (politika değişmiş olur) —
  tutarsızlık, veri sızıntısı/yetki atlatma değil.
- **Sıra doğru seçilmiş.** "Değişti ama izi yok" riski ile "hiç olmayanın izi" riski
  arasında ikincisi daha zararlıdır (denetim izinin kendisi yanlış olur). S7'nin gerekçesi
  teknik olarak doğru.
- **Mekanik kısıt gerçek, doğruladım:** `packages/db/src/client.ts` →
  `TenantTransactionClient = Pick<TransactionClient, 'tenantMembership'|'job'|'auditLog'|'tenantInvitation'>`
  — `tenant` delegesi yok, tek `$transaction`'a sığdırmak derlenmez.
- **Kayıp penceresi:** iki DB gidiş-dönüşü arası (~ms) + süreç çökmesi gerekir. Somut bir
  saldırgan senaryosu kuramıyorum (saldırgan yazma anında süreci düşüremez).
  AGENT_BASELINE §4 "emin değilsen bir alt seviye" → `low`.
  **Borç satırı:** `low` · `apps/api/src/tenant/tenant-security.service.ts:92-106` —
  politika yazması ve denetim kaydı iki ayrı transaction; çözüm `TenantTransactionClient`'a
  `tenant` delegesi eklemek (`packages/db`). **Sorumlu:** `db` + `backend` ·
  **Vade:** ADR-0018 gözden geçirme penceresi / v0.0.16.

### ② Vacuity boşluğu → iki eksende incelendi; DB ekseninde YENİ boşluk yok, test ekseninde BİR yeni totoloji var

**Baktım, şu sonuca vardım:** F7 (DB ekseni, tek yönlü, pre-existing, `low`) + **F4 (yeni,
bu sürümün eklediği totolojik assert, `low`)**. S3'ün ölçtüğü boşluk doğru ama **yarım**:
ters yön (`AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`'tan düşme) katalog güdümlü catch-all
tarafından KAPALI — bunu `lintAuthRoleUnexpectedTablePrivileges`'in `snapshot.privileges`
üzerinden döndüğünü okuyarak ölçtüm. T-015'te çıkardığım beş bulgunun ikisi düzeltmelerin
kendi ürettiği boşluklardı; bu turda aynı desenin **bir** tekrarını buldum (F4) ve o da
düzeltmenin kendisinin (S5'in partition testinin) ürettiği bir boşluktur.

### ③ Dördüncü ayna → VAR, iki tane; biri korumalı biri korumasız

**Baktım, şu sonuca vardım:**

- **Korumalı (yeni, DB ekseni):** `packages/db/src/__tests__/type-pins/auth-secret-tables.pin.ts`'in
  `AuthSecretModelToTable` haritası (satır 49-54) **dördüncü** elle yazılmış aynadır — ama
  dört yollu iki yönlü `Exclude<>` ile iki üretim sabitine bağlı, yani sapma `pnpm typecheck`te
  patlar. **Kusur değil, doğru çözüm.**
- **Korumasız (yeni, yol ekseni):** `apps/admin/src/app/panel-config.ts`'in altı yol sabiti
  → **F6**. Hiçbir derleme/test kontrolü yok, paket sınırını geçiyor.
- **SQL eksenindeki ikisi (`bootstrap-roles.sql:291`, `rollback-auth-role.sql:70`) hâlâ
  türetilmiyor** → F7'nin zorlama yarısı.

---

## ON DENETİM BAŞLIĞI

| # | Başlık | Sonuç |
| - | ------ | ----- |
| 1 | **Sır yönetimi** | **Bulgu yok.** `grep -rn "localStorage\|console\.\|dangerouslySetInnerHTML\|innerHTML\|document.cookie" apps/admin/src packages/ui/src` → tek eşleşme bir **yorum** satırı (`two-factor-rest.ts:12`). `sessionStorage`'da saklanan tek şey `arkesoft.account.twoFactorEnabled` = `'true'`/`'false'` — **sır değil, durum bayrağı** (`two-factor-status-store.ts:28-60`, tek anahtar, tek değer kümesi). `totpURI`/`backupCodes` yalnızca React state'te ve ekranda; **üçüncü taraf QR servisine gönderilmiyor** (`TwoFactorSetupWizard.tsx` grep: `img`/`src=`/`http` → sıfır; URI düz metin gösteriliyor). `code`'un `PINO_REDACT_PATHS`'e eklenmemesi **doğru karar** — `AppError.code` tüm teşhis zincirinin dayanağı; girilen TOTP kodu log nesnesine **hiç konmuyor** (`createTwoFactorEventHook` yalnızca `errorCode` ve `userId` yazıyor), yani redaction'a değil **yapıya** güveniliyor. |
| 2 | **Yetkilendirme atlatma** | **Bulgu yok (F1 hariç).** `security:write` yalnızca `owner`'da (`permissions.ts:84`), `permissionProcedure` rolü **üyelik tablosundan** okuyor (`permission-procedure.ts:42`), girdiden değil → atlatılamaz. `AuthGuard`'ın 403 kapısı yalnızca `tenant.kind === 'resolved'` + `role === owner` dalında; muafiyetler **over-exemption üretmiyor** → ölçüldü: `isAuthExemptPath`'in tek tüketicisi `auth-context.middleware.ts:53`, `isTenantExemptPath`'in tek tüketicisi `tenant-context.middleware.ts:40`; oran sınırlama guard'ı bu kümelerden **bağımsız** kendi rota haritasını okuyor. DÖRDÜNCÜ partition testi (`auth-path-sets.test.ts`) `AUTH_EXEMPT_PATHS ∩ /auth/*` ile `AUTH_DELEGATED_PATHS \ IDENTITY_REQUIRED`'ı **küme eşitliğiyle** sabitliyor → kümeye gerekçesiz ekleme mekanik olarak kırılıyor. Rol manipülasyonuyla politikayı aşma yolu **kapalı**: INV-OWNER + `OwnerMembershipProtectedError` (`member.service.ts:409,464,524`) → `admin` owner'ı indiremez/çıkaramaz, `invitableRoleSchema` `owner`'ı tip düzeyinde dışlıyor. |
| 3 | **Kiracı veri sızıntısı** | **Bulgu yok.** §7 madde madde aşağıda. `two_factor` platform seviyesi ve doğru sınıflandırılmış (`PLATFORM_LEVEL_TABLES` 6 üye); `migration-set` linter'ının `UNCLASSIFIED_TABLE` kuralı sınıflandırmayı **zorunlu** kılıyor. `requireTwoFactorForOwner` `tenant` tablosunda (kiracının kendisi). Çapraz kiracı okuma/yazma yolu yok: `tenantId` **hiçbir** yeni girdi şemasında yok (`tenant-security.schema.ts`), `ctx.tenant.tenantId`'den geliyor. Hata mesajı varlık sızdırmıyor: `TenantNotFoundError` (404) tek dal, `tenantId` saldırgan tarafından verilemediği için oracle **oluşmuyor**. |
| 4 | **Kullanıcı mahremiyeti (AC10a)** | **İddia DOĞRU, kanıtı denetledim.** `tenant-security.service.ts`'in TÜM gövdesini okudum: yalnızca `db.tenant.findFirst({where:{id,deletedAt:null}})` ve `db.user.findUnique({where:{id: actorUserId}})`. **Başka kullanıcı sorgusu yok.** S11'in Proxy kanıtı **gerçek**: `two-factor-acceptance-ac10a-*.test.ts:62-85` `createAllowlistedDelegate` ile `db.tenant`'ta yalnızca `findFirst`, `db.user`'da yalnızca `findUnique` çağrılabiliyor; `findMany` dahil her şey **fırlatıyor** — "mock çağrılmadı" ummak değil, çağrılırsa patlatmak. Ek ölçüm: `grep -rn "twoFactor" packages/trpc/src` (testler hariç) → başka kullanıcının `twoFactorEnabled`'ını dönen **hiçbir** prosedür/şema yok. ⚠ Not: INV-OWNER (her kiracıda **tam olarak bir** owner) nedeniyle "başka owner" sorgusu zaten anlamsız olurdu; testin davranışsal yarısı API'den ulaşılamayan bir duruma (iki owner) dayanıyor — yapısal yarı asıl kanıt. |
| 5 | **Hesap kilitleme** | **F1'in ikinci yarısı.** İki eşik **koordinesiz değil, hiyerarşik**: `beginAttempt(5)` challenge başına (verification tablosunda `2fa-attempts-<id>`), `recordTwoFactorFailure` hesap başına 10/900 (`two_factor.failed_verification_count`/`locked_until`, **atomik** `incrementOne`). İkisi farklı kapsamda olduğu için `auth-instance.ts:36-40`'ın reddettiği "aynı kapsamda iki koordinesiz eşik" durumu **değil**. ⚠ Ama ikisi de `isSignIn` ile koşullu → oturum yolunda **hiç eşik yok** (F1). **DoS değil:** `verify-totp`'e ulaşmak ya challenge çerezi (parola doğrulanmış) ya oturum gerektirir; saldırgan parolayı bilmeden başkasının hesabını kilitleyemez. Parolayı bilen saldırganın kilitleyebilmesi NIST SP 800-63B §5.2.2 ile uyumlu, tasarlanmış davranış. |
| 6 | **Yeni bağımlılık** | **Bulgu yok.** `@radix-ui/react-dialog@1.3.1` (`pnpm-workspace.yaml:279-285`, kullanıcı onayı ④ kayıtlı). `pnpm audit` → bu paket veya geçişlileri için **sıfır** advisory. Geçişli yüzey tamamı birinci parti Radix primitifi (`primitive`, `compose-refs`, `context`, `dismissable-layer`, `focus-guards`, `focus-scope`, `id`, `portal`, `presence`, `primitive`, `slot`, `use-controllable-state`, `use-layout-effect`) + `react-remove-scroll`/`aria-hidden` sınıfı — mevcut `@radix-ui/react-dropdown-menu@2.2.1` emsaliyle örtüşüyor, **yeni satıcı yok**. |
| 7 | **Yeni shell script** | **F5** (üç `low` hijyen kusuru). Enjeksiyon/`eval`/`rm -rf`/güvenilmeyen girdi: **yok**. |
| 8 | **`db:*` zincirlemesi** | **Bulgu yok.** `db:reset` = `pnpm --filter @arkesoft/db run reset && pnpm db:bootstrap`; `reset` = `node dist/run-guarded-prisma.js migrate reset` ve guard reddettiğinde `process.exit(1)` (`run-guarded-prisma.ts:100`) → `&&` kısa devre yapar, `db:bootstrap` **koşmaz**. Guard `ARKESOFT_CONFIRM_DESTRUCTIVE`'i kendi içinde okuyor (`:235`) ve zincirleme bu okumayı **değiştirmiyor**. Zincirleme yalnızca "migration sonrası bootstrap unutuldu" (K-A6) sınıfını kapatıyor; yıkıcılık kapısını **zayıflatmıyor**. (Komutu koşturmadım — kaynak okumasıyla ölçtüm, kısıt gereği.) |
| 9 | **TOTP implementasyonu** | **Bulgu yok — ama kapsamı netleştirmek gerek.** `totp-code-generator.port.ts` bir **kod ÜRETİCİSİDİR, doğrulayıcı değildir**; üretimde hiçbir kimlik doğrulama kararı vermez (tek tüketicisi testler; `grep` ile doğruladım: `apps/api/src` içinde üretim çağıranı yok). Dolayısıyla **sabit zamanlı karşılaştırma** ve **drift penceresi** bu dosyanın sorunu değil — ikisi de `@better-auth/utils/otp`'nin `verify()`'ında. Kütüphane kaynağını okudum: `createOTP(secret,{period,digits}).verify(code)` → pencere kaydırma **yok** (yalnızca o anki pencere; drift toleransı 0 → brute-force yüzeyi **genişletilmemiş**). Sır üretimi `generateRandomString(32)` (Better Auth'un `crypto/random.mjs`'i, CSPRNG) ve diskte `symmetricEncrypt` (anahtar `BETTER_AUTH_SECRET`) ile şifreli — migration yorumu bunu doğru beyan ediyor. Port'un kendi HMAC'ı `node:crypto`'nun `createHmac('sha1')`'i; Base32 çözümü dolgu/boşluk/tire temizliğiyle RFC 4648 §6'ya uygun. `DOĞRULANAMADI:` `verify()`'ın karşılaştırmasının sabit zamanlı olup olmadığını satır satım okumadım — ancak üretimde kod **kullanıcıdan** gelip **sunucudaki** sırla karşılaştırıldığı ve yanıt tek bitlik (`INVALID_CODE`) olduğu için zamanlama kanalı 6 haneli uzayda sömürülebilir bir avantaj vermez; bulgu olarak **saymıyorum**. |
| 10 | **Bağımlılık + repoya sır** | **Bulgu yok.** 51 yeni dosyanın tamamını taradım (`password|secret|api_key|token|BEGIN … PRIVATE KEY` + atama deseni). Tüm eşleşmeler `apps/api/src/__tests__/` içindeki **test fixture parolaları** (`arkesoft-ac1-setup-flow-password-123` vb.) ve Base32 test vektörleri (`GEZDGNBVGY3TQOJQ`, RFC 4226 referans sırrı). **Yeni gerçek sır yok.** `arkesoft_auth_dev_only` sınıfı literaller kabul edilmiş olarak sayılmadı. |

---

## CLAUDE.md §7 — madde madde

| Madde | Durum |
| ----- | ----- |
| 1 `tenant_id` NOT NULL | **N/A — gerekçeli.** `two_factor` platform seviyesi (ikinci faktör kullanıcıya ait, kiracıya değil); `PLATFORM_LEVEL_TABLES` 5→6. `tenant.require_two_factor_for_owner` kiracının **kendi** tablosunda. |
| 2 RLS + politika | **N/A — gerekçeli.** Platform tablosu, `TENANT_SCOPED_TABLES` 4'te kaldı. Sınıflandırma **zorunlu**: `migration-set.ts:572` `UNCLASSIFIED_TABLE`. |
| 3 `(tenant_id, …)` bileşik indeks | **N/A.** `user_id` UNIQUE + FK CASCADE. |
| 4 `tenantProcedure`/`permissionProcedure` | ✔ `tenant.updateSecurityPolicy` = `permissionProcedure('security:write')`, `PROCEDURE_SURFACE` onuncu kayıt. `publicProcedure` **yok**. |
| 5 `withTenant()` | ✔ denetim kaydı `withTenant(tenantId, …)`. Ham `prisma.db` kullanımı yalnızca **platform** tablolarında (`tenant`, `app_user`) ve **üçünde de gerekçe yorumu yazılı** (`tenant-security.service.ts:64-66`, `:122-126`, `two-factor-compliance.service.ts:64-70`) — CLAUDE.md §3'ün izin verdiği hâl. |
| 6 Girdideki `id`'ye güvenme | ✔ `tenantSecurityPolicyUpdateInputSchema` tek alan: `requireTwoFactorForOwner: z.boolean()`. `tenantId` **yok ve eklenemez** (şema dosyasının kendi beyanı); `actorUserId` `ctx.auth.userId`'den. |
| 7 Kuyruk işi `tenantId` | **N/A** — yeni kuyruk işi yok. |
| 8 Dış kaynak kapsamı | **N/A** — Meilisearch/S3/önbellek yüzeyi eklenmedi. |
| 9 Önbellek anahtarı | ✔ yeni önbellek yok; `AuthGuard` bilinçli önbelleksiz. |
| 10 Dosya yolu öneki | **N/A** — dosya yüzeyi yok. |
| 11 `createTenantIsolationSuite()` | **N/A** — yeni kiracıya bağlı tablo yok (prob yazılmaması doğru). |
| 12 Hata varlık sızdırmıyor | ✔ `TenantNotFoundError` (404) tek dal; `tenantId` host çözümünden geldiği için oracle oluşmuyor. `TwoFactorSetupRequiredError` (409) başka kullanıcı bilgisi **taşımıyor**. |
| 13 Log'da `tenantId` | ✔ child logger; servisler ikinci kez geçirmiyor (tekrar önleme). |
| 14 Süper admin denetim kaydı | **N/A** — süper admin yüzeyine dokunulmadı. |
| 15 `SECURITY DEFINER` yok | ✔ ölçüldü: migration'da `grep -ci "security definer"` → **0**. |
| 16 `public` dışı şema yok | ✔ ölçüldü: `grep -ci "create schema"` → **0**; `create view/matview/trigger/rule/function` → **0**; `GRANT` → yalnızca **yorum** satırı. |

**Karşılanmayan madde numarası: YOK.** F1 ve F2 §7'nin dışında (§4 log disiplini + oran
sınırlama kapsamı).

---

## ÖLÇÜMLER

- **`pnpm audit`:** `0 critical · 1 high · 1 moderate · 0 low`
  - `high` — `multer` **>=2.0.0 <2.5.0**, GHSA-q7qp-rjg7-q26m (DoS), 4 yol, tamamı
    `@nestjs/platform-express` geçişlisi. **Bu sürüm getirmedi** (`pnpm-lock.yaml` diff'i
    yalnızca `@radix-ui/react-dialog` ve Radix geçişlilerini ekliyor) ve ROADMAP'te kayıtlı
    borç (satır 2043 A-A6, 2647, 2995 — `medium`, vade v0.0.16 multipart). Erişilemez:
    repoda multipart/yükleme rotası yok.
  - `moderate` — `minimatch` **<11.0.1**, GHSA-g3hv-75wg-m249, 63 yol, tamamı `eslint`
    devDependency'si. ROADMAP satır 2348'de kayıtlı `low` borç. **Bu sürüm getirmedi.**
  - **Bu sürümün eklediği YENİ advisory: 0.**
- **İncelenen dosya:** 48 repo dosyası (yeni + diff'li üretim kodu, SQL, migration, shell,
  package manifest'leri, 4 kritik test dosyası) + **5** `better-auth@1.7.14` kaynak dosyası
  (`plugins/two-factor/{index,totp/index,verify-two-factor,schema}.mjs`, `utils/password.mjs`)
  + `api/routes/session.mjs` (middleware okuması).
- **Tenant izolasyon listesinden karşılanmayan madde: YOK** (16 maddenin 16'sı ✔ veya
  gerekçeli N/A).
- **Yeni dosyada sır:** 0 (51 yeni dosyanın tamamı tarandı).
- **Oran sınırlı rota:** 4/10 (`sign-in/email`, `request-password-reset`, `sign-up/email`,
  `send-verification-email`) — altı yeni 2FA ucu **0/6**.
- **Koşturulan komut:** `pnpm audit` · `git status --porcelain` · `git diff` · `grep`/`find`
  (salt okuma). **Koşturulmayan:** Playwright, `build`, dev sunucusu, `db:*`, Redis yazma.
- **Dosya değişikliği:** `git status --porcelain` → bu rapor dosyası dışında **0** yeni/değişen
  dosya; mevcut 106 değişiklik S1–S13'ün, dokunulmadı.

## FAIL gerekçesi

AGENT_BASELINE §4: **1 `high` → FAIL** (F1). Ayrıca 1 `medium` (F2) ve 6 `low`.
`medium` sayısı 3'ün altında olduğu için FAIL kararı tek başına F1'e dayanıyor.
Düzeltme turu açılacak bulgular: **F1 (high), F2 (medium)**. `low` bulgular için
düzeltme turu **koşturulmaz** — borç satırları yukarıda `docs` için hazır yazıldı.
