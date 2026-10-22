import { useState, useEffect, useCallback } from 'react';

export type ThemeMode = 'dark' | 'dim';

const STORAGE_KEY = 'teammate_theme';
const THEME_CHANGE_EVENT = 'teammate_theme_change';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  
  const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
  if (saved === 'dark' || saved === 'dim') {
    return saved;
  }
  return 'dark';
}

function applyThemeToDOM(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  if (theme === 'dim') {
    root.setAttribute('data-theme', 'dim');
    root.setAttribute('data-dim', 'true');
  } else {
    root.setAttribute('data-theme', 'dark');
    root.removeAttribute('data-dim');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    applyThemeToDOM(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Sync across tabs and components
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'dark' || e.newValue === 'dim')) {
        setThemeState(e.newValue);
        applyThemeToDOM(e.newValue);
      }
    };

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<ThemeMode>;
      if (customEvent.detail) {
        setThemeState(customEvent.detail);
        applyThemeToDOM(customEvent.detail);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(THEME_CHANGE_EVENT, handleCustomEvent);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(THEME_CHANGE_EVENT, handleCustomEvent);
    };
  }, []);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    applyThemeToDOM(nextTheme);
    localStorage.setItem(STORAGE_KEY, nextTheme);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: nextTheme }));
  }, []);

  return { theme, setTheme };
}
