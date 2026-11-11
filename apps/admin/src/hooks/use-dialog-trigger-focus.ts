// @arkesoft/admin — useDialogTriggerFocus (ROADMAP v0.0.15.1, T-017,
// `solid` FIX turu 2/MED-1 bulgusu — bağlayıcı):
//
//   "ActiveSessionsCard.tsx:85,126-130 ↔ TwoFactorStatusCard.tsx:81,89-93
//    — Radix FocusScope odak-geri-verme geçici çözümü (ref + setTimeout(…,0)
//    + .focus() + ~8 satır gerekçe yorumu) iki kartta birebir tekrarlanıyor…
//    tek sebeple birlikte değişmek zorunda."
//
// `apps/admin`'in İLK özel hook'u (ölçüldü: bu düzeltmeden önce `use[A-Z]`
// bildirimi SIFIR) — tek kullanımlık soyutlama DEĞİL, iki çağrı yeri
// (`ActiveSessionsCard`/`TwoFactorStatusCard`) ZATEN VAR.
//
// ⚠⚠ wcag tur 2a/2b'nin ÖLÇTÜĞÜ, KABUL ETTİĞİ mekanizma BİREBİR KORUNUYOR —
// bu SAF bir DRY refactor'u, davranış DEĞİŞMİYOR:
//
// `ConfirmDialog` `<Dialog.Trigger>` KULLANMADIĞI için Radix'in
// `onCloseAutoFocus`'u (kütüphane kaynağında DOĞRULANDI:
// `context.triggerRef.current?.focus()`) NO-OP kalır, düz İPTAL dalında
// (Escape/"Vazgeç"/× tıklama) odak `<body>`'ye DÜŞER. `ConfirmDialog.tsx`'e
// DOKUNMADAN, diyaloğu AÇAN tetikleyici butonu `dialogTriggerRef`'e YAZILIR,
// İPTAL dalında BURADAN geri `focus()` ÇAĞRILIR. Başarı/404/401 dalları
// KENDİ odak çağrılarını KORUR (bu hook'a DOKUNMAZ) — onlar GERÇEK bir ağ
// isteğinin (await) ARDINDAN çalıştıkları için Radix'in `FocusScope`'u o ana
// kadar ZATEN unmount olmuş oluyor.
//
// `focusDialogTriggerAfterClose`'daki `setTimeout(…, 0)` BİLEREK —
// `@radix-ui/react-focus-scope@1.3.1` kaynağında ÖLÇÜLDÜ: `Dialog.Content`'in
// focus trap'ı (`trapped: context.open`) React'in bu state güncellemesini
// (henüz FLUŞLANMAMIŞ, asenkron) commit edip `FocusScope`'u unmount edene
// KADAR aktif KALIR; aynı mikro görev içinde (senkron) çağrılan `.focus()`
// trap'ın `focusin` dinleyicisi tarafından HEMEN diyalog içine geri ÇEKİLİR
// (CANLI ölçüldü). `FocusScope`'un KENDİ unmount temizliği de
// `setTimeout(…, 0)` kullanır (aynı dosya) — bizimki ÖNCE KAYDEDİLDİĞİ için
// (olay sırası FIFO) ondan ÖNCE çalışır ve KALICI olur.
//
// ⚠⚠ React'in `react-hooks/refs`/`react-hooks/purity` kuralları (bağlayıcı,
// `ActiveSessionsCard.tsx`'in dosya başı yorumunun AYNI kısıtı): ref
// SADECE gerçek DOM olay işleyicilerinin (`onClick`/`onOpenChange`)
// İÇİNDEN okunur/yazılır — `captureDialogTrigger`/`focusDialogTriggerAfterClose`
// RENDER sırasında ÇAĞRILMAZ, çağıranın kendi olay işleyicisinden ÇAĞRILIR.
import { useRef, type RefObject } from 'react'

/** `captureDialogTrigger`'ın beklediği minimal olay şekli — gerçek `MouseEvent<HTMLButtonElement>`'in alt kümesi, test edilebilirlik için elle genişletilmez. */
export interface DialogTriggerCaptureEvent {
  readonly currentTarget: HTMLButtonElement
}

export interface DialogTriggerFocusHandle {
  /** Diyaloğu açan butonun ref'i — bu hook dışına SIZDIRILMAZ, yalnızca bu dosyadaki iki fonksiyon tarafından okunur/yazılır. */
  readonly dialogTriggerRef: RefObject<HTMLButtonElement | null>
  /** Diyaloğu AÇAN butonun `onClick` işleyicisinden çağrılır — tetikleyiciyi kaydeder. */
  readonly captureDialogTrigger: (event: DialogTriggerCaptureEvent) => void
  /** `ConfirmDialog`'un `onOpenChange(false)` dalından (düz İPTAL — Escape/"Vazgeç"/×) çağrılır. */
  readonly focusDialogTriggerAfterClose: () => void
}

export function useDialogTriggerFocus(): DialogTriggerFocusHandle {
  const dialogTriggerRef = useRef<HTMLButtonElement | null>(null)

  function captureDialogTrigger(event: DialogTriggerCaptureEvent): void {
    dialogTriggerRef.current = event.currentTarget
  }

  function focusDialogTriggerAfterClose(): void {
    setTimeout(() => {
      dialogTriggerRef.current?.focus()
    }, 0)
  }

  return { dialogTriggerRef, captureDialogTrigger, focusDialogTriggerAfterClose }
}
