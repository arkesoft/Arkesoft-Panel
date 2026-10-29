// @arkesoft/api — kullanıcı uygunluğu (ROADMAP v0.0.5, T-006/S6, architect
// "VERİ MODELİ" → "Açık uç")
//
// Better Auth'un KENDİ oturum/giriş akışı `User.status`/`User.deletedAt`
// alanlarını BİLMEZ (bunlar Better Auth'a `additionalFields` olarak
// TANITILMADI, `auth-instance.ts` — S5'in dosyası, BU ALT GÖREVDE
// DOKUNULMADI) → soft-delete edilmiş veya `suspended` bir kullanıcının
// ÖNCEDEN kurulmuş bir oturumu `auth.api.getSession()`'dan GEÇERLİ dönmeye
// DEVAM EDER. Bu kontrol ATLANIRSA silinmiş/askıya alınmış bir kullanıcı
// korumalı uçlara erişmeyi SÜRDÜRÜR.
//
// SAF fonksiyon — DB okumasını KENDİSİ YAPMAZ (çağıran, `AuthContextMiddleware`,
// `PrismaService.db.user.findUnique()`'in `select:{status,deletedAt}` sonucunu
// buraya VERİR). Uygun OLMAYAN kullanıcı `AuthContextMiddleware`'de
// `unauthenticated` olarak İŞLENİR (K5'in ruhu: hesap durumu İSTEMCİYE
// SIZDIRILMAZ — "oturum yok" ile "hesap uygun değil" AYNI 401 cevabını alır).

import { UserStatus } from '@arkesoft/db'

/** `user-eligibility` kontrolünün ihtiyaç duyduğu asgari kullanıcı alanları. */
export type UserEligibilityInput = {
  readonly status: UserStatus
  readonly deletedAt: Date | null
}

/**
 * Bir kullanıcının geçerli bir oturumu kullanmaya devam edip edemeyeceğini
 * belirler. `status === 'active' && deletedAt === null` — ikisi birlikte,
 * HERHANGİ biri eksikse (`suspended` VEYA soft-delete edilmiş) uygun DEĞİLDİR.
 */
export function isEligibleUser(input: UserEligibilityInput): boolean {
  return input.status === UserStatus.active && input.deletedAt === null
}
