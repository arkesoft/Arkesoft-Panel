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
//
// GÜNCELLEME (ROADMAP v0.0.20, T-021/S6, ADR-0023 §4 ve §5): `SUPERADMIN_*`
// İKİ alanı EKLENDİ — altta, dosya içi yorumlarıyla.
//
// GÜNCELLEME (ROADMAP v0.0.21.1, T-025/S1, `K2` mekanizması): `ADDITIONAL_
// TRUSTED_ORIGINS` EKLENDİ — SUPERADMIN_* bloğunun ARDINA, AYNI sınıf
// (opsiyonel, virgülle ayrılmış, `.default('')`) ama alan İÇİNDE biçim
// doğrulaması taşıyor (açılışta fail-fast). ⚠⚠ Bu alanın TENANT/kiracı alt
// alan adı reddi BURADA YAPILMAZ — `../auth/trusted-origins.ts`'in TÜRETME
// fonksiyonunda yapılır (o dosyanın dosya başı yorumuna bak, gerekçe: `create-
// test-app.ts`'in `API_ENV` provider override'ı bu şemayı HİÇ ÇALIŞTIRMAZ).

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
 * `ADDITIONAL_TRUSTED_ORIGINS`'in kardinalite üst sınırı (ROADMAP v0.0.21.1,
 * T-025/S1). ⚠ `apiEnvSchema`'nın dosya başı yorumundaki "EŞİKLER BURADA YOK"
 * kuralı (AC7) BU sayıya UYGULANMAZ — o kural oran sınırlama PENCERE/sayısı
 * içindir (`rate-limit.policy.ts`), bu bir liste KARDİNALİTESİdir.
 */
export const MAX_ADDITIONAL_TRUSTED_ORIGINS = 8

/**
 * `ADDITIONAL_TRUSTED_ORIGINS`'in ham dizesini parçalara böler: virgülle
 * ayır, her parçayı TRIM et, BOŞ parçaları (sondaki virgül DAHİL) DÜŞÜR.
 * `../auth/trusted-origins.ts`'in türetmesi BU AYNI fonksiyonu tüketir — iki
 * ayrı bölme mantığı İCAT EDİLMEZ (`parseSuperadminIpAllowlist` ile AYNI
 * desen, `platform/platform-admin-ip.guard.ts:76`).
 */
