// scripts/deploy-worker.ts
// 部署 Worker 到 Cloudflare
import { execSync } from 'child_process';
import { resolve } from 'path';

const workerDir = resolve(__dirname, '../apps/worker');
console.log('Deploying worker to Cloudflare...');
execSync('pnpm deploy', { cwd: workerDir, stdio: 'inherit' });
