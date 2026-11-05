// @arkesoft/api — test-ONLY fixture (ROADMAP v0.0.14.1, T-015 FIX turu 2,
// solid'in SRP reçetesi · qa QA-3/QA-4 · solid SD-9)
//
// BAĞLAM: `auth-secret-leak.test.ts`/`auth-flow.test.ts`'in "better-call'un
// `console.error`'ı şifre sızdırmaz" testi İKİ AYRI sistem sınırını TEK
// kurulumda taşıyordu — açılış/kablolama invariant'ı (DI yaşam döngüsü,
// `AuthPrismaClientResource.onModuleInit`) VE istek anı davranışı
// (better-call/hata sınırı/logger). FIX turu 1 `onModuleInit`'e GERÇEK bir DB
// probu (`assertAuthRoleIsRestricted`) ekleyince ilk sınır GERÇEKLEŞTİ ve
// testin "arrange" fazı (bozuk `DATABASE_AUTH_URL` ile AÇILIŞ) artık İKİNCİ
// sınırın "act" fazına (istek gönderip hatayı YAKALAMAK) HİÇ ULAŞAMADI — test
// yeşil kaldı ama `request(...)` HİÇ ÇAĞRILMADI (QA-3).
//
// DÜZELTME (solid'in reçetesi): istek-fazı testleri bu fixture'ı kullanarak
// `AuthPrismaClientResource`'UN ÜRETİM `onModuleInit`'İNİ (gerçek
// `assertAuthRoleIsRestricted` çağrısı, DB'ye bağımlı) BYPASS eder — böylece
// AÇILIŞ, `DATABASE_AUTH_URL` ulaşılamaz/yanlış OLSA BİLE BAŞARILI olur ve
// bağlantı denemesi (lazy `$connect`, dosya başı yorumu `auth.module.ts`)
// İLK SORGUYA (istek anına) KAYAR — tam eski "ulaşılamayan veritabanı" istek
// anı senaryosunu, ÜRETİM boot kapısına BAĞIMLI OLMADAN yeniden üretir.
//
// ⚠⚠ ÜRETİM KAPISI BU DOSYADA GEVŞETİLMİYOR/YUTULMUYOR: `AuthPrismaClientResource`
// SINIFININ KENDİSİ hiç değişmedi, `catch {}` eklenmedi. Gerçek fail-closed
// boot probu (çağrı sayısı 1, `onModuleInit` içinde `throw`) KENDİ, AYRI
// testinde ('ulaşılamayan DATABASE_AUTH_URL → AÇILIŞ reddedilir') doğrulanır
// — bu fixture YALNIZCA request-fazı testlerinin DI kablolamasında kullanılır.

import { Inject, Injectable } from '@nestjs/common'
import type { Logger } from 'pino'

import type { ApiEnv } from '../../config/api-env.js'
import { API_ENV } from '../../config/config.tokens.js'
import { ROOT_LOGGER } from '../../logging/logging.tokens.js'
import { AuthPrismaClientResource } from '../../auth/auth.module.js'

/**
 * `AuthPrismaClientResource`'u GENİŞLETİR — `client`/`onModuleDestroy`
 * BİREBİR KORUNUR (lazy bağlantı, kapanışta `$disconnect()`), yalnızca
 * `onModuleInit` KASITLI OLARAK BOŞ: üretim probu (DB'ye bağımlı
 * `assertAuthRoleIsRestricted`) burada ÇALIŞTIRILMAZ.
 */
@Injectable()
export class AuthPrismaClientResourceBootProbeFixture extends AuthPrismaClientResource {
  constructor(@Inject(API_ENV) env: ApiEnv, @Inject(ROOT_LOGGER) logger: Logger) {
    super(env, logger)
  }

  override async onModuleInit(): Promise<void> {
    // Kasıtlı olarak BOŞ — dosya başı yorumu. Üretim kapısı BURADA değil,
    // `AuthPrismaClientResource`'un KENDİ testinde doğrulanır.
  }
}
