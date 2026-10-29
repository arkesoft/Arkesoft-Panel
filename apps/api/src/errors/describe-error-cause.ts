// @arkesoft/api — ortak hata-cause indirgeyicisi (ROADMAP v0.0.5, T-006,
// FIX turu 2, solid tur2 M-2 + security tur2 S-8)
//
// "bilinmeyen `cause` → loglanabilir {causeCode, causeMessage}" indirgemesi
// BEŞ yerde BAĞIMSIZ kopyalanmıştı: `auth-instance.ts` (düzeltilmiş, F2),
// `auth-context.middleware.ts:103`, `rate-limit.guard.ts:243` + bağlam dışı
// `tenancy/tenant-context.middleware.ts:67`, `redis/redis.service.ts`/
// `redis.module.ts`. Bu YÜZEYSEL bir DRY ihlali DEĞİL — `AggregateError.message`
// HER ZAMAN BOŞTUR (Node'un `net.connect()`'i IPv4+IPv6/"happy eyeballs"
// denediğinde nodemailer/ioredis hatayı buna sarar; ÖLÇÜLDÜ, security tur2
// S-8: `.env`'deki CANLI `REDIS_URL=redis://localhost:6379` tam bu modda —
// `127.0.0.1` + `::1` ikisi de dinliyor). Naif `cause.message` okuması
// operatöre `errorMessage: ""` gösterir; bu dosya `.errors[0]`'a (tek seviye)
// inerek gerçek mesajı kurtarır. `errors/assert-never.ts`'in YANINDA — AYNI
// birleştirme emsali: DI'sız, saf fonksiyon.
//
// ⚠ BU HELPER'I kullanıcı E-POSTASI gibi ÜÇÜNCÜ TARAF/SERBEST METİN
// içerebilecek bir `cause` için KULLANMAYIN — `causeMessage` alanı o metni
// OLDUĞU GİBİ taşır (ör. bir SMTP/nodemailer "alıcı reddedildi" hatasının
// `.message`'ı alıcının TAM e-posta adresini içerir, ÖLÇÜLDÜ: security tur2
// S-2). O kanal için `auth-instance.ts`'in `describeBetterAuthLogCause`'u
// gibi ALLOWLIST'li (serbest metinsiz) bir indirgeyici kullanın — bu dosya
// yalnızca İÇ/teknik hata nedenleri (DB/Redis bağlantı arızaları, beklenmeyen
// istisnalar) için güvenlidir, bunların mesajı kullanıcı girdisi TAŞIMAZ.

import { AppError } from '@arkesoft/errors'

/**
 * `value`'nun anlamlı (boş OLMAYAN) bir `.message`'ını döner.
 * `AggregateError.message` her zaman boştur — gerçek mesajlar `.errors[]`
 * dizisinde durur; bu yüzden boşsa `.errors[0]`'a (yalnızca BİR seviye, ham
 * nesne SERİLEŞTİRİLMEZ) bakılır.
 */
export function extractErrorMessage(value: unknown): string | undefined {
  if (!(value instanceof Error)) {
    return undefined
  }
  if (value.message.length > 0) {
    return value.message
  }

  const aggregate = value as { readonly errors?: readonly unknown[] }
  const firstSubError = aggregate.errors?.[0]
  return firstSubError instanceof Error && firstSubError.message.length > 0
    ? firstSubError.message
    : undefined
}

export type ErrorCauseDescription = {
  readonly causeCode: string | undefined
  readonly causeMessage: string
}

/**
 * Bilinmeyen bir `cause`'u yapılandırılmış, loglanabilir bir alana indirger.
 * `AppError` ise KENDİ `.cause`'una (ör. bir Redis/ioredis bağlantı hatası)
 * iner; düz `Error`/bilinmeyen değer için `.message`/`String()` kullanılır.
 * İkisi de `extractErrorMessage`'ın `AggregateError` düzeltmesinden geçer.
 */
export function describeErrorCause(cause: unknown): ErrorCauseDescription {
  if (cause instanceof AppError) {
    return {
      causeCode: cause.code,
      causeMessage: extractErrorMessage(cause.cause) ?? cause.message,
    }
  }
  if (cause instanceof Error) {
    return { causeCode: undefined, causeMessage: extractErrorMessage(cause) ?? cause.message }
  }
  return { causeCode: undefined, causeMessage: String(cause) }
}
