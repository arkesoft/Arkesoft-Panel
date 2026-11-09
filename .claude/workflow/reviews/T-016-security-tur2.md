# T-016 — `security` gate, tur 2 (TAM yeniden denetim)

- **Tarih:** 2026-11-09
- **Sürüm:** ROADMAP v0.0.15 (iki faktörlü kimlik doğrulama / TOTP + oturum güvenliği)
- **HEAD:** `6e90a6a` (commit atılmadı) · çalışma ağacı: 126 değişiklik
- **Koşturulmayanlar:** Playwright · `apps/admin` dev sunucusu · `turbo run build` ·
  `db:reset` · `db:rollback-roles` · `prisma migrate reset` / `db push --force-reset` ·
  Redis `FLUSHALL`/`FLUSHDB`/`CONFIG SET`
- **Dosya değişikliği:** YOK (bu rapor hariç) — aşağıda `git status --porcelain` ile kanıtlı

```
GATE: security
SONUÇ: PASS
```

**Gerekçe (AGENT_BASELINE §4, bağlayıcı):** `critical` 0 · `high` 0 · `medium` **1** ·
`low` 5. "1–2 `medium` → PASS, bulgular teknik borca kaydedilir." Tur 1'in `high`'ı
(F1) **ana senaryosunda tam olarak kapandı** ve ölçümle doğrulandı; kalan açık, F1'in
İKİNCİL telafisinin (oturum yolu hesap kapsamı) atlatılabilirliğidir → `medium`.

---

## 1. TUR 1'DE KAPATILAN DÖRT BULGU — ÖLÇÜMLE DOĞRULAMA

### F1 (`high`, oran sınırı) → **KAPANDI** (bağımsız ölçüm)

**Kendi koştuğum ölçüm:**

```
DATABASE_AUTH_URL=… pnpm --filter @arkesoft/api exec vitest run \
  src/__tests__/rate-limit.test.ts src/__tests__/rate-limit-policy.test.ts \
  src/__tests__/two-factor-scope-cookie.test.ts
→ Test Files 3 passed (3) · Tests 63 passed (63)
```

Koşumun canlı NDJSON izi, `verify-totp` **oturum yolunda** (kütüphane kilidinin
`isSignIn` nedeniyle HİÇ çalışmadığı dal) tam olarak beklenen davranışı gösterdi:

```
… statusCode:401  msg:"2FA doğrulaması başarısız"   (1)
… statusCode:401  msg:"2FA doğrulaması başarısız"   (2)
… statusCode:401  msg:"2FA doğrulaması başarısız"   (3)
… statusCode:401  msg:"2FA doğrulaması başarısız"   (4)
… statusCode:401  msg:"2FA doğrulaması başarısız"   (5)
… scope:"account" retryAfterSeconds:900 msg:"oran sınırı aşıldı"   (6)
… code:"RATE_LIMIT_EXCEEDED" context:{scope:"account",retryAfterSeconds:900}
```

**Kaynak seviyesi doğrulama:** `RATE_LIMITED_ROUTES` dört → **on** rota; altı
`/auth/two-factor/*` yolunun hepsi var (`rate-limit.policy.ts:174,182,190,198,208,216`).
Dört parola-oracle ucu (`enable`/`disable`/`get-totp-uri`/`generate-backup-codes`)
`accountScopeSource: 'sessionUserId'` → ALS'teki `auth.userId`, **girdiden/çerezden
türemiyor, zehirlenemez** (tur 1'in ASIL sömürü senaryosu — çalıntı oturum + parola
tahmin döngüsü — bu yüzden **tam kapandı**). `buildPolicy`'nin `AUTH_DELEGATED_PATHS`
doğrulaması korundu (yazım hatası modül yüklenirken fırlatıyor). Yeni env YOK, üçüncü
eşik ailesi YOK → `auth-instance.ts:36-40`'ın "iki koordinesiz eşik olmasın" kararı
korunmuş. ✔

### F2 (`medium`, denetim boşluğu + yanıltıcı olay) → **KAPANDI** (bağımsız ölçüm)

```
DATABASE_AUTH_URL=… pnpm --filter @arkesoft/api exec vitest run \
  src/__tests__/two-factor-plugin-live.test.ts \
  src/__tests__/session-me-two-factor-enabled.test.ts \
  src/__tests__/session-security-read-port-adapter.test.ts
→ Test Files 3 passed (3) · Tests 13 passed (13)
```

