// @arkesoft/theme-sdk — ayar migration KOŞUCUSU (ROADMAP v0.0.9, T-010/S6,
// AC9)
//
// `chain.ts`'in (S4) notu birebir geçerli: "S6 `migrate()`'i `chain.ts`'te
// ÇAĞIRMAZ — kendi çağrısını yapar, topoloji sonucunu (`ok: true`) ön koşul
// olarak kullanabilir." Bu dosya tam olarak bunu yapar: ÇAĞIRAN TARAF
// `validateMigrationChain`'i ÖNCE çalıştırıp `ok: true` SONUCUNU bu
// fonksiyona vermek ZORUNDADIR — bu fonksiyon zincirin boşluk/tekrar/döngü/
// eksik-hedef-major kontrolünü TEKRAR YAPMAZ, yalnızca `from` → migration
// eşlemesini kurup zinciri `fromVersion`'dan başlayarak İLERİ yönde yürütür
// (V4, `chain.ts`: ters migration yazılmaz).
//
// ⚠ SEMVER KARŞILAŞTIRMASI YOK (po handoff'ta bağlayıcı) — `fromToMap`
// anahtarları OPAK dize kimlikleridir, "1.2.0 < 1.5.0" türünden bir
// ÖNCELİK/ARALIK hesabı burada da YOK (`chain.ts`'in aynı kısıtının devamı).
//
// ⚠ İKİ ZORUNLU DAVRANIŞ (T-010/S6 handoff'ta ölçülmüş, testlerle pinlenir):
//
// (1) GİRDİ MUTASYONA UĞRAMAZ — `settings` parametresi tema sahibinin
//     KENDİ verisidir; bu koşucunun onu yerinde değiştirmesi geri almayı
//     (rollback) imkânsız kılar. Çözüm: yürütmeye başlamadan `settings`'in
//     TEK BİR `structuredClone` kopyası alınır (`current`), zincirin HİÇBİR
//     adımı orijinal referansı GÖRMEZ. `migrate()` kendi aldığı değeri
//     yerinde mutasyona uğratsa bile (dış sağlayıcı/tema yazarı kodu —
//     bu paketin denetiminde DEĞİL) etkilenen nesne zaten bir KOPYADIR;
//     sonraki adımda `current` o adımın DÖNÜŞ değeriyle (`migrated`)
//     DEĞİŞTİRİLİR, önceki referans zaten terk edilir. `structuredClone`
//     bir Node/JS ÇALIŞMA ZAMANI GLOBAL'İDİR (`node:` önekli bir modül
//     İTHALİ DEĞİL, saflık pininin yasakladığı sınıf bu değil —
//     `__tests__/purity.test.ts`'in `FORBIDDEN_PATTERNS` listesi yalnızca
//     `node:fs`/`node:path`/`process.`/`fetch(`/`@arkesoft/` ithalini
//     yasaklar, çalışma zamanı globallerini DEĞİL — tıpkı `zod-issue-
//     mapping.ts`'in kullandığı `Object.keys`/`JSON.parse` gibi).
//
// (2) SESSİZ BAŞARISIZLIK — S3'ün AC6 İKİZİ (`validate-settings.ts` dosya
//     başı yorumu, "AC6 İKİNCİ KATMAN"): SON ÇIKIŞ `migrate()`'in HAM DÖNÜŞ
//     DEĞERİ DEĞİL, Zod `safeParse`'ın ÇIKTISIDIR (`result.data`). Ham
//     dönüşü ileri taşımak `__proto__` gibi bir ÖZ anahtarı (JSON.parse'ın
//     üretebileceği) ileri taşır ve prototip kirliliği korumasını (zod@4.6.7
//     `util.js` — bkz. `validate-settings.ts` dosya başı yorumu) YALNIZCA
//     PARSE ÇIKTISI döndürüldüğünde geçerli kılar. Testler aynı ikili
//     assertion deseniyle kanıtlar: (a) `({} as Record<string, unknown>)
//     ['polluted']` tanımsız (b) dönen `value` HAM `migrate()` dönüşüyle
//     (`rawMigrateOutput`) REFERANS EŞİT DEĞİL.
//
// ⚠ AC9'UN HATA KODU — hedef şemadan geçmeyen bir çıktı (ister `migrate()`
// FIRLATSIN ister geçerli bir değer DÖNDÜRSÜN ama o değer hedef şemayla
// eşleşmesin) HER İKİ DURUMDA DA `THEME_MIGRATION_RESULT_INVALID` ile
// raporlanır — bu paketin kapalı 15 kodluk kataloğunda migration SONUCUNA
// özel TEK kod bu (`errors.ts`). `migrate()` fırlattığında hata YUTULMAZ
// (CLAUDE.md §4: `catch {}` boş blok yasak) — yakalanıp bu pakete has
// AYRIMLI BİRLEŞİM sözleşmesine (`ThemeContractResult`, `errors.ts` dosya
// başı yorumu) SARMALANIR. Bu paket `@arkesoft/errors`'a bağımlı DEĞİL
// (kapalı bağımlılık listesi) — "sarmalanıp yukarı iletilme" burada bir
// `AppError` fırlatmak DEĞİL, platformun bu paket için zaten kurduğu
// `{ ok: false, issues }` sözleşmesine katılmaktır (bkz. `errors.ts` dosya
// başı yorumu, madde a/b).
//
// ⚠ B2+B3 DÜZELTMESİ (T-010 düzeltme turu 1/3 · parti B) — İKİ bağımsız
// bulgu BİRLİKTE ele alınır:
//
// (B2, `security`) `structuredClone(settings)` çağrısı ESKİDEN `try`
// BLOĞUNUN DIŞINDAYDI — klonlanamaz bir girdi (ör. `{ f: () => 1 }`)
// `DOMException` FIRLATIYORDU, bu da `migrate()`'in fırlatmasının (ÖZENLE
// sarmalanmış, bkz. yukarıdaki not) TUTARLI OLMAYAN bir komşusuydu: AYNI
// fonksiyonun bir satırı sözleşmeyi (ayrımlı birleşim, `ok:false`) BOZUYOR,
// bir satırı UYGULUYORDU. Artık `structuredClone` da `try`'a alınır ve
// AYNI `buildRunFailure` yardımcısıyla raporlanır — çağıran HİÇBİR ZAMAN
// yakalanmamış bir istisna ALMAZ.
//
// (B3, `solid`+`security`) `migrate()`'in fırlattığı hata ESKİDEN `catch {`
// (BAĞLAMA YOK) ile TAMAMEN atılıyordu — `solid`'in bulgusu: bir tema
// yazarının `TypeError`'ı üretimde SİNYALSİZ kaybolur (mesaj/stack/`cause`
// yok). `security`'nin bulgusu: bu aynı zamanda DOĞRU bir tercih — ham
// hata metni (ör. `GIZLI: db://user:pass@host` gibi bir sır İÇEREBİLİR)
// `issue.message`'a HİÇBİR ZAMAN ENTERPOLE EDİLMEMELİ. Çözüm İKİSİNİ DE
// karşılar: `cause` KAYBEDİLMEZ (`ThemeContractError`'ın `cause`'u
// KULLANILIR — `ThemeContractIssue`'yu (errors.ts, DOKUNULMAZ) GENİŞLETMEK
// burada YAPILMADI, mimariye RAPORLANDI) ama `message` HER ZAMAN genel-
// geçer `THEME_CONTRACT_MESSAGES` sabitidir — SDK `cause`'u KENDİSİ
// loglamaz/mesaja enterpole ETMEZ, KULLANIM KARARI ÇAĞIRANA bırakılır.
// `buildRunFailure`'ın döndürdüğü nesne `ThemeContractFailure`'ın
// (`ok`/`issues`) ÜSTÜNE GERİYE UYUMLU bir `cause` alanı EKLER — var olan
// tüketiciler (yalnızca `ok`/`issues` okuyanlar) KIRILMAZ.
//
// ⚠ F2 DÜZELTMESİ (T-010 düzeltme turu 2/3, solid'in bulgusu M1) — B2+B3'ün
// "çağıran HİÇBİR ZAMAN yakalanmamış istisna ALMAZ" iddiası ÖNCEKİ turda
// GERÇEK DEĞİLDİ: `schemaFromDefinitions(targetSettingDefinitions)` çağrısı
// (aşağıda, "(2) SESSİZ BAŞARISIZLIK NOKTASI") `try` DIŞINDAYDI. F1'in kök
// çözümü (`../settings/schema-from-definitions.js` dosya başı yorumu)
// `schemaFromDefinitions`'ı yinelenen/güvensiz bir `key` için FIRLAYAN bir
// TEK ön kontrol noktası yaptığı için bu açık, B2+B3'ün aynı turda kapattığı
// açığın BİREBİR AYNI sınıfıydı — `migrateThemeSettings([], '1.0.0',
// [{key:'constructor',…}], {})` bir `ThemeContractError` FIRLATIYORDU, bu
// fonksiyonun beyan ettiği dönüş tipi (`ThemeContractResult`, FIRLATMAYAN
// bir ayrımlı birleşim) İHLAL EDİLİYORDU. Artık bu çağrı da AYNI
// `buildRunFailure` deseniyle sarmalanır — çağıranın hiçbir yolu bir istisna
// ALMAZ iddiası şimdi fonksiyonun HER satırı için doğrudur. `ThemeContract
// Error`'ın KENDİ `issues`'u (ör. `THEME_SETTING_KEY_UNSAFE`, doğru `path`
// ile) OLDUĞU GİBİ taşınır — genel-geçer `THEME_MIGRATION_RESULT_INVALID`'e
// İNDİRGENMEZ (çağıranın hangi kuralın ihlal edildiğini bilmesi daha
// FAYDALI).
//
// ⚠ F3 DÜZELTMESİ (T-010 düzeltme turu 2/3, security'nin bulgusu S3) —
// `buildRunFailure`'ın `cause` alanı ÖNCEDEN sıradan (enumerable) bir
// özellik olarak atanıyordu. `apps/api`'nin (CLAUDE.md §4) bu sonucu
// YAPILANDIRILMIŞ JSON olarak LOGLAMASI `JSON.stringify(result)` üzerinden
// geçer — `cause.cause` (orijinal, FIRLATILAN hata) bir `Error` DEĞİLSE
// (ör. bir dize veya düz nesne; `Error` örnekleri `message`/`stack`'i
// VARSAYILAN OLARAK non-enumerable TUTAR, bu yüzden zaten temizdir) bu
// SERİLEŞTİRMEYE DAHİL OLUYORDU — ÖLÇÜLDÜ: `GIZLI: db://user:pass@host`
// İÇEREN bir dize/düz nesne fırlatıldığında `JSON.stringify(result)`
// bunu SIZDIRIYORDU (`result.issues`/`result.message` TEMİZ olsa bile).
// Çözüm: `cause`'u `Object.defineProperty` ile NON-ENUMERABLE yapmak —
// `JSON.stringify`/`Object.keys`/`for...in` artık `result.cause`'u HİÇ
// GÖRMEZ (recursion `cause.cause`'a hiç İNMEZ), ama `result.cause` DOĞRUDAN
// erişimle (`result.cause.cause`) HÂLÂ ERİŞİLEBİLİRDİR (B3'ün ayıklanabilir-
// lik gerekçesi KORUNUR). Üçüncü başarısızlık dalı (migrate() çıktısı hedef
// şemadan geçmediğinde) de ARTIK AYNI `buildRunFailure` yoluyla döner —
// (solid'in `low` notu: önceki tur 3 yoldan 2'sinde `cause` taşıyordu, bu
// turda "yolu üstündeyken" kapatıldı) orijinal `ZodError` `cause` olarak
// erişilebilir, hiçbir alan SIZDIRMAZ (ZodError'ın kendi `issues`'u zaten
// `themeContractIssuesFromZodError` ile TEMİZ bir `ThemeContractIssue[]`'a
// çevrilip ayrıca döndürülür).

