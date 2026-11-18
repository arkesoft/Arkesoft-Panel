// @arkesoft/superadmin — panelin TEK TanStack Query istemcisi (ROADMAP
// v0.0.20, T-021/S8, R-PO4)
//
// `retry: false` — `apps/admin/src/app/query-client.ts`'in AYNI gerekçesi:
// "tekrar dene" tıklamasıyla TanStack Query'nin kendi otomatik yeniden
// deneme davranışı birbirine karışmasın.
//
// ⚠⚠ `refetchOnWindowFocus: true` BİLEREK AÇIK (`apps/admin`'den SAPMA,
// R-PO4 — Orkestratör'ün S7'ye bıraktığı karar, S7 çözdü): `platform.
// session` HİÇBİR denetim satırı yazmaz (saf okuma, S7); giriş kaydı
// `requirePlatformAdmin` kapısından (yalnızca `platform.tenantList`/
// `platform.auditLog` çağrılarında tetiklenir) İLK geçişte süreç-içi
// `Set<sessionId>` ile idempotent yazılır. ⇒ `platform.session`'ın kaç kez
// `refetch` edildiği denetim kaydı SAYISINI ETKİLEMEZ (AC-8'in "öncesi + 2"
// sayımı çökmez) — pencereye her geri dönüşte yöneticinin platform
// yetkisinin/2FA durumunun TAZE okunması (ör. başka bir sekmede/panelde
// platform yöneticiliği az önce kaldırıldıysa) bu iç aracın operasyon
// kullanıcısı için makul bir varsayılandır; `tenantList`/`auditLog`
// sorguları ayrı `useQuery` çağrıları olduğu için bu varsayılan onları da
// kapsar ama onlar zaten kullanıcı tetiklemeli ("Yeniden dene") okumalar.
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
})
