# T-021 — GATE: `solid` · Tur 1

- Tarih: 2026-11-16
- Sürüm: ROADMAP v0.0.20 (süper admin iskeleti)
- Ajan: `solid` (Kod Kalitesi)
- Araçlar: `Read` / `Grep` / `Glob` (⚠ `Bash` yok — hiçbir komut koşturulmadı, hiçbir
  dosya değiştirilmedi)

```
GATE: solid
SONUÇ: PASS
BULGULAR: 0 critical · 0 high · 2 medium · 10 low
```

**FAIL kuralı uygulaması (AGENT_BASELINE §4):** `critical`/`high` **yok**;
`medium` sayısı **2** (≤2) ⇒ **PASS**, iki `medium` teknik borca ve düzeltme turuna
değil **borç tablosuna** değil — ⚠ dikkat: AGENT_BASELINE §4 tablosu `medium` için
"≥3 FAIL" diyor, 1–2 `medium` **PASS**'tır ve "bulgular teknik borca kaydedilir".
⭐ M1'in düzeltmesi **tek satır** olduğu için Orkestratör isterse "yolu üstündeyse
kapat" sınıfına alabilir (§4 istisnası) — bu gate onu **talep etmiyor**.

---

## 1. BULGULAR

### medium

- **[SEV: medium]** `apps/api/src/platform/impersonation.service.ts:160-173` —
  `ensureSignInRecorded()` `sessionId`'yi idempotency kümesine **yazmadan ÖNCE**
  ekliyor (`:164` `add()`, `:166` `await writeAuditRow()`). Denetim yazması
  başarısız olursa (geçici DB hatası, bağlantı havuzu tükenmesi) `sessionId`
  **kümede kalır** ⇒ o oturum için `platform_admin_signed_in` satırı **süreç ömrü
  boyunca bir daha yazılamaz**.
  ⚠ **Senaryo (kullanıcı/denetçi):** platform yöneticisi panele girer, ilk
  `tenantList` isteği sırasında audit insert'i hata alır → istek 500 döner →
  yönetici sayfayı yeniler → kapı bu kez geçer, kiracı listesi **okunur**,
  `tenant_impersonation_started` satırı yazılır, ama **"giriş" satırı hiç
  oluşmaz**. Sürümün iş hedefinin ("her platform erişimi **yapısal olarak** iz
  bırakır") giriş yarısı sessizce düşer; AC-8'in `öncesi + 2` değişmezi o koşumda
  `+1` olur. ⭐ Kritik olan impersonation izi **ayakta kalır** (o yazma okuma'dan
  **önce** ve kümeden bağımsız) — bu yüzden `high` değil `medium`.
  **Düzeltme:** `#recordedSignInSessionIds.add(entry.sessionId)` çağrısını
  `await this.writeAuditRow(...)`'dan **sonraya** al (erken dönüş aynen kalır).
  Yarış durumu endişesi varsa `add()`'i `try/finally` ile değil, **başarı
  yolunda** yap. **Sorumlu:** `backend` (S7).

- **[SEV: medium]** `apps/superadmin/e2e/fixtures/platform-admin.ts:72,126-194` —
  Mailpit doğrulama yardımcısı (`MAILPIT_BASE_URL` + `MailpitAddress`/
  `MailpitMessageSummary`/`MailpitMessagesListResponse`/`MailpitMessageDetail` +
  iki tip guard + `findVerificationToken`, ~70 satır) **dördüncü kopya** olarak
  eklendi. Ölçüm (mekanik, `-r`):
  `apps/admin/e2e/helpers/verified-fixture-user.ts:26-95` ·
  `apps/admin/e2e/panel-flow.spec.ts:44-105` ·
  `apps/admin/e2e/session-security-dialog-focus.qa.spec.ts:73-131` ·
  `apps/superadmin/e2e/fixtures/platform-admin.ts:72-194`.
  ⚠ Dosyanın kendi yorumu (`:123-124`) **yalnızca** "admin'den import edilemez"i
  gerekçelendiriyor — **`scripts/playwright/`'e konmamasını gerekçelendirmiyor**.
  O ev **bu Task'ta kuruldu** (`sql.ts`, `totp.ts`) ve fixture'dan import
  edilebilirliği **S9 tarafından ölçüldü** (R-PO3: `npx playwright test --list`
  hatasız) ⇒ mimari engel **yok**, maliyet **bir dosya**.
  ⚠ **Senaryo (geliştirici):** Mailpit API'si `/api/v1/messages` şeklini
  değiştirdiğinde (veya doğrulama e-postası HTML'e geçtiğinde) **dört** dosya
  elle güncellenmek zorunda; üçünü güncelleyip birini atlayan geliştirici
  **tek bir uygulamanın** e2e'sinde kırmızı görür ve kök nedeni ararken
  "aynı kodu neden dört yerde yazdık" sorusuna düşer.
  **Düzeltme:** gövdeyi `scripts/playwright/mailpit.ts`'e taşı (`sql.ts`'in
  birebir deseni, `label` parametresi dahil), `apps/superadmin` fixture'ı import
  etsin; admin'in üç kopyası **bu sürümün kapsamı değil** (ayrı borç satırı).
  **Sorumlu:** `devops` (S9/S10).
  ⭐ **Önem derecesi kalibrasyonu projenin kendi emsaline dayanıyor**
  (`ROADMAP:3267` / T-021 `R4`): **iki** kopya = `low`, **üç** kopya = `medium`'a
  terfi. Bu eksen **dört** kopyada ⇒ `medium`.

### low

- **[SEV: low]** `packages/trpc/src/routers/platform.router.ts:28-32` — dosya başı
  yorumu "`AUTH_EXEMPT_PATHS`/`TENANT_EXEMPT_PATHS`'E EKLENMEZ" diyor; **YANLIŞ**.
  ⭐ Teyit ettim: `apps/api/src/tenancy/tenant-exempt-paths.ts:227-229` üç yolu
  (`/trpc/platform.session|tenantList|auditLog`) **içeriyor**, küme **24 → 27**.
  `AUTH_EXEMPT_PATHS` gerçekten **12'de kalmış** (yorumun o yarısı doğru).
  Doc↔davranış sapması **kayıtlı** (S7 → `tenant-exempt-paths.ts:181-187` →
  `S11`). **Sorumlu:** `docs` (S11). **Vade:** bu sürüm (S11 zaten devralmış).
- **[SEV: low]** `packages/trpc/src/schemas/platform.schema.ts:128-131` — **YENİ
  bulgu, handoff'ta kayıtlı DEĞİL.** Yorum "`platform.session`'ın girişi
  `platform_admin_signed_in` yazar" diyor; **R-PO4 kararıyla çelişiyor**:
  `platform.session` **hiçbir** satır yazmaz (`impersonation.service.ts:130-148`,
  `readPlatformSession` "ASLA YAZMAZ"), satırı `requirePlatformAdmin` yolu yazar
  (`platform-admin-read.port.adapter.ts:36-42`). ⚠ Yorum S5'te (kapı dışı karar
  verilmeden önce) yazıldı, S7 kararı sonrası güncellenmedi.
  ⚠ **Senaryo:** denetim kaydının "neden iki eylem de ölü sözlük değil"
  gerekçesini okuyan geliştirici, `platform.session`'ın yazdığını sanıp
  R-PO4'ün (poll ↔ sayım) çözülmüş sorununu **yeniden açar**.
  **Düzeltme:** yorumu "`platformAdminProcedure` kapısından ilk geçişte yazılır"
  olarak düzelt. **Sorumlu:** `docs` (S11) veya `backend`. **Vade:** bu sürüm.
