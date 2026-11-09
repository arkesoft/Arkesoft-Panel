// @arkesoft/admin — invalidateSessionIdentity testleri (ROADMAP v0.0.15,
// T-016 FIX turu 2/M-4 — bağlayıcı, VERİ KAYBI senaryosu).
//
// Gerçek `QueryClient` (DOM/React render GEREKMEZ, `vitest.config.ts`'in
// `environment: 'node'` kararıyla TUTARLI) — bu test `TwoFactorSetupWizard`/
// `TwoFactorStatusCard`/`_auth.sign-in.tsx`'in ÜÇÜNÜN DE çağırdığı TEK
// tazeleme noktasını DOĞRUDAN kanıtlar: eski sekme-başına `sessionStorage`
// deposu (`two-factor-status-store.ts`, SİLİNDİ) artık YOK — 2FA durumunun
// TEK doğruluk kaynağı `session.me`'dir ve bu fonksiyon onu invalidate eder.
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { invalidateSessionIdentity } from '../api/session-refresh.js'
import { sessionMeQueryKey } from '../api/session-query.js'

describe('invalidateSessionIdentity', () => {
  it('`session.me` sorgu anahtarını invalidate eder — GERÇEK `QueryClient` üzerinde', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(sessionMeQueryKey, {
      userId: 'usr_1',
      sessionId: 'ses_1',
      twoFactorEnabled: false,
    })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    invalidateSessionIdentity(queryClient)

    expect(invalidateSpy).toHaveBeenCalledTimes(1)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: sessionMeQueryKey })
  })

  it('invalidate edilen sorgu `stale` İŞARETLENİR — kart artık YEREL depo DEĞİL sunucu durumunu okur', () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(sessionMeQueryKey, {
      userId: 'usr_1',
      sessionId: 'ses_1',
      twoFactorEnabled: false,
    })

    invalidateSessionIdentity(queryClient)

    const state = queryClient.getQueryState(sessionMeQueryKey)
    expect(state?.isInvalidated).toBe(true)
  })

  // VACUITY KANITI (M-4 — bağlayıcı): `invalidateSessionIdentity`'nin İÇİNDEKİ
  // `queryClient.invalidateQueries(...)` çağrısı GERÇEKTEN kaldırılıp (bozulma
  // simülasyonu) yukarıdaki İKİ testin de KIRMIZI verdiği ELLE doğrulandı —
  // birinci test "expected invalidateQueries to have been called 1 times,
  // received 0" mesajıyla, ikinci test `isInvalidated` `false` kaldığı için
  // `expect(false).toBe(true)` ile KIRMIZI verdi; satır SONRA geri kondu
  // (handoff raporunda ham çıktı belgelendi).
})
