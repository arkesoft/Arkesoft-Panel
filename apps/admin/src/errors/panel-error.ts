// @arkesoft/admin — PanelError: üç taşıma zarfının (architect K3) indirgendiği
// TEK normalize tip (ROADMAP v0.0.7, T-008/S4). Zarflar: (a) `AppErrorBody` +
// HTTP durumu (taşıma reddi) · (b) tRPC zarfı → `data.appError` · (c) Better
// Auth'un KENDİ gövdesi (`auth.controller.ts`'in delege yanıtı — üst düzey
// `code` SCREAMING_SNAKE_CASE + `message` HAM İngilizce, `details`/`requestId`
// YOK). Giriş formunun hata yolu tam olarak (c) — bkz. `normalize-panel-error.ts`.
//
// ÜÇ BAĞLAYICI KARAR (architect K3):
// 1. Hiçbir mesaj alanı taşınmaz (ne `message` ne `userMessageKey`) → panelin
//    sunucudan gelen bir metni ekrana basması YAPISAL olarak İMKÂNSIZ —
//    AC8 hangi kodu bilip bilmediğimizden BAĞIMSIZ sağlanır (fail-closed).
// 2. `fields` YOK — v0.0.7 girdili tRPC prosedürü getirmiyor; üreticisi
//    olmayan bir alan ölü kod doğurur (borç 1449 ertelenmiş kalıyor).
// 3. Dallanma YALNIZCA `code` üzerinde (ADR-0010 madde 3.6). HTTP durumu
//    tipte YOK — hiçbir tüketici duruma dallanamaz.
export type PanelError =
  | { readonly kind: 'known'; readonly code: string; readonly requestId: string | null }
  | { readonly kind: 'unknown'; readonly requestId: string | null }
