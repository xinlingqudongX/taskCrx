// scripts/dev-worker.ts
// 开发环境启动 Worker
import { execSync } from 'child_process';
import { resolve } from 'path';

const workerDir = resolve(__dirname, '../apps/worker');
console.log('Starting worker dev server...');
execSync('pnpm dev', { cwd: workerDir, stdio: 'inherit' });
