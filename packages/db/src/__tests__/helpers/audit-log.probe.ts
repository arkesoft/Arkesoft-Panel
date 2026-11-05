// @arkesoft/db — `audit_log` tablosunun `TenantScopedProbe` uygulaması
// (ROADMAP v0.0.14, T-014/S3, architect K-A1 + po R-PO4/R-PO6/R-A7)
//
// NEDEN AYRI DOSYA, AMA AYRI ÇAĞRI NOKTASI DEĞİL (po R-A7, BAĞLAYICI):
// `createTenantIsolationSuite()`'in prob tamlığı kapısı
// (`tenant-isolation-suite.ts`) ÇAĞRI BAŞINA kendi taksonomisini kendi
// problarıyla karşılaştırır. Dolayısıyla repoda `TENANT_SCOPED_TABLES`'ın
// TAMAMINI tek bir `probes` dizisiyle besleyen TEK bir çağrı noktası olmak
// ZORUNDA (`__tests__/tenant-membership.isolation.test.ts`). Bu tablo için
// ayrı bir `audit-log.isolation.test.ts` açmak İKİ dosyayı da kırardı. Bu
// dosya bu yüzden bir TEST DOSYASI DEĞİL, yalnızca tabloya özel bilgiyi
// (model adı, zorunlu kolonlar, FK bağımlılıkları) taşıyan bir yardımcıdır —
// `describe`/`it` İÇERMEZ, kaydı çağrı noktası yapar. `helpers/job.probe.ts`
// deseninin BİREBİR uygulamasıdır; yeni mekanizma icat EDİLMEDİ.
//
// ⚠⚠ BU DOSYANIN EN ÖNEMLİ YORUMU — R-PO4 (po'nun bağlayıcı şartı):
// `AuditLog` APPEND-ONLY bir tablodur. `schema.prisma`'nın yazılı kararı
// birebir: "Satır yazıldıktan sonra DEĞİŞMEZ; UPDATE yolu yoktur" — bu yüzden
// modelde `updatedAt` kolonu BİLEREK YOKTUR. Buna karşın `TenantScopedProbe`
// sözleşmesi (`tenant-isolation-suite.ts:61-64`) `updateRowById` VE
// `deleteRowById`'ı ZORUNLU tutar, çünkü süitin 3., 4. ve 5. senaryoları
// ("bulunamadı" semantiği · varlık/yetki oracle'ının KAPALI olması · hata
// gövdesinin yabancı kimlik SIZDIRMAMASI) tam olarak bu iki yol üzerinden
// ölçülür.
//
// Dolayısıyla aşağıdaki `updateRowById`/`deleteRowById`:
//   1. YALNIZCA izolasyon ÖLÇÜMÜ için vardır — `packages/db` dışına
//      ÇIKMAZ, hiçbir üretim kodu yolundan çağrılmaz ve `apps/api`'den
//      ÇAĞRILAMAZ (yalnızca test yardımcısı; dosya `__tests__/` altında ve
//      paketin `exports` yüzeyinde DEĞİL).
//   2. ÜRETİMDE KARŞILIĞI YOKTUR — denetim kaydının tek meşru yazma yolu
//      `writeAuditLog(tx, entry)` (architect K-A2, T-014/S4) olacak ve o yol
//      SALT INSERT'tir. Üretimde bir `auditLog.update`/`auditLog.delete`
//      çağrısı YOKTUR ve olmamalıdır.
//   3. APPEND-ONLY SÖZLEŞMESİNİN İHLALİ DEĞİLDİR: append-only, "bu tabloya
//      hangi SQL fiillerinin FİZİKSEL OLARAK uygulanabileceği" hakkında bir
//      iddia değil (Postgres seviyesinde `arkesoft_app` dört DML yetkisinin
//      dördüne de sahiptir — `catalog-lint.ts`'in `lintAppRoleDmlPrivileges`
//      kuralı bunu ZORUNLU tutar), UYGULAMA KATMANININ hangi yazma yollarını
//      AÇTIĞI hakkında bir iddiadır. Prob o yolu açmıyor; onun YOKLUĞUNDA
//      ölçülemeyecek bir güvenlik özelliğini (RLS'in UPDATE/DELETE'i de
//      filtrelediğini) ölçüyor. Tersi daha kötü olurdu: UPDATE/DELETE
//      yollarını ÖLÇMEDEN bırakmak, politikanın `USING` yan tümcesinin
//      SELECT dışındaki fiillerde de çalıştığını DOĞRULANMAMIŞ bırakırdı —
//      oysa `WITH CHECK` ve `USING`'in ayrı ayrı doğru olması migration'ın
//      kanonik politika metninin TAM OLARAK vaat ettiği şeydir.
//   4. ⚠ Bu gerekçe BURAYA yazıldı çünkü yazılmazsa prob, platformun
//      T-013'ten devralan ana dersi olan "BEYAN ≠ GERÇEKLİK" kusur sınıfının
//      ders kitabı örneği olurdu: şema "UPDATE yolu yoktur" DİYOR, kod ise
//      bir UPDATE yolu YAZIYOR. İkisi çelişmiyor — farklı katmanlar hakkında
//      konuşuyorlar — ama bu ancak AÇIKÇA yazılırsa denetlenebilir.
//
// ⚠ `TenantInvitation`'da bu sorun YOKTUR (`updatedAt` VAR, tekrar davet aynı
// satırı `upsert` ile günceller) — `tenant-invitation.probe.ts`'te bu
// gerekçenin karşılığı bilerek yazılmamıştır.
//
// JENERİK SÜİT BU DOSYAYI BİLMEZ: yedi zorunlu senaryonun tamamı
// (`tenant-isolation-suite.ts` dosya başı) aşağıdaki sekiz fonksiyon üzerinden
// koşar; süit `AuditLog`'un alan adlarını veya `audit_action` enum'unu HİÇ
// görmez.

