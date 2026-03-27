/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#e8dcc8',
        'paper-dark': '#d9ccb4',
        ink: '#1a1a1a',
        'ob-red': '#d62828',
        'ob-acid': '#8db600',
        'ob-uv': '#7b2ff7',
        'ob-pink': '#e91e8c',
        'ob-cyan': '#0891b2',
        'ob-orange': '#e85d04',
        'ob-yellow': '#f7e733',
        'ob-blue': '#1d4ed8',
      },
      fontFamily: {
        display: ['Unbounded', 'sans-serif'],
        mono: ['Courier Prime', 'monospace'],
        body: ['Special Elite', 'monospace'],
        marker: ['Permanent Marker', 'cursive'],
        grotesk: ['Darker Grotesque', 'sans-serif'],
      },
      keyframes: {
        'marquee': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'spin-vinyl': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'vu-bounce': {
          '0%, 100%': { height: 'var(--min)' },
          '50%': { height: 'var(--max)' },
        },
        'flicker': {
          '0%, 100%': { opacity: '1' },
          '48%': { opacity: '1' },
          '50%': { opacity: '0.5' },
          '52%': { opacity: '1' },
        },
        'bpm-pulse': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
      },
      animation: {
        'marquee': 'marquee 12s linear infinite',
        'spin-vinyl': 'spin-vinyl 2s linear infinite',
        'vu-bounce': 'vu-bounce 0.8s ease-in-out infinite',
        'flicker': 'flicker 2s infinite',
        'bpm-pulse': 'bpm-pulse 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}