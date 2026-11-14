// @arkesoft/admin — dashboard (`/`) rotası (ROADMAP v0.0.7, T-008/S5,
// docs/ux/T-008.md; ROADMAP v0.1.0, T-019/S10 — YENİDEN TASARLANDI,
// docs/ux/T-019-kayit-ve-kiraci-olusturma.md Ekran 7, docs/ui/T-019 P6)
//
// ⚠⚠ UI PLANINDAN SAPMA RİSKİ (ölçülmüş, bağlayıcı plan değişikliğinin
// kaçınılmaz sonucu — RİSKLER'e taşındı): bu dosyanın ESKİ "Panel şu anda
// boş" davranışı `apps/admin/e2e/panel-flow.spec.ts`'in ÜÇ assertion'ı
// tarafından pinliydi (`getByText('Panel şu anda boş')`,
// `getByRole('heading', {level:2, name:'Panel şu anda boş'})`). docs/ui'nin
// P6 kararı ("YENİDEN TASARLANDI") bu davranışı DEĞİŞTİRİYOR — bu üç
// assertion KIRILACAK. `e2e/**`/`playwright.config.ts` bu alt görevin
// "DOKUNACAĞIN DOSYALAR" listesinde YOK (S11'in alanı) ve Playwright
// KOŞTURULMASI bu görevde YASAK — bu yüzden düzeltme burada YAPILAMIYOR,
// yalnızca İŞARETLENİYOR.
//
// `beforeLoad` artık SENKRON bir karar veriyor (ux P6 "Saklı adres VAR"):
// `stored-tenant-reference.ts`'in `read()`'i `localStorage`'tan bir slug
// döndürürse `redirect({to:'/kurulum/$slug'})` (ağ çağrısı YOK, yükleniyor
// durumu YAPISAL olarak yok, docs/ui). Yoksa "mağaza yok" + manuel adres
// girişi render edilir.
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type JSX, type SyntheticEvent } from 'react'

import { Button, Card, CardContent, Input } from '@arkesoft/ui'

import { EmptyState } from '../components/EmptyState.js'
import {
  createTenantSlugReferenceStore,
  resolveHomeRedirectTarget,
} from '../features/registration/stored-tenant-reference.js'
import { MESSAGES } from '../messages/messages.js'

export const Route = createFileRoute('/_app/')({
  beforeLoad: () => {
    const storedSlug = createTenantSlugReferenceStore(window.localStorage).read()
    const target = resolveHomeRedirectTarget(storedSlug)
    if (target.kind === 'redirect') {
      // `redirect()` KASITLI olarak bir `Response` döner (`Error` DEĞİL) —
      // `_app.tsx`'in guard'ının AYNI bağlayıcı API sözleşmesi.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: '/kurulum/$slug', params: { slug: target.slug } })
    }
  },
  component: DashboardPage,
})

function DashboardPage(): JSX.Element {
  const navigate = useNavigate()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [manualSlug, setManualSlug] = useState('')

  useEffect(() => {
    document.title = MESSAGES.meta.dashboardTitle
    headingRef.current?.focus()
  }, [])

  function handleManualAddressSubmit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault()
    const trimmedSlug = manualSlug.trim()
    if (trimmedSlug.length === 0) {
      return
    }
    // Format/yetki doğrulaması BURADA YAPILMAZ — `/kurulum/{slug}`'ın
    // kendisi dört ret modunu TEK bir mesaja indirger (docs/ui P6 notu).
    void navigate({ to: '/kurulum/$slug', params: { slug: trimmedSlug } })
  }

  return (
    <div className="flex flex-col gap-6 md:max-w-2xl lg:max-w-3xl xl:max-w-3xl">
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
      >
        {MESSAGES.dashboard.title}
      </h1>
      {/* ⚠ UI PLANINDAN SAPMA (ölçülmüş) — `EmptyState.tsx` bu alt görevin dosya
          listesinde YOK, bu yüzden `action` prop'u EKLENMEDİ (bkz. o dosyanın
          başı). "Mağaza oluştur" düğmesi burada `EmptyState`'in YANINDA, ayrı
          bir öğe olarak render edilir — AYNI görsel/işlevsel sonuç. */}
      <EmptyState
        heading={MESSAGES.dashboard.onboarding.noStoreTitle}
        body={MESSAGES.dashboard.onboarding.noStoreBody}
      />
      <div>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            void navigate({ to: '/magaza-olustur' })
          }}
        >
          {MESSAGES.dashboard.onboarding.createStoreButton}
        </Button>
      </div>
      <Card>
        <CardContent>
          <form onSubmit={handleManualAddressSubmit} noValidate className="flex flex-col gap-3">
            <p className="text-(length:--font-size-body) text-(--color-text-secondary)">
              {MESSAGES.dashboard.home.manualAddressPrompt}
            </p>
            <Input
              label={MESSAGES.dashboard.home.manualAddressLabel}
              value={manualSlug}
              onChange={(event) => {
                setManualSlug(event.target.value)
              }}
            />
            <div>
              <Button type="submit" variant="secondary">
                {MESSAGES.dashboard.home.manualAddressSubmit}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
