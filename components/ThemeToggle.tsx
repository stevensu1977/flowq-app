import React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ showLabel = false, size = 'md' }) => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;

  const themes = [
    { id: 'light' as const, icon: <Sun size={iconSize} />, label: 'Light' },
    { id: 'dark' as const, icon: <Moon size={iconSize} />, label: 'Dark' },
    { id: 'system' as const, icon: <Monitor size={iconSize} />, label: 'System' },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id)}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
            theme === t.id
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
          title={t.label}
        >
          {t.icon}
          {showLabel && <span>{t.label}</span>}
        </button>
      ))}
    </div>
  );
};

// Simple toggle button (just light/dark)
export const ThemeToggleButton: React.FC<{ size?: number }> = ({ size = 18 }) => {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
      title={resolvedTheme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {resolvedTheme === 'light' ? <Moon size={size} /> : <Sun size={size} />}
    </button>
  );
};

export default ThemeToggle;
