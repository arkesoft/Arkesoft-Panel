# T-014 — `solid` gate · Tur 1

Tarih: 2026-11-04 · Sürüm: ROADMAP **v0.0.14** (RBAC ve yetki modeli) · Dal: `main`

```
GATE: solid
SONUÇ: PASS
```

FAIL kuralı (AGENT_BASELINE §4): `critical` 0 · `high` 0 · `medium` **1** · `low` **9**
→ 1–2 `medium` = **PASS**, bulgular teknik borca. `low`'lar için düzeltme turu
**koşturulmaz** (§4, 2026-11-01) — borç satırlarının metni aşağıda hazır.

---

## BULGULAR

### [SEV: medium] M-1 · `AppError.context` hiçbir yere yazılmıyor — üç yeni dosya aksini BEYAN ediyor

**Yer:** `packages/trpc/src/authz/permission-procedure.ts:75-78` ·
`packages/trpc/src/trpc.ts:167-179` (mekanizma) ·
`apps/api/src/errors/domain/permission-denied.error.ts:16-28` ·
`apps/api/src/errors/domain/owner-membership-protected.error.ts:27-28` ·
`apps/api/src/errors/domain/invitation-resend-too-soon.error.ts:17-20` ·
`apps/api/src/errors/domain/pending-invitation-limit-reached.error.ts:19-21`

**Ne:** hata yönetimi deseni + "beyan ≠ gerçeklik" (gözlemlenebilirlik).

**Ölçüm.** `permission-procedure.ts:76-78` birebir şunu yazıyor: *"izin adı ve rol
`AppError.context`'e girer ve `apps/api`'nin hata sınırı onu loglar."* Mekanizmayı
açtım: `trpc.ts:167-179`'daki `appErrorBoundary` `next()`'in sonucunu okuyor, `AppError`'ı
`toTrpcError` ile çevirip **fırlatıyor** ve **hiçbir log çağrısı yapmıyor**; dosyadaki tek
`ctx.logger.warn` `errorFormatter`'ın `cause`-parse-fail dalında (`:121`). tRPC yanıtı
kendisi ürettiği için Nest'in hata filtresi bu yolu **hiç görmüyor**. S5 bunu bağımsız
olarak ölçtü: `MAIL_DELIVERY_FAILED` içeren log kaydı **0**.

**Neden kusur.** `PERMISSION_DENIED`'ın `details`'ini boş bırakma kararının **tek
gerekçesi** "bu iki alan tele değil loga gider"dir (`permission-denied.error.ts:15-22`).
Ölçülen gerçeklik: tele de girmiyor, **loga da girmiyor** → `permission`, `role`,
`OwnerMembershipProtectionReason`, `retryAfterSeconds`, `pendingCount/limit` ve
`isRetryable` **hiçbir yerde kaydedilmiyor**. Yeni RBAC yazma yüzeyinde bir operatör
*"kim hangi izinden reddedildi"* sorusunu **cevaplayamıyor**; başarılı rol değişikliği
`audit_log`'a düşerken **red tamamen görünmez**. CLAUDE.md §4 `warn` seviyesini
("beklenen ama anormal") tam bu sınıf için tanımlıyor. Ayrıca
`owner-membership-protected.error.ts:35`'in *"log tüketicileri bu değeri filtreler"*
cümlesi bugün **yanlış**.

**Kapsam notu (severity gerekçesi):** log boşluğu **v0.0.6'dan beri** var, T-014'ün
gerilemesi değil; T-014'ün ürettiği şey **yanlış beyan** ve boşluğun **yetki yüzeyine**
taşınması. Reddin denetim kaydına yazılması ROADMAP v0.0.14 kapsamında **değil**
(*"yetki değişikliklerinin"* denetimi) → `high` değil.

**Önerilen yön:** (a) `appErrorBoundary` enjekte edilmiş `ctx.logger`'a sahip — `AppError`
sınırdan geçerken **tek bir** yapılandırılmış kayıt yazılsın (4xx → `warn`, 5xx →
`error`; alanlar: `code`, `httpStatus`, `isRetryable`, `context`). Seviye/alan politikası
`architect` kararı. (b) Politika yazılana kadar dört dosyadaki *"hata sınırı onu loglar"*
cümleleri **gerçeğe çekilsin** (bugün loglanmıyor, borç kaydı şu). ⚠ (b) tek başına
yetmez — kararın sahibi `architect`.

**Sorumlu:** `architect` (politika) + `backend` (uygulama) · **vade:** v0.0.18

---

### [SEV: low] L-1 · Var olmayan test dosyasına atıf veren BAĞLAYICI kısıt

**Yer:** `packages/trpc/src/authz/permission-usage.ts:28`

Yorum, kaydı okuyan testin `permissionProcedure`'ü çağırmaması kısıtını açıklarken
*"izin middleware'inin DAVRANIŞINI sınayan testler ayrı bir dosyada yaşar
(`permission-procedure.test.ts`)"* diyor. **Ölçüm:** repo genelinde
`rg "permission-procedure\.test"` → **1 eşleşme, o da bu satırın kendisi**. Dosya
yok; davranış testleri `packages/trpc/src/__tests__/member-procedures.test.ts`'te.
Kardeş dosya aynı kısıtı **doğru** dosya adıyla yazıyor
(`authz-consistency.test.ts:10`) → aynı bağlayıcı kuralın iki ifadesi **çelişiyor** ve
`:28`'i izleyen okuyucu olmayan bir dosya arıyor.

