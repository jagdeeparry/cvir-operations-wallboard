import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'build', 'tizen-app');
const hostedUrl = process.env.CVIR_DASHBOARD_URL || 'https://cvir-operations-wallboard.jagdeep429177.chatgpt.site';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
let html = await readFile(path.join(root, 'public/index.html'), 'utf8');
let mesHtml = await readFile(path.join(root, 'public/mes.html'), 'utf8');
const kimbalLogoBase64 = (await readFile(path.join(root, 'public/kimbal-logo.base64'), 'utf8')).trim();
html = html
  .replace('content="" />', 'content="' + hostedUrl + '" />')
  .replace(/href="\/styles\.css[^"]*"/, 'href="styles.css"')
  .replace(/src="\/app\.js[^"]*"/, 'src="app.js"')
  .replace('src="/kimbal-logo.png"', 'src="data:image/png;base64,' + kimbalLogoBase64 + '"');
mesHtml = mesHtml
  .replace('content="" />', 'content="' + hostedUrl + '" />')
  .replace(/href="\/styles\.css[^"]*"/, 'href="styles.css"')
  .replace(/src="\/mes\.js[^"]*"/, 'src="mes.js"')
  .replace('src="/kimbal-logo.png"', 'src="data:image/png;base64,' + kimbalLogoBase64 + '"');
await writeFile(path.join(out, 'index.html'), html);
await writeFile(path.join(out, 'mes.html'), mesHtml);
await cp(path.join(root, 'public/styles.css'), path.join(out, 'styles.css'));
await cp(path.join(root, 'public/app.js'), path.join(out, 'app.js'));
await cp(path.join(root, 'public/mes.js'), path.join(out, 'mes.js'));
await cp(path.join(root, 'tizen/config.xml'), path.join(out, 'config.xml'));
await cp(path.join(root, 'tizen/icon.svg'), path.join(out, 'icon.svg'));
await cp(path.join(root, 'tizen/README.md'), path.join(out, 'README.md'));
console.log('Built unsigned Tizen Studio project at build/tizen-app');