import type { PrismaDatabase, TransactionClient } from '../../index.js'
import type { TenantScopedProbe } from './tenant-isolation-suite.js'

/**
 * Probun yazdığı `action` değeri.
 *
 * ⚠ NEDEN ENUM SABİTİ DEĞİL, LİTERAL: `AuditAction` `packages/db`'nin dışa
 * açık yüzeyinde (`src/index.ts`) YOKTUR — `JobStatus`'ün aksine bilerek
 * export edilmedi, çünkü `AuditAction` tele hiç çıkmıyor (S1 kararı). `index.ts`
 * S3'ün dosya kapsamı DIŞINDA, `#prisma` dolaylamasını dördüncü bir dosyadan
 * kırmak ise `eslint.config.mjs`'in korumaya çalıştığı tam şey. Literal yine de
 * DERLEME ZAMANINDA doğrulanır: Prisma'nın ürettiği `AuditLogCreateInput.action`
 * tipi `$Enums.AuditAction` literal birleşimidir → yanlış yazılmış bir değer
 * `typecheck`'i kırar (tip zorlaması/`as` KULLANILMADI).
 *
 * `member_invited` seçildi: `diff` şemasının (architect K-A2) en küçük hâli bu
 * eylemde (`{ role }`) ve prob `diff`in İÇERİĞİNİ değil tablonun İZOLASYONUNU
 * ölçüyor.
 */
const PROBE_AUDIT_ACTION = 'member_invited'

/**
 * Probun yazdığı `actorUserId`. ⚠ `actorUserId` FK TAŞIMAZ (S1 kararı: denetim
 * izi aktörden uzun yaşar) → gerçek bir `app_user` satırı GEREKMEZ, yani bu
 * probun `tenant_membership` probundaki gibi bir `User` bağımlılığı YOKTUR.
 *
 * ⚠ KASITLI OLARAK hiçbir kiracı kimliği TAŞIMAZ (job probunun aynı gerekçesi):
 * süitin 5. senaryosu hata gövdesinin yabancı `tenantId`'yi İÇERMEDİĞİNİ iddia
 * ediyor; buraya kiracı kimliği koymak o iddiayı sürücüsü kodun kendisi olan
 * bir yanlış pozitife açık hâle getirirdi.
 */
const PROBE_ACTOR_USER_ID = 'isolation-probe-actor'

/**
 * Probun yazdığı `subject`. `schema.prisma`'nın yazılı sözleşmesine göre
 * `member_invited` için `subject` bir `invitationId`'dir; prob gerçek bir davet
 * satırı KURMAZ (`audit_log` ile `tenant_invitation` arasında FK YOKTUR, zincir
 * yalnızca `diff` üzerinden yazılıdır) — bu yüzden değer, kiracı kimliği
 * taşımayan sabit bir yer tutucudur.
 *
 * ⚠ LİTERAL-JETON KURALI (AGENT_BASELINE §5): bu dosya R-PO9'un "bayat taksonomi
 * beyanı" grep'inin denetlediği jetonları (örn. taksonomi büyüklüğünü sayan
 * ifadeler) BİLEREK bitişik YAZMAZ — yazsaydı kendi kapısını kalıcı bir yanlış
 * pozitife düşürürdü.
 */
const PROBE_SUBJECT = 'isolation-probe-subject'

/** `subject`'in UPDATE denemesinde yazılacak değeri — bkz. `updateRowById`. */
const PROBE_SUBJECT_AFTER_UPDATE = 'isolation-probe-subject-updated'

/**
 * Probun yazdığı `diff` (JSONB, NOT NULL). ⚠ Kiracı kimliği, e-posta veya
 * başka bir PII TAŞIMAZ — `AuditLog.diff`'in üretimdeki yazma kapısı
 * (architect K-A2) zaten fazla anahtarları DÜŞÜRÜR; prob o kapıyı taklit
 * etmez, yalnızca NOT NULL kısıtını karşılar.
 */
