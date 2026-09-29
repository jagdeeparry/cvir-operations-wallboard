import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'build', 'tizen-app');
const hostedUrl = process.env.CVIR_DASHBOARD_URL || 'https://cvir-operations-wallboard.jagdeep429177.chatgpt.site';
await mkdir(out, { recursive: true });
let html = await readFile(path.join(root, 'public/index.html'), 'utf8');
html = html
  .replace('content="" />', 'content="' + hostedUrl + '" />')
  .replace(/href="\/styles\.css[^"]*"/, 'href="styles.css"')
  .replace(/src="\/app\.js[^"]*"/, 'src="app.js"')
  .replace('src="/kimbal-logo.png"', 'src="kimbal-logo.png"');
await writeFile(path.join(out, 'index.html'), html);
const kimbalLogoBase64 = (await readFile(path.join(root, 'public/kimbal-logo.base64'), 'utf8')).trim();
await writeFile(path.join(out, 'kimbal-logo.png'), Buffer.from(kimbalLogoBase64, 'base64'));
await cp(path.join(root, 'public/styles.css'), path.join(out, 'styles.css'));
await cp(path.join(root, 'public/app.js'), path.join(out, 'app.js'));
await cp(path.join(root, 'tizen/config.xml'), path.join(out, 'config.xml'));
await cp(path.join(root, 'tizen/icon.svg'), path.join(out, 'icon.svg'));
await cp(path.join(root, 'tizen/README.md'), path.join(out, 'README.md'));
console.log('Built unsigned Tizen Studio project at build/tizen-app');
