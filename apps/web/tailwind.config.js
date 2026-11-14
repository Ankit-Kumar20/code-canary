/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        sidebar: 'var(--sidebar)',
        hover: 'var(--hover)',
        ink: { DEFAULT: 'var(--ink)', muted: 'var(--ink-muted)', faint: 'var(--ink-faint)' },
        line: 'var(--line)',
        accent: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)' },
        critical: 'var(--critical)',
        high: 'var(--high)',
        medium: 'var(--medium)',
        low: 'var(--low)',
      },
    },
  },
  plugins: [],
}