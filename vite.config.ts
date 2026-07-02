import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'editor-lexical',
              test: /[\\/]node_modules[\\/].*(?:@lexical|lexical)/,
              priority: 3,
              maxSize: 260 * 1024,
              includeDependenciesRecursively: false,
            },
            {
              name: 'editor-codemirror',
              test: /[\\/]node_modules[\\/].*(?:@codemirror|@lezer|codemirror)/,
              priority: 2,
              maxSize: 260 * 1024,
              includeDependenciesRecursively: false,
            },
            {
              name: 'editor-mdx',
              test: /[\\/]node_modules[\\/].*@mdxeditor/,
              priority: 1,
              maxSize: 260 * 1024,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
