export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sand: {
          50: '#FAF8F5', 100: '#F2EDE8', 200: '#E5DBD0',
          300: '#D4C4B0', 400: '#BBA48A', 500: '#9E8468',
          600: '#7A6249', 700: '#5C4A36', 800: '#3D3224', 900: '#1E1A14',
        },
        sage: {
          50: '#F0F5EF', 100: '#D9EBD8', 200: '#B0D5AE',
          300: '#83B881', 400: '#5A9A58', 500: '#3D7A52',
          600: '#2D6040', 700: '#1F4730', 800: '#122E1F', 900: '#071810',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
    },
  },
  plugins: [],
}
