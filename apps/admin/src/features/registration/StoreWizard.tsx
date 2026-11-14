// @arkesoft/admin — StoreWizard (ROADMAP v0.1.0, T-019/S10,
// docs/ui/T-019-kayit-ve-kiraci-olusturma.md P3-P5, `/magaza-olustur`)
//
// İNCE React sarmalayıcı — TÜM karar mantığı `StoreWizardController`'da.
// `TwoFactorSetupWizard.tsx`'in AYNI deseni: `useState`'in LAZY başlangıç
// değeriyle controller'ı React'in render döngüsüne bağlar (`useRef` DEĞİL
// — `react-hooks/refs` kuralı). Sihirbaz AYNI `Card` İÇİNDE adım değişimi
// (Dialog DEĞİL, docs/ui'nin tercihi).
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState, type JSX } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button, Card, CardContent, Input } from '@arkesoft/ui'

import { checkSlugAvailability, createTenant } from '../../api/registration-query.js'
import {
  MESSAGES,
  resolvePanelErrorMessage,
  resolveRegistrationFieldErrorMessage,
} from '../../messages/messages.js'
import { buildSlugPreviewAddress, resolveSlugLiveStatusMessage } from './slug-outcome-message.js'
import { createTenantSlugReferenceStore } from './stored-tenant-reference.js'
import {
  StoreWizardController,
  type StoreWizardState,
  INITIAL_STORE_WIZARD_STATE,
} from './store-wizard-controller.js'
import { SiteTypeFieldset } from './SiteTypeFieldset.js'

const storeNameFormSchema = z.object({ storeName: z.string().trim().min(1) })
type StoreNameFormValues = z.infer<typeof storeNameFormSchema>

/** `slugCheckStatus`'un görünür canlı metninin rengi — salt GÖRSEL bir sınıf seçimi (wcag madde ⑤: metin HER ZAMAN ayrıca yazılır, renk tek başına anlam taşımaz). */
function resolveSlugStatusTextColorClassName(
  status: StoreWizardState['slugCheckStatus'],
  hasTransportError: boolean,
): string {
  if (hasTransportError) {
    return 'text-(--color-danger-600)'
  }
  if (status === 'available') {
    return 'text-(--color-success-600)'
  }
  if (
    status === 'taken' ||
    status === 'reserved' ||
    status === 'invalidFormat' ||
    status === 'unreachable'
  ) {
    return 'text-(--color-danger-600)'
  }
  return 'text-(--color-text-secondary)'
}

function resolveStepProgressLabel(step: StoreWizardState['step']): string {
  const stepNumber = step === 'storeName' ? '1' : step === 'slug' ? '2' : '3'
  return MESSAGES.registration.stepProgressLabel
    .replace('{adim}', stepNumber)
    .replace('{toplam}', '3')
}

