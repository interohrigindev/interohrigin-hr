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
