// @arkesoft/admin — onboarding kontrol listesi: adım → Türkçe metin eşlemesi
// (ROADMAP v0.1.0, T-019/S10, docs/ui/T-019-kayit-ve-kiraci-olusturma.md
// KARAR 2 — `checklist-step-label.ts`, emsal `device-label.ts`/T-017)
//
// SAF fonksiyonlar — `OnboardingChecklistCard.tsx` RENDER eder, karar
// BURADA verilir (.tsx'e SIZMAZ, KARAR 2'nin bağlayıcı şartı).
import { onboardingStepKeySchema } from '@arkesoft/trpc'
import type { OnboardingStepKey, OnboardingStepStatus } from '@arkesoft/trpc'

import { MESSAGES } from '../../messages/messages.js'

/**
 * `onboardingStepKeySchema`'nın KAPALI kümesi — `satisfies` DERLEME
 * zamanında tamlığı garanti eder (`device-label.ts`'in AYNI deseni).
 * docs/ux/T-019 "Beş kontrol listesi adımı" tablosundan BİREBİR alındı.
 */
const STEP_LABELS = {
  account: MESSAGES.dashboard.onboarding.stepAccountLabel,
  store_identity: MESSAGES.dashboard.onboarding.stepStoreIdentityLabel,
  site_type: MESSAGES.dashboard.onboarding.stepSiteTypeLabel,
  subscription: MESSAGES.dashboard.onboarding.stepSubscriptionLabel,
  provisioning: MESSAGES.dashboard.onboarding.stepProvisioningLabel,
} satisfies Record<OnboardingStepKey, string>

/**
 * `satisfies` DERLEME zamanında ZATEN tamlığı garanti eder; bu sayaçlar
 * ÇALIŞMA ZAMANI testinin BAĞIMSIZ kanıtıdır (`DEVICE_BROWSER_LABEL_KEY_COUNT`
 * deseni, `active-sessions-controller.ts`).
 */
export const ONBOARDING_STEP_LABEL_KEY_COUNT = Object.keys(STEP_LABELS).length
export const ONBOARDING_STEP_KEY_OPTION_COUNT = onboardingStepKeySchema.options.length

/** Bir onboarding adımının görünür madde metni (ör. "Hesabını oluşturdun"). */
export function resolveOnboardingStepLabel(key: OnboardingStepKey): string {
  return STEP_LABELS[key]
}

/**
 * Bir adımın görünür durum etiketi — ikon TEK BAŞINA anlam taşımaz
 * (wcag madde ⑥, docs/ui P7): her madde bu metni DE taşır.
 */
export function resolveOnboardingStepStatusLabel(status: OnboardingStepStatus): string {
  return status === 'done'
    ? MESSAGES.dashboard.onboarding.stepDoneLabel
    : MESSAGES.dashboard.onboarding.stepTodoLabel
}
