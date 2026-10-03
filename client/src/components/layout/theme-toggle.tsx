'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const current = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
    setTheme(current);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('ca-theme', next);
    } catch {}
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-small text-fg-muted hover:bg-surface-hover hover:text-fg"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      <span className="flex items-center gap-2">
        {theme === 'light' ? (
          <Sun className="h-4 w-4 text-amber-500" aria-hidden="true" />
        ) : (
          <Moon className="h-4 w-4 text-indigo-400" aria-hidden="true" />
        )}
        <span className="capitalize">{theme} Theme</span>
      </span>
      <span className="text-caption text-fg-subtle">Toggle</span>
    </Button>
  );
}
