// @arkesoft/db — `run-guarded-prisma.ts`'in import-güvenliği birim testi
// (ROADMAP v0.0.13, T-005 FIX turu 2, B1 — qa/solid Tur 2 [medium] BAĞIMSIZ
// bulgu)
//
// FIX turu 1'in kalbi olan rol/muafiyet kararı (eskiden bu dosyadaki
// `resolveDatabaseRole`/`requiresDestructiveTargetGuard`) FIX turu 2'de B2
// ile `guard-policy.ts`'in `COMMANDS` allowlist'ine TAŞINDI — o kararın
// birim testleri artık `guard-policy.test.ts`'te (`resolvePrismaCommand`'in
// `role`/`requiresTargetGuard` alanları üzerinden).
//
// Bu dosyanın KENDİ sorumluluğu: `main()` modül YÜKLENİRKEN koşulsuz
// çağrılıyordu, bu yüzden dosya bir TESTTEN import EDİLEMİYORDU — tek
// doğrulama yolu CI'nın gerçek `prepare-db` koşumuydu (tur 1'in kritik
// kusurunu gizleyen boşluğun AYNI SINIFI). Bu test dosyasının VAR OLMASI VE
// BAŞARIYLA koşması, bu modülün artık güvenle import edilebildiğinin
// kanıtıdır — eğer `main()` hâlâ koşulsuz çağrılıyor olsaydı, import anında
// `process.exit`/`fail()` tetiklenir ve bu test dosyası HİÇ ÇALIŞAMAZDI
// (ya argv boş komut reddiyle `process.exit(1)` ile çöker ya da env okuması
// patlardı).

import { describe, expect, it } from 'vitest'

import { isDirectlyExecuted } from '../run-guarded-prisma.js'

describe('run-guarded-prisma.ts — import güvenliği (B1)', () => {
  it('modül HATASIZ import edilebiliyor (main() tetiklenmedi — bu test dosyasının koşması bunun kanıtı)', () => {
    // Bu satıra ulaşılması zaten kanıt: `main()` koşulsuz çağrılsaydı
    // `process.argv.slice(2)` (vitest worker'ının argümanları) `resolvePrismaCommand`
    // tarafından reddedilir ve `fail()` → `process.exit(1)` ile süreç
    // SONLANIRDI — bu test dosyası (ve paketin TÜM diğer testleri) hiç
    // tamamlanamazdı. Assertion `:23`'teki import'un GERÇEKTEN gerçekleştiğini
    // ve modülün dışa açtığı yüzeyin beklenen şekilde olduğunu iddia eder —
    // sabit bir doğruluk önermesi (her iki yanı aynı literal) okuyucuya
    // hiçbir şey söylemezdi.
    expect(typeof isDirectlyExecuted).toBe('function')
  })

  it("isDirectlyExecuted() vitest worker'ı altında false döner (bu dosya Node'un doğrudan çalıştırdığı giriş noktası DEĞİL)", () => {
    expect(isDirectlyExecuted()).toBe(false)
  })
})
