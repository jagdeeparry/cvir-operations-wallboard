import { readFile, mkdir, writeFile, cp, rm } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'server'), { recursive: true });
const rawHtml = await readFile(path.join(root, 'public/index.html'), 'utf8');
const css = await readFile(path.join(root, 'public/styles.css'), 'utf8');
const js = await readFile(path.join(root, 'public/app.js'), 'utf8');
const manageHtml = await readFile(path.join(root, 'public/manage.html'), 'utf8');
const manageCss = await readFile(path.join(root, 'public/manage.css'), 'utf8');
const manageJs = await readFile(path.join(root, 'public/manage.js'), 'utf8');
const kimbalLogoBase64 = (await readFile(path.join(root, 'public/kimbal-logo.base64'), 'utf8')).trim();
const html = rawHtml.replace('src="/kimbal-logo.png"', 'src="data:image/png;base64,' + kimbalLogoBase64 + '"');
const worker = await readFile(path.join(root, 'src/worker.js'), 'utf8');
const assets = [
  'const __INDEX_HTML__ = ' + JSON.stringify(html) + ';',
  'const __STYLES_CSS__ = ' + JSON.stringify(css) + ';',
  'const __APP_JS__ = ' + JSON.stringify(js) + ';',
  'const __MANAGE_HTML__ = ' + JSON.stringify(manageHtml) + ';',
  'const __MANAGE_CSS__ = ' + JSON.stringify(manageCss) + ';',
  'const __MANAGE_JS__ = ' + JSON.stringify(manageJs) + ';',
  'const __KIMBAL_LOGO_BASE64__ = ' + JSON.stringify(kimbalLogoBase64) + ';'
].join('\n');
await writeFile(path.join(dist, 'server/index.js'), assets + '\n' + worker);
await cp(path.join(root, '.openai'), path.join(dist, '.openai'), { recursive: true });
await cp(path.join(root, 'drizzle'), path.join(dist, '.openai', 'drizzle'), { recursive: true });
console.log('Built Cloudflare Worker at dist/server/index.js');
