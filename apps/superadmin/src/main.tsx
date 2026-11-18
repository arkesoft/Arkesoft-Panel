// @arkesoft/superadmin — uygulama giriş noktası (ROADMAP v0.0.20, T-021/S8,
// `apps/admin/src/main.tsx`'in BİREBİR deseni)
//
// Panelin TEK `QueryClient`/`router` örneğini birleştirir. Rota başına
// `<title>` güncellemesi her rota bileşeninin kendi `useEffect`'inde yapılır.
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
