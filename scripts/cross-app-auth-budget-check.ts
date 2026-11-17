// @arkesoft — `pnpm guards` adımı: çapraz-uygulama (admin ↔ superadmin) e2e
// oran sınırı bütçesi kapısı (ROADMAP v0.0.20.1, T-022/EK İŞ, devops).
//
// NEDEN BU KAPI VAR (ÖLÇÜLDÜ, bu turda GERÇEK bir koşumla): `apps/admin/e2e/
// auth-budget.ts` ve `apps/superadmin/e2e/auth-budget.ts`'in KENDİ
// `auth-budget.test.ts`'leri yalnızca KENDİ uygulamalarının toplamını
// `AUTH_IP_LIMITS`'e karşı doğruluyor (admin 7 ≤ 10 ✓, superadmin 4 ≤ 10 ✓)
// — ama `apps/admin`→`apps/superadmin` import'u CLAUDE.md §3 tarafından
// YASAK olduğu için hiçbir mevcut test ÇAPRAZ toplamı (admin + superadmin
// AYNI apps/api sürecini/Redis'ini PAYLAŞSAYDI: 7+4=11) GÖRMÜYORDU. T-022'nin
// iki yeni `two-factor-setup-reload.spec.ts` dosyası (+1 signUp admin'de, +1
// signUp superadmin'de) bu toplamı `EMAIL_IP_LIMIT=10`'un ÜZERİNE çıkardı —
// gerçek bir koşumla ÖLÇÜLDÜ (devops T-022/EK İŞ raporu): tek apps/api
// sürecine karşı koşulan `pnpm test:e2e`, `platform:auth:post-auth-sign-up-
// email:ip:*` sayacını TAM 11'e taşıdı ve GERÇEK bir `RATE_LIMIT_EXCEEDED`
// (429 sınıfı) üretti — `apps/admin/e2e/two-factor-setup-reload.spec.ts`
// bununla GERÇEKTEN kırmızı düştü.
//
// ÇÖZÜM (`.github/workflows/ci.yml`, "apps/api'nin İKİNCİ süreci" adımı):
// admin+storefront BİR apps/api sürecini (REDIS_URL DB İNDEKSİ 1), superadmin
// AYRI bir apps/api sürecini (DB İNDEKSİ 2) kullanır. Oran sınırlayıcı
// sayacı `ApiEnv.REDIS_URL`'e bağlı SÜREÇ İÇİ bir durumdur
// (`redis.module.ts:45`/`queue.module.ts:68`, tek env) — iki süreç AYRI DB
// indeksi kullandığında HMAC anahtarları FİZİKSEL OLARAK ayrı birer Redis
// veritabanında tutulur ve BİRBİRİNİ GÖRMEZ, "127.0.0.1" soket adresi ortak
// olsa BİLE (`client-ip.ts`, `trustedProxyCount<=0` iken yalnızca
// `socket.remoteAddress` okunur). ⇒ "limiti izole DB'nin gerçeğine göre
// yeniden tanımla" (Orkestratör, T-022/EK İŞ): GERÇEK kısıt artık MERKEZİ
// bir toplam DEĞİL, HER izole Redis veritabanının (= her uygulamanın) KENDİ
// toplamıdır. Bu kapı BUNU doğrular — kapıyı bir UYARI'ya ÇEVİRMEDEN, aksine
// doğru BİRİME (uygulama başına, DB başına) bağlayarak.
//
// İKİ YÖNLÜ MEKANİZMA (bu kapı ikisini de yapar, tek biri yetmez):
//   (A) `.github/workflows/ci.yml`'nin e2e job'unda GERÇEKTEN EN AZ İKİ
//       FARKLI `REDIS_URL: redis://…/<N>` DB indeksi bildirildiğini
//       mekanik olarak doğrular — "izolasyon GERÇEKTEN var mı" sorusunu
//       GÜVENE DAYANDIRMAZ (ci.yml'nin SONRADAN tek DB'ye geri alınması bu
//       kapıyı KIRMIZI yapar, bütçe kontrolünü SESSİZCE geçersiz bırakmaz).
//   (B) Her uygulamanın (`apps/admin`, `apps/superadmin`) `SPEC_AUTH_COST`
//       toplamını, TEK KAYNAK `apps/api/src/auth/rate-limit/rate-limit.
//       policy.ts`'TEN TÜRETİLEN (kopyalanmayan — "limit kaynağını da sına"
//       talebi, T-022/EK İŞ) `LOGIN_IP_LIMIT`/`EMAIL_IP_LIMIT`'e karşı
//       BAĞIMSIZ olarak doğrular. Admin'in `check_auth_budget_pin_
//       freshness` (guards.sh) kontrolünden FARKI: o kontrol admin'in PİN
//       DEĞERİNİN (`AUTH_IP_LIMITS`) rate-limit.policy.ts'teki sabitle
//       UYUMLU olup olmadığını sınar (tazelik); BU kontrol admin'in VE
//       superadmin'in GERÇEK `SPEC_AUTH_COST` TOPLAMLARININ o sabitlerin
//       (pin'den DEĞİL, DOĞRUDAN kaynak dosyadan) ALTINDA kalıp kalmadığını
//       sınar (bütçe) — ikisi TAMAMLAYICI, biri diğerinin YERİNE geçmez.
//
// BİLGİLENDİRME AMAÇLI (HATA ÜRETMEZ): çapraz-uygulama (admin+superadmin)
// BİRLEŞİK toplamı da HESAPLANIP yazdırılır — mimari TEKRAR tek sürece
// dönerse (ör. "apps/api'nin İKİNCİ süreci" adımı silinirse) bu sayı (A)
// kontrolünün KIRMIZI düşmesiyle BİRLİKTE teşhis sağlar.
//
// Node'un yerel tip sıyırması ile (derlemesiz) `node scripts/cross-app-auth-
// budget-check.ts` olarak koşar — `scripts/e2e-env-passthrough-check.ts`'in
// AYNI disiplini (erasable syntax, enum/namespace/dekoratör YOK).

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')

