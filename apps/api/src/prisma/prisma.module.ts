// @arkesoft/api — PrismaModule (ROADMAP v0.0.4, T-002/ST-6, architect K-A3)
//
// `@Global()`: `PrismaService`'i TÜM modüllere sağlar (`ConfigModule`/
// `LoggingModule` ile aynı desen — ST-2'nin kurduğu örüntü). `createPrismaClient`
// (packages/db) `process.env`'E ASLA DOKUNMAZ (T-001 K2 ile uyumlu); bağlantı
// URL'si `API_ENV` provider'ından (ST-2) ENJEKTE edilir — bu fabrikanın TEK
// görevi bu dolaylamayı kurmaktır.
//
// `CreatePrismaClientOptions` (packages/db) bu ST'de (v0.0.4) DEĞİŞTİRİLMEDİ —
// architect K-A3 additive alanı v0.0.13'e bağlamıştı; AŞAĞIDAKİ GÜNCELLEME
// NOTUNDA (T-005/S6) o alan zaten EKLENDİ.
//
// GÜNCELLEME (ROADMAP v0.0.13, T-005/S6): `tenantContextSetting` ADDITIVE
// seçeneği `TENANT_CONTEXT_SETTING` ile geçilir. ÖLÇÜLDÜ (`client.ts`):
// `createPrismaClient`, `registerTenantContextSetting`'i YALNIZCA bu seçenek
// VERİLİRSE çağırır (`if (options.tenantContextSetting !== undefined)`) —
// seçenek verilmeden kayıt KENDİLİĞİNDEN oluşmuyor. Bu satır olmadan
// `PrismaService.withTenant()` bu istemci üzerinde HER ZAMAN fail-closed
// `throw` ederdi (bkz. `prisma-with-tenant.test.ts` Vaka 1). RLS'nin okuduğu
// GUC adı burada LİTERAL YAZILMAZ — sabit `@arkesoft/db`'den (`tenant-context.ts`)
// import edilir (K-E12/AC4).

import { Global, Module } from '@nestjs/common'
import type { Provider } from '@nestjs/common'
import { createPrismaClient, TENANT_CONTEXT_SETTING } from '@arkesoft/db'
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
    createPrismaClient({
      databaseUrl: env.DATABASE_URL,
      tenantContextSetting: TENANT_CONTEXT_SETTING,
    }),
  inject: [API_ENV],
}

@Global()
@Module({
  providers: [prismaClientProvider, PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