import {
  ThemeContractError,
  type ThemeContractFailure,
  type ThemeContractIssue,
  type ThemeContractResult,
} from '../errors.js'
import { THEME_CONTRACT_MESSAGES } from '../messages.js'
import { formatThemeContractPath } from '../paths.js'
import type { ThemeSettingDefinition } from '../settings/primitives.js'
import {
  schemaFromDefinitions,
  type ThemeSettingsValue,
} from '../settings/schema-from-definitions.js'
import { themeContractIssuesFromZodError } from '../settings/zod-issue-mapping.js'
import type { ThemeSettingsMigration } from './chain.js'

/**
 * `migrateThemeSettings`'in BEKLENMEYEN bir çalışma zamanı hatası (migrate()
 * fırlatması, `structuredClone`'un klonlanamaz girdi için fırlatması VEYA
 * `schemaFromDefinitions`'ın güvensiz/yinelenen bir `key` için fırlatması —
 * F2 düzeltmesi, dosya başı yorumu) karşısında döndürdüğü BAŞARISIZLIK dalı
 * — `ThemeContractFailure`'ın (`ok`/`issues`) ÜSTÜNE GERİYE UYUMLU bir
 * `cause` alanı taşır (B3 düzeltmesi, dosya başı yorumu). `cause` bir
 * `ThemeContractError`'dır, kendi native `Error.cause`'u orijinal hatayı
 * (`originalError`) taşır — SDK bunu KENDİSİ okumaz/loglamaz, yalnızca
 * ERİŞİLEBİLİR kılar.
 *
 * ⚠ F3 DÜZELTMESİ (T-010 düzeltme turu 2/3, security'nin bulgusu S3, dosya
 * başı yorumu) — `cause` alanı `Object.defineProperty` ile NON-ENUMERABLE
 * olarak kurulur. Düz bir nesne literali (`{ ok, issues, cause }`) `cause`'u
 * SIRADAN (enumerable) bir özellik yapardı — `JSON.stringify` bunu DAHİL
 * EDER ve `cause.cause` bir sır İÇERİYORSA (fırlatılan ham hata bir `Error`
 * DEĞİLSE) bu doğrudan bir log sızıntısı kanalı olurdu. `as` KULLANILMAZ
 * (CLAUDE.md §2) — `failure` nesnesi doğru tiple (`cause` DAHİL) bir
 * literal olarak KURULUR, `Object.defineProperty` yalnızca var olan
 * `cause` özelliğinin TANIMLAYICISINI (descriptor) günceller, dönen
 * nesnenin TİPİNİ değiştirmez.
 */
