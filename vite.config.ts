/// <reference types="vitest/config" />
import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import remarkGfm from 'remark-gfm'
import { defineConfig } from 'vite'

// GitHub Pages serves the app under /Tableau-DF_prep/; the deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [{ enforce: 'pre', ...mdx({ remarkPlugins: [remarkGfm] }) }, react({ include: /\.(mdx|tsx?)$/ }), tailwindcss()],
  build: {
    // The chart runtime (Vega + Vega-Lite, ~860 kB, ~295 kB gzipped) is one
    // lazily loaded chunk, fetched only by pages that draw a chart.
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Room for a few slow lazy-page waits (5 s each, see setup.ts) in one test.
    testTimeout: 20000,
  },
})
