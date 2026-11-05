// @arkesoft/trpc — `member.*` tel sözleşmesi (ROADMAP v0.0.14, T-014/S2,
// architect K-A4/K-A9, ADR-0016)
//
// ADR-0009 madde 5 EMSALİ (`tenant-summary.schema.ts` ve `job-summary.schema.ts`
// ile BİREBİR aynı mekanizma): bu paket TARAYICI tüketicisi olan bir pakettir;
// veritabanı paketine bağımlılık Prisma tiplerini admin SPA'sının modül
// grafiğine sokar. Bu yüzden rol sözlüğü BURADA YEREL olarak bildirilir —
// veri katmanının ürettiği rol sözlüğü ne TİP ne DEĞER olarak import EDİLMEZ
// (bu dosya o paketin adını hiç ANMAZ; AGENT_BASELINE.md §5 literal-jeton
// kuralı). Sapma riski `apps/api`'deki bir TİP PİNİ + ÇALIŞMA ZAMANI pini ile
// yakalanır (AC4, `trpc-wire-contract.pin.ts` — `TenantStatusWire` için
// yazılmış PİN 1'in ikizi, `apps/api` alt görevinde); bu dosyanın görevi
// yalnızca o pinin karşılaştırdığı "gerçeğin" kaynağı olmaktır.
//
// K5 bağlayıcı kurallar (ADR-0009 madde 7) bu dosyada da geçerli:
//   1. Opsiyonel ÇIKTI alanı YOK — yokluk `null` ile ifade edilir.
//   2. Yalnızca JSON ilkelleri — `Date` YOK, zaman alanları ISO-8601 dizesidir
//      (`z.iso.datetime()`; `z.string().datetime()` zod 4.6.7'de `@deprecated`
//      ve bu repoda lint hatasıdır).
//   3. ÇIKTI şeması iş kuralı taşımaz. GİRDİ şeması taşır — girdi doğrulaması
//      bu şemaların VARLIK SEBEBİDİR (dış dünyadan gelen veri, CLAUDE.md §4).
//
// ⚠⚠ MUTATION ÇIKTI EMSALLERİ (architect K-A9, bundan sonraki her mutation bu
// dosyayı izleyecek — platformda bugün BAŞKA mutation YOK):
//   · Çıktı HER ZAMAN nesnedir — çıplak `boolean`/`null`/`string` DÖNMEZ.
//     Gerekçe: bir alan eklemek nesnede EKLEMEdir (MINOR), çıplak ilkelde
//     KIRICI değişikliktir (MAJOR). `{ accepted: true }` bu yüzden `true`
//     değildir.
//   · `tenantId` hiçbir GİRDİ şemasında YOKTUR ve EKLENMEZ (ADR-0009 madde 7):
//     kiracı kimliği yalnızca host çözümünden okunur.
//   · `member.acceptInvitation`'ın ÇIKTISI kiracıya ait HİÇBİR alan taşımaz
//     (ADR-0016 madde 6 koşul C) — `tenantId`/`slug`/`name` hiçbiri yok.
//
// ⚠ E-posta NORMALİZASYONU (küçük harfe çevirme) bu şemada YAPILMAZ: K-A1
// normalizasyonu YAZMA ve KARŞILAŞTIRMA yolunda konumlandırıyor (`apps/api`,
// ayrı alt görev). Tel şeması bir `.transform()` ile girdiyi SESSİZCE
// değiştirmez — sözleşme katmanı doğrular, dönüştürmez.

import { z } from 'zod'

/**
 * Kiracı üyelik rolü sözlüğü — veri katmanındaki rol enum'unun YEREL,
 * tele-özgü karşılığı (ADR-0009 madde 5). Değer kümesi sapınca `apps/api`'deki
 * tip pini VE çalışma zamanı pini kırılır (AC4); bu dosya SESSİZCE sapamaz.
 *
 * ⚠ `platform_admin` BURADA YOKTUR ve EKLENMEZ: platform yetkisi bir KİRACI
 * ÜYELİĞİ değildir (veri modelinin yazılı kararı; ROADMAP v0.0.14 R2 ile
 * v0.0.20'ye taşındı). Bu sözlüğe kiracı-dışı bir anlam yüklemek o kararı
 * sessizce ters çevirir.
 */
