import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Vite 仅构建渲染进程(src/renderer)。主进程与 preload 仍为原生 CJS，
// 由 Electron 直接加载，不经打包。
export default defineConfig({
  root: path.resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [
    react(),
    {
      name: 'dev-csp',
      apply: 'serve',
      transformIndexHtml(html) {
        return html.replace(
          /<meta[\s\S]*?http-equiv="Content-Security-Policy"[\s\S]*?\/?>/,
          '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; connect-src \'self\' ws: http://localhost:* https://localhost:*" />'
        );
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});