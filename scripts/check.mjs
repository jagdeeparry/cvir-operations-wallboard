import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const files = ['public/index.html','public/styles.css','public/app.js','src/worker.js','.openai/hosting.json'];
for (const file of files) await readFile(new URL('../' + file, import.meta.url), 'utf8');
new vm.Script(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'));
JSON.parse(await readFile(new URL('../.openai/hosting.json', import.meta.url), 'utf8'));
console.log('Source files and browser JavaScript validated');
