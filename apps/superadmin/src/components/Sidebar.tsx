// @arkesoft/superadmin — Sidebar (ROADMAP v0.0.20, T-021/S8,
// docs/ui/T-021-super-admin-iskeleti.md "Ekran 6 — Kabuk")
//
// ⚠⚠ Mobil nav native disclosure (`<button aria-expanded>` + `<nav>`) —
// Radix GEREKMEZ (S4'ün kararı, `apps/superadmin`'e Radix bağımlılığı hiç
// açılmıyor). `Escape` ile kapanma ELLE eklenir (native disclosure'ın
// kendi sözleşmesi, Radix'in "dismissable layer"ının karşılığı).
//
// DÜZELTME (wcag tur 1, T-021 M1 — WCAG 2.4.3 Focus Order): `<nav>` kapanınca
// `display:none` olur; odaklı öğe nav İÇİNDEYSE (ör. bir bağlantı) DOM
// akışından düşer ve tarayıcı odağı `document.body`'ye indirir — kullanıcı
// konumunu kaybeder. `mobileNavToggleButtonRef` ile toggle düğmesine odak
// GERİ VERİLİR — ama yalnızca `Escape` tuşuyla kapanma yolunda.
// `setIsMobileNavOpen(false)` çağrısından HEMEN SONRA `.focus()` çağrılır —
// bu event handler'ın İÇİNDE React henüz DOM'u commit ETMEMİŞTİR (nav hâlâ
// görünür durumdadır), bu yüzden odak nav'ın DIŞINA (düğmeye) taşınmış olur
// ve nav `display:none` olduğunda düşecek bir odak zaten KALMAZ. Radix'in
// "dismissable layer"ının elle karşılığı (S4/S8'in Radix'siz kararının
// devraldığı garanti).
//
// DÜZELTME (T-021 FIX turu 2/3 — qa tur 1 e2e ölçümü,
// `sidebar-focus-return.qa.spec.ts`): bağlantı seçiminde odağı tetikleyici
// düğmeye GERİ VERMEK YANLIŞ — bağlantı seçimi SAYFA DEĞİŞTİRİR ve hedef
// rota kendi `headingRef.focus()`'unu çağırarak odağı kendi `h1`'ine alır
// (bkz. `_app.denetim-kaydi.tsx`); bu doğru ve beklenen erişilebilirlik
// davranışıdır (WCAG 2.4.3 — kullanıcı menüyü kapatmak için değil, GİTMEK
// için tıkladı). FIX 1'in "iki yerde de `focusToggle()` çağır" talimatı bu
// yüzden link dalında ölü bir çağrı üretti — `qa` ölçtü: odak her zaman
// hedef sayfanın başlığı tarafından EZİLİYORDU. Bu yüzden link seçiminde
// yalnızca `setIsMobileNavOpen(false)` çağrılır (nav mantıksal olarak
// kapanır), odak geri-yükleme çağrısı YOKTUR — rota odağı devralır.
//
// Responsive: 360px'te nav GİZLİ (`hidden`), toggle düğmesi görünür
// (`md:hidden`); `md:` (768px) nav HER ZAMAN görünür (`md:flex`), toggle
// düğmesi GİZLİ (`md:hidden` üstünde zaten `hidden` olur çünkü ayrı bir
// `md:hidden` sınıfı taşır) — docs/ui/T-021 Responsive plan.
import { useEffect, useId, useRef, useState, type JSX } from 'react'

import { Link } from '@tanstack/react-router'

import { cn, FOCUS_RING_CLASS_NAMES } from '@arkesoft/ui'

export interface SidebarProps {
  readonly navLabel: string
  readonly mobileNavToggleLabel: string
  readonly tenantsLabel: string
  readonly auditLogLabel: string
}

const NAV_LINK_CLASS_NAME = `${FOCUS_RING_CLASS_NAMES} inline-flex min-h-11 min-w-11 items-center rounded-(--radius-control) px-3 text-(length:--font-size-body) font-(--font-weight-regular) text-(--color-text-primary)`

