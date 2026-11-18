// @arkesoft/trpc — `registration.*` tel sözleşmesi (ROADMAP v0.1.0, T-019/S3,
// architect "TRPC SÖZLEŞMESİ" bölümü, ADR-0021)
//
// K5 bağlayıcı kurallar (ADR-0009 madde 7, `member.schema.ts`/`tenant-summary.
// schema.ts` ile AYNI):
//   1. Opsiyonel ÇIKTI alanı YOK — yokluk `null` ile ifade edilir.
//   2. Yalnızca JSON ilkelleri — `Date` YOK, transformer gerekmiyor.
//   3. ÇIKTI şeması iş kuralı taşımaz. GİRDİ şeması taşır.
//   4. `tenantId` (iç/opak kimlik) BU DOSYANIN HİÇBİR ŞEMASINDA — ne girdi ne
//      çıktı — YOKTUR (ADR-0021 §3.1 DÜZELTMESİ, T-019/S3 düzeltme turu).
//      `onboardingChecklist` kiracıyı GİRDİDEN seçer (ADR-0021 §2'nin beş
//      koşuluyla KAYITLI istisna) AMA seçici `tenantId` DEĞİL `slug`'dır —
//      gerekçe ölçülmüş: `slug` sır DEĞİL (`storefront-tenant.schema.ts:19-21`
//      "opak iç kimliği internete açmak bedelsiz bir ilişkilendirme tutamacı"
//      derken TAM TERSİNİ, slug'ın PAYLAŞILABİLİR olduğunu ima eder), kullanıcının
//      GENEL adresidir, yeni bir cihazda HATIRLANABİLİR, rotada taşınabilir
//      (`/kurulum/{slug}`). SİMETRİK SIKILAŞTIRMA: `createTenant` çıktısı da
//      `tenantId` DÖNDÜRMEZ — iç kimlik tele HİÇ ÇIKMAZ. Seçicinin kendisi
//      bir GÜVEN BEYANI değildir: hangi bağlamın KURULACAĞINI seçer, erişim
//      HAKKINI belirlemez — hak porttaki sahiplik doğrulamasından gelir.
//
// ⚠⚠ SLUG GRAMERİ BU DOSYADA DOĞRULANMAZ (architect KARAR 1, bağlayıcı):
// `slug` alanının BİÇİMİ (karakter sınıfı, rezerve liste, Türkçe normalizasyon)
// burada bir regex/enum ile ZORLANMAZ — yalnızca UZUNLUK sınırlanır. Gerekçe
// `member.schema.ts`'in belirteç/kullanıcı kimliği alanlarıyla AYNI: biçim
// reddi `apps/api`de TEK bir kabul oracle'ında (`resolveHost`'un kendisi,
// `packages/tenancy`) toplanır; burada İKİNCİ bir regex yazmak "oluşturulabilir
// ama erişilemez kiracı" sınıfını (R-A3) YENİDEN AÇARDI. Sözleşme katmanının
// işi yüzeyi daraltmaktır (makul bir üst sınır), anlam üretmek değildir.
//
// ⭐⭐ `registrationFieldErrorKeySchema` — S8'İN (apps/admin) `fields` kanalı
// allowlist KAYNAĞI. KAPALI küme (`z.enum`): taşınan şey i18n ANAHTARI, sunucu
// METNİ DEĞİL (CLAUDE.md §4 "kullanıcıya dönük metin kodda sabit yazılmaz").
// Bilinmeyen bir anahtar panelde JENERİK mesaja düşer — bu şema o allowlist'in
// TEK doğruluk kaynağıdır; apps/api (S9) `ValidationError.fields.slug`'a BU
// kümenin bir üyesini yazar (yeni bir `AppError` sınıfı AÇMADAN, mevcut
// `{code:'VALIDATION_ERROR', fields}` mekanizmasıyla, architect F3 çürütmesi).

import { z } from 'zod'

import { tenantStatusSchema } from './tenant-summary.schema.js'

