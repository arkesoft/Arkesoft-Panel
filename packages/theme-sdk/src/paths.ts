// @arkesoft/theme-sdk — Zod `issue.path` → okunur alan yolu (ROADMAP v0.0.9,
// T-010/S2, architect "AC3" notu)
//
// Zod'un `issue.path` alanı `(string | number)[]` biçiminde ham bir segment
// dizisidir (ör. `['templates', 2, 'slots', 0, 'id']`) — bu, `errors.ts`'teki
// `ThemeContractIssue.path`'in ÇIPLAK HALİ değildir; o alan BU modülün
// ürettiği OKUNUR metni taşır (`templates[2].slots[0].id`). S3 (ayarlar) ve
// S5 (manifest) kendi Zod `safeParse` sonuçlarını `ThemeContractIssue`'ya
// dönüştürürken bu fonksiyonu çağırır — ham segment dizisini kendileri
// biçimlendirmez (tek biçimlendirme noktası, tutarlılık garantisi).
//
// Biçimlendirme kuralı: string segment → `.key` (ilk segmentte baştaki `.`
// YOK), sayı segment → `[n]` (konumu fark etmez, baştaki `.` asla eklenmez).
// Kenar durumlar (testle pinlendi, `__tests__/paths.test.ts`):
//   - boş yol (kök nesnenin kendisi geçersiz) → boş dize `''` döner. Bu,
//     "segment yok" ile "kök" anlamını AYNI boş dizeyle temsil eder — çağıran
//     taraf (S3/S5) kök hatasını `path: ''` ile raporlar.
//   - sayı ile BAŞLAYAN yol (ör. `[0, 'id']`, bir dizinin kök seviyede
//     olduğu senaryo) → `[0].id`; baştaki `.` burada da YOK, ilk segment
//     sayı olduğu için zaten `[` ile başlar.

/** Zod `issue.path`'teki tek bir segment — ya bir nesne anahtarı (string) ya da bir dizi indeksi (number). */
export type ThemeContractPathSegment = string | number

/**
 * Bir segment dizisini okunur bir alan yoluna çevirir. `['templates', 2,
 * 'slots', 0, 'id']` → `'templates[2].slots[0].id'`. Boş dizi için `''`
 * (kök) döner.
 */
export function formatThemeContractPath(path: readonly ThemeContractPathSegment[]): string {
  let result = ''

  for (const segment of path) {
    if (typeof segment === 'number') {
      result += `[${String(segment)}]`
    } else if (result.length === 0) {
      result += segment
    } else {
      result += `.${segment}`
    }
  }

  return result
}
