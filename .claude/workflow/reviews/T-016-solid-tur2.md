# T-016 — `solid` gate, tur 2 (TAM yeniden denetim)

- **Tarih:** 2026-11-09
- **Sürüm:** ROADMAP v0.0.15 (iki faktörlü kimlik doğrulama + oturum güvenliği)
- **Ajan:** `solid` · **Araç seti:** Read / Grep / Glob — **Bash YOK**, hiçbir komut
  koşturulmadı, **hiçbir kod dosyası değiştirilmedi** (yalnızca bu rapor yazıldı).

```
GATE: solid
SONUÇ: PASS
```

**Gerekçe (AGENT_BASELINE §4):** `critical`/`high` **yok**. **1 `medium`** (yeni) →
"1–2 medium → PASS, teknik borca kaydedilir". Tur 1'in **altı `medium`'u da kaynağı
okunarak KAPANMIŞ bulundu**; hiçbiri kozmetik kapatma değil. 5 yeni `low` (tur açmaz).

---

## 1. TUR 1'İN ALTI `medium`'U — KAYNAK OKUNARAK DOĞRULAMA

| # | Doğrulanan kanıt (okudum) | Karar |
| - | ------------------------- | ----- |
| **M-1** DI/DIP | `auth.guard.ts:79-86` — constructor artık `@Inject(TwoFactorComplianceService)` alıyor, elle `new` **yok**. `auth.module.ts:225` — provider dizisine eklendi. `two-factor-compliance.service.ts:23-31` — GÜNCELLEME yorumu eski gerekçeyi geri alıyor. `auth-guard-two-factor-enforcement.test.ts`'in `new Proxy` hilesi kaldırılıp iki bağımsız `vi.fn()`'e geçildiği Orkestratör tarafından bildirildi; **ben yeni test dosyasını okumadım** → bkz. `DOĞRULANAMADI` 1. | **KAPALI** |
| **M-2** awk kopyası | `scripts/check-run-block-template-expression.sh:37-63` — awk programının TEK kaynağı. `scripts/guards.sh:233` ve `.github/workflows/ci.yml:572` **ikisi de** `bash scripts/check-run-block-template-expression.sh "$needle" "$file"` çağırıyor. `ci.yml:568` hedef kaynağını (`/tmp/ac-workflow-action-targets.txt`) **değiştirmemiş**, `::error::` eki ve exit semantiği korunmuş → "tam eşdeğerlik" iddiası dosya içeriğiyle tutarlı. `guards.sh:228` ayrıca `fail_if_targets_empty` ile boş hedef kümesine karşı fail-closed. | **KAPALI (dar — kabul)** |
| **M-3** bileşende mutasyon mantığı | `two-factor-manage-controller.ts:49-120` — saf sınıf, React yok; `confirmDisable`/`confirmRegenerate` diyalog-durumu korumalı, hata dalında tetikleyici **çağrılmıyor**. `features/two-factor/__tests__/two-factor-manage-controller.test.ts` — **6 test** (başarı/başarısızlık/no-op × iki akış + yaşam döngüsü), `toHaveBeenCalledTimes(1)` + çapraz `not.toHaveBeenCalled()`. `TwoFactorStatusCard.tsx:59-92` — artık mutasyon mantığı taşımıyor, controller'ı `useState` lazy init ile sarıyor; iki `ConfirmDialog` bloğu tekilleşmiş. | **KAPALI** |
| **M-4** sekme-başına depo | `apps/admin/src/api/` listesi (Glob): `two-factor-status-store.ts`/`two-factor-status-query.ts` **yok** — silinmiş. `session-identity.schema.ts:35-39` — `twoFactorEnabled: z.boolean()` **zorunlu**. `session.router.ts:21-27` — port'tan okunuyor, resolver tek ifade. `session-security-read.port.ts` + `.adapter.ts` + `trpc-context.types.ts:116` (**zorunlu** üye) + `trpc.controller.ts:173,197` (kablolama) + harness fake. `session-refresh.ts:17-19` tek tazeleme noktası; üretimde 2FA için `setQueryData` **sıfır** (grep: yalnızca test fixture'ları). ⭐ Benim iki-sekme senaryom **yapısal olarak imkânsız** hâle geldi: durum artık sunucudan geliyor. | **KAPALI** |
| **M-5** altı ayna | `auth-secret-tables-sql-consistency.test.ts` — iki SQL'in `FOREACH` dizisini `fs` + regex ile çıkarıp `AUTH_SECRET_BEARING_TABLES`'a karşı **iki yönlü** karşılaştırıyor; desen bulunamazsa **fırlatıyor** (sessiz boş dizi yok), `length > 0` anti-vacuity assert'i var, hata mesajları **hangi tabloyu** adlandırıyor. Üçüncü korumasız yer (`AUTH_ROLE_TABLE_PRIVILEGE_EXPECTATIONS`, benim işaret ettiğim dördüncü ayna) `⊆ + columnLevel:true` testiyle kapatıldı. ⭐ **Dördüncü ayak:** `rollback-auth-role.isolation.test.ts:194-198` DDL taklidi artık sabitten **türüyor** (`Prisma.sql` + `Prisma.raw`, `$executeRawUnsafe` yok) — ayna gözetlenmek yerine **yok edildi**. | **KAPALI (+fazlası)** |
| **M-6** tip disiplini | `two-factor-rest.ts:76,108,205` — üç `z.object(...)`; `:94,123,220` — `safeParse`; `as Record<string, unknown>` **yok**. `http/parse-json-safely.ts` ortak dosya, `auth-rest.ts:26` ve `two-factor-rest.ts:35` ikisi de onu import ediyor (kopya tekilleşti → tur 1 `low`'u da kapandı). `two-factor-setup-controller.ts:70` ve `two-factor-manage-controller.ts:54` — `mapError: (error: PanelError) => string`; `TwoFactorStatusCard.tsx:85` `resolvePanelErrorMessage`'ı **doğrudan** geçiyor (sarmalayıcı/cast yok). | **KAPALI** |

**Tur 1 `low`'larından kapananlar (ölçtüm):** `parseJsonSafely` kopyası (ortak dosyaya
terfi) · dört yerde tekrarlanan senkron değişmezi (M-4 ile yok oldu, öngörü tuttu) ·
`guards.sh` mktemp sızıntısı (`guards.sh:116-132` — `cleanup_tmp` her `return`'den önce
açıkça çağrılıyor; `trap ... RETURN` kullanılmamasının gerekçesi **ampirik ölçümle**
yazılmış: `run_step`'in dönüşünde ikinci kez ateşlenip "unbound variable" ile çökertmiş).

**Açık kalan tur-1 borçları (yeniden sayılmadı):** ② `AccountTemporarilyLockedError`
üretimde inşa edilmiyor · `totp-code-generator.port.ts` ölü export'ları · ac2 kaynak-metni
pin'i · `TERMINAL_CODES` tip bağı · status-only 401'ler · Türkçe rota dosya adı ·
kapı numarası çelişkisi (`auth.guard.ts:41` "ÜÇÜNCÜ" vs `:149` "İKİNCİ" vs
`two-factor-required.error.ts:4` "İKİNCİ" — **yeniden ölçüldü, hâlâ açık**).

### Tur 1'deki kendi ifademin düzeltilmesi

`devops`'un itirazı **haklı ve kabul edildi**: M-2'de "sapma zaten ölçüldü" yazmıştım.
Ölçtüğüm şey hedef kümesinin **türetim yolunun** farklı olmasıydı (CI dosyadan okuyor,
`guards.sh` kendi `find`'ını koşuyor) — iki `find`'ın **sonuçlarını** karşılaştırmadım.
`devops` karşılaştırdı: `diff` **boş**, yani canlı sapma **yoktu**, risk **yapısaldı**.
Bulgunun kendisi geçerliydi (tek kaynağa indirildi), ama ifadem ölçümümün ötesine geçmişti.

---

## 2. YENİ BULGULAR

### medium

- **[SEV: medium]** `apps/api/src/auth/rate-limit/two-factor-scope-cookie.ts:42-58` —
  Better Auth çerez adının (`better-auth.` öneki + `__Secure-` öneki) türetilmesi, aynı
  kuralın **ikinci, mekanik olarak bağlanmamış elle yazımı**: `auth-instance.ts`'in
  `useSecureCookies: env.NODE_ENV === 'production'` kararı ve "`advanced.cookiePrefix`
  AYARLANMADI" varsayımı burada **yeniden ifade ediliyor** (dosya bunu :47-51'de kendisi
  de kabul ediyor: "iki karar AYNI değişkenden TUTARLI türetilmeli"). İki yazımı birbirine
  bağlayan **hiçbir derleme/test pini yok**; `__tests__/two-factor-scope-cookie.test.ts`
  üretimdeki **aynı literali** (`'better-auth.two_factor='`) elle yazdığı için iki taraf
  **aynı varsayımı paylaşıyor**, biri diğerini doğrulamıyor.
  **Somut senaryo:** biri `auth-instance.ts`'te `advanced.cookiePrefix` tanımlar veya
  `useSecureCookies`'i ortama göre (ör. staging'de `true`) değiştirir → bu dosya **yanlış**
  çerez adını arar → `extractTwoFactorVerifyAccountScope` `undefined` döner → `verify-totp`/
  `verify-backup-code` için **hesap kapsamlı oran sınırı sessizce kaybolur**, yalnızca IP
  kapsamı kalır. Üstelik bu dosyanın var olma sebebi olan **kurulum-onayı modunda** Better
  Auth'un kendi hesap kilidi (ÖLÇÜLDÜ: `isSignIn === false` dalında `assertTwoFactorNotLocked`
  **çağrılmıyor**) hiç çalışmadığı için o modda hesap seviyesinde **hiçbir** sınır kalmaz —
  F1'in kapattığı delik sessizce yeniden açılır. Kapı yeşil kalır (fail-open, `undefined`
  → "hesap kapsamı atlanır" tasarım gereği).
  **Öneri (ikisinden biri yeter):** (a) çerez adı/önek türetmesini tek bir modülden export
  et ve `auth-instance.ts` ile bu dosya **aynı** fonksiyonu tüketsin; (b) mevcut canlı
  teste (`two-factor-plugin-live.test.ts` — gerçek Better Auth örneği `Set-Cookie`
  üretiyor) **tek** bir assert ekle: yayılan çerez adı `resolveBetterAuthCookieName('two_factor', env)`
  ile birebir eşit. — sorumlu: `backend`
  *Önem gerekçesi:* tur 1'de aynı sınıfı (korumasız ayna → sessiz sapma → güvenlik
  sonucu) M-5'te `medium` olarak derecelendirdim; tutarlılık için burada da `medium`.
  `high` değil, çünkü bugün bir davranış hatası **yok** — tetikleyici gelecekteki bir
  yapılandırma değişikliği.