const CI_WORKFLOW_PATH = join(REPO_ROOT, '.github/workflows/ci.yml')
const RATE_LIMIT_POLICY_PATH = join(REPO_ROOT, 'apps/api/src/auth/rate-limit/rate-limit.policy.ts')

type AppBudgetSource = {
  readonly appName: string
  readonly authBudgetPath: string
}

const APP_BUDGET_SOURCES: readonly AppBudgetSource[] = [
  { appName: 'apps/admin', authBudgetPath: join(REPO_ROOT, 'apps/admin/e2e/auth-budget.ts') },
  {
    appName: 'apps/superadmin',
    authBudgetPath: join(REPO_ROOT, 'apps/superadmin/e2e/auth-budget.ts'),
  },
]

type SpecAuthCostTotal = { readonly signIn: number; readonly signUp: number }

/**
 * `SPEC_AUTH_COST`'un `{ signIn: N, signUp: N }` girdilerini toplar. Dosyanın
 * TAMAMINI bir TypeScript modülü olarak İÇE AKTARMAK (derleme gerektirir)
 * YERİNE metin taraması kullanılır — `scripts/`'in kendi erasable-syntax
 * disiplini `.ts` dosyalarını DERLEMEDEN çalıştırır, bu yüzden `apps/admin`'in
 * `tsconfig`'ine/derlemesine BAĞIMLI olmak İSTENMEZ (guards.sh'in HIZLI,
 * bağımsız bir mekanik adımı olarak kalması için).
 */
