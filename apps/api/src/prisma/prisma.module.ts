// @arkesoft/api — PrismaModule (ROADMAP v0.0.4, T-002/ST-6, architect K-A3)
//
// `@Global()`: `PrismaService`'i TÜM modüllere sağlar (`ConfigModule`/
// `LoggingModule` ile aynı desen — ST-2'nin kurduğu örüntü). `createPrismaClient`
// (packages/db) `process.env`'E ASLA DOKUNMAZ (T-001 K2 ile uyumlu); bağlantı
// URL'si `API_ENV` provider'ından (ST-2) ENJEKTE edilir — bu fabrikanın TEK
// görevi bu dolaylamayı kurmaktır.
//
// `CreatePrismaClientOptions` (packages/db) DEĞİŞTİRİLMEDİ — v0.0.13 kendi
// alanını additive ekleyecek (architect K-A3, bağlayıcı).

import { Global, Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'
import { createPrismaClient } from '@arkesoft/db'
import type { PrismaDatabase } from '@arkesoft/db'

import { API_ENV } from '../config/config.tokens.js'
import type { ApiEnv } from '../config/api-env.js'
import { PRISMA_CLIENT } from './prisma.tokens.js'
import { PrismaService } from './prisma.service.js'

const prismaClientProvider: Provider = {
  provide: PRISMA_CLIENT,
  // EAGER `$connect()` YOK (K-A3) — `createPrismaClient` yalnızca istemciyi
  // kurar, bağlanmaz; bağlantı ilk sorguda (lazy) kurulur.
  useFactory: (env: ApiEnv): PrismaDatabase =>
    createPrismaClient({ databaseUrl: env.DATABASE_URL }),
  inject: [API_ENV],
}

@Global()
@Module({
  providers: [prismaClientProvider, PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
