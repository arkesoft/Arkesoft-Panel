// scripts/playwright/totp.ts — test-only RFC 6238 (TOTP) kod üretici
// (ROADMAP v0.0.20, T-021/S9, R-A4).
//
// NEDEN İKİNCİ BİR İMPLEMENTASYON VAR (CLAUDE.md §3 — "apps/superadmin/e2e
// apps/api'den import EDEMEZ" sınırı + S1'in ÖLÇÜMÜ, bağlayıcı):
// Üretimde AYNI algoritmanın BİR implementasyonu zaten var:
// `apps/api/src/auth/two-factor/totp-code-generator.port.ts`. Bu dosyanın
// AYNISINI e2e katmanı İTHAL EDEMEZ — `apps/superadmin/e2e` (ve `apps/admin/
// e2e`, `apps/storefront/e2e`) tasarım gereği `apps/api`'ye bağımlı DEĞİL
// (mimari sınır, CLAUDE.md §3: `apps/*` → `packages/*` yönü dışında
// uygulamalar birbirini İTHAL ETMEZ). `apps/api`'yi bir e2e fixture'ından
// import etmek ya (a) `apps/superadmin/e2e`'nin `package.json`'ına
// `@arkesoft/api`'yi bağımlılık yapar (Nest/Prisma'nın TÜMÜNÜ e2e sürecine
// çeker — ADR-0022 Karar 1'in "e2e katmanında Prisma YOK" sınırını ihlal
// eder) ya da (b) kaynak dosyayı paket dışına göreli yolla ithal eder (aynı
// mimari ihlalin başka biçimi). Bu yüzden S1'in ölçtüğü R-A4 dalı
// (`enable` → GERÇEK TOTP üret → `verify-totp`, ve HER `sign-in` sonrası
// TEKRAR `verify-totp`) için e2e katmanının KENDİ, bağımsız bir RFC 6238
// üreticisine ihtiyacı var.
//
// ⚠ SAPMA RİSKİ (KAYITLI BORÇ — aşağıdaki not): bu dosya
// `totp-code-generator.port.ts` ile AYNI algoritmayı BAĞIMSIZ olarak uygular.
// Üretim tarafı bir gün algoritmayı değiştirirse (ör. Better Auth'un
// `totpOptions`'ı farklı bir `digits`/`period`/hash'e geçerse) bu dosya
// SESSİZCE ESKİR ve e2e testleri YANLIŞLIKLA YEŞİL kalabilir (üretim artık
// farklı kod beklerken bu dosya eski algoritmayla "geçerli" bir kod üretmeye
// devam eder, ta ki gerçek bir `/two-factor/verify-totp` çağrısı 401/403
// alana kadar — yani sapma İLK ÖNCE e2e'nin KIRMIZI olmasıyla fark edilir,
// sessiz bir yanlış-yeşil DEĞİL). Borç kaydı:
//   SEV: low · dosya: scripts/playwright/totp.ts (bu dosya) ·
//   sorumlu: devops · vade: `totp-code-generator.port.ts`'in
//   `digits`/`period`/hash algoritması DEĞİŞTİĞİ sürüm (o değişikliği yapan
//   ajan bu dosyayı da güncellemeli — ikisi arasında mekanik bir eşitlik
//   kapısı YOK, bu YAZILI bir hatırlatmadır).
//
// NEDEN YENİ BAĞIMLILIK YOK: yalnızca `node:crypto` (HMAC-SHA1, Node'un
// yerleşik modülü) + `zod` (zaten kök bağımlılık, girdi/çıktı doğrulaması
// için). RFC 6238 (TOTP) RFC 4226 (HOTP) üzerine inşa edilir; algoritmanın
// KENDİSİ `totp-code-generator.port.ts`'in dosya başı yorumunda belgelenen
// adımların AYNISIDIR (Base32 decode → 8 bayt big-endian sayaç → HMAC-SHA1 →
// dinamik kısaltma → `% 10^digits`) — BAĞIMSIZ yazıldı, import EDİLMEDİ.
//
// DOĞRULUK KANITI: bu modülün ürettiği kodlar RFC 6238 Ek B'nin standart
// SHA-1 test vektörleriyle (ASCII sır "12345678901234567890", 8 hane)
// doğrulandı — rapor paketinde ham çıktı var. `apps/api`'nin üreticisi
// İTHAL EDİLMEDEN, ikisinin de AYNI RFC'ye uyduğu test vektörleri üzerinden
// ÖLÇÜLDÜ (CLAUDE.md §3'ün "apps/api import etme" sınırına UYUYOR).
import { createHmac } from 'node:crypto'
import { z } from 'zod'

/** RFC 4648 §6 Base32 alfabesi — büyük/küçük harf DUYARLI değil (girdi normalize edilir). */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** `BASE32_ALPHABET`'teki her karakterin 5-bit değeri. */
const BASE32_DECODE_MAP: ReadonlyMap<string, number> = new Map(
  BASE32_ALPHABET.split('').map((char, index) => [char, index]),
)

export class InvalidBase32SecretError extends Error {
  constructor(invalidChar: string) {
    super(`totp (test-only): geçersiz Base32 karakteri: ${invalidChar}`)
    this.name = 'InvalidBase32SecretError'
  }
}