- **[SEV: low]** `packages/trpc/src/ports/trpc-error-factory.port.ts:67` +
  `apps/api/src/trpc/trpc-errors.port.adapter.ts:67` +
  `apps/api/src/errors/domain/platform-admin-required.error.ts:29` — **ölü port
  üyesi.** `platformAdminRequired()` **ZORUNLU** bir port üyesi olarak eklendi ama
  **sıfır üretim çağrı yeri** var (mekanik tarama: yalnızca adaptör
  implementasyonu + 4 test double; `platformAdminProcedure` bu fabrikayı
  **çağırmıyor**, case (a) portun TOTAL fırlatmasıyla kapanıyor — S5 bunu
  raporladı, kod yorumu da _"ÜRETİMDE ÇAĞRILMAZ"_ diyor).
  ⚠ İkinci dereceden bedel ölçüldü: bu ölü fabrika yüzünden üretim hata sınıfının
  parametresi `userId?` **opsiyonel** yapıldı
  (`platform-admin-required.error.ts:18-24`) ⇒ `context: { userId: undefined }`
  derlenebilir hâle geldi.
  ⚠ Bu, projenin **kendi reddettiği** desen: _"ölü sözlük, ölü iznin kardeşidir"_
  (`schema.prisma:995-999`) — `platform_admin` enum değeri ve
  `@RequirePermission()` tam bu ölçütle reddedilmişti ve architect'in ② "tutarlılık
  muhasebesi" tablosu _"tüketici 0 ⇒ red, 1 ⇒ kabul"_ diye yazılı.
  **Düzeltme (iki yoldan biri):** (a) port üyesini kaldır (ve `userId?`'yi
  zorunluya döndür), (b) kalacaksa ROADMAP borç tablosuna _"sıfır tüketicili
  zorunlu port üyesi"_ satırı + vade yaz. **Sorumlu:** `backend` + `docs`.
