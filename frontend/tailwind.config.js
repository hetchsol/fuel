/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        'card': '16px',
        'btn': '10px',
        'input': '10px',
        'badge': '8px',
      },
      boxShadow: {
        'card': '0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 8px 40px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.12)',
        'glass': '0 8px 32px rgba(0, 0, 0, 0.12)',
        'glow-blue': '0 0 20px rgba(0, 122, 255, 0.15)',
        'glow-success': '0 0 20px rgba(77, 182, 172, 0.15)',
        'glow-warning': '0 0 20px rgba(255, 193, 7, 0.15)',
        'glow-error': '0 0 20px rgba(239, 83, 80, 0.15)',
        'nav': '0 4px 20px rgba(0, 0, 0, 0.15)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-8px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fill-tank': {
          from: { height: '0%' },
          to: { height: 'var(--fill-level)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'bubble': {
          '0%': { transform: 'translateY(0) scale(1)', opacity: '0.6' },
          '100%': { transform: 'translateY(-100%) scale(0.5)', opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-in-up': 'fade-in-up 0.4s ease-out',
        'fade-in-up-1': 'fade-in-up 0.4s ease-out 0.05s both',
        'fade-in-up-2': 'fade-in-up 0.4s ease-out 0.1s both',
        'fade-in-up-3': 'fade-in-up 0.4s ease-out 0.15s both',
        'fade-in-up-4': 'fade-in-up 0.4s ease-out 0.2s both',
        'fade-in-up-5': 'fade-in-up 0.4s ease-out 0.25s both',
        'scale-in': 'scale-in 0.2s ease-out',
        'slide-down': 'slide-down 0.2s ease-out',
        'fill-tank': 'fill-tank 1s ease-out forwards',
        'shimmer': 'shimmer 2s infinite linear',
        'float': 'float 3s ease-in-out infinite',
        'bubble': 'bubble 2s ease-out infinite',
      },
      colors: {
        surface: {
          bg: 'var(--color-bg)',
          card: 'var(--color-bg-card)',
          border: 'var(--color-border)',
        },
        content: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
        },
        action: {
          primary: 'var(--color-action-primary)',
          'primary-hover': 'var(--color-action-primary-hover)',
          'primary-light': 'var(--color-action-primary-light)',
          secondary: 'var(--color-action-secondary)',
          'secondary-hover': 'var(--color-action-secondary-hover)',
          'secondary-light': 'var(--color-action-secondary-light)',
        },
        fuel: {
          diesel: 'var(--color-fuel-diesel)',
          'diesel-light': 'var(--color-fuel-diesel-light)',
          'diesel-border': 'var(--color-fuel-diesel-border)',
          petrol: 'var(--color-fuel-petrol)',
          'petrol-light': 'var(--color-fuel-petrol-light)',
          'petrol-border': 'var(--color-fuel-petrol-border)',
        },
        status: {
          success: 'var(--color-status-success)',
          'success-light': 'var(--color-status-success-light)',
          pending: 'var(--color-status-pending)',
          'pending-light': 'var(--color-status-pending-light)',
          warning: 'var(--color-status-warning)',
          'warning-light': 'var(--color-status-warning-light)',
          error: 'var(--color-status-error)',
          'error-light': 'var(--color-status-error-light)',
        },
        header: {
          bg: 'var(--color-header-bg)',
          text: 'var(--color-header-text)',
        },
        footer: {
          bg: 'var(--color-footer-bg)',
          text: 'var(--color-footer-text)',
        },
        category: {
          a: 'var(--color-category-a)',
          'a-light': 'var(--color-category-a-light)',
          'a-border': 'var(--color-category-a-border)',
          b: 'var(--color-category-b)',
          'b-light': 'var(--color-category-b-light)',
          'b-border': 'var(--color-category-b-border)',
          c: 'var(--color-category-c)',
          'c-light': 'var(--color-category-c-light)',
          'c-border': 'var(--color-category-c-border)',
          d: 'var(--color-category-d)',
          'd-light': 'var(--color-category-d-light)',
          'd-border': 'var(--color-category-d-border)',
        },
      },
    },
  },
  plugins: [],
}
