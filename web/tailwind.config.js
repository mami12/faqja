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
        primary: '#111a20',
        secondary: '#192229',
        tertiary: '#283b4a',
        'card-bg': '#1d2b34',
        'card-hover': '#243640',
        'accent-green': '#34c782',
        'accent-red': '#ed6570',
        'accent-yellow': '#f1bd68',
        'accent-blue': '#65b9df',
        'text-primary': '#f8fafc',
        'text-secondary': '#94a3b8',
        'text-muted': '#64748b',
      },
      boxShadow: {
        'glow-green': '0 0 15px -3px rgba(52, 199, 130, 0.28)',
        'glow-red': '0 0 15px -3px rgba(237, 101, 112, 0.28)',
        'glow-yellow': '0 0 15px -3px rgba(241, 189, 104, 0.28)',
        'inner-glow': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.08)',
      }
    },
  },
  plugins: [],
}