function buildRunFailure(
  issues: readonly ThemeContractIssue[],
  originalError: unknown,
): ThemeContractFailure & { readonly cause: ThemeContractError } {
  const cause = new ThemeContractError(issues)
  cause.cause = originalError

  const failure: { ok: false; issues: readonly ThemeContractIssue[]; cause: ThemeContractError } = {
    ok: false,
    issues,
    cause,
  }

  Object.defineProperty(failure, 'cause', {
    value: cause,
    enumerable: false,
    writable: false,
    configurable: false,
  })

  return failure
}

/** Zincirde tek bir adımın yürütülmesi için gereken, ORİJİNAL index'i taşıyan iç temsil (hata yolu raporlaması için). */
interface IndexedMigration {
  readonly index: number
  readonly migration: ThemeSettingsMigration
}

/**
 * Bir ayar nesnesini migration zinciri boyunca `fromVersion`'dan başlayarak
 * İLERİ yönde taşır ve SON ÇIKIŞI `targetSettingDefinitions`'ın şemasından
 * geçirir (AC9). Zincirin TOPOLOJİSİ (`validateMigrationChain`, S4) bu
 * fonksiyondan ÖNCE, ÇAĞIRAN TARAFÇA doğrulanmış OLMALIDIR — bu fonksiyon
 * onu TEKRAR doğrulamaz (dosya başı yorumu).
 *
 * `fromVersion`, zincirin HİÇBİR `from`'una eşit DEĞİLSE (ör. ayar nesnesi
 * zaten hedef sürümde) döngü hiç çalışmaz — `settings` doğrudan hedef
 * şemadan geçirilir; bu, "migration gerekmeyen" durumun ÖZEL bir dal
 * YAZILMADAN doğal sonucu.
 *
 * @param migrations - `validateMigrationChain` ile topolojisi doğrulanmış
 *   migration zinciri (bu fonksiyon o doğrulamayı TEKRARLAMAZ)
 * @param fromVersion - taşımanın BAŞLADIĞI sürüm
 * @param targetSettingDefinitions - taşımanın SONUNDA çıkışın doğrulanacağı
 *   hedef sürümün ayar tanımları (`primitives.ts` biçiminde,
 *   `schemaFromDefinitions` ile şemaya çevrilir)
 * @param settings - taşınacak HAM ayar nesnesi (JSONB'den okunan, `unknown`)
 */
