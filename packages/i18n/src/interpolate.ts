// @arkesoft/i18n — ara-değerleme (interpolation) (ROADMAP v0.0.18, T-027/S5a)
//
// Disiplin emsali: `apps/api/src/auth/mail/messages.ts`'in AC11 kuralı
// (`requireVariable` — eksik değişken SESSİZCE boş içerik üretmez, throw
// eder). Bu fonksiyon AYNI disiplini İKİ YÖNLÜ uygular: eksik değişken
// FIRLATIR, FAZLA (şablonda hiç geçmeyen) değişken DE FIRLATIR — tek
// yönlü değil, çağıranın yanlışlıkla kullanılmayan bir değişken geçmesi de
// (ör. yeniden adlandırılmış bir yer tutucu) sessizce yutulmaz.
//
// ⚠ DÜRÜST KAYIT (saklanmayacak): bu sürümün 35 anahtarının HİÇBİRİ
// `{değişken}` yer tutucusu TAŞIMIYOR ⇒ bu fonksiyonun bugün ÜRETİM
// TÜKETİCİSİ YOK, testleri TAMAMEN sentetik fixture'dır. İlk gerçek
// tüketici `ACCOUNT_TEMPORARILY_LOCKED`'ın GERÇEK `Retry-After`'dan
// hesaplanan `{dakika}` varyantıdır (`apps/admin/src/messages/messages.ts`,
// `formatAccountTemporarilyLockedMessage`) — o fonksiyon METNİ bu pakete
// TAŞIMAZ (metni taşımak `qa`'nın pinli e2e'sini kırar,
// `qa-blind-spot-and-negative-scenarios.qa.spec.ts:332,358`), `apps/admin`'de
// KALIR.

const PLACEHOLDER_PATTERN = /\{([a-zA-Z0-9_]+)\}/g

/**
 * `template` içindeki `{değişken}` yer tutucularını `variables`'tan gelen
 * değerlerle değiştirir.
 *
 * - `template`'te geçen ama `variables`'ta OLMAYAN bir yer tutucu varsa FIRLAR.
 * - `variables`'ta geçen ama `template`'te hiç KULLANILMAYAN bir anahtar
 *   varsa DA FIRLAR (iki yönlü fail-closed).
 * - Hiçbir koşulda sessizce boş/eksik dize ÜRETMEZ.
 */
export function formatMessage(
  template: string,
  variables: Readonly<Record<string, string>>,
): string {
  const placeholders = new Set<string>()

  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1]
    if (name !== undefined) {
      placeholders.add(name)
    }
  }

  const variableNames = Object.keys(variables)

  const missing = [...placeholders].filter((name) => !variableNames.includes(name))
  if (missing.length > 0) {
    throw new Error(`eksik ara-değerleme değişkeni: ${missing.join(', ')}`)
  }

  const extra = variableNames.filter((name) => !placeholders.has(name))
  if (extra.length > 0) {
    throw new Error(`kullanılmayan ara-değerleme değişkeni: ${extra.join(', ')}`)
  }

  return template.replace(PLACEHOLDER_PATTERN, (_fullMatch, name: string) => {
    const value = variables[name]
    if (value === undefined) {
      throw new Error(`eksik ara-değerleme değişkeni: ${name}`)
    }
    return value
  })
}
