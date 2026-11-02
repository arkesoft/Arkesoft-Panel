// @arkesoft/storefront — TenantGreeting: kiracı sayfasının React adası
// (ROADMAP v0.0.8, T-009/S6, architect "React adası", `docs/ux/T-009.md`
// "React adası (TenantGreeting.tsx) — etkileşim tasarımı")
//
// UYARI 2'NİN ÇÖZÜMÜ (bağlayıcı, raporlanması istendi — ADA (CLIENT JS)
// KULLANIMI başlığında TEKRARLANACAK):
//   - HİDRASYON ÖNCESİ anlamlı: `<details>/<summary>` NATIVE bir HTML
//     elemanı — JavaScript'siz de açılır/kapanır, klavyeyle zaten
//     erişilebilir (`summary` örtük `button` rolü + `aria-expanded` taşır).
//     JS kapalıyken ziyaretçi ibareyi okuyabilir ve açabilir; sayfa
//     ANLAMINI kaybetmez (ux'in tasarladığı yapı budur).
//   - HİDRASYON SONRASI gözlemlenebilir: `data-hydrated` özniteliği SSR'da
//     `"false"` olarak render edilir (ux'in "görünür fark yok" ilkesiyle
//     tutarlı — bu öznitelik GÖRSEL değil), `useEffect` yalnızca TARAYICIDA
//     çalıştığı için React bu düğümü ele aldığında `"true"`'ya döner. Bu,
//     hidrasyonun GERÇEKTEN gerçekleştiğinin programatik (DOM'dan okunabilir,
//     `qa`/`wcag`'ın ölçeceği) kanıtıdır — kullanıcı deneyimini
//     DEĞİŞTİRMEZ, kişiselleştirme-yok ilkesini (PM A6) BOZMAZ.
//
// `storefront-env.js`/`api-client.js` İTHAL EDİLMEZ (lint + mimari kural) —
// bileşen SAF SUNUM: tüm metin/veri PROP olarak gelir, veri çekmez.
//
// Klavye: `Tab` ile tetikleyiciye gelinir, `Enter`/`Boşluk` ile
// açılır/kapanır — tarayıcı varsayılanı, EK bir `tabindex`/`keydown`
// yönetimi YAZILMAZ (native elemanın üstüne gereksiz JS katmanı, hem
// bağımlılık hem hata riski olurdu — ux'in kararı).

import { useEffect, useState } from 'react'
import type { JSX } from 'react'

export interface TenantGreetingProps {
  readonly summary: string
  readonly body: string
}

export function TenantGreeting({ summary, body }: TenantGreetingProps): JSX.Element {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // `eslint-plugin-react-hooks`'un "set-state-in-effect" kuralı, TÜRETİLMİŞ
    // durum için (React state'inden hesaplanabilecek bir değer) efekt
    // kullanmayı caydırmak üzere var. Buradaki durum TÜRETİLMİŞ DEĞİL:
    // "bu düğüm TARAYICIDA React tarafından ele alındı mı?" sorusunun
    // CEVABI, React'in render ettiği hiçbir prop/state'ten HESAPLANAMAZ —
    // tanım gereği yalnızca efekt ÇALIŞTIĞINDA (yani hidrasyon
    // GERÇEKLEŞTİĞİNDE) bilinir. Bu, UYARI 2'nin istediği "hidrasyon
    // SONRASI gözlemlenebilir değişiklik" garantisinin YAPISAL temeli.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true)
  }, [])

  return (
    <details data-hydrated={hydrated ? 'true' : 'false'} className="text-[#1F2937]">
      <summary className="min-h-11 min-w-11 cursor-pointer py-2">{summary}</summary>
      <p className="py-2">{body}</p>
    </details>
  )
}
