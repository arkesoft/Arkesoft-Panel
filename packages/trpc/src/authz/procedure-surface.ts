// @arkesoft/trpc — prosedür yüzeyinin KAPALI DÜNYA beyanı (ROADMAP v0.0.14,
// T-014/S2, architect K-A8 ayak (c))
//
// ⚠⚠ BU TABLONUN VARLIK SEBEBİ: izin kataloğu ile çağrı yerleri arasındaki
// tutarlılığı ölçen (a) ve (b) ayakları, "YENİ EKLENEN BİR PROSEDÜRÜN İZİNSİZ
// OLMASINI" GÖRMEZ. (a) yalnızca verilen izin adının katalogda olduğunu, (b)
// yalnızca her iznin bir tüketicisi olduğunu kontrol eder; ikisi de izinli
// prosedürlere BAKAR. İzinsiz doğan bir prosedür her ikisinin de KÖR
// NOKTASINDADIR. Bu tablo o kör noktayı kapatır: prosedür yüzeyinin TAMAMI
// burada BEYAN edilir ve test bu beyanı router'ın GERÇEK envanteriyle küme
// eşitliği olarak karşılaştırır.
//
// ⚠ TABLONUN KAPATAMADIĞI TEK DELİK — YAZILI VE BİLİNÇLİ: bir prosedürü
// `builder: 'tenant'` diye BİLEREK beyan etmek. Bu, `apps/api`'deki
// kiracı-muaf yol listesinin kardinalite assertion'ıyla AYNI SINIF bir
// mekanizmadır: mekanizma kötü niyeti değil, UNUTMAYI engeller ve değişikliği
// kod incelemesinde GÖRÜNÜR kılar (satırı elle değiştirmek zorundasın).
// Bu delik GEVŞETİLMEZ ve "test her şeyi yakalıyor" diye BEYAN EDİLMEZ.
//
// ⚠ MEKANİK OLARAK DOĞRULANAN NE, BEYAN OLAN NE (karışmaması bağlayıcı):
//   · `path` kümesi      → MEKANİK (router envanteriyle küme eşitliği)
//   · `operation`        → MEKANİK (router'ın kendi kaydından okunur)
//   · `builder:'permission'` KAYIT SAYISI → MEKANİK (izin kullanım kaydıyla
//     eşitlik; bir prosedürü izinsiz builder'a indirmek sayımı SAPTIRIR)
//   · `permission` ADI   → MEKANİK, TİP düzeyinde ({@link Permission})
//   · izinsiz girdilerin `builder` DEĞERİ → BEYAN (yukarıdaki delik)
//
// 🚫 BU TABLO `src/index.ts`'TEN EXPORT EDİLMEZ (po R-PO7): tarayıcı girişinin
// yüzeyi değildir ve oraya konması paketin public API'sine bir iç denetim
// aracını sokardı.

import type { Permission } from './permissions.js'

/** tRPC'nin prosedür kaydında taşıdığı işlem türü — router'dan OKUNUR, beyan edilmez. */
export type ProcedureOperation = 'query' | 'mutation'

/**
 * İzinle kapılanan bir prosedürün beyanı. `permission` ZORUNLUDUR ve tipi
 * {@link Permission}'dır — katalogda olmayan bir izin adı bu tabloda da
 * DERLENMEZ (AC3 ayak (a)'nın tablo tarafındaki ikizi).
 */
interface PermissionGatedProcedureEntry {
  readonly builder: 'permission'
  readonly permission: Permission
  readonly operation: ProcedureOperation
}

/**
 * İzinle kapılanmayan bir prosedürün beyanı. `permission` alanı YOKTUR —
 * opsiyonel bir alan (`permission?`) yerine AYRIMLI BİRLEŞİM seçildi
 * (CLAUDE.md §4): opsiyonel alan, izinli bir prosedürde izni yazmayı
 * unutmayı derlenebilir kılardı; birleşimde `builder: 'permission'` demek
 * `permission` yazmayı ZORUNLU yapar.
 *
 * ⚠ `builder` birleşimi KAPALIDIR ve kimlik gerektirmeyen taban builder
 * (bugün hiçbir prosedürün kullanmadığı) BİLEREK LİSTEDE YOK — ölü bir
 * sözlük değeri, ölü bir iznin kardeşidir. O builder bir gün bir prosedürü
 * kaplarsa bu birleşimi genişletmek AÇIK bir karar olacak.
 */
interface UngatedProcedureEntry {
  readonly builder: 'publicTenant' | 'protected' | 'tenant'
  readonly operation: ProcedureOperation
}

/** Prosedür yüzeyi tablosunun değer tipi. */
export type ProcedureSurfaceEntry = PermissionGatedProcedureEntry | UngatedProcedureEntry

/**
 * Prosedür yolu → builder/izin/işlem beyanı. Anahtar, tRPC'nin prosedür
 * kaydındaki NOKTALI TAM YOLDUR (`namespace.action`).
 *
 * Yeni bir prosedür eklerken BU TABLOYA bir satır eklemek ZORUNLUDUR;
 * eklenmezse `authz-consistency.test.ts` küme eşitliği assert'i kırmızıya
 * düşer (mutasyonla kanıtlı).
 */
export const PROCEDURE_SURFACE = {
  'session.me': { builder: 'protected', operation: 'query' },
  'tenant.current': { builder: 'tenant', operation: 'query' },
  'storefront.currentTenant': { builder: 'publicTenant', operation: 'query' },
  'job.get': { builder: 'permission', permission: 'job:read', operation: 'query' },
  'job.list': { builder: 'permission', permission: 'job:read', operation: 'query' },
  'member.invite': { builder: 'permission', permission: 'member:write', operation: 'mutation' },
  'member.acceptInvitation': { builder: 'protected', operation: 'mutation' },
  'member.updateRole': { builder: 'permission', permission: 'member:write', operation: 'mutation' },
  'member.remove': { builder: 'permission', permission: 'member:write', operation: 'mutation' },
  // ROADMAP v0.0.15, T-016/S7 — onuncu kayıt. `security:write` YALNIZCA
  // `owner`'da (`authz/permissions.ts`); platformun ilk owner-münhasır
  // izinli prosedürü.
  'tenant.updateSecurityPolicy': {
    builder: 'permission',
    permission: 'security:write',
    operation: 'mutation',
  },
} as const satisfies Readonly<Record<string, ProcedureSurfaceEntry>>
