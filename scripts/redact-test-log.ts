// @arkesoft — stdin→stdout ham test çıktısı redaksiyon süzgeci (ROADMAP
// v0.0.20.1, T-022/S7 FIX turu 1, security F1 "medium").
//
// AMAÇ: `.github/actions/run-gates/action.yml`'in "Birim/entegrasyon
// testleri" ve "Tenant izolasyon süiti" adımları, başarısızlıkta ham
// vitest/`test:isolation` çıktısını BİR ARTEFAKT olarak yükler (S7, iki
// izlenen flake'i teşhis etmek için). `security` F1 ÖLÇTÜ: depo PUBLIC,
// artefakt 7 gün ANONIM İNDİRİLEBİLİR ve bazı assertion'lar TASARIM GEREĞİ
// ham sır basıyor (`otpauth://…?secret=…`, `BETTER_AUTH_SECRET`, oturum
// çerezi, `Set-Cookie` biçim hatası, e2e'deki ham base32 sır). Bu dosya
// `tee`'DEN ÖNCE devreye girer (action.yml'deki pipe sırası) — hem konsol
// çıktısını hem artefakt dosyasını AYNI ANDA redakte eder.
//
// ⚠⚠ GERİLİM (security'nin notu, BİREBİR UYGULANDI): bu süzgeç SATIR SİLMEZ,
// yalnızca SIR BİÇİMLİ JETONU maskeler. `Expected:`/`Received:`/
// `AssertionError`/yığın izi satırları bu yüzden İÇERİK OLARAK aynen kalır
// (bir sır biçimiyle ÇAKIŞMADIKLARI sürece) — agresif bir "uzun dizge gören
// satırı sil" süzgeci S7'nin VAROLUŞ SEBEBİNİ (iki flake'in ham diff'i) yok
// ederdi.
//
// BEŞ SIR BİÇİMİ (security F1'in sayımı) VE KARŞILIK GELEN MASKELEYİCİ:
//   1. `otpauth://…?secret=XXXX`           → maskOtpauthSecret
//   2. `.env`'teki SECRET/PASSWORD/TOKEN/   → maskKnownValues (BETTER_AUTH_
//      *_KEY değerleri (örn. BETTER_AUTH_     SECRET dahil — anahtar ADI
//      SECRET), DEĞER ile (ad'la DEĞİL)        değil, DEĞER ile maskelenir)
//   3. yapılandırılmış log `"cookie"`/        → maskJsonSensitiveKeys
//      `"authorization"`/`"set-cookie"` alanı
//   4. ham `Set-Cookie` başlığı (örn.          → maskSetCookieHeaderValue
//      "beklenmeyen Set-Cookie biçimi: …")
//   5. e2e'deki ham base32 TOTP sırrı           → maskStandaloneBase32Secret
//      (otpauth DIŞINDA, tek başına)
//
// ⚠ DÜRÜST SINIR (bilinçli, borç DEĞİL — kapsamlı bir biçim-bağımsız çözüm
// YENİ BİR BAĞIMLILIK/mühendislik yükü ister, Orkestratör onayı gerektirir):
// bir sır değeri hiçbir biçim imleci TAŞIMADAN (JSON anahtarı yok, "Set-
// Cookie" yok, "otpauth://" yok, base32 şekli yok) DOĞRUDAN bir assertion
// mesajına (örn. `Expected substring: not "<ham-değer>"`) gömülmüşse VE o
// değer `.env`'TEN gelen BİLİNEN bir değer DEĞİLSE (örn. test kaynağına
// doğrudan yazılmış bir sabit test fikstürü) bu süzgeç onu YAKALAMAZ — şekil
// temelli bir maskeleme, "biçimsiz, bağlamsız bir dizgeyi" sırdan ayırt
// edemez (ayırt etmeye çalışmak "Expected: 200"/"AssertionError" gibi TANI
// DEĞERİNİ KORUMAMIZ gereken metni de silme riski taşır — security'nin
// yasakladığı tam olarak bu). `log-correlation.test.ts`'teki
// `secretCookieValue`/`secretAuthValue` gibi TEST KAYNAĞINA GÖMÜLÜ sabit
// fikstürler bu sınıfa girer; bunlar GERÇEK bir sır DEĞİLDİR (test dosyasının
// kendisi zaten PUBLIC depoda düz metin taşıyor) — kalan risk, ölçülmüş F1
// bulgusunun "critical DEĞİL" gerekçesiyle AYNI sınıf (ephemeral/yeniden
// kullanılamaz değer).
//
// Node'un yerel tip sıyırması ile (derlemesiz) çalışır — `enum`/`namespace`/
// yapıcı parametre özelliği/dekoratör YOK (sync-platform-version.ts'in A-V23
// emsali, scripts/tsconfig.json'ın "erasableSyntaxOnly"si).

