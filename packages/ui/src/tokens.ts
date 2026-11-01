// @arkesoft/ui — Tasarım token'ları (ROADMAP v0.0.7, T-008/S2)
//
// DOĞRULUK KAYNAĞI. `src/theme.css`'teki Tailwind v4 `@theme` bloğu bu
// dosyadaki `COLOR_TOKENS` ile BİREBİR aynı hex değerlerini tekrarlar —
// `__tests__/tokens.test.ts` ikisini `node:fs` ile karşılaştırıp pinler
// (ADR-0009 madde 5 deseni). Bir renk eklenirken/değiştirilirken İKİ dosya
// da aynı değişiklikte güncellenir.
//
// Hex değerleri ve bildirilmiş metin/zemin çiftleri `docs/ui/T-008.md`
// ("Tasarım token'ları" / `CONTRAST_PAIRS`) planından BİREBİR alındı — `ui`
// ajanı her çifti WCAG 2.1 formülüyle elle hesapladı. Bu modüldeki
// `calculateContrastRatio` aynı formülü makine tarafından uygular;
// `tokens.test.ts` onu çalıştırıp eşiklerle karşılaştırır.

/**
 * Renk token'ları — CSS özel özellik adı → hex değer. `theme.css`'teki
 * `@theme` bloğuyla pin testiyle senkron tutulur.
 */
export const COLOR_TOKENS = {
  '--color-surface': '#FFFFFF',
  '--color-surface-muted': '#F1F5F9',
  '--color-text-primary': '#0F172A',
  '--color-text-secondary': '#475569',
  '--color-text-disabled': '#94A3B8',
  '--color-text-inverse': '#FFFFFF',
  '--color-brand-500': '#2563EB',
  '--color-brand-50': '#EFF6FF',
  '--color-border': '#64748B',
  '--color-border-subtle': '#E2E8F0',
  '--color-danger-500': '#DC2626',
  '--color-danger-600': '#B91C1C',
  '--color-danger-surface': '#FEF2F2',
  '--color-success-600': '#15803D',
  '--color-success-surface': '#F0FDF4',
  '--color-focus-ring': '#2563EB',
} as const satisfies Record<string, string>

/** {@link COLOR_TOKENS} anahtarlarının literal birleşimi. */
export type ColorToken = keyof typeof COLOR_TOKENS

/** AC13'ün eşik sınıfları: normal metin ≥4.5:1, büyük metin/UI sınırı/odak ≥3:1. */
export type ContrastThreshold = 4.5 | 3

/** Bildirilmiş bir metin/zemin kontrast çifti. */
export interface ContrastPair {
  /** İnsan tarafından okunur etiket (rapor/hata mesajında kullanılır). */
  readonly label: string
  readonly textHex: string
  readonly backgroundHex: string
  readonly threshold: ContrastThreshold
}

