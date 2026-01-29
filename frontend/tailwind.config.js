/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        onyx: {
          50: '#fdf8f6',
          100: '#f2e8e5',
          200: '#eaddd7',
          300: '#e0cec7',
          400: '#d2bab0',
          500: '#bfa094',
          600: '#a18072',
          700: '#977669',
          800: '#846358',
          900: '#43302b',
          950: '#0a0a0a',
        },
        gold: {
          50: '#fefdfb',
          100: '#fdf5e9',
          200: '#fae6c8',
          300: '#f5d19d',
          400: '#e8b674',
          500: '#d4a373',
          600: '#c08552',
          700: '#a66e3f',
          800: '#8a5a36',
          900: '#724b2e',
        },
        rose: {
          gold: '#b76e79',
          light: '#d4a5a5',
          dark: '#8b4557',
        },
        champagne: {
          50: '#fefcf9',
          100: '#fdf8f0',
          200: '#f9edd8',
          300: '#f4ddb5',
          400: '#ebc78c',
          500: '#deb068',
          600: '#c99a52',
          700: '#a87d43',
          800: '#886439',
          900: '#6f5130',
        },
      },
      fontFamily: {
        heading: ['Playfair Display', 'serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'marble': "url('/assets/marble-bg.jpg')",
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-gold': 'linear-gradient(135deg, #d4a373 0%, #c08552 50%, #a66e3f 100%)',
        'gradient-rose': 'linear-gradient(135deg, #b76e79 0%, #d4a5a5 50%, #8b4557 100%)',
      },
      boxShadow: {
        'gold': '0 4px 20px -2px rgba(212, 163, 115, 0.4)',
        'gold-lg': '0 10px 40px -3px rgba(212, 163, 115, 0.5)',
        'inner-gold': 'inset 0 2px 4px 0 rgba(212, 163, 115, 0.2)',
        'glow': '0 0 20px rgba(212, 163, 115, 0.6)',
        'glow-lg': '0 0 40px rgba(212, 163, 115, 0.8)',
      },
      animation: {
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-gold': 'pulse-gold 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'vault-open': 'vault-open 1s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fade-in 0.5s ease-out forwards',
        'slide-up': 'slide-up 0.5s ease-out forwards',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-gold': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        'vault-open': {
          '0%': { transform: 'perspective(1200px) rotateY(0deg)', opacity: '0' },
          '100%': { transform: 'perspective(1200px) rotateY(-95deg)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(212, 163, 115, 0.4)' },
          '50%': { boxShadow: '0 0 40px rgba(212, 163, 115, 0.8)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
