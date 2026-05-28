/**
 * 使用 Cloudflare TypeScript SDK 部署 Worker
 * 用法: npx tsx deploy.ts
 *
 * 环境变量:
 *   CLOUDFLARE_API_TOKEN  — Cloudflare API Token
 *   CLOUDFLARE_ACCOUNT_ID — Cloudflare Account ID
 */

import Cloudflare from 'cloudflare';
import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const SCRIPT_NAME = 'team-session-relay';
const COMPATIBILITY_DATE = '2024-05-01';

async function bundle(): Promise<string> {
    const entryPoint = path.resolve(__dirname, 'src/index.ts');
    const result = await esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        write: false,
        format: 'esm',
        target: 'es2022',
        platform: 'browser',
        conditions: ['worker', 'browser'],
        external: [],
        minify: false,
        sourcemap: false,
    });

    return result.outputFiles[0].text;
}

async function deploy() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!apiToken) {
        console.error('错误: 请设置 CLOUDFLARE_API_TOKEN 环境变量');
        process.exit(1);
    }
    if (!accountId) {
        console.error('错误: 请设置 CLOUDFLARE_ACCOUNT_ID 环境变量');
        process.exit(1);
    }

    const client = new Cloudflare({ apiToken });

    // 1. 打包 Worker 代码
    console.log('正在打包 Worker...');
    const scriptContent = await bundle();
    console.log(`打包完成，大小: ${(scriptContent.length / 1024).toFixed(1)} KB`);

    // 2. 构建 metadata
    const metadata = {
        main_module: 'index.js',
        compatibility_date: COMPATIBILITY_DATE,
        compatibility_flags: ['nodejs_compat'],
        bindings: [
            {
                type: 'durable_object_namespace' as const,
                name: 'RELAY_ROOM',
                class_name: 'RelayRoom',
            },
        ],
        migrations: {
            tag: 'v1',
            new_classes: ['RelayRoom'],
        },
    };

    // 3. 上传 Worker（multipart form data）
    console.log(`正在部署 Worker: ${SCRIPT_NAME}...`);

    const formData = new FormData();

    // metadata 部分
    formData.append(
        'metadata',
        new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
    );

    // 脚本内容部分
    formData.append(
        'index.js',
        new Blob([scriptContent], { type: 'application/javascript+module' }),
        'index.js',
    );

    // 直接用 fetch 调用 Cloudflare API（SDK 的 scripts.update 对 multipart 支持不完善）
    const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${SCRIPT_NAME}`,
        {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${apiToken}`,
            },
            body: formData,
        },
    );

    const result = (await response.json()) as { success: boolean; errors?: { message: string }[]; result?: { id: string; etag: string } };

    if (!result.success) {
        console.error('部署失败:', result.errors);
        process.exit(1);
    }

    console.log(`部署成功! Script ID: ${result.result?.id}`);

    // 4. 输出 Worker URL
    console.log('');
    console.log('========================================');
    console.log(`Worker URL: https://${SCRIPT_NAME}.${result.result?.id}.workers.dev`);
    console.log('========================================');
}

deploy().catch((err) => {
    console.error('部署异常:', err);
    process.exit(1);
});
