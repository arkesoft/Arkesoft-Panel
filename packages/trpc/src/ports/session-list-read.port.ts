// @arkesoft/trpc — SessionListReadPort (ROADMAP v0.0.15.1, T-017/S4, architect
// "TASARIM" bölümü)
//
// Port BİLDİRİLİR (burada), `apps/api`'de UYGULANIR (S9). ADR-0009 madde 3:
// port TOTAL'dır — "oturum yok" durumu bir hata DEĞİL, BOŞ DİZİDİR; bu port
// hiçbir girdi için FIRLATMAZ (`session-security-read.port.ts`'in AYNI
// totallik biçimi — orada `boolean`, burada `readonly ActiveSessionWire[]`).
//
// `userId`/`currentSessionId` İKİSİ DE `ctx.auth`'tan GELİR (ALS'teki
// daraltmanın echo'su, `session.me`'nin K5 EMSALİ) — girdiden ASLA okunmaz,
// zaten `session.list` girdi ALMAZ (bkz. `session.router.ts`). `currentSessionId`
// ayrı bir parametredir ÇÜNKÜ çıktı şeması `isCurrent: boolean` taşır — port
// bu karşılaştırmayı KENDİSİ yapar, resolver dallanmaz.

import type { ActiveSessionWire } from '../schemas/session-summary.schema.js'

export interface SessionListReadPort {
  /**
   * Kullanıcının KENDİ aktif oturumlarını döner — `tenantId` parametresi
   * YOKTUR (`Session`'da `tenant_id` kolonu yok, po doğruladı; kiracı
   * daraltması bu kaynak için ANLAMSIZ). PORT TOTAL'dır — oturum yoksa boş
   * dizi döner, FIRLATMAZ.
   */
  listOwnSessions(userId: string, currentSessionId: string): Promise<readonly ActiveSessionWire[]>
}
