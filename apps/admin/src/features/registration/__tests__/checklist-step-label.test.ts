// @arkesoft/admin — checklist-step-label testleri (ROADMAP v0.1.0, T-019/S10).
import { describe, expect, it } from 'vitest'

import {
  ONBOARDING_STEP_KEY_OPTION_COUNT,
  ONBOARDING_STEP_LABEL_KEY_COUNT,
  resolveOnboardingStepLabel,
  resolveOnboardingStepStatusLabel,
} from '../checklist-step-label.js'

describe('resolveOnboardingStepLabel', () => {
  it('kapalı dünya: beş adımın HER biri için metin var, şema ile AYNI sayıda (elle çoğaltılmamış)', () => {
    expect(ONBOARDING_STEP_LABEL_KEY_COUNT).toBe(ONBOARDING_STEP_KEY_OPTION_COUNT)
    expect(ONBOARDING_STEP_LABEL_KEY_COUNT).toBe(5)
  })

  it('her adımın ux metniyle BİREBİR eşleştiğini pinler', () => {
    expect(resolveOnboardingStepLabel('account')).toBe('Hesabını oluşturdun')
    expect(resolveOnboardingStepLabel('store_identity')).toBe(
      'Mağazanın adını ve adresini belirledin',
    )
    expect(resolveOnboardingStepLabel('site_type')).toBe('Mağazanın türünü seçtin')
    expect(resolveOnboardingStepLabel('subscription')).toBe('Deneme aboneliğin başladı')
    expect(resolveOnboardingStepLabel('provisioning')).toBe('Siteni yayına al')
  })
})

describe('resolveOnboardingStepStatusLabel', () => {
  it('"done" → "Tamamlandı", "todo" → "Bekliyor" — ikon TEK BAŞINA değil, metin HER ZAMAN var', () => {
    expect(resolveOnboardingStepStatusLabel('done')).toBe('Tamamlandı')
    expect(resolveOnboardingStepStatusLabel('todo')).toBe('Bekliyor')
  })
})
