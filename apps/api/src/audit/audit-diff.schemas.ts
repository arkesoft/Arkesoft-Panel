// @arkesoft/api — denetim kaydı `diff` yazma kapısı: şemalar ve giriş tipi
// (ROADMAP v0.0.14, T-014/S4, architect K-A2 · A-DB1'in TİP SEVİYESİ cevabı)
//
// `Job.error`'ın emsalinin birebir uygulaması: JSONB kolonuna yazmanın TEK
// yolu bir Zod kapısından geçer (`job-runner.ts`'in `appErrorBodySchema.parse`
// kapısıyla aynı sınıf). Serbest JSON YOKTUR — her eylemin `diff`i KAPALI ve
// KÜÇÜK bir şemadan geçer, fazla anahtar (ör. e-posta, belirteç, kiracı
// kimliği) `z.object`'in soyma davranışıyla DÜŞÜRÜLÜR.
//
// ⚠ NEDEN `Record<AuditAction, …>` VE NEDEN AYRIMLI BİRLEŞİM DEĞİL (architect
// K-A2, gerekçe MEKANİK): `Record` enum üzerinde TAM'dır → veri katmanının
// eylem sözlüğüne bir değer eklemek, buraya şema eklenene kadar `typecheck`'i
// KIRAR. Ayrımlı birleşim seçilseydi `action` kolonu ile `diff.kind` arasında
// İKİNCİ bir doğruluk kaynağı doğardı.
//
// ⚠⚠ A-DB1 — `subject`'İN EYLEM BAŞINA ANLAMI BURADA TİP SEVİYESİNDE
// ZORLANIR. Veri modeli bu sözleşmeyi yazıyor (`member_invited` → davet
// kimliği; diğer üç eylem → kullanıcı kimliği) ama ŞEMA YORUMUNDAN BAŞKA
// ZORLAYICISI YOKTU — yani klasik "beyan ≠ gerçeklik" borcu. Çözüm:
// {@link AuditLogEntry} bir ayrımlı birleşimdir ve `subject` alanı GENEL bir
// `subject: string` DEĞİL, eylem başına ADIYLA ANILAN bir alandır
// ({@link AUDIT_SUBJECT_FIELD_BY_ACTION} tablosundan TÜRETİLİR). Sonuç:
// `member_invited` kaydını yazarken `userId` vermek derlenmez, davet kimliği
// vermek ZORUNLUDUR; diğer üç eylemde tam tersi. Yazma kapısının kendisi
// (`audit-log.writer.ts`) `subject` kolonunu bu birleşimden EXHAUSTIVE bir
// switch ile okur.
//
// ⚠ KİRACI KİMLİĞİ `diff`'E YAZILMAZ ve hiçbir şema onu KABUL ETMEZ: satırın
// `tenant_id` kolonu o bilgiyi zaten taşıyor, `diff`e kopyalamak ikinci bir
// doğruluk kaynağı olurdu. ⚠ E-POSTA hiçbir şemada YOKTUR — beklemedeki adres
// davet tablosunda yaşar (veri modelinin yazılı kararı).
//
// GÜNCELLEME (ROADMAP v0.0.15, T-016/S7, architect md 2 — po R-PO1): `subject`
// alanı ÜÇÜNCÜ bir anlam KAZANDI. `tenant_security_policy_changed` eylemi bir
// KULLANICIYI değil KİRACININ KENDİSİNİ öznelendirir (owner 2FA zorunluluğu
// kiracı seviyesi bir ayardır, davet/rol/çıkarma gibi bir ÜYEYE ait değildir)
// → bu eylemde `subject` = `tenantId`. Yukarıdaki paragrafın "kiracı kimliği
// diff'e YAZILMAZ" iddiası HÂLÂ doğrudur ve KAPSAMI DIŞINDA kalır: `tenantId`
// hâlâ `diff`e KOPYALANMAZ, yalnızca satırın ZATEN VAR OLAN `subject` kolonuna
// (ayrı bir `diff` alanı değil) yazılır — `AuditLogEntryFor`'un taban tipinde
// `tenantId` ZATEN ZORUNLU bir alan olduğu için bu eylemde ikinci bir alan
// İCAT EDİLMEZ, mevcut alan `subject` eşlemesinin de hedefi olur.

import type { Prisma } from '@arkesoft/db'
import { invitableRoleSchema, tenantRoleSchema } from '@arkesoft/trpc'
import { z } from 'zod'

import { assertNever } from '../errors/assert-never.js'