/**
 * Site tipi sözlüğü (ROADMAP v0.1.0 kapsam maddesi: "site tipi (e-ticaret /
 * kurumsal)"). `corporate`'ın tüketicisi v0.2.0'da ADIYLA yazılı
 * (`ROADMAP.md:1304`) — ölü sözlük değeri DEĞİL.
 *
 * ⚠ `index.ts`'ten EXPORT EDİLİR: `apps/admin` sihirbazı bu sözlüğü `satisfies`
 * ile türetecek (`deviceBrowserSchema`'nın EMSALİ, `session-summary.schema.ts`).
 */
export const siteTypeSchema = z.enum(['ecommerce', 'corporate'])

/** {@link siteTypeSchema}'nın çıkarılan tip karşılığı. */
export type SiteType = z.infer<typeof siteTypeSchema>

/**
 * Onboarding adım anahtarı sözlüğü — kontrol listesinin KAPALI kümesi.
 * `provisioning` v0.1.0'da HER ZAMAN `todo` döner (A-A5, `tenant.provision`
 * v0.2.0'ın işi) — bu şema o gerçeği ZORLAMAZ (K kuralı 3), yalnızca adı
 * taşır; zorlama adaptör tarafında (apps/api, S9).
 */
export const onboardingStepKeySchema = z.enum([
  'account',
  'store_identity',
  'site_type',
  'subscription',
  'provisioning',
])

/** {@link onboardingStepKeySchema}'nın çıkarılan tip karşılığı. */
export type OnboardingStepKey = z.infer<typeof onboardingStepKeySchema>

/** Bir onboarding adımının gözlemlenebilir iki durumu. */
export const onboardingStepStatusSchema = z.enum(['done', 'todo'])

/** {@link onboardingStepStatusSchema}'nın çıkarılan tip karşılığı. */
export type OnboardingStepStatus = z.infer<typeof onboardingStepStatusSchema>

/**
 * ⭐⭐ Kayıt akışının üretebileceği TÜM alan hatası i18n anahtarlarının KAPALI
 * kümesi (dosya başı yorumu). Dördü, `slugAvailabilityOutcomeSchema`'nın
 * `'available'` DIŞINDAKİ dört değerinin `createTenant` reddinde aldığı i18n
 * karşılığıdır — iki sözlük AYNI değerleri taşımaz (biri outcome KODU, diğeri
 * i18n ANAHTARI) bu yüzden biri diğerinden türetilmez, elle hizalı tutulur.
 *
 * ⚠ `index.ts`'ten EXPORT EDİLİR (S8'in allowlist kaynağı).
 */
export const registrationFieldErrorKeySchema = z.enum([
  'errors.slug.taken',
  'errors.slug.reserved',
  'errors.slug.invalidFormat',
  'errors.slug.unreachable',
])

/** {@link registrationFieldErrorKeySchema}'nın çıkarılan tip karşılığı. */
export type RegistrationFieldErrorKey = z.infer<typeof registrationFieldErrorKeySchema>

/**
 * Slug alanı için GİRDİ uzunluk sınırı — bir İŞ KURALI değil, GİRDİ sınırıdır
 * (`member.schema.ts`'in `USER_ID_MAX_LENGTH` gerekçesinin aynısı). `63`
 * DNS etiketinin KENDİ sınırıdır (RFC 1035 §2.3.1) — `resolveHost`'un (K-A3,
 * AC-8) kabul edebileceği en uzun etiket zaten budur; burada tekrarlamak
 * İKİNCİ bir doğruluk kaynağı AÇMAZ, aynı mekanik sınırın GİRDİ tarafındaki
 * yansımasıdır.
 */
const REGISTRATION_SLUG_MAX_LENGTH = 63

/** `checkSlugAvailability`/`createTenant` arasında PAYLAŞILAN slug girdi şekli. */
const registrationSlugInputSchema = z.string().min(1).max(REGISTRATION_SLUG_MAX_LENGTH)

/**
 * Slug müsaitlik sonucunun KAPALI kümesi. `'available'` DIŞINDAKİ dört değer
 * `registrationFieldErrorKeySchema`'nın dört üyesiyle (sırayla) KARŞILIKLIDIR
 * — `apps/api` (S9) bu eşlemeyi `createTenant` reddinde kullanır.
 *
 * `'unreachable'` — R-A3'ün (architect, kabul oracle'ı) ürettiği dalın ADIDIR:
 * grameri geçen AMA `resolveHost` tarafından çözülemeyen bir slug (ör. uzun
 * taban alan adıyla 255 sınırını aşan meşru bir etiket).
 */
