/**
 * SPA entry (replaces the Next root layout + hydration). Mounts the shared
 * provider tree (auth + tooltip + toast) around the react-router
 * RouterProvider, and loads the brand fonts + token-driven global stylesheet.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from '@/components/providers'
import { router } from '@/router'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/source-serif-4/400.css'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </React.StrictMode>,
)
