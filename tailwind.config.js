/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // App-wide body font (used by `font-sans`)
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Event bar font (used by `font-bar`)
        bar: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