### low (tur açmaz — ROADMAP teknik borç satırları)

- **[SEV: low]** `apps/api/src/auth/two-factor-compliance.service.ts:6-10` ve `:12-21` —
  **güncelliğini yitirmiş yorum.** (a) ":6-10" hâlâ "İKİ TÜKETİCİ, TEK hesaplama" diyor;
  gerçekte servisin tek tüketicisi `AuthGuard` ve `session.me` zinciri `evaluateOwnerStatus`'u
  **bilinçli olarak tüketmiyor**. (b) ":12-21" hâlâ "`packages/trpc/src/ports/**`'in AYNI
  deseni — bugün HİÇ YOK, EKLENMESİ GEREKİR ... BU SÜRÜMDE o adaptör YOK — raporlanan,
  yazılmayan parça BUDUR" diyor; oysa `packages/trpc/src/ports/session-security-read.port.ts`
  + `apps/api/src/trpc/ports/session-security-read.port.adapter.ts` **artık var** ve zincir
  `TwoFactorComplianceService`'ten **bağımsız** kuruldu. :23-31'deki GÜNCELLEME yalnızca
  DI'yı düzeltiyor, bu iki iddiayı bırakıyor. Beş yıl sonra okuyan, bilinçli olarak farklı
  kurulmuş bir zinciri "tamamlamaya" yönlendirilir. — sorumlu: `backend`
