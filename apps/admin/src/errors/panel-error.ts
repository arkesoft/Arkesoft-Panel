// @arkesoft/admin — PanelError: üç taşıma zarfının (architect K3) indirgendiği
// TEK normalize tip (ROADMAP v0.0.7, T-008/S4). Zarflar: (a) `AppErrorBody` +
// HTTP durumu (taşıma reddi) · (b) tRPC zarfı → `data.appError` · (c) Better
// Auth'un KENDİ gövdesi (`auth.controller.ts`'in delege yanıtı — üst düzey
// `code` SCREAMING_SNAKE_CASE + `message` HAM İngilizce, `details`/`requestId`
// YOK). Giriş formunun hata yolu tam olarak (c) — bkz. `normalize-panel-error.ts`.
//
// ÜÇ BAĞLAYICI KARAR (architect K3, v0.1.0/T-019/S8'de madde 2 GÜNCELLENDİ):
// 1. Hiçbir mesaj alanı taşınmaz (ne `message` ne `userMessageKey`) → panelin
//    sunucudan gelen bir metni ekrana basması YAPISAL olarak İMKÂNSIZ —
//    AC8 hangi kodu bilip bilmediğimizden BAĞIMSIZ sağlanır (fail-closed).
// 2. GÜNCELLEME (ROADMAP v0.1.0, T-019/S8): `fields` artık VAR — v0.1.0
//    panelin İLK girdili tRPC prosedürünü (`registration.createTenant`)
//    getirdi ve AC-5 alan bazlı hata gövdesi istiyor. ⚠⚠ Madde 1'in
//    garantisi GEVŞEMEDİ: taşınan şey her alan için `@arkesoft/trpc`'nin
//    `registrationFieldErrorKeySchema` KAPALI kümesinden bir i18n ANAHTARI,
//    sunucu METNİ DEĞİL. Allowlist'in TEK kaynağı o şema — burada (veya
//    `normalize-panel-error.ts`'te) elle kopyalanmış İKİNCİ bir liste YOK.
//    Kümenin dışındaki/kümeye uymayan her değer `normalizePanelError`
//    tarafından ELENİR (bkz. orada) — bu yüzden `fields`'in KENDİSİ bu tipte
//    `Record<string, RegistrationFieldErrorKey>` olarak daraltılmıştır; `string`
//    DEĞİL. Alan yoksa (veya sunucu hiç `fields` göndermediyse) `null` —
//    eski davranışla (fields alanı yokmuş gibi) birebir aynı sonucu üretir.
// 3. Dallanma YALNIZCA `code` üzerinde (ADR-0010 madde 3.6). HTTP durumu
//    tipte YOK — hiçbir tüketici duruma dallanamaz.
import type { RegistrationFieldErrorKey } from '@arkesoft/trpc'

export type PanelError =
  | {
      readonly kind: 'known'
      readonly code: string
      readonly requestId: string | null
      readonly fields: Readonly<Record<string, RegistrationFieldErrorKey>> | null
    }
  | { readonly kind: 'unknown'; readonly requestId: string | null }
