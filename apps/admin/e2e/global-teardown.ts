// @arkesoft/admin — Playwright `globalTeardown` (ROADMAP v0.0.19, T-020/S5,
// ADR-0022 Karar 1 (K1), "+ globalTeardown (idempotent önek süpürmesi)").
//
// Her spec dosyasının KENDİ `afterAll`'ı (`panel-flow.spec.ts`,
// `registration-flow.spec.ts`, `session-security-dialog-focus.qa.spec.ts`)
// kendi sızıntısını kapatır — bu dosya onların YERİNE GEÇMEZ, bir çökme/
// timeout yüzünden `afterAll`'ın HİÇ çalışmadığı durumlar için bir güvenlik
// ağıdır. `sweepOrphanedE2eFixtures`'ın kendisi idempotent (dosya başı
// notuna bkz. `fixtures/tenant-cleanup.ts`) — normal (hatasız) bir koşumda
// SIFIR satır bulur ve SIFIR silme yapar.
import { sweepOrphanedE2eFixtures } from './fixtures/tenant-cleanup.js'

export default function globalTeardown(): void {
  sweepOrphanedE2eFixtures()
}
