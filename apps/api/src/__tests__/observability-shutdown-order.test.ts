// @arkesoft/api — birim testi: `ObservabilityShutdownService`'in kapanış
// SIRASI (ROADMAP v0.0.17, T-028/S6, architect K-A28-3)
//
// ⚠⚠ Bu dosya `../observability/instrumentation.js` ve `../observability/
// sentry.js`'i `vi.mock` ile SAHTELER — gerçek `@opentelemetry/sdk-node`/
// `@sentry/node` HİÇ YÜKLENMEZ (yapısal import sınırlaması, K-A1/K-A28-2'nin
// deseni: `@sentry/node` yalnızca `sentry.ts`'ten import edilir; bu dosya
// onu BİLE DOLAYLI OLARAK import ETMEZ, çünkü `vi.mock` gerçek modülün
// YÜKLENMESİNİ engeller). `ObservabilityShutdownService`'in KENDİ mantığı —
// "OTel ÖNCE, Sentry SONRA" sırası — bu İKİ işbirlikçisinden İZOLE test
// edilir (klasik birim testi ayrımı).
//
// ⚠ Bu depoda `vi.mock` kullanımı BAŞKA hiçbir test dosyasında YOK (DI
// tabanlı sahteleme tercih ediliyor) — ama `ObservabilityShutdownService`
// `sentry.ts`'in YAPISAL import sınırlamasına (K-A28-2, "yalnızca
// `sentry.ts`'ten import edilir") uyduğu için DI token'ı YOK; sıranın
// `vi.mock` DIŞINDA izole edilebilecek bir yolu bulunmuyor.

import { afterEach, describe, expect, it, vi } from 'vitest'

const callOrder: string[] = []

// ⚠⚠⚠ DÜZELTME TURU 1/3 (backend BULGU 5, medium) — `callOrder` YALNIZCA
// ÇAĞRI BAŞLANGICINI kaydeder; ÖNCEKİ hâlde her iki sahte fonksiyon da
// ANINDA çözülen (`Promise.resolve()`) bir söz döndürüyordu, bu yüzden
// `callOrder` sırası "senkron ÇAĞRI sırası" İLE "TAMAMLANMA sırası"
// ARASINDAKİ farkı HİÇ AYIRT EDEMİYORDU — üretim kodu
// `Promise.all([shutdownObservability(), shutdownSentry()])` veya `void
// shutdownObservability(); await shutdownSentry()` olarak DEĞİŞSE BİLE
// `callOrder` YİNE `['otel', 'sentry']` üretirdi (ikisi de SENKRON olarak,
// sırayla ÇAĞRILIR — hangisinin ÖNCE TAMAMLANDIĞI başka bir konu) ⇒ test
// K-A28-3'ün bağlayıcı garantisini ("OTel TAMAMLANMADAN Sentry flush
// BAŞLAMAZ") ÖLÇMÜYORDU, sadece "hangisi önce ÇAĞRILDI"yı ölçüyordu.
//
// ⇒ `shutdownObservability`'nin sahte sürümü artık ERTELENMİŞ bir promise
// döner (`deferredOtelShutdown`, dışarıdan `resolve` edilene kadar
// BEKLEMEDE kalır). Aşağıdaki test, `shutdownSentry`'nin bu promise HENÜZ
// ÇÖZÜLMEDEN ÇAĞRILMADIĞINI doğrular — `Promise.all`/erken-başlatma
// mutasyonları bu BEKLEME penceresinde `shutdownSentry`'yi ÇAĞIRIR (deferred
// promise'in çözülüp çözülmediğine bakmadan), bu yüzden bu pin GERÇEKTEN
// kırılır (aşağıdaki "her iki kapanış fonksiyonu..." testiyle AYNI mock'u
// PAYLAŞMAZ — `beforeEach` benzeri bir sıfırlama gerektirmeyecek şekilde
// HER `it` kendi deferred'ını KURAR).
let deferredOtelShutdownResolve: (() => void) | undefined

vi.mock('../observability/instrumentation.js', () => ({
  shutdownObservability: vi.fn(() => {
    callOrder.push('otel')
    return new Promise<void>((resolve) => {
      deferredOtelShutdownResolve = resolve
    })
  }),
}))

vi.mock('../observability/sentry.js', () => ({
  shutdownSentry: vi.fn(() => {
    callOrder.push('sentry')
    return Promise.resolve()
  }),
}))

describe('ObservabilityShutdownService — K-A28-3 kapanış sırası (OTel ÖNCE, Sentry SONRA)', () => {
  afterEach(() => {
    callOrder.length = 0
    deferredOtelShutdownResolve = undefined
    vi.clearAllMocks()
  })

  it("onApplicationShutdown: shutdownSentry() shutdownObservability()'nin ERTELENMİŞ promise'i ÇÖZÜLMEDEN ÇAĞRILMAZ — ÇÖZÜLÜNCE çağrılır (TAMAMLANMA sırası, çağrı sırası DEĞİL)", async () => {
    const { ObservabilityShutdownService } =
      await import('../observability/observability-shutdown.service.js')
    const sentryModule = await import('../observability/sentry.js')
    const service = new ObservabilityShutdownService()

    const shutdownPromise = service.onApplicationShutdown()

    // ⚠⚠⚠ ASIL PİN — `shutdownObservability()`'nin döndürdüğü promise HENÜZ
    // ÇÖZÜLMEDİ (`deferredOtelShutdownResolve` henüz ÇAĞRILMADI). Üretim kodu
    // `await shutdownObservability()`'yi GERÇEKTEN BEKLİYORSA, bu noktada
    // `shutdownSentry()` HENÜZ ÇAĞRILMAMIŞ olmalıdır. `Promise.all([...])`
    // veya `void shutdownObservability(); await shutdownSentry()` gibi bir
    // mutasyon bu noktada `shutdownSentry`'yi ZATEN ÇAĞIRMIŞ olurdu —
    // `callOrder`'ın (senkron çağrı sırası) AKSİNE bu assert o mutasyonu
    // GERÇEKTEN kırar (aşağıdaki mutasyon kanıtı handoff'ta raporlanır).
    await Promise.resolve() // mikro görev turunu bırak — senkron kuyruk boşalsın
    expect(sentryModule.shutdownSentry).not.toHaveBeenCalled()

    if (deferredOtelShutdownResolve === undefined) {
      throw new Error('deferredOtelShutdownResolve kurulmadı — mock çağrılmadı')
    }
    deferredOtelShutdownResolve()

    await shutdownPromise

    expect(sentryModule.shutdownSentry).toHaveBeenCalledTimes(1)
    expect(callOrder).toEqual(['otel', 'sentry'])
  })

  it('her iki kapanış fonksiyonu da TAM OLARAK bir kez çağrılır', async () => {
    const instrumentationModule = await import('../observability/instrumentation.js')
    const sentryModule = await import('../observability/sentry.js')
    const { ObservabilityShutdownService } =
      await import('../observability/observability-shutdown.service.js')
    const service = new ObservabilityShutdownService()

    const shutdownPromise = service.onApplicationShutdown()
    if (deferredOtelShutdownResolve === undefined) {
      throw new Error('deferredOtelShutdownResolve kurulmadı — mock çağrılmadı')
    }
    deferredOtelShutdownResolve()
    await shutdownPromise

    expect(instrumentationModule.shutdownObservability).toHaveBeenCalledTimes(1)
    expect(sentryModule.shutdownSentry).toHaveBeenCalledTimes(1)
  })
})