export const slugAvailabilityOutcomeSchema = z.enum([
  'available',
  'taken',
  'reserved',
  'invalidFormat',
  'unreachable',
])

/** {@link slugAvailabilityOutcomeSchema}'nın çıkarılan tip karşılığı. */
export type SlugAvailabilityOutcome = z.infer<typeof slugAvailabilityOutcomeSchema>

/** `registration.checkSlugAvailability` girdisi. */
export const checkSlugAvailabilityInputSchema = z.object({
  slug: registrationSlugInputSchema,
})

/** {@link checkSlugAvailabilityInputSchema}'nın çıkarılan tip karşılığı. */
export type CheckSlugAvailabilityInput = z.infer<typeof checkSlugAvailabilityInputSchema>

/**
 * `registration.checkSlugAvailability` çıktısı. Mutation EMSALİNİN (K-A9,
 * `member.schema.ts`) query karşılığı: çıktı HER ZAMAN nesnedir, çıplak
 * `SlugAvailabilityOutcome` STRING'i DÖNMEZ — bir alan eklemek nesnede
 * EKLEMEdir (MINOR), çıplak dizgede KIRICI değişikliktir (MAJOR).
 */
export const checkSlugAvailabilityOutputSchema = z.object({
  outcome: slugAvailabilityOutcomeSchema,
})

/** {@link checkSlugAvailabilityOutputSchema}'nın çıkarılan tip karşılığı. */
export type SlugAvailability = z.infer<typeof checkSlugAvailabilityOutputSchema>

/**
 * Mağaza adı için üst sınır. Bir İŞ KURALI değil GİRDİ sınırıdır; alt sınır
 * `2` boş/tek karakterli isimleri reddeder (sihirbazın kendi adım sırasının
 * ürün anlamı — mağaza adı ADIM 2'dir, ROADMAP`:1282`).
 */
const TENANT_NAME_MAX_LENGTH = 120

/**
 * `registration.createTenant` girdisi. ⚠ `tenantId` YOKTUR ve EKLENMEZ — bu
 * çağrı bir kiracı kimliğini DOĞRULAMAZ, YARATIR (ADR-0021 §2 koşul A'nın
 * "kiracı henüz yok çünkü bu çağrı onu yaratıyor" sınıfı).
 *
 * `name` `.trim()` İLE GİRER: baştaki/sondaki boşluk bir İŞ KURALI DEĞİLDİR,
 * biçimsel bir girdi temizliğidir (slug'ın KENDİSİNİN normalize EDİLMEMESİ
 * kararıyla ÇELİŞMEZ — architect KARAR 1: "sunucu kullanıcının gönderdiğini
 * normalize ETMEZ, DOĞRULAR" kararı yalnızca SLUG için bağlayıcıdır; mağaza
 * adı bir kimlik YÜZEYİ değildir).
 */
export const createTenantInputSchema = z.object({
  name: z.string().trim().min(2).max(TENANT_NAME_MAX_LENGTH),
  slug: registrationSlugInputSchema,
  siteType: siteTypeSchema,
})

/** {@link createTenantInputSchema}'nın çıkarılan tip karşılığı. */
export type CreateTenantInput = z.infer<typeof createTenantInputSchema>

