import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

function omdbDevProxy(env) {
  return {
    name: 'omdb-dev-proxy',
    apply: 'serve',

    configureServer(server) {
      process.env.OMDB_API_KEY ??= env.OMDB_API_KEY

      server.middlewares.use('/api/omdb', async (request, response) => {
        const { default: handler } = await server.ssrLoadModule('/api/omdb.js')
        await handler(request, response)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue(), tailwindcss(), omdbDevProxy(env)],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.{test,spec}.js', 'api/**/*.{test,spec}.js'],
      setupFiles: ['./src/tests/setup.js'],
    },
  }
})
