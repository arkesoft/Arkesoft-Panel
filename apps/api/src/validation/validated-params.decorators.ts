// @arkesoft/api — Zod doğrulamalı parametre dekoratörleri (ROADMAP v0.0.4,
// T-002/ST-4, architect K-A6)
//
// `ValidatedBody`/`ValidatedQuery`/`ValidatedParams` ham `Body`/`Query`/`Param`'ı
// `ZodValidationPipe` ile SARMALAR. `apps/api/eslint.config.mjs`'in
// `no-restricted-imports`'u `@nestjs/common`'dan `Body`/`Query`/`Param`
// importunu HER YERDE yasaklar — `src/validation/**` TEK muaf dizin (bu
// dosya KURAN taraf, fail-closed mekanizma lint'te, niyete bırakılmaz).
//
// Her çağrı (`@ValidatedBody(createOrderSchema)`) dekoratör örneğini SINIF
// TANIMINDA bir kez kurar — Nest bu dekoratörü controller yüklenirken bir
// defa değerlendirir, istek başına değil.

import { Body, Param, Query } from '@nestjs/common'
import type { z } from 'zod'

import { ZodValidationPipe } from './zod-validation.pipe.js'

/** Gövdeyi (`req.body`) verilen Zod şemasıyla doğrular. */
export function ValidatedBody(schema: z.ZodType): ParameterDecorator {
  return Body(new ZodValidationPipe(schema))
}

/** Sorgu dizesini (`req.query`) verilen Zod şemasıyla doğrular. */
export function ValidatedQuery(schema: z.ZodType): ParameterDecorator {
  return Query(new ZodValidationPipe(schema))
}

/** Rota parametrelerini (`req.params`) verilen Zod şemasıyla doğrular. */
export function ValidatedParams(schema: z.ZodType): ParameterDecorator {
  return Param(new ZodValidationPipe(schema))
}
