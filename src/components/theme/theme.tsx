'use client'

/**
 * Theme system (DESIGN §2.2/§6, FR-41, AC-46). First visit follows
 * prefers-color-scheme; an explicit System/Light/Dark choice persists in
 * localStorage thereafter. Theme switches the whole UI via the `.dark` class on
 * <html>, driving the semantic tokens — never a hardcoded inversion.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'
export const THEME_STORAGE_KEY = 'tess-theme'

interface ThemeContextValue {
  /** The user's stored preference (system/light/dark). */
  preference: ThemePreference
  /** The resolved theme actually applied (light/dark). */
  resolved: 'light' | 'dark'
  setPreference: (p: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(pref: ThemePreference): 'light' | 'dark' {
  const resolved = pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  return resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [resolved, setResolved] = useState<'light' | 'dark'>('light')

  // Hydrate from storage (the inline script already applied the class to avoid FOUC).
  useEffect(() => {
    const stored = (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null) ?? 'system'
    setPreferenceState(stored)
    setResolved(applyTheme(stored))
  }, [])

  // React to OS theme changes while preference is "system".
  useEffect(() => {
    if (preference !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolved(applyTheme('system'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((p: ThemePreference) => {
    localStorage.setItem(THEME_STORAGE_KEY, p)
    setPreferenceState(p)
    setResolved(applyTheme(p))
  }, [])

  return (
    <ThemeContext.Provider value={{ preference, resolved, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

/**
 * Inline script string injected before hydration to apply the stored/system
 * theme synchronously (prevents a flash of the wrong theme). AC-46.
 */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var k='${THEME_STORAGE_KEY}';
    var p=localStorage.getItem(k)||'system';
    var dark = p==='dark' || (p==='system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var root=document.documentElement;
    if(dark){root.classList.add('dark');root.style.colorScheme='dark';}
    else{root.style.colorScheme='light';}
  } catch(e){}
})();
`
