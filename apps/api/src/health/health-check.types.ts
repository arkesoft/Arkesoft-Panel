// @arkesoft/api — sağlık kontrolü arayüzü (ROADMAP v0.0.4, T-002/ST-6,
// architect K-A8)
//
// `health.controller.ts` (çekirdek) BU ARAYÜZ üzerinden çalışır; hangi
// sağlayıcının (`database`/`redis`) hangi sınıf olduğunu BİLMEZ.
// SAĞLAYICIYA ÖZGÜ DALLANMA (`if (name === 'redis')` / `switch (name)`)
// YASAKTIR (CLAUDE.md §10.12, bu görevin kısıtı) — yeni bir kontrol
// (v0.0.11 `queue`) bu arayüzü implemente eden YENİ bir sınıf olarak
// `HEALTH_CHECKS` dizisine ADDITIVE eklenir, çekirdek değişmez.

/**
 * Tek bir bağımlılık kontrolü. `name` yalnızca `/health/ready` yanıtındaki
 * `checks` sözlüğünün ANAHTARINI üretmek için kullanılır — davranış seçimi
 * için değil.
 */
export interface HealthCheck {
  readonly name: 'database' | 'redis'
  check(): Promise<void>
}
