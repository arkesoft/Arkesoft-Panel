// @arkesoft/admin — uygulama giriş noktası (ROADMAP v0.0.7, T-008/S5)
//
// Panelin TEK `QueryClient`/`router` örneğini (S4/S5) birleştirir. Rota
// başına `<title>` güncellemesi her rota bileşeninin kendi `useEffect`'inde
// yapılır (`document.title = ...`) — ayrı bir head-yönetim API'si/bağımlılığı
// EKLENMEDİ (V1 istisnaları listesinde yok, basit ve yeterli).
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { queryClient } from './app/query-client.js'
import { router } from './app/router.js'
import './styles.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('#root elemanı bulunamadı — index.html bozulmuş olabilir.')
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
