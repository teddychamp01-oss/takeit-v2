/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — primary orange (#F97316 = 500)
        primary: {
          DEFAULT: '#F97316',
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },
        // Cream page background
        cream: '#FDF8F3',
        // Ink — dark navy text
        ink: {
          DEFAULT: '#1E2A3B',
          light: '#44546A',
          faint: '#8593A9',
        },
        // Verified green
        verified: {
          DEFAULT: '#16A34A',
          light: '#DCFCE7',
        },
        // Status colors (job/booking badges)
        status: {
          open: '#0284C7',
          matched: '#7C3AED',
          progress: '#EA580C',
          done: '#16A34A',
          disputed: '#DC2626',
          cancelled: '#64748B',
        },
      },
      fontFamily: {
        // System-only stack. Noto Sans Ethiopic ships on Android and covers
        // Ge'ez script; NEVER fetch remote fonts (low-end-first, C6).
        sans: [
          'Noto Sans Ethiopic',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      // Warm-tinted shadows — values live as CSS vars in src/index.css so the
      // tint stays next to the gradient it is derived from.
      boxShadow: {
        card: 'var(--shadow-card)',
        button: 'var(--shadow-button)',
        elevated: 'var(--shadow-elevated)',
      },
      // 44px minimum touch target (h-touch / w-touch / min-h-touch …)
      spacing: {
        touch: '2.75rem',
      },
      minHeight: {
        touch: '2.75rem',
      },
      minWidth: {
        touch: '2.75rem',
      },
    },
  },
  plugins: [],
};
