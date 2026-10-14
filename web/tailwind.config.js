/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        primary: '#111923',
        secondary: '#25303e',
        tertiary: '#394758',
        'card-bg': '#25303e',
        'card-hover': '#314153',
        'accent-green': '#2e9f58',
        'accent-red': '#e75b62',
        'accent-yellow': '#ffbc32',
        'accent-blue': '#68aedd',
        'text-primary': '#eef3f8',
        'text-secondary': '#abb8c8',
        'text-muted': '#7f90a4',
      },
      borderRadius: { 'sm': '2px', DEFAULT: '2px', 'md': '3px', 'lg': '3px', 'xl': '3px', '2xl': '4px', '3xl': '4px' },
      boxShadow: {
        'sm': 'none', 'md': 'none', 'lg': 'none', 'xl': 'none', '2xl': 'none',
        'glow-green': 'none',
        'glow-red': 'none',
        'glow-yellow': 'none',
        'inner-glow': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.08)',
      }
    },
  },
  plugins: [],
}