export function splitAdditionalTrustedOrigins(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

// ⚠⚠ JOKER KARAKTER JETONU — bu dosyada BİTİŞİK bir glif olarak YAZILMAZ,
// Unicode KOD NOKTASI kaçış dizisinden çalışma anında BİRLEŞTİRİLİR
// (AGENT_BASELINE §5 "literal-jeton kuralı"). Gerekçe: aksi halde bu alanı
// denetleyen bir mekanik jeton taraması (kaynak metninde GLİF arayan bir
// `grep`) bu kontrol kodunun KENDİSİNİ "joker karakter" bulgusu SANABİLİR —
// emsal `../auth/trusted-origins.ts:21-27` (AYNI kural, orada yorum METNİ
// seviyesinde uygulanmış; burada KOD seviyesinde uygulanıyor çünkü bu dosyada
// gerçek bir ÇALIŞMA ZAMANI denetimi var, salt açıklama değil). Kaçış dizisi
// U+002A ASTERISK'tir — JS ayrıştırıcısı bunu çalışma anında karaktere
// çevirir, kaynak dosyanın baytlarında glifin kendisi YOKTUR.
const WILDCARD_CHARACTER = '\u{2A}'

/**
 * `ADDITIONAL_TRUSTED_ORIGINS`'in TEK bir virgül parçasını doğrular. Geçerse
 * `undefined`, geçmezse operatöre dönük Türkçe mesaj döner. Değişken DEĞERİ
 * (girilen URL) mesaja YAZILMAZ — bu dosyanın başındaki "hata mesajlarına
 * değişken DEĞERLERİ asla yazılmaz" kuralıyla AYNI disiplin
 * (`@arkesoft/config/env`'in dosya başı yorumu).
 */
function validateAdditionalTrustedOriginEntry(entry: string): string | undefined {
  let url: URL

  try {
    url = new URL(entry)
  } catch {
    return 'ADDITIONAL_TRUSTED_ORIGINS içindeki bir girdi http/https şemalı mutlak bir URL olarak ayrıştırılamadı'
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'ADDITIONAL_TRUSTED_ORIGINS içindeki bir girdi http veya https şemalı olmalı'
  }

  if (entry.includes(WILDCARD_CHARACTER)) {
    return 'ADDITIONAL_TRUSTED_ORIGINS içindeki bir girdi joker karakter içeriyor'
  }

  if (url.username.length > 0 || url.password.length > 0) {
    return 'ADDITIONAL_TRUSTED_ORIGINS içindeki bir girdi kullanıcı adı/parola bileşeni taşıyor'
  }

  if (url.pathname !== '/' || url.search.length > 0 || url.hash.length > 0) {
    return "ADDITIONAL_TRUSTED_ORIGINS içindeki bir girdi '/' dışında yol, sorgu veya fragment taşıyor"
  }

  return undefined
}

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

  // --- Süper admin (ROADMAP v0.0.20, T-021/S6, ADR-0023 §4 ve §5) — OPSİYONEL --
  // İKİSİ DE opsiyonel: hiçbiri verilmezse platformun davranışı BAYT-BİREBİR
  // bugünküdür (ADR-0023 §4.5) — bu sürüm `minor`'dır, operatör müdahalesi
  // ZORUNLU DEĞİLDİR.
  /**
   * Süper admin SPA'sının tarayıcı orijini (ADR-0023 §4, Karar 4). VERİLİRSE
   * `trusted-origins.ts`'in TEK türetme fonksiyonu bu orijini güvenilir
   * listeye EKLER — `SameOriginGuard` VE Better Auth'un `trustedOrigins`'i
   * AYNI fonksiyonu tüketir. Joker/alt alan adı deseni KABUL ETMEZ, TAM
   * eşleşmeli bir orijin bekler.
   */
  SUPERADMIN_BASE_URL: z.url('geçerli bir URL olmalı').optional(),
  /**
   * Süper admin tRPC yollarını kısıtlayan virgülle ayrılmış IP allowlist'i
   * (ADR-0023 §5). ⚠ **Varsayılan `''` = yüzeyin TAMAMI 403 (fail-closed —
   * "yapılandırılmamış = kapalı")**; ayrıştırma ve zorlama S7'nin
   * `platform/` modülündedir, bu şema yalnızca ham değeri taşır. Bu kapı
   * BİRİNCİL yetkilendirme DEĞİLDİR — ADR-0023 §5'in bağlayıcı sınırı.
   */
  SUPERADMIN_IP_ALLOWLIST: z.string().default(''),

  // --- Ek güvenilir orijinler (ROADMAP v0.0.21.1, T-025/S1, `K2` mekanizması)
  // — OPSİYONEL. AD "ADDITIONAL" BİLİNÇLİ: semantiği TOPLAMALI —
  // VERİLMEDİĞİNDE liste BUGÜNKÜYLE (AUTH_BASE_URL + varsa SUPERADMIN_
  // BASE_URL) AYNIDIR. Biçim emsali BİLİNÇLİ: `SUPERADMIN_IP_ALLOWLIST` İLE
  // AYNI SINIF (virgüllü, `.default('')`) — TEK fark, bu alan İÇİNDE biçim
  // doğrulaması taşır (altta), `SUPERADMIN_IP_ALLOWLIST`'in ayrıştırma/
  // zorlamayı tüketiciye (`platform/`) BIRAKTIĞI yerde.
  /**
   * Virgülle ayrılmış, TAM EŞLEŞMELİ güvenilir tarayıcı orijinleri listesi.
   * Her parça TRIM edilir, BOŞ parçalar (sondaki virgül DAHİL) ATLANIR. Her
   * parça: (1) http/https şemalı MUTLAK bir URL olmalı, (2) JOKER KARAKTER
   * İÇEREMEZ, (3) kullanıcı adı/parola bileşeni TAŞIYAMAZ, (4) `/` dışında
   * yol/sorgu/fragment TAŞIYAMAZ (sessiz orijine-indirme YERİNE gürültülü
   * RET — `SUPERADMIN_BASE_URL`'in orijine-indirme davranışı BU alan için
   * DEĞİŞMEDİ, bu YENİ alan daha KATI). Kardinalite üst sınırı
   * {@link MAX_ADDITIONAL_TRUSTED_ORIGINS}.
   *
   * ⚠⚠ Bir girdinin hostname'i `APP_BASE_DOMAIN`'in TEK ETİKETLİ bir KİRACI
   * alt alan adıysa (ve rezerve değilse) bu ŞEMADA DEĞİL, `../auth/trusted-
   * origins.ts`'in türetme fonksiyonunda REDDEDİLİR — gerekçe o dosyanın
   * dosya başı yorumunda.
   */
  ADDITIONAL_TRUSTED_ORIGINS: z
    .string()
    .default('')
    .superRefine((raw, ctx) => {
      const entries = splitAdditionalTrustedOrigins(raw)

      if (entries.length > MAX_ADDITIONAL_TRUSTED_ORIGINS) {
        ctx.addIssue({
          code: 'custom',
          message: `ADDITIONAL_TRUSTED_ORIGINS en fazla ${String(MAX_ADDITIONAL_TRUSTED_ORIGINS)} orijin taşıyabilir`,
        })
        return
      }

      for (const entry of entries) {
        const error = validateAdditionalTrustedOriginEntry(entry)

        if (error !== undefined) {
          ctx.addIssue({ code: 'custom', message: error })
        }
      }
    }),
})

export type ApiEnv = z.infer<typeof apiEnvSchema>

export type PinoLevel = z.infer<typeof pinoLevelSchema>
