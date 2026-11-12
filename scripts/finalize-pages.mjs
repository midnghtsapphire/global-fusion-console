import { copyFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
await copyFile(resolve(root, 'dist/public/index.html'), resolve(root, 'dist/public/404.html'));
await writeFile(resolve(root, 'dist/public/.nojekyll'), '');
console.log('Pages build ready in dist/public (hash routes; static snapshot files).');