- **[SEV: low]** `apps/admin` ↔ `apps/superadmin` **panel altyapısı kopyası**
  (iki kopya, gövdeleri **bayt düzeyinde aynı**, yalnızca yorum başlıkları
  farklı). Ölçülen özdeş küme (~500 satır):
  `apps/superadmin/src/api/transport-aware-fetch.ts:17-94`
  (↔ `apps/admin/src/api/transport-aware-fetch.ts:29-116`) ·
  `apps/superadmin/src/api/http/parse-json-safely.ts:1-14` ·
  `apps/superadmin/src/errors/assert-never.ts:14-16` ·
  `apps/superadmin/src/errors/resolve-shape-error-message.ts:23-40` ·
  `apps/superadmin/src/features/two-factor/two-factor-setup-controller.ts:1-145`
  (dosya başı **kendisi** "BİREBİR aynısı" diyor) ·
  `apps/superadmin/src/api/two-factor-rest.ts` (131 satır) ·
  `apps/superadmin/src/lib/challenge-countdown.ts` ·
  `features/two-factor/sign-in-focus.ts` · `features/two-factor/field-error-message.ts`.
  ⚠ Sapma **sessiz**: `PanelError.code` tipi `string`
  (`apps/superadmin/src/errors/panel-error.ts:14`) ⇒ tel sözleşmesi değişince
  **derleme zamanı** hiçbir şey kırılmaz; her panel kendi kopyasını kendi
  fixture'larıyla test ediyor.
  ⭐ **Birleştirilmemesi gerekenleri AYIRDIM** (yüzeysel benzerlik ≠ tekrar):
  `panel-error.ts` ve `normalize-panel-error.ts` **bilinçli olarak farklı**
  (süper adminde `fields` kanalı **yok** — gerekçesi yazılı), üç durum bileşeni
  (`EmptyState`/`ErrorState`/`LoadingState`) **A-PO21-4 ile kasıtlı kopya**
  (AC-2'nin yapısal garantisi), kabuk bileşenleri (`AppShell`/`Sidebar`/`Topbar`)
  ve `messages.ts` **sunum** — üçü de **farklı sebeplerle değişir**, birleştirmek
  **daha kötü** olurdu. Bulgu **yalnızca** özdeş taşıma/hata-zarfı/2FA-REST
  katmanı içindir.
  ⚠ **Bugün paylaşılan ev YOK** (`packages/ui` `@arkesoft/trpc`'ye bağımlı
  olamaz, CLAUDE.md §3) ⇒ düzeltme **bu sürümün kapsamı değil**; istenen şey
  **kaydın kendisi**: ROADMAP teknik borç satırı + `architect` kararı (yeni bir
  `packages/panel-kit` sınıfı paket mi, yoksa kalıcı kabul mü).
  ⭐ Önem derecesi yine emsal kalibrasyonu: **iki** kopya ⇒ `low`
  (üçüncü panel gelirse `medium`'a terfi — tetik `apps/*` sayısı).
  **Sorumlu:** `architect` + `docs`. **Vade önerisi:** v0.0.22 (API sürümleme) —
  tel sözleşmesine dokunan ilk sürüm.
- **[SEV: low]** `apps/api/src/platform/impersonation.service.ts:111-127` ↔
  `:134-148` — `requirePlatformAdmin()` ve `readPlatformSession()` **aynı iki
  sorguyu** (`platformAdmin.findUnique` + `user.findUnique({twoFactorEnabled})`)
  bağımsız olarak tekrarlıyor; tek fark **fırlatma ↔ dönüş**. Bu **gerçek** tekrar:
  ikisi de **aynı sebeple** değişir (yetkinin tanımı veya 2FA bayrağının kaynağı
  değişirse). **Düzeltme:** `requirePlatformAdmin()`'i `readPlatformSession()`
  üzerine kur (`isPlatformAdmin === false` ⇒ `throw`), TOTAL sözleşme **aynen**
  korunur. **Sorumlu:** `backend`.
- **[SEV: low]** `apps/api/src/platform/impersonation.service.ts:93` —
  **sınıf adı sorumluluğunu anlatmıyor.** `ImpersonationService`'in yedi public
  yönteminden **beşi** impersonation **değil**: `requirePlatformAdmin`
  (yetkilendirme kaynağı), `readPlatformSession` (okuma), `ensureSignInRecorded`
  (denetim yazıcısı), `listTenantsBasic`/`listAuditEntries` (platform okumaları),
  `resolvePlanNames`. ⭐ Tek-dosya kısıtı (`PrismaService`'in tek enjeksiyon
  noktası, `platform-impersonation-write-gate.test.ts` KAPI B) **dosya**
  seviyesindedir — **sınıf** seviyesinde değil; ad değişikliği veya aynı dosyada
  ikinci bir sınıf kapıyı **kırmaz** (grep `(PrismaService)` jetonunu arıyor).
  ⚠ **Senaryo:** beş yıl sonra "platform yöneticiliği nerede okunuyor?" diye
  arayan geliştirici `impersonation.service.ts`'e **bakmaz**.
  **Düzeltme:** sınıfı `PlatformDataGateway`/`PlatformDataAccessService` gibi
  gerçek sorumluluğuna göre adlandır (dosya adı kebab-case kuralıyla birlikte),
  veya denetim yazıcısını aynı dosyada ayrı bir sınıfa al. **Sorumlu:** `backend`.
- **[SEV: low]** `apps/superadmin/src/features/tenants/tenant-status-label.ts:24`
  — yorum _"`satisfies` değil, **`assertNever` kullanılır**"_ diyor ama kod
  `:42` ve `:68`'de **elle** `const exhaustiveCheck: never = status` + `throw new
Error(...)` yazıyor; aynı kalıp `features/audit-log/audit-action-label.ts:28`'de
  **üçüncü** kez. ⭐ Uygulamada **mevcut** yardımcı var ve kullanılıyor
  (`src/errors/assert-never.ts:14`, tüketici `messages/messages.ts:269`).
  ⚠ Ölçüm: `apps/admin/src` içinde `exhaustiveCheck: never` kalıbı **0 kez**
  geçiyor ⇒ bu, bu Task'la doğan **yeni** bir tutarsızlık. Hem yorum↔kod sapması
  hem üç yerde tekrarlanan `throw` metni. **Düzeltme:** üç yerde
  `assertNever(status, '<bağlam>')` çağır, yorumu koru. **Sorumlu:** `frontend`.
- **[SEV: low]** `apps/superadmin/src/features/tenants/TenantListView.tsx:78-95`
  ↔ `:104-135` — dual-markup (`DataTable` ↔ `<ul>`) **aynı beş alanı iki kez**
  projekte ediyor (`name`/`slug`/`plan`/`status`/`createdAt`, `planName ?? …`
  ve `formatPlatformDate` **iki** yerde). Dual-markup kararı **meşru** (S4/S2,
  `DataTable`'ın sunum sınırı) ama **projeksiyon** paylaşılmıyor.
  ⚠ **Senaryo:** AC-7'ye altıncı bir kolon eklenince (ör. "son erişim") geliştirici
  masaüstü tablosuna ekler, `md:hidden` kart görünümünü **atlar** — mobilde kolon
  sessizce eksik kalır, mekanik kapı yok. **Düzeltme:** satır başına tek
  `toTenantRow(tenant)` projeksiyonu çıkar, iki görünüm onu tüketsin.
  **Sorumlu:** `frontend`.
- **[SEV: low]** `apps/api/src/platform/platform-audit-entry.types.ts:27` ↔
  `packages/trpc/src/schemas/platform.schema.ts:173` — **homonim tip.** İki farklı
  kavram aynı adı taşıyor: `PlatformAuditEntry` (apps/api) = **aktör bağlamı**
  (`actorUserId`/`ip`/`userAgent`, yazma girdisi); `PlatformAuditEntry`
  (packages/trpc) = **tel satırı** (`id`/`action`/`subject`/`createdAt`). Bedeli
  ölçüldü: `platform-read.port.adapter.ts:24` import'u
  `PlatformAuditEntry as PlatformAuditEntryWire` diye **alias**lamak zorunda.
  **Düzeltme:** apps/api tarafını `PlatformAuditActorContext` (veya
  `PlatformAuditWriteContext`) olarak adlandır — zaten "entry" değil, **kim/nereden**
  taşıyor. **Sorumlu:** `backend`.
- **[SEV: low]** `apps/api/src/platform/platform-admin-read.port.adapter.ts:33-44`
  — `platform_admin_signed_in` satırı, **2FA kapısı kararı verilmeden önce**
  yazılıyor (`requirePlatformAdmin` portu döndükten sonra 2FA kontrolü
  `platform-admin-procedure.ts:59-61`'de **middleware'de** yapılıyor) ⇒ 403
  `TWO_FACTOR_REQUIRED` ile **reddedilen** bir istek de denetim kaydına
  _"giriş yaptı"_ satırı bırakır. ⚠ Belirsizlik kodda da görünür:
  `apps/superadmin/e2e/superadmin-authz.spec.ts:66-74` yorumu **kendi içinde
  çelişiyor** ("BU AKIŞ … YAZMAZ" … "satır YİNE DE yazılabilir").
  ⚠ **Senaryo (denetçi):** `platform_audit_log`'daki `platform_admin_signed_in`
  satırlarını "başarılı platform erişimi" diye sayan kişi, 2FA'sı olmayan
  (dolayısıyla **hiçbir veriye erişemeyen**) bir yöneticinin reddedilen
  denemelerini de sayar. **Düzeltme:** ya yazmayı tam kapı geçildikten sonraya
  taşı (örn. `platformAdminProcedure`'ün `next()` öncesi son adımı), ya da
  e2e/kod yorumlarındaki belirsizliği giderip davranışı (`"kapıdan ilk geçiş
denemesi"`) **yazılı** hâle getir. **Sorumlu:** `backend`.

---

## 2. ÖZELLİKLE İSTENEN BEŞ KALEM

### ① `R-PO6` — üç `builder` beyanı **ELLE OKUNDU** ⇒ **DOĞRU**

| Yol                   | `PROCEDURE_SURFACE` beyanı                 | Router'daki **gerçek** builder                 | Sonuç            |
| --------------------- | ------------------------------------------ | ---------------------------------------------- | ---------------- |
| `platform.session`    | `procedure-surface.ts:121` → `'protected'` | `platform.router.ts:51` → `protectedProcedure` | ✅ **eşleşiyor** |
| `platform.tenantList` | `:122` → `'platformAdmin'`                 | `:63` → `platformAdminProcedure`               | ✅ **eşleşiyor** |
| `platform.auditLog`   | `:123` → `'platformAdmin'`                 | `:75` → `platformAdminProcedure`               | ✅ **eşleşiyor** |

`platform.session`'ın kapı **dışında** olması **doğru ve bilinçli** — ve bunu
beyanla yetinmeyip **yüzeyden** doğruladım: çıktı şeması
`platform.schema.ts:59-62` = `{ isPlatformAdmin, twoFactorEnabled }` ⇒ **sıfır**
kiracı verisi, **sıfır** başka-kullanıcı verisi; veri kaynağı
`impersonation.service.ts:134-148` `readPlatformSession` — **yalnızca** çağıranın
`userId`'siyle iki `findUnique`, **ASLA fırlatmaz, ASLA yazmaz**;
`userId` **girdiden değil** `ctx.auth.userId`'den geliyor
(`platform.router.ts:53`) ⇒ başka bir kullanıcının 2FA durumunu sorgulamak
**imkânsız** (varlık oracle'ı yok).
⇒ **Beyan deliğinden kaynaklanan bir yanlış beyan BULUNMADI.** AC-6'nın
türetildiği küme (`builder === 'platformAdmin'` ⇒ **tam 2** uç) **doğru**.

### ② `PrismaService.platform` getter'ı — **MEŞRU ERİŞİM NOKTASI**, katman ihlali **DEĞİL**

Gerekçeli görüş (üç ölçüm):

1. **Desen yeni değil, üçüncü kez uygulanıyor.** `prisma.service.ts` R-1'in
   **tek erişim noktası**; aynı dosya zaten tüketici başına **daraltılmış**
   getter'lar taşıyor: `db` → `AppPrismaDatabase` (`:115`), `connectionProbe` →
   `Pick<PrismaDatabase,'$queryRaw'>` (`:148`, tek tüketici
   `DatabaseHealthCheck`). `platform` → `Pick<…,'platformAdmin'|'platformAuditLog'|'plan'>`
   (`:136`) **birebir** o desen: en dar yüzey, tek tüketici, dosya içi yerel
   daraltma.
2. **Hiçbir mevcut yüzeyi genişletmiyor.** Üç delege de **platform seviyesi**
   (`tenant_id` yok, `PLATFORM_LEVEL_TABLES` üyesi) ⇒ RLS'li bir tabloya GUC'suz
   erişim **açılmıyor**; sır taşıyan Better Auth modelleri (`account`/`session`/
   `verification`/`two_factor`) ve `$queryRaw` bu tipte **yok**.
3. **Tek tüketici mekanik olarak doğrulandı.** `prisma.platform.*` taraması
   (`-r`, `apps/**`): **yalnızca** `impersonation.service.ts` (5 satır) + iki test
   dosyası. `platform/**`'in geri kalanı `PrismaService`'i **hiç** enjekte etmiyor
   ve KAPI B (`platform-impersonation-write-gate.test.ts:191-202`) bunu **kontrol
   kümesiyle vacuous olmadığı kanıtlanmış** bir taramayla zorluyor.

⇒ **Bulgu yazmıyorum.** Tek not (bulgu değil, gözlem): daraltma tipi `apps/api`'de
**yerel**; `packages/db` zaten `PlatformTenantWriter` adında bir platform-seviyesi
daraltma taşıyor ⇒ on üçüncü platform tablosu geldiğinde "platform yüzeyi"nin
**iki** tanımı olacak. `packages/**` bu Task'ta kapalıydı; tipin `packages/db`'ye
(`PlatformPrismaDatabase`) terfisi, o paketin açıldığı ilk sürümde **ucuz** bir
temizlik. Borç satırı yazmaya **değmez** (tek satırlık, kapsam açıldığında
görünür).

### ③ Bayat yorum — **TEYİT EDİLDİ** (doc↔davranış sapması, `low`)

`platform.router.ts:28-32` ile `tenant-exempt-paths.ts:227-229` **çelişiyor**;
üç yol kümeye **eklenmiş** (24 → 27) ve bu **doğru** davranış
(`reserved_subdomain` ⇒ allowlist dışı her yol 404). Yorumun ikinci yarısı
(`AUTH_EXEMPT_PATHS`) **doğru** — o küme 12'de kalmış.
⇒ **L1** (kayıtlı, S11'e devredilmiş). ⚠ **Ayrıca kayıtlı OLMAYAN ikinci bir
sapma buldum** (`platform.schema.ts:128-131`, **L2**) — aynı sınıf, aynı kök
neden: S5'in yorumları S7'nin R-PO4 kararından **önce** yazıldı. S11'in devri
**iki** satırı kapsamalı, bir değil.

### ④ `S9`'un iki bilinçli davranış değişikliği — **KABUL EDİLEBİLİR, bilgi kaybı YOK**

1. **Üç hata öneki → bir.** Ölçtüm: `tenant-cleanup.ts:62` artık tek
   `SQL_ERROR_LABEL = 'tenant-cleanup'` ve beş çağrı yerinin hepsi onu geçiyor
   (`:93,110,135-137,145-147`). ⭐ **Teşhis bilgisi kaybolmuyor**, çünkü
   `sql.ts:255` / `:295` hata metnine **başarısız SQL ifadesinin tamamını**
   gömüyor (`Denenen komut: docker exec … -c "<sql>"`) ⇒ hangi faz (silme mi,
   süpürme mi, sorgu mu) **SQL'den** okunuyor; önek yalnızca **hangi fabrika**
   sorusunu cevaplıyor ve ona **tek** cevap doğru. ⭐ `label`'ın parametre olarak
   korunması (sabit önek **dayatılmaması**) ikinci/üçüncü fabrikanın kendi
   kimliğini koruyor — doğru soyutlama sınırı.
2. **`maxBuffer` 50MB ikisinde de.** Yalnızca bir **üst sınırı** yükseltiyor;
   küçük çıktılarda davranış **bayt-birebir** aynı, storefront `ENOBUFS`
   savunması **kazanıyor**. Kayıp yok.

⇒ İkisi de **bulgu değil**.

### ⑤ Kopya ekseni — gerekçe **YETERLİ** (`totp.ts`), ama eksen **tam kapanmadı**

- **`sql.ts` birleşmesi doğru iş:** üç fabrika tek gövdeyi import ediyor
  (`tenant-cleanup.ts:59`, `platform-admin.ts:67`, storefront fabrikası), kapı
  _"tam olarak bu bir modül"_ diyor ⇒ metinsel eşitlik denetimine gerek kalmadı.
  ⭐ **Doğru DRY**: aynı sebeple değişen tek gövde.
- **`totp.ts` gerekçesi yeterli — üç ölçümle katılıyorum:** (a) e2e `apps/api`'yi
  import **edemez** (CLAUDE.md §3) ve etse Nest/Prisma'yı e2e sürecine çekerdi
  (ADR-0022 K1'in yazılı sınırı); (b) sapmanın tespiti **gürültülü**: e2e gerçek
  `/auth/two-factor/verify-totp` çağırıyor ⇒ parametre sapması **401/403 ⇒ kırmızı
  test**, sessiz yanlış-yeşil **değil** — bu, M2'deki Mailpit kopyasıyla **aynı**
  loudness sınıfı ama oradakinin aksine **paylaşılacak ev yok**; (c) doğruluk
  RFC 6238 Ek B'nin altı vektörüyle ölçülmüş ⇒ "bağımsız yazıldı ama aynı RFC"
  iddiası **kanıtlı**. `low` + yazılı vade (`totp-code-generator.port.ts`'in
  `digits`/`period`/hash'i değişen sürüm) **doğru** derece.
  ⚠ Tek şart: o borç satırı **kaynak dosyada** (`totp.ts:29-34`) yaşıyor —
  `S11` onu **ROADMAP borç tablosuna** taşımazsa, vadesi geldiğinde kimse
  bakmayacağı bir yerde kalır.
- ⚠ **Ama eksenin kapanmadığı yer var:** aynı e2e katmanında **Mailpit
  yardımcısı dört kopyada** ve orada **ev var** (`scripts/playwright/`) ⇒ **M2**.
  `sql.ts`'i çıkaran turda, **yanı başındaki** aynı sınıf kopya atlandı.

---

## 3. "YENİ BULGU SANMA" LİSTESİNE UYUM

Üçü de **bulgu yazılmadı**, hepsi okundu ve kayıtlı/vadeli kabul edildi:

1. `platform_audit_log`'un tamper-evident **olmaması** (`arkesoft_app` dört DML) —
   v0.0.20.1, **kullanıcı kararı**. ⚠ Linter kuralının **gevşetilmediğini**
   teyit ettim (migration'da RLS/REVOKE bloğu yok, `catalog-lint` kuralına
   dokunulmamış).
2. `@axe-core/playwright` yokluğu → v0.0.20.1.
3. `detail.tenantIds`'in **indekssiz** olması → ADR-0023'ün yazılı bedeli
   (v0.15.0). ⭐ `impersonation.service.ts:210`'un `detail: { tenantIds: [...] }`
   yazması bu kabulle **tutarlı**.
4. `base.ts`'in üç export'unun bu sürümde meşru tüketici bulamaması ve
   **yapay import yazılmaması** — ⭐ **doğru karar**; yapay tüketim borcu
   kapatmaz, **gizler**. Bulgu yazmıyorum ve ölü-export taramamda bu üç export'u
   **kapsam dışı** tuttum.

**Ayrıca "emsal var ⇒ bulgu yazmadım" dört kalem (şeffaflık için):**
`routeTree.gen.ts:21-41`'deki **5 `as any`** — TanStack Router **codegen** çıktısı,
dosya `/* eslint-disable */` ile başlıyor ve `apps/admin/src/routeTree.gen.ts`
**7** aynı kullanımı taşıyor (CLAUDE.md §2 "üretilen çıktılar hariç") ·
dört `eslint-disable-next-line @typescript-eslint/only-throw-error` (TanStack
`redirect()` sözleşmesi; `apps/admin/src/routes/_app.tsx:52,66` birebir emsal) ·
`catch {}` gövdeli dört blok (`apps/admin`'in **aynı** dosya/konumlarında var,
hepsi kullanıcıya mesaj **gösteriyor**, boş değil) ·
`PLATFORM_*_LIMIT` dört sabitinin `packages/trpc/src/index.ts:137-140`'tan
export edilip **sıfır** dış tüketicisi olması — `JOB_LIST_MAX_LIMIT`/
`JOB_LIST_DEFAULT_LIMIT` (`:44-45`) **aynı** durumda ⇒ yerleşik sözleşme,
bu Task'ın **regresyonu değil**.

---

## 4. KONTROL LİSTESİ

- [x] Tek sorumluluk ihlali arandı → **L6** (`ImpersonationService`, 7 metot/5'i
      ilgisiz); `platform/**`'in geri kalanı ince ve tek amaçlı.
- [x] Katman ve paket sorumluluk sınırları doğrulandı → `packages/ui`
      **değişmedi** (`@arkesoft/trpc`/`apps/*` bağımlılığı **yok**);
      `packages/trpc` **iş mantığı taşımıyor** (resolver gövdeleri tek ifade,
      `platform.router.ts:51-80`); `packages/db` iş mantığı **kazanmadı**;
      denetim yazma yan etkisi port arayüzünde **görünmüyor** ama bu **yazılı**
      ve `packages/trpc` mekanizmayı **bilmiyor** ⇒ ihlal değil;
      `PrismaService.platform` → **②'de gerekçeli meşru**.
- [x] Bağımlılık yönü korunuyor; döngüsel bağımlılık yok → `apps/superadmin`
      içinde `apps/*`'a veya `@arkesoft/{admin,api,storefront}`'a **tek** import
      yok (mekanik tarama); `platform/**` → `prisma`/`errors`/`request-context`
      (tek yön); `packages/trpc` `apps/*`'ı **import etmiyor**.
- [x] Dış sağlayıcılar arayüz arkasında; çekirdekte sağlayıcı dallanması yok →
      bu sürüm **dış sağlayıcı eklemiyor**; `if (provider === …)` sınıfı dallanma
      **0 eşleşme**.
- [x] Gerçek tekrar arandı (yüzeysel benzerlik işaretlenmedi) → **M2**, **L4**,
      **L5**, **L7**, **L8**; ⭐ **bilinçli olarak işaretlemediklerim** L4'te
      ayrı ayrı sayıldı (diverjan `panel-error`/`normalize-panel-error`, üç durum
      bileşeni, kabuk, `messages.ts`).
- [x] Gereksiz soyutlama ve erken genelleme arandı → **L3** (sıfır tüketicili
      zorunlu port üyesi) tek bulgu. ⭐ Ters yönde **iyi kararlar** ölçüldü:
      `platformAdminProcedure` **parametrik değil** (ikili kapı), tek `tone`
      prop'lu "GenericWall" **reddedilip** üç ayrı duvar yazılmış, Radix
      bağımlılığı **eklenmemiş**, ayrı `platform.impersonate` mutation'ı **yok**.
- [x] İsimlendirme tablosuna uyum kontrol edildi → dosyalar kebab-case, React
      bileşenleri PascalCase, tipler PascalCase, hata kodları
      SCREAMING_SNAKE_CASE (`PLATFORM_ADMIN_REQUIRED`,
      `PLATFORM_NETWORK_NOT_ALLOWED`), boolean'lar `is`/`has`/`can`
      (`isPlatformAdmin`, `isSigningOut`, `isPlatformAdminGuardedPath`),
      tRPC prosedürleri `namespace.action`. ⚠ İki sapma: **L6** (sınıf adı
      sorumluluğu anlatmıyor), **L9** (homonim tip). `data`/`temp`/`handle`/
      `process` sınıfı belirsiz ad **bulunmadı**.
- [x] `any` / `@ts-ignore` / gerekçesiz `as` arandı → el yazımı kaynakta
      **0 `any`**, **0 `@ts-ignore`/`@ts-expect-error`**. `as` kullanımları
      `as const satisfies …` (tip daraltma) ve Zod `parse` **sonrası** —
      gerekçesiz zorlama **bulunmadı**. ⭐ `platform-session-gate.ts:65-73` tip
      zorlamayı **açıkça reddedip** fail-closed `pending`'e düşüyor.
- [x] Hata yönetimi deseni doğrulandı; yutulan hata yok → iki yeni sınıf da
      `AppError`'dan türüyor, dört alanı taşıyor, `isRetryable: false`;
      sağlayıcıya/altyapıya özgü tip dışarı **sızmıyor**; `empty_allowlist`/
      `unknown_ip`/`ip_not_allowed` **tele çıkmıyor**; `catch {}` **yok**
      (dört `catch` bloğunun dördü de kullanıcıya mesaj üretiyor, admin emsali);
      beklenen durum için `null` dönüp çağıranı tahmine zorlama **yok**
      (portlar TOTAL). ⚠ Tek kenar durum: **M1** (hata yutulmuyor ama **etkisi**
      kalıcı olarak kaybediliyor).
- [x] Test kalitesi değerlendirildi (davranış mı implementasyon mu) → ⭐ **güçlü**:
      `platform-authz.isolation.test.ts` **10 senaryo** matrisi (5 rol × 2 uç) + **karşıt kanıt** (2FA açılınca **200**, `:197-209`) + RLS'in **iki yönlü**
      kanıtı (`:303` çapraz okuma `null`, `:309` kendi kiracısı **okunabiliyor**);
      `platform-impersonation-audit-count.test.ts` **sayıyor** (`count(*)`),
      varlık kontrolü yapmıyor, ve **aşırı-bastırma** karşıt kanıtı taşıyor
      (`:177` farklı session ⇒ 2 satır); grep kapıları **kontrol kümesiyle**
      vacuous-değil kanıtlı (`:199-202`). ⭐ Mock gereğinden fazla **değil** —
      canlı Nest + Postgres. `test.skip` **yok**.
      ⚠ Davranışı test etmeyen test **bulunmadı**;
      `platform-audit-entry-negative-scope.test.ts:49-62`'yi totoloji sandım,
      **değil**: jetonlar çalışma anında birleştirildiği için o test
      **needle yazım sapmasını** yakalıyor ⇒ bulgu yazmadım.
- [x] Ölü kod arandı → **L3** (sıfır tüketicili zorunlu port üyesi) tek gerçek
      bulgu. `assertNever` **ölü değil** (`messages.ts:269`). Yorum satırına
      alınmış kod / "sonra kullanacağız" dosyası **bulunmadı**. `src/index.ts`
      silinmiş (R7) ⇒ ölü kütüphane girişi **temizlenmiş**.
- [x] Yorumlar *neden*i anlatıyor ve güncel → ⭐ genel seviye **çok yüksek**
      (her dosya başı "neden bu dosya var" + reddedilen alternatif).
      ⚠ İki bayat yorum (**L1**, **L2**), bir yorum↔kod sapması (**L7**),
      bir kendi içinde çelişen yorum (**L10**'un e2e tarafı). Tamamı Türkçe,
      kod/ad İngilizce.
- [x] Her bulgu `dosya:satır` içeriyor → **12/12**.

---

## 5. ÖLÇÜMLER

- **Elle okunan dosya:** **34** (tam veya hedefli bölüm) —
  `apps/api/src/platform/**` (8/8, tamamı) · `packages/trpc`'nin 5 platform
  dosyası + `procedure-surface.ts` · 4 `apps/api` platform testi ·
  `prisma.service.ts` · `trusted-origins.ts` · `tenant-exempt-paths.ts` ·
  2 hata sınıfı · `scripts/playwright/sql.ts` + `totp.ts` (dosya başı) ·
  `apps/superadmin`'in 11 dosyası · `apps/admin`'in 2 karşılaştırma dosyası.
- **Mekanik tarama (`Grep`, hepsi açık `path` ile — AGENT_BASELINE §4 dersi 4):**
  **14** tarama (`any`/`@ts-ignore`/`eslint-disable`, çapraz-app import,
  `catch`, `assertNever`/`exhaustiveCheck`, Mailpit kopyaları, `prisma.platform`,
  ölü export adayları, `platform.` muaf yollar, satır sayıları).
- **`any` sayısı:** el yazımı kaynakta **0**; üretilen `routeTree.gen.ts`'te
  **5** (`apps/admin`'de **7**, emsal — CLAUDE.md §2 istisnası).
- **`@ts-ignore`/`@ts-expect-error`:** **0**. **`eslint-disable`:** **4**
  (tamamı `only-throw-error`, TanStack `redirect()`, admin emsali) + 1 üretilen
  dosya başı.
- **En büyük fonksiyon:** `apps/superadmin/src/features/two-factor/TwoFactorSetupWizard.tsx:47-271`
  → **225 satır** (React bileşeni; ⭐ **karar mantığı zaten ayrılmış**
  → `two-factor-setup-controller.ts`, gövde dört adımın JSX'i).
  İkinci: `TenantListView.tsx:33-139` → **107** ·
  `_app.tsx:144-232` (`AppLayoutComponent`) → **89** ·
  `sql.ts:175-219` (`resolvePostgresContainerName`) → **45** ·
  `platform/**`'in en büyüğü `impersonation.service.ts:201-228`
  (`runImpersonated`) → **28**.
- **`DOĞRULANAMADI`:**
  - **Hiçbir komut koşturulmadı** (`Bash` aracı yok) ⇒ bu raporun **tüm**
    ölçümleri **statik okuma**; handoff'un kapı sayıları (build 14/14,
    typecheck 23/23, test 765, isolation 11/11, guards 18/18, e2e 4/4)
    **Orkestratör'ün** ölçümüdür, bu gate **teyit etmedi**.
  - **M1'in negatif kanıtı** koşturulamadı. **Mutasyon tarifi (devreden ajan
    için):** `impersonation.service.ts`'in `writeAuditRow`'una geçici
    `throw new Error('kasıtlı')` koy → `npx vitest run platform-impersonation-audit-count.test.ts`
    (paket dizininden; ⚠ `pnpm --filter … test -- <desen>` **filtre uygulamıyor**,
    S1 ölçtü) → `ensureSignableRecorded` çağrısını **iki kez** sarmalayan bir test
    ekle: ilk çağrı reddedilsin, `throw`'u kaldır, ikinci çağrı yapılsın ⇒
    **beklenen (bugünkü, hatalı) sonuç:** `count(*) === 0`;
    **düzeltme sonrası beklenen:** `count(*) === 1`.
  - **L4'ün tam satır bütçesi** bayt-bayt diff ile ölçülmedi (`Bash` yok);
    rakam (~500 özdeş satır) boş-olmayan satır sayımından (`Grep` count) ve
    dosya başı "BİREBİR aynısı" beyanlarından **tahmin**.
  - `guards.sh` K1(d) ve bundle bütçesi **koşturulmadı** — S9/S10'un mutasyon
    kanıtları rapor edilmiş, bu gate **tekrarlamadı** (kapsam: `devops`/`qa`).

---

## 6. TEKNİK BORÇ SATIRLARI (`docs`/`S11` kopyalayabilir)

| SEV    | Dosya:satır                                                             | Açıklama                                                                                                                                  | Sorumlu    | Vade önerisi                |
| ------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------- |
| medium | `apps/api/src/platform/impersonation.service.ts:160-173`                | `ensureSignInRecorded` idempotency işaretini yazmadan ÖNCE koyuyor ⇒ başarısız audit yazması "giriş" satırını süreç ömrü boyunca bastırır | backend    | **bu sürüm** (tek satır)    |
| medium | `apps/superadmin/e2e/fixtures/platform-admin.ts:72,126-194`             | Mailpit doğrulama yardımcısı 4. kopya; `scripts/playwright/mailpit.ts` evi mevcut ve ölçülmüş                                             | devops     | **bu sürüm** veya v0.0.20.1 |
| low    | `packages/trpc/src/routers/platform.router.ts:28-32`                    | Bayat yorum: üç yol `TENANT_EXEMPT_PATHS`'e EKLENDİ (24→27)                                                                               | docs (S11) | bu sürüm                    |
| low    | `packages/trpc/src/schemas/platform.schema.ts:128-131`                  | Bayat yorum: `platform.session` denetim satırı YAZMAZ (R-PO4)                                                                             | docs (S11) | bu sürüm                    |
| low    | `packages/trpc/src/ports/trpc-error-factory.port.ts:67`                 | `platformAdminRequired()` zorunlu port üyesi, sıfır üretim tüketicisi (+ `userId?` gevşemesi)                                             | backend    | v0.0.22                     |
| low    | `apps/superadmin/src/api/transport-aware-fetch.ts:17-94` (ve 8 dosya)   | admin↔superadmin özdeş panel altyapısı (~500 satır), paylaşılan ev yok, sapma sessiz                                                      | architect  | v0.0.22                     |
| low    | `apps/api/src/platform/impersonation.service.ts:111-148`                | `requirePlatformAdmin`/`readPlatformSession` aynı iki sorguyu tekrarlıyor                                                                 | backend    | v0.15.0                     |
| low    | `apps/api/src/platform/impersonation.service.ts:93`                     | `ImpersonationService` adı 7 metodun 5'ini anlatmıyor (SRP/ad)                                                                            | backend    | v0.15.0                     |
| low    | `apps/superadmin/src/features/tenants/tenant-status-label.ts:24,42,68`  | Yorum `assertNever` diyor, kod elle `exhaustiveCheck: never` (3 yer)                                                                      | frontend   | v0.0.20.1                   |
| low    | `apps/superadmin/src/features/tenants/TenantListView.tsx:78-95,104-135` | Dual-markup aynı 5 alanı iki kez projekte ediyor; tek projeksiyon yok                                                                     | frontend   | v0.0.20.1                   |
| low    | `apps/api/src/platform/platform-audit-entry.types.ts:27`                | `PlatformAuditEntry` homonimi (tel satırı ↔ aktör bağlamı), alias zorunlu                                                                 | backend    | v0.15.0                     |
| low    | `apps/api/src/platform/platform-admin-read.port.adapter.ts:33-44`       | `platform_admin_signed_in` 2FA reddinden ÖNCE yazılıyor; e2e yorumu çelişkili                                                             | backend    | v0.15.0                     |

⚠ `scripts/playwright/totp.ts:29-34`'teki **kaynak-içi** borç kaydı (sapma riski,
`low`, devops) **ROADMAP tablosuna taşınmalı** — bu gate onu **yeni bulgu
saymadı**, yalnızca **taşınma** gereğini işaret ediyor.