export function migrateThemeSettings(
  migrations: readonly ThemeSettingsMigration[],
  fromVersion: string,
  targetSettingDefinitions: readonly ThemeSettingDefinition[],
  settings: unknown,
): ThemeContractResult<ThemeSettingsValue> {
  const fromToMap = new Map<string, IndexedMigration>(
    migrations.map((migration, index) => [migration.from, { index, migration }] as const),
  )

  // (1) GİRDİ MUTASYONA UĞRAMAZ — `current` baştan itibaren orijinal
  // `settings` referansından TAMAMEN KOPUKTUR (dosya başı yorumu, madde 1).
  // ⚠ B2 DÜZELTMESİ — `structuredClone` KLONLANAMAZ bir girdi (ör. bir
  // fonksiyon alanı taşıyan bir nesne) için FIRLAR; bu da `try`'a alınır
  // (dosya başı yorumu) — aksi halde bu fonksiyonun İLK SATIRI bile
  // ayrımlı birleşim sözleşmesini (`ok:false`) BOZARDI.
  let current: unknown
  try {
    current = structuredClone(settings)
  } catch (cloneError) {
    return buildRunFailure(
      [
        {
          code: 'THEME_MIGRATION_RESULT_INVALID',
          path: formatThemeContractPath([]),
          message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_RESULT_INVALID,
        },
      ],
      cloneError,
    )
  }
  let version = fromVersion

  // Zaten topolojisi doğrulanmış bir zincirde döngü OLAMAZ (S4'ün işi) —
  // ama bu fonksiyon o ön koşulu TEKRAR DOĞRULAMADIĞI için (dosya başı
  // yorumu) savunmacı bir ÜST SINIR eklenir: `migrations.length` adımdan
  // fazla yürümek, ön koşul ihlal edilmiş olsa bile sonsuz döngüyü ÖNLER.
  let remainingSteps = migrations.length + 1

  while (remainingSteps > 0) {
    const step = fromToMap.get(version)
    if (step === undefined) {
      break
    }

    let migrated: unknown
    try {
      migrated = step.migration.migrate(current)
    } catch (migrationError) {
      // Hata YUTULMAZ (CLAUDE.md §4) — bu paketin ayrımlı birleşim
      // sözleşmesine sarmalanır (dosya başı yorumu, AC9'un hata kodu notu).
      // ⚠ B3 DÜZELTMESİ — `catch {` (BAĞLAMA YOK) yerine `catch
      // (migrationError)`: `message` HÂLÂ genel-geçer sabittir (sır
      // hijyeni KORUNUR, ham hata metni ASLA enterpole edilmez) ama
      // `cause` artık `buildRunFailure` İLE KAYBEDİLMEDEN taşınır.
      return buildRunFailure(
        [
          {
            code: 'THEME_MIGRATION_RESULT_INVALID',
            path: formatThemeContractPath(['migrations', step.index, 'migrate']),
            message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_RESULT_INVALID,
          },
        ],
        migrationError,
      )
    }

    current = migrated
    version = step.migration.to
    remainingSteps -= 1
  }

  // (2) SESSİZ BAŞARISIZLIK NOKTASI — `schema.safeParse(current).data`
  // DÖNER, `current`'ın (migrate()'in ham dönüşü OLABİLECEK değerin)
  // KENDİSİ ASLA (dosya başı yorumu, madde 2).
  //
  // ⚠ F2 DÜZELTMESİ (dosya başı yorumu) — `schemaFromDefinitions` güvensiz/
  // yinelenen bir `key` için FIRLAR (F1 kök çözümü); bu çağrı artık `try`
  // İÇİNDEDİR — çağıran HİÇBİR ZAMAN yakalanmamış bir istisna ALMAZ.
  let schema: ReturnType<typeof schemaFromDefinitions>
  try {
    schema = schemaFromDefinitions(targetSettingDefinitions)
  } catch (schemaConstructionError) {
    const issues: readonly ThemeContractIssue[] =
      schemaConstructionError instanceof ThemeContractError
        ? schemaConstructionError.issues
        : [
            {
              code: 'THEME_MIGRATION_RESULT_INVALID',
              path: formatThemeContractPath([]),
              message: THEME_CONTRACT_MESSAGES.THEME_MIGRATION_RESULT_INVALID,
            },
          ]
    return buildRunFailure(issues, schemaConstructionError)
  }

  const result = schema.safeParse(current)

  if (!result.success) {
    // ⚠ F3 DÜZELTMESİ (dosya başı yorumu) — "yolu üstündeyken" tutarlı
    // hâle getirildi: üçüncü başarısızlık dalı artık DİĞER İKİSİYLE AYNI
    // `buildRunFailure` yolundan geçer, `cause` (orijinal `ZodError`)
    // ERİŞİLEBİLİR (NON-ENUMERABLE) hâle gelir.
    return buildRunFailure(
      themeContractIssuesFromZodError(result.error, 'THEME_MIGRATION_RESULT_INVALID'),
      result.error,
    )
  }

  return { ok: true, value: result.data, warnings: [] }
}
