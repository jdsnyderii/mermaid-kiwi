import { build } from 'esbuild';
const base = { bundle: true, logLevel: 'info' };
await Promise.all([
  build({ ...base, entryPoints: ['src/index.js'], outfile: 'dist/mermaid-kiwi.iife.min.js', format: 'iife', globalName: 'MermaidKiwi', minify: true, target: 'es2019' }),
  build({ ...base, entryPoints: ['src/index.js'], outfile: 'dist/mermaid-kiwi.esm.js', format: 'esm', minify: true, target: 'es2020' }),
  build({ ...base, entryPoints: ['src/core.js'], outfile: 'dist/mermaid-kiwi.core.js', format: 'esm', platform: 'node', target: 'es2020' }),
]);