/**
 * Veri katmanının denetim eylemi sözlüğü — ⚠ `@arkesoft/db`'nin dışa açık
 * yüzeyinde bir DEĞER veya TİP olarak YOKTUR (ölçüldü: paket girişinde sıfır
 * eşleşme). Bu yüzden tip, paketin ZATEN dışa açtığı `Prisma` TİP
 * namespace'inden türetilir: `AuditLogCreateInput['action']` üretilen
 * istemcinin enum birleşimine birebir eşittir.
 *
 * ⚠ Bu bir KOPYA DEĞİLDİR — elle yazılmış bir dört elemanlı liste olsaydı
 * sessizce sapabilirdi. Türetme sayesinde {@link AUDIT_DIFF_SCHEMA_BY_ACTION}
 * ve {@link AUDIT_SUBJECT_FIELD_BY_ACTION} tablolarının TAMLIĞI gerçek enum'a
 * karşı denetlenir. Alternatif (paket girişine yeni bir export satırı eklemek)
 * ÖLÇÜLDÜ ve GEREKMEDİĞİ için yapılmadı: veri katmanı paketi bu alt görevin
 * dokunma listesindeydi ve çalışma zamanı DEĞERİNE ihtiyaç yok — tablolar
 * literal anahtarlarla yazılıyor, tamlık `satisfies` ile denetleniyor.
 */
export type AuditAction = Prisma.AuditLogCreateInput['action']

/**
 * `subject` kolonuna eylem başına HANGİ kimliğin yazıldığı. Sözlük KAPALI:
 * yeni bir anlam eklemek bu birleşime değer eklemeyi gerektirir.
 *
 * ⚠ `'tenantId'` (ROADMAP v0.0.15, T-016/S7) ÜÇÜNCÜ üyedir —
 * `tenant_security_policy_changed` eylemi KİRACININ KENDİSİNİ öznelendirir
 * (yukarıdaki dosya başı yorumu, po R-PO1).
 */
type AuditSubjectFieldName = 'invitationId' | 'userId' | 'tenantId'

/**
 * A-DB1'in zorlayıcısı. ⚠ `satisfies Record<AuditAction, …>` TAM olduğu için
 * eylem sözlüğüne bir değer eklemek bu tabloya satır eklenene kadar
 * `typecheck`'i KIRAR — yani "yeni bir eylemin `subject` anlamının
 * yazılmaması" İMKÂNSIZDIR.
 *
 * `as const` bir tip zorlaması değil const assertion'dır: değerlerin LİTERAL
 * kalması {@link AuditLogEntry}'nin eylem başına alan ADINI üretebilmesinin
 * ÖN KOŞULUDUR (`string`'e genişlerse mapped tip `Record<string, string>`'e
 * çöker ve garanti kaybolur).
 *
 * ⚠ `export` — İKİ gerekçe: (1) kabul kriteri testleri (ayrı alt görev)
 * A-DB1'i MEKANİK olarak doğrulayabilsin diye tabloyu KOPYALAMADAN okur;
 * (2) bir `const satisfies` ifadesi yalnızca TİP olarak kullanıldığında lint
 * onu "kullanılmayan değer" sayar — oysa tablonun DEĞER tarafı `satisfies`
 * denetiminin taşıyıcısıdır ve bir `type` bildirimine çevrilirse o TAMLIK
 * denetimi kaybolur. Dışa açmak garantiyi korur.
 */
export const AUDIT_SUBJECT_FIELD_BY_ACTION = {
  member_invited: 'invitationId',
  member_invitation_accepted: 'userId',
  member_role_changed: 'userId',
  member_removed: 'userId',
  tenant_security_policy_changed: 'tenantId',
} as const satisfies Record<AuditAction, AuditSubjectFieldName>

/**
 * Eylem başına `diff` şeması — yazma kapısının ÖZÜ (architect K-A2).
 *
 * ⚠ `satisfies Record<AuditAction, z.ZodType<AuditDiffValue>>`: hem TAMLIK
 * (her eylemin şeması var) hem de ORTAK ÇIKTI ŞEKLİ (`diff` düz bir
 * dize→dize nesnesidir) derleme zamanında zorlanır. İkincisi yazma kapısının
 * Prisma'nın JSONB girdi tipine `unknown` geçirmesini gereksiz kılar.
 *
 * Alanlar NEDEN bunlar:
 *   · `member_invited` → yalnızca `role`. Davet kimliği `subject` kolonunda,
 *     e-posta ise HİÇBİR YERDE (davet tablosunda yaşar).
 *     ⚠ `invitableRoleSchema` kullanılır: davet yoluyla `owner` verilemez
 *     (INV-OWNER) → kayıt da o değeri TAŞIYAMAZ.
 *   · `member_invitation_accepted` → `role` + `invitationId`. Zincir
 *     (`member_invited` → kabul) bu alan üzerinden kurulur; `subject` burada
 *     ÜYE OLAN kullanıcıdır.
 *   · `member_role_changed` → `from`/`to`. Sahiplik DEVRİ bu eylemin İKİ
 *     satırıdır (aktörün `owner`→`admin` satırı + hedefin `…`→`owner` satırı),
 *     ayrı bir eylem değeri YOK.
 *   · `member_removed` → yalnızca `role` (çıkarılan üyenin son rolü).
 *   · `tenant_security_policy_changed` (ROADMAP v0.0.15, T-016/S7) → `from`/`to`
 *     — `member_role_changed`'in BİREBİR aynı şekli (`AuditDiffValue`nun düz
 *     dize→dize sözleşmesi korunur). Değer kümesi `requireTwoFactorForOwner`
 *     booleanının dize karşılığıdır (`'true'`/`'false'`); alan adı
 *     `requireTwoFactorForOwner` DEĞİL yalnızca `from`/`to`'dur — eylemin
 *     KENDİSİ hangi ayarın değiştiğini zaten söylüyor (tıpkı
 *     `member_role_changed`'in hangi alanın değiştiğini `role` kelimesiyle
 *     TEKRARLAMAMASI gibi).
 */
