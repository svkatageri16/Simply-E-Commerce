import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
process.loadEnvFile('.env');
const db = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(db.hostname)) throw Error('Local smoke requires localhost DB.');
const require = createRequire(import.meta.url);
const configs = [
  ['api', ['apps/api/dist/main.js'], root],
  ['seller', [require.resolve('next/dist/bin/next', { paths: [path.join(root, 'apps/seller')] }), 'start', '-p', '3001'], path.join(root, 'apps/seller')],
  ['storefront', [require.resolve('next/dist/bin/next', { paths: [path.join(root, 'apps/storefront')] }), 'start', '-p', '3000'], path.join(root, 'apps/storefront')],
  ['admin', [require.resolve('next/dist/bin/next', { paths: [path.join(root, 'apps/admin')] }), 'start', '-p', '3002'], path.join(root, 'apps/admin')],
];
const children = [];
for (const [name, args, cwd] of configs) {
  const log = fs.openSync(`artifacts/production-final/${name}-runtime.log`, 'a');
  const child = spawn(process.execPath, args, { cwd, windowsHide: true, env: { ...process.env, NODE_ENV: 'development', NODE_OPTIONS: '--max-old-space-size=768', NOTIFICATION_WORKER_ENABLED: 'false', TEMP: path.join(root, 'artifacts/final-hardening/tmp'), TMP: path.join(root, 'artifacts/final-hardening/tmp') }, stdio: ['ignore', log, log] });
  children.push({ name, pid: child.pid });
  child.on('exit', code => console.log(`${name} exited ${code}`));
}
fs.writeFileSync('artifacts/production-final/smoke-processes.json', JSON.stringify(children));
console.log(JSON.stringify(children));
