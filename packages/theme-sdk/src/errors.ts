// @arkesoft/theme-sdk — tema sözleşmesi hata kataloğu (ROADMAP v0.0.9,
// T-010/S2, architect "Hata tasarımı" bölümü, ADR-0013 taslağı)
//
// ⚠ CLAUDE.md §4'TEN BİLİNÇLİ BİR SAPMA — gerekçe (ADR-0013'e girecek, `solid`
// bunu bir İHLAL değil bir KARAR olarak görsün):
//
// CLAUDE.md §4 "Beklenen durumlar için hata fırlat, `null` döndürüp çağıranı
// tahmine zorlamayın" diyor. Bu paketteki doğrulama fonksiyonları (S3'ün
// `validateThemeSettings`, S5'in `validateThemeManifest`) bilinçli olarak
// bir AYRIMLI BİRLEŞİM döndürür, `null` DEĞİL — ayrımlı birleşim çağıranı
// tahmine ZORLAMAZ, çünkü `ok` discriminant'ı TypeScript derleyicisi
// tarafından ZORLANIR (`result.value`'ya `ok` dalı daraltılmadan erişmek
// derleme hatası verir; bu, `null` döndürüp çağıranın `if (result) {}`
// kontrolünü UNUTABİLECEĞİ durumdan yapısal olarak farklıdır). Döndürme,
// fırlatma yerine zorunlu çünkü:
//   (a) Bir doğrulama çağrısı genellikle TEK değil ÇOK SAYIDA issue üretir
//       (bir `theme.json`'da birden çok alan aynı anda yanlış olabilir) —
//       fırlatan bir API ilk hatada durur, kalan hataları gizler.
//   (b) `validateThemeSettings` (S3'ün işi, AC5) UYARIYLA BAŞARI dönmek
//       zorunda — "SOY ama RAPORLA" güven sınırı (bkz. PM/architect kararı)
//       bilinmeyen anahtarları sessizce atıp `ok: true` dönerken bunu
//       `warnings` alanında raporlar; bu, ikili (başarılı/başarısız)
//       fırlatma modeliyle TEMSİL EDİLEMEZ.
// Ergonomi için fırlatan bir ikiz (`ThemeContractError`) da sunuluyor —
// çağıran taraf ayrımlı birleşimi kendi elleriyle daraltmak istemiyorsa
// `issues`'u bir `Error` olarak fırlatıp CLAUDE.md §4'ün genel akışına
// (yakalanıp sarmalanıp yukarı iletilme) katılabilir.
//
// `ThemeContractSuccess<T>`'in `warnings` alanı HER ZAMAN var (boşsa `[]`) —
// opsiyonel değil, çünkü tüketicinin `result.warnings` erişimi için önce
// `'warnings' in result` kontrolü yapmasını İSTEMİYORUZ; başarı dalında her
// zaman dizi garantisi, tüketim kodunu basitleştirir.

/**
 * Tema sözleşmesinin 15 kararlı hata kodu. Bu birleşimin KENDİSİ platformun
 * makineler arası sözleşmesidir — bir kod SİLİNMESİ veya ANLAMININ
 * değişmesi **major**'dır (CLAUDE.md §9). Yeni kod EKLEMEK (additive)
 * **minor**'dır. `messages.ts`'teki `THEME_CONTRACT_MESSAGES` tablosu bu
 * birleşimin EKSİKSİZ kapsandığını `satisfies Record<...>` ile derleme
 * zamanında zorlar — yeni bir kod eklenip karşılık gelen mesaj
 * unutulursa `pnpm typecheck` KIRILIR.
 */
export type ThemeContractErrorCode =
  | 'THEME_MANIFEST_UNKNOWN_KEY'
  | 'THEME_MANIFEST_INVALID'
  | 'THEME_ID_INVALID'
  | 'THEME_SDK_RANGE_INVALID'
  | 'THEME_TEMPLATE_UNKNOWN'
  | 'THEME_TEMPLATE_MISSING'
  | 'THEME_TEMPLATE_DUPLICATE'
  | 'THEME_SETTING_KEY_UNSAFE'
  | 'THEME_SETTING_INVALID'
  | 'THEME_ASSET_REF_INVALID'
  | 'THEME_MIGRATION_MISSING'
  | 'THEME_MIGRATION_GAP'
  | 'THEME_MIGRATION_DUPLICATE'
  | 'THEME_MIGRATION_CYCLE'
  | 'THEME_MIGRATION_RESULT_INVALID'

