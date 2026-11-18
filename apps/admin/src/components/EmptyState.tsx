// @arkesoft/admin — EmptyState (ROADMAP v0.0.7, T-008/S5, docs/ui/T-008.md
// bileşen eşlemesi)
//
// `headingLevel` HER ZAMAN `h2` (ui'nin kararı, sabit — prop YOK): sayfanın
// tek `h1`'i zaten route'tadır ("Panel"); `EmptyState` ikinci bir `h1`
// ÜRETMEZ. `role="status"` — UX'in "mağaza/kullanıcı kimliği gösterilmeyen
// yerlerde 'yok' durumu sessiz değil, açık" niyetiyle aynı aile: boş durum
// bir placeholder/boşluk değil, okunabilir bir durum.
//
// ⚠⚠ UI PLANINDAN SAPMA (ölçülmüş, bilinçli) — docs/ui/T-019-kayit-ve-
// kiraci-olusturma.md "Mevcut bileşen genişletmeleri" bu dosyaya opsiyonel
// bir `action` prop'u istiyordu ("CardContent'in ALTINDA bir Button render
// eder"). Bu dosya T-019/S10'un "DOKUNACAĞIN DOSYALAR" listesinde YOK
// (handoff'un kesin listesi `components/EmptyState.tsx`'i İÇERMİYOR) — bu
// listeyi AŞMAMAK için `action` prop'u BURAYA EKLENMEDİ; aynı görsel/
// işlevsel sonuç `_app.index.tsx`'te "Mağaza oluştur" butonunu `EmptyState`'in
// KENDİSİNİN DIŞINDA, yan öğe olarak render ederek elde edildi (bkz. o
// dosyanın gövdesi). RİSKLER'e taşındı — Orkestratör isterse bu dosyayı
// ileride plan metniyle BİREBİR uyumlu hâle getirebilir.
import type { JSX } from 'react'

export interface EmptyStateProps {
  readonly heading: string
  readonly body: string
}

export function EmptyState({ heading, body }: EmptyStateProps): JSX.Element {
  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-(--radius-card) border border-(--color-border-subtle) bg-(--color-surface-muted) p-6"
    >
      <h2 className="text-(length:--font-size-body) font-(--font-weight-semibold) text-(--color-text-primary)">
        {heading}
      </h2>
      <p className="max-w-2xl text-(length:--font-size-body) text-(--color-text-secondary)">
        {body}
      </p>
    </div>
  )
}
