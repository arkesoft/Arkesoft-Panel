// @arkesoft/api — denetim kaydının TEK yazma yolu (ROADMAP v0.0.14, T-014/S4,
// architect K-A2)
//
// ⚠⚠ BU DOSYA PLATFORMDA DENETİM KAYDI SATIRI ÜRETEN TEK ÜRETİM KOD
// YOLUDUR. Mekanik kapı: `apps/api/src/**` (testler hariç) içinde denetim
// kaydı tablosunun yazma delegesine yapılan çağrı YALNIZCA burada eşleşir.
// Kapının NEDEN gerekli olduğu ölçüldü (architect'in "en kolay atlanacak üç
// şey" listesi, madde 3): bir servisin o delegeyi DOĞRUDAN çağırması
// DERLEMEYİ KIRMAZ — tip sistemi kiracı kapsamını zorlar, ŞEMA kapısını
// zorlamaz. Bu yüzden ikinci savunma bir grep kapısıdır ve kapsamı
// `apps/api/src/**` eksi test dizini olmalıdır (izolasyon süitinin probu o
// delegeyi MEŞRU olarak çağırıyor; repo geneli bir grep kalıcı yanlış pozitif
// verir — po R-PO5).
//
// ⚠⚠ İMZANIN BİRİNCİ PARAMETRESİ BİR YORUM DEĞİL, BİR KISITTIR: `tx` tipi
// kiracı kapsamlı transaction istemcisidir. Veri katmanının allowlist'i
// (`packages/db/src/client.ts`, architect K-A3) denetim kaydı delegesini
// kiracı-SIZ istemci tipine BİLEREK EKLEMEDİ → denetim kaydını kiracı bağlamı
// dışında yazmak DERLENMEZ. Sonuç: kayıt HER ZAMAN `withTenant()` içinde ve
// iş yazmasıyla AYNI transaction'da düşer. "Aynı transaction'a koymayı unutma"
// bir inceleme notu değil, bir derleme kısıtıdır.
//
// ⚠⚠ LOG SIZMAZ (CLAUDE.md §4 "asla loglanmaz" + architect K-A14 md 13): bu
// dosya HİÇBİR logger'ı import ETMEZ ve almaz. `ip`, `userAgent` ve `diff`
// hiçbir log çağrısına geçmez — denetim kaydının varlık sebebi bu alanları
// SAKLAMAKTIR, loglamak değil. (`ip`/`userAgent` kişisel veri sınıfındadır ama
// §4'ün yasak listesinde yoktur: SAKLANIR, LOGLANMAZ.) Bu dosyada bir logger
// parametresi/alanı olmaması o iddianın YAPISAL yarısıdır; çalışma zamanı
// yarısı log yakalama testiyle ölçülür (AC6).

import type { TenantTransactionClient } from '@arkesoft/db'
import type { z } from 'zod'

import type { AuditDiffValue, AuditLogEntry } from './audit-diff.schemas.js'
import { AUDIT_DIFF_SCHEMA_BY_ACTION, resolveAuditSubject } from './audit-diff.schemas.js'

/**
 * `user_agent` kolonuna yazılacak azami karakter sayısı. İstemci tanıtıcısı
 * TAMAMEN istemci kontrolündedir ve uzunluk sınırı YOKTUR — kırpma bu yüzden
 * kapıda yapılır, çağıranda değil (iki çağıran iki farklı sınır uygulayamaz).
 *
 * ⚠ `export`: kabul kriteri testleri (ayrı alt görev) sınırı KOPYALAMAZ,
 * buradan okur — kopyalanmış bir beklenti sapar ve sapması görünmez olur.
 */
export const AUDIT_USER_AGENT_MAX_LENGTH = 512

/**
 * Denetim kaydı satırı yazar. Başarısızlık YUTULMAZ — Prisma'nın fırlattığı
 * her hata (ör. RLS `WITH CHECK` reddi) çağırana aynen gider ve iş
 * yazmasıyla aynı transaction olduğu için işin TAMAMINI geri alır. "Denetim
 * kaydı yazılamadı ama iş yazıldı" durumu bu yüzden YAPISAL OLARAK imkânsızdır.
 *
 * `diff` eylemin şemasından geçirilir (`parse`, `safeParse` DEĞİL):
 *   · fazla anahtar (sır/PII dahil) DÜŞÜRÜLÜR — `z.object`'in soyma davranışı,
 *   · eksik/yanlış tipli anahtar FIRLATIR — sessizce bozuk bir denetim izi
 *     yazmak, denetim izinin varlık sebebini ortadan kaldırır.
 *
 * `subject` kolonu çağıranın verdiği GENEL bir dizeden DEĞİL, eylem başına
 * adıyla anılan alandan okunur (A-DB1'in zorlayıcısı —
 * `audit-diff.schemas.ts`).
 */
export async function writeAuditLog(
  tx: TenantTransactionClient,
  entry: AuditLogEntry,
): Promise<void> {
  // Birleşimi ORTAK üst tipe daraltmak bilinçli: `AUDIT_DIFF_SCHEMA_BY_ACTION`
  // birleşim anahtarıyla indekslendiğinde ŞEMA BİRLEŞİMİ döner ve o birleşim
  // üzerinde `parse` çağırmak çağrı imzası birleşimine girer. Ortak üst tip
  // (`z.ZodType<AuditDiffValue>`) `satisfies` ile ZATEN kanıtlanmış olduğu için
  // bu daraltma bir tip zorlaması DEĞİL, atanabilirlik.
  const diffSchema: z.ZodType<AuditDiffValue> = AUDIT_DIFF_SCHEMA_BY_ACTION[entry.action]
  const diff: AuditDiffValue = diffSchema.parse(entry.diff)

  await tx.auditLog.create({
    data: {
      // ⚠ Kolon ELLE verilir çünkü RLS yazma yolunda bir DEFAULT üretmez;
      // doğrulayıcısı politikanın `WITH CHECK` yüklemidir — transaction'ın
      // kiracı bağlamıyla eşleşmeyen bir değer SESSİZCE yazılmaz, INSERT
      // reddedilir (tabloda FORCE RLS etkin).
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      subject: resolveAuditSubject(entry),
      diff,
      ip: entry.ip,
      userAgent: entry.userAgent?.slice(0, AUDIT_USER_AGENT_MAX_LENGTH) ?? null,
    },
  })
}
