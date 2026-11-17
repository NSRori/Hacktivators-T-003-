import { useEffect, useState } from 'react'

/* Light / dark mode. The colours themselves live in src/theme.css; this only flips <html data-theme> and
   remembers the choice. index.html applies the saved theme before the first paint. */
const KEY = 'ddt.theme.v1'
const subs = new Set()

export const getTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

export function setTheme(t) {
  const root = document.documentElement
  root.classList.add('theme-swap')                    // cross-fade colours for one moment, then get out of the way
  root.dataset.theme = t
  try { localStorage.setItem(KEY, t) } catch { /* private mode: still switches for this visit */ }
  subs.forEach((fn) => fn(t))
  window.setTimeout(() => root.classList.remove('theme-swap'), 420)
}

export const toggleTheme = () => setTheme(getTheme() === 'light' ? 'dark' : 'light')

export function useTheme() {
  const [t, setT] = useState(getTheme)
  useEffect(() => { subs.add(setT); return () => { subs.delete(setT) } }, [])
  return t
}
