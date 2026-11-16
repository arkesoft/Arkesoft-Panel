// @arkesoft/superadmin — platform-session-gate (ROADMAP v0.0.20, T-021/S8,
// docs/ui/T-021-super-admin-iskeleti.md "Dosya türü disiplini" — karar
// mantığı `.ts`'e, DOM/React GEREKMEDEN test edilebilir)
//
// SAF fonksiyon — `platform.session`'ın sonucunu (yükleniyor/hata/
// `isPlatformAdmin`/`twoFactorEnabled`) hangi ekran/duvarın render edileceği
// kararına çevirir. Üç 403'ün (`PLATFORM_ADMIN_REQUIRED` → `unauthorized`,
// `TWO_FACTOR_REQUIRED` → bu fonksiyon `platform.session`'ın BAŞARILI
// gövdesinden türetir, hata DEĞİL; `PLATFORM_NETWORK_NOT_ALLOWED` →
// `networkBlocked`) KARAR noktası BURADADIR — `_app.tsx`'in guard'ı ve
// `routes/iki-adimli-dogrulama.tsx` İKİSİ DE bu AYNI fonksiyonu çağırır
// (tek doğruluk kaynağı, karar iki yerde elle tekrarlanmaz).
//
// ⚠⚠ AC-4(a)'nın controller düzeyindeki kanıtı — `__tests__/platform-
// session-gate.test.ts` — bu dosyadadır: 2FA'sı kapalı bir platform
// yöneticisi için `kind: 'twoFactorSetupRequired'` döndüğü, DOM/ağ hiç
// kurulmadan, saf bir `expect` ile kanıtlanır.
import type { PlatformSession } from '@arkesoft/trpc'

import type { PanelError } from '../../errors/panel-error.js'

export type PlatformSessionGateOutcome =
  | { readonly kind: 'pending' }
  | { readonly kind: 'networkBlocked' }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'twoFactorSetupRequired' }
  | { readonly kind: 'ready'; readonly session: PlatformSession }
  | { readonly kind: 'error' }

export interface PlatformSessionGateInput {
  readonly status: 'pending' | 'error' | 'success'
  readonly data: PlatformSession | undefined
  readonly error: PanelError | null
}

/** `PlatformAdminIpGuard`'ın ÜÇÜNCÜ katman reddi — allowlist'in içeriği hiçbir koşulda burada görünmez (yalnızca kod karşılaştırılır). */
const PLATFORM_NETWORK_NOT_ALLOWED_CODE = 'PLATFORM_NETWORK_NOT_ALLOWED'

/**
 * `platform.session`'ın TanStack Query durumunu (status/data/error) tek bir
 * render kararına indirger. Dallanma SIRASI bağlayıcıdır:
 *   1. `pending` → henüz karar yok.
 *   2. `error` + `PLATFORM_NETWORK_NOT_ALLOWED` → `networkBlocked` (ağ reddi,
 *      kimlik/yetki durumu bu noktada BİLİNMİYOR — fail-closed "bilmiyorum").
 *   3. diğer `error` → genel `error` (ağ/sunucu, kimlik/yetki durumu belirsiz).
 *   4. `success` + `!isPlatformAdmin` → `unauthorized` (yetkisiz, eylemsiz).
 *   5. `success` + `isPlatformAdmin` + `!twoFactorEnabled` →
 *      `twoFactorSetupRequired` (`/iki-adimli-dogrulama`'ya yönlendirilir).
 *   6. `success` + `isPlatformAdmin` + `twoFactorEnabled` → `ready`.
 */
export function resolvePlatformSessionGateOutcome(
  input: PlatformSessionGateInput,
): PlatformSessionGateOutcome {
  if (input.status === 'pending') {
    return { kind: 'pending' }
  }

  if (input.status === 'error') {
    if (input.error?.kind === 'known' && input.error.code === PLATFORM_NETWORK_NOT_ALLOWED_CODE) {
      return { kind: 'networkBlocked' }
    }
    return { kind: 'error' }
  }

  // `status === 'success'` TanStack Query sözleşmesinde `data`'yı garanti
  // eder, ama bu fonksiyonun girdi TİPİ (`PlatformSessionGateInput`) ikisini
  // BAĞIMSIZ alanlar olarak tutar — tip zorlama (`as`) KULLANILMAZ (CLAUDE.md
  // §2: zorlama yalnızca Zod doğrulamasından HEMEN SONRA kabul edilir, bu
  // burada geçerli değil). `undefined` kalırsa (çağıranın kendi hatası) fail-
  // closed `pending`'e düşülür — asla `unauthorized`/`ready` UYDURULMAZ.
  if (input.data === undefined) {
    return { kind: 'pending' }
  }
  const session = input.data

  if (!session.isPlatformAdmin) {
    return { kind: 'unauthorized' }
  }

  if (!session.twoFactorEnabled) {
    return { kind: 'twoFactorSetupRequired' }
  }

  return { kind: 'ready', session }
}
