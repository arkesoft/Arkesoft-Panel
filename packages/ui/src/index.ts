// @arkesoft/ui — Paylaşılan shadcn/ui bileşenleri ve şema→form motoru
//
// ROADMAP v0.0.1 iskeleti. Bileşenler v0.0.7'de eklendi (T-008/S2):
// Button, Input, Card (+CardHeader/CardTitle/CardContent), Toast, DataTable.
// Bu paket veri çekmez (CLAUDE.md §3) — beşi de yalnızca sunum. Token
// doğruluk kaynağı `tokens.ts`; CSS temsili `./theme.css` alt yolundan
// (Tailwind v4 `@theme`) tüketilir.
//
// Toast ve DataTable'ın v0.0.7'de tüketicisi YOK (docs/ui/T-008.md) —
// gizlenmiyor, burada açıkça belgeleniyor; bkz. ilgili dosyaların başındaki
// yorumlar.

/** Paketin workspace içindeki adı. Sürüm bilgisi package.json'dan okunur. */
export const PACKAGE_NAME = '@arkesoft/ui'

/** {@link PACKAGE_NAME} değerinin literal tipi. */
export type PackageName = typeof PACKAGE_NAME

export { cn } from './lib/cn'

export {
  COLOR_TOKENS,
  CONTRAST_PAIRS,
  FOCUS_RING_CLASS_NAMES,
  type ColorToken,
  type ContrastPair,
  type ContrastThreshold,
} from './tokens'

export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './components/Button'
export { Input, type InputProps } from './components/Input'
// `CardHeader`/`CardTitle` de — `Toast`/`DataTable` gibi — v0.0.7'de
// `apps/admin`'den TÜKETİCİSİZ export edilir. Bu, solid tur 1 bulgusunun
// (L4: barrel'daki tüketicisiz export'lar) AC15 kaydına EKLENMESİDİR —
// `docs/ui/T-008.md` AC15 önceden yalnızca Toast/DataTable'ı kayda geçirmişti,
// bu ikisi kayıt DIŞIYDI. Kod SİLİNMEDİ: AC15 beşinin de (Button, Input,
// Card+alt bileşenleri, Toast, DataTable) dışa açılmasını istiyor. `perf`
// tur 1'de tree-shaking'in bu dördü için 0 KiB bundle maliyeti ürettiğini
// doğruladı (`grep` ile derlenmiş `dist/assets/*.js` içinde 0 eşleşme) —
// barrel'a rağmen ölü ağırlık yok.
export {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  type CardContentProps,
  type CardHeaderProps,
  type CardProps,
  type CardTitleProps,
} from './components/Card'
export { Toast, type ToastProps, type ToastVariant } from './components/Toast'
export {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
  type DataTableRow,
} from './components/DataTable'

// ROADMAP v0.0.15 (T-016/S10, docs/ui/T-016-iki-faktorlu-dogrulama.md "Yeni
// bileşen önerileri") — üç yeni sunum bileşeni. Radix GİRMİYOR (T-008'in
// bağlayıcı kararı korunuyor); `ConfirmDialog` (Radix `Dialog` gerektiriyor)
// bu yüzden `apps/admin`'de kalıyor, buradan export EDİLMİYOR.
export { Skeleton, type SkeletonProps } from './components/Skeleton'
export { Checkbox, type CheckboxProps } from './components/Checkbox'
export { CopyButton, type CopyButtonProps } from './components/CopyButton'
