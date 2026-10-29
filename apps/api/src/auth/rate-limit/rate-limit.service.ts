// @arkesoft/api — oran sınırlama sayaç deposu (ROADMAP v0.0.5, T-006/S8,
// architect "TENANT İZOLASYONU madde 8" + "HATA SINIFLARI" + riski 9)
//
// ANAHTAR UZAYI — TEK önek `platform:auth:` (R1, GERİ ALMA kolu):
// `platform:auth:<routeKey>:<scope>:<hmacHex>`. Hiçbir parça ham e-posta/IP
// TAŞIMAZ (KESİN YASAKLAR §2) — `hmacHex`, `BETTER_AUTH_SECRET` anahtarıyla
// HMAC-SHA256'nın kesilmiş hâlidir (kriptografik imza DEĞİL, yalnızca
// anahtar eşitliği için; bu bağlamda çakışma riski kabul edilebilir — rate
// limit sayaçları, hassas yetkilendirme kararları DEĞİL). Loga yalnızca
// HMAC'in İLK 8 KARAKTERİ (`counterKeyPrefix`) girer (architect "LOG
// DESENİ").
//
// ATOMİKLİK (architect riski 9, DoD §5) — TEK Lua betiği: `INCR` (Redis'in
// kendisi atomik), İLK artırımda (`current === 1`) `EXPIRE` kurulur, sonra
// `PTTL` okunur. ÜÇ komut gibi görünse de Redis betiği TEK İŞ PARÇACIKLI VE
// BÖLÜNMEDEN yürütür — ayrı `INCR` + `EXPIRE` çağrıları arasına başka bir
// isteğin girip sayacı SÜRESİZ bırakması (klasik "check-then-act" yarış
// koşulu) YAPISAL OLARAK İMKÂNSIZDIR. Sabit pencere KABUL edilmiştir
// (architect riski 9: pencere sınırında 2× patlama olasılığı K3/AC7'yi
// KARŞILIYOR; kayan pencere v0.0.15).

import { createHmac } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'
import type { Redis } from 'ioredis'
import { z } from 'zod'

import type { ApiEnv } from '../../config/api-env.js'
import { API_ENV } from '../../config/config.tokens.js'
import { RateLimitStoreUnavailableError } from '../../errors/domain/rate-limit-store-unavailable.error.js'
import { RedisService } from '../../redis/redis.service.js'

/** Platform kapsamlı TEK önek (R1) — GERİ ALMA kolu `--pattern 'platform:auth:*'` bu önekle SCAN eder. */
const RATE_LIMIT_KEY_PREFIX = 'platform:auth'

/** HMAC çıktısının anahtara yazılan kesilmiş uzunluğu (64 bit — çakışma riski bu bağlamda kabul edilebilir). */
const SCOPE_HASH_LENGTH = 16
/** Loglanan HMAC öneki uzunluğu (architect "LOG DESENİ" — `counterKeyPrefix`). */
const LOG_PREFIX_LENGTH = 8

export type RateLimitScopeKind = 'account' | 'ip'

/** `buildScopeKey`'in ürettiği, Redis anahtarı + loglanabilir önek çifti. */
export type RateLimitScopeKey = {
  readonly key: string
  /** HMAC'in İLK 8 karakteri — loglanabilir, ham değeri GERİ ÇÖZÜLEMEZ. */
  readonly counterKeyPrefix: string
}

export type RateLimitCheckResult = {
  readonly exceeded: boolean
  /** Pencerenin KALAN süresi (saniye) — `Retry-After` başlığına birebir yazılır. */
  readonly retryAfterSeconds: number
}

/**
 * `EVAL`'e geçirilen TEK Lua betiği. `KEYS[1]` = sayaç anahtarı,
 * `ARGV[1]` = pencere süresi (saniye, dize olarak geçirilir, Lua `EXPIRE`
 * tamsayı bekler — ioredis argümanları dizeye çevirir, `EXPIRE` bunu kendi
 * ayrıştırır).
 */
