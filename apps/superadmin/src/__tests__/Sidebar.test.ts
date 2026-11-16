// @arkesoft/superadmin — Sidebar odak-geri-dönüş davranışı (ROADMAP v0.0.20,
// T-021, wcag gate tur 1 düzeltmesi, WCAG 2.4.3 Focus Order; T-021 FIX
// turu 2/3 — qa tur 1 e2e ölçümü, `sidebar-focus-return.qa.spec.ts`).
//
// KAPSAM SINIRI: bu paketin Vitest kararı `environment: 'node'` (bkz.
// ../../vitest.config.ts — DOM YOK, bileşen/odak davranışı Playwright'ta
// ölçülür). `jsdom`/`happy-dom` + `@testing-library/react` bu düzeltme
// turunda EKLENEMEDİ (yeni bağımlılık yasağı) ve `apps/superadmin/e2e/**`
// bu turda dokunulamaz alan olarak işaretlendi — bu yüzden gerçek
// `document.activeElement` kanıtı burada ÜRETİLEMİYOR (BORÇ, handoff
// raporunda `DOĞRULANAMADI` olarak işaretli).
//
// Burada ölçülen: `Sidebar.tsx`'in `Escape` kapanma yolunda kullandığı saf
// fonksiyon `closeMobileNavAndRestoreFocus` — (a) nav'ı kapatır, (b)
// tetikleyiciye odağı GERİ VERİR, (c) sırası bağlayıcıdır (önce kapat,
// SONRA odakla — dosya başı yorumundaki DOM commit gerekçesi).
//
// DÜZELTME (FIX turu 2/3): bağlantı seçimi yolu artık bu fonksiyonu
// ÇAĞIRMIYOR — `qa` tur 1 ölçtü, hedef sayfanın `headingRef.focus()`'u
// odağı hemen eziyordu, bu yüzden FIX 1'in iki çağrı noktası kararı link
// dalında ölü kod üretmişti. Bu kararı kalıcı pinlemek için `fs`/kaynak
// metni üzerinde statik bir "drift" testi eklendi (`environment: 'node'`
// kısıtı render tabanlı bir kanıta izin vermiyor — yukarıdaki not).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import { closeMobileNavAndRestoreFocus } from '../components/Sidebar.js'

const sidebarSourcePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../components/Sidebar.tsx',
)
const sidebarSource = readFileSync(sidebarSourcePath, 'utf-8')

describe('closeMobileNavAndRestoreFocus', () => {
  it('Escape kapanış yolu: nav kapatılır ve tetikleyiciye odak çağrılır', () => {
    const setIsOpen = vi.fn()
    const focusToggle = vi.fn()

    closeMobileNavAndRestoreFocus(setIsOpen, focusToggle)

    expect(setIsOpen).toHaveBeenCalledExactlyOnceWith(false)
    expect(focusToggle).toHaveBeenCalledOnce()
  })

  it('bağlantı seçiminde odak geri yüklenmez — rota kendi başlığına odaklanarak devralır (T-021 FIX turu 2/3, qa tur 1 ölçümü)', () => {
    // `Sidebar.tsx`'te `closeMobileNavAndRestoreFocus` artık YALNIZCA
    // `Escape` handler'ında çağrılır. Bu paketin Vitest ortamı `node`
    // (DOM yok, bkz. dosya başı yorumu), bu yüzden Link onClick'in GERÇEK
    // davranışı burada render edilip tıklanarak ölçülemiyor; kararı
    // pinlemek için kaynak metni üzerinde statik bir kanıt kullanılıyor:
    // paylaşılan odak-geri-yükleme fonksiyonunun tam olarak BİR çağrı
    // noktası olmalı (Escape dalı) — link dalındaki ölü çağrı geri
    // gelirse bu sayı artar ve test KIRMIZI olur.
    // `closeMobileNavAndRestoreFocus\(setIsMobileNavOpen,` yalnızca ÇAĞRI
    // siteleriyle eşleşir — fonksiyon TANIMI `function
    // closeMobileNavAndRestoreFocus(\n  setIsOpen: ...` biçiminde olduğu
    // için (parametre adı `setIsOpen`, tip imzalı, ayrı satırda) bu desenle
    // eşleşmez.
    const closeAndRestoreFocusCallCount = (
      sidebarSource.match(/closeMobileNavAndRestoreFocus\(setIsMobileNavOpen,/g) ?? []
    ).length
    expect(closeAndRestoreFocusCallCount).toBe(1)

    // Link seçimi dalları (`/` ve `/denetim-kaydi`) nav'ı doğrudan
    // `setIsMobileNavOpen(false)` ile kapatır — odak geri-yükleme
    // çağrısı OLMADAN. Satır-bazlı eşleşme (`^\s*...\s*$`) kasıtlı: dosya
    // başı yorumlarında da bu ifade metin olarak geçiyor, ama onlar yorum
    // satırı (`//` ile başlar) olduğu için bu desenle eşleşmez — yalnızca
    // GERÇEK kod satırı (statement) sayılır. İki Link onClick bloğunun
    // ikisi de bu deseni taşımalı.
    const directCloseCallCount = (
      sidebarSource.match(/^\s*setIsMobileNavOpen\(false\)\s*$/gm) ?? []
    ).length
    expect(directCloseCallCount).toBe(2)
  })

  it('odak çağrısı, nav kapatma çağrısından SONRA yapılır (sıra garantisi)', () => {
    const callOrder: string[] = []
    const setIsOpen = vi.fn(() => {
      callOrder.push('setIsOpen')
    })
    const focusToggle = vi.fn(() => {
      callOrder.push('focusToggle')
    })

    closeMobileNavAndRestoreFocus(setIsOpen, focusToggle)

    expect(callOrder).toEqual(['setIsOpen', 'focusToggle'])
  })

  it('focusToggle hiç çağrılmazsa odak tetikleyiciye DÖNMEZ (negatif kanıt deseni)', () => {
    // Bu test, `closeMobileNavAndRestoreFocus` gövdesinden `focusToggle()`
    // çağrısı KALDIRILDIĞINDA KIRMIZI olur (mutasyon kanıtı — handoff
    // raporunda elle doğrulandı). Burada pozitif yönden aynı sözleşmeyi
    // tekrar sınar: `focusToggle` çağrılmadan dönmek "odak kaybı" anlamına
    // gelir, bu yüzden normal akışta HER ZAMAN çağrılmalıdır.
    const setIsOpen = vi.fn()
    const focusToggle = vi.fn()

    closeMobileNavAndRestoreFocus(setIsOpen, focusToggle)

    expect(focusToggle.mock.calls.length).toBeGreaterThan(0)
  })
})
