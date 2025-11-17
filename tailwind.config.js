/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        level5: '#8B5CF6', // Purple - Most intimate
        level4: '#3B82F6', // Blue
        level3: '#10B981', // Green
        level2: '#F59E0B', // Orange
        level1: '#EF4444', // Red - Least intimate
      },
    },
  },
  plugins: [],
}
