/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
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