export const tenantRoleSchema = z.enum(['owner', 'admin', 'staff', 'support', 'readonly'])

/** {@link tenantRoleSchema}'nın çıkarılan tip karşılığı. */
export type TenantRoleWire = z.infer<typeof tenantRoleSchema>

/**
 * Davet edilebilir roller — `owner` YAPISAL OLARAK dışarıdadır (architect
 * K-A4). `.exclude()` kullanılır, elle yazılmış ikinci bir dört elemanlı liste
 * DEĞİL: ikinci liste {@link tenantRoleSchema}'dan sessizce sapabilirdi
 * (rol eklenince güncellenmeyi unutmak). Bu biçimde yeni bir rol eklendiğinde
 * davet edilebilir kümeye OTOMATİK girer — ve bu doğru varsayılan, çünkü
 * `owner` dışında her rol davetle verilebilir.
 *
 * ⚠ Gerekçe (K-A11, INV-OWNER): her kiracının TAM OLARAK BİR `owner`'ı vardır.
 * Davet, HENÜZ VAR OLMAYAN bir kullanıcıya gönderilebilir ve kabul anında
 * üyelik YARATIR — `owner` rolüyle bir davet kabul edilirse kiracıda İKİ owner
 * doğardı. Sahiplik DEVRİ `member.updateRole`'ün owner tarafından çağrılmasıdır
 * (mevcut owner'ı `admin`'e indiren CAS ile aynı transaction'da) — davet yolu
 * DEĞİL.
 */
export const invitableRoleSchema = tenantRoleSchema.exclude(['owner'])

/** {@link invitableRoleSchema}'nın çıkarılan tip karşılığı — `'owner'` TİP düzeyinde de yok. */
export type InvitableRoleWire = z.infer<typeof invitableRoleSchema>

/**
 * E-posta adresi için üst sınır. RFC 5321 §4.5.3.1.3'ün ileri yolu (forward
 * path) sınırı 256 oktet, adresin kendisi için pratik sınır 254 karakterdir.
 * Bu bir İŞ KURALI değil, GİRDİ sınırıdır: sınırsız uzunlukta bir dize
 * doğrulama/depolama/e-posta gönderme yolunun üçünü de gereksiz yükle
 * karşılar.
 */
const EMAIL_MAX_LENGTH = 254

/**
 * Davet belirteci için üst sınır. Belirteç `"<tenantId>.<secret>"` biçiminde,
 * 32 bayt CSPRNG'den türer (K-A1) — gerçek uzunluk 100 karakterin altındadır.
 * Üst sınır GİRDİ sınırıdır; belirtecin BİÇİMİ burada doğrulanmaz, çünkü
 * ayrıştırma ve özet karşılaştırması `apps/api`'nin işidir ve geçersiz her
 * biçim TEK hata sınıfına indirgenir (ADR-0016 madde 6 koşul D) — biçimi
 * burada reddetmek o tek-hata değişmezini ikiye bölerdi.
 */
const INVITATION_TOKEN_MAX_LENGTH = 512

/**
 * Kullanıcı kimliği için üst sınır (ROADMAP v0.0.14, T-014 düzeltme turu 1 —
 * `security` L6, "yolu üstündeyse kapat" istisnası; M-2 ile AYNI düzenlemede
 * kapandı).
 *
 * ⚠ ÖLÇÜLDÜ, VARSAYILMADI: üretimdeki kimlik üreticileri 24 ve 32 karakterlik
 * dizgiler üretiyor; 64 bir ÜST SINIR (tarih-saatli/çizgili biçimlere de yer
 * bırakır), bir biçim PİNİ değil. Bu bir İŞ KURALI değil, GİRDİ sınırıdır:
 * sınırsız uzunlukta bir dize doğrulama ve veritabanı arama yolunun ikisini de
 * gereksiz yükle karşılar — ÖLÇÜLDÜ: sınır eklenmeden ÖNCE 4096 karakterlik
 * bir kimlik bileşik benzersizlik aramasına kadar GİDİYORDU.
 */
