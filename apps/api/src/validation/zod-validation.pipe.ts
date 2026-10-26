// @arkesoft/api — Zod tabanlı doğrulama pipe'ı (ROADMAP v0.0.4, T-002/ST-4, architect K-A6)
//
// `createZodDto` deseni `emitDecoratorMetadata` ister (K-A3 bunu kapattı) — bu
// yüzden Nest'in PARAMETRE seviyesi pipe yeteneği kullanılır: `new ZodValidationPipe(schema)`
// her zaman Nest DI'siz, ÇAĞIRANIN (`ValidatedBody` vb.) elle oluşturduğu bir
// örnektir — yapıcı parametresi (`schema`) bu yüzden `@Inject(TOKEN)` İLE
// ENJEKTE EDİLMEZ (DI token'ı değil, doğrudan verilen bir değerdir).
//
// `src/validation/**` tek muaf dizin — `apps/api/eslint.config.mjs`'in
// `no-restricted-imports` bloğu ham `Body`/`Query`/`Param` importunu BURADA
// serbest bırakır (K-A6), çünkü doğrulanmamış girdiyi okuyan TEK yer burası
// olmalı; `ValidatedBody` vb. bu ham dekoratörleri sarmalar.

import type { ArgumentMetadata, PipeTransform } from '@nestjs/common'
import type { z } from 'zod'

import { ValidationError } from '../errors/domain/validation.error.js'
import { tryGetRequestContext } from '../request-context/request-context.accessors.js'

/** Zod'un `issue.code`'unu (`invalid_type`, `too_small`, ...) camelCase'e çevirir. */
function toCamelCase(snakeCase: string): string {
  return snakeCase.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase())
}

/** `issue.code` → i18n anahtarı (`errors.validation.<issueCode>`). */
function toValidationMessageKey(issueCode: string): string {
  return `errors.validation.${toCamelCase(issueCode)}`
}

/**
 * Nest'in yerleşik `PipeTransform` yeteneğiyle Zod doğrulaması yapar.
 * `safeParse` BAŞARISIZ olursa `ValidationError` fırlatır — alan anahtarı
 * `issue.path.join('.')`, DEĞER her zaman bir i18n anahtarıdır. Zod'un ham
 * mesaj metni (`issue.message`) tel üstüne ASLA yazılmaz; yalnızca `debug`
 * seviyesinde loglanır (CLAUDE.md §17 + girdi değeri sızma riski — ham mesaj
 * doğrulanan değeri içerebilir).
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<T> {
    const result = this.schema.safeParse(value)

    if (result.success) {
      return result.data
    }

    const fields: Record<string, string> = {}
    const requestContext = tryGetRequestContext()

    for (const issue of result.error.issues) {
      const fieldKey = issue.path.join('.')
      fields[fieldKey] = toValidationMessageKey(issue.code)

      requestContext?.logger.debug(
        { fieldKey, issueCode: issue.code, zodMessage: issue.message },
        'zod doğrulama hatası (ham mesaj — yalnızca debug)',
      )
    }

    throw new ValidationError(fields)
  }
}
