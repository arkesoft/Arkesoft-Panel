// @arkesoft/api — ZodValidationPipe birim testleri (ROADMAP v0.0.4, T-002/ST-4,
// architect K-A6)
//
// Yakalanan hatayı `ValidationError`'a daraltmak için `as` tip zorlaması
// KULLANILMAZ (CLAUDE.md §4 — `as` yalnızca Zod doğrulamasından hemen sonra
// kabul edilir); yerine `instanceof` kontrolünün TypeScript'in akış tabanlı
// daraltmasıyla (control-flow narrowing) sağladığı tip güvenli yol kullanılır.

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { ValidationError } from '../errors/domain/validation.error.js'
import { ZodValidationPipe } from '../validation/zod-validation.pipe.js'

const metadata = { type: 'body' as const, metatype: undefined, data: undefined }

const createUserSchema = z.object({
  email: z.string().min(1),
  age: z.number().int().min(0),
})

/** `pipe.transform()`'u çağırır, fırlatılan hatanın `ValidationError` olduğunu doğrular ve döner. */
function expectValidationError<T extends z.ZodType>(
  pipe: ZodValidationPipe<T>,
  value: unknown,
): ValidationError {
  let caught: unknown
  try {
    pipe.transform(value, metadata)
  } catch (error) {
    caught = error
  }

  if (!(caught instanceof ValidationError)) {
    throw new Error('beklenen hata ValidationError değil')
  }

  return caught
}

describe('ZodValidationPipe', () => {
  it('geçerli girdide ayrıştırılmış değeri döner', () => {
    const pipe = new ZodValidationPipe(createUserSchema)

    const result = pipe.transform({ email: 'a@example.com', age: 20 }, metadata)

    expect(result).toEqual({ email: 'a@example.com', age: 20 })
  })

  it('geçersiz girdide ValidationError fırlatır, details.fields i18n anahtarı taşır', () => {
    const pipe = new ZodValidationPipe(createUserSchema)

    const validationError = expectValidationError(pipe, { email: 'a@example.com', age: 'yirmi' })

    expect(validationError.code).toBe('VALIDATION_ERROR')
    expect(Object.keys(validationError.fields)).toEqual(['age'])
    // Değer HER ZAMAN bir i18n anahtarıdır — ham Zod mesajı DEĞİL.
    expect(validationError.fields['age']).toMatch(/^errors\.validation\./)
  })

  it('field anahtarı eksik/yanlış tipteki girdide nokta ayraçlı path taşır', () => {
    const nestedSchema = z.object({
      address: z.object({
        city: z.string().min(1),
      }),
    })
    const pipe = new ZodValidationPipe(nestedSchema)

    const validationError = expectValidationError(pipe, { address: { city: '' } })

    expect(Object.keys(validationError.fields)).toEqual(['address.city'])
  })

  it('NEGATİF: Zod ham mesaj metni details.fields değerlerinde HİÇ geçmez', () => {
    const pipe = new ZodValidationPipe(createUserSchema)

    // Zod'un ham mesajı tipik olarak "Expected number, received string" vb.
    // metinler üretir — doğrulanan DEĞERİN kendisi (girdi sızıntısı) de ham
    // mesaja dahil olabilir; hiçbiri tel sözleşmesine sızmamalı.
    const validationError = expectValidationError(pipe, { email: '', age: 'yirmi' })
    const fieldValues = Object.values(validationError.fields)

    expect(fieldValues.length).toBeGreaterThan(0)
    for (const value of fieldValues) {
      expect(value).toMatch(/^errors\.validation\./)
      expect(value.toLowerCase()).not.toContain('expected')
      expect(value.toLowerCase()).not.toContain('received')
      expect(value).not.toContain('yirmi')
    }
  })
})
