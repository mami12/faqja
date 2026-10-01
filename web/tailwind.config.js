/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0f172a',
        secondary: '#1e293b',
        tertiary: '#334155',
        'accent-green': '#10b981',
        'accent-red': '#ef4444',
        'accent-yellow': '#f59e0b',
        'accent-blue': '#3b82f6',
        'text-primary': '#f1f5f9',
        'text-secondary': '#94a3b8',
      }
    },
  },
  plugins: [],
}
