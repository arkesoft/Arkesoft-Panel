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
 * `ip` kolonuna yazılacak azami karakter sayısı (ROADMAP v0.0.17, T-028/S4,
 * borç `:3952` — **hijyen yarısı**, `security` tur 1 L5). Değer POSIX
 * `INET6_ADDRSTRLEN`'in (46, sonlandırıcı dahil) taşıdığı en uzun GEÇERLİ
 * IPv6 metin gösterimi uzunluğudur (45 karakter, sonlandırıcı HARİÇ).
 *
 * ⚠⚠ BU SADECE UZUNLUK KIRPMASI — `security`'nin önerdiği İKİNCİ yarı
 * (biçim DOĞRULAMASI: `X-Forwarded-For` güvenilir vekil sayısı yapılandırma
 * hatasında istemcinin KENDİ yazdığı bir dizenin denetim izine düşmesi)
 * BİLEREK bu sürümde YOK — `architect`'in bağlayıcı kararı: semantik
 * doğrulama güvenilir ingress'in geldiği v0.18.0'a kadar BEKLER (bugün
 * `AUTH_TRUSTED_PROXY_COUNT` varsayılanı 0 → bu dal sömürülemez). Aynı
 * gerekçe `AUDIT_USER_AGENT_MAX_LENGTH` için de geçerli — istemci kontrolünde
 * ve uzunluk sınırı olmayan bir dizeyi SAKLAMADAN ÖNCE kırpmak.
 *
 * ⚠ `export`: kabul kriteri testleri sınırı KOPYALAMAZ, buradan okur.
 */
export const AUDIT_IP_MAX_LENGTH = 45

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
      // Sınır KOPYALANMAZ, `AUDIT_IP_MAX_LENGTH`'ten import edilir (borç `:3952`
      // hijyen yarısı — `userAgent` İLE AYNI desen: `null` AYNEN `null` kalır,
      // dolu değer sınıra kırpılır).
      ip: entry.ip?.slice(0, AUDIT_IP_MAX_LENGTH) ?? null,
      userAgent: entry.userAgent?.slice(0, AUDIT_USER_AGENT_MAX_LENGTH) ?? null,
    },
  })
}
