// @arkesoft/api — API'ye özgü ortam değişkeni şeması (ROADMAP v0.0.4, T-002/ST-2,
// architect Kapsam §3)
//
// `infraEnvSchema`'yı (`@arkesoft/config/env`) apps/api'nin ihtiyaç duyduğu üç
// değişkenle (`API_PORT`, `API_HOST`, `LOG_LEVEL`) genişletir. `.env.example`
// (T-002/ST-1) içindeki değerlerle birebir uyumlu. Prisma bağlantı URL'si de
// DAHİL olmak üzere TÜM ortam okuması bu şema üzerinden `parseEnv`'e gider
// (`config.module.ts`) — `apps/api` içinde başka hiçbir yerde `process.env`
// doğrudan okunmaz.

import { infraEnvSchema } from '@arkesoft/config/env'
import { z } from 'zod'

/** pino'nun kabul ettiği log seviyeleri. */
const pinoLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])

/** Port numarası: metinden tamsayıya çevirir ve geçerli aralığı doğrular. */
const apiPortSchema = z.coerce
  .number({ message: 'sayı olmalı' })
  .int('tamsayı olmalı')
  .min(1, '1-65535 aralığında olmalı')
  .max(65535, '1-65535 aralığında olmalı')

/**
 * `apps/api`'nin tam ortam değişkeni şeması. Uygulamalar `.extend()` ile
 * genişletebilir (CLAUDE.md §4 örüntüsü — bugün genişletmiyoruz).
 */
export const apiEnvSchema = infraEnvSchema.extend({
  API_PORT: apiPortSchema,
  API_HOST: z.string().min(1, 'boş olamaz'),
  LOG_LEVEL: pinoLevelSchema,
})

export type ApiEnv = z.infer<typeof apiEnvSchema>

export type PinoLevel = z.infer<typeof pinoLevelSchema>