**Yön:** dosya adını düzelt (tek kelime). **Sorumlu:** `backend` · **vade:** v0.0.15

---

### [SEV: low] L-2 · `expiresAt` indeks gerekçesi, aynı sürümde yazılan sorguyla çelişiyor

**Yer:** `packages/db/prisma/schema.prisma:427-429` ↔
`apps/api/src/member/member.service.ts:572-574`

Şema yorumu: *"`expiresAt` üzerinde indeks YOK: süresi geçmiş davet **SORGULANMAZ**,
yalnızca tek satır okunurken kontrol edilir. … bu tablo davet başına yazılır,
**taranmaz**."* Oysa `assertPendingInvitationCapacity` **her yeni davette**
`tx.tenantInvitation.count({ where: { expiresAt: { gt: … } } })` koşuyor — bu bir aralık
taraması, *"tek satır okuma"* değil. Üstüne süresi geçmiş satırlar **hiç
temizlenmiyor** (`member.service.ts:554-556`: *"temizlik işi yok, satır yerinde
durur"*) → kiracı başına taranan küme **sınırsız** büyüyor (üst sınır yalnızca
**bekleyen** daveti sayıyor).

Bugün ölçülebilir bir maliyet yok (≤50 bekleyen + az sayıda süresi geçmiş satır; kiracı
daraltmasını `(tenant_id, email)` indeksi veriyor) → `low`. Kusur, iddianın **yazıldığı
sürümde yanlışlanmış** olması.

**Yön:** yorumu gerçek sorguya çek; saklama/temizlik kararını `AuditLog`'un saklama
politikası kalemiyle (v0.0.17) birlikte ele al. **Sorumlu:** `db` + `docs` · **vade:**
v0.0.17

---

### [SEV: low] L-3 · `AlreadyMemberError`'ın `context` parametresi gereğinden geniş

**Yer:** `apps/api/src/errors/domain/already-member.error.ts:15-24`
(çağrı yerleri: `apps/api/src/member/member.service.ts:547` ve `:613`)

