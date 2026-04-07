/**
 * Vite configuration for Capacitor mobile build.
 *
 * Independent from electron-vite to avoid pulling in Electron dependencies.
 * Builds the same React SPA from src/renderer/ into dist-mobile/.
 */
import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',

  define: {
    // Mark as Capacitor build so code can detect at compile time
    '__CAPACITOR__': JSON.stringify(true),
    '__BUILD_TIME__': JSON.stringify(new Date().toISOString()),
    // Disable analytics define placeholders (not used in mobile)
    '__CAFE_GA_MEASUREMENT_ID__': JSON.stringify(''),
    '__CAFE_GA_API_SECRET__': JSON.stringify(''),
    '__CAFE_BAIDU_SITE_ID__': JSON.stringify('')
  },

  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      // Stub out electron-only modules that may be imported
      'electron-log/renderer.js': resolve(__dirname, 'src/renderer/lib/empty-module.ts'),
      'electron-log/renderer': resolve(__dirname, 'src/renderer/lib/empty-module.ts'),
      'electron-log': resolve(__dirname, 'src/renderer/lib/empty-module.ts')
    }
  },

  build: {
    outDir: resolve(__dirname, 'dist-mobile'),
    emptyOutDir: true,
    // Optimize chunk splitting for mobile
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/renderer/index.html')
      },
      // Externalize electron-specific modules
      external: [
        'electron',
        'electron-log',
        'electron-log/renderer',
        'electron-log/renderer.js'
      ],
      output: {
        // Manual chunks for better caching and faster initial load
        manualChunks: {
          // React core
          'react-vendor': ['react', 'react-dom'],
          // Zustand state management
          'zustand': ['zustand'],
          // CodeMirror editor (large, load on demand)
          'codemirror': [
            '@codemirror/state',
            '@codemirror/view',
            '@codemirror/commands',
            '@codemirror/search',
            '@codemirror/language'
          ],
          // Syntax highlighting (large, load on demand)
          'shiki': ['shiki'],
          // Mermaid diagrams (very large, load on demand)
          'mermaid': ['mermaid'],
          // Markdown rendering
          'markdown': ['react-markdown', 'remark-gfm', 'rehype-highlight'],
          // UI utilities
          'ui-utils': ['clsx', 'tailwind-merge', 'lucide-react'],
        }
      }
    },
    // Smaller chunks for faster mobile loading
    chunkSizeWarningLimit: 1000,
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Minify for production
    minify: 'esbuild',
    // Target modern browsers for smaller bundles
    target: 'es2020'
  },

  // CSS processing uses the same postcss/tailwind config
  css: {
    postcss: resolve(__dirname, 'postcss.config.cjs')
  }
})
