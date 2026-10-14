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
        primary: '#0b1018',
        secondary: '#252d3a',
        tertiary: '#424e60',
        'card-bg': '#252d3a',
        'card-hover': '#323d4c',
        'accent-green': '#329448',
        'accent-red': '#e33d45',
        'accent-yellow': '#ffb300',
        'accent-blue': '#8ab7e4',
        'text-primary': '#f1f4f9',
        'text-secondary': '#c1ccdc',
        'text-muted': '#95a5bb',
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
