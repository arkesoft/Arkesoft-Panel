// @arkesoft/api — teste özel kimlik doğrulama probe controller'ı (ROADMAP
// v0.0.5, T-006/S6, architect K7 — "Korumalı uç için ÜRETİM KODU
// EKLENMİYOR")
//
// ÜRETİM KODUNA UÇ EKLENMEZ: `test-probe.controller.ts`'in (T-002/ST-7)
// AYNI deseni — `src/__tests__/helpers/**` altında yaşar, `AppModule`'ün
// `controllers`'ına HİÇBİR ZAMAN eklenmez; `createTestApp({smokeControllers})`
// `AppModule`'ü İTHAL EDEN geçici bir test modülüne bu controller'ı ekler.
//
// TEK uç: `GET /__auth_probe` — HİÇBİR allowlist/muafiyet ALMAZ (varsayılan
// KORUMALI, fail-closed) → `AuthGuard` + `TenantGuard` zincirinden geçmek
// ZORUNDADIR. Handler'ın GÖVDESİ `@CurrentUser()`'ın ALS'den okuduğu
// kimliği OLDUĞU GİBİ yansıtır — AC4(e)/(f) ve AC10'un gözlem yüzeyi budur.
//
// K7 kapsam pini: bu dosya `session.me`/`get-session` ADLARINI TAŞIMAZ —
// v0.0.6'nın kapsamını ÖNCEDEN TÜKETMEZ (yalnızca ham `CurrentUserIdentity`'yi
// döner, kullanıcı/oturum zenginleştirmesi YOK).

import { Controller, Get } from '@nestjs/common'

import type { CurrentUserIdentity } from '../../auth/auth-resolution.types.js'
import { CurrentUser } from '../../auth/current-user.decorator.js'

@Controller('__auth_probe')
export class AuthProbeController {
  /** AC4(e)/(f), AC5, AC10 — ALS'deki çözülmüş kimliği (varsa) döner. */
  @Get()
  getIdentity(@CurrentUser() identity: CurrentUserIdentity): CurrentUserIdentity {
    return identity
  }
}
