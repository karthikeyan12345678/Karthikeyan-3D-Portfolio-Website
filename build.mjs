import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/assets', { recursive: true });
await build({
  entryPoints: ['src/main.js'],
  bundle: true, minify: true, format: 'esm', target: 'es2020',
  outfile: 'dist/assets/app.js',
  external: ['*.woff2'],
  loader: { '.css': 'css' },
  legalComments: 'none',
  logLevel: 'info',
});
let html = (await import('node:fs')).readFileSync('index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="assets/app.css" />', '<script>document.documentElement.className+=" js";setTimeout(function(){if(!window.__shown)document.documentElement.className+=" reveal-all"},9000)</script>\n  <link rel="stylesheet" href="assets/app.css" />');
writeFileSync('dist/index.html', html);
cpSync('public', 'dist', { recursive: true });