/**
 * Tek bir doğrulama bulgusu. `path` okunur bir alan yolu metnidir
 * (`src/paths.ts` → `formatThemeContractPath`, ör. `templates[2].slots[0].id`);
 * `message` Türkçe GELİŞTİRİCİ metnidir (bkz. `messages.ts` dosya başı
 * yorumu — i18n anahtarı DEĞİLDİR).
 */
export interface ThemeContractIssue {
  readonly code: ThemeContractErrorCode
  readonly path: string
  readonly message: string
}

/**
 * Doğrulama başarılı olduğunda dönen dal. `warnings` her zaman VARDIR
 * (boşsa `[]`) — "SOY ama RAPORLA" güven sınırının taşıyıcısı (AC5, S3'ün
 * işi): bilinmeyen bir ayar anahtarı soyulup `value`'dan çıkarılabilir ama
 * bu olay sessiz değildir, `warnings`'e yazılır.
 */
export interface ThemeContractSuccess<T> {
  readonly ok: true
  readonly value: T
  readonly warnings: readonly ThemeContractIssue[]
}

/** Doğrulama başarısız olduğunda dönen dal. Tek bir issue yerine LİSTE — bir çağrı çok sayıda bulgu üretebilir (yukarıdaki dosya başı yorumu, madde a). */
export interface ThemeContractFailure {
  readonly ok: false
  readonly issues: readonly ThemeContractIssue[]
}

/**
 * Tema sözleşmesi doğrulama fonksiyonlarının (S3/S5) dönüş tipi.
 * `ok` discriminant'ı sayesinde `result.value`'ya daraltma olmadan erişmek
 * derleme hatası verir — CLAUDE.md §4'ün "çağıranı tahmine zorlama" ilkesi
 * burada derleyici tarafından MEKANİK olarak sağlanır (dosya başı yorumuna
 * bakınız).
 */
export type ThemeContractResult<T> = ThemeContractSuccess<T> | ThemeContractFailure

/**
 * `ThemeContractResult`'ın fırlatan ikizi. Çağıran taraf ayrımlı birleşimi
 * kendi elleriyle daraltmak istemiyorsa (ör. bir tRPC prosedürünün üst
 * katmanında) `issues`'u bu sınıfla fırlatıp CLAUDE.md §4'ün genel akışına
 * (yakala → sarmala → yukarı ilet) katılabilir. Bu paket `AppError`'dan
 * TÜREMEZ — `@arkesoft/errors` bu paketin kapalı bağımlılık listesinde
 * YOK (architect kararı: `AppError` `httpStatus` taşır, bu paket HTTP
 * bilmez — bkz. README "Yapmaz" sütunu).
 *
 * `assertThemeManifest()` gibi fırlatan yardımcıları KURMAK S5'in işi; bu
 * sınıf yalnızca taşıyıcı tip/sözleşmedir.
 */
export class ThemeContractError extends Error {
  readonly issues: readonly ThemeContractIssue[]

  constructor(issues: readonly ThemeContractIssue[]) {
    super(formatThemeContractIssuesMessage(issues))
    this.name = 'ThemeContractError'
    this.issues = issues

    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

/** `ThemeContractError` mesajını issue listesinden üretir — her issue `code@path: message` biçiminde, `; ` ile birleştirilir. */
function formatThemeContractIssuesMessage(issues: readonly ThemeContractIssue[]): string {
  if (issues.length === 0) {
    return 'theme-sdk: doğrulama başarısız (issue listesi boş)'
  }

  return issues.map((issue) => `${issue.code}@${issue.path}: ${issue.message}`).join('; ')
}
