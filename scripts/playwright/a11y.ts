// scripts/playwright/a11y.ts — Paylaşılan erişilebilirlik (axe-core) tarama
// yardımcısı (ROADMAP v0.0.20.3, T-024/S1, ADR-0025).
//
// NEDEN BU DOSYA VAR: `@axe-core/playwright` üç uygulamanın (`apps/admin`,
// `apps/storefront`, `apps/superadmin`) e2e süitlerinde birden kullanılacak;
// kural etiketleri, allowlist biçimi, `incomplete` politikası ve hata mesajı
// biçimi dört ayrı spec'te BAĞIMSIZ kopya olarak doğarsa (a) etiket kümesi
// sapabilir (bir spec `wcag2a` eksik tarayabilir, fark edilmeden) ve
// (b) allowlist biçimi tutarsızlaşabilir. `scripts/playwright/base.ts`/
// `sql.ts`/`totp.ts`/`mailpit.ts` İLE AYNI gerekçeyle BU dizinde: Playwright'ın
// TypeScript dönüştürücüsü `node_modules`'ü hariç tutar ⇒ bir workspace
// paketinden (`packages/*`) ham `.ts` ihraç edilip spec'ten import edilemez;
// `scripts/` zaten `scripts/tsconfig.json`'ın `include: ["*.ts",
// "playwright/*.ts"]`'i sayesinde tip+lint kapsamında birinci sınıf bir
// TypeScript alanı (genişletme YAPILMADAN bu dosya ne `check_scripts_typecheck`
// ne `check_scripts_eslint` tarafından görülür — genişletme ZATEN var, bkz.
// `scripts/tsconfig.json`, bu alt görev onu DEĞİŞTİRMEDİ).
//
// BAĞIMLILIK — KURULU, KURULMADI: `@axe-core/playwright` kök `package.json`
// (`"catalog:"`), `pnpm-workspace.yaml` catalog (`4.14.0`) ve `pnpm-lock.yaml`
// üzerinden ZATEN kurulu (kullanıcı onayı 2026-11-17, mimarinin keşif ölçümü:
// dört nokta da `OK`, `axe-core` TEK kopya). Bu dosya o üç dosyaya YAZMAZ,
// yalnızca var olan kurulumu TÜKETİR.
//
// TASARIM — TEK DIŞA AÇILAN YÜZEY: `expectNoAccessibilityViolations` dışında
// hiçbir fonksiyon/tip export EDİLMEZ. `AxeBuilder`/sonuç tipleri (ihlal,
// `incomplete`, düğüm) bu dosyanın İÇİNDE kalır; `include`/`exclude`/
// `disableRules` çağıranlara AÇILMAZ — bir spec'in axe'ın kapsamını kendi
// başına daraltabilmesi (`R6-②`, mimarinin raporu) bu yardımcının VAR OLMA
// nedenini (tutarlı, denetlenebilir bir tarama yüzeyi) ortadan kaldırırdı.
// Tek kaynağı `guards.sh`'in `check_axe_single_source` adımı (mimari
// `VARSAYIM A-T24-1`) MEKANİK olarak zorlar — bu dosya onun ALLOWLIST'idir.
//
// TASARIM — İKİ FAIL-CLOSED ÖZELLİK (b, c):
// 1. `ALLOWED_VIOLATIONS`/`ACKNOWLEDGED_INCOMPLETE_RULE_IDS` VARSAYILAN BOŞ —
//    bir girdi eklemek HER ZAMAN açık bir karar + gerekçe + borç sürümü
//    gerektirir, "belki birisi vardır" diye önceden doldurulmaz.
// 2. BAYAT GİRDİ = KIRMIZI — bir allowlist/acknowledge girdisi `scanName` için
//    HİÇBİR gerçek ihlal/`incomplete` ile eşleşmiyorsa test KIRILIR. Bu, "bir
//    kez eklenen gerekçe sonsuza dek sessiz kalır" sınıfını (ihlal düzeltilip
//    girdi unutulduğunda allowlist'in artık hiçbir şeyi gizlemediğini
//    DOĞRULAMAK yerine varsayılan olarak SESSİZ kalması) KISITLI olarak
//    engeller.
//    ⚠ DÜZELTME (F3/d, `security` gate tur 1 bulgusu): bir ÖNCEKİ cümle
//    ÖNCEDEN bunu "yapısal olarak imkânsız kılar" diye nitelendiriyordu —
//    YANLIŞTI. Gerçek: KOŞUM KAPSAMINA BAĞLI. Kontrol yalnızca o
//    `scanName`'i GERÇEKTEN tarayan bir test İÇİNDE `expectNoAccessibility
//    Violations` çağrıldığında devreye girer. `A11yScanName`'in 7 üyesi ÜÇ
//    ayrı Playwright koşumuna (`apps/admin`, `apps/superadmin`,
//    `apps/storefront`) dağılmış; `pnpm --filter @arkesoft/admin test:e2e`
//    TEK BAŞINA koşarken `superadmin-*`/`storefront-*` `scanName`'lerine ait
//    bayat bir girdi O KOŞUMDA HİÇ değerlendirilmez — o `scanName`'in KENDİ
//    spec'i (ör. `apps/superadmin/e2e/accessibility.spec.ts`) koşana kadar
//    sessiz kalır. "Bir kez eklenen gerekçe sonsuza dek sessiz kalır"
//    sınıfı yalnızca TAM `pnpm test:e2e` (kök toplayıcı, ÜÇ uygulamanın
//    HEPSİ) koşturulduğunda kapanır — tek paket koşumunda KAPANMAZ.
//
// TASARIM — ALLOWLIST ANAHTARI `scanName × ruleId` ÇİFTİ (po inceltmesi,
// R-PO2): yalnızca `ruleId` ile anahtarlama bir `color-contrast` ack'ini ALTI
// sayfanın HEPSİNDE o kuralı kör ederdi — aynı inceltme `incomplete`
// onayında da (c) UYGULANIR.
//
// GÜVENLİK — `redactAxeDetail()` "ÜRETME", SONRA MASKELEME DEĞİL (R5, mimari
// raporu): `node.html` BU DOSYADA HİÇBİR KOŞULDA okunmaz/mesaja YAZILMAZ —
// axe'ın PII taşıyan asıl alanı budur (DOM parçacığının kendisi: fixture
// e-postası, kiracı slug'ı görünür metinde geçebilir).
// ⚠ DÜZELTME (T-024, `security` tur 3 L bulgusu — ÖNCEKİ metin bayatladı):
// CI'ın "Playwright artefaktlarını yükle (trace + video)" adımı artık
// `if: failure()` ile koşuyor (ÖNCEDEN `if: always()`) VE adımın `path:`
// listesi `error-context.md`/`*.webm`/`trace.zip`'i AÇIKÇA hariç tutuyor —
// `retention-days: 7` değişmedi (ci.yml, ölçüldü). Yani PUBLIC depoya
// yüklenen artefakt yüzeyi ÖNCEKİ halinden daha dar.
// ⚠⚠ AMA bu, bu dosyanın KENDİ redaksiyonunu GEREKSİZ KILMAZ — iki koruma
// FARKLI kanalları kapatır: yukarıdaki `path:` hariç tutması yalnızca CI'IN
// YÜKLEDİĞİ ARTEFAKT DOSYASINI korur; axe'ın ürettiği hata mesajı Playwright
// test koşumunun STDOUT'u üzerinden CI çıktısına da düşer — `redact-test-
// log.ts` o kanalı KAPSAMAZ (yalnızca `.github/actions/run-gates/
// action.yml`'in `tee` borularını redakte eder, Playwright e2e adımının
// kendi stdout'unu DEĞİL). Bu yüzden hata mesajı şu alanlardan kurulur:
// `ruleId`, `impact`, düğüm sayısı, `helpUrl`, ilk 3 düğümün `target[0]`'ı
// VE `failureSummary` — İKİSİ DE redaksiyondan GEÇİRİLİR (aşağıdaki ⚠
// DÜZELTME'ye bkz.), e-posta biçimi `***@***`'a, depoda zaten pinli fixture
// kiracı slug'ı deseni (`apps/superadmin/e2e/fixtures/platform-admin.ts:
// 102,105`'in `E2E_FIXTURE_EMAIL_PATTERN`/`E2E_FIXTURE_TENANT_SLUG_PATTERN`'i
// — BURADA İTHAL EDİLMEZ, `totp.ts`'in dosya başı notuyla AYNI gerekçe: bu
// dosya üç uygulamanın HEPSİNDEN tüketilir, `apps/superadmin/e2e/**`'e
// bağımlılık `apps/admin`/`apps/storefront`'un e2e katmanına ters bir
// mimari bağ kurardı; bunun yerine AYNI desenin ÇAPASIZ/alt dize eşleştiren
// bağımsız bir kopyası aşağıda tutulur) `[REDACTED-FIXTURE]`'a çevrilir,
// `failureSummary` toplam ≤ 200, `target[0]` parçacığı ≤ 80 karaktere
// kesilir.
//
// ⚠ DÜZELTME (F2, `solid` + `security` gate tur 1 — BAĞIMSIZ olarak AYNI
// bulguyu yaptı): bu bölüm ÖNCEDEN `target[0]`'ı "güvenli alan" sayıp
// yalnızca 80 karaktere kesiyordu, `redactAxeDetail()`'DEN GEÇİRMİYORDU.
// Önerme ÖLÇÜMLE ÇÜRÜDÜ — ikisi de `axe-core` kaynağını okudu:
// `node_modules/.pnpm/axe-core@4.14.0/node_modules/axe-core/axe.js:7905`
// (`ignoredAttributes`) yalnızca `class`/`style`/`id`/`tabindex`/`aria-*`
// özniteliklerini DIŞLAR; `:7914-7931` (`getAttributeNameValue()`) `href`/
// `src` DIŞINDAKİ HER öznitelik için değeri <31 karakterse HAM olarak
// `ad="değer"` biçiminde seçiciye GÖMER ⇒ `value`/`name`/`title`/`alt`/
// `aria-label`/`data-*` içindeki kullanıcı verisi (ve bu dosyanın KENDİ
// `FIXTURE_TENANT_SLUG_PATTERN`'ine uyan kısa bir slug) maskelenmeden
// PUBLIC CI stdout'una/artefaktına düşebiliyordu. Düzeltme: `target[0]` artık
// `failureSummary` İLE AYNI saf redaksiyon adımını (`redactSensitivePatterns`)
// paylaşır — redaksiyon artık TEK kısıtlama noktası. SIRA KASITLI: redaksiyon
// ÖNCE, 80 karakter kesme SONRA (bkz. `formatResultSummary`) — tersi (önce
// kes, sonra redakte et) bir e-posta/slug'ı YARIDAN kesebilir; bu durumda
// `EMAIL_PATTERN`/`FIXTURE_TENANT_SLUG_PATTERN` artık EŞLEŞMEZ ve yarım sır
// maskelenmeden sızar.
//
// YAPISAL KISIT — `process` nesnesinin `env` alanı BU DOSYADA okunmaz
// (`check_e2e_env_passthrough`, `scripts/playwright/**`'i `turbo.json`'daki
// izinli listeyle karşılaştırır) — tarama her zaman çağıranın verdiği
// `page`/`scanName` ile çalışır, ortam değişkenine bağlı DAVRANMAZ.