/**
 * AC13 — bildirilmiş metin/zemin çiftleri. Her girdi `docs/ui/T-008.md`
 * "`CONTRAST_PAIRS` (AC13 — hesaplanmış oranlar)" tablosundaki satırın
 * birebir karşılığıdır. `tokens.test.ts` her çift için
 * {@link calculateContrastRatio}'yu çalıştırıp eşiği assert eder.
 *
 * RİSK (ui'nin bildirdiği dar pay): `success-600`/`success-surface`
 * **4.79:1** ile 4.5 eşiğine yakın — bu token'ı değiştiren biri testi
 * kırabilir, bu KASITLI (plan notu). Aynı desende ikinci bir dar pay:
 * sidebar **aktif** link `brand-500`/`brand-50` **4.75:1** — `wcag`'ın
 * `getComputedStyle` ölçümü (tur1 §2.6 satır 295, tur2 §4) ile bu
 * dosyadaki `calculateContrastRatio(COLOR_TOKENS['--color-brand-500'],
 * COLOR_TOKENS['--color-brand-50'])` bağımsızca **aynı** sonucu veriyor
 * (4.75:1, düzeltme turu 2'de `ui` ajanı tarafından yeniden hesaplandı).
 * Sidebar **pasif** link `text-primary`/`surface-muted` için `wcag` tur1
 * **16.28:1** ölçtü, tur2'nin kendi yeniden hesabı ve bu dosyanın
 * fonksiyonuyla yapılan bağımsız hesap **16.30:1** veriyor — küçük fark
 * (±0.02) tur1'in elle hesabındaki yuvarlama farkından kaynaklanıyor
 * görünüyor, ikisi de 4.5 eşiğinin çok üzerinde (dar pay DEĞİL), bu
 * uyuşmazlık fonksiyonel bir sonucu değiştirmiyor — kayıt amacıyla
 * burada açıkça not edildi (uydurulmuş bir sayı YOK, iki ölçüm de
 * kaynak gösterilerek aktarıldı). Bu iki çift önceden `CONTRAST_PAIRS`
 * DIŞINDAYDI ve `--color-brand-50`/`--color-surface-muted` hiçbir testte
 * pinlenmiyordu (`wcag` tur2 §4 bulgusu) — aşağıya eklendi.
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  {
    label: 'text-primary / surface',
    textHex: COLOR_TOKENS['--color-text-primary'],
    backgroundHex: COLOR_TOKENS['--color-surface'],
    threshold: 4.5,
  },
  {
    label: 'text-secondary / surface',
    textHex: COLOR_TOKENS['--color-text-secondary'],
    backgroundHex: COLOR_TOKENS['--color-surface'],
    threshold: 4.5,
  },
  {
    label: 'text-inverse / brand-500 (buton metni)',
    textHex: COLOR_TOKENS['--color-text-inverse'],
    backgroundHex: COLOR_TOKENS['--color-brand-500'],
    threshold: 4.5,
  },
  {
    label: 'text-inverse / danger-500 (destructive buton metni, v0.0.7 tüketicisi yok)',
    textHex: COLOR_TOKENS['--color-text-inverse'],
    backgroundHex: COLOR_TOKENS['--color-danger-500'],
    threshold: 4.5,
  },
  {
    label: 'danger-600 (hata metni) / surface',
    textHex: COLOR_TOKENS['--color-danger-600'],
    backgroundHex: COLOR_TOKENS['--color-surface'],
    threshold: 4.5,
  },
  {
    label: 'danger-600 / danger-surface',
    textHex: COLOR_TOKENS['--color-danger-600'],
    backgroundHex: COLOR_TOKENS['--color-danger-surface'],
    threshold: 4.5,
  },
  {
    label: 'success-600 / success-surface (dar pay — bkz. not)',
    textHex: COLOR_TOKENS['--color-success-600'],
    backgroundHex: COLOR_TOKENS['--color-success-surface'],
    threshold: 4.5,
  },
  {
    label: 'border (UI sınırı) / surface',
    textHex: COLOR_TOKENS['--color-border'],
    backgroundHex: COLOR_TOKENS['--color-surface'],
    threshold: 3,
  },
  {
    label: 'danger-500 (hata sınırı) / surface',
    textHex: COLOR_TOKENS['--color-danger-500'],
    backgroundHex: COLOR_TOKENS['--color-surface'],
    threshold: 3,
  },
  {
    label: 'focus-ring / surface (AC12 odak göstergesi)',
    textHex: COLOR_TOKENS['--color-focus-ring'],
    backgroundHex: COLOR_TOKENS['--color-surface'],
    threshold: 3,
  },
  {
    label: 'sidebar aktif link (brand-500 / brand-50, dar pay — bkz. not)',
    textHex: COLOR_TOKENS['--color-brand-500'],
    backgroundHex: COLOR_TOKENS['--color-brand-50'],
    threshold: 4.5,
  },
  {
    label: 'sidebar pasif link (text-primary / surface-muted)',
    textHex: COLOR_TOKENS['--color-text-primary'],
    backgroundHex: COLOR_TOKENS['--color-surface-muted'],
    threshold: 4.5,
  },
] as const

/**
 * AC12 — tek izinli odak göstergesi sınıf listesi (çıplak hâli tek başına
 * YASAK, docs/ui/T-008.md). Bu sabit tek yerde tutulur, `Button`/`Input`
 * onu `cn()` ile kendi sınıf listelerine katar — grep çıktısı tek kaynağa
 * iner.
 *
 * KURAL (kalıcı — tarihçe DEĞİL, ileride de geçerli): bu sabit bir `.ts`
 * dosyasında yaşıyor (`.tsx` DEĞİL). Tüketen her uygulamanın Tailwind v4
 * `@source` globu, bu sabitten üretilen utility'leri (`ring-(--color-focus-ring)`
 * vb.) derleyebilmek için `.ts` dosyalarını da TARAMAK ZORUNDADIR — aksi
 * halde odak göstergesi hiçbir derleme hatası vermeden SESSİZCE kaybolur
 * (WCAG 2.4.11/2.4.13) ve hiçbir test bunu yakalamaz (derlenmiş CSS'te
 * utility'nin kendisi hiç oluşmaz, "yanlış" bir değer de yazılmaz).
 * `apps/admin` bu şartı kendi `styles.css`'indeki `@source` globunda
 * `.ts`'i de kapsayacak şekilde karşılıyor (düzeltme turu 1, solid M1/
 * wcag M2 bulgusunun kapanışı — `Sidebar.tsx`/`UserMenu.tsx`'teki literal
 * odak halkası kopyaları da aynı turda bu sabiti ithal edecek şekilde
 * değiştirildi). Satır numarası buraya BİLEREK pinlenmiyor — `apps/admin`
 * başka bir ajanın (`frontend`/S5) dosyası, numara kayar; glob'un güncel
 * hâlini doğrulamak isteyen `apps/admin/src/styles.css`'teki `@source`
 * satırını okur. Bu sabiti tüketen yeni bir uygulama (`apps/superadmin`
 * gibi) eklendiğinde aynı şart onun `@source` globu için de geçerlidir.
 */
export const FOCUS_RING_CLASS_NAMES =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-(--color-focus-ring)'

/** `#RRGGBB` onaltılık rengi `[r, g, b]` (0-255) bileşenlerine ayırır. */
function hexToRgb(hex: string): readonly [number, number, number] {
  const normalized = hex.replace('#', '')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return [r, g, b]
}

/** Tek bir sRGB kanalını (0-255) WCAG 2.1'in doğrusal (linear) uzayına çevirir. */
function toLinearChannel(channel8Bit: number): number {
  const srgb = channel8Bit / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.1 bağıl parlaklık (relative luminance): `L = 0.2126·R + 0.7152·G + 0.0722·B`. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * toLinearChannel(r) + 0.7152 * toLinearChannel(g) + 0.0722 * toLinearChannel(b)
}

/**
 * WCAG 2.1 kontrast oranını hesaplar: `(L_açık + 0.05) / (L_koyu + 0.05)`.
 * Girdi sırası fark etmez — fonksiyon açık/koyu ayrımını kendisi yapar.
 */
export function calculateContrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA)
  const luminanceB = relativeLuminance(hexB)
  const lighter = Math.max(luminanceA, luminanceB)
  const darker = Math.min(luminanceA, luminanceB)
  return (lighter + 0.05) / (darker + 0.05)
}
