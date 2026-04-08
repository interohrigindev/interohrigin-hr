/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Pretendard"', '"Noto Sans KR"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        bounceDot: { '0%, 80%, 100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } },
      },
      colors: {
        brand: {
          50:  '#f5f0fa',
          100: '#ece2f6',
          200: '#d5c0ec',
          300: '#be9de2',
          400: '#9e72d2',
          500: '#8252bf',
          600: '#6B3FA0',
          700: '#5a3587',
          800: '#4a2c6f',
          900: '#3c245a',
          950: '#24153a',
        },
      },
    },
  },
  plugins: [],
}
