// @arkesoft/api — health kontrol DI token'ı (ROADMAP v0.0.4, T-002/ST-6,
// architect K-A8)
//
// `HEALTH_CHECKS`: ÇOKLU provider dizisi (`HealthCheck[]`) — çekirdek
// (`health.controller.ts`) sağlayıcı SAYISINI/ADINI bilmez, yalnızca diziyi
// `Promise.allSettled` ile paralel çalıştırır. v0.0.11 `queue` kontrolünü bu
// diziye ADDITIVE ekler (yeni bir `HealthCheck` implementasyonu +
// `health.module.ts`'teki `useFactory`'nin `inject` dizisine üçüncü
// parametre — mevcut ikisi KIRILMAZ).

/** `/health/ready`'nin okuduğu `HealthCheck[]` dizisini sağlayan provider'ın token'ı. */
export const HEALTH_CHECKS = Symbol('HEALTH_CHECKS')
