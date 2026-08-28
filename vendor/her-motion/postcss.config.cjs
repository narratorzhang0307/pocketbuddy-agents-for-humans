const path = require('node:path');
module.exports = { plugins: [require('tailwindcss')({
  content: [path.join(__dirname, 'index.html'), path.join(__dirname, 'src/**/*.{ts,tsx}')],
  theme: { extend: { fontFamily: { inter: ['Inter', 'sans-serif'] } } },
}), require('autoprefixer')()] };
