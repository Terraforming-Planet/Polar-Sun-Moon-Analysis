import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/Polar-Sun-Moon-Analysis/',
  build: { outDir: 'dist', sourcemap: true }
})