/**
 * Mobil nav'ı kapatır VE odağı tetikleyici düğmeye geri verir — YALNIZCA
 * `Escape` tuşuyla kapanma yolunun DOM'dan ayrıştırılmış saf mantığı
 * (T-021 FIX turu 2/3'ten itibaren; önceden bağlantı seçimi de bu
 * fonksiyonu çağırıyordu, ama `qa` tur 1 ölçtü: o çağrı hedef sayfanın
 * `headingRef.focus()`'u tarafından hemen eziliyordu — bkz. dosya başı
 * yorumu). Sıra BAĞLAYICI: `setIsOpen` ÖNCE çağrılır (nav'ı mantıksal
 * olarak kapatır), `focusToggle` SONRA (bu event handler'ın içinde React
 * henüz DOM'u commit etmemişken odağı nav'ın dışına taşır — dosya başı
 * yorumu).
 *
 * DOM'dan bilerek ayrıştırıldı (enjekte edilen callback'ler): bu paketin
 * Vitest kararı `environment: 'node'` (bkz. `vitest.config.ts` — DOM YOK,
 * bileşen davranışı Playwright'ta ölçülür). `jsdom`/`happy-dom` +
 * `@testing-library/react` bu turda eklenemedi (yeni bağımlılık yasağı) ve
 * `apps/superadmin/e2e/**` bu turda dokunulamaz alan — bu yüzden gerçek
 * `document.activeElement` kanıtı yerine bu saf fonksiyonun çağrı sırası
 * `node` ortamında kanıtlanıyor (BORÇ: `document.activeElement` ile uçtan
 * uca kanıt, raporda işaretli).
 */
export function closeMobileNavAndRestoreFocus(
  setIsOpen: (isOpen: boolean) => void,
  focusToggle: () => void,
): void {
  setIsOpen(false)
  focusToggle()
}

export function Sidebar({
  navLabel,
  mobileNavToggleLabel,
  tenantsLabel,
  auditLogLabel,
}: SidebarProps): JSX.Element {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const navId = useId()
  const mobileNavToggleButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isMobileNavOpen) {
      return
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        // Odağı tetikleyici düğmeye geri veren TEK çağrı noktası — bkz. dosya
        // başı yorumu (link seçiminde odak geri yüklenmez, rota devralır).
        closeMobileNavAndRestoreFocus(setIsMobileNavOpen, () => {
          mobileNavToggleButtonRef.current?.focus()
        })
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileNavOpen])

  return (
    <div className="shrink-0 bg-(--color-surface-muted) md:w-56 lg:w-64">
      <button
        ref={mobileNavToggleButtonRef}
        type="button"
        aria-expanded={isMobileNavOpen}
        aria-controls={navId}
        onClick={() => {
          setIsMobileNavOpen((previous) => !previous)
        }}
        className={cn(
          FOCUS_RING_CLASS_NAMES,
          'inline-flex min-h-11 min-w-11 items-center gap-2 px-3 text-(length:--font-size-body) font-(--font-weight-semibold) text-(--color-text-primary) md:hidden',
        )}
      >
        <span aria-hidden="true">☰</span>
        {mobileNavToggleLabel}
      </button>
      <nav
        id={navId}
        aria-label={navLabel}
        className={cn(isMobileNavOpen ? 'flex' : 'hidden', 'flex-col gap-1 p-2 md:flex md:p-4')}
      >
        <Link
          to="/"
          activeOptions={{ exact: true }}
          activeProps={{
            'aria-current': 'page',
            className: 'bg-(--color-brand-50) text-(--color-brand-500)',
          }}
          onClick={() => {
            // Link seçiminde odak hedef sayfanın başlığına geçer (rota kendi
            // `headingRef.focus()`'unu çağırır); buraya odak geri yüklemesi
            // koymak onu hemen ezilen ölü bir çağrı yapar — qa tur 1 ölçümü.
            // Masaüstünde (`md:flex`) `isMobileNavOpen` görünürlüğü
            // etkilemez, bu yüzden koşulsuz çağrı güvenlidir.
            setIsMobileNavOpen(false)
          }}
          className={NAV_LINK_CLASS_NAME}
        >
          {tenantsLabel}
        </Link>
        <Link
          to="/denetim-kaydi"
          activeProps={{
            'aria-current': 'page',
            className: 'bg-(--color-brand-50) text-(--color-brand-500)',
          }}
          onClick={() => {
            // Link seçiminde odak hedef sayfanın başlığına geçer (rota kendi
            // `headingRef.focus()`'unu çağırır); buraya odak geri yüklemesi
            // koymak onu hemen ezilen ölü bir çağrı yapar — qa tur 1 ölçümü.
            setIsMobileNavOpen(false)
          }}
          className={NAV_LINK_CLASS_NAME}
        >
          {auditLogLabel}
        </Link>
      </nav>
    </div>
  )
}