const USER_ID_MAX_LENGTH = 64

/**
 * Kullanıcı kimliği GİRDİSİ — üç yazma ucunun ortak alanı.
 *
 * ⚠ BİÇİM (karakter sınıfı) BURADA DOĞRULANMAZ ve bu, belirteç alanının
 * yukarıdaki yazılı gerekçesinin AYNISIDIR: geçersiz bir hedef kimliği
 * `apps/api`'de "bu kimlik bu kiracının üyesi değil" reddinin AYNI hata
 * sınıfına indirgenir. Biçimi burada reddetmek o tek-hata değişmezini ikiye
 * böler ve "böyle bir kimlik biçimi var/yok" ayrımını tele taşırdı. Sözleşme
 * katmanının işi UZUNLUK sınırıdır — yüzeyi daraltır, anlam üretmez.
 */
const userIdSchema = z.string().min(1).max(USER_ID_MAX_LENGTH)

/**
 * `member.invite` girdisi. `role` {@link invitableRoleSchema} — `owner`
 * değeri resolver'a HİÇ ULAŞMAZ, Zod onu reddeder (yapısal koruma; `apps/api`
 * tarafında ayrıca bir `if (role === 'owner')` dalı YAZILMASI GEREKMEZ).
 *
 * ⚠ `z.email()` kullanılır, `z.string().email()` DEĞİL: ikincisi zod 4.6.7'de
 * `@deprecated` ve bu repoda `@typescript-eslint/no-deprecated`
 * (strictTypeChecked) onu LINT HATASI yapar (`job-summary.schema.ts`'in
 * `z.iso.datetime()` için ölçtüğü aynı durum).
 */
export const memberInviteInputSchema = z.object({
  email: z.email().max(EMAIL_MAX_LENGTH),
  role: invitableRoleSchema,
})

/** {@link memberInviteInputSchema}'nın çıkarılan tip karşılığı. */
export type MemberInviteInput = z.infer<typeof memberInviteInputSchema>

/**
 * `member.invite` çıktısı. `expiresAt` ISO-8601 dizesidir (TTL 7 gün — sabit
 * `apps/api`'de yaşar, A-A4; tel yalnızca SONUCU taşır).
 *
 * ⚠ Davet edilen E-POSTA tele GERİ YAZILMAZ: çağıran onu zaten girdide
 * verdi, geri söylemek bilgi EKLEMEZ ve yanıt gövdelerini/erişim loglarını
 * gereksiz yere PII taşıyıcısı yapardı (CLAUDE.md §4 "asla loglanmaz"
 * listesinin tel karşılığı). ⚠ Belirtecin KENDİSİ de tele ÇIKMAZ — davet
 * bağlantısı yalnızca e-posta ile gider (K-A9); belirteci yanıta koymak
 * daveti çağıranın eline verir ve e-posta sahipliği kanıtını anlamsız kılar.
 */
export const memberInvitationSchema = z.object({
  invitationId: z.string(),
  expiresAt: z.iso.datetime(),
})

/** {@link memberInvitationSchema}'nın çıkarılan tip karşılığı. */
export type MemberInvitation = z.infer<typeof memberInvitationSchema>

/**
 * `member.acceptInvitation` girdisi. ⚠ Kiracı alanı YOKTUR: kiracı bağlamı
 * BELİRTEÇTEN türetilir (ADR-0016 madde 6, YETENEK tabanlı DAR istisna) —
 * çağıranın beyan ettiği bir kiracı kimliğinden DEĞİL. Girdiye bir kiracı
 * alanı eklemek o istisnanın tüm gerekçesini çökertir.
 */
export const memberAcceptInvitationInputSchema = z.object({
  token: z.string().min(1).max(INVITATION_TOKEN_MAX_LENGTH),
})

