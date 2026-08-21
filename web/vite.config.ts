import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const publicBase = process.env.TERRA_PUBLIC_BASE?.trim() || '/Polar-Sun-Moon-Analysis/'

export default defineConfig({
  plugins: [react()],
  base: publicBase,
  build: { outDir: 'dist', sourcemap: true }
})