İçindeki pin (`two-factor-plugin-live.test.ts:564-574`) **tam çıktı** assert'i:
`relabeledEvents.length === 2` ve `loginEvents.length === 1` (`toContain` DEĞİL).
Kaynak doğrulaması: `createTwoFactorEventHook` artık `disable` için BAŞARI **ve**
BAŞARISIZLIK dalını (`'2FA devre dışı bırakıldı'` / `'2FA kapatma denemesi başarısız'`),
`generate-backup-codes` için ikisini (`'2FA yedek kodları yeniden üretildi'` /
`'…başarısız'`) logluyor; `session.create.after` `isNonLoginSessionCreation(hookContext)`
ile `'2FA değişikliği sonrası oturum yenilendi'` ↔ `'giriş başarılı'` ayrımını yapıyor
(`auth-instance.ts:709-711`). ⚠ Yedek kodların KENDİSİ (`returned.backupCodes`) log
nesnesine **hiç okunmuyor** — kaynakta açık yorumla doğruladım. backend'in ek olarak
ölçtüğü üçüncü yanlış etiket (`verify-totp`'un zaten-oturumlu dalı) de kapsanmış. ✔

### F3 (`low`, `verified` DEFAULT fail-open) → **KAPANDI** (canlı DB ölçümü)

```
docker exec arkesoft-postgres psql -U arkesoft -d arkesoft -tAc \
  "SELECT … FROM information_schema.columns WHERE table_name='two_factor' …"
→ verified | default=false | nullable=NO
```

Migration defteri temiz, geri alma yok:

```
20261109054748_two_factor_verified_default_false | applied=2026-11-09 05:48:47 | rolled_back=-
20261106073351_two_factor_and_security_policy    | applied=2026-11-06 07:33:51 | rolled_back=-
```

Eski migration'a dokunulmamış (ayrı dizin, ayrı dosya). ✔

### F5 (`low`, `guards.sh` üç kusur) → **ÜÇÜ DE KAPANDI** (kaynak okuması)

- **(a) geçici dosya sızıntısı:** `cleanup_tmp` her `return` noktasının ÖNÜNDE açıkça
  çağrılıyor — altı çıkış yolunun **hepsini** saydım (`guards.sh:128-131` + 5 `return`
  + son `return 0`). `trap … RETURN` BİLEREK kullanılmamış; gerekçesi ampirik ölçüm
  (trap, çağıran `run_step`'in dönüşünde tekrar ateşlenip `unbound variable` ile
  script'i çökertiyordu) — doğru karar.
- **(b) boş hedef kümesinde STDIN'de askıda kalma:** `fail_if_targets_empty` eklendi →
  **fail-closed, gürültülü hata**; `grep -nFf` artık dosya argümanı olmadan
  çağrılamıyor. Ayrıca hedef kümesi artık TEK yerde türetiliyor
  (`workflow_action_targets`), iki kontrol onu okuyor.
- **(c) AC8'in kendi metninde bitişik jeton:** üç tetikleyici jeton **değişken adları
  dahil** parçalı kuruluyor (`trig1_a='pull_requ'` + `trig1_b='est'` …). İlk düzeltme
  denemesinin değişken adları yüzünden yine eşleştiği devops'un kendi ölçümünde
  kayıtlı — bu, raporladığım sınıfın **beşinci** örneği ve doğru şekilde kapatılmış. ✔

---

## 2. BEŞ ÖZEL NOKTA — AÇIK KARAR

### ① `two-factor-scope-cookie.ts` — çerez ayrıştırma ve kapsam zehirlenmesi

**Kapsam zehirlenmesi / başkasını kilitleme DoS → MÜMKÜN DEĞİL.** Kapsam değeri
kurbanın KENDİ `two_factor`/`session_token` çerez değeridir; saldırgan onu kurbanın
kovasına yazmak için önce o değeri **bilmek** zorundadır — bildiği anda zaten oturumu
vardır. Çapraz hesap kilitleme yolu **yok**. ✔

**Ama ters yön AÇIK → bulgu S2-1 (`medium`, aşağıda).** Değer **ham** kullanılıyor
(imza/decode doğrulaması YOK — dosyanın kendi beyanı) ve **challenge çerezi
ÖNCELİKLİ**. Projenin kendi testi bunu ölçüyor (`two-factor-scope-cookie.test.ts:11-17`:
iki çerez de varken keyfi `challenge-abc` kazanıyor). Better Auth ise oturum varken
`two_factor` çerezine **hiç bakmıyor** (`verify-two-factor.mjs`: `getSessionFromCtx`
ÖNCE çağrılıp session dalı dönüyor). İki okuyucu AYNI istekte FARKLI değere bakıyor →
kapsam saldırgan tarafından seçilebilir.

**Ayrıştırıcının kendisi:** `parseCookieHeader` `;` ile ayırıyor, ilk `=`'den bölüyor,
trim ediyor, boş adı atlıyor, decode etmiyor (opak anahtar için doğru), uzunluk sınırı
yok (HTTP başlık sınırıyla zaten bağlı). `Map.set` → **aynı adlı son çerez kazanıyor**.
`DOĞRULANAMADI:` better-call/Better Auth'un aynı adlı çerezde İLK mi SON mu aldığını
satır satır okumadım — bu yüzden "ÖN-GİRİŞ yolunda ayrıştırıcı farkıyla atlatma"
varyantını **bulgu saymıyorum** (ve o yolda kütüphanenin kendi 10/900 kilidi zaten
bağlayıcı). S2-1 **yalnızca** ayrıştırıcı farkı GEREKTİRMEYEN oturum-yolu varyantına
dayanıyor. `NODE_ENV` türetmesi (`__Secure-` öneki) `useSecureCookies` ile aynı
kaynaktan — tutarlı, doğru. ✔

### ② `session.me`'nin yeni alanı — yalnızca KENDİ durumu mu?

**Evet, yapısal olarak.** `session.router.ts`: resolver `ctx.ports.sessionSecurityRead
.isTwoFactorEnabled(ctx.auth.userId)` çağırıyor — `userId` **ALS'teki oturumdan**,
`session.me` **hiç `.input()` almıyor** (girdi şeması YOK → başka bir id geçirmenin
YOLU YOK). Adaptör (`session-security-read.port.adapter.ts`) tam o değerle
`user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } })`
okuyor. Tur 1'de ölçtüğüm özellik — "başka kullanıcının `twoFactorEnabled`'ını dönen
prosedür yok" — **korunuyor**: yeni alan da yalnızca çağıranın kendi bayrağı.
Çıktı şeması tam üç alana sabitlenmiş (`userId`/`sessionId`/`twoFactorEnabled`) →
`token`/`password`/`hash`/`secret` yapısal olarak giremez. Kiracı politikası
(`requireTwoFactorForOwner`) bu alana BİLEREK girmemiş — kullanıcı seviyesi bayrak,
kiracı verisi değil. **Bulgu yok.** ✔
(Not: `session.me` artık istek başına bir DB okuması yapıyor — `perf`'in alanı,
güvenlik bulgusu değil; `allowBatching: false` nedeniyle istek başına 1 ile sınırlı.)

### ③ `ci.yml` değişikliği — kapı gevşetildi mi?

**Gevşetilmedi; tam eşdeğer.** Satır satır karşılaştırdım:

- awk programı `scripts/check-run-block-template-expression.sh`'e **birebir** taşınmış
  (aynı `BEGIN`, aynı `in_run`/`run_indent` mantığı, aynı üç `index(line, needle)`
  dalı, aynı `END { exit (bad ? 1 : 0) }`).
- **Exit kodu korunuyor:** script'in SON komutu awk → script'in çıkış kodu awk'ın
  çıkış kodudur; `if ! bash scripts/… "$needle" "$file"; then` davranışı aynı.
- **Fail-closed kenar durumlar:** argüman sayısı yanlış → `exit 2`; dosya yok/okunamaz
  → awk `exit 2`. İkisi de çağıranda "ihlal bulundu" dalına düşer (yanlış POZİTİF,
  sessiz PASS **değil**).
- `::error::` mesaj metni, hedef kaynağı (`/tmp/ac-workflow-action-targets.txt`),
  `while IFS= read -r file` döngüsü ve `violation=true` semantiği diff'te
  **değişmemiş**. `needle` hâlâ `run:` bloğunun içinde parçalı kuruluyor.
- Kazanç gerçek: 34 satırlık awk artık iki değil **tek** dosyada yaşıyor; `guards.sh`
  de aynı script'i çağırıyor (`guards.sh:233`) → sapma riski kapandı. ✔

### ④ Silinen depo — durum kalıcı bir yere taşındı mı?

**Hayır.** `grep -rn "localStorage|sessionStorage|document.cookie|dangerouslySetInnerHTML|
innerHTML" apps/admin/src packages/ui/src` → kalan **beş eşleşmenin hepsi YORUM**
(silinen depoya atıf) ve biri test dosyası; **üretim kodunda sıfır istemci deposu**.
`two-factor-status-store.ts` ve `two-factor-status-query.ts` dizinden gerçekten
kalkmış (`ls apps/admin/src/api/` ile doğruladım). Durum artık sunucudan
(`session.me`) geliyor, `session-refresh.ts` sadece TanStack Query invalidation
yapıyor (ağ/depo yan etkisi yok). Parola yalnızca React state'inde, input
`type="password"` + `autoComplete="current-password"`. Yedek kod indirme
`Blob` + `URL.createObjectURL` + **hemen** `revokeObjectURL` (yerel, ağa çıkmıyor);
kopyalama `navigator.clipboard` (yerel). Üçüncü taraf QR/exfil yolu YOK.
Bu turda eklenen dosyalarda sır taraması: **sıfır eşleşme**. ✔

### ⑤ Yeni migration — DEFINER/view/trigger/GRANT ve mevcut satır etkisi

Tek ifade: `ALTER TABLE "two_factor" ALTER COLUMN "verified" SET DEFAULT false;`
`SECURITY DEFINER` 0 · `CREATE SCHEMA` 0 · view/matview/trigger/rule/function 0 ·
`GRANT` 0 · `DROP` 0 · `SET NOT NULL` 0 (kolon zaten `NOT NULL`, değiştirilmiyor).
`SET DEFAULT` PostgreSQL'de **geçmişe dönük UPDATE üretmez** → mevcut satırların
`verified` değeri değişmez; canlı DB'de `nullable=NO` ve defter temiz (yukarıda).
CLAUDE.md §7 madde 15/16 ve §10 madde 10 **tetiklenmiyor**. ✔

---

## 3. BULGULAR

```
BULGULAR:
  - [SEV: medium] apps/api/src/auth/rate-limit/two-factor-scope-cookie.ts:110-125 (+ rate-limit.guard.ts:158-161) — `verify-totp`/`verify-backup-code`'un hesap kapsamı DOĞRULANMAMIŞ, SALDIRGAN TARAFINDAN SEÇİLEBİLİR bir çerez değerinden türüyor ve `two_factor` çerezi `session_token`'DAN ÖNCE geliyor. Better Auth ise oturum varken `two_factor` çerezine HİÇ BAKMAZ (`verify-two-factor.mjs`: `getSessionFromCtx` ÖNCE çağrılır, session dalı döner) → iki okuyucu AYNI istekte FARKLI değere bakar. SENARYO: oturumu ele geçirmiş saldırgan `POST /auth/two-factor/verify-totp` isteğini her seferinde `Cookie: better-auth.session_token=<kurbanın>; better-auth.two_factor=<her istekte YENİ rastgele>` ile gönderir. Better Auth isteği OTURUM yolunda (`isSignIn===false`) normal işler — kütüphanenin KENDİ kilidi (`assertTwoFactorNotLocked`/`beginAttempt(5)`/`recordTwoFactorFailure`) bu dalda ÇALIŞMAZ (`totp/index.mjs:148-166`, tur 1'de ölçtüm); bizim guard ise her istekte FARKLI bir hesap kovası açar → 5/15dk hesap sınırı HİÇ TETİKLENMEZ. Yani F1'in İKİNCİL telafisi olarak eklenen kontrol, tam olarak kapatmak için eklendiği dalda bir EK BAŞLIKLA devre dışı bırakılabilir. Kalan tek sınır IP kapsamı (rota başına 20/pencere) — IP rotasyonuyla aşılabilir. ÖLÇÜM: projenin KENDİ testi (`apps/api/src/__tests__/two-factor-scope-cookie.test.ts:11-17`) iki çerez de varken keyfi `challenge-abc` değerinin kazandığını assert ediyor (koşturdum, yeşil); kütüphanenin session-öncelikli dalı kaynak okumasıyla doğrulandı. ⚠ ÇAPRAZ HESAP KİLİTLEME (DoS) MÜMKÜN DEĞİL — kapsam değeri kurbanın KENDİ gizli çerezidir. `high` DEĞİL çünkü: IP kapsamı hâlâ bağlıyor, ön koşul (ele geçmiş oturum) saldırgana zaten o hesabın yetkisini veriyor ve bu dalda elde edilen EK bir varlık adlandıramıyorum (§4 "emin değilsen bir alt seviye"). — EN UCUZ DOĞRU DÜZELTME: öncelik sırasını TERSİNE çevir — İKİSİ DE varsa `session_token` kazansın (gerçek ön-giriş akışında `session_token` çerezi ZATEN YOK, eklenti onu `deleteSessionCookie(ctx, true)` ile siliyor → ters sıra meşru akışı BOZMAZ ama zehirlemeyi imkansız kılar). Daha sağlamı: oturum dalında kapsamı `auth.userId`/çözülmüş oturumdan, challenge dalında İMZASI DOĞRULANMIŞ değerden türet. — backend (kapsam kaynağı kararı: architect)
  - [SEV: low] apps/api/src/auth/auth-instance.ts — `createTwoFactorEventHook`'un `enable`/`disable`/`generate-backup-codes` dallarında `userId` log satırında İKİ KEZ görünüyor. CANLI ÖLÇÜM (kendi koşumum): `{"level":"info",…,"userId":"s3Z36Ma7nyhacYwl3yM6fKHHXV5sA6cY","userId":"s3Z36Ma7nyhacYwl3yM6fKHHXV5sA6cY","msg":"2FA kurulumu başladı"}`. Sebep: bu üç yol KİMLİK GEREKTİREN yollardır (`AUTH_DELEGATED_IDENTITY_REQUIRED_PATHS`), bu yüzden `AuthContextMiddleware` `userId`'yi istek child logger'ına ZATEN bağlamıştır; kanca ikinci kez geçiriyor. Yinelenen JSON anahtarı log hattı (Loki/Grafana, JSON parser) için belirsizdir. Projede bu sınıfa dair YAZILI emsal var ve defekt sayılmış (`auth.guard.ts`: "ikisi de ikinci kez geçirilirse NDJSON satırında İKİ KEZ görünür (ÖLÇÜLDÜ)" — orada iki alan da KALDIRILMIŞ). Değer aynı olduğu için yanlış veri YOK → `low`. `verify-totp` dalı DOĞRU (o yol auth-exempt, `{}` geçiyor, ölçümde tek `userId` yok). — Üç çağrıdan `{ userId }` kaldırılsın; `verify-totp` dalı AYNEN kalsın. — backend · vade v0.0.16
  - [SEV: low] apps/api/src/__tests__/auth-path-sets.test.ts (BEŞİNCİ blok) — TUR 1'DEN DEVREDEN (F4, borç): "iki sınıf AYRIKTIR" assert'i totolojik (`identityNotRequiredPaths` türetilmiş olduğu için kesişim her girdide zorunlu `[]`). Yeniden ölçtüm, değişmemiş. — qa · vade v0.0.16
  - [SEV: low] apps/admin/src/app/panel-config.ts — TUR 1'DEN DEVREDEN (F6, borç): altı 2FA yolunun paket sınırı ötesinde mekanik kontrolü olmayan aynası. Yeniden ölçtüm, değişmemiş. — frontend/devops · vade v0.0.16
  - [SEV: low] packages/db/src/catalog-lint.ts:816-842, :869-930 — TUR 1'DEN DEVREDEN (F7), YARISI KAPANDI: yeni `auth-secret-tables-sql-consistency.test.ts` (koşturdum: 3/3 yeşil) iki SQL dosyasının `FOREACH` dizisini `fs` ile parse edip `AUTH_SECRET_BEARING_TABLES` ile İKİ YÖNLÜ karşılaştırıyor, `AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS` ⊆ ilişkisini ve `columnLevel: true` tutarlılığını assert ediyor, ayrıca regex'in eşleşip BOŞ dönmesine karşı anti-vacuity bekçisi taşıyor (`:90-92`) — AYNA SAPMASI ekseni artık mekanik, non-vacuous ve TEK KAYNAKLI. KALAN KÖK BOŞLUK (tur 1'deki tespitim, hâlâ geçerli): hiçbir kural listeyi ŞEMADAN türetmiyor — şemada sır taşıyan bir kolon olup tablo `AUTH_SECRET_BEARING_TABLES`'a hiç EKLENMEZSE dört yer TUTARLI kalır ve linter SIFIR bulgu verir; `arkesoft_app`'in `ALTER DEFAULT PRIVILEGES`'ten gelen SELECT'i REVOKE EDİLMEZ. — En ucuz azaltma: CLAUDE.md §7 kontrol listesine "yeni sır taşıyan tablo eklemiyorum — ekliyorsam `AUTH_SECRET_BEARING_TABLES`'a da ekliyorum" maddesi (docs); kalıcı çözüm şemadan türetme (db). — db + docs · vade v0.0.16
  - [SEV: low] apps/api/src/errors/domain/account-temporarily-locked.error.ts + apps/admin/src/api/two-factor-rest.ts — TUR 1'DEN DEVREDEN (F8, borç): Better Auth'un 429'u `Retry-After` taşımıyor → panelin geri sayımı ölü yol; hata sınıfının üretim çağıranı yok. ⚠ EK ÖLÇÜM (bu tur): BİZİM oran sınırımızın 429'u `Retry-After`'ı TAŞIYOR (`RateLimitExceededError`, canlı izde `retryAfterSeconds:900`) — yani panelin geri sayımı artık BİZİM 429'umuzda ÇALIŞIYOR, yalnızca kütüphanenin kendi 429'unda çalışmıyor. Bulgunun kapsamı DARALDI. — qa · vade v0.0.16
```

---

## 4. YENİ YÜZEYİN GERİ KALANI — denetlendi, bulgu yok

| Yüzey | Nasıl denetlendi | Sonuç |
| ----- | ---------------- | ----- |
| `rate-limit.policy.ts` yeni tip + altı rota | diff okuması; `buildPolicy`'nin `AUTH_DELEGATED_PATHS` doğrulaması korunmuş; `resetAccountOnSuccess: false` (2FA uçlarında başarı sayacı SIFIRLAMAZ — doğru, aksi hâlde başarılı bir `enable` parola tahmin bütçesini sıfırlardı) | bulgu yok |
| `sessionUserId` kapsamı | `resolveSessionUserIdScopeValue` ALS'ten OKUR, ikinci sorgu yok; `authenticated` dışı → `undefined` (hesap kapsamı atlanır, IP kalır) ve `AuthGuard` asıl 401'i veriyor | bulgu yok — **zehirlenemez** |
| `AuthGuard` + DI (M-1) | diff: `new Proxy`/manuel kurulum kalktı, `@Inject(TwoFactorComplianceService)`, `auth.module.ts` provider'a eklendi; kapı mantığı (`role === owner` → `assertOwnerCompliance`) **değişmedi** | bulgu yok |
| `SessionSecurityReadPort` + adaptör | ham `prisma.db` kullanımı gerekçe yorumuyla (platform tablosu `app_user`); port TOTAL, fırlatmaz, `false` döner | bulgu yok |
| `rollback-auth-role.isolation.test.ts` `Prisma.raw()` | `Prisma.raw(tableName)` girdisi **modül sabiti** `AUTH_SECRET_BEARING_TABLES` (`as const` literal dizi) — dış girdi YOK; `$executeRawUnsafe` kullanılmıyor | enjeksiyon yüzeyi YOK |
| Admin `two-factor-rest.ts` `safeParse` dönüşü | gövde doğrulaması Zod `safeParse`'a geçmiş (daha katı); hata dalında `normalizePanelError(null)` → fail-closed `unknown` | bulgu yok |
| `check-run-block-template-expression.sh` | `set -uo pipefail`, `eval` YOK, `rm` YOK, girdi yalnızca çağıranın verdiği iki argüman; awk `-v needle=` ile geçiriliyor (kabuk enjeksiyonu yolu yok) | bulgu yok |
| CLAUDE.md §7 (16 madde) | yeni yüzey için madde madde tekrar geçildi: yeni kiracıya bağlı tablo YOK, yeni kuyruk işi YOK, yeni önbellek/S3/arama yüzeyi YOK, girdiden `id` okuma YOK (`session.me` girdisiz, `tenant.updateSecurityPolicy` `tenantId` taşımıyor), süper admin yüzeyi dokunulmamış | **karşılanmayan madde YOK** |
| Bağımlılık | `pnpm audit` yeniden koşturuldu; `pnpm-lock.yaml` diff'inde yeni paket olarak **yalnızca** `@radix-ui/react-dialog@1.3.1` (onaylı, advisory'si yok) | yeni advisory 0 |

---

## 5. ÖLÇÜMLER

- **Kendim koşturduğum testler:** 7 dosya, **79 test, hepsi yeşil**
  - `api/rate-limit.test.ts` + `rate-limit-policy.test.ts` + `two-factor-scope-cookie.test.ts` → **63/63**
  - `api/two-factor-plugin-live.test.ts` + `session-me-two-factor-enabled.test.ts` + `session-security-read-port-adapter.test.ts` → **13/13**
  - `db/auth-secret-tables-sql-consistency.test.ts` → **3/3**
- **Canlı DB ölçümü:** `two_factor.verified` → `default=false`, `nullable=NO`;
  `_prisma_migrations` iki 2FA migration'ı `rolled_back=-` (temiz).
- **`pnpm audit`:** `0 critical · 1 high · 1 moderate · 0 low` — **tur 1'e göre
  değişmedi**. `high` = `multer` GHSA-q7qp-rjg7-q26m (`@nestjs/platform-express`
  geçişlisi, bu sürüm getirmedi, ROADMAP borcu satır 2043/2647/2995, multipart rotası
  olmadığı için erişilemez); `moderate` = `minimatch` GHSA-g3hv-75wg-m249 (`eslint`
  devDep, ROADMAP satır 2348). **Bu sürümün eklediği yeni advisory: 0.**
- **İncelenen dosya (tur 2):** 26 repo dosyası (bu turda yeni/değişen üretim kodu,
  migration, SQL tutarlılık testi, iki shell script, `ci.yml`, admin yüzeyi) +
  3 `better-auth@1.7.14` kaynak dosyası (yeniden okuma: `verify-two-factor.mjs`,
  `totp/index.mjs`, `plugins/two-factor/index.mjs`).
- **Tenant izolasyon listesinden karşılanmayan madde: YOK** (16/16 ✔ veya gerekçeli N/A).
- **Bu turda eklenen dosyalarda sır:** 0 (hedefli tarama, sıfır eşleşme).
- **Oran sınırlı rota:** **10/10** (tur 1'de 4/10 idi; altı 2FA ucu artık kapsamda).
- **Koşturulan:** `pnpm audit` · 7 vitest dosyası · `psql` (salt okuma) · `git diff/status`
  · `grep`/`find`/`ls`. **Koşturulmayan:** Playwright, `apps/admin` dev sunucusu,
  `turbo run build`, `db:reset`, `db:rollback-roles`, `prisma migrate reset`,
  Redis yazma komutları.

### Dosya değişikliği kanıtı

```
git status --porcelain | wc -l            → 127
  = 126 (S1–S13 + FIX 1 + FIX 2, DOKUNULMADI)
  +   1 (bu rapor: .claude/workflow/reviews/T-016-security-tur2.md)
```

Önceki turun raporları (`T-016-security-tur1.md`, `T-016-solid-tur1.md`) 126'nın
içinde. **Kendi raporum dışında hiçbir dosyaya yazmadım; hiçbir mutasyon denemesi
yapmadım** (S2-1'i kanıtlamak için bir test dosyası yazmak gerekirdi — yazmadım,
yerine projenin KENDİ testinin assert'ini ve kütüphane kaynağını ölçtüm).

## 6. PASS gerekçesi ve sonraki adım

`critical` 0 · `high` 0 · `medium` 1 · `low` 5 → AGENT_BASELINE §4: **PASS**
("1–2 `medium` → PASS, bulgular teknik borca kaydedilir"; `low` için düzeltme turu
koşturulmaz). Düzeltme turu açan bulgu **yok**.

Borca giden altı satırın metni §3'te `docs`'un kopyalayabileceği biçimde yazıldı.
**S2-1 tek satırlık ucuz bir düzeltmeye sahip** (çerez öncelik sırasını ters çevirmek)
— bir sonraki sürümde `backend`'in yolu üstüne düşerse kapatılması önerilir; bu gate
onu bloklamıyor.
