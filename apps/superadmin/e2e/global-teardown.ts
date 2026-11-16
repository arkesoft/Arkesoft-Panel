// @arkesoft/superadmin — Playwright `globalTeardown` (ROADMAP v0.0.20,
// T-021/S10, `apps/admin/e2e/global-teardown.ts`'in AYNI deseni).
//
// Her spec dosyasının KENDİ `test.afterAll`'ı kendi sızıntısını kapatır — bu
// dosya onların YERİNE GEÇMEZ, bir çökme/timeout yüzünden `afterAll`'ın HİÇ
// çalışmadığı durumlar için bir güvenlik ağıdır. `sweepOrphanedSuperadminE2eFixtures`
// idempotent (dosya başı notuna bkz.) — normal (hatasız) bir koşumda SIFIR
// satır bulur ve SIFIR silme yapar.
import { sweepOrphanedSuperadminE2eFixtures } from './fixtures/platform-admin.js'

export default function globalTeardown(): void {
  sweepOrphanedSuperadminE2eFixtures()
}