import { existsSync, readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')

// Test/doğrulama amaçlı override — GERÇEK CI koşumunda AYARLANMAZ, varsayılan
// her zaman kök `.env`'dir (vitest.config.ts'in `process.loadEnvFile` deseniyle
// AYNI dosya). Bu override, kök `.env`'E HİÇBİR ZAMAN YAZMADAN/OKUMADAN bu
// mekanizmayı `.env.example` gibi KAMUYA AÇIK bir dosyayla test edebilmek için
// var (AGENT_BASELINE.md §"yerel ortam dokunulmazları" — kök `.env` kullanıcının
// kendi ortamıdır, bu script ONU YALNIZCA OKUR, hiçbir koşulda YAZMAZ).
const envFileOverride = process.env['ARKESOFT_REDACT_ENV_FILE_OVERRIDE']
const ENV_FILE =
  envFileOverride !== undefined && envFileOverride !== ''
    ? join(REPO_ROOT, envFileOverride)
    : join(REPO_ROOT, '.env')

const SECRET_KEY_NAME_PATTERN = /SECRET|PASSWORD|TOKEN|_KEY$|API_KEY/i
const MIN_SECRET_VALUE_LENGTH = 6

/**
 * `.env` (veya override) dosyasındaki SECRET/PASSWORD/TOKEN/*_KEY adlı
 * anahtarların DEĞERLERİNİ okur. Dosya yoksa (CI'ın `.env` üretmediği job'lar,
 * ör. `guards`) boş dizi döner — BLOKLAMAZ, yalnızca bu maskeleyici katmanı
 * devre dışı kalır (diğer dört maskeleyici hâlâ çalışır).
 */
function loadKnownSecretValues(): readonly string[] {
  if (!existsSync(ENV_FILE)) {
    return []
  }
  const raw = readFileSync(ENV_FILE, 'utf8')
  const values: string[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue
    }
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) {
      continue
    }
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim()
    if (!SECRET_KEY_NAME_PATTERN.test(key)) {
      continue
    }
    if (value.length < MIN_SECRET_VALUE_LENGTH) {
      continue
    }
    values.push(value)
  }
  // Uzun değerler ÖNCE maskelenir: kısa bir değer uzun birinin ÖN EKİYSE,
  // kısayı önce maskelemek uzunun kalan parçasını YARIM maskeli bırakabilirdi.
  return [...values].sort((a, b) => b.length - a.length)
}

/** Bilinen `.env` DEĞERLERİNİ (ad DEĞİL) birebir dizge eşleşmesiyle maskeler. */
function maskKnownValues(line: string, values: readonly string[]): string {
  let result = line
  for (const value of values) {
    if (result.includes(value)) {
      result = result.split(value).join('[REDACTED]')
    }
  }
  return result
}

// Biçim 1 — otpauth URI'daki "secret=" parametresi (ad `secret=` KORUNUR,
// yalnızca DEĞER maskelenir; URI'nin kalanı — issuer, hesap adı — dokunulmaz).
const OTPAUTH_SECRET_PATTERN = /(otpauth:\/\/[^\s"'`]*?[?&]secret=)([A-Za-z0-9]+)/gi

function maskOtpauthSecret(line: string): string {
  return line.replace(
    OTPAUTH_SECRET_PATTERN,
    (_match, prefix: string): string => `${prefix}[REDACTED]`,
  )
}

// Biçim 3 — pino'nun yapılandırılmış JSON log biçimindeki cookie/authorization/
// set-cookie ALANLARI (ROOT_LOGGER redact yapılandırmasının KENDİSİ zaten
// bunları `[redacted]` yazar — bu katman, redaksiyonun HENÜZ UYGULANMADIĞI
// bir yoldan (örn. test assertion'ının `fullLogText` ham dökümü) aynı alan
// adlarıyla sızan bir değeri YAKALAMAK içindir, savunma derinliği).
const JSON_SENSITIVE_KEY_PATTERN = /"(cookie|authorization|set-cookie)"(\s*:\s*)"([^"]*)"/gi