function sumSpecAuthCost(filePath: string): SpecAuthCostTotal {
  const source = readFileSync(filePath, 'utf8')
  // ⚠ Desen BİLEREK `'<dosya>': { signIn: N, signUp: N }` biçimine ÇAPALI —
  // yalnızca `signIn:\s*\d+,\s*signUp:\s*\d+` aramak `AUTH_IP_LIMITS = {
  // signIn: 20, signUp: 10 }` sabitini de YANLIŞLIKLA eşler (ÖLÇÜLDÜ, bu
  // dosya yazılırken: admin'in toplamı sahte biçimde +20/+10 ŞİŞTİ). Önde
  // tırnaklı bir dosya adı anahtarı ZORUNLU KILMAK bunu ayırt eder —
  // `AUTH_IP_LIMITS`'in kendisi bu biçimde DEĞİLDİR.
  const entryPattern = /'[^']+':\s*\{\s*signIn:\s*(\d+)\s*,\s*signUp:\s*(\d+)\s*\}/g

  let signInTotal = 0
  let signUpTotal = 0
  let matchCount = 0
  let match: RegExpExecArray | null

  while ((match = entryPattern.exec(source)) !== null) {
    const signInValue = match[1]
    const signUpValue = match[2]
    if (signInValue === undefined || signUpValue === undefined) {
      continue
    }
    signInTotal += Number.parseInt(signInValue, 10)
    signUpTotal += Number.parseInt(signUpValue, 10)
    matchCount += 1
  }

  if (matchCount === 0) {
    throw new Error(
      `cross-app-auth-budget-check: "${filePath}" içinde "signIn: N, signUp: N" biçiminde HİÇBİR SPEC_AUTH_COST girdisi bulunamadı — dosya şekli değişmiş olabilir (fail-closed).`,
    )
  }

  return { signIn: signInTotal, signUp: signUpTotal }
}

/**
 * `rate-limit.policy.ts`'teki `const LOGIN_IP_LIMIT = N` / `const
 * EMAIL_IP_LIMIT = N` MODÜL SABİTLERİNİ DOĞRUDAN TÜRETİR — admin'in pin'i
 * (`AUTH_IP_LIMITS`) ÜZERİNDEN DEĞİL, dosya başı yorumunun "limit kaynağını
 * da sına" gerekçesiyle: pin üzerinden türetmek ÜÇÜNCÜ, koordinesiz bir
 * dolaylama katmanı eklerdi.
 */
function deriveRealIpLimits(): { readonly loginIpLimit: number; readonly emailIpLimit: number } {
  const source = readFileSync(RATE_LIMIT_POLICY_PATH, 'utf8')

  const loginMatch = /const LOGIN_IP_LIMIT\s*=\s*(\d+)/.exec(source)
  const emailMatch = /const EMAIL_IP_LIMIT\s*=\s*(\d+)/.exec(source)

  if (loginMatch?.[1] === undefined || emailMatch?.[1] === undefined) {
    throw new Error(
      `cross-app-auth-budget-check: "${RATE_LIMIT_POLICY_PATH}" içinde LOGIN_IP_LIMIT/EMAIL_IP_LIMIT sabitleri bulunamadı — fail-closed.`,
    )
  }

  return {
    loginIpLimit: Number.parseInt(loginMatch[1], 10),
    emailIpLimit: Number.parseInt(emailMatch[1], 10),
  }
}

/**
 * `.github/workflows/ci.yml`'nin e2e job'unda GERÇEKTEN EN AZ İKİ FARKLI
 * `REDIS_URL: redis://…/<N>` DB indeksi bildirildiğini doğrular — bu kapının
 * "her uygulama KENDİ izole Redis veritabanında koşuyor" VARSAYIMININ
 * mekanik kanıtı (dosya başı yorumu, mekanizma (A)).
 */
function collectDeclaredRedisDbIndexes(): readonly string[] {
  const source = readFileSync(CI_WORKFLOW_PATH, 'utf8')
  const pattern = /REDIS_URL:\s*redis:\/\/[^/\s]+\/(\d+)/g

  const indexes = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    const dbIndex = match[1]
    if (dbIndex !== undefined) {
      indexes.add(dbIndex)
    }
  }

  return [...indexes]
}