export function StoreWizard(): JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const headingRef = useRef<HTMLHeadingElement>(null)

  const [state, setState] = useState<StoreWizardState>(INITIAL_STORE_WIZARD_STATE)
  const [controller] = useState(
    () =>
      new StoreWizardController(
        { checkSlugAvailability, createTenant },
        resolveRegistrationFieldErrorMessage,
        resolvePanelErrorMessage,
        setState,
      ),
  )

  useEffect(() => {
    document.title = MESSAGES.meta.storeWizardTitle
  }, [])

  useEffect(() => {
    headingRef.current?.focus()
  }, [state.step])

  // Bekleyen debounce zamanlayıcısını unmount'ta iptal eder (`StoreWizardController.dispose`).
  useEffect(() => {
    return () => {
      controller.dispose()
    }
  }, [controller])

  const storeNameForm = useForm<StoreNameFormValues>({
    resolver: zodResolver(storeNameFormSchema),
    defaultValues: { storeName: '' },
  })

  /** `/`'in `beforeLoad`'ının okuyacağı saklı referans — `createTenant` başarısı. */
  function handleCreated(slug: string): void {
    createTenantSlugReferenceStore(window.localStorage).write(slug)
    void navigate({ to: '/kurulum/$slug', params: { slug } })
  }

  /** 401 — mevcut `treatAsSignedOut` deseninin (`_app.tsx:140-151`) ÜÇÜNCÜ çağrı yeri (docs/ui RİSKLER #6, terfi ZORUNLU KILINMADI). */
  function handleUnauthenticated(): void {
    queryClient.clear()
    void navigate({ to: '/sign-in' })
  }

  async function handleSubmit(): Promise<void> {
    const outcome = await controller.submit(MESSAGES.registration.siteType.required)
    if (outcome.kind === 'created') {
      handleCreated(outcome.slug)
      return
    }
    if (outcome.kind === 'unauthenticated') {
      handleUnauthenticated()
    }
  }

  const onSubmitStoreName = storeNameForm.handleSubmit((values) => {
    controller.goToSlugStep(values.storeName)
  })

  const progressLabel = resolveStepProgressLabel(state.step)

  return (
    <div className="flex w-full flex-col gap-6 md:max-w-2xl lg:max-w-3xl xl:max-w-3xl">
      <Card>
        <CardContent>
          {state.step === 'storeName' ? (
            <form
              onSubmit={(event) => {
                void onSubmitStoreName(event)
              }}
              noValidate
              className="flex flex-col gap-4"
            >
              <p className="text-(length:--font-size-small) text-(--color-text-secondary)">
                {progressLabel}
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
              >
                {MESSAGES.registration.storeName.stepLabel}
              </h1>
              <Input
                label={MESSAGES.registration.storeName.inputLabel}
                {...(storeNameForm.formState.errors.storeName !== undefined
                  ? { error: MESSAGES.registration.storeName.required }
                  : {})}
                {...storeNameForm.register('storeName')}
              />
              <div>
                <Button type="submit" variant="primary">
                  {MESSAGES.registration.storeName.next}
                </Button>
              </div>
            </form>
          ) : null}

          {state.step === 'slug' ? (
            <div className="flex flex-col gap-4">
              <p className="text-(length:--font-size-small) text-(--color-text-secondary)">
                {progressLabel}
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
              >
                {MESSAGES.registration.slug.stepLabel}
              </h1>
              <Input
                label={MESSAGES.registration.slug.inputLabel}
                autoComplete="off"
                spellCheck={false}
                value={state.slug}
                {...(state.slugFieldErrorMessage !== null
                  ? { error: state.slugFieldErrorMessage }
                  : {})}
                onChange={(event) => {
                  controller.setSlug(event.target.value)
                }}
              />
              {(() => {
                const liveMessage =
                  state.slugCheckErrorMessage ?? resolveSlugLiveStatusMessage(state.slugCheckStatus)
                if (liveMessage === null) {
                  return null
                }
                return (
                  <p
                    role="status"
                    aria-live="polite"
                    className={`text-(length:--font-size-small) ${resolveSlugStatusTextColorClassName(state.slugCheckStatus, state.slugCheckErrorMessage !== null)}`}
                  >
                    {state.slugCheckStatus === 'available' ? (
                      <span aria-hidden="true">✓ </span>
                    ) : null}
                    {liveMessage}
                  </p>
                )
              })()}
              <p className="text-(length:--font-size-small) text-(--color-text-secondary)">
                {MESSAGES.registration.slug.help.replace(
                  '{önizleme}',
                  buildSlugPreviewAddress(state.slug),
                )}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    controller.goBackToStoreNameStep()
                  }}
                >
                  {MESSAGES.registration.slug.back}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={state.slugCheckStatus !== 'available'}
                  onClick={() => {
                    controller.goToSiteTypeStep()
                  }}
                >
                  {MESSAGES.registration.slug.next}
                </Button>
              </div>
            </div>
          ) : null}

          {state.step === 'siteType' ? (
            <div className="flex flex-col gap-4">
              <p className="text-(length:--font-size-small) text-(--color-text-secondary)">
                {progressLabel}
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="text-(length:--font-size-h1) font-(--font-weight-semibold) text-(--color-text-primary)"
              >
                {MESSAGES.registration.siteType.stepLabel}
              </h1>
              <SiteTypeFieldset
                legend={MESSAGES.registration.siteType.legend}
                ecommerceLabel={MESSAGES.registration.siteType.ecommerceLabel}
                corporateLabel={MESSAGES.registration.siteType.corporateLabel}
                value={state.siteType}
                onChange={(siteType) => {
                  controller.selectSiteType(siteType)
                }}
                {...(state.siteTypeErrorMessage !== null
                  ? { errorMessage: state.siteTypeErrorMessage }
                  : {})}
              />
              {state.submitErrorMessage !== null ? (
                <div
                  role="alert"
                  className="flex flex-col gap-1 rounded-(--radius-control) bg-(--color-danger-surface) p-3 text-(length:--font-size-small) text-(--color-danger-600)"
                >
                  <p>{state.submitErrorMessage}</p>
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={state.isSubmitting}
                  onClick={() => {
                    controller.goBackToSlugStep()
                  }}
                >
                  {MESSAGES.registration.siteType.back}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  isLoading={state.isSubmitting}
                  onClick={() => {
                    void handleSubmit()
                  }}
                >
                  {state.isSubmitting
                    ? MESSAGES.registration.siteType.submitting
                    : MESSAGES.registration.siteType.submit}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