const PROBE_DIFF = { role: 'staff' } as const

/** Context içinde (`tx`), verilen kiracı için bir `AuditLog` satırı kurar ve id'sini döner. */
async function createAuditLogRow(tx: TransactionClient, tenantId: string): Promise<string> {
  // ⚠ `id` ELLE VERİLMEZ: `@default(cuid(2))` DDL'de bir `DEFAULT` ÜRETMEZ
  // (ADR-0003 R2) ve bu yüzden HAM SQL yolunda `id` zorunlu olurdu — ama bu
  // prob ham SQL kullanmıyor, Prisma istemcisi üzerinden yazıyor; cuid2'yi
  // Prisma'nın kendi katmanı üretir (job probunun aynı yolu).
  const auditLog = await tx.auditLog.create({
    data: {
      tenantId,
      actorUserId: PROBE_ACTOR_USER_ID,
      action: PROBE_AUDIT_ACTION,
      subject: PROBE_SUBJECT,
      diff: PROBE_DIFF,
    },
  })
  return auditLog.id
}

/**
 * `audit_log` tablosunun izolasyon probu.
 *
 * `tenant_membership` probundan İKİ FARKI var: (1) `actorUserId` FK'sız olduğu
 * için yardımcı bir `User` satırı GEREKMEZ (tek FK'si `tenant_id`'dir),
 * (2) append-only sözleşmesi yüzünden `updateRowById`/`deleteRowById`'ın
 * gerekçesi dosya başında AYRICA yazılmak zorunda kaldı (R-PO4).
 */
export const auditLogProbe: TenantScopedProbe = {
  tableName: 'audit_log',

  insertRow: (tx, tenantId) => createAuditLogRow(tx, tenantId),

  findRowById: async (tx, rowId) => {
    const row = await tx.auditLog.findUnique({ where: { id: rowId }, select: { id: true } })
    return row
  },

  insertRowWithForeignTenant: async (tx, foreignTenantId) => {
    await createAuditLogRow(tx, foreignTenantId)
  },

  updateRowById: async (tx, rowId) => {
    // ⚠ GEREKÇE DOSYA BAŞINDA (R-PO4): bu yol YALNIZCA izolasyon ölçümü için
    // vardır, ÜRETİMDE KARŞILIĞI YOKTUR ve append-only sözleşmesini İHLAL
    // ETMEZ.
    //
    // `subject` seçildi: serbest metin bir kolon — enum/FK/UNIQUE kısıtı YOK
    // (S1'in ölçtüğü "güncellenebilir tek doğal alan `subject`/`diff`"
    // notundan). Bu, job probunun `progress` gerekçesiyle AYNI: reddedilmenin
    // TEK sebebi RLS olabilir, yani başka bir kısıt ihlali 3./4. senaryonun
    // "bulunamadı" iddiasını YANLIŞ SEBEPLE yeşile çeviremez. `diff` (JSONB)
    // de uygundu ama `subject` daha dar bir yüzey.
    await tx.auditLog.update({
      where: { id: rowId },
      data: { subject: PROBE_SUBJECT_AFTER_UPDATE },
    })
  },

  deleteRowById: async (tx, rowId) => {
    // ⚠ GEREKÇE DOSYA BAŞINDA (R-PO4) — `updateRowById` ile aynı.
    await tx.auditLog.delete({ where: { id: rowId } })
  },

  countAllRowsWithoutContext: async (client: PrismaDatabase) => client.auditLog.count(),

  cleanupTenant: async (client: PrismaDatabase, tenantId: string) => {
    // ⚠ TEMİZLİK KİRACI ÜZERİNDEN GİDER (S1'in S3'e devrettiği ölçüm):
    // denetim satırları RLS'e tabi — context'siz bir `auditLog.deleteMany` 0
    // satır etkiler ve SESSİZCE başarılı olurdu. `tenant` FK'si `onDelete:
    // Cascade` olduğu için kiracıyı silmek satırları birlikte temizler
    // (cascade RLS'e TABİ DEĞİLDİR; `membership`/`job` problarının aynı
    // ampirik gözlemi).
    //
    // ⚠ `actorUserId` FK'SIZ olduğu için KULLANICI SİLMEK bu satırları
    // TEMİZLEMEZ — `tenant_membership` probunun `user.deleteMany` adımının
    // burada bir karşılığı YOKTUR ve olmaması doğrudur (prob hiç `User`
    // satırı yaratmıyor).
    //
    // Süit her tablo için KENDİ benzersiz kiracılarını kurduğu (slug'da
    // `randomUUID`) için bu çağrı başka bir testin verisine dokunamaz.
    await client.tenant.delete({ where: { id: tenantId } })
  },
}
