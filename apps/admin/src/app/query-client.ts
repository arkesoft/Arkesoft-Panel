// @arkesoft/admin — panelin TEK TanStack Query istemcisi (ROADMAP v0.0.7,
// T-008/S4, architect K3).
//
// `retry: false` + `refetchOnWindowFocus: false` BAĞLAYICI: AC9(b)'nin
// "tıklanınca istek YENİDEN gidiyor, İKİNCİ istek ağ kaydında" ölçümü
// varsayılan davranışla (3 otomatik yeniden deneme + pencere odağında
// otomatik yeniden çekme) SAYILAMAZ hâle gelir — hangi isteğin kullanıcının
// "tekrar dene" tıklamasından geldiği, hangisinin TanStack Query'nin kendi
// otomatik davranışından geldiği ayırt edilemez.
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})
