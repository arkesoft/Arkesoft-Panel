// @arkesoft/api — kiracı yaşam döngüsü durumu türetimi: TEK EV (ROADMAP
// v0.1.0, T-019/S9a, architect KARAR 2, ADR-0021, kullanıcı kararı #2)
//
// `TenantStatus` (@arkesoft/db) DÖRT değer taşır — `schema.prisma`'nın kendi
// yorumu (`:947`) birebir: "Kiracı durumu. `deleted` değeri YOKTUR (A-V8) —
// silinmişliğin tek doğruluk kaynağı `Tenant.deletedAt`'tir." v0.1.0'ın
// mekanizma-nötr kabul kriteri (AC-14, kullanıcı kararı #2) "beş durum
// gözlemlenebilir VE silinmişlik TEK doğruluk kaynağından okunur" diyor —
// enum'a `deleted` EKLEMEK bu kararla ÇELİŞİR (T-018/ADR-0020 Karar 1'in bir
// sürüm harcayarak kapattığı ÇİFT DOĞRULUK KAYNAĞI borcunu yeniden doğurur
// ve yayınlanmış bir ÇIKTI enum'una değer eklemek PİN 1'i kırıp MAJOR etki
// doğurur).
//
// Bu modül o İKİ sinyali (dört değerli `status` + `deletedAt`) TEK bir BEŞ
// değerli "yaşam döngüsü durumu"na indirger — SAF fonksiyon, FIRLATMAZ, I/O
// YOK. ⚠⚠ TEK EV: bu türetmeyi yapan İKİNCİ bir yer AÇILMAZ —
// `tenant-resolver.service.ts` (`toResolution`) bu fonksiyonu TÜKETİR, kendi
// `row.deletedAt !== null` kontrolünü BUNUNLA DEĞİŞTİRİR.
//
// ⚠ `'deleted'` BU TİPTE VAR ama `TenantStatusWire`'da (tel sözleşmesi, PİN 1)
// YOKTUR ve EKLENEMEZ — `trpc-wire-contract.pin.ts`'in PİN 14'ü bunu derleme
// zamanında zorlar. "Beş durum gözlemlenebilir" kriteri VERİ KATMANI + bu
// türetme fonksiyonu + 8 vakalık test (`tenant-lifecycle-state.test.ts`)
// düzeyinde karşılanır, TELDE DEĞİL — tele eklemek ölü sözlük değeri
// doğururdu (hiçbir prosedür `'deleted'`'ı tel üzerinde döndürmez; soft-delete
// edilmiş kiracı HER ZAMAN `TenantNotFoundError`/404 ile temsil edilir).

import type { TenantStatus } from '@arkesoft/db'

/**
 * Kiracının gözlemlenebilir BEŞ yaşam döngüsü durumu — `TenantStatus`'un
 * (dört değer) `deletedAt` sinyaliyle BİRLEŞTİRİLMİŞ hâli.
 */
export type TenantLifecycleState = TenantStatus | 'deleted'

/**
 * `deletedAt` DOLU İSE sonuç HER ZAMAN `'deleted'`dir — bu durumda `status`
 * parametresinin değeri GÖRMEZDEN GELİNİR (silinmişliğin tek doğruluk kaynağı
 * `deletedAt`'tir, A-V8; `status` kolonu bağımsız olarak HER ŞEY olabilir ve
 * sonucu DEĞİŞTİRMEZ). `deletedAt` boş İSE `status` DEĞİŞTİRİLMEDEN döner.
 */
export function deriveTenantLifecycleState(
  status: TenantStatus,
  deletedAt: Date | null,
): TenantLifecycleState {
  return deletedAt !== null ? 'deleted' : status
}