const INCREMENT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {current, ttl}
`

/** `EVAL` sonucu dış kaynaklı (Redis) veridir — tip verilmeden GÜVENİLMEZ, Zod ile doğrulanır. */
const evalResultSchema = z.tuple([z.number(), z.number()])

/** `GET` sonucu dış kaynaklı (Redis) veridir — tip verilmeden GÜVENİLMEZ, Zod ile doğrulanır. */
const countSchema = z.coerce.number().int().nonnegative()

/**
 * `"POST /auth/sign-in/email"` → `"post-auth-sign-in-email"`. Redis
 * anahtarında BOŞLUK/EĞİK ÇİZGİ bırakmaz (`buildScopeKey` dosya başı
 * yorumu — GERİ ALMA kolunun `xargs` tabanlı SCAN+DEL komutu için ZORUNLU).
 */
function sanitizeRouteKeySegment(routeKey: string): string {
  return routeKey
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

@Injectable()
export class RateLimitService {
  constructor(
    @Inject(RedisService) private readonly redisService: RedisService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private get redis(): Redis {
    return this.redisService.client
  }

  /** Ham değeri (e-posta/IP) ASLA döndürmez/anahtara yazmaz — yalnızca HMAC'in kesilmiş hâli. */
  private hashScopeValue(rawValue: string): string {
    return createHmac('sha256', this.env.BETTER_AUTH_SECRET)
      .update(rawValue)
      .digest('hex')
      .slice(0, SCOPE_HASH_LENGTH)
  }

  /**
   * `platform:auth:<routeKey>:<scope>:<hmacHex>` — e-posta için `trim +
   * toLowerCase` normalizasyonu UYGULANIR (aynı hesabın büyük/küçük harf
   * farklı yazımları AYNI sayaca düşsün); IP normalize EDİLMEZ (zaten
   * `client-ip.ts`'in çözdüğü tek biçimli değer).
   *
   * `routeKey` (`rate-limit.policy.ts`'ten, ör. `"POST /auth/sign-in/email"`)
   * BOŞLUK/EĞİK ÇİZGİ TAŞIR — bunlar anahtara OLDUĞU GİBİ YAZILMAZ,
   * `sanitizeRouteKeySegment` ile `-` İLE DEĞİŞTİRİLİR. Gerekçe: GERİ ALMA
   * kolunun belgelediği `redis-cli --scan --pattern 'platform:auth:*' |
   * xargs redis-cli DEL` komutu, anahtar içinde BOŞLUK varsa `xargs`'ın
   * satırı ayrı argümanlara BÖLMESİ yüzünden KIRILIR (ÖLÇÜLDÜ — gerçek
   * Redis'te anahtar üretilip komut denenerek doğrulandı).
   */
  buildScopeKey(routeKey: string, scope: RateLimitScopeKind, rawValue: string): RateLimitScopeKey {
    const normalizedValue = scope === 'account' ? rawValue.trim().toLowerCase() : rawValue
    const hmacHex = this.hashScopeValue(normalizedValue)
    const routeSegment = sanitizeRouteKeySegment(routeKey)

    return {
      key: `${RATE_LIMIT_KEY_PREFIX}:${routeSegment}:${scope}:${hmacHex}`,
      counterKeyPrefix: hmacHex.slice(0, LOG_PREFIX_LENGTH),
    }
  }

  /**
   * Sayacı ATOMİK artırır ve pencere limitine göre aşım durumunu döner.
   * Architect'in varlık-sızdırmazlık kısıtı: bu artırım, Better Auth'un
   * KENDİ kullanıcı aramasına ULAŞMADAN ÖNCE çağrılır (guard controller'dan
   * ÖNCE koşar) — var olan/var olmayan e-posta AYNI sayma davranışından
   * geçer, çünkü bu metot DB'ye hiç bakmaz.
   */
  async checkAndIncrement(
    scopeKey: RateLimitScopeKey,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitCheckResult> {
    // FIX turu 2, madde 8 (security tur2 S-7) — Redis ulaşılamazken ioredis
    // hatası ÖNCESİ SARILMADAN yukarı çıkıyordu → `AppExceptionFilter`
    // `mapUnknownError`'a düşüp 500 `INTERNAL_ERROR` üretiyordu
    // (`/health/ready` AYNI arızada DOĞRU şekilde 503 veriyordu — iki yol
    // TUTARSIZDI). `RateLimitStoreUnavailableError` (503 + `isRetryable`)
    // ADAPTÖR DİSİPLİNİYLE (CLAUDE.md §4) burada çevrilir.
    // **FAIL-CLOSED KORUNUR** — istek burada REDDEDİLİR (fırlatılır),
    // `true` dönüp GEÇİRMEK (fail-open) BİLEREK YAPILMAZ.
    let raw: unknown
    try {
      raw = await this.redis.eval(INCREMENT_SCRIPT, 1, scopeKey.key, windowSeconds)
    } catch (cause) {
      throw new RateLimitStoreUnavailableError(cause)
    }
    const [count, pttlMs] = evalResultSchema.parse(raw)

    return {
      exceeded: count > limit,
      retryAfterSeconds: pttlMs > 0 ? Math.ceil(pttlMs / 1000) : windowSeconds,
    }
  }

  /** K3 — "başarılı giriş hesap sayacını SIFIRLAR" (kalıcı kilit YOK). */
  async resetCounter(scopeKey: RateLimitScopeKey): Promise<void> {
    await this.redis.del(scopeKey.key)
  }

  /**
   * FIX turu 2, madde 3 (security/qa tur2 — architect LOG DESENİ `warn
   * giriş başarısız (reason, failureCount)`) — sayacı ARTIRMADAN okur,
   * yalnızca GÖZLEMLENEBİLİRLİK için (`RateLimitAccountResetInterceptor`'ın
   * başarısız giriş olayının `failureCount` alanı). Anahtar yoksa `0`
   * (henüz hiç deneme yapılmamış/pencere sıfırlanmış).
   */
  async peekCount(scopeKey: RateLimitScopeKey): Promise<number> {
    const raw = await this.redis.get(scopeKey.key)
    return raw === null ? 0 : countSchema.parse(raw)
  }
}
