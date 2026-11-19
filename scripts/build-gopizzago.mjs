import * as esbuild from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('public/gopizzago', { recursive: true });
await mkdir('gopizzago-ui/dist', { recursive: true });

const shared = { bundle: true, target: ['es2022'] };

await esbuild.build({
  ...shared,
  entryPoints: ['gopizzago-ui/main.ts'],
  format: 'esm',
  outfile: 'public/gopizzago/app.js',
  minify: true,
  legalComments: 'none',
});

await esbuild.build({
  ...shared,
  entryPoints: ['gopizzago-ui/styles.css'],
  outfile: 'public/gopizzago/app.css',
  minify: true,
});

await esbuild.build({
  ...shared,
  entryPoints: ['gopizzago-ui/pizza-svg.ts'],
  format: 'esm',
  outfile: 'gopizzago-ui/dist/pizza-svg.js',
});
