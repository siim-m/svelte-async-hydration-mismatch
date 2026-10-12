import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [svelte({ compilerOptions: { experimental: { async: true } } })],
  build: isSsrBuild
    ? {}
    : {
        outDir: 'dist/client',
        rolldownOptions: {
          input: 'src/entry-client.js',
          output: { entryFileNames: 'client.js' },
        },
      },
}));
