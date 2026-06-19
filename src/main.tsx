/**
 * SPA entry (replaces the Next root layout + hydration). Mounts the shared
 * provider tree (auth + theme + tooltip + toast) around the react-router
 * RouterProvider, and loads the existing token-driven global stylesheet.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Providers } from '@/components/providers'
import { router } from '@/router'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </React.StrictMode>,
)
