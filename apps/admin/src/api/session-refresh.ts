// @arkesoft/admin — `session.me`'nin TEK tazeleme (invalidation) yardımcısı
// (ROADMAP v0.0.15, T-016 FIX turu 2/M-4 — bağlayıcı).
//
// 2FA durumunun (`twoFactorEnabled: boolean`, `session.me`) TEK doğruluk
// kaynağı sunucudur — artık sekme-başına bir YEREL depo (silinen
// `two-factor-status-store.ts`) YOK. Bu yüzden HER 2FA mutasyonu
// (`enable`→`verify-totp` başarısı, `disable` başarısı) sonrası bu
// fonksiyon ÇAĞRILMAK ZORUNDA — aksi hâlde kart eski değeri gösterir
// (AC11'in zaten var olan tazeleme gereksinimiyle AYNI yer; `TwoFactor
// SetupWizard`/`TwoFactorStatusCard` İKİSİ DE bu TEK fonksiyonu çağırır,
// birbirinden BAĞIMSIZ `invalidateQueries` çağrısı YOK).
import type { QueryClient } from '@tanstack/react-query'

import { sessionMeQueryKey } from './session-query.js'

/** `session.me` sorgusunu invalidate eder — aktif gözlemciler HEMEN yeniden çeker. */
export function invalidateSessionIdentity(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: sessionMeQueryKey })
}
