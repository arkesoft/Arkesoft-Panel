// @arkesoft/api — StepUpService (ROADMAP v0.0.15.1, T-017/S5, ADR-0019 §Karar 4)
//
// Hassas bir işlemden önce ÇAĞIRANIN güncel parolasını doğrular. Kütüphanenin
// "taze oturum" mekanizması (`freshSessionMiddleware`/`freshAge`) KULLANILMAZ
// (ADR-0019 §Karar 4, bağlayıcı — tazelik oturumun OLUŞTURULMA zamanından
// hesaplanır, SON yeniden kimlik doğrulamadan DEĞİL). Bunun yerine
// kütüphanenin bugün HİÇBİR dışa açık yoldan erişilemeyen sunucu-kapsamlı
// parola doğrulama ucu (`auth.api.verifyPassword`, `password.mjs:167-197`)
// PROGRAMATİK olarak çağrılır.
//
// ⚠⚠ `/auth/verify-password` `AUTH_DELEGATED_PATHS`'E EKLENMEZ (ADR-0019
// §Karar 4, bağlayıcı) — HTTP'den erişilebilir bir "parolamı doğrula" ucu bir
// parola ORACLE'I olurdu. `AuthController`'ın allowlist-dışı 404'ü bunu
// bugün ZATEN erişilemez tutuyor; bu disiplin BİLEREK KORUNUR.
//
// `headers` NEREDEN GELİR: `verifyPassword`'ün `use: [sensitiveSessionMiddleware]`
// taşıması (ÖLÇÜLDÜ, `password.mjs:188`) kütüphanenin kullanıcıyı ÇAĞIRANIN
// çerezinden türettiği anlamına gelir — `SessionsService.revokeOwnSession()`
// içindeki `auth.api.revokeSession({ body, headers })` çağrısıyla BİREBİR
// AYNI desen (satır numarası YERİNE fonksiyon adıyla atıf — M-2 refaktörü
// satırları kaydırdı, dayanıklılık için L-6 düzeltmesi). Bu yüzden
// `assertVerified` ikinci bir oturum sorgusu YAPMAZ, çağıranın ZATEN
// taşıdığı ham istek başlıklarını `toWebHeaders()` ile Web `Headers`'a
// çevirip İLETİR.
//
// Sıra bağlayıcıdır (ADR-0019 §Karar 4): çağıran bu kapıyı SAHİPLİK
// doğrulamasından ÖNCE çalıştırmak ZORUNDADIR — tersi olsaydı parolasız
// çağıran, verilen kaynak kimliğinin var olup olmadığını öğrenen bir varlık
// oracle'ı kazanırdı (bu kuralın UYGULANMASI çağıranın işi — S8a/S8b).
//
// Hata eşlemesi (bağlayıcı):
//   - parola yok/boş                       → `InvalidPasswordError` (400)
//   - `verifyPassword` bir `APIError` fırlatır → `InvalidPasswordError` (400)
//     (`isAPIError` DARALTMASI — ADR-0019 §Karar 5, tek-biçimli sinyal;
//     "eksik" ile "yanlış" AYIRT EDİLMEZ)
//   - BEKLENMEDİK hata (APIError DEĞİL)      → `AuthProviderFailedError`
//     (503, `isRetryable:true`) — hata YUTULMAZ, `cause` olarak SARMALANIR
//     (`AuthProviderFailedError`'ın dosya başı yorumuyla AYNI disiplin).

import { Inject, Injectable } from '@nestjs/common'
import { isAPIError } from 'better-auth/api'
import type { Auth } from 'better-auth'

import { AUTH_INSTANCE } from '../auth.tokens.js'
import { AuthProviderFailedError } from '../../errors/domain/auth-provider-failed.error.js'
import { InvalidPasswordError } from '../../errors/domain/invalid-password.error.js'
import type { HttpRequestHeaders } from '../../http/http-request.types.js'
import { toWebHeaders } from '../../http/to-web-headers.js'
import type { SensitiveOperation } from './sensitive-operations.js'

@Injectable()
export class StepUpService {
  constructor(@Inject(AUTH_INSTANCE) private readonly auth: Auth) {}

  /**
   * `_operation` ŞU AN dallanmaya girmez (tek-biçimli sinyal, ADR-0019
   * §Karar 5) — imzada taşınması TEK kataloğun (`SENSITIVE_OPERATIONS`)
   * çağıranı (S8a/S8b) `keyof` ile TİP SEVİYESİNDE bağlamasını sağlar;
   * serbest bir `string` değil, katalogdaki ALTI değerden biri OLMAK
   * ZORUNDADIR — ileride (S8b'nin tablo sürümlü testi) işlem bazlı
   * denetim/log ayrımına genişletilebilir bir ÇAPA. `_` öneki
   * `@typescript-eslint/no-unused-vars`'ın `argsIgnorePattern` kuralıyla
   * (`packages/config/eslint/base.js`) BİLİNÇLİ olarak kullanılmadığını
   * işaretler.
   *
   * Başarıda `void` döner (parola DOĞRU) — fırlatmazsa çağıran devam eder.
   */
  async assertVerified(
    _operation: SensitiveOperation,
    password: string | undefined,
    headers: HttpRequestHeaders,
  ): Promise<void> {
    if (password === undefined || password.length === 0) {
      throw new InvalidPasswordError()
    }

    try {
      await this.auth.api.verifyPassword({
        body: { password },
        headers: toWebHeaders(headers),
      })
    } catch (error) {
      if (isAPIError(error)) {
        throw new InvalidPasswordError()
      }
      throw new AuthProviderFailedError(error)
    }
  }
}