- **[SEV: low]** `apps/admin/src/api/auth-rest.ts:42-44,58,85` — `SignInResult`'ın
  `signed-in` dalındaki `twoFactorEnabled: boolean | null` alanı ve
  `signedInUserTwoFactorSchema`'nın **üretimde tüketicisi yok** (grep: tek okuyucu
  `__tests__/auth-rest.test.ts:36,45`). ⭐ Bu, M-1'in kök nedeninin **aynadaki
  görüntüsü**: üretim şekli yalnızca bir test assert'i onu okuduğu için ayakta. Ek risk —
  **cezbedici tuzak**: sonraki geliştirici 2FA durumunu *sign-in anında yakalanmış* bu
  alandan okuyabilir ve M-4'ün kaldırdığı bayatlama hatasını yeniden üretir. Düzeltme
  `{kind:'signed-in'}`'e daraltma + şema silme + iki test assert'i (3 satır çifti). —
  sorumlu: `frontend`
- **[SEV: low]** `packages/db/src/__tests__/auth-secret-tables-sql-consistency.test.ts:68` —
  `/FOREACH secret_table_name IN ARRAY ARRAY\[([^\]]*)\]/` + `.exec()` yalnızca **ilk**
  eşleşmeyi alır. Yeni bir yetki kademesi için aynı dosyaya **ikinci** bir
  `FOREACH secret_table_name` döngüsü eklenirse (makul: bootstrap bugün bile çok kademeli)
  o dizi **denetimsiz** kalır ve M-5'in kapattığı sessiz sapma o kopya üzerinden geri
  döner. `matchAll` + "dosya başına tam 1 eşleşme" assert'i kapatır. — sorumlu: `db`