export const AUDIT_DIFF_SCHEMA_BY_ACTION = {
  member_invited: z.object({ role: invitableRoleSchema }),
  member_invitation_accepted: z.object({
    role: tenantRoleSchema,
    invitationId: z.string().min(1),
  }),
  member_role_changed: z.object({ from: tenantRoleSchema, to: tenantRoleSchema }),
  member_removed: z.object({ role: tenantRoleSchema }),
  tenant_security_policy_changed: z.object({
    from: z.enum(['true', 'false']),
    to: z.enum(['true', 'false']),
  }),
} as const satisfies Record<AuditAction, z.ZodType<AuditDiffValue>>

/**
 * Kapıdan geçmiş `diff`in ortak çıktı şekli — düz bir dize→dize nesnesi.
 * İç içe nesne/dizi BİLEREK yok: denetim kaydının meşru içeriği kapalı ve
 * küçüktür, derinlik serbest JSON'a kapı açardı.
 */
export type AuditDiffValue = Readonly<Record<string, string>>

/**
 * Tek bir eylemin denetim kaydı girişi. `diff` o eylemin şemasının GİRDİ
 * tipidir; `subject` alanı {@link AUDIT_SUBJECT_FIELD_BY_ACTION}'dan türeyen
 * ADIYLA görünür (A-DB1).
 */
type AuditLogEntryFor<TAction extends AuditAction> = {
  /** Satırın kiracısı. ⚠ Doğrulayıcısı RLS'in `WITH CHECK` yüklemidir — yanlış kiracı SESSİZCE yazılamaz, INSERT reddedilir. */
  readonly tenantId: string
  readonly action: TAction
  /** Eylemi yapan kimlik (`ctx.auth.userId`), girdiden DEĞİL. */
  readonly actorUserId: string
  /** İstek bağlamından okunan istemci IP'si; tespit edilemediyse `null`. */
  readonly ip: string | null
  /** İstek bağlamından okunan istemci tanıtıcısı; yoksa `null`. Kapıda KIRPILIR. */
  readonly userAgent: string | null
  readonly diff: z.input<(typeof AUDIT_DIFF_SCHEMA_BY_ACTION)[TAction]>
} & Readonly<Record<(typeof AUDIT_SUBJECT_FIELD_BY_ACTION)[TAction], string>>

/**
 * Yazma kapısının kabul ettiği TEK giriş tipi — eylem sözlüğünün (bugün beş
 * üye) ayrımlı birleşimi. Birleşim eylem sözlüğü üzerinde mapped tiple
 * kurulur, yani
 * sözlüğe değer eklemek birleşime de OTOMATİK yansır (ve o değerin şeması ile
 * `subject` anlamı yazılmadığı sürece derleme kırılır).
 */
export type AuditLogEntry = { [TAction in AuditAction]: AuditLogEntryFor<TAction> }[AuditAction]

/**
 * `subject` kolonuna yazılacak değeri EXHAUSTIVE bir switch ile okur.
 *
 * ⚠ Bu switch {@link AUDIT_SUBJECT_FIELD_BY_ACTION} tablosundan BAĞIMSIZ
 * DEĞİLDİR: tabloda `member_invited: 'invitationId'` yazdığı için bu daldaki
 * `entry` tipinde `userId` alanı YOKTUR — yani iki yapı birbirini mekanik
 * olarak denetler (tabloyu değiştirmek bu switch'i, switch'i değiştirmek
 * tabloyu kırar). Eylem sözlüğüne değer eklemek `assertNever`'ı da kırar.
 */
export function resolveAuditSubject(entry: AuditLogEntry): string {
  switch (entry.action) {
    case 'member_invited':
      return entry.invitationId
    case 'member_invitation_accepted':
    case 'member_role_changed':
    case 'member_removed':
      return entry.userId
    case 'tenant_security_policy_changed':
      return entry.tenantId
    default:
      return assertNever(entry, 'audit-diff.schemas.ts: AuditLogEntry.action')
  }
}
