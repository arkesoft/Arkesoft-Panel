// @arkesoft/superadmin — ChallengeCountdown saf yardımcıları (ROADMAP
// v0.0.20, T-021/S8, `apps/admin/src/lib/challenge-countdown.ts`'in BİREBİR
// aynısı — WCAG 4.1.3 gürültü yasağı, cross-app import yasak olduğu için
// yerel kopya).
//
// Bileşenden AYRI, saf fonksiyonlar — `environment: 'node'` kararıyla
// DOM OLMADAN test edilebilsin diye.

/** `600` → `"10:00"`. Negatif girişte `"0:00"` döner (savunma — çağıran clamp eder). */
export function formatRemainingTime(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds)
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${minutes.toString()}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Saniyelik görsel güncelleme ekran okuyucuya SPAM yapmaz — yalnızca kalan
 * 60 saniyeye düştüğünde VE 0'a ulaştığında `role="status"` duyurulur,
 * aradaki her tik `aria-hidden` kalır.
 */
export function shouldAnnounceRemainingSeconds(secondsRemaining: number): boolean {
  return secondsRemaining === 60 || secondsRemaining === 0
}
