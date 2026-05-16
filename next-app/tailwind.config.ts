import type { Config } from 'tailwindcss';

const hsl = (v: string) => `hsl(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        /* ---- 中性 ramp ---- */
        canvas: hsl('--canvas'),
        surface: {
          DEFAULT: hsl('--surface'),
          sunken: hsl('--surface-sunken'),
        },
        'text-1': hsl('--text-1'),
        'text-2': hsl('--text-2'),
        'text-3': hsl('--text-3'),

        /* ---- 数据语义色 (红=涨/盈, 绿=跌/亏) ---- */
        gain: hsl('--gain'),
        loss: hsl('--loss'),
        locked: hsl('--locked'),

        /* ---- 图表单色阶梯 ---- */
        chart: {
          1: hsl('--chart-1'),
          2: hsl('--chart-2'),
          3: hsl('--chart-3'),
          4: hsl('--chart-4'),
        },

        /* ---- shadcn 语义别名 ---- */
        border: {
          DEFAULT: hsl('--border'),
          strong: hsl('--border-strong'),
        },
        input: hsl('--input'),
        ring: hsl('--ring'),
        background: hsl('--background'),
        foreground: hsl('--foreground'),
        primary: {
          DEFAULT: hsl('--primary'),
          foreground: hsl('--primary-foreground'),
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        secondary: { DEFAULT: hsl('--secondary'), foreground: hsl('--secondary-foreground') },
        destructive: { DEFAULT: hsl('--destructive'), foreground: hsl('--destructive-foreground') },
        muted: { DEFAULT: hsl('--muted'), foreground: hsl('--muted-foreground') },
        accent: { DEFAULT: hsl('--accent'), foreground: hsl('--accent-foreground') },
        popover: { DEFAULT: hsl('--popover'), foreground: hsl('--popover-foreground') },
        card: { DEFAULT: hsl('--card'), foreground: hsl('--card-foreground') },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'SF Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        /* 小字不要太小: 最小 12, 正文 14 */
        xs: ['0.75rem', { lineHeight: '1.1rem' }],          /* 12 (原11→12) */
        sm: ['0.8125rem', { lineHeight: '1.2rem' }],        /* 13 (原12→13) */
        base: ['0.875rem', { lineHeight: '1.4rem' }],       /* 14 (原13→14) */
        md: ['0.9375rem', { lineHeight: '1.45rem' }],       /* 15 */
        lg: ['1.0625rem', { lineHeight: '1.6rem' }],        /* 17 */
        xl: ['1.25rem', { lineHeight: '1.45' }],            /* 20 */
        '2xl': ['1.5rem', { lineHeight: '1.25' }],          /* 24 */
        hero: ['2rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }], /* 32 */
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '10px',
        '2xl': '14px',
      },
      boxShadow: {
        /* 尽量不用阴影: e1 完全去阴影(靠 hairline 边框分层),
           e2/e3 仅浮层(下拉/弹窗)需要时给极淡分离 */
        e1: 'none',
        e2: '0 2px 8px hsl(var(--text-1) / 0.06)',
        e3: '0 8px 28px hsl(var(--text-1) / 0.10)',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(.2, 0, 0, 1)',
      },
      transitionDuration: {
        fast: '120ms',
        DEFAULT: '180ms',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.18s cubic-bezier(.2,0,0,1)',
        'accordion-up': 'accordion-up 0.18s cubic-bezier(.2,0,0,1)',
        'fade-in': 'fade-in 0.18s cubic-bezier(.2,0,0,1)',
        'slide-up': 'slide-up 0.25s cubic-bezier(.2,0,0,1)',
      },
    },
  },
  plugins: [],
};

export default config;
