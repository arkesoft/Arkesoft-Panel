// @arkesoft/superadmin — PanelError: üç taşıma zarfının indirgendiği TEK
// normalize tip (ROADMAP v0.0.20, T-021/S8, `apps/admin/src/errors/
// panel-error.ts`'in AYNI deseni — bu panel alan bazlı (`fields`) hata
// kanalı TAŞIMAZ, çünkü hiçbir formu girdili bir tRPC prosedürüne
// göndermiyor; o kanal `apps/admin`'in kayıt akışına özgü).
//
// İKİ BAĞLAYICI KARAR:
// 1. Hiçbir mesaj alanı taşınmaz (ne `message` ne `userMessageKey`) →
//    panelin sunucudan gelen bir metni ekrana basması YAPISAL olarak
//    İMKÂNSIZ.
// 2. Dallanma YALNIZCA `code` üzerinde (ADR-0010 madde 3.6). HTTP durumu
//    tipte YOK.
export type PanelError =
  | { readonly kind: 'known'; readonly code: string; readonly requestId: string | null }
  | { readonly kind: 'unknown'; readonly requestId: string | null }
