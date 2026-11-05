// @arkesoft/api — OWNER_MEMBERSHIP_PROTECTED (ROADMAP v0.0.14, T-014/S4,
// architect K-A11 — INV-OWNER)
//
// INV-OWNER: HER KİRACININ TAM OLARAK BİR `owner`'I VAR. Bu hata o
// değişmezin korunduğu ÜÇ reddi birden taşır:
//   (a) `member.remove` hedefi `owner` üyeliğidir → çıkarılamaz,
//   (b) `member.updateRole` `owner` üyeliğini BAŞKA bir role indiriyor →
//       sahiplik "boşa" düşerdi (sahipsiz kiracı),
//   (c) `member.updateRole` `role: 'owner'` ile çağrıldı ama AKTÖR artık
//       owner DEĞİL — devri yalnızca mevcut owner yapabilir; ayrıca aktörün
//       owner satırını `admin`'e indiren CAS (karşılaştır-ve-değiştir)
//       SIFIR satır etkiledi, yani eşzamanlı bir devir yarışı KAYBEDİLDİ.
//
// ⚠ (c)'NİN YARIŞ YARISI BU HATANIN MEKANİK ÖZÜDÜR: "en az bir owner"
// değişmezi klasik write-skew'e açıktır (iki eşzamanlı owner çıkarma, her
// biri "diğeri var" görür) ve kapatmak satır kilidi için ham SQL isterdi —
// oysa o yüzey kiracı kapsamlı istemciden BİLEREK dışarıda. "TAM BİR"
// biçiminde her devir TEK owner satırını GÜNCELLEMEK zorundadır → satır
// kilidi işi SERİLEŞTİRİR; ikinci transaction CAS'i sıfır satırla görür ve
// bu hatayı alır. Ek mekanizma GEREKMEZ.
//
// `409` (çakışma): istek geçerli, aktör `member:write` iznine SAHİP; reddin
// sebebi kaynağın MEVCUT DURUMU ve korunan bir değişmez. `403` olsaydı
// "yetkin yok" derdi — oysa owner'ın KENDİSİ de bu hatayı alır (kendi
// üyeliğini silmeye kalkarsa), yani bu bir yetki reddi DEĞİL.
//
// `context` yalnızca hangi reddin tetiklendiğini söyleyen kapalı bir sözlük
// değeri taşır — PII yok, rol/izin adı yok.
//
// ⚠ BU DEĞERİN NEREDE GÖRÜNDÜĞÜ T-014 düzeltme turu 1'de GERÇEK OLDU
// (`solid` M-1): aşağıdaki "log tüketicileri bu değeri filtreler" cümlesi o
// tarihte KARŞILIKSIZDI — tRPC yolundan geçen `AppError`'lar HİÇBİR YERE
// yazılmıyordu. Kaydı artık `@arkesoft/trpc`'nin `appErrorBoundary`'si yazıyor
// (`trpc.ts` → `logAppError`); 409 bir 4xx olduğu için seviye `warn` ve
// `reason` kaydın `context` alanının altında görünüyor.

import { AppError } from '@arkesoft/errors'

/**
 * Reddin hangi kuralı koruduğu. Kapalı birleşim: yeni bir redde ihtiyaç
 * duyulursa bu sözlüğe değer eklemek AÇIK bir karardır (log tüketicileri
 * bu değeri filtreler).
 */
export type OwnerMembershipProtectionReason =
  'remove_owner' | 'demote_owner' | 'transfer_without_ownership'

export class OwnerMembershipProtectedError extends AppError {
  constructor(reason: OwnerMembershipProtectionReason) {
    super({
      code: 'OWNER_MEMBERSHIP_PROTECTED',
      httpStatus: 409,
      userMessageKey: 'errors.member.ownerMembershipProtected',
      context: { reason },
      isRetryable: false,
    })
  }
}
