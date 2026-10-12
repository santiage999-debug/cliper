import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], base: './', optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] }, worker: { format: 'es' }, server: { port: 5174 }, build: { chunkSizeWarningLimit: 4000 } });
