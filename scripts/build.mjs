import { readFile, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'server'), { recursive: true });
const html = await readFile(path.join(root, 'public/index.html'), 'utf8');
const css = await readFile(path.join(root, 'public/styles.css'), 'utf8');
const js = await readFile(path.join(root, 'public/app.js'), 'utf8');
const worker = await readFile(path.join(root, 'src/worker.js'), 'utf8');
const assets = [
  'const __INDEX_HTML__ = ' + JSON.stringify(html) + ';',
  'const __STYLES_CSS__ = ' + JSON.stringify(css) + ';',
  'const __APP_JS__ = ' + JSON.stringify(js) + ';'
].join('\n');
await writeFile(path.join(dist, 'server/index.js'), assets + '\n' + worker);
await cp(path.join(root, '.openai'), path.join(dist, '.openai'), { recursive: true });
console.log('Built Cloudflare Worker at dist/server/index.js');
