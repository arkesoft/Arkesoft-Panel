// @arkesoft/db — rollback hedefi doğrulama (SAF, yan etkisiz)
// (ROADMAP v0.0.20.2, T-023 FIX turu 2, M1 — `security`+`solid` İKİ GATE
// BAĞIMSIZ bulgusu: FAIL-OPEN GERİLEMESİ)
//
// DÜZELTME GEREKÇESİ: bu doğrulama mantığı ESKİDEN `rollback-roles.ts`'in
// İÇİNDE, `SQL_PATHS` nesnesine `in` operatörüyle üyelik sorarak yaşıyordu.
// İKİ bağımsız sorun vardı:
//   1. `in` operatörü PROTOTİP ZİNCİRİNİ de tarar — `toString`, `valueOf`,
//      `constructor`, `__proto__`, `hasOwnProperty`, `isPrototypeOf`,
//      `toLocaleString`, `propertyIsEnumerable`, `__defineGetter__` gibi
//      ON İKİ MİRAS anahtar da GEÇERLİ bir `RollbackTarget` SAYILIYORDU.
//      `argv` DIŞ VERİDİR (CLAUDE.md §4: "parse edilmemiş veriye tip
//      verilmez") — `spawnSync` bu değeri SESSİZCE dizeye zorlar (throw
//      ETMEZ, `security`'nin canlı ölçümü) ⇒ `prisma db execute --file
//      "function toString() { [native code] }"` koşardı ve operatör geri
//      almanın GERÇEKTEN yapılıp yapılmadığını hatadan ANLAYAMAZDI.
//      Değişiklik ÖNCESİ kod (`target === 'roles' || target === 'auth-role'`)
//      fail-CLOSED'dı — bu bir GERİLEMEYDİ, orkestratörün FIX turu 1'de
//      önerdiği "`target in SQL_PATHS` üçü ikiye indirir" taşımasından
//      doğdu.
//   2. Mantık `rollback-roles.ts`'in İÇİNDEYDİ ve o dosyanın SONU yan
//      etkili bir `main()` çağrısı taşır — `import` edildiği AN
//      `process.exit` tetiklenebilir, bu da `isRollbackTarget`'ı birim
//      testi için GÜVENSİZ kılardı. Çözüm `guard-policy.ts`/`env.ts` ile
//      AYNI desen: saf doğrulama mantığı AYRI, yan etkisiz bir modülde
//      yaşar; `rollback-roles.ts` (CLI kabuğu) buradan İTHAL eder.
//
// DÜZELTME: `Object.hasOwn(ROLLBACK_TARGETS, value)` — yalnızca nesnenin
// KENDİ (own), numaralandırılabilir anahtarlarını sorar, prototip
// zincirine HİÇ BAKMAZ. `toString`/`__proto__` → `false`, `roles` → `true`
// (`security`'nin canlı doğruladığı düzeltme).

/** Geri alma koşturucusunun (`rollback-roles.ts`) seçebileceği hedefler. */
export type RollbackTarget = 'roles' | 'auth-role' | 'audit-append-only'

/**
 * Geçerli hedeflerin TEK doğruluk kaynağı. `Record<RollbackTarget, true>`
 * olması, `RollbackTarget`e dördüncü bir üye eklenip bu nesne
 * GÜNCELLENMEZSE `tsc`'nin KIRMIZI vermesini sağlar — anahtar kümesi
 * `RollbackTarget` ile birebir eşleşmek ZORUNDADIR.
 */
const ROLLBACK_TARGETS: Readonly<Record<RollbackTarget, true>> = {
  roles: true,
  'auth-role': true,
  'audit-append-only': true,
}

/**
 * `value`'nun `ROLLBACK_TARGETS`'in (TEK doğruluk kaynağı) bir ÖZ (own)
 * anahtarı olduğunu daraltır. `Object.hasOwn` prototip zincirini
 * TARAMAZ — miras anahtarlar (`toString` vb.) her zaman `false` döner
 * (fail-closed).
 */
export function isRollbackTarget(value: string): value is RollbackTarget {
  return Object.hasOwn(ROLLBACK_TARGETS, value)
}
