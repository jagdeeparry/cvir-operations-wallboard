import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'docs');
const apiBase = 'https://cvir-operations-wallboard.jagdeep429177.chatgpt.site';

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const [indexSource, mesSource, styles, appSource, mesAppSource, logoBase64] = await Promise.all([
  readFile(path.join(root, 'public/index.html'), 'utf8'),
  readFile(path.join(root, 'public/mes.html'), 'utf8'),
  readFile(path.join(root, 'public/styles.css'), 'utf8'),
  readFile(path.join(root, 'public/app.js'), 'utf8'),
  readFile(path.join(root, 'public/mes.js'), 'utf8'),
  readFile(path.join(root, 'public/kimbal-logo.base64'), 'utf8')
]);

function githubPageHtml(source, scriptName, boardHref, boardTarget) {
  return source
    .replace('<meta name="cvir-api-base" content="" />', '<meta name="cvir-api-base" content="' + apiBase + '" />')
    .replace('href="/styles.css?', 'href="styles.css?')
    .replace('src="/kimbal-logo.png"', 'src="data:image/png;base64,' + logoBase64.trim() + '"')
    .replace('href="' + boardHref + '"', 'href="' + boardTarget + '"')
    .replace('src="/' + scriptName + '?', 'src="' + scriptName + '?');
}

const indexHtml = githubPageHtml(indexSource, 'app.js', '/mes', 'mes.html');
const mesHtml = githubPageHtml(mesSource, 'mes.js', '/', 'index.html');
const app = appSource.replace("var mesBoardUrl = (apiBase || '') + '/mes';", "var mesBoardUrl = 'mes.html';");
const mesApp = mesAppSource.replace("var systemBoardUrl = (apiBase || '') + '/';", "var systemBoardUrl = 'index.html';");

await Promise.all([
  writeFile(path.join(output, 'index.html'), indexHtml),
  writeFile(path.join(output, 'mes.html'), mesHtml),
  writeFile(path.join(output, 'styles.css'), styles),
  writeFile(path.join(output, 'app.js'), app),
  writeFile(path.join(output, 'mes.js'), mesApp),
  writeFile(path.join(output, '.nojekyll'), ''),
  writeFile(path.join(output, '404.html'), indexHtml)
]);

console.log('Built GitHub Pages frontend at docs/');