/** {@link memberAcceptInvitationInputSchema}'nın çıkarılan tip karşılığı. */
export type MemberAcceptInvitationInput = z.infer<typeof memberAcceptInvitationInputSchema>

/**
 * `member.acceptInvitation` çıktısı — ⚠ KİRACIYA AİT HİÇBİR ALAN YOK
 * (ADR-0016 madde 6 koşul C, bağlayıcı). `tenantId`/`slug`/`name`/`role`
 * hiçbiri yazılmaz: bu prosedür kiracı bağlamını bir YETENEK belirtecinden
 * türetiyor ve çıktısıyla o kiracı hakkında hiçbir şey SIZDIRMAZ — aksi hâlde
 * geçerli bir belirteç bir kiracı okuma yüzeyine dönüşürdü.
 *
 * `accepted` bir `z.literal(true)`: başarısızlık yolu bir `false` DEĞİL, bir
 * `AppError`'dır (CLAUDE.md §4 — "beklenen durumlar için hata fırlat, `null`
 * döndürüp çağıranı tahmine zorlamayın"). Alan tek elemanlı bir nesne olarak
 * durur çünkü çıplak `true` dönmek ileride alan eklemeyi KIRICI yapardı.
 */
export const memberInvitationAcceptedSchema = z.object({
  accepted: z.literal(true),
})

/** {@link memberInvitationAcceptedSchema}'nın çıkarılan tip karşılığı. */
export type MemberInvitationAccepted = z.infer<typeof memberInvitationAcceptedSchema>

/**
 * `member.updateRole` girdisi. `role` {@link tenantRoleSchema} — `owner`
 * BURADA GEÇERLİDİR ve bu bilinçlidir: sahiplik DEVRİ ayrı bir prosedür
 * değil, `updateRole({ userId, role: 'owner' })`'ın mevcut owner tarafından
 * çağrılmasıdır (K-A11). Devrin iki adımı (mevcut owner → `admin` CAS'i +
 * hedef → `owner`) TEK transaction'da, port arkasında yürür.
 */
export const memberUpdateRoleInputSchema = z.object({
  userId: userIdSchema,
  role: tenantRoleSchema,
})

/** {@link memberUpdateRoleInputSchema}'nın çıkarılan tip karşılığı. */
export type MemberUpdateRoleInput = z.infer<typeof memberUpdateRoleInputSchema>

/**
 * `member.updateRole` çıktısı — işlemin SONUCUNU yansıtan iki alan.
 * ⚠ Sahiplik devrinde aktörün KENDİ yeni rolü (`admin`) bu çıktıda YOKTUR:
 * tek bir yanıt iki üyeliği birden tarif ederse tüketici hangi satırın
 * hangisi olduğunu girdiye bakarak çıkarmak zorunda kalır. Çıktı girdinin
 * hedefini doğrular, hepsi bu.
 */
export const memberRoleSchema = z.object({
  userId: z.string(),
  role: tenantRoleSchema,
})

/** {@link memberRoleSchema}'nın çıkarılan tip karşılığı. */
export type MemberRole = z.infer<typeof memberRoleSchema>

/** `member.remove` girdisi. Kiracı alanı YOK (ADR-0009 madde 7). */
export const memberRemoveInputSchema = z.object({
  userId: userIdSchema,
})

/** {@link memberRemoveInputSchema}'nın çıkarılan tip karşılığı. */
export type MemberRemoveInput = z.infer<typeof memberRemoveInputSchema>

/**
 * `member.remove` çıktısı. Çıkarılan üyenin ROLÜ tele yazılmaz — tüketiciye
 * bir şey anlatmıyor ve kiracının iç yetki dağılımını yanıt gövdesine
 * çoğaltıyor.
 */
export const memberRemovedSchema = z.object({
  userId: z.string(),
})

/** {@link memberRemovedSchema}'nın çıkarılan tip karşılığı. */
export type MemberRemoved = z.infer<typeof memberRemovedSchema>