function main(): number {
  const violations: string[] = []

  const declaredRedisDbIndexes = collectDeclaredRedisDbIndexes()
  if (declaredRedisDbIndexes.length < 2) {
    violations.push(
      `İZOLASYON VARSAYIMI İHLALİ — "${CI_WORKFLOW_PATH}" e2e job'unda EN AZ İKİ FARKLI "REDIS_URL: redis://…/<N>" DB indeksi bekleniyordu, ${String(declaredRedisDbIndexes.length)} bulundu (${declaredRedisDbIndexes.join(', ') || 'hiçbiri'}). Bu kapının "admin ve superadmin AYRI izole Redis veritabanlarında koşuyor" varsayımı artık GEÇERSİZ olabilir — aşağıdaki uygulama-başına bütçe kontrolü GÜVENİLİR DEĞİL (T-022/EK İŞ'in "apps/api'nin İKİNCİ süreci" adımı silinmiş/değiştirilmiş olabilir).`,
    )
  }

  const { loginIpLimit, emailIpLimit } = deriveRealIpLimits()

  const perAppTotals: { readonly appName: string; readonly total: SpecAuthCostTotal }[] = []
  for (const { appName, authBudgetPath } of APP_BUDGET_SOURCES) {
    const total = sumSpecAuthCost(authBudgetPath)
    perAppTotals.push({ appName, total })

    if (total.signIn > loginIpLimit) {
      violations.push(
        `BÜTÇE İHLALİ — ${appName}: beyan edilen signIn toplamı (${String(total.signIn)}) GERÇEK LOGIN_IP_LIMIT (${String(loginIpLimit)}, rate-limit.policy.ts'ten TÜRETİLDİ) sınırını AŞIYOR.`,
      )
    }
    if (total.signUp > emailIpLimit) {
      violations.push(
        `BÜTÇE İHLALİ — ${appName}: beyan edilen signUp toplamı (${String(total.signUp)}) GERÇEK EMAIL_IP_LIMIT (${String(emailIpLimit)}, rate-limit.policy.ts'ten TÜRETİLDİ) sınırını AŞIYOR.`,
      )
    }
  }

  const combinedTotal = perAppTotals.reduce(
    (accumulator, entry) => ({
      signIn: accumulator.signIn + entry.total.signIn,
      signUp: accumulator.signUp + entry.total.signUp,
    }),
    { signIn: 0, signUp: 0 },
  )

  const perAppSummary = perAppTotals
    .map(
      (entry) =>
        `${entry.appName}: signIn=${String(entry.total.signIn)}/signUp=${String(entry.total.signUp)}`,
    )
    .join(' · ')

  process.stdout.write(
    `cross-app-auth-budget-check: gerçek sınırlar LOGIN_IP_LIMIT=${String(loginIpLimit)}, EMAIL_IP_LIMIT=${String(emailIpLimit)} (rate-limit.policy.ts'ten türetildi). Uygulama başına toplamlar — ${perAppSummary}. BİLGİLENDİRME (zorlanmıyor, tek apps/api sürecine dönülürse ANLAMLI olur): birleşik çapraz-uygulama toplamı signIn=${String(combinedTotal.signIn)}/signUp=${String(combinedTotal.signUp)}. Redis DB izolasyon kanıtı: e2e job'unda bildirilen DB indeksleri = ${declaredRedisDbIndexes.join(', ') || 'yok'}.\n`,
  )

  if (violations.length > 0) {
    process.stderr.write('cross-app-auth-budget-check: İHLAL(LER) bulundu:\n')
    for (const violation of violations) {
      process.stderr.write(`  - ${violation}\n`)
    }
    return 1
  }

  return 0
}

process.exit(main())
