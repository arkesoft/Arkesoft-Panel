// @arkesoft/api — API'ye özgü ortam değişkeni şeması (ROADMAP v0.0.4, T-002/ST-2,
// architect Kapsam §3)
//
// `infraEnvSchema`'yı (`@arkesoft/config/env`) apps/api'nin ihtiyaç duyduğu üç
// değişkenle (`API_PORT`, `API_HOST`, `LOG_LEVEL`) genişletir. `.env.example`
// (T-002/ST-1) içindeki değerlerle birebir uyumlu. Prisma bağlantı URL'si de
// DAHİL olmak üzere TÜM ortam okuması bu şema üzerinden `parseEnv`'e gider
// (`config.module.ts`) — `apps/api` içinde başka hiçbir yerde `process.env`
// doğrudan okunmaz.
//
// GÜNCELLEME (ROADMAP v0.0.5, T-006/S5, architect "ENV ŞEMASI"): Better Auth
// alanları EKLENDİ. **`infraEnvSchema` DOKUNULMADI** (K-E8) — `apps/api` hâlâ
// yalnızca `DATABASE_URL` (en az yetkili `arkesoft_app`) görüyor. Bu dosyanın
// TEK sahibi S5'tir (T-006 boyunca).
//
// **EŞİKLER BURADA YOK** (AC7 "eşik gevşetilemez" — architect, bağlayıcı):
// `5/20/3/10` gibi oran sınırlama sayıları `rate-limit.policy.ts`'te (S8)
// MODÜL SABİTİ olarak kalır. Burada yalnızca pencere SÜRELERİ (saniye) taşınır.

import { databaseAuthEnvSchema, infraEnvSchema } from '@arkesoft/config/env'
import { z } from 'zod'

/** pino'nun kabul ettiği log seviyeleri. */
const pinoLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])

/** Port numarası: metinden tamsayıya çevirir ve geçerli aralığı doğrular. */
const apiPortSchema = z.coerce
  .number({ message: 'sayı olmalı' })
  .int('tamsayı olmalı')
  .min(1, '1-65535 aralığında olmalı')
  .max(65535, '1-65535 aralığında olmalı')

/** Pozitif tamsayı saniye süresi, opsiyonel — eksikse verilen varsayılana düşer. */
const positiveSecondsWithDefault = (defaultValue: number) =>
  z.coerce
    .number({ message: 'sayı olmalı' })
    .int('tamsayı olmalı')
    .positive('pozitif olmalı')
    .default(defaultValue)

/**
 * `apps/api`'nin tam ortam değişkeni şeması. Uygulamalar `.extend()` ile
 * genişletebilir (CLAUDE.md §4 örüntüsü — bugün genişletmiyoruz).
 */
export const apiEnvSchema = infraEnvSchema.extend({
  API_PORT: apiPortSchema,
  API_HOST: z.string().min(1, 'boş olamaz'),
  LOG_LEVEL: pinoLevelSchema,

  // --- Kimlik rolü bağlantısı (ROADMAP v0.0.14.1, T-015/ST-F, architect
  // "KARAR — DATABASE_AUTH_URL: şema, fail-fast, anti-fallback") ------------
  // KOŞULSUZ ZORUNLU — ROADMAP'in "rol katalogda varsa" koşulu BİLEREK
  // uygulanmadı (fail-open riski, ADR-0008:102'nin dersi). `infraEnvSchema`'ya
  // EKLENMEDİ (K-E8) — alan `@arkesoft/config`'in AYRI `databaseAuthEnvSchema`'
  // sından "iki tüketici, tek tanım" deseniyle alınır (emsal:
  // `packages/db/src/env.ts:78` ve `:113`). `AuthModule`'ün
  // `AuthPrismaClientResource`'u bu alanı okur — `DATABASE_URL`'e (en az
  // yetkili `arkesoft_app`) geri düşüş YASAKTIR (R-PM4/K-A4, c1/c2/c3 testleri
  // `__tests__/database-auth-url-*.test.ts`).
  DATABASE_AUTH_URL: databaseAuthEnvSchema.shape.DATABASE_AUTH_URL,

  // --- Kimlik doğrulama (ROADMAP v0.0.5, Better Auth) — ZORUNLU -------------
  // Operatör kırılması (K9, v0.0.13 emsali): bu iki değişken olmadan apps/api
  // açılışta Zod fail-fast ile durur (istenen davranış).
  BETTER_AUTH_SECRET: z.string().min(32, 'en az 32 karakter olmalı'),
  AUTH_BASE_URL: z.url('geçerli bir URL olmalı'),

  // --- Kimlik doğrulama — OPSİYONEL (architect "ENV ŞEMASI") ----------------
  /** Geri alma kolu — verilmezse `.${APP_BASE_DOMAIN}` kullanılır. */
  AUTH_COOKIE_DOMAIN: z.string().min(1, 'boş olamaz').optional(),
  AUTH_SESSION_TTL_SECONDS: positiveSecondsWithDefault(604_800),
  AUTH_VERIFICATION_TTL_SECONDS: positiveSecondsWithDefault(3600),
  AUTH_LOGIN_RATE_WINDOW_SECONDS: positiveSecondsWithDefault(900),
  AUTH_RESET_RATE_WINDOW_SECONDS: positiveSecondsWithDefault(3600),
  /** `0` = XFF'e hiç güvenme (varsayılan, bağlayıcı). */
  AUTH_TRUSTED_PROXY_COUNT: z.coerce
    .number({ message: 'sayı olmalı' })
    .int('tamsayı olmalı')
    .min(0, '0 veya daha büyük olmalı')
    .default(0),
})

export type ApiEnv = z.infer<typeof apiEnvSchema>

export type PinoLevel = z.infer<typeof pinoLevelSchema>
