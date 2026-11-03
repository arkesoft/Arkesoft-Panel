// @arkesoft/api — backoff SAF fonksiyonu (ROADMAP v0.0.11, T-013/S5,
// architect K6) — AC7'nin ölçtüğü dosya
//
// NEDEN HAZIR `{ type: 'exponential' }` DEĞİL (K6, bağlayıcı): hazır strateji
// seçilseydi AC7'nin pinlediği dizi BİZİM AYNALAMAMIZ olurdu — BullMQ'nun iç
// formülünü (`delay * 2^(n-1)`) VARSAYMAK zorunda kalırdık (A-A4 architect
// tarafından ölçülemedi, S1 yalnızca TİP TANIMINDAN okudu). Özel strateji
// (`Worker.settings.backoffStrategy` + iş seçeneğinde `backoff: { type:
// CUSTOM_BACKOFF_TYPE }`) ile AC7 ÜRETİMDE FİİLEN KOŞAN kod yolunu pinler.
//
// ⚠ BONUS — A-PM1 TAMAMEN GEÇERSİZLEŞİR: gecikme bir DI PROFİLİYLE enjekte
// edilir (env DEĞİL, fake timer DEĞİL). BullMQ'nun gecikmeli iş zamanlaması
// Redis tarafındadır (delayed set + zaman damgası skoru) ve vitest fake
// timer'ları Redis'in saatini ilerletmez; biz HİÇ ZAMAN İLERLETMİYORUZ →
// "fake timer backoff'u ilerletir mi?" sorusu hiç sorulmaz.
//
// ⚠ `settings.backoffStrategy` gecikmenin DEĞERİNİ enjekte eder, SAATİ
// DEĞİL. Entegrasyon testi (AC6, T-013/S6) `{ baseDelayMs: 25 }` gibi kısa
// bir PROFİL verir — bu eşik DÜŞÜRMEK DEĞİLDİR (CLAUDE.md §10 md 6): AC6'nın
// ölçtüğü şey DENEME SAYISI ve TERMİNAL KONUM; üretim gecikmesi AC7'de
// AYRICA ve bağımsız olarak pinlidir.
//
// SAF: I/O yok, `Date.now()` yok, modül durumu yok. bullmq'dan YALNIZCA TİP
// import edilir (`import type`) — çalışma zamanında bu dosya bullmq'ya
// dokunmaz, dolayısıyla AC7 testi Redis'siz koşar.

import type { BackoffStrategy } from 'bullmq'

import { BACKOFF_BASE_DELAY_MS } from './queue-constants.js'

/**
 * Backoff'un ENJEKTE EDİLEBİLİR tek parametresi. Nesne (düz sayı değil):
 * ileride `ceilingMs`/`jitter` eklenirse çağıran imzası değişmez.
 */
export type BackoffProfile = {
  /** İlk yeniden denemeden önceki gecikme (ms); sonrakiler ikiye katlanır. */
  readonly baseDelayMs: number
}

/**
 * ⚠ ÜRETİM PROFİLİ — AC7 bunu pinler. `BACKOFF_BASE_DELAY_MS`'i düşüren bir
 * değişiklik `backoff.test.ts`'i KIRAR (ölçüldü: S5 mutasyon M1).
 */
export const PRODUCTION_BACKOFF_PROFILE: BackoffProfile = {
  baseDelayMs: BACKOFF_BASE_DELAY_MS,
}

/**
 * `attemptsMade` kadar deneme yapılmış bir iş için SONRAKİ denemeye kadar
 * beklenecek süre (ms). Üstel: `baseDelayMs * 2^(attemptsMade - 1)`.
 *
 * BullMQ sözleşmesi: strateji BAŞARISIZLIKTAN SONRA çağrılır, yani ilk
 * başarısızlıkta `attemptsMade === 1`.
 *
 * `attemptsMade <= 1` (ve `trunc` ile kesirli/negatif girdi) için üs 0'a
 * SABİTLENİR → `baseDelayMs`. Bilerek FIRLATMIYOR: bu fonksiyon worker'ın
 * hata yolunda koşar; orada fırlatmak başarısız bir işin yeniden
 * denenmesini TAMAMEN engeller (hatayı hata ile cezalandırmak). Alt sınır
 * güvenli ve gözlemlenebilir bir davranıştır.
 */
export function computeBackoffDelayMs(attemptsMade: number, profile: BackoffProfile): number {
  const exponent = Math.max(0, Math.trunc(attemptsMade) - 1)
  return profile.baseDelayMs * 2 ** exponent
}

/**
 * `attempts` toplam denemeli bir işin TÜM gecikme dizisi — `attempts - 1`
 * elemanlı (son denemeden sonra yeniden deneme YOKTUR, iş DLQ'ya gider).
 *
 * ⚠ AC7'nin asıl pini bu fonksiyon üzerinden kurulur: dizi hem
 * `BACKOFF_BASE_DELAY_MS`'i hem `JOB_ATTEMPTS`'i AYNI assert'te zorlar.
 */
export function buildBackoffDelaySequence(
  attempts: number,
  profile: BackoffProfile,
): readonly number[] {
  const retryCount = Math.max(0, Math.trunc(attempts) - 1)

  return Array.from({ length: retryCount }, (_unused, index) =>
    computeBackoffDelayMs(index + 1, profile),
  )
}

/**
 * Profili BullMQ'nun `Worker.settings.backoffStrategy` yüzeyine bağlar.
 *
 * Dönüş tipi BİLEREK bullmq'nun `BackoffStrategy`'si: imza uyumu DERLEME
 * ZAMANINDA kanıtlanır. bullmq bir gün imzayı değiştirirse `pnpm typecheck`
 * KIRILIR — "çağrılmıyor ama kimse fark etmiyor" moduna düşmeyiz (A-A4'ün
 * tip düzeyindeki kalıcı kapısı).
 *
 * ⚠ T-013/S6: worker `settings: { backoffStrategy: createBackoffStrategy(
 * PRODUCTION_BACKOFF_PROFILE) }` verir. İkinci bir formül YAZMAZ.
 */
export function createBackoffStrategy(profile: BackoffProfile): BackoffStrategy {
  return (attemptsMade: number): number => computeBackoffDelayMs(attemptsMade, profile)
}
