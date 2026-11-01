// @arkesoft/admin — LoadingState (ROADMAP v0.0.7, T-008/S5, docs/ui/T-008.md
// bileşen eşlemesi)
//
// `headingLevel` KARARI (ui, bağlayıcı): `_app.tsx`'in KABUKSUZ pending
// durumunda (henüz hiçbir route'un `h1`'i mount olmamış) `headingLevel="h1"`
// — bu, o anın SAYFADAKİ TEK başlığıdır. Dashboard mount olduktan SONRA
// `<main>` içinde kullanılırsa `headingLevel="h2"` olurdu. Yanlış kullanım
// (kabuksuz bağlamda `h2` veya başka bir `h1` zaten mountluyken `h1`)
// AC11'in "tam bir h1" şartını kırar.
//
// DÜZELTME TURU 1 (`solid` L4/M8 — KARAR, bağlayıcı): `'h2'` kolu bu
// sürümde GERÇEKTEN KULLANILMIYOR (`solid` doğru ölçtü, `_app.tsx`'teki
// HER İKİ `LoadingState` çağrısı da `h1`) — ama tip KORUNUYOR, GEVŞETİLMİYOR
// (`'h1'` tekil literale indirilmiyor). Gerekçe: `ErrorState`'in AYNI
// `'h1' | 'h2'` sözleşmesinde `h2` kolu GERÇEKTEN kullanılıyor (`_app.tsx`
// `AppLayoutComponent` — kabuk kurulduktan SONRA arka plan yeniden
// doğrulaması başarısız olursa, bkz. `panel-flow.spec.ts` testi (d) + `qa`
// (F)); iki bileşen BİLEREK simetrik bir sözleşme taşıyor. `LoadingState`'in
// kendi `h2` kolu bugün kullanılmasa da, kabuk kurulduktan SONRA bir arka
// plan YENİDEN DOĞRULAMASI (henüz hata VERMEMİŞ, sadece sürüyor) için
// gelecekte bir "kabuk içi yükleniyor" göstergesi (`<main>` içinde, `h1`
// ÜRETMEDEN) eklenmek istenirse tip ZATEN hazır — tip daraltmak bu sürümde
// kozmetik bir kazanç, gelecek sürümde ikinci bir API değişikliği doğurur.
//
// `aria-live="polite"` — UX'in "canlı bölgeler" niyeti: geçiş durumu,
// kesintisiz duyuru (role="alert" DEĞİL, bu `ErrorState`'in işi).
//
// DÜZELTME TURU 1 (`wcag` low 8b, WCAG 2.3.3): dönen gösterge artık
// `motion-reduce:animate-none` taşıyor — `packages/ui/src/components/
// Button.tsx`'teki AYNI desen (Tailwind'in yerleşik `motion-reduce:`
// varyantı, ek bağımlılık GEREKMEZ). Halka/gösterge GÖRÜNÜR kalır,
// yalnızca dönme hareketi durur.
import type { JSX } from 'react'

export interface LoadingStateProps {
  readonly headingLevel: 'h1' | 'h2'
  readonly title: string
}

export function LoadingState({ headingLevel, title }: LoadingStateProps): JSX.Element {
  const Heading = headingLevel

  return (
    <div
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <Heading className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)">
        {title}
      </Heading>
      <span
        aria-hidden="true"
        className="inline-block size-6 animate-spin rounded-full border-2 border-current border-t-transparent text-(--color-text-secondary) motion-reduce:animate-none"
      />
    </div>
  )
}
