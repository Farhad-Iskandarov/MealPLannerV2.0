import * as esbuild from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.cwd(), 'dist/public');
mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: ['src/client/main.tsx'],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['es2020'],
  outfile: resolve(outDir, 'bundle.js'),
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.GEMINI_API_KEY': '""',
    'process.env.GEMINI_MODEL': '""',
  },
  loader: {
    '.css': 'css',
  },
});

const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="theme-color" content="#196431" />
  <title>MealPlanner — Plan meals • Save money • Shop smarter</title>
  <link rel="stylesheet" href="./bundle.css" />
  <script>window.process = window.process || { env: { NODE_ENV: "production" } };</script>
</head>
<body>
  <div id="root"></div>
  <script src="./bundle.js"></script>
</body>
</html>`;

writeFileSync(resolve(outDir, 'index.html'), html, 'utf8');
console.log('Successfully built client bundle to dist/public');
