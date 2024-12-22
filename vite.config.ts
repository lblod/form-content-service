import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: [
      { find: 'mu', replacement: resolve(__dirname, './node_modules/mu') },
    ],
  },
});