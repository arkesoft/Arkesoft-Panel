// @arkesoft/trpc — permissionProcedure, merdivenin BEŞİNCİ builder'ı (ROADMAP
// v0.0.14, T-014/S2, architect K-A5/K-A6, ADR-0016)
//
// Merdivenin ilk dördü `../trpc.ts`'te tanımlıdır; bu dosya oradaki
// `tenantProcedure`'ün ÜZERİNE kurulur:
//
//   permissionProcedure(p) = tenantProcedure.use(<izin kapısı>)
//
// ⚠ `tenantProcedure` ÜZERİNE kurulması tasarımın özüdür: kimlik daraltması ve
// kiracı daraltması DEVRALINIR — `ctx.tenant.tenantId` host çözümünden gelir
// (ADR-0009 madde 7 korunur), `ctx.auth.userId` kimlik bağlamından. Bu dosyada
// `as` ile tip zorlama YOKTUR ve gerekmez; iki daraltma da TİP düzeyinde
// devralınır.
//
// ⚠ AYRI DOSYA, `../trpc.ts`'e EKLENMEDİ: o dosya platformun en çok
// denetlenmiş builder dosyasıdır ve bu sürümde KODU değişmiyor (yalnızca
// merdiven yorumuna beşinci basamağın YERİNİ söyleyen bir satır eklendi —
// "beyan ≠ gerçeklik" borcu doğmaması için). İzin kapısı kataloğa
// (`permissions.ts`) ve kullanım kaydına (`permission-usage.ts`) bağımlıdır;
// bu bağımlılıkları `trpc.ts`'e taşımak taban merdiveni yetki modeline
// bağlardı.
//
// ⚠⚠ BU DOSYA `src/index.ts`'TEN (TARAYICI girişi) EXPORT EDİLMEZ: burada
// `../trpc.js` import'u vardır ve o modül grafiği sunucu tarafıdır. Yalnızca
// `src/server.ts` bu dosyayı dışa açar.

import { ROLE_PERMISSIONS } from './permissions.js'
import type { Permission } from './permissions.js'
import { recordPermissionUsage } from './permission-usage.js'
import { tenantProcedure } from '../trpc.js'

/**
 * `permissionProcedure`'ün gövdesi — kullanım kaydını YAPMAZ, yalnızca
 * builder'ı kurar. AYRI olmasının TEK gerekçesi tip türetmesidir: dışa açılan
 * her fonksiyonun dönüş tipi AÇIK yazılmak zorundadır (CLAUDE.md §4) ve
 * tRPC'nin builder tipi elle yazılamayacak kadar parametriktir. Bu yüzden tip
 * `ReturnType<typeof buildPermissionGate>` ile TÜRETİLİR — elle yazılmış,
 * sapmaya açık bir ikinci tanım DOĞMAZ.
 */
function buildPermissionGate(permission: Permission) {
  return tenantProcedure.use(async ({ ctx, next }) => {
    const role = await ctx.ports.membershipRead.requireRole(ctx.tenant.tenantId, ctx.auth.userId)

    if (ROLE_PERMISSIONS[role].includes(permission)) {
      return next()
    }

    throw ctx.errors.permissionDenied(permission, role)
  })
}

/** {@link permissionProcedure}'ün döndürdüğü builder tipi — `buildPermissionGate`'ten TÜRETİLİR. */
export type PermissionGatedProcedureBuilder = ReturnType<typeof buildPermissionGate>

/**
 * Verilen izni GEREKTİREN prosedür builder'ı.
 *
 * ⚠⚠ GİRDİ TİPİ {@link Permission}'DIR ve BU AC3 AYAK (a)'NIN BİRİNCİL
 * MEKANİZMASIDIR: katalogda OLMAYAN bir izin adıyla bu fabrikayı çağırmak bir
 * DERLEME HATASIDIR. Test ikinci savunma hattıdır, birincil değil — yazım
 * hatası veya uydurulmuş bir izin adı `tsc`'den geçemez.
 *
 * ⚠ ROL HER İSTEKTE OKUNUR (architect K-A5, kabul edilen maliyet): kimlik
 * muhafızının okuması YENİDEN KULLANILMAZ ve rol kimlik bağlamına
 * EKLENMEMİŞTİR — rol KİRACI bazlı, kimlik KULLANICI bazlıdır (kategori
 * hatası) ve oturum kiracı taşımaz (bağlayıcı v0.0.5 kararı).
 *
 * ⚠ HATA: {@link TrpcErrorFactoryPort.permissionDenied} — hata KODU, HTTP
 * DURUMU ve i18n ANAHTARI `apps/api`'nin sahipliğindedir (AC9(a)); bu paket
 * hiçbir hata kodu LİTERALİ taşımaz. Durum 404 DEĞİL 403'tür (architect
 * K-A6): CLAUDE.md §7 madde 12'nin yasakladığı şey VARLIK ORACLE'IDIR —
 * aktör bu kiracının ÜYESİDİR (üyelik portu doğruladı), kiracının varlığını
 * ZATEN bilir ve başka bir kiracı hakkında hiçbir şey ÖĞRENMEZ.
 *
 * ⚠⚠ BU KAPI LOG YAZMAZ — AMA RED GÖRÜNÜRDÜR, ve bu cümle T-014 düzeltme
 * turu 1'de DÜZELTİLDİ (`solid` M-1 + `security` medium #1, iki gate
 * BAĞIMSIZ olarak buldu). ESKİ metin "izin adı ve rol `AppError.context`'e
 * girer ve `apps/api`'nin hata sınırı onu loglar" diyordu; ÖLÇÜLDÜ:
 * `apps/api`'nin Nest hata filtresi bu yolda HİÇ tetiklenmiyor
 * (`fetchRequestHandler` her hatayı `Response`'a çeviriyor) ve o tarihte
 * HİÇBİR halka loglamıyordu → red tamamen görünmezdi.
 *
 * DOĞRUSU: kaydı `../trpc.ts`'in `appErrorBoundary`'si yazar (`logAppError`,
 * 4xx olduğu için `warn`), izin adı ve rol `errorContext` alanının altında
 * görünür, TELE hâlâ GİRMEZ. Burada ikinci bir satır yazmak aynı olayı İKİ
 * KEZ kaydederdi — bu dosyanın sessiz kalması DOĞRU, çünkü sınır artık
 * GERÇEKTEN loglıyor.
 */
export function permissionProcedure(permission: Permission): PermissionGatedProcedureBuilder {
  recordPermissionUsage(permission)

  return buildPermissionGate(permission)
}
