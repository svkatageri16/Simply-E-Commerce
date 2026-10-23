import React from 'react';

interface AikyamGlobalFooterProps {
  className?: string;
  theme?: 'dark' | 'light' | 'subtle';
}

export const AikyamGlobalFooter: React.FC<AikyamGlobalFooterProps> = ({
  className = '',
  theme = 'subtle',
}) => {
  const themeClasses =
    theme === 'dark'
      ? 'text-slate-400 bg-slate-950 border-slate-800'
      : theme === 'light'
      ? 'text-slate-500 bg-white border-slate-200'
      : 'text-slate-500 bg-slate-50/50 border-slate-200/80 dark:text-slate-400 dark:bg-slate-900/40 dark:border-slate-800';

  return (
    <footer
      role="contentinfo"
      aria-label="Platform attribution"
      className={`w-full py-4 px-4 text-center text-[11px] sm:text-xs leading-relaxed border-t transition-colors ${themeClasses} ${className}`}
    >
      <p className="max-w-7xl mx-auto break-words">
        <span>© 2026 AIKYAM AI SYSTEMS /</span>{' '}
        <a
          href="https://www.aikyamaisystems.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-slate-400/40 hover:decoration-current hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
        >
          www.aikyamaisystems.com
        </a>
        <span>. All rights reserved. Powered by AIKYAM AI SYSTEMS</span>
      </p>
    </footer>
  );
};
