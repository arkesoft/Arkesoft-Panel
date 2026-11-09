// @arkesoft/api — TOTP kod üretici port'u (ROADMAP v0.0.15, T-016/S4)
//
// AMAÇ: testlerin GERÇEK, geçerli bir TOTP kodu üretebilmesi için üretim
// kodunun ARKASINDA bir sözleşme olması (ör. "11. deneme reddedilir" testinin
// ilk 10 denemesinin GERÇEKTEN geçerli kod üretmesi gerekir — sahte/rastgele
// bir dize değil). RFC 6238 (TOTP) + RFC 4226 (HOTP) standart algoritmasını
// `node:crypto`'nun yerleşik HMAC'ıyla uygular — YENİ BİR BAĞIMLILIK YOK.
//
// Better Auth'un KENDİ doğrulama algoritmasıyla (`@better-auth/utils/otp`,
// `createOTP(secret, {period,digits}).verify(code)`) BİREBİR UYUMLU olacak
// şekilde ÖLÇÜLEREK yazıldı — kaynak dosya (`node_modules/.pnpm/@better-auth+
// utils@0.5.1/.../dist/otp.mjs`) AÇILIP OKUNDU:
//   - HMAC algoritması: SHA-1 (sabit, Better Auth seçeneği YOK).
//   - Anahtar baytları: `secret` dizesinin HAM UTF-8 baytları
//     (`new TextEncoder().encode(secret)`, `@better-auth/utils/bytes.mjs:
//     toBufferSource`) — Base32 DECODE edilmiş bir anahtar DEĞİL. Better
//     Auth KENDİ `enable` ucunda `generateRandomString(32)` ile ürettiği
//     HAM dizeyi doğrudan HMAC anahtarı yapar; `totpURI`'nin `secret=`
//     parametresi bu ham dizenin Base32 KODLANMIŞ hâlidir (yalnızca QR/manuel
//     giriş biçimi — bir kimlik doğrulayıcı uygulaması bu parametreyi Base32
//     DECODE edip aynı ham baytlara geri döner, `totp/index.mjs:19-23`'ün
//     `decryptTOTPSecret`'ı — "base32:" ÖN EKİ YOKSA ham dizeyi OLDUĞU GİBİ
//     kullanır).
//   - Sayaç: 8 bayt, big-endian, `Math.floor(epochSeconds / period)`.
//   - Dinamik kısaltma (dynamic truncation): son baytın alt 4 biti ofset,
//     ofsetteki 4 bayttan (ilk bit maskeli) 31 bitlik tamsayı, `% 10^digits`,
//     sola sıfırla doldurulur.
//
// Bu yüzden port, kullanıcıya TESLİM EDİLEN (Base32) manuel anahtarı girdi
// alır ve KENDİSİ decode eder — "testin gördüğü" ile "üretimin ürettiği"
// AYNI biçimdedir (mimari kararı: "QR teslimi: URI + manuel anahtar").
//
// Port'un dönüşü Zod ile parse edilir (görev gereği) — `any` YOK, `unknown`
// + daraltma.

import { createHmac } from 'node:crypto'
import { z } from 'zod'

/** RFC 4648 §6 Base32 alfabesi — `@better-auth/utils/base32.mjs` ile BİREBİR aynı (büyük/küçük harf DUYARLI). */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** `BASE32_ALPHABET`'teki her karakterin 5-bit değeri. */
const BASE32_DECODE_MAP: ReadonlyMap<string, number> = new Map(
  BASE32_ALPHABET.split('').map((char, index) => [char, index]),
)

export class InvalidBase32SecretError extends Error {
  constructor(invalidChar: string) {
    super(`totp-code-generator.port: geçersiz Base32 karakteri: ${invalidChar}`)
    this.name = 'InvalidBase32SecretError'
  }
}

/**
 * Bir Base32 (RFC 4648, dolgusuz) dizeyi ham baytlara çevirir. Manuel anahtar
 * girişinde yaygın hijyen (boşluk/tire temizliği, büyük harfe çevirme)
 * UYGULANIR — gerçek bir kimlik doğrulayıcı uygulamasının yaptığı budur;
 * `=` dolgu karakteri (varsa) yok sayılır.
 */
function decodeBase32(input: string): Uint8Array {
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

/** `Buffer`/`Uint8Array` indeksleme `noUncheckedIndexedAccess` altında `number | undefined` döner — tek okuma noktası. */
function readByte(bytes: Uint8Array, index: number): number {
  const value = bytes[index]
  if (value === undefined) {
    throw new Error(`totp-code-generator.port: dijest beklenenden kısa (index ${String(index)})`)
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
  .regex(/^\d+$/, 'totp-code-generator.port: üretilen kod rakam dizisi değil')

export type TotpCodeGeneratorInput = {
  /** Kullanıcıya teslim edilen manuel anahtar (Base32, RFC 4648) — totpURI'nin `secret=` parametresiyle AYNI. */
  readonly base32Secret: string
  /** Varsayılan 6 (Better Auth'un `totpOptions.digits` varsayılanıyla aynı). */
  readonly digits?: number
  /** Saniye, varsayılan 30 (Better Auth'un `totpOptions.period` varsayılanıyla aynı). */
  readonly period?: number
  /**
   * Test amaçlı zaman kayması (saniye). Varsayılan 0 (şimdi). Negatif/pozitif
   * değerler ÖNCEKİ/SONRAKİ pencerenin kodunu üretir — "yakın-ıska" sentetik
   * veri için (ADR-0014): geçerli koddan BİR KARAKTER farklı değil, GERÇEKTEN
   * farklı bir zaman penceresinin GERÇEK kodu.
   */
  readonly timeOffsetSeconds?: number
}

/** Testlerin üretim kodunun arkasındaki sözleşmeyi (port) tüketmesi için. */
export type TotpCodeGeneratorPort = {
  readonly generateCode: (input: TotpCodeGeneratorInput) => Promise<string>
}

/** `TotpCodeGeneratorPort.generateCode`'un asıl implementasyonu. */
export async function generateTotpCode(input: TotpCodeGeneratorInput): Promise<string> {
  const digits = input.digits ?? 6
  const period = input.period ?? 30
  const timeOffsetSeconds = input.timeOffsetSeconds ?? 0

  const keyBytes = decodeBase32(input.base32Secret)
  const epochSeconds = Math.floor(Date.now() / 1000) + timeOffsetSeconds
  const counter = BigInt(Math.floor(epochSeconds / period))

  const raw = computeHotp(keyBytes, counter, digits)
  return Promise.resolve(totpCodeSchema.parse(raw))
}

export function createTotpCodeGeneratorPort(): TotpCodeGeneratorPort {
  return { generateCode: generateTotpCode }
}
