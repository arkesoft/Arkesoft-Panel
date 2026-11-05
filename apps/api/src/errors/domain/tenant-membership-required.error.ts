// @arkesoft/api — TENANT_MEMBERSHIP_REQUIRED (ROADMAP v0.0.5, T-006/S6,
// architect "HATA SINIFLARI" bölümü, R2/K4 madde 3)
//
// `AuthGuard`'ın R2 üyelik kontrolünün fırlattığı hata — kimliği
// doğrulanmış (geçerli oturumu olan) bir kullanıcının BU kiracıya üye
// OLMADIĞI durum. `httpStatus: 403` (401 DEĞİL — kullanıcı kim olduğunu
// KANITLADI, sadece bu kaynağa erişimi YOK; K4(3)'ün ayrımı).
//
// `context` — YALNIZCA loglanır (`toErrorBody` asla serileştirmez, CLAUDE.md
// §4/§7 "kullanıcı varlığı sızdırılmaz" ilkesinin burada karşılığı YOK —
// kiracının varlığı vitrin host'u üzerinden ZATEN herkese açık, K4(3)
// gerekçesi). Taşınan alanlar opak cuid'dir, PII DEĞİL.
//
// ⚠⚠ ÖZNE AYRIMI (ROADMAP v0.0.14, T-014 düzeltme turu 1 — `security` medium
// #1'in ZORUNLU ikinci yarısı). Bu sınıfın İKİ ÇAĞRI YERİ var ve ÖZNELERİ
// FARKLI:
//   · `AuthGuard`'ın R2 üyelik kontrolü → reddedilen kişi AKTÖRDÜR.
//   · `MemberService`'in `updateRole`/`remove` yolu → reddedilen kişi işlemin
//     HEDEFİDİR; aktör yetkili ve üyedir.
// İstek child logger'ı `userId`'yi AKTÖRE bağlıyor
// (`auth-context.middleware.ts`). Hedefi de `context.userId`'ye koymak, hata
// sınırı loglamaya başladığı an AYNI ANAHTARI İKİ DEĞERLE yazardı ve denetim
// izi aktörü YANLIŞ ATFEDERDİ (ÖLÇÜLDÜ: pino child bağlamı ile çağrı
// nesnesi aynı NDJSON satırında İKİ KEZ görünür). Bu yüzden hedef alanı
// `targetUserId`'dir.
//
// ⚠ KOD/HTTP DURUMU/i18n ANAHTARI İKİ YOLDA DA BİREBİR AYNI: ayrım yalnızca
// LOG bağlamının alan adındadır, tel gövdesine HİÇBİR ŞEY sızmaz ve yeni bir
// hata sınıfı İCAT EDİLMEZ ("mevcut sınıf yeniden kullanılır" kararı
// `member.service.ts`'te yazılı).
//
// ⚠ ÜÇÜNCÜ PARAMETRE VARSAYILANI `'actor'`: platformun ilk ve asıl çağrı yeri
// (`AuthGuard`) AKTÖRÜ reddediyor ve o dosya bu sürümde DEĞİŞMİYOR —
// varsayılan, orada ÖNCEKİ davranışı (`context: {userId, tenantId}`) BİREBİR
// korur. Hedef özneli çağıran `'target'`ı AÇIKÇA geçirmek zorundadır.

import { AppError } from '@arkesoft/errors'

/**
 * Reddin ÖZNESİ — `context`'in kullanıcı alanının ADINI belirler. Kapalı
 * birleşim: üçüncü bir özne gerekirse bu sözlüğe değer eklemek AÇIK bir
 * karardır (log tüketicileri bu alan adlarına göre filtreler).
 */
export type MembershipRejectionSubject = 'actor' | 'target'

export class TenantMembershipRequiredError extends AppError {
  constructor(userId: string, tenantId: string, subject: MembershipRejectionSubject = 'actor') {
    super({
      code: 'TENANT_MEMBERSHIP_REQUIRED',
      httpStatus: 403,
      userMessageKey: 'errors.auth.tenantMembershipRequired',
      context: subject === 'actor' ? { userId, tenantId } : { targetUserId: userId, tenantId },
      isRetryable: false,
    })
  }
}