/**
 * `registration.createTenant` çıktısı. `status` {@link tenantStatusSchema}
 * (`tenant-summary.schema.ts`'TEN YENİDEN KULLANILIR, KOPYALANMAZ — iki yazılı
 * sözlük AYNI anda SAPAMAZ). Yeni kiracı HER ZAMAN `'pending'` doğar (AC-1) —
 * bu şema bunu ZORLAMAZ (K kuralı 3), yalnızca BİÇİMİ taşır.
 *
 * ⚠⚠ `tenantId` BURADA YOKTUR (ADR-0021 §3.1 DÜZELTMESİ, T-019/S3 düzeltme
 * turu) — SİMETRİK SIKILAŞTIRMA: `onboardingChecklist`'in seçicisi `slug`
 * olduğuna göre, iç/opak kimliği bu çıktıdan DIŞARI vermenin hiçbir
 * tüketicisi yoktur ve bedelsiz bir ilişkilendirme tutamacı eklerdi
 * (`storefront-tenant.schema.ts:19-21`'in `id` alanı için verdiği AYNI
 * gerekçe). Çağıran kiracısını `slug` İLE tanır/bulur, `tenantId` İLE DEĞİL.
 *
 * ⚠ `planId`/`siteType` BU ÇIKTIDA YOKTUR: `planId` derleyici-zorunlu negatif
 * pinlerin (PM kullanıcı kararı #1) kapsadığı ALAN DEĞİL ama tele HİÇBİR
 * kiracı çıktısında çıkmaz (AC-12); `siteType`'ın tele çıkışı v0.3.0'ın işi
 * (`tenantSummarySchema`'ya eklenince) — burada da tekrarlanmaz, "ölü sözlük"
 * kuralının alan karşılığı tekrar AÇILMAZ.
 */
export const createTenantOutputSchema = z.object({
  slug: z.string(),
  status: tenantStatusSchema,
})

/** {@link createTenantOutputSchema}'nın çıkarılan tip karşılığı. */
export type CreateTenantResult = z.infer<typeof createTenantOutputSchema>

/**
 * `registration.onboardingChecklist` girdisi. ⚠⚠ Seçici `slug`'DIR,
 * `tenantId` DEĞİL (ADR-0021 §3.1 DÜZELTMESİ, T-019/S3 düzeltme turu —
 * `ux`'in buldugu boşluk: kullanıcı BAŞKA bir cihazdan girdiğinde panelin
 * opak `tenantId`'yi BİLME yolu YOKTUR; `slug` kullanıcının GENEL adresidir,
 * HATIRLANABİLİR ve rotada taşınabilir). Bu hâlâ ADR-0021 §2'nin BEŞ
 * koşuluyla kayıtlı, BİLİNÇLİ istisnadır (`member.acceptInvitation`'ın
 * belirteç tabanlı istisnasının KİRACI SEÇİCİSİ tabanlı EŞDEĞERİ — ADR-0021
 * §3). `slug`'ın burada bulunması bir GÜVEN BEYANI DEĞİLDİR: hangi bağlamın
 * KURULACAĞINI seçer, erişim HAKKINI belirlemez — hak porttaki sahiplik
 * doğrulamasından (ADR-0021 §2 koşul A+B) gelir; port `slug`'ı tenant'a
 * çözerken sahiplik kontrolünü KİMLİK çözümünden ÖNCE yapmaz, AYNI anda/ARDI
 * sıra uygular (dört ret modu AYNI 404'e indirgenir, koşul C).
 */
export const onboardingChecklistInputSchema = z.object({
  slug: registrationSlugInputSchema,
})

/** {@link onboardingChecklistInputSchema}'nın çıkarılan tip karşılığı. */
export type OnboardingChecklistInput = z.infer<typeof onboardingChecklistInputSchema>

/**
 * Bir onboarding adımının tel karşılığı — `key`/`status` dışında ALAN YOK.
 * Sıralama (`account` → `provisioning`) PORTUN sorumluluğudur; bu şema sıra
 * ZORLAMAZ (dizi sırası taşır).
 */
export const onboardingStepSchema = z.object({
  key: onboardingStepKeySchema,
  status: onboardingStepStatusSchema,
})

/** {@link onboardingStepSchema}'nın çıkarılan tip karşılığı. */
export type OnboardingStep = z.infer<typeof onboardingStepSchema>

/**
 * `registration.onboardingChecklist` çıktısı. ⚠ KİRACIYA AİT HİÇBİR ALAN
 * TAŞIMAZ (`member.acceptInvitation`'ın ADR-0016 madde 6 koşul C'sinin AYNI
 * deseni) — `tenantId`/`slug`/`name` hiçbiri yok; çağıran zaten girdide o
 * kimliği biliyor, geri söylemek bilgi EKLEMEZ.
 */
export const onboardingChecklistOutputSchema = z.object({
  steps: z.array(onboardingStepSchema),
})

/** {@link onboardingChecklistOutputSchema}'nın çıkarılan tip karşılığı. */
export type OnboardingChecklist = z.infer<typeof onboardingChecklistOutputSchema>
