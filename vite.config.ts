import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [react(), wasm(), glsl()],
})
