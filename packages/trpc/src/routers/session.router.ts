// @arkesoft/trpc — session.me (ROADMAP v0.0.6, T-007/ST-2, architect "tRPC
// sözleşmesi"; v0.0.15, T-016 FIX turu 2/M-4 — `twoFactorEnabled` EKLENDİ)
//
// Resolver gövdesi HÂLÂ TEK İFADE (ADR-0009 madde 4, bağlayıcı) — `if`/ara
// değişken/dallanma SIFIR; `ctx.ports.sessionSecurityRead.
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
})
