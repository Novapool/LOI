/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Campfire-themed intimacy levels
        level5: '#8B2500', // Deep Ember - Most intimate (glowing coals)
        level4: '#D84000', // Fire Orange - Deep emotions
        level3: '#F59E0B', // Golden Flame - Peak vulnerability
        level2: '#FCD34D', // Light Flame - Warming up
        level1: '#9CA3AF', // Ash Gray - Surface level

        // Campfire palette
        nightSky: '#0F172A',
        woodBrown: '#92400E',
        warmAccent: '#EA580C',
        lightAccent: '#FB923C',
      },
      fontFamily: {
        pixel: ['VT323', 'monospace'],
      },
    },
  },
  plugins: [],
}
