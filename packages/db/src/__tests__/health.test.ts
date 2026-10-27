// @arkesoft/db — checkDatabaseConnection entegrasyon testleri (ROADMAP v0.0.4,
// T-002/ST-3, architect K-A3)
//
// İki vaka: (1) paylaşılan test istemcisi (`testPrisma`, canlı Postgres)
// üzerinde çözülür — fırlatmaz. (2) erişilemeyen bir istemciyle fırlatır;
// "erişilemez" `127.0.0.1` üzerinde Postgres'in asla dinlemediği bir porta
// (1 — ayrıcalıklı, reddedilen port) bağlanarak üretilir, bu yüzden
// `ECONNREFUSED` ANINDA döner ve test askıda kalmaz (zaman aşımı
// sarmalaması BU PAKETİN işi değil — K-A3, ST-6).

import { describe, expect, it } from 'vitest'

import { checkDatabaseConnection, createPrismaClient } from '../index.js'
import { testPrisma } from './helpers/test-client.js'

describe('checkDatabaseConnection', () => {
  it('canlı bağlantıda çözülür (fırlatmaz)', async () => {
    await expect(checkDatabaseConnection(testPrisma)).resolves.toBeUndefined()
  })

  it('erişilemeyen istemciyle fırlatır', async () => {
    const unreachable = createPrismaClient({
      databaseUrl: 'postgresql://arkesoft:arkesoft@127.0.0.1:1/arkesoft',
    })

    try {
      await expect(checkDatabaseConnection(unreachable)).rejects.toThrow()
    } finally {
      await unreachable.$disconnect()
    }
  })
})