import type { Page, TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// `axe-core`'un KENDİSİ kök `node_modules`'tan DOĞRUDAN çözülemez — pnpm
// strict modda transitive bağımlılıkları hoist ETMEZ (mimari raporunun R3
// riski, ÖLÇÜLDÜ: `node_modules/axe-core` kökte YOK, yalnızca
// `@axe-core/playwright`'ın KENDİ iç `node_modules`'ünde). Bu yüzden
// `AxeResults`/`Result`/`NodeResult` tipleri `axe-core`'dan import EDİLMEZ;
// bunun yerine `AxeBuilder.analyze()`'in dönüş tipinden TÜRETİLİR — aynı
// tipler, ikinci bir modül çözümlemesi gerektirmeden.
type AxeAnalyzeResults = Awaited<ReturnType<InstanceType<typeof AxeBuilder>['analyze']>>
type AxeViolationResult = AxeAnalyzeResults['violations'][number]
type AxeIncompleteResult = AxeAnalyzeResults['incomplete'][number]
type AxeNodeResult = AxeViolationResult['nodes'][number]

/**
 * WCAG 2.1 A/AA uygunluk taraması için axe-core kural etiketleri — TEK yer.
 * Yardımcı bu dörtlü DIŞINDA bir etiket kümesi yapılandırmasını DIŞA AÇMAZ
 * (çağıran kendi etiket listesini veremez) — `wcag` gate'inin kendi işi
 * (mimari raporu, "yeniden tanımlı kapsam" madde 1) bu kümenin GERÇEKTEN
 * WCAG 2.1 A/AA'yı kapsadığını denetlemektir, bu dosyanın işi DEĞİL.
 */
export const WCAG_RULE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

/**
 * Taranabilecek sayfa/durumların KAPALI birleşimi. Yeni bir tarama eklemek
 * bu birleşime bir üye eklemeyi GEREKTİRİR — bir çağıranın yazım hatası
 * yaptığı bir `scanName` (ör. `"admin-sgin-in"`) derleme zamanında kırılır,
 * sessizce "hiçbir allowlist girdisiyle eşleşmeyen" bir ad olarak akıp
 * gitmez.
 */
export type A11yScanName =
  | 'admin-sign-in'
  | 'admin-account-security-dialog'
  | 'superadmin-sign-in'
  | 'superadmin-dashboard'
  | 'storefront-home'
  | 'storefront-not-found'
  | 'a11y-helper-self-test'

/**
 * Bilinçli olarak kabul edilmiş bir ihlal — her girdi `scanName × ruleId`
 * ÇİFTİYLE anahtarlanır (R-PO2), Türkçe ve BOŞ OLMAYAN bir gerekçe taşır ve
 * hangi ROADMAP borç sürümünde ele alınacağını belirtir.
 */
export interface AllowedViolation {
  readonly scanName: A11yScanName
  readonly ruleId: string
  /** Türkçe, BOŞ OLAMAZ — neden bu sürümde düzeltilmediği. */
  readonly reason: string
  /** Bu borcun ele alınacağı ROADMAP sürümü, örn. `'v0.0.20.5'`. */
  readonly debtVersion: string
}

/**
 * VARSAYILAN BOŞ — keşif ölçümü taban ihlalin `0/6` sayfa olduğunu
 * doğruladı (mimari raporu), bu yüzden bu sürümde doldurulacak bir girdi
 * YOK. Bir girdi eklenirse ve karşılık gelen ihlal sonradan düzeltilirse,
 * girdi `scanName`'in taramasında hiçbir ihlalle eşleşmez hâle gelir ve
 * `expectNoAccessibilityViolations` bunu BAYAT girdi olarak KIRAR (aşağıya
 * bkz.) — "eklenip unutulan" bir ack'i, dosya başındaki (44-56) KOŞUM
 * KAPSAMI kaydıyla aynı nitelendirmeyle, yalnızca KISITLI olarak engeller
 * (tek paket koşumunda değil, ancak TAM `pnpm test:e2e` koştuğunda kapanır).
 */
export const ALLOWED_VIOLATIONS: readonly AllowedViolation[] = []

/**
 * Beyan edilmiş bir `incomplete` kuralı — AYNI `scanName × ruleId` çifti
 * inceltmesi (R-PO2) `incomplete` tarafında da uygulanır: axe `incomplete`
 * sonuçları (ör. gradyan üstü kontrast) KURAL BAZINDA değil, SAYFA + KURAL
 * bazında belirsizdir.
 *
 * TASARIM NOTU (koordinatör düzeltmesi): `AllowedViolation` ile TAM simetri
 * DEĞİL, BİLEREK bir alan FAZLA (`domEvidence`) — gerekçesi: bir ihlali
 * ertelemek ("biliyoruz, düzeltmedik") ile bir `incomplete`'i onaylamak
 * ("axe HESAPLAYAMADI, biz elle doğruladık") farklı bir iddia taşır; ikincisi
 * ek olarak HANGİ somut DOM kanıtının elle incelendiğini kayda geçirmeyi
 * gerektirir (aksi hâlde "elle doğruladım" iddiası gerekçesiz bir ikinci
 * `reason` metninden ayrılamaz) — bu yüzden `reason` (NEDEN axe
 * hesaplayamadı / bu bir uygunluk ihlali değil) ve `domEvidence` (HANGİ
 * öğe/seçici, hangi ölçülmüş değer) ayrı alanlar. Önceki tur `reason`/
 * `domEvidence`/`debtVersion`'ı yorumda tutuyordu (`VARSAYIM(F2)`) — tip
 * bunu ZORLAMIYORDU, bir sonraki ajan gerekçesiz girdi ekleyebilirdi; bu
 * düzeltme üç alanı VERİ alanına taşıyarak o boşluğu kapatıyor.
 */
export interface AcknowledgedIncompleteRule {
  readonly scanName: A11yScanName
  readonly ruleId: string
  /**
   * Türkçe, BOŞ OLAMAZ (çalışma zamanında zorlanır, aşağıya bkz.) — "ihlal
   * DEĞİL, axe hesaplayamadı" mı yoksa "ihlal AMA ertelendi" mi olduğunu
   * AÇIKÇA söylemeli.
   */
  readonly reason: string
  /**
   * Türkçe, BOŞ OLAMAZ (çalışma zamanında zorlanır) — DOM kanıtı: hangi
   * öğe/seçici, hangi ölçülmüş değer, neden axe hesaplayamıyor.
   */
  readonly domEvidence: string
  /** Bu kaydın yeniden değerlendirileceği ROADMAP sürümü, örn. `'v0.0.20.5'`. */
  readonly debtVersion: string
}

/**
 * ÜÇ GİRDİ — T-024/S5 (frontend) elle doğrulamasının sonucu (keşif
 * ölçümünün bulduğu üç `incomplete`, `admin-account-security-dialog`
 * taramasında — `ActiveSessionsCard`'ın oturum iptal `ConfirmDialog`'u
 * AÇIKKEN). Üçü de canlı DOM'da (`page.evaluate`, elle çalıştırılan bir
 * tanılama koşumu) doğrulandı — üçü de **İHLAL DEĞİL**, axe'ın statik
 * analizinin HESAPLAYAMADIĞI/doğrulayamadığı durumlar. Gerekçe + DOM kanıtı
 * (koordinatör düzeltmesi, S5'in turu): artık YORUMDA DEĞİL, her girdinin
 * KENDİ `reason`/`domEvidence` alanında — bilgiyi iki yerde (yorum + veri)
 * tutmamak için burada TEKRAR EDİLMEZ. `debtVersion: 'v0.0.20.5'` yalnızca
 * KAYIT amaçlı (bu üçünün yeniden doğrulanması/axe'ın gelecekteki bir
 * sürümünün bunları çözüp çözmediğinin kontrolü) — SUSTURMA değil. Her
 * girdi `scanName × ruleId` eşleşmesiyle BAYATLAMAYA karşı korunur (dosya
 * başı yorumu, (c)) ve boş `reason`/`domEvidence` çalışma zamanında KIRAR
 * (aşağıdaki `expectNoAccessibilityViolations`).
 */
export const ACKNOWLEDGED_INCOMPLETE_RULE_IDS: readonly AcknowledgedIncompleteRule[] = [
  {
    scanName: 'admin-account-security-dialog',
    ruleId: 'aria-hidden-focus',
    reason:
      'İhlal DEĞİL — axe statik DOM’da arka planın (#root) hâlâ "focusable" düğümler ' +
      'taşıdığını görüyor, ama Radix’in FocusScope’u Tab olayını ÇALIŞMA ZAMANINDA ' +
      'yakalayıp diyalog içinde döndürüyor; axe tuş basmaz, bu dinamik davranışı ' +
      'gözlemleyemez.',
    domEvidence:
      '3 düğüm: ConfirmDialog.tsx → @radix-ui/react-dialog’un iki "focus guard" span’i ' +
      '(data-radix-focus-guard, tabindex="0", aria-hidden="true", ' +
      'style="opacity:0;pointer-events:none") + #root (aria-hidden="true" ama inert YOK, ' +
      "document.getElementById('root').hasAttribute('inert') === false ölçüldü); odak " +
      'davranışı session-security-dialog-focus.qa.spec.ts’te ayrıca pinli.',
    debtVersion: 'v0.0.20.5',
  },
  {
    scanName: 'admin-account-security-dialog',
    ruleId: 'color-contrast',
    reason:
      'İhlal DEĞİL — axe’ın örtüşen-katman algoritması Dialog.Overlay’in (tüm ekranı ' +
      'kaplayan yarı şeffaf siyah, kardeş düğüm) arkasındaki gerçek rengi hesaplayamıyor; ' +
      'gerçek kontrast (koyu lacivert/beyaz) WCAG AA’nın üstünde, aynı ikili diğer ' +
      'sayfalarda 0 ihlalle zaten tarandı.',
    domEvidence:
      '1 düğüm: ConfirmDialog.tsx:84 Dialog.Title — ölçülen renkler: metin ' +
      'rgb(15,23,42), kendi arka planı şeffaf (rgba(0,0,0,0)), altında --color-surface ' +
      '(oklch(100% 0 0), packages/config/tailwind/theme.css:23); axe mesajı: ' +
      '"background color could not be determined because it partially overlaps other ' +
      'elements".',
    debtVersion: 'v0.0.20.5',
  },
  {
    scanName: 'admin-account-security-dialog',
    ruleId: 'label-content-name-mismatch',
    reason:
      'İhlal DEĞİL — görünür içerik (×) aria-hidden olduğu için erişilebilir ad ' +
      'hesabına katılmıyor, "Kapat" adıyla çelişen bir metin yok; axe kesin karar ' +
      'veremediği için incomplete işaretliyor.',
    domEvidence:
      '1 düğüm: ConfirmDialog.tsx:106-117 kapatma butonu — aria-label="Kapat", görünür ' +
      'içerik tek bir <span aria-hidden="true">×</span>.',
    debtVersion: 'v0.0.20.5',
  },
]

/** `scanName`/`ruleId` çiftini allowlist/ack karşılaştırması için TEK anahtar biçimine indirger. */
function toAllowlistKey(scanName: A11yScanName, ruleId: string): string {
  return `${scanName}::${ruleId}`
}

/**
 * Boş/boşluk-only bir metin alanı taşıyan bir allowlist/ack girdisini tespit
 * eder — tip (`string`) `''` değerini ENGELLEMEZ (koordinatör düzeltmesi:
 * "BOŞ OLAMAZ" yorumu yalnızca yorumdu), bu yüzden çalışma zamanında
 * zorlanır. Eşleşsin/eşleşmesin, ait olduğu `scanName` taranan HER SEFERİNDE
 * kontrol edilir — bir girdinin gerçek bir ihlal/`incomplete` ile eşleşmesi
 * bu kontrolü ATLAMAZ. Mesaj hangi listeyi, hangi `scanName × ruleId`
 * çiftini ve hangi alanı adlandırır.
 */
function findEmptyFieldError(
  listName: string,
  scanName: A11yScanName,
  ruleId: string,
  fieldName: string,
  value: string,
): string | undefined {
  if (value.trim().length > 0) {
    return undefined
  }
  return `GEÇERSİZ ${listName} girdisi: ${scanName}/${ruleId} alanı '${fieldName}' boş olamaz`
}

/**
 * Genel e-posta biçimi — fixture e-postaları (`*.test` alan adlı) DAHİL,
 * `failureSummary` metninde geçebilecek HERHANGİ bir e-postayı yakalar.
 * Global bayrak: bir `failureSummary` birden çok e-posta taşıyabilir.
 */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[a-z]{2,}/gi

/**
 * E2E fixture kiracı slug'ı — `apps/superadmin/e2e/fixtures/
 * platform-admin.ts:105`'in `E2E_FIXTURE_TENANT_SLUG_PATTERN`'İYLE AYNI
 * biçim, ÇAPASIZ (bu dosyadaki kullanım bir TAM eşleşme değil, bir metin
 * İÇİNDEKİ alt dizeyi bulmak) — bu yüzden bağımsız bir kopya (dosya başı
 * notu: `apps/superadmin/e2e/**`'e bağımlılık kurmak mimari sınırı ihlal
 * ederdi). İki dosya biçim olarak SAPARSA (`solid`/`devops` emsali, totp.ts
 * dosya başı notu) bu dosyadaki kopya fark edilmeden eskiyebilir — borç
 * kaydı: SEV low, sorumlu devops, vade: kaynak desen değiştiği sürüm.
 */
const FIXTURE_TENANT_SLUG_PATTERN = /e2e-[a-z0-9]+-\d{10,}-[a-z0-9]{1,10}/gi

/** `redactAxeDetail()`'in uyguladığı toplam karakter sınırı. */
const REDACTED_DETAIL_MAX_LENGTH = 200

/** Her düğüm hedefi (`target[0]`) için uygulanan karakter sınırı. */
const TARGET_SNIPPET_MAX_LENGTH = 80

/** Özetlenecek ilk N düğüm sayısı. */
const SUMMARY_NODE_LIMIT = 3

/**
 * Saf redaksiyon adımı — ⚠ DÜZELTME (F2): bu, `redactAxeDetail()`'in ve
 * `formatResultSummary()`'nin hedef parçacıklarının (`target[0]`)
 * PAYLAŞTIĞI TEK eşleme-maskeleme mantığı (önceden yalnızca
 * `redactAxeDetail()`'in İÇİNE gömülüydü, `target[0]` hiç bu yoldan
 * geçmiyordu — dosya başı GÜVENLİK notundaki ⚠ DÜZELTME'ye bkz.). Uzunluk
 * sınırı UYGULAMAZ — çağıran kendi sınırını `truncate()` ile redaksiyon
 * SONRASI uygular; sıra KASITLI tersine çevrilmez (aynı yer, gerekçe
 * yorumunda).
 */
function redactSensitivePatterns(input: string): string {
  const emailRedacted = input.replaceAll(EMAIL_PATTERN, '***@***')
  return emailRedacted.replaceAll(FIXTURE_TENANT_SLUG_PATTERN, '[REDACTED-FIXTURE]')
}

/** Bir dizeyi `maxLength` karaktere keser, kesilmişse `…` ekler. */
function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength)}…`
}

/**
 * `failureSummary` metnini güvenli hâle getirir — ÜRETME, SONRA MASKELEME
 * DEĞİL: bu fonksiyon zaten dar bir girdi (axe'ın ürettiği kısa bir metin
 * özeti) üzerinde çalışır, `node.html`'i HİÇ görmez (çağıran onu hiç
 * geçirmez). `redactSensitivePatterns()` ile E-posta → `***@***`, fixture
 * kiracı slug'ı → `[REDACTED-FIXTURE]`, SONRA toplam ≤
 * `REDACTED_DETAIL_MAX_LENGTH` karaktere kesilir (redaksiyon ÖNCE, kesme
 * SONRA — sıra kasıtlı, dosya başı GÜVENLİK notundaki ⚠ DÜZELTME'ye bkz.).
 * Dışa AÇILMAZ — (d)'nin tek dışa açılan yüzey kuralı.
 */
function redactAxeDetail(input: string): string {
  return truncate(redactSensitivePatterns(input), REDACTED_DETAIL_MAX_LENGTH)
}

/**
 * Bir düğümün `target[0]`'ını KISA bir dizeye indirger — GÜVENLİ bir dizeye
 * DEĞİL (⚠ DÜZELTME, F2: bu doc ÖNCEDEN "güvenli" diyordu; bkz. dosya başı
 * GÜVENLİK notu). axe-core'un `target` tipi (`CrossTreeSelector[]`) her
 * girdinin ya düz bir CSS seçici (`string`) ya da bir shadow-DOM seçici
 * zinciri (`string[]`, uzunluk ≥ 2) olmasına izin verir — ikinci durumda
 * zincir `' >>> '` ile birleştirilir. `node.html` HİÇ OKUNMAZ — ama axe'ın
 * ÜRETTİĞİ seçicinin KENDİSİ kullanıcı verisi taşıyabilir (öznitelik
 * değeri <31 karakterse axe-core tarafından ham gömülür). Bu fonksiyon
 * REDAKSİYON UYGULAMAZ — o, çağıranın (`formatResultSummary`) işidir.
 */
function stringifyFirstTarget(node: AxeNodeResult): string {
  const first = node.target[0]
  if (first === undefined) {
    return '(hedef yok)'
  }
  if (typeof first === 'string') {
    return first
  }
  return first.join(' >>> ')
}

/**
 * Bir axe sonucunu (ihlal veya `incomplete`) güvenli bir tek satırlık özete
 * indirger — (e)'nin üç kuralının UYGULAMASI: `node.html` yok, yalnızca
 * `ruleId`/`impact`/düğüm sayısı/`helpUrl`/ilk `SUMMARY_NODE_LIMIT` düğümün
 * redaksiyondan GEÇMİŞ + ≤ `TARGET_SNIPPET_MAX_LENGTH` karaktere kesilmiş
 * `target[0]`'ı VE redaksiyondan geçmiş `failureSummary` — İKİSİ DE AYNI
 * `redactSensitivePatterns()` adımını paylaşır (F2 düzeltmesi: redaksiyon
 * artık TEK kısıtlama noktası, `target[0]` istisna DEĞİL). Her ikisinde de
 * SIRA AYNI: redaksiyon ÖNCE, karakter kesme SONRA — önce kesilseydi bir
 * e-posta/slug'ın YARISI kalabilir ve `EMAIL_PATTERN`/
 * `FIXTURE_TENANT_SLUG_PATTERN` artık eşleşmeyip yarım sır maskelenmeden
 * sızabilirdi.
 */
function formatResultSummary(result: AxeViolationResult | AxeIncompleteResult): string {
  const targetSnippets = result.nodes
    .slice(0, SUMMARY_NODE_LIMIT)
    .map((node) =>
      truncate(redactSensitivePatterns(stringifyFirstTarget(node)), TARGET_SNIPPET_MAX_LENGTH),
    )

  const rawFailureSummaries = result.nodes
    .map((node) => node.failureSummary)
    .filter((summary): summary is string => summary !== undefined)
    .join(' | ')
  const failureSummary = redactAxeDetail(rawFailureSummaries)

  const impact = result.impact ?? 'bilinmiyor'
  return (
    `${result.id} (impact=${impact}, düğüm=${String(result.nodes.length)}) ${result.helpUrl} ` +
    `hedefler=[${targetSnippets.join(', ')}] failureSummary="${failureSummary}"`
  )
}

/**
 * Bir sayfada WCAG 2.1 A/AA erişilebilirlik ihlali OLMADIĞINI doğrular —
 * `scripts/playwright/a11y.ts`'in TEK dışa açılan yüzeyi.
 *
 * Davranış:
 * 1. `WCAG_RULE_TAGS` ile `AxeBuilder.analyze()` çalıştırır.
 * 2. Her `incomplete` sonucu, kırılsın ya da kırılmasın,
 *    `testInfo.annotations`'a `{ type: 'a11y-incomplete', description:
 *    '<scanName>/<ruleId> × <düğüm sayısı>' }` olarak YAZILIR (AC-21,
 *    Playwright raporunda ad ad görünür). `ACKNOWLEDGED_INCOMPLETE_RULE_IDS`
 *    İÇİNDE `scanName × ruleId` çifti OLMAYAN bir `incomplete` testi KIRAR.
 * 3. Her ihlal `ALLOWED_VIOLATIONS`'ta AYNI `scanName × ruleId` çiftiyle
 *    eşleşmiyorsa testi KIRAR.
 * 4. `ALLOWED_VIOLATIONS`'ta bu `scanName` için duran ama HİÇBİR gerçek
 *    ihlalle eşleşmeyen bir girdi (BAYAT girdi) de testi KIRAR — allowlist
 *    kalıcı sessiz yeşil üretemez. ⚠ DÜZELTME (F3/c, `security` gate tur 1
 *    bulgusu): AYNI kontrol `ACKNOWLEDGED_INCOMPLETE_RULE_IDS` İÇİN de
 *    uygulanır (ÖNCEDEN yalnızca `ALLOWED_VIOLATIONS`'ta vardı — üç ack
 *    girdisi, karşılık geldikleri kural artık `incomplete` dönmese bile
 *    SÜRESİZ sessiz kalabiliyordu). İkisi AYNI yönde fail-closed: bu
 *    kontrol KOŞUM KAPSAMINA BAĞLIDIR (dosya başı TASARIM notundaki ⚠
 *    DÜZELTME'ye bkz.) — yalnızca o `scanName`'i GERÇEKTEN tarayan bir test
 *    çalıştığında devreye girer.
 * 5. HER İKİ listenin TÜM girdilerinin (`ALLOWED_VIOLATIONS`'ta `reason`,
 *    `ACKNOWLEDGED_INCOMPLETE_RULE_IDS`'te `reason`/`domEvidence`) boş/
 *    boşluk-only olmadığı kontrol edilir — BU `scanName`'e ait olsun/
 *    olmasın, eşleşsin/eşleşmesin, bayat olsun/olmasın; tip (`string`) `''`'i
 *    ENGELLEMEZ, bu koruma ÇALIŞMA ZAMANINDADIR. ⚠ DÜZELTME (F3/a,
 *    `security` gate tur 1 bulgusu): ÖNCEDEN bu kontrol çağıranın
 *    `scanName`'iyle SINIRLIYDI (`entry.scanName !== scanName` filtresi) —
 *    bu, F3/d'deki AYNI koşum-kapsamı sınırını BOŞ-ALAN doğrulamasına da
 *    taşıyordu: `pnpm --filter @arkesoft/admin test:e2e` tek başına
 *    koşarken `superadmin-*`/`storefront-*` girdileri HİÇ doğrulanmıyordu,
 *    ve spec'i olmayan yeni bir üyeye eklenen boş gerekçeli bir girdi
 *    HİÇBİR koşumda yakalanmıyordu. Tablolar BÜTÜN olarak doğrulanır —
 *    veri statiktir, taranan sayfadan BAĞIMSIZDIR; bu yüzden (4)'teki BAYAT
 *    girdi kontrolünün TERSİNE burada kapsam filtresi YOKTUR.
 *
 * `analyze()`'in ham sonucu bu fonksiyondan DIŞARI ÇIKMAZ — çağıran ne
 * ham sonucu ne `include`/`exclude`/`disableRules` seçeneklerini görür.
 */
export async function expectNoAccessibilityViolations(
  page: Page,
  scanName: A11yScanName,
  testInfo: TestInfo,
): Promise<void> {
  const results: AxeAnalyzeResults = await new AxeBuilder({ page })
    .withTags([...WCAG_RULE_TAGS])
    .analyze()

  const matchedAllowlistKeys = new Set<string>()
  const unresolvedViolations = results.violations.filter((violation) => {
    const allowed = ALLOWED_VIOLATIONS.find(
      (entry) => entry.scanName === scanName && entry.ruleId === violation.id,
    )
    if (allowed === undefined) {
      return true
    }
    matchedAllowlistKeys.add(toAllowlistKey(allowed.scanName, allowed.ruleId))
    return false
  })

  const staleAllowlistEntries = ALLOWED_VIOLATIONS.filter(
    (entry) =>
      entry.scanName === scanName &&
      !matchedAllowlistKeys.has(toAllowlistKey(entry.scanName, entry.ruleId)),
  )

  for (const incomplete of results.incomplete) {
    testInfo.annotations.push({
      type: 'a11y-incomplete',
      description: `${scanName}/${incomplete.id} × ${String(incomplete.nodes.length)}`,
    })
  }

  const matchedAckKeys = new Set<string>()
  const unacknowledgedIncomplete = results.incomplete.filter((incomplete) => {
    const acknowledged = ACKNOWLEDGED_INCOMPLETE_RULE_IDS.find(
      (entry) => entry.scanName === scanName && entry.ruleId === incomplete.id,
    )
    if (acknowledged === undefined) {
      return true
    }
    matchedAckKeys.add(toAllowlistKey(acknowledged.scanName, acknowledged.ruleId))
    return false
  })

  // ⚠ DÜZELTME (F3/c): `ALLOWED_VIOLATIONS`'ınkiyle AYNI yönde (taranan
  // `scanName`'e kapsamlı, fail-closed) bayatlık kontrolü —
  // `ACKNOWLEDGED_INCOMPLETE_RULE_IDS` için ÖNCEDEN karşılığı YOKTU.
  const staleAcknowledgedEntries = ACKNOWLEDGED_INCOMPLETE_RULE_IDS.filter(
    (entry) =>
      entry.scanName === scanName &&
      !matchedAckKeys.has(toAllowlistKey(entry.scanName, entry.ruleId)),
  )

  // BOŞ ALAN KORUMASI — tip (`string`) `''`'i engellemez, bu yüzden her iki
  // listenin TÜM girdileri (bu `scanName`'e ait olsun/olmasın,
  // eşleşsin/eşleşmesin, bayat olsun/olmasın) burada kontrol edilir. ⚠
  // DÜZELTME (F3/a): ÖNCEDEN `entry.scanName !== scanName` filtresi vardı —
  // KALDIRILDI (yukarıdaki fonksiyon dokümantasyonundaki (5)'e bkz.,
  // gerekçe: tablolar BÜTÜN olarak doğrulanır, veri statiktir).
  const emptyFieldErrors: string[] = []
  for (const entry of ALLOWED_VIOLATIONS) {
    const reasonError = findEmptyFieldError(
      'ALLOWED_VIOLATIONS',
      entry.scanName,
      entry.ruleId,
      'reason',
      entry.reason,
    )
    if (reasonError !== undefined) {
      emptyFieldErrors.push(reasonError)
    }
  }
  for (const entry of ACKNOWLEDGED_INCOMPLETE_RULE_IDS) {
    const reasonError = findEmptyFieldError(
      'ACKNOWLEDGED_INCOMPLETE_RULE_IDS',
      entry.scanName,
      entry.ruleId,
      'reason',
      entry.reason,
    )
    if (reasonError !== undefined) {
      emptyFieldErrors.push(reasonError)
    }
    const domEvidenceError = findEmptyFieldError(
      'ACKNOWLEDGED_INCOMPLETE_RULE_IDS',
      entry.scanName,
      entry.ruleId,
      'domEvidence',
      entry.domEvidence,
    )
    if (domEvidenceError !== undefined) {
      emptyFieldErrors.push(domEvidenceError)
    }
  }

  const failureLines: string[] = [...emptyFieldErrors]

  for (const violation of unresolvedViolations) {
    failureLines.push(`İHLAL: ${formatResultSummary(violation)}`)
  }
  for (const incomplete of unacknowledgedIncomplete) {
    failureLines.push(`BEYAN EDİLMEMİŞ incomplete: ${formatResultSummary(incomplete)}`)
  }
  for (const stale of staleAllowlistEntries) {
    failureLines.push(
      `BAYAT allowlist girdisi: ${stale.scanName}/${stale.ruleId} hiçbir ihlalle eşleşmedi — ` +
        `girdiyi kaldırın (kayıtlı gerekçe: ${stale.reason})`,
    )
  }
  for (const stale of staleAcknowledgedEntries) {
    failureLines.push(
      `BAYAT acknowledged-incomplete girdisi: ${stale.scanName}/${stale.ruleId} hiçbir ` +
        `incomplete ile eşleşmedi — girdiyi kaldırın (kayıtlı gerekçe: ${stale.reason})`,
    )
  }

  if (failureLines.length > 0) {
    throw new Error(
      `expectNoAccessibilityViolations('${scanName}') başarısız:\n${failureLines.join('\n')}`,
    )
  }
}