- **[SEV: low]** `apps/admin/src/features/two-factor/__tests__/two-factor-manage-controller.test.ts:27,48,97,117` —
  dört yerde `toMatchObject` (kısmi assert) kullanılmış; aynı dosyanın `:142`'si zaten
  `toEqual` ile **tam durum** assert'i yapıyor, yani desen yazara tanıdık. Somut boşluk:
  başarılı `disable` sonrası `password` alanının bellekten **temizlendiğini** hiçbir assert
  doğrulamıyor (`closeDialog()` bunu yapıyor ama kanıtlanmıyor) — `toEqual` bunu bedava
  kapatırdı. ADR-0014'ün "TAM çıktı assert'i" maddesi. — sorumlu: `frontend`
- **[SEV: low]** `scripts/guards.sh:113-311` ↔ `.github/workflows/ci.yml:352-700` —
  M-2'nin **dar** kapsamı dışında kalan dokuz adımın mantığı iki yerde yaşamaya devam
  ediyor; en büyüğü AC13'ün işaretçi/`diff`/kalıcı-liste koruması (~45 satır) ve AC4'ün
  GUC taraması. **Dar kapsam süreç olarak doğruydu** (M-2 adını koyduğum awk programını ve
  hedef türetimini kapsıyordu; kapsam genişletmek "yolu üstündeydi" refactor'u olurdu).
  Patlama yarıçapı sınırlı: veri dosyaları (`.github/ci-*.txt`) **paylaşılıyor**, sapsa
  bile **CI yetkili kapı** olarak sağlam kalır, zayıflayan yerel/danışma kapısıdır. Tek bir
  izleyen işte (`scripts/check-ac13-forbidden-tokens.sh` + `check-ac4-guc-tokens.sh`)
  kapatılmalı. Vade: v0.0.15.1. — sorumlu: `devops`

---

## 3. DÖRT ÖZEL NOKTA — AÇIK KARAR

1. **`TwoFactorManageController` ↔ `TwoFactorSetupController` kopya mı? → TEMİZ, bulgu yok.**
   Karşılaştırdığım şey: her iki dosyanın constructor imzası (`deps`, `mapError`, `onChange`),
   `getState`/`setState` çifti ve "isMutating → await → hata dalı → setState" iskeleti.
   Paylaşılan yüzey ~12 satırlık **iskelet**; ayrışan yüzey **durum tipinin kendisi**:
   Setup 4 üyeli ayrımlı birleşim (`password`/`totp`/`backup-codes`/`completed`) + iki
   değişmez (`hasCalledEnable`, `capturedBackupCodes`, AC11 madde 4/5), Manage ise düz bir
   kayıt (`dialogKind`/`password`/`isMutating`/`mutationError`, P7 diyalogları). Ortak bir
   taban sınıf state tipi üzerinde generic olmak zorunda kalır ve **farklı sebeplerle
   değişen** iki akışı (kurulum sözleşmesi ↔ yönetim diyalogları) birbirine bağlar — kendi
   kuralımın ("farklı sebeplerle değişecek iki şeyi birleştirmek daha kötüdür") tam karşılığı.
   Ayrı kalmaları **doğru**.
2. **`session-refresh.ts` doğru soyutlama mı? → TEMİZ, meşru tek-doğruluk-noktası.**
   Tek satır sarmaladığı için "gereksiz dolaylılık" gibi görünüyor, ama merkezileştirdiği
   şey **anahtar değil politika**: "her 2FA mutasyonundan sonra `session.me` tazelenir".
   Anahtar (`sessionMeQueryKey`) zaten paylaşılıyordu; tekrarlanan şey karardı (ve `void`
   ile floating-promise'in yutulması gibi kolay unutulan bir ayrıntı). Üç çağıran noktayı
   tek isme indirdi, kendi testi var, ve tazeleme stratejisi değişirse (`refetchType`,
   ikinci bir anahtar) tek yer değişir. Gözlem (bulgu değil): dosya adı "refresh", export
   `invalidateSessionIdentity` — isim tablosu dosya adı ile export adının eşleşmesini
   zorunlu kılmıyor, davranışı dürüstçe adlandırıyor.
3. **`two-factor-scope-cookie.ts` — kopya mı, katman doğru mu? → kopya DEĞİL; katman doğru;
   ama **türetme** aynası var → N-1 (medium, yukarıda).**
   Ölçüm: üretim kaynağında (`__tests__` hariç) `Cookie` başlığı ayrıştıran **başka** kod
   **yok** (grep: `split(';')`/`headers['cookie']` yalnızca bu dosya ve çağıranı
   `rate-limit.guard.ts:161`). Yani ayrıştırma **yeni ve tekil**. Katman: dosya
   `auth/rate-limit/` altında yaşıyor — oran sınırlayıcı bu projede **auth'a özgü** bir
   altyapıdır (yalnızca 10 auth rotasında devrede, `rate-limit.policy.ts`), dolayısıyla
   Better Auth çerez bilgisinin burada olması genel bir `http/` modülüne sızmasından
   **daha iyidir**. Zod kullanılmaması da gerekçeli ve doğru (şema doğrulaması değil metin
   ayrıştırması; `client-ip.ts` emsali). Kalan sorun **yalnızca** çerez adının ikinci kez
   elle türetilmesi.
4. **Kalan dokuz kopya — dar kapsam doğru muydu? → EVET, süreç olarak doğru; kalan sınıf
   `low` (yukarıda).** Önem derecesi gerekçesi orada yazılı: paylaşılan veri dosyaları +
   CI'ın yetkili kapı olması patlama yarıçapını daraltıyor. `medium`'a şişirmek, yapısal
   olarak **aynı** ve canlı sapması **ölçülmemiş** bir risk için ikinci bir düzeltme turu
   açmak olurdu.

---

## 4. ÜÇ İŞARETLİ KALEM — AÇIK KARAR

1. **`frontend`'in sildiği tautolojik test → TEMİZ, kalıcı koruma GEREKMİYOR.**
   Doğru davranış: mock'un kendisine karşı kurulan `expect(onDisabled).not.toHaveBeenCalled()`
   hiçbir şey kanıtlamıyordu; silmek, bırakmaktan iyidir. **Korumanın kendisi zaten var ve
   vakum değil:** `two-factor-manage-controller.test.ts:25`
   (`expect(onDisabled).toHaveBeenCalledTimes(1)`) **gerçek** controller çağrısından sonra
   assert ediyor — üretimdeki `this.deps.onDisabled()` satırı silinirse bu test kırmızı
   olur, ki ajan tam bunu elle mutasyonla koşturup gözlemlemiş ve :68-73'te kayda geçirmiş.
   Geriye kalan eksik yalnızca **otomatik** mutasyon testidir; bu yığında mutasyon testi
   aracı yok (CLAUDE.md §2) ve talep etmek kapsam genişletmesi olurdu.
2. **Optimistic `setQueryData` yokluğu → TEMİZ (varsayım kabul edilebilir).** `session.me`
   artık `userId`/`sessionId`/`twoFactorEnabled` üçlüsü döndüğü için optimistic yazmak
   **eldeki olmayan veriyi uydurmak** demekti; bu projenin "ÖLÇÜLMEYENİ UYDURMA" disiplini
   invalidate'i doğru seçim yapar. Kart zaten `isPending` için `Skeleton`, `isError` için
   `role="alert"`+retry taşıyor, yani tazeleme gecikmesi **tasarlanmış** bir duruma düşüyor.
   ⚠ `DOĞRULANAMADI`: gecikmenin **süresi** ölçülmedi (ne ajan ne ben) — algılanan
   yavaşlık `perf`/`wcag`'in alanı, bu kapının bulgusu değil.
3. **`SignInResult.twoFactorEnabled` ölü alan → BULGU (low, yukarıda).** Silinmemesinin
   gerekçesi (başkasının test dosyasına dokunmamak) süreç olarak savunulabilir ama sonuç
   ölü üretim yüzeyi + bayatlama tuzağıdır; borç satırı yazıldı.

---

## 5. ON BİR DENETİM BAŞLIĞI (yeni/değişen yüzey)

1. **SOLID** — `AuthGuard` artık iş birliği nesnesinin yaşam döngüsünü sahiplenmiyor (M-1).
   İki yeni saf kontrolcü SRP'ye uyuyor (özel nokta 1). `SessionSecurityReadPort` tek
   metotlu, total, fırlatmayan bir arayüz; adaptörü iş mantığı taşımıyor (DIP ✓).
   `TwoFactorComplianceService` tek sorumlulukta kaldı. Bulgu yok.
2. **Katman sınırları** — `packages/trpc` port **bildiriyor**, `apps/api` **uyguluyor**
   (`session-security-read.port.ts` ↔ `.adapter.ts`); şema iş kuralı taşımıyor (yalnızca
   `app_user`'ın kendi bayrağının echo'su, politika **bilinçli** kapsam dışı).
   `apps/admin` iş kuralı yazmıyor; durum artık sunucudan. `packages/ui` dokunulmadı.
   Bulgu yok.
3. **Bağımlılık yönü / döngü** — `apps/api → packages/trpc` tek yönlü; port arayüzü
   `@arkesoft/trpc/server`'dan **tip-only** import ediliyor. `packages/db`'nin yeni testi
   yalnızca `fs` + kendi `tenancy.ts`'ini kullanıyor. Bulgu yok.
4. **DRY** — gerçek ayna: N-1 (çerez adı türetmesi). Kapanan: `parseJsonSafely`, awk,
   SQL dizileri, DDL taklidi, senkron değişmezi. **Tekrar DEĞİL diye geçtiğim:** iki
   kontrolcünün iskeleti (özel nokta 1) ve `SessionSecurityReadPortAdapter.isTwoFactorEnabled`
   ile `TwoFactorComplianceService`'in ikinci sorgusu — aynı 4 satırlık Prisma okuması ama
   farklı sözleşmeler (biri kiracı politikasını da okuyan 3 durumlu hesap, biri saf
   boolean) ve port dosyası bu ayrımı :11-18'de açıkça gerekçelendiriyor.
5. **KISS** — `session-refresh.ts` (özel nokta 2) ve `two-factor-manage-controller.ts`
   yerinde; `cleanup_tmp`'in `trap` yerine açık çağrı olması **ampirik** gerekçeli.
   Gereksiz katman/erken genelleme bulunmadı.
6. **İsimlendirme** — yeni dosyalar kebab-case ✓ (`two-factor-scope-cookie.ts`,
   `session-security-read.port.adapter.ts`, `parse-json-safely.ts`,
   `auth-secret-tables-sql-consistency.test.ts`, `check-run-block-template-expression.sh`),
   tip/sınıf PascalCase ✓, sabitler SCREAMING_SNAKE_CASE ✓ (`BETTER_AUTH_COOKIE_PREFIX`,
   `SECURE_COOKIE_PREFIX`, `INITIAL_STATE`), boolean/predicate `is` öneki ✓
   (`isTwoFactorEnabled`, `isMutating`). Yeni ihlal yok.
7. **Tip disiplini** — M-6 kapandı. Yeni yüzeyde `any`/`@ts-ignore`/`eslint-disable`
   bulunmadı; `as` yalnızca test çiftlerinde. `twoFactorEnabled` **zorunlu** (opsiyonel
   bayrak yığını değil). Bulgu yok.
8. **Hata yönetimi** — `SessionSecurityReadPort` **total** ve fırlatmıyor; "bulunamadı →
   `false`" sapması `TenantReadPortAdapter` emsalinden **bilinçli** ve gerekçeli
   (tüketicisi olmayan bir hata dalı icat etmemek). Boş `catch {}` yok. `extract...Scope`'un
   `undefined` dönüşü fail-open ama **dokümante** ve IP kapsamı korunuyor (N-1 bunun
   sessizleşme riskini ele alıyor). Bulgu yok.
9. **Test kalitesi** — `session-me-two-factor-enabled.test.ts`: iki hücre + **karşılaştırmalı**
   çapraz kullanıcı sızıntı testi ve `expect(enabledResult.userId).not.toBe(disabledResult.userId)`
   **anti-vacuity sanity** assert'i — örnek nitelikte. `auth-secret-tables-sql-consistency.test.ts`:
   regex uyuşmazlığını tablo uyuşmazlığından **ayırt eden** fırlatma + `length > 0`.
   `two-factor-scope-cookie.test.ts`: production öneki, dizi başlık, boş değer yakın-ıskaları.
   Bulgular: N-5 (`toMatchObject`), N-3 (test'in ayakta tuttuğu üretim alanı).
10. **Ölü kod** — N-3 (yeni). Taşınan borçlar: `AccountTemporarilyLockedError`,
    `totp-code-generator.port.ts`'in port tipi + fabrikası. Yeni dosyalarda kullanılmayan
    export bulunmadı (`invalidateSessionIdentity`, `parseJsonSafely`,
    `extractTwoFactorVerifyAccountScope`, `TwoFactorManageController` — hepsinin üretim
    tüketicisi var, grep ile doğrulandı).
11. **Yorum dili / güncellik** — yeni dosyaların tamamında yorum **Türkçe**, kod İngilizce ✓;
    yorumlar *neden*i anlatıyor (ölçüm referansları, A/B seçim gerekçeleri, reddedilen
    alternatifler). Bulgular: N-2 (bayat yorum), taşınan kapı-numarası çelişkisi.

---

## 6. DOĞRULANAMADI

1. `auth-guard-two-factor-enforcement.test.ts`'in güncellenmiş hâlini (iki bağımsız
   `vi.fn()`, `new Proxy` hilesinin kaldırılması) **okumadım** — M-1'in üretim tarafını
   (DI kaydı + `@Inject`) okuyarak doğruladım, test tarafı Orkestratör'ün beyanıdır.
2. Kapı sayıları (`lint`/`typecheck`/`test`/`test:isolation`/`build`/`guards`/`format:check`,
   paket bazlı test sayıları, bundle bütçesi) — **Bash yok**, bağımsız doğrulanmadı.
3. `two-factor-rest.test.ts`, `session-refresh.test.ts`,
   `session-security-read-port-adapter.test.ts` içerikleri okunmadı (bütçe) — ilgili üretim
   kodunu okudum.
4. M-2'nin "TAM EŞDEĞERLİK" iddiasının **koşum** kanıtı yok: iki çağıranın aynı girdide
   aynı çıktıyı verdiğini dosyaları okuyarak (aynı script, aynı needle kurulumu, aynı exit
   semantiği) **statik olarak** doğruladım, çalıştırarak değil.
5. Optimistic yazma olmamasının **algılanan gecikmesi** ölçülmedi (işaretli kalem 2).

## 7. ÖLÇÜMLER

- **İncelenen dosya (tur 2):** 24 tam/hedefli okuma + 9 hedefli grep taraması
  (`apps/api` 8, `apps/admin` 8, `packages/trpc` 3, `packages/db` 3, `scripts` 2,
  `.github/workflows/ci.yml` hedefli).
- **Bulunan `any`:** **0** (yeni/değişen üretim kodu). `@ts-ignore`/`@ts-expect-error`: 0.
  Gerekçesiz `as`: **0** (tur 1'deki 4 kapandı; `as Record<string, unknown>` ve
  `as PanelError` üretimde **yok**).
- **En büyük fonksiyon:** `TwoFactorStatusCard` — `TwoFactorStatusCard.tsx:59`'dan
  başlıyor, mutasyon mantığı çıkarıldığı için tur 1'deki 238 satırdan küçüldü; **yeni
  uzunluğunu satır satır ölçmedim** (`DOĞRULANAMADI`: dosyanın sonunu okumadım).
  Ölçtüğüm en büyük saf mantık fonksiyonu: `TwoFactorManageController.confirmRegenerate`
  **19 satır** (`two-factor-manage-controller.ts:101-119`); en büyük yeni dosya
  `two-factor-scope-cookie.ts` **129 satır** (54'ü dosya başı gerekçe yorumu).
- **Bulgu dağılımı:** critical 0 · high 0 · **medium 1** · low 5.
  Tur 1'den kapanan: **6 medium + 3 low**.
- **Değiştirilen kod dosyası:** **0**.
