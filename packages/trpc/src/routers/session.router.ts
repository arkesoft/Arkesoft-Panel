// @arkesoft/trpc — session.me (ROADMAP v0.0.6, T-007/ST-2, architect "tRPC
// sözleşmesi")
//
// Resolver gövdesi TEK İFADE (ADR-0009 madde 4, bağlayıcı): `ctx.auth`
// alanlarından çıktı nesnesinin KURULUMU. DB okuması YOK — K5: "ALS'teki
// daraltma TEKRAR KULLANILIYOR", AC7 (sızdırmazlık) bu yüzden TEST değil
// YAPI ile sağlanıyor (dönüş tipi `SessionIdentity`'nin yalnızca iki alanı
// var, `token`/`password`/`hash`/`secret` İÇEREMEZ).

import { sessionIdentitySchema } from '../schemas/session-identity.schema.js'
import { protectedProcedure, router } from '../trpc.js'

export const sessionRouter = router({
  me: protectedProcedure
    .output(sessionIdentitySchema)
    .query(({ ctx }) => ({ userId: ctx.auth.userId, sessionId: ctx.auth.sessionId })),
})