Dosya başı yorumu: *"`context` E-POSTA TAŞIMAZ (CLAUDE.md §4) … Taşınan tek alan
`userId`."* Parametrenin tipi ise `Record<string, unknown>` → `new AlreadyMemberError({
email })` **derlenir**. İki çağrı yeri de `{ userId }` geçiyor, yani garantiyi bugün
**disiplin** sağlıyor, **tip** sağlamıyor. T-014'ün diğer beş hata sınıfı dar tipli
parametre kullanıyor (`PermissionDeniedError(Permission, TenantRoleWire)`,
`PendingInvitationLimitReachedError(number, number)`). `:30`'da emsal gösterilen
`JobNotFoundError` **farklı bir durum**: orada parametrenin **sıfır** çağrı yeri var
(*"arayüz hazır"*), burada iki tane.

**Yön:** `constructor(context?: { readonly userId: string })`. **Sorumlu:** `backend` ·
**vade:** v0.0.17

---

### [SEV: low] L-4 · KAPI 3 yalnızca `import` ile BAŞLAYAN satırı tarıyor

**Yer:** `apps/api/src/__tests__/production-write-path-grep.qa.test.ts:238-243`

`findLoggerImports` satırları `line.startsWith('import')` ile süzüyor. Çok satıra sarılmış
bir import (`import {\n  ROOT_LOGGER,\n} from '../logging/logging.tokens.js'`) bu kapıdan
**görünmez** geçer — `from` satırı `import` ile başlamıyor. Dosya **yorum tarama** kör
noktasını (`:233-236`) yazılı olarak belgeliyor ama bunu belgelemiyor; bugün kontrol
dosyasındaki import tek satırda olduğu için kapı yeşil.

**Yön:** import **ifadesini** (çok satırlı blok dahil) tara veya sınırı yorumda belgele.
**Sorumlu:** `qa` · **vade:** v0.0.17

---

### [SEV: low] L-5 · "append-only" yalnızca `create` için kapılanmış

**Yer:** `apps/api/src/__tests__/production-write-path-grep.qa.test.ts:79,196-203`

KAPI 1 yalnızca denetim tablosunun **yazma (insert)** delegesini arıyor
(`['.auditLog','create'].join('.')`). Oysa `TenantTransactionClient` (`client.ts:254`)
`auditLog`'un **tüm** delege yüzeyini taşıyor → bir serviste
`tx.auditLog.update(...)`/`tx.auditLog.delete(...)` yazmak **derlenir** ve **hiçbir
kapıya çarpmaz**. Append-only'nin uygulama katmanı tanımı
(`packages/db/src/__tests__/helpers/audit-log.probe.ts:35-46`'nın dört maddeli gerekçesi
tam olarak bunu söylüyor: *"uygulama katmanının hangi yazma yollarını AÇTIĞI hakkında bir
iddia"*) bu iki fiil için **mekanik bekçisiz**.

**Yön:** KAPI 1'e `.auditLog.update` / `.auditLog.delete` için de sıfır-eşleşme assert'i
ekle (aynı vacuous-olmama kontrolüyle). **Sorumlu:** `qa` · **vade:** v0.0.17

---

### [SEV: low] L-6 · Üretim Redis anahtar uzayının üçüncü kopyası (test tarafı DRY)

**Yer:** `apps/api/src/__tests__/member-invite-flow.test.ts:74,165-173`
(kanonik: `apps/api/src/__tests__/helpers/create-test-app.ts`'in
`flushRateLimitCounters`'ı)

`flushAuthRateLimitCounters` yerel kopyası `'platform:auth:*'` desenini **literal**
taşıyor; yorumu bunun üçüncü kopya olduğunu (`trpc-full-chain-domain-error.test.ts`
emsali) kendisi söylüyor. Paylaşılan fabrikayı `providerOverrides` ile genişletmeyi
reddetmek **doğru** karardı (erken genelleme) — kusur orada değil, **üretime ait bir
sabitin kopyalanmasında**: anahtar uzayı değişirse kopyalar sessizce hiçbir şey
temizlemez ve kayıt ucu **10/saat** sınırına çarptığı için süit **flaky** olur (S5 bu
riski kendi raporunda yazdı). T-014'ün kendi kuralı bu sınıfı zaten yasaklıyor:
*"sabitler kopyalanmayacak, import edilecek"* (`member.constants.ts:10-12`,
`audit-log.writer.ts:43-44`).

⚠ **Dördüncü kopya doğarsa bu bulgu `medium` olur.**

**Yön:** anahtar önekini (veya flush yardımcısını) **tek** yerden dışa aç ve import et;
`createSessionForEmail` ikizi gerekçeli, **o kalabilir**. **Sorumlu:** `backend`/`qa` ·
**vade:** v0.0.17

---

### [SEV: low] L-7 · `MemberService.invite` — `findFirst` sırasız, kıyas duyarsız

**Yer:** `apps/api/src/member/member.service.ts:144-147`

`user.findFirst({ where: { email: { equals, mode: 'insensitive' } }, select: { id } })` —
`orderBy` **yok**. `app_user.email` benzersizliği büyük/küçük harfe duyarlı olduğu için
`A@x.com` ve `a@x.com` **iki satır** olarak var olabilir; o durumda seçilen satır
**belirsiz** ve *"zaten üye mi"* ön kontrolü **yanlış hesabı** sınar. `:140-143`'ün
yorumu ise duyarsız aramanın tam bu senaryoyu engellediğini söylüyor.

Güvenlik açığı **değil**: gerçek savunma `(tenant_id, user_id)` benzersizliği +
kabul anındaki `AlreadyMemberError` (`:605-618`). Sonuç yalnızca gereksiz bir davet
e-postası ve kabulde 409.

**Yön:** deterministik sıra (`orderBy: { createdAt: 'asc' }`) ver veya yorumdaki
garantiyi sınırla. **Sorumlu:** `backend` · **vade:** v0.0.17

---

### [SEV: low] L-8 · `TrpcContext` doc'u "Beş alan" diyor, altı madde sayıyor

**Yer:** `packages/trpc/src/context/trpc-context.types.ts:101-112`

Liste: `requestId`, `logger`, `auth`, `tenant`, `ports`, `errors` → **altı**. Sayı
v0.0.6'dan **bayat** (T-014'ün gerilemesi değil) ama dosya bu sürümde **düzenlendi** ve
aynı yanlış sayı `architect`'in K-A7'sinde de kopyalandı (*"beş alan korunur"*). S3'ün
R-PO9 çözümü bu sınıf için zaten yazılı: **sayıyı kopyalama, kaynağa atıf ver.**

**Yön:** sayıyı kaldır veya altıya çek — bu dosyaya yapılacak ilk düzenlemede
("yolu üstündeyse kapat"). **Sorumlu:** `backend`/`docs` · **vade:** v0.0.17

---

### [SEV: low] L-9 · Tip pini doc'unda iki bayat sayı/satır atfı

**Yer:** `packages/db/src/__tests__/type-pins/auth-model-narrowing.pin.ts:380-381` ve
`:399-401`

1. `:380-381`: *"Beklenen `TenantTransactionClient` anahtar kümesi — `client.ts`'in
   `Pick<>` literaliyle BİREBİR aynı **İKİ üye**."* Küme bugün **dört** (`:409-410`,
   `client.ts:254`) ve **aynı doc bloğu** 13 satır sonra bunu *"İKİ üyeden DÖRT üyeye
   çıktı"* diye düzeltiyor (`:394`) → blok kendi kendisiyle çelişiyor.
2. `:399-401`: doc'a yapıştırılan gerçek `tsc` çıktısı `…pin.ts(383,12)` diyor; S1'in
   kendi düzenlemesi doc bloğunu büyüttüğü için **bugün 383. satır bir yorum satırı**,
   jenerik pinin dönüş ifadesi **:440**. Kalıcı denetim kaydı olmak için yazılmış bir
   belge, kendi kanıtının yerini **yanlış** gösteriyor (⚠ `po` R-PO1'in `:353`→`:383`
   düzeltmesiyle **aynı sınıf** hata, bir tur sonra tekrarlanmış).

**Yön:** üye sayısını kopyalamayı bırak (kaynağa atıf); satır numarası yerine
**fonksiyon adını** yazıp çıktıyı sadeleştir. **Sorumlu:** `db` · **vade:** v0.0.17

---

## ON İKİ İNCELEME NOKTASI — tek tek sonuç

| # | Konu | Sonuç |
| - | ---- | ----- |
| **1** | `AuditAction` `Prisma.AuditLogCreateInput['action']`'dan türetildi | ✅ **Gerekçe geçerli, doğrulandı.** `packages/db/src/index.ts:52` `Prisma`'yı **zaten tip olarak** dışa açıyor → yeni export satırı gerçekten gerekmiyor. Türetme üretilen enum'un ta kendisi: `Record<AuditAction,…>` tamlığı **gerçek** (S4'ün M2/M2b'si iki yönde ölçtü). ⚠ **Daha iyi alternatif yok, ama seçim şanslı değil BİLİNÇLİ:** alan-güncelleme sarmalayıcısı (`… \| EnumFieldUpdateOperationsInput`) yalnızca `UpdateInput`'ta doğar; `CreateInput` seçimi bu yüzden doğru. Kolona bir gün `DEFAULT` gelirse alan opsiyonelleşir ve indeksleme `… \| undefined` üretip `Record` anahtarını **gürültülü** kırar — sessiz sapma yolu yok. |
| **2** | `MAIL_TRANSPORT` kendi modülüne çıkarıldı, `AuthModule.exports` değişmedi | ✅ **Gerekçe geçerli ve ölçülebilir.** `auth.module.ts` export yüzeyi tek token'da kaldı (`git diff` boş, S4 ölçtü) → sertleştirme yorumunun iddiası **literal olarak** doğru kalıyor. `mail.module.ts:74-80` yalnızca **token**'ı açıyor, `MailTransportResource`'u (somut SMTP sınıfı + yapılandırma) **açmıyor** → tüketici arayüzü görüyor, sağlayıcıyı bilmiyor (§10 md 12'nin ruhu). Tek örnek garantisi Nest semantiğinden geliyor, beyandan değil. Dizinin `auth/mail/` altında kalması da gerekçeli (v0.9.0'da tek parça taşınacak). |
| **3** | `PROCEDURE_SURFACE` ayrımlı birleşim, `{kind, permission?}` değil | ✅ **Tutuyor ve `architect`'in tasarımından güçlü.** `procedure-surface.ts:42-63`: `builder: 'permission'` `permission`'ı **zorunlu** kılıyor, izinsiz girdide alan **hiç yok**, birleşim **kapalı** ve kimlik gerektirmeyen taban builder listede **yok** (ölü sözlük değeri yazılmamış). ⚠ Ayrımcı alan adı `kind` **değil** `builder` seçilmiş — doğru karar: `kind` bu kod tabanında zaten `TrpcAuthState`/`TrpcTenantState`/`TenantResolution`'ın ayrımcısı. |
| **4** | AC3(c) sayı yerine çoğul küme | ✅ **Tutuyor; brief'in istediği sayı eşitliğinden güçlü.** `authz-consistency.test.ts:196` sıralı çoğul küme karşılaştırıyor (izin **adı** sapmasını da yakalar), **üstüne** `:179-181` kardinalite 9, `:199-202` izinli kayıt sayısı 5, `:215-220` izinsiz dört yolun **ad listesi**. Dört assert birbirinin kör noktasını kapatıyor. |
| **5** | `permissionProcedure` ayrı dosya, `trpc.ts`'in kodu değişmedi | ✅ **Tutuyor.** `trpc.ts:17-22` beşinci basamağın **yerini** söylüyor → R-A10 sınıfı borç doğmuyor. Dönüş tipi `ReturnType<typeof buildPermissionGate>` (`permission-procedure.ts:53`) — elle yazılmış ikinci tRPC tipi **yok**. Ayrım aynı zamanda **bağımlılık yönünü** koruyor: taban merdiven yetki modeline (katalog + kullanım kaydı) bağlanmıyor. `index.ts`'ten export edilmediği `dist` transitif kapanışıyla **teyit edildi**. |
| **6** | Harness'e port override alanı eklenmedi | ✅ **Gerekçe geçerli ve seam DAHA İYİ.** `harness.ts:601` `membershipRole?: TenantRoleWire \| null`; `:656-659` `??` **kullanmıyor** çünkü `null` ("üyelik satırı yok") **meşru** bir değer — bu incelik yazılı. Sahteler **kayıt tutuyor** (`memberWriteCalls`, `membershipReadCalls`) → testler davranışı değil *argümanları ve çağrı sayısını* ölçebiliyor (aşırı mock **yok**). Alan adı gerekçesi (grep kapısının `?:` araması) gerçek. |
| **7** | R-PO4 — append-only tabloya prob UPDATE/DELETE yazıyor | ✅ **Ayrım İKNA EDİCİ ve üç ayağı mekanik.** *"Append-only, hangi SQL fiillerinin fiziksel olarak uygulanabileceği hakkında bir iddia değil"* — doğrulandı: `arkesoft_app` dört DML yetkisinin dördüne **gerçekten** sahip (`lintAppRoleDmlPrivileges` bunu **zorunlu tutuyor**), prob üretimden **erişilemez** (`__tests__/`, paket `exports` yüzeyinde değil), ve o iki yol **olmadan** RLS'in UPDATE/DELETE'i filtrelediği **ölçülemezdi** (S3'ün M2'si yedi senaryonun beşinin buna bağlı olduğunu gösterdi). Gerekçe, okuyucunun kafasının karışacağı **yere** yazılmış. ⚠ **Tek açık:** iddianın **üretim** yarısının mekanik bekçisi yok → **L-5**. |
| **8** | Probda `email`/`tokenHash` rastgele | ✅ **Doğruluk ön koşulu, teyit edildi.** `tenant-invitation.probe.ts:65-68,95,101`: tablo **iki** kiracı kapsamlı UNIQUE taşıyor → sabit değerlerle senaryo 2'nin INSERT'i **UNIQUE ihlali** yüzünden reddedilir ve `rejects.toThrow()` **yanlış sebeple** yeşil yanardı. ⚠ Argümanın **ikinci yarısı da yerinde**: UPDATE alanı olarak `expiresAt` seçilmiş (`:131`) çünkü **hiçbir kısıt taşımıyor** → reddin tek olası sebebi RLS. İki karar birbirinin aynası ve ikisi de yazılı. |
| **9** | INV-OWNER kodda CAS, DB kısıtı değil | ✅ **Gerekçe geçerli; üç red ölçülmüş.** Kodda doğrulandı (`member.service.ts:455-462`): `role: 'owner'` yüklemi `where` **içinde**, `if (demoted.count === 0) throw` **yük taşıyor** (S4 ham SQL'de, S5 M4 ile HTTP'de yokluğunun write-skew ürettiğini gösterdi). Üç DB alternatifinin reddi ayakta: Prisma kısmi indeks **ifade edemez**; FORCE RLS altında trigger GUC'suz **her zaman 0 satır** görür (**sessizce izin verir**) ve aşmak §10 md 4 ihlali; `Tenant.ownerUserId` **ikinci doğruluk kaynağı**. ⚠ Kalıntı **doğru etiketlenmiş**: bu kod+kapı garantisi, **DB garantisi değil** ve hiç kimse *"R-A10 kapandı"* demedi. |
| **10** | AC1 matrisi iki katmanlı | ✅ **Gerekçe geçerli ve her iki katman gerekli.** `member-authz.test.ts:206-273` literal ayak (`readonly`→403, `owner`→2xx) **ve** `expect(ROLE_PERMISSIONS.readonly).not.toContain(…)` — beklenti katalogdan **türetilmiyor**, katalogla **karşılaştırılıyor**. `:334-370` türetilmiş ayak, üstüne `expect(remainingRoles).toEqual(['admin','staff','support'])` → **türetmenin kendisi** vacuous değil. Yalnızca türetme olsaydı katalog sapması sessizce takip ederdi; yalnızca literal olsaydı üç rol **kör** kalırdı. İkisi birden **doğru**. |
| **11** | `isRetryable` ölçümü port sınırına taşındı | ⚠ **Ölçüm doğru, SONUCU S5'in borç satırından BÜYÜK → M-1.** Mekanizmayı bağımsız olarak teyit ettim (`trpc.ts:167-179`). Yer değiştirmesi **meşru** (bayrak tele girmiyor, hata loglanmıyor → sınırda ölçmek tek dürüst yol) ve *"servis hatayı yutmadı"* kanıtı olarak da **değerli**. Ama ortaya çıkardığı olgu `low` değil: `AppError.context`'in **hiç yazılmaması**, `PERMISSION_DENIED`'ın `details`'ini boş bırakma kararının **tek gerekçesini** çürütüyor. |
| **12** | `createTestApp` genişletilmedi, iki yerel ikiz | ⚠ **Kararın kendisi DOĞRU, bir ayağı borç.** Paylaşılan fabrikaya `providerOverrides` eklemeyi reddetmek **erken genelleme**den kaçınmaktır (KISS) ve `createSessionForEmail` ikizinin gerekçesi **gerçek** (`auth-fixture.ts` adresi döndürmüyor, dosya dokunma listesinde değil). ⚠ Ama `flushAuthRateLimitCounters` **üretime ait bir Redis anahtar uzayını kopyalıyor** ve bu T-014'ün kendi *"kopyalama, import et"* kuralının ihlali → **L-6**. `createMemoryLogStream` de üçüncü kopya ama **test-yerel** bir yardımcı (üretim sabiti taşımıyor) → bulgu değil. |

---

## KENDİ TARAMAM — bulgu üretmeyen kontroller

**Katman ve paket sınırları (CLAUDE.md §3, ADR-0009 md 5).** `rg "from '@arkesoft/db'"
packages/trpc/src` → **0** (üç eşleşmenin tümü **yorum**: `trpc-context.types.ts:32`,
`tenant-summary.schema.ts:4,5`). Kapı yalnızca grep değil: `packages/trpc/eslint.config.mjs:22`
`no-restricted-imports` ile paketi **adıyla** yasaklıyor ve gerekçeyi mesaja yazıyor.
`packages/ui`/`apps/admin` diff'i **boş**. `packages/trpc` hiçbir `apps/*`'a bakmıyor.
İş mantığının yeri doğru: dört resolver **tek ifade** (`member.router.ts:57,88,98,106`),
adaptörler **sıfır** iş kuralı (`member-write.port.adapter.ts` — dört delegasyon), kural
`MemberService`'te.

**`index.ts` tarayıcı sözleşmesi — transitif kapanışla ölçüldü** (tek dosya `rg`'si
yetersiz, S2 M7 ile kanıtlamıştı): `dist/index.js`'in tek yerel import/export'u
`./authz/permissions.js`, o dosyanın **hiç** çalışma zamanı import'u yok (`rg
"^(import|export).*from" dist/authz/permissions.js` → **0**) → kapanış **iki modül**,
`server`/`trpc`/`routers`/`handler`/`ports` **yok**. Sözleşme sağlam.

**Döngüsel bağımlılık.** Paketler arası: `apps/api` → `packages/{trpc,db,errors,config}`;
`packages/trpc` → `zod`/`@trpc`/`@arkesoft/errors`. Dosyalar arası: `authz/permissions` →
`schemas/member.schema` (tek yön), `authz/permission-procedure` → `{permissions,
permission-usage, trpc}`, `routers/member` → `{authz/permission-procedure, schemas,
trpc}`. **Döngü yok.**

**`any` / `@ts-ignore` / gerekçesiz `as`.** `any`: **0** (`apps/api/src` ve
`packages/trpc/src` üzerinde `: any`/`<any>`/`any[]` → sıfır eşleşme). `@ts-ignore`: **0**.
`@ts-expect-error`: T-014'ün yeni dosyalarında **1** —
`packages/trpc/src/__tests__/member-procedures.test.ts:111`, gerekçesi yazılı ve
**kendi kendini kıran** (girdi tipi gevşerse TS2578); aynı satır **tip düzeyinde kanıtın
kendisi**. `as`: T-014 yüzeyindeki **tüm** kullanımlar `as const` / `as const satisfies`;
tek istisna `member-owner-invariant.test.ts:140`'ın `response.body as unknown`'ı —
**genişletme** (daraltma değil), ardından Zod/şema ile daraltılıyor. ⚠ **S5'in *"tek `as`
kullanımı `as const`"* iddiasını S1–S5'in tamamı için ölçtüm ve TUTUYOR.**

**Hata yönetimi deseni.** Altı yeni sınıfın altısı `AppError`'dan türüyor, dördü
SCREAMING_SNAKE_CASE kod + `httpStatus` + `userMessageKey` + PII'siz `context` taşıyor.
`catch {}`: **0** (`apps/api/src`, testler hariç; tek `catch`
`member.service.ts:609-617` ve **tanınmayan hatayı aynen yeniden fırlatıyor**). Beklenen
durumlar `null` **dönmüyor**, fırlatıyor (`invitation-token.ts:88-102`,
`membership-read.port.adapter.ts:49-51`, `member.service.ts:92-94`). Sağlayıcıya özgü tip
dışarı **sızmıyor** (`isUniqueConstraintError` daraltması `@arkesoft/db` arkasında).
Portlar **total** ve bu arayüz **biçimiyle** zorlanmış (`null`/`Result` ifade edilemiyor).
⚠ Tek açık M-1.

**Test kalitesi.** Örnek düzeyinde: gerçek Postgres + gerçek HTTP + **veri katmanı
doğrulaması** (`member-authz.test.ts:321-329` — *"2xx döndü ama hiçbir şey yapmadı"*
dışlanıyor), olumlu/olumsuz yarı birlikte (`audit-log-no-log-leak.test.ts:179-184` ↔
`:207+`), üç grep kapısının **her birinde** kendi vacuous-olmama kontrolü
(`production-write-path-grep.qa.test.ts:205,222,250`), red assert'lerinin yanında
**kabulün** ölçülmesi (`permissions-catalog.test.ts:59-65`), `toContain`'e düşürülmemiş
küme/kardinalite assert'leri. Mutlu yol dışı senaryo **bol** (403×15 vaka, 404 kiracısız,
409 üç sebep, eşzamanlı devir yarışı, ters sıra, kırpma, yabancı kiracı RLS reddi).
Mock **az ve kayıt tutan**. **İmplementasyonu yansılayan test görmedim.**

**Ölü kod / kullanılmayan export.** `PermissionGatedProcedureBuilder` (`server.ts:47`)
bugün **tüketicisi yok** — ama dışa açılan bir fabrikanın **dönüş tipi**; tüketici
builder'ı bir değişkende tutmak isterse gerekir, bulgu **değil**.
`AUDIT_SUBJECT_FIELD_BY_ACTION`'ın `export`'u gerekçeli **ve** gerçekten tüketiliyor
(`audit-log-write-gate.test.ts:132,138,198` + `AuditLogEntryFor`'da **tip olarak**).
`AUDIT_USER_AGENT_MAX_LENGTH`, `UNKNOWN_IP`, beş davet sabiti, `OwnerMembershipProtectionReason`
→ hepsinin tüketicisi var. `PROCEDURE_SURFACE`/kullanım kaydı `index.ts`'ten **bilerek**
dışarıda. Yoruma alınmış kod, erişilemez dal, *"sonra kullanacağız"* dosyası: **yok**.

**İsimlendirme (§4 tablosu).** Yeni dosyaların **tamamı** kebab-case
(`audit-diff.schemas.ts`, `permission-procedure.ts`, `member-write.port.adapter.ts`);
tip/sınıf PascalCase; sabitler SCREAMING_SNAKE_CASE; hata kodları SCREAMING_SNAKE_CASE
(`PERMISSION_DENIED`, `OWNER_MEMBERSHIP_PROTECTED`, `INVITATION_INVALID`,
`ALREADY_MEMBER`, `PENDING_INVITATION_LIMIT_REACHED`, `INVITATION_RESEND_TOO_SOON`);
tRPC prosedürleri `namespace.action`; DB kolonları snake_case `@@map`'li. `data`/`temp`/
`handle`/`process` gibi belirsiz ad: **0**. Boolean ön eki: yeni kodda boolean alan
yok; `isNewInvitation` parametresi (`member.service.ts:565`) kurala **uyuyor**.

**Tek sorumluluk — brief'in istediği `member.service.ts` değerlendirmesi.** 619 satır,
en büyük fonksiyon `invite()` **88 satır** (`:122-209`) — **ama** yürütülen ifade sayısı
~15, kalanı yorum (bu kod tabanında yorum yoğunluğu kasıtlı). Değişme sebepleri: üyelik
yazma politikası (tek sebep), davet yaşam döngüsü (aynı politikanın parçası), e-posta
**gönderimi** taşıyıcı arkasında + metin katalogda (`sendInvitationMail` 11 satır, yalnızca
URL + anahtar). Beş modül seviyesi yardımcı (`assertNotAlreadyMember`,
`assertPendingInvitationCapacity`, `assertResendCooldownElapsed`,
`createMembershipForInvitation`, `raise*`) kuralları **adlandırmış** ve sınıftan
çıkarmış. **SRP ihlali bulamadım** — bölmek, `architect`'in *"iş kuralının tamamı port
arkasında"* kararını tersine çevirirdi. Dosya uzunluğu tek başına kusur **değil** ve
burada da değil.

**Gereksiz karmaşıklık (KISS).** Erken soyutlama **aradım, bulamadım**: tek kullanımlık
factory yok, anlamsız sarmalayıcı yok (adaptörler **sınır nesnesi**, gerekçesi yazılı),
`MailModule` tek sağlayıcılı ama gerekçesi **ölçülmüş** (R-PO3). İnce taneli izinler
(`member:invite` vs `member:write`) **reddedilmiş** ve reddi test ediliyor
(`permissions-catalog.test.ts:38`). Ölü sözlük değeri (`revoked` eylemi,
`platform_admin` rolü, taban builder) **bilerek** yazılmamış.

**Gerçek tekrar (DRY) — yüzeysel benzerlik işaretlemedim.** Dört `writeAuditLog` çağrısı
(`invite`/`accept`/`updateRole`/`remove`/`transferOwnership`×2) **tekrar değil**: her biri
farklı eylem + farklı `diff` şekli ve farklı sebeplerle değişecek. İki
`raise*` yardımcısı **tekrar değil**: iki farklı hata sınıfı, iki farklı özne. `tenantRoleSchema`
tele kopyası **tekrar değil**: ADR-0009 md 5 gereği zorunlu ve parite pini bekçisi.
İki prob dosyası **tekrar değil**: tabloya özgü kolon/kısıt bilgisi. Gerçek tekrar olarak
yalnızca **L-6**'yı işaretledim.

---

## ÖLÇÜMLER

| Ölçüm | Değer |
| ----- | ----- |
| İncelenen dosya | **57** (tam okuma 34 · hedefli `rg`/`glob` 23) |
| `any` sayısı | **0** (`apps/api/src` + `packages/trpc/src`, `: any` / `<any>` / `any[]` → sıfır) |
| `@ts-ignore` | **0** · `@ts-expect-error` (T-014 yeni dosyalar): **1**, gerekçeli + kendi kendini kıran |
| Daraltan `as` (Zod'suz) | **0** — T-014 yüzeyindeki tüm `as` kullanımları `as const` / `as const satisfies`; tek istisna bir `as unknown` **genişletmesi** |
| En büyük fonksiyon | `MemberService.invite()` — **88 satır** (`member.service.ts:122-209`), ~15 yürütülen ifade |
| En büyük dosya (üretim) | `member.service.ts` — **619 satır** (SRP ihlali **bulunmadı**) |
| Katman ihlali | **0** · `rg "from '@arkesoft/db'" packages/trpc/src` → 0 (+ ESLint kapısı) |
| Döngüsel bağımlılık | **0** (paketler arası ve dosyalar arası izlendi) |
| `catch {}` / yutulan hata | **0** |
| `index.ts` transitif kapanışı | **2 modül** (`index.js` + `authz/permissions.js`), yasaklı modül **0** |
| Ölü export | **0** (tüketicisiz tek tip, dışa açık bir fabrikanın dönüş tipi — kabul) |
| Çalıştırılan komut | **YOK** — `Bash` izni verilmedi (aşağı) |

---

## ⚠ DOĞRULAYAMADIKLARIM (§5)

1. **Hiçbir komut koşturulmadı** (`Bash` yok). AC8'in beşli kapısı (`lint` 21/21 ·
   `typecheck` 21/21 · `test` **1241** · `test:isolation` **48** · `build` 13/13 ·
   `format:check`), **35 mutasyonun** tamamı, migration'ın bayt-birebirliği,
   `catalog-lint-live` sonuçları ve `dist` tazeliği → **S1–S5'in raporlarından
   alınmıştır, benim ölçümüm değildir.** Bulgularım **yalnızca** kaynak okuma +
   `rg`/`glob` üzerine kuruludur.
2. **`dist` tazeliği.** `packages/trpc/dist/index.js` ve `dist/authz/permissions.js`
   üzerindeki transitif kapanış ölçümüm, **S4'ün build'inden kalan çıktıya** dayanıyor.
   `src` ile `dist`'in bugün senkron olduğunu **doğrulayamadım** (tuzak 2'nin tersi:
   benim ölçümüm bayat bir `dist`'i ölçüyor olabilir). Kapanışın **şekli** `src`'nin
   import grafiğiyle tutarlı, ama kanıt build'den gelmiyor.
3. **Brief'teki satır numaraları — doğrulanan ve düzeltilen.** Açtım ve teyit ettim:
   `client.ts:254` (allowlist 4 üye) · `auth-model-narrowing.pin.ts:383`'ün `po`
   düzeltmesi (⚠ **ama bugün 383 bir YORUM satırı** → L-9) ·
   `harness.ts:385-393` gerekçesi (`:596-601`'de yaşıyor, numara **kaydı**) ·
   `tenant-isolation-suite.ts:61-64` atfı (prob dosyalarından teyit, süit motorunu
   **açmadım**) · `trpc-wire-contract.pin.ts` PİN 8 (yalnızca `rg` ile, **satır satır
   okumadım**).
4. **Brief'in bir yol atfı yanlıştı:** `trpc-context.types.ts` **`packages/trpc/src/`
   altında değil**, `packages/trpc/src/context/` altında. Bulguları bu yola göre yazdım.
5. **Okumadığım T-014 dosyaları** (kapsam dışı bırakmadım, **bütçe gereği
   örneklemedim**): `app.router.ts`, `trpc.module.ts`/`trpc.controller.ts`'in tamamı
   (yalnızca port kablolaması greple doğrulandı), `migration.sql`,
   `tenant-membership.isolation.test.ts`, `audit-log-write-gate.test.ts` ve
   `member-owner-invariant.test.ts`'in gövdeleri (başlık + `as` taraması yapıldı),
   `member-procedures.test.ts`'in 140. satırdan sonrası, `messages.ts`'in tamamı.
   **Bu dosyalarda bulgu olmadığını iddia etmiyorum.**
6. **M-1'in "hiç loglanmıyor" iddiasının çalışma zamanı yarısı** S5'in ölçümüne
   dayanıyor (`MAIL_DELIVERY_FAILED` içeren kayıt = 0). Benim katkım **yapısal** yarı:
   `trpc.ts:167-179`'da log çağrısı **yok** ve tRPC yanıtı kendi ürettiği için Nest
   hata filtresi bu yolu görmüyor. İkisi aynı sonuca çıkıyor ama **ikinci bir koşum
   yapmadım**.

---

## BORÇ SATIRLARI (`docs` kopyalayabilir)

| SEV | Dosya:satır | Açıklama | Sorumlu ajan | Vade |
| --- | ----------- | -------- | ------------ | ---- |
| medium | `packages/trpc/src/trpc.ts:167-179` | `appErrorBoundary`'den geçen `AppError`'lar yapılandırılmış loga **yazılmıyor** → `PERMISSION_DENIED`/`OWNER_MEMBERSHIP_PROTECTED`/`INVITATION_*`'ın `context`'i (izin, rol, sebep, `isRetryable`) **hiçbir yerde kaydedilmiyor**; dört dosya aksini beyan ediyor | `architect` + `backend` | v0.0.18 |
| low | `packages/trpc/src/authz/permission-usage.ts:28` | Bağlayıcı kısıt var olmayan `permission-procedure.test.ts`'e atıf veriyor; gerçek dosya `member-procedures.test.ts` | `backend` | v0.0.15 |
| low | `packages/db/prisma/schema.prisma:427-429` | *"`expiresAt` sorgulanmaz/taranmaz"* iddiası `member.service.ts:572-574`'ün aralık `count()`'uyla çelişiyor; süresi geçmiş satırlar hiç temizlenmediği için taranan küme sınırsız büyüyor | `db` + `docs` | v0.0.17 |
| low | `apps/api/src/errors/domain/already-member.error.ts:24` | `context?: Record<string, unknown>` — dosyanın *"yalnızca `userId`, e-posta YOK"* taahhüdü tip düzeyinde zorlanmıyor; dar tip (`{ userId: string }`) taahhüdü yapısal yapar | `backend` | v0.0.17 |
| low | `apps/api/src/__tests__/production-write-path-grep.qa.test.ts:238-243` | KAPI 3 yalnızca `import` ile **başlayan** satırı tarıyor → çok satırlı bir logger import'u kapıdan görünmez geçer; kör nokta belgelenmemiş | `qa` | v0.0.17 |
| low | `apps/api/src/__tests__/production-write-path-grep.qa.test.ts:79,196-203` | Append-only yalnızca `create` için kapılanmış; üretimde `auditLog.update`/`.delete` derlenir ve hiçbir kapıya çarpmaz | `qa` | v0.0.17 |
| low | `apps/api/src/__tests__/member-invite-flow.test.ts:74,165-173` | Üretime ait Redis anahtar uzayı (`platform:auth:*`) **üçüncü kez** kopyalandı; değişirse flush sessizce hiçbir şey temizlemez → kayıt oran sınırı yüzünden flaky süit. ⚠ Dördüncü kopya `medium` | `backend`/`qa` | v0.0.17 |
| low | `apps/api/src/member/member.service.ts:144-147` | `user.findFirst` **sırasız** + kıyas duyarsız: yalnızca harf büyüklüğüyle ayrılan iki hesap varsa *"zaten üye mi"* ön kontrolü belirsiz satırı sınar (gerçek savunma kabuldeki benzersizlik kısıtı) | `backend` | v0.0.17 |
| low | `packages/trpc/src/context/trpc-context.types.ts:101` | *"Beş alan"* diyor, **altı** madde sayıyor (v0.0.6'dan bayat; aynı sayı K-A7'de de kopyalandı) | `backend`/`docs` | v0.0.17 |
| low | `packages/db/src/__tests__/type-pins/auth-model-narrowing.pin.ts:380,399-401` | Doc bloğu *"İKİ üye"* diyor (gerçek **dört**, aynı blok `:394`'te kendini düzeltiyor) ve yapıştırılan `tsc` çıktısı `:383`'e atıf veriyor — o satır artık bir **yorum**, pin `:440`'ta | `db` | v0.0.17 |
