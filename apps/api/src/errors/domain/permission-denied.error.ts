// @arkesoft/api — PERMISSION_DENIED (ROADMAP v0.0.14, T-014/S4, architect K-A6)
//
// `permissionProcedure`'ün izin kapısının fırlattığı hata: aktörün kimliği
// doğrulanmış, kiracı üyeliği DOĞRULANMIŞ, ama rolü istenen izni TAŞIMIYOR.
//
// ⚠⚠ DURUM 403'TÜR, 404 DEĞİL — ve bu CLAUDE.md §7 madde 12 ile ÇARPIŞMAZ.
// O maddenin yasakladığı şey VARLIK ORACLE'IDIR ("var olmayan" ile "yetkisiz"
// arasındaki ayrımın tele sızması). Buraya ulaşan aktör bu kiracının
// ÜYESİDİR — kiracının varlığını ZATEN bilir, çünkü üyelik muhafızı onu bir
// adım önce doğruladı; başka bir kiracı hakkında hiçbir şey ÖĞRENMEZ.
// `TENANT_MEMBERSHIP_REQUIRED`'ın (403) aynı sınıfı; ADR-0010 madde 5'in
// yazılı istisnasıyla birebir aynı gerekçe. ROADMAP v0.0.14'ün kabul kriteri
// de 403 diyor.
//
// ⚠⚠ `publicDetails` BİLEREK OVERRIDE EDİLMEZ → tel gövdesinin `details`
// alanı `{}` KALIR (`AppError.publicDetails` varsayılanı). BU, VARLIK
// ORACLE'ININ TEK SAVUNMASIDIR (T-013'te S8 M2 ile ölçüldü): izin adı ve rol
// gövdeye girerse istemci yetki modelinin iç yapısını (hangi izinler var,
// kendisi hangi roldedir) yanıt gövdesinden öğrenir. İki alan YALNIZCA
// `AppError.context`'e girer ve `toErrorBody` o alanı HİÇ OKUMAZ — sızdırmazlık
// `@arkesoft/errors` tarafında YAPISAL olarak garanti edilir, bu dosyada bir
// maskeleme adımı GEREKMEZ.
//
// `context` PII TAŞIMAZ: `permission` bir katalog adıdır (`@arkesoft/trpc`'nin
// izin sözlüğü), `role` beş elemanlı kapalı bir sözlüğün üyesidir. Aktörün
// kimliği BURADA TEKRARLANMAZ — istek logu `userId`'yi zaten child logger
// üzerinden taşıyor (`auth.guard.ts`'in FIX turu 1 madde 10 ölçümü: ikinci kez
// geçirilen alan NDJSON satırında İKİ KEZ görünür).
//
// ⚠⚠ "LOGA GİDER" İDDİASI T-014 DÜZELTME TURU 1'DE GERÇEK OLDU (`solid` M-1 +
// `security` medium #1 — iki gate BAĞIMSIZ olarak buldu). `details`'i boş
// bırakmanın yazılı TEK gerekçesi bu iki alanın "tele değil LOGA" gitmesiydi;
// ÖLÇÜLDÜ: o tarihte HİÇBİR halka loglamıyordu — bu sınıfın kaydı tRPC
// yolundan geçtiği için `apps/api`'nin Nest hata filtresi HİÇ tetiklenmiyor
// (`fetchRequestHandler` her hatayı `Response`'a çeviriyor), yani yetki reddi
// tamamen görünmezdi (OWASP A09). ⚠ Kaydı yazan yer `@arkesoft/trpc`'nin
// `appErrorBoundary`'sidir (`trpc.ts` → `logAppError`): `httpStatus` 403
// olduğu için seviye `warn`, ve bu iki alan log kaydının `context` ANAHTARININ
// ALTINDA (nestelenmiş olarak) görünür — REST yolunun `AppExceptionFilter`
// üzerinden ürettiği kayıtla AYNI alan adı (`error-mapping.ts`'in
// `logContext`'i). Tel gövdesi bu eklemeyle DEĞİŞMEDİ.

import { AppError } from '@arkesoft/errors'
import type { Permission } from '@arkesoft/trpc'
import type { TenantRoleWire } from '@arkesoft/trpc'

export class PermissionDeniedError extends AppError {
  constructor(permission: Permission, role: TenantRoleWire) {
    super({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      userMessageKey: 'errors.authz.permissionDenied',
      context: { permission, role },
      // Rol değişmeden yeniden denemek sonucu değiştirmez.
      isRetryable: false,
    })
  }
}
