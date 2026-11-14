// @arkesoft/admin — `/magaza-olustur` rotası (ROADMAP v0.1.0, T-019/S10,
// docs/ux/T-019-kayit-ve-kiraci-olusturma.md Ekran 4-6, docs/ui/T-019 P3-P5)
//
// Korumalı (`_app` guard'ı içinde, `AppShell` görünür — docs/ui "Rota
// tablosu" notu: bu bilinçli bir "fokus/kiosk" ekranı DEĞİL). TÜM karar
// mantığı `StoreWizard`/`StoreWizardController`'da — bu dosya İNCE bir
// kabuk, render DIŞINDA hiçbir şey yapmaz.
//
// Bundle bütçesi: `bundle-budget.config.ts`'in `DELIBERATELY_LAZY_ROUTE_
// SRCS`'inde — bookmarklanabilir olması onu ilk-boya YAPMIYOR (KARAR 1,
// `_app.hesap.guvenlik.tsx` emsali).
import { createFileRoute } from '@tanstack/react-router'
import type { JSX } from 'react'

import { StoreWizard } from '../features/registration/StoreWizard.js'

export const Route = createFileRoute('/_app/magaza-olustur')({
  component: StoreWizardPage,
})

function StoreWizardPage(): JSX.Element {
  return <StoreWizard />
}
