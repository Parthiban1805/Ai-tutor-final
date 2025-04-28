/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  darkMode: ['selector', '[data-theme="dark"]'], // Use data-theme for dark mode
  plugins: [],
};