/**
 * Bir Base32 (RFC 4648, dolgusuz) dizeyi ham baytlara çevirir. Boşluk/tire
 * temizliği ve büyük harfe çevirme UYGULANIR (manuel anahtar girişinin
 * hijyeni — gerçek bir kimlik doğrulayıcı uygulamasının yaptığı budur);
 * `=` dolgu karakteri (varsa) yok sayılır.
 */
export function decodeBase32(input: string): Uint8Array {
  const normalized = input.toUpperCase().replaceAll(/[\s-]/g, '').replaceAll('=', '')

  const bytes: number[] = []
  let buffer = 0
  let bitsCollected = 0

  for (const char of normalized) {
    const value = BASE32_DECODE_MAP.get(char)
    if (value === undefined) {
      throw new InvalidBase32SecretError(char)
    }
    buffer = (buffer << 5) | value
    bitsCollected += 5
    if (bitsCollected >= 8) {
      bitsCollected -= 8
      bytes.push((buffer >> bitsCollected) & 0xff)
    }
  }

  return Uint8Array.from(bytes)
}

/** Base32 kodlar (RFC 4648, dolgusuz) — e2e fixture'larının sırrı KULLANICIYA
 * TESLİM EDİLEN biçimde (`totpURI`'nin `secret=` parametresi) üretebilmesi
 * için ters yön. Üretimde bu kodlama Better Auth'un KENDİSİ yapıyor; burada
 * yalnızca test verisi (rastgele sır) hazırlamak için var. */
export function encodeBase32(bytes: Uint8Array): string {
  let buffer = 0
  let bitsCollected = 0
  let output = ''

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bitsCollected += 8
    while (bitsCollected >= 5) {
      bitsCollected -= 5
      const charIndex = (buffer >> bitsCollected) & 0x1f
      output += BASE32_ALPHABET.charAt(charIndex)
    }
  }

  if (bitsCollected > 0) {
    const charIndex = (buffer << (5 - bitsCollected)) & 0x1f
    output += BASE32_ALPHABET.charAt(charIndex)
  }

  return output
}

/** `Buffer`/`Uint8Array` indeksleme `noUncheckedIndexedAccess` altında `number | undefined` döner — tek okuma noktası. */
function readByte(bytes: Uint8Array, index: number): number {
  const value = bytes[index]
  if (value === undefined) {
    throw new Error(`totp (test-only): dijest beklenenden kısa (index ${String(index)})`)
  }
  return value
}

/** RFC 4226 HOTP — HMAC-SHA1 + dinamik kısaltma. `digits` 6–8 ile sınırlı (RFC 4226 §5.3). */
function computeHotp(keyBytes: Uint8Array, counter: bigint, digits: number): string {
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(counter)

  const digest = createHmac('sha1', Buffer.from(keyBytes)).update(counterBuffer).digest()

  const offset = readByte(digest, digest.length - 1) & 0x0f
  const truncated =
    ((readByte(digest, offset) & 0x7f) << 24) |
    ((readByte(digest, offset + 1) & 0xff) << 16) |
    ((readByte(digest, offset + 2) & 0xff) << 8) |
    (readByte(digest, offset + 3) & 0xff)

  return (truncated % 10 ** digits).toString().padStart(digits, '0')
}

const totpCodeSchema = z
  .string()
  .regex(/^\d+$/, 'totp (test-only): üretilen kod rakam dizisi değil')

export type GenerateTotpCodeInput = {
  /** Kullanıcıya teslim edilen manuel anahtar (Base32, RFC 4648) — `totpURI`'nin `secret=` parametresiyle AYNI biçim. */
  readonly base32Secret: string
  /** Varsayılan 6 (Better Auth'un `totpOptions.digits` varsayılanıyla aynı; RFC 6238 Ek B vektörleri 8 hane kullanır). */
  readonly digits?: number
  /** Saniye, varsayılan 30 (Better Auth'un `totpOptions.period` varsayılanıyla aynı). */
  readonly period?: number
  /** Test amaçlı zaman kayması (saniye) — `nowEpochSeconds`'a (veya `Date.now()`'a) EKLENİR. Varsayılan 0. */
  readonly timeOffsetSeconds?: number
  /** Test-only: epoch saniyesini AÇIKÇA sabitler (RFC 6238 vektör doğrulaması gibi deterministik senaryolar için). Verilmezse `Date.now() / 1000` kullanılır. */
  readonly nowEpochSeconds?: number
}

/**
 * `apps/api`'nin `generateTotpCode`'u ile AYNI algoritmayı (RFC 6238)
 * BAĞIMSIZ uygular — import YOK (dosya başı yorumu). E2E fixture'ları
 * `/two-factor/enable` → `verify-totp` zincirinde ve her `sign-in`
 * sonrasındaki TOTP doğrulamasında bu fonksiyonu çağırır.
 */
export function generateTotpCode(input: GenerateTotpCodeInput): string {
  const digits = input.digits ?? 6
  const period = input.period ?? 30
  const timeOffsetSeconds = input.timeOffsetSeconds ?? 0
  const nowEpochSeconds = input.nowEpochSeconds ?? Math.floor(Date.now() / 1000)

  const keyBytes = decodeBase32(input.base32Secret)
  const epochSeconds = nowEpochSeconds + timeOffsetSeconds
  const counter = BigInt(Math.floor(epochSeconds / period))

  const raw = computeHotp(keyBytes, counter, digits)
  return totpCodeSchema.parse(raw)
}
