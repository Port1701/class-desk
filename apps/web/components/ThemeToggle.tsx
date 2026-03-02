'use client';

import { useTheme } from '@/lib/theme-context';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className="p-2 rounded-lg transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
          <title>Moon icon</title>
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      ) : (
        <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
          <title>Sun icon</title>
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.293 1.707a1 1 0 011.414-1.414l.707.707a1 1 0 11-1.414 1.414l-.707-.707zm2 2a1 1 0 011.414 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707zm2 4a1 1 0 110 2h-1a1 1 0 110-2h1zm-2 10a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 1.414l-.707.707zM3.707 2.293a1 1 0 01.707 1.707L3.707 4.707a1 1 0 01-1.414-1.414l.707-.707zm2 2a1 1 0 11-1.414 1.414L2.293 4.707a1 1 0 011.414-1.414l.707.707zM2 10a1 1 0 110-2h1a1 1 0 110 2H2zm11.293 9.293a1 1 0 011.414 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707zM10 18a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zm-4.707-2.293a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414l-.707.707z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </button>
  );
};

export default ThemeToggle;
