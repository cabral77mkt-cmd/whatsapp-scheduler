import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    `${__dirname}/index.html`,
    `${__dirname}/src/**/*.{js,jsx}`,
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        /* ── Backward-compat: módulos já usam essas classes ── */
        whatsapp: {
          green: '#25D366',
          dark:  '#128C7E',
          light: '#DCF8C6',
        },
        crm: {
          orange: '#F97316',
          dark:   '#9A3412',
          light:  '#FED7AA',
        },

        /* ── Design tokens (preto + dourado) ──────────────── */
        canvas:  '#0a0a0a',
        sidebar: '#000000',
        surface: {
          DEFAULT: '#111111',
          2:       '#161616',
          hover:   '#1a1a1a',
          active:  '#1f1f1f',
        },
        'bg-input': '#0f0f0f',

        gold: {
          300: '#F9D97F',
          400: '#F5C46B',
          500: '#D4AF37',
          600: '#B8960C',
          700: '#8B6914',
        },

        'txt-primary':   '#FAFAFA',
        'txt-secondary': '#A1A1AA',
        'txt-muted':     '#52525B',
        'txt-disabled':  '#3F3F46',

        'bdl-default': '#1F1F1F',
        'bdl-strong':  '#2A2A2A',
        'bdl-focus':   '#D4AF37',

        success: '#10B981',
        warning: '#F59E0B',
        danger:  '#EF4444',
        info:    '#3B82F6',
      },

      boxShadow: {
        gold: '0 0 0 1px rgba(212,175,55,0.30), 0 4px 12px rgba(212,175,55,0.15)',
      },

      borderRadius: {
        xs:  '4px',
        sm:  '6px',
        md:  '8px',
        lg:  '12px',
        xl:  '16px',
        '2xl': '20px',
      },
    },
  },
  plugins: [],
};
