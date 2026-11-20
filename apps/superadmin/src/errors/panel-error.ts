// @arkesoft/superadmin — PanelError: üç taşıma zarfının indirgendiği TEK
// normalize tip (ROADMAP v0.0.20, T-021/S8, `apps/admin/src/errors/
// panel-error.ts`'in AYNI deseni — bu panel alan bazlı (`fields`) hata
// kanalı TAŞIMAZ, çünkü hiçbir formu girdili bir tRPC prosedürüne
// göndermiyor; o kanal `apps/admin`'in kayıt akışına özgü).
//
// ÜÇ BAĞLAYICI KARAR (madde 3 ROADMAP v0.0.18/T-027/S7'de EKLENDİ —
// architect R-1 KARARI, `apps/admin`'in AYNI deseni):
// 1. Hiçbir mesaj alanı HAM olarak taşınmaz (ne `message` ne `userMessageKey`) →
//    panelin sunucudan gelen bir metni ekrana basması YAPISAL olarak
//    İMKÂNSIZ.
// 2. Dallanma YALNIZCA `code` üzerinde (ADR-0010 madde 3.6). HTTP durumu
//    tipte YOK.
// 3. YENİ: `messageKey` telden gelen `message` alanının KAPALI kümedeki
//    (`@arkesoft/errors`'ın `ErrorMessageKey`'i) karşılığıdır — `string`
//    DEĞİL. Madde 1'in garantisi GEVŞEMİYOR, KAPALI KÜMEYE DEVREDİLİYOR:
//    `normalize-panel-error.ts` → `errorMessageKeySchema.safeParse(body.message)`
//    — kümenin DIŞINDAKİ her değer (ham sunucu metni dahil) `null`'a elenir.
//    `messages.ts`'in çözümleme merdiveni bu alanı TELDEN gelen en güçlü
//    sinyal olarak kullanır; `null` ise `code`ün `packages/errors`'ın
//    defterinde kayıtlı olup olmadığına geri düşer.
import type { ErrorMessageKey } from '@arkesoft/errors'

export type PanelError =
  | {
      readonly kind: 'known'
      readonly code: string
      readonly requestId: string | null
      readonly messageKey: ErrorMessageKey | null
    }
  | { readonly kind: 'unknown'; readonly requestId: string | null }
