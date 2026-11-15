/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        sidebar: 'var(--sidebar)',
        hover: 'var(--hover)',
        active: 'var(--active)',
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          faint: 'var(--ink-faint)',
        },
        line: {
          DEFAULT: 'var(--line)',
          subtle: 'var(--line-subtle)',
          strong: 'var(--line-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          subtle: 'var(--accent-subtle)',
        },
        critical: {
          DEFAULT: 'var(--critical)',
          bg: 'var(--critical-bg)',
          border: 'var(--critical-border)',
        },
        high: {
          DEFAULT: 'var(--high)',
          bg: 'var(--high-bg)',
          border: 'var(--high-border)',
        },
        medium: {
          DEFAULT: 'var(--medium)',
          bg: 'var(--medium-bg)',
          border: 'var(--medium-border)',
        },
        low: {
          DEFAULT: 'var(--low)',
          bg: 'var(--low-bg)',
          border: 'var(--low-border)',
        },
        success: {
          DEFAULT: 'var(--success)',
          bg: 'var(--success-bg)',
        },
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
        'card': '0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 4px 12px -2px rgba(15, 23, 42, 0.03)',
        'float': '0 4px 20px -2px rgba(15, 23, 42, 0.08), 0 2px 6px -1px rgba(15, 23, 42, 0.04)',
      },
    },
  },
  plugins: [],
};
