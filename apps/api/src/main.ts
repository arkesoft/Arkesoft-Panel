// @arkesoft/api — süreç giriş noktası (ROADMAP v0.0.4, T-002/ST-2, architect K-A1)
//
// Adaptörün (`@nestjs/platform-express`) adının geçtiği TEK dosya (K-A1) —
// `apps/api/eslint.config.mjs` diğer tüm dosyalarda bu importu yasaklar.
// `express`/`@nestjs/platform-express`'e geçiş fastify'a: tek paket değişimi
// + bu dosya. `NestExpressApplication` burada SADECE TİP olarak kullanılır
// (`verbatimModuleSyntax` nedeniyle derlemede silinir); gerçek adaptör
// `NestFactory.create()`'in kendi çalışma zamanı yüklemesiyle devreye girer.
//
// `import 'reflect-metadata'` İLK satır OLMAK ZORUNDA: Nest'in legacy
// dekoratör metadata'sı bu yan etkiye dayanır (ST-0 spike'ı doğruladı).

import 'reflect-metadata'

import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'

import { AppModule } from './app.module.js'
import { API_ENV } from './config/config.tokens.js'
import type { ApiEnv } from './config/api-env.js'
import { ArkesoftNestLogger } from './logging/arkesoft-nest-logger.js'
import { createRootLogger } from './logging/root-logger.js'

// Nest henüz ayağa kalkmamışken (ör. `NestFactory.create` sırasında) veya
// çökmüşken kullanılacak asgari logger. CLAUDE.md §4 `console.*` yasağı bu
// süreç kapanış yolunda da geçerli — pino her zaman kullanılır.
const crashLogger = createRootLogger({ level: 'error' })

function toLoggableError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error)
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  })

  app.useLogger(app.get(ArkesoftNestLogger))
  app.enableShutdownHooks()

  const env = app.get<ApiEnv>(API_ENV)

  await app.listen(env.API_PORT, env.API_HOST)
}

// Beklenmeyen hatalar sessizce kaybolmaz (CLAUDE.md §4/§10): süreç loglayıp
// çöker; orkestrasyon/süpervizör katmanı yeniden başlatır.
process.on('unhandledRejection', (reason: unknown) => {
  crashLogger.error({ error: toLoggableError(reason) }, 'unhandledRejection — süreç kapanıyor')
  process.exit(1)
})

process.on('uncaughtException', (error: unknown) => {
  crashLogger.error({ error: toLoggableError(error) }, 'uncaughtException — süreç kapanıyor')
  process.exit(1)
})

// AC11 kapanış izleyicisi (watchdog): `enableShutdownHooks` ile tetiklenen
// `onModuleDestroy` (Prisma `$disconnect()`, v0.0.13/ST-6) normalde süreci
// kendiliğinden exit 0 ile bitirir. Bu zamanlayıcı SADECE kapanış asılı
// kalırsa süreci zorla sonlandırır; `.unref()` ile normal kapanışı ASLA
// geciktirmez (event loop'u canlı tutmaz).
process.on('SIGTERM', () => {
  const watchdog = setTimeout(() => {
    crashLogger.error({}, 'Graceful shutdown zaman aşımına uğradı, süreç zorla sonlandırılıyor')
    process.exit(1)
  }, 10_000)
  watchdog.unref()
})

void bootstrap()

// AC1 probu — yalnizca apps/api/** degisti; admin/superadmin/storefront hatlari
// "skipped" olmali. Bu dal ve PR dogrulama sonrasi SILINECEK (T-003 ST-9).
