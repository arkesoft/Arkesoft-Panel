// @arkesoft/admin — OnboardingChecklistCard (ROADMAP v0.1.0, T-019/S10,
// docs/ui/T-019-kayit-ve-kiraci-olusturma.md P7, `/kurulum/{slug}`)
//
// Veri çeken KONTEYNER (CLAUDE.md §9) — `onboardingChecklist({slug})`
// `useQuery`'si (`TwoFactorStatusCard`/`ActiveSessionsCard` deseniyle AYNI).
// Dört durum: yükleniyor → `Skeleton`×5, kart içi hata (genel) → inline
// `role="alert"` + retry, boş → N/A (liste YAPISAL olarak her zaman 5
// madde döner, AC-19), normal → banner + liste.
//
// ⚠⚠ "Slug yok/erişim yok" (dört ret modundan biri, AYNI 404) `TENANT_
// NOT_FOUND` koduna eşlenir — BU dal genel `loadError`'dan AYRI: BAĞLAYICI
// TEK CÜMLE (`MESSAGES.dashboard.onboarding.slugNotFoundOrForbidden`)
// render edilir, liste HİÇ render EDİLMEZ (docs/ui P7). Aynı anda saklı
// slug referansı `clear()`'lanır (ux "Veri katmanı notları" madde 4 —
// saklı referans geçersiz → sessizce sıfırla).
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, type JSX } from 'react'

import { Button, Card, CardContent, Skeleton } from '@arkesoft/ui'

import { onboardingChecklistQueryOptions } from '../../api/registration-query.js'
import { normalizePanelError } from '../../errors/normalize-panel-error.js'
import { MESSAGES } from '../../messages/messages.js'
import {
  resolveOnboardingStepLabel,
  resolveOnboardingStepStatusLabel,
} from './checklist-step-label.js'
import { createTenantSlugReferenceStore } from './stored-tenant-reference.js'

export interface OnboardingChecklistCardProps {
  readonly slug: string
}

export function OnboardingChecklistCard({ slug }: OnboardingChecklistCardProps): JSX.Element {
  const navigate = useNavigate()
  const checklistQuery = useQuery(onboardingChecklistQueryOptions(slug))

  const panelError = checklistQuery.isError ? normalizePanelError(checklistQuery.error) : null
  const isSlugNotFoundOrForbidden =
    panelError !== null && panelError.kind === 'known' && panelError.code === 'TENANT_NOT_FOUND'

  useEffect(() => {
    if (isSlugNotFoundOrForbidden) {
      createTenantSlugReferenceStore(window.localStorage).clear()
    }
  }, [isSlugNotFoundOrForbidden])

  if (isSlugNotFoundOrForbidden) {
    return (
      <Card>
        <CardContent>
          <p role="alert" className="text-(length:--font-size-body) text-(--color-danger-600)">
            {MESSAGES.dashboard.onboarding.slugNotFoundOrForbidden}
          </p>
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigate({ to: '/magaza-olustur' })
              }}
            >
              {MESSAGES.dashboard.onboarding.createStoreButton}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent>
        <p className="text-(length:--font-size-body) text-(--color-text-secondary)">
          {MESSAGES.dashboard.onboarding.pendingBanner}
        </p>

        {checklistQuery.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : null}

        {checklistQuery.isError ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-(length:--font-size-body) text-(--color-danger-600)">
              {MESSAGES.dashboard.onboarding.loadError}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void checklistQuery.refetch()
              }}
            >
              {MESSAGES.errors.retryButton}
            </Button>
          </div>
        ) : null}

        {checklistQuery.isSuccess ? (
          <ul className="flex flex-col gap-3">
            {checklistQuery.data.steps.map((step) => (
              <li
                key={step.key}
                className="flex flex-col gap-1 border-b border-(--color-border-subtle) pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-(length:--font-size-body) text-(--color-text-primary)">
                    {resolveOnboardingStepLabel(step.key)}
                  </span>
                  <span className="text-(length:--font-size-small) text-(--color-text-secondary)">
                    {resolveOnboardingStepStatusLabel(step.status)}
                  </span>
                  {step.key === 'provisioning' ? (
                    <span className="font-(--font-weight-semibold) text-(length:--font-size-small) text-(--color-text-secondary)">
                      {MESSAGES.dashboard.onboarding.comingSoonBadge}
                    </span>
                  ) : null}
                </div>
                {step.key === 'provisioning' ? (
                  <p className="text-(length:--font-size-small) text-(--color-text-secondary)">
                    {MESSAGES.dashboard.onboarding.provisioningStepHelp}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}
