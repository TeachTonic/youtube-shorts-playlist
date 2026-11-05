import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fs.realpathSync(fileURLToPath(new URL('../', import.meta.url)));
if (path.relative(root, fs.realpathSync(process.cwd())) !== '') throw new Error('Run from the project root.');
const extension = 'experiments/extension/dist';
const player = 'experiments/player/dist';
const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
function check(condition, message) { if (!condition) throw new Error(message); }
check(manifest.manifest_version === 3, 'Expected MV3');
check(JSON.stringify(manifest.permissions) === '["webNavigation"]', 'Unexpected permission');
check(JSON.stringify(manifest.host_permissions) === '["https://www.youtube.com/*"]', 'Unexpected host');
check(!manifest.content_scripts && !manifest.externally_connectable, 'Unexpected injection/external messaging');
check(fs.existsSync(path.join(extension, manifest.background.service_worker)), 'Missing worker');
const checked = [];
for (const [base, page] of [[extension, 'popup.html'], [extension, 'diagnostic.html'], [player, 'index.html']]) {
  const html = fs.readFileSync(path.join(base, page), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
    const asset = path.join(base, match[1].slice(1));
    check(fs.existsSync(asset), 'Missing asset: ' + asset); checked.push(asset);
  }
}
const worker = fs.readFileSync(path.join(extension, 'worker.js'), 'utf8');
check(!/\beval\(|new Function\(|\bfetch\(|XMLHttpRequest/.test(worker), 'Unexpected worker code execution/network access');
const files = [path.join(extension, 'manifest.json'), path.join(extension, 'worker.js'),
  path.join(extension, 'popup.html'), path.join(extension, 'diagnostic.html'), path.join(player, 'index.html'), ...new Set(checked)];
const result = {
  scope: 'Generated files and references; not browser execution or live YouTube verification',
  artifacts: files.map(file => ({ file, bytes: fs.statSync(file).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') })),
  checks: ['MV3 manifest', 'minimal permissions', 'no content script', 'worker exists', 'HTML asset references exist', 'no worker eval/network calls'],
};
fs.mkdirSync('.artifacts', { recursive: true });
fs.writeFileSync('.artifacts/build-inspection.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
