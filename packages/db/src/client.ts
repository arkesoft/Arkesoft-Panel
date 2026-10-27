// @arkesoft/db — Prisma istemci fabrikası (ROADMAP v0.0.3, T-001/ST-3)
//
// Üretilen istemciye TEK erişim noktası. Prisma'nın resmi istemci paketini asla
// doğrudan import etmiyoruz; her şey `package.json#imports` üzerindeki `#prisma`
// dolaylaması üzerinden gelir (AC4). Prisma 7 hattı `datasource.url`'i şemadan kaldırdığı için
// `PrismaClient` artık bir sürücü adaptörü (`@prisma/adapter-pg`) olmadan
// kurulamıyor; adaptör ve onun `pg.Pool`/bağlantı dizesi örneği bu dosyanın
// dışına SIZMAZ.
//
// Modül seviyesi singleton kasıtlı olarak YOK: `createPrismaClient` çağrıldığı
// her yerde yeni bir istemci kurar. İstemcinin yaşam döngüsünü (bağlan/kapat)
// yönetmek v0.0.4'teki NestJS `PrismaModule`'ün işi.

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '#prisma'
import type { Prisma } from '#prisma'

/**
 * `createPrismaClient` için girdi seçenekleri.
 *
 * v0.0.3'te yalnızca bağlantı dizesi taşınır. Log yapılandırması (pino entegrasyonu)
 * v0.0.4'ün işi; yeni alan eklemek geriye uyumlu (additive) kalacak.
 */
export type CreatePrismaClientOptions = {
  readonly databaseUrl: string
}

/**
 * Üretilen `PrismaClient` tipinin paket dışına açılan takma adı. Yapıcının
 * (constructor) kendisi dışa açılmaz — yalnızca `createPrismaClient` üzerinden
 * örneklenir.
 */
export type PrismaDatabase = PrismaClient

/**
 * `$transaction(async (tx) => ...)` geri çağrımının aldığı istemci tipi.
 * v0.0.13'ün `withTenant()` imzasında kullanılacak; bu sürümde sıfır maliyetli
 * bir tip takma adıdır, çalışma zamanı karşılığı üretmez.
 */
export type TransactionClient = Prisma.TransactionClient

/**
 * Tek istemci kurma yolu. `@prisma/adapter-pg` adaptörünü bağlantı dizesinden
 * kurar ve üretilen istemciye verir. Adaptör örneği çağırana döndürülmez.
 */
export function createPrismaClient(options: CreatePrismaClientOptions): PrismaDatabase {
  const adapter = new PrismaPg(options.databaseUrl)

  return new PrismaClient({ adapter })
}