function maskJsonSensitiveKeys(line: string): string {
  return line.replace(
    JSON_SENSITIVE_KEY_PATTERN,
    (_match, key: string, sep: string): string => `"${key}"${sep}"[REDACTED]"`,
  )
}

// Biçim 4 — ham `Set-Cookie` başlığı (örn. "beklenmeyen Set-Cookie biçimi: …"
// hata mesajının taşıdığı ham başlık). "Set-Cookie" jetonundan SONRAKİ metinde
// `ad=değer` çiftlerini tarar; bilinen ÇEREZ ÖZNİTELİK adlarını (Path, Domain,
// Expires, Max-Age, HttpOnly, Secure, SameSite — bunlar SIR DEĞİL) KORUR,
// diğer tüm `ad=değer` çiftlerinin DEĞERİNİ maskeler.
const SET_COOKIE_MARKER_PATTERN = /set-cookie/i
const COOKIE_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set([
  'path',
  'domain',
  'expires',
  'max-age',
  'httponly',
  'secure',
  'samesite',
])
const COOKIE_PAIR_PATTERN = /([A-Za-z0-9_.-]+)=([^;\s"'`]+)/g

function maskSetCookieHeaderValue(line: string): string {
  const markerMatch = SET_COOKIE_MARKER_PATTERN.exec(line)
  if (markerMatch === null) {
    return line
  }
  const markerEnd = markerMatch.index + markerMatch[0].length
  const prefix = line.slice(0, markerEnd)
  const rest = line.slice(markerEnd)
  const maskedRest = rest.replace(COOKIE_PAIR_PATTERN, (pair: string, name: string): string => {
    if (COOKIE_ATTRIBUTE_NAMES.has(name.toLowerCase())) {
      return pair
    }
    return `${name}=[REDACTED]`
  })
  return prefix + maskedRest
}

// Biçim 5 — otpauth DIŞINDA, TEK BAŞINA geçen ham base32 TOTP sırrı (klasik
// base32 alfabesi: A-Z + 2-7, 16+ ardışık karakter, kelime sınırıyla). Bu
// küme ALTÇİZGİ/küçük harf İÇERMEDİĞİ için "AssertionError"/"BETTER_AUTH_
// SECRET" gibi değişken adlarıyla ÇAKIŞMAZ (ikisi de alt çizgi veya küçük
// harf taşıyor, run BURADA KESİLİR).
const STANDALONE_BASE32_PATTERN = /\b[A-Z2-7]{16,}\b/g

function maskStandaloneBase32Secret(line: string): string {
  return line.replace(STANDALONE_BASE32_PATTERN, '[REDACTED]')
}

// ⚠⚠ L-1 (ROADMAP v0.0.20.1, T-022/S7 FIX turu 2, security tur 2) — ANSI
// RENK KAÇIŞLARI SIYRILIR. BU DOSYANIN BEŞ MASKELEYİCİSİNİN HİÇBİRİ ham
// ANSI (terminal renk) kaçışlarını hesaba KATMIYORDU; bu depoda vitest
// boruya ("| node ...") yazarken DE renk kodu ÜRETİYOR (ölçüldü,
// `security` tur 2). Bir SGR kaçışı (`\x1b[31m` gibi) bir sırrın
// ORTASINA düşerse sırrın kalan yarısı HAM kalır; `STANDALONE_BASE32_
// PATTERN`'in `\b` sınırının HEMEN ÖNÜNE düşerse durum DAHA KÖTÜ — SGR
// kaçışının SON baytı (`m`) bir KELİME karakteridir, yani "...31mABCDEF…"
// biçiminde `m` ile `A` arasında `\b` geçişi OLUŞMAZ ve maskeleme O SATIRDA
// HİÇ ÇALIŞMAZ (ikisi de sentetik fikstürle security tur 2'de ölçüldü).
//
// DÜZELTME: her satır, BEŞ maskeleyiciden ÖNCE bu fonksiyonla ANSI
// kaçışlarından SIYRILIR — maskeleyiciler HER ZAMAN ANSI'siz bir kopya
// üzerinde çalışır. ÇIKIŞ da bu SIYRILMIŞ kopyadır: rengin KAYBOLMASI
// kabul edilebilir (bilinçli, security'nin kararı) ama "Expected:"/
// "Received:"/"AssertionError"/yığın izi gibi TANI METNİ İÇERİĞİ hiçbir
// koşulda SİLİNMEZ — bu fonksiyon yalnızca ESC baytıyla başlayan CSI
// dizilerini kaldırır, görünür metni (harf/sayı/noktalama) DOKUNMADAN
// bırakır.
//
// DAR, BİLİNÇLİ SEZGİSEL (bu script'in diğer tüm maskeleyicileriyle AYNI
// disiplin): CSI biçimi (`ESC [ <parametreler> <son bayt>`) hedeflenir —
// vitest'in (chalk/tinypool altyapısı üzerinden) ürettiği SGR renk kodları
// (`\x1b[31m`, `\x1b[1;32m`, `\x1b[0m` vb.) ve ilişkili imleç/satır kontrol
// dizileri (`\x1b[2K` gibi) bu biçimdedir.
//
// KAPATILDI (L-1, ROADMAP v0.0.20.1, T-022/S7 FIX turu 3, security tur 3) —
// OSC dizileri (`ESC ] … BEL` / `ESC ] … ESC \`) de AYNI disiplinle SIYRILIR.
// ÖNCEKİ hal bunları KAPSAM DIŞI bırakıyordu ("vitest'in çıktısında
// GÖZLEMLENMEDİ" gerekçesiyle) — ama security tur 3 ölçtü: bir OSC dizisi
// bir sırrın ORTASINA düşerse ön yarısı HAM kalıyordu (sentetik fikstürle
// doğrulandı). Bağımlılık ağacında OSC üreten bir paket BUGÜN YOK
// (terminal-link/supports-hyperlinks/ansi-escapes kurulu değil) — risk
// TEORİK, ama maliyet tek satır; bilinçli olarak kapatıldı.
//
// KAÇINILMAZ `eslint-disable` (CLAUDE.md §2): aranan jetonlar TAM OLARAK
// ESC kontrol baytının (0x1b) ve BEL kontrol baytının (0x07) kendisi — bu
// baytlar OLMADAN desenler CSI/OSC dizilerini TANIMLAYAMAZ.
// eslint-disable-next-line no-control-regex
const ANSI_ESCAPE_PATTERN = /\x1b\[[0-9;]*[A-Za-z]/g
// eslint-disable-next-line no-control-regex
const OSC_ESCAPE_PATTERN = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g

function stripAnsiEscapeCodes(line: string): string {
  return line.replace(ANSI_ESCAPE_PATTERN, '').replace(OSC_ESCAPE_PATTERN, '')
}

function redactLine(line: string, knownValues: readonly string[]): string {
  let result = stripAnsiEscapeCodes(line)
  result = maskKnownValues(result, knownValues)
  result = maskOtpauthSecret(result)
  result = maskJsonSensitiveKeys(result)
  result = maskSetCookieHeaderValue(result)
  result = maskStandaloneBase32Secret(result)
  return result
}

async function main(): Promise<void> {
  const knownValues = loadKnownSecretValues()
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of rl) {
    let outputLine: string
    try {
      outputLine = redactLine(line, knownValues)
    } catch {
      // Satır-bazlı güvenli düşüş: bir maskeleyici beklenmedik bir girdide
      // çökerse SATIRI OLDUĞU GİBİ yaz. Akışı KESMEK (ve sonraki satırları
      // kaybetmek) nadir bir ayrıştırma hatasından DAHA PAHALIDIR — bu
      // script'in amacı S7'nin flake teşhis kanıtını AYAKTA tutmaktır.
      outputLine = line
    }
    process.stdout.write(outputLine + '\n')
  }
}

main().catch((error: unknown): void => {
  // Kasıtlı olarak `process.exit(1)` ÇAĞRILMAZ: bu süzgecin KENDİ hatası,
  // `set -o pipefail` altında pnpm'in GERÇEK test sonucunu MASKELEMEMELİ
  // (bir filtre çökmesi başarılı bir test koşumunu SAHTE KIRMIZI yapmamalı).
  process.stderr.write(
    `redact-test-log: beklenmeyen hata — kalan girdi redaksiyonSUZ geçmiş olabilir: ${String(error)}\n`,
  )
})
