// @arkesoft/trpc — session.me / session.list (ROADMAP v0.0.6, T-007/ST-2,
// architect "tRPC sözleşmesi"; v0.0.15, T-016 FIX turu 2/M-4 —
// `twoFactorEnabled` EKLENDİ; v0.0.15.1, T-017/S4 — `session.list` EKLENDİ)
//
// `session.me`'nin resolver gövdesi HÂLÂ TEK İFADE (ADR-0009 madde 4,
// bağlayıcı) — `if`/ara değişken/dallanma SIFIR; `ctx.ports.sessionSecurityRead.
// isTwoFactorEnabled(...)`'in döndürdüğü `Promise<boolean>` TEK bir `.then()`
// zinciriyle `ctx.auth` alanlarıyla BİRLEŞTİRİLİR. `userId`/`sessionId` HÂLÂ
// DB okumadan, ALS'teki daraltmanın echo'sudur (K5); `twoFactorEnabled` ARTIK
// `SessionSecurityReadPort` üzerinden TEK bir DB okumasıyla doldurulur — "DB
// okuması YOK" iddiası bu TEK alan için GEÇERLİLİĞİNİ KAYBETTİ (bkz.
// `session-identity.schema.ts`'in güncellenen başlık yorumu, tip pini 3).
// AC7 (sızdırmazlık) HÂLÂ TEST değil YAPI ile sağlanıyor: `.output()`
// `sessionIdentitySchema`'nın TAM OLARAK üç alanına (`userId`/`sessionId`/
// `twoFactorEnabled`) sabitlenir, `token`/`password`/`hash`/`secret`
// İÇEREMEZ.
//
// `session.list` — `protectedProcedure`, `tenantProcedure` DEĞİL: `Session`'da
// `tenantId` YOK (po doğruladı), kiracı daraltması bu kaynak için ANLAMSIZ
// (architect TASARIM bölümü). `permissionProcedure` DEĞİL: izin kataloğu
// kiracı rolüne bağlı, oturum KULLANICIYA ait — `session.me`'nin birebir
// EMSALİ. Girdi YOK; resolver TEK İFADE (ADR-0009 madde 4) —
// `ctx.ports.sessionListRead.listOwnSessions(...)`'ın döndürdüğü diziyi
// DEĞİŞTİRMEDEN, sıfır dallanma ile tele TAŞIR (port TOTAL — "bulunamadı"
// durumu YOKTUR, boş dizi geçerli bir sonuçtur). AC7 sızdırmazlığı AYNI
// yapısal mekanizma: `.output()` `activeSessionWireSchema` dizisine
// sabitlenir, `token`/ham `userAgent` İÇEREMEZ.

import { z } from 'zod'

import { activeSessionWireSchema } from '../schemas/session-summary.schema.js'
import { sessionIdentitySchema } from '../schemas/session-identity.schema.js'
import { protectedProcedure, router } from '../trpc.js'

export const sessionRouter = router({
  me: protectedProcedure.output(sessionIdentitySchema).query(({ ctx }) =>
    ctx.ports.sessionSecurityRead.isTwoFactorEnabled(ctx.auth.userId).then((twoFactorEnabled) => ({
      userId: ctx.auth.userId,
      sessionId: ctx.auth.sessionId,
      twoFactorEnabled,
    })),
  ),
  list: protectedProcedure.output(z.array(activeSessionWireSchema)).query(({ ctx }) =>
    // ⚠ `[...sessions]` — port `readonly ActiveSessionWire[]` döner, Zod'un
    // `z.array()` çıktı tipi MUTABLE'dır (tRPC'nin `.output()` imzası bunu
    // ister); yayma (spread) `as`/`any` GEREKMEDEN uyumlu bir dizi üretir,
    // içerik DEĞİŞTİRİLMEZ (sıfır dallanma, ADR-0009 madde 4).
    ctx.ports.sessionListRead
      .listOwnSessions(ctx.auth.userId, ctx.auth.sessionId)
      .then((sessions) => [...sessions]),
  ),
})
